'use strict';

var compileHtml = require('../index.js').compile,
    assert = require('assert');

/*
 * run test
 */
testCompile();

/*
 * test compile html
 */
function testCompile(){
    var simpleHtml =    '<html><a href="asd">@{text..sdfsdf}</a>' +
                            '<div style="width:300px;">' +
                                '<span style="display:none;">@{div1.span1}</span>' +
                            '</div>' +
                            '<div style="height:200px;">' +
                                '<span style="display:none;">@{div2.span1}</span>' +
                            '</div>' +
                        '</html>';
                
    var html = '<layout template="test_layout">' +
                    '<a show-if-mode="admin" href="asd">@{text..sdfsdf}</a>' +
                    '<div style="width:300px;">' +
                        '<span style="display:none;">div1.span1</span>' +
                    '</div>' +
                    '<div style="height:200px;">' +
                        '<span style="display:none;">div2.span1</span>' +
                    '</div>' +
                    '<nav e-container="left" e-container-widgets="widgets/w1, widgets/w2"></nav>' + // widgets container "left"
                    '<nav e-container="center"></nav>' + // widgets container "right"
                    '<widget id="w1" template="widgets/w1"></widget>' + // static widget behave same as partial
                    '<partial template="partials/p1"></partial>' + // partial act as widget
                    '<render-body></render-body>' +
                '</layout>';
    
    var mapping = {
        'a':{
            html:'link.text',
            attrs:{
                href:'link.href',
                data:'JSON(link.{data_replace})'
            }
        },
        'div':{
            repeat:'divs',
            html:'text',
            attrs:{
                'class':{
                    'suffix(-block)':'blockNameSuffix',
                    'prefix(block-)':'blockNamePrefix',
                    'hidden':'isHidden'
                },
                style:{
                    width:'style.w',
                    height:'style.h'
                }
            },
            inside:{
                'span':{
                    repeat:'ispans',
                    html:'innerspan',
                    attrs:{
                        'class':'classes'
                    }
                }
            }
        }
    };
    
    var dynamicKeys = {
        data_replace:'data'
    };
    
    var model = {
        link:{
            text:'this is test anchor',
            href:'http://test',
            data:{ test:'test' }
        },
        divs:[
            {
                text:'this is test div-1',
                blockNamePrefix: 'test-1',
                blockNameSuffix: 'test-1',
                isHidden:true,
                style:{
                    w:'100px',
                    h:'100px'
                },
                insiders:[
                    { text:'this is insider 1-1', classes:'insiders-1-1' },
                    { text:'this is insider 1-2', classes:'insiders-1-2' }
                ]
            },
            {
                text:'this is test div-2',
                blockNamePrefix: 'test-2',
                blockNameSuffix: 'test-2',
                style:{
                    w:'200px',
                    h:'200px'
                },
                insiders:[
                    { text:'this is insider 2-1', classes:'insiders-2-1' },
                    { text:'this is insider 2-2', classes:'insiders-2-2' }
                ]
            }
        ]
    };
    
    var simpleCompiled = compileHtml(simpleHtml, {});
    
    // compare extracted view dependencies
    assert.ok(simpleCompiled.isLayout === false);
    assert.ok(simpleCompiled.layout === undefined);
    assert.deepEqual(simpleCompiled.partials, []);
    
    var compiled = compileHtml(html, mapping);
    
    // compare extracted view dependencies
    assert.ok(compiled.isLayout === true);
    assert.ok(compiled.layout === 'test_layout');
    assert.deepEqual(compiled.partials, [ { template:'widgets/w1', id:'w1' }, { template:'partials/p1', id:'' } ]);
    assert.deepEqual(compiled.containers, [ { id: 'left', widgets: [ 'widgets/w1', 'widgets/w2' ] },
                                            { id: 'center', widgets: [] } ]);
    
    assert.deepEqual(compiled.locals, { 'text..sdfsdf': 'text..sdfsdf' });
    
    // test if function generates html properly
    // function (model, mode, body, partials){ ... }
    
    var body = '<div>body content</div>';
    var partials = [
        '<div>widget 1</div>',
        '<div>partial 1</div>'
    ];
    var containers = {
        'left': '<div>container left - w1</div>'+
                '<div>container left - w2</div>',
        'center':'<div>container center - w1</div>'
    };
    
    var expectedResult =    '<a href="http://test" data="{&quot;test&quot;:&quot;test&quot;}" e-template-id="" e-widget-id="">this is test anchor</a>'+
                            '<div style="width: 100px; height: 100px;" class=" test-1-block block-test-1 hidden">this is test div-1</div>'+
                            '<div style="width: 200px; height: 200px;" class=" test-2-block block-test-2">this is test div-2</div>'+
                            '<nav e-container="left" e-container-widgets="widgets/w1,widgets/w2" e-template-id="" e-widget-id="">'+
                                '<div>container left - w1</div>'+
                                '<div>container left - w2</div>'+
                            '</nav>'+
                            '<nav e-container="center" e-container-widgets="" e-template-id="" e-widget-id="">'+
                                '<div>container center - w1</div>'+
                            '</nav>'+
                            '<div>widget 1</div>'+
                            '<div>partial 1</div>'+
                            '<div>body content</div>';
    
    assert.equal(compiled(model, 'admin', body, partials, containers, '', dynamicKeys), expectedResult);
    
    console.log('compile html - OK');
}