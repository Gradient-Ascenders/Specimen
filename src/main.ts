import * as THREE from 'three';

import { EventBus } from './core/EventBus';
import { Input } from './core/Input';
import { Loop } from './core/Loop';
import { GreyboxTestPanel } from './debug/GreyboxTestPanel';
import { LaserTestRig } from './hazards/LaserTestRig';
import { GreyboxCollisionScene } from './levels/GreyboxCollisionScene';
import { CollisionWorld } from './physics/CollisionWorld';
import {
  DEFAULT_KINEMATIC_BODY_CONFIG,
  KinematicBody,
  type JumpInputState,
} from './physics/KinematicBody';
import type { MovementEvents } from './physics/MovementEvents.ts';
import { SurfaceRegistry } from './physics/SurfaceRegistry';
import { ElevatorTestRig } from './puzzle/ElevatorTestRig';
import { PuzzleTestRig } from './puzzle/PuzzleTestRig';
import { BlobFacing } from './render/BlobFacing';
import { RenderLayer } from './render/RenderLayer';
import type { SlimeVisualState } from './render/slime/SlimeVisual';
import { DeathSequence } from './systems/DeathSequence';
import { DeathScreen } from './ui/DeathScreen';
import './style.css';

const PLAYER_OUT_OF_BOUNDS_Y_METRES = -4;

type DeathRecoveryOwner = 'laser' | 'elevator';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app host element.');
}

const appHost = app;

const renderLayer = new RenderLayer({ host: appHost });

const testScene = new GreyboxCollisionScene();
renderLayer.scene.add(testScene.root);

const puzzleTestRig = new PuzzleTestRig();
renderLayer.scene.add(puzzleTestRig.root);

const collisionWorld = new CollisionWorld();
collisionWorld.registerAll(testScene.collisionMeshes);

const surfaceRegistry = new SurfaceRegistry();
surfaceRegistry.registerAll(testScene.collisionMeshes);

const movementEvents = new EventBus<MovementEvents>();
let landingEventCount = 0;
let lastLandingImpactSpeedMetresPerSecond = 0;

const spawnPosition = testScene.copySpawnPosition(new THREE.Vector3());
const recoveryPosition = testScene.copyRecoveryPosition(new THREE.Vector3());
const renderedProbePosition = new THREE.Vector3();
const cameraRelativeMovement = new THREE.Vector3();
const noMovement = new THREE.Vector3();
const blobFacing = new BlobFacing();

const body = new KinematicBody({
  world: collisionWorld,
  surfaces: surfaceRegistry,
  initialPosition: spawnPosition,
  events: movementEvents,
});
renderLayer.cameraRig.setFollowTarget(body, collisionWorld);

const deathSequence = new DeathSequence();
let currentRecoveryOwner: DeathRecoveryOwner = 'laser';
let deathRecoveryOwner: DeathRecoveryOwner | null = null;

const laserTestRig = new LaserTestRig({
  player: body,
  checkpointSpawn: spawnPosition,
  requestPlayerDeath: () => requestPlayerDeath('laser'),
});
renderLayer.scene.add(laserTestRig.root);

const elevatorTestRig = new ElevatorTestRig(
  body,
  collisionWorld,
  surfaceRegistry,
  () => requestPlayerDeath('elevator'),
);
renderLayer.scene.add(elevatorTestRig.root);

const slimeVisualState: SlimeVisualState = {
  velocityWorld: body.velocity,
  surfaceNormalWorld: body.groundNormal,
  gameplayUpWorld: body.gameplayUp,
  grounded: body.grounded,
  attached: body.attached,
  jumpCharge: body.chargeFraction,
  maximumLocomotionSpeedMetresPerSecond:
    body.maximumLocomotionSpeedMetresPerSecond,
  contactCount: body.contactsThisStep,
  contactNormalWorld: body.lastContactNormal,
  contactSpeedMetresPerSecond:
    body.lastContactImpactSpeedMetresPerSecond,
  contactName: body.lastContactName,
  contactSurfaceTag: body.lastContactSurfaceTag,
  landedThisStep: body.landedThisStep,
};

const unsubscribeLanding = movementEvents.on('landed', (event) => {
  landingEventCount += 1;
  lastLandingImpactSpeedMetresPerSecond =
    event.impactSpeedMetresPerSecond;
  testScene.onSlimeLanding(
    body.groundNormal,
    event.impactSpeedMetresPerSecond,
  );
});

