import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { VerticalBlastDoor } from '../src/puzzle/VerticalBlastDoor.ts';
import { WallButton, type WallButtonBody } from '../src/puzzle/WallButton.ts';
import { WallButtonDoorCoordinator } from '../src/puzzle/WallButtonDoorCoordinator.ts';

class TestBody implements WallButtonBody {
  readonly position = new THREE.Vector3();
  readonly radiusMetres = 0.45;
  attached = false;
  supportCollider: THREE.Mesh | null = null;
}

test('coordinator preserves inactive Bob hold and disables the pair during recovery', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const bob = new TestBody();
  const goop = new TestBody();
  const button = new WallButton({
    id: 'coordinated-button',
    collisionWorld: world,
    surfaceRegistry: surfaces,
    position: new THREE.Vector3(),
    surfaceSize: new THREE.Vector3(0.2, 1.5, 1.8),
    contactCentre: new THREE.Vector3(0.55, 0, 0),
    contactSize: new THREE.Vector3(1.4, 2, 2.2),
    requiredOccupant: { id: 'bob', body: bob },
  });
  const door = new VerticalBlastDoor({
    id: 'coordinated-door',
    collisionWorld: world,
    surfaceRegistry: surfaces,
    closedPosition: new THREE.Vector3(0, 2, 5),
    panelSize: new THREE.Vector3(4, 4, 0.4),
    travelAxis: new THREE.Vector3(0, 1, 0),
    travelDistance: 4.5,
    openingDurationSeconds: 1,
    closingDurationSeconds: 1,
    obstructionCentre: new THREE.Vector3(),
    obstructionSize: new THREE.Vector3(4.8, 4.8, 2),
  });
  const occupants = [{ id: 'bob', body: bob }, { id: 'goop', body: goop }] as const;
  const coordinator = new WallButtonDoorCoordinator(button, door, occupants);
  let presses = 0;
  button.events.on('pressed', () => { presses += 1; });

  bob.position.set(0.6, 0, 0);
  bob.attached = true;
  bob.supportCollider = button.surfaceMesh;
  coordinator.setEnabled(true);
  coordinator.update(0.5);
  assert.equal(button.isPressed, true);
  assert.equal(door.progress, 0.5);

  // Active selection is not part of any coordinator input. Repeated updates
  // model switching away while the same persistent Bob remains attached.
  coordinator.update(0.5);
  coordinator.update(0);
  assert.equal(presses, 1);
  assert.equal(button.isPressed, true);
  assert.equal(door.state, 'open');

  coordinator.setEnabled(false);
  assert.equal(button.isPressed, false);
  assert.equal(door.desiredOpen, false);
  coordinator.reset();
  button.reset();
  door.reset();
  assert.equal(door.state, 'closed');
  assert.equal(door.progress, 0);

  coordinator.dispose();
  door.dispose();
  button.dispose();
  assert.equal(world.colliderCount, 0);
  assert.equal(surfaces.registeredCount, 0);
});
