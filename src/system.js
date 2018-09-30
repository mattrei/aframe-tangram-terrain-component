
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

const DEBUG_CANVAS_OFFSET =     99999;
const DEBUG_HM_CANVAS_OFFSET =  999999;

const HM_RESOLUTION_FACTOR = 2;


AFRAME.registerSystem('tangram-terrain', {
  init: function () {
  },
  createHeightmap: function (data, geomData, onComplete) {

    const width = geomData.segmentsWidth * data.heightmapFactor + 1;
    const height = geomData.segmentsHeight * data.heightmapFactor + 1;

    const canvasContainer = Utils.getCanvasContainerAssetElement(
      cuid(),
      width, height, DEBUG_HM_CANVAS_OFFSET);

    const map = L.map(canvasContainer, Utils.leafletOptions);

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
      continuousZoom: false,
      noWrap: true,
      attribution: ''
    });

    const tangram = {
      map: map,
      layer: layer
    };

    layer.scene.subscribe({
      load: (event) => {
//        this.injectAPIKey(event.config, data.apiKey);
        layer.scene.config.styles.combo.shaders.defines.USE_NORMALS = data.vertexNormals;
        Utils.processCanvasElement(canvasContainer);
      },
      view_complete: () => {
        const canvas = tangram.layer.scene.canvas;
        onComplete(canvas);
      }
    });
    layer.addTo(map);

    return tangram;
  },
  createMap: function (data, geomData, onComplete) {

    const width = geomData.width * data.pxToWorldRatio;
    const height = geomData.height * data.pxToWorldRatio;

    const canvasContainer = Utils.getCanvasContainerAssetElement(
      cuid(),
      width, height, DEBUG_CANVAS_OFFSET + 100);

    const map = L.map(canvasContainer, Utils.leafletOptions);

    const layer = Tangram.leafletLayer({
      scene: {
        import: data.style
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
      load: (event) => {
        this.injectAPIKey(event.config, data.apiKey);
        Utils.processCanvasElement(canvasContainer);
      },
      post_update: (will_render) => {
      },
      view_complete: () => {
        const canvas = tangram.layer.scene.canvas;
        onComplete(canvas);
      }
    });

    return tangram;
  },
  resize: function (map, width, height) {
    const container = map.getContainer();
    container.style.width = (width) + 'px';
    container.style.height = (height) + 'px';

    const bounds = map.getBounds();

    map.invalidateSize({
      animate: false
    });
    map.fitBounds(bounds);
    // tangram reload?
    // this.overlaymap.layer.scene.immediateRedraw();
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
      //type: THREE.FloatType
    });

    return new Promise((resolve, reject) => {
      this.el.systems.material.loadTexture(canvas, {
        src: canvas
      }, mapTexture => {

        const mesh = new THREE.Mesh(
          new THREE.PlaneBufferGeometry(imageWidth, imageHeight, 1, 1),
          new THREE.MeshBasicMaterial({
            map: mapTexture,
            lights: false,
            fog: false,
            //transparent: true
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
        resolve(depthBuffer);
      })
    })


  },

  renderDepthBuffer: function (depthBuffer) {
    depthBuffer.canvasTexture.needsUpdate = true;
    this.el.renderer.render(depthBuffer.scene, depthBuffer.camera, depthBuffer.texture);
  },

  dispose: function (obj) {
    // removing all ressources layer after a safe timeout
    Utils.delay(REMOVETANGRAM_TIMEOUT, function () {
      obj.layer.remove();
    });
  },
  injectAPIKey(config, apiKey) {
    const URL_PATTERN = /((https?:)?\/\/tiles?.nextzen.org([a-z]|[A-Z]|[0-9]|\/|\{|\}|\.|\||:)+(topojson|geojson|mvt|png|tif|gz))/;

    let didInjectKey = false;

    Object.entries(config.sources).forEach((entry) => {
      const [key, value] = entry;
      let valid = false;

      // Only operate on the URL if it's a Mapzen-hosted vector tile service
      if (!value.url.match(URL_PATTERN)) return;

      // Check for valid API keys in the source.
      // First, check the url_params.api_key field
      // Tangram.js compatibility note: Tangram >= v0.11.7 fires the `load`
      // event after `global` property substitution, so we don't need to manually
      // check global properties here.
      if (value.url_params && value.url_params.api_key) {
        valid = true;
      // Next, check if there is an api_key param in the query string
      } else if (value.url.match(/(\?|&)api_key=[-a-z]+-[0-9a-zA-Z_-]{7}/)) {
        valid = true;
      }

      if (!valid) {
        // Add a default API key as a url_params setting.
        // Preserve existing url_params if present.
        const params = Object.assign({}, config.sources[key].url_params, {
          api_key: apiKey,
        });

        // Mutate the original on purpose.
        // eslint-disable-next-line no-param-reassign
        config.sources[key].url_params = params;
        didInjectKey = true;
      }
    });

    return didInjectKey;
  }
});
