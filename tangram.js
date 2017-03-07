/* global AFRAME */

if (typeof AFRAME === 'undefined') {
    throw new Error('Component attempted to register before AFRAME was available.');
}

const cuid = require('cuid')

const heightmapStyle = require('./heightmap-style.yaml');
const defaultMapStyle = require('./simple-style.yaml');
require('leaflet')


const HEIGHTMAP_LOADED_EVENT = 'heightmap-loaded';
const MAP_LOADED_EVENT = 'map-loaded';
const MAP_MOVE_END_EVENT = 'map-moveend';


var tempFactor = 1; // size of heightMapCanvas relative to main canvas: 1/n

const SCHNEEBERG = [
    [
        47.71068560344829,
        15.732078552246092
    ],
    [
        47.80312425148172,
        15.910263061523438
    ]
]

const GROSSGLOCKNER = [
    [
        47.05807780212467,
        12.608699798583984,

    ],
    [
        47.12878286652481,
        12.805938720703123,

    ]
]

const leafletOptions = {
    "preferCanvas": true,
    "keyboard": false,
    "scrollWheelZoom": true,
    "tap": false,
    "touchZoom": false,
    "zoomControl": false,
    "attributionControl": false,
    "doubleClickZoom": false,
    "trackResize": false,
    "boxZoom": false,
    "dragging": false,
    "zoomAnimation": false,
    "fadeAnimation": false,
    "markerZoomAnimation": false,

}


function getCanvasContainerAssetElement(id, width, height, left) {

    let element = document.querySelector(`#${id}`);

    if (!element) {
        element = document.createElement('div');
    }

    element.setAttribute('id', id);
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;

    // This is necessary because leaflet like mapbox-gl uses the offsetWidth/Height of the
    // container element to calculate the canvas size.  But those values are 0 if
    // the element (or its parent) are hidden. `position: fixed` means it can be
    // calculated correctly.
    element.style.position = 'fixed';
    element.style.left = `${left}px`;
    element.style.top = '0';

    if (!document.body.contains(element)) {
        document.body.appendChild(element);
    }

    return element;
}

function processCanvasElement(canvasContainer) {
    const canvas = canvasContainer.querySelector('canvas');
    canvas.setAttribute('id', cuid());
    canvas.setAttribute('crossOrigin', 'anonymous');
}

function processStyle(style) {

    if (!style) {
        return defaultMapStyle;
    }

    return style;
}


/**
 * Tangram component for A-Frame.
 */
