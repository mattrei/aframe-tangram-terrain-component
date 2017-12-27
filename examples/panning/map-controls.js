/* global THREE AFRAME */

AFRAME.registerComponent('map-controls', {

  dependencies: ['tangram-terrain'],

  init: function () {
    // this.tick = AFRAME.utils.throttleTick(this.tick, 1000, this);

    this.tangramTerrain = this.el.components['tangram-terrain'];

    this.el.addEventListener('tangram-terrain-loaded', e => {
      this.heightmapInstance = this.el.components['tangram-terrain'].getHeightmapInstance();
      this.mapInstance = this.el.components['tangram-terrain'].getMapInstance();

      this.mapInstance.addEventListener('move', e => {
        // console.log("Moved")
      });
    });
  },
  getForward: function () {
    var zaxis = new THREE.Vector3();

    return function () {
      this.el.sceneEl.camera.getWorldDirection(zaxis);
      return zaxis;
    };
  }(),
  tick: function (time, delta) {
    if (!this.mapInstance || !this.heightmapInstance) return;
    const forward = this.getForward();
    forward.multiplyScalar(0.1 * delta);

    var azimuth = Math.atan2(forward.x, forward.z);
    var azimuth2 = Math.atan2(-forward.z, forward.x);
    // console.log(forward.x + ' ' + forward.y + ' ' + forward.z)
    // console.log(azimuth + ' ' + azimuth2)

    // const offset = {x: forward.x, y: -forward.y};
    const offset = {x: forward.x, y: forward.z};

    this.heightmapInstance.panBy(offset, {animate: false});
    // this.tangramTerrain.updateHitMesh();
    this.mapInstance.panBy(offset, {animate: false});
    // console.log(this.heightmapInstance.getCenter())
  }
});
