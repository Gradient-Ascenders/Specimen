import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { WallButton, type WallButtonBody } from '../src/puzzle/WallButton.ts';

class TestBody implements WallButtonBody {
  readonly position = new THREE.Vector3();
  readonly radiusMetres = 0.45;
  attached = false;
  supportCollider: THREE.Mesh | null = null;
}

function createFixture() {
  const collisionWorld = new CollisionWorld();
  const surfaceRegistry = new SurfaceRegistry();
  const bob = new TestBody();
  const goop = new TestBody();
  const button = new WallButton({
    id: 'test-wall-button',
    collisionWorld,
    surfaceRegistry,
    position: new THREE.Vector3(),
    surfaceSize: new THREE.Vector3(0.2, 1.5, 1.8),
    contactCentre: new THREE.Vector3(0.55, 0, 0),
    contactSize: new THREE.Vector3(1.4, 2, 2.2),
    requiredOccupant: { id: 'bob', body: bob },
  });
  const occupants = [
    { id: 'bob', body: bob },
    { id: 'goop', body: goop },
  ] as const;
  return { collisionWorld, surfaceRegistry, bob, goop, button, occupants };
}

test('wall button requires the exact registered attached Bob on its support surface', () => {
  const fixture = createFixture();
  const events: string[] = [];
  fixture.button.events.on('pressed', ({ occupantId }) => events.push(`pressed:${occupantId}`));
  fixture.button.events.on('released', ({ occupantId }) => events.push(`released:${occupantId}`));
  fixture.button.setEnabled(true);

  fixture.bob.position.set(0.6, 0, 0);
  fixture.button.update(fixture.occupants);
  assert.equal(fixture.button.isPressed, false, 'nearby Bob must not press');

  fixture.bob.attached = true;
  fixture.bob.supportCollider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  fixture.button.update(fixture.occupants);
  assert.equal(fixture.button.isPressed, false, 'attachment to another surface must not press');
  fixture.bob.supportCollider.geometry.dispose();

  fixture.goop.position.copy(fixture.bob.position);
  fixture.goop.attached = true;
  fixture.goop.supportCollider = fixture.button.surfaceMesh;
  fixture.button.update([{ id: 'goop', body: fixture.goop }]);
  assert.equal(fixture.button.isPressed, false, 'Goop must not press');

  const impostor = new TestBody();
  impostor.position.copy(fixture.bob.position);
  impostor.attached = true;
  impostor.supportCollider = fixture.button.surfaceMesh;
  fixture.button.update([{ id: 'bob', body: impostor }]);
  assert.equal(fixture.button.isPressed, false, 'a duplicate Bob ID must not replace the registered body');

  fixture.bob.supportCollider = fixture.button.surfaceMesh;
  fixture.button.update(fixture.occupants);
  fixture.button.update(fixture.occupants);
  assert.equal(fixture.button.isPressed, true);
  assert.equal(fixture.button.occupantId, 'bob');
  assert.deepEqual(events, ['pressed:bob'], 'stable occupancy must not flicker or duplicate');

  fixture.bob.attached = false;
  fixture.button.update(fixture.occupants);
  assert.equal(fixture.button.isPressed, false);
  assert.deepEqual(events, ['pressed:bob', 'released:bob']);
  fixture.button.dispose();
});

test('wall button enable, reset, and dispose clear state and collision deterministically', () => {
  const fixture = createFixture();
  const initialColliders = fixture.collisionWorld.colliderCount;
  assert.equal(initialColliders, 1);
  assert.equal(fixture.surfaceRegistry.registeredCount, 1);

  fixture.bob.position.set(0.6, 0, 0);
  fixture.bob.attached = true;
  fixture.bob.supportCollider = fixture.button.surfaceMesh;
  fixture.button.setEnabled(true);
  fixture.button.update(fixture.occupants);
  assert.equal(fixture.button.isPressed, true);

  fixture.button.setEnabled(false);
  assert.equal(fixture.button.isPressed, false);
  fixture.button.setEnabled(true);
  fixture.button.update(fixture.occupants);
  assert.equal(fixture.button.isPressed, true, 'first valid post-enable step may reactivate');

  fixture.button.reset();
  assert.equal(fixture.button.enabled, false);
  assert.equal(fixture.button.isPressed, false);
  assert.equal(fixture.collisionWorld.colliderCount, initialColliders);

  fixture.button.dispose();
  fixture.button.dispose();
  assert.equal(fixture.collisionWorld.colliderCount, 0);
  assert.equal(fixture.surfaceRegistry.registeredCount, 0);
});
