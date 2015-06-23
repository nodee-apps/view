'use strict';

var cheerio = require('cheerio');

/*
 * compilation defaults:
 */
var CODE_START = '##!',
    CODE_END = '!##',
    LT = '#L!T#',
    LT_REGEX = /#L!T#/g,
    GT = '#G!T#',
    GT_REGEX = /#G!T#/g,
    APOS = '~!~',
    APOS_REGEX = /\~!\~/g,
    QUOTE = '~!!~',
    QUOTE_REGEX = /\~!!\~/g,
    TEMPLATE_ID_ATTRIBUTE = 'e-template-id',
    SHOW_TEMPLATE_ID_MODE = 'admin', // if mode=SHOW_TEMPLATE_ID_MODE, show e-template-id="..." attribute
    WIDGET_ID_ATTRIBUTE = 'e-widget-id';

/*
 * compile options
 */
var normalizeWhitespace = false,
    removeNewLines = false;

/*
 * mapping example:
 * 
 * ".carousel-inner .item":{
 *        "showDefault":true - if model property 'banners' is undefined, don't change output (default is true)
 *        "repeat":"banners",
 *        "inside":{
 *            "a":{ "attrs":{"href":"link"} },
 *            "img":{ "attrs":{ "src":"image" } },
 *            "h4":{ "html":"title" },
 *            "p":{ "html":"text" }
 *        }
 *    }
 */

module.exports.compile = compileHtml;
 
/**
 * compile html string - throws error if compilation fail
 * @param {String} htmlString
 * @param {Object} mapping model mapping to html elements
 * @param {Object} cheerioOpts cheerio options https://github.com/cheeriojs/cheerio
 * @param {String} templateId - optional template id, will be added to root element as attribute
 * @returns {Function}  compiled view function
 */
function compileHtml(htmlString, mapping, cheerioOpts, templateId){
    mapping = mapping || {};
    
    if(arguments.length===3 && typeof arguments[2] === 'string'){
        templateId = arguments[2];
        cheerioOpts = {};
    }
    
    cheerioOpts = cheerioOpts || {};
    cheerioOpts.normalizeWhitespace = cheerioOpts.normalizeWhitespace === false ? false : (normalizeWhitespace || false);
    cheerioOpts.xmlMode = cheerioOpts.xmlMode || false;
    // cheerioOpts.lowerCaseTags
    
    var out = insertFunctionsToHtml(htmlString, (mapping.view || mapping), cheerioOpts || {}, templateId);
    var viewFnc = evaluate(out.$.html());
    viewFnc.isLayout = out.isLayout;
    viewFnc.layout = out.layout;
    viewFnc.partials = out.partials;
    viewFnc.containers = out.containers;
    
    // keep mapping data to quick access when needed
    if(mapping.view) viewFnc.mapping = mapping;
    else viewFnc.mapping = {
        view: mapping
    };
    viewFnc.mapping = viewFnc.mapping || {};
    
    return viewFnc;
} 
    
/**
 * replace all mapped elements with functions generating string
 * @param {String} htmlString
 * @param {Object} mapping model mapping to html elements
 * @param {Object} cheerioOpts cheerio options https://github.com/cheeriojs/cheerio
 * @param {String} templateId - optional template id, will be added to root element as attribute
 * @returns {Object}  { $, isLayout, layout, partials }
 */
