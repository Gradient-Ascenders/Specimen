import * as THREE from 'three';

import {
  createAuthoredDissolveTarget,
  type DissolveTarget,
} from '../abilities/DissolveTarget.ts';
import { AcidProjectileSystem } from '../abilities/AcidProjectileSystem.ts';
import { DissolveSystem } from '../abilities/DissolveSystem.ts';
import { EventBus } from '../core/EventBus.ts';
import type { Input } from '../core/Input.ts';
import type { LoopStats } from '../core/Loop.ts';
import {
  CultivationTestPanel,
  type CultivationDebugRoomId,
} from '../debug/CultivationTestPanel.ts';
import {
  RadioactiveHazardSystem,
  type RadiationContactTarget,
} from '../hazards/RadioactiveHazardSystem.ts';
import { RoomThreeDroneEncounter } from '../hazards/RoomThreeDroneEncounter.ts';
import { CollisionWorld } from '../physics/CollisionWorld.ts';
import {
  KinematicBody,
  type JumpInputState,
} from '../physics/KinematicBody.ts';
import { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import {
  DropToAcidAssembly,
  RopeCatchAssembly,
  type SuspendedStructureAssembly,
} from '../puzzle/SuspendedStructureAssembly.ts';
import { VerticalBlastDoor } from '../puzzle/VerticalBlastDoor.ts';
import { WallButton } from '../puzzle/WallButton.ts';
import { WallButtonDoorCoordinator } from '../puzzle/WallButtonDoorCoordinator.ts';
import { BlobFacing } from '../render/BlobFacing.ts';
import { GoopAcidPresentation } from '../render/acid/GoopAcidPresentation.ts';
import { DroneProjectilePresentation } from '../render/hazards/DroneProjectilePresentation.ts';
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
import { CultivationRoomThreeController } from './CultivationRoomThreeController.ts';
import { CULTIVATION_ROOM_THREE_DRONE_AUTHORING } from './CultivationRoomThreeAuthoring.ts';
import type { GameLevelRuntimeEvents } from './GameLevelRuntime.ts';
import { LevelLifecycle, type LevelLifecycleState } from './LevelLifecycle.ts';
import {
  CULTIVATION_ROOM_OBJECTIVES,
  LevelTwoPreviewScene,
  type LevelTwoAuthoredRoomId,
  type LevelTwoPreviewHazardFailure,
} from './LevelTwoPreviewScene.ts';
import {
  advanceLevelTwoPreviewProgression,
  createLevelTwoPreviewProgression,
  type LevelTwoPreviewProgressionSnapshot,
} from './LevelTwoPreviewProgression.ts';
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
  readonly authoredPreview: LevelTwoPreviewScene | undefined;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly dissolveTargets: readonly DissolveTarget[];
  readonly previewDissolveTargets: readonly DissolveTarget[];
  readonly dissolveSystem: DissolveSystem;
  readonly acidProjectileSystem: AcidProjectileSystem<KinematicBody>;
  readonly goopAcidPresentation: GoopAcidPresentation;
  readonly roomThreeEncounter: RoomThreeDroneEncounter | undefined;
  readonly roomThreeController: CultivationRoomThreeController | undefined;
  readonly droneProjectilePresentation: DroneProjectilePresentation | undefined;
  readonly structuralAssemblies: readonly SuspendedStructureAssembly[];
  readonly wallButton: WallButton<KinematicBody>;
  readonly blastDoor: VerticalBlastDoor;
  readonly buttonDoorCoordinator: WallButtonDoorCoordinator<KinematicBody>;
  readonly manager: SlimeManager<KinematicBody>;
  readonly pair: PersistentSlimePair<KinematicBody>;
  readonly controller: CultivationLevelController;
  readonly radiation: RadioactiveHazardSystem;
  readonly radiationTargets: readonly RadiationContactTarget[];
  readonly previewOccupants: readonly [
    {
      readonly id: 'bob';
      readonly position: KinematicBody['position'];
      readonly radiusMetres: number;
      readonly attached: boolean;
      readonly supportCollider: THREE.Mesh | null;
    },
    {
      readonly id: 'goop';
      readonly position: KinematicBody['position'];
      readonly radiusMetres: number;
      readonly attached: boolean;
      readonly supportCollider: THREE.Mesh | null;
    },
  ];
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
  private authoredPreviewProgression:
    | LevelTwoPreviewProgressionSnapshot
    | undefined;
  private authoredPreviewRecoveryActiveSlimeId: PlayableSlimeId | undefined;
  private readonly authoredPreviewResolvedRooms = {
    bob: 1 as LevelTwoAuthoredRoomId,
    goop: 1 as LevelTwoAuthoredRoomId,
  };
  private readonly roomThreeSlimeEligibility = { bob: false, goop: false };

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

  private get authoredPreviewRoomId(): LevelTwoAuthoredRoomId | undefined {
    return this.authoredPreviewProgression?.roomId;
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
    if (
      resources.controller.readModel.state === 'complete' ||
      resources.roomThreeController?.readModel.complete
    ) {
      this.input.setEnabled(false);
      this.input.releasePointerLock();
      this.input.endFixedUpdate();
      return;
    }
    if (this.debugAvailable && this.input.wasPressed('debugReset')) {
      this.restartLevel();
      return;
    }
    const debugRoomId = this.consumeAuthoredPreviewTeleport();
    if (debugRoomId !== undefined) {
      this.teleportToAuthoredPreviewRoom(debugRoomId);
      this.input.endFixedUpdate();
      return;
    }

    let switched = false;
    if (this.input.wasPressed('switchSlime')) switched = this.switchActive(resources);
    const moveX = (this.input.isDown('moveRight') ? 1 : 0) - (this.input.isDown('moveLeft') ? 1 : 0);
    const moveZ = (this.input.isDown('moveBackward') ? 1 : 0) - (this.input.isDown('moveForward') ? 1 : 0);
    if (!switched) {
      this.renderLayer.cameraRig.queueLookInput(this.input.pointerDeltaX, this.input.pointerDeltaY);
      this.renderLayer.cameraRig.applyQueuedLookInput();
      const activeBody = resources.pair.activeBody;
      if (activeBody.usingSurfaceGravity) {
        this.renderLayer.cameraRig.copySurfaceMovementDirection(
          moveX,
          moveZ,
          activeBody.gameplayUp,
          resources.movement,
        );
      } else {
        this.renderLayer.cameraRig.copyGroundMovementDirection(
          moveX,
          moveZ,
          resources.movement,
        );
      }
      resources.jumpInputState.pressed = this.input.wasPressed('jump');
      resources.jumpInputState.held = this.input.isDown('jump');
      resources.jumpInputState.released = this.input.wasReleased('jump');
      resources.jumpInputState.cancelled = this.input.wasClearedSinceFixedUpdate;
    } else {
      resources.movement.set(0, 0, 0);
      this.clearJumpInput(resources.jumpInputState, true);
    }

    const activeBody = resources.pair.activeBody;
    if (this.authoredPreviewRoomId === undefined) {
      this.updateStructuralAssemblies(deltaSeconds, resources);
    }
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

    const authoredPreview = resources.authoredPreview;
    const authoredProgression = this.authoredPreviewProgression;
    if (authoredPreview && authoredProgression) {
      const resolvedRooms = this.authoredPreviewResolvedRooms;
      resolvedRooms.bob = authoredPreview.resolveRoomId(
        resources.pair.bobBody.position,
      );
      resolvedRooms.goop = authoredPreview.resolveRoomId(
        resources.pair.goopBody.position,
      );
      const roomThreeEligibility = this.roomThreeSlimeEligibility;
      roomThreeEligibility.bob = resolvedRooms.bob === 3;
      roomThreeEligibility.goop = resolvedRooms.goop === 3;
      if (
        (roomThreeEligibility.bob || roomThreeEligibility.goop) &&
        resources.roomThreeEncounter &&
        resources.roomThreeController
      ) {
        resources.roomThreeEncounter.update(
          deltaSeconds,
          resources.pair.activeSlimeId,
          !switched && activeBody === resources.pair.bobBody
            ? resources.movement
            : resources.noMovement,
          roomThreeEligibility,
        );
        resources.roomThreeController.update(
          resources.previewOccupants[0],
          resources.previewOccupants[1],
        );
        if (resources.roomThreeController.readModel.complete) {
          this.host.dataset.gameState = 'level-complete';
          this.input.setEnabled(false);
          this.input.releasePointerLock();
          this.input.endFixedUpdate();
          return;
        }
      }
      authoredPreview.update(
        deltaSeconds,
        authoredProgression.roomId,
        resources.previewOccupants,
      );
      if (resources.deathSequence.isPlaying) {
        for (const occupant of resources.previewOccupants) {
          if (occupant.position.y >= CULTIVATION_FOUNDATION_MANIFEST.outOfBoundsYMetres) {
            continue;
          }
          this.requestPlayerDeath(
            () => this.resetAndRecoverAuthoredPreviewRoom(resources),
            occupant.id,
          );
          break;
        }
      }
      // A fatal frame must not also promote the checkpoint that Retry restores.
      if (resources.deathSequence.isPlaying) {
        const nextProgression = advanceLevelTwoPreviewProgression(
          authoredProgression,
          resolvedRooms,
        );
        if (nextProgression !== authoredProgression) {
          this.authoredPreviewProgression = nextProgression;
          this.captureAuthoredPreviewCheckpoint(resources);
          if (nextProgression.roomId !== authoredProgression.roomId) {
            this.emitAuthoredPreviewObjective();
          }
        }
      }
    } else {
      resources.radiation.update(resources.radiationTargets);
      if (resources.deathSequence.isPlaying) resources.controller.update();
      resources.buttonDoorCoordinator.update(deltaSeconds);
    }
    resources.acidProjectileSystem.update(deltaSeconds, {
      aimHeld: this.input.isDown('aimAbility'),
      firePressed: this.input.wasPressed('fireAbility'),
      gameplayInputEnabled: this.input.enabled,
      pointerLocked: this.input.pointerLocked,
    });
    resources.dissolveSystem.update(deltaSeconds);
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
    resources.goopAcidPresentation.update(
      interpolationAlpha,
      stats.frameDeltaSeconds,
      this.lifecycle.state === 'running' &&
        resources.deathSequence.isPlaying &&
        resources.controller.readModel.state === 'playing' &&
        this.input.enabled,
      this.lifecycle.state === 'running' && resources.deathSequence.isPlaying,
    );
    resources.droneProjectilePresentation?.update(interpolationAlpha);
    this.renderLayer.render();

    this.debugElapsedSeconds += stats.rawFrameDeltaSeconds;
    if (this.debugVisible && resources.debugPanel && this.debugElapsedSeconds >= 0.25) {
      this.debugElapsedSeconds = 0;
      const readModel = resources.controller.readModel;
      const assemblyDiagnostics = resources.structuralAssemblies.map((assembly) => {
        const diagnostics = assembly.getDiagnostics();
        return `${diagnostics.id} / ${diagnostics.supportTargetId}: ${diagnostics.state} p=${diagnostics.supportProgress.toFixed(2)}/${diagnostics.travelProgress.toFixed(2)} pos=${diagnostics.position.map((value) => value.toFixed(2)).join(',')} collision=${diagnostics.collisionEnabled ? 'on' : 'off'} transitions=${diagnostics.transitionCount}`;
      });
      const doorObstructions = [...resources.blastDoor.obstructionIds];
      resources.debugPanel.setRuntimeDiagnostics([
        `active level: cultivation-level-2`,
        `geometry mode: ${this.authoredPreviewRoomId === undefined ? 'backend foundation' : `authored Room ${this.authoredPreviewRoomId}`}`,
        `authored recovery B/G: ${this.authoredPreviewProgression?.recoveryRoomIds.bob ?? '-'} / ${this.authoredPreviewProgression?.recoveryRoomIds.goop ?? '-'}`,
        `lifecycle / gameplay: ${this.state} / ${readModel.state}`,
        `active slime: ${resources.pair.activeSlimeId}`,
        `Bob: ${this.formatPosition(resources.pair.bobBody.position)} m`,
        `Goop: ${this.formatPosition(resources.pair.goopBody.position)} m`,
        `checkpoint / group: ${readModel.checkpointId} / ${readModel.puzzleGroupId}`,
        `room / entries B,G: ${readModel.roomId} / ${readModel.bobEnteredRoomThree ? 'yes' : 'no'},${readModel.goopEnteredRoomThree ? 'yes' : 'no'}`,
        `early Goop Room 2: ${readModel.goopEnteredRoomTwoEarly ? 'yes' : 'no'}`,
        `last failure / death slime: ${readModel.lastFailure} / ${this.lastDeathSlimeId ?? 'none'}`,
        `radiation requests: ${resources.radiation.failureRequestCount}`,
        ...this.formatRoomThreeDiagnostics(resources),
        `bodies / colliders / scene objects: ${resources.manager.registeredCount} / ${resources.collisionWorld.colliderCount} / ${this.renderLayer.getDiagnostics().sceneObjects}`,
        `wall button: ${resources.wallButton.isPressed ? 'pressed' : 'released'} occupant=${resources.wallButton.occupantId ?? 'none'} enabled=${resources.wallButton.enabled ? 'yes' : 'no'}`,
        `blast door: ${resources.blastDoor.state} p=${resources.blastDoor.progress.toFixed(3)} target=${resources.blastDoor.desiredOpen ? 'open' : 'closed'} collision=${resources.blastDoor.collisionEnabled ? 'on' : 'off'} obstruction=${doorObstructions.join(',') || 'none'} transitions=${resources.blastDoor.transitionCount}`,
        ...assemblyDiagnostics,
      ].join('\n'));
    }
  }

  private readonly loadResources = (): void => {
    this.authoredPreviewProgression = undefined;
    this.authoredPreviewRecoveryActiveSlimeId = undefined;
    const rollbackActions: Array<() => void> = [];
    const rollback = (action: () => void): void => {
      rollbackActions.push(action);
    };

    try {
      const scene = new CultivationLevelScene(CULTIVATION_FOUNDATION_MANIFEST);
      rollback(() => scene.dispose());
      this.renderLayer.scene.add(scene.root);
      const authoredPreview = this.debugAvailable
        ? new LevelTwoPreviewScene((failure) =>
            this.handleAuthoredPreviewFailure(failure),
          )
        : undefined;
      if (authoredPreview) {
        rollback(() => authoredPreview.dispose());
        this.renderLayer.scene.add(authoredPreview.root);
      }

      const collisionWorld = new CollisionWorld();
      rollback(() => collisionWorld.clear());
      collisionWorld.registerAll(scene.collisionMeshes);
      if (authoredPreview) {
        collisionWorld.registerAll(authoredPreview.collisionMeshes);
      }

      const surfaceRegistry = new SurfaceRegistry();
      rollback(() => surfaceRegistry.clear());
      surfaceRegistry.registerAll(scene.collisionMeshes);
      if (authoredPreview) {
        surfaceRegistry.registerAll(authoredPreview.collisionMeshes);
      }

      const solubleMeshes = authoredPreview
        ? [
            ...scene.solubleSupportMeshes,
            ...authoredPreview.solubleTargetMeshes,
          ]
        : scene.solubleSupportMeshes;
      const dissolveTargets = solubleMeshes.map((mesh) => {
        const target = createAuthoredDissolveTarget(
          mesh,
          collisionWorld,
          surfaceRegistry,
        );
        if (!target) {
          throw new Error(`Cultivation support "${mesh.name}" is not authored as soluble.`);
        }
        rollback(() => target.dispose());
        return target;
      });
      const previewDissolveTargets = dissolveTargets.slice(
        scene.solubleSupportMeshes.length,
      );
      authoredPreview?.bindDissolveTargets(previewDissolveTargets);
      const targetById = new Map(dissolveTargets.map((target) => [target.id, target]));
      const structuralAssemblies = CULTIVATION_FOUNDATION_MANIFEST.structuralAssemblies.map(
        (authoring): SuspendedStructureAssembly => {
          const supportTarget = targetById.get(authoring.supportTargetId);
          if (!supportTarget) {
            throw new Error(
              `Assembly "${authoring.id}" references missing support "${authoring.supportTargetId}".`,
            );
          }
          const commonOptions = {
            id: authoring.id,
            supportTargetId: authoring.supportTargetId,
            supportRole: authoring.supportRole,
            supportTarget,
            collisionWorld,
            surfaceRegistry,
            initialPosition: authoring.initialPosition,
            finalPosition: authoring.finalPosition,
            size: authoring.movingSize,
            releaseDelaySeconds: authoring.releaseDelaySeconds,
            travelDurationSeconds: authoring.travelDurationSeconds,
            collisionWhileSuspended: true,
            collisionDuringTravel: true,
            collisionAtRest: true,
            finalSurfaceTag: authoring.finalSurfaceTag,
          };
          const assembly = authoring.mode === 'drop-to-acid'
            ? new DropToAcidAssembly(commonOptions)
            : new RopeCatchAssembly({
                ...commonOptions,
                settlingDurationSeconds: authoring.settlingDurationSeconds,
                settlingSwingRadians: authoring.settlingSwingRadians,
              });
          rollback(() => assembly.dispose());
          scene.root.add(assembly.root);
          return assembly;
        },
      );

      const manager = new SlimeManager<KinematicBody>();
      rollback(() => manager.dispose());
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
      const previewOccupants = [
        {
          id: 'bob' as const,
          position: bobBody.position,
          radiusMetres: bobBody.radiusMetres,
          get attached() {
            return bobBody.attached;
          },
          get supportCollider() {
            return bobBody.supportCollider;
          },
        },
        {
          id: 'goop' as const,
          position: goopBody.position,
          radiusMetres: goopBody.radiusMetres,
          get attached() {
            return goopBody.attached;
          },
          get supportCollider() {
            return goopBody.supportCollider;
          },
        },
      ] as const;
      const dissolveSystem = new DissolveSystem(dissolveTargets);
      rollback(() => dissolveSystem.dispose());
      let controller: CultivationLevelController;
      const acidProjectileSystem = new AcidProjectileSystem({
        slimeManager: manager,
        collisionWorld,
        dissolveSystem,
        aimRayProvider: this.renderLayer.cameraRig,
        isTargetEnabled: (target) => this.isDissolveTargetEnabled(target),
      });
      rollback(() => acidProjectileSystem.dispose());

      const buttonDoorAuthoring = CULTIVATION_FOUNDATION_MANIFEST.wallButtonDoor;
      const wallButtonOccupants = [
        { id: 'bob', body: pair.bobBody },
        { id: 'goop', body: pair.goopBody },
      ] as const;
      const requiredWallButtonOccupant = wallButtonOccupants.find(
        ({ id }) => id === buttonDoorAuthoring.button.requiredOccupantId,
      );
      if (!requiredWallButtonOccupant) {
        throw new Error(
          `Unknown wall-button occupant: ${buttonDoorAuthoring.button.requiredOccupantId}`,
        );
      }
      const wallButton = new WallButton({
        id: buttonDoorAuthoring.button.id,
        collisionWorld,
        surfaceRegistry,
        position: buttonDoorAuthoring.button.position,
        surfaceSize: buttonDoorAuthoring.button.surfaceSize,
        contactCentre: buttonDoorAuthoring.button.contactCentre,
        contactSize: buttonDoorAuthoring.button.contactSize,
        requiredOccupant: requiredWallButtonOccupant,
      });
      rollback(() => wallButton.dispose());
      scene.root.add(wallButton.root);

      const blastDoor = new VerticalBlastDoor({
        id: buttonDoorAuthoring.door.id,
        collisionWorld,
        surfaceRegistry,
        closedPosition: buttonDoorAuthoring.door.closedPosition,
        panelSize: buttonDoorAuthoring.door.panelSize,
        travelAxis: buttonDoorAuthoring.door.travelAxis,
        travelDistance: buttonDoorAuthoring.door.travelDistance,
        openingDurationSeconds: buttonDoorAuthoring.door.openingDurationSeconds,
        closingDurationSeconds: buttonDoorAuthoring.door.closingDurationSeconds,
        obstructionCentre: buttonDoorAuthoring.door.obstructionCentre,
        obstructionSize: buttonDoorAuthoring.door.obstructionSize,
      });
      rollback(() => blastDoor.dispose());
      scene.root.add(blastDoor.root);

      const buttonDoorCoordinator = new WallButtonDoorCoordinator(
        wallButton,
        blastDoor,
        wallButtonOccupants,
      );
      rollback(() => buttonDoorCoordinator.dispose());

      const deathSequence = new DeathSequence();
      let radiation: RadioactiveHazardSystem | undefined;
      const roomThreeEncounter = authoredPreview
        ? new RoomThreeDroneEncounter({
            config: CULTIVATION_ROOM_THREE_DRONE_AUTHORING,
            supportsById: targetById,
            collisionWorld,
            surfaceRegistry,
            bobBody,
            goopBody,
            radiationSurface: authoredPreview.roomThree.radiationHazard,
            requestDeath: (slimeId) => this.requestRoomThreeDroneDeath(slimeId),
          })
        : undefined;
      if (roomThreeEncounter && authoredPreview) {
        rollback(() => roomThreeEncounter.dispose());
        authoredPreview.roomThree.root.add(roomThreeEncounter.root);
      }
      const roomThreeController = roomThreeEncounter && authoredPreview
        ? new CultivationRoomThreeController(
            authoredPreview.roomThree.root,
            () => roomThreeEncounter.readModel.groundDisabledCount,
          )
        : undefined;
      if (roomThreeController) rollback(() => roomThreeController.dispose());

      controller = new CultivationLevelController({
        pair,
        collisionWorld,
        initialActiveSlimeId: this.initialProgression.activeSlimeId,
        requestDeath: (recovery, dyingSlimeId) =>
          this.requestPlayerDeath(recovery, dyingSlimeId),
        cancelTransients: () => {
          radiation?.reset();
          acidProjectileSystem.reset();
          dissolveSystem.reset();
          roomThreeEncounter?.cancelTransientState();
        },
        puzzleComponents: [
          {
            id: `${buttonDoorAuthoring.id}-coordinator`,
            groupId: buttonDoorAuthoring.puzzleGroupId,
            component: buttonDoorCoordinator,
          },
          {
            id: buttonDoorAuthoring.button.id,
            groupId: buttonDoorAuthoring.puzzleGroupId,
            component: wallButton,
          },
          {
            id: buttonDoorAuthoring.door.id,
            groupId: buttonDoorAuthoring.puzzleGroupId,
            component: blastDoor,
          },
          ...CULTIVATION_FOUNDATION_MANIFEST.structuralAssemblies.flatMap(
            (authoring, index) => [
              {
                id: `${authoring.id}-support-target`,
                groupId: authoring.puzzleGroupId,
                component: targetById.get(authoring.supportTargetId)!,
              },
              {
                id: authoring.id,
                groupId: authoring.puzzleGroupId,
                component: structuralAssemblies[index]!,
              },
            ],
          ),
        ],
      });
      rollback(() => controller.dispose());
      radiation = new RadioactiveHazardSystem(
        CULTIVATION_FOUNDATION_MANIFEST.radioactiveHazards,
        (failure) => controller.requestRadiationFailure(failure),
      );
      rollback(() => radiation.dispose());
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
      rollback(() => bobVisual.dispose());
      this.renderLayer.scene.add(bobVisual.mesh);
      const goopAcidPresentation = new GoopAcidPresentation({
        host: this.host,
        scene: this.renderLayer.scene,
        cameraRig: this.renderLayer.cameraRig,
        source: acidProjectileSystem,
        targets: dissolveTargets,
      });
      rollback(() => goopAcidPresentation.dispose());
      const droneProjectilePresentation = roomThreeEncounter
        ? new DroneProjectilePresentation(roomThreeEncounter.projectiles.states)
        : undefined;
      if (droneProjectilePresentation) {
        rollback(() => droneProjectilePresentation.dispose());
        this.renderLayer.scene.add(droneProjectilePresentation.mesh);
      }
      const pairPresentation = new SlimePairPresentation(bobBody.radiusMetres);
      rollback(() => pairPresentation.dispose());
      this.renderLayer.scene.add(pairPresentation.root);
      const burst = new SlimeBurstPresentation();
      rollback(() => burst.dispose());
      this.renderLayer.scene.add(burst.root);
      const debugPanel = this.debugAvailable
        ? new CultivationTestPanel(
            () => this.restartLevel(),
            (complete) => this.advanceNextStructuralSupport(complete),
            (roomId) => this.teleportToAuthoredPreviewRoom(roomId),
          )
        : undefined;
      if (debugPanel) {
        rollback(() => debugPanel.dispose());
        this.host.append(debugPanel.element);
        this.hostWindow.addEventListener('keydown', this.onDebugToggle);
        rollback(() =>
          this.hostWindow.removeEventListener('keydown', this.onDebugToggle));
      }
      const deathScreen = new DeathScreen({
        onRetry: this.retryAfterDeath,
        backgroundElements: [
          this.renderLayer.canvas,
          ...(debugPanel ? [debugPanel.element] : []),
        ],
      });
      rollback(() => deathScreen.dispose());
      this.host.append(deathScreen.element);

      const bobVisualState = this.createBobVisualState(bobBody);
      const unsubscribeControllerObjective = controller.events.on(
        'objectiveChanged',
        (event) => this.events.emit('objectiveChanged', event),
      );
      rollback(unsubscribeControllerObjective);
      const unsubscribeControllerProgress = controller.events.on(
        'progressChanged',
        () => {
          this.host.dataset.gameState = controller.readModel.state;
          buttonDoorCoordinator.setEnabled(
            controller.readModel.state === 'playing' &&
            controller.readModel.roomId === 'cultivation-room-2',
          );
        },
      );
      rollback(unsubscribeControllerProgress);
      buttonDoorCoordinator.setEnabled(
        controller.readModel.state === 'playing' &&
        controller.readModel.roomId === 'cultivation-room-2',
      );
      const notifyManager = () => this.notifyHUD();
      const unsubscribeManager = [
        manager.events.on('activeChanged', notifyManager),
        manager.events.on('registered', notifyManager),
        manager.events.on('unregistered', notifyManager),
        manager.events.on('unlocked', notifyManager),
      ];
      rollback(() => {
        for (const unsubscribe of unsubscribeManager) unsubscribe();
      });

      this.resources = {
        scene, authoredPreview, collisionWorld, surfaceRegistry,
        dissolveTargets, previewDissolveTargets,
        dissolveSystem, acidProjectileSystem, goopAcidPresentation,
        roomThreeEncounter, roomThreeController, droneProjectilePresentation,
        structuralAssemblies, wallButton, blastDoor, buttonDoorCoordinator,
        manager, pair, controller,
        radiation, radiationTargets, previewOccupants,
        bobVisual, pairPresentation, burst,
        deathSequence, deathScreen, bobFacing: new BlobFacing(), bobVisualState,
        jumpInputState: {
          pressed: false,
          held: false,
          released: false,
          cancelled: false,
        },
        movement: new THREE.Vector3(),
        noMovement: new THREE.Vector3(),
        renderedBobPosition: new THREE.Vector3(),
        renderedGoopPosition: new THREE.Vector3(),
        debugPanel,
        unsubscribeControllerObjective,
        unsubscribeControllerProgress,
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
      rollbackActions.length = 0;
    } catch (error) {
      this.resources = undefined;
      this.rollbackFailedLoad(rollbackActions);
      throw error;
    }
  };

  private readonly startResources = (): void => {
    const resources = this.requireResources();
    resources.goopAcidPresentation.resume();
    this.input.resetState();
    this.input.setEnabled(
      resources.deathSequence.isPlaying && resources.controller.readModel.state === 'playing',
    );
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
    resources.burst.reset();
    resources.acidProjectileSystem.reset();
    resources.dissolveSystem.reset();
    resources.authoredPreview?.reset();
    for (const target of resources.previewDissolveTargets) target.reset();
    resources.roomThreeEncounter?.reset();
    resources.roomThreeController?.reset();
    resources.droneProjectilePresentation?.reset();
    resources.controller.reset(this.initialProgression.activeSlimeId);
    if (this.authoredPreviewRoomId !== undefined) {
      this.captureAuthoredPreviewCheckpoint(resources, false);
      this.recoverAuthoredPreviewRoom(resources);
      this.emitAuthoredPreviewObjective();
    }
    resources.goopAcidPresentation.reset();
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
    resources.roomThreeController?.dispose();
    resources.droneProjectilePresentation?.dispose();
    resources.roomThreeEncounter?.dispose();
    resources.buttonDoorCoordinator.dispose();
    resources.blastDoor.dispose();
    resources.wallButton.dispose();
    for (const assembly of resources.structuralAssemblies) assembly.dispose();
    resources.goopAcidPresentation.dispose();
    resources.acidProjectileSystem.dispose();
    resources.dissolveSystem.dispose();
    for (const target of resources.dissolveTargets) target.dispose();
    resources.burst.dispose();
    resources.bobVisual.dispose();
    resources.pairPresentation.dispose();
    resources.manager.clearLevelRegistrations();
    resources.manager.dispose();
    resources.authoredPreview?.dispose();
    resources.scene.dispose();
    resources.collisionWorld.clear();
    resources.surfaceRegistry.clear();
    this.renderLayer.cameraRig.clearFollowTarget();
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    delete this.host.dataset.gameState;
    this.resources = undefined;
    this.debugVisible = false;
    this.authoredPreviewProgression = undefined;
    this.authoredPreviewRecoveryActiveSlimeId = undefined;
    this.notifyHUD();
  };

  private rollbackFailedLoad(rollbackActions: Array<() => void>): void {
    for (let index = rollbackActions.length - 1; index >= 0; index -= 1) {
      try {
        rollbackActions[index]();
      } catch {
        // Preserve the original construction failure while completing as much
        // rollback as possible.
      }
    }
    rollbackActions.length = 0;

    try {
      this.renderLayer.cameraRig.clearFollowTarget();
    } catch {
      // The camera may not have reached its initialization step.
    }
    try {
      this.input.setEnabled(false);
      this.input.releasePointerLock();
    } catch {
      // Input cleanup is best effort while preserving the load error.
    }
    delete this.host.dataset.gameState;
    this.debugVisible = false;
    this.authoredPreviewProgression = undefined;
    this.authoredPreviewRecoveryActiveSlimeId = undefined;
    try {
      this.notifyHUD();
    } catch {
      // A HUD subscriber must not replace the original load error.
    }
  }

  private consumeAuthoredPreviewTeleport():
    | CultivationDebugRoomId
    | undefined {
    if (!this.debugAvailable || !this.resources?.authoredPreview) {
      return undefined;
    }
    if (this.input.wasPressed('debugTeleportRoomOne')) return 1;
    if (this.input.wasPressed('debugTeleportRoomTwo')) return 2;
    if (this.input.wasPressed('debugTeleportRoomThree')) return 3;
    return undefined;
  }

  private teleportToAuthoredPreviewRoom(
    roomId: CultivationDebugRoomId,
  ): boolean {
    const resources = this.resources;
    if (!resources?.authoredPreview) return false;

    this.authoredPreviewProgression =
      createLevelTwoPreviewProgression(roomId);
    this.authoredPreviewRecoveryActiveSlimeId =
      resources.pair.activeSlimeId;
    resources.acidProjectileSystem.reset();
    resources.dissolveSystem.reset();
    resources.authoredPreview.reset();
    for (const target of resources.previewDissolveTargets) target.reset();
    resources.roomThreeEncounter?.reset();
    resources.roomThreeController?.reset();
    resources.droneProjectilePresentation?.reset();
    resources.buttonDoorCoordinator.setEnabled(false);
    resources.burst.reset();
    resources.deathSequence.reset();
    resources.deathScreen.hide();
    this.captureAuthoredPreviewCheckpoint(resources, false);
    this.recoverAuthoredPreviewRoom(resources);
    resources.bobFacing.reset();
    resources.movement.set(0, 0, 0);
    this.clearJumpInput(resources.jumpInputState, true);
    this.input.resetState();
    this.renderLayer.cameraRig.reset();
    this.retargetCamera(resources);
    this.host.dataset.gameState = 'playing';
    this.lastDeathSlimeId = undefined;
    this.emitAuthoredPreviewObjective();
    this.notifyHUD(undefined, true);
    return true;
  }

  private handleAuthoredPreviewFailure(
    failure: LevelTwoPreviewHazardFailure,
  ): void {
    const resources = this.resources;
    const preview = resources?.authoredPreview;
    const dyingSlimeId =
      failure.slimeId ?? resources?.pair.activeSlimeId;
    if (
      !resources ||
      !preview ||
      !dyingSlimeId ||
      !resources.deathSequence.isPlaying
    ) {
      return;
    }
    const dyingBody = dyingSlimeId === 'bob'
      ? resources.pair.bobBody
      : resources.pair.goopBody;
    if (preview.resolveRoomId(dyingBody.position) !== failure.roomId) return;
    this.requestPlayerDeath(
      () => this.resetAndRecoverAuthoredPreviewRoom(resources),
      dyingSlimeId,
    );
  }

  private resetAndRecoverAuthoredPreviewRoom(
    resources: CultivationRuntimeResources,
  ): void {
    resources.acidProjectileSystem.reset();
    resources.dissolveSystem.reset();
    resources.authoredPreview?.reset();
    for (const target of resources.previewDissolveTargets) target.reset();
    resources.roomThreeEncounter?.reset();
    resources.roomThreeController?.reset();
    resources.droneProjectilePresentation?.reset();
    this.recoverAuthoredPreviewRoom(resources);
  }

  private recoverAuthoredPreviewRoom(
    resources: CultivationRuntimeResources,
  ): void {
    resources.pair.restoreRecoveryState();
  }

  private captureAuthoredPreviewCheckpoint(
    resources: CultivationRuntimeResources,
    captureActiveSlime = true,
  ): void {
    const preview = resources.authoredPreview;
    const progression = this.authoredPreviewProgression;
    if (!preview || !progression) return;
    if (captureActiveSlime) {
      this.authoredPreviewRecoveryActiveSlimeId =
        resources.pair.activeSlimeId;
    }
    const activeSlimeId = this.authoredPreviewRecoveryActiveSlimeId;
    if (!activeSlimeId) return;
    resources.pair.setRecoveryState({
      bobPosition: preview.copyRoomSpawnPosition(
        progression.recoveryRoomIds.bob,
        'bob',
        new THREE.Vector3(),
      ),
      goopPosition: preview.copyRoomSpawnPosition(
        progression.recoveryRoomIds.goop,
        'goop',
        new THREE.Vector3(),
      ),
      activeSlimeId,
    });
  }

  private emitAuthoredPreviewObjective(): void {
    const roomId = this.authoredPreviewRoomId;
    if (roomId === undefined) return;
    this.events.emit('objectiveChanged', {
      roomId,
      objective: CULTIVATION_ROOM_OBJECTIVES[roomId],
    });
  }

  private updateStructuralAssemblies(
    deltaSeconds: number,
    resources: CultivationRuntimeResources,
  ): void {
    for (const assembly of resources.structuralAssemblies) {
      assembly.update(deltaSeconds);
    }
  }

  private advanceNextStructuralSupport(complete: boolean): void {
    const resources = this.requireResources();
    const roomId = this.authoredPreviewRoomId;
    const candidates = roomId === undefined
      ? resources.dissolveTargets
      : resources.previewDissolveTargets.filter(
          (candidate) => candidate.mesh.userData.roomId === roomId,
        );
    const target = candidates.find(
      (candidate) => !candidate.completed,
    );
    if (!target) return;
    const desiredProgress = complete ? 1 : Math.max(target.progress, 0.5);
    const progressDelta = desiredProgress - target.progress;
    if (progressDelta <= 0) return;
    target.advance(progressDelta * target.dissolveDurationSeconds);
  }

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

  private requestRoomThreeDroneDeath(slimeId: PlayableSlimeId): boolean {
    const resources = this.resources;
    const preview = resources?.authoredPreview;
    if (
      !resources ||
      !preview ||
      !resources.deathSequence.isPlaying
    ) return false;
    const struckBody = slimeId === 'bob'
      ? resources.pair.bobBody
      : resources.pair.goopBody;
    if (preview.resolveRoomId(struckBody.position) !== 3) return false;
    return this.requestPlayerDeath(
      () => this.resetAndRecoverAuthoredPreviewRoom(resources),
      slimeId,
    );
  }

  private isDissolveTargetEnabled(target: DissolveTarget): boolean {
    const roomId = this.authoredPreviewRoomId;
    const targetRoomId = target.mesh.userData.roomId;
    if (roomId === undefined) return targetRoomId === undefined;
    const resources = this.resources;
    const preview = resources?.authoredPreview;
    if (!resources || !preview) return false;
    const goopRoomId = preview.resolveRoomId(resources.pair.goopBody.position);
    return targetRoomId === goopRoomId;
  }

  private formatRoomThreeDiagnostics(
    resources: CultivationRuntimeResources,
  ): readonly string[] {
    const encounter = resources.roomThreeEncounter;
    const completion = resources.roomThreeController?.readModel;
    if (!encounter) return ['Room 3 drones: unavailable outside the authored preview'];
    return [
      `Room 3 ground drones: ${encounter.readModel.groundDisabledCount}/4 disabled; projectiles=${encounter.projectiles.liveCount}`,
      `Room 3 exits B/G/complete: ${completion?.bobAtExit ? 'yes' : 'no'}/${completion?.goopAtExit ? 'yes' : 'no'}/${completion?.complete ? 'yes' : 'no'}`,
      `health Bob/Goop: ${encounter.damage.health.map((state) => `${state.slimeId}=${state.health.toFixed(0)}${state.regenerating ? 'R' : ''}`).join(' ')}`,
      ...encounter.readModel.ceilingDrones.map((drone) => `${drone.id}: ${drone.state} / combat=${drone.drone.state} target=${drone.drone.targetSlimeId ?? 'none'} t=${drone.stateElapsedSeconds.toFixed(2)}`),
      ...encounter.readModel.groundDrones.map((drone) => `${drone.id}: ${drone.state} push=${drone.pushProgress.toFixed(2)} / combat=${drone.drone.state} target=${drone.drone.targetSlimeId ?? 'none'}`),
    ];
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
    resources.goopAcidPresentation.reset();
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
