'use strict';

var fsExt = require('enterprise-utils').fsExt,
    view = require('../index.js'),
    assert = require('assert');

/*
 * run test
 */
testView();

/*
 * test vire init and render
 */
function testView(){
    
    // init all views
    view.init('./views', function(err){
        if(err) throw err;
        
        var views = view.getAll();
        
        var viewFnc = views[ 'views/index.html' ];
        assert.ok(viewFnc.isLayout === false);
        assert.ok(viewFnc.layout === 'layout');
        assert.ok(viewFnc.partials.length === 2);
        assert.ok(viewFnc.containers.length === 1);
        assert.deepEqual(viewFnc.mapping, { view:{ baseProp: 'views_index' } });
        assert.ok(!viewFnc.script);
        
        viewFnc = views[ 'views/layout.html' ];
        assert.ok(viewFnc.isLayout === true);
        assert.ok(viewFnc.layout === undefined);
        assert.ok(viewFnc.partials.length === 0);
        assert.ok(viewFnc.containers.length === 0);
        assert.deepEqual(viewFnc.mapping, { view: { baseProp: 'views_layout' } });
        assert.ok(!viewFnc.script);
        
        viewFnc = views[ 'views/partials/partial2.html' ];
        assert.ok(viewFnc.isLayout === false);
        assert.ok(viewFnc.layout === undefined);
        assert.ok(viewFnc.partials.length === 0);
        assert.ok(viewFnc.containers.length === 0);
        assert.deepEqual(viewFnc.mapping, { view: { baseProp: 'views_partials_partial2' } });
        assert.ok(!viewFnc.script);
        
        viewFnc = views[ 'views/partials/partial1.html' ];
        assert.ok(viewFnc.isLayout === false);
        assert.ok(viewFnc.layout === undefined);
        assert.ok(viewFnc.partials.length === 0);
        assert.ok(viewFnc.containers.length === 0);
        assert.deepEqual(viewFnc.mapping, { view: { baseProp: 'views_partials_partial1' } });
        assert.ok(viewFnc.script.indexOf('views/partials/partial1.html.js') > -1);
        
        console.log('view init - OK');
        
        var expectedHtml =  '<!DOCTYPE html>' +
                            '<html e-template-id="views/layout.html" e-widget-id="">' +
                                '<head>' +
                                    '<title>test</title>' +
                                '</head>' +
                                '<body>' +
                                '<a href="asd" e-template-id="views/index.html" e-widget-id="">text..sdfsdf</a>' +
                                '<div style="width:300px;" e-template-id="views/index.html" e-widget-id="">' +
                                    '<span style="display:none;">div1.span1</span>' +
                                '</div>' +
                                '<div style="height:200px;" e-template-id="views/index.html" e-widget-id="">' +
                                    '<span style="display:none;">div2.span1</span>' +
                                '</div>' +
                                '<div e-template-id="views/partials/partial1.html" e-widget-id="">partial1</div>' +
                                '<div e-template-id="views/partials/partial2.html" e-widget-id="">partial2</div>' +
                                '<div e-container="left" e-container-widgets="partials/partial1,partials/partial2" e-template-id="views/index.html" e-widget-id=""></div>' +
                                '</body>' +
                            '</html>';
        
        var renderedHtml = view.render('views', 'index', {}, 'admin');
        
        // replace line endings and multiple white spaces
        renderedHtml = renderedHtml.replace(/\n/g,'').replace(/\s{2,}/g,'');
        
        assert.ok(renderedHtml === expectedHtml);
        
        fsExt.unwatchAll();
        console.log('view render - OK');
    });
}