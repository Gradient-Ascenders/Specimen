import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { captureContainmentCollisionFingerprint } from '../src/levels/ContainmentCollisionFingerprint.ts';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { ColliderTransformMode, CollisionHit, CollisionLayer, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { DEFAULT_KINEMATIC_BODY_CONFIG, KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { RoomOneArt } from '../src/render/environment/containment/RoomOneArt.ts';
import { SPECIMEN_POD_CROWN_SECTIONS, SPECIMEN_POD_GLASS, SPECIMEN_POD_LID_RAISE_METRES,
  SPECIMEN_POD_SOLID_SECTIONS } from '../src/render/environment/containment/ContainmentSpecimenPod.ts';

test('production and development have corrected collision-only supports and no duplicate specimen label', () => {
  for (const includeDevelopmentHelpers of [false, true]) {
    const scene = new ContainmentLevelScene(() => {}, { includeDevelopmentHelpers });
    try {
      const before = captureContainmentCollisionFingerprint(scene.collisionMeshes);
      const collider = scene.collisionMeshes.find(mesh => mesh.name === 'room-1-containment-pedestal')!;
      assert.deepEqual(collider.position.toArray(), [0, 1.61, -0.5]);
      assert.ok(Math.abs(new THREE.Box3().setFromObject(collider).max.y - 1.65) < 1e-6);
      assert.equal(collider.material.visible, false);
      assert.equal(scene.root.getObjectByName('room-1-specimen-identifier-assembly'), undefined);
      scene.root.traverse(object => {
        const names: string[] = object.userData.staticBatchSourceNames ?? [object.name];
        assert.ok(!names.some(name => name.startsWith('room-1-specimen-identifier')),
          'Neither the old SP-01 text nor its backing may survive static batching.');
      });
      scene.teaching.roomOneArt.setOpeningAftermath();
      for (let index = 0; index < 4; index++) {
        const support = scene.root.getObjectByName(`room-1-pod-stanchion-${index}`)!;
        assert.equal(support.visible, true);
        assert.equal(support.castShadow, false, 'The matching thin supports must not add the old egg-shadow stripe.');
      }
      assert.equal(scene.root.getObjectByName('room-1-pedestal-clean-shell')?.castShadow, true);
      assert.deepEqual(captureContainmentCollisionFingerprint(scene.collisionMeshes), before);
      scene.resetTeachingPresentation();
      scene.teaching.roomOneArt.setOpeningAftermath();
      assert.equal(scene.teaching.roomOneArt.eggRoot.visible, false);
      assert.equal(scene.teaching.roomOneArt.intactFrameAndPanes.position.y, 1.85);
      assert.equal(scene.teaching.roomOneArt.shatteredFrameAndDebris.visible, false);
    } finally { scene.dispose(); }
  }
});

test('Bob lands and walks on the visible pedestal top instead of sinking into its old collider', () => {
  const scene = new ContainmentLevelScene(() => {}), world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  const colliders = scene.collisionMeshes.filter(mesh => mesh.name.startsWith('room-1-containment-pedestal'));
  try {
    assert.equal(colliders.length, 32);
    assert.equal(new Set(colliders.map(mesh => mesh.geometry)).size, 4, 'The round compound uses four shared box geometries.');
    world.registerAll([...colliders, ...scene.collisionMeshes.filter(mesh => mesh.name.startsWith('room-1-containment-chamber-'))],
      undefined, ColliderTransformMode.Static);
    for (const mesh of colliders) surfaces.register(mesh);
    const top = new THREE.Box3().setFromObject(scene.root.getObjectByName('room-1-pod-lower-gasket')!).max.y;
    const noMovement = new THREE.Vector3();
    for (let direction = 0; direction < 16; direction++) {
      const angle = direction * Math.PI / 8;
      const initialPosition = new THREE.Vector3(Math.cos(angle) * 0.75, 3, -0.5 + Math.sin(angle) * 0.75);
      const body = new KinematicBody({ world, surfaces, initialPosition });
      for (let step = 0; step < 90; step++) body.update(1 / 60, noMovement);
      assert.equal(body.grounded, true, `No support gap at angle ${angle}.`);
      assert.ok(Math.abs(body.position.y - body.radiusMetres - top - DEFAULT_KINEMATIC_BODY_CONFIG.skinWidthMetres) < 0.003,
        'Bob’s sole must be on the visible top, not the former 1.1-metre support.');
      const settledY = body.position.y;
      const inward = new THREE.Vector3(-Math.cos(angle) * 0.5, 0, -Math.sin(angle) * 0.5);
      for (let step = 0; step < 12; step++) {
        body.update(1 / 60, inward);
        assert.equal(body.grounded, true, 'Walking across compound seams must stay grounded.');
        assert.ok(Math.abs(body.position.y - settledY) < 0.003);
      }
    }
    const vertex = new THREE.Vector3();
    for (const section of SPECIMEN_POD_SOLID_SECTIONS) {
      const pieces = colliders.filter(mesh => Math.abs(mesh.position.y - section.y) < 1e-8);
      assert.equal(pieces.length, 8);
      for (const piece of pieces) {
        piece.updateWorldMatrix(true, false);
        const positions = piece.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) {
          vertex.fromBufferAttribute(positions, index).applyMatrix4(piece.matrixWorld);
          assert.ok(Math.hypot(vertex.x, vertex.z + 0.5) <= section.radius + 1e-6,
            'No invisible square collision corners may extend beyond the round shell.');
        }
      }
    }
  } finally { world.clear(); scene.dispose(); }
});

test('the raised chamber has hidden static colliders aligned with the actual glass and crown in dev and production', () => {
  for (const includeDevelopmentHelpers of [false, true]) {
    const scene = new ContainmentLevelScene(() => {}, { includeDevelopmentHelpers });
    try {
      scene.teaching.roomOneArt.setOpeningAftermath();
      scene.root.updateMatrixWorld(true);
      const chamber = scene.collisionMeshes.filter(mesh => mesh.name.startsWith('room-1-containment-chamber-'));
      const glass = chamber.filter(mesh => mesh.name.includes('-glass-'));
      assert.equal(chamber.length, 32); assert.equal(glass.length, 16);
      assert.equal(new Set(chamber.map(mesh => mesh.geometry)).size, 3, 'One shared box geometry for the glass, one for each top section.');
      const visibleGlass = scene.root.getObjectByName('room-1-pod-curved-glass')!;
      const glassBounds = new THREE.Box3().setFromObject(visibleGlass, true), point = new THREE.Vector3();
      for (const mesh of chamber) {
        assert.equal(mesh.material.visible, false, 'No duplicate transparent material, draw or shadow.');
        assert.equal(mesh.castShadow, false);
        assert.equal(mesh.userData.surfaceTag, 'default', 'Glass must not become sticky.');
        assert.equal(mesh.userData.preciseMovementCorners, true, 'Avoid oversized conservative corners on the curved shell.');
        assert.ok(!scene.dynamicCollisionMeshes.includes(mesh), 'The final raised pose belongs in the static broadphase.');
      }
      for (const mesh of glass) {
        const bounds = new THREE.Box3().setFromObject(mesh, true);
        assert.ok(Math.abs(bounds.min.y - glassBounds.min.y) < 1e-6);
        assert.ok(Math.abs(bounds.max.y - glassBounds.max.y) < 1e-6);
        const positions = mesh.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) {
          point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
          assert.ok(Math.abs(Math.hypot(point.x, point.z + 0.5) - SPECIMEN_POD_GLASS.radius) < 0.03,
            'Thin walls follow the round pane instead of an enclosing invisible square.');
        }
      }
      const before = captureContainmentCollisionFingerprint(chamber);
      scene.resetTeachingPresentation(); scene.teaching.roomOneArt.setOpeningAftermath();
      assert.deepEqual(captureContainmentCollisionFingerprint(chamber), before, 'Restart retains the raised collision pose without rebuilding.');
    } finally { scene.dispose(); }
  }
});

