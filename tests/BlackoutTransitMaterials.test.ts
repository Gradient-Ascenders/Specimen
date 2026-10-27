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

test('deployed bridge top corners meet both anchors across its full width', () => {
  const f = fixture();
  try {
    for (const enemy of f.controller.emergingDrones) enemy.state.destroy();
    const bridge = f.controller.root.getObjectByName('transit-deployable-bridge-deck') as THREE.Mesh<THREE.BoxGeometry>;
    const state = f.controller.capture() as any;
    state.bridgeProgress = 1; state.bridgeDeployed = true;
    f.controller.restore(state);
    f.room.root.updateMatrixWorld(true);
    const { width, height, depth } = bridge.geometry.parameters;
    const crossBridge = new THREE.Vector3().subVectors(f.room.bridgeEnd, f.room.bridgeStart);
    crossBridge.set(-crossBridge.z, 0, crossBridge.x).normalize();
    for (const [end, anchor] of [[-1, f.room.bridgeStart], [1, f.room.bridgeEnd]] as const) {
      for (const side of [-1, 1]) {
        const corner = bridge.localToWorld(new THREE.Vector3(end * width / 2, height / 2, side * depth / 2));
        const expected = anchor.clone().addScaledVector(crossBridge, side * depth / 2);
        assert.ok(corner.distanceTo(expected) < 1e-8,
          `end ${end}, side ${side}: ${corner.toArray()} must meet ${expected.toArray()}`);
      }
    }
  } finally { f.dispose(); }
});

test('textured static and interactive geometry preserves the reviewed transit baseline', () => {
  const f = fixture();
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/blackout-transit-authored-surfaces.json', import.meta.url), 'utf8'));
  // Retain the reviewed geometry contract except the replaced drone/cover
  // family and the explicitly removed light hangers/two observation-panel rods.
  baseline.surfaces = baseline.surfaces.filter((saved: { name: string }) =>
    !/^transit-(cover|security|bridge-cover|light-bank-hanger-)/.test(saved.name) &&
    !/^transit-laser-[ab]-(presentation-emitter-|emitter-(start|end)-proxy)/.test(saved.name) &&
    !['transit-east-service-conduit-96', 'transit-east-service-conduit-116'].includes(saved.name));
  const meshes: THREE.Mesh[] = [];
  f.room.root.traverse(m => {
    if (!(m instanceof THREE.Mesh) || m.name.includes('batched') || m.userData.visualOnly || m.userData.sharedLaserEmitter) return;
    for (let ancestor: THREE.Object3D | null = m; ancestor; ancestor = ancestor.parent) {
      if (ancestor.name.startsWith('transit-sewer-drone-')) return;
    }
    meshes.push(m);
  });
  try {
    assert.equal(meshes.length, baseline.surfaces.length);
    for (const [i, mesh] of meshes.entries()) {
      const saved = baseline.surfaces[i];
      assert.equal(mesh.name, saved.name);
      assert.equal(mesh.geometry.type, saved.geometry);
      assert.deepEqual(mesh.position.toArray(), saved.position, mesh.name);
      // JSON snapshots cannot retain the signed zero produced by basis rotations.
      assert.deepEqual(mesh.rotation.toArray().map(value => value === 0 ? 0 : value), saved.rotation, mesh.name);
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
    for (const enemy of f.controller.emergingDrones) {
      assert.equal(enemy.target.mesh.userData.soluble, true);
      assert.equal(enemy.shell.body.geometry.hasAttribute('color'), true);
    }
    assert.equal(f.kit.diagnostics.textureCount, 24, 'Room 2 reuses eight existing families without new maps');
  } finally { f.dispose(); }
});

test('bridge partial deployment and retraction maintain metric length without reallocating buffers', () => {
  const f = fixture();
  try {
    for (const enemy of f.controller.emergingDrones) enemy.state.destroy();
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
    for (const enemy of f.controller.emergingDrones) enemy.state.destroy();
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
    const enemy = f.controller.emergingDrones[0]; enemy.state.destroy();
    const saved = f.controller.capture(); f.controller.reset(); f.controller.restore(saved);
    assert.equal(enemy.target.completed, true); assert.equal(enemy.shell.body.visible, false);
    f.controller.reset(); assert.equal(enemy.target.completed, false);
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
      material(controller.lifts[0].root.getObjectByName('transit-lift-a-contact-mount') as THREE.Mesh)];
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
