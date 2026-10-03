import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BeamOcclusion } from '../src/render/hazards/BeamOcclusion.ts';
import { CollisionWorld, CollisionLayer } from '../src/physics/CollisionWorld.ts';

test('stable cone clipping matches every original edge and picks up moved or hidden blockers', () => {
  const world = new CollisionWorld(), parent = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 6, .3)); parent.add(wall);
  world.register(wall, CollisionLayer.LineOfSight);
  const ignored = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1));
  const beam = new BeamOcclusion(), origin = new THREE.Vector3();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1));
  const stable = world.withStableQueryTransforms.bind(world);
  const geometry = () => new THREE.ConeGeometry(4, 10, 24, 1, true).translate(0, -5, 0);
  try {
    for (const [x, z, yaw, visible] of [[0, 5, 0, true], [2, 7, .5, true], [0, 5, 0, false]] as const) {
      parent.position.set(x, 0, z); parent.rotation.y = yaw; wall.visible = visible;
      const reference = geometry(), optimized = geometry();
      world.withStableQueryTransforms = query => query();
      beam.clipGeometry(world, origin, rotation, reference, ignored);
      world.withStableQueryTransforms = stable;
      beam.clipGeometry(world, origin, rotation, optimized, ignored);
      assert.deepEqual(optimized.getAttribute('position').array, reference.getAttribute('position').array);
      if (!visible) {
        const unclipped = geometry();
        assert.deepEqual(optimized.getAttribute('position').array, unclipped.getAttribute('position').array);
        unclipped.dispose();
      }
      reference.dispose(); optimized.dispose();
    }
  } finally { world.clear(); wall.geometry.dispose(); ignored.geometry.dispose(); }
});
