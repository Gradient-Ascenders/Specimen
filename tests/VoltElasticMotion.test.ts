import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { VoltCharacterPresentation } from '../src/render/volt/VoltCharacterPresentation.ts';
import { GoopCharacterPresentation } from '../src/render/goop/GoopCharacterPresentation.ts';
import { evaluateVoltElasticPosition, voltMotionProtection } from '../src/render/volt/VoltMotionShader.ts';
import { loadVolt } from './fixtures/VoltAssetFixture.ts';

const dt = 1 / 60;
const state = () => ({ locomotionPositionWorld: new THREE.Vector3(), velocityWorld: new THREE.Vector3(),
  movementIntentWorld: new THREE.Vector3(0, 0, -1), maximumLocomotionSpeedMetresPerSecond: 5.5, grounded: true });
function compile(material: THREE.Material, library: keyof typeof THREE.ShaderLib) {
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib[library].vertexShader,
    fragmentShader: THREE.ShaderLib[library].fragmentShader };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, null as never); return shader;
}

test('Volt matches Goop movement lean, reverse counterlean, trailing gel and jump/landing timing', () => {
  const volt = new VoltCharacterPresentation(), goop = new GoopCharacterPresentation(), s = state();
  const tick = (frames: number, distance: number) => {
    for (let i = 0; i < frames; i++) {
      s.locomotionPositionWorld.z += distance;
      volt.update(dt, s); goop.update(dt, s);
      for (const key of ['signedLean', 'squash', 'stretch', 'jumpBaseOffsetMetres'] as const) {
        assert.ok(Math.abs(volt.diagnostics[key] - goop.diagnostics[key]) < 1e-10, `same ${key}`);
      }
      assert.deepEqual(volt.diagnostics.baseOffsetWorld, goop.diagnostics.baseOffsetWorld);
    }
  };
  tick(1, 0); tick(60, -5.5 * dt);
  assert.ok(volt.diagnostics.signedLean > 0.99); assert.ok(volt.diagnostics.baseOffsetWorld.z > 0.079);
  s.movementIntentWorld.z = 1; tick(7, 5.5 * dt);
  assert.equal(volt.diagnostics.reversing, true);
  assert.ok(volt.diagnostics.signedLean < 0, 'reverse travel counterleans before the face turns');
  assert.ok(volt.diagnostics.baseOffsetWorld.z < 0);
  tick(40, 5.5 * dt);
  s.grounded = false; s.velocityWorld.y = 6;
  const launch = { directionWorld: new THREE.Vector3(0, 1, 0), speedMetresPerSecond: 6, chargeFraction: 0 };
  volt.onLaunch(launch); goop.onLaunch(launch); tick(5, 0);
  assert.ok(volt.diagnostics.stretch > 0.12); assert.ok(volt.diagnostics.jumpBaseOffsetMetres < -0.02);
  s.velocityWorld.y = 0; tick(20, 0); assert.ok(Math.abs(volt.diagnostics.jumpBaseOffsetMetres) < 0.001);
  s.velocityWorld.y = -6; tick(10, 0); assert.ok(volt.diagnostics.jumpBaseOffsetMetres > 0.03);
  s.grounded = true; s.velocityWorld.y = 0; s.movementIntentWorld.set(0, 0, 0);
  volt.onLanding(new THREE.Vector3(0, 1, 0), 8.5); goop.onLanding(new THREE.Vector3(0, 1, 0), 8.5);
  tick(1, 0); assert.ok(volt.diagnostics.squash > 0.3); assert.equal(volt.diagnostics.jumpBaseOffsetMetres, 0);
  tick(16, 0); assert.ok(volt.diagnostics.stretch > 0, 'landing releases through a small rebound');
  tick(110, 0);
  assert.equal(volt.diagnostics.squash + volt.diagnostics.stretch + volt.diagnostics.locomotionStrength, 0);
  assert.equal(volt.diagnostics.baseMotionStrength, 0); assert.equal(volt.diagnostics.polish.crestLagMetres, 0);
  assert.equal(volt.diagnostics.polish.landingRippleStrength, 0);
  volt.dispose(); goop.dispose();
});

