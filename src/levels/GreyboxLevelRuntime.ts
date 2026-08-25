import * as THREE from 'three';

import {
  createAuthoredDissolveTarget,
  type DissolveTarget,
} from '../abilities/DissolveTarget.ts';
import { AcidProjectileSystem } from '../abilities/AcidProjectileSystem.ts';
import { DissolveSystem } from '../abilities/DissolveSystem.ts';
import { EventBus } from '../core/EventBus.ts';
import type { Input, InputAction } from '../core/Input.ts';
import type { LoopStats } from '../core/Loop.ts';
import {
  writePerformancePosition,
  type PerformanceGameplaySnapshot,
} from '../core/PerformanceSnapshot.ts';
import {
  beginDebugPanelInspection,
  finishDebugPanelInspection,
  handleDebugPanelScrollKey,
  type DebugPanelInspectionState,
} from '../debug/DebugPanelInteraction.ts';
import {
  GreyboxTestPanel,
  type DebugRoomId,
} from '../debug/GreyboxTestPanel.ts';
import { runDissolveRegression } from '../debug/DissolveRegression.ts';
import { runSlimeManagerRegression } from '../debug/SlimeManagerRegression.ts';
import { runTwoBodySwitchingRegression } from '../debug/TwoBodySwitchingRegression.ts';
import {
  ColliderTransformMode,
  CollisionLayer,
  CollisionWorld,
} from '../physics/CollisionWorld.ts';
import {
  DEFAULT_KINEMATIC_BODY_CONFIG,
  KinematicBody,
  type JumpInputState,
} from '../physics/KinematicBody.ts';
import type { MovementEvents } from '../physics/MovementEvents.ts';
import { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import { BoxTriggerSensor } from '../puzzle/BoxTriggerSensor.ts';
import { PressurePlate } from '../puzzle/PressurePlate.ts';
import { PuzzleRegistry } from '../puzzle/PuzzleRegistry.ts';
import { BlobFacing } from '../render/BlobFacing.ts';
import { GoopAcidPresentation } from '../render/acid/GoopAcidPresentation.ts';
import { resolveCameraTargetOpacity } from '../render/CameraMath.ts';
import type { RenderLayer } from '../render/RenderLayer.ts';
import { ContainmentCollisionOverlay } from '../render/environment/containment/ContainmentCollisionOverlay.ts';
import type {
  BobHatchLightingState,
  GoopReleaseLightingState,
} from '../render/environment/containment/ContainmentLightingRig.ts';
import type { SlimeVisualState } from '../render/slime/SlimeVisual.ts';
import { SlimeManager } from '../slimes/SlimeManager.ts';
import { PersistentSlimePair } from '../slimes/PersistentSlimePair.ts';
import { SlimePairPresentation } from '../slimes/SlimePairPresentation.ts';
import {
  EMPTY_SLIME_HUD_SNAPSHOT,
  type SlimeHUDListener,
  type SlimeHUDSnapshot,
  type SlimePassiveInteraction,
  type SlimePlayerSwitchFeedback,
} from '../slimes/SlimeHUDState.ts';
import {
  DeathSequence,
  type DeathRecoveryAction,
} from '../systems/DeathSequence.ts';
import { DeathScreen } from '../ui/DeathScreen.ts';
import {
  ContainmentLevelController,
} from './ContainmentLevelController.ts';
import {
  ContainmentLevelScene,
  type ContainmentHazardFailure,
} from './ContainmentLevelScene.ts';
import {
  LevelLifecycle,
  type LevelLifecycleState,
} from './LevelLifecycle.ts';
import type { GameLevelRuntimeEvents } from './GameLevelRuntime.ts';
import type {
  LevelProgressionSnapshot,
  PlayableSlimeId,
} from './LevelProgression.ts';

const LEVEL_ID = 'containment-teaching-level-1';
const DEBUG_TOGGLE_CODE = 'F2';
const PLAYER_OUT_OF_BOUNDS_Y_METRES = -4;
const SLOPE_REGRESSION_DURATION_SECONDS = 10;
const SLOPE_REGRESSION_FIXED_DELTA_SECONDS = 1 / 60;
const SLOPE_REGRESSION_MAX_TANGENT_DRIFT_METRES = 0.02;
const ROOM_ONE_INITIAL_CAMERA_YAW_RADIANS = Math.PI;
const VENT_CAMERA_DISTANCE_SCALE = 0.55;
const CAMERA_FADE_START_DISTANCE_METRES = 1.35;
const CAMERA_FADE_END_DISTANCE_METRES = 0.55;
const CAMERA_MINIMUM_TARGET_OPACITY = 0.25;
const DEBUG_ROOM_TELEPORT_ACTIONS: ReadonlyArray<
  readonly [InputAction, DebugRoomId]
> = [
  ['debugTeleportRoomOne', 1],
  ['debugTeleportRoomTwo', 2],
  ['debugTeleportRoomThree', 3],
  ['debugTeleportRoomFour', 4],
  ['debugTeleportRoomFive', 5],
];
const GOOP_SPAWN_OFFSET_X_METRES = 2;
const TWO_BODY_PLATE_POSITION = new THREE.Vector3(3.1, 0, -2.6);
const TWO_BODY_PLATE_SIZE = new THREE.Vector3(1.8, 0.18, 1.8);
const TWO_BODY_SENSOR_CENTRE = new THREE.Vector3(3.1, 0.45, -2.6);
const TWO_BODY_SENSOR_SIZE = new THREE.Vector3(2, 1, 2);
const DISSOLVE_PUZZLE_GROUP_ID = 'containment-goop-dissolve-demo';
const BOB_HATCH_LIGHTING_PREVIEW_STATES: readonly BobHatchLightingState[] = [
  'gameplay',
  'establishing',
  'emergence',
  'impact',
  'complete',
];
const GOOP_RELEASE_LIGHTING_PREVIEW_STATES: readonly GoopReleaseLightingState[] = [
  'normal',
  'warning',
  'locks-disengaging',
  'opening',
  'reveal',
  'released',
];
const LIGHTING_PREWARM_CAMERA_TARGETS: Readonly<
  Record<DebugRoomId, readonly [number, number, number]>
> = {
  1: [-0.21, 0.8, -2.6],
  2: [-9, 1.2, 31],
  3: [0, 10.86, 51.4],
  4: [9, 30.21, 85.5],
  5: [9, 75.21, 94],
};

export interface GreyboxLevelRuntimeOptions {
  host: HTMLElement;
  input: Input;
  renderLayer: RenderLayer;
  window?: Window;
  debugAvailable?: boolean;
}

interface GreyboxRuntimeResources {
  readonly testScene: ContainmentLevelScene;
  readonly containmentLevel: ContainmentLevelController;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly movementEvents: EventBus<MovementEvents>;
  readonly spawnPosition: THREE.Vector3;
  readonly goopSpawnPosition: THREE.Vector3;
  readonly outOfBoundsTestPosition: THREE.Vector3;
  readonly renderedProbePosition: THREE.Vector3;
  readonly renderedGoopPosition: THREE.Vector3;
  readonly cameraRelativeMovement: THREE.Vector3;
  readonly noMovement: THREE.Vector3;
  readonly blobFacing: BlobFacing;
  readonly body: KinematicBody;
  readonly goopBody: KinematicBody;
  readonly slimeManager: SlimeManager<KinematicBody>;
  readonly slimePair: PersistentSlimePair<KinematicBody>;
  readonly slimePairPresentation: SlimePairPresentation;
  readonly pressurePlate: PressurePlate;
  readonly pressurePlateSensor: BoxTriggerSensor;
  readonly puzzleRegistry: PuzzleRegistry;
  readonly dissolveTargets: readonly DissolveTarget[];
  readonly dissolveSystem: DissolveSystem;
  readonly acidProjectileSystem: AcidProjectileSystem<KinematicBody>;
  readonly collisionOverlay: ContainmentCollisionOverlay | undefined;
  readonly goopAcidPresentation: GoopAcidPresentation;
  readonly pressurePlateOccupants: readonly [
    {
      readonly id: 'bob';
      readonly position: KinematicBody['position'];
      readonly radiusMetres: number;
    },
    {
      readonly id: 'goop';
      readonly position: KinematicBody['position'];
      readonly radiusMetres: number;
    },
  ];
  readonly deathSequence: DeathSequence;
  readonly deathScreen: DeathScreen;
  readonly slimeVisualState: SlimeVisualState;
  readonly jumpInputState: JumpInputState;
  readonly unsubscribeLanding: () => void;
  readonly unsubscribeJumped: () => void;
  unsubscribePressureOccupancy: () => void;
  unsubscribeSlimeRoster: readonly (() => void)[];
  readonly unsubscribeObjectiveChanged: () => void;
  readonly unsubscribeLevelCompleted: () => void;
  readonly testPanel: GreyboxTestPanel | undefined;
}

interface LightingTransitionProfile {
  readonly roomId: DebugRoomId;
  readonly visit: number;
  readonly firstVisit: boolean;
  readonly frameIntervalBeforeMs: number;
  nextFrameIntervalMs?: number;
  readonly renderDurationMs: number;
  readonly programsBefore: number;
  readonly programsAfter: number;
  readonly pointLights: number;
  readonly spotLights: number;
  readonly directionalLights: number;
  readonly hemisphereLights: number;
}

interface LightingPrewarmStepProfile {
  readonly roomId: DebugRoomId;
  readonly compiledObjects: number;
  readonly durationMs: number;
  readonly compileDurationMs: number;
  readonly primeDurationMs: number;
  readonly programsBefore: number;
  readonly programsAfterCompile: number;
  readonly programsAfter: number;
  readonly pointLights: number;
  readonly spotLights: number;
  readonly directionalLights: number;
  readonly hemisphereLights: number;
}

interface LightingPrewarmProfile {
  readonly durationMs: number;
  readonly programsBefore: number;
  readonly programsAfter: number;
  readonly steps: readonly LightingPrewarmStepProfile[];
}

/** Concrete lifecycle and resource owner for the current Level 1 teaching grey-box. */
export class GreyboxLevelRuntime {
  readonly events = new EventBus<GameLevelRuntimeEvents>();

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
  private debugInteractionEnabled = true;
  private debugInspectionState: DebugPanelInspectionState | undefined;
  private slopeRegressionStatus = 'not run';
  private cameraFollowSlimeId: 'bob' | 'goop' | undefined;
  private lastDeathSlimeId: 'bob' | 'goop' | undefined;
  private playerSwitchFeedbackSequence = 0;
  private readonly slimeHUDListeners = new Set<SlimeHUDListener>();
  private readonly lightingRoomVisits = new Map<DebugRoomId, number>();
  private readonly lightingTransitionProfiles: LightingTransitionProfile[] = [];
  private lastRenderedLightingRoomId: DebugRoomId | undefined;
  private pendingLightingTransitionProfile: LightingTransitionProfile | undefined;
  private lightingPrewarmPromise: Promise<void> | undefined;
  private lightingPrewarmProfile: LightingPrewarmProfile | undefined;
  private lightingPrewarmGeneration = 0;
  private cancelLightingPrewarm: (() => void) | undefined;
  private readonly twoBodySwitchingRegressionStatus =
    runTwoBodySwitchingRegression();

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

  subscribeSlimeHUD(listener: SlimeHUDListener): () => void {
    this.slimeHUDListeners.add(listener);
    listener(this.getSlimeHUDSnapshot());
    return () => this.slimeHUDListeners.delete(listener);
  }

  getSlimeHUDSnapshot(): SlimeHUDSnapshot {
    return this.createSlimeHUDSnapshot();
  }

  captureProgressionSnapshot(): LevelProgressionSnapshot {
    const resources = this.requireResources();
    return {
      unlockedSlimeIds: resources.slimeManager.getRosterState()
        .filter((entry) =>
          entry.unlocked && (entry.id === 'bob' || entry.id === 'goop'))
        .map((entry) => entry.id as PlayableSlimeId),
      activeSlimeId: resources.slimePair.activeSlimeId,
    };
  }

  writePerformanceSnapshot(target: PerformanceGameplaySnapshot): void {
    const resources = this.resources;
    target.level = LEVEL_ID;
    target.room = resources?.containmentLevel.activeRoomId ?? 'unloaded';
    target.gameplayState = resources
      ? resources.deathSequence.state === 'playing'
        ? resources.containmentLevel.state
        : resources.deathSequence.state
      : this.lifecycle.state;
    target.cutsceneState =
      resources?.containmentLevel.state === 'completing'
        ? 'containment-ending'
        : 'none';
    target.activeSlime = resources?.slimePair.activeSlimeId ?? 'none';
    writePerformancePosition(
      target.cameraPosition,
      this.renderLayer.cameraRig.camera.position,
    );
    if (!resources) {
      target.bobPosition.fill(0);
      target.goopPosition.fill(0);
      target.collisionRegistered = 0;
      target.collisionEligible = 0;
      target.collisionCandidates = 0;
      target.collisionNarrowChecks = 0;
      return;
    }
    writePerformancePosition(target.bobPosition, resources.body.position);
    writePerformancePosition(target.goopPosition, resources.goopBody.position);
    target.collisionRegistered = resources.collisionWorld.colliderCount;
    target.collisionEligible =
      resources.collisionWorld.lastSweepEligibleColliderCount;
    target.collisionCandidates =
      resources.collisionWorld.lastSweepBroadphaseCandidateCount;
    target.collisionNarrowChecks =
      resources.collisionWorld.lastSweepNarrowPhaseCheckCount;
  }

  private createSlimeHUDSnapshot(
    playerSwitchFeedback?: SlimePlayerSwitchFeedback,
    resetSwitchFeedback = false,
  ): SlimeHUDSnapshot {
    const resources = this.resources;
    if (!resources) return EMPTY_SLIME_HUD_SNAPSHOT;

    const passiveInteractions: SlimePassiveInteraction[] = [];
    for (const occupantId of resources.pressurePlate.trigger.occupants) {
      if (occupantId !== 'bob' && occupantId !== 'goop') continue;
      passiveInteractions.push({
        slimeId: occupantId,
        label: 'pressure plate',
      });
    }

    return {
      roster: resources.slimeManager.getRosterState(),
      activeSlimeId: resources.slimeManager.activeSlimeId,
      passiveInteractions,
      playerSwitchFeedback,
      resetSwitchFeedback,
    };
  }

  load(): void {
    this.lifecycle.load();
  }

  start(): void {
    this.lifecycle.start();
  }

  /** Precompile the four distinct Containment lighting signatures while loading. */
  prepareLightingPrograms(): Promise<void> {
    if (this.lightingPrewarmPromise) return this.lightingPrewarmPromise;
    const resources = this.requireResources();
    const generation = ++this.lightingPrewarmGeneration;
    const promise = this.runLightingPrewarm(resources, generation);
    this.lightingPrewarmPromise = promise;
    return promise;
  }

  stop(): void {
    this.lifecycle.stop();
  }

  /** The one authoritative player-facing restart operation. */
  restartLevel(): void {
    this.lifecycle.restartLevel();
  }

  /** Allow the application flow to suppress level-owned diagnostics behind menus. */
  setDebugInteractionEnabled(enabled: boolean): void {
    this.debugInteractionEnabled = enabled;
    if (!enabled && this.debugVisible) this.closeDebugInspection(false);
    const testPanel = this.resources?.testPanel;
    if (testPanel) this.applyDebugPresentation(testPanel);
  }

  unload(): void {
    this.lifecycle.unload();
  }

  dispose(): void {
    this.lifecycle.dispose();
    this.slimeHUDListeners.clear();
    this.events.clear();
  }

  fixedUpdate(deltaSeconds: number): void {
    if (this.lifecycle.state !== 'running') return;
    const resources = this.requireResources();
    const {
      body,
      goopBody,
      cameraRelativeMovement,
      containmentLevel,
      deathSequence,
      jumpInputState,
      slimeVisualState,
      testPanel,
      testScene,
      slimePair,
    } = resources;

    if (!deathSequence.isPlaying) {
      this.updateDeathState(deltaSeconds, resources);
      return;
    }

    if (containmentLevel.state !== 'playing') {
      containmentLevel.update(deltaSeconds);
      this.input.setEnabled(false);
      this.input.releasePointerLock();
      this.host.dataset.gameState =
        containmentLevel.state === 'complete'
          ? 'level-complete'
          : 'level-completing';
      testScene.update(deltaSeconds, slimeVisualState);
      this.input.endFixedUpdate();
      return;
    }

    if (this.debugAvailable && this.input.wasPressed('debugReset')) {
      this.restartLevel();
      return;
    }
    if (
      this.debugAvailable &&
      testPanel &&
      this.input.wasPressed('debugCompleteLevel')
    ) {
      testPanel.completeLevel();
      this.input.endFixedUpdate();
      return;
    }
    const requestedDebugRoom =
      this.debugAvailable && testPanel
        ? DEBUG_ROOM_TELEPORT_ACTIONS.find(([action]) =>
            this.input.wasPressed(action))?.[1]
        : undefined;
    if (requestedDebugRoom !== undefined && testPanel) {
      testPanel.teleportRoom(requestedDebugRoom);
      this.input.endFixedUpdate();
      return;
    }
    if (
      this.debugAvailable &&
      testPanel &&
      this.input.wasPressed('debugTestRecovery')
    ) {
      testPanel.testRecovery();
    }
    if (!deathSequence.isPlaying) {
      this.updateDeathState(deltaSeconds, resources);
      return;
    }

    let switchedThisStep = false;
    if (this.input.wasPressed('switchSlime')) {
      switchedThisStep = this.switchActiveSlime(resources);
    }

    const moveX =
      (this.input.isDown('moveRight') ? 1 : 0) -
      (this.input.isDown('moveLeft') ? 1 : 0);
    const moveZ =
      (this.input.isDown('moveBackward') ? 1 : 0) -
      (this.input.isDown('moveForward') ? 1 : 0);

    const activeBody = slimePair.activeBody;

    if (!switchedThisStep) {
      this.renderLayer.cameraRig.queueLookInput(
        this.input.pointerDeltaX,
        this.input.pointerDeltaY,
      );
      this.renderLayer.cameraRig.applyQueuedLookInput();

      if (activeBody.usingSurfaceGravity) {
        this.renderLayer.cameraRig.copySurfaceMovementDirection(
          moveX,
          moveZ,
          activeBody.gameplayUp,
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
      jumpInputState.cancelled = this.input.wasClearedSinceFixedUpdate;
    } else {
      cameraRelativeMovement.set(0, 0, 0);
      jumpInputState.pressed = false;
      jumpInputState.held = false;
      jumpInputState.released = false;
      jumpInputState.cancelled = true;
    }

    // Both bodies simulate every fixed step. Exactly one receives player intent;
    // the inactive body still falls, collides, lands, and occupies sensors.
    if (activeBody === body && !switchedThisStep) {
      body.update(deltaSeconds, cameraRelativeMovement, jumpInputState);
      goopBody.update(deltaSeconds, resources.noMovement);
    } else if (activeBody === goopBody && !switchedThisStep) {
      body.update(deltaSeconds, resources.noMovement);
      goopBody.update(deltaSeconds, cameraRelativeMovement, jumpInputState);
    } else {
      body.update(deltaSeconds, resources.noMovement);
      goopBody.update(deltaSeconds, resources.noMovement);
    }

    resources.pressurePlateSensor.update(
      resources.pressurePlate.trigger,
      resources.pressurePlateOccupants,
    );

    if (slimePair.activeBody.position.y < PLAYER_OUT_OF_BOUNDS_Y_METRES) {
      containmentLevel.requestOutOfBoundsFailure();
    }
    if (!deathSequence.isPlaying) {
      this.updateDeathState(deltaSeconds, resources);
      return;
    }

    containmentLevel.setActiveBody(activeBody);
    containmentLevel.update(deltaSeconds);
    this.syncContextualCamera(resources);
    if (!deathSequence.isPlaying) {
      this.updateDeathState(deltaSeconds, resources);
      return;
    }
    if (containmentLevel.state !== 'playing') {
      this.input.setEnabled(false);
      this.input.releasePointerLock();
      this.host.dataset.gameState = 'level-completing';
    }

    resources.acidProjectileSystem.update(deltaSeconds, {
      aimHeld: this.input.isDown('aimAbility'),
      firePressed: this.input.wasPressed('fireAbility'),
      gameplayInputEnabled: this.input.enabled,
      pointerLocked: this.input.pointerLocked,
    });
    resources.dissolveSystem.update(deltaSeconds);
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

    if (this.pendingLightingTransitionProfile) {
      this.pendingLightingTransitionProfile.nextFrameIntervalMs =
        stats.rawFrameDeltaSeconds * 1000;
      this.pendingLightingTransitionProfile = undefined;
    }

    const {
      body,
      goopBody,
      blobFacing,
      deathSequence,
      renderedProbePosition,
      renderedGoopPosition,
      slimePair,
      slimePairPresentation,
      goopAcidPresentation,
      testScene,
    } = resources;
    let cameraDistanceScale = 1;
    if (deathSequence.isPlaying) {
      const previous = body.previousPosition;
      const current = body.position;
      renderedProbePosition.set(
        THREE.MathUtils.lerp(previous.x, current.x, interpolationAlpha),
        THREE.MathUtils.lerp(previous.y, current.y, interpolationAlpha),
        THREE.MathUtils.lerp(previous.z, current.z, interpolationAlpha),
      );

      renderedGoopPosition.set(
        THREE.MathUtils.lerp(
          goopBody.previousPosition.x,
          goopBody.position.x,
          interpolationAlpha,
        ),
        THREE.MathUtils.lerp(
          goopBody.previousPosition.y,
          goopBody.position.y,
          interpolationAlpha,
        ),
        THREE.MathUtils.lerp(
          goopBody.previousPosition.z,
          goopBody.position.z,
          interpolationAlpha,
        ),
      );

      testScene.setProbePosition(renderedProbePosition);
      testScene.setProbeYaw(blobFacing.getInterpolatedYaw(interpolationAlpha));
      testScene.presentProbe();
      const activeRenderedPosition =
        slimePair.activeSlimeId === 'goop'
          ? renderedGoopPosition
          : renderedProbePosition;
      if (testScene.isInsideCameraTightVent(activeRenderedPosition)) {
        cameraDistanceScale = VENT_CAMERA_DISTANCE_SCALE;
      }
      this.renderLayer.cameraRig.queueLookInput(
        this.input.pointerDeltaX,
        this.input.pointerDeltaY,
      );
    }
    this.input.endPointerUpdate();
    const aimPresentationAllowed =
      this.lifecycle.state === 'running' &&
      deathSequence.isPlaying &&
      resources.containmentLevel.state === 'playing' &&
      this.input.enabled;
    goopAcidPresentation.update(
      interpolationAlpha,
      stats.frameDeltaSeconds,
      aimPresentationAllowed,
      this.lifecycle.state === 'running' && deathSequence.isPlaying,
    );
    this.renderLayer.cameraRig.setFollowDistanceScale(cameraDistanceScale);
    this.renderLayer.cameraRig.update(
      interpolationAlpha,
      stats.frameDeltaSeconds,
    );
    if (deathSequence.isPlaying) {
      slimePairPresentation.update(
        renderedProbePosition,
        renderedGoopPosition,
        slimePair.activeSlimeId,
        this.renderLayer.cameraRig.camera,
        resources.collisionWorld,
        this.renderLayer.cameraRig.aimPresentationWeight > 0.01,
        slimePair.bobBody.gameplayUp,
        slimePair.goopBody.gameplayUp,
      );
    }
    const cameraDistanceMetres =
      this.renderLayer.cameraRig.currentFollowDistanceMetres;
    testScene.setProbeOpacity(
      deathSequence.isPlaying && slimePair.activeSlimeId === 'bob'
        ? resolveCameraTargetOpacity(
            cameraDistanceMetres,
            CAMERA_FADE_START_DISTANCE_METRES,
            CAMERA_FADE_END_DISTANCE_METRES,
            CAMERA_MINIMUM_TARGET_OPACITY,
          )
        : 1,
    );
    const lightingRoomId = testScene.lightingDiagnostics.activeRoomId;
    const profileLightingTransition =
      this.debugAvailable &&
      lightingRoomId !== this.lastRenderedLightingRoomId;
    let transitionProgramsBefore = 0;
    let transitionRenderStarted = 0;
    if (profileLightingTransition) {
      transitionProgramsBefore =
        this.renderLayer.renderer.info.programs?.length ?? 0;
      transitionRenderStarted = this.hostWindow.performance.now();
    }

    this.renderLayer.render();

    if (profileLightingTransition) {
      const visit = (this.lightingRoomVisits.get(lightingRoomId) ?? 0) + 1;
      this.lightingRoomVisits.set(lightingRoomId, visit);
      const signature = countVisibleLights(
        this.renderLayer.scene,
        this.renderLayer.cameraRig.camera,
      );
      const profile: LightingTransitionProfile = {
        roomId: lightingRoomId,
        visit,
        firstVisit: visit === 1,
        frameIntervalBeforeMs: stats.rawFrameDeltaSeconds * 1000,
        renderDurationMs:
          this.hostWindow.performance.now() - transitionRenderStarted,
        programsBefore: transitionProgramsBefore,
        programsAfter: this.renderLayer.renderer.info.programs?.length ?? 0,
        ...signature,
      };
      this.lightingTransitionProfiles.push(profile);
      if (this.lightingTransitionProfiles.length > 32) {
        this.lightingTransitionProfiles.shift();
      }
      this.pendingLightingTransitionProfile = profile;
      this.lastRenderedLightingRoomId = lightingRoomId;
    }

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
    let containmentLevel: ContainmentLevelController;
    const testScene = new ContainmentLevelScene(
      (failure: ContainmentHazardFailure) => {
        containmentLevel.requestHazardFailure(failure);
      },
      { includeDevelopmentHelpers: this.debugAvailable },
    );
    this.renderLayer.scene.add(testScene.root);

    const collisionWorld = new CollisionWorld();
    collisionWorld.registerAll(
      testScene.collisionMeshes,
      undefined,
      ColliderTransformMode.Static,
    );
    for (const mesh of testScene.dynamicCollisionMeshes) {
      collisionWorld.setTransformMode(mesh, ColliderTransformMode.Dynamic);
    }
    collisionWorld.registerAll(
      testScene.cameraObstructionMeshes,
      CollisionLayer.CameraObstruction,
      ColliderTransformMode.Static,
    );
    const surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.registerAll(testScene.collisionMeshes);
    const collisionOverlay = this.debugAvailable
      ? new ContainmentCollisionOverlay(testScene.collisionMeshes)
      : undefined;
    const movementEvents = new EventBus<MovementEvents>();
    const puzzleRegistry = new PuzzleRegistry();
    const dissolveTargets = testScene.solubleTargetMeshes
      .map((mesh) =>
        createAuthoredDissolveTarget(
          mesh,
          collisionWorld,
          surfaceRegistry,
        ),
      )
      .filter((target): target is DissolveTarget => target !== undefined);

    if (dissolveTargets.length === 0) {
      throw new Error(
        'Issue #30 development scene has no authored soluble target.',
      );
    }

    for (const target of dissolveTargets) {
      puzzleRegistry.register(
        `dissolve-${target.id}`,
        target,
        DISSOLVE_PUZZLE_GROUP_ID,
      );
    }

    const spawnPosition = testScene.copySpawnPosition(new THREE.Vector3());
    const goopSpawnPosition = spawnPosition
      .clone()
      .add(new THREE.Vector3(GOOP_SPAWN_OFFSET_X_METRES, 0, 0));
    const outOfBoundsTestPosition = testScene.copyOutOfBoundsTestPosition(
      new THREE.Vector3(),
    );
    const blobFacing = new BlobFacing();
    const slimeManager = new SlimeManager<KinematicBody>();
    const bobDefinition = slimeManager.getDefinition('bob');
    const goopDefinition = slimeManager.getDefinition('goop');

    const body = new KinematicBody({
      world: collisionWorld,
      surfaces: surfaceRegistry,
      initialPosition: spawnPosition,
      events: movementEvents,
      config: {
        adhesionEnabled: bobDefinition.abilities.adhesion,
        reboundEnabled: bobDefinition.abilities.rebound,
        chargedJumpEnabled: bobDefinition.jumpMode === 'charged',
      },
    });
    const goopBody = new KinematicBody({
      world: collisionWorld,
      surfaces: surfaceRegistry,
      initialPosition: goopSpawnPosition,
      config: {
        adhesionEnabled: goopDefinition.abilities.adhesion,
        reboundEnabled: goopDefinition.abilities.rebound,
        chargedJumpEnabled: goopDefinition.jumpMode === 'charged',
      },
    });
    const slimePair = new PersistentSlimePair({
      manager: slimeManager,
      bobBody: body,
      goopBody,
      bobSpawnPosition: spawnPosition,
      goopSpawnPosition,
    });
    const persistentBodies = [body, goopBody] as const;
    const dissolveSystem = new DissolveSystem(dissolveTargets);
    const acidProjectileSystem = new AcidProjectileSystem({
      slimeManager,
      collisionWorld,
      dissolveSystem,
      aimRayProvider: this.renderLayer.cameraRig,
    });
    const goopAcidPresentation = new GoopAcidPresentation({
      host: this.host,
      scene: this.renderLayer.scene,
      cameraRig: this.renderLayer.cameraRig,
      source: acidProjectileSystem,
      targets: dissolveTargets,
    });

    const slimePairPresentation = new SlimePairPresentation(body.radiusMetres);
    this.renderLayer.scene.add(slimePairPresentation.root);

    const pressurePlate = new PressurePlate({
      id: 'two-body-persistence-demo',
      position: TWO_BODY_PLATE_POSITION,
      size: TWO_BODY_PLATE_SIZE,
    });
    this.renderLayer.scene.add(pressurePlate.root);
    const pressurePlateSensor = new BoxTriggerSensor(
      TWO_BODY_SENSOR_CENTRE,
      TWO_BODY_SENSOR_SIZE,
    );
    const pressurePlateOccupants = [
      {
        id: 'bob' as const,
        position: body.position,
        radiusMetres: body.radiusMetres,
      },
      {
        id: 'goop' as const,
        position: goopBody.position,
        radiusMetres: goopBody.radiusMetres,
      },
    ] as const;

    this.renderLayer.cameraRig.setFollowTarget(
      slimePair.activeBody,
      collisionWorld,
    );
    this.cameraFollowSlimeId = slimePair.activeSlimeId;
    this.renderLayer.cameraRig.setGroundOrbitYawRadians(
      ROOM_ONE_INITIAL_CAMERA_YAW_RADIANS,
    );
    const deathSequence = new DeathSequence();
    containmentLevel = new ContainmentLevelController({
      scene: testScene,
      body,
      persistentBodies,
      collisionWorld,
      requestDeath: (recovery) => {
        const resources = this.requireResources();
        return this.requestPlayerDeath(
          () => this.restoreCheckpointState(resources, recovery),
          resources,
        );
      },
    });

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
          onTestRecovery: () => {
            slimePair.activeBody.teleport(outOfBoundsTestPosition);
            const resources = this.requireResources();
            this.requestPlayerDeath(
              () =>
                this.restoreCheckpointState(resources, () =>
                  containmentLevel.recoverActiveCheckpoint()),
              resources,
            );
          },
          onCompleteLevel: () => containmentLevel.completeForDebug(),
          onTeleportRoom: (roomId) => {
            containmentLevel.setActiveBody(slimePair.activeBody);
            containmentLevel.teleportToRoomForDebug(roomId);
            blobFacing.reset();
            testScene.setProbePosition(body.position);
            this.syncContextualCamera(this.requireResources());
          },
          onRunSlopeIdleRegression: this.runSlopeIdleRegression,
          onRunSlimeRosterRegression: runSlimeManagerRegression,
          onRunTwoBodySwitchingRegression: runTwoBodySwitchingRegression,
          onRunDissolveRegression: runDissolveRegression,
          onToggleCollisionOverlay: () => {
            if (!collisionOverlay) return false;
            collisionOverlay.setVisible(!collisionOverlay.isVisible);
            return collisionOverlay.isVisible;
          },
          onCycleBobLighting: () => {
            const current = testScene.lightingDiagnostics.bobHatchState;
            const next = nextPreviewState(
              BOB_HATCH_LIGHTING_PREVIEW_STATES,
              current,
            );
            testScene.cutsceneLighting.setBobHatchLightingState(next);
            return next;
          },
          onCycleGoopLighting: () => {
            const current = testScene.lightingDiagnostics.goopReleaseState;
            const next = nextPreviewState(
              GOOP_RELEASE_LIGHTING_PREVIEW_STATES,
              current,
            );
            testScene.cutsceneLighting.setGoopReleaseLightingState(next);
            return next;
          },
          onFinalizeLightingSkip: () => {
            testScene.cutsceneLighting.finalizeBobHatch('skipped');
            testScene.cutsceneLighting.finalizeGoopRelease('skipped');
          },
          onResetLightingPreview: () => {
            testScene.lighting.reset();
            testScene.lighting.setActiveRoom(containmentLevel.activeRoomId);
            testScene.lighting.reconcileAuthoritativeState(true);
          },
        })
      : undefined;

    const deathScreen = new DeathScreen({
      onRetry: this.retryAfterDeath,
      backgroundElements: [
        this.renderLayer.canvas,
        ...(testPanel ? [testPanel.element] : []),
      ],
    });
    const unsubscribeLevelCompleted = containmentLevel.events.on(
      'completed',
      (event) => {
        this.host.dataset.gameState = 'level-complete';
        this.events.emit('completed', event);
      },
    );
    const unsubscribeObjectiveChanged = containmentLevel.events.on(
      'objectiveChanged',
      (event) => this.events.emit('objectiveChanged', event),
    );

    if (testPanel) {
      this.host.append(testPanel.element);
      this.setDebugVisible(false, testPanel);
      this.hostWindow.addEventListener('keydown', this.onDebugToggle);
    }
    this.host.append(deathScreen.element);
    this.host.dataset.gameState = deathSequence.state;

    this.resources = {
      testScene,
      containmentLevel,
      collisionWorld,
      surfaceRegistry,
      movementEvents,
      spawnPosition,
      goopSpawnPosition,
      outOfBoundsTestPosition,
      renderedProbePosition: new THREE.Vector3(),
      renderedGoopPosition: new THREE.Vector3(),
      cameraRelativeMovement: new THREE.Vector3(),
      noMovement: new THREE.Vector3(),
      blobFacing,
      body,
      goopBody,
      slimeManager,
      slimePair,
      slimePairPresentation,
      pressurePlate,
      pressurePlateSensor,
      puzzleRegistry,
      dissolveTargets,
      dissolveSystem,
      collisionOverlay,
      acidProjectileSystem,
      goopAcidPresentation,
      pressurePlateOccupants,
      deathSequence,
      deathScreen,
      slimeVisualState,
      jumpInputState: {
        pressed: false,
        held: false,
        released: false,
        cancelled: false,
      },
      unsubscribeLanding,
      unsubscribeJumped,
      unsubscribePressureOccupancy: () => {},
      unsubscribeSlimeRoster: [],
      unsubscribeObjectiveChanged,
      unsubscribeLevelCompleted,
      testPanel,
    };

    const resources = this.resources;
    resources.unsubscribeSlimeRoster = [
      slimeManager.events.on('unlocked', this.onSlimeRosterChanged),
      slimeManager.events.on('registered', this.onSlimeRosterChanged),
      slimeManager.events.on('unregistered', this.onSlimeRosterChanged),
      slimeManager.events.on('activeChanged', this.onSlimeRosterChanged),
    ];
    resources.unsubscribePressureOccupancy = pressurePlate.trigger.events.on(
      'occupancyChanged',
      this.onSlimeRosterChanged,
    );
    this.notifySlimeHUD();
    this.events.emit('objectiveChanged', {
      roomId: containmentLevel.activeRoomId,
      objective: containmentLevel.currentObjective,
    });
  };

  private readonly startResources = (): void => {
    const resources = this.requireResources();
    resources.goopAcidPresentation.resume();
    this.input.setEnabled(
      !this.debugVisible &&
        resources.deathSequence.isPlaying &&
        resources.containmentLevel.state === 'playing',
    );
    this.input.resetState();
  };

  private readonly stopResources = (): void => {
    const resources = this.requireResources();
    resources.acidProjectileSystem.cancelAim();
    resources.goopAcidPresentation.suspend();
    this.input.setEnabled(false);
  };

  private readonly restartResources = (): void => {
    const resources = this.requireResources();
    this.input.resetState();
    resources.deathSequence.reset();
    resources.deathScreen.hide();
    resources.acidProjectileSystem.reset();
    resources.dissolveSystem.reset();
    resources.goopAcidPresentation.reset();
    resources.containmentLevel.reset();
    resources.puzzleRegistry.reset();
    resources.slimePair.restoreInitialState();
    resources.containmentLevel.setActiveBody(resources.slimePair.activeBody);
    resources.pressurePlate.reset();
    resources.testScene.resetProbe();
    resources.blobFacing.reset();
    this.renderLayer.cameraRig.reset();
    this.retargetCameraToActiveSlime(resources);
    this.syncContextualCamera(resources);
    this.renderLayer.cameraRig.setGroundOrbitYawRadians(
      ROOM_ONE_INITIAL_CAMERA_YAW_RADIANS,
    );
    resources.jumpInputState.pressed = false;
    resources.jumpInputState.held = false;
    resources.jumpInputState.released = false;
    resources.jumpInputState.cancelled = false;

    this.landingEventCount = 0;
    this.lastLandingImpactSpeedMetresPerSecond = 0;
    this.debugSampleElapsedSeconds = 0;
    this.slopeRegressionStatus = 'not run';
    this.host.dataset.gameState = resources.deathSequence.state;
    if (resources.testPanel) {
      resources.testPanel.markProbeAtSpawn();
      this.setDebugVisible(this.debugVisible, resources.testPanel);
    }
    this.notifySlimeHUD(undefined, true);
  };

  private readonly unloadResources = (): void => {
    const resources = this.requireResources();
    this.lightingPrewarmGeneration += 1;
    this.cancelLightingPrewarm?.();
    this.cancelLightingPrewarm = undefined;
    this.lightingPrewarmPromise = undefined;
    this.lightingPrewarmProfile = undefined;
    this.hostWindow.removeEventListener('keydown', this.onDebugToggle);
    resources.deathSequence.reset();
    resources.deathScreen.dispose();
    resources.testPanel?.dispose();
    resources.testPanel?.element.remove();
    resources.unsubscribeLanding();
    resources.unsubscribeJumped();
    resources.unsubscribePressureOccupancy();
    for (const unsubscribe of resources.unsubscribeSlimeRoster) unsubscribe();
    resources.unsubscribeObjectiveChanged();
    resources.unsubscribeLevelCompleted();
    resources.movementEvents.clear();
    resources.containmentLevel.dispose();
    resources.pressurePlate.dispose();
    resources.goopAcidPresentation.dispose();
    resources.acidProjectileSystem.dispose();
    resources.dissolveSystem.dispose();
    for (const target of resources.dissolveTargets) target.dispose();
    resources.collisionOverlay?.dispose();
    resources.puzzleRegistry.clear();
    resources.slimePairPresentation.dispose();
    resources.slimeManager.clearLevelRegistrations();
    resources.slimeManager.dispose();
    resources.testScene.dispose();
    resources.collisionWorld.clear();
    resources.surfaceRegistry.clear();
    this.renderLayer.cameraRig.clearFollowTarget();
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    delete this.host.dataset.gameState;
    this.resources = undefined;
    this.debugVisible = false;
    this.debugInspectionState = undefined;
    this.debugSampleElapsedSeconds = 0;
    this.landingEventCount = 0;
    this.lastLandingImpactSpeedMetresPerSecond = 0;
    this.cameraFollowSlimeId = undefined;
    this.lastDeathSlimeId = undefined;
    this.lightingRoomVisits.clear();
    this.lightingTransitionProfiles.length = 0;
    this.lastRenderedLightingRoomId = undefined;
    this.pendingLightingTransitionProfile = undefined;
    this.notifySlimeHUD();
  };

  /**
   * Current two-body checkpoint recovery seam.
   *
   * Puzzle components restore first, matching CheckpointManager's existing
   * group-reset-before-player-recovery contract. The persistent slime pair then
   * restores both bodies and active ownership.
   */
  private restoreCheckpointState(
    resources: GreyboxRuntimeResources,
    recoverLevelCheckpoint: DeathRecoveryAction,
  ): void {
    resources.acidProjectileSystem.reset();
    resources.dissolveSystem.reset();
    resources.goopAcidPresentation.reset();
    resources.puzzleRegistry.resetGroup(DISSOLVE_PUZZLE_GROUP_ID);
    recoverLevelCheckpoint();
    resources.slimePair.captureCurrentRecoveryState();
    resources.slimePair.restoreRecoveryState();
  }

  /**
   * Safe control transfer boundary. Resetting Input deliberately discards held
   * movement/jump state so neither the old nor new body inherits stale intent.
   * CameraRig re-initializes its presentation against the new read-only target.
   */
  private switchActiveSlime(resources: GreyboxRuntimeResources): boolean {
    const previousSlimeId = resources.slimePair.activeSlimeId;
    if (!resources.slimePair.switchActive()) return false;

    resources.acidProjectileSystem.cancelAim();
    this.input.resetState();
    resources.jumpInputState.pressed = false;
    resources.jumpInputState.held = false;
    resources.jumpInputState.released = false;
    resources.jumpInputState.cancelled = true;
    resources.cameraRelativeMovement.set(0, 0, 0);

    resources.containmentLevel.setActiveBody(resources.slimePair.activeBody);
    this.retargetCameraToActiveSlime(resources);
    this.playerSwitchFeedbackSequence += 1;
    this.notifySlimeHUD({
      sequence: this.playerSwitchFeedbackSequence,
      previousSlimeId,
      activeSlimeId: resources.slimePair.activeSlimeId,
    });
    return true;
  }

  private readonly onSlimeRosterChanged = (): void => {
    this.notifySlimeHUD();
  };

  private notifySlimeHUD(
    playerSwitchFeedback?: SlimePlayerSwitchFeedback,
    resetSwitchFeedback = false,
  ): void {
    const snapshot = this.createSlimeHUDSnapshot(
      playerSwitchFeedback,
      resetSwitchFeedback,
    );
    for (const listener of this.slimeHUDListeners) listener(snapshot);
  }

  private retargetCameraToActiveSlime(
    resources: GreyboxRuntimeResources,
  ): void {
    this.renderLayer.cameraRig.setFollowTarget(
      resources.slimePair.activeBody,
      resources.collisionWorld,
    );
    this.cameraFollowSlimeId = resources.slimePair.activeSlimeId;
  }

  private syncContextualCamera(resources: GreyboxRuntimeResources): void {
    this.renderLayer.cameraRig.setContextualCamera(
      resources.testScene.roomFour.resolveLiftCamera(
        resources.slimePair.activeBody,
      ),
    );
  }

  private requestPlayerDeath(
    recovery: DeathRecoveryAction,
    resources: GreyboxRuntimeResources,
  ): boolean {
    const dyingSlimeId = resources.slimePair.activeSlimeId;
    const dyingBody = resources.slimePair.activeBody;

    if (!resources.deathSequence.requestDeath(recovery)) return false;
    if (!resources.testScene.startDeath(dyingBody.position)) {
      resources.deathSequence.reset();
      return false;
    }

    this.lastDeathSlimeId = dyingSlimeId;

    resources.acidProjectileSystem.cancelAim();
    resources.goopAcidPresentation.suspend();
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.host.dataset.gameState = resources.deathSequence.state;
    return true;
  }

  private readonly retryAfterDeath = (): void => {
    const resources = this.requireResources();
    if (!resources.deathSequence.canRetry) return;
    if (!resources.deathSequence.completeRetry()) return;

    // completeRetry() executes the retained two-body recovery action, which can
    // restore a different active slime than the one that died. Camera ownership
    // must follow that restored active identity before gameplay resumes.
    this.retargetCameraToActiveSlime(resources);
    this.syncContextualCamera(resources);
    resources.goopAcidPresentation.resume();
    this.notifySlimeHUD(undefined, true);

    // The teaching scene owns Bob's legacy visual; the two-body presentation
    // owns Goop. Restore that scene-owned visual to Bob's authoritative body.
    resources.testScene.finishDeath(resources.body.position);
    resources.deathScreen.hide();
    const levelIsPlaying =
      !this.debugVisible && resources.containmentLevel.state === 'playing';
    this.input.setEnabled(levelIsPlaying);
    if (levelIsPlaying) this.input.requestPointerLock();
    this.host.dataset.gameState = resources.deathSequence.state;
    if (resources.testPanel) {
      this.setDebugVisible(this.debugVisible, resources.testPanel);
    }
  };

  private updateDeathState(
    deltaSeconds: number,
    resources: GreyboxRuntimeResources,
  ): void {
    resources.testScene.updateDeath(deltaSeconds);
    if (resources.deathSequence.update(deltaSeconds)) {
      resources.deathScreen.show();
    }
    this.host.dataset.gameState = resources.deathSequence.state;
    this.input.endFixedUpdate();
  }

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
      goopBody,
      blobFacing,
      collisionWorld,
      containmentLevel,
      deathSequence,
      surfaceRegistry,
      testScene,
      slimeManager,
      slimePair,
      pressurePlate,
      dissolveSystem,
      acidProjectileSystem,
      goopAcidPresentation,
      dissolveTargets,
      collisionOverlay,
    } = resources;
    const heldActions = Array.from(this.input.held).join(', ') || 'none';
    const activeBody = slimePair.activeBody;
    const position = activeBody.position;
    const velocity = activeBody.velocity;
    const groundNormal = activeBody.groundNormal;
    const renderStats = this.renderLayer.getDiagnostics();
    const slimeDiagnostics = testScene.slimeDiagnostics;
    const cameraStats = this.renderLayer.cameraRig.getDiagnostics();
    const deathStats = deathSequence.diagnostics;
    const burstStats = testScene.deathBurstDiagnostics;
    const slimeManagerStats = slimeManager.getDiagnostics();
    const slimeRoster = slimeManager.getRosterState();
    const bobDefinition = slimeManager.getDefinition('bob');
    const goopDefinition = slimeManager.getDefinition('goop');
    const voltDefinition = slimeManager.getDefinition('volt');
    const dissolveStats = dissolveSystem.getDiagnostics();
    const acidStats = acidProjectileSystem.getDiagnostics();
    const acidPresentationStats = goopAcidPresentation.getDiagnostics();
    const primaryDissolveTarget = dissolveTargets[0];

    testPanel.setRuntimeDiagnostics(
      [
        `active level: ${LEVEL_ID}`,
        `lifecycle state / restarts: ${this.lifecycle.state} / ${this.lifecycle.restartCount}`,
        `debug panel: visible (${DEBUG_TOGGLE_CODE} toggles)`,
        `collision overlay: ${collisionOverlay ? (collisionOverlay.isVisible ? 'visible' : 'hidden') : 'unavailable'}`,
        `fixed step: ${(stats.fixedDeltaSeconds * 1000).toFixed(2)} ms`,
        `render frame / FPS: ${(stats.rawFrameDeltaSeconds * 1000).toFixed(2)} ms / ${stats.renderFps.toFixed(1)}`,
        `steps this frame: ${stats.stepsThisFrame}`,
        `pointer lock: ${this.input.pointerLocked ? 'locked' : 'unlocked'}`,
        `held actions: ${heldActions}`,
        `game / death state: ${deathStats.state} (${deathStats.elapsedSeconds.toFixed(2)} s)`,
        `deaths / retries: ${deathStats.acceptedDeathCount} / ${deathStats.completedRetryCount}`,
        `level / checkpoint: ${containmentLevel.state} / ${containmentLevel.activeCheckpointId}`,
        `last level failure / completions: ${containmentLevel.lastFailureId} / ${containmentLevel.completionCount}`,
        `death burst active / radius: ${burstStats.active ? 'yes' : 'no'} / ${burstStats.maximumFragmentDistanceMetres.toFixed(2)} m`,
        `active slime: ${slimeManager.activeDefinition?.displayName ?? 'none'} (${slimeManagerStats.activeSlimeId ?? 'none'})`,
        `camera follow slime: ${this.cameraFollowSlimeId ?? 'none'}`,
        `last death slime: ${this.lastDeathSlimeId ?? 'none'}`,
        `switch action / count: Tab / ${slimePair.switchCount}`,
        `Bob position: ${body.position.x.toFixed(2)}, ${body.position.y.toFixed(2)}, ${body.position.z.toFixed(2)} m`,
        `Goop position: ${goopBody.position.x.toFixed(2)}, ${goopBody.position.y.toFixed(2)}, ${goopBody.position.z.toFixed(2)} m`,
        `persistent bodies / active controllers: ${slimeManager.registeredCount} / ${slimeManager.getRosterState().filter((entry) => entry.active).length}`,
        `two-body plate pressed / occupants: ${pressurePlate.isPressed ? 'yes' : 'no'} / ${Array.from(pressurePlate.trigger.occupants).join(', ') || 'none'}`,
        `slime roster: ${slimeRoster.map((entry) => `${entry.displayName}:${entry.betaPlayable ? 'beta' : 'locked'}/${entry.unlocked ? 'unlocked' : 'locked'}/${entry.registered ? 'registered' : 'unregistered'}/${entry.active ? 'active' : 'inactive'}`).join(' | ')}`,
        `slime counts available / unlocked / registered: ${slimeManagerStats.availableCount} / ${slimeManagerStats.unlockedCount} / ${slimeManagerStats.registeredCount}`,
        `Bob abilities adhesion / rebound / dissolve / electrical: ${bobDefinition.abilities.adhesion ? 'yes' : 'no'} / ${bobDefinition.abilities.rebound ? 'yes' : 'no'} / ${bobDefinition.abilities.dissolve ? 'yes' : 'no'} / ${bobDefinition.abilities.electrical ? 'yes' : 'no'}`,
        `Bob / Goop jump mode: ${bobDefinition.jumpMode} / ${goopDefinition.jumpMode}`,
        `Goop abilities adhesion / rebound / dissolve / electrical: ${goopDefinition.abilities.adhesion ? 'yes' : 'no'} / ${goopDefinition.abilities.rebound ? 'yes' : 'no'} / ${goopDefinition.abilities.dissolve ? 'yes' : 'no'} / ${goopDefinition.abilities.electrical ? 'yes' : 'no'}`,
        `acid aim / target / candidates / probes: ${acidStats.aimActive ? 'active' : 'inactive'} / ${acidStats.targetedSolubleId} / ${acidStats.visibleTargetCount} / ${acidStats.visibilityProbeCount}`,
        `acid projectiles live / fired: ${acidStats.liveProjectileCount} / ${acidStats.firedCount}`,
        `acid impacts soluble / world: ${acidStats.solubleImpactCount} / ${acidStats.worldImpactCount}`,
        `acid cooldown remaining: ${acidStats.cooldownRemainingSeconds.toFixed(2)} s`,
        `acid presentation crosshair / highlights / selected: ${acidPresentationStats.crosshairState} / ${acidPresentationStats.highlightedTargetCount} / ${acidPresentationStats.selectedTargetCount}`,
        `acid presentation projectile / trails / droplets / flashes: ${acidPresentationStats.activeProjectileCount} / ${acidPresentationStats.activeTrailCount} / ${acidPresentationStats.activeDropletCount} / ${acidPresentationStats.activeFlashCount}`,
        `acid presentation pools projectiles / droplets / flashes / DOM: ${acidPresentationStats.projectileSlotCount} / ${acidPresentationStats.dropletCapacity} / ${acidPresentationStats.flashCapacity} / ${acidPresentationStats.crosshairElementCount}`,
        `acid presentation work uniforms / projectile slots / droplet uploads: ${acidPresentationStats.corrosionUniformUpdateCount} / ${acidPresentationStats.projectileSlotUpdateCount} / ${acidPresentationStats.dropletMatrixUploadCount}`,
        `dissolve burns active / completed / reset: ${dissolveStats.activeBurnCount} / ${dissolveStats.completedBurnCount} / ${dissolveStats.resetBurnCount}`,
        `dissolve burn targets: ${dissolveStats.activeBurnTargetIds.join(', ') || 'none'}`,
        `dissolve progress: ${(primaryDissolveTarget.progress * 100).toFixed(0)}%`,
        `dissolve collision / completed: ${primaryDissolveTarget.collisionEnabled ? 'yes' : 'no'} / ${primaryDissolveTarget.completed ? 'yes' : 'no'}`,
        `dissolve threshold / duration: ${(primaryDissolveTarget.collisionDisableProgress * 100).toFixed(0)}% / ${primaryDissolveTarget.dissolveDurationSeconds.toFixed(2)} s`,
        `dissolve completions: ${primaryDissolveTarget.completionCount}`,
        `Volt config: ${voltDefinition.betaAvailability} / electrical ${voltDefinition.abilities.electrical ? 'configured' : 'missing'}`,
        `body position: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)} m`,
        `body velocity: ${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)} m/s`,
        `grounded / attached: ${activeBody.grounded ? 'yes' : 'no'} / ${activeBody.attached ? 'yes' : 'no'}`,
        `surface gravity / sticky-jump remaining: ${activeBody.usingSurfaceGravity ? 'yes' : 'no'} / ${activeBody.stickyJumpGravityRemainingSeconds.toFixed(2)} s`,
        `ground normal: ${groundNormal.x.toFixed(2)}, ${groundNormal.y.toFixed(2)}, ${groundNormal.z.toFixed(2)}`,
        `gameplay up: ${activeBody.gameplayUp.x.toFixed(2)}, ${activeBody.gameplayUp.y.toFixed(2)}, ${activeBody.gameplayUp.z.toFixed(2)}`,
        `surface / last contact: ${activeBody.supportSurfaceTag} / ${activeBody.lastContactSurfaceTag}`,
        `attachment surface: ${activeBody.attachmentSurfaceName}`,
        `attach / bounce cooldown: ${activeBody.attachmentCooldownSeconds.toFixed(2)} / ${activeBody.bounceCooldownSeconds.toFixed(2)} s`,
        `last bounce: ${activeBody.lastBounceSpeedMetresPerSecond.toFixed(2)} m/s @ ${activeBody.lastBounceSurfaceName}`,
        `jump state / can jump: ${activeBody.jumpState} / ${activeBody.canJump ? 'yes' : 'no'}`,
        `charge: ${activeBody.chargeSeconds.toFixed(2)} / ${activeBody.maximumJumpChargeSeconds.toFixed(2)} s (${(activeBody.chargeFraction * 100).toFixed(0)}%)`,
        `coyote remaining: ${activeBody.coyoteTimeRemainingSeconds.toFixed(3)} s`,
        `jump buffer remaining: ${activeBody.jumpInputBufferRemainingSeconds.toFixed(3)} s`,
        `last jump: ${activeBody.lastJumpSpeedMetresPerSecond.toFixed(2)} m/s @ ${(activeBody.lastJumpChargeFraction * 100).toFixed(0)}% charge`,
        `last jump direction: ${activeBody.lastJumpDirection.x.toFixed(2)}, ${activeBody.lastJumpDirection.y.toFixed(2)}, ${activeBody.lastJumpDirection.z.toFixed(2)}`,
        `landing this step: ${activeBody.landedThisStep ? 'yes' : 'no'}`,
        `last landing impact / count: ${this.lastLandingImpactSpeedMetresPerSecond.toFixed(2)} m/s / ${this.landingEventCount}`,
        `visual speed / charge: ${slimeDiagnostics.speed.toFixed(2)} / ${slimeDiagnostics.jumpCharge.toFixed(2)}`,
        `visual squash / stretch: ${slimeDiagnostics.squash.toFixed(2)} / ${slimeDiagnostics.stretch.toFixed(2)}`,
        `visual impact strength / age: ${slimeDiagnostics.impactStrength.toFixed(2)} / ${slimeDiagnostics.impactAge.toFixed(2)} s`,
        `visual impact normal: ${slimeDiagnostics.impactNormalLocal.x.toFixed(2)}, ${slimeDiagnostics.impactNormalLocal.y.toFixed(2)}, ${slimeDiagnostics.impactNormalLocal.z.toFixed(2)}`,
        `visual surface normal: ${slimeDiagnostics.surfaceNormalLocal.x.toFixed(2)}, ${slimeDiagnostics.surfaceNormalLocal.y.toFixed(2)}, ${slimeDiagnostics.surfaceNormalLocal.z.toFixed(2)}`,
        `visual move direction: ${slimeDiagnostics.moveDirectionLocal.x.toFixed(2)}, ${slimeDiagnostics.moveDirectionLocal.y.toFixed(2)}, ${slimeDiagnostics.moveDirectionLocal.z.toFixed(2)}`,
        `contacts this step: ${activeBody.contactsThisStep}`,
        `last collision: ${activeBody.lastCollisionName}`,
        `registered colliders / surfaces: ${collisionWorld.colliderCount} / ${surfaceRegistry.registeredCount}`,
        `camera distance: ${cameraStats.currentDistanceMetres.toFixed(2)} / ${cameraStats.desiredDistanceMetres.toFixed(2)} m`,
        `camera profile / blend: ${cameraStats.profileId} / ${(cameraStats.profileBlend * 100).toFixed(0)}%`,
        `lift state / progress / arrival camera: ${testScene.roomFour.elevator.state} / ${(testScene.roomFour.elevator.ascentProgress * 100).toFixed(1)}% / ${(testScene.roomFour.liftCameraArrivalBlend * 100).toFixed(1)}%`,
        `camera obstruction: ${cameraStats.obstructed ? `${cameraStats.obstructionName} @ ${cameraStats.obstructionDistanceMetres?.toFixed(2)} m` : 'none'}`,
        `camera collision radius: ${cameraStats.obstructionRadiusMetres.toFixed(2)} m`,
        `camera focus: ${cameraStats.focusPosition.x.toFixed(2)}, ${cameraStats.focusPosition.y.toFixed(2)}, ${cameraStats.focusPosition.z.toFixed(2)} m`,
        `camera preferred: ${cameraStats.preferredCameraPosition.x.toFixed(2)}, ${cameraStats.preferredCameraPosition.y.toFixed(2)}, ${cameraStats.preferredCameraPosition.z.toFixed(2)} m`,
        `camera resolved: ${cameraStats.resolvedCameraPosition.x.toFixed(2)}, ${cameraStats.resolvedCameraPosition.y.toFixed(2)}, ${cameraStats.resolvedCameraPosition.z.toFixed(2)} m`,
        `camera pitch manual / effective: ${THREE.MathUtils.radToDeg(cameraStats.pitchRadians).toFixed(1)}° / ${THREE.MathUtils.radToDeg(cameraStats.effectivePitchRadians).toFixed(1)}°`,
        `blob facing: ${THREE.MathUtils.radToDeg(blobFacing.yawRadians).toFixed(1)}°`,
        `teaching-surface regression: ${this.slopeRegressionStatus}`,
        `two-body switching regression: ${this.twoBodySwitchingRegressionStatus}`,
        `viewport: ${renderStats.viewportWidth} × ${renderStats.viewportHeight} CSS px`,
        `drawing buffer: ${renderStats.drawingBufferWidth} × ${renderStats.drawingBufferHeight} px (${renderStats.pixelRatio.toFixed(2)}× DPR, ${renderStats.pixelRatioCap.toFixed(1)}× cap)`,
        `draw calls / triangles: ${renderStats.drawCalls} / ${renderStats.triangles}`,
        `scene objects / lights: ${renderStats.sceneObjects} / ${renderStats.sceneLights}`,
        `authored lights active / total / shadow: ${testScene.lightingDiagnostics.visibleAuthoredLightCount} / ${testScene.lightingDiagnostics.authoredLightCount} / ${testScene.lightingDiagnostics.shadowCastingLightCount}`,
        `lighting room / Bob hatch / Goop release: ${testScene.lightingDiagnostics.activeRoomId} / ${testScene.lightingDiagnostics.bobHatchState} / ${testScene.lightingDiagnostics.goopReleaseState}`,
        `lighting particles / manual release drive: ${testScene.lightingDiagnostics.activeParticleCount} / ${testScene.lightingDiagnostics.goopReleaseManuallyDriven ? 'yes' : 'no'}`,
        `lighting state applications Goop / elevator: ${testScene.lightingDiagnostics.goopStateApplicationCount} / ${testScene.lightingDiagnostics.elevatorStateApplicationCount}`,
        `lighting transition profiles: ${JSON.stringify(this.lightingTransitionProfiles)}`,
        `lighting prewarm profile: ${JSON.stringify(this.lightingPrewarmProfile ?? null)}`,
        `unique materials / instanced meshes: ${renderStats.uniqueMaterials} / ${renderStats.instancedMeshes}`,
        `GPU geometries / textures: ${renderStats.geometries} / ${renderStats.textures}`,
        `shader programs: ${renderStats.programs}`,
        `Containment art materials / textures / geometries: ${testScene.artResources.diagnostics.materialCount} / ${testScene.artResources.diagnostics.textureCount} / ${testScene.artResources.diagnostics.geometryCount}`,
        `Containment art texture bytes: ${testScene.artResources.diagnostics.estimatedTextureBytes}`,
      ].join('\n'),
    );
  }

  private readonly onDebugToggle = (event: KeyboardEvent): void => {
    const testPanel = this.resources?.testPanel;
    if (
      this.debugVisible &&
      testPanel &&
      handleDebugPanelScrollKey(event, testPanel.element)
    ) {
      return;
    }
    if (event.code !== DEBUG_TOGGLE_CODE || event.repeat) return;
    if (!this.debugInteractionEnabled) return;
    event.preventDefault();
    if (!testPanel) return;
    if (this.debugVisible) {
      const resources = this.requireResources();
      this.closeDebugInspection(
        this.lifecycle.state === 'running' &&
          resources.deathSequence.isPlaying &&
          resources.containmentLevel.state === 'playing',
      );
      return;
    }
    if (!this.input.enabled) return;
    this.debugInspectionState = beginDebugPanelInspection(this.input);
    this.setDebugVisible(true, testPanel);
  };

  private closeDebugInspection(restoreGameplayInput: boolean): void {
    const state = this.debugInspectionState;
    this.debugInspectionState = undefined;
    const testPanel = this.resources?.testPanel;
    if (testPanel) this.setDebugVisible(false, testPanel);
    else this.debugVisible = false;
    if (state) {
      finishDebugPanelInspection(this.input, state, restoreGameplayInput);
    }
  }

  private async runLightingPrewarm(
    resources: GreyboxRuntimeResources,
    generation: number,
  ): Promise<void> {
    const renderer = this.renderLayer.renderer;
    const camera = this.renderLayer.cameraRig.camera;
    const prewarmCamera = camera.clone();
    const previousViewport = renderer.getViewport(new THREE.Vector4());
    const previousScissor = renderer.getScissor(new THREE.Vector4());
    const previousScissorTest = renderer.getScissorTest();
    const programsBefore = renderer.info.programs?.length ?? 0;
    const started = this.hostWindow.performance.now();
    const steps: LightingPrewarmStepProfile[] = [];
    let rendererStateRestored = false;
    const restoreRendererState = (): void => {
      if (rendererStateRestored) return;
      rendererStateRestored = true;
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
    };
    const isCurrent = (): boolean =>
      this.resources === resources &&
      this.lightingPrewarmGeneration === generation;
    this.cancelLightingPrewarm = restoreRendererState;

    try {
      // This draw remains behind the loading screen. The one-pixel
      // viewport initializes first-use fixture buffers without flashing a room.
      renderer.setViewport(0, 0, 1, 1);
      renderer.setScissor(0, 0, 1, 1);
      renderer.setScissorTest(true);
      await resources.testScene.lighting.prewarmShaderConfigurations(
        async (roomId) => {
          if (!isCurrent()) return;
          const stepProgramsBefore = renderer.info.programs?.length ?? 0;
          const stepStarted = this.hostWindow.performance.now();
          const signature = countVisibleLights(
            this.renderLayer.scene,
            prewarmCamera,
          );
          const compileSubset = createRoomCompileSubset(resources, roomId);
          const compileStarted = this.hostWindow.performance.now();
          try {
            if (renderer.extensions.has('KHR_parallel_shader_compile')) {
              await renderer.compileAsync(
                compileSubset,
                prewarmCamera,
                this.renderLayer.scene,
              );
            } else {
              renderer.compile(
                compileSubset,
                prewarmCamera,
                this.renderLayer.scene,
              );
            }
          } finally {
            compileSubset.clear();
          }
          const compileDurationMs =
            this.hostWindow.performance.now() - compileStarted;
          const programsAfterCompile = renderer.info.programs?.length ?? 0;
          if (!isCurrent()) return;
          const target = LIGHTING_PREWARM_CAMERA_TARGETS[roomId];
          prewarmCamera.position.set(target[0], target[1] + 1.2, target[2] - 5);
          prewarmCamera.lookAt(target[0], target[1] + 0.5, target[2] + 2);
          prewarmCamera.updateMatrixWorld();
          const primeStarted = this.hostWindow.performance.now();
          // Boot already draws Room 1 twice behind the loading screen. Only
          // future rooms need an additional hidden first-use geometry draw.
          if (roomId !== 1) {
            renderer.render(this.renderLayer.scene, prewarmCamera);
          }
          const primeDurationMs =
            this.hostWindow.performance.now() - primeStarted;
          renderer.setViewport(0, 0, 1, 1);
          renderer.setScissor(0, 0, 1, 1);
          renderer.setScissorTest(true);
          steps.push({
            roomId,
            compiledObjects: compileSubset.userData.compiledObjects as number,
            durationMs: this.hostWindow.performance.now() - stepStarted,
            compileDurationMs,
            primeDurationMs,
            programsBefore: stepProgramsBefore,
            programsAfterCompile,
            programsAfter: renderer.info.programs?.length ?? 0,
            ...signature,
          });
        },
      );

      if (!isCurrent()) return;
      this.lightingPrewarmProfile = {
        durationMs: this.hostWindow.performance.now() - started,
        programsBefore,
        programsAfter: renderer.info.programs?.length ?? 0,
        steps,
      };
    } finally {
      restoreRendererState();
      if (this.cancelLightingPrewarm === restoreRendererState) {
        this.cancelLightingPrewarm = undefined;
      }
    }
  }

  private setDebugVisible(
    visible: boolean,
    testPanel: GreyboxTestPanel,
  ): void {
    this.debugVisible = visible;
    this.applyDebugPresentation(testPanel);
  }

  private applyDebugPresentation(testPanel: GreyboxTestPanel): void {
    const presented = this.debugInteractionEnabled && this.debugVisible;
    testPanel.element.hidden = !presented;
    testPanel.element.inert = !presented;
    if (presented) {
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

function countVisibleLights(
  root: THREE.Object3D,
  camera: THREE.Camera,
): Pick<
  LightingTransitionProfile,
  | 'pointLights'
  | 'spotLights'
  | 'directionalLights'
  | 'hemisphereLights'
> {
  let pointLights = 0;
  let spotLights = 0;
  let directionalLights = 0;
  let hemisphereLights = 0;
  root.traverseVisible((object) => {
    if (!object.layers.test(camera.layers)) return;
    if (object instanceof THREE.PointLight) pointLights += 1;
    else if (object instanceof THREE.SpotLight) spotLights += 1;
    else if (object instanceof THREE.DirectionalLight) directionalLights += 1;
    else if (object instanceof THREE.HemisphereLight) hemisphereLights += 1;
  });
  return {
    pointLights,
    spotLights,
    directionalLights,
    hemisphereLights,
  };
}

function createRoomCompileSubset(
  resources: GreyboxRuntimeResources,
  roomId: DebugRoomId,
): THREE.Group {
  const levelRoot = resources.testScene.root;
  const teachingRoot = requiredNamedObject(
    levelRoot,
    'containment-climb-and-bounce-greybox',
  );
  const lightingRoot = requiredNamedObject(
    levelRoot,
    `containment-room-${roomId}-lighting-rig`,
  );
  const sources: THREE.Object3D[] = [
    lightingRoot,
    resources.slimePairPresentation.root,
    resources.goopAcidPresentation.root,
  ];

  if (roomId <= 2) {
    const prefix = `room-${roomId}-`;
    for (const child of teachingRoot.children) {
      if (
        child.name.startsWith(prefix) ||
        (roomId === 1 && child.name.startsWith('duct-')) ||
        child.name.startsWith('player-slime-')
      ) {
        sources.push(child);
      }
    }
  } else {
    sources.push(
      requiredNamedObject(levelRoot, `containment-room-${roomId}-greybox`),
    );
    for (const child of teachingRoot.children) {
      if (child.name.startsWith('player-slime-')) sources.push(child);
    }
  }

  if (roomId === 1) sources.push(resources.pressurePlate.root);

  const subset = new THREE.Group();
  subset.name = `containment-room-${roomId}-shader-prewarm-subset`;
  const compiledSignatures = new Set<string>();
  let compiledObjects = 0;
  for (const source of sources) {
    source.traverse((object) => {
      if (!isRenderableObject(object)) return;
      const compileSignature = compileObjectSignature(object);
      if (compiledSignatures.has(compileSignature)) return;
      compiledSignatures.add(compileSignature);
      const clone = cloneCompileObject(object);
      clone.visible = true;
      subset.add(clone);
      compiledObjects += 1;
    });
  }
  subset.userData.compiledObjects = compiledObjects;
  return subset;
}

function requiredNamedObject(
  root: THREE.Object3D,
  name: string,
): THREE.Object3D {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Missing prewarm source ${name}.`);
  return object;
}

function isRenderableObject(
  object: THREE.Object3D,
): object is THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite {
  return (
    object instanceof THREE.Mesh ||
    object instanceof THREE.Line ||
    object instanceof THREE.Points ||
    object instanceof THREE.Sprite
  );
}

function compileObjectSignature(
  object: THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite,
): string {
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  const geometry = 'geometry' in object ? object.geometry : undefined;
  const attributes = geometry
    ? Object.entries(geometry.attributes)
        .map(
          ([name, attribute]) =>
            `${name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}`,
        )
        .sort()
        .join(',')
    : '';
  const morphAttributes = geometry
    ? Object.entries(geometry.morphAttributes)
        .map(([name, entries]) => `${name}:${entries.length}`)
        .sort()
        .join(',')
    : '';
  return [
    object.type,
    object instanceof THREE.InstancedMesh ? 'instanced' : 'single',
    object instanceof THREE.InstancedMesh && object.instanceColor
      ? 'instance-colour'
      : 'no-instance-colour',
    materials.map((material) => material.uuid).join(','),
    attributes,
    morphAttributes,
  ].join('|');
}

function cloneCompileObject(
  object: THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite,
): THREE.Object3D {
  if (object instanceof THREE.InstancedMesh) {
    const clone = new THREE.InstancedMesh(
      object.geometry,
      object.material,
      1,
    );
    if (object.instanceColor) {
      clone.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array([1, 1, 1]),
        3,
      );
    }
    clone.castShadow = object.castShadow;
    clone.receiveShadow = object.receiveShadow;
    clone.layers.mask = object.layers.mask;
    return clone;
  }
  return object.clone(false);
}

function nextPreviewState<T>(states: readonly T[], current: T): T {
  const currentIndex = states.indexOf(current);
  return states[(currentIndex + 1) % states.length]!;
}
