import * as THREE from 'three';

import { EventBus } from './core/EventBus';
import { Input } from './core/Input';
import { Loop } from './core/Loop';
import { GreyboxTestPanel } from './debug/GreyboxTestPanel';
import { ContainmentTeachingScene } from './levels/ContainmentTeachingScene';
import { CollisionWorld } from './physics/CollisionWorld';
import {
  DEFAULT_KINEMATIC_BODY_CONFIG,
  KinematicBody,
  type JumpInputState,
} from './physics/KinematicBody';
import type { MovementEvents } from './physics/MovementEvents.ts';
import { SurfaceRegistry } from './physics/SurfaceRegistry';
import { PuzzleTestRig } from './puzzle/PuzzleTestRig';
import { RenderLayer } from './render/RenderLayer';
import type { SlimeVisualState } from './render/slime/SlimeVisual';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app host element.');
}

const renderLayer = new RenderLayer({ host: app });

const testScene = new ContainmentTeachingScene();
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

const body = new KinematicBody({
  world: collisionWorld,
  surfaces: surfaceRegistry,
  initialPosition: spawnPosition,
  events: movementEvents,
});
renderLayer.cameraRig.setFollowTarget(body, collisionWorld);

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
      0,
      0,
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
    testScene.resetProbe();
    body.teleport(spawnPosition);
    puzzleTestRig.reset();
    landingEventCount = 0;
    lastLandingImpactSpeedMetresPerSecond = 0;
  },
  onTestRecovery: (onRecovered) => {
    body.teleport(recoveryPosition);
    testScene.simulateFall(() => {
      body.teleport(spawnPosition);
      onRecovered();
    });
  },
  onTogglePuzzleTest: () => puzzleTestRig.toggleTestSlime(),
  onRunSensorRegression: () => puzzleTestRig.runTriggerRegression(),
  onRunResetRegression: () => puzzleTestRig.runResetRegression(),
  onActivateCheckpoint: () => puzzleTestRig.activateElevatedCheckpoint(),
  onRecoverCheckpoint: () => puzzleTestRig.recoverTestSlime(),
  onRunSlopeIdleRegression: runSlopeIdleRegression,
});

app.replaceChildren(renderLayer.canvas, testPanel.element);

const input = new Input({
  pointerLockElement: renderLayer.canvas,
});

let debugSampleElapsedSeconds = 0;

const loop = new Loop({
  fixedUpdate: (deltaSeconds) => {
    if (input.wasPressed('debugReset')) testPanel.resetProbe();
    if (input.wasPressed('debugTestRecovery')) testPanel.testRecovery();

    const moveX =
      (input.isDown('moveRight') ? 1 : 0) -
      (input.isDown('moveLeft') ? 1 : 0);
    const moveZ =
      (input.isDown('moveBackward') ? 1 : 0) -
      (input.isDown('moveForward') ? 1 : 0);

    jumpInputState.pressed = input.wasPressed('jump');
    jumpInputState.held = input.isDown('jump');
    jumpInputState.released = input.wasReleased('jump');

    body.update(deltaSeconds, moveX, moveZ, jumpInputState);
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
    renderLayer.cameraRig.queueLookInput(
      input.pointerDeltaX,
      input.pointerDeltaY,
    );
    input.endFixedUpdate();
  },
  render: (interpolationAlpha, stats) => {
    const previous = body.previousPosition;
    const current = body.position;

    renderedProbePosition.set(
      THREE.MathUtils.lerp(previous.x, current.x, interpolationAlpha),
      THREE.MathUtils.lerp(previous.y, current.y, interpolationAlpha),
      THREE.MathUtils.lerp(previous.z, current.z, interpolationAlpha),
    );

    testScene.setProbePosition(renderedProbePosition);
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

      testPanel.setRuntimeDiagnostics(
        [
          `fixed step: ${(stats.fixedDeltaSeconds * 1000).toFixed(2)} ms`,
          `render FPS: ${stats.renderFps.toFixed(1)}`,
          `steps this frame: ${stats.stepsThisFrame}`,
          `pointer lock: ${input.pointerLocked ? 'locked' : 'unlocked'}`,
          `held actions: ${heldActions}`,
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
          `camera distance: ${cameraStats.currentDistanceMetres.toFixed(2)} / ${cameraStats.desiredDistanceMetres.toFixed(2)} m`,
          `camera obstruction: ${cameraStats.obstructed ? cameraStats.obstructionName : 'none'}`,
          `camera position: ${cameraPosition.x.toFixed(2)}, ${cameraPosition.y.toFixed(2)}, ${cameraPosition.z.toFixed(2)} m`,
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
  collisionWorld.clear();
  surfaceRegistry.clear();
  testPanel.dispose();
  puzzleTestRig.dispose();
  testScene.dispose();
  renderLayer.dispose();
};

if (import.meta.hot) {
  import.meta.hot.dispose(shutdown);
}
