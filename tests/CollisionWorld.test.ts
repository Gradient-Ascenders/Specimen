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

test('stable beam query batches reuse live transforms but never stale ordinary queries', () => {
  const world = new CollisionWorld();
  const parent = new THREE.Group();
  const collider = new THREE.Mesh(new THREE.BoxGeometry()); collider.position.z = 2;
  parent.add(collider); world.register(collider, CollisionLayer.LineOfSight);
  let refreshes = 0;
  const update = collider.updateWorldMatrix.bind(collider);
  collider.updateWorldMatrix = (...args) => { refreshes++; update(...args); };
  const hit = new CollisionHit(), origin = new THREE.Vector3(), displacement = new THREE.Vector3(0, 0, 8);
  try {
    let firstDistance = 0;
    world.withStableQueryTransforms(() => {
      for (let i = 0; i < 25; i++) {
        assert.equal(world.sweepSphere(origin, displacement, .01, hit, CollisionLayer.LineOfSight), true);
        if (i === 0) firstDistance = hit.distance;
        assert.equal(hit.distance, firstDistance);
      }
      world.withStableQueryTransforms(() => world.raycast(origin, displacement.clone().normalize(), 8, hit, CollisionLayer.LineOfSight));
    });
    assert.equal(refreshes, 1);
    parent.position.z = 2;
    assert.equal(world.sweepSphere(origin, displacement, .01, hit, CollisionLayer.LineOfSight), true);
    assert.ok(hit.distance > firstDistance);
    assert.equal(refreshes, 2);
    assert.throws(() => world.withStableQueryTransforms(() => { throw new Error('interrupted beam'); }), /interrupted beam/);
    parent.position.z = 3;
    const previousDistance = hit.distance;
    world.sweepSphere(origin, displacement, .01, hit, CollisionLayer.LineOfSight);
    assert.ok(hit.distance > previousDistance, 'throwing releases the snapshot');
  } finally { world.clear(); collider.geometry.dispose(); }
});

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

test('vertical-side panels reject caps while sticky panels expose wrap faces', () => {
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

  wall.userData.surfaceTag = 'sticky';
  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(0, 5, 0),
      new THREE.Vector3(0, -5, 0),
      0.45,
      hit,
      CollisionLayer.Movement,
    ),
    false,
    'sticky panels must still reject their horizontal caps',
  );
  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(3, 2, 0),
      new THREE.Vector3(-4, 0, 0),
      0.45,
      hit,
      CollisionLayer.Movement,
    ),
    true,
    'sticky panels must expose narrow vertical faces for edge wrapping',
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
    const rayResult = world.raycast(origin, displacement, displacement.length(), broadphaseHit, queryMask, ignoredCollider);
    const expectedRayResult = exhaustiveWorld.raycast(origin, displacement, displacement.length(), exhaustiveHit, queryMask, ignoredCollider);
    assert.equal(rayResult, expectedRayResult, `query ${queryIndex}`);
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

test('moving parents and reparenting invalidate cached dynamic query transforms', () => {
  const world = new CollisionWorld();
  const parent = new THREE.Group(), other = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)); parent.add(box);
  world.register(box);
  const hit = new CollisionHit(), origin = new THREE.Vector3(-5, 0, 0), delta = new THREE.Vector3(12, 0, 0);
  assert.ok(world.sweepSphere(origin, delta, .2, hit)); const first = hit.fraction;
  assert.ok(world.sweepSphere(origin, delta, .2, hit)); assert.equal(hit.fraction, first);
  parent.position.x = 3;
  assert.ok(world.sweepSphere(origin, delta, .2, hit)); assert.ok(hit.fraction > first);
  other.position.x = -2; other.add(box);
  assert.ok(world.sweepSphere(origin, delta, .2, hit)); assert.ok(hit.fraction < first);
  other.scale.set(2, 1, 1); other.rotation.z = .2;
  const reference = new CollisionWorld({ broadphaseEnabled: false }); reference.register(box);
  const expected = new CollisionHit(); reference.sweepSphere(origin, delta, .2, expected);
  world.sweepSphere(origin, delta, .2, hit); assert.equal(hit.fraction, expected.fraction);
  world.clear(); reference.clear(); box.geometry.dispose();
});


