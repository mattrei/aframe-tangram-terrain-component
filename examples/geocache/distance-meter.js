const MAX = 10000 // when the map is not initialized skip high values

AFRAME.registerComponent('distance-meter', {
    dependencies: ['tangram-map'],
    init: function() {
        this.totalMeter = 0
        this.el.addEventListener('componentchanged', this.changedListener.bind(this));
    },
    changedListener: function(event) {
        var name = event.detail.name;
        var oldData = event.detail.oldData;
        var newData = event.detail.newData;

        // listen to tangram-map changes
        if (name === 'tangram-map') {
            var distanceMeter = this.el.components['tangram-map'].distanceTo(oldData.center)
            if (Math.floor(distanceMeter) > 0 && distanceMeter < MAX) {
                this.totalMeter += distanceMeter
                //console.log(this.totalMeter)
            }
        }
    }
});