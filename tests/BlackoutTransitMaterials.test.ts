import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { maintenanceMaps } from './helpers/BlackoutMaintenanceMapData.ts';
import { BlackoutMaintenanceMaterials } from '../src/render/environment/blackout/BlackoutMaintenanceMaterials.ts';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';
import { BlackoutTransitController } from '../src/levels/BlackoutTransitController.ts';
import { BlackoutLevelScene } from '../src/levels/BlackoutLevelScene.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';

const hash = (a: ArrayBufferView) => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
function fixture() {
  const kit = new BlackoutMaintenanceMaterials(maintenanceMaps), room = new BlackoutTransitRoom(kit);
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry(), electricalTargets = new ElectricalTargetRegistry(world);
  const controller = new BlackoutTransitController({ room, world, surfaces, electricalTargets });
  return { kit, room, controller, dispose() { controller.dispose(); electricalTargets.dispose(); room.dispose(); kit.dispose(); } };
}
const material = (mesh: THREE.Mesh) => mesh.material as THREE.MeshStandardMaterial;

test('textured static and interactive geometry preserves the reviewed transit baseline', () => {
  const f = fixture();
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/blackout-transit-authored-surfaces.json', import.meta.url), 'utf8'));
  const meshes: THREE.Mesh[] = [];
  f.room.root.traverse(m => { if (m instanceof THREE.Mesh && !m.name.includes('batched') && !m.userData.visualOnly) meshes.push(m); });
  try {
    assert.equal(meshes.length, baseline.surfaces.length);
    for (const [i, mesh] of meshes.entries()) {
      const saved = baseline.surfaces[i];
      assert.equal(mesh.name, saved.name);
      assert.equal(mesh.geometry.type, saved.geometry);
      assert.deepEqual(mesh.position.toArray(), saved.position, mesh.name);
      assert.deepEqual(mesh.rotation.toArray(), saved.rotation, mesh.name);
      assert.deepEqual(mesh.scale.toArray(), saved.scale, mesh.name);
      assert.deepEqual(mesh.userData, saved.userData, mesh.name);
      assert.equal(f.room.collisionMeshes.includes(mesh), saved.collider);
      assert.equal(hash(mesh.geometry.attributes.position.array), saved.positionHash, mesh.name);
      assert.equal(hash(mesh.geometry.attributes.normal.array), saved.normalHash, mesh.name);
      assert.equal(mesh.geometry.index ? hash(mesh.geometry.index.array) : null, saved.indexHash, mesh.name);
      assert.equal(mesh.castShadow, saved.castShadow); assert.equal(mesh.receiveShadow, saved.receiveShadow);
    }
  } finally { f.dispose(); }
});

test('authored surfaces carry shared maps, metric charts and distinct sticky/support finishes', () => {
  const f = fixture();
  try {
    const exceptions = /acid-surface|hallway-bulb|threshold-light|main-entry-frame-top|searchlight/;
    for (const mesh of f.room.root.children) {
      if (!(mesh instanceof THREE.Mesh) || exceptions.test(mesh.name)) continue;
      const m = material(mesh);
      assert.ok(m.normalMap, mesh.name); assert.ok(m.roughnessMap, mesh.name);
      assert.ok(m.userData.tileSizeMetres, mesh.name);
      const uv = mesh.geometry.attributes.uv;
      assert.ok([...uv.array].every(Number.isFinite), mesh.name);
    }
    const sticky = material(f.room.bobSwitchWall), deck = material(f.room.catwalk);
    assert.notEqual(sticky, deck); assert.notEqual(sticky.color.getHex(), deck.color.getHex());
    for (const cover of f.controller.covers) {
      assert.ok(material(cover.panel).map);
      assert.ok(material(cover.support.mesh).map);
      assert.notEqual(material(cover.panel).map, material(cover.support.mesh).map);
      assert.equal(cover.support.mesh.userData.soluble, true);
      assert.notEqual(cover.panel.userData.soluble, true);
    }
    assert.equal(f.kit.diagnostics.textureCount, 24, 'Room 2 reuses eight existing families without new maps');
  } finally { f.dispose(); }
});

