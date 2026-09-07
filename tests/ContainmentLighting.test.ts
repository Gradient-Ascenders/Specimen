import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';

const createScene = (): ContainmentLevelScene =>
  new ContainmentLevelScene(() => undefined);

test('Containment replaces inspection lights with visible-source room rigs', () => {
  const scene = createScene();

  assert.equal(
    scene.root.getObjectByName('clinical-inspection-lighting'),
    undefined,
  );
  for (const fixtureName of [
    'room-1-ceiling-neutral-diffuser--3.8',
    'room-1-ceiling-neutral-diffuser-3.8',
    'room-1-to-2-duct-exit-fixture',
    'room-2-ceiling-neutral-diffuser-1',
    'room-3-ceiling-static-diffuser-1',
    'room-4-shaft-zone-2-fixture-2',
    'room-5-ceiling-static-fixture-diffusers',
  ]) {
    assert.ok(scene.root.getObjectByName(fixtureName), fixtureName);
  }

  const initial = scene.lightingDiagnostics;
  assert.equal(initial.activeRoomId, 1);
  assert.equal(initial.authoredLightCount, 20);
  assert.equal(initial.visibleAuthoredLightCount, 5);
  assert.equal(initial.shadowCastingLightCount, 0);
  const roomOnePointLights: string[] = [];
  scene.root
    .getObjectByName('containment-room-1-lighting-rig')
    ?.traverse((object) => {
      if (object instanceof THREE.PointLight) roomOnePointLights.push(object.name);
    });
  assert.deepEqual(roomOnePointLights.sort(), [
    'room-1-fluorescent-a-received-light',
    'room-1-fluorescent-b-received-light',
    'room-1-to-2-duct-reflected-cue',
  ]);

  scene.lighting.setActiveRoom(3);
  const roomThree = scene.lightingDiagnostics;
  assert.equal(roomThree.visibleAuthoredLightCount, 5);
  assert.equal(
    scene.root.getObjectByName('containment-room-1-lighting-rig')?.visible,
    false,
  );
  assert.equal(
    scene.root.getObjectByName('containment-room-3-lighting-rig')?.visible,
    true,
  );

  scene.dispose();
});

test('lighting prewarm visits every room and restores the authoritative room', async () => {
  const scene = createScene();
  const visitedRooms: number[] = [];

  await scene.lighting.prewarmShaderConfigurations(async (roomId) => {
    visitedRooms.push(roomId);
    assert.equal(scene.lightingDiagnostics.activeRoomId, roomId);
  });

  assert.deepEqual(visitedRooms, [1, 2, 3, 4, 5]);
  assert.equal(scene.lightingDiagnostics.activeRoomId, 1);
  assert.equal(scene.lightingDiagnostics.visibleAuthoredLightCount, 5);

  scene.lighting.setActiveRoom(3);
  await assert.rejects(
    scene.lighting.prewarmShaderConfigurations(async (roomId) => {
      if (roomId === 4) throw new Error('synthetic compile failure');
    }),
    /synthetic compile failure/,
  );
  assert.equal(scene.lightingDiagnostics.activeRoomId, 3);
  assert.equal(scene.lightingDiagnostics.visibleAuthoredLightCount, 5);

  scene.dispose();
});

test('stable lighting does not reapply unchanged room state every fixed tick', () => {
  const scene = createScene();
  const initial = scene.lightingDiagnostics;

  for (let tick = 0; tick < 600; tick += 1) {
    scene.lighting.update(1 / 60);
  }

  const idle = scene.lightingDiagnostics;
  assert.equal(
    idle.goopStateApplicationCount,
    initial.goopStateApplicationCount,
  );
  assert.equal(
    idle.elevatorStateApplicationCount,
    initial.elevatorStateApplicationCount,
  );

  assert.equal(scene.roomFive.beginEnding(), true);
  scene.lighting.update(1 / 60);
  const warning = scene.lightingDiagnostics;
  assert.equal(
    warning.goopStateApplicationCount,
    idle.goopStateApplicationCount + 1,
  );
  scene.lighting.update(1 / 60);
  assert.equal(
    scene.lightingDiagnostics.goopStateApplicationCount,
    warning.goopStateApplicationCount + 1,
    'warning pulse remains live',
  );

  scene.roomFour.elevator.begin();
  scene.lighting.update(1 / 60);
  assert.equal(
    scene.lightingDiagnostics.elevatorStateApplicationCount,
    idle.elevatorStateApplicationCount + 1,
  );
  scene.roomFour.elevator.update(1 / 60, []);
  scene.lighting.update(1 / 60);
  assert.equal(
    scene.lightingDiagnostics.elevatorStateApplicationCount,
    idle.elevatorStateApplicationCount + 2,
    'elevator warning pulse remains live',
  );

  scene.dispose();
});