test('exact raycast respects query layers, closest hit, and dynamic transforms', () => {
  const world = new CollisionWorld();
  const worldBlocker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  worldBlocker.name = 'ray-world-blocker';
  worldBlocker.position.set(0, 0, 2);
  const electricalTarget = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  electricalTarget.name = 'ray-electrical-target';
  electricalTarget.position.set(0, 0, 5);

  world.register(
    worldBlocker,
    CollisionLayer.LineOfSight,
    ColliderTransformMode.Static,
  );
  world.register(
    electricalTarget,
    CollisionLayer.ElectricalTarget,
    ColliderTransformMode.Dynamic,
  );

  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3(0, 0, 1);
  const hit = new CollisionHit();

  assert.equal(
    world.raycast(
      origin,
      direction,
      10,
      hit,
      CollisionLayer.LineOfSight,
    ),
    true,
  );
  assert.equal(hit.object, worldBlocker);
  assert.ok(Math.abs(hit.distance - 1.5) < 1e-6);

  assert.equal(
    world.raycast(
      origin,
      direction,
      10,
      hit,
      CollisionLayer.ElectricalTarget,
    ),
    true,
  );
  assert.equal(hit.object, electricalTarget);
  assert.ok(Math.abs(hit.distance - 4.5) < 1e-6);

  electricalTarget.position.z = 7;
  assert.equal(
    world.raycast(
      origin,
      direction,
      10,
      hit,
      CollisionLayer.ElectricalTarget,
    ),
    true,
  );
  assert.ok(Math.abs(hit.distance - 6.5) < 1e-6);

  worldBlocker.geometry.dispose();
  electricalTarget.geometry.dispose();
});

test('raycast does not overwrite movement sweep diagnostics', () => {
  const world = new CollisionWorld();
  const movement = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  movement.position.z = 2;
  const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  target.position.z = 4;
  world.register(movement, CollisionLayer.Movement);
  world.register(target, CollisionLayer.ElectricalTarget);

  const hit = new CollisionHit();
  world.sweepSphere(
    new THREE.Vector3(),
    new THREE.Vector3(0, 0, 5),
    0.2,
    hit,
    CollisionLayer.Movement,
  );
  const before = world.getLastSweepDiagnostics();

  world.raycast(
    new THREE.Vector3(),
    new THREE.Vector3(0, 0, 1),
    10,
    hit,
    CollisionLayer.ElectricalTarget,
  );

  assert.deepEqual(world.getLastSweepDiagnostics(), before);
  movement.geometry.dispose();
  target.geometry.dispose();
});


test('raycast reports a zero-distance hit when the origin starts inside a collider', () => {
  const world = new CollisionWorld();
  const collider = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  collider.name = 'inside-ray-collider';
  world.register(
    collider,
    CollisionLayer.LineOfSight,
    ColliderTransformMode.Static,
  );
  const hit = new CollisionHit();

  assert.equal(
    world.raycast(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      5,
      hit,
      CollisionLayer.LineOfSight,
    ),
    true,
  );
  assert.equal(hit.object, collider);
  assert.equal(hit.distance, 0);
  assert.equal(hit.fraction, 0);

  collider.geometry.dispose();
});

test('local sweeps and rays visit the same candidates after adding distant static colliders', () => {
  const world = new CollisionWorld();
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const local = new THREE.Mesh(geometry);
  const moving = new THREE.Mesh(geometry);
  moving.position.x = 100;
  world.register(local, undefined, ColliderTransformMode.Static);
  world.register(moving);
  const hit = new CollisionHit();
  const origin = new THREE.Vector3(-4, 0, 0), delta = new THREE.Vector3(8, 0, 0);
  const query = (ray: boolean) => ray
    ? world.raycast(origin, delta, 8, hit)
    : world.sweepSphere(origin, delta, .45, hit);
  try {
    for (const ray of [false, true]) {
      assert.equal(query(ray), true);
      const before = world.getLastQueryDiagnostics();
      for (let i = 0; i < 2000; i++) {
        const mesh = new THREE.Mesh(geometry);
        mesh.position.set(1000 + i * 20, 0, 0);
        world.register(mesh, undefined, ColliderTransformMode.Static);
      }
      // First query rebuilds the dirty index; subsequent queries reuse storage.
      query(ray);
      assert.equal(query(ray), true);
      assert.equal(hit.object, local);
      const after = world.getLastQueryDiagnostics();
      assert.equal(after.staticEntriesVisited, before.staticEntriesVisited);
      assert.equal(after.dynamicCollidersVisited, 1);
      assert.equal(after.candidates, 1);
      assert.equal(after.narrowPhaseChecks, 1);
      assert.equal(after.candidateBufferGrowth, 0);
      // Reject any hidden registry traversal in the steady-state query path,
      // independently of the work counters above.
      const internals = world as unknown as { colliders: unknown[] };
      const registry = internals.colliders;
      internals.colliders = new Proxy(registry, {
        get(target, key, receiver) {
          if (key === Symbol.iterator || (typeof key === 'string' && /^\d+$/.test(key))) {
            assert.fail('local query traversed the full registry');
          }
          return Reflect.get(target, key, receiver);
        },
      });
      try { assert.equal(query(ray), true); }
      finally { internals.colliders = registry; }

    }
  } finally { world.clear(); geometry.dispose(); }
});

