/* global AFRAME THREE */

const BufferGeometryUtils = require('./lib/BufferGeometryUtils')
const Utils = require('./utils');

const TERRAIN_LOADED_EVENT = 'tangram-terrain-loaded';

const OVERLAYMAP_LOADED = 'overlaymap-loaded';
const HEIGHTMAP_LOADED = 'heightmap-loaded';

const GEOMETRY_LOD_FACTOR = 4;
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
        }
    },

    multiple: false,

    init: function () {
        const data = this.data;
        const geomData = this.el.components.geometry.data;

        this.depthBuffer = null;

        this.heightmap = this.system.createHeightmap(data, geomData);
        this.heightmapDisposed = false;
        this.overlaymap = this.system.getOrCreateMap(data, geomData);
        this.overlaymapDisposed = false;

        this.displacementMap = null;

        this.lods = []

        this.handleHeightmapCanvas = this.handleHeightmapCanvas.bind(this);
        this.el.sceneEl.addEventListener(HEIGHTMAP_LOADED, this.handleHeightmapCanvas.bind(this));
        this.handleOverlayCanvas = this.handleOverlayCanvas.bind(this);
        this.el.sceneEl.addEventListener(OVERLAYMAP_LOADED, this.handleOverlayCanvas.bind(this));
        

        this.createGeometryLODs();
    },
    update: function (oldData) {
        const data = this.data;

        // Nothing changed
        if (AFRAME.utils.deepEqual(oldData, data)) {
            return;
        }

        var setView = false;
        const overlaymap = this.overlaymap;

        if (!AFRAME.utils.deepEqual(data.center, oldData.center) || data.zoom !== oldData.zoom) {
            setView = true;
            const pixelBounds = overlaymap.getPixelBounds(Utils.latLonFrom(data.center), data.zoom);
            const sw = overlaymap.unproject(pixelBounds.getBottomLeft(), data.zoom);
            const ne = overlaymap.unproject(pixelBounds.getTopRight(), data.zoom);

            
            this.bounds = new L.LatLngBounds(sw, ne);
        }
        if (setView || data.lod !== oldData.lod) {
            const geomData = this.el.components.geometry.data;


            this.heightmap.fitBounds(this.bounds);
            //this.heightmap.map.setView(Utils.latLonFrom(data.center), data.zoom);

            overlaymap.fitBounds(this.bounds);

        }

        if (data.lod !== oldData.lod) {
            if (data.lod >= 1 && data.lod <= data.lodCount) {
                this.loadOrApplyLOD(data.lod)
            }
        }
    },
    handleOverlayCanvas: function (event) {

        const data = this.data;
        const el = this.el;
        const renderer = this.el.sceneEl.renderer;
        const geomData = this.el.components.geometry.data;
        const matData = this.el.components.material.data;

        let canvas = event.detail.canvas;
        
        const factor = canvas.width / (geomData.width * data.pxToWorldRatio);

        if (data.useBuffer) {
            canvas = this.system.copyCanvas(canvas);
            
        }

        let material = null;
        //self.el.setAttribute('material', 'src', canvas);
        const mesh = el.getObject3D('mesh')

        for (let lod of this.lods) {
            //if (lod.factor === factor) {
            if (lod.lod === data.lod) {
                material = lod.material;
            }
        }
        
        if (!material) {
            
            // upload to GPU
            const texture = new THREE.CanvasTexture(canvas);
            renderer.setTexture2D(texture, 0);

            material = new THREE.MeshStandardMaterial()
            material.copy(mesh.material);

            material.displacementBias = matData.displacementBias;
            material.displacementMap = this.displacementMap;
            material.displacementScale = matData.displacementScale;
            material.map = texture;
            material.needsUpdate = true;

            for (let lod of this.lods) {
                if (lod.lod === data.lod) {
                    lod.material = material;
                }
            }
        }
        
        this.loadOrApplyLOD(data.lod);

        this._fire();

        if (!data.singleton) {  // TODO needed?
            this.el.sceneEl.removeEventListener(OVERLAYMAP_LOADED, this.handleOverlayCanvas)
        }
    },
    loadOrApplyLOD: function (lod) {

        console.log("apply LOD", lod)

        const el = this.el;
        const data = this.data;
        const geomData = el.components.geometry.data;

        const factor = 1 / lod;

        let foundLOD = null;
        for (let lodObj of this.lods) {
            if (lodObj.lod === lod) {
                foundLOD = lodObj;
            }
        }
        const mesh = el.getObject3D('mesh')
        if (!foundLOD.material) {

            const width = geomData.width * data.pxToWorldRatio * factor; 
            const height = geomData.height * data.pxToWorldRatio * factor;

            

            this.system.resize(this.overlaymap, width, height)
            //this.overlaymap.promise.then(this.handleOverlayCanvas)

        } else {
            mesh.material = foundLOD.material
        }

        mesh.geometry.setDrawRange(foundLOD.geometry.start, foundLOD.geometry.count)
        
    },
    createGeometryLODs: function () {

        const el = this.el;
        const data = this.data;
        const geomData = el.components.geometry.data;
        
        const mesh = el.getObject3D('mesh')
        const lodGeometries = [mesh.geometry]

        for (let i = 1; i < data.lodCount; i++) {
            const factor = i * GEOMETRY_LOD_FACTOR;

            let lodGeometry = new THREE.PlaneGeometry(
                geomData.width, geomData.height, 
                Math.floor(geomData.segmentsWidth / factor), Math.floor(geomData.segmentsHeight / factor)
            )

            lodGeometry = new THREE.BufferGeometry().fromGeometry(lodGeometry);
/*
            const lodGeometry = new THREE.PlaneBufferGeometry(
                geomData.width, geomData.height, 
                Math.floor(geomData.segmentsWidth / factor), Math.floor(geomData.segmentsHeight / factor)
            )
            */
            //console.log(lodGeometry)
            //console.log(lodGeometry.index.count)
            lodGeometries.push(lodGeometry)
        }
        let start = 0;
        for (let i=0; i < lodGeometries.length; i++) {
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

        const data = this.data;
        const renderer = this.el.sceneEl.renderer;

        let canvas = event.detail.canvas;
        const depthBuffer = event.detail.depthBuffer;

        canvas = data.useBuffer ? this.system.copyCanvas(canvas) : canvas;

        const texture = new THREE.CanvasTexture(canvas);
        renderer.setTexture2D(texture, 0);
        this.displacementMap = texture;

        for (let lod of this.lods) {
            if (lod.material) {
                lod.material.displacementMap = texture;
                lod.material.needsUpdate = true;
            }
        }

        if (data.depthBuffer) {
            this.system.renderDepthBuffer(depthBuffer);
            this.depthBuffer = depthBuffer;
        }
        this._fire();

        this.el.sceneEl.removeEventListener(HEIGHTMAP_LOADED, this.handleHeightmapCanvas)
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
    getMapInstance: function () {
        if (this.overlaymapDisposed) {
            throw new Error('Overlaymap disposed.');
        }
        return this.overlaymap;
    },
    getHeightmapInstance: function () {
        if (this.heightmapDisposed) {
            throw new Error('Heightmap disposed.');
        }
        return this.heightmap;
    }
});