test('Room 4 lighting follows only authoritative elevator state and reset', () => {
  const scene = createScene();
  scene.lighting.setActiveRoom(4);
  const lower = scene.root.getObjectByName(
    'room-4-lower-amber-received-light',
  );
  const upper = scene.root.getObjectByName(
    'room-4-upper-arrival-received-light',
  );
  assert.ok(lower instanceof THREE.PointLight);
  assert.ok(upper instanceof THREE.PointLight);

  const waitingIntensity = lower.intensity;
  scene.roomFour.elevator.begin();
  scene.update(0.1);
  assert.equal(scene.lightingDiagnostics.roomFourElevatorState, 'warning');
  assert.ok(lower.intensity > waitingIntensity);

  scene.roomFour.elevator.update(
    scene.roomFour.elevator.startDelaySeconds +
      scene.roomFour.elevator.travelDurationSeconds,
    [],
  );
  scene.update(0.1);
  assert.equal(scene.lightingDiagnostics.roomFourElevatorState, 'arrivalPause');
  assert.equal(upper.color.getHex(), 0x49ef91);
  assert.ok(upper.intensity > lower.intensity);

  scene.roomFour.reset();
  scene.reconcilePresentationAfterRecovery();
  assert.equal(scene.lightingDiagnostics.roomFourElevatorState, 'waitingForRider');
  assert.equal(lower.intensity, waitingIntensity);

  scene.dispose();
});

test('Room 5 maps authoritative ending progress through alarm, locks, opening and release', () => {
  const scene = createScene();
  scene.lighting.setActiveRoom(5);

  assert.equal(scene.roomFive.beginEnding(), true);
  scene.update(0.05);
  assert.equal(scene.lightingDiagnostics.goopReleaseState, 'warning');

  scene.roomFive.updateEnding(1);
  scene.update(0.01);
  assert.equal(
    scene.lightingDiagnostics.goopReleaseState,
    'locks-disengaging',
  );

  scene.roomFive.updateEnding(0.5);
  scene.update(0.01);
  assert.equal(scene.lightingDiagnostics.goopReleaseState, 'opening');
  assert.equal(scene.lightingDiagnostics.activeParticleCount, 18);

  scene.roomFive.updateEnding(0.7);
  scene.update(0.01);
  assert.equal(scene.lightingDiagnostics.goopReleaseState, 'reveal');

  scene.roomFive.updateEnding(0.4);
  scene.update(0.01);
  assert.equal(scene.roomFive.endingState, 'released');
  assert.equal(scene.lightingDiagnostics.goopReleaseState, 'released');
  assert.equal(scene.lightingDiagnostics.activeParticleCount, 0);

  scene.roomFive.reset();
  scene.reconcilePresentationAfterRecovery();
  assert.equal(scene.lightingDiagnostics.goopReleaseState, 'normal');
  assert.equal(scene.lightingDiagnostics.activeParticleCount, 0);

  scene.dispose();
});

