/* global AFRAME THREE */

const L = require('leaflet');
const Tangram = require('tangram');

const Utils = require('./src/utils');

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

const cuid = require('cuid');

const heightmapStyle = require('./src/heightmap-style.yaml');

const TERRAIN_LOADED_EVENT = 'tangram-terrain-loaded';
const REMOVETANGRAM_TIMEOUT = 300;

const DEBUG_CANVAS_OFFSET = 99999;

AFRAME.registerSystem('tangram-terrain', {
  /*schema: {
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
    } 
  },*/
  init: function () {
  },
  createHeightmap: function (data, geomData) {
    const self = this;

    const width = geomData.width * data.pxToWorldRatio + 1;
    const height = geomData.height * data.pxToWorldRatio + 1;


    const _canvasContainerId = cuid();
    const canvasContainer = Utils.getCanvasContainerAssetElement(_canvasContainerId,
      width, height, DEBUG_CANVAS_OFFSET);

    const map = L.map(canvasContainer, Utils.leafletOptions);

    const layer = Tangram.leafletLayer({
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

    const promise = new Promise(function (resolve) {
      layer.scene.subscribe({
        load: function () {
          Utils.processCanvasElement(canvasContainer);
        },
        view_complete: function () {
          //if (self._heightmapCanvas && !data.useBuffer) return;

          let canvas = null;
          if (data.useBuffer) {
            canvas = self._copyCanvas(layer.scene.canvas);
          } else {
            canvas = layer.scene.canvas;
          }

          const depthBuffer = self._createDepthBuffer(canvas);

          //self.el.emit(HEIGHTMAP_LOADED_EVENT);

          if (data.dispose) {
            // removing all ressources layer after a safe timeout
            Utils.delay(REMOVETANGRAM_TIMEOUT, function () {
              layer.remove();
            });
          }

          resolve([canvas, depthBuffer]);
        },
        error: function (e) {
        },
        warning: function (e) {
        }
      });
    });
    layer.addTo(map);

    return {map, promise};
  },
  createMap: function (data, geomData) {
    var self = this;

    const width = geomData.width * data.pxToWorldRatio;
    const height = geomData.height * data.pxToWorldRatio;

    var _canvasContainerId = cuid();
    const canvasContainer = Utils.getCanvasContainerAssetElement(_canvasContainerId,
      width, height, DEBUG_CANVAS_OFFSET + 100);

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

    const promise = new Promise(function (resolve) {
      layer.scene.subscribe({
        load: function () {
          Utils.processCanvasElement(canvasContainer);
        },
        view_complete: function () {
          //if (self._mapCanvas && !data.useBuffer) return;

          let canvas = null;
          if (data.useBuffer) {
            canvas = self._copyCanvas(layer.scene.canvas);
          } else {
            canvas = layer.scene.canvas;
          }

          // finally everything is finished
          //self.el.emit(MAP_LOADED_EVENT);

          if (data.dispose) {
            // removing all ressources layer after a safe timeout
            Utils.delay(REMOVETANGRAM_TIMEOUT, function () {
              layer.remove();
            });
          }

          resolve(canvas);
        },
        error: function (e) {
        },
        warning: function (e) {
        }
      });
    })
    layer.addTo(map);

    return {map, promise};
  },
  _createDepthBuffer: function (canvas) {
    // https://stackoverflow.com/questions/21533757/three-js-use-framebuffer-as-texture
    const imageWidth = canvas.width;
    const imageHeight = canvas.height;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(imageWidth / -2,
              imageWidth / 2,
              imageHeight / 2,
              imageHeight / -2, -1, 1);

    const texture = new THREE.WebGLRenderTarget(imageWidth, imageHeight, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.UnsignedByteType,
      generateMipMaps: false
    });
    //hitTexture.texture.generateMipMaps = false;

    const canvasTexture = new THREE.CanvasTexture(canvas);

    const mesh = new THREE.Mesh(
              new THREE.PlaneBufferGeometry(imageWidth, imageHeight, 1, 1),
              new THREE.MeshBasicMaterial({
                map: canvasTexture
              })
          );
    scene.add(mesh);

    return { scene, camera, mesh, texture, canvasTexture };
  },
  _copyCanvas: function (canvas) {
    const copy = document.createElement('canvas');
    copy.setAttribute('id', cuid());
    copy.setAttribute('width', canvas.width);
    copy.setAttribute('height', canvas.height);
    const ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    return copy;
  },
  copyHeightmapCanvas: function () {
    return this._copyCanvas(this._heightmapCanvas);
  },
  copyMapCanvas: function () {
    return this._copyCanvas(this._mapCanvas);
  },
  project: function (data, geomData, matData, map, depthBuffer, lon, lat) {
    // pixel space from leaflet
    var px = map.latLngToLayerPoint([lat, lon]);

    // convert to world space
    const worldX = (px.x / data.pxToWorldRatio) - (geomData.width / 2);
    // y-coord is inverted (positive up in world space, positive down in pixel space)
    const worldY = -(px.y / data.pxToWorldRatio) + (geomData.height / 2);

    var z = this.hitTest(data, geomData, depthBuffer, px.x, px.y);

    z *= matData.displacementScale;
    z += matData.displacementBias;

    return {
      x: worldX,
      y: worldY,
      z: z
    };
  },
  unproject: function (data, geomData, map, x, y) {

    // Converting world space to pixel space
    const pxX = (x + (geomData.width / 2)) * data.pxToWorldRatio;
    const pxY = ((geomData.height / 2) - y) * data.pxToWorldRatio;

    // Return the lat / long of that pixel on the map
    var latLng = map.layerPointToLatLng([pxX, pxY]);
    return {
      lon: latLng.lng,
      lat: latLng.lat
    };
  },
  // needs pixel space
  hitTest: function (data, geomData, depthBuffer, x, y) {
    if (!depthBuffer.texture) return;
    const pixelBuffer = new Uint8Array(4);

    const width = geomData.width * data.pxToWorldRatio;
    const height = geomData.height * data.pxToWorldRatio;

    // converting pixel space to texture space
    const hitX = Math.round((x) / width * depthBuffer.texture.width);
    const hitY = Math.round((height - y) / height * depthBuffer.texture.height);

    this.el.renderer.readRenderTargetPixels(depthBuffer.texture, hitX, hitY, 1, 1, pixelBuffer);

    return pixelBuffer[0] / 255;
  },
  // TODO
  renderDepthBuffer: function (depthBuffer) {
    depthBuffer.canvasTexture.needsUpdate = true;
    this.el.renderer.render(depthBuffer.scene, depthBuffer.camera, depthBuffer.texture);
  }
});


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
    useBuffer: {
      type: 'boolean',
      default: true
    },
    dispose: {
      type: 'boolean',
      default: true
    }
  },

  multiple: false,

  init: function () {
    const data = this.data;
    const geomData = this.el.components.geometry.data;

    this.depthBuffer = null;
    this.heightmap = this.system.createHeightmap(this.data, geomData);
    this.overlaymap = this.system.createMap(this.data, geomData);
    var self = this;


    this.heightmap.promise.then(function (arr) {
      console.log("HM LOADED")
      const canvas = arr[0];
      const depthBuffer = arr[1];

      const plane = new THREE.PlaneBufferGeometry(
        geomData.width, geomData.height,
        geomData.segmentsWidth, geomData.segmentsHeight);
      const mesh = self.el.getObject3D('mesh');
      mesh.geometry = plane;
      

      self.el.setAttribute('material', 'displacementMap', canvas);

      self.system.renderDepthBuffer(depthBuffer);

      self.depthBuffer = depthBuffer;
      //self.overlaymap.map.setView(Utils.latLonFrom(data.center), data.zoom);
    });


    this.overlaymap.promise.then(function (canvas) {
      console.log("MAP LOADED")

      self.el.setAttribute('material', 'src', canvas);

      self.el.emit(TERRAIN_LOADED_EVENT)
    })
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
      this.heightmap.map.setView(Utils.latLonFrom(this.data.center), this.data.zoom);
      this.overlaymap.map.setView(Utils.latLonFrom(data.center), data.zoom);
    }
  },
  remove: function () {
    var ctx = this._heigthmapCanvas.getContext('2d');
    ctx.clearRect(0, 0, this._heigthmapCanvas.width, this._heigthmapCanvas.height);

    ctx = this._mapCanvas.getContext('2d');
    ctx.clearRect(0, 0, this._mapCanvas.width, this._mapCanvas.height);

    // TODO remove layer
  },
  project: function (lon, lat) {
    const geomData = this.el.components.geometry.data;
    const matData = this.el.components.material.data;

    return this.system.project(this.data, geomData, matData, 
      this.overlaymap.map, 
      this.depthBuffer,
      lon, lat);
  },
  unproject: function (x, y) {
    const geomData = this.el.components.geometry.data;

    return this.system.unproject(this.data, geomData, this.overlaymap.map, x, y);
  },
  _getHeight: function (x, y) {
    const geomData = this.el.components.geometry.data;

    const pxX = (x + (geomData.width / 2)) * this.data.pxToWorldRatio;
    const pxY = ((geomData.height / 2) - y) * this.data.pxToWorldRatio;

    const data = this.data;

    return this.system.hitTest(data, geomData, this.depthBuffer, pxX, pxY);
  },
  unprojectHeight: function (x, y) {
    const matData = this.el.components.material.data;
    return this._getHeight(x, y) * matData.displacementScale + matData.displacementBias;
  },
  unprojectHeightInMeters: function (x, y) {
    return this._getHeight(x, y) * 8900;
  },
  getMapInstance: function () {
    return this.system._mapInstance;
  },
  getHeightmapInstance: function () {
    return this.system._heightmapInstance;
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
    'tangram-terrain': {}
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
