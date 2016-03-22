'use strict';

var parse = require('../index.js').parse,
    slice = require('../index.js').slice,
    assert = require('assert');

/*
 * run test
 */
testParse();

/*
 * test parse html / xml
 */
function testParse(){
    var html = '<html>'+
                '<a href="asd" json="{}">text...sdfsdf</a>' +
                '<nav>menu html</nav>' +
                '<div style="width:300px;">' +
                    '<span style="display:none;">div1.span1</span>' +
                '</div>' +
                '<div style="height:200px;">' +
                    '<span style="display:none;">div2.span1</span>' +
                '</div>' +
               '</html>';
               
    
    var map = {
    
        'a':{
            html:'link.text',
            attrs:{
                href:'link.href',
                //json:'link.json'
                json:'JSON(link.json)'
            }
        },
        'div':{
            repeat:'divs',
            html:'text',
            attrs:{
                style:{
                    width:'style.w',
                    height:'style.h'
                }
            },
            inside:{
                'span':{ html:'innerspan', repeat:'ispans' }
            }
        },
        'nav':{
            html:'content.{menu}.html'
        }
        
    };
    
    var result = {
        link: {
            text: 'text...sdfsdf',
            href: 'asd',
            json: {}
        },
        divs: [{
            text: '<span style="display:none;">div1.span1</span>',
            style: { w:'300px' },
            ispans: [ { innerspan: 'div1.span1' } ]
        },
        {
            text: '<span style="display:none;">div2.span1</span>',
            style: { h: '200px' },
            ispans: [ { innerspan: 'div2.span1' } ]
        }],
        content:{ menu_1:{ html:'menu html' } }
    };
    
    var dynamicKeys = {
        menu:'menu_1'
    };
    
    parse(html, map, { dynamicKeys:dynamicKeys }, function(err, model){
        assert.deepEqual(result.divs, model.divs);
        console.log('parse - OK');
        testSlice();
    });
}


function testSlice(){
    var html = '<div ne-template-id="layout" ne-container="c1">' +
                '<p>content outside partials</p>'+
                '<div ne-template-id="tmp1" style="width:300px;">' +
                    '<span style="display:none;">div1.span1</span>' +
                '</div>' +
                '<div ne-template-id="tmp2" ne-widget-id="w2" style="height:200px;">' +
                    '<span style="display:none;">div2.span1</span>' +
                '</div>' +
                '<div ne-template-id="tmp3" ne-widget-id="w3">1</div>' +
                '<div ne-template-id="tmp3" ne-widget-id="w3">2</div>' +
               '</div>';
    
    var result = [
        { template: 'layout',
          html: '<div ne-template-id="layout" ne-container="c1"><p>content outside partials</p></div>',
          containerId: 'c1',
          widgetId: '' },
        { template: 'tmp1',
          html: '<div ne-template-id="tmp1" style="width:300px;"><span style="display:none;">div1.span1</span></div>',
          containerId: 'c1',
          widgetId: '' },
        { template: 'tmp2',
          html: '<div ne-template-id="tmp2" ne-widget-id="w2" style="height:200px;"><span style="display:none;">div2.span1</span></div>',
          containerId: 'c1',
          widgetId: 'w2' },
        { template: 'tmp3',
          html: '<div ne-template-id="tmp3" ne-widget-id="w3">1</div><div ne-template-id="tmp3" ne-widget-id="w3">2</div>',
          containerId: 'c1',
          widgetId: 'w3' }
    ];
    
    assert.deepEqual(slice(html), result);
    console.log('slice - OK');
}

