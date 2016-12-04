'use strict';

var fsExt = require('nodee-utils').fsExt,
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
                            '<html ne-template-id="views/layout.html" ne-widget-id="">' +
                                '<head>' +
                                    '<title>test</title>' +
                                '</head>' +
                                '<body>' +
                                '<a href="asd" ne-template-id="views/index.html" ne-widget-id="">text..sdfsdf</a>' +
                                '<div style="width:300px;" ne-template-id="views/index.html" ne-widget-id="">' +
                                    '<span style="display:none;">div1.span1</span>' +
                                '</div>' +
                                '<div style="height:200px;" ne-template-id="views/index.html" ne-widget-id="">' +
                                    '<span style="display:none;">div2.span1</span>' +
                                '</div>' +
                                '<div ne-template-id="views/partials/partial1.html" ne-widget-id="">partial1</div>' +
                                '<div ne-template-id="views/partials/partial2.html" ne-widget-id="">partial2</div>' +
                                '<div ne-container="left" ne-container-widgets="partials/partial1,partials/partial2" ne-template-id="views/index.html" ne-widget-id=""></div>' +
                                '</body>' +
                            '</html>';
        
        var renderedHtml = view.render('views', 'index', {}, {}, 'admin');
        
        // replace line endings and multiple white spaces
        renderedHtml = renderedHtml.replace(/\n/g,'').replace(/\s{2,}/g,'');
        assert.ok(renderedHtml === expectedHtml);
        
        fsExt.unwatchAll();
        console.log('view render - OK');
    });
}