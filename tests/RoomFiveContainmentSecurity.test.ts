import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { captureContainmentCollisionFingerprint } from '../src/levels/ContainmentCollisionFingerprint.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { RoomFiveContainmentSecurity } from '../src/render/environment/containment/RoomFiveContainmentSecurity.ts';
import { CONTAINMENT_IDENTIFICATION_COLOURS, createContainmentSecurityAtlas,
  createContainmentSpecimenLabelTexture } from '../src/render/environment/containment/ContainmentProceduralTextures.ts';
import { OPENING_EXPERIMENTS } from '../src/cinematics/OpeningLaboratory.ts';
import {ROOM_FIVE_SOLID_PROPS} from '../src/levels/RoomFiveGreybox.ts';

test('Goop’s identification is critical red, with deterministic hazard pictograms and caution tape', () => {
  const first = createContainmentSecurityAtlas('Goop'), second = createContainmentSecurityAtlas('Goop');
  const plate = createContainmentSpecimenLabelTexture('Goop', 'Critical');
  try {
    assert.deepEqual(first.userData.labelLines, ['SPECIMEN: GOOP', 'DANGER THREAT: CRITICAL']);
    assert.deepEqual(first.userData.hazardLines, ['CORROSIVE', 'BIOLOGICAL HAZARD', 'DO NOT OPEN']);
    assert.equal(first.userData.statusColour, CONTAINMENT_IDENTIFICATION_COLOURS.critical);
    assert.equal(first.userData.statusColour, OPENING_EXPERIMENTS.find(entry => entry.specimen === 'VOLT')!.colour);
    assert.deepEqual(first.image.data, second.image.data);
    for (let y = 124; y < 192; y++) {
      const start = (y * 512 + 32) * 4, end = (y + 1) * 512 * 4;
      assert.deepEqual(first.image.data.subarray(start, end), plate.image.data.subarray(start, end),
        'The critical text remains red while the decorative marks are removed.');
    }
    const pixel = (x: number, y: number) => Array.from(first.image.data.slice((y * 512 + x) * 4, (y * 512 + x + 1) * 4));
    assert.deepEqual(pixel(478, 33), [12, 24, 29, 255]);
    assert.deepEqual(pixel(15, 50), [12, 24, 29, 255]);
    assert.deepEqual(pixel(20, 389), [14, 20, 23, 255], 'No red line runs across the bottom release label.');
    assert.deepEqual(pixel(64, 253), [235, 178, 68, 255], 'The warning triangle contains an exclamation mark.');
    assert.deepEqual(pixel(10, 448), [235, 178, 68, 255]);
    assert.deepEqual(pixel(46, 448), [14, 20, 23, 255]);
    assert.equal(first.image.data.byteLength, 1048576);
    assert.equal(first.generateMipmaps, false); assert.equal(first.minFilter, THREE.LinearFilter);
    assert.equal(first.colorSpace, THREE.SRGBColorSpace);
  } finally { first.dispose(); second.dispose(); plate.dispose(); }
});

test('the front-only security dressing is three static draws without red bars or extra casters', () => {
  const resources = new ContainmentArtResources();
  const materialColours = Object.values(resources.materials).map(material => material.color.getHex());
  const security = new RoomFiveContainmentSecurity(resources);
  try {
    assert.equal(security.root.children.length, 3);
    const triangles = security.root.children.reduce((total, child) => {
      const mesh = child as THREE.Mesh;
      return total + mesh.geometry.index!.count / 3 * (mesh instanceof THREE.InstancedMesh ? mesh.count : 1);
    }, 0);
    assert.ok(triangles <= 500, 'Keep the additional container dressing within its tiny static geometry budget.');
    security.root.traverse(object => {
      assert.equal(object.userData.visualOnly, true); assert.equal(object.matrixAutoUpdate, false);
      assert.ok(!(object instanceof THREE.Light));
      if (object instanceof THREE.Mesh) assert.equal(object.castShadow, false);
    });
    assert.deepEqual(Object.values(resources.materials).map(material => material.color.getHex()), materialColours);
    assert.equal(security.signs.material.map, security.texture);
    assert.equal(security.signs.material.transparent, false);
    const uv = security.signs.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      assert.ok(uv.getX(i) > 0 && uv.getX(i) < 1); assert.ok(uv.getY(i) > 0 && uv.getY(i) < 1);
    }
    // Caution tape may wrap around the frame, but every lettered/pictogram tile
    // must have the -Z normal of the entrance-facing side, never a duplicate.
    const normals = security.signs.geometry.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) {
      if (uv.getY(i) < 448 / 512) assert.ok(normals.getZ(i) < -.999);
    }
    assert.equal(security.root.getObjectByName('room-5-critical-red-lock-indicators'), undefined);
    security.root.updateMatrixWorld(true);
    assert.ok(new THREE.Box3().setFromObject(security.root).max.y < 78.675, 'The roof jump path stays clear.');
    const armour = security.root.children[0] as THREE.InstancedMesh;
    const boundsForInstance = (index: number) => {
      const matrix = new THREE.Matrix4(); armour.getMatrixAt(index, matrix);
      return new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5)).applyMatrix4(matrix);
    };
    assert.ok(Math.abs(boundsForInstance(0).max.y - 76.086) < 1e-5,
      'The raised isolation grate supports Goop’s sole at 76.096 instead of leaving a half-metre gap.');
    const frontHeader = boundsForInstance(1), leftHeader = boundsForInstance(3);
    assert.equal(frontHeader.intersectsBox(leftHeader), true, 'The top armour must join at the corners.');
    // The opening in the fascia looks straight at Goop rather than a solid central clamp.
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 76.95, 103), new THREE.Vector3(0, 0, 1), 0, 9);
    assert.equal(ray.intersectObject(security.root, true).length, 0);
  } finally { security.dispose(); resources.dispose(); }
});