test('mixed candidate sources retain registry ties through mode changes, removal and clear', () => {
  const world = new CollisionWorld();
  const reference = new CollisionWorld({ broadphaseEnabled: false });
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const first = new THREE.Mesh(geometry), second = new THREE.Mesh(geometry);
  const wide = new THREE.Mesh(geometry);
  first.position.x = second.position.x = 4;
  wide.position.x = 4; wide.scale.set(1, 2000, 2000); // same front face, global static list
  const hit = new CollisionHit(), expected = new CollisionHit();
  const origin = new THREE.Vector3(), delta = new THREE.Vector3(8, 0, 0);
  const compare = (winner: THREE.Mesh) => {
    for (const ray of [false, true]) {
      for (const w of [world, reference]) {
        const result = w === world ? hit : expected;
        assert.equal(ray ? w.raycast(origin, delta, 8, result)
          : w.sweepSphere(origin, delta, .25, result), true);
      }
      assert.equal(hit.object, winner);
      assert.equal(hit.object, expected.object);
      assert.equal(hit.fraction, expected.fraction);
    }
  };
  try {
    for (const w of [world, reference]) {
      w.register(first); // collected after static candidates, wins equal hits
      w.register(second, undefined, ColliderTransformMode.Static);
      w.register(wide, undefined, ColliderTransformMode.Static);
    }
    compare(first);
    for (const w of [world, reference]) {
      w.setTransformMode(first, ColliderTransformMode.Static);
      w.setTransformMode(second, ColliderTransformMode.Dynamic);
      w.setTransformMode(second, ColliderTransformMode.Dynamic); // no duplicate
    }
    compare(first);
    for (const w of [world, reference]) {
      w.unregister(first);
      w.register(first);
    }
    compare(second);
    for (const w of [world, reference]) w.setLayerMask(second, CollisionLayer.ElectricalTarget);
    compare(wide);
    second.visible = false;
    for (const w of [world, reference]) w.setLayerMask(second, DEFAULT_SOLID_COLLISION_LAYERS);
    compare(wide);
    second.visible = true;
    compare(second);
    for (const w of [world, reference]) {
      w.clear(); w.register(first); w.register(first);
    }
    compare(first);
    assert.equal(world.colliderCount, 1);
    assert.equal(world.getLastQueryDiagnostics().dynamicCollidersVisited, 1);
  } finally { world.clear(); reference.clear(); geometry.dispose(); }
});

test('long queries, multi-cell boxes and global statics match exhaustive rays and sweeps', () => {
  const world = new CollisionWorld(), reference = new CollisionWorld({ broadphaseEnabled: false });
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const meshes = Array.from({ length: 35 }, (_, i) => {
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set((35 - i) * 20, 0, (35 - i) * 20);
    mesh.scale.set(i === 0 ? 300 : 2, i === 0 ? 300 : .5, i === 0 ? 300 : 2);
    for (const w of [world, reference]) w.register(mesh, undefined, ColliderTransformMode.Static);
    return mesh;
  });
  const hit = new CollisionHit(), expected = new CollisionHit();
  try {
    for (const delta of [new THREE.Vector3(1000, 1000, 1000), new THREE.Vector3(1000, 0, 1000)]) {
      for (const ray of [false, true]) {
        const origin = new THREE.Vector3(-10, 0, -10);
        for (const w of [world, reference]) {
          const result = w === world ? hit : expected;
          if (ray) w.raycast(origin, delta, delta.length(), result);
          else w.sweepSphere(origin, delta, .45, result);
        }
        assert.equal(hit.object, expected.object);
        assert.equal(hit.fraction, expected.fraction);
        assert.ok(hit.normal.distanceTo(expected.normal) < 1e-10);
        assert.ok(world.getLastQueryDiagnostics().candidates <= meshes.length);
      }
    }
  } finally { world.clear(); reference.clear(); geometry.dispose(); }
});

