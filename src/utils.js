const BufferGeometryUtils = require('./lib/BufferGeometryUtils');
const cuid = require('cuid');

module.exports.leafletOptions = {
  'preferCanvas': true,
  'keyboard': false,
  'scrollWheelZoom': false,
  'tap': false,
  'touchZoom': false,
  'zoomControl': false,
  'attributionControl': false,
  'doubleClickZoom': false,
  'trackResize': false,
  'boxZoom': false,
  'dragging': false,
  'zoomAnimation': false,
  'fadeAnimation': false,
  'markerZoomAnimation': false,
  'inertia': false
};

module.exports.getCanvasContainerAssetElement = function (id, width, height, left) {
  var element = document.querySelector('#' + id);

  if (!element) {
    element = document.createElement('div');
  }

  element.setAttribute('id', id);
  element.style.width = width + 'px';
  element.style.height = height + 'px';

  element.style.position = 'fixed';
  element.style.left = left + 'px';
  element.style.top = '0px';

  if (!document.body.contains(element)) {
    document.body.appendChild(element);
  }

  return element;
};

module.exports.processCanvasElement = function (canvasContainer) {
  const canvas = canvasContainer.querySelector('canvas');
  canvas.setAttribute('id', cuid());
  canvas.setAttribute('crossOrigin', 'anonymous');
};

module.exports.latLonFrom = function (lonLat) {
  return [lonLat[1], lonLat[0]];
};

module.exports.delay = function (duration, func) {
  var args = Array.prototype.slice.call(arguments, 2);

  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve(func.apply(null, args));
    }, duration);
  });
};

const GEOMETRY_LOD_FACTOR = 2;

module.exports.createGeometryLODs = function (el, data) {
  const mesh = el.getObject3D('mesh');
  const geomData = el.components.geometry.data;

  const lodGeometries = [mesh.geometry];

  for (let i = 1; i < data.lodCount; i++) {
    const factor = i * GEOMETRY_LOD_FACTOR;

    let lodGeometry = new THREE.PlaneGeometry(
      geomData.width, geomData.height,
      Math.floor(geomData.segmentsWidth / factor), Math.floor(geomData.segmentsHeight / factor)
    );

    lodGeometry = new THREE.BufferGeometry().fromGeometry(lodGeometry);
    lodGeometries.push(lodGeometry);
  }

  const lods = [];

  let start = 0;
  for (let i = 0; i < lodGeometries.length; i++) {
    const count = lodGeometries[i].attributes.position.count;

    lods.push({
      lod: i + 1,
      geometry: {
        start: start,
        count: count
      }
    });

    start += count;
  }

  const mergedGeometry = BufferGeometryUtils.mergeBufferGeometries(lodGeometries);

  return {
    geometry: mergedGeometry,
    lods: lods
  };
};

module.exports.applyMaterial = function (el, data, map, normalmap) {
  const mesh = el.getObject3D('mesh');
  const matData = el.components.material.data;
  const material = new THREE.MeshStandardMaterial();
  material.copy(mesh.material);

  material.displacementScale = matData.displacementScale;
  material.displacementBias = matData.displacementBias;

  // https://medium.com/@pailhead011/extending-three-js-materials-with-glsl-78ea7bbb9270
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <displacementmap_vertex>',
      `#ifdef USE_DISPLACEMENTMAP

        transformed += normalize( objectNormal ) * ( texture2D( displacementMap, uv ).a * displacementScale + displacementBias );

      #endif`
    );
  };

  el.sceneEl.systems.material.loadTexture(map, {src: map}, mapTexture => {
    el.sceneEl.systems.material.loadTexture(normalmap, {src: normalmap}, normalmapTexture => {
      material.displacementMap = normalmapTexture;
      if (data.vertexNormals) {
        material.normalMap = normalmapTexture;
      }
      material.map = mapTexture;
      material.needsUpdate = true;

      mesh.material = material;
    });
  });
};

module.exports.watchMaterialData = function (el) {
  el.addEventListener('componentchanged', (evt) => {
    if (evt.detail.name === 'material') {
      const mesh = el.getObject3D('mesh');
      const matData = evt.target.getAttribute('material');
        // can we make this better?
      mesh.material.displacementScale = matData.displacementScale;
      mesh.material.displacementBias = matData.displacementBias;
      mesh.material.opacity = matData.opacity;
      mesh.material.transparent = matData.transparent;
    }
  });
};
