'use strict';

module.exports.log = console.log;

module.exports.debug = function(type, msg) {
    module.exports.log('DEBUG [' + type.toUpperCase() + '] '+ msg);
};

module.exports.debugRequest = function(message, error, result) {
    module.exports.log(message + '\n');
    error && module.exports.log(error + '\n');
    module.exports.log(result.rows + " rows, " + result.cols + " cols");
    module.exports.log('\n\n');
};

module.exports.debugMapi = function(type, msg) {
    module.exports.log(type + ": " + msg);
};

module.exports.packQuery = function(msg) {
    return 's' + msg + ';';
};
