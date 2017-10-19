/* global AFRAME THREE */

const L = require('leaflet');
const Tangram = require('tangram');

const Utils = require('./src/utils');

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

const cuid = require('cuid');

const heightmapStyle = require('./src/heightmap-style.yaml');

const HEIGHTMAP_LOADED_EVENT = 'heightmap-loaded';
const MODEL_LOADED_EVENT = 'model-loaded';
const REMOVETANGRAM_TIMEOUT = 300;

AFRAME.registerComponent('tangram-terrain', {
  dependencies: [
    'geometry',
    'material'
  ],

  schema: {
    mapzenAPIKey: {
      default: ''
    },
    style: {
      type: 'asset',
      default: ''
    },
    center: {
      // lat lon
      default: [0, 0],
      type: 'array'
    },
    zoom: {
      default: 13
    },
    pxToWorldRatio: {
      default: 10
    },
    canvasOffsetPx: {
      type: 'int',
      default: 99999 // debug
    }
  },

  multiple: false,

  init: function () {
    this._mapInstance = null;
    this._heightmapCanvas = null;
    this._overlayCanvas = null;

    this._initHeightMap();
    var self = this;
    this.el.addEventListener(HEIGHTMAP_LOADED_EVENT, function (e) {
      self._initMap();
    });
  },
  update: function (data, oldData) {
  },
  _initHeightMap: function () {
    const self = this;
    var data = this.data;

    const geomComponent = this.el.components.geometry;

    const width = geomComponent.data.width * data.pxToWorldRatio + 1;
    const height = geomComponent.data.height * data.pxToWorldRatio + 1;

    const _canvasContainerId = cuid();
    const canvasContainer = Utils.getCanvasContainerAssetElement(_canvasContainerId,
      width, height, data.canvasOffsetPx);

    var map = L.map(canvasContainer, Utils.leafletOptions);

    var layer = Tangram.leafletLayer({
      scene: {
        import: heightmapStyle,
        global: {
          sdk_mapzen_api_key: data.mapzenAPIKey
        }
      },
      webGLContextOptions: {
        preserveDrawingBuffer: true
      },
      attribution: ''
    });

    layer.scene.subscribe({
      load: function () {
        Utils.processCanvasElement(canvasContainer);
      },
      view_complete: function () {
        var mesh = self.el.getObject3D('mesh');

        const canvas = document.createElement('canvas');
        canvas.setAttribute('id', cuid());
        canvas.setAttribute('width', layer.scene.canvas.width);
        canvas.setAttribute('height', layer.scene.canvas.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(layer.scene.canvas, 0, 0);

        self._heightmapCanvas = canvas;

        self.el.setAttribute('material', 'displacementMap', canvas);

        const geometry = self.el.components.geometry.data;

        const plane = new THREE.PlaneBufferGeometry(
          geometry.width, geometry.height,
          geometry.segmentsWidth - 1, geometry.segmentsHeight - 1);
        mesh.geometry = plane;

        self.el.emit(HEIGHTMAP_LOADED_EVENT);
        // removing all ressources layer after a safe timeout
        Utils.delay(REMOVETANGRAM_TIMEOUT, function() {
          layer.remove()
        });
      },
      error: function (e) {
        console.log('scene error:', e);
      },
      warning: function (e) {
        console.log('scene warning:', e);
      }
    });

    layer.addTo(map);

    map.setView(Utils.latLonFrom(this.data.center), this.data.zoom);
    this._mapInstance = map;
  },
  /*
  _start_analysis: function (canvas) {
    var width = canvas.width;
    var height = canvas.height;

    // based on https://github.com/tangrams/heightmapper/blob/gh-pages/main.js

    var ctx = canvas.getContext('2d');
    // ctx.drawImage(scene.canvas, 0, 0, width, height);

    // get all the pixels
    var pixels = ctx.getImageData(0, 0, width, height);

    var val;
    var counts = {};
    var max = 0;
    var min = 255;

    var left = [];
    var right = [];

    for (var i = 0; i < height * width * 4; i += 4) {
      val = pixels.data[i];
      var alpha = pixels.data[i + 3];
      if (alpha === 0) { // empty pixel, skip to the next one
        continue;
      }

      // update counts, to get a histogram
      counts[val] = counts[val] ? counts[val] + 1 : 1;

      // update min and max so far
      min = Math.min(min, val);
      max = Math.max(max, val);

      this.terrainData.push(val);

      if (i % (width * 4) === 0) {
        left.push(val);
      }
      if (i % (width * 4) === ((width - 1) * 4)) {
        right.push(val);
      }
    }
    console.log(left);
    console.log(right);

    // range is 0 to 255 which is 8900 meters according to heightmap-style
    this._minHeight = min;
    this._maxHeight = max;

    console.log('Min / Max ' + this._minHeight + ' ' + this._maxHeight);

    var highestMeter = max / 255 * 8900;

    if (this.data.highestAltitudeMeter > 0) {
      this.altitudeAddition = this.data.highestAltitudeMeter - highestMeter;
    }
  },
  */
  _initMap: function () {
    var self = this;

    const data = this.data;

    const geomComponent = this.el.components.geometry;

    const width = geomComponent.data.width * this.data.pxToWorldRatio;
    const height = geomComponent.data.height * this.data.pxToWorldRatio;

    var _canvasContainerId = cuid();
    const canvasContainer = Utils.getCanvasContainerAssetElement(_canvasContainerId,
      width, height, data.canvasOffsetPx + 999);

    var map = L.map(canvasContainer, Utils.leafletOptions);

    const sceneStyle = Utils.processStyle(data.style);

    var layer = Tangram.leafletLayer({
      scene: {
        import: sceneStyle,
        global: {
          sdk_mapzen_api_key: data.mapzenAPIKey
        }
      },
      webGLContextOptions: {
        preserveDrawingBuffer: true
      },
      attribution: ''
    });

    layer.scene.subscribe({
      load: function () {
        Utils.processCanvasElement(canvasContainer);
      },
      view_complete: function () {
        // copy canvas contents to new canvas so that we can remove Tangram instance later
        const canvas = document.createElement('canvas');
        canvas.setAttribute('id', cuid());
        canvas.setAttribute('width', layer.scene.canvas.width);
        canvas.setAttribute('height', layer.scene.canvas.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(layer.scene.canvas, 0, 0);

        self._overlayCanvas = canvas;

        self.el.setAttribute('material', 'src', canvas);

        // finally everything is finished
        self.el.emit(MODEL_LOADED_EVENT);

        // removing all ressources layer after a safe timeout
        Utils.delay(REMOVETANGRAM_TIMEOUT, function() {
          layer.remove()
        });
      },
      error: function (e) {
        console.log('scene error:', e);
      },
      warning: function (e) {
        console.log('scene warning:', e);
      }
    });
    layer.addTo(map);

    this._mapInstance = map;

    this._mapInstance.setView(Utils.latLonFrom(this.data.center), this.data.zoom);
  },
  remove: function () {
    var ctx = this._heigthmapCanvas.getContext('2d');
    ctx.clearRect(0, 0, this._heigthmapCanvas.width, this._heigthmapCanvas.height);

    ctx = this._overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, this._overlayCanvas.width, this._overlayCanvas.height);
  },

  tick: function (delta, time) { },

  project: function (lon, lat) {
    const data = this.data;
    const el = this.el;

    var px = this._mapInstance.latLngToLayerPoint([lat, lon]);

    const geometry = el.components.geometry.data;

    var width = this._heightmapCanvas.width;
    var height = this._heightmapCanvas.height;
    var ctx = this._heightmapCanvas.getContext('2d');
    var pixels = ctx.getImageData(0, 0, width, height);

    const _x = (width - 1) / (geometry.width * data.pxToWorldRatio) * px.x;
    const _y = (height - 1) / (geometry.height * data.pxToWorldRatio) * px.y;

    const idx = Math.round(width * _y + _x);
    var z = pixels.data[idx * 4] / 255;

    z *= el.components.material.data.displacementScale;
    // add the bias
    z += el.components.material.data.displacementBias;

    return {
      x: (px.x / data.pxToWorldRatio) - (geometry.width / 2),
      // y-coord is inverted (positive up in world space, positive down in
      // pixel space)
      y: -(px.y / data.pxToWorldRatio) + (geometry.height / 2),
      z: z
    };
  },
  unproject: function (x, y) {
    const el = this.el.components.geometry.data;

    // Converting back to pixel space
    const pxX = (x + (el.width / 2)) * this.data.pxToWorldRatio;
    // y-coord is inverted (positive up in world space, positive down in
    // pixel space)
    const pxY = ((el.height / 2) - y) * this.data.pxToWorldRatio;

    // Return the lat / long of that pixel on the map
    var latLng = this._mapInstance.layerPointToLatLng([pxX, pxY]);
    return {
      lon: latLng.lng,
      lat: latLng.lat
    };
  },
  unprojectAlitude: function (x, y) {
    const idx = this.canvasWidth * y + x;
    return this.terrainData[idx] / 255 * 8900 + this.altitudeAddition;
  },
  projectAltitude: function (lng, lat) {
    const px = this._mapInstance.latLngToLayerPoint([lat, lng]);
    return this.unprojectAlitude(px.x, px.y);
  },

  getLeafletInstance: function () {
    return this._mapInstance;
  }
});

AFRAME.registerPrimitive('a-tangram-terrain', {
  // Defaults the terrain to be parallel to the ground.
  defaultComponents: {
    'tangram-terrain': {},
    rotation: { x: -90, y: 0, z: 0 },
    geometry: {
      primitive: 'plane',
      segmentsWidth: 50,
      segmentsHeight: 50
    },
    material: {
      wireframe: false,
      displacementScale: 30
    }

  },
  mappings: {
    key: 'tangram-terrain.mapzenAPIKey',
    width: 'geometry.width',
    depth: 'geometry.height',
    gridwidth: 'geometry.segmentsWidth',
    griddepth: 'geometry.segmentsHeight',
    center: 'tangram-terrain.center',
    style: 'tangram-terrain.style',
    zoom: 'tangram-terrain.zoom',
    ratio: 'tangram-terrain.pxToWorldRatio',
    height: 'material.displacementScale',
    wireframe: 'material.wireframe'
  }
});

// the displacement map scaling does not work. Why I do not know...