test('glass blocks both directions around the full curved wall, including seams and fast sweeps', () => {
  const scene = new ContainmentLevelScene(() => {}), world = new CollisionWorld(), hit = new CollisionHit();
  const chamber = scene.collisionMeshes.filter(mesh => mesh.name.startsWith('room-1-containment-chamber-'));
  const centre = new THREE.Vector3(0, SPECIMEN_POD_GLASS.y + SPECIMEN_POD_LID_RAISE_METRES, -0.5);
  try {
    world.registerAll(chamber, undefined, ColliderTransformMode.Static);
    for (let sample = 0; sample < 128; sample++) {
      const angle = sample * Math.PI * 2 / 128, outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      for (const radius of [0.005, DEFAULT_KINEMATIC_BODY_CONFIG.radiusMetres]) {
        const start = centre.clone().addScaledVector(outward, 3), delta = outward.clone().multiplyScalar(-6);
        assert.equal(world.sweepSphere(start, delta, radius, hit), true, `No tunnelling at angle ${angle}, radius ${radius}.`);
        assert.ok(hit.object?.name.startsWith('room-1-containment-chamber-glass-'));
        const contact = start.addScaledVector(delta, hit.fraction).sub(centre);
        assert.ok(Math.abs(contact.length() - SPECIMEN_POD_GLASS.radius - radius) < 0.05);
        assert.ok(hit.normal.dot(outward) > 0.96);
        assert.equal(world.sweepSphere(centre, outward.clone().multiplyScalar(3), radius, hit), true, 'The inside face is solid too.');
        assert.ok(hit.normal.dot(outward) < -0.96);
      }
      assert.equal(world.sweepSphere(centre.clone().addScaledVector(outward, 3), outward.clone().multiplyScalar(-6), 0.22,
        hit, CollisionLayer.CameraObstruction), true, 'The camera also cannot clip through the physical pane.');
    }
    assert.equal(world.sweepSphere(centre, new THREE.Vector3(0.1, 0, 0), 0.45, hit), false,
      'The actual hollow interior must remain empty.');
  } finally { world.clear(); scene.dispose(); }
});

