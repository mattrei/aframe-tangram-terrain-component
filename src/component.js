/* global AFRAME THREE */

const Utils = require('./utils');

const TERRAIN_LOADED_EVENT = 'tangram-terrain-loaded';

const OVERLAYMAP_LOADED = 'overlaymap-loaded';
const HEIGHTMAP_LOADED = 'heightmap-loaded';

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
            default: 3,
            oneOf: [1, 2, 3, 4]
        }
    },

    multiple: false,

    init: function () {
        const data = this.data;
        const geomData = this.el.components.geometry.data;
        const matData = this.el.components.material.data;

        //console.log("GEOM ", this.el.components.geometry.geometry)

        this.depthBuffer = null;
        this.heightmap = this.system.createHeightmap(data, geomData);
        this.heightmapDisposed = false;
        this.overlaymap = this.system.createMap(data, geomData);
        this.overlaymapDisposed = false;

        const renderer = this.el.sceneEl.renderer;

        var self = this;

        this.displacementMap = null;

        //this.lodMaterials = []
        this.lods = []

        this.heightmap.promise.then(function (arr) {
            const canvas = data.useBuffer ? self.system.copyCanvas(arr[0]) : arr[0];

            console.log("setting heightmap")
            const texture = new THREE.CanvasTexture(canvas);
            renderer.setTexture2D(texture, 0);
            self.displacementMap = texture;

            for (let lod of self.lods) {
                lod.material.displacementMap = texture;
                lod.material.needsUpdate = true;
                //console.log(lodMaterial)
            }

            //self.el.setAttribute('material', 'displacementMap', canvas);


            if (data.depthBuffer) {
                const depthBuffer = arr[1];
                self.system.renderDepthBuffer(depthBuffer);
                self.depthBuffer = depthBuffer;
            }

            if (data.dispose) {
                self.system.dispose(self.heightmap);
            }
            self._fire();
        });


        this.el.sceneEl.addEventListener(OVERLAYMAP_LOADED, this.handleOverlayCanvas.bind(this));
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
            

            this.heightmap.map.setView(Utils.latLonFrom(data.center), data.zoom);

            overlaymap.fitBounds(this.bounds);
            if (data.lod !== oldData.lod) {
                console.log("Loading LOD", data.lod)
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

        console.log("factor", factor)


        let material = null;
        //self.el.setAttribute('material', 'src', canvas);
        const mesh = el.getObject3D('mesh')

        console.log("before")
        for (let lod of this.lods) {
            if (lod.factor === factor) {
                lod.visible = true;
                lod.material = lodMaterial;
                console.log("resuing material")
            } else {
                lod.visible = false;
            }
        }


        if (!material) {
            console.log("Creating material")
            //const schemaMaterial = mesh.material.constructor === Array ? mesh.material[0] : mesh.material

            // upload to GPU
            const texture = new THREE.CanvasTexture(canvas);
            renderer.setTexture2D(texture, 0);

            material = new THREE.MeshStandardMaterial()
            material.copy(mesh.material); // does not work yet

            material.displacementBias = matData.displacementBias;
            material.displacementMap = this.displacementMap; //mesh.material.displacementMap;
            material.displacementScale = matData.displacementScale;
            material.map = texture;
            material.userData = {
                factor: factor
            };
            material.visible = true;
            material.needsUpdate = true;

            this.lods.push({
                factor: factor,
                visible: true,
                material: material
            });
        }
        mesh.material = material

        if (data.dispose) {
            //self.system.dispose(self.overlaymap);
        }
        this._fire();
    },
    loadOrApplyLOD: function (factor) {
        const el = this.el;
        const data = this.data;
        const geomData = this.el.components.geometry.data;

        let foundLOD = null;
        for (let lod of this.lods) {
            if (lod.factor === factor) {
                foundLOD = lod;
            }
        }

        if (!foundLOD) {
            const width = geomData.width * data.pxToWorldRatio;
            const height = geomData.height * data.pxToWorldRatio;

            const container = this.overlaymap.canvasContainer;
            container.style.width = (width * factor) + 'px';
            container.style.height = (height * factor) + 'px';
            console.log("Changing container size to", container.style.width);
            
            this.overlaymap.map.invalidateSize({
                animate: false
            });
            this.overlaymap.map.fitBounds(this.bounds);
            // tangram reload?
        } else {
            const mesh = el.getObject3D('mesh')
            mesh.material = foundLOD.material
            
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