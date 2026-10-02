import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { BobGelBodyMaterial, BobGateTwoMaterialSet } from '../src/render/bob/BobGateTwoMaterials.ts';

test('Bob secondary waves visibly bend authored morph normals without moving the eye seats', () => {
  const material = new BobGelBodyMaterial();
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };

  material.onBeforeCompile(
    shader as THREE.WebGLProgramParametersWithUniforms,
    null as never,
  );

  const morphNormal = shader.vertexShader.indexOf(
    '#include <morphnormal_vertex>',
  );
  const normalCorrection = shader.vertexShader.indexOf(
    'vec3 bobSecondaryBaseNormal = normalize(objectNormal);',
  );
  const skinNormal = shader.vertexShader.indexOf('#include <skinbase_vertex>');
  const beginVertex = shader.vertexShader.indexOf('#include <begin_vertex>');
  const positionDisplacement = shader.vertexShader.indexOf(
    'transformed += bobSecondaryBaseNormal * bobSecondaryDisplacement;',
  );

  assert.ok(morphNormal >= 0);
  assert.ok(normalCorrection > morphNormal);
  assert.ok(normalCorrection < skinNormal);
  assert.ok(positionDisplacement > beginVertex);
  assert.match(
    shader.vertexShader,
    /objectNormal = normalize\(\s*bobSecondaryBaseNormal - bobSecondaryTangentialGradient\s*\);/,
  );
  assert.match(shader.vertexShader, /0\.0035/);
  assert.match(shader.vertexShader, /0\.0060/);
  assert.doesNotMatch(
    shader.vertexShader,
    /float bobEyeSeatProtection = smoothstep/,
  );
  assert.match(shader.vertexShader, /float bobEyeSeatHorizontalMask/);
  assert.match(shader.vertexShader, /float bobEyeSeatVerticalMask/);
  assert.match(
    shader.vertexShader,
    /exp\(-uBobImpactAge \* 4\.0\) \*\s*exp\(-bobImpactDistance \* 3\.0\)/,
  );
  assert.match(
    shader.vertexShader,
    /vec3 bobImpactLightingGradient =\s*bobProtectedImpactGradient \* 3\.0;/,
  );
  assert.match(
    shader.vertexShader,
    /0\.180 \/ max\(length\(bobImpactLightingGradient\), 0\.0001\)/,
  );
  assert.match(
    shader.vertexShader,
    /bobImpactDistance \* 12\.0 -\s*uBobImpactAge \* 7\.2/,
  );
  assert.match(
    shader.vertexShader,
    /exp\(-uBobImpactAge \* 2\.2\) \*\s*exp\(-bobImpactDistance \* 0\.6\)/,
  );
  assert.match(
    shader.vertexShader,
    /1\.0 - smoothstep\(\s*0\.65,\s*1\.20,\s*uBobImpactAge\s*\)/,
  );
  assert.match(
    shader.vertexShader,
    /bobImpactNormalCarrierEnvelope \*\s*1\.60/,
  );
  assert.match(
    shader.vertexShader,
    /0\.800 \/\s*max\(length\(bobImpactNormalCarrier\), 0\.0001\)/,
  );
  assert.match(
    shader.vertexShader,
    /bobImpactDirection -\s*bobCarrierNormal \* dot\(bobImpactDirection, bobCarrierNormal\)/,
  );
  assert.match(
    shader.vertexShader,
    /bobImpactCarrierTangent \/ bobImpactCarrierTangentLength/,
  );
  assert.match(
    shader.vertexShader,
    /bobImpactLightingGradient \+ bobImpactNormalCarrier/,
  );
  assert.equal(
    shader.vertexShader.match(/bobEvaluateSecondaryMotion\(/g)?.length,
    2,
  );

  material.dispose();
});

function compile(material: THREE.Material, library: keyof typeof THREE.ShaderLib) {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib[library].vertexShader,
    fragmentShader: THREE.ShaderLib[library].fragmentShader,
  };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, null as never);
  return shader;
}