function insertFunctionsToHtml(htmlString, mapping, cheerioOpts, templateId){
    var $ = cheerio.load(htmlString, cheerioOpts);
    
    function insertHtmlMap(mapping, elms) {
        elms.html(CODE_START+'getObjValue(model,' + APOS + mapping.html + APOS + ',false,'+APOS+elms.html()+APOS+',dynamicKeys)'+CODE_END);
    }
    
    function insertAttrsMap(mapping, elms) {
        if(Object.prototype.toString.call(mapping.attrs) === '[object Object]'){
            for(var attrName in mapping.attrs) {
                // if attriubute name is "style" and mapping is object
                if(attrName === 'style' && Object.prototype.toString.call(mapping.attrs[attrName]) === '[object Object]'){
                    for(var cssName in mapping.attrs[attrName]){
                        elms.css(cssName, CODE_START+'getObjValue(model,'+APOS + mapping.attrs[attrName][cssName] + APOS + ',true,'+APOS+(elms.css(cssName)||'')+APOS+',dynamicKeys)'+CODE_END);
                    }
                }
                // if attriubute name is "class" and mapping is object
                else if(attrName === 'class' && Object.prototype.toString.call(mapping.attrs[attrName]) === '[object Object]'){
                    var getClassesCode = '(function(){var classes=['+ APOS +(elms.attr('class')||'').split(' ').join(APOS+','+APOS) +APOS+'];' ; //APOS+APOS;
                    
                    for(var className in mapping.attrs[attrName]){
                        getClassesCode+='classes=getClassValue(model,'+APOS+ className +APOS+','+APOS + mapping.attrs[attrName][className] + APOS + ',classes,dynamicKeys);';
                    }
                    getClassesCode+='return encode(classes.join('+APOS+' '+APOS+'));})()';
                    elms.attr(attrName, CODE_START+getClassesCode+CODE_END);
                }
                else {
                    elms.attr(attrName, CODE_START+'getObjValue(model,'+APOS + mapping.attrs[attrName] + APOS+',true,'+APOS+(elms.attr(attrName)||'')+APOS+',dynamicKeys)'+CODE_END);
                }
            }
        }
    }
    
    function insertRepeatMap(mapping, elms) {
        
        var template = elms.first();
        var defaultContent = $.html(template);
        
        // remove all, but first matched element
        if (elms.length>1) {
            for (var i=1;i<elms.length;i++) {
                defaultContent += $.html(template.next());
                template.next().remove();
            }
        }
        defaultContent = defaultContent.replace(/\n(\s|\n)*\n/g, '\n');
        
        if(mapping.html) insertHtmlMap(mapping, template);
        if(mapping.attrs) insertAttrsMap(mapping, template);
        
        if(Object.prototype.toString.call(mapping.inside) === '[object Object]'){
            insertAllMap(mapping.inside, template);
        }
        
        var html = '<e-render-code>'+CODE_START+
                        '(function(refArray){' +
                            ((mapping['default'] !== false && mapping['showDefault'] !== false) ? 'if(refArray.length===0)return '+APOS+defaultContent+APOS+';' : '') +
                            'var out='+APOS+APOS+';' +
                            'for(var i=0;i'+LT+'refArray.length;i++){'+
                                'out+=(function(model){return ' + APOS +
                                    $.html(template).replace(/\n(\s|\n)*\n/g, '\n') + // replace multi new lines
                                    APOS +
                                ';})(refArray[i]);'+
                            '}'+
                        'return out;})(getObjValue(model,'+APOS+mapping.repeat+APOS+',false,undefined,dynamicKeys)||[])'+
                    CODE_END+'</e-render-code>';
                    
        template.replaceWith(html);
    }
    
    function insertAllMap(mapping, elm) {
        for(var selector in mapping) {
            if( selector[0]!=='_' && selector[0]!=='$' && // ignore selectors that starts with "_" or "$" - those are config options
                ['partial','widget','container','renderbody','render-body','layout'].indexOf(selector)===-1){ // ignore special tags
                
                var elms = elm ? elm.find(selector) : $(selector);
                if(elms.length>0) { // element found
                    // write value element if is set
                    if(mapping[selector].repeat) {
                        insertRepeatMap(mapping[selector], elms);
                    }
                    else {
                        if(mapping[selector].html) {
                            insertHtmlMap(mapping[selector], elms);
                        }
                        if(mapping[selector].attrs) {
                            insertAttrsMap(mapping[selector], elms);
                        }
                    }
                }
            }
        }
    }
    
    // replace all mapped elements
    insertAllMap(mapping);
    
    // insert partial (and widget) content placeholders
    var partials = [];
    $('partial,widget').each(function(){
        var self = $(this);
        var partialName = self.attr('template');
        var partialId = self.attr('id')||'';
        if(partialName) {
            partials.push({ template:partialName, id:partialId });
            // replace <partial> element with partials[0]
            self.replaceWith('<e-render-code>'+CODE_START+'partials[' +(partials.length-1)+ ']'+CODE_END+'</e-render-code>');
        }
    });
    
    // insert widget containers content placeholders
    var containers = [];
    $('[e-container],[e-container-id]').each(function(){
        var cnt = $(this);
        var containerId = cnt.attr('e-container') || cnt.attr('e-container-id');
        
        var allowedWidgets = (cnt.attr('e-container-templates') || cnt.attr('e-container-widgets') || '').replace(/\s/g,'').split(',');
        // clean all empty ids
        for(var i=0;i<allowedWidgets.length;i++){
            if(!allowedWidgets[i]){
                allowedWidgets.splice(i, 1);
                i--;
            }
        }
        
        if(containerId) {
            containers.push({ id:containerId, widgets:allowedWidgets });
            // replace element body with container function
            cnt.empty();
            cnt.append('<e-render-code>'+CODE_START+'(containers[' +APOS+containerId+APOS+ ']||'+APOS+APOS+')'+CODE_END+'</e-render-code>');
            
            // remove e-container, e-container-widgets attributes
            cnt
            .removeAttr('e-container')
            .removeAttr('e-container-id')
            .removeAttr('e-container-widgets')
            .removeAttr('e-container-templates');
            
            // disable showing container id attributes
            cnt.attr('e-render-attribute', CODE_START+
                     '(mode===' +APOS+SHOW_TEMPLATE_ID_MODE+APOS+ ' ? ' +
                     APOS + 'e-container='+QUOTE+containerId+QUOTE +
                     ' e-container-widgets='+QUOTE+allowedWidgets+QUOTE+APOS + ':'+APOS+APOS+')'+CODE_END);
        }
    });
    
    // insert layout body content placeholders
    var body = $('renderbody,render-body');
    if(body.length === 1)
        // replace <renderbody> with body
        body.first().replaceWith('<e-render-code>'+CODE_START+'body'+CODE_END+'</e-render-code>');
    else if(body.length > 1) throw new Error('Only one <renderbody> or <render-body> element is allowed');
    
    // check if it has layout
    var layout = $('layout');
    var layoutTemplate = layout.attr('template');
    
    if(layout.length > 1) throw new Error('Only one <layout> element is allowed, and have to be root element');
    if(layout && layoutTemplate){
        // replace layout with its inner html
        layout.replaceWith(layout.html());
    }
    
    // write template and widget id, if mode === SHOW_TEMPLATE_ID_MODE
    var rootChildsElms = $.root().children();
    if(rootChildsElms) {
        rootChildsElms.each(function(){
            var self = $(this);
            var oldValue = self.attr('e-render-attribute') || '';
            var newValue = (oldValue ? oldValue+' ':'') + CODE_START+
                            '(mode===' +APOS+SHOW_TEMPLATE_ID_MODE+APOS+ ' ? ' +
                            APOS+TEMPLATE_ID_ATTRIBUTE+'='+QUOTE+(templateId||'')+QUOTE +
                            ' '+WIDGET_ID_ATTRIBUTE+'='+QUOTE+APOS+'+widgetId+'+APOS+QUOTE+APOS + ' :'+APOS+APOS+')'+CODE_END;
            
            self.attr('e-render-attribute', newValue);
        });
    }
    
    // insert show if function
    $('[show-if-mode]').each(function(){
        var elm = $(this);
        var modeValue = elm.attr('show-if-mode');
        elm.removeAttr('show-if-mode');
        var content = $.html(elm).replace(/\n(\s|\n)*\n/g, '\n');
        
        elm.replaceWith('<e-render-code>'+CODE_START+
                        '(mode===' +APOS+modeValue+APOS+ ' ? ' +
                        APOS + content + APOS + ' :' + APOS+APOS+')'+
                        CODE_END+'</e-render-code>');
    });
    
    return {
        $:$,
        isLayout: body.length === 1,
        layout: layoutTemplate,
        partials: partials,
        containers: containers
    };
}

