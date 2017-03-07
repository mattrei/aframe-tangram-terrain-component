AFRAME.registerComponent('set-marker-on-map', {
    dependencies: ['tangram'],
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
        var heightMap = this.data.heightmap.components['tangram']

        var position = this.camera.position.clone()
        var nextPosition = position.clone().sub(this.getForward())

        var latLon =  heightMap.unproject(position.x, -position.z)
        var nextLatLon =  heightMap.unproject(nextPosition.x, -nextPosition.z) 

        var azimuth = Math.atan2(-(nextLatLon.lon - latLon.lon), nextLatLon.lat - latLon.lat);
        

        
        
        //var point = hudMap.project(latLon.lat, latLon.lon)


        this.data.marker.setAttribute("rotation", {
            x: 0,
            y: 0,
            z: (azimuth / (Math.PI * 2)) * 360
        })
            //console.log(point)
            //this.updateMarker(point)

        //this.data.marker.setAttribute("position", )

        this.el.setAttribute("tangram", "center", `${latLon.lat}, ${latLon.lon}`)
        //console.log(this.el)
    },
    getForward: function() {
        var zaxis = new THREE.Vector3()

        return function() {
            this.camera.getWorldDirection(zaxis)
            return zaxis
        }
    }(),
});