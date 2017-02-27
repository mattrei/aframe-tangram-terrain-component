/* global AFRAME */

if (typeof AFRAME === 'undefined') {
    throw new Error('Component attempted to register before AFRAME was available.');
}

require('leaflet')

const MAP_LOADED_EVENT = 'map-loaded';

var tempFactor = 1; // size of heightMapCanvas relative to main canvas: 1/n


const WIDTH = 50
const HEIGHT = 50

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

const mapOptions = {
            "keyboardZoomOffset": .05,
            "inertiaDeceleration": 10000,
            "zoomSnap": .001,
            "zoomAnimation": false,
            "fadeAnimation": false,
            "markerZoomAnimation": false,
        }

/**
 * Tangram component for A-Frame.
 */
AFRAME.registerComponent('tangram-heightmap', {
    dependencies: [
        'geometry',
    ],

    schema: {
        map: {
            type: "selector"
        },
        heightMap: {
            type: "selector"
        },
        heightScale: {
            default: 3
        },
        center: {
            default: [47.7671, 15.8056], // Schneeberg
            type: 'array',
        },
        /**
            [0] southwest
            [1] northeast
        */
        maxBounds: {
            default: GROSSGLOCKNER,
            /*
            default: [
                [
                    47.71068560344829,
                    15.732078552246092
                ],
                [
                    47.80312425148172,
                    15.910263061523438
                ]
            ],
            */
            //[[0, 0], [0, 0]],
            type: 'array',
            parse: value => {
                return value
            },
        },
        // only needed if center is specified
        zoomLevel: {
            default: 11.5
        },
        // TODO
        pxToWorldRatio: {
            default: 1//100
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

        this.terrainData = []


        this._initHeightMap()
        
    },
    _initMap: function() {
        var data = this.data

        var map = L.map(this.data.map, mapOptions);

        var layer = Tangram.leafletLayer({
            scene: 'scene.yaml', // TODO make configurable
            attribution: '',
            postUpdate: _ => {
                if (this.enabled) {
                    if (!this.creatingMap) {
                        this._createMap()
                    }
                }
            }
        });

        var scene = layer.scene

        // setView expects format ([lat, long], zoom)
        map.setView(data.center, data.zoomLevel);
        map.setMaxBounds(data.maxBounds)
        map.fitBounds(data.maxBounds);


        layer.on('init', _ => {
            // resetViewComplete();
            scene.subscribe({
                // will be triggered when tiles are finished loading
                // and also manually by the moveend event
                view_complete: function() {}
            });
            this.mapScene_loaded = true;
            var mapCanvas = document.createElement("canvas");
            // document.body.appendChild(heightMapCanvas);
            // heightMapCanvas.style.position = "absolute";
            // heightMapCanvas.style.zIndex = 10000;
            mapCanvas.width = this.worldWidth = scene.canvas.width / tempFactor;
            mapCanvas.height = this.worldHeight = scene.canvas.height / tempFactor;

            this.mapScene = scene
            this.mapCanvas = mapCanvas
        });
        layer.addTo(map);


    },
    _initHeightMap: function() {

        var data = this.data

        var map = L.map(this.data.heightMap, mapOptions);
        this._heightMap = map

        var layer = Tangram.leafletLayer({
            scene: 'heightScene.yaml', // TODO make configurable
            attribution: '',
            postUpdate: _ => {
                if (this.enabled) {
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
            }
        });

        var scene = layer.scene

        // setView expects format ([lat, long], zoom)
        map.setView(data.center, data.zoomLevel);
        map.setMaxBounds(data.maxBounds)
        map.fitBounds(data.maxBounds)

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



        layer.on('init', _ => {
            // resetViewComplete();
            scene.subscribe({
                // will be triggered when tiles are finished loading
                // and also manually by the moveend event
                view_complete: function() {}
            });
            this.scene_loaded = true;
            var heightMapCanvas = document.createElement("canvas");
            // document.body.appendChild(heightMapCanvas);
            heightMapCanvas.style.position = "fixed";
            heightMapCanvas.style.left = "9999px";
            heightMapCanvas.width = this.worldWidth = scene.canvas.width / tempFactor;
            heightMapCanvas.height = this.worldHeight = scene.canvas.height / tempFactor;

            
            this.heightMapCanvas = heightMapCanvas
        });
        layer.addTo(map);

        //map.on("movestart", function (e) { moving = true; });
        //map.on("moveend", function (e) { moveend(e) });
        this._heightMap = map
        this.scene = scene

        

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
        var scene = this.scene
        var heightMapCanvas = this.heightMapCanvas
        var ctx = heightMapCanvas.getContext("2d");
        ctx.clearRect(0, 0, heightMapCanvas.width, heightMapCanvas.height);


        // redraw canvas smaller in testing canvas, for speed
        ctx.drawImage(scene.canvas, 0, 0, scene.canvas.width / tempFactor, scene.canvas.height / tempFactor);

        // get all the pixels
        var pixels = ctx.getImageData(0, 0, heightMapCanvas.width, heightMapCanvas.height);

        var val;
        var counts = {};
        var empty = true;
        var max = 0,
            min = 255;

        // only check every 4th pixel (vary with browser size)
        // var stride = Math.round(img.height * img.width / 1000000);
        // 4 = only sample the red value in [R, G, B, A]
        for (var i = 0; i < heightMapCanvas.height * heightMapCanvas.width * 4; i += 4) {
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
        var worldWidth = this.worldWidth //this.heightMapCanvas.width
        var worldDepth = this.worldHeight //this.heightMapCanvas.height

        var width = worldWidth
        var height = worldDepth


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
        mesh.material.map = texture
        mesh.material.needsUpdate = true

        this.creatingMap = false
        console.log("Created map")

    },

    _createTerrain: function() {

        if (!this.analysed || this.creating) return

        this.creating = true
        
        var worldWidth = this.worldWidth //this.heightMapCanvas.width
        var worldDepth = this.worldHeight //this.heightMapCanvas.height

        //console.log(worldWidth + " " + worldDepth)

        var data = this.terrainData

        // TODO geometry widht
        var width = WIDTH
        var height = HEIGHT


        //const geometry = this.el.components.geometry.geometry
        var geometry = new THREE.PlaneBufferGeometry(
            width, height, 
            worldWidth - 1, worldDepth - 1)
        //geometry.rotateX(-Math.PI / 2);

        var vertices = geometry.attributes.position.array;
        for (var i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
            // only set z values (note: planes are not standing by default)
            vertices[j + 2] = this._scale(data[i])
        }
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

        //mesh.position.y = 0


        this.creating = false
        this.el.setObject3D('mesh', mesh)

        this.el.emit(MAP_LOADED_EVENT);

        console.log("Created terrain")
        //this._initMap()

    },
    _scale: function(value) {

        const SCALE_FACTOR = 20
        const zoomScaleFactor = this.data.heightScale * (this._heightMap.getZoom() * 0.15)

        return  value / SCALE_FACTOR * zoomScaleFactor;
    },

    update: function(oldData) {},

    remove: function() {},

    tick: function(delta, time) {
    },

    pause: function() {
        this.enabled = false
    },

    play: function() {
        this.enabled = true
    },
    project(lat, long) {
        // The position (origin at top-left corner) in pixel space
        let {
            x: pxX,
            y: pxY
        } = this._heightMap.latLngToLayerPoint([lat, long]);

        var width = WIDTH
        var height = HEIGHT

        
        var data = this.terrainData


        const idx = this.scene.canvas.width * pxY + pxX
        var z = this._scale(data[idx])

/*
        for (var i = 0; i < heightMapCanvas.height * heightMapCanvas.width * 4; i += 4) {
        for (var i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
            // only set z values (note: planes are not standing by default)
            vertices[j + 2] = data[i] / SCALE_FACTOR * zoomScaleFactor;
        }
        */

        // The 3D world size of the entity
        /*
        const {
            width: elWidth,
            height: elHeight
        } = this.el.components.geometry.data;
        */


        pxX /= this.scene.canvas.width
        pxY /= this.scene.canvas.height

        pxX *= width
        pxY *= height



        return {
            x: (pxX / this.data.pxToWorldRatio) - (width / 2),
            // y-coord is inverted (positive up in world space, positive down in
            // pixel space)
            y: -(pxY / this.data.pxToWorldRatio) + (height / 2),
            z: z, 
        };

    },

    unproject(x, y) {

        // The 3D world size of the entity
        const {
            width: elWidth,
            height: elHeight
        } = this.el.components.geometry.data;

        // Converting back to pixel space
        const pxX = (x + (elWidth / 2)) * this.data.pxToWorldRatio;
        // y-coord is inverted (positive up in world space, positive down in
        // pixel space)
        const pxY = ((elHeight / 2) - y) * this.data.pxToWorldRatio;

        // Return the long / lat of that pixel on the map
        return this._mapInstance.unproject([pxX, pxY]).toArray();
    },

    // return the north latitude of the map
    getNorthLat() {
        return this._heightMap.getBounds().getNorth()
    }
});