/* global AFRAME THREE */

const BufferGeometryUtils = require('./lib/BufferGeometryUtils');
const Utils = require('./utils');

const MeshCustomMaterial = require('./lib/MeshCustomMaterial');

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
    depthBuffer: {
      default: false
    },
    useBuffer: {
      type: 'boolean',
      default: true
    },
        // TODO - delete?
    dispose: {
      type: 'boolean',
      default: false
    },
    lod: {
      default: 1
    },
    lodCount: {
      default: 1,
      oneOf: [1, 2, 3, 4]
    },
    singleton: {
      default: false
    },
    useHeightmap: {
      default: true
    },
    vertexNormals: {
      default: false
    }
  },

  multiple: false,

  init: function () {
    const data = this.data;
    const geomData = this.el.components.geometry.data;
    const matData = this.el.components.material.data;

    const mesh = this.el.getObject3D('mesh');
    const material = new MeshCustomMaterial();
    material.wireframe = matData.wireframe;
    material.displacementScale = matData.displacementScale;
    material.displacementBias = matData.displacementBias;
    material.side = matData.side;
    mesh.material = material;

    this.depthBuffer = null;

    this.handleHeightmapCanvas = this.handleHeightmapCanvas.bind(this);
    this.handleOverlayCanvas = this.handleOverlayCanvas.bind(this);

    if (data.useHeightmap) {
      this.heightmap = this.system.getOrCreateHeightmap(data, geomData, this.handleHeightmapCanvas);
      this.heightmapDisposed = false;
    }
    this.overlaymap = this.system.getOrCreateMap(data, geomData, this.handleOverlayCanvas);
    this.overlaymapDisposed = false;

    this.map = null;
    this.normalmap = null;

    this.lods = [];

    this.createGeometryLODs();

    this.allLoaded = false;
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
    if (setView /* || data.lod !== oldData.lod*/) {
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
        this.loadOrApplyLOD(data.lod);
      }
    }
  },
  handleOverlayCanvas: function (event) {

    if (!this.setMap) {
      return;
    }
    this.setMap = false;

    const data = this.data;
    const el = this.el;
    const renderer = this.el.sceneEl.renderer;
    const geomData = this.el.components.geometry.data;
    const matData = this.el.components.material.data;

    let canvas = event.canvas;

    if (data.useBuffer) {
      canvas = this.system.copyCanvas(canvas);
    }
    this.map = canvas;

    this.loadOrApplyLOD(data.lod);

    this._fire();
  },
  loadOrApplyLOD: function (lod) {
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

        /*
        if (!foundLOD.material) {

                    const geomData = el.components.geometry.data;

        const factor = 1 / lod;

            const width = geomData.width * data.pxToWorldRatio * factor;
            const height = geomData.height * data.pxToWorldRatio * factor;

            this.system.resize(this.overlaymap, width, height)

        } else {
            mesh.material = foundLOD.material
        }
        */
  },
  createGeometryLODs: function () {
    const el = this.el;
    const data = this.data;
    const geomData = el.components.geometry.data;

    const mesh = el.getObject3D('mesh');
    const lodGeometries = [mesh.geometry];

    for (let i = 1; i < data.lodCount; i++) {
      const factor = i * GEOMETRY_LOD_FACTOR;

      let lodGeometry = new THREE.PlaneGeometry(
                geomData.width, geomData.height,
                Math.floor(geomData.segmentsWidth / factor), Math.floor(geomData.segmentsHeight / factor)
            );

      lodGeometry = new THREE.BufferGeometry().fromGeometry(lodGeometry);
            /*
                        const lodGeometry = new THREE.PlaneBufferGeometry(
                            geomData.width, geomData.height,
                            Math.floor(geomData.segmentsWidth / factor), Math.floor(geomData.segmentsHeight / factor)
                        )
                        */
            // console.log(lodGeometry)
            // console.log(lodGeometry.index.count)
      lodGeometries.push(lodGeometry);
    }
    let start = 0;
    for (let i = 0; i < lodGeometries.length; i++) {
      const count = lodGeometries[i].attributes.position.count;

      this.lods.push({
        lod: i + 1,
        geometry: {
          start: start,
          count: count
        }
      });

      start += count;
    }

    const mergedGeometry = BufferGeometryUtils.mergeBufferGeometries(lodGeometries);
    mesh.geometry = mergedGeometry;
  },
  handleHeightmapCanvas: function (event) {

    if (!this.setHeightmap) return;
    this.setHeightmap = false;
    console.log("handle hm")

    const data = this.data;
    const renderer = this.el.sceneEl.renderer;

    let canvas = event.canvas;
    const depthBuffer = event.depthBuffer;

    canvas = data.useBuffer ? this.system.copyCanvas(canvas) : canvas;
        /*
                const texture = new THREE.CanvasTexture(canvas);
                renderer.setTexture2D(texture, 0);
                this.displacementMap = texture;

                for (let lod of this.lods) {
                    if (lod.material) {
                        lod.material.displacementMap = texture;
                        lod.material.needsUpdate = true;
                    }
                }
                */

        // this.el.setAttribute('material', 'displacementMap', canvas);
        // this.el.setAttribute('material', 'normalMap', canvas);
        // this.el.setAttribute('material', 'src', canvas);

    this.normalmap = canvas;

    if (data.depthBuffer) {
      this.system.renderDepthBuffer(depthBuffer);
      this.depthBuffer = depthBuffer;
    }
    this._fire();
  },
  applyMaterial: function () {
    
    console.log("apply mat")
    
      const mesh = this.el.getObject3D('mesh');
      const matData = this.el.components.material.data;


      
      
      // Hack readyState and HAVE_CURRENT_DATA on canvas to work with THREE.VideoTexture
      this.el.sceneEl.systems.material.loadTexture(this.map, {}, mapTexture => {
        this.el.sceneEl.systems.material.loadTexture(this.normalmap, {}, normalmapTexture => {
        
        const material = mesh.material;
        //material.copy(mesh.material)
        material.wireframe = matData.wireframe;
        material.displacementScale = matData.displacementScale;
        material.displacementBias = matData.displacementBias;
        material.side = matData.side;
  
        material.displacementMap = normalmapTexture;
        if (this.data.vertexNormals) {
          material.normalMap = normalmapTexture;
        }
        material.map = mapTexture;
        material.needsUpdate = true;
        
        mesh.material = material; 

        console.log("LOADED TExture", mapTexture)
        console.log("LOADED TExture", normalmapTexture)
        })
      })
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
    this._count %= this.data.useHeightmap ? 2 : 1;
    if (this._count === 0) {
      this.allLoaded = true;
      this.applyMaterial();
      this.el.emit(TERRAIN_LOADED_EVENT);
    }
  },
  project: function (lon, lat) {
    const geomData = this.el.components.geometry.data;
    const matData = this.el.components.material.data;

    return this.system.project(this.data, geomData, matData,
            this.overlaymap,
            this.depthBuffer,
            lon, lat);
  },
  unproject: function (x, y) {
    const geomData = this.el.components.geometry.data;

    return this.system.unproject(this.data, geomData, this.overlaymap, x, y);
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
  }
});
