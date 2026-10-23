import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { loadSpecimen } from './fixtures/SpecimenAssetFixture.ts';
import { disposeSpecimenAsset, validateSpecimenAsset } from '../src/render/specimen/SpecimenAsset.ts';
import { SpecimenCharacterPresentation } from '../src/render/specimen/SpecimenCharacterPresentation.ts';
import { GelRendering } from '../src/render/slime/GelRendering.ts';
import { CameraRig } from '../src/render/CameraRig.ts';

const state = () => ({ position: new THREE.Vector3(), locomotionPosition: new THREE.Vector3(), velocity: new THREE.Vector3(),
  maximumLocomotionSpeedMetresPerSecond: 6,
  gameplayUp: new THREE.Vector3(0, 1, 0), grounded: true, landedThisStep: false, chargingJump: false, chargeFraction: 0 });
const attack = () => ({ aimActive: false, aimDirection: new THREE.Vector3(0, 0, -1), chargeAmount: 0 });

function travel(p: SpecimenCharacterPresentation, motion: ReturnType<typeof state>, frames: number, direction = new THREE.Vector3(0, 0, -1)) {
  motion.velocity.copy(direction).multiplyScalar(motion.maximumLocomotionSpeedMetresPerSecond);
  for (let i = 0; i < frames; i++) {
    motion.locomotionPosition.addScaledVector(motion.velocity, 1 / 60);
    p.update(1 / 60, motion, attack());
    p.present(1);
  }
}

test('hip-fire charging overrides travel facing and a tap faces its actual projectile direction', async () => {
  const p = new SpecimenCharacterPresentation(), motion = state(), combat = { ...attack(), charging: true };
  await p.prepare(loadSpecimen);
  try {
    combat.aimDirection.set(1, 0, 0);
    for (let i = 0; i < 30; i++) {
      motion.locomotionPosition.z -= 0.1;
      p.update(1 / 60, motion, combat);
    }
    assert.ok(Math.abs(p.diagnostics.yaw + Math.PI / 2) < 0.001, 'LMB follows the shot direction without RMB');
    combat.charging = false;
    p.onShot(new THREE.Vector3(0, 0, 1)); p.update(1 / 60, motion, combat); p.present(1);
    assert.ok(Math.abs(Math.cos(p.diagnostics.yaw) + 1) < 1e-6, 'a tap immediately faces the real muzzle direction');
    for (let i = 0; i < 10; i++) {
      motion.locomotionPosition.z -= 0.1; p.update(1 / 60, motion, combat);
    }
    assert.ok(Math.abs(Math.cos(p.diagnostics.yaw) + 1) < 1e-6, 'running cannot turn the body away during the firing pose');
    p.reset(); travel(p, motion, 60);
    assert.ok(Math.abs(p.diagnostics.yaw) < 0.001, 'reset clears the held firing direction');
  } finally { p.dispose(); }
});

test('Specimen leans into resolved running travel, counterleans through reversals and banks into turns', async () => {
  const p = new SpecimenCharacterPresentation(), motion = state();
  await p.prepare(loadSpecimen);
  try {
    p.update(1 / 60, motion, attack());
    travel(p, motion, 60);
    assert.ok(p.diagnostics.signedLean > 0.95);
    const forwardYaw = p.diagnostics.yaw;
    travel(p, motion, 1, new THREE.Vector3(0, 0, 1));
    assert.equal(p.diagnostics.reversing, true);
    assert.equal(p.diagnostics.yaw, forwardYaw, 'reverse first gathers the body before turning');
    travel(p, motion, 7, new THREE.Vector3(0, 0, 1));
    assert.ok(p.diagnostics.signedLean < 0, 'reverse travel loads a counterlean');
    let maximumBank = 0;
    for (let i = 0; i < 75; i++) {
      const before = p.diagnostics.yaw;
      travel(p, motion, 1, new THREE.Vector3(0, 0, 1));
      const change = Math.atan2(Math.sin(p.diagnostics.yaw - before), Math.cos(p.diagnostics.yaw - before));
      assert.ok(Math.abs(change) <= Math.PI * 3 / 60 + 1e-8, 'turn rate is bounded');
      maximumBank = Math.max(maximumBank, Math.abs(p.diagnostics.turnBank));
    }
    assert.ok(maximumBank > 0.35);
    assert.equal(p.diagnostics.reversing, false);
    assert.ok(p.diagnostics.signedLean > 0.9);
    for (let i = 0; i < 60; i++) p.update(1 / 60, motion, attack());
    assert.ok(Math.abs(p.diagnostics.signedLean) < 0.001, 'blocked velocity cannot keep a running lean');
    assert.ok(Math.abs(p.diagnostics.turnBank) < 0.001);
    p.setPosition(new THREE.Vector3(100, 5, 0));
    p.update(1 / 60, motion, attack());
    assert.ok(Math.abs(p.diagnostics.signedLean) < 0.001, 'carrier/placement travel does not drive locomotion');
    p.reset(); p.present(1);
    assert.equal(p.diagnostics.bodyHeightScale, 1);
    assert.equal(p.diagnostics.signedLean, 0);
    assert.equal(p.diagnostics.turnBank, 0);
    assert.equal(p.root.getObjectByName('specimen-elastic-motion')!.matrix.equals(new THREE.Matrix4()), true);
  } finally { p.dispose(); }
});

