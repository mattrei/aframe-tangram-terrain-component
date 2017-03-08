
// TODO
// Camera count position.y changes  - BAD
// get altitude from tangram-heightmap.project (z value) - BETTER

AFRAME.registerComponent('altitude-meter', {
    dependencies: ['tangram-heightmap'],
    init: function() {
        this.tangramMap = this.el.components['tangram-heightmap']

        this.oldLngLat = this.tangramMap.data.center
        this.totalMeter = 0
    },
    tick: function(delta, time) {

        var distanceMeter = this.tangramMap.distanceTo(this.oldLngLat)
        if (Math.floor(distanceMeter) > 0 && distanceMeter < MAX) {
            this.totalMeter += distanceMeter
            console.log(this.totalMeter)
        }
        this.oldLngLat = this.tangramMap.data.center

    }
});