test('the raised glass stays open below while the crown blocks jumps through its top', () => {
  const scene = new ContainmentLevelScene(() => {}), world = new CollisionWorld(), surfaces = new SurfaceRegistry(), hit = new CollisionHit();
  try {
    const colliders = scene.collisionMeshes.filter(mesh => mesh.name.startsWith('room-1-containment-'));
    world.registerAll(colliders, undefined, ColliderTransformMode.Static); surfaces.registerAll(colliders);
    const radius = DEFAULT_KINEMATIC_BODY_CONFIG.radiusMetres;
    const start = new THREE.Vector3(0, 1.65 + radius + DEFAULT_KINEMATIC_BODY_CONFIG.skinWidthMetres, -0.5);
    assert.equal(world.sweepSphere(start, new THREE.Vector3(0, 2, 0), radius, hit), false,
      'The open bottom must allow Bob to enter the raised cylinder from the pedestal.');
    assert.equal(world.sweepSphere(start, new THREE.Vector3(0, 4, 0), radius, hit), true);
    assert.ok(hit.object?.name.startsWith('room-1-containment-chamber-upper-gasket-'));
    const underside = SPECIMEN_POD_CROWN_SECTIONS[0].y - SPECIMEN_POD_CROWN_SECTIONS[0].height / 2 + SPECIMEN_POD_LID_RAISE_METRES;
    assert.ok(Math.abs(start.y + 4 * hit.fraction + radius - underside) < 1e-6);
    assert.equal(world.sweepSphere(new THREE.Vector3(0, 6, -0.5), new THREE.Vector3(0, -4, 0), radius, hit), true);
    assert.ok(hit.object?.name.startsWith('room-1-containment-chamber-upper-crown-'));
    const crown = SPECIMEN_POD_CROWN_SECTIONS[1], top = crown.y + crown.height / 2 + SPECIMEN_POD_LID_RAISE_METRES;
    assert.ok(Math.abs(6 - 4 * hit.fraction - radius - top) < 1e-6, 'The top is solid when landing from above too.');
    const body = new KinematicBody({ world, surfaces, initialPosition: start });
    body.applyKnockback(new THREE.Vector3(0, 12, 0));
    let highest = start.y;
    for (let step = 0; step < 150; step++) {
      body.update(1 / 60, new THREE.Vector3()); highest = Math.max(highest, body.position.y);
      assert.ok(body.position.y + radius < underside + 1e-5, 'The real controller cannot jump through the crown.');
    }
    assert.ok(highest > 4, 'Bob should enter the hollow chamber before contacting its cap.');
    assert.equal(body.grounded, true);
    assert.ok(Math.abs(body.position.y - start.y) < 0.003, 'Bob returns to the usable pedestal top.');
  } finally { world.clear(); scene.dispose(); }
});

test('shared pod resources dispose once without disposing borrowed room resources', () => {
  const resources = new ContainmentArtResources(), art = new RoomOneArt(resources);
  const glass = art.root.getObjectByName('room-1-pod-curved-glass') as THREE.Mesh;
  const ring = art.root.getObjectByName('room-1-pod-lower-seal-light') as THREE.Mesh;
  const label = art.root.getObjectByName('room-1-pod-specimen-label') as THREE.Mesh;
  const frame = art.root.getObjectByName('room-1-pod-specimen-frame') as THREE.Mesh;
  const owned = new Set([glass.geometry, ring.geometry, label.geometry, frame.geometry, label.material, label.material.map]);
  const disposals = new Map([...owned].map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource)! + 1));
  let borrowedDisposals = 0;
  resources.materials.mainCeramic.addEventListener('dispose', () => { borrowedDisposals++; });
  resources.geometries.unitCylinder.addEventListener('dispose', () => { borrowedDisposals++; });
  art.setOpeningAftermath(); art.dispose(); art.dispose();
  for (const [resource, count] of disposals) assert.equal(count, 1, resource.name);
  assert.equal(borrowedDisposals, 0);
  resources.dispose();
  assert.equal(borrowedDisposals, 2);
  for (const count of disposals.values()) assert.equal(count, 1);
});
