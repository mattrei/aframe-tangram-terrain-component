/* global AFRAME THREE */

const L = require('leaflet');
const Tangram = require('tangram');

const Utils = require('./src/utils');

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

const PRESERVE_DRAWING_BUFFER = AFRAME.utils.device.isMobile();

const cuid = require('cuid');

const heightmapStyle = require('./src/heightmap-style.yaml');

const OVERLAYMAP_LOADED = 'overlaymap-loaded';
const HEIGHTMAP_LOADED = 'heightmap-loaded';
const TERRAIN_LOADED_EVENT = 'tangram-terrain-loaded';
const REMOVETANGRAM_TIMEOUT = 300;

const DEBUG_CANVAS_OFFSET = 99999;

AFRAME.registerSystem('tangram-terrain', {
  init: function () {},
  createHeightmap: function (data, geomData) {
    const self = this;

    const width = geomData.width * data.pxToWorldRatio + 1; // +1 is really needed here for the displacment map
    const height = geomData.height * data.pxToWorldRatio + 1;

    const _canvasContainerId = cuid();
    const canvasContainer = Utils.getCanvasContainerAssetElement(_canvasContainerId,
      width, height, DEBUG_CANVAS_OFFSET);

    const map = L.map(canvasContainer, Utils.leafletOptions);

    const layer = Tangram.leafletLayer({
      scene: {
        import: heightmapStyle
      },
      webGLContextOptions: {
        preserveDrawingBuffer: PRESERVE_DRAWING_BUFFER
      },
      highDensityDisplay: false,
      disableRenderLoop: false,
      attribution: ''
    });

    const promise = new Promise(function (resolve, reject) {
      layer.scene.subscribe({
        load: function () {
          Utils.processCanvasElement(canvasContainer);
        },
        view_complete: function () {
          const canvas = layer.scene.canvas;

          const depthBuffer = data.depthBuffer ? self._createDepthBuffer(canvas) : undefined;
          self.el.emit(HEIGHTMAP_LOADED, {
            canvas: canvas,
            depthBuffer: depthBuffer
          });
          resolve([canvas, depthBuffer]);
        },
        error: function (e) {
          reject(e);
        },
        warning: function (e) {
          reject(e);
        }
      });
    });
    layer.addTo(map);

    return {
      map: map,
      layer: layer,
      promise: promise
    };
  },
  createMap: function (data, geomData) {
    var self = this;

    const width = geomData.width * data.pxToWorldRatio;
    const height = geomData.height * data.pxToWorldRatio;

    const _canvasContainerId = cuid();
    const canvasContainer = Utils.getCanvasContainerAssetElement(_canvasContainerId,
      width, height, DEBUG_CANVAS_OFFSET + 100);

    const map = L.map(canvasContainer, Utils.leafletOptions);

    const layer = Tangram.leafletLayer({
      scene: {
        import: data.style,
        global: {
          sdk_mapzen_api_key: data.apiKey
          // language
        }
      },
      highDensityDisplay: false,
      disableRenderLoop: true,
      webGLContextOptions: {
        preserveDrawingBuffer: PRESERVE_DRAWING_BUFFER
      },
      attribution: ''
    });

    const promise = new Promise(function (resolve, reject) {
      layer.scene.subscribe({
        load: function () {
          Utils.processCanvasElement(canvasContainer);
        },
        pre_update: function () {},
        view_complete: function () {
          const canvas = layer.scene.canvas;
          console.log("VIEW_COMPLETE", canvas.width)
          self.el.emit(OVERLAYMAP_LOADED, {
            canvas: canvas
          });
          resolve(canvas);
        },
        error: function (e) {
          reject(e);
        },
        warning: function (e) {
          reject(e);
        }
      });
    });
    layer.addTo(map);

    return {
      map: map,
      layer: layer,
      canvasContainer: canvasContainer,
      promise: promise
    };
  },
  _createDepthBuffer: function (canvas) {
    // https://stackoverflow.com/questions/21533757/three-js-use-framebuffer-as-texture
    const imageWidth = canvas.width;
    const imageHeight = canvas.height;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      imageWidth / -2,
      imageWidth / 2,
      imageHeight / 2,
      imageHeight / -2, -1, 1);

    const texture = new THREE.WebGLRenderTarget(imageWidth, imageHeight, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.UnsignedByteType
    });

    const canvasTexture = new THREE.CanvasTexture(canvas);
    //canvasTexture.generateMipmaps = false;

    canvas.width = imageWidth;
    canvas.height = imageHeight;

    const mesh = new THREE.Mesh(
      new THREE.PlaneBufferGeometry(imageWidth, imageHeight, 1, 1),
      new THREE.MeshBasicMaterial({
        map: canvasTexture
      })
    );
    scene.add(mesh);

    return {
      scene: scene,
      camera: camera,
      mesh: mesh,
      texture: texture,
      canvasTexture: canvasTexture
    };
  },
  copyCanvas: function (canvas) {
    const copy = document.createElement('canvas');
    copy.setAttribute('id', cuid());
    copy.setAttribute('width', canvas.width);
    copy.setAttribute('height', canvas.height);
    const ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    return copy;
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
    if (!depthBuffer) return 0;

    const pixelBuffer = new Uint8Array(4);

    const width = geomData.width * data.pxToWorldRatio;
    const height = geomData.height * data.pxToWorldRatio;

    // converting pixel space to texture space
    const hitX = Math.round((x) / width * depthBuffer.texture.width);
    const hitY = Math.round((height - y) / height * depthBuffer.texture.height);

    this.el.renderer.readRenderTargetPixels(depthBuffer.texture, hitX, hitY, 1, 1, pixelBuffer);

    return pixelBuffer[0] / 255;
  },
  renderDepthBuffer: function (depthBuffer) {
    //depthBuffer.canvasTexture.needsUpdate = true;
    this.el.renderer.render(depthBuffer.scene, depthBuffer.camera, depthBuffer.texture);
  },
  dispose: function (obj) {
    // removing all ressources layer after a safe timeout
    Utils.delay(REMOVETANGRAM_TIMEOUT, function () {
      obj.layer.remove();
    });
  }
});