const unsubscribeJumped = movementEvents.on('jumped', (event) => {
  testScene.onSlimeLaunch({
    directionWorld: event.directionWorld,
    speedMetresPerSecond: event.speedMetresPerSecond,
    chargeFraction: event.chargeFraction,
  });
});

const jumpInputState: JumpInputState = {
  pressed: false,
  held: false,
  released: false,
};

const SLOPE_REGRESSION_DURATION_SECONDS = 10;
const SLOPE_REGRESSION_FIXED_DELTA_SECONDS = 1 / 60;
const SLOPE_REGRESSION_MAX_TANGENT_DRIFT_METRES = 0.02;

let slopeRegressionStatus = 'not run';

const runSlopeIdleRegression = (): string => {
  const slopeMesh = testScene.collisionMeshes.find(
    (mesh) => mesh.name === 'case-slope-15-degrees',
  );

  if (!slopeMesh) {
    slopeRegressionStatus = 'FAIL — authored 15° slope not found';
    return slopeRegressionStatus;
  }

  slopeMesh.updateWorldMatrix(true, false);
  slopeMesh.geometry.computeBoundingBox();

  const bounds = slopeMesh.geometry.boundingBox;
  if (!bounds) {
    slopeRegressionStatus = 'FAIL — slope bounds unavailable';
    return slopeRegressionStatus;
  }

  const localTopCentre = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) * 0.5,
    bounds.max.y,
    (bounds.min.z + bounds.max.z) * 0.5,
  );

  const surfacePoint = localTopCentre.applyMatrix4(slopeMesh.matrixWorld);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(
    slopeMesh.matrixWorld,
  );
  const surfaceNormal = new THREE.Vector3(0, 1, 0)
    .applyNormalMatrix(normalMatrix)
    .normalize();

  const regressionStart = surfacePoint
    .clone()
    .addScaledVector(
      surfaceNormal,
      DEFAULT_KINEMATIC_BODY_CONFIG.radiusMetres +
        DEFAULT_KINEMATIC_BODY_CONFIG.skinWidthMetres +
        0.002,
    );

  const regressionBody = new KinematicBody({
    world: collisionWorld,
    surfaces: surfaceRegistry,
    initialPosition: regressionStart,
  });

  const start = new THREE.Vector3(
    regressionBody.position.x,
    regressionBody.position.y,
    regressionBody.position.z,
  );

  let ungroundedSteps = 0;
  const totalSteps = Math.round(
    SLOPE_REGRESSION_DURATION_SECONDS /
      SLOPE_REGRESSION_FIXED_DELTA_SECONDS,
  );

  for (let step = 0; step < totalSteps; step += 1) {
    regressionBody.update(
      SLOPE_REGRESSION_FIXED_DELTA_SECONDS,
      noMovement,
    );

    if (!regressionBody.grounded) ungroundedSteps += 1;
  }

  const end = new THREE.Vector3(
    regressionBody.position.x,
    regressionBody.position.y,
    regressionBody.position.z,
  );
  const tangentDrift = end
    .sub(start)
    .projectOnPlane(surfaceNormal)
    .length();

  const finalVelocity = regressionBody.velocity;
  const finalSpeed = Math.hypot(
    finalVelocity.x,
    finalVelocity.y,
    finalVelocity.z,
  );

  const passed =
    tangentDrift <= SLOPE_REGRESSION_MAX_TANGENT_DRIFT_METRES &&
    ungroundedSteps === 0;

  slopeRegressionStatus = [
    passed ? 'PASS' : 'FAIL',
    `${SLOPE_REGRESSION_DURATION_SECONDS.toFixed(0)} s`,
    `drift ${tangentDrift.toFixed(4)} m`,
    `speed ${finalSpeed.toFixed(4)} m/s`,
    `ungrounded steps ${ungroundedSteps}`,
  ].join(' — ');

  return slopeRegressionStatus;
};

