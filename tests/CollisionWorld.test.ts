import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  ColliderTransformMode,
  CollisionHit,
  CollisionLayer,
  CollisionWorld,
  DEFAULT_SOLID_COLLISION_LAYERS,
} from '../src/physics/CollisionWorld.ts';

test('static colliders reuse transform data until explicitly invalidated', () => {
  const world = new CollisionWorld();
  const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  collider.name = 'cached-static-collider';
  collider.position.set(0, 0, 2);

  let transformRefreshes = 0;
  const updateWorldMatrix = collider.updateWorldMatrix.bind(collider);
  collider.updateWorldMatrix = (...parameters): void => {
    transformRefreshes += 1;
    updateWorldMatrix(...parameters);
  };

  world.register(
    collider,
    CollisionLayer.Movement,
    ColliderTransformMode.Static,
  );
  const hit = new CollisionHit();
  const origin = new THREE.Vector3();
  const displacement = new THREE.Vector3(0, 0, 8);

  assert.equal(world.sweepSphere(origin, displacement, 0.2, hit), true);
  const initialDistance = hit.distance;
  assert.equal(world.sweepSphere(origin, displacement, 0.2, hit), true);
  assert.equal(transformRefreshes, 1);
  assert.equal(hit.distance, initialDistance);

  collider.position.z = 5;
  collider.scale.set(2, 1, 0.5);
  world.invalidateTransform(collider);

  assert.equal(world.sweepSphere(origin, displacement, 0.2, hit), true);
  assert.equal(transformRefreshes, 2);
  assert.ok(hit.distance > initialDistance);

  collider.geometry.dispose();
});

test('dynamic colliders refresh parent transforms for every sweep', () => {
  const world = new CollisionWorld();
  const parent = new THREE.Group();
  const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  collider.name = 'moving-child-collider';
  collider.position.z = 2;
  parent.add(collider);

  let transformRefreshes = 0;
  const updateWorldMatrix = collider.updateWorldMatrix.bind(collider);
  collider.updateWorldMatrix = (...parameters): void => {
    transformRefreshes += 1;
    updateWorldMatrix(...parameters);
  };

  world.register(
    collider,
    CollisionLayer.Movement,
    ColliderTransformMode.Static,
  );
  world.setTransformMode(collider, ColliderTransformMode.Dynamic);
  const hit = new CollisionHit();
  const origin = new THREE.Vector3();
  const displacement = new THREE.Vector3(0, 0, 8);

  assert.equal(world.sweepSphere(origin, displacement, 0.2, hit), true);
  const initialDistance = hit.distance;

  parent.position.z = 3;
  parent.scale.set(2, 1, 0.5);
  assert.equal(world.sweepSphere(origin, displacement, 0.2, hit), true);
  assert.equal(transformRefreshes, 2);
  assert.ok(hit.distance > initialDistance);

  collider.geometry.dispose();
});

test('camera obstruction queries ignore movement-only colliders', () => {
  const world = new CollisionWorld();
  const movementOnly = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  movementOnly.position.set(0, 0, 2);
  world.register(movementOnly, CollisionLayer.Movement);

  const origin = new THREE.Vector3(0, 0, 0);
  const displacement = new THREE.Vector3(0, 0, 4);
  const hit = new CollisionHit();

  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.2,
      hit,
      CollisionLayer.CameraObstruction,
    ),
    false,
  );
  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.2,
      hit,
      CollisionLayer.Movement,
    ),
    true,
  );

  movementOnly.geometry.dispose();
});

