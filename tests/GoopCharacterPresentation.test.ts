import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { loadGoop } from './fixtures/GoopAssetFixture.ts';
import { GoopCharacterPresentation } from '../src/render/goop/GoopCharacterPresentation.ts';
import { disposeGoopAsset, GOOP_EYE_BOUNDS, validateGoopAsset } from '../src/render/goop/GoopAsset.ts';
import { GOOP_BASE_COLOR, GoopMaterialSet, goopMotionProtection } from '../src/render/goop/GoopMaterials.ts';
import { prepareCharacterCameraFades } from '../src/render/slime/PrepareCharacterCameraFades.ts';

function compile(material: THREE.Material, library: keyof typeof THREE.ShaderLib) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib[library].vertexShader, fragmentShader: THREE.ShaderLib[library].fragmentShader };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, null as never);
  return shader as typeof shader & { uniforms: Record<string, THREE.IUniform> };
}

test('real Goop export validates geometry, its own axis/contact metadata, and static hierarchy', async () => {
  const report = JSON.parse(await readFile(new URL('../assets/characters/goop/goop.validation.json', import.meta.url), 'utf8'));
  const bytes = await readFile(new URL('../assets/characters/goop/goop.glb', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), report.glb_sha256);
  const root = await loadGoop();
  const asset = validateGoopAsset(root);
  assert.equal(asset.body.geometry.index!.count / 3, 26804);
  assert.equal(asset.eyes.reduce((n, eye) => n + eye.geometry.index!.count / 3, 0), 6912);
  disposeGoopAsset(root);
  for (const change of [
    (fresh: THREE.Group) => { fresh.getObjectByName('Goop')!.userData.local_forward = '-Z'; },
    (fresh: THREE.Group) => { (fresh.getObjectByName('Goop-Body') as THREE.Mesh).geometry.getAttribute('normal').setX(0, NaN); },
    (fresh: THREE.Group) => { fresh.add(new THREE.Group()); },
    (fresh: THREE.Group) => { (fresh.getObjectByName('Goop-Body') as THREE.Mesh).geometry.index!.setX(0, 999999); },
  ]) {
    const fresh = await loadGoop();
    change(fresh); assert.throws(() => validateGoopAsset(fresh), /Goop asset contract/);
    disposeGoopAsset(fresh);
  }
});

test('replacing imported materials disposes shared materials and owned textures once', async () => {
  const root = await loadGoop(), p = new GoopCharacterPresentation();
  const imported = new Set<THREE.Material>();
  root.traverse(object => { if (object instanceof THREE.Mesh) for (const material of [object.material].flat()) imported.add(material); });
  const texture = new THREE.Texture();
  let texturesDisposed = 0, materialsDisposed = 0;
  texture.addEventListener('dispose', () => texturesDisposed++);
  for (const material of imported) {
    (material as THREE.MeshPhysicalMaterial).map = texture;
    material.addEventListener('dispose', () => materialsDisposed++);
  }
  await p.prepare(async () => root);
  assert.equal(texturesDisposed, 1); assert.equal(materialsDisposed, 2);
  p.dispose(); assert.equal(texturesDisposed, 1); assert.equal(materialsDisposed, 2);
});

test('pre-load visibility, fades, reflection and shadow requests survive concurrent preparation', async () => {
  const p = new GoopCharacterPresentation();
  const env = new THREE.Texture();
  let resolve!: (root: THREE.Group) => void, calls = 0;
  const loader = () => { calls++; return new Promise<THREE.Group>(r => { resolve = r; }); };
  p.setVisible(false); p.setOpacity(0.4); p.setShadowCasting(false);
  p.setReflectionEnvironment(env); p.setReflectionIntensity(0.2, 0.3, true);
  const first = p.prepare(loader), second = p.prepare(loader);
  assert.equal(first, second); await Promise.resolve(); assert.equal(calls, 1);
  resolve(await loadGoop()); await first;
  assert.equal(p.diagnostics.visible, false);
  assert.equal(p.diagnostics.opacity, 0.4);
  assert.equal(p.diagnostics.materials!.bodyReflectionIntensity, 0.2);
  assert.equal((p.root.getObjectByName('Goop-Body') as THREE.Mesh).castShadow, false);
  p.setVisible(true); assert.equal(p.diagnostics.visible, true);
  let envDisposals = 0; env.addEventListener('dispose', () => envDisposals++);
  p.dispose(); p.dispose(); assert.equal(envDisposals, 0); env.dispose();
});