/**
 * parse and evaluate html string
 * @param {String} viewString html string
 * @returns {Function}  compiled view function
 */
function evaluate(viewString){
    var result = '\'';
    var fnc = {};
    var fncStart = {}, fncEnd = {};
    var level = 0;
    
    viewString = viewString
        //.replace(//g,'');
        .replace(/\n(\s|\n)*\n/g, '\n')
        .replace(LT_REGEX,'<')
        .replace(GT_REGEX,'>')
        .replace(/<e-render-code([^>]+)>/g,'')
        .replace(/<e-render-code>/g,'')
        .replace(/<\/e-render-code>/g,'')
        .replace(/\r\n/g, '\n') // use unix, single char newline
        .replace(/\r/g, '\n') // use unix, single char newline
        .replace(/\'/g, '\\\'')
        .replace(/e-render-attribute="([^"]*)"/g,'$1') // remove attribute placeholder
        .replace(QUOTE_REGEX, '"');
        
    if(removeNewLines) viewString = viewString.replace(/\n/g, ''); // replace line breaks
    //if(normalizeWhitespace) viewString = viewString.replace(/>(\s+)</g, ''); // replace spaces between two html tags
    
    function isNext(str, startIndex, code){
        for(var i=0;i<code.length;i++)
            if(viewString[startIndex+i] !== code[i]) return false;
        return true;
    }
    
    for(var i=0;i<viewString.length;i++){
        // if CODE_START is next
        if(isNext(viewString, i, CODE_START)){
            level++;
            fnc[level] = '\'+';
            fncEnd[level] = null;
            fncStart[level] = i+2;
        }
        
        // if CODE_END is next
        else if(isNext(viewString, i, CODE_END)){
            fncStart[level] = null;
            fncEnd[level] = i+2;
        }
        
        else if(fncStart[level] && i > fncStart[level]){
            if(viewString[i]==='\n') fnc[level] += '\\n';
            else fnc[level] += viewString[i];
            //console.warn('nahravam fnc', i);
        }
        else if(fncStart[level] && i <= fncStart[level]){} // do nothing
        else if(fncEnd[level] && i === fncEnd[level]){
            if(level > 1) fnc[level-1] += fnc[level] + '+\'';
            else if(level===1) result += fnc[level].replace(APOS_REGEX, '\'') + '+\'';
            level--;
        }
        else if(fncEnd[level] && i <= fncEnd[level]){} // do nothing
        
        else if(viewString[i]==='\n') result += '\\n';
        else {
            result += viewString[i];
        }
    }
    
    // write "'" to end of string
    result += '\'';
    return eval('(function(model, mode, body, partials, containers, widgetId, dynamicKeys){'+
                    'partials=partials||{};'+
                    'containers=containers||{};'+
                    'widgetId=widgetId||"";'+
                    'return ' +result+ ';})');
}

