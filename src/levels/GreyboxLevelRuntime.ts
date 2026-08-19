import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import type { Input } from '../core/Input.ts';
import type { LoopStats } from '../core/Loop.ts';
import { GreyboxTestPanel } from '../debug/GreyboxTestPanel.ts';
import { runWallJumpBasisRegression } from '../debug/WallJumpBasisRegression.ts';
import { CollisionWorld } from '../physics/CollisionWorld.ts';
import {
  DEFAULT_KINEMATIC_BODY_CONFIG,
  KinematicBody,
  type JumpInputState,
} from '../physics/KinematicBody.ts';
import type { MovementEvents } from '../physics/MovementEvents.ts';
import { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import type { WallJumpIntent } from '../physics/WallJumpBasis.ts';
import { BlobFacing } from '../render/BlobFacing.ts';
import type { RenderLayer } from '../render/RenderLayer.ts';
import type { SlimeVisualState } from '../render/slime/SlimeVisual.ts';
import { ContainmentTeachingScene } from './ContainmentTeachingScene.ts';
import {
  LevelLifecycle,
  type LevelLifecycleState,
} from './LevelLifecycle.ts';

const LEVEL_ID = 'containment-teaching-level-1';
const DEBUG_TOGGLE_CODE = 'F2';
const SLOPE_REGRESSION_DURATION_SECONDS = 10;
const SLOPE_REGRESSION_FIXED_DELTA_SECONDS = 1 / 60;
const SLOPE_REGRESSION_MAX_TANGENT_DRIFT_METRES = 0.02;

export interface GreyboxLevelRuntimeOptions {
  host: HTMLElement;
  input: Input;
  renderLayer: RenderLayer;
  window?: Window;
  debugAvailable?: boolean;
}

interface GreyboxRuntimeResources {
  readonly testScene: ContainmentTeachingScene;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly movementEvents: EventBus<MovementEvents>;
  readonly spawnPosition: THREE.Vector3;
  readonly outOfBoundsTestPosition: THREE.Vector3;
  readonly renderedProbePosition: THREE.Vector3;
  readonly cameraRelativeMovement: THREE.Vector3;
  readonly noMovement: THREE.Vector3;
  readonly blobFacing: BlobFacing;
  readonly body: KinematicBody;
  readonly slimeVisualState: SlimeVisualState;
  readonly jumpInputState: JumpInputState;
  readonly wallJumpIntent: WallJumpIntent;
  readonly unsubscribeLanding: () => void;
  readonly unsubscribeJumped: () => void;
  readonly testPanel: GreyboxTestPanel | undefined;
}

/** Concrete lifecycle and resource owner for the current Level 1 teaching grey-box. */
export class GreyboxLevelRuntime {
  private readonly host: HTMLElement;
  private readonly input: Input;
  private readonly renderLayer: RenderLayer;
  private readonly hostWindow: Window;
  private readonly debugAvailable: boolean;
  private readonly lifecycle: LevelLifecycle;

  private resources: GreyboxRuntimeResources | undefined;
  private landingEventCount = 0;
  private lastLandingImpactSpeedMetresPerSecond = 0;
  private debugSampleElapsedSeconds = 0;
  private debugVisible = false;
  private slopeRegressionStatus = 'not run';
  private readonly wallJumpBasisRegressionStatus =
    runWallJumpBasisRegression();

  constructor(options: GreyboxLevelRuntimeOptions) {
    this.host = options.host;
    this.input = options.input;
    this.renderLayer = options.renderLayer;
    this.hostWindow = options.window ?? window;
    this.debugAvailable = options.debugAvailable ?? import.meta.env.DEV;
    this.lifecycle = new LevelLifecycle({
      load: this.loadResources,
      start: this.startResources,
      stop: this.stopResources,
      restart: this.restartResources,
      unload: this.unloadResources,
    });
  }

  get state(): LevelLifecycleState {
    return this.lifecycle.state;
  }

  get restartCount(): number {
    return this.lifecycle.restartCount;
  }

  load(): void {
    this.lifecycle.load();
  }

  start(): void {
    this.lifecycle.start();
  }

  stop(): void {
    this.lifecycle.stop();
  }

  /** The one authoritative player-facing restart operation. */
  restartLevel(): void {
    this.lifecycle.restartLevel();
  }

  unload(): void {
    this.lifecycle.unload();
  }

  dispose(): void {
    this.lifecycle.dispose();
  }

  fixedUpdate(deltaSeconds: number): void {
    if (this.lifecycle.state !== 'running') return;
    const resources = this.requireResources();
    const {
      body,
      cameraRelativeMovement,
      jumpInputState,
      slimeVisualState,
      testPanel,
      testScene,
      wallJumpIntent,
    } = resources;

    if (this.debugAvailable && this.input.wasPressed('debugReset')) {
      this.restartLevel();
      return;
    }
    if (
      this.debugAvailable &&
      testPanel &&
      this.input.wasPressed('debugTestRecovery')
    ) {
      testPanel.testRecovery();
    }

    const moveX =
      (this.input.isDown('moveRight') ? 1 : 0) -
      (this.input.isDown('moveLeft') ? 1 : 0);
    const moveZ =
      (this.input.isDown('moveBackward') ? 1 : 0) -
      (this.input.isDown('moveForward') ? 1 : 0);

    this.renderLayer.cameraRig.queueLookInput(
      this.input.pointerDeltaX,
      this.input.pointerDeltaY,
    );
    this.renderLayer.cameraRig.applyQueuedLookInput();

    if (body.attached) {
      this.renderLayer.cameraRig.copySurfaceMovementDirection(
        moveX,
        moveZ,
        body.gameplayUp,
        cameraRelativeMovement,
      );
    } else {
      this.renderLayer.cameraRig.copyGroundMovementDirection(
        moveX,
        moveZ,
        cameraRelativeMovement,
      );
    }

    jumpInputState.pressed = this.input.wasPressed('jump');
    jumpInputState.held = this.input.isDown('jump');
    jumpInputState.released = this.input.wasReleased('jump');
    wallJumpIntent.lateral = moveX;
    wallJumpIntent.vertical = -moveZ;

    body.update(
      deltaSeconds,
      cameraRelativeMovement,
      jumpInputState,
      wallJumpIntent,
    );
    resources.blobFacing.update(deltaSeconds, body.velocity, !body.attached);
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
    this.input.endFixedUpdate();
  }

  render(interpolationAlpha: number, stats: Readonly<LoopStats>): void {
    const resources = this.resources;
    if (!resources) {
      this.renderLayer.render();
      return;
    }

    const { body, blobFacing, renderedProbePosition, testScene } = resources;
    const previous = body.previousPosition;
    const current = body.position;
    renderedProbePosition.set(
      THREE.MathUtils.lerp(previous.x, current.x, interpolationAlpha),
      THREE.MathUtils.lerp(previous.y, current.y, interpolationAlpha),
      THREE.MathUtils.lerp(previous.z, current.z, interpolationAlpha),
    );

    testScene.setProbePosition(renderedProbePosition);
    testScene.setProbeYaw(blobFacing.getInterpolatedYaw(interpolationAlpha));
    testScene.presentProbe();
    this.renderLayer.cameraRig.queueLookInput(
      this.input.pointerDeltaX,
      this.input.pointerDeltaY,
    );
    this.input.endPointerUpdate();
    this.renderLayer.cameraRig.update(
      interpolationAlpha,
      stats.frameDeltaSeconds,
    );
    this.renderLayer.render();

    this.debugSampleElapsedSeconds += stats.rawFrameDeltaSeconds;
    if (
      this.debugVisible &&
      resources.testPanel &&
      this.debugSampleElapsedSeconds >= 0.25
    ) {
      this.debugSampleElapsedSeconds = 0;
      this.updateDiagnostics(resources.testPanel, resources, stats);
    }
  }

  private readonly loadResources = (): void => {
    const testScene = new ContainmentTeachingScene();
    this.renderLayer.scene.add(testScene.root);

    const collisionWorld = new CollisionWorld();
    collisionWorld.registerAll(testScene.collisionMeshes);
    const surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.registerAll(testScene.collisionMeshes);
    const movementEvents = new EventBus<MovementEvents>();
    const spawnPosition = testScene.copySpawnPosition(new THREE.Vector3());
    const outOfBoundsTestPosition = testScene.copyOutOfBoundsTestPosition(
      new THREE.Vector3(),
    );
    const blobFacing = new BlobFacing();
    const body = new KinematicBody({
      world: collisionWorld,
      surfaces: surfaceRegistry,
      initialPosition: spawnPosition,
      events: movementEvents,
    });
    this.renderLayer.cameraRig.setFollowTarget(body, collisionWorld);

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
      this.landingEventCount += 1;
      this.lastLandingImpactSpeedMetresPerSecond =
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

    const testPanel = this.debugAvailable
      ? new GreyboxTestPanel({
          onReset: () => this.restartLevel(),
          onTestRecovery: (onRecovered) => {
            body.teleport(outOfBoundsTestPosition);
            testScene.simulateFall(() => {
              body.teleport(spawnPosition);
              onRecovered();
            });
          },
          onRunSlopeIdleRegression: this.runSlopeIdleRegression,
        })
      : undefined;

    if (testPanel) {
      this.host.append(testPanel.element);
      this.setDebugVisible(false, testPanel);
      this.hostWindow.addEventListener('keydown', this.onDebugToggle);
    }

    this.resources = {
      testScene,
      collisionWorld,
      surfaceRegistry,
      movementEvents,
      spawnPosition,
      outOfBoundsTestPosition,
      renderedProbePosition: new THREE.Vector3(),
      cameraRelativeMovement: new THREE.Vector3(),
      noMovement: new THREE.Vector3(),
      blobFacing,
      body,
      slimeVisualState,
      jumpInputState: { pressed: false, held: false, released: false },
      wallJumpIntent: { lateral: 0, vertical: 0 },
      unsubscribeLanding,
      unsubscribeJumped,
      testPanel,
    };
  };

  private readonly startResources = (): void => {
    this.input.resetState();
  };

  private readonly stopResources = (): void => {
    this.input.resetState();
  };

  private readonly restartResources = (): void => {
    const resources = this.requireResources();
    this.input.resetState();
    resources.body.teleport(resources.spawnPosition);
    resources.testScene.resetProbe();
    resources.blobFacing.reset();
    this.renderLayer.cameraRig.reset();
    resources.jumpInputState.pressed = false;
    resources.jumpInputState.held = false;
    resources.jumpInputState.released = false;
    resources.wallJumpIntent.lateral = 0;
    resources.wallJumpIntent.vertical = 0;

    this.landingEventCount = 0;
    this.lastLandingImpactSpeedMetresPerSecond = 0;
    this.debugSampleElapsedSeconds = 0;
    this.slopeRegressionStatus = 'not run';
  };

  private readonly unloadResources = (): void => {
    const resources = this.requireResources();
    this.hostWindow.removeEventListener('keydown', this.onDebugToggle);
    resources.testPanel?.dispose();
    resources.testPanel?.element.remove();
    resources.unsubscribeLanding();
    resources.unsubscribeJumped();
    resources.movementEvents.clear();
    resources.testScene.dispose();
    resources.collisionWorld.clear();
    resources.surfaceRegistry.clear();
    this.renderLayer.cameraRig.clearFollowTarget();
    this.input.resetState();
    this.input.releasePointerLock();
    this.resources = undefined;
    this.debugVisible = false;
    this.debugSampleElapsedSeconds = 0;
    this.landingEventCount = 0;
    this.lastLandingImpactSpeedMetresPerSecond = 0;
  };

  private readonly runSlopeIdleRegression = (): string => {
    const resources = this.requireResources();
    const stickyRoute = resources.testScene.collisionMeshes.find(
      (mesh) => mesh.name === 'room-1-vent-sticky-entry-wall',
    );
    if (stickyRoute) {
      const stickyTag = resources.surfaceRegistry.get(stickyRoute).tag;
      const passed = stickyTag === 'sticky';
      this.slopeRegressionStatus = passed
        ? 'PASS — Room 1 sticky route is authored; slime rebound is controller-owned'
        : `FAIL — sticky route tag is ${stickyTag}`;
      return this.slopeRegressionStatus;
    }

    const slopeMesh = resources.testScene.collisionMeshes.find(
      (mesh) => mesh.name === 'case-slope-15-degrees',
    );
    if (!slopeMesh) {
      this.slopeRegressionStatus = 'FAIL — authored 15° slope not found';
      return this.slopeRegressionStatus;
    }

    slopeMesh.updateWorldMatrix(true, false);
    slopeMesh.geometry.computeBoundingBox();
    const bounds = slopeMesh.geometry.boundingBox;
    if (!bounds) {
      this.slopeRegressionStatus = 'FAIL — slope bounds unavailable';
      return this.slopeRegressionStatus;
    }

    const surfacePoint = new THREE.Vector3(
      (bounds.min.x + bounds.max.x) * 0.5,
      bounds.max.y,
      (bounds.min.z + bounds.max.z) * 0.5,
    ).applyMatrix4(slopeMesh.matrixWorld);
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
      world: resources.collisionWorld,
      surfaces: resources.surfaceRegistry,
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
        resources.noMovement,
      );
      if (!regressionBody.grounded) ungroundedSteps += 1;
    }

    const tangentDrift = new THREE.Vector3(
      regressionBody.position.x,
      regressionBody.position.y,
      regressionBody.position.z,
    )
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
    this.slopeRegressionStatus = [
      passed ? 'PASS' : 'FAIL',
      `${SLOPE_REGRESSION_DURATION_SECONDS.toFixed(0)} s`,
      `drift ${tangentDrift.toFixed(4)} m`,
      `speed ${finalSpeed.toFixed(4)} m/s`,
      `ungrounded steps ${ungroundedSteps}`,
    ].join(' — ');
    return this.slopeRegressionStatus;
  };

  private updateDiagnostics(
    testPanel: GreyboxTestPanel,
    resources: GreyboxRuntimeResources,
    stats: Readonly<LoopStats>,
  ): void {
    const {
      body,
      blobFacing,
      collisionWorld,
      surfaceRegistry,
      testScene,
    } = resources;
    const heldActions = Array.from(this.input.held).join(', ') || 'none';
    const position = body.position;
    const velocity = body.velocity;
    const groundNormal = body.groundNormal;
    const renderStats = this.renderLayer.getDiagnostics();
    const slimeDiagnostics = testScene.slimeDiagnostics;
    const cameraStats = this.renderLayer.cameraRig.getDiagnostics();
    const cameraPosition = this.renderLayer.cameraRig.camera.position;

    testPanel.setRuntimeDiagnostics(
      [
        `active level: ${LEVEL_ID}`,
        `lifecycle state / restarts: ${this.lifecycle.state} / ${this.lifecycle.restartCount}`,
        `debug overlay: visible (${DEBUG_TOGGLE_CODE} toggles)`,
        `fixed step: ${(stats.fixedDeltaSeconds * 1000).toFixed(2)} ms`,
        `render frame / FPS: ${(stats.rawFrameDeltaSeconds * 1000).toFixed(2)} ms / ${stats.renderFps.toFixed(1)}`,
        `steps this frame: ${stats.stepsThisFrame}`,
        `pointer lock: ${this.input.pointerLocked ? 'locked' : 'unlocked'}`,
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
        `last jump direction: ${body.lastJumpDirection.x.toFixed(2)}, ${body.lastJumpDirection.y.toFixed(2)}, ${body.lastJumpDirection.z.toFixed(2)}`,
        `landing this step: ${body.landedThisStep ? 'yes' : 'no'}`,
        `last landing impact / count: ${this.lastLandingImpactSpeedMetresPerSecond.toFixed(2)} m/s / ${this.landingEventCount}`,
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
        `camera pitch: ${THREE.MathUtils.radToDeg(cameraStats.pitchRadians).toFixed(1)}°`,
        `blob facing: ${THREE.MathUtils.radToDeg(blobFacing.yawRadians).toFixed(1)}°`,
        `teaching-surface regression: ${this.slopeRegressionStatus}`,
        `wall jump basis regression: ${this.wallJumpBasisRegressionStatus}`,
        `viewport: ${renderStats.viewportWidth} × ${renderStats.viewportHeight} CSS px`,
        `drawing buffer: ${renderStats.drawingBufferWidth} × ${renderStats.drawingBufferHeight} px (${renderStats.pixelRatio.toFixed(2)}× DPR)`,
        `draw calls / triangles: ${renderStats.drawCalls} / ${renderStats.triangles}`,
        `GPU geometries / textures: ${renderStats.geometries} / ${renderStats.textures}`,
      ].join('\n'),
    );
  }

  private readonly onDebugToggle = (event: KeyboardEvent): void => {
    if (event.code !== DEBUG_TOGGLE_CODE || event.repeat) return;
    event.preventDefault();
    const testPanel = this.resources?.testPanel;
    if (!testPanel) return;
    this.setDebugVisible(!this.debugVisible, testPanel);
  };

  private setDebugVisible(
    visible: boolean,
    testPanel: GreyboxTestPanel,
  ): void {
    this.debugVisible = visible;
    testPanel.element.hidden = !visible;
    testPanel.element.inert = !visible;
    if (visible) {
      testPanel.element.removeAttribute('aria-hidden');
    } else {
      testPanel.element.setAttribute('aria-hidden', 'true');
    }
  }

  private requireResources(): GreyboxRuntimeResources {
    if (!this.resources) {
      throw new Error('Teaching level resources are not loaded.');
    }
    return this.resources;
  }
}
