'use strict';

var cheerio = require('cheerio'),
    Series = require('enterprise-utils').async.Series;

module.exports.parse = parse;
module.exports.slice = slice;

// default attribute that holds template id
var TEMPLATE_ID_ATTR = 'e-template-id',
    CONTAINER_ID_ATTR = 'e-container',
    WIDGET_ID_ATTR = 'e-widget-id';

/*
 * parse options
 */
var normalizeWhitespace = false;

/**
 * customized deepSet
 * @param {Object} parent
 * @param {String} key
 * @param {Object} value
 * @param {String} mode
 * @param {Array} dynamicKeys
 * @returns {Object}  filled parent object
 */
function setObjValue(parent, key, value, mode, dynamicKeys) {
    if(typeof value==='string') value = value.replace(/(\r\n|\r|\n)\s*$/, ''); // replace line endings and white spaces
    var jsonNamespace = key.match(/^[j|J][s|S][o|O][n|N]\((.+)\)$/);
    if(jsonNamespace) {
        key = jsonNamespace[1];
        try { value = JSON.parse(value); }
        catch(err){ value = undefined; }
    }
    
    if(arguments.length===4 && typeof arguments[3] !== 'string') {
        dynamicKeys = arguments[3];
        mode = null;
    }
    if(dynamicKeys) {
        var toReplace = key.match(/\{([^\}]+)\}/g);
        if(toReplace) for(var r=0;r<toReplace.length;r++) {
            toReplace[r] = toReplace[r].substring(1,toReplace[r].length-1);
            key = key.replace(new RegExp(('{'+toReplace[r]+'}').escape()), dynamicKeys[ toReplace[r] ] || toReplace[r]);
        }
    }
    
    var parts = key.split('.');
    var current = parent;
    if(key==='this') {
        if(mode==='push') {
            if(!Array.isArray(parent)) parent = [value];
            else parent.push(value);
        }
        else parent = value;
    }
    else {
        for(var i=0; i<parts.length; i++) {
            if(i >= parts.length-1) { // last key, this will hold value
                if(mode==='push') {
                    if(!Array.isArray(current[parts[i]])) current[parts[i]] = [value];
                    else current[parts[i]].push(value);
                }
                else {
                    current[parts[i]] = value;
                    // don't store undefined values, it is same as they do not exists
                    if(typeof value==='undefined') delete current[parts[i]];
                }
            }
            else if(Object.prototype.toString.call(current[parts[i]]) !== '[object Object]' && !Array.isArray(current[parts[i]])){
                // object will have another child objects, and it is not object, reset it
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
    }
    return parent;
}

// extract from inner HTML
function extractInnerHtml($, elms, mapping, model, dynamicKeys, callback) { // callback(err, model)
    if(!mapping.html || mapping.html==='' || elms.length===0) {
        callback(null, model);
        return;
    }
    
    var value = elms.first().html();
    model = setObjValue(model, mapping.html, value, dynamicKeys);
    callback(null, model);
}


// extract from ATTRS
function extractAttrs($, elms, mapping, model, dynamicKeys, callback) { // callback(err, model) 
    if(!mapping.attrs || mapping.attrs==='' || elms.length===0) {
        callback(null, model);
        return;
    }
    
    for(var attrName in mapping.attrs){
        var value;
        
        if(attrName === 'style' &&
           Object.prototype.toString.call(mapping.attrs[attrName]) === '[object Object]'){
            value = {};
            for(var cssName in mapping.attrs[attrName]){
                value = elms.first().css(cssName);
                model = setObjValue(model, mapping.attrs[attrName][cssName], value, dynamicKeys);
            }
        }
        else if(attrName === 'class' &&
           Object.prototype.toString.call(mapping.attrs[attrName]) === '[object Object]'){
            value = {};
            var classPrefix, classSuffix, matched, classes = (elms.first().attr('class') || '').split(' ');
            for(var className in mapping.attrs[attrName]){
                classPrefix = null;
                classSuffix = null;
                if(className[className.length-1]===')'){
                    classPrefix = className.match(/^[p|P][r|R][e|E][f|F][i|I][x|X]\((.+)\)$/);
                    classSuffix = className.match(/^[s|S][u|U][f|F][f|F][i|I][x|X]\((.+)\)$/);
                }
                
                if(classPrefix){
                    classPrefix = new RegExp('^'+classPrefix[1]+'(.+)');
                    value = [];
                    for(var c=0;c<classes.length;c++) {
                        matched = classes[c].match(classPrefix);
                        if(matched) value.push(matched[1]);
                    }
                    if(value.length<=1) value = value[0];
                }
                else if(classSuffix){
                    classSuffix = new RegExp('(.+)'+classSuffix[1]+'$');
                    value = [];
                    for(var c=0;c<classes.length;c++) {
                        matched = classes[c].match(classSuffix);
                        if(matched) value.push(matched[1]);
                    }
                    if(value.length<=1) value = value[0];
                }
                else {
                    value = classes.indexOf(className)!==-1;
                }
                model = setObjValue(model, mapping.attrs[attrName][className], value, dynamicKeys);
            }
        }
        else if(typeof mapping.attrs[attrName] === 'string') {
            value = elms.first().attr(attrName);
            model = setObjValue(model, mapping.attrs[attrName], value, dynamicKeys);
        }
    }
    callback(null, model);
}


// extract array from REPEAT
function extractRepeat($, elms, mapping, model, dynamicKeys, callback) { // callback(err, model)
    
    if(!mapping.repeat || mapping.repeat==='') {
        callback(null, model);
        return;
    }
    else if(elms.length < 1) {
        // no elements found => result will be empty array
        // model[mapping.repeat] = []
        model = setObjValue(model, mapping.repeat, [], dynamicKeys);
        callback(null, model);
        return;
    }
    
    // model[mapping.repeat] = []
    model = setObjValue(model, mapping.repeat, [], dynamicKeys);
    
    // mapping example:
    //".carousel-inner .item":{
    //        "showDefault":true - if model property 'banners' is undefined, don't change output (default is true)
    //        "repeat":"banners",
    //        "inside":{
    //            "a":{ "attrs":{"href":"link"} },
    //            "img":{ "attrs":{ "src":"image" } },
    //            "h4":{ "html":"title" },
    //            "p":{ "html":"text" }
    //        }
    //    }
    
    var s = new Series(setImmediate);
    elms.each(function(){
        var elm = $(this);
        s.add(function(next){
            
            extractInnerHtml($, elm, mapping, {}, dynamicKeys, function(err, subModel){
                if(err) { callback(err); return; }
                
                extractAttrs($, elm, mapping, subModel, dynamicKeys, function(err, subModel){
                    if(err) { callback(err); return; }
                    
                    if(mapping.inside){
                        extractAll($, elm, mapping.inside, subModel, dynamicKeys, function(err, subModel){
                            if(err) { callback(err); return; }
                            
                            model = setObjValue(model, mapping.repeat, subModel, 'push', dynamicKeys);
                            next();
                        });
                    }
                    else {
                        model = setObjValue(model, mapping.repeat, subModel, 'push', dynamicKeys);
                        next();
                    }
                });
            });
        });
    });
    
    s.execute(function(err){ callback(err, model); });
}

// extract model from html
function extractAll($, elm, mapping, model, dynamicKeys, callback) { // callback(err, model)
    Series.each(mapping, function(selector, next){
        var elms = elm.find(selector);
        
        (new Series(setImmediate))
        .add(function(next){ // extract html
            if(mapping[selector].html && !mapping[selector].repeat) { 
                extractInnerHtml($, elms, mapping[selector], model, dynamicKeys, function(err, model){
                    if(!err) next();
                    else next(err);
                });
            }
            else next();
        })
        .add(function(next){ // extract attrs
            if(mapping[selector].attrs && !mapping[selector].repeat) {
                extractAttrs($, elms, mapping[selector], model, dynamicKeys, function(err, model){
                    if(!err) next();
                    else next(err);
                });
            }
            else next();
        })
        .add(function(next){ // repeat - extract array   
            if(mapping[selector].repeat) { 
                extractRepeat($, elms, mapping[selector], model, dynamicKeys, function(err, model){
                    if(!err) next();
                    else next(err);
                });
            }
            else next();
        }).execute(next);
            
    }, function(err){ callback(err, model); });
}

/**
 * Parse (extract) model data from html, oposite to rendering template
 * @param {String} html
 * @param {Object} mapping
 * @param {Object} opts
 * @param {Function} callback
 */
function parse(html, mapping, opts, callback) { // callback(err, parsedObj)
    if(arguments.length === 3){
        callback = arguments[2];
        opts = {};
    }
    
    opts = opts || {};
    opts.normalizeWhitespace = opts.normalizeWhitespace === false ? false : (normalizeWhitespace || false);
    opts.xmlMode = opts.xmlMode || false;
    
    // default cheerio options
    // xmlMode:false,
    // lowerCaseAttributeNames:false,
    // lowerCaseTags:false,
    // decodeEntities:true
    
    var $ = cheerio.load(html||'', opts);
    var valueObj = opts.valueObj || {};
    mapping = mapping || {};
    
    extractAll($, $.root(), mapping, valueObj, opts.dynamicKeys, callback);
}

/**
 * Slice html into parts defined by containers, widgets, partials, etc...
 * @param {String} html
 * @param {String} attrName
 * @param {Object} opts
 * @returns {Array}  sliced templates
 */
function slice(html, attrName, opts){
    if(arguments.length===2 && typeof arguments[1] !== 'string'){
        opts = arguments[1];
        attrName = '';
    }
    
    opts = opts || {};
    opts.normalizeWhitespace = opts.normalizeWhitespace === false ? false : (normalizeWhitespace || false);
    opts.xmlMode = opts.xmlMode || false;
    
    attrName = attrName || TEMPLATE_ID_ATTR;
    
    var $ = cheerio.load(html||'', opts);
    var templates = [];
    $.root().find('[' +attrName+ ']').each(function(){
        var self = $(this),
            template = self.attr(attrName),
            containerId = self.closest('['+CONTAINER_ID_ATTR+']').attr(CONTAINER_ID_ATTR) || '',
            widgetId = self.attr(WIDGET_ID_ATTR) || '';
        
        // skip if no template is defined
        if(!template) return;
        
        var prev = self.prev('[' +attrName+ ']');
        
        if(prev && prev.attr(attrName)===template && (prev.attr(WIDGET_ID_ATTR)||'')===widgetId){
            // this is next part of widget, just append template to last templates
            var templateElm = $(this).clone();
            templateElm.find('[' +attrName+ ']').remove(); // remove all descendant templates
            
            // get prev slice of this template
            for(var i=0;i<templates.length;i++){
                if(templates[i].template === template) {
                    templates[i].html += $.html(templateElm);
                    break;
                }
            }
        }
        else {
            var templateElm = $(this).clone();
            templateElm.find('[' +attrName+ ']').remove(); // remove all descendant templates
            templates.push({ template:template, html:$.html(templateElm), containerId:containerId, widgetId:widgetId }); // get html include parent element
        }
    });
    
    return templates;
}