/**
 * helper for getting object property value, or default value
 * @param {Object} parent object
 * @param {String} key property key name ("myproperty.subproperty")
 * @param {Boolean} needEncode encodes result if true
 * @param {String} defaultValue returns this value if undefined
 * @returns {String}  object property value
 */
function getObjValue(parent, key, needEncode, defaultValue, dynamicKeys) {
    if(defaultValue===undefined || defaultValue===null) defaultValue = '';
    if(parent===undefined || parent===null || typeof parent === 'function') return defaultValue;
    if(key==='this') return needEncode ? encode(parent) : parent;
    
    var jsonNamespace = key.match(/^[j|J][s|S][o|O][n|N]\((.+)\)$/);
    if(jsonNamespace) key = jsonNamespace[1];
    
    if(dynamicKeys) {
        var toReplace = key.match(/\{([^\}]+)\}/g);
        if(toReplace) for(var r=0;r<toReplace.length;r++) {
            toReplace[r] = toReplace[r].substring(1,toReplace[r].length-1);
            key = key.replace(new RegExp(('{'+toReplace[r]+'}').escape()), dynamicKeys[ toReplace[r] ] || toReplace[r]);
        }
    }
    
    var parts = key.split('.');
    var current = parent;
    
    for(var i=0; i<parts.length; i++) {
        if(current!==undefined && current!==null && current.hasOwnProperty && current.hasOwnProperty(parts[i])) current = current[parts[i]];
        else {
            return defaultValue;
        }
    }
    
    if(typeof current==='undefined') current = '';
    // function as value is not allowed
    if(typeof current === 'function') return defaultValue;
    else if(jsonNamespace) return needEncode ? encode(JSON.stringify(current)) : JSON.stringify(current);
    else return needEncode ? encode(current) : current;
}

/**
 * Helpers for getting css class value
 * @param {Object} model
 * @param {String} className
 * @param {String} keyName
 * @param {Array} classes
 * @returns {Array}  classes
 */
function getClassValue(model, className, keyName, classes, dynamicKeys){
    var classPrefix, classSuffix;
    if(className[className.length-1]===')'){
        classPrefix = className.match(/^[p|P][r|R][e|E][f|F][i|I][x|X]\((.+)\)$/);
        classSuffix = className.match(/^[s|S][u|U][f|F][f|F][i|I][x|X]\((.+)\)$/);
    }
    
    var hasClass, classValues, addClass = '';
    if(classPrefix) {
        classValues = getObjValue(model, keyName, false, '', dynamicKeys);
        classValues = Array.isArray(classValues) ? classValues : [classValues];
        
        for(var c=0;c<classValues.length;c++) {
            if(!classValues[c]) continue;
            addClass = classPrefix[1] + classValues[c];
            if(classes.indexOf(addClass)===-1) classes.push(addClass);
        }
    }
    else if(classSuffix){
        classValues = getObjValue(model, keyName, false, '', dynamicKeys);
        classValues = Array.isArray(classValues) ? classValues : [classValues];
        
        for(var c=0;c<classValues.length;c++) {
            if(!classValues[c]) continue;
            addClass = classValues[c] + classSuffix[1];
            if(classes.indexOf(addClass)===-1) classes.push(addClass);
        }
    }
    else {
        hasClass = getObjValue(model, keyName, false, '', dynamicKeys);
        if(hasClass===true){ // add class
            if(classes.indexOf(className)===-1) classes.push(className);   
        }
        else if(hasClass===false){ // remove class
            if(classes.indexOf(className)!==-1) classes.splice(classes.indexOf(className),1);    
        }
    }
    
    return classes;
}

/**
 * Helper for encoding string
 * @param {String} str
 * @returns {String}  encoded string
 */
function encode(str){
    if(typeof str!=='string') str.toString ? str=str.toString() : str=str+'';
    return str
        .replace(/\u0026/g,'&amp;')
        .replace(/\u0022/g,'&quot;')
        .replace(/\u0027/g,'&apos;')
        .replace(/\u003e/g,'&qt;')
        .replace(/\u003c/g,'&lt;');
}