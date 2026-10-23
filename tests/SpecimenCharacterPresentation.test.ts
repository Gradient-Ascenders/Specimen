import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { loadSpecimen } from './fixtures/SpecimenAssetFixture.ts';
import { disposeSpecimenAsset, validateSpecimenAsset } from '../src/render/specimen/SpecimenAsset.ts';
import { SpecimenCharacterPresentation } from '../src/render/specimen/SpecimenCharacterPresentation.ts';
import { GelRendering } from '../src/render/slime/GelRendering.ts';
import { CameraRig } from '../src/render/CameraRig.ts';

const state = () => ({ locomotionPosition: new THREE.Vector3(), velocity: new THREE.Vector3(),
  gameplayUp: new THREE.Vector3(0, 1, 0), grounded: true, landedThisStep: false, chargingJump: false, chargeFraction: 0 });
const attack = () => ({ aimActive: false, aimDirection: new THREE.Vector3(0, 0, -1), chargeAmount: 0 });

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
  p.reset();
  for (const surface of uniforms) {
    assert.equal(surface.uSpecimenTime!.value, 0);
    assert.equal(surface.uSpecimenCharge!.value, 0);
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
