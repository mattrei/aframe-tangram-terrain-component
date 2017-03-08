const MAX = 10000   // when the map is not initialized skip high values

AFRAME.registerComponent('distance-meter', {
    dependencies: ['tangram-map'],
    init: function() {
        this.tangramMap = this.el.components['tangram-map']

        this.oldLngLat = this.tangramMap.data.center
        this.totalMeter = 0
    },
    tick: function(delta, time) {

        var distanceMeter = this.tangramMap.distanceTo(this.oldLngLat)
        if (Math.floor(distanceMeter) > 0 && distanceMeter < MAX) {
            this.totalMeter += distanceMeter
        }
        this.oldLngLat = this.tangramMap.data.center

    }
});