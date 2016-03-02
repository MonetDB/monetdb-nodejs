/**
 * Author: Robin Cijvat <robin.cijvat@monetdbsolutions.com>
 */

'use strict';

var Q = require('q');

var utils = require('./utils.js');
var MapiConnection = require('./mapi-connection.js');

var optionDefinition = {
    host: {
        type: 'string',
        dflt: 'localhost'
    },
    port: {
        type: 'number',
        dflt: 50000,
        transform: parseInt
    },
    dbname: {
        type: 'string'
    },
    user: {
        type: 'string',
        dflt: 'monetdb'
    },
    password: {
        type: 'string',
        dflt: 'monetdb'
    },
    language: {
        type: 'string',
        dflt: 'sql'
    },
    defaultSchema: {
        type: 'string',
        dflt: 'sys'
    },
    timezoneOffset: {
        type: 'number',
        dflt: new Date().getTimezoneOffset(), // offset in minutes
        transform: parseInt
    },
    maxReconnects: {
        type: 'number',
        dflt: 10,
        transform: parseInt,
        changeable: true
    },
    reconnectTimeout: {
        type: 'number',
        dflt: 2000,
        transform: parseInt,
        changeable: true
    },
    prettyResult: {
        type: 'boolean',
        dflt: false,
        transform: parseBool,
        changeable: true
    },
    logger: {
        type: 'function',
        dflt: console.log,
        changeable: true
    },
    warnings: {
        type: 'boolean',
        dflt: true,
        transform: parseBool,
        changeable: true
    },
    warningFn: {
        type: 'function',
        dflt: utils.warning,
        changeable: true
    },
    debug: {
        type: 'boolean',
        dflt: false,
        transform: parseBool,
        changeable: true
    },
    debugFn: {
        type: 'function',
        dflt: utils.debug,
        changeable: true
    },
    debugRequests: {
        type: 'boolean',
        dflt: false,
        transform: parseBool,
        changeable: true
    },
    debugRequestFn: {
        type: 'function',
        dflt: utils.debugRequest,
        changeable: true
    },
    debugMapi: {
        type: 'boolean',
        dflt: false,
        transform: parseBool,
        changeable: true
    },
    debugMapiFn: {
        type: 'function',
        dflt: utils.debugMapi,
        changeable: true
    },
    testing: {
        type: 'boolean',
        dflt: false,
        transform: parseBool
    }
};

var apiAliases = [
    { from: "open", to: "connect" },
    { from: "request", to: "query" },
    { from: "disconnect", to: "close" }
];

function applyAliases(obj) {
    apiAliases.forEach(function(alias) {
        obj[alias.from] = obj[alias.to];
    });
}


function parseBool(b) { return !!b }

function parseOptions(opts, globalOpts) {
    if(!opts) opts = {};
    // Construct new options object by reducing the options found in the definitions object
    var result = Object.keys(optionDefinition).reduce(function(o, option) {
        var definition = optionDefinition[option];
        var given = opts[option];
        var parsed = globalOpts ? globalOpts[option] : undefined;
        if(given === undefined) {
            if (parsed === undefined && definition.dflt === undefined) {
                // only fail if we are not constructing the global opts, since global opts
                // might miss required options, which then have to be filled in by local options
                if(!globalOpts) return o;
                throw new Error('Required option "' + option + '" not found..');
            }
            o[option] = parsed !== undefined ? parsed : definition.dflt;
            return o;
        }
        if(typeof(given) != definition.type) {
            throw new Error(
                'Option "' + option + '" has the wrong type. ' +
                'Expected: "' + definition.type + '"' +
                'Given: "' + typeof(given) + '"'
            );
        }
        o[option] = definition.transform ? definition.transform(given) : given;
        return o;
    }, {});

    // report any unrecognized options if debug mode is set on the new options object
    if(result.warnings) {
        Object.keys(opts).forEach(function(option) {
            if(result[option] === undefined) {
                result.warningFn(result.logger, 'Unrecognized option "' + option + '"');
            }
        });
    }

    return result;
}

function prettyResult(result) {
    // Do an in-place replacement of the entries of the result.data array
    result.data && result.data.forEach(function(tuple, i) {
        var tupleObj = {};
        tuple.forEach(function(val, j) {
            tupleObj[result.structure[j].column] = val;
        });
        result.data[i] = tupleObj;
    });
}

function promiseFnWrapper(thisArg, fn, returnVal) {
    return function() {
        var args = Array.prototype.slice.call(arguments);
        var callback = (typeof(args[args.length - 1]) == 'function') ? args.pop() : null;
        var promise = fn.apply(thisArg, args);
        if (callback) {
            promise.then(function (result) {
                callback(null, result);
            }, function (err) {
                callback(err);
            });
        }
        return returnVal;
    };
}


