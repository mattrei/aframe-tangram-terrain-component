/* global AFRAME THREE */

const Utils = require('./utils');


const TERRAIN_LOADED_EVENT = 'tangram-terrain-loaded';

const OVERLAYMAP_LOADED = 'overlaymap-loaded';

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
    pxToWorldRatio: {
      default: 10
    },
    // TODO delete? is really needed?
    useBuffer: {
      type: 'boolean',
      default: false
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
    const el = this.el;
    const data = this.data;
    const geomData = el.components.geometry.data;

    this.handleHeightmapCanvas = this.handleHeightmapCanvas.bind(this);
    this.handleOverlayCanvas = this.handleOverlayCanvas.bind(this);

    this.heightmap = this.system.getOrCreateHeightmap(data, geomData, this.handleHeightmapCanvas);
    this.heightmapDisposed = false;
    this.overlaymap = this.system.getOrCreateMap(data, geomData, this.handleOverlayCanvas);
    this.overlaymapDisposed = false;

    this.depthBuffer = null;
    this.map = null;
    this.normalmap = null;

    this.lods = [];

    this.createGeometryLODs();
    this.onKeyDown = this.onKeyDown.bind(this);

    Utils.watchMaterialData(el);

  },
  update: function (oldData) {
    const data = this.data;

    // Nothing changed
    if (AFRAME.utils.deepEqual(oldData, data)) {
      return;
    }


    var setView = false;

    if (!AFRAME.utils.deepEqual(data.center, oldData.center) || data.zoom !== oldData.zoom) {
      setView = true;
      const pixelBounds = this.overlaymap.getPixelBounds(Utils.latLonFrom(data.center), data.zoom);
      const sw = this.overlaymap.unproject(pixelBounds.getBottomLeft(), data.zoom);
      const ne = this.overlaymap.unproject(pixelBounds.getTopRight(), data.zoom);
      this.bounds = new L.LatLngBounds(sw, ne);
    }
    if (setView /* || data.lod !== oldData.lod*/ ) {
      this.setMap = true;
      this.overlaymap.fitBounds(this.bounds);
      this.overlaymap.invalidateSize({
        animate: false
      });
      this.overlaymap.fitBounds(this.bounds);

      if (this.heightmap) {
        this.setHeightmap = true;
        this.heightmap.fitBounds(this.overlaymap.getBounds());
        this.heightmap.invalidateSize({
          animate: false
        });
        this.heightmap.fitBounds(this.overlaymap.getBounds());
      }
    }

    if (data.lod !== oldData.lod) {
      if (data.lod >= 1 && data.lod <= data.lodCount) {
        this.applyLOD(data.lod);
      }
    }
  },
  handleOverlayCanvas: function (canvas) {
    if (!this.setMap) {
      return;
    }
    this.setMap = false;

    this.map = this.data.useBuffer ? this.system.copyCanvas(canvas) : canvas;

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

    if (!this.setHeightmap) return;
    this.setHeightmap = false;

    this.normalmap = this.data.useBuffer ? this.system.copyCanvas(canvas) : canvas;

    this.system.createDepthBuffer(this.normalmap).then(buffer => {
      this.depthBuffer = buffer
    });


    this._fire();
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
      Utils.applyMaterial(this.el, this.data, this.map, this.normalmap);
      this.el.emit(TERRAIN_LOADED_EVENT);
    }
  },
  project: function (lon, lat) {
    const data = this.data;
    const geomData = this.el.components.geometry.data;
    const matData = this.el.components.material.data;

    // pixel space from leaflet
    var px = this.overlaymap.latLngToLayerPoint([lat, lon]);

    // convert to world space
    const worldX = (px.x / data.pxToWorldRatio) - (geomData.width / 2);
    // y-coord is inverted (positive up in world space, positive down in pixel space)
    const worldY = -(px.y / data.pxToWorldRatio) + (geomData.height / 2);
    
    var z = this._hitTest(px.x, px.y);

    z *= matData.displacementScale;
    z += matData.displacementBias;

    return {
      x: worldX,
      y: worldY,
      z: z
    };
  },
  _hitTest: function (x, y) {
    const data = this.data;
    const geomData = this.el.components.geometry.data;
    const pixelBuffer = new Uint8Array(4);

    const depthTexture = this.depthBuffer.texture;

    const width = geomData.width * data.pxToWorldRatio;
    const height = geomData.height * data.pxToWorldRatio;

    // converting pixel space to texture space
    const hitX = Math.round((x) / width * depthTexture.width);
    const hitY = Math.round((height - y) / height * depthTexture.height);

    this.el.sceneEl.renderer.readRenderTargetPixels(depthTexture, hitX, hitY, 1, 1, pixelBuffer);

    // read alpha value
    return pixelBuffer[3] / 255;
  },
  unproject: function (x, y) {
    const data = this.data;
    const geomData = this.el.components.geometry.data;

    // Converting world space to pixel space
    const pxX = (x + (geomData.width / 2)) * data.pxToWorldRatio;
    const pxY = ((geomData.height / 2) - y) * data.pxToWorldRatio;

    // Return the lat / long of that pixel on the map
    var latLng = this.overlaymap.layerPointToLatLng([pxX, pxY]);
    return {
      lon: latLng.lng,
      lat: latLng.lat
    };
  },
  _getHeight: function (x, y) {
    const geomData = this.el.components.geometry.data;

    const pxX = (x + (geomData.width / 2)) * this.data.pxToWorldRatio;
    const pxY = ((geomData.height / 2) - y) * this.data.pxToWorldRatio;

    const data = this.data;

    return this._hitTest(pxX, pxY);
  },
  unprojectHeight: function (x, y) {
    const matData = this.el.components.material.data;
    return this._getHeight(x, y) * matData.displacementScale + matData.displacementBias;
  },
  unprojectHeightInMeters: function (x, y) {
    return this._getHeight(x, y) * 8900;
  },
  getMap: function () {
    if (this.overlaymapDisposed) {
      throw new Error('Overlaymap disposed.');
    }
    return this.overlaymap;
  },
  getHeightmap: function () {
    if (this.heightmapDisposed) {
      throw new Error('Heightmap disposed.');
    }
    return this.heightmap;
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
    var type = evt.shiftKey ? 'map' : 'normalmap';
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
    console.log("BoundingBox: ", this.bounds.toBBoxString())
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
