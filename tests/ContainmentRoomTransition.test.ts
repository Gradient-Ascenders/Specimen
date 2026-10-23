import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ContainmentTeachingScene } from '../src/levels/ContainmentTeachingScene.ts';
import { RoomThreeGreybox, ROOM_3_CHECKPOINT_POSITION } from '../src/levels/RoomThreeGreybox.ts';
import { ColliderTransformMode, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';

test('Room 2 balcony and Room 3 entry share a level, gap-free walking seam and grounded checkpoint', () => {
  const resources = new ContainmentArtResources();
  const teaching = new ContainmentTeachingScene(resources);
  const roomThree = new RoomThreeGreybox(() => {}, resources);
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  const colliders = [...teaching.collisionMeshes, ...roomThree.collisionMeshes];
  try {
    teaching.root.updateMatrixWorld(true); roomThree.root.updateMatrixWorld(true);
    world.registerAll(colliders, undefined, ColliderTransformMode.Static);
    surfaces.registerAll(colliders);
    const balcony = colliders.find(mesh => mesh.name === 'room-2-exit-balcony')!;
    const entry = colliders.find(mesh => mesh.name === 'room-3-entry-platform')!;
    const balconyBounds = new THREE.Box3().setFromObject(balcony);
    const entryBounds = new THREE.Box3().setFromObject(entry);
    assert.ok(Math.abs(balconyBounds.max.y - entryBounds.max.y) < 1e-8);
    assert.ok(Math.abs(balconyBounds.max.z - entryBounds.min.z) < 1e-8, 'Edges must meet without a gap or overlap');
    assert.equal(balcony.position.x, entry.position.x);

    // Check the actual dressed tread before static batching consumes its mesh.
    const tread = roomThree.art.root.getObjectByName('room-3-entry-platform-durable-composite-tread')!;
    const treadBounds = new THREE.Box3().setFromObject(tread);
    assert.ok(Math.abs(treadBounds.max.y - entryBounds.max.y) < 1e-6, 'Art must match the collision top');
    assert.ok(Math.abs(tread.position.z - entry.position.z) < 1e-8);

    const recovered = new KinematicBody({ world, surfaces, initialPosition: ROOM_3_CHECKPOINT_POSITION });
    assert.equal(recovered.grounded, true);
    assert.equal(recovered.supportCollider, entry, 'Recovery must start on the raised entry deck');

    for (const hz of [60, 120]) for (const x of [-0.8, 0, 0.8]) for (const direction of [-1, 1]) {
      const startZ = direction === 1 ? 47.5 : 51.5;
      const body = new KinematicBody({ world, surfaces,
        initialPosition: new THREE.Vector3(x, ROOM_3_CHECKPOINT_POSITION.y, startZ) });
      const movement = new THREE.Vector3(0, 0, direction);
      for (let step = 0; step < hz; step++) {
        body.update(1 / hz, movement);
        assert.equal(body.grounded, true, `No fall or jump across seam: x=${x}, direction=${direction}, ${hz}Hz`);
        assert.ok(Math.abs(body.position.y - ROOM_3_CHECKPOINT_POSITION.y) < 1e-4, 'No step or collision push at the doorway');
      }
      assert.ok((body.position.z - startZ) * direction > 4, 'Bob must cross the doorway without snagging');
      assert.equal(body.supportCollider, direction === 1 ? entry : balcony);
    }
  } finally {
    world.clear(); surfaces.clear(); roomThree.dispose(); teaching.dispose(); resources.dispose();
  }
});
