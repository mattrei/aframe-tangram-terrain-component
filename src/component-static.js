/* global AFRAME THREE */

const BufferGeometryUtils = require('./lib/BufferGeometryUtils');
const Utils = require('./utils');

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
    normalMap: {
      type: 'map'
    },
    bounds: {
      type: 'string',
      default: '0, 0, 0, 0',
      parse: function (value) {
        if (typeof value === 'string') {
          return value.split(',').map(f => parseFloat(f));
        } else {
          return value;
        }
      }
    },
    pxToWorldRatio: {
      default: 10
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

    Utils.watchMaterialData(el);
  },

  update: function (oldData) {
    const el = this.el;
    const data = this.data;

    // Nothing changed
    if (AFRAME.utils.deepEqual(oldData, data)) return;
    this.hasLoaded = false;

    if (data.map !== '' && data.normalMap !== '' && (data.map !== oldData.map || data.normalMap !== oldData.normalMap)) {
      Utils.applyMaterial(el, data, data.map, data.normalMap);
      this.system.createDepthBuffer(data.normalMap).then(buffer => {
        this.depthBuffer = buffer;
        this.renderDepthBuffer(this.depthBuffer);
        this.hasLoaded = true;
        this.el.emit(TERRAIN_LOADED_EVENT);
      });
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

    if (lon < data.bounds[0] || lon > data.bounds[2]) return null;
    if (lat < data.bounds[1] || lat > data.bounds[3]) return null;

    const geomData = this.el.components.geometry.data;
    const matData = this.el.components.material.data;

    const deltaLng = data.bounds[2] - data.bounds[0];
    const deltaLat = data.bounds[3] - data.bounds[1];

    const width = geomData.width; //* data.pxToWorldRatio;
    const height = geomData.height;// * data.pxToWorldRatio;

    // convert to world space
    // const worldX = (width / deltaLng * (data.bounds[2] - lon)) - (width / 2);
    const worldX = -(width / deltaLng * (data.bounds[2] - lon)) + (width / 2);

    // y-coord is inverted (positive up in world space, positive down in pixel space)
    const worldY = -(height / deltaLat * (data.bounds[3] - lat)) + (height / 2);

    const px = {
      x: this.depthBuffer.texture.width / deltaLng * (data.bounds[2] - lon),
      y: this.depthBuffer.texture.height / deltaLat * (data.bounds[3] - lat)
    };

    // read alpha value
    let z = this._hitTestPlain(px.x, px.y);

    z *= matData.displacementScale;
    z += matData.displacementBias;

    // console.log(worldX, worldY, z)
    return {
      x: worldX,
      y: worldY,
      z: z
    };
  },
  renderDepthBuffer: function () {
    if (this.depthBuffer) {
      // if we have a depthbuffer and the scene is just updated
      this.system.renderDepthBuffer(this.depthBuffer);
    }
  },

  _hitTest: (function () {
    const pixelBuffer = new Uint8Array(4);// Float32Array(4);

    return function (x, y) {
      const data = this.data;
      const geomData = this.el.components.geometry.data;

      const depthTexture = this.depthBuffer.texture;

      const width = geomData.width * data.pxToWorldRatio;
      const height = geomData.height * data.pxToWorldRatio;

      // converting pixel space to texture space
      const hitX = Math.round((x) / width * depthTexture.width);
      const hitY = Math.round((height - y) / height * depthTexture.height);

      const renderer = this.el.sceneEl.renderer;
      const isVREnabled = renderer.vr.enabled;
      renderer.vr.enabled = false;
      renderer.readRenderTargetPixels(depthTexture, hitX, hitY, 1, 1, pixelBuffer);
      renderer.vr.enabled = isVREnabled;

      // read alpha value
      return pixelBuffer[3] / 255;
    };
  })(),

  _hitTestPlain: (function () {
    const pixelBuffer = new Uint8Array(4);// Float32Array(4);

    return function (x, y) {
      const data = this.data;
      const geomData = this.el.components.geometry.data;
      const pixelBuffer = new Uint8Array(4);

      const depthTexture = this.depthBuffer.texture;

      const hitX = depthTexture.width - x;
      const hitY = depthTexture.height - y;

      const renderer = this.el.sceneEl.renderer;
      const isVREnabled = renderer.vr.enabled;
      renderer.vr.enabled = false;
      renderer.readRenderTargetPixels(depthTexture, hitX, hitY, 1, 1, pixelBuffer);
      renderer.vr.enabled = isVREnabled;

      // read alpha value
      return pixelBuffer[3] / 255;
    };
  })(),

  // TODO
  unproject: function (x, y) {
    const data = this.data;
    const geomData = this.el.components.geometry.data;
    const matData = this.el.components.material.data;

    const deltaLng = data.bounds[2] - data.bounds[0];
    const deltaLat = data.bounds[3] - data.bounds[1];

    const lngRatio = deltaLng / geomData.width;
    const latRatio = deltaLat / geomData.height;
    const px = {
      x: x * lngRatio,
      y: y * latRatio
    };
    return {
      lon: px.x + (deltaLng / 2) + parseFloat(data.bounds[0]),
      lat: px.y + (deltaLat / 2) + parseFloat(data.bounds[1])
    };
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
    return this._getHeight(x, y) * 19900 - 8900;
  }
});