test('failure permits retry and resolution after disposal releases every imported resource once', async () => {
  const p = new GoopCharacterPresentation();
  await assert.rejects(p.prepare(async () => { throw new Error('offline'); }), /offline/);
  await p.prepare(loadGoop); assert.equal(p.ready, true); p.dispose();
  const late = new GoopCharacterPresentation(), root = await loadGoop();
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of [o.material].flat()) materials.add(m); } });
  const disposals = new Map<object, number>();
  for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  let resolve!: (root: THREE.Group) => void;
  const pending = late.prepare(() => new Promise<THREE.Group>(r => { resolve = r; }));
  await Promise.resolve(); late.dispose(); resolve(root); await pending;
  assert.equal(late.ready, false); assert.equal(late.root.children.length, 0);
  for (const resource of [...geometries, ...materials]) assert.equal(disposals.get(resource), 1);
});

test('normal jumps and landings deform the whole seated group about the sole then settle exactly', async () => {
  const p = new GoopCharacterPresentation(); await p.prepare(loadGoop);
  const position = new THREE.Vector3(0, 0.46, 0), intent = new THREE.Vector3();
  const state = { locomotionPositionWorld: position, movementIntentWorld: intent, grounded: true };
  p.setPosition(position); p.onLaunch({ directionWorld: { x: 0, y: 1, z: 0 }, speedMetresPerSecond: 6, chargeFraction: 1 });
  p.update(0.09, state); p.present(); assert.ok(p.diagnostics.stretch > 0);
  const body = p.root.getObjectByName('Goop-Body')!;
  const sole = body.localToWorld(new THREE.Vector3(0, -0.45, 0));
  assert.ok(Math.abs(sole.y - 0.01) < 1e-8);
  p.onLanding({ x: 0, y: 1, z: 0 }, 9); p.update(0.14, state); p.present(); assert.ok(p.diagnostics.squash > 0);
  p.update(2, state); p.present(); assert.equal(p.diagnostics.squash, 0); assert.equal(p.diagnostics.stretch, 0);
  // Carrier movement and a teleport with no player intent cannot steer facing.
  position.x += 5; p.update(1 / 60, state); assert.equal(p.diagnostics.facingYawRadians, 0);
  intent.x = 1; position.x += 0.05; p.update(1 / 60, state); assert.ok(p.diagnostics.facingYawRadians < 0);
  p.reset(); assert.equal(p.diagnostics.facingYawRadians, 0); assert.equal(p.diagnostics.materials!.impactStrength, 0);
  p.dispose();
});

