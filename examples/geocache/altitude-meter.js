
AFRAME.registerComponent('altitude-meter', {
    schema: {
        heightmap: {
            type: "selector",
            default: "#terrain"    
        },
        text: {
            type: "selector"
        }
    },
    init: function() {
        this.totalMeter = 0
        this.el.addEventListener('componentchanged', this.changedListener.bind(this));
    },
    changedListener: function(event) {
        var data = this.data
        var heightmapComp = data.heightmap.components['tangram-heightmap']

        var name = event.detail.name;
        var oldData = event.detail.oldData;
        var newData = event.detail.newData;

        // listen to tangram-map changes
        if (name === 'tangram-map') {
            var altitudeMeter = heightmapComp.altitudeTo(oldData.center)
            if (Math.floor(altitudeMeter) > 0 && altitudeMeter < MAX) {
                this.totalMeter += altitudeMeter
            }

            if (data.text) {
                var altitude = heightmapComp.getAltitude(newData.center)

                data.text.setAttribute("value", `${Math.ceil(altitude)} m`)
            }
        }
    }
});