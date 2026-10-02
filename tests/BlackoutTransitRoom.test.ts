import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  BLACKOUT_TRANSIT_CHECKPOINTS,
  BLACKOUT_TRANSIT_EXIT_HALLWAY,
  BLACKOUT_TRANSIT_LAYOUT,
  BLACKOUT_TRANSIT_LIFT_SLOTS,
  BlackoutTransitRoom,
} from '../src/levels/BlackoutTransitRoom.ts';

test('transit chamber has the authored large sealed footprint and separate entry routes', () => {
  const room = new BlackoutTransitRoom();
  try {
    assert.equal(BLACKOUT_TRANSIT_LAYOUT.minX, -22);
    assert.equal(BLACKOUT_TRANSIT_LAYOUT.maxX, 22);
    assert.equal(BLACKOUT_TRANSIT_LAYOUT.entryZ, 80);
    assert.equal(BLACKOUT_TRANSIT_LAYOUT.exitZ, 156);
    assert.ok(room.collisionMeshes.some((mesh) => mesh.name === 'transit-entry-wall-between-routes'));
    assert.equal(room.root.getObjectByName('transit-entry-sealed-door'), undefined);
    room.root.updateMatrixWorld(true);
    for (const [x,y] of [[6,1.5],[-16,3.6]]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x,y,78),new THREE.Vector3(0,0,1),0,4);
      assert.equal(ray.intersectObject(room.root,true).length,0,
        'both openings must be visually open, not merely non-colliding invisible doorways');
    }
    assert.equal(room.root.getObjectByName('transit-exit-sealed-door'), undefined);
    assert.ok(room.collisionMeshes.some((mesh) => mesh.name === 'transit-exit-half-raised-door'));

    const entry = room.collisionMeshes.find((mesh) => mesh.name === 'transit-entry-platform')!;
    assert.equal(entry.position.x, 6);
    assert.equal(entry.position.z, 84);
    assert.equal(entry.geometry.parameters.width, 22,
      'the entry platform keeps Bob/Goop separated from Volt’s west catwalk');
    assert.equal(room.catwalk.position.x, -16);
    assert.equal(room.catwalk.position.z, 111);
    assert.ok(room.root.getObjectByName('transit-main-entry-lintel'));
    // Test the visible enclosure at the recessed floor height, not only at
    // deck height where the old wall meshes already happened to be solid.
    for (const y of [-0.8, -0.2, 0.1]) for (const z of [81, 100, 130, 155]) {
      for (const sign of [-1, 1]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(sign * 20, y, z), new THREE.Vector3(sign, 0, 0), 0, 3);
        assert.ok(ray.intersectObjects(room.collisionMeshes).length > 0, `side wall must seal below deck level at ${sign},${y},${z}`);
      }
    }
    for (const x of [-16, 6, 20]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, -0.7, 82), new THREE.Vector3(0,0,-1), 0, 3);
      assert.ok(ray.intersectObjects(room.collisionMeshes).length > 0, 'entrance wall must be sealed beneath the elevated openings');
    }
  } finally {
    room.dispose();
  }
});

