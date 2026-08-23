import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import type { Input } from '../core/Input.ts';
import type { LoopStats } from '../core/Loop.ts';
import { CultivationTestPanel } from '../debug/CultivationTestPanel.ts';
import {
  RadioactiveHazardSystem,
  type RadiationContactTarget,
} from '../hazards/RadioactiveHazardSystem.ts';
import { CollisionWorld } from '../physics/CollisionWorld.ts';
import {
  KinematicBody,
  type JumpInputState,
} from '../physics/KinematicBody.ts';
import { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import { BlobFacing } from '../render/BlobFacing.ts';
import type { RenderLayer } from '../render/RenderLayer.ts';
import { SlimeBurstPresentation } from '../render/slime/SlimeBurstPresentation.ts';
import { SlimeVisual, type SlimeVisualState } from '../render/slime/SlimeVisual.ts';
import {
  EMPTY_SLIME_HUD_SNAPSHOT,
  type SlimeHUDListener,
  type SlimeHUDSnapshot,
  type SlimePlayerSwitchFeedback,
} from '../slimes/SlimeHUDState.ts';
import { SlimeManager } from '../slimes/SlimeManager.ts';
import { PersistentSlimePair } from '../slimes/PersistentSlimePair.ts';
import { SlimePairPresentation } from '../slimes/SlimePairPresentation.ts';
import { DeathSequence, type DeathRecoveryAction } from '../systems/DeathSequence.ts';
import { DeathScreen } from '../ui/DeathScreen.ts';
import { CultivationLevelController } from './CultivationLevelController.ts';
import { CULTIVATION_FOUNDATION_MANIFEST } from './CultivationFoundationManifest.ts';
import { CultivationLevelScene } from './CultivationLevelScene.ts';
import type { GameLevelRuntimeEvents } from './GameLevelRuntime.ts';
import { LevelLifecycle, type LevelLifecycleState } from './LevelLifecycle.ts';
import {
  type LevelProgressionSnapshot,
  type PlayableSlimeId,
  validateLevelProgressionSnapshot,
} from './LevelProgression.ts';

const DEBUG_TOGGLE_CODE = 'F2';

export interface CultivationLevelRuntimeOptions {
  readonly host: HTMLElement;
  readonly input: Input;
  readonly renderLayer: RenderLayer;
  readonly progression: LevelProgressionSnapshot;
  readonly window?: Window;
  readonly debugAvailable?: boolean;
}

interface CultivationRuntimeResources {
  readonly scene: CultivationLevelScene;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly manager: SlimeManager<KinematicBody>;
  readonly pair: PersistentSlimePair<KinematicBody>;
  readonly controller: CultivationLevelController;
  readonly radiation: RadioactiveHazardSystem;
  readonly radiationTargets: readonly RadiationContactTarget[];
  readonly bobVisual: SlimeVisual;
  readonly pairPresentation: SlimePairPresentation;
  readonly burst: SlimeBurstPresentation;
  readonly deathSequence: DeathSequence;
  readonly deathScreen: DeathScreen;
  readonly bobFacing: BlobFacing;
  readonly bobVisualState: SlimeVisualState;
  readonly jumpInputState: JumpInputState;
  readonly movement: THREE.Vector3;
  readonly noMovement: THREE.Vector3;
  readonly renderedBobPosition: THREE.Vector3;
  readonly renderedGoopPosition: THREE.Vector3;
  readonly debugPanel: CultivationTestPanel | undefined;
  readonly unsubscribeControllerObjective: () => void;
  readonly unsubscribeControllerProgress: () => void;
  readonly unsubscribeManager: readonly (() => void)[];
}

export class CultivationLevelRuntime {
  readonly events = new EventBus<GameLevelRuntimeEvents>();

  private readonly host: HTMLElement;
  private readonly input: Input;
  private readonly renderLayer: RenderLayer;
  private readonly hostWindow: Window;
  private readonly debugAvailable: boolean;
  private readonly initialProgression: LevelProgressionSnapshot;
  private readonly lifecycle: LevelLifecycle;
  private readonly hudListeners = new Set<SlimeHUDListener>();
  private resources: CultivationRuntimeResources | undefined;
  private debugVisible = false;
  private debugInteractionEnabled = true;
  private debugElapsedSeconds = 0;
  private switchFeedbackSequence = 0;
  private lastDeathSlimeId: PlayableSlimeId | undefined;

  constructor(options: CultivationLevelRuntimeOptions) {
    validateLevelProgressionSnapshot(options.progression);
    this.host = options.host;
    this.input = options.input;
    this.renderLayer = options.renderLayer;
    this.hostWindow = options.window ?? window;
    this.debugAvailable = options.debugAvailable ?? import.meta.env.DEV;
    this.initialProgression = {
      unlockedSlimeIds: [...options.progression.unlockedSlimeIds],
      activeSlimeId: options.progression.activeSlimeId,
    };
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

  load(): void { this.lifecycle.load(); }
  start(): void { this.lifecycle.start(); }
  stop(): void { this.lifecycle.stop(); }
  restartLevel(): void { this.lifecycle.restartLevel(); }
  unload(): void { this.lifecycle.unload(); }

  dispose(): void {
    this.lifecycle.dispose();
    this.hudListeners.clear();
    this.events.clear();
  }

  captureProgressionSnapshot(): LevelProgressionSnapshot {
    const resources = this.requireResources();
    return {
      unlockedSlimeIds: resources.manager.getRosterState()
        .filter((entry) => entry.unlocked && (entry.id === 'bob' || entry.id === 'goop'))
        .map((entry) => entry.id as PlayableSlimeId),
      activeSlimeId: resources.pair.activeSlimeId,
    };
  }

  subscribeSlimeHUD(listener: SlimeHUDListener): () => void {
    this.hudListeners.add(listener);
    listener(this.getSlimeHUDSnapshot());
    return () => this.hudListeners.delete(listener);
  }

  getSlimeHUDSnapshot(): SlimeHUDSnapshot {
    const resources = this.resources;
    if (!resources) return EMPTY_SLIME_HUD_SNAPSHOT;
    return {
      roster: resources.manager.getRosterState(),
      activeSlimeId: resources.manager.activeSlimeId,
      passiveInteractions: [],
      playerSwitchFeedback: undefined,
      resetSwitchFeedback: false,
    };
  }

  setDebugInteractionEnabled(enabled: boolean): void {
    this.debugInteractionEnabled = enabled;
    this.applyDebugPresentation();
  }

  fixedUpdate(deltaSeconds: number): void {
    if (this.lifecycle.state !== 'running') return;
    const resources = this.requireResources();
    if (!resources.deathSequence.isPlaying) {
      resources.burst.update(deltaSeconds);
      if (resources.deathSequence.update(deltaSeconds)) resources.deathScreen.show();
      this.input.endFixedUpdate();
      return;
    }
    if (resources.controller.readModel.state === 'complete') {
      this.input.setEnabled(false);
      this.input.releasePointerLock();
      this.input.endFixedUpdate();
      return;
    }
    if (this.debugAvailable && this.input.wasPressed('debugReset')) {
      this.restartLevel();
      return;
    }

    let switched = false;
    if (this.input.wasPressed('switchSlime')) switched = this.switchActive(resources);
    const moveX = (this.input.isDown('moveRight') ? 1 : 0) - (this.input.isDown('moveLeft') ? 1 : 0);
    const moveZ = (this.input.isDown('moveBackward') ? 1 : 0) - (this.input.isDown('moveForward') ? 1 : 0);
    if (!switched) {
      this.renderLayer.cameraRig.queueLookInput(this.input.pointerDeltaX, this.input.pointerDeltaY);
      this.renderLayer.cameraRig.applyQueuedLookInput();
      this.renderLayer.cameraRig.copyGroundMovementDirection(moveX, moveZ, resources.movement);
      resources.jumpInputState.pressed = this.input.wasPressed('jump');
      resources.jumpInputState.held = this.input.isDown('jump');
      resources.jumpInputState.released = this.input.wasReleased('jump');
      resources.jumpInputState.cancelled = this.input.wasClearedSinceFixedUpdate;
    } else {
      resources.movement.set(0, 0, 0);
      this.clearJumpInput(resources.jumpInputState, true);
    }

    const activeBody = resources.pair.activeBody;
    if (!switched && activeBody === resources.pair.bobBody) {
      resources.pair.bobBody.update(deltaSeconds, resources.movement, resources.jumpInputState);
      resources.pair.goopBody.update(deltaSeconds, resources.noMovement);
    } else if (!switched && activeBody === resources.pair.goopBody) {
      resources.pair.bobBody.update(deltaSeconds, resources.noMovement);
      resources.pair.goopBody.update(deltaSeconds, resources.movement, resources.jumpInputState);
    } else {
      resources.pair.bobBody.update(deltaSeconds, resources.noMovement);
      resources.pair.goopBody.update(deltaSeconds, resources.noMovement);
    }

    resources.radiation.update(resources.radiationTargets);
    if (resources.deathSequence.isPlaying) resources.controller.update();
    if (resources.deathSequence.isPlaying) this.updateBobVisual(deltaSeconds, resources);
    this.input.endFixedUpdate();
  }

  render(interpolationAlpha: number, stats: Readonly<LoopStats>): void {
    const resources = this.resources;
    if (!resources) {
      this.renderLayer.render();
      return;
    }
    this.interpolate(resources.pair.bobBody, interpolationAlpha, resources.renderedBobPosition);
    this.interpolate(resources.pair.goopBody, interpolationAlpha, resources.renderedGoopPosition);
    resources.bobVisual.setPosition(resources.renderedBobPosition);
    resources.bobVisual.mesh.rotation.set(0, resources.bobFacing.getInterpolatedYaw(interpolationAlpha), 0);
    resources.bobVisual.present();
    this.input.endPointerUpdate();
    this.renderLayer.cameraRig.update(interpolationAlpha, stats.frameDeltaSeconds);
    resources.pairPresentation.update(
      resources.renderedBobPosition,
      resources.renderedGoopPosition,
      resources.pair.activeSlimeId,
      this.renderLayer.cameraRig.camera,
      resources.collisionWorld,
    );
    this.renderLayer.render();

    this.debugElapsedSeconds += stats.rawFrameDeltaSeconds;
    if (this.debugVisible && resources.debugPanel && this.debugElapsedSeconds >= 0.25) {
      this.debugElapsedSeconds = 0;
      const readModel = resources.controller.readModel;
      resources.debugPanel.setRuntimeDiagnostics([
        `active level: cultivation-level-2`,
        `lifecycle / gameplay: ${this.state} / ${readModel.state}`,
        `active slime: ${resources.pair.activeSlimeId}`,
        `Bob: ${this.formatPosition(resources.pair.bobBody.position)} m`,
        `Goop: ${this.formatPosition(resources.pair.goopBody.position)} m`,
        `checkpoint / group: ${readModel.checkpointId} / ${readModel.puzzleGroupId}`,
        `room / entries B,G: ${readModel.roomId} / ${readModel.bobEnteredRoomThree ? 'yes' : 'no'},${readModel.goopEnteredRoomThree ? 'yes' : 'no'}`,
        `early Goop Room 2: ${readModel.goopEnteredRoomTwoEarly ? 'yes' : 'no'}`,
        `last failure / death slime: ${readModel.lastFailure} / ${this.lastDeathSlimeId ?? 'none'}`,
        `radiation requests: ${resources.radiation.failureRequestCount}`,
        `bodies / colliders / scene objects: ${resources.manager.registeredCount} / ${resources.collisionWorld.colliderCount} / ${this.renderLayer.getDiagnostics().sceneObjects}`,
      ].join('\n'));
    }
  }

  private readonly loadResources = (): void => {
    const scene = new CultivationLevelScene(CULTIVATION_FOUNDATION_MANIFEST);
    this.renderLayer.scene.add(scene.root);
    const collisionWorld = new CollisionWorld();
    collisionWorld.registerAll(scene.collisionMeshes);
    const surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.registerAll(scene.collisionMeshes);
    const manager = new SlimeManager<KinematicBody>();
    if (!manager.isUnlocked('goop')) manager.unlock('goop');
    const entrance = CULTIVATION_FOUNDATION_MANIFEST.checkpoints[0];
    const bobDefinition = manager.getDefinition('bob');
    const goopDefinition = manager.getDefinition('goop');
    const bobBody = new KinematicBody({
      world: collisionWorld,
      surfaces: surfaceRegistry,
      initialPosition: entrance.bobSpawnPosition,
      config: {
        adhesionEnabled: bobDefinition.abilities.adhesion,
        reboundEnabled: bobDefinition.abilities.rebound,
        chargedJumpEnabled: bobDefinition.jumpMode === 'charged',
      },
    });
    const goopBody = new KinematicBody({
      world: collisionWorld,
      surfaces: surfaceRegistry,
      initialPosition: entrance.goopSpawnPosition,
      config: {
        adhesionEnabled: goopDefinition.abilities.adhesion,
        reboundEnabled: goopDefinition.abilities.rebound,
        chargedJumpEnabled: goopDefinition.jumpMode === 'charged',
      },
    });
    const pair = new PersistentSlimePair({
      manager,
      bobBody,
      goopBody,
      bobSpawnPosition: entrance.bobSpawnPosition,
      goopSpawnPosition: entrance.goopSpawnPosition,
      initialActiveSlimeId: this.initialProgression.activeSlimeId,
    });

    const deathSequence = new DeathSequence();
    let radiation: RadioactiveHazardSystem;
    const controller = new CultivationLevelController({
      pair,
      collisionWorld,
      initialActiveSlimeId: this.initialProgression.activeSlimeId,
      requestDeath: (recovery, dyingSlimeId) =>
        this.requestPlayerDeath(recovery, dyingSlimeId),
      cancelTransients: () => radiation?.reset(),
    });
    radiation = new RadioactiveHazardSystem(
      CULTIVATION_FOUNDATION_MANIFEST.radioactiveHazards,
      (failure) => controller.requestRadiationFailure(failure),
    );
    const radiationTargets: readonly RadiationContactTarget[] = [
      {
        id: 'bob', kind: 'slime', position: bobBody.position,
        radiusMetres: bobBody.radiusMetres,
        response: bobDefinition.hazardResponses.radiation,
      },
      {
        id: 'goop', kind: 'slime', position: goopBody.position,
        radiusMetres: goopBody.radiusMetres,
        response: goopDefinition.hazardResponses.radiation,
      },
    ];

    const bobVisual = new SlimeVisual({ radiusMetres: bobBody.radiusMetres });
    this.renderLayer.scene.add(bobVisual.mesh);
    const pairPresentation = new SlimePairPresentation(bobBody.radiusMetres);
    this.renderLayer.scene.add(pairPresentation.root);
    const burst = new SlimeBurstPresentation();
    this.renderLayer.scene.add(burst.root);
    const debugPanel = this.debugAvailable
      ? new CultivationTestPanel(() => this.restartLevel())
      : undefined;
    if (debugPanel) {
      this.host.append(debugPanel.element);
      this.hostWindow.addEventListener('keydown', this.onDebugToggle);
    }
    const deathScreen = new DeathScreen({
      onRetry: this.retryAfterDeath,
      backgroundElements: [this.renderLayer.canvas, ...(debugPanel ? [debugPanel.element] : [])],
    });
    this.host.append(deathScreen.element);

    const bobVisualState = this.createBobVisualState(bobBody);
    const unsubscribeControllerObjective = controller.events.on(
      'objectiveChanged',
      (event) => this.events.emit('objectiveChanged', event),
    );
    const unsubscribeControllerProgress = controller.events.on(
      'progressChanged',
      () => this.host.dataset.gameState = controller.readModel.state,
    );
    const notifyManager = () => this.notifyHUD();
    const unsubscribeManager = [
      manager.events.on('activeChanged', notifyManager),
      manager.events.on('registered', notifyManager),
      manager.events.on('unregistered', notifyManager),
      manager.events.on('unlocked', notifyManager),
    ];

    this.resources = {
      scene, collisionWorld, surfaceRegistry, manager, pair, controller, radiation,
      radiationTargets, bobVisual, pairPresentation, burst, deathSequence,
      deathScreen, bobFacing: new BlobFacing(), bobVisualState,
      jumpInputState: { pressed: false, held: false, released: false, cancelled: false },
      movement: new THREE.Vector3(), noMovement: new THREE.Vector3(),
      renderedBobPosition: new THREE.Vector3(), renderedGoopPosition: new THREE.Vector3(),
      debugPanel, unsubscribeControllerObjective, unsubscribeControllerProgress,
      unsubscribeManager,
    };
    this.renderLayer.cameraRig.reset();
    this.retargetCamera(this.resources);
    this.host.dataset.gameState = controller.readModel.state;
    this.applyDebugPresentation();
    this.notifyHUD();
    this.events.emit('objectiveChanged', {
      roomId: controller.readModel.roomId,
      objective: controller.readModel.objective,
    });
  };

  private readonly startResources = (): void => {
    const resources = this.requireResources();
    this.input.resetState();
    this.input.setEnabled(
      resources.deathSequence.isPlaying && resources.controller.readModel.state === 'playing',
    );
  };

  private readonly stopResources = (): void => {
    this.input.setEnabled(false);
  };

  private readonly restartResources = (): void => {
    const resources = this.requireResources();
    this.input.resetState();
    resources.deathSequence.reset();
    resources.deathScreen.hide();
    resources.burst.reset();
    resources.controller.reset(this.initialProgression.activeSlimeId);
    resources.bobVisual.reset();
    resources.bobFacing.reset();
    this.clearJumpInput(resources.jumpInputState, false);
    this.renderLayer.cameraRig.reset();
    this.retargetCamera(resources);
    this.lastDeathSlimeId = undefined;
    this.notifyHUD(undefined, true);
  };

  private readonly unloadResources = (): void => {
    const resources = this.requireResources();
    this.hostWindow.removeEventListener('keydown', this.onDebugToggle);
    resources.unsubscribeControllerObjective();
    resources.unsubscribeControllerProgress();
    for (const unsubscribe of resources.unsubscribeManager) unsubscribe();
    resources.deathScreen.dispose();
    resources.debugPanel?.dispose();
    resources.controller.dispose();
    resources.radiation.dispose();
    resources.burst.dispose();
    resources.bobVisual.dispose();
    resources.pairPresentation.dispose();
    resources.manager.clearLevelRegistrations();
    resources.manager.dispose();
    resources.scene.dispose();
    resources.collisionWorld.clear();
    resources.surfaceRegistry.clear();
    this.renderLayer.cameraRig.clearFollowTarget();
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    delete this.host.dataset.gameState;
    this.resources = undefined;
    this.debugVisible = false;
    this.notifyHUD();
  };

  private switchActive(resources: CultivationRuntimeResources): boolean {
    const previousSlimeId = resources.pair.activeSlimeId;
    if (!resources.pair.switchActive()) return false;
    this.input.resetState();
    resources.movement.set(0, 0, 0);
    this.clearJumpInput(resources.jumpInputState, true);
    this.retargetCamera(resources);
    this.switchFeedbackSequence += 1;
    this.notifyHUD({
      sequence: this.switchFeedbackSequence,
      previousSlimeId,
      activeSlimeId: resources.pair.activeSlimeId,
    });
    return true;
  }

  private requestPlayerDeath(
    recovery: DeathRecoveryAction,
    dyingSlimeId: PlayableSlimeId,
  ): boolean {
    const resources = this.requireResources();
    if (!resources.deathSequence.requestDeath(recovery)) return false;
    const dyingBody = dyingSlimeId === 'bob' ? resources.pair.bobBody : resources.pair.goopBody;
    if (!resources.burst.start(dyingBody.position)) {
      resources.deathSequence.reset();
      return false;
    }
    this.lastDeathSlimeId = dyingSlimeId;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    return true;
  }

  private readonly retryAfterDeath = (): void => {
    const resources = this.requireResources();
    if (!resources.deathSequence.completeRetry()) return;
    resources.burst.reset();
    resources.deathScreen.hide();
    this.input.resetState();
    this.renderLayer.cameraRig.reset();
    this.retargetCamera(resources);
    this.input.setEnabled(resources.controller.readModel.state === 'playing');
    if (this.input.enabled) this.input.requestPointerLock();
    this.notifyHUD(undefined, true);
  };

  private retargetCamera(resources: CultivationRuntimeResources): void {
    this.renderLayer.cameraRig.setFollowTarget(resources.pair.activeBody, resources.collisionWorld);
  }

  private updateBobVisual(deltaSeconds: number, resources: CultivationRuntimeResources): void {
    const bob = resources.pair.bobBody;
    resources.bobFacing.update(deltaSeconds, bob.velocity, !bob.attached);
    const state = resources.bobVisualState;
    state.grounded = bob.grounded;
    state.attached = bob.attached;
    state.jumpCharge = bob.chargeFraction;
    state.contactCount = bob.contactsThisStep;
    state.contactSpeedMetresPerSecond = bob.lastContactImpactSpeedMetresPerSecond;
    state.contactName = bob.lastContactName;
    state.contactSurfaceTag = bob.lastContactSurfaceTag;
    state.landedThisStep = bob.landedThisStep;
    resources.bobVisual.update(deltaSeconds, state);
  }

  private createBobVisualState(body: KinematicBody): SlimeVisualState {
    return {
      velocityWorld: body.velocity,
      surfaceNormalWorld: body.groundNormal,
      gameplayUpWorld: body.gameplayUp,
      grounded: body.grounded,
      attached: body.attached,
      jumpCharge: body.chargeFraction,
      maximumLocomotionSpeedMetresPerSecond: body.maximumLocomotionSpeedMetresPerSecond,
      contactCount: body.contactsThisStep,
      contactNormalWorld: body.lastContactNormal,
      contactSpeedMetresPerSecond: body.lastContactImpactSpeedMetresPerSecond,
      contactName: body.lastContactName,
      contactSurfaceTag: body.lastContactSurfaceTag,
      landedThisStep: body.landedThisStep,
    };
  }

  private interpolate(body: KinematicBody, alpha: number, target: THREE.Vector3): void {
    target.set(
      THREE.MathUtils.lerp(body.previousPosition.x, body.position.x, alpha),
      THREE.MathUtils.lerp(body.previousPosition.y, body.position.y, alpha),
      THREE.MathUtils.lerp(body.previousPosition.z, body.position.z, alpha),
    );
  }

  private clearJumpInput(state: JumpInputState, cancelled: boolean): void {
    state.pressed = false;
    state.held = false;
    state.released = false;
    state.cancelled = cancelled;
  }

  private formatPosition(position: { readonly x: number; readonly y: number; readonly z: number }): string {
    return `${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`;
  }

  private notifyHUD(
    playerSwitchFeedback?: SlimePlayerSwitchFeedback,
    resetSwitchFeedback = false,
  ): void {
    const resources = this.resources;
    const snapshot: SlimeHUDSnapshot = resources
      ? {
          roster: resources.manager.getRosterState(),
          activeSlimeId: resources.manager.activeSlimeId,
          passiveInteractions: [],
          playerSwitchFeedback,
          resetSwitchFeedback,
        }
      : EMPTY_SLIME_HUD_SNAPSHOT;
    for (const listener of this.hudListeners) listener(snapshot);
  }

  private applyDebugPresentation(): void {
    const panel = this.resources?.debugPanel;
    if (!panel) return;
    const visible = this.debugVisible && this.debugInteractionEnabled;
    panel.element.hidden = !visible;
    panel.element.inert = !visible;
    panel.element.setAttribute('aria-hidden', String(!visible));
  }

  private readonly onDebugToggle = (event: KeyboardEvent): void => {
    if (event.code !== DEBUG_TOGGLE_CODE || event.repeat || !this.debugInteractionEnabled) return;
    event.preventDefault();
    this.debugVisible = !this.debugVisible;
    this.applyDebugPresentation();
  };

  private requireResources(): CultivationRuntimeResources {
    if (!this.resources) throw new Error('Cultivation level resources are not loaded.');
    return this.resources;
  }
}