test('camera-only blockers obstruct camera sweeps but remain absent from movement', () => {
  const world = new CollisionWorld();
  const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const cameraOnly = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.4, 4),
    hiddenMaterial,
  );
  cameraOnly.name = 'test-camera-only-cap';
  cameraOnly.position.set(0, 3, 0);
  world.register(cameraOnly, CollisionLayer.CameraObstruction);

  const origin = new THREE.Vector3(0, 0, 0);
  const displacement = new THREE.Vector3(0, 5, 0);
  const hit = new CollisionHit();

  assert.equal(cameraOnly.visible, true);
  assert.equal(hiddenMaterial.visible, false);
  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.22,
      hit,
      CollisionLayer.CameraObstruction,
    ),
    true,
  );
  assert.equal(hit.object?.name, 'test-camera-only-cap');
  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.45,
      hit,
      CollisionLayer.Movement,
    ),
    false,
  );

  cameraOnly.geometry.dispose();
  hiddenMaterial.dispose();
});

test('default authored solids block both movement and camera queries', () => {
  const world = new CollisionWorld();
  const solid = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  solid.name = 'test-authored-solid';
  solid.position.set(0, 0, 2);
  world.register(solid);

  const origin = new THREE.Vector3(0, 0, 0);
  const displacement = new THREE.Vector3(0, 0, 4);
  const hit = new CollisionHit();

  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.2,
      hit,
      CollisionLayer.CameraObstruction,
    ),
    true,
  );
  assert.equal(hit.object?.name, 'test-authored-solid');
  assert.ok(hit.distance > 1 && hit.distance < 2);

  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.2,
      hit,
      CollisionLayer.Projectile,
    ),
    true,
  );
  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.001,
      hit,
      CollisionLayer.LineOfSight,
    ),
    true,
  );

  world.setLayerMask(solid, CollisionLayer.Movement);
  assert.equal(
    world.sweepSphere(origin, displacement, 0.2, hit, CollisionLayer.Projectile),
    false,
  );

  solid.geometry.dispose();
});

test('vertical-side panels block only broad faces without creating movement caps or thin edges', () => {
  const world = new CollisionWorld();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.022));
  wall.name = 'thin-sticky-wall';
  wall.position.set(0, 2, 0);
  wall.userData.movementFaceMode = 'vertical-sides';
  world.register(wall);
  const hit = new CollisionHit();

  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(0, 5, 0),
      new THREE.Vector3(0, -5, 0),
      0.45,
      hit,
      CollisionLayer.Movement,
    ),
    false,
  );
  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(0, 2, 2),
      new THREE.Vector3(0, 0, -4),
      0.45,
      hit,
      CollisionLayer.Movement,
    ),
    true,
  );
  assert.equal(hit.object?.name, 'thin-sticky-wall');
  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(3, 2, 0),
      new THREE.Vector3(-4, 0, 0),
      0.45,
      hit,
      CollisionLayer.Movement,
    ),
    false,
  );

  // Rendering still treats the complete visible panel as an obstruction.
  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(0, 5, 0),
      new THREE.Vector3(0, -5, 0),
      0.22,
      hit,
      CollisionLayer.CameraObstruction,
    ),
    true,
  );

  wall.geometry.dispose();
});

test('broadphase filters distant static colliders before narrow phase', () => {
  const world = new CollisionWorld();
  const exhaustiveWorld = new CollisionWorld({ broadphaseEnabled: false });
  const colliders = Array.from({ length: 50 }, (_, index) => {
    const collider = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    collider.name = `partitioned-static-${index}`;
    collider.position.set(index * 20, 0, 0);
    world.register(
      collider,
      CollisionLayer.Movement,
      ColliderTransformMode.Static,
    );
    exhaustiveWorld.register(
      collider,
      CollisionLayer.Movement,
      ColliderTransformMode.Static,
    );
    return collider;
  });
  const broadphaseHit = new CollisionHit();
  const exhaustiveHit = new CollisionHit();
  const origin = new THREE.Vector3(-4, 0, 0);
  const displacement = new THREE.Vector3(8, 0, 0);

  assert.equal(
    world.sweepSphere(origin, displacement, 0.45, broadphaseHit),
    true,
  );
  assert.equal(
    exhaustiveWorld.sweepSphere(origin, displacement, 0.45, exhaustiveHit),
    true,
  );
  assert.equal(broadphaseHit.object, exhaustiveHit.object);
  assert.equal(broadphaseHit.fraction, exhaustiveHit.fraction);
  assert.deepEqual(world.getLastSweepDiagnostics(), {
    registeredColliders: 50,
    eligibleColliders: 50,
    broadphaseCandidates: 1,
    narrowPhaseChecks: 1,
  });
  assert.deepEqual(exhaustiveWorld.getLastSweepDiagnostics(), {
    registeredColliders: 50,
    eligibleColliders: 50,
    broadphaseCandidates: 50,
    narrowPhaseChecks: 50,
  });

  for (const collider of colliders) collider.geometry.dispose();
});

