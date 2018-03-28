/* global THREE AFRAME */

AFRAME.registerComponent('lod-controls', {

  dependencies: ['tangram-terrain'],

  schema: {
    speed: {
      default: 1
    }
  },

  init: function () {
    this.tick = AFRAME.utils.throttleTick(this.tick, 1000, this);

    this.tangramTerrain = this.el.components['tangram-terrain'];
    this.loaded = false;

    this.el.addEventListener('tangram-terrain-loaded', e => {
      this.loaded = true;
    });
  },
  tick: function (time, delta) {
    if (!this.loaded) return;

    const cameraPos = this.el.sceneEl.camera.getWorldPosition()
    const terrainPos = this.el.object3D.getWorldPosition();

    const dist = cameraPos.distanceTo(terrainPos);
    
    if (dist > 25) {
      this.el.setAttribute('tangram-terrain', 'lod', 4)
    } else if (dist > 22) {
      this.el.setAttribute('tangram-terrain', 'lod', 3)
    } else if (dist > 18) {
      this.el.setAttribute('tangram-terrain', 'lod', 2)
    } else {
      this.el.setAttribute('tangram-terrain', 'lod', 1)
    }

  }
});
