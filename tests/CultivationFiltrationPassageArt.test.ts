import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoLabPassageGreybox } from '../src/levels/LevelTwoLabPassageGreybox.ts';
import { LevelTwoAirDuctGreybox } from '../src/levels/LevelTwoAirDuctGreybox.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CollisionHit, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import { CultivationContaminationArt } from '../src/render/environment/cultivation/CultivationContaminationArt.ts';
import { CultivationFiltrationPassageArt } from '../src/render/environment/cultivation/CultivationFiltrationPassageArt.ts';
import { auditOpaqueSurfaces } from '../src/render/geometry/OpaqueSurfaceAudit.ts';

test('filtration niches preserve both routes and the Bob-controlled Goop entry lock', () => {
  const passage = new LevelTwoLabPassageGreybox({
    id: 'cultivation-room-2-to-3-goop-lab-passage', fromRoomId: 2, toRoomId: 3,
    widthMetres: 7, heightMetres: 6.5, lengthMetres: 28, doorwayWidthMetres: 4,
    doorwayHeightMetres: 4.6, entryInitiallyLocked: true, routeOwner: 'goop',
  });
  const duct = new LevelTwoAirDuctGreybox({
    id: 'cultivation-room-2-to-3-bob-air-duct', fromRoomId: 2, toRoomId: 3,
    innerWidthMetres: 2, innerHeightMetres: 2.1, lengthMetres: 28,
  });
  duct.root.position.set(8, 18.8, 0);
  const lab = new CultivationLabMaterials(cultivationAssets), contamination = new CultivationContaminationArt(lab);
  lab.dress(passage.builder, [], contamination.overrides(passage.builder)); lab.dress(duct.builder);
  const colliders = [...passage.collisionMeshes, ...duct.collisionMeshes];
  const snapshots = colliders.map(mesh => ({ mesh, geometry: mesh.geometry, material: mesh.material,
    positions: Array.from(mesh.geometry.getAttribute('position').array), position: mesh.position.toArray(),
    quaternion: mesh.quaternion.toArray(), metadata: structuredClone(mesh.userData), visible: mesh.visible }));
  const art = new CultivationFiltrationPassageArt(passage, duct, lab, contamination);
  const world = new CollisionWorld(), hit = new CollisionHit();
  try {
    assert.deepEqual([...passage.collisionMeshes, ...duct.collisionMeshes], colliders);
    for (const s of snapshots) {
      assert.equal(s.mesh.geometry, s.geometry);
      assert.deepEqual(Array.from(s.mesh.geometry.getAttribute('position').array), s.positions);
      assert.deepEqual(s.mesh.position.toArray(), s.position);
      assert.deepEqual(s.mesh.quaternion.toArray(), s.quaternion);
      assert.deepEqual(s.mesh.userData, s.metadata);
      assert.equal(s.mesh.visible, s.visible);
    }
    world.registerAll(colliders);
    for (const [origin, direction, name] of [
      [[0, 3, 12], [1, 0, 0], `${passage.root.name}-east-wall`],
      [[0, 3, 20], [-1, 0, 0], `${passage.root.name}-west-wall`],
      [[0, 1, 15], [0, -1, 0], `${passage.root.name}-floor`],
      [[8, 19.6, 9.5], [1, 0, 0], `${duct.root.name}-east-wall`],
    ] as const) {
      assert.ok(world.raycast(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 8, hit));
      assert.equal(hit.object?.name, name, 'art cannot add routes, supports or collision obstacles');
    }
    const occupants = [{ id: 'goop', position: new THREE.Vector3(0, .66, 2), radiusMetres: .45 }];
    passage.update(2, occupants);
    assert.equal(passage.entryDoor.locked, true); assert.equal(passage.entryDoor.openProgress, 0);
    passage.entryDoor.setLocked(false); passage.update(2, occupants);
    assert.equal(passage.entryDoor.state, 'open');
    passage.reset();
    assert.equal(passage.entryDoor.locked, true); assert.equal(passage.entryDoor.openProgress, 0);
    art.dispose();
    for (const s of snapshots) assert.equal(s.mesh.material, s.material);
  } finally { world.clear(); art.dispose(); lab.dispose(); contamination.dispose(); duct.dispose(); passage.dispose(); }
});