const testPanel = new GreyboxTestPanel({
  onReset: () => {
    deathSequence.reset();
    currentRecoveryOwner = 'laser';
    deathRecoveryOwner = null;
    deathScreen.hide();
    input.setEnabled(true);
    testScene.resetProbe();
    elevatorTestRig.resetRuntimeOnly();
    laserTestRig.reset();
    puzzleTestRig.reset();
    landingEventCount = 0;
    lastLandingImpactSpeedMetresPerSecond = 0;
    appHost.dataset.gameState = deathSequence.state;
  },
  onTestRecovery: () => {
    body.teleport(recoveryPosition);
    requestPlayerDeath(currentRecoveryOwner);
  },
  onTogglePuzzleTest: () => puzzleTestRig.toggleTestSlime(),
  onRunSensorRegression: () => puzzleTestRig.runTriggerRegression(),
  onRunResetRegression: () => puzzleTestRig.runResetRegression(),
  onActivateCheckpoint: () => puzzleTestRig.activateElevatedCheckpoint(),
  onRecoverCheckpoint: () => puzzleTestRig.recoverTestSlime(),
  onRunSlopeIdleRegression: runSlopeIdleRegression,
  onToggleStaticLaser: () => laserTestRig.toggleStaticLaser(),
  onResetLaserSequences: () => laserTestRig.resetSequences(),
  onRunLaserDeterminismRegression: () =>
    laserTestRig.runDeterminismRegression(),
  onEnterElevatorTest: () => {
    currentRecoveryOwner = 'elevator';
    elevatorTestRig.enter();
  },
  onRecoverElevatorCheckpoint: () => {
    currentRecoveryOwner = 'elevator';
    elevatorTestRig.recover();
  },
  onRunElevatorCarrierRegression: () => {
    currentRecoveryOwner = 'elevator';
    return elevatorTestRig.runCarrierRegression();
  },
});

const input = new Input({
  pointerLockElement: renderLayer.canvas,
});

const deathScreen = new DeathScreen({
  onRetry: retryAfterDeath,
});

appHost.dataset.gameState = deathSequence.state;
appHost.replaceChildren(
  renderLayer.canvas,
  testPanel.element,
  deathScreen.element,
);

function requestPlayerDeath(owner: DeathRecoveryOwner): boolean {
  if (!deathSequence.requestDeath()) return false;
  if (!testScene.startDeath(body.position)) {
    deathSequence.reset();
    return false;
  }

  deathRecoveryOwner = owner;
  input.setEnabled(false);
  input.releasePointerLock();
  appHost.dataset.gameState = deathSequence.state;
  return true;
}

function retryAfterDeath(): void {
  if (!deathSequence.canRetry || deathRecoveryOwner === null) return;

  if (deathRecoveryOwner === 'elevator') {
    elevatorTestRig.recover();
  } else {
    laserTestRig.recover();
  }

  testScene.finishDeath(body.position);
  deathRecoveryOwner = null;
  if (!deathSequence.completeRetry()) return;

  deathScreen.hide();
  input.setEnabled(true);
  input.requestPointerLock();
  appHost.dataset.gameState = deathSequence.state;
}

function updateDeathState(deltaSeconds: number): void {
  testScene.updateDeath(deltaSeconds);
  if (deathSequence.update(deltaSeconds)) {
    deathScreen.show();
  }
  appHost.dataset.gameState = deathSequence.state;
  input.endFixedUpdate();
}

let debugSampleElapsedSeconds = 0;

