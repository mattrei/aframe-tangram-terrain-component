/* global AFRAME THREE */

const Utils = require('./utils');

const TERRAIN_LOADED_EVENT = 'tangram-terrain-loaded';
const TERRAIN_LOADING_EVENT = 'tangram-terrain-loading';

const GEOMETRY_LOD_FACTOR = 2;
const MATERIAL_LOD_FACTOR = 4;

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
    includeOceans: {
      default: false
    },
    heightmapFactor: {
      default: 2
    },
    pxToWorldRatio: {
      default: 10
    },
    lodCount: {
      default: 1,
      oneOf: [1, 2, 3, 4]
    },
    lod: {
      default: 1
    },
    vertexNormals: {
      default: true
    }
  },

  multiple: false,

  init: function () {
    const data = this.data;
    this.hasLoaded = false;

    this.handleHeightmapCanvas = this.handleHeightmapCanvas.bind(this);
    this.handleOverlayCanvas = this.handleOverlayCanvas.bind(this);

    // references for the API
    this.depthBuffer = null;
    this.map = null;
    this.normalmap = null;

    this.lods = [];

    this.createGeometryLODs();
    this.onKeyDown = this.onKeyDown.bind(this);

    Utils.watchMaterialData(this.el);
  },

  update: function (oldData) {
    const data = this.data;
    const el = this.el;
    const geomData = el.components.geometry.data;

    if (!data.style) return;
    // Nothing changed
    if (AFRAME.utils.deepEqual(oldData, data)) {
      return;
    }

    let setStyle = false;
    if (data.style !== oldData.style || data.pxToWorldRatio !== oldData.pxToWorldRatio) {
      setStyle = true;

      const width = THREE.Math.floorPowerOfTwo(geomData.width * data.pxToWorldRatio);
      const height = THREE.Math.floorPowerOfTwo(geomData.height * data.pxToWorldRatio);
      // const owidth = geomData.width * data.pxToWorldRatio;
      // const oheight = geomData.height * data.pxToWorldRatio;
      this.xPxToWorldRatio = width / geomData.width;
      this.yPxToWorldRatio = height / geomData.height;

      if (!this.heightmap || data.pxToWorldRatio !== oldData.pxToWorldRatio) {
        if (this.heightmaplayer) {
          this.heightmaplayer.remove();
        }
        const hwidth = THREE.Math.floorPowerOfTwo(geomData.segmentsWidth * data.heightmapFactor);
        const hheight = THREE.Math.floorPowerOfTwo(geomData.segmentsHeight * data.heightmapFactor);
        const heightmap = this.system.createHeightmap(data, hwidth, hheight, this.handleHeightmapCanvas);
        this.heightmaplayer = heightmap.layer;
        this.heightmap = heightmap.map;
      }
      if (!this.overlaymap || data.pxToWorldRatio !== oldData.pxToWorldRatio) {
        if (this.overlaylayer) {
          this.overlaylayer.remove();
        }
        const map = this.system.createMap(data, width, height, this.handleOverlayCanvas);
        this.overlaylayer = map.layer;
        this.overlaymap = map.map;

        this.el.emit(TERRAIN_LOADING_EVENT);
      } else {
        const cfg = {
          import: data.style
        };
        this.overlaylayer.scene.load(cfg);
        this.overlaylayer.scene.immediateRedraw();

        // only the overlay gets fired
      }
    }

    let setView = false;

    if (!AFRAME.utils.deepEqual(data.center, oldData.center) || data.zoom !== oldData.zoom) {
      setView = true;
      const pixelBounds = this.overlaymap.getPixelBounds(Utils.latLonFrom(data.center), data.zoom);
      const sw = this.overlaymap.unproject(pixelBounds.getBottomLeft(), data.zoom);
      const ne = this.overlaymap.unproject(pixelBounds.getTopRight(), data.zoom);
      this.bounds = new L.LatLngBounds(sw, ne);
    }
    if (setView) {
      // do not fire twice
      // this.hasLoaded = false;
      // if (!setStyle) this.el.emit(TERRAIN_LOADING_EVENT);

      const opts = {animate: false, reset: true, maxZoom: data.zoom};

      this.overlaymap.fitBounds(this.bounds, opts);
      this.heightmap.fitBounds(this.overlaymap.getBounds(), opts);

      // HACK: render depth buffer after a very safe timeout,
      // because the view_complete is not always called if tiles are in cache
      // TODO: still needed?
      setTimeout(_ => {
        this.renderDepthBuffer();
      }, 3000);
    }

    const mesh = el.getObject3D('mesh');
    // needs to be set because of displacmenet shader
    mesh.frustumCulled = false;

    if (data.lod !== oldData.lod) {
      if (data.lod >= 1 && data.lod <= data.lodCount) {
        this.applyLOD(data.lod);
      }
    }
  },

  renderDepthBuffer: function () {
    if (this.depthBuffer) {
      // if we have a depthbuffer and the scene is just updated
      this.system.renderDepthBuffer(this.depthBuffer);
    }
  },

  handleOverlayCanvas: function (canvas) {
    this.map = canvas;

    this.applyLOD(this.data.lod);
    this._fire();
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
  createGeometryLODs: function () {
    const lods = Utils.createGeometryLODs(this.el, this.data);

    const mesh = this.el.getObject3D('mesh');
    mesh.geometry = lods.geometry;
    this.lods = lods.lods;
  },
  handleHeightmapCanvas: function (canvas) {
    this.normalmap = canvas;

    this.system.createDepthBuffer(this.normalmap).then(buffer => {
      this.depthBuffer = buffer;
      this.renderDepthBuffer(this.depthBuffer);
      this._fire();
    });
  },

  remove: function () {
    this.heightmaplayer && this.heightmaplayer.remove();
    this.overlaylayer && this.overlaylayer.remove();
  },

  _fire: function () {
    if (this.map && this.normalmap) {
      Utils.applyMaterial(this.el, this.data, this.map, this.normalmap);

      this.hasLoaded = true;
      this.el.emit(TERRAIN_LOADED_EVENT);
    }
  },
  project: function (lon, lat) {
    const data = this.data;
    const geomData = this.el.components.geometry.data;
    const matData = this.el.components.material.data;

    // pixel space from leaflet
    const px = this.overlaymap.latLngToLayerPoint([lat, lon]);

    // convert to world space
    const worldX = (px.x / this.xPxToWorldRatio) - (geomData.width / 2);
    // y-coord is inverted (positive up in world space, positive down in pixel space)
    const worldY = -(px.y / this.yPxToWorldRatio) + (geomData.height / 2);

    // const z = this._hitTest(px.x, px.y) * matData.displacementScale + matData.displacementBias;
    const z = this._hitTestLonLat(lon, lat) * matData.displacementScale + matData.displacementBias;

    return {
      x: worldX,
      y: worldY,
      z: z
    };
  },

  _hitTestLonLat: (function () {
    const pixelBuffer = new Uint8Array(4);// Float32Array(4);
    return function (lon, lat) {
      const px = this.heightmap.latLngToLayerPoint([lat, lon]);
      const depthTexture = this.depthBuffer.texture;

      // converting pixel space to texture space
      const hitX = px.x;
      const hitY = depthTexture.height - px.y;

      this.system.readDepthTexture(depthTexture, hitX, hitY, pixelBuffer);

      // read alpha value
      return pixelBuffer[3] / 255;
    };
  })(),

  _hitTest: (function () {
    const pixelBuffer = new Uint8Array(4);// Float32Array(4);
    return function (x, y) {
      const data = this.data;
      const geomData = this.el.components.geometry.data;

      const depthTexture = this.depthBuffer.texture;

      const width = geomData.width * this.xPxToWorldRatio;
      const height = geomData.height * this.yPxToWorldRatio;

      // converting ovleray space to heightmap space
      const hitX = Math.round((x) / width * depthTexture.width);
      const hitY = Math.round((height - y) / height * depthTexture.height);

      this.system.readDepthTexture(depthTexture, hitX, hitY, pixelBuffer);

      // read alpha value
      return pixelBuffer[3] / 255;
    };
  })(),


  unproject: function (x, y) {
    const data = this.data;
    const geomData = this.el.components.geometry.data;

    // Converting world space to pixel space
    const pxX = (x + (geomData.width / 2)) * this.xPxToWorldRatio;
    const pxY = ((geomData.height / 2) - y) * this.yPxToWorldRatio;

    // Return the lat / long of that pixel on the map
    const latLng = this.overlaymap.layerPointToLatLng([pxX, pxY]);
    return {
      lon: latLng.lng,
      lat: latLng.lat
    };
  },

  _getHeight: function (x, y) {
    const geomData = this.el.components.geometry.data;

    const pxX = (x + (geomData.width / 2)) * this.xPxToWorldRatio;
    const pxY = ((geomData.height / 2) - y) * this.yPxToWorldRatio;

    return this._hitTest(pxX, pxY);
  },

  unprojectHeight: function (x, y) {
    const matData = this.el.components.material.data;
    return this._getHeight(x, y) * matData.displacementScale + matData.displacementBias;
  },

  unprojectHeightInMeters: function (x, y) {
    return this._getHeight(x, y) * 19900 - 11000;
  },

  play: function () {
    window.addEventListener('keydown', this.onKeyDown);
  },

  /**
   * <ctrl> + <alt> + t = Regular screenshot.
   * <ctrl> + <alt> + <shift> + t = Equirectangular screenshot.
   */
  onKeyDown: function (evt) {
    var shortcutPressed = evt.keyCode === 84 && evt.ctrlKey && evt.altKey;
    if (!this.data || !shortcutPressed) {
      return;
    }
    var type = evt.shiftKey ? 'map' : (this.data.vertexNormals ? 'normalmap' : 'displacementmap');
    this.capture(type);
  },

  /**
   * Maintained for backwards compatibility.
   */
  capture: function (type) {
    const imgType = type === 'map' ? 'jpeg' : 'png';
    const canvas = type === 'map' ? this.map : this.normalmap;

    // Trigger file download.
    this.saveCapture(canvas, type, imgType);
  },
  /**
   * Download capture to file.
   */
  saveCapture: function (canvas, type, imgType) {
    console.log('BoundingBox: ', this.bounds.toBBoxString());
    // console.log('PxToWorldRatio: ', this.xPxToWorldRatio, this.yPxToWorldRatio);
    canvas.toBlob(function (blob) {
      var fileName = type + '-' + Date.now() + '.' + imgType;
      var linkEl = document.createElement('a');
      var url = URL.createObjectURL(blob);
      linkEl.href = url;
      linkEl.setAttribute('download', fileName);
      linkEl.innerHTML = 'downloading...';
      linkEl.style.display = 'none';
      document.body.appendChild(linkEl);
      setTimeout(function () {
        linkEl.click();
        document.body.removeChild(linkEl);
      }, 1);
    }, 'image/' + imgType);
  }

});
