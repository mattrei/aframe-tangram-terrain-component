/* global AFRAME */

AFRAME.registerComponent('sphere-matrix', {
  schema: {
  },
  init: function () {
    this.enabled = false;

    const start = -10;
    const end = 10;
    const gap = 2;

    this.el.addEventListener('tangram-terrain-loaded', evt => {
      for (var i = start; i <= end; i += gap) {
        for (var j = start; j <= end; j += gap) {
          this._createSphere(i, j);
        }
      }
    });
  },
  _createSphere: function (x, y) {
    var e = document.createElement('a-sphere');
    e.setAttribute('color', 'blue');
    e.setAttribute('radius', '0.05');

    const tangramTerrain = this.el.components['tangram-terrain'];
    var height = tangramTerrain.unprojectHeight(x, y);

    e.setAttribute('position', {
      x: x,
      y: y,
      z: height
    });
    this.el.appendChild(e);
  }

});

