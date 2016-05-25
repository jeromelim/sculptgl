define(function (require, exports, module) {

  'use strict';

  var Utils = require('misc/Utils');
  var Subdivision = require('mesh/dynamic/Subdivision');
  var Decimation = require('mesh/dynamic/Decimation');
  var Mesh = require('mesh/Mesh');
  var createMeshData = require('mesh/MeshData');

  // Dynamic topology mesh (triangles only)
  // Obviously less performant than the static topology mesh
  // It "inherits" Mesh but in practice it almost overrides everything related to topology
  //
  // The edges are not computed though (kind of bothersome to update...)
  //
  // The wireframe is directly computed from the triangles (it's as stupid as 1 tri => 3 lines)
  // Basically... "quick and dirty" (the edges will be drawn twice)

  var MeshDynamic = function (mesh) {
    Mesh.call(this);
    this.setID(mesh.getID());

    this._meshData = createMeshData();
    this.setRenderData(mesh.getRenderData());
    this.setTransformData(mesh.getTransformData());

    this._facesStateFlags = null; // state flags (<= Utils.STATE_FLAG) (Int32Array)
    this._wireframe = null; // Uint32Array

    this.init(mesh);

    if (mesh.isUsingTexCoords())
      this.setShaderName('MATCAP');

    this.initRender();
    this.isDynamic = true;
  };

  MeshDynamic.SUBDIVISION_FACTOR = 75; // subdivision factor
  MeshDynamic.DECIMATION_FACTOR = 0; // decimation factor
  MeshDynamic.LINEAR = false; // linear subdivision

  MeshDynamic.prototype = {
    subdivide: function (iTris, center, radius2, detail2, states) {
      return Subdivision.subdivision(this, iTris, center, radius2, detail2, states, MeshDynamic.LINEAR);
    },
    decimate: function (iTris, center, radius2, detail2, states) {
      return Decimation.decimation(this, iTris, center, radius2, detail2, states);
    },
    getSubdivisionFactor: function () {
      return MeshDynamic.SUBDIVISION_FACTOR * 0.01;
    },
    getDecimationFactor: function () {
      return MeshDynamic.DECIMATION_FACTOR * 0.01;
    },
    getVerticesProxy: function () {
      return this.getVertices(); // for now no proxy sculpting for dynamic meshes
    },
    addNbVertice: function (nb) {
      this._meshData._nbVertices += nb;
    },
    getNbTriangles: function () {
      return this.getNbFaces();
    },
    addNbFace: function (nb) {
      this._meshData._nbFaces += nb;
    },
    getNbEdges: function () {
      return this.getNbTriangles() * 3;
    },
    getFacesStateFlags: function () {
      return this._facesStateFlags;
    },
    init: function (mesh) {
      this._meshData._vertRingVert = []; // vertex ring
      this._meshData._vertRingFace = []; // face ring

      var nbVertices = mesh.getNbVertices();

      // make sure to strip UVs
      this.setVertices(new Float32Array(mesh.getVertices().subarray(0, nbVertices * 3)));
      this.setColors(new Float32Array(mesh.getColors().subarray(0, nbVertices * 3)));
      this.setMaterials(new Float32Array(mesh.getMaterials().subarray(0, nbVertices * 3)));

      this.setFaces(new Uint32Array(mesh.getNbTriangles() * 4));
      this.setNbFaces(mesh.getNbTriangles());
      this.setNbVertices(nbVertices);

      this.allocateArrays();

      this.initTriangles(mesh);
      this.initRenderTriangles();
      this.initVerticesTopology();

      this.updateFacesAabbAndNormal();
      this.updateVerticesNormal();
      this.updateOctree();
    },
    updateTopology: function (iFaces) {
      this.updateRenderTriangles(iFaces);
      if (this.getShowWireframe())
        this.updateWireframe(iFaces);
      if (this.isUsingDrawArrays())
        this.updateDrawArrays(iFaces);
    },
    getWireframe: function () {
      if (!this._wireframe) {
        this._wireframe = new Uint32Array(this.getTriangles().length * 2);
        this.updateWireframe();
      }
      return this._wireframe;
    },
    setShowWireframe: function (showWireframe) {
      this._wireframe = null;
      Mesh.prototype.setShowWireframe.call(this, showWireframe);
    },
    updateWireframe: function (iFaces) {
      var wire = this._wireframe;
      var tris = this.getTriangles();
      var full = iFaces === undefined;
      var useDA = this.isUsingDrawArrays();
      var nbTriangles = full ? this.getNbTriangles() : iFaces.length;
      for (var i = 0; i < nbTriangles; ++i) {
        var ind = full ? i : iFaces[i];
        var idw = ind * 6;
        var idt = ind * 3;
        if (useDA) {
          wire[idw] = wire[idw + 5] = idt;
          wire[idw + 1] = wire[idw + 2] = idt + 2;
          wire[idw + 3] = wire[idw + 4] = idt + 1;
        } else {
          wire[idw] = wire[idw + 5] = tris[idt];
          wire[idw + 1] = wire[idw + 2] = tris[idt + 1];
          wire[idw + 3] = wire[idw + 4] = tris[idt + 2];
        }
      }
    },
    updateRenderTriangles: function (iFaces) {
      var tAr = this.getTriangles();
      var fAr = this.getFaces();
      var full = iFaces === undefined;
      var nbFaces = full ? this.getNbFaces() : iFaces.length;
      for (var i = 0; i < nbFaces; ++i) {
        var id = full ? i : iFaces[i];
        var idt = id * 3;
        var idf = id * 4;
        tAr[idt] = fAr[idf];
        tAr[idt + 1] = fAr[idf + 1];
        tAr[idt + 2] = fAr[idf + 2];
      }
    },
    resizeArray: function (orig, targetSize) {
      if (!orig) return null;

      // shrink size
      if (orig.length >= targetSize) return orig.subarray(0, targetSize * 2);

      // expand
      var tmp = new orig.constructor(targetSize * 2);
      tmp.set(orig);

      return tmp;
    },
    /** Reallocate mesh resources */
    reAllocateArrays: function (nbAddElements) {
      var mdata = this._meshData;

      var nbDyna = this._facesStateFlags.length;
      var nbTriangles = this.getNbTriangles();
      var len = nbTriangles + nbAddElements;
      if (nbDyna < len || nbDyna > len * 4) {
        this._facesStateFlags = this.resizeArray(this._facesStateFlags, len);
        if (this.getShowWireframe())
          this._wireframe = this.resizeArray(this._wireframe, len * 6);

        mdata._facesABCD = this.resizeArray(mdata._facesABCD, len * 4);
        mdata._trianglesABC = this.resizeArray(mdata._trianglesABC, len * 3);
        // mdata._faceEdges = this.resizeArray(mdata._faceEdges, len * 4); // TODO used ?
        // mdata._facesToTriangles = this.resizeArray(mdata._facesToTriangles, len); // TODO used ?

        mdata._faceBoxes = this.resizeArray(mdata._faceBoxes, len * 6);
        mdata._faceNormalsXYZ = this.resizeArray(mdata._faceNormalsXYZ, len * 3);
        mdata._faceCentersXYZ = this.resizeArray(mdata._faceCentersXYZ, len * 3);

        mdata._facesTagFlags = this.resizeArray(mdata._facesTagFlags, len);

        mdata._facePosInLeaf = this.resizeArray(mdata._facePosInLeaf, len);
      }

      nbDyna = mdata._verticesXYZ.length / 3;
      var nbVertices = this.getNbVertices();
      len = nbVertices + nbAddElements;
      if (nbDyna < len || nbDyna > len * 4) {
        mdata._verticesXYZ = this.resizeArray(mdata._verticesXYZ, len * 3);
        mdata._normalsXYZ = this.resizeArray(mdata._normalsXYZ, len * 3);
        mdata._colorsRGB = this.resizeArray(mdata._colorsRGB, len * 3);
        mdata._materialsPBR = this.resizeArray(mdata._materialsPBR, len * 3);

        mdata._vertOnEdge = this.resizeArray(mdata._vertOnEdge, len);

        mdata._vertTagFlags = this.resizeArray(mdata._vertTagFlags, len);
        mdata._vertSculptFlags = this.resizeArray(mdata._vertSculptFlags, len);
        mdata._vertStateFlags = this.resizeArray(mdata._vertStateFlags, len);

        // mdata._vertProxy = this.resizeArray(mdata._vertProxy, len * 3);
      }

      if (this.isUsingDrawArrays()) {
        var nbMagic = 10;
        nbDyna = mdata._verticesXYZ.length / 9;
        len = nbTriangles + nbAddElements * nbMagic;
        if (nbDyna < len || nbDyna > len * 4) {
          mdata._verticesXYZ = this.resizeArray(mdata._verticesXYZ, len * 9);
          mdata._normalsXYZ = this.resizeArray(mdata._normalsXYZ, len * 9);
          mdata._colorsRGB = this.resizeArray(mdata._colorsRGB, len * 9);
          mdata._materialsPBR = this.resizeArray(mdata._materialsPBR, len * 9);
        }
      }
    },
    initTriangles: function (mesh) {
      var iArMesh = mesh.getTriangles();
      var nbTriangles = this.getNbTriangles();
      var fAr = this.getFaces();
      this._facesStateFlags = new Int32Array(nbTriangles);
      for (var i = 0; i < nbTriangles; ++i) {
        var id3 = i * 3;
        var id4 = i * 4;
        fAr[id4] = iArMesh[id3];
        fAr[id4 + 1] = iArMesh[id3 + 1];
        fAr[id4 + 2] = iArMesh[id3 + 2];
        fAr[id4 + 3] = Utils.TRI_INDEX;
      }
    },
    initVerticesTopology: function () {
      var vrings = this._meshData._vertRingVert;
      var frings = this._meshData._vertRingFace;
      var i = 0;
      var nbVertices = this.getNbVertices();
      vrings.length = frings.length = nbVertices;
      for (i = 0; i < nbVertices; ++i) {
        vrings[i] = [];
        frings[i] = [];
      }

      var nbTriangles = this.getNbTriangles();
      var iAr = this.getTriangles();
      for (i = 0; i < nbTriangles; ++i) {
        var j = i * 3;
        frings[iAr[j]].push(i);
        frings[iAr[j + 1]].push(i);
        frings[iAr[j + 2]].push(i);
      }

      for (i = 0; i < nbVertices; ++i)
        this.computeRingVertices(i);
    },
    /** Compute the vertices around a vertex */
    computeRingVertices: function (iVert) {
      var tagFlag = ++Utils.TAG_FLAG;
      var fAr = this.getFaces();
      var vflags = this.getVerticesTagFlags();

      var vring = this._meshData._vertRingVert[iVert];
      var fring = this._meshData._vertRingFace[iVert];
      vring.length = 0;
      var nbTris = fring.length;

      for (var i = 0; i < nbTris; ++i) {
        var ind = fring[i] * 4;
        var iVer1 = fAr[ind];
        var iVer2 = fAr[ind + 1];
        var iVer3 = fAr[ind + 2];
        if (iVer1 !== iVert && vflags[iVer1] !== tagFlag) {
          vring.push(iVer1);
          vflags[iVer1] = tagFlag;
        }
        if (iVer2 !== iVert && vflags[iVer2] !== tagFlag) {
          vring.push(iVer2);
          vflags[iVer2] = tagFlag;
        }
        if (iVer3 !== iVert && vflags[iVer3] !== tagFlag) {
          vring.push(iVer3);
          vflags[iVer3] = tagFlag;
        }
      }
    }
  };

  Utils.makeProxy(Mesh, MeshDynamic);

  module.exports = MeshDynamic;
});

