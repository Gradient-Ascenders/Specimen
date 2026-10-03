import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AcidSurfaceMaterial } from '../src/render/environment/containment/AcidSurfaceMaterial.ts';
import { optimizeFiniteLightEvaluation } from '../src/render/environment/cultivation/FiniteLightEvaluation.ts';

test('finite lighting retains the acid hook and guards only direct contributions Three marks invisible', () => {
  const material = new AcidSurfaceMaterial();
  optimizeFiniteLightEvaluation(material);
  const hook = material.onBeforeCompile, key = material.customProgramCacheKey();
  optimizeFiniteLightEvaluation(material);
  assert.equal(material.onBeforeCompile, hook);
  assert.equal(material.customProgramCacheKey(), key);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  assert.ok('uRipples' in shader.uniforms);
  assert.ok(shader.fragmentShader.includes('evaluateAcidInteractions'));
  const calls = shader.fragmentShader.match(/if \( directLight.visible \) \{ RE_Direct\(/g);
  assert.equal(calls?.length, 4);
  assert.ok(shader.fragmentShader.includes('i < NUM_POINT_LIGHT_SHADOWS'));
  assert.ok(shader.fragmentShader.includes('pointIndex = NUM_POINT_LIGHT_SHADOWS; pointIndex < NUM_POINT_LIGHTS'));
  assert.equal(shader.fragmentShader.includes('i < NUM_POINT_LIGHTS; i ++'), false);
  assert.ok(shader.fragmentShader.includes('getPointShadow'));
  assert.ok(shader.fragmentShader.includes('getSpotLightInfo'));
  assert.ok(shader.fragmentShader.includes('IncidentLight spotContributions[ NUM_SPOT_LIGHTS ]'));
  assert.ok(shader.fragmentShader.includes('spotContributions[ i ] = directLight;'));
  assert.ok(shader.fragmentShader.includes('spotIndex = 0; spotIndex < NUM_SPOT_LIGHTS'));
  // Preserve Three's sampler indexing, map categories, and visibility/shadow
  // attenuation verbatim; only the expensive BRDF accumulation moves outside.
  const originalSpotLoop = THREE.ShaderChunk.lights_fragment_begin.slice(
    THREE.ShaderChunk.lights_fragment_begin.indexOf('\t#pragma unroll_loop_start', THREE.ShaderChunk.lights_fragment_begin.indexOf('SpotLight spotLight;')),
    THREE.ShaderChunk.lights_fragment_begin.indexOf('\t#pragma unroll_loop_end', THREE.ShaderChunk.lights_fragment_begin.indexOf('SpotLight spotLight;')),
  );
  assert.ok(shader.fragmentShader.includes(originalSpotLoop.replace(
    'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
    'spotContributions[ i ] = directLight;',
  )));
  material.dispose();
});

test('physical transmission keeps the original spot loop while retaining compact ordinary points', () => {
  const material = new THREE.MeshPhysicalMaterial({ transmission: .3 });
  optimizeFiniteLightEvaluation(material);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  assert.equal(shader.fragmentShader.includes('spotContributions'), false);
  assert.ok(shader.fragmentShader.includes('i < NUM_SPOT_LIGHTS; i ++'));
  assert.ok(shader.fragmentShader.includes('pointIndex = NUM_POINT_LIGHT_SHADOWS; pointIndex < NUM_POINT_LIGHTS'));
  assert.ok(shader.fragmentShader.includes('if ( directLight.visible ) { RE_Direct('));
  material.dispose();
});