AFRAME.registerComponent('tangram', {
    dependencies: [
        'geometry',
        'material'
    ],

    schema: {
        style: {
            type: "asset",
            default: ''
        },
        asHeightMap: {
            type: 'boolean',
            default: true
        },
        heightScale: {
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
        pxToWorldRatio: {
            default: 100
        },
        markers: {
            type: "asset"
        }
    },

    multiple: false,

    init: function() {
        this.enabled = true
        this.analysed = false
        this.analysing = false
        this.creating = false
        this.creatingMap = false
        this._mapInstance = null
        this._scene = null

        this.terrainData = []

        if (this.data.asHeightMap) {
            this._initHeightMap()
        } else {
            this._initMap()
        }

    },
    update: function(oldData) {
        // Nothing changed
        if (AFRAME.utils.deepEqual(oldData, this.data)) {
            return;
        }
        // Everything after this requires a map instance
        if (!this._mapInstance) {
            return;
        }

        if (!AFRAME.utils.deepEqual(oldData.maxBounds, this.data.maxBounds)) {
            var bounds = L.latLngBounds(this.data.maxBounds);
            this._mapInstance.setMaxBounds(bounds)
        }

        var moved = false;
        if (!AFRAME.utils.deepEqual(oldData.center, this.data.center)) {
            moved = true
            this._mapInstance.setView(this.data.center, this.data.zoom)
        }

        if (!AFRAME.utils.deepEqual(oldData.fitBounds, this.data.fitBounds)) {
            moved = true
            var bounds = L.latLngBounds(this.data.fitBounds);
            this._mapInstance.fitBounds(bounds)
        }

        if (moved) {
            // A way to signal when these async actions have completed
            this._mapInstance.once('moveend', e => {
                this.el.emit(MAP_MOVE_END_EVENT);
            });
        }

        console.log("after update")

    },
    _initMap: function() {
        var data = this.data

        const geomComponent = this.el.components.geometry;
        var width = geomComponent.data.width * this.data.pxToWorldRatio
        var height = geomComponent.data.height * this.data.pxToWorldRatio

        var _canvasContainerId = cuid();
        // TODO
        const canvasContainer = getCanvasContainerAssetElement(_canvasContainerId,
            width, height, 0);


        const renderer = L.canvas({
            padding: 0.,
            pane: 'mapPane'
        })


        const options = Object.assign({
                renderer
            },
            leafletOptions)

        var map = L.map(canvasContainer,
            options);



        const sceneStyle = processStyle(this.data.style);

        var layer = Tangram.leafletLayer({
            scene: sceneStyle,
            attribution: '',
            postUpdate: _ => {
                this.el.emit(MAP_LOADED_EVENT);
            }
        });

        var scene = this._scene = layer.scene
        layer.on('init', _ => {
            // resetViewComplete();
            scene.subscribe({
                // will be triggered when tiles are finished loading
                // and also manually by the moveend event
                view_complete: () => {}
            });
            this.mapScene_loaded = true;

            processCanvasElement(canvasContainer)

            const canvasId = document.querySelector(`#${_canvasContainerId} canvas`).id;
            this.el.setAttribute('material', 'src', `#${canvasId}`);

        });
        layer.addTo(map);

        this._mapInstance = map

    },
    _initHeightMap: function() {

        var data = this.data

        const geomComponent = this.el.components.geometry;
        var width = geomComponent.data.segmentsWidth
        var height = geomComponent.data.segmentsHeight

        var _canvasContainerId = cuid();
        const canvasContainer = getCanvasContainerAssetElement(_canvasContainerId,
            width, height, 500);

        var map = L.map(canvasContainer, leafletOptions);

        var layer = Tangram.leafletLayer({
            scene: heightmapStyle, //'heightScene.yaml',
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

    },
    _createHeightMap: function() {

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
        console.log(canvas.width)

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

        if (empty) {
            // no pixels found, skip the analysis
            return false;
        }


        this.analysing = false;
        this.analysed = true
        this._createTerrain()
    },

    _createMap: function() {

        if (this.creatingMap) return


        console.log("Creating map")
        this.creatingMap = true

        var scene = this.mapScene
        var mapCanvas = this.mapCanvas
        var ctx = mapCanvas.getContext("2d");
        ctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);


        // redraw canvas smaller in testing canvas, for speed
        ctx.drawImage(scene.canvas, 0, 0, scene.canvas.width / tempFactor, scene.canvas.height / tempFactor);


        var texture = new THREE.CanvasTexture(mapCanvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;


        var mesh = this.el.getObject3D('mesh')
        console.log(mesh)
        mesh.material.map = texture
        mesh.material.needsUpdate = true

        this.creatingMap = false
        console.log("Created map")

    },

    _createTerrain: function() {

        if (!this.analysed || this.creating) return
        this.creating = true

        var data = this.terrainData

        console.log("Creating terrain")
        const {
            width: elWidth,
            height: elHeight,
            segmentsWidth: elSegmentsWidth,
            segmentsHeight: elSegmentsHeight
        } = this.el.components.geometry.data;
        
        //var geometry = this.el.components.geometry.geometry
        //var vertices = geometry.getAttribute('position')//geometry.attributes.position.array;

        geometry = new THREE.PlaneBufferGeometry(
                elWidth * this.data.pxToWorldRatio, elHeight * this.data.pxToWorldRatio,
                elSegmentsWidth -1, elSegmentsHeight -1)
        var vertices = geometry.attributes.position.array;
        //https://stackoverflow.com/questions/37927031/how-to-update-the-topology-of-a-geometry-efficiently-in-threejs
        for (var i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
            // only set z values (note: planes are not standing by default)
            vertices[j + 2] = this._scale(data[i])
            //geometry.attributes.position.setZ(j , this._scale(data[i]))
        }
        //geometry.attributes.position.needsUpdate = true;
        geometry.computeFaceNormals();
        geometry.computeBoundingBox();


        var texture = new THREE.CanvasTexture(this.heightMapCanvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;


        var mesh = new THREE.Mesh(geometry,
            new THREE.MeshBasicMaterial({
                map: texture,
                wireframe: true
            }));

        this.creating = false
        this.el.setObject3D('mesh', mesh)

        this.el.emit(HEIGHTMAP_LOADED_EVENT);

        console.log("Created terrain")
            //this._initMap()

    },
    _scale: function(value) {

        const {
            width: elWidth,
            segmentsWidth: elSegmentsWidth,
        } = this.el.components.geometry.data;

        const densityFactor = elWidth / elSegmentsWidth
        const zoomScaleFactor = this._mapInstance.getZoom()

        var height = (value * 0.05) * zoomScaleFactor * densityFactor * this.data.heightScale;
        return height ? height : 0
    },


    remove: function() {},

    tick: function(delta, time) {},

    project(lat, long) {

        // The position (origin at top-left corner) in pixel space
        let {
            x: pxX,
            y: pxY
        } = this._mapInstance.latLngToLayerPoint([lat, long]);

        const {
            width: elWidth,
            height: elHeight
        } = this.el.components.geometry.data;


        const idx = this._scene.canvas.width * pxY + pxX
        var z = this.data.asHeightMap ? this._scale(this.terrainData[idx]) : 0


        if (this.data.asHeightMap) {
            pxX /= this._scene.canvas.width
            pxY /= this._scene.canvas.height

            pxX *= elWidth
            pxY *= elHeight
        }


        return {
            x: (pxX / this.data.pxToWorldRatio) - (elWidth / 2),
            // y-coord is inverted (positive up in world space, positive down in
            // pixel space)
            y: -(pxY / this.data.pxToWorldRatio) + (elHeight / 2),
            z: z,
        };

    },

    unproject(x, y) {

        // The 3D world size of the entity
        const {
            width: elWidth,
            height: elHeight
        } = this.el.components.geometry.data;

        if (this.data.asHeightMap) {


            const pxX = (x + (elWidth / 2)) * this.data.pxToWorldRatio;
            // y-coord is inverted (positive up in world space, positive down in
            // pixel space)
            const pxY = ((elHeight / 2) - y) * this.data.pxToWorldRatio;


            var nx = pxX / elWidth
            var ny = pxY / elHeight

            nx *= this._scene.canvas.width
            ny *= this._scene.canvas.height
            console.log(pxX + ' ' + pxY + '|' + nx + ' ' + ny)

            // Return the lat / long of that pixel on the map
            var latLng = this._mapInstance.layerPointToLatLng([nx, ny])
            console.log(latLng.lat + ' ' + latLng.lng)
            return {
                lat: latLng.lat,
                lon: latLng.lng
            }

        } else {
            // Converting back to pixel space
            const pxX = (x + (elWidth / 2)) * this.data.pxToWorldRatio;
            // y-coord is inverted (positive up in world space, positive down in
            // pixel space)
            const pxY = ((elHeight / 2) - y) * this.data.pxToWorldRatio;

            // Return the lat / long of that pixel on the map
            var latLng = this._mapInstance.layerPointToLatLng([pxX, pxY])
            return {
                lat: latLng.lat,
                lon: latLng.lng
            }
        }


    }
});


        /*
                var loader = new THREE.FileLoader();
                loader.load(data.markers, file => {
                    const geojson = JSON.parse(file)
                    var geojsonLayer = L.geoJSON(geojson) //.addTo(map);
                    map.fitBounds(geojsonLayer.getBounds());
                    console.log(this.project(15.814647674560547,
                      47.77682884663196))
                })
        */
