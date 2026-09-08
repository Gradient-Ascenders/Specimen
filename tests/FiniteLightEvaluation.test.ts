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
  assert.equal(calls?.length, 3);
  assert.ok(shader.fragmentShader.includes('getPointShadow'));
  assert.ok(shader.fragmentShader.includes('getSpotLightInfo'));
  material.dispose();
});