test('cutscene completion and skip converge on identical stable presentation', () => {
  const scene = createScene();
  const chamberLight = scene.root.getObjectByName(
    'room-5-containment-state-light',
  );
  const lockLens = scene.root.getObjectByName(
    'room-5-containment-front-lock-status-emissive-lens',
  );
  assert.ok(chamberLight instanceof THREE.PointLight);
  assert.ok(lockLens instanceof THREE.Mesh);
  assert.ok(lockLens.material instanceof THREE.MeshStandardMaterial);

  scene.cutsceneLighting.setBobHatchLightingState('impact');
  assert.equal(scene.lightingDiagnostics.activeParticleCount, 12);
  scene.cutsceneLighting.finalizeBobHatch('completed');
  assert.equal(scene.lightingDiagnostics.bobHatchState, 'complete');
  assert.equal(scene.lightingDiagnostics.activeParticleCount, 0);

  scene.cutsceneLighting.setGoopReleaseLightingState('warning');
  scene.cutsceneLighting.setGoopReleaseLightingState('locks-disengaging');
  scene.cutsceneLighting.setGoopReleaseLightingState('opening');
  scene.cutsceneLighting.setGoopReleaseLightingState('reveal');
  scene.cutsceneLighting.finalizeGoopRelease('completed');
  const completedSignature = [
    scene.lightingDiagnostics.goopReleaseState,
    chamberLight.color.getHex(),
    chamberLight.intensity,
    lockLens.material.emissive.getHex(),
    lockLens.material.emissiveIntensity,
    scene.lightingDiagnostics.activeParticleCount,
  ];

  scene.lighting.reset();
  scene.cutsceneLighting.setBobHatchLightingState('impact');
  scene.cutsceneLighting.finalizeBobHatch('skipped');
  scene.cutsceneLighting.setGoopReleaseLightingState('warning');
  scene.cutsceneLighting.finalizeGoopRelease('skipped');
  const skippedSignature = [
    scene.lightingDiagnostics.goopReleaseState,
    chamberLight.color.getHex(),
    chamberLight.intensity,
    lockLens.material.emissive.getHex(),
    lockLens.material.emissiveIntensity,
    scene.lightingDiagnostics.activeParticleCount,
  ];

  assert.deepEqual(skippedSignature, completedSignature);
  assert.equal(scene.lightingDiagnostics.bobHatchState, 'complete');
  assert.equal(scene.lightingDiagnostics.goopReleaseManuallyDriven, true);

  scene.lighting.reset();
  assert.equal(scene.lightingDiagnostics.bobHatchState, 'gameplay');
  assert.equal(scene.lightingDiagnostics.goopReleaseState, 'normal');
  assert.equal(scene.lightingDiagnostics.goopReleaseManuallyDriven, false);
  assert.equal(scene.lightingDiagnostics.activeParticleCount, 0);

  scene.cutsceneLighting.setBobHatchLightingState('impact');
  scene.cutsceneLighting.setGoopReleaseLightingState('warning');
  scene.reconcilePresentationAfterRecovery();
  assert.equal(scene.lightingDiagnostics.bobHatchState, 'gameplay');
  assert.equal(scene.lightingDiagnostics.goopReleaseState, 'normal');
  assert.equal(scene.lightingDiagnostics.goopReleaseManuallyDriven, false);
  assert.equal(scene.lightingDiagnostics.activeParticleCount, 0);

  scene.dispose();
});

test('lighting effects and attached fixtures dispose once and recreate cleanly', () => {
  const scene = createScene();
  const bobEffect = scene.root.getObjectByName(
    'room-1-bob-containment-impact-sparkles',
  );
  const goopEffect = scene.root.getObjectByName('room-5-goop-release-vapour');
  const lockFixture = scene.root.getObjectByName(
    'room-5-containment-front-lock-status',
  );
  assert.ok(bobEffect instanceof THREE.Points);
  assert.ok(goopEffect instanceof THREE.Points);
  assert.ok(lockFixture);

  let bobGeometryDisposals = 0;
  let bobMaterialDisposals = 0;
  let goopGeometryDisposals = 0;
  let goopMaterialDisposals = 0;
  bobEffect.geometry.addEventListener('dispose', () => {
    bobGeometryDisposals += 1;
  });
  bobEffect.material.addEventListener('dispose', () => {
    bobMaterialDisposals += 1;
  });
  goopEffect.geometry.addEventListener('dispose', () => {
    goopGeometryDisposals += 1;
  });
  goopEffect.material.addEventListener('dispose', () => {
    goopMaterialDisposals += 1;
  });

  scene.cutsceneLighting.setBobHatchLightingState('impact');
  scene.cutsceneLighting.setGoopReleaseLightingState('opening');
  assert.equal(scene.lightingDiagnostics.activeParticleCount, 30);

  scene.dispose();
  scene.dispose();
  assert.equal(scene.lightingDiagnostics.disposed, true);
  assert.equal(scene.lightingDiagnostics.activeParticleCount, 0);
  assert.equal(bobEffect.parent, null);
  assert.equal(goopEffect.parent, null);
  assert.equal(lockFixture.parent, null);
  assert.equal(bobGeometryDisposals, 1);
  assert.equal(bobMaterialDisposals, 1);
  assert.equal(goopGeometryDisposals, 1);
  assert.equal(goopMaterialDisposals, 1);

  const recreated = createScene();
  assert.equal(recreated.lightingDiagnostics.authoredLightCount, 20);
  assert.equal(recreated.lightingDiagnostics.activeParticleCount, 0);
  assert.equal(recreated.lightingDiagnostics.disposed, false);
  recreated.dispose();
});
