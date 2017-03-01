AFRAME.registerComponent('set-map-position', {
    dependencies: ['tangram'],
    schema: {
        heightmap: {
            type: "selector",
            default: "#terrain"
        },
        camera: {
            type: "selector",
            default: "#camera"
        }
    },
    init: function() {
    },
    tick: function(delta, time) {

        var camera = this.data.camera.object3D
    	var heightMap = this.data.heightmap.components['tangram']
        
        var latLng = heightMap.unproject(camera.position.x, camera.position.z)
        //console.log(latLng)
        // TODO set 
        var hudMap = this.el.components['tangram']
        var point = hudMap.project(latLng[0], latLng[1])
        console.log(point)

    }
});
