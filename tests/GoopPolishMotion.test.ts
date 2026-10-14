import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GoopPolishMotion, GOOP_CREST_LAG_METRES, GOOP_LANDING_RIPPLE_SECONDS } from '../src/render/goop/GoopPolishMotion.ts';
import { GoopMaterialSet } from '../src/render/goop/GoopMaterials.ts';
import { GoopCharacterPresentation } from '../src/render/goop/GoopCharacterPresentation.ts';
import { loadGoop } from './fixtures/GoopAssetFixture.ts';

const dt = 1 / 60;
function compile(material: THREE.Material, library: keyof typeof THREE.ShaderLib) {
  const shader = { uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib[library].vertexShader, fragmentShader: THREE.ShaderLib[library].fragmentShader };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, null as never);
  return shader;
}
function dispose(materials: GoopMaterialSet) {
  for (const m of [materials.body, materials.eyes, materials.bodyDepth, materials.bodyDistance, materials.eyeDepth, materials.eyeDistance]) m.dispose();
}

test('crest trails a turn, responds to landing, and settles without a continuous idle sway', () => {
  const motion = new GoopPolishMotion(), materials = new GoopMaterialSet();
  const shader = compile(materials.body, 'physical');
  for (let frame = 0; frame < 12; frame++) motion.update(dt, 0.08, true, false);
  motion.present(materials, 1);
  assert.ok(shader.uniforms.uGoopCrestLag.value.x < 0);
  assert.ok(motion.diagnostics.crestLagMetres <= GOOP_CREST_LAG_METRES);
  motion.onLanding(8.5);
  for (let frame = 0; frame < 5; frame++) motion.update(dt, 0, true, false);
  motion.present(materials, 1); assert.ok(shader.uniforms.uGoopCrestLag.value.y > 0);
  for (let frame = 0; frame < 120; frame++) motion.update(dt, 0, true, false);
  assert.equal(motion.diagnostics.crestLagMetres, 0);
  dispose(materials);
});

test('acid fire produces a bounded directional recoil and brief squint, then expires', () => {
  const motion = new GoopPolishMotion(), recoil = new THREE.Vector3();
  motion.update(dt, 0, true, true); assert.equal(motion.diagnostics.acidRecoil, 0);
  motion.onAcidFired({ x: 0, y: 0, z: -1 });
  for (let frame = 0; frame < 3; frame++) motion.update(dt, 0, true, true);
  assert.ok(motion.diagnostics.acidRecoil > 0.9);
  assert.ok(motion.diagnostics.eyeClosure > 0.1 && motion.diagnostics.eyeClosure < 0.2);
  motion.copyRecoil(1, recoil); assert.ok(recoil.z > 0 && recoil.length() <= 0.025);
  assert.ok(motion.recoilCompression(1) <= 0.025);
  motion.update(0.3, 0, true, true);
  assert.equal(motion.diagnostics.acidRecoil, 0); assert.equal(motion.diagnostics.eyeClosure, 0);
  motion.copyRecoil(1, recoil); assert.equal(recoil.length(), 0);
  motion.onAcidFired({ x: 1, y: 0, z: 0 }); motion.reset(); motion.update(dt, 0, true, true);
  assert.equal(motion.diagnostics.acidRecoil, 0);
});

test('occasional blinks close and reopen, while hidden characters do not queue idle gestures', () => {
  const motion = new GoopPolishMotion();
  motion.update(3.2, 0, true, false); assert.equal(motion.diagnostics.eyeClosure, 0);
  motion.update(3.2, 0, true, true); motion.update(0.06, 0, true, true);
  assert.ok(motion.diagnostics.eyeClosure > 0.99);
  motion.update(0.13, 0, true, true); assert.equal(motion.diagnostics.eyeClosure, 0);
  motion.onDamage(1); motion.update(dt, 0, true, true);
  assert.ok(motion.diagnostics.eyeClosure > 0.2 && motion.diagnostics.eyeClosure < 0.3);
  motion.reset(); assert.equal(motion.diagnostics.eyeClosure, 0);
});

test('lower landing ripple is reserved for hard contacts and expires or cancels on takeoff', () => {
  const motion = new GoopPolishMotion();
  motion.onLanding(3); assert.equal(motion.diagnostics.landingRippleStrength, 0);
  motion.onLanding(8.5); motion.update(dt, 0, true, true);
  assert.equal(motion.diagnostics.landingRippleStrength, 1);
  assert.ok(motion.diagnostics.landingRippleAgeSeconds > 0);
  motion.update(GOOP_LANDING_RIPPLE_SECONDS, 0, true, true);
  assert.equal(motion.diagnostics.landingRippleStrength, 0);
  motion.onLanding(8.5); motion.update(dt, 0, false, true);
  assert.equal(motion.diagnostics.landingRippleStrength, 0);
});

test('body and eye polish share live shadow uniforms with stable program keys and no mesh changes', async () => {
  const p = new GoopCharacterPresentation(); await p.prepare(loadGoop);
  const body = p.root.getObjectByName('Goop-Body') as THREE.Mesh;
  const eye = p.root.getObjectByName('Goop-Eye-Left') as THREE.Mesh;
  const materials = new GoopMaterialSet();
  const surface = compile(materials.body, 'physical');
  for (const shadow of [compile(materials.bodyDepth, 'depth'), compile(materials.bodyDistance, 'distance')]) {
    for (const name of ['uGoopCrestLag', 'uGoopLandingRipple']) assert.equal(shadow.uniforms[name], surface.uniforms[name]);
    assert.match(shadow.vertexShader, /transformed = goopPolishPosition\(transformed\)/);
  }
  const eyes = compile(materials.eyes, 'physical');
  for (const shadow of [compile(materials.eyeDepth, 'depth'), compile(materials.eyeDistance, 'distance')]) {
    assert.equal(shadow.uniforms.uGoopEyeClosure, eyes.uniforms.uGoopEyeClosure);
    assert.match(shadow.fragmentShader, /vGoopEyePosition.y.*halfHeight\) discard/);
  }
  const key = materials.eyes.customProgramCacheKey(), version = materials.eyes.version;
  materials.setPolish(new THREE.Vector2(0.01, 0.005), 1, 1, 0.25);
  assert.equal(eyes.uniforms.uGoopEyeClosure.value, 1);
  assert.equal(surface.uniforms.uGoopLandingRipple.value.x, 1);
  assert.equal(materials.eyes.customProgramCacheKey(), key); assert.equal(materials.eyes.version, version);
  assert.equal(eye.geometry.morphAttributes.position, undefined);
  assert.equal(body.geometry.morphAttributes.position, undefined);
  p.startDeath({ x: 0, y: 0.46, z: 0 }); p.onAcidFired({ x: 0, y: 0, z: -1 });
  assert.equal(p.diagnostics.polish.acidRecoil, 0, 'shots cannot animate a dead character');
  p.reset(); assert.equal(p.diagnostics.polish.crestLagMetres, 0);
  materials.reset(); assert.equal(eyes.uniforms.uGoopEyeClosure.value, 0);
  dispose(materials); p.dispose();
});