test('spot and point shadow deformation share the live state and preserve morph ordering', () => {
  const materials = new BobGateTwoMaterialSet();
  const surface = compile(materials.body, 'physical');
  const shadows = [compile(materials.bodyDepth, 'depth'), compile(materials.bodyDistance, 'distance')];
  for (const shadow of shadows) {
    for (const name of ['uBobSecondaryTime', 'uBobImpactPointLocal', 'uBobImpactStrength', 'uBobImpactAge']) {
      assert.equal(shadow.uniforms[name], surface.uniforms[name]);
    }
    // Depth/distance must evaluate morph normals even without a displacement map.
    assert.doesNotMatch(shadow.vertexShader, /#ifdef USE_DISPLACEMENTMAP/);
    const evaluation = shadow.vertexShader.indexOf('vec3 bobSecondaryBaseNormal = normalize(objectNormal);');
    const displacement = shadow.vertexShader.indexOf('transformed += bobSecondaryBaseNormal * bobSecondaryDisplacement;');
    assert.ok(evaluation > shadow.vertexShader.indexOf('#include <morphnormal_vertex>'));
    assert.ok(displacement > evaluation);
    assert.ok(displacement < shadow.vertexShader.indexOf('#include <morphtarget_vertex>'));
    const start = 'float bobSmoothstepDerivative';
    const end = 'bobImpactLightingGradient + bobImpactNormalCarrier;\n}';
    const sharedCode = (source: string) => source.slice(source.indexOf(start), source.indexOf(end) + end.length);
    assert.equal(sharedCode(shadow.vertexShader), sharedCode(surface.vertexShader));
    assert.equal(shadow.vertexShader.match(/bobEvaluateSecondaryMotion\(/g)?.length, 2);
  }
  materials.setImpact(new THREE.Vector3(0.2, -0.1, 0.3), 0.8);
  materials.update(0.1);
  assert.equal(shadows[1].uniforms.uBobImpactStrength.value, 0.8);
  assert.equal(shadows[0].uniforms.uBobImpactAge.value, 0.1);
  assert.equal(shadows[1].uniforms.uBobSecondaryTime.value, 0.1);
  const keys = [materials.bodyDepth, materials.bodyDistance].map(m => m.customProgramCacheKey());
  materials.update(2);
  assert.equal(shadows[0].uniforms.uBobImpactStrength.value, 0);
  materials.reset();
  assert.equal(shadows[0].uniforms.uBobSecondaryTime.value, 0);
  assert.equal(shadows[1].uniforms.uBobImpactAge.value, 1.2);
  assert.deepEqual([materials.bodyDepth, materials.bodyDistance].map(m => m.customProgramCacheKey()), keys);
});

test('eye and body shadow masks share camera fades and restore opaque coverage', () => {
  const materials = new BobGateTwoMaterialSet();
  const shadows = [compile(materials.bodyDepth, 'depth'), compile(materials.bodyDistance, 'distance'),
    compile(materials.eyeDepth, 'depth'), compile(materials.eyeDistance, 'distance')];
  const keys = [materials.bodyDepth, materials.bodyDistance, materials.eyeDepth, materials.eyeDistance]
    .map(m => m.customProgramCacheKey());
  for (const shader of shadows) {
    assert.equal(shader.uniforms.uBobShadowOpacity, shadows[0].uniforms.uBobShadowOpacity);
    assert.match(shader.fragmentShader, /uBobShadowOpacity <= 0\.0/);
    assert.match(shader.fragmentShader, /bobCoverage >= uBobShadowOpacity\) discard/);
  }
  for (const opacity of [0.3, 0, 1, 0.7, 0]) {
    materials.setOpacity(opacity);
    assert.equal(materials.body.opacity, opacity);
    for (const shader of shadows) assert.equal(shader.uniforms.uBobShadowOpacity.value, opacity);
  }
  materials.reset();
  for (const shader of shadows) assert.equal(shader.uniforms.uBobShadowOpacity.value, 1);
  assert.deepEqual([materials.bodyDepth, materials.bodyDistance, materials.eyeDepth, materials.eyeDistance]
    .map(m => m.customProgramCacheKey()), keys);
});
