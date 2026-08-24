import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CollisionHit, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import {
  VerticalBlastDoor,
  type BlastDoorObstacle,
} from '../src/puzzle/VerticalBlastDoor.ts';

function createDoor(id = 'test-blast-door') {
  const collisionWorld = new CollisionWorld();
  const surfaceRegistry = new SurfaceRegistry();
  const door = new VerticalBlastDoor({
    id,
    collisionWorld,
    surfaceRegistry,
    closedPosition: new THREE.Vector3(0, 2, 0),
    panelSize: new THREE.Vector3(4, 4, 0.4),
    travelAxis: new THREE.Vector3(0, 1, 0),
    travelDistance: 4.5,
    openingDurationSeconds: 1,
    closingDurationSeconds: 1,
    obstructionCentre: new THREE.Vector3(),
    obstructionSize: new THREE.Vector3(4.8, 4.8, 2),
  });
  return { collisionWorld, surfaceRegistry, door };
}

test('vertical blast door reaches exact endpoints and reverses at partial progress', () => {
  const fixture = createDoor();
  const states: string[] = [];
  fixture.door.events.on('stateChanged', ({ state }) => states.push(state));

  fixture.door.setOpen(true);
  fixture.door.setOpen(true);
  fixture.door.update(0.4, []);
  assert.equal(fixture.door.progress, 0.4);
  assert.ok(fixture.door.collisionMesh.position.equals(new THREE.Vector3(0, 1.8, 0)));

  fixture.door.setOpen(false);
  fixture.door.update(0.15, []);
  assert.ok(Math.abs(fixture.door.progress - 0.25) < 1e-12);
  fixture.door.setOpen(true);
  fixture.door.update(0.75, []);
  assert.equal(fixture.door.progress, 1);
  assert.equal(fixture.door.state, 'open');
  assert.ok(fixture.door.collisionMesh.position.equals(new THREE.Vector3(0, 4.5, 0)));

  fixture.door.setOpen(false);
  fixture.door.update(1, []);
  assert.equal(fixture.door.progress, 0);
  assert.equal(fixture.door.state, 'closed');
  assert.ok(fixture.door.collisionMesh.position.equals(new THREE.Vector3()));
  assert.deepEqual(states, ['opening', 'closing', 'opening', 'open', 'closing', 'closed']);
  fixture.door.dispose();
});

test('closing detects either slime, exposes blocked/reopening, and resumes only when clear', () => {
  const fixture = createDoor('safe-door');
  const detected: readonly string[][] = [];
  const mutableDetected = detected as string[][];
  let cleared = 0;
  fixture.door.events.on('obstructionDetected', ({ occupantIds }) => {
    mutableDetected.push([...occupantIds]);
  });
  fixture.door.events.on('obstructionCleared', () => { cleared += 1; });

  fixture.door.setOpen(true);
  fixture.door.update(1, []);
  const bob: BlastDoorObstacle = {
    id: 'bob',
    position: new THREE.Vector3(0, 2, 0),
    radiusMetres: 0.45,
  };
  const goop: BlastDoorObstacle = {
    id: 'goop',
    position: new THREE.Vector3(0.4, 2, 0),
    radiusMetres: 0.45,
  };

  fixture.door.setOpen(false);
  fixture.door.update(0.1, [bob, goop]);
  assert.equal(fixture.door.state, 'blocked');
  assert.equal(fixture.door.progress, 1);
  assert.deepEqual(mutableDetected, [['bob', 'goop']]);

  fixture.door.update(0.1, [bob, goop]);
  assert.equal(fixture.door.state, 'reopening');
  assert.equal(fixture.door.progress, 1);
  bob.position.set(10, 2, 0);
  goop.position.set(10, 2, 0);
  fixture.door.update(0.1, [bob, goop]);
  assert.equal(cleared, 1);
  assert.equal(fixture.door.state, 'closing');
  assert.ok(Math.abs(fixture.door.progress - 0.9) < 1e-12);

  fixture.door.reset();
  assert.equal(fixture.door.state, 'closed');
  assert.equal(fixture.door.progress, 0);
  assert.equal(fixture.door.obstructionIds.size, 0);
  fixture.door.dispose();
});

test('Bob, Goop, and both bodies independently prevent closing intersection', () => {
  const scenarios: ReadonlyArray<readonly string[]> = [
    ['bob'],
    ['goop'],
    ['bob', 'goop'],
  ];

  for (const occupantIds of scenarios) {
    const fixture = createDoor(`identity-obstruction-${occupantIds.join('-')}`);
    const obstacles = occupantIds.map((id, index): BlastDoorObstacle => ({
      id,
      position: new THREE.Vector3(index * 0.4, 2, 0),
      radiusMetres: 0.45,
    }));
    fixture.door.setOpen(true);
    fixture.door.update(1, []);
    fixture.door.setOpen(false);

    fixture.door.update(0.2, obstacles);

    assert.equal(fixture.door.state, 'blocked');
    assert.equal(fixture.door.progress, 1);
    assert.deepEqual([...fixture.door.obstructionIds], occupantIds);
    fixture.door.dispose();
  }
});