test('held jump compresses immediately, release springs into stretch, and landing compresses then settles', async () => {
  const p = new SpecimenCharacterPresentation(), motion = state();
  await p.prepare(loadSpecimen);
  try {
    motion.chargingJump = true;
    p.update(1 / 60, motion, attack());
    assert.ok(p.diagnostics.bodyHeightScale < 0.98, 'the first held frame starts gathering the body');
    for (let i = 0; i < 30; i++) {
      motion.chargeFraction = Math.min(1, (i + 1) / 21);
      p.update(1 / 60, motion, attack());
    }
    assert.ok(p.diagnostics.bodyHeightScale < 0.67);
    p.onLaunch({ chargeFraction: 1, speedMetresPerSecond: 24.6, directionWorld: { x: 0, y: 1, z: 0 } });
    motion.chargingJump = false; motion.chargeFraction = 0; motion.grounded = false; motion.velocity.y = 24.6;
    for (let i = 0; i < 4; i++) p.update(1 / 60, motion, attack());
    const launchHeight = p.diagnostics.bodyHeightScale;
    assert.ok(launchHeight > 1.2, 'takeoff releases the stored squash into a short spring');
    motion.velocity.y = 0;
    for (let i = 0; i < 30; i++) p.update(1 / 60, motion, attack());
    assert.ok(p.diagnostics.bodyHeightScale < launchHeight - 0.1, 'the launch pose relaxes near the apex');
    p.onLanding(20); motion.grounded = true; motion.landedThisStep = true;
    p.update(1 / 60, motion, attack()); motion.landedThisStep = false;
    for (let i = 0; i < 6; i++) p.update(1 / 60, motion, attack());
    assert.ok(p.diagnostics.bodyHeightScale < 0.83);
    for (let i = 0; i < 40; i++) p.update(1 / 60, motion, attack());
    assert.ok(Math.abs(p.diagnostics.bodyHeightScale - 1) < 0.002);
    assert.ok(Object.values(p.diagnostics.weights).every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  } finally { p.dispose(); }
});

test('lean and charged squash retain the sole plane at both playable scales and wall orientations', async () => {
  for (const radius of [0.675, 1.65]) {
    const p = new SpecimenCharacterPresentation(radius), motion = state();
    await p.prepare(loadSpecimen);
    try {
      p.setPosition(new THREE.Vector3(radius, 2, 0));
      motion.gameplayUp.set(1, 0, 0);
      p.update(1 / 60, motion, attack());
      travel(p, motion, 60);
      for (const charging of [false, true]) {
        motion.chargingJump = charging; motion.chargeFraction = charging ? 1 : 0;
        for (let i = 0; i < 30; i++) p.update(1 / 60, motion, attack());
        for (const alpha of [0, 0.5, 1]) {
          p.present(alpha); p.root.updateMatrixWorld(true);
          const sole = new THREE.Vector3(0, -0.45, 0);
          p.root.getObjectByName('The_Specimen')!.localToWorld(sole);
          assert.ok(Math.abs(sole.x) < 1e-6, `${radius} radius sole remains on the wall`);
          assert.ok(Math.abs(sole.y - 2) < 1e-6);
        }
      }
    } finally { p.dispose(); }
  }
});

test('active final-fusion GLB keeps six lightning-only regions, yellow vertex colours and playable morph clips', async () => {
  const root = await loadSpecimen(), asset = validateSpecimenAsset(root);
  assert.equal(asset.meshes.length, 6);
  assert.deepEqual([...new Set(asset.meshes.map(mesh => mesh.material.name))].sort(), [
    'Specimen-Charged-Junctions', 'Specimen-Golden-Discharge', 'Specimen-Obsidian-Eyes',
    'Specimen-Turquoise-Gel', 'Specimen-Yellow-Bolt-Tips',
  ]);
  assert.equal(root.getObjectByName('Specimen-Acid-Core'), undefined);
  assert.equal(root.getObjectByName('Specimen-Aqua-Currents'), undefined);
  const tips = asset.meshes.find(mesh => mesh.material.name === 'Specimen-Yellow-Bolt-Tips')!;
  assert.ok(tips.geometry.getAttribute('color'));
  assert.deepEqual(root.animations.map(clip => [clip.name, clip.tracks.length]), [['Idle', 6], ['Settle', 6], ['Charge', 6]]);
  tips.geometry.morphAttributes.position![0]!.setX(0, NaN);
  assert.throws(() => validateSpecimenAsset(root), /Non-finite/);
  disposeSpecimenAsset(root);
});

test('preparation deduplicates, retains requests, fades every region and releases owned resources once', async () => {
  const root = await loadSpecimen(), asset = validateSpecimenAsset(root), environment = new THREE.Texture();
  const policy = new GelRendering({ transmissionResolutionScale: 1 });
  const p = new SpecimenCharacterPresentation(0.675, policy);
  let resolve!: (root: THREE.Group) => void;
  const loader = () => new Promise<THREE.Group>(r => { resolve = r; });
  p.setVisible(true); p.setOpacity(0.4); p.setReflectionEnvironment(environment); p.setReflectionIntensity(0.12, 0.28);
  const pending = p.prepare(loader); assert.equal(p.prepare(loader), pending); await Promise.resolve(); resolve(root); await pending;
  assert.equal(p.diagnostics.visible, true); assert.equal(policy.materialCount, 2);
  assert.ok(asset.meshes.every(mesh => mesh.material.transparent && mesh.material.opacity <= 0.4 && mesh.material.envMap === environment));
  p.setOpacity(1);
  assert.ok(asset.meshes.filter(mesh => mesh.name.startsWith('Specimen-Eye')).every(mesh => !mesh.material.transparent));
  policy.setMode('minimum'); assert.ok(asset.meshes.every(mesh => mesh.material.transmission === 0));
  policy.setMode('physical'); assert.ok(asset.meshes.some(mesh => mesh.material.transmission > 0));
  const owned = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of asset.meshes) for (const resource of [mesh.geometry, mesh.material, mesh.customDepthMaterial, mesh.customDistanceMaterial]) if (resource) owned.add(resource);
  p.root.getObjectByName('specimen-action-effects')!.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      owned.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) owned.add(material);
    }
  });
  const disposed = new Map<object, number>();
  for (const resource of [...owned, environment]) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  p.dispose(); p.dispose();
  assert.equal(policy.materialCount, 0);
  for (const resource of owned) assert.equal(disposed.get(resource), 1);
  assert.equal(disposed.get(environment), undefined); environment.dispose();
});