AFRAME.registerComponent('tangram-terrain', {
  dependencies: [
    'geometry',
    'material'
  ],

  schema: {
    apiKey: {
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
    depthBuffer: {
      default: false
    },
    useBuffer: {
      type: 'boolean',
      default: true
    },
    dispose: {
      type: 'boolean',
      default: false
    },
    lod: {
      default: 1
    }
  },

  multiple: false,

  init: function () {
    const data = this.data;
    const geomData = this.el.components.geometry.data;

    //console.log("GEOM ", this.el.components.geometry.geometry)

    this.depthBuffer = null;
    this.heightmap = this.system.createHeightmap(data, geomData);
    this.heightmapDisposed = false;
    this.overlaymap = this.system.createMap(data, geomData);
    this.overlaymapDisposed = false;

    var self = this;

    this.heightmap.promise.then(function (arr) {
      const canvas = data.useBuffer ? self.system.copyCanvas(arr[0]) : arr[0];

      self.el.setAttribute('material', 'displacementMap', canvas);

      if (data.depthBuffer) {
        const depthBuffer = arr[1];
        self.system.renderDepthBuffer(depthBuffer);
        self.depthBuffer = depthBuffer;
      }

      // self.overlaymap.map.setView(Utils.latLonFrom(data.center), data.zoom);

      if (data.dispose) {
        self.system.dispose(self.heightmap);
      }
      self._fire();
    });

    this.el.sceneEl.addEventListener(OVERLAYMAP_LOADED, function (event) {
      let canvas = event.detail.canvas;

      console.log("setting attirbute", canvas.width)

      if (data.useBuffer) {
        canvas = self.system.copyCanvas(canvas);
      }


      self.el.setAttribute('material', 'src', canvas);

      if (data.dispose) {
        //self.system.dispose(self.overlaymap);
      }
      self._fire();
    });
  },
  update: function (oldData) {
    const data = this.data;

    // Nothing changed
    if (AFRAME.utils.deepEqual(oldData, data)) {
      return;
    }

    var setView = false;
    const overlaymap = this.overlaymap.map;

    if (!AFRAME.utils.deepEqual(data.center, oldData.center) || data.zoom !== oldData.zoom) {
      setView = true;
      const pixelBounds = overlaymap.getPixelBounds(Utils.latLonFrom(data.center), data.zoom);
      const sw = overlaymap.unproject(pixelBounds.getBottomLeft(), data.zoom);
      const ne = overlaymap.unproject(pixelBounds.getTopRight(), data.zoom);

      this.bounds = new L.LatLngBounds(sw, ne);
    }
    if (setView || data.lod !== oldData.lod) {
      const geomData = this.el.components.geometry.data;
      const width = geomData.width * data.pxToWorldRatio;
      const height = geomData.height * data.pxToWorldRatio;

      this.heightmap.map.setView(Utils.latLonFrom(data.center), data.zoom);

      //overlaymap.setView(Utils.latLonFrom(data.center), data.zoom);

      //console.log("1", overlaymap.getBounds()._southWest)
      overlaymap.fitBounds(this.bounds);
      if (data.lod !== oldData.lod) {
        const container = this.overlaymap.canvasContainer;
        container.style.width = (width * data.lod) + 'px';
        container.style.height = (height * data.lod) + 'px';
        console.log("Changing container size to", container.style.width);
        overlaymap.invalidateSize({
          animate: false
        });
        overlaymap.fitBounds(this.bounds);
        // tangram reload?
      }
    }

  },
  remove: function () {
    this.system.dispose(this.heightmap);
    this.heightmapDisposed = true;
    this.system.dispose(this.overlaymap);
    this.overlaymapDisposed = true;
  },
  _fire: function () {
    this._count = this._count || 0;
    this._count += 1;
    this._count %= 2;
    if (this._count === 0) {
      this.el.emit(TERRAIN_LOADED_EVENT);
    }
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
    if (this.overlaymapDisposed) {
      throw new Error('Overlaymap disposed.');
    }
    return this.overlaymap.map;
  },
  getHeightmapInstance: function () {
    if (this.heightmapDisposed) {
      throw new Error('Heightmap disposed.');
    }
    return this.heightmap.map;
  }
});

AFRAME.registerPrimitive('a-tangram-terrain', {
  // Defaults the terrain to be parallel to the ground.
  defaultComponents: {
    geometry: {
      primitive: 'plane',
      buffer: 'true',
      segmentsWidth: 50,
      segmentsHeight: 50
    },
    material: {
      wireframe: false,
      displacementScale: 30,
      displacementBias: 0
    },
    rotation: {
      x: -90,
      y: 0,
      z: 0
    },
    'tangram-terrain': {}
  },
  mappings: {
    'api-key': 'tangram-map.apiKey',
    width: 'geometry.width',
    depth: 'geometry.height',
    'grid-width': 'geometry.segmentsWidth',
    'grid-depth': 'geometry.segmentsHeight',
    center: 'tangram-terrain.center',
    'map-style': 'tangram-terrain.style',
    zoom: 'tangram-terrain.zoom',
    'px-world-ratio': 'tangram-terrain.pxToWorldRatio',
    'height-scale': 'material.displacementScale',
    wireframe: 'material.wireframe',
    'depth-buffer': 'tangram-terrain.depthBuffer',
    lod: 'tangram-terrain.lod'
  }
});