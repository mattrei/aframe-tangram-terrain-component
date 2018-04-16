AFRAME.registerComponent('sun-position-setter', {
  init: function () {
    var skyEl = this.el;
    var orbitEl = this.el.sceneEl.querySelector('#orbit');
    orbitEl.addEventListener('componentchanged', function changeSun (evt) {
      var sunPosition;
      var phi;
      var theta;
      if (evt.detail.name !== 'rotation') { return; }
      sunPosition = orbitEl.getAttribute('rotation');
      if (sunPosition === null) { return; }
      theta = Math.PI * (-0.5);
      phi = 2 * Math.PI * (sunPosition.y / 360 - 0.5);
      skyEl.setAttribute('material', 'sunPosition', {
        x: Math.cos(phi),
        y: Math.sin(phi) * Math.sin(theta),
        z: -1
      });
    });
  }
});
