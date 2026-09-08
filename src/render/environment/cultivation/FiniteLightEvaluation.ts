import * as THREE from 'three';

const DIRECT_LIGHT_CALL = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const finiteLightingChunk = THREE.ShaderChunk.lights_fragment_begin.replaceAll(
  DIRECT_LIGHT_CALL, `if ( directLight.visible ) { ${DIRECT_LIGHT_CALL} }`,
);
const optimized = new WeakSet<THREE.Material>();

/** Skip BRDF work only when Three's own attenuation/cone test says contribution is zero. */
export function optimizeFiniteLightEvaluation(material: THREE.Material): void {
  if (optimized.has(material)) return;
  optimized.add(material);
  const priorCompile = material.onBeforeCompile;
  const priorKey = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    priorCompile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', finiteLightingChunk);
  };
  material.customProgramCacheKey = () => `${priorKey}:finite-light-branch-v1`;
  material.needsUpdate = true;
}
