AFRAME.registerGeometry('parametric', {
  schema: {
    width: {
      default: 1
    },
    height: {
      default: 1
    },
    segmentsWidth: {
      default: 1
    },
    segmentsHeight: {
      default: 1
    },
    curve: {
      default: 1
    }
  },
  init: function (data) {
    var geometry = new THREE.ParametricGeometry(plane(data.width, data.height), data.segmentsWidth, data.segmentsHeight);
    geometry.center();
    this.geometry = geometry;
  }
});

function plane (width, height) {
  return function (u, v, optionalTarget) {
        // u = Math.PI * u;
    u = (u - 0.5) * 2;
    v = (v - 0.5) * 2;
        // v = Math.PI * v;

    var result = optionalTarget || new THREE.Vector3();

    var a = 20;

    var x, y, z;

    x = u * width;
    y = 0;
    y = v * height;

    z = a
            //  * (1 - Math.pow(Math.max(0, Math.abs(u) * 2 - 1), 2) )
            *
            Math.pow(Math.cos(Math.PI * u / 2), 0.5)
            // * (1 - Math.pow(Math.abs(u), a) )

            //  * (1 - Math.pow(Math.max(0, Math.abs(v) * 2 - 1), 2) )
            *
            Math.pow(Math.cos(Math.PI * v / 2), 0.5);
        // * (1 - Math.pow(Math.abs(v), a))

        // y = 0
        // Math.sin(u) * Math.sin(v) * a

    return result.set(x, y, z);
  };
}
