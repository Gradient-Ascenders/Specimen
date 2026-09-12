import { CultivationLightLayout } from '../render/CultivationLightLayout.ts';
import { ventEntranceLightingWeight } from '../render/slime/VentEntranceLighting.ts';
import { CultivationPreparationQueue } from '../render/CultivationPreparationQueue.ts';
import * as THREE from 'three';
import type { ElevatorDroneEncounter } from '../hazards/ElevatorDroneEncounter.ts';
import type { ElevatorEncounterView } from '../ui/ElevatorEncounterView.ts';
import type { RoomFiveDroneEncounter } from '../hazards/RoomFiveDroneEncounter.ts';
import type { SecurityNetworkView } from '../ui/SecurityNetworkView.ts';
import type { RoomFiveCheckpoint } from './CultivationRoomFiveController.ts';
import { SLIME_DEFINITIONS, type SlimeId } from '../slimes/SlimeRoster.ts';

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
  writePerformancePosition,
  type PerformanceGameplaySnapshot,
} from '../core/PerformanceSnapshot.ts';
import {
  beginDebugPanelInspection,
  finishDebugPanelInspection,
  handleDebugPanelScrollKey,
  type DebugPanelInspectionState,
} from '../debug/DebugPanelInteraction.ts';
import type {
  CultivationTestPanel,
  CultivationDebugRoomId,
} from '../debug/CultivationTestPanel.ts';
import type { CultivationLevelDebugSupport } from '../debug/CultivationLevelDebug.ts';
import {
  RadioactiveHazardSystem,
  type RadiationContactTarget,
} from '../hazards/RadioactiveHazardSystem.ts';
import type { RoomThreeDroneEncounter } from '../hazards/RoomThreeDroneEncounter.ts';
import {
  ColliderTransformMode,
  CollisionWorld,
} from '../physics/CollisionWorld.ts';
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
import type { DroneProjectilePresentation } from '../render/hazards/DroneProjectilePresentation.ts';
import type { RenderLayer } from '../render/RenderLayer.ts';
import { SlimeBurstPresentation } from '../render/slime/SlimeBurstPresentation.ts';
import { SlimeVisual, type SlimeVisualState } from '../render/slime/SlimeVisual.ts';
import { SlimeMaterial } from '../render/slime/SlimeMaterial.ts';
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
import type { SlimeDamageVignette } from '../ui/SlimeDamageVignette.ts';
import { CultivationLevelController } from './CultivationLevelController.ts';
import { CULTIVATION_FOUNDATION_MANIFEST } from './CultivationFoundationManifest.ts';
import { CultivationLevelScene } from './CultivationLevelScene.ts';
import type { CultivationRoomThreeController } from './CultivationRoomThreeController.ts';
import type { GameLevelRuntimeEvents } from './GameLevelRuntime.ts';
import { LevelLifecycle, type LevelLifecycleState } from './LevelLifecycle.ts';
import type {
  LevelTwoPreviewScene,
  LevelTwoAuthoredRoomId,
  LevelTwoPreviewHazardFailure,
} from './LevelTwoPreviewScene.ts';
import type {
  LevelTwoPreviewProgressionSnapshot,
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
  readonly debugSupport?: CultivationLevelDebugSupport;
}

interface CultivationRuntimeResources {
  readonly roomFiveEncounter: RoomFiveDroneEncounter | undefined;
  readonly roomFiveDamage: SlimeDamageVignette | undefined;
  readonly roomFiveView: SecurityNetworkView | undefined;
  readonly voltBody: KinematicBody;
  readonly voltVisual: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
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
  readonly roomFourEncounter: ElevatorDroneEncounter | undefined;
  readonly roomFourView: ElevatorEncounterView | undefined;
  readonly roomFourProjectiles: DroneProjectilePresentation | undefined;
  readonly roomFourDamage: SlimeDamageVignette | undefined;
  readonly roomThreeController: CultivationRoomThreeController | undefined;
  readonly droneProjectilePresentation: DroneProjectilePresentation | undefined;
  readonly damageVignette: SlimeDamageVignette | undefined;
  readonly structuralAssemblies: readonly SuspendedStructureAssembly[];
  readonly wallButton: WallButton<KinematicBody>;
  readonly blastDoor: VerticalBlastDoor;
  readonly buttonDoorCoordinator: WallButtonDoorCoordinator<KinematicBody>;
  readonly manager: SlimeManager<KinematicBody>;
  readonly pair: PersistentSlimePair<KinematicBody>;
  readonly controller: CultivationLevelController;
  readonly radiation: RadioactiveHazardSystem;
  readonly acidContactBodies: readonly KinematicBody[];
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
  private readonly debugSupport: CultivationLevelDebugSupport | undefined;
  private readonly initialProgression: LevelProgressionSnapshot;
  private readonly lifecycle: LevelLifecycle;
  private readonly hudListeners = new Set<SlimeHUDListener>();
  private resources: CultivationRuntimeResources | undefined;
  private debugVisible = false;
  private debugInteractionEnabled = true;
  private debugInspectionState: DebugPanelInspectionState | undefined;
  private debugElapsedSeconds = 0;
  private switchFeedbackSequence = 0;
  private lastDeathSlimeId: SlimeId | undefined;
  private authoredPreviewProgression:
    | LevelTwoPreviewProgressionSnapshot
    | undefined;
  private authoredPreviewRecoveryActiveSlimeId: SlimeId | undefined;
  private readonly authoredPreviewResolvedRooms = {
    bob: 1 as LevelTwoAuthoredRoomId,
    goop: 1 as LevelTwoAuthoredRoomId,
  };
  private readonly roomThreeSlimeEligibility = { bob: false, goop: false };
  private lastRoomFourObjective = '';
  private roomFiveCheckpoint: RoomFiveCheckpoint = 'split';
  private lastRoomFiveObjective = '';
  private readonly roomFiveLocal = new THREE.Vector3();
  private readonly rescueCamera = {
    gameplayUpOverride: { x: 0, y: 1, z: 0 },
    profile: { id: 'volt-rescue', distanceMetres: 10, targetHeightMetres: 0,
      pitchRadians: -.12, transitionDurationSeconds: .7, framingDeadZoneHalfWidthMetres: .1,
      framingDeadZoneHalfHeightMetres: .1, framingDampingPerSecond: 10 },
    anchor: { position: new THREE.Vector3(), previousPosition: new THREE.Vector3() },
  };
  private readonly roomFourCamera = {
    profile: { id: 'cultivation-descent', playerControlledPitch: true, distanceMetres: 6, targetHeightMetres: .65,
      pitchRadians: 0, transitionDurationSeconds: .6, framingDeadZoneHalfWidthMetres: .5,
      framingDeadZoneHalfHeightMetres: .5, framingDampingPerSecond: 12 },
    anchor: { position: new THREE.Vector3(), previousPosition: new THREE.Vector3() },
  };

