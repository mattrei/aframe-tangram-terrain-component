/* global AFRAME THREE Tangram L */

require('leaflet');

const Utils = require('./src/utils')

/*
const latLonFrom = require('./src/utils').latLonFrom;
const leafletOptions = require('./src/utils').leafletOptions;
const getCanvasContainerAssetElement = require('./src/utils').getCanvasContainerAssetElement;
const processStyle = require('./src/utils').processStyle;
const processCanvasElement = require('./src/utils').processCanvasElement;
*/

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

const cuid = require('cuid');

const heightmapStyle = require('./src/heightmap-style.yaml');

const HEIGHTMAP_LOADED_EVENT = 'heightmap-loaded';

// TODO make configurable?
var tempFactor = 1; // size of heightMapCanvas relative to main canvas: 1/n

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
    scaleFactor: {
      type: 'int',
      default: 1
    },
    center: {
            // lat lon
      default: [0, 0],
      type: 'array'
    },
        /**
            [0] southwest
            [1] northeast
        */
    maxBounds: {
      default: [],
      type: 'array'
    },
    fitBounds: {
      default: [],
      type: 'array'
    },
    zoom: {
      default: 13
    },
    canvasOffsetPx: {
      type: 'int',
      default: 9999 // debug
    },
        // set the highest altitude
    highestAltitudeMeter: {
      type: 'int',
      default: 0
    }
  },

  multiple: false,

  init: function () {
    this._minHeight = 0;
    this._maxHeight = 0;
    this._mapInstance = null;
    this._scene = null;

    this.altitudeAddition = 0;

    this.terrainData = [];

    this._initHeightMap();
  },
  _initHeightMap: function () {
    const self = this;
    var data = this.data;

    const geomComponent = this.el.components.geometry;
    var width = geomComponent.data.segmentsWidth;
    var height = geomComponent.data.segmentsHeight;

    this._canvasContainerId = cuid();
    const canvasContainer = Utils.getCanvasContainerAssetElement(this._canvasContainerId,
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

    var scene = this._scene = layer.scene;

    layer.on('init', function () {
            // resetViewComplete();
      scene.subscribe({
                // will be triggered when tiles are finished loading
                // and also manually by the moveend event
        view_complete: function () {
          self._start_analysis();
        }
      });
    });
    layer.addTo(map);
    this._mapInstance = map;

    if (data.maxBounds.length > 0) this._mapInstance.setMaxBounds(L.latLngBounds(this.data.maxBounds));
    if (data.fitBounds.length > 0) this._mapInstance.fitBounds(L.latLngBounds(this.data.fitBounds));
    this._mapInstance.setView(Utils.latLonFrom(this.data.center), this.data.zoom);
  },
  _start_analysis: function () {
    const geomComponent = this.el.components.geometry;
    var width = geomComponent.data.segmentsWidth;
    var height = geomComponent.data.segmentsHeight;

        // based on https://github.com/tangrams/heightmapper/blob/gh-pages/main.js
    var scene = this._scene;

    var heightMapCanvas = document.createElement('canvas');
    heightMapCanvas.width = width;
    heightMapCanvas.height = height;

    var ctx = heightMapCanvas.getContext('2d');
    ctx.drawImage(scene.canvas, 0, 0, width, height);

        // get all the pixels
    var pixels = ctx.getImageData(0, 0, width, height);

    var val;
    var counts = {};
    var empty = true;
    var max = 0;
    var min = 255;

        // const geomComponent = this.el.components.geometry;
        // only check every 4th pixel (vary with browser size)
        // var stride = Math.round(img.height * img.width / 1000000);
        // 4 = only sample the red value in [R, G, B, A]
    for (var i = 0; i < height * width * 4; i += 4) {
      val = pixels.data[i];
      var alpha = pixels.data[i + 3];
      if (alpha === 0) { // empty pixel, skip to the next one
        continue;
      }
            // if we got this far, we found at least one non-empty pixel!
      empty = false;

            // update counts, to get a histogram
      counts[val] = counts[val] ? counts[val] + 1 : 1;

            // update min and max so far
      min = Math.min(min, val);
      max = Math.max(max, val);

      this.terrainData.push(val);
    }

        // range is 0 to 255 which is 8900 meters according to heightmap-style
    this._minHeight = min;
    this._maxHeight = max;

    var highestMeter = max / 255 * 8900;

    if (this.data.highestAltitudeMeter > 0) {
      this.altitudeAddition = this.data.highestAltitudeMeter - highestMeter;
    }

    if (empty) {
      console.warn('no pixels found');
                // no pixels found, skip the analysis
      return false;
    }

    this._createTerrain();
  },
  _initMap: function (geometry) {
    var self = this;

        // is probably a good thing to remove element
    document.getElementById(this._canvasContainerId).remove();

    const data = this.data;

    const geomComponent = this.el.components.geometry;
    const matComponent = this.el.components.material;

    const width = matComponent.data.width;
    const height = matComponent.data.height;

    var _canvasContainerId = cuid();
    const canvasContainer = getCanvasContainerAssetElement(_canvasContainerId,
            width, height, data.canvasOffsetPx + 999);

    var map = L.map(canvasContainer, leafletOptions);

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
    layer.addTo(map);

    this.geojsonLayer = L.geoJson().addTo(map);

    layer.scene.subscribe({
      load: function () {
        Utils.processCanvasElement(canvasContainer);
      },
      view_complete: function () {
        var mesh = self.el.getOrCreateObject3D('mesh', THREE.Mesh);
        mesh.geometry = geometry;

        const canvasId = document.querySelector(`#${_canvasContainerId} canvas`).id;
        self.el.setAttribute('material', 'src', `#${canvasId}`);

        self.el.emit(HEIGHTMAP_LOADED_EVENT);
      }
    });

    const heightMapBounds = this._mapInstance.getBounds();
    map.fitBounds(heightMapBounds);

    this._mapOverlay = map;
  },
  _createTerrain: function () {
    const {
            width: elWidth,
            height: elHeight,
            segmentsWidth: elSegmentsWidth,
            segmentsHeight: elSegmentsHeight
        } = this.el.components.geometry.data;

    var geometry = new THREE.PlaneBufferGeometry(
            elWidth, elHeight,
            elSegmentsWidth - 1, elSegmentsHeight - 1);
    var vertices = geometry.attributes.position.array;
        // https://stackoverflow.com/questions/37927031/how-to-update-the-topology-of-a-geometry-efficiently-in-threejs
    for (var i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
            // only set z values (note: planes are not standing by default)
      vertices[j + 2] = this._scale(this.terrainData[i] + this.altitudeAddition);
    }
    geometry.computeFaceNormals();
    geometry.computeBoundingBox();

    this._initMap(geometry);
  },
  _scale: function (value) {
    const {
            width: elWidth,
            segmentsWidth: elSegmentsWidth
        } = this.el.components.geometry.data;

    const densityFactor = elWidth / elSegmentsWidth;
    const zoomScaleFactor = this.data.zoom * 0.2; // this._mapInstance.getZoom()

    var height = (value * 0.18) * zoomScaleFactor * densityFactor * this.data.scaleFactor;
    return height ? height - this._minHeight : 0;
  },

  remove: function () {},

  tick: function (delta, time) {},

  project (lon, lat) {
        // The position (origin at top-left corner) in pixel space
    var {
            x: pxX,
            y: pxY
        } = this._mapInstance.latLngToLayerPoint([lat, lon]);

    const {
            width: elWidth,
            height: elHeight
        } = this.el.components.geometry.data;

    const idx = this._scene.canvas.width * pxY + pxX;
            // console.log(idx)
    var z = this._scale(this.terrainData[idx] + this.altitudeAddition);
            // console.log(z)

    pxX /= this._scene.canvas.width;
    pxY /= this._scene.canvas.height;

    pxX *= elWidth;
    pxY *= elHeight;

    return {
      x: pxX - (elWidth / 2),
            // y-coord is inverted (positive up in world space, positive down in
            // pixel space)
      y: -pxY + (elHeight / 2),
      z: z
    };
  },

  unproject (x, y) {
        // The 3D world size of the entity
    const {
            width: elWidth,
            height: elHeight
        } = this.el.components.geometry.data;

    const pxX = (x + (elWidth / 2));
        // y-coord is inverted (positive up in world space, positive down in
        // pixel space)
    const pxY = ((elHeight / 2) - y);

    var nx = pxX / elWidth;
    var ny = pxY / elHeight;

    nx *= this._scene.canvas.width;
    ny *= this._scene.canvas.height;

        // Return the lat / long of that pixel on the map
    var latLng = this._mapInstance.layerPointToLatLng([nx, ny]);
    return {
      lat: latLng.lat,
      lon: latLng.lng
    };
  },
  unprojectAlitude: function (x, y) {
    const idx = this._scene.canvas.width * y + x;
    return this.terrainData[idx] / 255 * 8900 + this.altitudeAddition;
  },
  projectAltitude (lng, lat) {
    const {
            x: givenX,
            y: givenY
        } = this._mapInstance.latLngToLayerPoint([lat, lng]);

    return this.unprojectAlitude(givenX, givenY);
  },
  addGeoJSON (geojson) {
    this.geojsonLayer.addData(geojson);
    console.log('added');
  }
});
