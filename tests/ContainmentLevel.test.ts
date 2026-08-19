import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ContainmentLevelController } from '../src/levels/ContainmentLevelController.ts';
import {
  ContainmentLevelScene,
  type ContainmentHazardFailure,
} from '../src/levels/ContainmentLevelScene.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import type { KinematicBody } from '../src/physics/KinematicBody.ts';
import { DeathSequence } from '../src/systems/DeathSequence.ts';

interface MutableFakeBody {
  readonly position: THREE.Vector3;
  readonly radiusMetres: number;
  attached: boolean;
  attachmentSurfaceName: string;
  grounded: boolean;
  supportCollider: THREE.Mesh | null;
  isSupportedBy(collider: THREE.Mesh): boolean;
  applyCarrierDisplacement(
    displacement: { readonly x: number; readonly y: number; readonly z: number },
    collider: THREE.Mesh,
  ): void;
  recoverAt(position: THREE.Vector3): void;
}

const createFakeBody = (): MutableFakeBody => ({
  position: new THREE.Vector3(0, 0.46, -2.6),
  radiusMetres: 0.45,
  attached: false,
  attachmentSurfaceName: 'none',
  grounded: false,
  supportCollider: null,
  isSupportedBy(collider): boolean {
    return this.grounded && this.supportCollider === collider;
  },
  applyCarrierDisplacement(displacement): void {
    this.position.add(
      new THREE.Vector3(displacement.x, displacement.y, displacement.z),
    );
  },
  recoverAt(position): void {
    this.position.copy(position);
    this.attached = false;
    this.attachmentSurfaceName = 'none';
  },
});

test('complete Containment scene exposes unique, consistently tagged colliders', () => {
  const scene = new ContainmentLevelScene(() => {});
  const names = scene.collisionMeshes.map((mesh) => mesh.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('room-3-first-static-laser-beam-proxy') === false);
  assert.ok(names.includes('room-4-cargo-elevator-moving-platform-surface'));
  assert.ok(names.includes('room-5-observation-sticky-lever-handle'));

  const stickyMeshes = scene.collisionMeshes.filter(
    (mesh) => mesh.userData.surfaceTag === 'sticky',
  );
  assert.ok(stickyMeshes.length >= 9);
  for (const mesh of stickyMeshes) {
    assert.ok(
      mesh.userData.textureRole === 'sticky-wall-tile' ||
        mesh.userData.textureRole === 'sticky-vent-tile',
      `${mesh.name} is sticky without an art-facing texture role`,
    );
  }

  scene.dispose();
});

test('Containment completion is gated by observation lever adhesion and emits once', () => {
  let controller: ContainmentLevelController;
  const scene = new ContainmentLevelScene(
    (failure: ContainmentHazardFailure) => {
      controller.requestHazardFailure(failure);
    },
  );
  const collisionWorld = new CollisionWorld();
  collisionWorld.registerAll(scene.collisionMeshes);
  const fakeBody = createFakeBody();
  const death = new DeathSequence();
  controller = new ContainmentLevelController({
    scene,
    body: fakeBody as unknown as KinematicBody,
    collisionWorld,
    requestDeath: (recovery) => death.requestDeath(recovery),
  });

  let completions = 0;
  let payload: { levelId: string; nextLevelId: string } | undefined;
  controller.events.on('completed', (event) => {
    completions += 1;
    payload = event;
  });

  fakeBody.position.set(-10, 99.3, 128.8);
  fakeBody.attached = true;
  fakeBody.attachmentSurfaceName = scene.roomFive.leverHandleName;
  controller.update(0.2);
  assert.equal(controller.state, 'playing');
  controller.update(0.2);
  assert.equal(controller.state, 'completing');

  controller.update(1);
  assert.equal(controller.state, 'completing');
  controller.update(1.5);
  assert.equal(controller.state, 'complete');
  assert.equal(completions, 1);
  assert.deepEqual(payload, {
    levelId: 'containment',
    nextLevelId: 'level-2',
  });

  controller.update(20);
  assert.equal(completions, 1);

  controller.reset();
  assert.equal(controller.state, 'playing');
  assert.equal(controller.activeCheckpointId, 'containment-room-1-spawn');
  assert.equal(scene.roomFive.endingState, 'traversal');

  controller.dispose();
  collisionWorld.clear();
  scene.dispose();
});

test('active checkpoint resets its room state before recovering the player', () => {
  let controller: ContainmentLevelController;
  const scene = new ContainmentLevelScene(
    (failure: ContainmentHazardFailure) => {
      controller.requestHazardFailure(failure);
    },
  );
  const collisionWorld = new CollisionWorld();
  collisionWorld.registerAll(scene.collisionMeshes);
  const fakeBody = createFakeBody();
  const death = new DeathSequence({ burstDurationSeconds: 0.05 });
  controller = new ContainmentLevelController({
    scene,
    body: fakeBody as unknown as KinematicBody,
    collisionWorld,
    requestDeath: (recovery) => death.requestDeath(recovery),
  });

  fakeBody.position.set(9, 30.21, 85.5);
  fakeBody.grounded = true;
  fakeBody.supportCollider = scene.roomFour.elevatorPlatform.collisionMesh;
  controller.update(0.01);
  assert.equal(
    controller.activeCheckpointId,
    'containment-room-4-elevator-roof',
  );
  assert.equal(scene.roomFour.elevator.state, 'warning');

  controller.update(3.2);
  assert.equal(scene.roomFour.elevator.state, 'ascending');
  assert.ok(scene.roomFour.elevator.ascentProgress > 0);

  assert.equal(
    controller.requestHazardFailure({
      roomId: 'room-4',
      hazardId: 'test-hit',
    }),
    true,
  );
  assert.equal(death.update(0.05), true);
  assert.equal(death.completeRetry(), true);

  assert.equal(scene.roomFour.elevator.state, 'waitingForRider');
  assert.equal(scene.roomFour.elevator.ascentProgress, 0);
  assert.ok(fakeBody.position.equals(new THREE.Vector3(9, 30.21, 85.5)));

  controller.dispose();
  collisionWorld.clear();
  scene.dispose();
});
