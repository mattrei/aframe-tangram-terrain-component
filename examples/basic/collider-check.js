AFRAME.registerComponent('collider-check', {
  schema: {
    terrain: {
      type: 'selector',
      default: '#terrain'
    }
  },
  init: function () {
    this.enabled = false;
    //this.tick = AFRAME.utils.throttleTick(this.tick, 1000, this);
    this.el.addEventListener('model-loaded', evt => {
      this.enabled = true;
      console.log('LOADED');
    });
  },
  tick: function (delta, time) {
    const data = this.data;
//    if (!this.enabled) return;

    const camera = this.el.sceneEl.camera;

    const pos = camera.getWorldPosition();
    const terrainPos = data.terrain.object3D.getWorldPosition();

    const dPos = pos.sub(terrainPos);
    const tangramTerrain = data.terrain.components['tangram-terrain'];
    var height = tangramTerrain.unprojectHeight(dPos.x, -dPos.z);
    

    height = (Math.round(height * 10)/10)
    //console.log(height)
    this.el.object3D.position.y = height - 4;

    //this.el.setAttribute('position', newLerpPos)
    // console.log(tangramTerrain.unprojectHeightInMeters(dPos.x, dPos.z));
  }
});
