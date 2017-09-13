/* global AFRAME THREE Tangram L */

const L = require('leaflet');
const Tangram = require('tangram');

const Utils = require('./src/utils')

if (typeof AFRAME === 'undefined') {
    throw new Error('Component attempted to register before AFRAME was available.');
}

const cuid = require('cuid');

const heightmapStyle = require('./src/heightmap-style.yaml');

const MODEL_LOADED_EVENT = 'model-loaded';

// TODO make configurable?
var tempFactor = 1; // size of heightMapCanvas relative to main canvas: 1/n

AFRAME.registerComponent('tangram-terrain', {
    dependencies: [
        'geometry',
        'material'
    ],

    schema: {
        mapzenAPIKey: {
            default: ''
        },
        style: {
            type: 'asset',
            default: ''
        },
        preset: {
            oneOf: ['elevation', 'grayscale', 'hypsometric-adjusted']
        },
        center: {
            // lat lon
            default: [0, 0],
            type: 'array'
        },
        /**
            [0] southwest
            [1] northeast
        */
        maxBounds: {
            default: [],
            type: 'array'
        },
        fitBounds: {
            default: [],
            type: 'array'
        },
        zoom: {
            default: 13
        },
        pxToWorldRatio: {
            default: 10
        },
        canvasOffsetPx: {
            type: 'int',
            default: 9999 // debug
        },
        // set the highest altitude
        highestAltitudeMeter: {
            type: 'int',
            default: 0
        }
    },

    multiple: false,

    init: function() {
        this._minHeight = 0;
        this._maxHeight = 0;
        this._mapInstance = null;
        this._scene = null;

        this.canvasWidth = 0
        this.canvasHeigth = 0

        this.altitudeAddition = 0;

        this.terrainData = [];

        this._initHeightMap();
        //this._initMap();
    },
    _initHeightMap: function() {
        const self = this;
        var data = this.data;

        const geomComponent = this.el.components.geometry;

        const width = geomComponent.data.width * this.data.pxToWorldRatio;
        const height = geomComponent.data.height * this.data.pxToWorldRatio;

        const _canvasContainerId = cuid();
        const canvasContainer = Utils.getCanvasContainerAssetElement(_canvasContainerId,
            width, height, data.canvasOffsetPx);

        var map = L.map(canvasContainer, Utils.leafletOptions);

        var layer = Tangram.leafletLayer({
            scene: {
                import: heightmapStyle,
                global: {
                    sdk_mapzen_api_key: data.mapzenAPIKey
                }
            },
            webGLContextOptions: {
                preserveDrawingBuffer: true
            },
            attribution: ''
        });

        //this._scene = layer.scene;


        layer.on('init', function() {
            // resetViewComplete();
            layer.scene.subscribe({
                // will be triggered when tiles are finished loading
                // and also manually by the moveend event
                view_complete: function() {

                    self.canvasWidth = layer.scene.canvas.width
                    self.canvasHeight = layer.scene.canvas.height
                    self._start_analysis(layer.scene);

                    var mesh = self.el.getObject3D('mesh');

                    self.el.setAttribute('material', 'displacementMap', layer.scene.canvas);

                    const {
                        width: elWidth,
                        height: elHeight,
                        segmentsWidth: elSegmentsWidth,
                        segmentsHeight: elSegmentsHeight
                    } = self.el.components.geometry.data;

                    var geometry = new THREE.PlaneBufferGeometry(
                        elWidth, elHeight,
                        elSegmentsWidth - 1, elSegmentsHeight - 1);

                    mesh.geometry = geometry;

                    self._initMap();
                }
            });
        });
        layer.addTo(map);

        /*
        this._mapInstance = map;

        if (data.maxBounds.length > 0) this._mapInstance.setMaxBounds(L.latLngBounds(this.data.maxBounds));
        if (data.fitBounds.length > 0) this._mapInstance.fitBounds(L.latLngBounds(this.data.fitBounds));
        */
        map.setView(Utils.latLonFrom(this.data.center), this.data.zoom);

    },
    _start_analysis: function(scene) {

        var width = scene.canvas.width
        var height = scene.canvas.height

        // based on https://github.com/tangrams/heightmapper/blob/gh-pages/main.js

        var heightMapCanvas = document.createElement('canvas');
        heightMapCanvas.width = width;
        heightMapCanvas.height = height;

        var ctx = heightMapCanvas.getContext('2d');
        ctx.drawImage(scene.canvas, 0, 0, width, height);

        // get all the pixels
        var pixels = ctx.getImageData(0, 0, width, height);

        var val;
        var counts = {};
        var empty = true;
        var max = 0;
        var min = 255;

        // const geomComponent = this.el.components.geometry;
        // only check every 4th pixel (vary with browser size)
        // var stride = Math.round(img.height * img.width / 1000000);
        // 4 = only sample the red value in [R, G, B, A]
        for (var i = 0; i < height * width * 4; i += 4) {
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


            this.terrainData.push(val);
        }


//        console.log(this.terrainData.length)
//        console.log('MIN/MAX: ' + min + '  ' + max)

        // range is 0 to 255 which is 8900 meters according to heightmap-style
        this._minHeight = min;
        this._maxHeight = max;

        var highestMeter = max / 255 * 8900;

        if (this.data.highestAltitudeMeter > 0) {
            this.altitudeAddition = this.data.highestAltitudeMeter - highestMeter;
        }

        // remove canvas and destroy scene
        //heightMapCanvas.remove();
        //scene.destroy()

        //this._createTerrain();
    },
    _initMap: function() {
        var self = this;

        // is probably a good thing to remove element
        //document.getElementById(this._canvasContainerId).remove();

        const data = this.data;

        const geomComponent = this.el.components.geometry;

        const width = geomComponent.data.width * this.data.pxToWorldRatio;
        const height = geomComponent.data.height * this.data.pxToWorldRatio;

        var _canvasContainerId = cuid();
        const canvasContainer = Utils.getCanvasContainerAssetElement(_canvasContainerId,
            width, height, data.canvasOffsetPx + 999);

        var map = L.map(canvasContainer, Utils.leafletOptions);

        const sceneStyle = Utils.processStyle(data.style);

        var layer = Tangram.leafletLayer({
            scene: {
                import: sceneStyle,
                global: {
                    sdk_mapzen_api_key: data.mapzenAPIKey
                }
            },
            webGLContextOptions: {
                preserveDrawingBuffer: true
            },
            attribution: ''
        });

        layer.scene.subscribe({
            load: function() {
                Utils.processCanvasElement(canvasContainer);
            },
            view_complete: function() {
                const canvasId = document.querySelector('#' + _canvasContainerId + ' canvas').id;
                self.el.setAttribute('material', 'src', '#' + canvasId);
                self.el.emit(MODEL_LOADED_EVENT);
            }
        });
        layer.addTo(map);



        // TODO?
        this._scene = layer.scene;
        this._mapInstance = map;

        this._mapInstance.setView(Utils.latLonFrom(this.data.center), this.data.zoom);
    },
    _scale: function(value) {
        const {
            width: elWidth,
            segmentsWidth: elSegmentsWidth
        } = this.el.components.geometry.data;

        const densityFactor = elWidth / elSegmentsWidth;
        const zoomScaleFactor = this.data.zoom * 0.2; // this._mapInstance.getZoom()

        var height = (value * 0.18) * zoomScaleFactor * densityFactor * this.data.scaleFactor;
        return height;
        //return height ? height - this._minHeight : 0;
    },

    remove: function() {
        this._scene.destroy();
    },

    tick: function(delta, time) {},

    project: function(lon, lat) {

        var px = this._mapInstance.latLngToLayerPoint([lat, lon]);

        const el = this.el.components.geometry.data;
        const scale = this.el.components.material.data.displacementScale;;

        const idx = this.canvasWidth * px.y + px.x;
        //var z = this._scale(this.terrainData[idx] + this.altitudeAddition);
        var z = this.terrainData[idx] / 254 * scale
        console.log(z)

        return {
            x: (px.x / this.data.pxToWorldRatio) - (el.width / 2),
            // y-coord is inverted (positive up in world space, positive down in
            // pixel space)
            y: -(px.y / this.data.pxToWorldRatio) + (el.height / 2),
            z: z
        };

    },
    unproject: function(x, y) {

        const el = this.el.components.geometry.data;

        // Converting back to pixel space
        const pxX = (x + (el.width / 2)) * this.data.pxToWorldRatio;
        // y-coord is inverted (positive up in world space, positive down in
        // pixel space)
        const pxY = ((el.height / 2) - y) * this.data.pxToWorldRatio;

        // Return the lat / long of that pixel on the map
        var latLng = this._mapInstance.layerPointToLatLng([pxX, pxY]);
        console.log("Real " + pxX)
        return {
            lon: latLng.lng,
            lat: latLng.lat
        };

    },
    unprojectAlitude: function(x, y) {
        const idx = this.canvasWidth * y + x;
        return this.terrainData[idx] / 255 * 8900 + this.altitudeAddition;
    },
    projectAltitude: function(lng, lat) {
        const {
            x: givenX,
            y: givenY
        } = this._mapInstance.latLngToLayerPoint([lat, lng]);

        return this.unprojectAlitude(givenX, givenY);
    },
    getLeafletInstance: function() {
            return this._mapInstance;
        }
        /*
        addGeoJSON (geojson) {
          this.geojsonLayer.addData(geojson);
          console.log('added');
        }
        */
});