for (const includeDevelopmentHelpers of [false, true]) {
  test(`Room 5 retains its collider contract, visible Goop and walkable roof (dev ${includeDevelopmentHelpers})`, () => {
    const scene = new ContainmentLevelScene(() => {}, { includeDevelopmentHelpers });
    const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
    try {
      const room = scene.roomFive, security = room.art.security;
      const before = captureContainmentCollisionFingerprint(scene.collisionMeshes);
      assert.equal(security.root.parent, room.art.containmentAssembly);
      assert.equal(scene.measuredFirstUseGeometryPrimeDiagnostics.resourceCount, 23);
      assert.equal(scene.collisionMeshes.filter(mesh => mesh.name.startsWith('room-5-')).length, 35+ROOM_FIVE_SOLID_PROPS.length);
      for (const removed of ['room-5-containment-front-status-array', 'room-5-containment-overpressure-status',
        'room-5-containment-pressure-warning-slot']) assert.equal(room.art.root.getObjectByName(removed), undefined);
      security.root.traverse(object => {
        assert.ok(!scene.collisionMeshes.includes(object as THREE.Mesh));
        if (object instanceof THREE.Mesh) assert.equal(object.castShadow, false, object.name);
      });
      const root = room.art.root; root.updateMatrixWorld(true);
      const clamp = root.getObjectByName('room-5-containment-front-restraint-clamp')!;
      assert.ok(new THREE.Box3().setFromObject(clamp).min.x > .9, 'The front clamp no longer hides Goop.');
      const sideClamp = root.getObjectByName('room-5-containment-right-restraint-clamp')!;
      for (const suffix of ['spine', 'load-jaws', 'pressure-actuator']) {
        assert.ok(new THREE.Box3().setFromObject(sideClamp.getObjectByName(`${sideClamp.name}-${suffix}`)!).max.x < 3.022,
          'The upper clamp must stay behind the side identification plate.');
      }
      world.registerAll(scene.collisionMeshes); surfaces.registerAll(scene.collisionMeshes);
      const body = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(0, 79.4, 110) });
      for (let i = 0; i < 120; i++) body.update(1 / 60, new THREE.Vector3());
      assert.equal(body.grounded, true); assert.equal(body.supportColliderName, 'room-5-containment-glass');
      assert.ok(Math.abs(body.position.y - body.radiusMetres - 78.675) < .02);
      const ownedGeometry = security.signs.geometry, ownedTexture = security.texture;
      room.reset(); scene.resetPresentation();
      assert.equal(security.signs.geometry, ownedGeometry); assert.equal(security.texture, ownedTexture);
      assert.deepEqual(captureContainmentCollisionFingerprint(scene.collisionMeshes), before);
    } finally { scene.dispose(); world.clear(); surfaces.clear(); }
  });
}

test('security disposal releases each owned resource and instance buffer once, but never borrowed resources', () => {
  const resources = new ContainmentArtResources(), security = new RoomFiveContainmentSecurity(resources);
  const owned = [security.texture, security.signs.geometry, security.signs.material,
    ...security.root.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)];
  const counts = owned.map(() => 0);
  owned.forEach((resource, i) => resource.addEventListener('dispose', () => { counts[i]++; }));
  let borrowedDisposals = 0;
  for (const borrowed of [resources.geometries.unitBox, ...Object.values(resources.materials)]) {
    borrowed.addEventListener('dispose', () => { borrowedDisposals++; });
  }
  security.dispose(); security.dispose();
  assert.deepEqual(counts, owned.map(() => 1)); assert.equal(borrowedDisposals, 0);
  assert.equal(security.root.children.length, 0);
  resources.dispose();
});