test('filtration art has a bounded submission budget and one culled, resettable, collision-free fan', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets), art = scene.filtrationArt;
  const meshes: THREE.Mesh[] = [];
  for (const root of [art.root, art.ductRoot]) root.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
  const geometries = meshes.map(mesh => mesh.geometry);
  const borrowedMaps = new Set<THREE.Texture>([...scene.labArt.textures, ...scene.contaminationArt.textures]);
  const triangles = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
  try {
    assert.ok(art.root.children.length <= 8, 'seven static batches and one moving mesh');
    assert.ok(art.ductRoot.children.length <= 3, 'upper duct details stay in three static batches');
    assert.ok(triangles <= 8_000, `render geometry budget exceeded: ${triangles}`);
    for (const mesh of meshes) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      assert.ok(material instanceof THREE.MeshStandardMaterial);
      for (const map of [material.map, material.roughnessMap, material.normalMap, material.bumpMap, material.emissiveMap]) {
        if (map) assert.ok(borrowedMaps.has(map), 'detail maps must come from the existing material library');
      }
    }
    for (const mesh of meshes) if (mesh.castShadow) assert.equal(mesh.material, scene.contaminationArt.finishes.wall);
    assert.equal(art.fan.castShadow, false, 'fine moving blades add no shadow submissions');
    for (const angle of [0, .27, .83, 1.56, 2.49]) {
      art.fan.rotation.x = angle;
      assert.deepEqual(auditOpaqueSurfaces(scene.roomTwoToThreeGoopPassage.root).conflicts, [], `fan angle ${angle}`);
    }
    art.reset(); art.update(.1); assert.ok(art.fan.rotation.x > 0);
    const angle = art.fan.rotation.x;
    scene.roomTwoToThreeGoopPassage.root.visible = false;
    for (let i = 0; i < 60; i++) art.update(1 / 60);
    assert.equal(art.fan.rotation.x, angle, 'hidden passage does no animation work');
    scene.roomTwoToThreeGoopPassage.root.visible = true;
    for (let i = 0; i < 60; i++) art.update(1 / 60);
    assert.deepEqual(meshes.map(mesh => mesh.geometry), geometries, 'animation never rebuilds geometry');
    scene.reset(); scene.reset(); assert.equal(art.fan.rotation.x, 0);
  } finally { scene.dispose(); }
});

test('filtration lifecycle releases owned allocations once and retains borrowed maps and fixture materials', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets), art = scene.filtrationArt;
  // Undo cleanup before recording original allocations, matching runtime unload.
  scene.surfaceCleanup.dispose();
  const borrowed = new Set<THREE.Material>([...Object.values(scene.contaminationArt.finishes), scene.labArt.fixture]);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const root of [art.root, art.ductRoot]) root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (!borrowed.has(material)) resources.add(material);
  });
  const disposals = new Map<unknown, number>();
  for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  let sharedTextureDisposals = 0, fixtureDisposals = 0;
  scene.labArt.pole.map!.addEventListener('dispose', () => sharedTextureDisposals++);
  scene.labArt.fixture.addEventListener('dispose', () => fixtureDisposals++);
  try {
    art.dispose(); art.dispose();
    assert.equal(art.root.parent, null); assert.equal(art.ductRoot.parent, null);
    for (const resource of resources) assert.equal(disposals.get(resource), 1, resource.type);
    assert.equal(sharedTextureDisposals, 0); assert.equal(fixtureDisposals, 0);
    const light = scene.roomTwoToThreeGoopPassage.root.getObjectByName(`${scene.roomTwoToThreeGoopPassage.root.name}-light-1`) as THREE.PointLight;
    assert.equal(light.intensity, 8); assert.equal(light.color.getHex(), 0xdff7ff);
  } finally { scene.dispose(); }
  assert.equal(sharedTextureDisposals, 1); assert.equal(fixtureDisposals, 1);
  for (const resource of resources) assert.equal(disposals.get(resource), 1);
});
