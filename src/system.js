/* global AFRAME THREE */

const L = require('leaflet');
const Tangram = require('tangram');

const Utils = require('./utils');

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

const PRESERVE_DRAWING_BUFFER = AFRAME.utils.device.isMobile();

const cuid = require('cuid');

const heightmapStyle = require('./heightmap-style.yaml');

const OVERLAYMAP_LOADED = 'overlaymap-loaded';
const HEIGHTMAP_LOADED = 'heightmap-loaded';

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

