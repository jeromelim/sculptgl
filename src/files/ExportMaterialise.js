define(function (require, exports, module) {

  'use strict';

  // var TR = require('gui/GuiTR');
  var ExportOBJ = require('files/ExportOBJ');

  var Export = {};

  Export.exportMaterialise = function (main, key, statusWidget) {
    var xhr = new XMLHttpRequest();
    var domStatus = statusWidget.domContainer;
    statusWidget.setVisibility(true);
    statusWidget.materialise = true;
    domStatus.innerHTML = 'Uploading...';
    xhr.open('POST', 'http://i.materialise.com/Upload', true);

    xhr.onprogress = function (event) {
      if (event.lengthComputable)
        domStatus.innerHTML = 'Uploading : ' + Math.round(event.loaded * 100.0 / event.total) + '%';
    };
    var hideStatus = function () {
      statusWidget.setVisibility(false);
      statusWidget.materialise = false;
    };
    xhr.onerror = hideStatus;
    xhr.onabort = hideStatus;

    xhr.onload = function () {
      hideStatus();
    };

    Export.exportFileMaterialise(main, key, xhr, ExportOBJ.exportOBJ(main.getMeshes()));

    // zip.useWebWorkers = true;
    // zip.workerScriptsPath = 'worker/';
    // zip.createWriter(new zip.BlobWriter('application/zip'), function (zipWriter) {
    //   zipWriter.add('yourMesh.ply', new zip.BlobReader(ExportPLY.exportBinaryPLY(main.getMeshes(), true)), function () {
    //     zipWriter.close(Export.exportFileMaterialise.bind(this, main, key, xhr));
    //   });
    // }, onerror);

    return xhr;
  };

  Export.exportFileMaterialise = function (main, key, xhr, blob) {
    var fd = new FormData();
    fd.append('plugin', key);
    fd.append('file', blob, 'sculpt.obj');
    fd.append('materialID', '');
    fd.append('finishID', '');
    fd.append('member_ID', '');

    xhr.setRequestHeader('Accept', 'text/plain, */*; q=0.01');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.send(fd);
  };

  module.exports = Export;
});