test('equivalent fixed-step subdivisions produce the same door state and transform', () => {
  const singleStep = createDoor('single-step-door');
  const subdivided = createDoor('subdivided-door');

  const advanceBoth = (durationSeconds: number, open: boolean): void => {
    singleStep.door.setOpen(open);
    subdivided.door.setOpen(open);
    singleStep.door.update(durationSeconds, []);
    const steps = 12;
    for (let step = 0; step < steps; step += 1) {
      subdivided.door.update(durationSeconds / steps, []);
    }
    assert.ok(Math.abs(singleStep.door.progress - subdivided.door.progress) < 1e-12);
    assert.ok(
      singleStep.door.collisionMesh.position.distanceTo(
        subdivided.door.collisionMesh.position,
      ) < 1e-12,
    );
    assert.equal(singleStep.door.state, subdivided.door.state);
  };

  advanceBoth(0.37, true);
  advanceBoth(0.19, false);
  advanceBoth(0.82, true);
  advanceBoth(1, false);
  assert.equal(singleStep.door.state, 'closed');
  assert.equal(singleStep.door.progress, 0);

  singleStep.door.dispose();
  subdivided.door.dispose();
});

test('closed collider blocks high-speed crossing and disposal unregisters it', () => {
  const fixture = createDoor('collision-door');
  assert.equal(fixture.collisionWorld.colliderCount, 1);
  assert.equal(fixture.surfaceRegistry.registeredCount, 1);

  const hit = new CollisionHit();
  assert.equal(
    fixture.collisionWorld.sweepSphere(
      new THREE.Vector3(0, 2, -10),
      new THREE.Vector3(0, 0, 20),
      0.45,
      hit,
    ),
    true,
  );
  assert.equal(hit.object, fixture.door.collisionMesh);
  assert.ok(hit.fraction < 0.5);

  fixture.door.dispose();
  fixture.door.dispose();
  assert.equal(fixture.collisionWorld.colliderCount, 0);
  assert.equal(fixture.surfaceRegistry.registeredCount, 0);
});

test('reset restores the exact closed collider from every transition state', () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly reach: (door: VerticalBlastDoor, obstacle: BlastDoorObstacle) => void;
  }> = [
    { name: 'closed', reach: () => {} },
    { name: 'opening', reach: (door) => { door.setOpen(true); door.update(0.25, []); } },
    { name: 'open', reach: (door) => { door.setOpen(true); door.update(1, []); } },
    {
      name: 'closing',
      reach: (door) => {
        door.setOpen(true);
        door.update(1, []);
        door.setOpen(false);
        door.update(0.25, []);
      },
    },
    {
      name: 'blocked',
      reach: (door, obstacle) => {
        door.setOpen(true);
        door.update(1, []);
        door.setOpen(false);
        door.update(0.1, [obstacle]);
      },
    },
    {
      name: 'reopening',
      reach: (door, obstacle) => {
        door.setOpen(true);
        door.update(1, []);
        door.setOpen(false);
        door.update(0.1, [obstacle]);
        door.update(0.1, [obstacle]);
      },
    },
  ];

  for (const scenario of cases) {
    const fixture = createDoor(`reset-${scenario.name}`);
    const obstacle = {
      id: 'bob',
      position: new THREE.Vector3(0, 2, 0),
      radiusMetres: 0.45,
    };
    scenario.reach(fixture.door, obstacle);
    assert.equal(fixture.door.state, scenario.name);

    fixture.door.reset();

    assert.equal(fixture.door.state, 'closed');
    assert.equal(fixture.door.progress, 0);
    assert.equal(fixture.door.desiredOpen, false);
    assert.equal(fixture.door.collisionEnabled, true);
    assert.ok(fixture.door.collisionMesh.position.equals(new THREE.Vector3()));
    assert.equal(fixture.door.obstructionIds.size, 0);
    fixture.door.dispose();
  }
});

test('repeated construction and disposal leave no registered blast-door resources', () => {
  const collisionWorld = new CollisionWorld();
  const surfaceRegistry = new SurfaceRegistry();

  for (let index = 0; index < 12; index += 1) {
    const door = new VerticalBlastDoor({
      id: `lifecycle-door-${index}`,
      collisionWorld,
      surfaceRegistry,
      closedPosition: new THREE.Vector3(0, 2, 0),
      panelSize: new THREE.Vector3(4, 4, 0.4),
      travelAxis: new THREE.Vector3(0, 1, 0),
      travelDistance: 4.5,
      openingDurationSeconds: 1,
      closingDurationSeconds: 0.8,
      obstructionCentre: new THREE.Vector3(),
      obstructionSize: new THREE.Vector3(4.8, 4.8, 2),
    });
    assert.equal(collisionWorld.colliderCount, 1);
    assert.equal(surfaceRegistry.registeredCount, 1);
    door.dispose();
    assert.equal(collisionWorld.colliderCount, 0);
    assert.equal(surfaceRegistry.registeredCount, 0);
  }
});