const loop = new Loop({
  fixedUpdate: (deltaSeconds) => {
    if (!deathSequence.isPlaying) {
      updateDeathState(deltaSeconds);
      return;
    }

    if (input.wasPressed('debugReset')) testPanel.resetProbe();
    if (input.wasPressed('debugTestRecovery')) testPanel.testRecovery();

    if (!deathSequence.isPlaying) {
      updateDeathState(deltaSeconds);
      return;
    }

    const moveX =
      (input.isDown('moveRight') ? 1 : 0) -
      (input.isDown('moveLeft') ? 1 : 0);
    const moveZ =
      (input.isDown('moveBackward') ? 1 : 0) -
      (input.isDown('moveForward') ? 1 : 0);

    renderLayer.cameraRig.queueLookInput(
      input.pointerDeltaX,
      input.pointerDeltaY,
    );
    renderLayer.cameraRig.applyQueuedLookInput();

    // Resolve both ground and attached movement from the camera before the
    // body advances. A step that begins attached preserves this support plane
    // through wall-jump release; ordinary jumps use their new airborne plane.
    if (body.attached) {
      renderLayer.cameraRig.copySurfaceMovementDirection(
        moveX,
        moveZ,
        body.gameplayUp,
        cameraRelativeMovement,
      );
    } else {
      renderLayer.cameraRig.copyGroundMovementDirection(
        moveX,
        moveZ,
        cameraRelativeMovement,
      );
    }

    jumpInputState.pressed = input.wasPressed('jump');
    jumpInputState.held = input.isDown('jump');
    jumpInputState.released = input.wasReleased('jump');

    body.update(
      deltaSeconds,
      cameraRelativeMovement,
      jumpInputState,
    );

    if (body.position.y < PLAYER_OUT_OF_BOUNDS_Y_METRES) {
      requestPlayerDeath(currentRecoveryOwner);
    }
    if (!deathSequence.isPlaying) {
      updateDeathState(deltaSeconds);
      return;
    }

    // Lethal hazards query the authoritative post-movement sphere. Their
    // one-shot callback now enters the death journey before any recovery.
    laserTestRig.update(deltaSeconds);
    if (!deathSequence.isPlaying) {
      updateDeathState(deltaSeconds);
      return;
    }

    // The body resolves its own locomotion first. The elevator then advances
    // its authored platform pose and applies that fixed-step displacement only
    // if the body remains grounded on the roof.
    elevatorTestRig.update(deltaSeconds);
    if (!deathSequence.isPlaying) {
      updateDeathState(deltaSeconds);
      return;
    }

    blobFacing.update(deltaSeconds, body.velocity, !body.attached);
    slimeVisualState.grounded = body.grounded;
    slimeVisualState.attached = body.attached;
    slimeVisualState.jumpCharge = body.chargeFraction;
    slimeVisualState.contactCount = body.contactsThisStep;
    slimeVisualState.contactSpeedMetresPerSecond =
      body.lastContactImpactSpeedMetresPerSecond;
    slimeVisualState.contactName = body.lastContactName;
    slimeVisualState.contactSurfaceTag = body.lastContactSurfaceTag;
    slimeVisualState.landedThisStep = body.landedThisStep;
    testScene.update(deltaSeconds, slimeVisualState);
    puzzleTestRig.update(deltaSeconds);
    input.endFixedUpdate();
  },
  render: (interpolationAlpha, stats) => {
    if (deathSequence.isPlaying) {
      const previous = body.previousPosition;
      const current = body.position;

      renderedProbePosition.set(
        THREE.MathUtils.lerp(previous.x, current.x, interpolationAlpha),
        THREE.MathUtils.lerp(previous.y, current.y, interpolationAlpha),
        THREE.MathUtils.lerp(previous.z, current.z, interpolationAlpha),
      );

      testScene.setProbePosition(renderedProbePosition);
      testScene.setProbeYaw(
        blobFacing.getInterpolatedYaw(interpolationAlpha),
      );
      testScene.presentProbe();
      // A high-refresh render can occur without a 60 Hz gameplay step. Consume
      // any pointer motion from that interval here so camera look remains crisp;
      // the next fixed step will read the already-updated orbit basis.
      renderLayer.cameraRig.queueLookInput(
        input.pointerDeltaX,
        input.pointerDeltaY,
      );
    }
    input.endPointerUpdate();
    renderLayer.cameraRig.update(
      interpolationAlpha,
      stats.frameDeltaSeconds,
    );
    renderLayer.render();

    debugSampleElapsedSeconds += stats.rawFrameDeltaSeconds;

    if (debugSampleElapsedSeconds >= 0.25) {
      debugSampleElapsedSeconds = 0;

      const heldActions = Array.from(input.held).join(', ') || 'none';
      const position = body.position;
      const velocity = body.velocity;
      const groundNormal = body.groundNormal;
      const renderStats = renderLayer.getDiagnostics();
      const slimeDiagnostics = testScene.slimeDiagnostics;
      const cameraStats = renderLayer.cameraRig.getDiagnostics();
      const cameraPosition = renderLayer.cameraRig.camera.position;
      const laserStats = laserTestRig.getDiagnostics();
      const elevatorStats = elevatorTestRig.getDiagnostics();
      const deathStats = deathSequence.diagnostics;
      const burstStats = testScene.deathBurstDiagnostics;

      testPanel.setRuntimeDiagnostics(
        [
          `fixed step: ${(stats.fixedDeltaSeconds * 1000).toFixed(2)} ms`,
          `render FPS: ${stats.renderFps.toFixed(1)}`,
          `steps this frame: ${stats.stepsThisFrame}`,
          `pointer lock: ${input.pointerLocked ? 'locked' : 'unlocked'}`,
          `held actions: ${heldActions}`,
          `game / death state: ${deathStats.state} (${deathStats.elapsedSeconds.toFixed(2)} s)`,
          `deaths / retries: ${deathStats.acceptedDeathCount} / ${deathStats.completedRetryCount}`,
          `death burst active / radius: ${burstStats.active ? 'yes' : 'no'} / ${burstStats.maximumFragmentDistanceMetres.toFixed(2)} m`,
          `body position: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)} m`,
          `body velocity: ${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)} m/s`,
          `grounded / attached: ${body.grounded ? 'yes' : 'no'} / ${body.attached ? 'yes' : 'no'}`,
          `ground normal: ${groundNormal.x.toFixed(2)}, ${groundNormal.y.toFixed(2)}, ${groundNormal.z.toFixed(2)}`,
          `gameplay up: ${body.gameplayUp.x.toFixed(2)}, ${body.gameplayUp.y.toFixed(2)}, ${body.gameplayUp.z.toFixed(2)}`,
          `surface / last contact: ${body.supportSurfaceTag} / ${body.lastContactSurfaceTag}`,
          `attachment surface: ${body.attachmentSurfaceName}`,
          `attach / bounce cooldown: ${body.attachmentCooldownSeconds.toFixed(2)} / ${body.bounceCooldownSeconds.toFixed(2)} s`,
          `last bounce: ${body.lastBounceSpeedMetresPerSecond.toFixed(2)} m/s @ ${body.lastBounceSurfaceName}`,
          `jump state / can jump: ${body.jumpState} / ${body.canJump ? 'yes' : 'no'}`,
          `charge: ${body.chargeSeconds.toFixed(2)} / ${body.maximumJumpChargeSeconds.toFixed(2)} s (${(body.chargeFraction * 100).toFixed(0)}%)`,
          `coyote remaining: ${body.coyoteTimeRemainingSeconds.toFixed(3)} s`,
          `last jump: ${body.lastJumpSpeedMetresPerSecond.toFixed(2)} m/s @ ${(body.lastJumpChargeFraction * 100).toFixed(0)}% charge`,
          `landing this step: ${body.landedThisStep ? 'yes' : 'no'}`,
          `last landing impact / count: ${lastLandingImpactSpeedMetresPerSecond.toFixed(2)} m/s / ${landingEventCount}`,
          `visual speed / charge: ${slimeDiagnostics.speed.toFixed(2)} / ${slimeDiagnostics.jumpCharge.toFixed(2)}`,
          `visual squash / stretch: ${slimeDiagnostics.squash.toFixed(2)} / ${slimeDiagnostics.stretch.toFixed(2)}`,
          `visual impact strength / age: ${slimeDiagnostics.impactStrength.toFixed(2)} / ${slimeDiagnostics.impactAge.toFixed(2)} s`,
          `visual impact normal: ${slimeDiagnostics.impactNormalLocal.x.toFixed(2)}, ${slimeDiagnostics.impactNormalLocal.y.toFixed(2)}, ${slimeDiagnostics.impactNormalLocal.z.toFixed(2)}`,
          `visual surface normal: ${slimeDiagnostics.surfaceNormalLocal.x.toFixed(2)}, ${slimeDiagnostics.surfaceNormalLocal.y.toFixed(2)}, ${slimeDiagnostics.surfaceNormalLocal.z.toFixed(2)}`,
          `visual move direction: ${slimeDiagnostics.moveDirectionLocal.x.toFixed(2)}, ${slimeDiagnostics.moveDirectionLocal.y.toFixed(2)}, ${slimeDiagnostics.moveDirectionLocal.z.toFixed(2)}`,
          `contacts this step: ${body.contactsThisStep}`,
          `last collision: ${body.lastCollisionName}`,
          `registered colliders / surfaces: ${collisionWorld.colliderCount} / ${surfaceRegistry.registeredCount}`,
          `laser checkpoint: ${laserStats.activeCheckpointId}`,
          `laser static enabled: ${laserStats.staticEnabled ? 'yes' : 'no'}`,
          `laser recoveries / last failure: ${laserStats.recoveryRequestCount} / ${laserStats.lastFailureHazardId}`,
          `laser static start: ${laserStats.staticStart[0].toFixed(2)}, ${laserStats.staticStart[1].toFixed(2)}, ${laserStats.staticStart[2].toFixed(2)} m`,
          `laser static end: ${laserStats.staticEnd[0].toFixed(2)}, ${laserStats.staticEnd[1].toFixed(2)}, ${laserStats.staticEnd[2].toFixed(2)} m`,
          `laser single sweep: ${laserStats.singleSweepState} @ ${(laserStats.singleSweepPhase * 100).toFixed(0)}%`,
          `laser alternating A/B: ${(laserStats.alternatingPhaseA * 100).toFixed(0)}% / ${(laserStats.alternatingPhaseB * 100).toFixed(0)}%`,
          `laser crossing A/B: ${(laserStats.crossingPhaseA * 100).toFixed(0)}% / ${(laserStats.crossingPhaseB * 100).toFixed(0)}%`,
          `laser final burst: ${laserStats.finalBurstState} @ ${(laserStats.finalBurstPhase * 100).toFixed(0)}%`,
          `elevator state / progress: ${elevatorStats.state} / ${(elevatorStats.progress * 100).toFixed(0)}%`,
          `elevator platform Y / delta Y: ${elevatorStats.platformY.toFixed(2)} / ${elevatorStats.displacementY.toFixed(4)} m`,
          `elevator rider / support: ${elevatorStats.riderSupported ? 'yes' : 'no'} / ${elevatorStats.supportColliderName}`,
          `elevator timing start / travel / arrival: ${elevatorStats.startDelaySeconds.toFixed(2)} / ${elevatorStats.travelDurationSeconds.toFixed(2)} / ${elevatorStats.arrivalDelaySeconds.toFixed(2)} s`,
          `elevator sequence elapsed: ${elevatorStats.sequenceElapsedSeconds.toFixed(2)} s`,
          `elevator checkpoint / group: ${elevatorStats.activeCheckpointId} / ${elevatorStats.checkpointGroupId}`,
          `elevator connected laser: ${elevatorStats.connectedLaserState} @ ${(elevatorStats.connectedLaserPhase * 100).toFixed(0)}%`,
          `elevator recoveries: ${elevatorStats.recoveryCount}`,
          `camera distance: ${cameraStats.currentDistanceMetres.toFixed(2)} / ${cameraStats.desiredDistanceMetres.toFixed(2)} m`,
          `camera obstruction: ${cameraStats.obstructed ? cameraStats.obstructionName : 'none'}`,
          `camera position: ${cameraPosition.x.toFixed(2)}, ${cameraPosition.y.toFixed(2)}, ${cameraPosition.z.toFixed(2)} m`,
          `camera pitch: ${THREE.MathUtils.radToDeg(cameraStats.pitchRadians).toFixed(1)}°`,
          `blob facing: ${THREE.MathUtils.radToDeg(blobFacing.yawRadians).toFixed(1)}°`,
          `slope idle regression: ${slopeRegressionStatus}`,
          `viewport: ${renderStats.viewportWidth} × ${renderStats.viewportHeight} CSS px`,
          `drawing buffer: ${renderStats.drawingBufferWidth} × ${renderStats.drawingBufferHeight} px (${renderStats.pixelRatio.toFixed(2)}× DPR)`,
          `draw calls / triangles: ${renderStats.drawCalls} / ${renderStats.triangles}`,
          `GPU geometries / textures: ${renderStats.geometries} / ${renderStats.textures}`,
          `plate / door / platform: ${puzzleTestRig.platePressed ? 'pressed' : 'released'} / ${puzzleTestRig.doorState} / ${puzzleTestRig.platformState}`,
          `active checkpoint: ${puzzleTestRig.activeCheckpointId}`,
        ].join('\n'),
      );
    }
  },
});

renderLayer.setAnimationLoop((timestampMs) => {
  loop.tick(timestampMs);
});

const shutdown = (): void => {
  unsubscribeLanding();
  unsubscribeJumped();
  movementEvents.clear();
  loop.dispose();
  input.dispose();
  deathScreen.dispose();
  collisionWorld.clear();
  surfaceRegistry.clear();
  laserTestRig.dispose();
  elevatorTestRig.dispose();
  testPanel.dispose();
  puzzleTestRig.dispose();
  testScene.dispose();
  renderLayer.dispose();
};

if (import.meta.hot) {
  import.meta.hot.dispose(shutdown);
}