test('maximum combined shader motion protects complete eye bounds, sole, forelock and tips', () => {
  for (const bounds of GOOP_EYE_BOUNDS) {
    for (let x = 0; x <= 4; x++) for (let y = 0; y <= 4; y++) for (let z = 0; z <= 4; z++) {
      const point = new THREE.Vector3().lerpVectors(bounds.min, bounds.max, 0); // independent coordinates
      point.set(THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, x / 4), THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, y / 4), THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, z / 4));
      assert.equal(goopMotionProtection(point), 0);
    }
  }
  assert.equal(goopMotionProtection(new THREE.Vector3(0, -0.45, 0)), 0);
  assert.equal(goopMotionProtection(new THREE.Vector3(0, 0.4, 0)), 0);
  // The lowest rear spike is below the dome; the forelock touches its front.
  assert.equal(goopMotionProtection(new THREE.Vector3(0, -0.07, 0.70)), 0);
  assert.equal(goopMotionProtection(new THREE.Vector3(0, 0.145, -0.25)), 0);
  const materials = new GoopMaterialSet();
  const surface = compile(materials.body, 'physical');
  for (const shadow of [compile(materials.bodyDepth, 'depth'), compile(materials.bodyDistance, 'distance')]) {
    for (const name of ['uBobSecondaryTime', 'uBobImpactPointLocal', 'uBobImpactStrength', 'uBobImpactAge']) assert.equal(shadow.uniforms[name], surface.uniforms[name]);
    assert.match(shadow.vertexShader, /goopProtection/);
  }
  assert.ok(materials.body.color.equals(GOOP_BASE_COLOR));
  assert.equal(materials.body.emissiveIntensity, 0); assert.equal(materials.body.transmission, 0.28);
  materials.setImpact(new THREE.Vector3(), 1); materials.update(2);
  assert.equal(materials.diagnostics.impactStrength, 0);
  for (const m of [materials.body, materials.eyes, materials.bodyDepth, materials.bodyDistance, materials.eyeDepth, materials.eyeDistance]) m.dispose();
});

test('camera fades keep shader keys stable and eyes return opaque; death never resurrects through locator updates', async () => {
  const p = new GoopCharacterPresentation(); await p.prepare(loadGoop);
  const body = p.root.getObjectByName('Goop-Body') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  const eye = p.root.getObjectByName('Goop-Eye-Left') as typeof body;
  const key = body.material.customProgramCacheKey();
  p.setOpacity(0.5); const version = eye.material.version;
  p.setOpacity(0.25); assert.equal(eye.material.version, version);
  await assert.rejects(p.prepareCameraFadePrograms(async () => { throw new Error('compile'); }), /compile/);
  assert.equal(p.diagnostics.opacity, 0.25); p.setOpacity(1); assert.equal(eye.material.transparent, false);
  assert.equal(body.material.customProgramCacheKey(), key);
  const origin = new THREE.Vector3(2, 0.46, 3); assert.equal(p.startDeath(origin), true); assert.equal(p.startDeath(origin), false);
  p.updateDeath(0.08); p.setVisible(true); assert.equal(p.diagnostics.visible, false); assert.equal(body.castShadow, false);
  assert.deepEqual(p.diagnostics.deathBurst.origin.toArray(), origin.toArray());
  const droplets = p.root.getObjectByName('player-slime-death-droplets') as THREE.InstancedMesh;
  const color = new THREE.Color(); droplets.getColorAt(0, color); assert.ok(color.g > color.r && color.g > color.b);
  p.finishDeath(origin); assert.equal(p.diagnostics.visible, true); assert.equal(p.diagnostics.opacity, 1); p.dispose();
});

test('shared fade preparation restores every presentation when compilation fails', async () => {
  const first = new GoopCharacterPresentation(), second = new GoopCharacterPresentation();
  first.setOpacity(0.8); second.setOpacity(0.3);
  await assert.rejects(prepareCharacterCameraFades([first, second], () => {
    assert.equal(first.diagnostics.opacity, 0.5);
    assert.equal(second.diagnostics.opacity, 0.5);
    throw new Error('cancelled compilation');
  }), /cancelled compilation/);
  assert.equal(first.diagnostics.opacity, 0.8); assert.equal(second.diagnostics.opacity, 0.3);
  first.dispose(); second.dispose();
});

test('recovery snaps the next room reflection target and ordinary changes blend', async () => {
  const p = new GoopCharacterPresentation(); await p.prepare(loadGoop);
  p.setReflectionIntensity(0.3, 0.6);
  assert.equal(p.diagnostics.materials!.bodyReflectionIntensity, 0.3);
  p.setReflectionIntensity(0.1, 0.2);
  assert.equal(p.diagnostics.materials!.bodyReflectionIntensity, 0.3);
  p.reset(); p.setReflectionIntensity(0, 0);
  assert.equal(p.diagnostics.materials!.bodyReflectionIntensity, 0);
  assert.equal(p.diagnostics.materials!.eyeReflectionIntensity, 0);
  p.dispose();
});