test('exit shutter rests on its crate beside a clear, fully enclosed hallway', () => {
  const room = new BlackoutTransitRoom();
  try {
    room.root.updateMatrixWorld(true);
    const door = room.root.getObjectByName('transit-exit-half-raised-door')!;
    const crate = room.root.getObjectByName('transit-exit-door-prop-crate')!;
    const doorBounds = new THREE.Box3().setFromObject(door);
    const crateBounds = new THREE.Box3().setFromObject(crate);
    assert.ok(Math.abs(doorBounds.min.y - crateBounds.max.y) < 1e-6,
      'the crate must actually touch and prop up the door');
    assert.ok(Math.abs(crateBounds.min.y - BLACKOUT_TRANSIT_EXIT_HALLWAY.floorTopY) < 1e-6);
    assert.ok(doorBounds.min.y > 0.4 + 0.9, 'a full slime body fits below the shutter');
    assert.ok(crateBounds.min.x > 0.45, 'the crate leaves the centre of the doorway free');
    const throughDoor = new THREE.Raycaster(new THREE.Vector3(0, 1.5, 154), new THREE.Vector3(0, 0, 1), 0, 19);
    assert.equal(throughDoor.intersectObject(room.root, true).length, 0,
      'there is no visual or invisible wall through the shutter and corridor');
    for (const z of [158, 165, 172]) {
      for (const direction of [new THREE.Vector3(-1,0,0), new THREE.Vector3(1,0,0), new THREE.Vector3(0,-1,0), new THREE.Vector3(0,1,0)]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.5, z), direction, 0, 8);
        assert.ok(ray.intersectObjects(room.collisionMeshes).length > 0,
          `hallway must seal floor, roof and sides at z=${z}`);
      }
    }
  } finally { room.dispose(); }
});

test('hallway bulbs flicker independently and their emitted light follows the visible bulb', () => {
  const room = new BlackoutTransitRoom();
  try {
    const lights = [1,2,3].map(index => room.root.getObjectByName(`transit-exit-hallway-light-${index}`) as THREE.PointLight);
    const bulbs = [1,2,3].map(index => room.root.getObjectByName(`transit-exit-hallway-bulb-${index}`) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>);
    const lows = lights.map(() => Infinity);
    const highs = lights.map(() => -Infinity);
    let independentDropout = false;
    for (let step = 0; step < 360; step += 1) {
      room.update(1 / 60);
      for (const [index, light] of lights.entries()) {
        lows[index] = Math.min(lows[index]!, light.intensity);
        highs[index] = Math.max(highs[index]!, light.intensity);
        assert.equal(light.castShadow, false, 'small flickering fixtures must not allocate costly point-light shadow maps');
        if (light.intensity < 1) assert.ok(bulbs[index]!.material.emissiveIntensity < 0.1);
      }
      if (lights.some(light => light.intensity < 1) && lights.some(light => light.intensity > 8)) independentDropout = true;
    }
    assert.ok(lows.every(low => low < 1));
    assert.ok(highs.every(high => high > 14));
    assert.equal(independentDropout, true, 'the hallway must not blink as one synchronized bank');
  } finally { room.dispose(); }
});

test('Bob route offers broad platforms with consistent charged-jump gaps and two lift slots', () => {
  const room = new BlackoutTransitRoom();
  try {
    assert.equal(room.bobRoutePlatforms.length, 5);
    assert.ok(room.bobRoutePlatforms.every(mesh => mesh.position.x >= 9.5), 'Bob route belongs to the left when entering toward +Z');
    assert.ok(room.liftSlots.every(slot => slot.position.x === 10));
    const route = [
      room.collisionMeshes.find((mesh) => mesh.name === 'bob-route-approach')!,
      room.collisionMeshes.find((mesh) => mesh.name === 'bob-route-cover-a-landing')!,
      room.liftSlots[0]!,
      room.collisionMeshes.find((mesh) => mesh.name === 'bob-route-lift-a-landing')!,
      room.collisionMeshes.find((mesh) => mesh.name === 'bob-route-cover-b-landing')!,
      room.liftSlots[1]!,
      room.collisionMeshes.find((mesh) => mesh.name === 'bob-bridge-switch-approach')!,
    ];
    const extentZ = (surface: THREE.Mesh | (typeof room.liftSlots)[number]) => {
      const depth = surface instanceof THREE.Mesh ? surface.geometry.parameters.depth : surface.size.z;
      const z = surface.position.z;
      return [z - depth / 2, z + depth / 2] as const;
    };
    for (let i = 1; i < route.length; i += 1) {
      const prior = extentZ(route[i - 1]!);
      const next = extentZ(route[i]!);
      const gap = next[0] - prior[1];
      assert.ok(gap >= 4 && gap <= 5,
        `route gap ${i} should remain a deliberate 4–5m charged jump, got ${gap}`);
    }

    assert.deepEqual(room.stickyWalls.map((wall) => wall.name), [
      'bob-sticky-climb-a',
      'bob-sticky-climb-b',
      'bob-bridge-switch-sticky-wall',
    ]);
    assert.deepEqual(BLACKOUT_TRANSIT_LIFT_SLOTS.map((slot) => slot.id), [
      'transit-lift-a', 'transit-lift-b',
    ]);
    assert.ok(room.liftSlots[0]!.maxY > room.liftSlots[0]!.minY);
    assert.ok(room.liftSlots[1]!.maxY > room.liftSlots[1]!.minY);
  } finally {
    room.dispose();
  }
});

