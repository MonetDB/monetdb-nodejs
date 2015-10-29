'use strict';

module.exports.debug = function(logger, type, msg) {
    logger('DEBUG [' + type.toUpperCase() + '] '+ msg);
};

module.exports.debugRequest = function(logger, message, error, result) {
    logger(message);
    error && logger(error);
    result.rows && result.cols && logger(result.rows + " rows, " + result.cols + " cols");
    logger('\n');
};

module.exports.debugMapi = function(logger, type, msg) {
    logger(type + ": " + msg);
};

module.exports.packQuery = function(msg) {
    return 's' + msg + ';';
};