test('failed loads retry; completion after disposal cannot attach a model or leak its data', async () => {
  const p = new SpecimenCharacterPresentation();
  await assert.rejects(p.prepare(async () => { throw new Error('offline'); }), /offline/);
  await p.prepare(loadSpecimen); assert.equal(p.ready, true); p.dispose();
  const late = new SpecimenCharacterPresentation(), root = await loadSpecimen(), mesh = validateSpecimenAsset(root).meshes[0]!;
  let releases = 0; mesh.geometry.addEventListener('dispose', () => releases++);
  let resolve!: (root: THREE.Group) => void;
  const pending = late.prepare(() => new Promise(r => { resolve = r; }));
  await Promise.resolve(); late.dispose(); resolve(root); await pending;
  assert.equal(releases, 1); assert.equal(late.ready, false); assert.equal(root.parent, null);
});

test('lightning capture and shell depth survive camera fades, quality switches and reset', async () => {
  const policy = new GelRendering({ transmissionResolutionScale: 1 });
  const p = new SpecimenCharacterPresentation(0.675, policy), root = await loadSpecimen();
  const asset = validateSpecimenAsset(root);
  await p.prepare(async () => root);
  const regions = asset.meshes.map(mesh => ({ mesh, material: mesh.material,
    opacity: mesh.material.opacity, depthWrite: mesh.material.depthWrite, order: mesh.renderOrder }));
  const interior = regions.filter(region => /Golden-Discharge|Charged-Junctions/.test(region.material.name));
  const shells = regions.filter(region => /Turquoise-Gel|Yellow-Bolt-Tips/.test(region.material.name));
  assert.equal(interior.length, 2);
  for (const { material } of interior) {
    assert.equal(material.transmission, 0);
    assert.equal(material.opacity, 1);
    assert.equal(material.depthWrite, true);
    assert.ok(material.emissiveIntensity >= 12);
  }
  for (const mode of ['minimum', 'reduced-transmission', 'physical'] as const) {
    policy.setMode(mode);
    p.setOpacity(0.25);
    assert.ok(regions.every(({ material }) => material.transparent && !material.depthWrite));
    p.reset();
    for (const { material, opacity, depthWrite } of regions) {
      assert.equal(material.transparent, false, 'restored regions must participate in the transmission capture');
      assert.equal(material.opacity, opacity);
      assert.equal(material.depthWrite, depthWrite);
    }
    for (const { material, order } of shells) {
      assert.equal(material.transmission > 0, mode !== 'minimum');
      assert.equal(material.depthWrite, true);
      assert.ok(order > Math.max(...interior.map(region => region.order)), 'Low quality composites the shell after the interior');
    }
    assert.ok(interior.every(({ material }) => material.depthWrite));
  }
  p.dispose();
});