module.exports = function(d) {
    var globalOpts = parseOptions(d);

    function MonetDBConnection(d) {
        var self = this;

        // private vars and functions
        var _options = parseOptions(d, globalOpts);

        // public vars and functions
        self.mapiConnection = new MapiConnection(_options);

        self.query = function(query) {
            var params = [];
            var pretty = _options.prettyResult;
            for (var i=0; i<arguments.length; ++i) {
                var arg = arguments[i];
                if (Array.isArray(arg)) {
                    params = arg;
                } else if((typeof arg) == 'boolean') {
                    pretty = arg;
                }
            }

            if (params.length) {
                var releaseFun = null;
                return self.prepare(query, false).then(function(prepResult) {
                    releaseFun = prepResult.release;
                    return prepResult.exec(params);
                }).then(function(result) {
                    pretty && prettyResult(result);
                    releaseFun();
                    return result;
                });
            }

            return self.mapiConnection.request(utils.packQuery(query)).then(function(result) {
                pretty && prettyResult(result);
                return result;
            });
        };

        self.prepare = function(query, prettyResult) {
            if (query.toUpperCase().trim().substring(0,7) != 'PREPARE')
                query = 'PREPARE ' + query;
            return self.mapiConnection.request(utils.packQuery(query)).then(function(result) {
                function execfun(bindparams) {
                    var quoted = bindparams.map(function (param, paramIndex) {
                        if (param === null) {
                            return 'NULL';
                        }
                        var type = typeof param;
                        var s;
                        switch (type) {
                            case 'boolean':
                            case 'number':
                                s = '' + param;
                                break;
                            case 'string':
                                /* escape single quotes except if they are already escaped */
                                s = "'" + param.replace(/([^\\])'/g, "$1\\'") + "'";
                                break;
                            case 'object':
                                s = "json '" + JSON.stringify(param).replace(/([^\\])'/g, "$1\\'") + "'";
                                break;
                            default:
                                s = param;
                                break;
                        }
                        var colData = result.data[result.rows - bindparams.length + paramIndex];
                        if (colData) {
                            var toCheck = ['timestamp', 'timestamptz', 'date', 'uuid'];
                            var i = toCheck.indexOf(colData[0]);
                            if (i >= 0) {
                                s = toCheck[i] + ' ' + s;
                            }
                        }
                        return s;
                    }).join(', ');
                    var execquery = 'EXEC ' + result.queryid + '(' + quoted + ')';
                    return self.query(execquery, prettyResult);
                }

                function releasefun() {
                    self.mapiConnection.request('Xrelease ' + result.queryid);
                }

                return {'prepare': result, 'exec': execfun, 'release': releasefun};
            });
        };

        self.env = function() {
            return self.mapiConnection.request(utils.packQuery('SELECT * FROM env()')).then(function(result) {
                if(!result.rows || !result.data) throw new Error('Could not fetch server environment');
                return result.data.reduce(function(o, arr) {
                    o[arr[0]] = arr[1];
                    return o;
                }, {});
            });
        };

        self.option = function(option, val) {
            var def = optionDefinition[option];
            if(!def) throw new Error('Option "' + option + '" does not exist');
            if(arguments.length == 1) return _options[option];
            if(!def.changeable) throw new Error('Option "' + option + '" can not be changed. Please set this option on a new connection.');
            if(typeof(val) != def.type) throw new Error('Option "' + option + '" should be of type "' + def.type + '"');
            _options[option] = def.transform ? def.transform(val) : val;
        };

        // proxy some methods
        self.connect = self.mapiConnection.connect;
        self.getState = self.mapiConnection.getState;
        self.close = self.mapiConnection.close;
        self.destroy = self.mapiConnection.destroy;

        applyAliases(self);


        self.getCallbackWrapper = function() {
            var wrapper = {
                option: self.option,
                getState: self.getState,
                destroy: self.destroy
            };

            // wrap connect, query and env
            ["connect", "query", "env", "close"].forEach(function(method) {
                wrapper[method] = promiseFnWrapper(self, self[method], wrapper);
            });

            // wrap prepare, which is somewhat more complicated, since it needs to return callback based exec and release fns
            wrapper.prepare = function() {
                var args = Array.prototype.slice.call(arguments);
                var callback = (typeof(args[args.length - 1]) == 'function') ? args.pop() : null;
                if(!callback) return wrapper; // if no callback is provided, what is the point in preparing something?
                var promise = self.prepare.apply(self, args);
                promise.then(function (prepResult) {
                    prepResult.exec = promiseFnWrapper(self, prepResult.exec);
                    callback(null, prepResult);
                }, function (err) {
                    callback(err);
                });
                return wrapper;
            };

            applyAliases(wrapper);

            return wrapper;
        };
    }
    return MonetDBConnection;
};
