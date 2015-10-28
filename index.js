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
    maxReconnects: {
        type: 'number',
        dflt: 10,
        transform: parseInt
    },
    reconnectTimeout: {
        type: 'number',
        dflt: 2000,
        transform: parseInt
    },
    prettyResult: {
        type: 'boolean',
        dflt: false,
        transform: parseBool
    },
    log: {
        type: 'function',
        dflt: console.log,
        transform: function(x) {
            // does not transform, but updates utils.log
            utils.log = x;
            return x;
        }
    },
    debug: {
        type: 'boolean',
        dflt: true,
        transform: parseBool
    },
    debugFn: {
        type: 'function',
        dflt: utils.debug
    },
    debugRequests: {
        type: 'boolean',
        dflt: false,
        transform: parseBool
    },
    debugRequestFn: {
        type: 'function',
        dflt: utils.debugRequest
    },
    debugMapi: {
        type: 'boolean',
        dflt: false,
        transform: parseBool
    },
    debugMapiFn: {
        type: 'function',
        dflt: utils.debugMapi
    }
};

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
    if(result.debug) {
        Object.keys(opts).forEach(function(option) {
            if(result[option] === undefined) {
                result.debugFn('warn', 'Unrecognized option "' + option + '"');
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


module.exports = function(d) {
    var globalOpts = parseOptions(d);

    function MonetDBConnection(d) {
        var self = this;

        // private vars and functions
        var _options = parseOptions(d, globalOpts);

        // public vars and functions
        self.mapiConnection = new MapiConnection(_options);

        self.query = self.request = function(query) {
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
                return self.prepare(query).then(function(prepResult) {
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

        self.prepare = function(query) {
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
                            var toCheck = ['timestamp', 'timestamptz', 'date'];
                            var i = toCheck.indexOf(colData[0]);
                            if (i >= 0) {
                                s = toCheck[i] + ' ' + s;
                            }
                        }
                        return s;
                    }).join(', ');
                    var execquery = 'EXEC ' + result.queryid + '(' + quoted + ')';
                    return self.mapiConnection.request(utils.packQuery(execquery));
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

        self.option = function(option) {
            return _options[option];
        };

        // TODO: consider proxying a connection promise

        // proxy some methods
        ["connect", "getState", "close", "destroy"].forEach(function(d) {
            self[d] = self.mapiConnection[d];
        });
    }
    return MonetDBConnection;
};
