/**
 * Author: Robin Cijvat <robin.cijvat@monetdbsolutions.com>
 */

'use strict';

module.exports.debug = function(logger, msg) {
    logger('DEBUG ' + msg);
};

module.exports.warning = function(logger, msg) {
    logger('WARNING ' + msg);
};

module.exports.debugRequest = function(logger, request, error, result) {
    logger(request);
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
