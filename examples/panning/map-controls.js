/* global THREE AFRAME */

AFRAME.registerComponent('map-controls', {

  dependencies: ['tangram-terrain'],

  schema: {
    speed: {
      default: 1.5
    }
  },

  init: function () {
    // this.tick = AFRAME.utils.throttleTick(this.tick, 1000, this);

    this.tangramTerrain = this.el.components['tangram-terrain'];

    this.el.addEventListener('tangram-terrain-loaded', e => {
      this.heightmapInstance = this.el.components['tangram-terrain'].heightmap;
      this.mapInstance = this.el.components['tangram-terrain'].overlaymap;
    });
  },
  getForward: (function () {
    var zaxis = new THREE.Vector3();

    return function () {
      this.el.sceneEl.camera.getWorldDirection(zaxis);
      return zaxis;
    };
  }()),
  tick: function (time, delta) {
    if (!this.mapInstance || !this.heightmapInstance) return;
    const forward = this.getForward();
    forward.multiplyScalar(0.1 * this.data.speed * delta);

    const offset = {x: forward.x, y: forward.z};
    this.mapInstance.panBy(offset, {animate: false});
    this.heightmapInstance.fitBounds(this.mapInstance.getBounds(), {animate: false});

    const material = this.el.getObject3D('mesh').material;
    material.map.needsUpdate = true;
    material.displacementMap.needsUpdate = true;
  }
});
