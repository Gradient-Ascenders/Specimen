import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { ColliderTransformMode, CollisionHit, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { CameraRig } from '../src/render/CameraRig.ts';

const dt = 1 / 60;
const noMovement = new THREE.Vector3();
const idle = { position: new THREE.Vector3(-18, 76, 95), radiusMetres: .45 } as KinematicBody;
const platforms = (scene: ContainmentLevelScene) => [scene.roomFive.movingPlatformOne, scene.roomFive.movingPlatformTwo];
const dressing = (scene: ContainmentLevelScene, index: number) => platforms(scene)[index].root
  .getObjectByName(`room-5-moving-platform-${index + 1}-production-dressing`)!;
const close = (a: THREE.Vector3, b: THREE.Vector3, message = '') =>
  assert.ok(a.distanceTo(b) < 1e-8, `${message}: ${a.toArray()} != ${b.toArray()}`);

test('Room 5 interpolates only its complete dressing, preserving authoritative collision through queries/reset/restore', () => {
  const scene = new ContainmentLevelScene(() => {}), room = scene.roomFive;
  const world = new CollisionWorld();
  try {
    scene.root.updateMatrixWorld(true);
    world.registerAll(scene.collisionMeshes);
    room.updateTraversal(dt, idle, []);
    for (const alpha of [0, .2, .5, .9, 1]) {
      const before = platforms(scene).map(platform => ({ position: platform.root.position.clone(),
        previous: new THREE.Vector3().copy(platform.previousPosition), displacement: platform.displacement.clone(),
        state: platform.captureState() }));
      room.art.presentMovingPlatforms(alpha);
      for (const [index, platform] of platforms(scene).entries()) {
        const visual = dressing(scene, index);
        close(visual.getWorldPosition(new THREE.Vector3()), before[index].previous.clone().lerp(before[index].position, alpha));
        close(platform.root.position, before[index].position);
        close(platform.displacement, before[index].displacement);
        assert.deepEqual(platform.captureState(), before[index].state);
        close(new THREE.Vector3().copy(platform.previousPosition), before[index].previous);
        const hit = new CollisionHit();
        assert.equal(world.sweepSphere(platform.root.position.clone().add(new THREE.Vector3(0, 2, 0)),
          new THREE.Vector3(0, -3, 0), .1, hit), true);
        assert.equal(hit.object === platform.collisionMesh, true, 'Queries must keep using the fixed-step collider');
      }
    }
    room.reset();
    for (const alpha of [0, .3, 1]) {
      room.art.presentMovingPlatforms(alpha);
      platforms(scene).forEach((platform, index) => close(dressing(scene, index).getWorldPosition(new THREE.Vector3()), platform.root.position));
    }
    room.updateTraversal(dt, idle, []);
    platforms(scene).forEach(platform => platform.restoreState({ progress: .8, target: 'start' }));
    room.art.presentMovingPlatforms(.2);
    platforms(scene).forEach((platform, index) => close(dressing(scene, index).position, new THREE.Vector3(), 'No stale checkpoint offset'));
  } finally { world.clear(); scene.dispose(); }
});

for (const fps of [30, 60, 90]) for (const riderIndex of [0, 1]) {
  test(`both Room 5 routes remain continuous and phase locked while riding platform ${riderIndex + 1} at ${fps} FPS`, () => {
    const scene = new ContainmentLevelScene(() => {}), room = scene.roomFive;
    const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
    try {
      scene.root.updateMatrixWorld(true);
      world.registerAll(scene.collisionMeshes, undefined, ColliderTransformMode.Static);
      for (const mesh of scene.dynamicCollisionMeshes) world.setTransformMode(mesh, ColliderTransformMode.Dynamic);
      surfaces.registerAll(scene.collisionMeshes);
      const carrier = platforms(scene)[riderIndex];
      const body = new KinematicBody({ world, surfaces,
        initialPosition: carrier.root.position.clone().add(new THREE.Vector3(0, carrier.size.y / 2 + .46, 0)) });
      const riderOffset = body.position.clone().sub(carrier.root.position);
      const cameraRig = new CameraRig(); cameraRig.setFollowTarget(body, world); cameraRig.setViewMode('first-person', true);
      let cameraOffset: THREE.Vector3 | undefined;
      let accumulator = .003, ticks = 0;
      for (let frame = 0; frame < fps * 13; frame++) {
        accumulator += 1 / fps;
        while (accumulator + 1e-10 >= dt) {
          body.update(dt, noMovement);
          room.updateTraversal(dt, body, [body]);
          assert.equal(body.supportCollider === carrier.collisionMesh, true);
          assert.equal(body.grounded, true);
          accumulator -= dt; ticks++;
        }
        const alpha = accumulator / dt;
        room.art.presentMovingPlatforms(alpha);
        const renderedTime = Math.max(0, (ticks - 1) * dt + accumulator);
        for (const [index, platform] of platforms(scene).entries()) {
          const phase = ((index === 0 ? .5 : 0) + renderedTime / 3.2) % 2;
          const progress = phase <= 1 ? phase : 2 - phase;
          const expected = platform.startPosition.clone().lerp(platform.endPosition, progress);
          close(dressing(scene, index).getWorldPosition(new THREE.Vector3()), expected, 'Uniform motion including reversals');
        }
        const renderedBody = new THREE.Vector3().copy(body.previousPosition).lerp(body.position, alpha);
        cameraRig.update(alpha, 1 / fps);
        const offset = cameraRig.camera.position.clone().sub(renderedBody);
        if (cameraOffset) assert.ok(offset.distanceTo(cameraOffset) < .00002, 'First-person camera shares the rider interpolation without lag');
        cameraOffset = offset;
        const relative = renderedBody.sub(dressing(scene, riderIndex).getWorldPosition(new THREE.Vector3()));
        assert.ok(Math.abs(relative.x - riderOffset.x) < 1e-8 && Math.abs(relative.z - riderOffset.z) < 1e-8,
          'Rider and dressing must share one interpolation interval');
        assert.ok(Math.abs(relative.y - riderOffset.y) < .00002,
          'Only the existing 10-micrometre collision contact push may change rider clearance');
      }
    } finally { world.clear(); surfaces.clear(); scene.dispose(); }
  });
}
