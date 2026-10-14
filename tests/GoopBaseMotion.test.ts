import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GoopCharacterPresentation, type GoopCharacterPresentationState } from '../src/render/goop/GoopCharacterPresentation.ts';
import { GOOP_MAXIMUM_BASE_OFFSET_METRES } from '../src/render/goop/GoopBaseMotion.ts';
import { GoopMaterialSet } from '../src/render/goop/GoopMaterials.ts';
import { loadGoop } from './fixtures/GoopAssetFixture.ts';

const dt = 1 / 60;
function motionState() {
  return { locomotionPositionWorld: new THREE.Vector3(), velocityWorld: new THREE.Vector3(),
    maximumLocomotionSpeedMetresPerSecond: 5.5, movementIntentWorld: new THREE.Vector3(0, 0, -1),
    grounded: true } satisfies GoopCharacterPresentationState;
}
function compile(material: THREE.Material, library: keyof typeof THREE.ShaderLib) {
  const shader = { uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib[library].vertexShader, fragmentShader: THREE.ShaderLib[library].fragmentShader };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, null as never);
  return shader;
}

test('bottom slime trails forward and backward travel steadily, including before the face reverses', async () => {
  const p = new GoopCharacterPresentation(); await p.prepare(loadGoop);
  const state = motionState(); p.update(dt, state);
  const body = p.root.getObjectByName('Goop-Body') as THREE.Mesh;
  const shader = compile(body.material as THREE.Material, 'physical');
  for (let frame = 0; frame < 60; frame++) {
    state.locomotionPositionWorld.z -= 5.5 * dt; p.update(dt, state);
  }
  p.present();
  assert.ok(p.diagnostics.baseOffsetWorld.z > 0.079, 'forward travel shifts the bottom backwards');
  assert.ok(shader.uniforms.uGoopBaseOffset.value.y > 0.079);
  assert.equal(p.diagnostics.baseOffsetWorld.x, 0);
  const steadyOffset = p.diagnostics.baseOffsetWorld.z;
  for (let frame = 0; frame < 30; frame++) {
    state.locomotionPositionWorld.z -= 5.5 * dt; p.update(dt, state);
    assert.ok(Math.abs(p.diagnostics.baseOffsetWorld.z - steadyOffset) < 1e-6, 'constant speed holds a steady offset without a crawl cycle');
  }
  state.movementIntentWorld.z = 1;
  for (let frame = 0; frame < 7; frame++) {
    state.locomotionPositionWorld.z += 5.5 * dt; p.update(dt, state);
  }
  assert.equal(p.diagnostics.reversing, true);
  assert.ok(p.diagnostics.baseOffsetWorld.z < 0, 'backward travel shifts the bottom forwards before the face turns');
  p.present(0); const previous = shader.uniforms.uGoopBaseOffset.value.y;
  p.present(1); const current = shader.uniforms.uGoopBaseOffset.value.y;
  p.present(0.5); const middle = shader.uniforms.uGoopBaseOffset.value.y;
  assert.ok(middle < previous && middle > current, 'the offset interpolates smoothly');
  for (let frame = 0; frame < 40; frame++) {
    state.locomotionPositionWorld.z += 5.5 * dt; p.update(dt, state);
  }
  p.present();
  const localOffset = shader.uniforms.uGoopBaseOffset.value as THREE.Vector2;
  const worldOffset = new THREE.Vector3(localOffset.x, 0, localOffset.y)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), p.diagnostics.facingYawRadians);
  assert.ok(worldOffset.z < -0.079);
  const expected = p.diagnostics.baseOffsetWorld;
  assert.ok(worldOffset.distanceTo(new THREE.Vector3(expected.x, 0, expected.z)) < 1e-8,
    'turning the face keeps the bottom offset opposite world travel');
  p.reset(); assert.equal(shader.uniforms.uGoopBaseOffset.value.length(), 0); p.dispose();
});

test('the base lag scales with speed and settles on stopping, blocked travel, or takeoff', () => {
  const p = new GoopCharacterPresentation(), state = motionState(); p.update(dt, state);
  for (let frame = 0; frame < 30; frame++) {
    state.locomotionPositionWorld.z -= 2.75 * dt; p.update(dt, state);
  }
  assert.ok(p.diagnostics.baseMotionStrength > 0.49 && p.diagnostics.baseMotionStrength < 0.51);
  // Holding movement into a wall produces no new travel.
  for (let frame = 0; frame < 90; frame++) p.update(dt, state);
  assert.equal(p.diagnostics.baseMotionStrength, 0);
  state.locomotionPositionWorld.z -= 5.5 * dt; p.update(dt, state);
  assert.ok(p.diagnostics.baseMotionStrength > 0);
  state.grounded = false; state.locomotionPositionWorld.z -= 5.5 * dt; p.update(dt, state);
  assert.equal(p.diagnostics.baseMotionStrength, 0);
  state.grounded = true; state.movementIntentWorld.set(0, 0, 0);
  state.locomotionPositionWorld.x += 0.06; p.update(dt, state);
  assert.equal(p.diagnostics.baseMotionStrength, 0, 'passive travel does not shift the base');
  state.movementIntentWorld.x = 1; p.setPosition(new THREE.Vector3(12, 3, 9)); p.update(dt, state);
  assert.equal(p.diagnostics.baseMotionStrength, 0, 'carrier movement does not shift the base');
  state.locomotionPositionWorld.x += 15; p.update(dt, state);
  assert.equal(p.diagnostics.baseMotionStrength, 0, 'teleports do not shift the base');
  p.dispose();
});

test('visible and shadow materials share the base offset without recompiling', () => {
  const materials = new GoopMaterialSet();
  const surface = compile(materials.body, 'physical');
  const depth = compile(materials.bodyDepth, 'depth');
  const distance = compile(materials.bodyDistance, 'distance');
  const version = materials.body.version, key = materials.body.customProgramCacheKey();
  materials.setBaseOffset(new THREE.Vector3(0, 0, GOOP_MAXIMUM_BASE_OFFSET_METRES), Math.PI / 2);
  for (const shader of [surface, depth, distance]) {
    assert.equal(shader.uniforms.uGoopBaseOffset, surface.uniforms.uGoopBaseOffset);
    assert.match(shader.vertexShader, /transformed.xz \+= goopBaseMask\(transformed.y\) \* uGoopBaseOffset/);
    assert.ok(shader.uniforms.uGoopBaseOffset.value.x < -0.079);
  }
  assert.match(surface.vertexShader, /objectNormal.y -= goopBaseSlope/);
  assert.equal(materials.body.version, version); assert.equal(materials.body.customProgramCacheKey(), key);
  materials.reset(); assert.equal(surface.uniforms.uGoopBaseOffset.value.length(), 0);
  for (const material of [materials.body, materials.eyes, materials.bodyDepth, materials.bodyDistance, materials.eyeDepth, materials.eyeDistance]) material.dispose();
});
