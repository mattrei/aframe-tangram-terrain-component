/* global AFRAME THREE */

const L = require('leaflet');
const Tangram = require('tangram');

const Utils = require('./utils');

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

const PRESERVE_DRAWING_BUFFER = true;// AFRAME.utils.device.isMobile();

const cuid = require('cuid');

// const elevationStyle = require('./styles/elevation-tiles.yaml');
const elevationStyle = require('./styles/normal-alpha-elevation.yaml');

const REMOVETANGRAM_TIMEOUT = 300;

const DEBUG_HM_CANVAS_OFFSET = 99;
const DEBUG_CANVAS_OFFSET = 99999;

const HM_RESOLUTION_FACTOR = 2;

AFRAME.registerSystem('tangram-terrain', {
  init: function () {
    this.heightmap = null;
    this.heightmapLayer = null;
    this.overlaymap = null;
    this.overlaymapLayer = null;

    this.mapPool = [];
    this.poolSize = 1;
  },
  createStaticMap: function(data) {

    const bounds = L.LatLngBounds(
      L.latLng(data.bounds[0], data.bounds[1]),
      L.latLng(data.bounds[2], data.bounds[3])
    )


  const canvasContainer = Utils.getCanvasContainerAssetElement(
    cuid(),
    data.map.width, data.map.height, 999999);

    var map = L.map(canvasContainer, {
      crs: L.CRS.Simple,
      maxBounds: bounds
    });

    return map;

  },
  getOrCreateHeightmap: function (data, geomData, onComplete) {
    const self = this;

    const viewComplete = function () {
      const canvas = self.heightmapLayer.scene.canvas;
      console.log('HEIGHTMAP VIEW_COMPLETE', canvas.width);
      const depthBuffer = data.depthBuffer ? self._createDepthBuffer(canvas) : undefined;
      onComplete({
        canvas: canvas,
        depthBuffer: depthBuffer
      });
    };

    if (data.singleton && this.heightmap) {
      this.heightmap._loaded = false;
      this.heightmapLayer.scene.unsubscribeAll();
      this.heightmapLayer.scene.subscribe({
        view_complete: viewComplete
      });
      return this.heightmap;
    }

    const width = geomData.segmentsWidth * HM_RESOLUTION_FACTOR + 1;
    const height = geomData.segmentsHeight * HM_RESOLUTION_FACTOR + 1;

    // const width = geomData.width * data.pxToWorldRatio;
    // const height = geomData.height * data.pxToWorldRatio;

    const canvasContainer = Utils.getCanvasContainerAssetElement(
      cuid(),
      width, height, DEBUG_HM_CANVAS_OFFSET);

    const map = L.map(canvasContainer, Utils.leafletOptions);
    this.heightmap = map;

    const layer = Tangram.leafletLayer({
      scene: {
        import: elevationStyle
      },
      webGLContextOptions: {
        preserveDrawingBuffer: PRESERVE_DRAWING_BUFFER,
        alpha: true,
        premultipliedAlpha: false // very important for transparent tiles
      },
      highDensityDisplay: false,
      attribution: ''
    });

    this.heightmapLayer = layer;

    layer.scene.subscribe({
      load: function () {
        layer.scene.config.styles.combo.shaders.defines.USE_NORMALS = data.vertexNormals;
        Utils.processCanvasElement(canvasContainer);
      },
      view_complete: viewComplete
    });
    layer.addTo(map);

    return map;
  },
  getOrCreateMap: function (data, geomData, onComplete) {
    function viewComplete (tangram) {
      const canvas = tangram.layer.scene.canvas;
      onComplete({
        canvas: canvas
      });
      tangram.used = false;
    }

    if (this.mapPool.length < this.poolSize) {
      console.log('SYS creating map');
      const tangram = this._createTangram(data, geomData, viewComplete);
      tangram.used = true;
      tangram.id = this.mapPool.length;
      this.mapPool.push(tangram);
      return tangram.map;
    } else {
      for (let tangram of this.mapPool) {
        if (!tangram.used) {
          console.log('SYS using map', tangram.id);
          tangram.map._loaded = false;
          tangram.layer.scene.unsubscribeAll();
          tangram.layer.scene.subscribe({
            view_complete: function () {
              viewComplete(tangram);
            }
          });
          tangram.used = true;
          return tangram.map;
        }
      }
    }
  },
  _createTangram: function (data, geomData, onComplete) {
    const width = geomData.width * data.pxToWorldRatio;
    const height = geomData.height * data.pxToWorldRatio;

    const canvasContainer = Utils.getCanvasContainerAssetElement(
      cuid(),
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
      webGLContextOptions: {
        preserveDrawingBuffer: PRESERVE_DRAWING_BUFFER
      },
      attribution: ''
    });
    layer.addTo(map);

    const tangram = {
      map: map,
      layer: layer
    };

    layer.scene.subscribe({
      load: function () {
        Utils.processCanvasElement(canvasContainer);
      },
      view_complete: function () {
        onComplete(tangram);
      }
    });

    return tangram;
  },
  resize: function (map, width, height) {
    const container = map.getContainer();
    container.style.width = (width) + 'px';
    container.style.height = (height) + 'px';
    // console.log("Changing container size to", container.style.width);

    const bounds = map.getBounds();

    map.invalidateSize({
      animate: false
    });
    map.fitBounds(bounds);
    // tangram reload?
    // this.overlaymap.layer.scene.immediateRedraw();
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
    // canvasTexture.generateMipmaps = false;

    canvas.width = imageWidth;
    canvas.height = imageHeight;

    const mesh = new THREE.Mesh(
      new THREE.PlaneBufferGeometry(imageWidth, imageHeight, 1, 1),
      new THREE.MeshBasicMaterial({
        map: canvasTexture,
        transparent: true
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
  copyCanvas: function (canvas, x, y, width, height) {
    const copy = document.createElement('canvas');
    copy.setAttribute('id', cuid());

    const w = width || canvas.width;
    const h = height || canvas.height;

    copy.setAttribute('width', w);
    copy.setAttribute('height', h);
    const ctx = copy.getContext('2d', {alpha:true});

    ctx.drawImage(canvas, x || 0, y || 0, w, h);
    return copy;
  },
  copyCanvasTile: function (canvas, x, y, width, height) {
    const copy = document.createElement('canvas');
    copy.setAttribute('id', cuid());

    const w = width || canvas.width;
    const h = height || canvas.height;

    copy.setAttribute('width', w);
    copy.setAttribute('height', h);
    const ctx = copy.getContext('2d', {alpha:true});

    ctx.drawImage(canvas, x || 0, y || 0, w, h);

    var imgData = canvas.getContext('2d').getImageData(x, y, w, h);
    ctx.putImageData(imgData, 0, 0);

    return copy;
  },
  project: function (data, geomData, matData, map, depthBuffer, lon, lat) {
    // pixel space from leaflet
    var px = map.latLngToLayerPoint([lat, lon]);

    // convert to world space
    const worldX = (px.x / data.pxToWorldRatio) - (geomData.width / 2);
    // y-coord is inverted (positive up in world space, positive down in pixel space)
    const worldY = -(px.y / data.pxToWorldRatio) + (geomData.height / 2);
    console.log("project")

    var z = this.hitTest(data, geomData, depthBuffer, px.x, px.y);

    z *= matData.displacementScale;
    z += matData.displacementBias;
    console.log(z)

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

    /// read alpha value
    return pixelBuffer[3] / 255;
  },
  renderDepthBuffer: function (depthBuffer) {
    // depthBuffer.canvasTexture.needsUpdate = true;
    this.el.renderer.render(depthBuffer.scene, depthBuffer.camera, depthBuffer.texture);
  },
  dispose: function (obj) {
    // removing all ressources layer after a safe timeout
    Utils.delay(REMOVETANGRAM_TIMEOUT, function () {
      obj.layer.remove();
    });
  }
});