test('living fusion surfaces share presentation time and charge; pupil coordinates preserve authored geometry', async () => {
  const root = await loadSpecimen(), asset = validateSpecimenAsset(root);
  const positions = asset.meshes.map(mesh => mesh.geometry.getAttribute('position').array.slice());
  const p = new SpecimenCharacterPresentation();
  await p.prepare(async () => root);
  const uniforms = [...new Set(asset.meshes.map(mesh => mesh.material))].map(material => {
    const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    return shader.uniforms;
  });
  for (const [index, mesh] of asset.meshes.entries()) {
    assert.deepEqual(mesh.geometry.getAttribute('position').array, positions[index]);
    if (!mesh.name.startsWith('Specimen-Eye')) continue;
    const pupil = mesh.geometry.getAttribute('specimenEye');
    assert.equal(pupil.count, mesh.geometry.getAttribute('position').count);
    assert.ok(pupil.array.every(Number.isFinite));
    assert.ok(Array.from({ length: pupil.count }, (_, i) => i).some(i =>
      Math.hypot(pupil.getX(i), pupil.getY(i)) < 1 && pupil.getZ(i) > 0.5));
  }
  const combat = attack(); combat.chargeAmount = 0.8;
  p.update(0.25, state(), combat); p.present(1);
  for (const surface of uniforms) {
    assert.equal(surface.uSpecimenTime!.value, 0.25);
    assert.equal(surface.uSpecimenCharge!.value, 0.8);
  }
  p.setVisible(true);
  const motion = state();
  p.onShot(combat.aimDirection, 1); p.onDamage(20);
  p.update(1 / 60, motion, { ...combat, charging: true, overchargeReady: true, overchargeProgress: 1 }); p.present(1);
  assert.ok(p.diagnostics.recoil > 0); assert.ok(p.diagnostics.damageRipple > 0);
  assert.equal(p.diagnostics.effects.chargeArcsVisible, true);
  for (const surface of uniforms) {
    assert.ok(surface.uSpecimenRecoil!.value > 0); assert.ok(surface.uSpecimenDamage!.value > 0);
    assert.equal(surface.uSpecimenOvercharge!.value, 1);
  }
  p.onLaunch({ chargeFraction: 1, speedMetresPerSecond: 20, directionWorld: motion.gameplayUp });
  p.onLanding(20, motion.position, motion.gameplayUp);
  assert.equal(p.diagnostics.effects.landingActive, true);
  p.setDashing(true); p.update(1 / 60, motion, { ...combat, charging: true });
  assert.ok(p.diagnostics.effects.afterimages > 0);
  p.setOpacity(0);
  assert.ok(p.diagnostics.effects.afterimages > 0, 'camera body fades cannot delete world-space dash echoes');
  assert.equal(p.diagnostics.effects.chargeArcsVisible, false);
  p.setOpacity(1); assert.equal(p.diagnostics.effects.chargeArcsVisible, true);
  const arcs = p.root.getObjectByName('specimen-charge-arcs') as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  assert.ok(arcs.material.opacity > 0, 'camera fade restoration restores both arc visibility and opacity');
  p.reset();
  assert.deepEqual(p.diagnostics.effects, { landingActive: false, chargeArcsVisible: false, afterimages: 0 });
  for (const surface of uniforms) {
    assert.equal(surface.uSpecimenTime!.value, 0);
    assert.equal(surface.uSpecimenCharge!.value, 0);
    assert.equal(surface.uSpecimenDamage!.value, 0); assert.equal(surface.uSpecimenOvercharge!.value, 0);
  }
  p.dispose();
});

