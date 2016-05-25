define(function (require, exports, module) {

  'use strict';

  var getOptionsURL = require('misc/getOptionsURL');
  var Buffer = require('render/Buffer');
  var ShaderMatcap = require('render/shaders/ShaderMatcap');

  var RenderData = function (gl) {
    this._gl = gl;

    var opts = getOptionsURL();
    this._shaderName = opts.shader;
    this._flatShading = opts.flatshading;
    this._showWireframe = opts.wireframe;
    this._matcap = Math.min(opts.matcap, ShaderMatcap.matcaps.length - 1); // matcap id
    this._curvature = Math.min(opts.curvature, 5.0);
    this._texture0 = null;

    this._useDrawArrays = false;
    this._vertexBuffer = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this._normalBuffer = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this._colorBuffer = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this._materialBuffer = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this._texCoordBuffer = new Buffer(gl, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    this._indexBuffer = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    this._wireframeBuffer = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);

    // these material values overrides the vertex attributes
    // it's here for debug or preview
    this._albedo = new Float32Array([-1.0, -1.0, -1.0]);
    this._roughness = -0.18;
    this._metallic = -0.78;
    this._alpha = 1.0;

    this._flatColor = new Float32Array([1.0, 0.0, 0.0]);
    this._mode = gl.TRIANGLES;
  };

  RenderData.ONLY_DRAW_ARRAYS = false;

  module.exports = RenderData;
});