test('bridge partial deployment and retraction maintain metric length without reallocating buffers', () => {
  const f = fixture();
  try {
    const bridge = f.controller.root.getObjectByName('transit-deployable-bridge-deck') as THREE.Mesh<THREE.BoxGeometry>;
    const uv = bridge.geometry.attributes.uv, array = uv.array;
    const normal = bridge.geometry.attributes.normal;
    const startVertex = [...Array(normal.count).keys()].find(i => normal.getY(i) === 1 && bridge.geometry.attributes.position.getX(i) < 0)!;
    const startU = uv.getX(startVertex);
    const full = bridge.geometry.parameters.width / material(bridge).userData.tileSizeMetres[0];
    for (const progress of [1, .5, .15, .75, .3, 0, 1]) {
      const state = f.controller.capture() as any;
      state.bridgeProgress = progress; state.bridgeDeployed = progress >= .98;
      f.controller.restore(state);
      const u: number[] = [];
      for (let i = 0; i < normal.count; i++) if (normal.getY(i) === 1) u.push(uv.getX(i));
      assert.ok(Math.abs(Math.max(...u) - Math.min(...u) - full * Math.max(.001, progress)) < 1e-5);
      assert.equal(uv.getX(startVertex), startU, 'fixed bridge end retains its texture phase');
      assert.equal(bridge.geometry.attributes.uv, uv); assert.equal(uv.array, array);
    }
  } finally { f.dispose(); }
});

test('lift motion leaves charts fixed and independent powered indicators retain private materials', () => {
  const f = fixture();
  try {
    f.controller.setActive(true);
    const indicators = [...f.controller.lights.map(l => l.targetMaterial), f.controller.lockReceiver.targetMaterial, f.room.switchButton.material];
    for (const lift of f.controller.lifts) indicators.push(material(lift.root.getObjectByName(`${lift.id}-conducting-contact`) as THREE.Mesh));
    assert.equal(new Set(indicators).size, indicators.length);
    assert.ok(indicators.every(m => m.normalMap));
    const dark = f.controller.lights[1].targetMaterial.emissiveIntensity;
    const snapshot = f.controller.capture() as any;
    snapshot.lights[0] = { charge: 1, latched: true };
    f.controller.restore(snapshot);
    assert.ok(f.controller.lights[0].targetMaterial.emissiveIntensity > 0);
    assert.equal(f.controller.lights[1].targetMaterial.emissiveIntensity, dark);
    for (const lift of f.controller.lifts) {
      const before = hash(lift.platform.collisionMesh.geometry.attributes.uv.array);
      const deckMap = lift.platform.collisionMesh.material.map;
      lift.core.setSupply('test', true);
      for (let i = 0; i < 160; i++) lift.updateMechanics(1 / 60, []);
      assert.equal(lift.platform.progress, 1);
      assert.equal(hash(lift.platform.collisionMesh.geometry.attributes.uv.array), before);
      assert.equal(lift.platform.collisionMesh.material.map, deckMap);
    }
    const cover = f.controller.covers[0];
    cover.support.advance(cover.support.dissolveDurationSeconds);
    assert.equal(cover.support.completed, true);
    const saved = f.controller.capture(); f.controller.reset(); f.controller.restore(saved);
    assert.equal(cover.support.completed, true); assert.equal(cover.panel.visible, true);
    f.controller.reset(); assert.equal(cover.support.completed, false);
  } finally { f.dispose(); }
});

test('Room 2 borrowers survive until the bay owner disposes maps exactly once across repeated scenes', () => {
  for (let cycle = 0; cycle < 3; cycle++) {
    const scene = new BlackoutLevelScene(true, maintenanceMaps), room = scene.transitRoom!;
    const world = new CollisionWorld(), surfaces = new SurfaceRegistry(), electricalTargets = new ElectricalTargetRegistry(world);
    const controller = new BlackoutTransitController({room, world, surfaces, electricalTargets});
    const kit = scene.maintenanceBay!.surfaceMaterials;
    const textures = new Set<THREE.Texture>();
    for (const family of ['wallPanel','ceilingPanel','floorDeck','acidPlatform','basinMetal','warningPaint','ductSteel','machineryMetal'] as const) {
      const m = kit.get(family); for (const t of [m.map!,m.roughnessMap!,m.normalMap!]) textures.add(t);
    }
    const counts = new Map<THREE.Texture, number>();
    for (const t of textures) { counts.set(t, 0); t.addEventListener('dispose', () => counts.set(t, counts.get(t)! + 1)); }
    assert.equal(kit.diagnostics.textureCount, 24);
    const owned = [controller.lights[0].targetMaterial, controller.lights[1].targetMaterial, controller.lights[2].targetMaterial,
      material(controller.covers[0].panel), material(controller.lifts[0].root.getObjectByName('transit-lift-a-contact-mount') as THREE.Mesh)];
    const materialCounts = new Map(owned.map(m => [m, 0]));
    for (const m of owned) m.addEventListener('dispose', () => materialCounts.set(m, materialCounts.get(m)! + 1));
    controller.dispose(); controller.dispose(); room.dispose(); room.dispose();
    assert.ok([...materialCounts.values()].every(n => n === 1), 'controller-owned surfaces and fittings dispose once');
    assert.ok([...counts.values()].every(n => n === 0));
    assert.equal(kit.get('floorDeck').map, [...textures][6]);
    scene.dispose(); scene.dispose();
    assert.ok([...counts.values()].every(n => n === 1));
    electricalTargets.dispose();
  }
});
