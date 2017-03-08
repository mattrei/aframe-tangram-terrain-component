AFRAME.registerComponent('set-marker-on-map', {
    schema: {
        heightmap: {
            type: "selector",
            default: "#terrain"
        },
        camera: {
            type: "selector",
            default: "#camera"
        },
        marker: {
            type: "selector",
            default: "#my-marker"
        }
    },
    init: function() {

        this.camera = this.data.camera.object3D
    },
    tick: function(delta, time) {
        var heightMap = this.data.heightmap.components['tangram-heightmap']

        var position = this.camera.position.clone()
        var nextPosition = position.clone().sub(this.getForward())

        // we have to negate the z portion because in THREE Js the Vector is coming out
        var latLon =  heightMap.unproject(position.x, -position.z)
        var nextLatLon =  heightMap.unproject(nextPosition.x, -nextPosition.z) 

        var azimuth = Math.atan2(-(nextLatLon.lon - latLon.lon), nextLatLon.lat - latLon.lat);
        
        this.data.marker.setAttribute("rotation", {
            x: 0,
            y: 0,
            z: (azimuth / (Math.PI * 2)) * 360
        })
        //this.data.marker.setAttribute("position", )

        this.el.setAttribute("tangram-map", "center", `${latLon.lon}, ${latLon.lat}`)
    },
    getForward: function() {
        var zaxis = new THREE.Vector3()

        return function() {
            this.camera.getWorldDirection(zaxis)
            return zaxis
        }
    }(),
});