AFRAME.registerComponent('collider-check', {
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

    	this.position = new THREE.Vector3()
        this.raycaster = new THREE.Raycaster(this.el.object3D.position.clone(), 
        	new THREE.Vector3(0, -1, 0));
    },
    tick: function(delta, time) {

		var camera = this.data.camera.object3D

    	var heightmap = this.data.heightmap.object3D

		this.position.copy(camera.position)
		this.position.y += 1000	// safe value
        // Always update player position to raycaster!
        this.raycaster.ray.origin.copy(this.position);
        // Find closest intersection
        const intersects = this.raycaster.intersectObject(heightmap, true);

        if (intersects.length) {
        	//console.log("intersection")
        	const panel = intersects[0]
        	//console.log(panel.point.y)

             // Get angle between triangle normal and upwards unit vector
        	var slope_ang = new THREE.Vector3(0, 1, 0).angleTo(panel.face.normal);
        	//console.log(slope_ang)
        	const player = this.el.object3D
        	player.position.y = panel.point.y + 0.5
        	//player.quaternion.setFromAxisAngle()
        	//const dir = camera.getWorldDirection()
			//player.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0), slope_ang)
        }
        

       
    }
});