  constructor(options: CultivationLevelRuntimeOptions) {
    validateLevelProgressionSnapshot(options.progression);
    this.host = options.host;
    this.input = options.input;
    this.renderLayer = options.renderLayer;
    this.hostWindow = options.window ?? window;
    this.debugAvailable = options.debugAvailable ?? import.meta.env.DEV;
    this.debugSupport = options.debugSupport;
    if (this.debugAvailable && !this.debugSupport) {
      throw new Error('Cultivation debug support must be loaded when debugging is enabled.');
    }
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

  private presentationPreparation: Promise<void> | undefined;
  private preparationQueue: CultivationPreparationQueue | undefined;
  private readonly preparationLightState = new THREE.Group();
  private lastPreparedDark = false;
  private lightLayout: CultivationLightLayout | undefined;
  private lightLayoutKey = '';
  private constructionMs = 0;
  preparePresentation(): Promise<void> {
    const resources = this.requireResources();
    if (!resources.authoredPreview) return Promise.resolve();
    this.lightLayout ??= new CultivationLightLayout(this.renderLayer.scene);
    if (!this.preparationQueue) this.preparationQueue = new CultivationPreparationQueue(this.renderLayer, resources.authoredPreview, this.host);
    this.preparationQueue.diagnostics.constructionMs = this.constructionMs;
    return this.presentationPreparation ??= this.preparationQueue.prepareStartup();
  }
  load(): void {
    if (this.lifecycle.state === 'unloaded') this.presentationPreparation = undefined;
    const started = performance.now();
    this.lifecycle.load();
    this.constructionMs = performance.now() - started;
  }
  start(): void { this.lifecycle.start(); }
  stop(): void { this.lifecycle.stop(); }
  restartLevel(): void { this.lifecycle.restartLevel(); }
  unload(): void { this.lightLayout?.dispose(); this.lightLayout = undefined; this.lightLayoutKey = ''; this.preparationQueue?.dispose(); this.preparationQueue = undefined; this.lifecycle.unload(); }

  dispose(): void {
    this.lightLayout?.dispose(); this.lightLayout = undefined;
    this.preparationQueue?.dispose(); this.preparationQueue = undefined;
    this.lifecycle.dispose();
    this.hudListeners.clear();
    this.events.clear();
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

  writePerformanceSnapshot(target: PerformanceGameplaySnapshot): void {
    const resources = this.resources;
    target.level = 'cultivation-level-2';
    target.room =
      this.authoredPreviewRoomId ?? resources?.controller.activeRoomId ?? 'unloaded';
    target.gameplayState = resources
      ? resources.deathSequence.state === 'playing'
        ? resources.controller.state
        : resources.deathSequence.state
      : this.lifecycle.state;
    target.cutsceneState = resources?.roomThreeController?.readModel.complete
      ? 'room-three-complete'
      : 'none';
    target.activeSlime = resources?.manager.activeSlimeId ?? 'none';
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
    writePerformancePosition(
      target.bobPosition,
      resources.pair.bobBody.position,
    );
    writePerformancePosition(
      target.goopPosition,
      resources.pair.goopBody.position,
    );
    target.collisionRegistered = resources.collisionWorld.colliderCount;
    target.collisionEligible =
      resources.collisionWorld.lastSweepEligibleColliderCount;
    target.collisionCandidates =
      resources.collisionWorld.lastSweepBroadphaseCandidateCount;
    target.collisionNarrowChecks =
      resources.collisionWorld.lastSweepNarrowPhaseCheckCount;
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
    if (!enabled && this.debugVisible) this.closeDebugInspection(false);
    this.applyDebugPresentation();
  }

  fixedUpdate(deltaSeconds: number): void {
    if (this.preparationQueue?.diagnostics.pending) { this.input.endFixedUpdate(); return; }
    if (this.lifecycle.state !== 'running') return;
    const resources = this.requireResources();
    if (!resources.deathSequence.isPlaying) {
      resources.authoredPreview?.labArt.acid.update(deltaSeconds);
      resources.burst.update(deltaSeconds);
      if (resources.deathSequence.update(deltaSeconds)) resources.deathScreen.show();
      this.input.endFixedUpdate();
      return;
    }
    if (
      this.authoredPreviewRoomId === undefined && resources.controller.readModel.state === 'complete'
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
    if (resources.authoredPreview?.roomFive.controller.complete) {
      this.input.endFixedUpdate(); return;
    }

    let switched = false;
    const releasingVolt = resources.authoredPreview?.roomFive.controller.releasing === true;
    if (!releasingVolt && this.input.wasPressed('switchSlime')) switched = this.switchActive(resources);
    const moveX = (this.input.isDown('moveRight') ? 1 : 0) - (this.input.isDown('moveLeft') ? 1 : 0);
    const moveZ = (this.input.isDown('moveBackward') ? 1 : 0) - (this.input.isDown('moveForward') ? 1 : 0);
    if (!switched && !releasingVolt) {
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
    if (releasingVolt) { resources.movement.set(0, 0, 0); this.clearJumpInput(resources.jumpInputState, true); }
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
    if (resources.manager.isAvailable('volt')) {
      resources.voltBody.update(deltaSeconds, !switched && activeBody === resources.voltBody ? resources.movement : resources.noMovement,
        activeBody === resources.voltBody ? resources.jumpInputState : undefined);
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
          resources.manager.activeSlimeId === 'goop' ? 'goop' : 'bob',
          !switched && activeBody === resources.pair.bobBody
            ? resources.movement
            : resources.noMovement,
          roomThreeEligibility,
        );
        resources.roomThreeController.update(
          resources.previewOccupants[0],
          resources.previewOccupants[1],
        );
      }
      authoredPreview.updateAcidInteractions(deltaSeconds, resources.acidContactBodies);
      authoredPreview.update(
        deltaSeconds,
        authoredProgression.roomId,
        resources.previewOccupants,
        resources.pair.goopBody,
      );
      const roomFour = authoredPreview.roomFour;
      resources.roomFourEncounter?.update(deltaSeconds, resources.manager.activeSlimeId === 'goop' ? 'goop' : 'bob');
      this.updateRoomFive(deltaSeconds, resources);
      if (authoredProgression.roomId === 4 && this.lastRoomFourObjective !== roomFour.controller.objective) {
        this.lastRoomFourObjective = roomFour.controller.objective;
        this.emitAuthoredPreviewObjective();
      }
      if (resources.deathSequence.isPlaying) {
        for (const occupant of resources.previewOccupants) {
          if (occupant.position.y >= (authoredProgression.roomId === 5 ? -18 : CULTIVATION_FOUNDATION_MANIFEST.outOfBoundsYMetres)) {
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
        const nextProgression = this.debugSupport!.advancePreviewProgression(
          this.authoredPreviewProgression!,
          resolvedRooms,
        );
        if (nextProgression !== this.authoredPreviewProgression) {
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
      gameplayInputEnabled: this.input.enabled && resources.deathSequence.isPlaying && !releasingVolt,
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
    const bobMaterial = resources.bobVisual.mesh.material as SlimeMaterial;
    const lowerRoom = resources.authoredPreview?.roomFive;
    const bobVentDepth = lowerRoom
      ? lowerRoom.root.worldToLocal(this.roomFiveLocal.copy(resources.renderedBobPosition)).z : -Infinity;
    if (bobVentDepth > -1 && resources.roomFiveEncounter) {
      resources.roomFiveEncounter.lightSlime(bobMaterial, resources.renderedBobPosition);
      // Fade as Bob rounds either side of the T-junction, not along the entrance.
      bobMaterial.blendDefaultLighting(ventEntranceLightingWeight(this.roomFiveLocal.x, bobVentDepth));
    } else bobMaterial.restoreDefaultLighting();
    if (resources.manager.isAvailable('volt')) {
      this.interpolate(resources.voltBody, interpolationAlpha, resources.voltVisual.position);
      resources.voltVisual.visible = true;
    }
    // A render frame can occur without a fixed update. Preserve the same
    // pointer-sampling behaviour as Level 1 so those frames apply mouse input
    // instead of discarding it and making Level 2 sensitivity frame-rate
    // dependent. Fixed updates clear consumed deltas, so this cannot double
    // apply input on frames where simulation already handled it.
    if (
      this.lifecycle.state === 'running' &&
      resources.deathSequence.isPlaying &&
      resources.controller.readModel.state === 'playing' &&
      !resources.authoredPreview?.roomFive.controller.releasing &&
      this.input.enabled
    ) {
      this.renderLayer.cameraRig.queueLookInput(
        this.input.pointerDeltaX,
        this.input.pointerDeltaY,
      );
    }
    this.input.endPointerUpdate();
    const lightingRoom = resources.authoredPreview?.resolveRoomId(resources.pair.activeBody.position);
    if (lightingRoom === 4) this.preparationQueue?.anticipateLiftExit();
    const darkRoom = lightingRoom === 5 || (lightingRoom === 4
      && resources.authoredPreview?.roomFour.controller.readModel.state === 'complete');
    resources.scene.setDarkRoomLighting(darkRoom, stats.frameDeltaSeconds,
      lightingRoom !== undefined && lightingRoom <= 3);
    this.renderLayer.renderer.shadowMap.enabled = darkRoom;
    this.renderLayer.renderer.shadowMap.type = THREE.PCFShadowMap;
    resources.bobVisual.mesh.castShadow = darkRoom;
    const aimPresentationAllowed =
      this.lifecycle.state === 'running' &&
      resources.deathSequence.isPlaying &&
      resources.controller.readModel.state === 'playing' &&
      this.input.enabled;
    resources.goopAcidPresentation.update(
      interpolationAlpha,
      stats.frameDeltaSeconds,
      aimPresentationAllowed,
      this.lifecycle.state === 'running' && resources.deathSequence.isPlaying,
    );
    const elevatorController = resources.authoredPreview?.roomFour.controller;
    if (resources.authoredPreview?.roomFive.controller.releasing) {
      this.rescueCamera.anchor.previousPosition.copy(this.rescueCamera.anchor.position);
      resources.authoredPreview.roomFive.pod.getWorldPosition(this.rescueCamera.anchor.position);
      this.renderLayer.cameraRig.setContextualCamera(this.rescueCamera);
    } else if (elevatorController?.running) {
      this.roomFourCamera.anchor.position.copy(resources.pair.activeBody.position);
      this.roomFourCamera.anchor.previousPosition.copy(resources.pair.activeBody.previousPosition);
      this.renderLayer.cameraRig.setContextualCamera(this.roomFourCamera);
    } else this.renderLayer.cameraRig.setContextualCamera(undefined);
    this.renderLayer.cameraRig.update(interpolationAlpha, stats.frameDeltaSeconds);
    resources.authoredPreview?.updatePresentationVisibility(
      this.renderLayer.cameraRig.camera.position, resources.pair.activeBody.position,
    );
    if (resources.authoredPreview && this.lightLayout) {
      const p = resources.authoredPreview;
      const key = [p.roomOne.root.visible, p.roomOneToTwoPassage.root.visible, p.roomTwo.root.visible,
        p.roomTwoToThreeGoopPassage.root.visible, p.roomTwoToThreeBobAirDuct.root.visible,
        p.roomThree.root.visible, p.roomFour.root.visible, p.roomFive.root.visible].join(',');
      if (key !== this.lightLayoutKey) { this.lightLayout.sync(this.renderLayer.scene); this.lightLayoutKey = key; }
    }
    if (this.preparationQueue && !this.preparationQueue.requireCurrent(!!darkRoom)) {
      this.preparationQueue.tick(0, true); return;
    }
    if (resources.roomThreeEncounter && resources.authoredPreview) {
      resources.roomThreeEncounter.root.visible = resources.authoredPreview.roomThree.root.visible;
    }
    resources.pairPresentation.update(
      resources.renderedBobPosition,
      resources.renderedGoopPosition,
      resources.manager.activeSlimeId!,
      this.renderLayer.cameraRig.camera,
      resources.collisionWorld,
      this.renderLayer.cameraRig.aimPresentationWeight > 0.01,
    );
    resources.droneProjectilePresentation?.update(interpolationAlpha);
    resources.roomFourProjectiles?.update(interpolationAlpha);
    resources.roomFiveEncounter?.presentation.update(interpolationAlpha);
    if (resources.authoredPreview) resources.roomFiveView?.update(resources.authoredPreview.roomFive.controller, this.authoredPreviewRoomId === 5);
    const inRoomFour = resources.authoredPreview?.resolveRoomId(resources.pair.activeBody.position) === 4;
    if (resources.authoredPreview) resources.roomFourView?.update(resources.authoredPreview.roomFour.controller, inRoomFour);
    const damageSlimeId = resources.manager.activeSlimeId === 'goop' ? 'goop' : 'bob';
    resources.roomFiveDamage?.update(stats.frameDeltaSeconds, damageSlimeId,
      this.authoredPreviewRoomId === 5 && !resources.authoredPreview!.roomFive.controller.rescued && resources.deathSequence.isPlaying);
    resources.roomFourDamage?.update(stats.frameDeltaSeconds, damageSlimeId,
      inRoomFour && resources.deathSequence.isPlaying);
    resources.damageVignette?.update(
      stats.frameDeltaSeconds,
      damageSlimeId,
      this.lifecycle.state === 'running' &&
        resources.deathSequence.isPlaying &&
        this.roomThreeSlimeEligibility[damageSlimeId],
    );
    if (darkRoom !== this.lastPreparedDark) {
      // Shadow passes consume the scene's prior light state; refresh it before a lighting transition.
      this.renderLayer.renderer.compile(this.preparationLightState, this.renderLayer.cameraRig.camera, this.renderLayer.scene);
      this.lastPreparedDark = !!darkRoom;
    }
    this.renderLayer.render();
    this.preparationQueue?.tick(stats.rawFrameDeltaSeconds * 1000);

    this.debugElapsedSeconds += stats.rawFrameDeltaSeconds;
    if (this.debugVisible && resources.debugPanel && this.debugElapsedSeconds >= 0.25) {
      this.debugElapsedSeconds = 0;
      const readModel = resources.controller.readModel;
      const acidPresentation = resources.goopAcidPresentation.getDiagnostics();
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
        `active slime: ${resources.manager.activeSlimeId!}`,
        `Bob: ${this.formatPosition(resources.pair.bobBody.position)} m`,
        `Goop: ${this.formatPosition(resources.pair.goopBody.position)} m`,
        `checkpoint / group: ${readModel.checkpointId} / ${readModel.puzzleGroupId}`,
        `room / entries B,G: ${readModel.roomId} / ${readModel.bobEnteredRoomThree ? 'yes' : 'no'},${readModel.goopEnteredRoomThree ? 'yes' : 'no'}`,
        `early Goop Room 2: ${readModel.goopEnteredRoomTwoEarly ? 'yes' : 'no'}`,
        `last failure / death slime: ${readModel.lastFailure} / ${this.lastDeathSlimeId ?? 'none'}`,
        `radiation requests: ${resources.radiation.failureRequestCount}`,
        `acid presentation work uniforms / projectile slots / droplet uploads: ${acidPresentation.corrosionUniformUpdateCount} / ${acidPresentation.projectileSlotUpdateCount} / ${acidPresentation.dropletMatrixUploadCount}`,
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
        ? new this.debugSupport!.PreviewScene((failure) =>
            this.handleAuthoredPreviewFailure(failure),
          )
        : undefined;
      if (authoredPreview) {
        rollback(() => authoredPreview.dispose());
        this.renderLayer.scene.add(authoredPreview.root);
      }

      const collisionWorld = new CollisionWorld();
      rollback(() => collisionWorld.clear());
      collisionWorld.registerAll(
        scene.collisionMeshes,
        undefined,
        ColliderTransformMode.Static,
      );
      if (authoredPreview) {
        collisionWorld.registerAll(
          authoredPreview.collisionMeshes,
          undefined,
          ColliderTransformMode.Static,
        );
        for (const mesh of authoredPreview.dynamicCollisionMeshes) {
          collisionWorld.setTransformMode(mesh, ColliderTransformMode.Dynamic);
        }
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

      // Volt remains locked in Level 1/the foundation harness; this authored
      // finale opts into his playable configuration without changing those scopes.
      const manager = new SlimeManager<KinematicBody>(SLIME_DEFINITIONS.map(definition =>
        authoredPreview && definition.id === 'volt' ? { ...definition, betaAvailability: 'playable' as const } : definition));
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
        initialActiveSlimeId: this.initialProgression.activeSlimeId === 'volt' ? 'bob' : this.initialProgression.activeSlimeId,
      });
      const voltBody = new KinematicBody({ world: collisionWorld, surfaces: surfaceRegistry,
        initialPosition: new THREE.Vector3(), config: { adhesionEnabled: false, reboundEnabled: false, chargedJumpEnabled: false } });
      const voltVisual = new THREE.Mesh(new THREE.SphereGeometry(voltBody.radiusMetres, 24, 18),
        new THREE.MeshStandardMaterial({ color: 0xffe85c, emissive: 0xffd21a, emissiveIntensity: .7, roughness: .3 }));
      rollback(() => { voltVisual.removeFromParent(); voltVisual.geometry.dispose(); voltVisual.material.dispose(); });
      voltVisual.name = 'volt-runtime-body'; voltVisual.visible = false; this.renderLayer.scene.add(voltVisual);
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
        ? this.debugSupport!.createRoomThreeEncounter({
            supportsById: targetById,
            collisionWorld,
            surfaceRegistry,
            bobBody,
            goopBody,
            radiationSurface: authoredPreview.roomThree.radiationHazard,
            surfaceMaps: authoredPreview.coverArt.droneSurfaceMaps,
            requestDeath: (slimeId) => this.requestRoomThreeDroneDeath(slimeId),
          })
        : undefined;
      if (roomThreeEncounter && authoredPreview) {
        rollback(() => roomThreeEncounter.dispose());
        authoredPreview.roomThree.root.add(roomThreeEncounter.root);
      }
      const roomThreeController = roomThreeEncounter && authoredPreview
        ? new this.debugSupport!.RoomThreeController(
            authoredPreview.roomThree.root,
            () => roomThreeEncounter.readModel.groundDisabledCount,
          )
        : undefined;
      if (roomThreeController) rollback(() => roomThreeController.dispose());
      const roomFourEncounter = authoredPreview ? new this.debugSupport!.ElevatorDroneEncounter(
        authoredPreview.roomFour, collisionWorld, surfaceRegistry, bobBody, goopBody,
        previewDissolveTargets, dissolveSystem,
        (slimeId) => this.requestPlayerDeath(() => this.resetAndRecoverAuthoredPreviewRoom(this.requireResources()), slimeId),
        authoredPreview.coverArt.droneSurfaceMaps,
      ) : undefined;
      if (roomFourEncounter) rollback(() => roomFourEncounter.dispose());
      const roomFourView = authoredPreview ? new this.debugSupport!.ElevatorEncounterView() : undefined;
      if (roomFourView) { rollback(() => roomFourView.dispose()); this.host.append(roomFourView.element); }
      const roomFourProjectiles = roomFourEncounter
        ? new this.debugSupport!.DroneProjectilePresentation(roomFourEncounter.projectiles.states) : undefined;
      if (roomFourProjectiles) { rollback(() => roomFourProjectiles.dispose()); this.renderLayer.scene.add(roomFourProjectiles.mesh); }
      const roomFourDamage = roomFourEncounter
        ? new this.debugSupport!.DamageVignette({ damage: roomFourEncounter.damage }) : undefined;
      if (roomFourDamage) { rollback(() => roomFourDamage.dispose()); this.host.append(roomFourDamage.element); }

      controller = new CultivationLevelController({
        pair,
        collisionWorld,
        initialActiveSlimeId: this.initialProgression.activeSlimeId === 'volt' ? 'bob' : this.initialProgression.activeSlimeId,
        requestDeath: (recovery, dyingSlimeId) =>
          this.requestPlayerDeath(recovery, dyingSlimeId),
        cancelTransients: () => {
          radiation?.reset();
          acidProjectileSystem.reset();
          dissolveSystem.reset();
          roomThreeEncounter?.cancelTransientState();
          roomFourEncounter?.cancelTransientState();
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
      const roomFiveEncounter = authoredPreview ? new this.debugSupport!.RoomFiveDroneEncounter(
        authoredPreview.roomFive, collisionWorld, surfaceRegistry, bobBody, goopBody,
        id => this.requestPlayerDeath(() => this.resetAndRecoverAuthoredPreviewRoom(this.requireResources()), id), authoredPreview.labArt.metal) : undefined;
      if (roomFiveEncounter) { rollback(() => roomFiveEncounter.dispose()); this.renderLayer.scene.add(roomFiveEncounter.presentation.mesh); }
      authoredPreview?.roomFive.bindBurns(dissolveSystem);
      const roomFiveDamage = roomFiveEncounter ? new this.debugSupport!.DamageVignette({ damage: roomFiveEncounter.damage }) : undefined;
      if (roomFiveDamage) { rollback(() => roomFiveDamage.dispose()); this.host.append(roomFiveDamage.element); }
      const roomFiveView = authoredPreview ? new this.debugSupport!.SecurityNetworkView() : undefined;
      if (roomFiveView) { rollback(() => roomFiveView.dispose()); this.host.append(roomFiveView.element); }
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
        ? new this.debugSupport!.DroneProjectilePresentation(
            roomThreeEncounter.projectiles.states,
          )
        : undefined;
      if (droneProjectilePresentation) {
        rollback(() => droneProjectilePresentation.dispose());
        this.renderLayer.scene.add(droneProjectilePresentation.mesh);
      }
      const damageVignette = roomThreeEncounter
        ? new this.debugSupport!.DamageVignette({
            damage: roomThreeEncounter.damage,
          })
        : undefined;
      if (damageVignette) {
        rollback(() => damageVignette.dispose());
        this.host.append(damageVignette.element);
      }
      const pairPresentation = new SlimePairPresentation(bobBody.radiusMetres);
      rollback(() => pairPresentation.dispose());
      this.renderLayer.scene.add(pairPresentation.root);
      const burst = new SlimeBurstPresentation();
      rollback(() => burst.dispose());
      this.renderLayer.scene.add(burst.root);
      const debugPanel = this.debugAvailable
        ? new this.debugSupport!.TestPanel(
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
        roomFiveEncounter, roomFiveDamage, roomFiveView, voltBody, voltVisual,
        scene, authoredPreview, collisionWorld, surfaceRegistry,
        dissolveTargets, previewDissolveTargets,
        dissolveSystem, acidProjectileSystem, goopAcidPresentation,
        roomThreeEncounter, roomThreeController, droneProjectilePresentation,
        roomFourEncounter, roomFourView, roomFourProjectiles, roomFourDamage,
        damageVignette,
        structuralAssemblies, wallButton, blastDoor, buttonDoorCoordinator,
        manager, pair, controller,
        radiation, radiationTargets, previewOccupants,
        acidContactBodies: [bobBody, goopBody],
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
      if (authoredPreview) {
        // Level 1's Digit0 shortcut now enters the authored three-room route
        // immediately. The separate backend-foundation composition remains a
        // reusable implementation harness, but is no longer a competing
        // player destination in development builds.
        if (!this.teleportToAuthoredPreviewRoom(1)) {
          throw new Error('Could not enter authored Cultivation Room 1.');
        }
      } else {
        this.resetRecoveryCamera(this.resources);
        this.retargetCamera(this.resources);
        this.host.dataset.gameState = controller.readModel.state;
        this.notifyHUD();
        this.events.emit('objectiveChanged', {
          roomId: controller.readModel.roomId,
          objective: controller.readModel.objective,
        });
      }
      this.applyDebugPresentation();
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
      !this.debugVisible &&
        resources.deathSequence.isPlaying &&
        resources.controller.readModel.state === 'playing',
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
    resources.damageVignette?.reset();
    resources.manager.activate('bob');
    resources.controller.reset(this.initialProgression.activeSlimeId === 'volt' ? 'bob' : this.initialProgression.activeSlimeId);
    this.roomFiveCheckpoint = 'split';
    this.resetRoomFive(resources);
    this.resetRoomFour(resources);
    if (this.authoredPreviewRoomId !== undefined) {
      this.captureAuthoredPreviewCheckpoint(resources, false);
      this.recoverAuthoredPreviewRoom(resources);
      this.emitAuthoredPreviewObjective();
    }
    resources.goopAcidPresentation.reset();
    resources.bobVisual.reset();
    resources.bobFacing.reset();
    this.clearJumpInput(resources.jumpInputState, false);
    this.resetRecoveryCamera(resources);
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
    resources.roomFourView?.dispose();
    resources.roomFourDamage?.dispose();
    resources.roomFourProjectiles?.dispose();
    resources.roomFourEncounter?.dispose();
    resources.roomFiveDamage?.dispose();
    resources.roomFiveView?.dispose();
    resources.roomFiveEncounter?.dispose();
    this.renderLayer.renderer.shadowMap.enabled = false;
    resources.voltVisual.removeFromParent(); resources.voltVisual.geometry.dispose(); resources.voltVisual.material.dispose();
    resources.damageVignette?.dispose();
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
    this.debugInspectionState = undefined;
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
    this.debugInspectionState = undefined;
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
    if (this.input.wasPressed('debugTeleportRoomFour')) return 4;
    if (this.input.wasPressed('debugTeleportRoomFive')) return 5;
    return undefined;
  }

  private teleportToAuthoredPreviewRoom(
    roomId: CultivationDebugRoomId,
  ): boolean {
    const resources = this.resources;
    if (!resources?.authoredPreview) return false;
    resources.manager.activate(resources.manager.activeSlimeId === 'goop' ? 'goop' : 'bob');
    this.roomFiveCheckpoint = 'split';

    this.authoredPreviewProgression =
      this.debugSupport!.createPreviewProgression(roomId);
    this.authoredPreviewRecoveryActiveSlimeId =
      resources.manager.activeSlimeId!;
    resources.acidProjectileSystem.reset();
    resources.dissolveSystem.reset();
    resources.authoredPreview.reset();
    for (const target of resources.previewDissolveTargets) target.reset();
    resources.roomThreeEncounter?.reset();
    resources.roomThreeController?.reset();
    resources.droneProjectilePresentation?.reset();
    resources.damageVignette?.reset();
    resources.buttonDoorCoordinator.setEnabled(false);
    resources.burst.reset();
    this.resetRoomFour(resources);
    this.resetRoomFive(resources);
    resources.deathSequence.reset();
    resources.deathScreen.hide();
    this.captureAuthoredPreviewCheckpoint(resources, false);
    this.recoverAuthoredPreviewRoom(resources);
    resources.bobFacing.reset();
    resources.movement.set(0, 0, 0);
    this.clearJumpInput(resources.jumpInputState, true);
    this.input.resetState();
    this.resetRecoveryCamera(resources);
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
      failure.slimeId ?? resources?.manager.activeSlimeId;
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
    resources.damageVignette?.reset();
    this.recoverAuthoredPreviewRoom(resources);
    this.resetRoomFour(resources);
    this.resetRoomFive(resources);
    this.emitAuthoredPreviewObjective();
  }

  private resetRoomFour(resources: CultivationRuntimeResources): void {
    resources.roomFourEncounter?.reset();
    resources.roomFourProjectiles?.reset();
    resources.roomFourDamage?.reset();
    this.lastRoomFourObjective = '';
    if (this.authoredPreviewRoomId === 5) resources.authoredPreview?.roomFour.controller.restoreArrival();
  }

  private updateRoomFive(dt: number, resources: CultivationRuntimeResources): void {
    const preview = resources.authoredPreview;
    if (!preview || !resources.deathSequence.isPlaying) return;
    const room = preview.roomFive, c = room.controller;
    // Elevator completion establishes recovery even before either slime exits.
    if (this.authoredPreviewRoomId === 4 && preview.roomFour.controller.readModel.state === 'complete') {
      this.authoredPreviewProgression = this.debugSupport!.createPreviewProgression(5);
      this.captureAuthoredPreviewCheckpoint(resources);
      this.emitAuthoredPreviewObjective();
    }
    if (this.authoredPreviewRoomId !== 5) return;
    resources.roomFiveEncounter?.update(dt);
    if (!resources.deathSequence.isPlaying) return;
    if (c.checkpoint !== this.roomFiveCheckpoint) {
      this.roomFiveCheckpoint = c.checkpoint;
      this.captureAuthoredPreviewCheckpoint(resources);
    }
    if (c.rescued && !resources.manager.isAvailable('volt')) this.registerRescuedVolt(resources);
    if (c.rescued && resources.manager.activeSlimeId === 'volt') {
      if (room.isAtVoltTerminal(resources.voltBody.position)) c.powerExit();
    }
    if (c.exitPowered && !c.complete) {
      let allAtExit = true;
      for (let i = 0; i < 3; i++) {
        const body = i === 0 ? resources.pair.bobBody : i === 1 ? resources.pair.goopBody : resources.voltBody;
        allAtExit &&= room.isAtFinalExit(body.position);
      }
      if (allAtExit) {
        c.finish(); this.input.setEnabled(false); this.input.releasePointerLock();
        this.host.dataset.gameState = 'complete';
        this.events.emit('completed', { levelId: 'level-2', nextLevelId: 'level-3' });
      }
    }
    if (resources.manager.isAvailable('volt') &&
      (resources.voltBody.position.y < -18 || room.isAcidAt(resources.voltBody.position))) {
      this.requestPlayerDeath(() => this.resetAndRecoverAuthoredPreviewRoom(resources), 'volt');
    }
    if (this.lastRoomFiveObjective !== c.objective) {
      this.lastRoomFiveObjective = c.objective; this.emitAuthoredPreviewObjective();
    }
  }

  private registerRescuedVolt(resources: CultivationRuntimeResources): void {
    const room = resources.authoredPreview!.roomFive;
    room.pod.getWorldPosition(this.roomFiveLocal);
    resources.voltBody.recoverAt(this.roomFiveLocal);
    if (!resources.manager.isRegistered('volt')) resources.manager.registerBody('volt', resources.voltBody);
    resources.manager.unlock('volt'); resources.voltVisual.visible = true;
    this.notifyHUD();
  }

  private resetRoomFive(resources: CultivationRuntimeResources): void {
    const room = resources.authoredPreview?.roomFive;
    if (!room) return;
    const checkpoint = this.authoredPreviewRoomId === 5 ? this.roomFiveCheckpoint : 'split';
    room.restoreCheckpoint(checkpoint);
    resources.roomFiveEncounter?.reset(); resources.roomFiveDamage?.reset();
    this.lastRoomFiveObjective = '';
    if (checkpoint === 'rescued') {
      this.registerRescuedVolt(resources);
      if (this.authoredPreviewRecoveryActiveSlimeId === 'volt') resources.manager.activate('volt');
    } else {
      resources.manager.lock('volt'); resources.voltVisual.visible = false;
    }
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
        resources.manager.activeSlimeId!;
    }
    const activeSlimeId = this.authoredPreviewRecoveryActiveSlimeId;
    if (!activeSlimeId) return;
    resources.pair.setRecoveryState({
      bobPosition: progression.recoveryRoomIds.bob === 5 ? preview.roomFive.copyCheckpointSpawn('bob', new THREE.Vector3()) : preview.copyRoomSpawnPosition(
        progression.recoveryRoomIds.bob,
        'bob',
        new THREE.Vector3(),
      ),
      goopPosition: progression.recoveryRoomIds.goop === 5 ? preview.roomFive.copyCheckpointSpawn('goop', new THREE.Vector3()) : preview.copyRoomSpawnPosition(
        progression.recoveryRoomIds.goop,
        'goop',
        new THREE.Vector3(),
      ),
      activeSlimeId: activeSlimeId === 'volt' ? 'bob' : activeSlimeId,
    });
  }

  private emitAuthoredPreviewObjective(): void {
    const roomId = this.authoredPreviewRoomId;
    if (roomId === undefined) return;
    this.events.emit('objectiveChanged', {
      roomId,
      objective: roomId === 5 ? this.resources!.authoredPreview!.roomFive.controller.objective : roomId === 4 ? this.resources!.authoredPreview!.roomFour.controller.objective : this.debugSupport!.roomObjectives[roomId],
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
    const previousSlimeId = resources.manager.activeSlimeId!;
    const next = previousSlimeId === 'bob' ? 'goop' : previousSlimeId === 'goop' && resources.manager.isAvailable('volt') ? 'volt' : 'bob';
    if (!resources.manager.activate(next)) return false;
    this.input.resetState();
    resources.movement.set(0, 0, 0);
    this.clearJumpInput(resources.jumpInputState, true);
    this.retargetCamera(resources);
    this.switchFeedbackSequence += 1;
    this.notifyHUD({
      sequence: this.switchFeedbackSequence,
      previousSlimeId,
      activeSlimeId: resources.manager.activeSlimeId!,
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
    if (target.mesh.userData.roomId === 4 && !target.mesh.parent?.visible) return false;
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
    if (this.authoredPreviewRoomId === 4 && resources.authoredPreview) {
      const controller = resources.authoredPreview.roomFour.controller;
      return [`Room 4: ${controller.readModel.state} / ${controller.readModel.elapsed.toFixed(2)}s / ${(controller.progress * 100).toFixed(1)}%`, resources.roomFourEncounter?.diagnostics() ?? ''];
    }
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
    dyingSlimeId: SlimeId,
  ): boolean {
    const resources = this.requireResources();
    if (!resources.deathSequence.requestDeath(recovery)) return false;
    const dyingBody = dyingSlimeId === 'volt' ? resources.voltBody : dyingSlimeId === 'bob' ? resources.pair.bobBody : resources.pair.goopBody;
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
    this.resetRecoveryCamera(resources);
    this.retargetCamera(resources);
    this.input.setEnabled(
      !this.debugVisible && resources.controller.readModel.state === 'playing',
    );
    if (this.input.enabled) this.input.requestPointerLock();
    this.notifyHUD(undefined, true);
  };

  private resetRecoveryCamera(resources: CultivationRuntimeResources): void {
    this.renderLayer.cameraRig.reset();
    if (this.authoredPreviewRoomId === 5 && resources.manager.activeSlimeId === 'bob' &&
      resources.authoredPreview?.roomFive.controller.checkpoint === 'controls') {
      // Camera-back is opposite the route from the checkpoint toward the first landing.
      this.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.atan2(2.5, -5.2));
    }
  }

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
    const panel = this.resources?.debugPanel;
    if (
      this.debugVisible &&
      panel &&
      handleDebugPanelScrollKey(event, panel.element)
    ) {
      return;
    }
    if (
      event.code !== DEBUG_TOGGLE_CODE ||
      event.repeat ||
      !this.debugInteractionEnabled
    ) {
      return;
    }
    event.preventDefault();
    if (this.debugVisible) {
      const resources = this.requireResources();
      this.closeDebugInspection(
        this.lifecycle.state === 'running' &&
          resources.deathSequence.isPlaying &&
          resources.controller.readModel.state === 'playing',
      );
      return;
    }
    if (!panel || !this.input.enabled) return;
    this.debugInspectionState = beginDebugPanelInspection(this.input);
    this.debugVisible = true;
    this.applyDebugPresentation();
  };

  private closeDebugInspection(restoreGameplayInput: boolean): void {
    const state = this.debugInspectionState;
    this.debugInspectionState = undefined;
    this.debugVisible = false;
    this.applyDebugPresentation();
    if (state) {
      finishDebugPanelInspection(this.input, state, restoreGameplayInput);
    }
  }

  private requireResources(): CultivationRuntimeResources {
    if (!this.resources) throw new Error('Cultivation level resources are not loaded.');
    return this.resources;
  }
}
