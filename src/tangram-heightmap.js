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
        mapzenAPIKey: {
            default: ''
        },
        style: {
            type: "asset",
            default: ''
        },
        scaleFactor: {
            type: 'int',
            default: 1
        },
        center: {
            // lat lon
            default: [0, 0],
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
            default: undefined,
            type: 'array',
            parse: value => {
                return value
            },
        },
        zoom: {
            default: 13
        },
        wireframe: {
            type: 'boolean',
            default: false
        },
        pxToWorldRatio: {
            type: 'int',
            default: 10
        },
        canvasOffsetPx: {
            type: 'int',
            default: 9999 // debug
        },
        // set the highest altitude
        highestAltitudeMeter: {
            type: 'int',
            default: undefined
        }
    },

    multiple: false,

    init: function() {
        this._minHeight = 0
        this._maxHeight = 0
        this._mapInstance = null
        this._scene = null

        this.altitudeAddition = 0

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
            scene: {
                import: heightmapStyle,
                global: {
                    sdk_mapzen_api_key: data.mapzenAPIKey
                }
            },
            attribution: '',
        });

        var scene = this._scene = layer.scene

        layer.on('init', _ => {
            // resetViewComplete();
            scene.subscribe({
                // will be triggered when tiles are finished loading
                // and also manually by the moveend event
                view_complete: this._start_analysis.bind(this)
            });

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

        // range is 0 to 255 which is 8900 meters according to heightmap-style
        this._minHeight = min
        this._maxHeight = max

        var highestMeter = max / 255 * 8900

        if (this.data.highestAltitudeMeter) {
            this.altitudeAddition = this.data.highestAltitudeMeter - highestMeter
        }

        if (empty) {
            console.warn("no pixels found")
            // no pixels found, skip the analysis
            return false;
        }


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
            scene: {
                import: sceneStyle,
                global: {
                    sdk_mapzen_api_key: data.mapzenAPIKey
                }
            },
            attribution: ''
        });
        layer.addTo(map);

        var once = true
        layer.scene.subscribe({

            view_complete: _ => {
                // dirty fix: refresh map after initial render
                if (once) {
                    once = false
                    console.log("ONCE")
                    map.fitBounds(map.getBounds())
                    return
                }


                var mesh = this.el.getOrCreateObject3D('mesh', THREE.Mesh);
                mesh.geometry = geometry
                
                processCanvasElement(canvasContainer)
                const canvasId = document.querySelector(`#${_canvasContainerId} canvas`).id;
                this.el.setAttribute('material', 'src', `#${canvasId}`);

                console.log("DONE")

                this.el.emit(HEIGHTMAP_LOADED_EVENT);
            }
        })

        const heightMapBounds = this._mapInstance.getBounds()
        map.fitBounds(heightMapBounds)
    },
    _createTerrain: function() {


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
            vertices[j + 2] = this._scale(this.terrainData[i] + this.altitudeAddition)
        }
        geometry.computeFaceNormals();
        geometry.computeBoundingBox();

        console.log("Terrain finished")
            //var texture = new THREE.CanvasTexture(this.heightMapCanvas);
        this._initMap(geometry)
    },
    _scale: function(value) {

        const {
            width: elWidth,
            segmentsWidth: elSegmentsWidth,
        } = this.el.components.geometry.data;

        const densityFactor = elWidth / elSegmentsWidth
        const zoomScaleFactor = this.data.zoom * 0.5 //this._mapInstance.getZoom()

        var height = (value * 0.05) * zoomScaleFactor * densityFactor * this.data.scaleFactor;
        return height ? height - this._minHeight : 0
    },


    remove: function() {},

    tick: function(delta, time) {},

    _getAltitudeFromXY: function(x, y) {
        const idx = this._scene.canvas.width * y + x
        return this.terrainData[idx] / 255 * 8900 + this.altitudeAddition
    },

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
        //console.log(idx)
        var z = this._scale(this.terrainData[idx]  + this.altitudeAddition)
        //console.log(z)

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
    },
    distanceTo(lngLat) {
        // TODO add altitude, has it an effect?
        return L.latLng(lngLat).distanceTo(this.data.center)
    },
    altitudeTo(lngLat) {

        var data = this.data

        const {
            x: currX,
            y: currY
        } = this._mapInstance.latLngToLayerPoint([data.center[1], data.center[0]]);

        var currAltitude = this._getAltitudeFromXY(currX, currY)

        return currAltitude - this.getAltitude(lngLat)
    },
    getAltitude(lngLat) {
        const {
            x: givenX,
            y: givenY
        } = this._mapInstance.latLngToLayerPoint([lngLat[1], lngLat[0]]);

        return this._getAltitudeFromXY(givenX, givenY)
    }
});