
// https://github.com/mrdoob/three.js/blob/381dadc00fc176223717eb574ac30e14b1728f99/examples/webgl_gpgpu_water.html
// https://gist.github.com/mattdesl/034c5daf2cf5a01c458bc9584cbe6744
// This is the original source, we will copy + paste it for our own GLSL
let vertexShader = THREE.ShaderChunk.meshphysical_vert;
const fragmentShader = THREE.ShaderChunk.meshphysical_frag;

vertexShader = vertexShader.replace('#include <displacementmap_vertex>', `
#ifdef USE_DISPLACEMENTMAP

  transformed += normalize( objectNormal ) * ( texture2D( displacementMap, uv ).a * displacementScale + displacementBias );

#endif`)

//console.log(vertexShader)

module.exports = MeshCustomMaterial;
function MeshCustomMaterial (parameters) {
  THREE.MeshStandardMaterial.call( this );
  this.uniforms = THREE.UniformsUtils.merge([
    THREE.ShaderLib.standard.uniforms,
    {
      // your custom uniforms or overrides to built-ins
    }
  ]);
  setFlags(this);
  this.setValues(parameters);
}

MeshCustomMaterial.prototype = Object.create( THREE.MeshStandardMaterial.prototype );
MeshCustomMaterial.prototype.constructor = MeshCustomMaterial;
MeshCustomMaterial.prototype.isMeshStandardMaterial = true;

MeshCustomMaterial.prototype.copy = function ( source ) {
  THREE.MeshStandardMaterial.prototype.copy.call( this, source );
  this.uniforms = THREE.UniformsUtils.clone(source.uniforms);
  setFlags(this);
  return this;
};

function setFlags (material) {
  material.vertexShader = vertexShader;
  material.fragmentShader = fragmentShader;
  material.type = 'MeshCustomMaterial';
}