'use strict';

/*
 * Expose view module
 */

module.exports = require('./lib/view.js');
module.exports.parse = require('./lib/parse.js').parse;
module.exports.slice = require('./lib/parse.js').slice;
module.exports.xml = require('./lib/xml.js').xml;
