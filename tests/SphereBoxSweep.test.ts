import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SphereBoxSweep } from '../src/physics/SphereBoxSweep.ts';
import { CollisionWorld, CollisionHit, CollisionLayer } from '../src/physics/CollisionWorld.ts';

test('sphere sweep resolves faces, rounded edges and corners at analytic contact times', () => {
  const sweep = new SphereBoxSweep(), normal = new THREE.Vector3();
  const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  for (const [start, delta, expected, expectedNormal] of [
    [[-3, 0, 0], [4, 0, 0], .375, [-1, 0, 0]],
    [[-3, 1.3, 0], [4, 0, 0], .4, [-.8, .6, 0]],
    [[-3, 1.3, 1.3], [4, 0, 0], (2 - Math.sqrt(.07)) / 4, [-Math.sqrt(.28), .6, .6]],
  ] as const) {
    const t = sweep.sweep(bounds, new THREE.Vector3(...start), new THREE.Vector3(...delta), .5, normal)!;
    assert.ok(Math.abs(t - expected) < 1e-8);
    assert.ok(normal.distanceTo(new THREE.Vector3(...expectedNormal)) < 1e-8);
  }
  assert.equal(sweep.sweep(bounds, new THREE.Vector3(-3, 1.4, 1.4), new THREE.Vector3(6, 0, 0), .5, normal), undefined,
    'the empty space in the expanded-box corner does not block a sphere');
});

test('contacts allow separation and tangential motion, and fast sweeps cannot cross a thin slab', () => {
  const sweep = new SphereBoxSweep(), normal = new THREE.Vector3();
  const bounds = new THREE.Box3(new THREE.Vector3(-2, -.02, -2), new THREE.Vector3(2, .02, 2));
  const start = new THREE.Vector3(0, .52, 0);
  assert.equal(sweep.sweep(bounds, start, new THREE.Vector3(1, 0, 0), .5, normal), undefined);
  assert.equal(sweep.sweep(bounds, start, new THREE.Vector3(0, 1, 0), .5, normal), undefined);
  assert.equal(sweep.sweep(bounds, start, new THREE.Vector3(0, -1, 0), .5, normal), 0);
  const t = sweep.sweep(bounds, new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -100, 0), .5, normal)!;
  assert.ok(Math.abs(t - .0948) < 1e-8);
  assert.ok(normal.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-8);
});

test('precise ramp corners honor world transforms and leave other query masks unchanged', () => {
  const world = new CollisionWorld(), hit = new CollisionHit();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  mesh.userData.preciseMovementCorners = true;
  mesh.position.set(64, -11, 366); mesh.rotation.z = .26; mesh.scale.setScalar(2);
  world.register(mesh); mesh.updateWorldMatrix(true, false);
  const start = new THREE.Vector3(-3, 1.4, 1.4).applyMatrix4(mesh.matrixWorld);
  const delta = new THREE.Vector3(12, 0, 0).applyQuaternion(mesh.quaternion);
  assert.equal(world.sweepSphere(start, delta, 1, hit, CollisionLayer.Movement), false);
  assert.equal(world.sweepSphere(start, delta, 1, hit, CollisionLayer.CameraObstruction), true);
  delete mesh.userData.preciseMovementCorners;
  assert.equal(world.sweepSphere(start, delta, 1, hit, CollisionLayer.Movement), true);
  world.clear(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
});

test('opt-in boss lift corners use the real rounded boundary for friendly and hostile sweeps', () => {
  for (const broadphaseEnabled of [true, false]) {
    const world = new CollisionWorld({ broadphaseEnabled }), hit = new CollisionHit();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9, .8, 9));
    deck.position.set(55, 23.6, 290); deck.userData.preciseSweepCorners = true; world.register(deck);
    try {
      // Each coordinate is inside the expanded bounding box, but the sphere
      // still misses the physical top/side corner by more than its radius.
      const origin = deck.position.clone().add(new THREE.Vector3(-7, 1, 5.1)), delta = new THREE.Vector3(14, 0, 0);
      for (const mask of [CollisionLayer.Projectile, CollisionLayer.Movement]) {
        assert.equal(world.sweepSphere(origin, delta, .7, hit, mask), false);
        assert.equal(world.sweepSphere(origin.clone().add(delta), delta.clone().negate(), .7, hit, mask), false);
        assert.equal(world.sweepSphere(deck.position.clone().add(new THREE.Vector3(0, 5, 0)), new THREE.Vector3(0, -10, 0), .7, hit, mask), true,
          'a real shot into the centre of the deck must still be blocked');
      }
      delete deck.userData.preciseSweepCorners;
      assert.equal(world.sweepSphere(origin, delta, .7, hit, CollisionLayer.Projectile), true, 'unrelated legacy boxes retain their existing conservative solver');
    } finally { world.clear(); deck.geometry.dispose(); (deck.material as THREE.Material).dispose(); }
  }
});
