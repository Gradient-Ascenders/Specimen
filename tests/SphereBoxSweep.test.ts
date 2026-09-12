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
