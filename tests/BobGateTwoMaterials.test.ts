import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { BobGelBodyMaterial } from '../src/render/bob/BobGateTwoMaterials.ts';

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
