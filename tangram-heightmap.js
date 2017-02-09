/* global AFRAME */

if (typeof AFRAME === 'undefined') {
    throw new Error('Component attempted to register before AFRAME was available.');
}

require('leaflet')

var map_start_location = [0, 0, 2];
var tempFactor = 1; // size of tempCanvas relative to main canvas: 1/n


/**
 * Tangram component for A-Frame.
 */
AFRAME.registerComponent('tangram-heightmap', {
    schema: {
        map: {
            type: "selector"
        },
        heightMap: {
            type: "selector"
        }
    },

    multiple: false,

    init: function() {
        this.enabled = true
        this.analysed = false
        this.analysing = false
        this.creating = false

        this.terrainData = []

        var heightMap = L.map(this.data.heightMap, {
            "keyboardZoomOffset": .05,
            "inertiaDeceleration": 10000,
            "zoomSnap": .001
        });



        var layer = Tangram.leafletLayer({
            scene: 'scene.yaml',
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
                    } else if (this.analysed) {
                        // reset after next update (however that might be done)
                        //console.log("ANALYSED")
                        this._createTerrain()
                        this.analysed = false
                    }
                }
            }
        });

        var scene = layer.scene


        // setView expects format ([lat, long], zoom)
        heightMap.setView(map_start_location.slice(0, 3), map_start_location[2]);


        layer.on('init', _ => {
            // resetViewComplete();
            scene.subscribe({
                // will be triggered when tiles are finished loading
                // and also manually by the moveend event
                view_complete: function() {}
            });
            this.scene_loaded = true;
            var tempCanvas = document.createElement("canvas");
            // document.body.appendChild(tempCanvas);
            // tempCanvas.style.position = "absolute";
            // tempCanvas.style.zIndex = 10000;
            tempCanvas.width = this.worldWidth = scene.canvas.width / tempFactor;
            tempCanvas.height = this.worldHeight = scene.canvas.height / tempFactor;

            this.scene = scene
            this.tempCanvas = tempCanvas
            console.log("inititated " + this.worldWidth + " "  + this.worldHeight)
        });
        layer.addTo(heightMap);

        //map.setView([40.70531887544228, -74.00976419448853], 8);

        //map.on("movestart", function (e) { moving = true; });
        //map.on("moveend", function (e) { moveend(e) });
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
        var tempCanvas = this.tempCanvas
        var ctx = tempCanvas.getContext("2d");
        ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);


        // redraw canvas smaller in testing canvas, for speed
        ctx.drawImage(scene.canvas, 0, 0, scene.canvas.width / tempFactor, scene.canvas.height / tempFactor);

        // get all the pixels
        var pixels = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

        var val;
        var counts = {};
        var empty = true;
        var max = 0,
            min = 255;

        // only check every 4th pixel (vary with browser size)
        // var stride = Math.round(img.height * img.width / 1000000);
        // 4 = only sample the red value in [R, G, B, A]
        for (var i = 0; i < tempCanvas.height * tempCanvas.width * 4; i += 4) {
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
        console.log("analysed finished")
    },

    _createTerrain: function() {
      
        if (!this.analysed || this.creating) return

          const SCALE_FACTOR = 10


        console.log("Creating terrain")
        this.creating = true
        var worldWidth = this.worldWidth //this.tempCanvas.width
        var worldDepth = this.worldHeight //this.tempCanvas.height

        console.log(worldWidth + " " + worldDepth)

        var data = this.terrainData

        console.log(data)

        // https://github.com/mrdoob/three.js/blob/master/examples/webgl_geometry_terrain_raycast.html

        var width = worldWidth
        var height = worldDepth

        var geometry = new THREE.PlaneBufferGeometry(width, height, worldWidth - 1, worldDepth - 1);
        geometry.rotateX(-Math.PI / 2);

        var vertices = geometry.attributes.position.array;
        for (var i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
            // only set y values

            vertices[j + 1] = data[i] / SCALE_FACTOR;
            //console.log(vertices[j+1])
        }
        geometry.computeFaceNormals();


        var texture = new THREE.CanvasTexture(this.tempCanvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;


        var mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            map: texture
        }));


        this.creating = false
        this.el.setObject3D('mesh', mesh)
        console.log("Created terrain")

    },

    update: function(oldData) {},

    remove: function() {},

    // tick: function (t) { },

    pause: function() {
        this.enabled = false
    },

    play: function() {
        this.enabled = true
    }
});