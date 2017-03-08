var setProperty = AFRAME.utils.entity.setComponentProperty;

AFRAME.registerComponent('map-look-controls', {
    dependencies: ['look-controls'],
    schema: {
        type: "selector",
        default: "#camera"
    },
    init: function() {
    },
    tick: function(delta, time) {

        var cameraRotation = this.data.getAttribute("rotation")

        var mappedRotation = {
            x: 0, // no rotatiton
            y: 0,
            z: -cameraRotation.y
        }

        this.el.setAttribute("rotation", mappedRotation)
    }
});