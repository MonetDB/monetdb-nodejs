/**
 * Author: Robin Cijvat <robin.cijvat@monetdbsolutions.com>
 */

'use strict';

const net = require('net');
const crypto = require('crypto');
const Q = require('q');
const EventEmitter = require("events").EventEmitter;

const StringDecoder = require('string_decoder').StringDecoder;
const decoder = new StringDecoder('utf8');

const utils = require('./utils');

/**
 * <hannes@cwi.nl>
 */
function __sha512(str) {
    return crypto.createHash('sha512').update(str).digest('hex');
}

/**
 * <hannes@cwi.nl>
 */
function _hdrline(line) {
    return line.substr(2, line.indexOf('#')-3).split(',\t');
}


module.exports = function MapiConnection(options) {
    var self = this;

    // private vars and functions
    var _socket = null;
    var _state = 'disconnected';
    var _connectDeferred = null;
    var _reconnecting = false;
    var _messageQueue = _emptyMessageQueue('main');
    var _messageQueueDisconnected = _emptyMessageQueue('disconnected');
    var _msgLoopRunning = false;
    var _closeDeferred = null;
    var _curMessage = null;
    var _mapiBlockSize = 8190; // monetdb ./common/stream/stream.h’: #define BLOCK (8 * 1024 - 2)
    var _readLeftOver = 0;
    var _readFinal = false;
    var _readStr = '';
    var header = null;
	var flag_query = false;
	var flag_header_treated = false;
    var _errorDetectionRegex = /(\\n!|^!)(.*)/g;
    
    var _failPermanently = false; // only used for testing

    function _emptyMessageQueue(tag) {
        var queue = [];
        queue.tag = tag;
        return queue;
    }

    function _debug(msg) {
        if(options.debug) {
            options.debugFn(options.logger, msg);
        }
    }

    function _setState(state) {
        _debug('Setting state to ' + state + '..');
        _state = state;
    }

    function _nextMessage() {
        if (!_messageQueue.length) {
            _debug('No more messages in main message queue.. stopping message loop.');
            _msgLoopRunning = false;
            if (!_messageQueueDisconnected.length && _closeDeferred) {
                self.destroy();
                _closeDeferred.resolve();
            }
            return;
        }

        if(_state == 'disconnected') return; // will be called again after reconnect

        _curMessage = _messageQueue.shift();
        _debug('Starting next request from main message queue: ' + _curMessage.message);
        _sendMessage(_curMessage.message);
    }

    /**
     * <hannes@cwi.nl>
     *
     * Send a packaged message
     *
     * @param message An object containing a message property and a deferred property
     * @private
     */
    function _sendMessage(message) {
        if (options.debugMapi) {
            options.debugMapiFn(options.logger, 'TX', message);
        }

        var buf = new Buffer(message, 'utf8');
        var final = 0;
        while (final == 0) {
            var bs = Math.min(buf.length, _mapiBlockSize - 2);
            var sendbuf = buf.slice(0, bs);
            buf = buf.slice(bs);
            if (buf.length == 0) {
                final = 1;
            }

            _debug('Writing ' + bs + ' bytes, final=' + final);

            var hdrbuf = new Buffer(2);
            hdrbuf.writeInt16LE((bs << 1) | final, 0);
            if(!_socket) return;
            _socket.write(Buffer.concat([hdrbuf, sendbuf]));
        }
    }

    /**
     * <hannes@cwi.nl>
     *
     * Read incoming data and construct the original messages from it
     *
     * @param data Data that follows from a net.socket data event
     * @private
     */
    function _handleData(data) {
        /* we need to read a header obviously */
        if (_readLeftOver == 0) {
            var hdr = data.readUInt16LE(0);
            _readLeftOver = (hdr >> 1);
            _readFinal = (hdr & 1) == 1;
            data = data.slice(2);
        }
        _debug('Reading ' + _readLeftOver + ' bytes, final=' + _readFinal);

        /* what is in the buffer is not necessary the entire block */
        var read_cnt = Math.min(data.length, _readLeftOver);
        try {
            //String concat involve problems with 2 bytes characters like é ou à 			
            //_readStr = _readStr + data.toString('utf8', 0, read_cnt);
			
			var buf = new Buffer(read_cnt);
			data.copy(buf, 0, 0, read_cnt);
            _readStr = _readStr + decoder.write(buf);
            
            //mode stream detection
			if (_curMessage){				
				if (_curMessage.deferred.promise.on){
					_handleDataStream();
				}	
			}
        } catch(e) {
            if(options.warning) {
                options.warningFn(options.logger, 'Could not append read buffer to query result');
            }
        }
        _readLeftOver -= read_cnt;

        /* if there is something left to read, we will be called again */
        if (_readLeftOver > 0) {
            return;
        }

        /* pass on reassembled messages */
        if (_readLeftOver == 0 && _readFinal) {
            _handleResponse(_readStr);
            //Stream mode
            if (_curMessage){
				if (_curMessage.deferred.promise.on){						
						_curMessage.deferred.promise.emit('end', null);
						_curMessage.deferred.resolve({});
				}
			}
            _readStr = '';            
			header = null;
			flag_query = false;
			flag_header_treated = false;	
        }

        /* also, the buffer might contain more blocks or parts thereof */
        if (data.length > read_cnt) {
            var leftover = new Buffer(data.length - read_cnt);
            data.copy(leftover, 0, read_cnt, data.length);
            _handleData(leftover);
        }
    }

    /**
     * 
     *
     * Consume message received from _handleData and emit header and data event : used by querystream
     *
     * @param none
     * @private
     */
    function _handleDataStream() {
        if (_readStr.charAt(0) == '&') {					
            flag_query = true;
            let lines = _readStr.split('\n');
            //header contains only 5 lines
            //we parse only if we have at least 5 lines 
            //otherwise next call will concat data with last _readStr
            if (lines.length>5){					
                header =_parseHeader(_readStr);							  
                _curMessage.deferred.promise.emit('header', header);
                //we consume 5 lines of _readStr
                let headerLineNb = 5;
                let idx = _readStr.indexOf('\n');
                let realidx;
                while (headerLineNb > 0) {
                    headerLineNb--;
                    realidx = idx;
                    idx = _readStr.indexOf('\n', idx + 1);						
                }
                _readStr = _readStr.substring( realidx+1,_readStr.length);
                //we set the flag for the header as we will be called again
                flag_header_treated = true;
                //we keep the header informations in _curMessage
                _curMessage.header = header;
            }				
        }
        //Called again - we began to extract data
        if (flag_query && flag_header_treated){
            let idx = _readStr.indexOf('\n');
            let realidx=0;
            //we consume lines of _readStr
            while (idx != -1) {					
                realidx = idx;
                idx = _readStr.indexOf('\n', idx + 1);				
            }
            //Sometimes, the buffer contains more data than _readLeftOver (data.length>_readLeftOver)
            //see the end of _handleData : in that case, we call again _handleData
            //to concat the last string in _readStr but this is not a full line with \n
            //we must not emit data in that case (realidx==0), otherwise, data will be emitted twice
            if (realidx>0){
                let extract = _readStr.substring(0, realidx);
                _readStr = _readStr.substring(realidx+1,_readStr.length);				
                _curMessage.deferred.promise.emit('data', _parseTuples(_curMessage.header.column_types, extract.split('\n')));					
            }											
        }
    }

    /**
     * <hannes@cwi.nl>
     *
     * Whenever a full response is received from the server, this response is passed to
     * this function. The main idea of this function is that it sets the object state to
     * ready as soon as the server let us know that the authentication succeeded.
     * Basically, the first time this function is called, it will receive a challenge from the server.
     * It will respond with authentication details. This *might* happen more than once, until at some point
     * we receive either an authentication error or an empty line (prompt). This empty line indicates
     * all is well, and state will be set to ready then.
     *
     * @param response The response received from the server
     * @private
     */
    function _handleResponse(response) {
        if (options.debugMapi) {
            options.debugMapiFn(options.logger, 'RX', response);
        }

        /* prompt, good */
        if (response == '') {
            _setState('ready');
            // do not resolve _curMessage here, since this prompt should only happen directly after
            // authentication, which circumvents the _curMessage.
            return _nextMessage();
        }

        /* monetdbd redirect, ignore. We will get another challenge soon */
        if (response.charAt(0) == '^') {
            return;
        }

        if (_state == 'started') {
            /* error message during authentication? */
            if (response.charAt(0) == '!') {
                response = new Error('Error: ' + response.substring(1, response.length - 1));
                _connectDeferred && _connectDeferred.reject(response);
                _setState('disconnected');
                return _curMessage && _curMessage.deferred.reject(response);
            }

            // means we get the challenge from the server
            var authch = response.split(':');
            var salt   = authch[0];
            var dbname = authch[1]; // Contains 'merovingian' if monetdbd is used. We do not use this value.

            /* In theory, the server tells us which hashes it likes.
             In practice, we know it always likes sha512 , so... */
            var pwhash = __sha512(__sha512(options.password) + salt);
            var counterResponse = 'LIT:' + options.user + ':{SHA512}' + pwhash + ':' +
                options.language + ':' + options.dbname + ':';
            _sendMessage(counterResponse);
            return;
        }

        /* error message */
        var errorMatch;
        if (errorMatch = response.match(_errorDetectionRegex)) {
            var error = errorMatch[0];
            //stream mode
            if (_curMessage.deferred.promise.on){	
                _curMessage.deferred.promise.emit('error',new Error(error.substring(1, error.length)));		
            }

            _curMessage.deferred.reject(new Error(error.substring(1, error.length)));
        }

        /* query result */
        else if (response.charAt(0) == '&') {
            _curMessage.deferred.resolve(_parseResponse(response));
        }

        else {
            _curMessage && _curMessage.deferred.resolve({});
        }

        _nextMessage();
    }

    /**
     * <hannes@cwi.nl>
     *
     * Parse a response that was reconstructed from the net.socket stream.
     *
     * @param msg Reconstructed message
     * @returns a response structure, see documentation
     * @private
     */

    function _parseResponse(msg) {
        var lines = msg.split('\n');
        var resp = {};
        var tpe = lines[0].charAt(1);

        /* table result, we only like Q_TABLE and Q_PREPARE for now */
        if (tpe == 1 || tpe == 5) {
            var hdrf = lines[0].split(' ');

            resp.type='table';
            resp.queryid   = parseInt(hdrf[1]);
            resp.rows = parseInt(hdrf[2]);
            resp.cols = parseInt(hdrf[3]);

            var table_names  = _hdrline(lines[1]);
            var column_names = _hdrline(lines[2]);
            var column_types = _hdrline(lines[3]);
            var type_lengths = _hdrline(lines[4]);

            resp.structure = [];
            resp.col = {};
            for (var i = 0; i < table_names.length; i++) {
                var colinfo = {
                    table : table_names[i],
                    column : column_names[i],
                    type : column_types[i],
                    typelen : parseInt(type_lengths[i]),
                    index : i
                };
                resp.col[colinfo.column] = colinfo.index;
                resp.structure.push(colinfo);
            }            
            resp.data = _parseTuples(column_types, lines.slice(5, lines.length-1));
        }        
        return resp;
    }

    /**
     * 
     *
     * Parse a header that was reconstructed from the net.socket stream.
     *
     * @param msg Reconstructed message
     * @returns a header structure, see documentation
     * @private
     */
    function _parseHeader(msg) {
        var lines = msg.split('\n');
        var resp = {};
        var tpe = lines[0].charAt(1);

        /* table result, we only like Q_TABLE and Q_PREPARE for now */
        if (tpe == 1 || tpe == 5) {
            var hdrf = lines[0].split(' ');

            resp.type='table';
            resp.queryid   = parseInt(hdrf[1]);
            resp.rows = parseInt(hdrf[2]);
            resp.cols = parseInt(hdrf[3]);

            var table_names  = _hdrline(lines[1]);
            var column_names = _hdrline(lines[2]);
            var column_types = _hdrline(lines[3]);
            var type_lengths = _hdrline(lines[4]);

            resp.structure = [];
            resp.col = {};
            for (var i = 0; i < table_names.length; i++) {
                var colinfo = {
                    table : table_names[i],
                    column : column_names[i],
                    type : column_types[i],
                    typelen : parseInt(type_lengths[i]),
                    index : i
                };
                resp.col[colinfo.column] = colinfo.index;
                resp.structure.push(colinfo);
            }
            //resp.data = _parseTuples(column_types, lines.slice(5, lines.length-1));
			resp.column_types = column_types;
        }
        return resp;
    }
    /**
     * <hannes@cwi.nl>
     *
     * Parse the tuples part of a server response.
     *
     * @private
     */
    function _parseTuples(types, lines) {
        var state = 'INCRAP';
        var resultarr = [];
        lines.forEach(function(line) {
            var resultline = [];
            var cCol = 0;
            var curtok = '';
            /* mostly adapted from clients/R/MonetDB.R/src/mapisplit.c */
            for (var curPos = 2; curPos < line.length - 1; curPos++) {
                var chr = line.charAt(curPos);
                switch (state) {
                    case 'INCRAP':
                        if (chr != '\t' && chr != ',' && chr != ' ') {
                            if (chr == '"') {
                                state = 'INQUOTES';
                            } else {
                                state = 'INTOKEN';
                                curtok += chr;
                            }
                        }
                        break;
                    case 'INTOKEN':
                        if (chr == ',' || curPos == line.length - 2) {
                            if (curtok == 'NULL') {
                                resultline.push(null);

                            } else {
                                switch(types[cCol]) {
                                    case 'boolean':
                                        resultline.push(curtok == 'true');
                                        break;
                                    case 'tinyint':
                                    case 'smallint':
                                    case 'int':
                                    case 'wrd':
                                    case 'bigint':
                                        resultline.push(parseInt(curtok));
                                        break;
                                    case 'real':
                                    case 'double':
                                    case 'decimal':
                                        resultline.push(parseFloat(curtok));
                                        break;
                                    case 'json':
                                        try {
                                            resultline.push(JSON.parse(curtok));
                                        } catch(e) {
                                            resultline.push(curtok);
                                        }
                                        break;
                                    default:
                                        // we need to unescape double quotes
                                        //valPtr = valPtr.replace(/[^\\]\\"/g, '"');
                                        resultline.push(curtok);
                                        break;
                                }
                            }
                            cCol++;
                            state = 'INCRAP';
                            curtok = '';
                        } else {
                            curtok += chr;
                        }
                        break;
                    case 'ESCAPED':
                        state = 'INQUOTES';
                        switch(chr) {
                            case 't': curtok += '\t'; break;
                            case 'n': curtok += '\n'; break;
                            case 'r': curtok += '\r'; break;
                            default: curtok += chr;
                        }
                        break;
                    case 'INQUOTES':
                        if (chr == '"') {
                            state = 'INTOKEN';
                            break;
                        }
                        if (chr == '\\') {
                            state = 'ESCAPED';
                            break;
                        }
                        curtok += chr;
                        break;
                }
            }
            resultarr.push(resultline);
        });
        return resultarr;
    }

    function _reconnect(attempt) {
        if(attempt > options.maxReconnects) {
            // reached limit
            if (options.warnings) {
                options.warningFn(options.logger, 'Attempted to reconnect for ' + (attempt-1) + ' times.. We are giving up now.');
            }
            _reconnecting = false;
            return self.destroy('Failed to connect to MonetDB server');
        }

        // not reached limit: attempt a reconnect

        // always destroy socket, since if reconnecting, we always want to remove listeners and stop all traffic
        _destroySocket();


        if(options.warnings) {
            options.warningFn(options.logger, 'Reconnect attempt ' + attempt + '/' + options.maxReconnects + ' in ' + (options.reconnectTimeout/1000) + ' sec..');
        }
        setTimeout(function() {
            self.connect().then(function() {
                if(options.warnings) {
                    options.warningFn(options.logger, 'Reconnection succeeded.');
                }
                _reconnecting = false;
            }, function(err) {
                if(options.warnings) {
                    options.warningFn(options.logger, 'Could not connect to MonetDB: ' + err);
                }
                _messageQueue = [];
                _reconnect(attempt+1);
            });
        }, options.reconnectTimeout);
    }

    function _onData(data) {
        if(_state == 'connected') {
            _state = 'started';
        }
        _handleData(data);
    }
    function _onError(err) {
        if(_state == 'disconnected') {
            // there must have been a connection error, since the error handler was called
            // before the net.connect callback
            _connectDeferred.reject(new Error(err));
        }
        if(options.warnings) {
            options.warningFn(options.logger, 'Socket error occurred: ' + err.toString());
        }
    }
    function _onClose() {
        _setState('disconnected');

        if(!_reconnecting) {
            _reconnecting = true;

            if (_curMessage) {
                _messageQueue.unshift(_curMessage);
                _curMessage = null;
            }

            // transfer messages in queue to another variable
            _messageQueueDisconnected = _messageQueue;
            _messageQueueDisconnected.tag = 'disconnected';
            _messageQueue = _emptyMessageQueue('main');
            _reconnect(1);
        }
    }

    function _destroySocket() {
        if(_socket) {
            _socket.removeListener('data', _onData);
            _socket.removeListener('error', _onError);
            _socket.removeListener('close', _onClose);
            _socket.destroy();
        }
        _socket = null;
    }

    function _resumeMsgLoop() {
        /* if message loop is not running, we need to start it again */
        if (!_msgLoopRunning) {
            _debug('Message loop was not running; starting message loop..');
            _msgLoopRunning = true;
            _nextMessage();
        }
    }

    function _request(message, queue, streamflag) {
        var defer = Q.defer();
        if (streamflag) {
            const emitter = new EventEmitter();
            defer.promise.on = emitter.on;
            defer.promise.emit = emitter.emit;			
        }

        if(_state == 'destroyed') defer.reject(new Error('Cannot accept request: connection was destroyed.'));
        else {
            _debug('Pushing request into ' + queue.tag + ' message queue: ' + message);
            queue.push({
                message: message,
                deferred: defer
            });
            _resumeMsgLoop();
        }
        if(options.debugRequests) {
            return defer.promise.then(function(res) {
                options.debugRequestFn(options.logger, message, null, res);
                return res;
            }, function(err) {
                options.debugRequestFn(options.logger, message, err, null);
                throw err;
            });
        }
        return defer.promise;
    }


    // public vars and functions

    /**
     * Get the current state of the connection. Possible states:
     * - disconnected: There is currently no open connection, either because it has never
     *                 been opened yet, or because a reconnect is going on
     * - connected:    There is an open connection to the server, but authentication has not
     *                 finished yet.
     * - started:      An initial message has been received from the server after connecting
     * - ready:        There is an open connection to the server, and we have successfully
     *                 authenticated. The connection is ready to accept queries.
     * - destroyed:    The connection is destroyed, either because it was explicitly destroyed
     *                 by a call to {destroy}, or because of a failure to keep the connection open.
     * @returns {string}
     */
    self.getState = function() {
        return _state;
    };

    /**
     * <hannes@cwi.nl>
     */
    self.connect = function() {
        _connectDeferred = Q.defer();
        if(_failPermanently) _connectDeferred.reject(new Error('Failure to connect simulated by testing..'));
        else if(_state == 'destroyed') _connectDeferred.reject(new Error('Failed to connect: This connection was destroyed.'));
        else {
            // set up the connection

            // We set msgLoopRunning to true, so any requests we do will not start the message loop.
            // We wait for an initial message from the server, which will trigger authentication,
            // and eventually trigger the nextMessage method.
            _msgLoopRunning = true;
            _socket = net.connect(options.port, options.host, function () {
                // Connected to the socket!
                _setState('connected');

                // We give the server some time to initiate traffic on this socket.
                var waitingTime = 1000;
                setTimeout(function() {
                    if(_state === 'connected') {
                        // server has still sent no initial message.. reconnect and do nothing further
                        _reconnect(1);
                    }
                }, waitingTime);

                // And we already fill the message queue with things that have to be done when authentication completes.
                _request('Xreply_size -1', _messageQueue);
                const auto_commit = Boolean(options.autoCommit) ? 1 : 0;
                _request(`Xauto_commit ${auto_commit}`, _messageQueue);


                // Set the time zone interval, we do not check whether or not that succeeds.
                _request(utils.packQuery("SET TIME ZONE INTERVAL '" + options.timezoneOffset + "' MINUTE"), _messageQueue);

                var schemaReq = Q.when(true);
                // Set the schema, if other than 'sys'
                if(options.defaultSchema !== 'sys') {
                    schemaReq = _request(utils.packQuery('SET SCHEMA ' + options.defaultSchema), _messageQueue);
                }
                // try to execute a simple query, after the schema has been set (if required at all) and resolve/reject connection promise
                return schemaReq.then(function() {
                    return _request(utils.packQuery('SELECT 42'), _messageQueue);
                }).then(function () {
                    // At this point, the message queue should be empty, since 'select 42' was the
                    // last request placed by the connect method, and that one has been successfully
                    // completed.
                    // Requests that have arrived in the meantime are stored in messageQueueDisconnected.
                    // Swap these queues, and resume the msg loop
                    _messageQueue = _messageQueueDisconnected;
                    _messageQueue.tag = 'main';
                    _messageQueueDisconnected = _emptyMessageQueue('disconnected');
                    _resumeMsgLoop();
                    _connectDeferred.resolve();
                }, function (err) {
                    if (options.warnings) {
                        options.warningFn(options.logger, 'Error on opening connection: ' + err);
                    }
                    _connectDeferred.reject(new Error('Could not connect to MonetDB: ' + err));
                }).done();
            });
            _socket.on('data', _onData);
            _socket.on('error', _onError);
            _socket.on('close', _onClose);
        }

        return _connectDeferred.promise;
    };

    self.request = function(message, streamflag) {
        if(options.warnings && !_connectDeferred) {
            options.warningFn(options.logger, 'Request received before a call to connect. This request will not be processed until you have called connect.');
        }
        return _request(message, _state == 'disconnected' ? _messageQueueDisconnected : _messageQueue, (streamflag === true));
    };

    self.close = function() {
        _closeDeferred = Q.defer();
        if(_state == 'destroyed') _closeDeferred.resolve();
        else if(!_msgLoopRunning) {
            self.destroy();
            _closeDeferred.resolve();
        }
        return _closeDeferred.promise;
    };

    self.end = function(data = null, cb = null) {
        if(_socket) {
            _socket.end(data, cb);
        }
    };

    /**
     *
     * @param msg message that will be passed to the error handlers of the pending queries.
     */
    self.destroy = function(msg) {
        _destroySocket();
        _setState('destroyed');
        function failQuery(message) {
            message.deferred.reject(new Error(msg ? msg : 'Connection destroyed'));
        }
        _curMessage && failQuery(_curMessage);
        _messageQueue.forEach(failQuery);
        _messageQueueDisconnected && _messageQueueDisconnected.forEach(failQuery);

        _messageQueue = _emptyMessageQueue('main');
        _messageQueueDisconnected = _emptyMessageQueue('disconnected');
    };


    if(options.testing) {
        self.socketError = function(statusCode, permanently) {
            if(!_socket) throw new Error('Socket not initialized yet');
            _socket.end();
            _socket.emit('error', statusCode);
            _socket.emit('close', true);
            _failPermanently = permanently;
        }
    }
};
