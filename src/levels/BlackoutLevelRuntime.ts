import * as THREE from 'three';

import {
  ElectricalTargetRegistry,
  type ElectricalConnectionTarget,
  type ElectricalTargetRegistrationOptions,
} from '../abilities/ElectricalTargetRegistry.ts';
import {
  VoltElectricalSystem,
  type VoltElectricalReadModel,
} from '../abilities/VoltElectricalSystem.ts';
import { EventBus } from '../core/EventBus.ts';
import type { Input } from '../core/Input.ts';
import type { LoopStats } from '../core/Loop.ts';
import {
  writePerformancePosition,
  type PerformanceGameplaySnapshot,
} from '../core/PerformanceSnapshot.ts';
import {
  ColliderTransformMode,
  CollisionHit,
  CollisionWorld,
} from '../physics/CollisionWorld.ts';
import { KinematicBody, type JumpInputState } from '../physics/KinematicBody.ts';
import { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import {
  PuzzleRegistry,
  type ResettablePuzzleComponent,
} from '../puzzle/PuzzleRegistry.ts';
import type { RenderLayer } from '../render/RenderLayer.ts';
import { VoltElectricalPresentation } from '../render/electrical/VoltElectricalPresentation.ts';
import {
  EMPTY_SLIME_HUD_SNAPSHOT,
  type SlimeHUDListener,
  type SlimeHUDSnapshot,
  type SlimePlayerSwitchFeedback,
} from '../slimes/SlimeHUDState.ts';
import { SlimeManager } from '../slimes/SlimeManager.ts';
import { PersistentSlimeGroup } from '../slimes/PersistentSlimeGroup.ts';
import { DeathSequence } from '../systems/DeathSequence.ts';
import { DeathScreen } from '../ui/DeathScreen.ts';
import {
  BlackoutCheckpointManager,
  type BlackoutCheckpointParticipant,
} from './BlackoutCheckpointManager.ts';
import { BLACKOUT_CHECKPOINTS } from './BlackoutFoundationManifest.ts';
import { BlackoutLevelScene } from './BlackoutLevelScene.ts';
import { BLACKOUT_SLIME_DEFINITIONS } from './BlackoutSlimeDefinitions.ts';
import {
  BlackoutPhaseController,
  type BlackoutCheckpointId,
  type BlackoutPhase,
  type BlackoutRoomState,
  type BlackoutRuntimeSnapshot,
} from './BlackoutRuntimeState.ts';
import type { GameLevelRuntimeEvents } from './GameLevelRuntime.ts';
import { LevelLifecycle, type LevelLifecycleState } from './LevelLifecycle.ts';
import {
  type LevelProgressionSnapshot,
  validateLevelThreeProgressionSnapshot,
} from './LevelProgression.ts';

const OUT_OF_BOUNDS_Y = -5;

export interface BlackoutLevelRuntimeOptions {
  readonly host: HTMLElement;
  readonly input: Input;
  readonly renderLayer: RenderLayer;
  readonly progression: LevelProgressionSnapshot;
}

interface BlackoutRuntimeResources {
  readonly scene: BlackoutLevelScene;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly puzzleRegistry: PuzzleRegistry;
  readonly electricalTargets: ElectricalTargetRegistry;
  readonly electricalSystem: VoltElectricalSystem<KinematicBody>;
  readonly electricalPresentation: VoltElectricalPresentation;
  readonly unregisterElectricalCheckpointParticipant: () => void;
  readonly manager: SlimeManager<KinematicBody>;
  readonly group: PersistentSlimeGroup<KinematicBody>;
  readonly checkpoints: BlackoutCheckpointManager<KinematicBody>;
  readonly phase: BlackoutPhaseController;
  readonly deathSequence: DeathSequence;
  readonly deathScreen: DeathScreen;
  readonly visuals: Readonly<Record<'bob' | 'goop' | 'volt', THREE.Mesh>>;
  readonly voltLight: THREE.PointLight;
  readonly movement: THREE.Vector3;
  readonly jump: JumpInputState;
  readonly safetyHit: CollisionHit;
  readonly safetyDisplacement: THREE.Vector3;
}

export class BlackoutLevelRuntime {
  readonly events = new EventBus<GameLevelRuntimeEvents>();

  private readonly host: HTMLElement;
  private readonly input: Input;
  private readonly renderLayer: RenderLayer;
  private readonly initialProgression: LevelProgressionSnapshot;
  private readonly lifecycle: LevelLifecycle;
  private readonly hudListeners = new Set<SlimeHUDListener>();
  private resources: BlackoutRuntimeResources | undefined;
  private debugInteractionEnabled = true;
  private switchSequence = 0;
  private currentRoom: BlackoutRoomState = {
    roomId: 'room-1',
    phase: 'three-slime',
    local: {},
  };
  private completionEmitted = false;

  constructor(options: BlackoutLevelRuntimeOptions) {
    validateLevelThreeProgressionSnapshot(options.progression);
    this.host = options.host;
    this.input = options.input;
    this.renderLayer = options.renderLayer;
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

  get phase(): BlackoutPhase {
    return this.resources?.phase.phase ?? 'three-slime';
  }

  get activeCheckpoint(): BlackoutRuntimeSnapshot | undefined {
    return this.resources?.checkpoints.activeCheckpoint;
  }

  get voltElectricalReadModel(): VoltElectricalReadModel | undefined {
    return this.resources?.electricalSystem.readModel;
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

  setDebugInteractionEnabled(enabled: boolean): void {
    this.debugInteractionEnabled = enabled;
    if (this.lifecycle.state === 'running' && this.resources) {
      this.input.setEnabled(
        enabled &&
        !this.resources.phase.terminal &&
        this.resources.deathSequence.isPlaying,
      );
      if (!enabled) {
        this.input.resetState();
        this.resources.electricalSystem.cancelAim();
        this.resources.electricalPresentation.update(
          this.resources.electricalSystem.readModel,
        );
        this.renderLayer.cameraRig.setAimPresentationActive(false);
        this.syncVisuals(this.resources);
      }
    }
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

  captureProgressionSnapshot(): LevelProgressionSnapshot {
    const resources = this.requireResources();
    return {
      unlockedSlimeIds: resources.manager.getRosterState()
        .filter((entry) => entry.unlocked)
        .map((entry) => entry.id),
      activeSlimeId: resources.manager.activeSlimeId!,
    };
  }

  registerCheckpointParticipant(participant: BlackoutCheckpointParticipant): () => void {
    return this.requireResources().checkpoints.registerParticipant(participant);
  }

  registerElectricalTarget(
    target: ElectricalConnectionTarget,
    options?: ElectricalTargetRegistrationOptions,
  ): () => void {
    return this.requireResources().electricalTargets.register(target, options);
  }

  registerPuzzleComponent(
    id: string,
    component: ResettablePuzzleComponent,
    groupId = 'default',
  ): void {
    this.requireResources().puzzleRegistry.register(id, component, groupId);
  }

  activateCheckpoint(checkpointId: BlackoutCheckpointId): void {
    const resources = this.requireResources();
    resources.checkpoints.activate(checkpointId, resources.group.activeSlimeId);
    const snapshot = resources.checkpoints.activeCheckpoint;
    this.currentRoom = snapshot.room;
    resources.phase.restore(snapshot.room.phase);
    this.events.emit('objectiveChanged', {
      roomId: snapshot.room.roomId,
      objective: objectiveFor(snapshot.room),
    });
  }

  captureCheckpoint(checkpointId: BlackoutCheckpointId, room: BlackoutRoomState): void {
    const resources = this.requireResources();
    resources.checkpoints.activate(
      checkpointId,
      resources.group.activeSlimeId,
      room,
    );
    this.currentRoom = {
      roomId: room.roomId,
      phase: room.phase,
      local: { ...room.local },
    };
  }

  recoverActiveCheckpoint(): void {
    this.restoreActiveCheckpoint(this.requireResources(), true);
  }

  /** Shared failure hook for hazards authored by later Blackout room issues. */
  requestFailure(): boolean {
    const resources = this.requireResources();
    if (this.lifecycle.state !== 'running' || resources.phase.terminal) return false;
    if (!resources.deathSequence.requestDeath(
      () => this.restoreActiveCheckpoint(resources, false),
    )) {
      return false;
    }
    resources.electricalSystem.reset('death');
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.renderLayer.cameraRig.setAimPresentationActive(false);
    this.input.setEnabled(false);
    this.input.resetState();
    this.input.releasePointerLock();
    this.host.dataset.gameState = resources.deathSequence.state;
    return true;
  }

  /**
   * Integration hook for #127 and the boss/split issues. Illegal or duplicate
   * transitions are rejected; completion commits before its one-shot event.
   */
  transitionPhase(next: BlackoutPhase): boolean {
    const resources = this.requireResources();
    if (!resources.phase.transition(next)) return false;
    if (next === 'merging') {
      resources.electricalSystem.disconnect('merge');
      resources.electricalSystem.cancelAim();
      this.renderLayer.cameraRig.setAimPresentationActive(false);
    } else if (next === 'complete') {
      resources.electricalSystem.disconnect('completion');
      resources.electricalSystem.cancelAim();
      this.renderLayer.cameraRig.setAimPresentationActive(false);
    }
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.currentRoom = {
      ...this.currentRoom,
      phase: next,
      roomId:
        next === 'specimen' || next === 'merging' ? 'room-4a'
        : next === 'boss' || next === 'boss-defeated' ? 'room-4b'
        : next === 'splitting' || next === 'escape' || next === 'complete' ? 'ending'
        : this.currentRoom.roomId,
    };
    if (next === 'complete') this.commitCompletion();
    return true;
  }

  fixedUpdate(deltaSeconds: number): void {
    if (this.lifecycle.state !== 'running') return;
    const resources = this.requireResources();
    if (resources.phase.terminal) {
      this.input.endFixedUpdate();
      return;
    }
    if (!resources.deathSequence.isPlaying) {
      if (resources.deathSequence.update(deltaSeconds)) {
        resources.deathScreen.show();
        this.host.dataset.gameState = resources.deathSequence.state;
      }
      this.input.endFixedUpdate();
      return;
    }

    resources.scene.updateElectricalFixtures(deltaSeconds);

    let switched = false;
    if (
      this.currentRoom.phase === 'three-slime' || this.currentRoom.phase === 'escape'
    ) {
      if (this.input.wasPressed('switchSlime')) {
        const previous = resources.group.activeSlimeId;
        switched = resources.group.switchNext();
        if (switched) {
          this.input.resetState();
          resources.movement.set(0, 0, 0);
          clearJump(resources.jump, true);
          this.retargetCamera(resources);
          this.switchSequence += 1;
          this.notifyHUD({
            sequence: this.switchSequence,
            previousSlimeId: previous,
            activeSlimeId: resources.group.activeSlimeId,
          });
        }
      }
    }

    const moveX = (this.input.isDown('moveRight') ? 1 : 0) -
      (this.input.isDown('moveLeft') ? 1 : 0);
    const moveZ = (this.input.isDown('moveBackward') ? 1 : 0) -
      (this.input.isDown('moveForward') ? 1 : 0);

    const body = resources.group.activeBody;
    if (!switched) {
      this.renderLayer.cameraRig.queueLookInput(
        this.input.pointerDeltaX,
        this.input.pointerDeltaY,
      );
      this.renderLayer.cameraRig.applyQueuedLookInput();
      if (body.usingSurfaceGravity) {
        this.renderLayer.cameraRig.copySurfaceMovementDirection(
          moveX,
          moveZ,
          body.gameplayUp,
          resources.movement,
        );
      } else {
        this.renderLayer.cameraRig.copyGroundMovementDirection(
          moveX,
          moveZ,
          resources.movement,
        );
      }
      resources.jump.pressed = this.input.wasPressed('jump');
      resources.jump.held = this.input.isDown('jump');
      resources.jump.released = this.input.wasReleased('jump');
      resources.jump.cancelled = this.input.wasClearedSinceFixedUpdate;
      body.update(deltaSeconds, resources.movement, resources.jump);
    }

    resources.electricalSystem.update(deltaSeconds, {
      aimHeld: this.input.isDown('aimAbility'),
      fireHeld: this.input.isDown('fireAbility'),
      firePressed: this.input.wasPressed('fireAbility'),
      gameplayInputEnabled:
        this.input.enabled && this.currentRoom.phase === 'three-slime',
      pointerLocked: this.input.pointerLocked,
    });
    this.renderLayer.cameraRig.setAimPresentationActive(
      resources.electricalSystem.readModel.aimActive,
    );
    resources.electricalPresentation.update(resources.electricalSystem.readModel);

    // Inactive Level 3 bodies deliberately keep their exact positions while
    // preserving their colliders/passive state. A switch itself never updates,
    // teleports, recreates or unregisters them.
    for (const slimeBody of resources.group.bodies) {
      if (slimeBody.position.y < OUT_OF_BOUNDS_Y) {
        this.requestFailure();
        this.input.endFixedUpdate();
        return;
      }
    }

    this.syncVisuals(resources);
    this.input.endFixedUpdate();
  }

  render(interpolationAlpha: number, stats: Readonly<LoopStats>): void {
    const resources = this.resources;
    if (resources) {
      this.syncVisuals(resources);
      resources.electricalPresentation.update(
        resources.electricalSystem.readModel,
      );

      // Render frames can run without a fixed update when the display refresh
      // rate exceeds the 60 Hz simulation rate. Queue the current pointer
      // displacement before clearing it so those render-only samples still
      // reach CameraRig.update(). This mirrors the Level 1/2 input contract and
      // prevents Volt's centre-ray aim from becoming refresh-rate dependent.
      if (
        this.lifecycle.state === 'running' &&
        resources.deathSequence.isPlaying &&
        !resources.phase.terminal &&
        this.input.enabled
      ) {
        this.renderLayer.cameraRig.queueLookInput(
          this.input.pointerDeltaX,
          this.input.pointerDeltaY,
        );
      }
    }
    this.input.endPointerUpdate();
    this.renderLayer.cameraRig.update(interpolationAlpha, stats.frameDeltaSeconds);
    this.renderLayer.render();
  }

  writePerformanceSnapshot(target: PerformanceGameplaySnapshot): void {
    const resources = this.resources;
    target.level = 'blackout-level-3';
    target.room = this.currentRoom.roomId;
    target.gameplayState = resources?.phase.phase ?? this.lifecycle.state;
    target.cutsceneState = 'none';
    target.activeSlime = resources?.manager.activeSlimeId ?? 'none';
    writePerformancePosition(target.cameraPosition, this.renderLayer.cameraRig.camera.position);
    if (!resources) {
      target.bobPosition.fill(0);
      target.goopPosition.fill(0);
      target.collisionRegistered = 0;
      target.collisionEligible = 0;
      target.collisionCandidates = 0;
      target.collisionNarrowChecks = 0;
      return;
    }
    writePerformancePosition(target.bobPosition, resources.group.bobBody.position);
    writePerformancePosition(target.goopPosition, resources.group.goopBody.position);
    target.collisionRegistered = resources.collisionWorld.colliderCount;
    target.collisionEligible = resources.collisionWorld.lastSweepEligibleColliderCount;
    target.collisionCandidates = resources.collisionWorld.lastSweepBroadphaseCandidateCount;
    target.collisionNarrowChecks = resources.collisionWorld.lastSweepNarrowPhaseCheckCount;
  }

  private readonly loadResources = (): void => {
    const scene = new BlackoutLevelScene();
    const collisionWorld = new CollisionWorld();
    const surfaceRegistry = new SurfaceRegistry();
    const puzzleRegistry = new PuzzleRegistry();
    const rollbackActions: Array<() => void> = [];
    const rollback = (action: () => void): void => {
      rollbackActions.push(action);
    };

    try {
      this.renderLayer.scene.add(scene.root);
      collisionWorld.registerAll(
        scene.collisionMeshes,
        undefined,
        ColliderTransformMode.Static,
      );
      surfaceRegistry.registerAll(scene.collisionMeshes);

      const manager = new SlimeManager<KinematicBody>(
        BLACKOUT_SLIME_DEFINITIONS,
        this.initialProgression.activeSlimeId,
      );
      rollback(() => manager.dispose());
      const cp1 = BLACKOUT_CHECKPOINTS[0]!;
      const makeBody = (id: 'bob' | 'goop' | 'volt') => {
        const definition = manager.getDefinition(id);
        return new KinematicBody({
          world: collisionWorld,
          surfaces: surfaceRegistry,
          initialPosition: cp1.bodyPositions[id],
          config: {
            adhesionEnabled: definition.abilities.adhesion,
            reboundEnabled: definition.abilities.rebound,
            chargedJumpEnabled: definition.jumpMode === 'charged',
          },
        });
      };
      const bodies = {
        bob: makeBody('bob'),
        goop: makeBody('goop'),
        volt: makeBody('volt'),
      };
      const initialActive =
        this.initialProgression.activeSlimeId === 'bob' ||
        this.initialProgression.activeSlimeId === 'goop' ||
        this.initialProgression.activeSlimeId === 'volt'
          ? this.initialProgression.activeSlimeId
          : 'volt';
      const group = new PersistentSlimeGroup({
        manager,
        bodies,
        spawnPositions: cp1.bodyPositions,
        initialActiveSlimeId: initialActive,
      });

      const safetyHit = new CollisionHit();
      const safetyDisplacement = new THREE.Vector3();
      const isSpawnSafe = (position: THREE.Vector3, clearanceRadius: number): boolean => {
        const directions: readonly (readonly [number, number, number])[] = [
          [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0],
        ];
        for (const [x, y, z] of directions) {
          safetyDisplacement.set(x, y, z).multiplyScalar(0.02);
          if (
            collisionWorld.sweepSphere(
              position,
              safetyDisplacement,
              clearanceRadius,
              safetyHit,
            ) && safetyHit.fraction <= 1e-5
          ) return false;
        }
        return true;
      };

      const checkpoints = new BlackoutCheckpointManager<KinematicBody>(
        cp1,
        isSpawnSafe,
        initialActive,
      );
      for (const checkpoint of BLACKOUT_CHECKPOINTS.slice(1)) {
        checkpoints.registerCheckpoint(checkpoint);
      }
      checkpoints.activate('cp1', initialActive);

      const phase = new BlackoutPhaseController('three-slime');
      const deathSequence = new DeathSequence();
      const deathScreen = new DeathScreen({
        onRetry: this.retryAfterDeath,
        backgroundElements: [this.renderLayer.canvas],
      });
      rollback(() => deathScreen.dispose());
      this.host.append(deathScreen.element);
      const visuals = {
        bob: createSlimeVisual(0x44c7d8, 0x123941),
        goop: createSlimeVisual(0x7ad13d, 0x233d12),
        volt: createSlimeVisual(0xffdf45, 0x6d5600),
      } as const;
      for (const visual of Object.values(visuals)) {
        // Arm cleanup before attachment. THREE.Scene.add mutates parentage
        // before returning, so an injected/observer failure after attachment
        // must still remove and dispose the just-added visual.
        rollback(() => disposeSlimeVisual(visual));
        this.renderLayer.scene.add(visual);
      }
      const voltLight = new THREE.PointLight(0xffdf75, 2.2, 8, 2);
      voltLight.name = 'blackout-volt-foundation-light';
      voltLight.castShadow = false;
      visuals.volt.add(voltLight);

      const electricalTargets = new ElectricalTargetRegistry(collisionWorld);
      rollback(() => electricalTargets.dispose());
      for (const target of scene.electricalTargets) {
        electricalTargets.register(target, {
          transformMode:
            target.id === 'fixture-moving'
              ? ColliderTransformMode.Dynamic
              : ColliderTransformMode.Static,
        });
      }

      const electricalSystem = new VoltElectricalSystem<KinematicBody>({
        slimeManager: manager,
        collisionWorld,
        targetRegistry: electricalTargets,
        aimRayProvider: this.renderLayer.cameraRig,
      });
      rollback(() => electricalSystem.dispose());

      const unregisterElectricalCheckpointParticipant =
        checkpoints.registerParticipant({
          id: 'volt-electrical-connection',
          capture: () => ({ connected: false }),
          restore: () => {
            // Live tethers are intentionally transient. Device participants
            // restore authored/latching state independently.
          },
          resetTransient: () => {
            electricalSystem.disconnect('reset');
          },
        });
      rollback(unregisterElectricalCheckpointParticipant);

      const electricalPresentation = new VoltElectricalPresentation({
        scene: this.renderLayer.scene,
        host: this.host,
      });
      rollback(() => electricalPresentation.dispose());

      this.resources = {
        scene,
        collisionWorld,
        surfaceRegistry,
        puzzleRegistry,
        electricalTargets,
        electricalSystem,
        electricalPresentation,
        unregisterElectricalCheckpointParticipant,
        manager,
        group,
        checkpoints,
        phase,
        deathSequence,
        deathScreen,
        visuals,
        voltLight,
        movement: new THREE.Vector3(),
        jump: { pressed: false, held: false, released: false, cancelled: false },
        safetyHit,
        safetyDisplacement,
      };

      this.currentRoom = checkpoints.activeCheckpoint.room;
      this.completionEmitted = false;
      this.syncVisuals(this.resources);
      this.resources.electricalPresentation.update(
        this.resources.electricalSystem.readModel,
      );
      this.retargetCamera(this.resources);
      this.host.dataset.gameState = 'playing';
      this.notifyHUD(undefined, true);
      this.events.emit('objectiveChanged', {
        roomId: this.currentRoom.roomId,
        objective: objectiveFor(this.currentRoom),
      });
      rollbackActions.length = 0;
    } catch (error) {
      for (let index = rollbackActions.length - 1; index >= 0; index -= 1) {
        try {
          rollbackActions[index]?.();
        } catch {
          // Preserve the construction error while best-effort cleanup continues.
        }
      }
      scene.dispose();
      collisionWorld.clear();
      surfaceRegistry.clear();
      this.renderLayer.cameraRig.clearFollowTarget();
      this.input.setEnabled(false);
      this.resources = undefined;
      this.input.releasePointerLock();
      throw error;
    }
  };

  private readonly startResources = (): void => {
    const resources = this.requireResources();
    this.input.resetState();
    this.input.setEnabled(
      this.debugInteractionEnabled &&
      !resources.phase.terminal &&
      resources.deathSequence.isPlaying,
    );
  };

  private readonly stopResources = (): void => {
    const resources = this.requireResources();
    resources.electricalSystem.cancelAim();
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.renderLayer.cameraRig.setAimPresentationActive(false);
    this.syncVisuals(resources);
    this.input.setEnabled(false);
    this.input.resetState();
  };

  private readonly restartResources = (): void => {
    const resources = this.requireResources();
    this.input.resetState();
    resources.deathSequence.reset();
    resources.deathScreen.hide();
    resources.electricalSystem.reset('restart');
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.renderLayer.cameraRig.setAimPresentationActive(false);
    resources.checkpoints.resetToInitial();
    resources.puzzleRegistry.reset();
    const snapshot = resources.checkpoints.recover(resources.group);
    this.currentRoom = snapshot.room;
    resources.phase.restore(snapshot.room.phase);
    resources.movement.set(0, 0, 0);
    clearJump(resources.jump, false);
    this.completionEmitted = false;
    this.renderLayer.cameraRig.reset();
    this.retargetCamera(resources);
    this.syncVisuals(resources);
    this.host.dataset.gameState = 'playing';
    this.notifyHUD(undefined, true);
    this.events.emit('objectiveChanged', {
      roomId: this.currentRoom.roomId,
      objective: objectiveFor(this.currentRoom),
    });
  };

  private readonly unloadResources = (): void => {
    const resources = this.requireResources();
    this.input.setEnabled(false);
    this.input.resetState();
    this.input.releasePointerLock();
    this.renderLayer.cameraRig.clearFollowTarget();
    resources.deathSequence.reset();
    resources.deathScreen.dispose();
    resources.electricalPresentation.dispose();
    resources.electricalSystem.dispose();
    resources.unregisterElectricalCheckpointParticipant();
    resources.electricalTargets.dispose();

    for (const visual of Object.values(resources.visuals)) {
      disposeSlimeVisual(visual);
    }
    resources.puzzleRegistry.clear();
    resources.manager.clearLevelRegistrations();
    resources.manager.dispose();
    resources.scene.dispose();
    resources.collisionWorld.clear();
    resources.surfaceRegistry.clear();
    delete this.host.dataset.gameState;
    this.resources = undefined;
    this.currentRoom = { roomId: 'room-1', phase: 'three-slime', local: {} };
    this.completionEmitted = false;
    this.notifyHUD(undefined, true);
  };

  private restoreActiveCheckpoint(
    resources: BlackoutRuntimeResources,
    resumeInput: boolean,
  ): void {
    this.input.setEnabled(false);
    this.input.resetState();
    resources.electricalSystem.reset('reset');
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.renderLayer.cameraRig.setAimPresentationActive(false);
    resources.puzzleRegistry.reset();
    const snapshot = resources.checkpoints.recover(resources.group);
    this.currentRoom = snapshot.room;
    resources.phase.restore(snapshot.room.phase);
    resources.movement.set(0, 0, 0);
    clearJump(resources.jump, true);
    this.renderLayer.cameraRig.reset();
    this.retargetCamera(resources);
    this.syncVisuals(resources);
    this.notifyHUD(undefined, true);
    this.events.emit('objectiveChanged', {
      roomId: snapshot.room.roomId,
      objective: objectiveFor(snapshot.room),
    });
    if (
      resumeInput &&
      this.lifecycle.state === 'running' &&
      this.debugInteractionEnabled &&
      !resources.phase.terminal &&
      resources.deathSequence.isPlaying
    ) {
      this.input.setEnabled(true);
    }
  }

  private readonly retryAfterDeath = (): void => {
    const resources = this.requireResources();
    if (!resources.deathSequence.completeRetry()) return;
    resources.deathScreen.hide();
    this.host.dataset.gameState = 'playing';
    if (
      this.lifecycle.state === 'running' &&
      this.debugInteractionEnabled &&
      !resources.phase.terminal
    ) {
      this.input.setEnabled(true);
      this.input.requestPointerLock();
    }
  };

  private retargetCamera(resources: BlackoutRuntimeResources): void {
    this.renderLayer.cameraRig.setFollowTarget(
      resources.group.activeBody,
      resources.collisionWorld,
    );
  }

  private syncVisuals(resources: BlackoutRuntimeResources): void {
    resources.visuals.bob.position.copy(resources.group.bobBody.position);
    resources.visuals.goop.position.copy(resources.group.goopBody.position);
    resources.visuals.volt.position.copy(resources.group.voltBody.position);

    // Hide only Volt's body material during his near-first-person aim pose.
    // The Object3D remains visible so the child point light continues to
    // illuminate the scene while the mesh cannot obscure the crosshair.
    const hideVoltBody =
      resources.manager.activeSlimeId === 'volt' &&
      resources.electricalSystem.readModel.aimActive;
    const voltMaterials = Array.isArray(resources.visuals.volt.material)
      ? resources.visuals.volt.material
      : [resources.visuals.volt.material];
    for (const material of voltMaterials) {
      material.visible = !hideVoltBody;
    }
  }

  private commitCompletion(): void {
    const resources = this.requireResources();
    if (this.completionEmitted || !resources.phase.terminal) return;
    this.completionEmitted = true;
    resources.electricalSystem.disconnect('completion');
    resources.electricalSystem.cancelAim();
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.renderLayer.cameraRig.setAimPresentationActive(false);
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.host.dataset.gameState = 'complete';
    // Commit terminal state before observers are allowed to react.
    this.events.emit('completed', {
      levelId: 'level-3',
      nextLevelId: 'complete',
    });
  }

  private notifyHUD(
    feedback?: SlimePlayerSwitchFeedback,
    resetSwitchFeedback = false,
  ): void {
    const resources = this.resources;
    const snapshot: SlimeHUDSnapshot = resources
      ? {
          roster: resources.manager.getRosterState(),
          activeSlimeId: resources.manager.activeSlimeId,
          passiveInteractions: [],
          playerSwitchFeedback: feedback,
          resetSwitchFeedback,
        }
      : EMPTY_SLIME_HUD_SNAPSHOT;
    for (const listener of this.hudListeners) listener(snapshot);
  }

  private requireResources(): BlackoutRuntimeResources {
    if (!this.resources) throw new Error('Blackout runtime resources are not loaded.');
    return this.resources;
  }
}

function createSlimeVisual(colour: number, emissive: number): THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> {
  const visual = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 20, 14),
    new THREE.MeshStandardMaterial({
      color: colour,
      emissive,
      emissiveIntensity: 0.7,
      roughness: 0.35,
    }),
  );
  visual.name = 'blackout-foundation-slime';
  return visual;
}

function disposeSlimeVisual(visual: THREE.Mesh): void {
  visual.removeFromParent();
  visual.geometry.dispose();
  const materials = Array.isArray(visual.material)
    ? visual.material
    : [visual.material];
  for (const material of materials) material.dispose();
}

function clearJump(state: JumpInputState, cancelled: boolean): void {
  state.pressed = false;
  state.held = false;
  state.released = false;
  state.cancelled = cancelled;
}

function objectiveFor(room: BlackoutRoomState): string {
  switch (room.roomId) {
    case 'room-1': return 'Use Volt to bring the restricted sector back online';
    case 'room-2': return 'Coordinate Bob, Goop, and Volt';
    case 'room-3': return 'Reach the experimental core';
    case 'room-4a': return 'Enter the merge chamber';
    case 'room-4b': return 'Defeat the facility defence system';
    case 'ending': return room.phase === 'complete' ? 'Escape complete' : 'Escape the facility';
  }
}
