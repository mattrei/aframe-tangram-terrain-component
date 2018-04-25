/* global AFRAME THREE */

const BufferGeometryUtils = require('./lib/BufferGeometryUtils');
const Utils = require('./utils');

const MeshCustomMaterial = require('./lib/MeshCustomMaterial');

const TERRAIN_LOADED_EVENT = 'tangram-terrain-loaded';


AFRAME.registerComponent('tangram-static-terrain', {
    dependencies: [
      'geometry',
      'material'
    ],
  
    schema: {
        map: {
            type: 'map'
        },
        normalmap: {
            type: 'map'
        },
      bounds: {
        default: [0, 0, 0, 0],
        type: 'array'
      },
      depthBuffer: {
        default: false
      },
      lod: {
        default: 1
      },
      lodCount: {
        default: 1,
        oneOf: [1, 2, 3, 4]
      },
      vertexNormals: {
        default: false
      }
    },
  
    multiple: false,
  
    init: function () {
      const data = this.data;
      this.depthBuffer = null;
  
      this.map = null;
      this.normalmap = null;
  
      this.lods = [];
  
      const lods = Utils.createGeometryLODs(this.el, this.data);
      const mesh = this.el.getObject3D('mesh');
      mesh.geometry = lods.geometry;
      this.lods = lods.lods;

      this.map = this.el.sceneEl.systems['tangram-terrain'].createStaticMap(this.data);
      Utils.applyMaterial(this.el, data, data.map, data.normalmap);
    },
    update: function (oldData) {
      const data = this.data;
  
      // Nothing changed
      if (AFRAME.utils.deepEqual(oldData, data)) {
        return;
      }
  
      if (data.lod !== oldData.lod) {
        if (data.lod >= 1 && data.lod <= data.lodCount) {
          this.applyLOD(data.lod);
        }
      }
    }, 
    applyLOD: function (lod) {
      const el = this.el;
      const data = this.data;
      const matData = this.el.components.material.data;
  
      let foundLOD = null;
      for (let lodObj of this.lods) {
        if (lodObj.lod === lod) {
          foundLOD = lodObj;
        }
      }
  
      const mesh = el.getObject3D('mesh');
      mesh.geometry.setDrawRange(foundLOD.geometry.start, foundLOD.geometry.count);
    }
})