test('broadphase keeps registry-order ties and ignored-collider behaviour deterministic', () => {
  const world = new CollisionWorld();
  const first = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  const second = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  first.name = 'first-equal-hit';
  second.name = 'second-equal-hit';
  first.position.x = 4;
  second.position.x = 4;
  world.register(first, undefined, ColliderTransformMode.Static);
  world.register(second, undefined, ColliderTransformMode.Static);
  const hit = new CollisionHit();
  const origin = new THREE.Vector3();
  const displacement = new THREE.Vector3(8, 0, 0);

  assert.equal(world.sweepSphere(origin, displacement, 0.45, hit), true);
  assert.equal(hit.object, first);
  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.45,
      hit,
      CollisionLayer.Movement,
      first,
    ),
    true,
  );
  assert.equal(hit.object, second);

  first.geometry.dispose();
  second.geometry.dispose();
});

test('dynamic colliders follow parent motion across broadphase cells', () => {
  const world = new CollisionWorld();
  const parent = new THREE.Group();
  const movingCollider = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  movingCollider.name = 'cell-crossing-dynamic';
  movingCollider.position.x = 40;
  parent.add(movingCollider);
  world.register(
    movingCollider,
    CollisionLayer.Movement,
    ColliderTransformMode.Dynamic,
  );
  const hit = new CollisionHit();
  const origin = new THREE.Vector3(-4, 0, 0);
  const displacement = new THREE.Vector3(8, 0, 0);

  assert.equal(world.sweepSphere(origin, displacement, 0.45, hit), false);
  assert.equal(world.getLastSweepDiagnostics().broadphaseCandidates, 0);

  parent.position.x = -40;
  assert.equal(world.sweepSphere(origin, displacement, 0.45, hit), true);
  assert.equal(hit.object, movingCollider);
  assert.equal(world.getLastSweepDiagnostics().broadphaseCandidates, 1);

  parent.position.x = 40;
  assert.equal(world.sweepSphere(origin, displacement, 0.45, hit), false);
  assert.equal(world.getLastSweepDiagnostics().broadphaseCandidates, 0);

  movingCollider.geometry.dispose();
});

test('static invalidation, unregistration, and re-registration update the grid', () => {
  const world = new CollisionWorld();
  const collider = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  collider.position.x = 40;
  world.register(
    collider,
    CollisionLayer.Movement,
    ColliderTransformMode.Static,
  );
  const hit = new CollisionHit();
  const origin = new THREE.Vector3(-4, 0, 0);
  const displacement = new THREE.Vector3(8, 0, 0);

  assert.equal(world.sweepSphere(origin, displacement, 0.45, hit), false);
  collider.position.x = 0;
  world.invalidateTransform(collider);
  assert.equal(world.sweepSphere(origin, displacement, 0.45, hit), true);

  world.unregister(collider);
  assert.equal(world.sweepSphere(origin, displacement, 0.45, hit), false);
  world.register(
    collider,
    CollisionLayer.Movement,
    ColliderTransformMode.Static,
  );
  assert.equal(world.sweepSphere(origin, displacement, 0.45, hit), true);

  collider.geometry.dispose();
});

