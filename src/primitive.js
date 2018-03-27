
/* global AFRAME */

AFRAME.registerPrimitive('a-tangram-terrain', {
    // Defaults the terrain to be parallel to the ground.
    defaultComponents: {
      geometry: {
        primitive: 'plane',
        buffer: 'true',
        segmentsWidth: 50,
        segmentsHeight: 50
      },
      material: {
        wireframe: false,
        displacementScale: 30,
        displacementBias: 0
      },
      rotation: {
        x: -90,
        y: 0,
        z: 0
      },
      'tangram-terrain': {}
    },
    mappings: {
      'api-key': 'tangram-map.apiKey',
      width: 'geometry.width',
      depth: 'geometry.height',
      'grid-width': 'geometry.segmentsWidth',
      'grid-depth': 'geometry.segmentsHeight',
      center: 'tangram-terrain.center',
      'map-style': 'tangram-terrain.style',
      zoom: 'tangram-terrain.zoom',
      'px-world-ratio': 'tangram-terrain.pxToWorldRatio',
      'height-scale': 'material.displacementScale',
      wireframe: 'material.wireframe',
      'depth-buffer': 'tangram-terrain.depthBuffer',
      lod: 'tangram-terrain.lod'
    }
  });