test('acid area, exit ramp, bridge anchors, and receivers support the shared three-slime route', () => {
  const room = new BlackoutTransitRoom();
  try {
    assert.equal(room.acidAt({ x: 18, y: -0.5, z: 100 }), true);
    for (const x of [-21.05, 21.05]) assert.equal(room.acidAt({x,y:-.545,z:100}), true,
      'there must not be a safe strip between the acid trigger and the side walls');
    assert.equal(room.acidAt({ x: 18, y: -0.5, z: 148 }), true);
    assert.equal(room.acidAt({ x: 18, y: -0.5, z: 157 }), false);
    assert.equal(room.acidAt({ x: 18, y: 0.1, z: 100 }), false);
    assert.equal(room.exitAt({ x: 0, y: 0.86, z: 151 }), true);
    assert.equal(room.exitAt({ x: 7, y: 0.86, z: 151 }), false);
    assert.equal(room.receiverPositions.length, 3);
    assert.deepEqual(room.receiverPositions.map(({ x, z }) => [x, z]), [
      [14, 96], [14, 120], [-4, 139],
    ]);
    assert.deepEqual(room.bridgeStart.toArray(), [-16, 2.9, 136]);
    assert.deepEqual(room.bridgeEnd.toArray(), [0, 0.55, 144]);
    assert.deepEqual(room.exitPosition.toArray(), [0, 0.86, 151]);
    assert.ok(room.collisionMeshes.some((mesh) => mesh.name === 'goop-acid-exit-ramp'));
    assert.equal(room.switchButton.name, 'bob-bridge-pressure-button');
    assert.equal(room.switchButton.visible, true);
    room.root.traverse(object => {
      assert.doesNotMatch(object.name, /transit-deployable-bridge-rail|transit-bridge-rail-seat/,
        'the bridge has neither railings nor their unused mounts');
    });
    assert.equal(room.bridgeLockContact, room.root.getObjectByName('transit-exit-door-bottom-rail'));
  } finally {
    room.dispose();
  }
});

test('transit checkpoints respawn on fixed room surfaces and advance objective stages', () => {
  const room = new BlackoutTransitRoom();
  try {
    assert.deepEqual(BLACKOUT_TRANSIT_CHECKPOINTS.map((checkpoint) => checkpoint.id), ['cp3', 'cp4', 'cp5']);
    const expectedStages = [undefined, 1, 2];
    for (const [index, checkpoint] of BLACKOUT_TRANSIT_CHECKPOINTS.entries()) {
      const { bob, goop, volt } = checkpoint.bodyPositions;
      assert.ok(!room.acidAt(bob), `Bob checkpoint ${checkpoint.id} is outside acid`);
      assert.ok(!room.acidAt(volt), `Volt checkpoint ${checkpoint.id} is outside acid`);
      if (index === 0) {
        assert.ok(bob.z >= 80 && bob.z <= 88);
        assert.ok(goop.z >= 80 && goop.z <= 88);
      } else {
        assert.ok(room.acidAt(goop), `Goop checkpoint ${checkpoint.id} is safely on acid`);
      }
      assert.equal(checkpoint.room.local.transitStage, expectedStages[index]);
    }
  } finally {
    room.dispose();
  }
});
