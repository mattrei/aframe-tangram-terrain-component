/* global AFRAME THREE */

const BufferGeometryUtils = require('./lib/BufferGeometryUtils');
const Utils = require('./utils');

const MeshCustomMaterial = require('./lib/MeshCustomMaterial');

const TERRAIN_LOADED_EVENT = 'tangram-terrain-loaded';


AFRAME.registerComponent('tangram-static-terrain', {
  dependencies: [
    'geometry',
    'material'
  ],

  schema: {
    map: {
      type: 'map'
    },
    normalmap: {
      type: 'map'
    },
    bounds: {
      default: [0, 0, 0, 0],
      type: 'array'
    },
    lod: {
      default: 1
    },
    lodCount: {
      default: 1,
      oneOf: [1, 2, 3, 4]
    },
    vertexNormals: {
      default: true
    }
  },

  multiple: false,

  init: function () {
    const data = this.data;
    const el = this.el;
    this.system = el.sceneEl.systems['tangram-terrain'];

    this.depthBuffer = null;

    this.lods = [];

    const lods = Utils.createGeometryLODs(el, data);
    const mesh = el.getObject3D('mesh');
    mesh.geometry = lods.geometry;
    this.lods = lods.lods;

    Utils.applyMaterial(el, data, data.map, data.normalmap);

    this.system.createDepthBuffer(data.normalmap).then(buffer => {
      this.depthBuffer = buffer;
      this.el.emit(TERRAIN_LOADED_EVENT);
    })

  },
  update: function (oldData) {
    const data = this.data;

    // Nothing changed
    if (AFRAME.utils.deepEqual(oldData, data)) {
      return;
    }

    if (data.lod !== oldData.lod) {
      if (data.lod >= 1 && data.lod <= data.lodCount) {
        this.applyLOD(data.lod);
      }
    }
  },
  applyLOD: function (lod) {
    const el = this.el;
    const data = this.data;
    const matData = this.el.components.material.data;

    let foundLOD = null;
    for (let lodObj of this.lods) {
      if (lodObj.lod === lod) {
        foundLOD = lodObj;
      }
    }

    const mesh = el.getObject3D('mesh');
    mesh.geometry.setDrawRange(foundLOD.geometry.start, foundLOD.geometry.count);
  },
  project: function (lon, lat) {

    const data = this.data;
    const geomData = this.el.components.geometry.data;
    const matData = this.el.components.material.data;

    const deltaLng = data.bounds[0] - data.bounds[2]
    const deltaLat = data.bounds[1] - data.bounds[3]

    const px = {
      x: data.normalmap.width / deltaLng * (data.bounds[0] - lon),
      y: data.normalmap.height / deltaLat * (data.bounds[1] - lat)
    }
    // convert to world space
    const worldX = (geomData.width / deltaLng * (data.bounds[0] - lon)) - (geomData.width / 2);
    // y-coord is inverted (positive up in world space, positive down in pixel space)
    const worldY = -(geomData.height / deltaLat * (data.bounds[1] - lat)) + (geomData.height / 2);

    // read alpha value
    let z = this._hitTest(px.x, px.y);
    z *= matData.displacementScale;
    z += matData.displacementBias;

    return {
      x: worldX,
      y: worldY,
      z: z
    };
  },
  _hitTest: function (x, y) {
    const data = this.data;
    const geomData = this.el.components.geometry.data;
    const pixelBuffer = new Uint8Array(4);

    this.el.sceneEl.renderer.readRenderTargetPixels(this.depthBuffer.texture, x, y, 1, 1, pixelBuffer);

    // read alpha value
    return pixelBuffer[3] / 255;
  },
  unproject: function (x, y) {
    const data = this.data;
    const geomData = this.el.components.geometry.data;

    // Converting world space to pixel space
    const pxX = (x + (geomData.width / 2)) * data.pxToWorldRatio;
    const pxY = ((geomData.height / 2) - y) * data.pxToWorldRatio;

    /*
    // Return the lat / long of that pixel on the map
    var latLng = this.overlaymap.layerPointToLatLng([pxX, pxY]);

    const deltaLng = data.bounds[0] - data.bounds[2]
    const deltaLat = data.bounds[1] - data.bounds[3]


    return {
      lon: latLng.lng,
      lat: latLng.lat
    };
    */
   // TODO
  },
  _getHeight: function (x, y) {
    const geomData = this.el.components.geometry.data;

    const pxX = (x + (geomData.width / 2)) * this.data.pxToWorldRatio;
    const pxY = ((geomData.height / 2) - y) * this.data.pxToWorldRatio;

    return this._hitTest(pxX, pxY);
  },
  unprojectHeight: function (x, y) {
    const matData = this.el.components.material.data;
    return this._getHeight(x, y) * matData.displacementScale + matData.displacementBias;
  },
  unprojectHeightInMeters: function (x, y) {
    return this._getHeight(x, y) * 8900;
  }
})