import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoLabPassageGreybox } from '../src/levels/LevelTwoLabPassageGreybox.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CollisionHit, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import { CultivationContaminationArt } from '../src/render/environment/cultivation/CultivationContaminationArt.ts';
import { CultivationPassageArt } from '../src/render/environment/cultivation/CultivationPassageArt.ts';

test('observation recess preserves solid walls, floor, doors and collider authoring', () => {
  const passage = new LevelTwoLabPassageGreybox({
    id: 'cultivation-room-1-to-2-lab-passage', fromRoomId: 1, toRoomId: 2,
    widthMetres: 8, heightMetres: 6.5, lengthMetres: 28, doorwayWidthMetres: 4, doorwayHeightMetres: 4.6,
  });
  const lab = new CultivationLabMaterials(), contamination = new CultivationContaminationArt(lab);
  lab.dress(passage.builder, [], contamination.overrides(passage.builder));
  const snapshots = passage.collisionMeshes.map(mesh => ({ mesh, geometry: mesh.geometry,
    positions: Array.from(mesh.geometry.getAttribute('position').array), position: mesh.position.toArray(),
    quaternion: mesh.quaternion.toArray(), metadata: structuredClone(mesh.userData), visible: mesh.visible }));
  const art = new CultivationPassageArt(passage, lab, contamination);
  const world = new CollisionWorld(), hit = new CollisionHit();
  try {
    assert.deepEqual(passage.collisionMeshes, snapshots.map(s => s.mesh));
    for (const s of snapshots) {
      assert.equal(s.mesh.geometry, s.geometry);
      assert.deepEqual(Array.from(s.mesh.geometry.getAttribute('position').array), s.positions);
      assert.deepEqual(s.mesh.position.toArray(), s.position);
      assert.deepEqual(s.mesh.quaternion.toArray(), s.quaternion);
      assert.deepEqual(s.mesh.userData, s.metadata);
      assert.equal(s.mesh.visible, s.visible, 'material masking must not disable collision queries');
    }
    world.registerAll(passage.collisionMeshes);
    assert.ok(world.raycast(new THREE.Vector3(0, 3, 12), new THREE.Vector3(1, 0, 0), 8, hit));
    assert.equal(hit.object?.name, 'cultivation-room-1-to-2-lab-passage-east-wall');
    assert.ok(world.raycast(new THREE.Vector3(0, 1, 24.1), new THREE.Vector3(0, -1, 0), 2, hit));
    assert.equal(hit.object?.name, 'cultivation-room-1-to-2-lab-passage-floor');
    const occupants = [{ id: 'bob', position: new THREE.Vector3(0, .66, 26), radiusMetres: .45 }];
    passage.update(2, occupants);
    assert.equal(passage.exitDoor.state, 'open', 'existing proximity shutter still opens');
  } finally {
    world.clear(); art.dispose(); lab.dispose(); contamination.dispose(); passage.dispose();
  }
});

test('passage art survives retry, releases allocations once and leaves shared maps with their owners', () => {
  const scene = new LevelTwoPreviewScene(() => {}), art = scene.passageArt;
  const meshes: THREE.Mesh[] = [];
  art.root.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  const originalChildren = [...art.root.children];
  const otherPassageMaterials = scene.roomTwoToThreeGoopPassage.collisionMeshes.map(mesh => mesh.material);
  const borrowed = new Set<THREE.Material>([...Object.values(scene.contaminationArt.finishes), scene.contaminationArt.glass]);
  const materials = new Set(meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(m => !borrowed.has(m)));
  let sharedDisposals = 0;
  scene.labArt.pole.map!.addEventListener('dispose', () => sharedDisposals++);
  const disposals = new Map<THREE.Material | THREE.BufferGeometry, number>();
  for (const resource of materials) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  try {
    scene.reset(); scene.reset();
    assert.deepEqual(art.root.children, originalChildren);
    assert.deepEqual(scene.roomTwoToThreeGoopPassage.collisionMeshes.map(mesh => mesh.material), otherPassageMaterials);
    assert.equal(art.diagnostics.newTextures, 0);
    assert.equal(art.diagnostics.additionalLights, 0);
    assert.equal(disposals.size, 0);
    // Cleanup must restore geometry before the art owner is released.
    scene.surfaceCleanup.dispose();
    const geometries = new Set(meshes.map(mesh => mesh.geometry));
    for (const resource of geometries) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
    art.dispose(); art.dispose();
    assert.equal(art.root.parent, null);
    assert.equal(sharedDisposals, 0);
    for (const resource of [...materials, ...geometries]) assert.equal(disposals.get(resource), 1, resource.type);
    const light = scene.roomOneToTwoPassage.root.getObjectByName('cultivation-room-1-to-2-lab-passage-light-1') as THREE.PointLight;
    assert.equal(light.intensity, 8, 'borrowed light restored');
  } finally { scene.dispose(); }
  assert.equal(sharedDisposals, 1);
});
