/* global AFRAME */

const latLonFrom = require('./utils').latLonFrom
const leafletOptions = require('./utils').leafletOptions
const getCanvasContainerAssetElement = require('./utils').getCanvasContainerAssetElement
const processStyle = require('./utils').processStyle
const processCanvasElement = require('./utils').processCanvasElement

if (typeof AFRAME === 'undefined') {
    throw new Error('Component attempted to register before AFRAME was available.');
}

const cuid = require('cuid')

const heightmapStyle = require('./heightmap-style.yaml');
require('leaflet')

const HEIGHTMAP_LOADED_EVENT = 'tangram-heightmap-loaded';

// TODO make configurable?
var tempFactor = 1; // size of heightMapCanvas relative to main canvas: 1/n

AFRAME.registerComponent('tangram-heightmap', {
    dependencies: [
        'geometry',
        'material'
    ],

    schema: {
        style: {
            type: "asset",
            default: ''
        },
        scaleFactor: {
            default: 1
        },
        center: {
            // lat lon
            default: [0, 0], //[47.7671, 15.8056], // Schneeberg
            type: 'array',
        },
        /**
            [0] southwest
            [1] northeast
        */
        maxBounds: {
            default: undefined,
            type: 'array',
            parse: value => {
                return value
            },
        },
        fitBounds: {
            default: undefined, //GROSSGLOCKNER,
            type: 'array',
            parse: value => {
                return value
            },
        },
        zoom: {
            default: 13
        },
        wireframe: {
            default: false
        },
        pxToWorldRatio: {
            default: 10
        },
        canvasOffsetPx: {
            default: 9999 // debug
        }
    },

    multiple: false,

    init: function() {
        this._minHeight = 0
        this._maxHeight = 0
        this.analysed = false
        this.analysing = false
        this._mapInstance = null
        this._scene = null
        this.terrainData = []

        this._initHeightMap()
    },
    _initHeightMap: function() {

        var data = this.data

        const geomComponent = this.el.components.geometry;
        var width = geomComponent.data.segmentsWidth
        var height = geomComponent.data.segmentsHeight

        this._canvasContainerId = cuid();
        const canvasContainer = getCanvasContainerAssetElement(this._canvasContainerId,
            width, height, data.canvasOffsetPx);

        var map = L.map(canvasContainer, leafletOptions);

        var layer = Tangram.leafletLayer({
            scene: heightmapStyle,
            attribution: '',
            postUpdate: _ => {
                // three stages:
                // 1) start analysis
                if (!this.analysing && !this.analysed) {
                    //console.log("EXPOSING")
                    this._expose()
                }
                // 2) continue analysis
                else if (this.analysing && !this.analysed) {
                    //console.log("START")
                    this._start_analysis();
                    this.analysed = false
                }
                /*else if (this.analysed) {
                                       // reset after next update (however that might be done)
                                       //console.log("ANALYSED")
                                       this._createTerrain()
                                       this.analysed = false
                                   }*/
            }
        });

        var scene = this._scene = layer.scene

        layer.on('init', _ => {
            // resetViewComplete();
            scene.subscribe({
                // will be triggered when tiles are finished loading
                // and also manually by the moveend event
                view_complete: function() {}
            });
            this.scene_loaded = true;

            var heightMapCanvas = document.createElement("canvas")
            heightMapCanvas.width = scene.canvas.width / tempFactor
            heightMapCanvas.height = scene.canvas.height / tempFactor

            this.heightMapCanvas = heightMapCanvas
        });
        layer.addTo(map);
        this._mapInstance = map

        if (data.maxBounds) this._mapInstance.setMaxBounds(L.latLngBounds(this.data.maxBounds))
        if (data.fitBounds) this._mapInstance.fitBounds(L.latLngBounds(this.data.fitBounds))
        this._mapInstance.setView(latLonFrom(this.data.center), this.data.zoom)
    },
    _expose: function() {
        this.analysing = true;
        if (this.scene_loaded) {
            this._start_analysis();
        } else {
            // wait for scene to initialize first
            this.scene.initializing.then(function() {
                this._start_analysis();
            });
        }
    },
    _start_analysis: function() {

        // based on https://github.com/tangrams/heightmapper/blob/gh-pages/main.js
        var scene = this._scene
        var canvas = this.heightMapCanvas

        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // redraw canvas smaller in testing canvas, for speed
        ctx.drawImage(scene.canvas, 0, 0, scene.canvas.width / tempFactor, scene.canvas.height / tempFactor);

        // get all the pixels
        var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

        var val;
        var counts = {};
        var empty = true;
        var max = 0,
            min = 255;


        const geomComponent = this.el.components.geometry;
        // only check every 4th pixel (vary with browser size)
        // var stride = Math.round(img.height * img.width / 1000000);
        // 4 = only sample the red value in [R, G, B, A]
        for (var i = 0; i < canvas.height * canvas.width * 4; i += 4) {
            val = pixels.data[i];
            var alpha = pixels.data[i + 3];
            if (alpha === 0) { // empty pixel, skip to the next one
                continue;
            }
            // if we got this far, we found at least one non-empty pixel!
            empty = false;

            // update counts, to get a histogram
            counts[val] = counts[val] ? counts[val] + 1 : 1;

            // update min and max so far
            min = Math.min(min, val);
            max = Math.max(max, val);

            this.terrainData.push(val)
        }

        this._minHeight = min
        this._maxHeight = max

        if (empty) {
            // no pixels found, skip the analysis
            return false;
        }


        this.analysing = false;
        this.analysed = true
        this._createTerrain()
    },
    _initMap: function(geometry) {

        var data = this.data

        const geomComponent = this.el.components.geometry;
        var width = Math.min(4096, THREE.Math.nextPowerOfTwo(geomComponent.data.width * data.pxToWorldRatio))
        var height = Math.min(4096, THREE.Math.nextPowerOfTwo(geomComponent.data.height * data.pxToWorldRatio))

        console.log(geomComponent.data.width + ' ' + width)

        var _canvasContainerId = cuid();
        const canvasContainer = getCanvasContainerAssetElement(_canvasContainerId,
            width, height, data.canvasOffsetPx);


        const renderer = L.canvas({
            padding: 0
        })

        const options = Object.assign({
                renderer
            },
            leafletOptions)

        var map = L.map(canvasContainer, options);


        const sceneStyle = processStyle(data.style);

        var layer = Tangram.leafletLayer({
            scene: sceneStyle,
            attribution: '',
            postUpdate: _ => {
                
                /*
                processCanvasElement(canvasContainer)
                const canvasId = document.querySelector(`#${_canvasContainerId} canvas`).id;
                this.el.setAttribute('material', 'width', `1024`);
                this.el.setAttribute('material', 'height', `1024`);
                this.el.setAttribute('material', 'src', `#${canvasId}`);
                */

                var texture = new THREE.CanvasTexture(layer.scene.canvas);
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                var mesh = this.el.getObject3D('mesh')
                mesh.material.map = texture
                mesh.material.needsUpdate = true


                var mesh = new THREE.Mesh(geometry,
                    new THREE.MeshBasicMaterial({
                        map: texture,
                        wireframe: this.data.wireframe,
                        transparent: false
                    }));
                this.el.setObject3D('mesh', mesh)

                this.el.emit(HEIGHTMAP_LOADED_EVENT);
            }
        });
        layer.addTo(map);

        const heightMapBounds = this._mapInstance.getBounds()
        map.fitBounds(heightMapBounds)
    },
    _createTerrain: function() {

        if (!this.analysed) return

        var data = this.terrainData

        const {
            width: elWidth,
            height: elHeight,
            segmentsWidth: elSegmentsWidth,
            segmentsHeight: elSegmentsHeight
        } = this.el.components.geometry.data;

        var geometry = new THREE.PlaneBufferGeometry(
            elWidth, elHeight,
            elSegmentsWidth - 1, elSegmentsHeight - 1)
        var vertices = geometry.attributes.position.array;
        //https://stackoverflow.com/questions/37927031/how-to-update-the-topology-of-a-geometry-efficiently-in-threejs
        for (var i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
            // only set z values (note: planes are not standing by default)
            vertices[j + 2] = this._scale(data[i])
        }
        geometry.computeFaceNormals();
        geometry.computeBoundingBox();

        //var texture = new THREE.CanvasTexture(this.heightMapCanvas);
        this._initMap(geometry)
    },
    _scale: function(value) {

        const {
            width: elWidth,
            segmentsWidth: elSegmentsWidth,
        } = this.el.components.geometry.data;

        const densityFactor = elWidth / elSegmentsWidth
        const zoomScaleFactor = this._mapInstance.getZoom()

        var height = (value * 0.05) * zoomScaleFactor * densityFactor * this.data.scaleFactor;
        return height ? height - this._minHeight : 0
    },


    remove: function() {},

    tick: function(delta, time) {},

    project(lon, lat) {

        // The position (origin at top-left corner) in pixel space
        let {
            x: pxX,
            y: pxY
        } = this._mapInstance.latLngToLayerPoint([lat, lon]);

        const {
            width: elWidth,
            height: elHeight
        } = this.el.components.geometry.data;


        const idx = this._scene.canvas.width * pxY + pxX
        var z = this._scale(this.terrainData[idx])

        pxX /= this._scene.canvas.width
        pxY /= this._scene.canvas.height

        pxX *= elWidth
        pxY *= elHeight

        return {
            x: pxX - (elWidth / 2),
            // y-coord is inverted (positive up in world space, positive down in
            // pixel space)
            y: -pxY + (elHeight / 2),
            z: z,
        };

    },

    unproject(x, y) {

        // The 3D world size of the entity
        const {
            width: elWidth,
            height: elHeight
        } = this.el.components.geometry.data;

        const pxX = (x + (elWidth / 2));
        // y-coord is inverted (positive up in world space, positive down in
        // pixel space)
        const pxY = ((elHeight / 2) - y);


        var nx = pxX / elWidth
        var ny = pxY / elHeight

        nx *= this._scene.canvas.width
        ny *= this._scene.canvas.height

        // Return the lat / long of that pixel on the map
        var latLng = this._mapInstance.layerPointToLatLng([nx, ny])
        return {
            lat: latLng.lat,
            lon: latLng.lng
        }
    }
});