test('broadphase matches exhaustive sweeps across transformed static and dynamic colliders', () => {
  let randomState = 0x51ec7;
  const random = (): number => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x1_0000_0000;
  };
  const between = (minimum: number, maximum: number): number =>
    THREE.MathUtils.lerp(minimum, maximum, random());

  const world = new CollisionWorld();
  const exhaustiveWorld = new CollisionWorld({ broadphaseEnabled: false });
  const colliders = Array.from({ length: 48 }, (_, index) => {
    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(
        between(0.2, 8),
        between(0.2, 8),
        between(0.2, 8),
      ),
    );
    collider.name = `comparison-collider-${index}`;
    collider.position.set(
      between(-80, 80),
      between(-15, 25),
      between(-100, 100),
    );
    collider.rotation.set(
      between(-0.7, 0.7),
      between(-Math.PI, Math.PI),
      between(-0.7, 0.7),
    );
    collider.scale.set(
      between(0.35, 2.5),
      between(0.35, 2.5),
      between(0.35, 2.5),
    );
    collider.visible = index % 13 !== 0;
    const layerMask =
      index % 5 === 0
        ? CollisionLayer.CameraObstruction
        : index % 7 === 0
          ? CollisionLayer.Projectile
          : DEFAULT_SOLID_COLLISION_LAYERS;
    const transformMode =
      index < 8
        ? ColliderTransformMode.Dynamic
        : ColliderTransformMode.Static;
    world.register(collider, layerMask, transformMode);
    exhaustiveWorld.register(collider, layerMask, transformMode);
    return collider;
  });
  const broadphaseHit = new CollisionHit();
  const exhaustiveHit = new CollisionHit();

  for (let queryIndex = 0; queryIndex < 300; queryIndex += 1) {
    for (let dynamicIndex = 0; dynamicIndex < 8; dynamicIndex += 1) {
      const collider = colliders[dynamicIndex];
      assert.ok(collider);
      collider.position.x += Math.sin(queryIndex + dynamicIndex) * 0.08;
      collider.position.z += Math.cos(queryIndex * 0.7 + dynamicIndex) * 0.08;
    }

    const origin = new THREE.Vector3(
      between(-90, 90),
      between(-20, 30),
      between(-110, 110),
    );
    const displacement = new THREE.Vector3(
      between(-45, 45),
      between(-20, 20),
      between(-45, 45),
    );
    const radius = between(0.05, 1.2);
    const queryMask =
      queryIndex % 4 === 0
        ? CollisionLayer.CameraObstruction
        : queryIndex % 6 === 0
          ? CollisionLayer.Projectile
          : CollisionLayer.Movement;
    const ignoredCollider =
      queryIndex % 17 === 0
        ? colliders[queryIndex % colliders.length]
        : undefined;

    const broadphaseResult = world.sweepSphere(
      origin,
      displacement,
      radius,
      broadphaseHit,
      queryMask,
      ignoredCollider,
    );
    const exhaustiveResult = exhaustiveWorld.sweepSphere(
      origin,
      displacement,
      radius,
      exhaustiveHit,
      queryMask,
      ignoredCollider,
    );

    assert.equal(broadphaseResult, exhaustiveResult, `query ${queryIndex}`);
    assert.equal(broadphaseHit.object, exhaustiveHit.object, `query ${queryIndex}`);
    assert.ok(
      Math.abs(broadphaseHit.fraction - exhaustiveHit.fraction) <= 1e-12,
      `fraction differs for query ${queryIndex}`,
    );
    assert.ok(
      broadphaseHit.point.distanceTo(exhaustiveHit.point) <= 1e-10,
      `point differs for query ${queryIndex}`,
    );
    assert.ok(
      broadphaseHit.normal.distanceTo(exhaustiveHit.normal) <= 1e-10,
      `normal differs for query ${queryIndex}`,
    );
  }

  for (const collider of colliders) collider.geometry.dispose();
});
