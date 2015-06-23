'use strict';

var js2xml = require('js2xmlparser');

/**
 * render xml from js object
 * @param {Object} dataObj object / data to render
 * @param {Object} [xmlOpts] render options for js2xmlparser module
 * @returns {String}  xml
 */
module.exports.xml = function(dataObj, xmlOpts){
    return js2xml((xmlOpts||{}).rootName || 'root', dataObj, xmlOpts || {});
}