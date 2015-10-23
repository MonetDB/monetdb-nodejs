'use strict';

module.exports.debug = function(type, msg) {
    console[type]('DEBUG ' + msg);
};

module.exports.debugRequest = function(message, error, result) {
    console.info(message + '\n');
    error && console.info(error + '\n');
    if(result && result.rows) {
        console.info(JSON.stringify(result.data[0], null, ' ' + '\n'));
        result.rows > 1 && console.info(JSON.stringify(result.data[1], null, ' ' + '\n'));
        result.rows > 2 && console.info('..');
    }
    console.info('\n\n');
};

module.exports.debugMapi = function(type, msg) {
    console.info(type + ": " + msg);
};

module.exports.packQuery = function(msg) {
    return 's' + msg + ';';
};
