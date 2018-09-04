
const L = require('leaflet');
const Tangram = require('tangram');

const Utils = require('./utils');

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

const PRESERVE_DRAWING_BUFFER = true; // AFRAME.utils.device.isMobile();

const cuid = require('cuid');

// const elevationStyle = require('./styles/elevation-tiles.yaml');
const elevationStyle = require('./styles/normal-alpha-elevation.yaml');

const REMOVETANGRAM_TIMEOUT = 300;

const DEBUG_HM_CANVAS_OFFSET = 99999;
const DEBUG_CANVAS_OFFSET = DEBUG_HM_CANVAS_OFFSET + 100;

const HM_RESOLUTION_FACTOR = 2;

const POOL_SIZE = 2;

AFRAME.registerSystem('tangram-terrain', {
  init: function () {
    this.heightmap = null;
    this.heightmapLayer = null;
    this.overlaymap = null;
    this.overlaymapLayer = null;

    this.mapPool = [];
    this.poolSize = POOL_SIZE;
  },
  getOrCreateHeightmap: function (data, geomData, onComplete) {
    const self = this;

    const viewComplete = function () {
      const canvas = self.heightmapLayer.scene.canvas;
      onComplete(canvas);
    };

    if (/*data.singleton &&*/ this.heightmap) {
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
        import: elevationStyle,
        global: {
          sdk_api_key: data.apiKey
          // language
        }
      },
      webGLContextOptions: {
        preserveDrawingBuffer: PRESERVE_DRAWING_BUFFER,
        alpha: true,
        premultipliedAlpha: false // very important for transparent tiles
      },
      highDensityDisplay: false,
      continuousZoom: false,
      noWrap: true,
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
    function viewComplete(tangram) {
      const canvas = tangram.layer.scene.canvas;
      onComplete(canvas);
      tangram.used = false;
    }

    if (this.mapPool.length < this.poolSize) {
      const tangram = this._createTangram(data, geomData, viewComplete);
      tangram.used = true;
      tangram.id = this.mapPool.length;
      this.mapPool.push(tangram);
      return tangram.map;
    } else {
      for (let tangram of this.mapPool) {
        if (!tangram.used) {
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
          sdk_api_key: data.apiKey
          // language
        }
      },
      numWorkers: 4,
      highDensityDisplay: false,
      webGLContextOptions: {
        preserveDrawingBuffer: PRESERVE_DRAWING_BUFFER
      },
      continuousZoom: false,
      noWrap: true,
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
  createDepthBufferOLD: function (canvas) {
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

    // TODO?
    //this.el.systems.material.loadTexture(normalmap, {src: normalmap}, normalmapTexture => {

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
  createDepthBuffer: function (canvas) {

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

    return new Promise((resolve, reject) => {
      this.el.systems.material.loadTexture(canvas, {
        src: canvas
      }, mapTexture => {

        const mesh = new THREE.Mesh(
          new THREE.PlaneBufferGeometry(imageWidth, imageHeight, 1, 1),
          new THREE.MeshBasicMaterial({
            map: mapTexture,
            transparent: true
          })
        );
        scene.add(mesh);

        const depthBuffer = {
          scene: scene,
          camera: camera,
          mesh: mesh,
          texture: texture,
          canvasTexture: mapTexture
        }

        this.renderDepthBuffer(depthBuffer);

        resolve(depthBuffer);
      })
    })


  },
  copyCanvas: function (canvas, x, y, width, height) {
    const copy = document.createElement('canvas');
    copy.setAttribute('id', cuid());

    const w = width || canvas.width;
    const h = height || canvas.height;

    copy.setAttribute('width', w);
    copy.setAttribute('height', h);
    const ctx = copy.getContext('2d', {
      alpha: true
    });

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
    const ctx = copy.getContext('2d', {
      alpha: true
    });

    ctx.drawImage(canvas, x || 0, y || 0, w, h);

    var imgData = canvas.getContext('2d').getImageData(x, y, w, h);
    ctx.putImageData(imgData, 0, 0);

    return copy;
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
