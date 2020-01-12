AFRAME.registerComponent('sun-position-setter', {
  dependencies: ['environment'],
  init: function () {
    //this.tick = AFRAME.utils.throttleTick(this.tick, 500, this);
  },
  tick: function(time, delta) {
    const s = 0.001;
    const envComp = this.el.components.environment;
    const lightPos = this.el.getAttribute('environment').lightPosition;
    this.el.setAttribute('environment', {lightPosition: {
      x: -Math.cos(time * s),
      y: Math.sin(time * s),
      z: -1
    }});
  }
});
