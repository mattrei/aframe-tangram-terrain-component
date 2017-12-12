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
const TERRAIN_LOADED_EVENT = 'tangram-terrain-loaded';
const REMOVETANGRAM_TIMEOUT = 300;

const DEBUG_CANVAS_OFFSET = 99999;

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
      default: [0, 0],
      type: 'array'
    },
    zoom: {
      default: 13
    },
    pxToWorldRatio: {
      default: 10
    },
    interactive: {
      type: 'boolean',
      default: true
    }
  },

  multiple: false,

  init: function () {
    const data = this.data;

    this._heightmapInstance = null;
    this._mapInstance = null;
    this._heightmapCanvas = null;
    this._mapCanvas = null;

    this._hitCanvasTexture = null;

    this._initHeightMap();
    this._initMap();
    var self = this;
    this.el.addEventListener(HEIGHTMAP_LOADED_EVENT, function (e) {
      self._hitCanvasTexture.needsUpdate = true;
      self.renderDepthBuffer();
      self._mapInstance.setView(Utils.latLonFrom(data.center), data.zoom);
    });
  },
  update: function (oldData) {
    const data = this.data;

    // Nothing changed
    if (AFRAME.utils.deepEqual(oldData, data)) {
      return;
    }

    var setView = false;

    if (data.center !== oldData.center) {
      setView = true;
    }
    if (data.zoom !== oldData.zoom) {
      setView = true;
    }
    if (setView) {
      this._heightmapInstance.setView(Utils.latLonFrom(this.data.center), this.data.zoom);
    }
  },
  _initHeightMap: function () {
    const self = this;
    const data = this.data;

    const geomComponent = this.el.components.geometry;

    const width = geomComponent.data.width * data.pxToWorldRatio + 1;
    const height = geomComponent.data.height * data.pxToWorldRatio + 1;

    const _canvasContainerId = cuid();
    const canvasContainer = Utils.getCanvasContainerAssetElement(_canvasContainerId,
      width, height, DEBUG_CANVAS_OFFSET);

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
        if (self._heightmapCanvas) return;

        var mesh = self.el.getObject3D('mesh');

        if (data.interactive) {
          self._heightmapCanvas = layer.scene.canvas;
        } else {
          const canvas = document.createElement('canvas');
          canvas.setAttribute('id', cuid());
          canvas.setAttribute('width', layer.scene.canvas.width);
          canvas.setAttribute('height', layer.scene.canvas.height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(layer.scene.canvas, 0, 0);
          self._heightmapCanvas = canvas;
        }

        self.el.setAttribute('material', 'displacementMap', self._heightmapCanvas);

        const geomComponent = self.el.components.geometry;
        const width = geomComponent.data.width;
        const height = geomComponent.data.height;

        const plane = new THREE.PlaneBufferGeometry(
          width, height,
          geomComponent.data.segmentsWidth, geomComponent.data.segmentsHeight);
        mesh.geometry = plane;

        self._createDepthBuffer(self._heightmapCanvas);

        self.el.emit(HEIGHTMAP_LOADED_EVENT);

        if (!data.interactive) {
          // removing all ressources layer after a safe timeout
          Utils.delay(REMOVETANGRAM_TIMEOUT, function () {
            layer.remove();
          });
        }
      },
      error: function (e) {
      },
      warning: function (e) {
      }
    });

    layer.addTo(map);

    this._heightmapInstance = map;
  },
  _createDepthBuffer: function (canvas) {
    // https://stackoverflow.com/questions/21533757/three-js-use-framebuffer-as-texture
    const imageWidth = canvas.width;
    const imageHeight = canvas.height;

    this.hitScene = new THREE.Scene();
    this.hitCamera = new THREE.OrthographicCamera(imageWidth / -2,
              imageWidth / 2,
              imageHeight / 2,
              imageHeight / -2, -1, 1);

    this.hitTexture = new THREE.WebGLRenderTarget(imageWidth, imageHeight, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.UnsignedByteType
    });
    this.hitTexture.texture.generateMipMaps = false;

    this._hitCanvasTexture = new THREE.CanvasTexture(canvas);

    const hitMesh = new THREE.Mesh(
              new THREE.PlaneBufferGeometry(imageWidth, imageHeight, 1, 1),
              new THREE.MeshBasicMaterial({
                map: this._hitCanvasTexture
              })
          );
    this.hitScene.add(hitMesh);
  },
  _initMap: function () {
    var self = this;

    const data = this.data;

    const geomComponent = this.el.components.geometry;

    const width = geomComponent.data.width * this.data.pxToWorldRatio;
    const height = geomComponent.data.height * this.data.pxToWorldRatio;

    var _canvasContainerId = cuid();
    const canvasContainer = Utils.getCanvasContainerAssetElement(_canvasContainerId,
      width, height, DEBUG_CANVAS_OFFSET);

    var map = L.map(canvasContainer, Utils.leafletOptions);

    var layer = Tangram.leafletLayer({
      scene: {
        import: data.style,
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
        if (self._mapCanvas) return;

        if (data.interactive) {
          self._mapCanvas = layer.scene.canvas;
        } else {
          // copy canvas contents to new canvas so that we can remove Tangram instance later
          const canvas = document.createElement('canvas');
          canvas.setAttribute('id', cuid());
          canvas.setAttribute('width', layer.scene.canvas.width);
          canvas.setAttribute('height', layer.scene.canvas.height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(layer.scene.canvas, 0, 0);
          self._mapCanvas = canvas;
        }

        self.el.setAttribute('material', 'src', self._mapCanvas);
//        self.el.setAttribute('material', 'displacementMap', self._heightmapCanvas);

        // finally everything is finished
        self.el.emit(TERRAIN_LOADED_EVENT);

        if (!data.interactive) {
          // removing all ressources layer after a safe timeout
          Utils.delay(REMOVETANGRAM_TIMEOUT, function () {
            layer.remove();
          });
        }
      },
      error: function (e) {
      },
      warning: function (e) {
      }
    });
    layer.addTo(map);

    this._mapInstance = map;
  },
  remove: function () {
    var ctx = this._heigthmapCanvas.getContext('2d');
    ctx.clearRect(0, 0, this._heigthmapCanvas.width, this._heigthmapCanvas.height);

    ctx = this._mapCanvas.getContext('2d');
    ctx.clearRect(0, 0, this._mapCanvas.width, this._mapCanvas.height);
  },

  tick: function (delta, time) { },

  project: function (lon, lat) {
    const data = this.data;
    const el = this.el;

    // pixel space from leaflet
    var px = this._mapInstance.latLngToLayerPoint([lat, lon]);

    const geometry = el.components.geometry.data;

    // convert to world space
    const worldX = (px.x / data.pxToWorldRatio) - (geometry.width / 2);
    // y-coord is inverted (positive up in world space, positive down in pixel space)
    const worldY = -(px.y / data.pxToWorldRatio) + (geometry.height / 2);

    // console.log('LEAFLET: ' + px.x + ' ' + px.y);
    // console.log('WORLD: ' + worldX + ' ' + worldY);
    var z = this._hitTest(px.x, px.y);

    z *= el.components.material.data.displacementScale;
    z += el.components.material.data.displacementBias;

    return {
      x: worldX,
      y: worldY,
      z: z
    };
  },
  unproject: function (x, y) {
    const geomData = this.el.components.geometry.data;

    // Converting world space to pixel space
    const pxX = (x + (geomData.width / 2)) * this.data.pxToWorldRatio;
    const pxY = ((geomData.height / 2) - y) * this.data.pxToWorldRatio;

    // Return the lat / long of that pixel on the map
    var latLng = this._mapInstance.layerPointToLatLng([pxX, pxY]);
    return {
      lon: latLng.lng,
      lat: latLng.lat
    };
  },
  // needs pixel space
  _hitTest: function (x, y) {
    if (!this.hitTexture) return;
    const pixelBuffer = new Uint8Array(4);

    const renderer = this.el.sceneEl.renderer;

    const geomData = this.el.components.geometry.data;
    const width = geomData.width * this.data.pxToWorldRatio;
    const height = geomData.height * this.data.pxToWorldRatio;

    // converting pixel space to texture space
    const hitX = Math.round((x) / width * this.hitTexture.width);
    const hitY = Math.round((height - y) / height * this.hitTexture.height);

    renderer.readRenderTargetPixels(this.hitTexture, hitX, hitY, 1, 1, pixelBuffer);
    // console.log('HIT ' + hitX + ' / ' + hitY + ' : ' + pixelBuffer[0] / 255);

    return pixelBuffer[0] / 255;
  },
  _getHeight: function (x, y) {
    const geomData = this.el.components.geometry.data;

    // console.log(x + ' ' +y)
        // Converting world space to pixel space
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
  },

  getMapInstance: function () {
    return this._mapInstance;
  },
  getHeightmapInstance: function () {
    return this._heightmapInstance;
  },
  renderDepthBuffer: function () {
    this._hitCanvasTexture.needsUpdate = true;
    this.el.sceneEl.renderer.render(this.hitScene, this.hitCamera, this.hitTexture);
  }
});

AFRAME.registerPrimitive('a-tangram-terrain', {
  // Defaults the terrain to be parallel to the ground.
  defaultComponents: {
    geometry: {
      primitive: 'plane',
      segmentsWidth: 50,
      segmentsHeight: 50
    },
    material: {
      wireframe: false,
      displacementScale: 30
    },
    rotation: { x: -90, y: 0, z: 0 },
    'tangram-terrain': {},
  },
  mappings: {
    'api-key': 'tangram-terrain.mapzenAPIKey',
    width: 'geometry.width',
    depth: 'geometry.height',
    'grid-width': 'geometry.segmentsWidth',
    'grid-depth': 'geometry.segmentsHeight',
    center: 'tangram-terrain.center',
    'map-style': 'tangram-terrain.style',
    zoom: 'tangram-terrain.zoom',
    'px-world-ratio': 'tangram-terrain.pxToWorldRatio',
    'height-scale': 'material.displacementScale',
    wireframe: 'material.wireframe'
  }
});