test('interpolation, pause, planted landings and recovery preserve the independent light and shader state', async () => {
  const p = new VoltCharacterPresentation(); await p.prepare(loadVolt);
  const s = state(), body = p.root.getObjectByName('Volt-Body') as THREE.Mesh;
  const shader = compile(body.material as THREE.Material, 'physical');
  const light = new THREE.PointLight(); p.placement.add(light); p.setPosition(new THREE.Vector3(4, 0.46, 2));
  p.update(dt, s);
  for (let frame = 0; frame < 30; frame++) { s.locomotionPositionWorld.z -= 2.75 * dt; p.update(dt, s); }
  assert.ok(p.diagnostics.baseMotionStrength > 0.49 && p.diagnostics.baseMotionStrength < 0.51);
  p.present(0); const previous = shader.uniforms.uVoltBaseOffset.value.z;
  p.present(1); const current = shader.uniforms.uVoltBaseOffset.value.z;
  p.present(0.5); assert.ok(Math.abs(shader.uniforms.uVoltBaseOffset.value.z - (previous + current) / 2) < 1e-12);
  const paused = p.diagnostics; p.update(0, s); assert.deepEqual(p.diagnostics, paused);
  s.grounded = false; s.velocityWorld.y = -6;
  for (let i = 0; i < 10; i++) p.update(dt, s);
  s.grounded = true; s.velocityWorld.y = 0; p.onLanding(new THREE.Vector3(0, 1, 0), 8.5); p.update(dt, s);
  for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
    p.present(alpha); assert.equal(shader.uniforms.uVoltBaseOffset.value.y, 0);
    const pivot = p.root.getObjectByName('volt-sole-pivot')!;
    assert.ok(Math.abs(new THREE.Vector3(0, -0.45, 0).applyMatrix4(pivot.matrix).y + 0.45) < 1e-12);
    assert.deepEqual(light.getWorldPosition(new THREE.Vector3()).toArray(), [4, 0.46, 2]);
    assert.deepEqual(light.getWorldScale(new THREE.Vector3()).toArray(), [1, 1, 1]);
  }
  assert.equal(shader.uniforms.uVoltLandingRipple.value.x, 1);
  assert.ok(shader.uniforms.uBobImpactStrength.value > 0);
  const key = (body.material as THREE.Material).customProgramCacheKey(), version = (body.material as THREE.Material).version;
  p.setOpacity(0.4); p.present();
  assert.equal((body.material as THREE.Material).customProgramCacheKey(), key);
  assert.equal((body.material as THREE.Material).version, version);
  const beforeDeath = p.diagnostics; p.startDeath(p.placement.position); p.update(dt, s);
  assert.equal(p.diagnostics.signedLean, beforeDeath.signedLean);
  p.finishDeath(p.placement.position); p.present();
  assert.equal(shader.uniforms.uVoltBaseOffset.value.length(), 0); assert.equal(shader.uniforms.uVoltCrestLag.value.length(), 0);
  assert.equal(shader.uniforms.uVoltLandingRipple.value.x, 0); assert.equal(shader.uniforms.uBobImpactStrength.value, 0);
  assert.equal(p.diagnostics.opacity, 1); assert.equal(p.diagnostics.squash + p.diagnostics.stretch, 0);
  s.movementIntentWorld.set(0, 0, 0); p.update(dt, s);
  p.setPosition(new THREE.Vector3(12, 3, 9)); p.update(dt, s);
  s.locomotionPositionWorld.x += 0.06; p.update(dt, s);
  s.movementIntentWorld.x = 1; s.locomotionPositionWorld.x += 15; p.update(dt, s);
  assert.equal(p.diagnostics.baseMotionStrength + p.diagnostics.locomotionStrength + p.diagnostics.polish.crestLagMetres, 0);
  p.dispose();
});

