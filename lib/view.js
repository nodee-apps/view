'use strict';

var fsExt = require('nodee-utils').fsExt,
    path = require('path'),
    fs = require('fs');

var VIEW_FILE_EXT = 'html',
    VIEW_FILE_EXT_REGEXP = /\.html$/g,
    MAP_FILE_EXT = 'json',
    SCRIPT_FILE_EXT = 'js';

// if minified, compileHtml will be defined, else require compile.js
if(typeof compileHtml === 'undefined') var compileHtml = require('./compile.js').compile;

/*
 * simple, but powerful view engine
 */

module.exports.init = init;
module.exports.compile = compileHtml;
module.exports.compileSync = compileSync;
module.exports.compileAsync = compileAsync;
module.exports.get = module.exports.getView = function(id){ return views[id]; };
module.exports.getAll = module.exports.getViews = function(){ return views; };
module.exports.register = registerView;
module.exports.render = renderView;
module.exports.renderSync = renderViewSync;
module.exports.viewDirId; // templateId prefix - is root folder e.g. "views"

/**
 * compiled views register { view_name: view_fnc or Error }
 * @type {Object}
 */
var views = {};

/**
 * Helper for generating template baseProp
 * @param {String} templateId
 * @returns {String}  template baseProp
 */
function templateBaseProp(templateId){
    return templateId.replace(new RegExp('^'+(module.exports.viewDirId +'/').escape(),'g'), '').replace(/^widgets\//,'').replace(/\.html$/,'').replace(/\//g,'_');
}

/*
 * on init, compile all views, and setup watchers to recompile on view change,
 * because generating views will be synchronous, init is executed only once
 * @param {String} dir views directory
 * @param {Object} opts
 * @param {Function} cb callback(err)
 */
function init(dir, opts, cb){ // cb(err)
    if(arguments.length === 2){
        cb = arguments[1];
        opts = {};
    }
    if(typeof cb !== 'function') throw new Error('Wrong arguments');
    
    // create views directory if not exists
    fsExt.existsOrCreateSync(dir);
    
    fsExt.watchRecursive(dir, opts, onFilesChange, function(err, files){
        if(err) cb(new Error('View engine: init failed').cause(err));
        else {
            for(var id in files){
                try {
                    if(files[id].isFile){
                        if(files[id].ext === VIEW_FILE_EXT){
                            views[id] = compileSync(files[id].fullPath, (files[ id + '.' + MAP_FILE_EXT ] || {}).fullPath, id);
                            if(views[id] instanceof Error) throw views[id];
                            
                            // remember if script file exists, or not
                            if(files[ id + '.' + SCRIPT_FILE_EXT ]) views[id].script = files[ id + '.' + SCRIPT_FILE_EXT ].fullPath;
                        }
                    }
                }
                catch(err){
                    return cb(new Error('View engine: init failed template "' +id+ '"').cause(err));
                }
            }
            
            cb();
        }
    });
}

/**
 * register external view that is not in views directory
 * @param {String} viewId
 * @param {String} viewFilePath
 * @param {String} mapFilePath optional
 * @returns {Function}  viewFnc
 */
function registerView(viewId, viewFilePath, mapFilePath){
    viewFilePath = path.resolve(viewFilePath);
    if(mapFilePath) mapFilePath = path.resolve(mapFilePath);
    
    try {
        views[viewId] = compileSync(viewFilePath, mapFilePath, viewId);
    }
    catch(err){
        views[viewId] = new Error('View engine: registerView failed').cause(err);
    }
    return views[viewId];
}

/**
 * executed when files in views directory changed
 * @param {Object} changes changes from fsExt.watchRecursive
 */
function onFilesChange(err, changes){
    if(err) throw err;
    
    for(var i=0;i<changes.length;i++){
        (function(i){
            var file = changes[i].file,
                event = changes[i].event,
                viewId;
                
            if(file.ext === VIEW_FILE_EXT) viewId = file.id;
            else if(file.ext === MAP_FILE_EXT) viewId = file.id.replace(new RegExp('\\.'+MAP_FILE_EXT+'$'),'');
            else if(file.ext === SCRIPT_FILE_EXT) viewId = file.id.replace(new RegExp('\\.'+SCRIPT_FILE_EXT+'$'),'');
            else return;
            
            if(file.isFile){
                // template file or mapping file changed, recompile
                if(file.ext === VIEW_FILE_EXT){
                    if(event === 'removed') delete views[ viewId ];
                    else if(event === 'created' || event === 'updated') {
                        compileAsync(file.fullPath, file.fullPath + '.' + MAP_FILE_EXT, viewId, function(err, viewFnc){
                            if(err) views[ viewId ] = err;
                            else {
                                var script = views[ viewId ].script ? views[ viewId ].script+'' : null; // copy script reference
                                views[ viewId ] = viewFnc;
                                views[ viewId ].script = script;
                            }
                        });
                    }
                }
                else if(file.ext === MAP_FILE_EXT){
                    if((event === 'removed' && views[ viewId ]) || event === 'created' || event === 'updated') {
                        compileAsync(file.fullPath.replace(new RegExp('\\.'+MAP_FILE_EXT+'$'),''), (event !== 'remove' ? file.fullPath : null), viewId, function(err, viewFnc){
                            // if(err) throw err;
                            if(err) views[ viewId ] = err;
                            else {
                                var script = views[ viewId ].script+''; // copy script reference
                                views[ viewId ] = viewFnc;
                                views[ viewId ].script = script;
                            }
                        });
                    }
                }
                else if(file.ext === SCRIPT_FILE_EXT){
                    if(event === 'removed'){
                        try { delete require.cache[ require.resolve(file.fullPath) ]; }catch(err){}
                        if(views[ viewId ]) delete views[ viewId ].script;
                    }
                    if(event === 'updated'){
                        delete require.cache[ require.resolve(file.fullPath) ];
                    }
                    else if(event === 'created') {
                        views[ viewId ].script = file.fullPath;
                    }
                }
            }
        })(i);
    }
}

/**
 * read files and compile view - sync
 * @param {String} viewFilePath full path
 * @param {String} mapFilePath full path
 * @returns {Function}  compiled view fnc
 */
function compileSync(viewFilePath, mapFilePath, templateId){
    var mapping = {}, htmlString;
    if(mapFilePath){
        try { mapping = fs.readFileSync(mapFilePath, { encoding:'utf8' }); }
        catch(err){
            return new Error('View engine compileSync: reading mapping file failed').details({ template:viewFilePath, cause:err });
        }
        
        try { mapping = JSON.parse(mapping || '{}'); }
        catch(err){
            return new Error('View engine compileSync: JSON.parse mapping data failed').details({ template:viewFilePath, cause:err });
        }
        if(Object.prototype.toString.call(mapping) !== '[object Object]')
            return new Error('View engine compileSync: mapping is not object').details({ template:viewFilePath });
    }
    
    try { htmlString = fs.readFileSync(viewFilePath, { encoding:'utf8' }); }
    catch(err){
        return new Error('View engine compileSync: reading template file failed').details({ template:viewFilePath, cause:err });
    }
    
    try {
        var tmpId = templateId.replace(new RegExp('^' + ((module.exports.viewDirId||'')+'/').escape(),'g'), ''); // remove root dir prefix
        mapping.baseProp = mapping.baseProp || templateBaseProp(tmpId);
        return compileHtml(htmlString, mapping, tmpId);
    }
    catch(err){
        return new Error('View engine compileSync: compiling template file failed').details({ template:viewFilePath, cause:err });
    }
}

/**
 * read files and compile view - async
 * @param {String} viewFilePath full path
 * @param {String} mapFilePath full path
 * @param {Object} cb callback (err, viewFnc)
 */
function compileAsync(viewFilePath, mapFilePath, templateId, cb){ // cb(err, viewFnc)
    if(mapFilePath){
        fs.exists(mapFilePath, function(exists){
            if(exists) fsExt.readFile(mapFilePath, { encoding:'utf8' }, function(err, data){
                if(err) cb(new Error('View engine compileAsync: reading mapping file failed').cause(err));
                else {
                    var mapping = {};
                    try {
                        mapping = JSON.parse(data || '{}');
                    }
                    catch(err){
                        return cb(new Error('View engine compileAsync: JSON.parse mapping data failed').details({ template:viewFilePath, cause:err }));
                    }
                    
                    if(Object.prototype.toString.call(mapping) !== '[object Object]')
                        return cb(new Error('View engine compileAsync: mapping is not object').details({ template:viewFilePath }));
                    
                    readViewAndCompile(mapping, cb);
                }
            });
            else readViewAndCompile({}, cb);
        });
    }
    else readViewAndCompile({}, cb);
    
    function readViewAndCompile(mapping, cb){
        fsExt.readFile(viewFilePath, { encoding:'utf8' }, function(err, htmlString){
            if(err) cb(new Error('View engine compileAsync: reading template file failed').details({ template:viewFilePath, cause:err }));
            else {
                try {
                    var tmpId = templateId.replace(new RegExp('^' + ((module.exports.viewDirId||'')+'/').escape(),'g'), ''); // remove root dir prefix
                    mapping.baseProp = mapping.baseProp || templateBaseProp(tmpId);
                    cb(null, compileHtml(htmlString, mapping, tmpId));
                }
                catch(err){
                    cb(new Error('View engine compileAsync: compile template failed').details({ template:viewFilePath, cause:err }));
                }
            }
        });
    }
}

/**
 * check if compiled view is valid function, if not throw error
 * @param {String} viewId
 * @param {Function} viewFnc
 */
function isValidView(viewId, viewFnc){
    if(!viewFnc) throw new Error('View "' +viewId+ '" not found');
    else if(viewFnc instanceof Error) throw new Error('View "' +viewId+ '" compilation failed').cause(viewFnc);
    else if(typeof viewFnc !== 'function') throw new Error('View "' +viewId+ '" is not function');
}

/**
 * render view including partials and layout
 * @param {String} baseDirId
 * @param {String} viewName
 * @param {Object} model
 * @param {String} mode view mode ('admin', ...)
 * @param {Object} containers - optional containers html content to inject into template
 * @param {Function} replaceViewNameFnc - optional viewName modifier
 * @returns {String}  html
 */
function renderView(baseDirId, viewName, model, mode, containers, replaceViewNameFnc){
    if(arguments.length===5 && typeof arguments[4] === 'function'){
        replaceViewNameFnc = arguments[4];
        containers = {};
    }
    
    var viewId = (baseDirId ? baseDirId + '/' : '') + replaceViewName(viewName, replaceViewNameFnc);
    if(!viewId.match(VIEW_FILE_EXT_REGEXP)) viewId += '.' + VIEW_FILE_EXT;
    
    var pageViewFnc = views[ viewId ];
    isValidView(viewId, pageViewFnc); // will throw error if view is not valid
    var result = pageViewFnc(model, mode, '', renderPartials(baseDirId, model, mode, pageViewFnc.partials, containers, replaceViewNameFnc), containers);
    
    if(pageViewFnc.layout){
        var layoutId = (baseDirId ? baseDirId + '/' : '') + replaceViewName(pageViewFnc.layout, replaceViewNameFnc);
        if(!layoutId.match(VIEW_FILE_EXT_REGEXP)) layoutId += '.' + VIEW_FILE_EXT;
        
        var layoutViewFnc = views[ layoutId ];
        isValidView(layoutId, layoutViewFnc); // will throw error if view is not valid
        
        result = layoutViewFnc(model, mode, result, renderPartials(baseDirId, model, mode, layoutViewFnc.partials, containers, replaceViewNameFnc), containers);
    }
    return result;
}


/**
 * helper for replacing name, if replacer function is defined
 * @param {String} viewName
 * @param {Function} replaceViewNameFnc
 * @returns {String}  viewName
 */
function replaceViewName(viewName, replaceViewNameFnc){
    if(replaceViewNameFnc) return replaceViewNameFnc(viewName);
    else return viewName;
}

/**
 * returns rendered partials html strings
 * @param {String} baseDirId
 * @param {Object} model
 * @param {String} mode
 * @param {Array} partials partial ids
 * @param {Function} replaceViewNameFnc - optional viewName modifier
 * @returns {Array}  partials content html
 */
function renderPartials(baseDirId, model, mode, partials, containers, replaceViewNameFnc){
    var result = [];
    if(!partials || partials.length===0) return [];
    else {
        for(var i=0;i<partials.length;i++){
            var viewId = (baseDirId ? baseDirId + '/' : '') + replaceViewName(partials[i].template, replaceViewNameFnc);
            if(!viewId.match(VIEW_FILE_EXT_REGEXP)) viewId += '.' + VIEW_FILE_EXT;
            
            var partialViewFnc = views[ viewId ];
            isValidView(viewId, partialViewFnc); // will throw error if view is not valid
            
            var dynamicKeys = {};
            if(partials[i].id) dynamicKeys[ partialViewFnc.mapping.baseProp || templateBaseProp(partials[i].id) ] = partials[i].id;
            
            result.push(partialViewFnc(model, mode, '', [], containers||{}, partials[i].id, dynamicKeys));
        }
    }
    return result;
}

/**
 * sync compile (if not compiled before) and renders view include partials and layout
 * @param {String} baseDirId
 * @param {String} viewName
 * @param {Object} model
 * @param {String} mode view mode ('admin', ...)
 * @param {Function} replaceViewNameFnc - optional viewName modifier
 * @returns {String}  html
 */
function renderViewSync(baseDirId, viewName, model, mode, containers, replaceViewNameFnc){
    var pageViewFnc = getCompiledSync(baseDirId, viewName, replaceViewNameFnc);
    var result = pageViewFnc(model, mode, '', renderPartialsSync(baseDirId, model, mode, pageViewFnc.partials, containers, replaceViewNameFnc), containers||{});
    
    if(pageViewFnc.layout){
        var layoutViewFnc = getCompiledSync(baseDirId, pageViewFnc.layout, replaceViewNameFnc);
        result = layoutViewFnc(model, mode, result, renderPartialsSync(baseDirId, model, mode, layoutViewFnc.partials, containers, replaceViewNameFnc), containers||{});
        
    }
    return result;
}

/**
 * get compiled view sync
 * @param {String} baseDirId
 * @param {String} viewName
 * @param {Function} replaceViewNameFnc - optional viewName modifier
 * @returns {Function}  pageViewFnc
 */
function getCompiledSync(baseDirId, viewName, replaceViewNameFnc){
    var viewNameMod = replaceViewName(viewName, replaceViewNameFnc);
    var viewId = (baseDirId ? baseDirId + '/' : '') + viewNameMod;
    if(!viewId.match(VIEW_FILE_EXT_REGEXP)) viewId += '.' + VIEW_FILE_EXT;
    
    var pageViewFnc = views[ viewId ];
    if(!pageViewFnc) {
        var viewFilePath = process.cwd() + '/' + viewId;
        var mapFilePath = viewFilePath + '.' + MAP_FILE_EXT;
        if(!fs.existsSync(mapFilePath)) mapFilePath = null;
        pageViewFnc = views[ viewId ] = compileSync(viewFilePath, mapFilePath, viewId);
        isValidView(viewId, pageViewFnc); // will throw error if view is not valid
        return pageViewFnc;
    }
    else {
        isValidView(viewId, pageViewFnc); // will throw error if view is not valid
        return pageViewFnc;
    }
}

/**
 * sync version of renderPartials
 * @param {String} baseDirId
 * @param {Object} model
 * @param {String} mode
 * @param {Array} partials partial ids
 * @param {Function} replaceViewNameFnc - optional viewName modifier
 * @returns {Array}  partials content html
 */
function renderPartialsSync(baseDirId, model, mode, partials, containers, replaceViewNameFnc){
    var result = [];
    if(!partials || partials.length===0) return [];
    else {
        for(var i=0;i<partials.length;i++){
            var partialViewFnc = getCompiledSync(baseDirId, partials[i].template, replaceViewNameFnc)
            
            var dynamicKeys = {};
            if(partials[i].id) dynamicKeys[ partialViewFnc.mapping.baseProp || templateBaseProp(partials[i].id) ] = partials[i].id;
            result.push(partialViewFnc(model, mode, '', [], containers||{}, partials[i].id, dynamicKeys));
        }
    }
    return result;
}