test('motion, landing and aim deform every matching region while adhesion keeps the sole on the support plane', async () => {
  const p = new SpecimenCharacterPresentation(), root = await loadSpecimen(), asset = validateSpecimenAsset(root);
  await p.prepare(async () => root); p.setVisible(true);
  const motion = state(), combat = attack();
  p.update(1 / 60, motion, combat);
  motion.locomotionPosition.x += 0.08; motion.landedThisStep = true; combat.aimActive = true; combat.chargeAmount = 1;
  p.update(1 / 60, motion, combat); p.present(1);
  for (const mesh of asset.meshes) {
    assert.ok(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.Squash] > 0);
    const index = mesh.morphTargetDictionary!.Charge;
    if (index !== undefined) assert.equal(mesh.morphTargetInfluences![index], 1);
  }
  const gold = asset.meshes.find(mesh => mesh.material.name === 'Specimen-Golden-Discharge')!;
  assert.ok(gold.material.emissiveIntensity > 8);
  p.reset(); p.setPosition(new THREE.Vector3(0.675, 2, 0));
  motion.gameplayUp.set(1, 0, 0); motion.landedThisStep = false; combat.chargeAmount = 0;
  p.update(1 / 60, motion, combat); p.present(1); p.root.updateMatrixWorld(true);
  const sole = new THREE.Vector3(0, -0.45, 0);
  p.root.getObjectByName('The_Specimen')!.localToWorld(sole);
  assert.ok(Math.abs(sole.x) < 1e-6); assert.ok(Math.abs(sole.y - 2) < 1e-6);
  p.startDeath(motion.locomotionPosition); assert.equal(p.diagnostics.visible, false);
  p.reset(); assert.equal(p.diagnostics.visible, true); assert.equal(p.diagnostics.weights.Charge, 0);
  p.dispose();
});

test('first person suppresses all inner and outer regions only in the player-camera pass', async () => {
  const p = new SpecimenCharacterPresentation(), root = await loadSpecimen(), asset = validateSpecimenAsset(root);
  const camera = new THREE.PerspectiveCamera(), target = { position: new THREE.Vector3(), radiusMetres: 0.675 };
  const rig = { camera, isFirstPersonForTarget: (candidate: unknown) => candidate === target } as unknown as CameraRig;
  p.setCameraView(rig, target); await p.prepare(async () => root);
  for (const mesh of asset.meshes) {
    const depthWrite = mesh.material.depthWrite;
    const args = [null, null, camera, mesh.geometry, mesh.material, null] as unknown as Parameters<typeof mesh.onBeforeRender>;
    mesh.onBeforeRender(...args); assert.equal(mesh.material.colorWrite, false); assert.equal(mesh.material.depthWrite, false);
    mesh.onAfterRender(...args); assert.equal(mesh.material.colorWrite, true); assert.equal(mesh.material.depthWrite, depthWrite);
  }
  p.dispose();
});