test('explicit invalidation refreshes transforms inside nested stable scopes', () => {
  const world = new CollisionWorld();
  const parent = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  parent.add(mesh);
  world.register(mesh, undefined, ColliderTransformMode.Static);
  const hit = new CollisionHit(), origin = new THREE.Vector3(-4, 0, 0), delta = new THREE.Vector3(8, 0, 0);
  try {
    world.withStableQueryTransforms(() => {
      assert.equal(world.sweepSphere(origin, delta, .45, hit), true);
      parent.position.x = 50;
      world.invalidateTransform(mesh);
      world.withStableQueryTransforms(() => {
        assert.equal(world.raycast(origin, delta, 8, hit), false);
      });
      parent.position.x = 0;
      world.setTransformMode(mesh, ColliderTransformMode.Dynamic);
      assert.equal(world.sweepSphere(origin, delta, .45, hit), true);
    });
  } finally { world.clear(); mesh.geometry.dispose(); }
});

test('static ray candidates preserve local-box contact tolerance at cell boundaries', () => {
  const world = new CollisionWorld(), reference = new CollisionWorld({ broadphaseEnabled: false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  mesh.position.set(1, 0, 2);
  mesh.scale.set(2, 1, .5);
  const origin = new THREE.Vector3(-1 - 1e-8, 0, 2), direction = new THREE.Vector3(-1, 0, 0);
  const hit = new CollisionHit(), expected = new CollisionHit();
  try {
    for (const w of [world, reference]) w.register(mesh, undefined, ColliderTransformMode.Static);
    assert.equal(world.raycast(origin, direction, 1, hit), reference.raycast(origin, direction, 1, expected));
    assert.equal(hit.object, mesh);
    assert.equal(hit.fraction, expected.fraction);
  } finally { world.clear(); reference.clear(); mesh.geometry.dispose(); }
});

test('dense multi-cell candidate sorting preserves ties and reuses scratch storage', () => {
  const world = new CollisionWorld(), reference = new CollisionWorld({ broadphaseEnabled: false });
  // Registration history may exceed 32 bits even with a modest live registry.
  for (const w of [world, reference]) {
    (w as unknown as { nextRegistryOrder: number }).nextRegistryOrder = 2 ** 32 - 100;
  }
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const meshes = Array.from({ length: 300 }, (_, i) => {
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set(4, 0, 0);
    for (const w of [world, reference]) w.register(mesh, undefined,
      i % 5 === 0 ? ColliderTransformMode.Dynamic : ColliderTransformMode.Static);
    return mesh;
  });
  const origin = new THREE.Vector3(), delta = new THREE.Vector3(8, 0, 0);
  const hit = new CollisionHit(), expected = new CollisionHit();
  try {
    for (const ray of [false, true]) {
      for (const ignored of [undefined, meshes[0]]) {
        for (let repeat = 0; repeat < 2; repeat++) {
          for (const w of [world, reference]) {
            const result = w === world ? hit : expected;
            if (ray) w.raycast(origin, delta, 8, result, CollisionLayer.Movement, ignored);
            else w.sweepSphere(origin, delta, .25, result, CollisionLayer.Movement, ignored);
          }
          assert.equal(hit.object, expected.object);
          assert.equal(hit.object, ignored ? meshes[1] : meshes[0]);
          assert.equal(hit.fraction, expected.fraction);
          if (repeat === 1) assert.equal(world.getLastQueryDiagnostics().candidateBufferGrowth, 0);
        }
      }
    }
  } finally { world.clear(); reference.clear(); geometry.dispose(); }
});