test('maximum elastic offsets protect every eye vertex and keep the combined real GLB surface closed and planted', async () => {
  const p = new VoltCharacterPresentation(); await p.prepare(loadVolt);
  const body = p.root.getObjectByName('Volt-Body') as THREE.Mesh;
  const shader = compile(body.material as THREE.Material, 'physical');
  assert.match(shader.vertexShader, /objectNormal = normalize\([\s\S]*cross\(voltElasticJacobian/);
  const original = new THREE.Vector3(), elastic = new THREE.Vector3(), morphed = new THREE.Vector3();
  const base = new THREE.Vector3(0.08, 0, 0), crest = new THREE.Vector2(0, 0.02);
  for (const name of ['Volt-Eye-Left', 'Volt-Eye-Right']) {
    const eye = p.root.getObjectByName(name) as THREE.Mesh, positions = eye.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      original.fromBufferAttribute(positions, i); assert.equal(voltMotionProtection(original), 0);
      evaluateVoltElasticPosition(original, base, crest, 1, 0.15, elastic);
      assert.ok(elastic.distanceTo(original) < 1e-12, 'body-only waves and drag cannot unseat the lens');
    }
  }
  const s = state(); p.onLanding(new THREE.Vector3(0, 1, 0), 8.5); p.update(dt, s);
  const pivot = p.root.getObjectByName('volt-sole-pivot')!;
  const positions = body.geometry.getAttribute('position'), index = body.geometry.index!, deformed = new Float64Array(positions.count * 3);
  const weights = p.diagnostics.weights;
  const authoredHeight = 1 - 0.1 * weights.Squash + 0.09 * weights.Stretch;
  const authoredSpread = 1 + weights.Squash * (1 / Math.sqrt(0.9) - 1) + weights.Stretch * (1 / Math.sqrt(1.09) - 1);
  const deformPoint = (point: THREE.Vector3, out: THREE.Vector3) => {
    evaluateVoltElasticPosition(point, base, crest, 1, 0.15, out);
    out.x += (authoredSpread - 1) * point.x; out.z += (authoredSpread - 1) * point.z;
    out.y += (authoredHeight - 1) * (point.y + 0.45);
    return out.applyMatrix4(pivot.matrix);
  };
  for (const verticalLag of [-0.04, 0, 0.04]) {
    base.y = verticalLag;
    let min = Infinity;
    for (let i = 0; i < positions.count; i++) {
      original.fromBufferAttribute(positions, i); body.getVertexPosition(i, morphed);
      evaluateVoltElasticPosition(original, base, crest, 1, 0.15, elastic);
      morphed.add(elastic.sub(original)).applyMatrix4(pivot.matrix);
      assert.ok(morphed.toArray().every(Number.isFinite)); min = Math.min(min, morphed.y);
      morphed.toArray(deformed, i * 3);
    }
    if (verticalLag === 0) assert.ok(Math.abs(min + 0.45) < 1e-6);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3(), reference = new THREE.Vector3(), edge = new THREE.Vector3();
    const centroid = new THREE.Vector3(), probe = new THREE.Vector3(), plus = new THREE.Vector3(), minus = new THREE.Vector3();
    const jacobian = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const cofactor = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], expected = new THREE.Vector3();
    let volume = 0;
    for (let i = 0; i < index.count; i += 3) {
      const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
      a.fromBufferAttribute(positions, ia); b.fromBufferAttribute(positions, ib); c.fromBufferAttribute(positions, ic);
      reference.subVectors(b, a).cross(edge.subVectors(c, a));
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      for (const [axis, component] of ['x', 'y', 'z'].entries()) {
        probe.copy(centroid); probe[component as 'x' | 'y' | 'z'] += 0.0001; deformPoint(probe, plus);
        probe.copy(centroid); probe[component as 'x' | 'y' | 'z'] -= 0.0001; deformPoint(probe, minus);
        jacobian[axis].subVectors(plus, minus).multiplyScalar(1 / 0.0002);
      }
      cofactor[0].crossVectors(jacobian[1], jacobian[2]); cofactor[1].crossVectors(jacobian[2], jacobian[0]);
      cofactor[2].crossVectors(jacobian[0], jacobian[1]);
      assert.ok(jacobian[0].dot(cofactor[0]) > 0, 'no local folds');
      expected.copy(cofactor[0]).multiplyScalar(reference.x).addScaledVector(cofactor[1], reference.y).addScaledVector(cofactor[2], reference.z);
      a.fromArray(deformed, ia * 3); b.fromArray(deformed, ib * 3); c.fromArray(deformed, ic * 3);
      volume += a.dot(normal.crossVectors(b, c)) / 6;
      normal.subVectors(b, a).cross(edge.subVectors(c, a));
      // A shear can rotate a valid face past 90 degrees relative to its neutral
      // normal. Check winding against the deformed local frame instead.
      assert.ok(normal.lengthSq() > 1e-20, 'no collapsed triangles'); assert.ok(normal.dot(expected) > 0, 'no inverted faces');
    }
    assert.ok(volume > 0);
  }
  p.dispose();
});
