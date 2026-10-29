import { SpecimenCharacterPresentation } from '../render/specimen/SpecimenCharacterPresentation.ts';
import { SpecimenReflectionEnvironment } from '../render/specimen/SpecimenReflectionEnvironment.ts';
import { VoltCharacterPresentation, type VoltCharacterPresentationState } from '../render/volt/VoltCharacterPresentation.ts';
import { GameplayAudio } from '../audio/GameplayAudio.ts';
import { SpecimenAbilityAudio } from '../audio/SpecimenAbilityAudio.ts';
import { SpecimenDash } from '../combat/SpecimenDash.ts';
import type { AudioPlayback } from '../audio/AudioManager.ts';
import type { BlackoutMaintenanceMapData } from '../render/environment/blackout/BlackoutMaintenanceMapData.ts';
import * as THREE from 'three';
import { CinematicCompileCache } from '../render/CinematicCompileCache.ts';
import { HiddenMaterialCulling } from '../render/HiddenMaterialCulling.ts';
import { BlackoutShutterOcclusion } from '../render/environment/blackout/BlackoutShutterOcclusion.ts';
import { CameraOcclusion } from '../render/CameraOcclusion.ts';
import { GoopCharacterPresentation, type GoopCharacterPresentationState } from '../render/goop/GoopCharacterPresentation.ts';
import { GelReflectionLighting } from '../render/slime/GelReflectionLighting.ts';
import {BlackoutLightingPass} from '../render/environment/blackout/BlackoutLightingPass.ts';
import { resolveCameraTargetOpacity } from '../render/CameraMath.ts';
import { prepareShadowSamplerMaps, renderIsolatedPrewarmResources, withIsolatedPrewarmState } from '../render/IsolatedResourcePrewarm.ts';
import { BlackoutPresentationPreparation } from '../render/BlackoutPresentationPreparation.ts';
import { waitForGpuPreparation } from '../render/WaitForGpuPreparation.ts';
import { BlackoutMaintenanceBayController } from './BlackoutMaintenanceBayController.ts';
import { BlackoutConnectorCamera } from './BlackoutConnectorCamera.ts';
import { BlackoutTransitController } from './BlackoutTransitController.ts';
import { BLACKOUT_TRANSIT_CHECKPOINTS } from './BlackoutTransitRoom.ts';
import { BLACKOUT_BOSS_STAGING_CHECKPOINT } from './BlackoutBossStaging.ts';
import { CompanionRegroup } from '../slimes/CompanionRegroup.ts';
import { CompanionIndicators } from '../ui/CompanionIndicators.ts';
import { GOOP_ACID_SPEED_MULTIPLIER } from '../slimes/SlimeRoster.ts';
import { blackoutCompanionWalk, blackoutCompanionWaitingReason, type BlackoutCompanionState } from './BlackoutCompanionWalks.ts';
import { goopSpeedEffectStrength } from '../ui/GoopSpeedOverlay.ts';
import { MaintenanceDronePresentation } from '../render/environment/blackout/MaintenanceDronePresentation.ts';
import {BlackoutVentArrival} from '../cinematics/BlackoutVentArrival.ts';
import { BlackoutElevatorAscent } from '../cinematics/BlackoutElevatorAscent.ts';
import { BlackoutResearchFinale } from '../cinematics/BlackoutResearchFinale.ts';
import { BossDefeatFinale } from '../cinematics/BossDefeatFinale.ts';
import { RESEARCH_TIMING } from '../cinematics/BlackoutResearchTimeline.ts';
import { FinalBossEncounter } from '../boss/FinalBossEncounter.ts';
import { FinalBossPresentation } from '../boss/FinalBossPresentation.ts';
import { FINAL_ARENA, FINAL_BOSS_CHECKPOINT, FINAL_BOSS_PHASE_TWO_CHECKPOINT, FINAL_MERGE_ANCHOR, FINAL_SPECIMEN_MOVEMENT, FINAL_SPECIMEN_WEAPON, FINAL_SPLIT_ANCHORS, FINAL_SPECIMEN_CAMERA, FINAL_SPECIMEN_START_PITCH } from '../boss/FinalBossConfig.ts';

import {
  SentinelBossDevelopmentRig,
} from '../boss/SentinelBossDevelopmentRig.ts';
import { AcidProjectileSystem, type AcidAimReadModel, type AcidProjectileReadState } from '../abilities/AcidProjectileSystem.ts';
import { DissolveSystem } from '../abilities/DissolveSystem.ts';
import type {
  SentinelBossEvents,
  SentinelBossReadModel,
} from '../boss/SentinelBossTypes.ts';
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
import { SpecimenCombatDevelopmentRig } from '../combat/SpecimenCombatDevelopmentRig.ts';
import {
  CombatTargetRegistry,
  type CombatTarget,
  type CombatTargetRegistrationOptions,
} from '../combat/CombatTargetRegistry.ts';
import {
  SpecimenProjectileSystem,
  type SpecimenAttackEvents,
  type SpecimenAttackReadModel,
  type SpecimenProjectileReadState,
} from '../combat/SpecimenProjectileSystem.ts';
import {
  BlackoutPoweredDeviceRig,
} from '../electrical/BlackoutPoweredDeviceRig.ts';
import type { PoweredDeviceReadModel } from '../electrical/PoweredDeviceCore.ts';
import type { PoweredCarrierBody } from '../electrical/PoweredDevices.ts';
import type { Input } from '../core/Input.ts';
import type { LoopStats } from '../core/Loop.ts';
import {
  writePerformancePosition,
  writePerformanceInput,
  type PerformanceGameplaySnapshot,
} from '../core/PerformanceSnapshot.ts';
import {
  ColliderTransformMode,
  CollisionHit,
  CollisionLayer,
  CollisionWorld,
} from '../physics/CollisionWorld.ts';
import { KinematicBody, type JumpInputState } from '../physics/KinematicBody.ts';
import type { MovementEvents } from '../physics/MovementEvents.ts';
import { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import {
  PuzzleRegistry,
  type ResettablePuzzleComponent,
} from '../puzzle/PuzzleRegistry.ts';
import type { RenderLayer, RenderShadowRequest } from '../render/RenderLayer.ts';
import { optimizeFiniteLightEvaluation } from '../render/environment/cultivation/FiniteLightEvaluation.ts';
import { SpatialShadowCache, type ShadowParticipantPosition } from '../render/SpatialShadowCache.ts';
import {
  BobCharacterPresentation,
  type BobCharacterPresentationState,
} from '../render/bob/BobCharacterPresentation.ts';
import { BobReflectionEnvironment } from '../render/bob/BobReflectionEnvironment.ts';
import { VoltElectricalPresentation } from '../render/electrical/VoltElectricalPresentation.ts';
import { GoopAcidPresentation } from '../render/acid/GoopAcidPresentation.ts';
import type { SlimeHealthReadModel } from '../systems/SlimeDamageSystem.ts';
import { SpecimenCombatPresentation } from '../render/specimen/SpecimenCombatPresentation.ts';
import {
  EMPTY_SLIME_HUD_SNAPSHOT,
  type SlimeHUDListener,
  type SlimeHUDSnapshot,
  type SlimePlayerSwitchFeedback,
} from '../slimes/SlimeHUDState.ts';
import { SlimeManager } from '../slimes/SlimeManager.ts';
import { PersistentSlimeGroup } from '../slimes/PersistentSlimeGroup.ts';
import {
  SpecimenFormController,
  type SpecimenFormEvents,
  type SpecimenFormReadModel,
} from '../specimen/SpecimenFormController.ts';
import { DeathSequence } from '../systems/DeathSequence.ts';
import { DeathScreen } from '../ui/DeathScreen.ts';
import {
  MaintenanceDroneController,
} from '../vehicles/MaintenanceDroneController.ts';
import {
  MaintenanceDroneDevelopmentFixture,
} from '../vehicles/MaintenanceDroneDevelopmentFixture.ts';
import type {
  MaintenanceDroneEvents,
  MaintenanceDroneReadModel,
  MaintenanceDroneRecoveryReason,
} from '../vehicles/MaintenanceDroneTypes.ts';
import {
  BlackoutCheckpointManager,
  type BlackoutCheckpointParticipant,
} from './BlackoutCheckpointManager.ts';
import {
  BLACKOUT_AUTHORED_ROOM_ONE_CP2,
  BLACKOUT_AUTHORED_ROOM_TWO_CP3,
  BLACKOUT_CHECKPOINTS,
  BLACKOUT_SPECIMEN_MERGE_ANCHOR,
  BLACKOUT_SPECIMEN_RADIUS_METRES,
  BLACKOUT_SPLIT_BODY_POSITIONS,
} from './BlackoutFoundationManifest.ts';
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
const BLACKOUT_BOB_REFLECTION = { body: 0.12, eyes: 0.28 } as const;
const BLACKOUT_VOLT_LIGHT_INTENSITY = { authored: 18, foundation: 2.2 } as const;
const BLACKOUT_MAINTENANCE_VOLT_RANGES = Object.freeze({
  acquisitionRangeMetres: 11,
  instabilityWarningRangeMetres: 12,
  tetherBreakRangeMetres: 13,
});
const BLACKOUT_TRANSIT_VOLT_RANGES = Object.freeze({
  acquisitionRangeMetres: 100,
  instabilityWarningRangeMetres: 110,
  tetherBreakRangeMetres: 120,
});

export interface BlackoutLevelRuntimeOptions {
  readonly audio?: AudioPlayback;
  readonly creditsMarkdown?: string;
  readonly authoredRoomOne?: boolean;
  /** Story arrival defaults on for the authored bay; deterministic tools may opt out. */
  readonly playArrival?:boolean;
  readonly debugAvailable?: boolean;
  readonly maintenanceMaps?: BlackoutMaintenanceMapData;
  readonly host: HTMLElement;
  readonly input: Input;
  readonly renderLayer: RenderLayer;
  readonly progression: LevelProgressionSnapshot;
}

interface BlackoutRuntimeResources {
  readonly finalBoss?:FinalBossEncounter;
  readonly ventArrival?:BlackoutVentArrival;
  readonly elevatorAscent?: BlackoutElevatorAscent;
  readonly researchFinale?: BlackoutResearchFinale;
  readonly defeatFinale?: BossDefeatFinale;
  readonly dissolveSystem: DissolveSystem;
  readonly acidProjectileSystem: AcidProjectileSystem<KinematicBody>;
  readonly goopAcidPresentation: GoopAcidPresentation;
  readonly maintenanceBay?: BlackoutMaintenanceBayController;
  readonly connectorCamera?:BlackoutConnectorCamera;
  readonly transit?: BlackoutTransitController;
  readonly unregisterTransitCheckpointParticipant?: () => void;
  readonly dronePresentation?: MaintenanceDronePresentation;
  readonly lighting?:BlackoutLightingPass;
  readonly hallwayShadows?: SpatialShadowCache;
  readonly hallwayShadowParticipants: readonly ShadowParticipantPosition[];
  readonly scene: BlackoutLevelScene;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly puzzleRegistry: PuzzleRegistry;
  readonly electricalTargets: ElectricalTargetRegistry;
  readonly electricalSystem: VoltElectricalSystem<KinematicBody>;
  readonly electricalPresentation: VoltElectricalPresentation;
  readonly poweredDeviceRig: BlackoutPoweredDeviceRig;
  readonly groupCarrierBodies: readonly PoweredCarrierBody[];
  readonly specimenCarrierBody: PoweredCarrierBody;
  readonly combatTargets: CombatTargetRegistry;
  readonly combatRig: SpecimenCombatDevelopmentRig;
  readonly sentinelRig: SentinelBossDevelopmentRig;
  readonly maintenanceDroneFixture: MaintenanceDroneDevelopmentFixture;
  readonly maintenanceDrone: MaintenanceDroneController;
  readonly specimenBody: KinematicBody;
  readonly specimenForm: SpecimenFormController;
  readonly specimenAttack: SpecimenProjectileSystem;
  readonly specimenDash: SpecimenDash;
  readonly specimenAbilityAudio?: SpecimenAbilityAudio;
  readonly specimenPresentation: SpecimenCombatPresentation;
  readonly specimenCharacter: SpecimenCharacterPresentation;
  readonly specimenLight: THREE.PointLight;
  readonly unregisterElectricalCheckpointParticipant: () => void;
  readonly unregisterPoweredDevicesCheckpointParticipant: () => void;
  readonly unregisterCombatCheckpointParticipant: () => void;
  readonly unregisterSentinelCheckpointParticipant: () => void;
  readonly unregisterMaintenanceDroneCheckpointParticipant: () => void;
  readonly manager: SlimeManager<KinematicBody>;
  readonly group: PersistentSlimeGroup<KinematicBody>;
  readonly checkpoints: BlackoutCheckpointManager<KinematicBody>;
  readonly phase: BlackoutPhaseController;
  readonly deathSequence: DeathSequence;
  readonly deathScreen: DeathScreen;
  readonly movementEvents: EventBus<MovementEvents>;
  readonly bobPresentation: BobCharacterPresentation;
  readonly goopPresentation: GoopCharacterPresentation;
  readonly goopReflectionLighting: GelReflectionLighting;
  readonly goopPresentationState: GoopCharacterPresentationState;
  readonly goopMovementEvents: EventBus<MovementEvents>;
  readonly renderedGoopPosition: THREE.Vector3;
  goopDeathActive: boolean;
  bobReflectionEnvironment: BobReflectionEnvironment | undefined;
  specimenReflectionEnvironment: SpecimenReflectionEnvironment | undefined;
  readonly bobPresentationState: BobCharacterPresentationState;
  readonly bobMovementIntent: THREE.Vector3;
  readonly goopMovementIntent: THREE.Vector3;
  readonly renderedBobPosition: THREE.Vector3;
  bobDeathActive: boolean;
  readonly voltPresentation: VoltCharacterPresentation;
  readonly voltPresentationState: VoltCharacterPresentationState;
  readonly voltMovementEvents: EventBus<MovementEvents>;
  readonly voltMovementIntent: THREE.Vector3;
  readonly renderedVoltPosition: THREE.Vector3;
  readonly renderedSpecimenPosition: THREE.Vector3;
  voltDeathActive: boolean;
  readonly voltLight: THREE.PointLight;
  readonly movement: THREE.Vector3;
  readonly jump: JumpInputState;
  readonly safetyHit: CollisionHit;
  readonly safetyDisplacement: THREE.Vector3;
}

export class BlackoutLevelRuntime {
  private readonly companions = new CompanionRegroup();
  private companionIndicators?: CompanionIndicators;
  readonly events = new EventBus<GameLevelRuntimeEvents>();

  private readonly host: HTMLElement;
  private readonly audio: AudioPlayback | undefined;
  private gameplayAudio: GameplayAudio | undefined;
  private readonly input: Input;
  private readonly renderLayer: RenderLayer;
  private shadowRequest: RenderShadowRequest | undefined;
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
  private presentationPreparation: Promise<void> | undefined;
  private programPreparation: BlackoutPresentationPreparation | undefined;
  private releaseReducedTransmissionCap: (() => void) | undefined;
  private releaseBossTransmissionCap: (() => void) | undefined;
  private hiddenMaterialCulling: HiddenMaterialCulling | undefined;
  private shutterOcclusion: BlackoutShutterOcclusion | undefined;
  private arenaOcclusion: CameraOcclusion | undefined;
  private readonly drawRenderLayer = (): void => { this.renderLayer.render(); };
  private readonly drawPreparedScene = (): void => {
    if (this.hiddenMaterialCulling) this.hiddenMaterialCulling.render(this.drawRenderLayer);
    else this.drawRenderLayer();
  };
  private readonly preparationCamera = new THREE.PerspectiveCamera();
  private readonly authoredRoomOne: boolean;
  private readonly playArrival:boolean;
  private readonly debugAvailable: boolean;
  private readonly creditsMarkdown: string;
  private maintenanceMaps: BlackoutMaintenanceMapData | undefined;
  private bayComplete = false;
  private roomTwoInitialized = false;
  private bayExitHintShown = false;
  private transitObjective = '';

  constructor(options: BlackoutLevelRuntimeOptions) {
    this.creditsMarkdown = options.creditsMarkdown ?? '';
    this.authoredRoomOne = options.authoredRoomOne ?? false;
    this.playArrival=options.playArrival??this.authoredRoomOne;
    this.debugAvailable = options.debugAvailable ?? import.meta.env?.DEV ?? false;
    if (this.authoredRoomOne && !options.maintenanceMaps) throw new Error('Room 1 texture maps must be prepared before runtime construction.');
    this.maintenanceMaps = options.maintenanceMaps;
    validateLevelThreeProgressionSnapshot(options.progression);
    this.audio = options.audio;
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

  get roomState(): BlackoutRoomState {
    return {
      roomId: this.currentRoom.roomId,
      phase: this.currentRoom.phase,
      local: { ...this.currentRoom.local },
    };
  }

  get voltElectricalReadModel(): VoltElectricalReadModel | undefined {
    return this.resources?.electricalSystem.readModel;
  }

  get goopAimReadModel(): AcidAimReadModel | undefined {
    return this.resources?.acidProjectileSystem.aimReadModel;
  }

  get goopProjectileStates(): readonly AcidProjectileReadState[] {
    return this.resources?.acidProjectileSystem.projectileStates ?? [];
  }

  getPoweredDeviceReadModel(
    id: string,
  ): PoweredDeviceReadModel | undefined {
    return this.resources?.poweredDeviceRig.devices.getReadModel(id);
  }


  get specimenFormReadModel(): SpecimenFormReadModel | undefined {
    return this.resources?.specimenForm.readModel;
  }

  get finalBossReadModel() { return this.resources?.finalBoss?.controller.readModel; }

  get specimenAttackReadModel(): SpecimenAttackReadModel | undefined {
    return this.resources?.specimenAttack.readModel;
  }

  get specimenProjectileStates(): readonly SpecimenProjectileReadState[] {
    return this.resources?.specimenAttack.projectileStates ?? [];
  }

  get specimenFormEvents(): Pick<
    EventBus<SpecimenFormEvents>,
    'on'
  > | undefined {
    return this.resources?.specimenForm.events;
  }

  get specimenAttackEvents(): Pick<
    EventBus<SpecimenAttackEvents>,
    'on'
  > | undefined {
    return this.resources?.specimenAttack.events;
  }

  get sentinelBossReadModel(): SentinelBossReadModel | undefined {
    return this.resources?.sentinelRig.controller.readModel;
  }

  get sentinelBossEvents(): Pick<
    EventBus<SentinelBossEvents>,
    'on'
  > | undefined {
    return this.resources?.sentinelRig.controller.events;
  }

  get maintenanceDroneReadModel(): MaintenanceDroneReadModel | undefined {
    return this.resources?.maintenanceDrone.readModel;
  }

  /** Snapshot only; callers cannot mutate the persistent authoritative bodies. */
  getSlimePositions(): Readonly<Record<'bob' | 'goop' | 'volt', THREE.Vector3>> | undefined {
    const group = this.resources?.group;
    if (!group) return undefined;
    return {
      bob: new THREE.Vector3(group.bobBody.position.x, group.bobBody.position.y, group.bobBody.position.z),
      goop: new THREE.Vector3(group.goopBody.position.x, group.goopBody.position.y, group.goopBody.position.z),
      volt: new THREE.Vector3(group.voltBody.position.x, group.voltBody.position.y, group.voltBody.position.z),
    };
  }

  get maintenanceDroneEvents(): Pick<
    EventBus<MaintenanceDroneEvents>,
    'on'
  > | undefined {
    return this.resources?.maintenanceDrone.events;
  }

  requestMaintenanceDroneRecovery(
    reason: MaintenanceDroneRecoveryReason,
  ): boolean {
    return this.requireResources().maintenanceDrone.requestRecovery(reason);
  }

  registerCombatTarget(
    target: CombatTarget,
    options?: CombatTargetRegistrationOptions,
  ): () => void {
    return this.requireResources().combatTargets.register(target, options);
  }

  load(): void {
    if (this.lifecycle.state === 'unloaded') {
      this.presentationPreparation = undefined;
    }
    this.lifecycle.load();
  }
  async prepareRenderResources(alpha: number, stats: Readonly<LoopStats>): Promise<void> {
    this.renderLayer.prepareRenderResources(() => this.render(alpha, stats));
  }

  async prepareGraphics(): Promise<void> {
    const previous = this.programPreparation;
    this.presentationPreparation = undefined;
    try { await this.preparePresentation(); }
    finally { previous?.dispose(); }
  }

  preparePresentation(): Promise<void> {
    const resources = this.requireResources();
    // Bound Medium's second scene draw before preparation allocates the live
    // refraction buffer. Full physical gel keeps its requested resolution.
    this.releaseReducedTransmissionCap ??= this.renderLayer.gelRendering.requestReducedTransmissionCap(0.5);
    resources.bobReflectionEnvironment ??= new BobReflectionEnvironment(
      this.renderLayer.renderer,
    );
    resources.bobPresentation.setReflectionEnvironment(
      resources.bobReflectionEnvironment.texture,
    );
    resources.bobPresentation.setReflectionIntensity(
      0,
      0,
      true,
    );
    resources.goopPresentation.setReflectionEnvironment(resources.bobReflectionEnvironment.texture);
    resources.voltPresentation.setReflectionEnvironment(resources.bobReflectionEnvironment.texture);
    resources.specimenReflectionEnvironment ??= new SpecimenReflectionEnvironment(this.renderLayer.renderer);
    resources.specimenCharacter.setReflectionEnvironment(resources.specimenReflectionEnvironment.texture);
    resources.scene.finalArena?.surfaceMaterials.setEnvironment(resources.bobReflectionEnvironment.texture);
    resources.finalBoss?.setReflectionEnvironment(resources.bobReflectionEnvironment.texture);
    return this.presentationPreparation ??= Promise.all([
      resources.bobPresentation.prepare(),
      resources.goopPresentation.prepare(),
      resources.voltPresentation.prepare(),
      resources.specimenCharacter.prepare(),
      resources.scene.finalArena?.prepare(),
      resources.finalBoss?.prepare(),
      resources.dronePresentation?.prepare(),
      resources.transit?.prepareArt(),
      resources.scene.bossStaging?.ascentLift?.prepareArt(),
      resources.maintenanceBay && resources.scene.maintenanceBay?.prepareArt(resources.maintenanceBay.door.collisionMesh),
      resources.researchFinale?.ready,
    ]).then(async () => {
      if (this.resources !== resources) return;
      this.hiddenMaterialCulling = new HiddenMaterialCulling(this.renderLayer.scene);
      const ascentRearGate = resources.scene.bossStaging?.ascentLift?.rearGate;
      if (ascentRearGate) this.shutterOcclusion = new BlackoutShutterOcclusion(
        this.renderLayer.renderer, ascentRearGate, resources.scene.root,
      );
      if (resources.scene.finalArena) this.arenaOcclusion = new CameraOcclusion(
        this.renderLayer.renderer, resources.scene.finalArena.cameraOccluders,
        [resources.scene.maintenanceBay?.root, resources.scene.transitRoom?.root,
          resources.scene.bossStaging?.root, resources.transit?.root].filter((root): root is THREE.Group => !!root),
      );
      resources.researchFinale?.connectArenaCutout(this.renderLayer.renderer);
      // The retained light layout includes distant and unpowered fixtures.
      // Reuse the tested finite-light guard before warming all material forms;
      // zero-contribution sources need no BRDF evaluation, including transmission.
      this.renderLayer.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial) optimizeFiniteLightEvaluation(material, true);
        }
      });
      if(resources.lighting){
        await resources.lighting.prepare(this.renderLayer.renderer,[resources.scene.maintenanceBay!.root,resources.scene.transitRoom!.root,
          resources.scene.bossStaging!.root,resources.bobPresentation.root,resources.goopPresentation.root,resources.voltPresentation.root,
          resources.maintenanceDroneFixture.droneRoot],this.renderLayer.graphicsConfiguration);
        if(this.resources!==resources)return;
      }
      const preparation = new BlackoutPresentationPreparation();
      this.programPreparation = preparation;
      await preparation.prepare(this.renderLayer, this.preparationCamera.copy(this.renderLayer.cameraRig.camera),resources.lighting?.lightLayout);
      if (this.resources !== resources) return;
      const primeDeaths=()=>{
      prepareShadowSamplerMaps(this.renderLayer.renderer, this.renderLayer.scene, this.renderLayer.cameraRig.camera);
      resources.goopPresentation.primeDeathResources(resources.group.goopBody.position, root => {
        withIsolatedPrewarmState(this.renderLayer.renderer, () => this.renderLayer.withShadowPreparation(true, () =>
          renderIsolatedPrewarmResources(this.renderLayer.renderer, this.renderLayer.scene, this.renderLayer.cameraRig.camera, [root])));
      });
      resources.specimenCharacter.primeDeathResources(resources.specimenBody.position, root => {
        withIsolatedPrewarmState(this.renderLayer.renderer, () => this.renderLayer.withShadowPreparation(true, () =>
          renderIsolatedPrewarmResources(this.renderLayer.renderer, this.renderLayer.scene, this.renderLayer.cameraRig.camera, [root])));
      });
      resources.voltPresentation.primeDeathResources(resources.group.voltBody.position, root => {
        withIsolatedPrewarmState(this.renderLayer.renderer, () => this.renderLayer.withShadowPreparation(true, () =>
          renderIsolatedPrewarmResources(this.renderLayer.renderer, this.renderLayer.scene, this.renderLayer.cameraRig.camera, [root])));
      });
      };
      if(resources.lighting?.lightLayout)resources.lighting.lightLayout.withLayout(this.renderLayer.cameraRig.camera,resources.group.activeBody.position,primeDeaths);
      else primeDeaths();
      if (typeof window !== 'undefined') {
        const layer = this.renderLayer, renderer = layer.renderer;
        const yieldFrame = () => new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
        const current = () => this.resources === resources;
        const cinematicPrograms = new CinematicCompileCache();
        const visibility = layer.canvas.style.visibility;
        layer.canvas.style.visibility = 'hidden';
        try { const warmFrame = async (camera: THREE.PerspectiveCamera) => {
          await yieldFrame(); if (!current()) return;
          const shadows = renderer.shadowMap.enabled;
          const withLights = <T>(action: () => T): T => resources.lighting?.lightLayout
            ? resources.lighting.lightLayout.withLayout(camera, camera.position, action) : action();
          await withLights(() => layer.withShadowPreparation(shadows, () => cinematicPrograms.compile(renderer, layer.scene, camera)));
          if (!current()) return;
          const viewport = renderer.getViewport(new THREE.Vector4()), transmissionScale = renderer.transmissionResolutionScale;
          withLights(() => withIsolatedPrewarmState(renderer, () => {
            // Each shot can select previously unused lamps. Allocate their
            // depth samplers before the receiver draw freezes shadow updates.
            if (shadows) prepareShadowSamplerMaps(renderer, layer.scene, camera);
            // These temporary cinematic cameras only rehearse programs/uploads.
            // The retained gameplay camera's full-size transmission target was
            // already primed by BlackoutPresentationPreparation. Keep that
            // storage and the full-size shadow maps; bound only the hidden
            // rehearsal raster work, drawing every shot and fencing below.
            const ratio = renderer.getPixelRatio();
            const scale = Math.min(1, 16 / (viewport.z * ratio), 9 / (viewport.w * ratio));
            const minimumSpan = Math.ceil(1 / transmissionScale) / ratio;
            renderer.setViewport(0, 0, Math.max(minimumSpan, viewport.z * scale), Math.max(minimumSpan, viewport.w * scale));
            renderer.setScissorTest(false); renderer.transmissionResolutionScale = transmissionScale;
            layer.withShadowPreparation(shadows, () => this.hiddenMaterialCulling!.render(() => renderer.render(layer.scene, camera)));
          }));
        };
          await resources.researchFinale?.primePresentationFrames(layer.scene, warmFrame, current);
          await resources.defeatFinale?.primePresentationFrames(warmFrame, current);
          // Every rehearsal submits to the same context. One fence drains all
          // preceding shots, allowing their uploads and CPU preparation to
          // overlap instead of stopping the pipeline at each camera pose.
          await waitForGpuPreparation(renderer.getContext(), yieldFrame, current);
        } finally {
          const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
          withIsolatedPrewarmState(renderer, () => {
            renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.setClearColor(0x000000, 1); renderer.clear(true, true, true);
          });
          renderer.setClearColor(clearColor, clearAlpha); layer.canvas.style.visibility = visibility;
        }
      }
    }).catch(error => {
      if (this.resources === resources) this.unload();
      throw error;
    });
  }
  start(): void { this.lifecycle.start(); }
  stop(): void { this.lifecycle.stop(); }
  restartLevel(): void { this.lifecycle.restartLevel(); }
  unload(): void { this.lifecycle.unload(); }

  dispose(): void {
    this.lifecycle.dispose();
    this.maintenanceMaps = undefined;
    this.hudListeners.clear();
    this.events.clear();
  }

  setDebugInteractionEnabled(enabled: boolean): void {
    this.debugInteractionEnabled = enabled;
    if (this.lifecycle.state === 'running' && this.resources) {
      this.input.setEnabled(
        enabled &&
        !this.resources.ventArrival?.active &&
        !this.resources.phase.terminal &&
        this.resources.deathSequence.isPlaying,
      );
      if (!enabled) {
        this.input.resetState();
        this.resources.electricalSystem.cancelAim();
        this.resources.acidProjectileSystem.cancelAim();
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
    const specimenControlled =
      resources.specimenForm.readModel.controlledForm === 'specimen';
    return {
      roster: resources.manager.getRosterState(),
      activeSlimeId: specimenControlled
        ? undefined
        : resources.manager.activeSlimeId,
      controlledForm: specimenControlled ? 'specimen' : 'slime',
      activeFormLabel: specimenControlled ? 'SPECIMEN' : undefined,
      passiveInteractions: this.companions.passiveInteractions,
      playerSwitchFeedback: undefined,
      resetSwitchFeedback: false,
    };
  }

  getPlayerHealth(): SlimeHealthReadModel | undefined {
    const resources = this.resources;
    if (!resources || !resources.deathSequence.isPlaying || this.host.dataset.cinematic ||
        this.host.dataset.bossEncounter === 'true' || resources.specimenForm.readModel.controlledForm !== 'group' ||
        !resources.transit?.isActive) return undefined;
    return resources.transit.damage.health.find(health => health.slimeId === resources.manager.activeSlimeId);
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

  markMaintenanceDroneTutorialCompleted(): void {
    this.requireResources().maintenanceDrone.markTutorialCompleted();
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
    this.assertCheckpointActivationAllowed(resources, checkpointId);
    resources.checkpoints.activate(checkpointId, resources.group.activeSlimeId);
    const snapshot = resources.checkpoints.activeCheckpoint;
    this.currentRoom = snapshot.room;
    this.roomTwoInitialized = snapshot.room.roomId === 'room-2';
    this.bayComplete =
      this.roomTwoInitialized ||
      snapshot.room.local.maintenanceBayComplete === true;
    resources.phase.restore(snapshot.room.phase);
    this.events.emit('objectiveChanged', {
      roomId: snapshot.room.roomId,
      objective: objectiveFor(snapshot.room),
    });
  }

  captureCheckpoint(checkpointId: BlackoutCheckpointId, room: BlackoutRoomState): void {
    const resources = this.requireResources();
    this.assertCheckpointActivationAllowed(resources, checkpointId);
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
    this.roomTwoInitialized = room.roomId === 'room-2';
    this.bayComplete =
      this.roomTwoInitialized || room.local.maintenanceBayComplete === true;
  }

  recoverActiveCheckpoint(): void {
    this.restoreActiveCheckpoint(this.requireResources(), true);
  }

  /** Shared failure hook for hazards authored by later Blackout room issues. */
  requestFailure(): boolean {
    const resources = this.requireResources();
    if(resources.finalBoss?.cinematic || resources.elevatorAscent?.active || resources.researchFinale?.active || resources.defeatFinale?.active)return false;
    if(resources.phase.phase==='boss'&&resources.finalBoss?.controller.devInvincible)return false;
    if (this.lifecycle.state !== 'running' || resources.phase.terminal) return false;
    if (!resources.deathSequence.requestDeath(
      () => {
        if (this.authoredRoomOne && this.currentRoom.roomId === 'room-2' && resources.transit) {
          // Death retries restart the whole cooperation room, not a late
          // snapshot with inactive slimes and solved devices left mid-route.
          resources.transit.reset();
          resources.transit.setActive(true);
          this.activateCheckpoint('cp3');
        }
        this.restoreActiveCheckpoint(resources, false);
      },
    )) {
      return false;
    }
    resources.voltDeathActive = resources.specimenForm.readModel.controlledForm === 'group' && resources.group.activeSlimeId === 'volt';
    if (resources.voltDeathActive && !resources.voltPresentation.startDeath(resources.group.voltBody.position)) {
      resources.voltDeathActive = false; resources.deathSequence.reset(); return false;
    }
    resources.goopDeathActive = resources.specimenForm.readModel.controlledForm === 'group' && resources.group.activeSlimeId === 'goop';
    if (resources.goopDeathActive && !resources.goopPresentation.startDeath(resources.group.goopBody.position)) {
      resources.goopDeathActive = false; resources.deathSequence.reset(); return false;
    }
    resources.bobDeathActive =
      resources.specimenForm.readModel.controlledForm === 'group' &&
      resources.group.activeSlimeId === 'bob';
    if (
      resources.bobDeathActive &&
      !resources.bobPresentation.startDeath(resources.group.bobBody.position)
    ) {
      resources.bobDeathActive = false;
      resources.deathSequence.reset();
      return false;
    }
    if (resources.specimenForm.readModel.controlledForm === 'specimen') resources.specimenCharacter.startDeath(resources.specimenBody.position);
    this.gameplayAudio?.died(resources.specimenForm.readModel.controlledForm === 'group' ? resources.manager.activeSlimeId : undefined);
    this.resetCompanions();
    resources.electricalSystem.reset('death');
    resources.acidProjectileSystem.reset();
    resources.goopAcidPresentation.reset();
    resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
    resources.sentinelRig.controller.cancelTransient('death');
    resources.finalBoss?.suspend();
    resources.finalBoss?.restoreCamera(this.renderLayer.cameraRig.camera);
    resources.maintenanceDrone.cancelTransient('death');
    resources.specimenPresentation.suspend();
    resources.poweredDeviceRig.recomputePower();
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.renderLayer.cameraRig.setAimPresentationActive(false);
    this.input.setEnabled(false);
    this.input.resetState();
    this.input.releasePointerLock();
    this.host.dataset.gameState = resources.deathSequence.state;
    return true;
  }

  /** Begin the guarded six-second fixed-step merge. */
  beginMerge(): boolean {
    const resources = this.requireResources();
    if (resources.phase.phase !== 'three-slime' || resources.elevatorAscent?.active || resources.researchFinale?.active) return false;
    if (
      !this.isSpawnSafe(
        resources,
        this.authoredRoomOne ? FINAL_MERGE_ANCHOR : BLACKOUT_SPECIMEN_MERGE_ANCHOR,
        resources.specimenBody.radiusMetres,
      )
    ) {
      return false;
    }
    if (!resources.specimenForm.beginMerge()) return false;
    if (!resources.phase.transition('merging')) {
      resources.specimenForm.restore('group');
      return false;
    }

    resources.scene.bossStaging?.ascentLift?.setArenaAccessOpen(true);
    this.resetCompanions();
    this.input.resetState();
    resources.electricalSystem.disconnect('merge');
    resources.electricalSystem.cancelAim();
    resources.acidProjectileSystem.reset();
    resources.goopAcidPresentation.reset();
    resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
    resources.sentinelRig.controller.cancelTransient('phase-change');
    resources.maintenanceDrone.recoverImmediately('checkpoint');
    resources.dronePresentation?.update(0, resources.maintenanceDrone.readModel,
      resources.group.activeSlimeId === 'volt');
    resources.poweredDeviceRig.recomputePower();
    resources.electricalPresentation.update(
      resources.electricalSystem.readModel,
    );
    this.renderLayer.cameraRig.setAimPresentationActive(false, true);
    resources.movement.set(0, 0, 0);
    clearJump(resources.jump, true);
    this.currentRoom = {
      roomId: 'room-4a',
      phase: 'merging',
      local: { ...this.currentRoom.local },
    };
    this.notifyHUD(undefined, true);
    return true;
  }

  /** Begin split staging after the boss has been defeated. */
  beginSplit(): boolean {
    const resources = this.requireResources();
    if (resources.phase.phase !== 'boss-defeated') return false;
    if (!this.areSplitAnchorsSafe(resources)) return false;
    if (!resources.specimenForm.beginSplit()) return false;
    if (!resources.phase.transition('splitting')) {
      resources.specimenForm.restore('specimen');
      return false;
    }

    this.resetCompanions();
    this.input.resetState();
    resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
    this.renderLayer.cameraRig.setAimPresentationActive(false, true);
    this.currentRoom = {
      roomId: 'ending',
      phase: 'splitting',
      local: { ...this.currentRoom.local },
    };
    this.notifyHUD(undefined, true);
    return true;
  }

  /**
   * Presentation/cinematic owner calls this when split staging finishes.
   * All three anchors are validated before any original body is moved.
   */
  completeSplit(): boolean {
    const resources = this.requireResources();
    if (resources.phase.phase !== 'splitting') return false;
    if (!this.areSplitAnchorsSafe(resources)) return false;
    if (!resources.specimenForm.completeSplit()) return false;

    resources.group.setRecoveryState({
      positions: {
        bob: this.authoredRoomOne ? FINAL_SPLIT_ANCHORS.bob : BLACKOUT_SPLIT_BODY_POSITIONS.bob,
        goop: this.authoredRoomOne ? FINAL_SPLIT_ANCHORS.goop : BLACKOUT_SPLIT_BODY_POSITIONS.goop,
        volt: this.authoredRoomOne ? FINAL_SPLIT_ANCHORS.volt : BLACKOUT_SPLIT_BODY_POSITIONS.volt,
      },
      activeSlimeId: 'bob',
    });
    resources.group.restoreRecoveryState();
    if (!resources.phase.transition('escape')) {
      throw new Error('Split completed without a legal escape phase transition.');
    }
    this.currentRoom = {
      roomId: 'ending',
      phase: 'escape',
      local: { ...this.currentRoom.local, splitComplete: true },
    };
    resources.bobMovementIntent.set(0, 0, 0);
    resources.goopMovementIntent.set(0, 0, 0);
    resources.voltMovementIntent.set(0, 0, 0);
    resources.bobPresentation.setPosition(resources.group.bobBody.position);
    resources.bobPresentation.reset();
    resources.goopPresentation.setPosition(resources.group.goopBody.position);
    resources.goopPresentation.reset();
    resources.goopDeathActive = false;
    resources.voltPresentation.setPosition(resources.group.voltBody.position);
    resources.voltPresentation.reset(); resources.voltDeathActive = false;
    resources.specimenCharacter.reset();
    this.resetForwardCamera();
    this.retargetCamera(resources);
    this.syncVisuals(resources);
    this.notifyHUD(undefined, true);
    return true;
  }

  /**
   * Boss/ending integration hook. Sentinel owns the local boss state machine;
   * Blackout owns only the macro specimen -> boss -> boss-defeated transition.
   */
  transitionPhase(next: BlackoutPhase): boolean {
    if (next === 'merging') return this.beginMerge();
    if (next === 'splitting') return this.beginSplit();
    if (next === 'escape') return false;
    if (next === 'specimen') return false;
    if (next === 'boss-defeated') {
      // Only Sentinel's one-shot defeat request may commit this phase.
      return false;
    }

    const resources = this.requireResources();
    if (
      next === 'boss' &&
      resources.specimenForm.readModel.controlledForm !== 'specimen'
    ) {
      return false;
    }

    if (next === 'boss') {
      if(resources.finalBoss) {
        if(resources.finalBoss.controller.readModel.state!=='idle'||!resources.phase.transition('boss'))return false;
        resources.finalBoss.start();resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);this.input.resetState();
        this.renderLayer.cameraRig.setAimPresentationActive(false,true);
        this.currentRoom={roomId:'room-4b',phase:'boss',local:{finalBoss:true}};
        this.events.emit('objectiveChanged',{roomId:'room-4b',objective:'Survive the attack. Charge a shot when the core opens.'});return true;
      }
      if (resources.sentinelRig.controller.readModel.state !== 'idle') {
        return false;
      }
      if (!resources.phase.transition('boss')) return false;
      if (!resources.sentinelRig.controller.start()) {
        resources.phase.restore('specimen');
        return false;
      }
      resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
      resources.acidProjectileSystem.reset();
      resources.goopAcidPresentation.reset();
      this.renderLayer.cameraRig.setAimPresentationActive(false, true);
      this.currentRoom = {
        ...this.currentRoom,
        roomId: 'room-4b',
        phase: 'boss',
      };
      resources.sentinelRig.syncPresentation();
      this.events.emit('objectiveChanged', {
        roomId: this.currentRoom.roomId,
        objective: objectiveFor(this.currentRoom),
      });
      return true;
    }

    if (!resources.phase.transition(next)) return false;

    if (next === 'complete') {
      resources.electricalSystem.disconnect('completion');
      resources.acidProjectileSystem.reset();
      resources.goopAcidPresentation.reset();
      resources.electricalSystem.cancelAim();
      resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
      resources.sentinelRig.controller.cancelTransient('phase-change');
      resources.poweredDeviceRig.recomputePower();
      this.renderLayer.cameraRig.setAimPresentationActive(false, true);
    }
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.currentRoom = {
      ...this.currentRoom,
      phase: next,
      roomId:
        next === 'complete' ? 'ending' : this.currentRoom.roomId,
    };
    if (next === 'complete') this.commitCompletion();
    return true;
  }

  fixedUpdate(deltaSeconds: number): void {
    if (this.lifecycle.state !== 'running') return;
    const resources = this.requireResources();
    if(resources.ventArrival?.active){
      this.resetCompanions();
      resources.scene.maintenanceBay?.advanceAcid(deltaSeconds);
      if(resources.ventArrival.update(deltaSeconds)){
        this.clearArrivalUi();this.input.resetState();
        this.input.setEnabled(this.debugInteractionEnabled&&!resources.phase.terminal&&resources.deathSequence.isPlaying);
      }
      this.syncVisuals(resources);this.gameplayAudio?.update();this.input.endFixedUpdate();return;
    }
    resources.scene.transitRoom?.update(deltaSeconds);
    if (this.debugAvailable && this.authoredRoomOne && this.debugInteractionEnabled && this.input.enabled) {
      if(this.input.wasPressed('debugTeleportRoomFour')) {
        this.teleportToFinalBoss();this.input.endFixedUpdate();return;
      }
      const room = this.input.wasPressed('debugTeleportRoomOne') ? 1
        : this.input.wasPressed('debugTeleportRoomTwo') ? 2
          : this.input.wasPressed('debugTeleportRoomThree') ? 3 : undefined;
      if (room) {
        this.teleportToAuthoredRoom(room);
        this.gameplayAudio?.update();
        this.input.endFixedUpdate();
        return;
      }
    }
    if (resources.phase.terminal) {
      this.gameplayAudio?.update();
      this.input.endFixedUpdate();
      return;
    }
    if (!resources.deathSequence.isPlaying) {
      resources.scene.maintenanceBay?.advanceAcid(deltaSeconds);
      if (resources.bobDeathActive) {
        resources.bobPresentation.updateDeath(deltaSeconds);
      }
      if (resources.goopDeathActive) resources.goopPresentation.updateDeath(deltaSeconds);
      if (resources.voltDeathActive) resources.voltPresentation.updateDeath(deltaSeconds);
      resources.specimenCharacter.updateDeath(deltaSeconds);
      if (resources.deathSequence.update(deltaSeconds)) {
        resources.deathScreen.show();
        this.host.dataset.gameState = resources.deathSequence.state;
      }
      this.gameplayAudio?.update();
      this.input.endFixedUpdate();
      return;
    }

    if (resources.defeatFinale?.active) {
      if (resources.defeatFinale.update(deltaSeconds, this.input.wasPressed('skipCinematic'))) {
        this.host.dataset.endingCreditsSkipped = resources.defeatFinale.skippedCredits ? 'true' : 'false';
        if (!this.beginSplit() || !this.completeSplit() || !this.transitionPhase('complete')) throw new Error('Boss finale could not commit the ending.');
      }
      this.gameplayAudio?.update(); this.input.endFixedUpdate(); return;
    }

    if (resources.researchFinale?.active) {
      const before = resources.researchFinale.seconds;
      if (resources.researchFinale.update(deltaSeconds, this.input.wasPressed('skipCinematic'))) this.finishResearchFinale(resources);
      else if (before < RESEARCH_TIMING.handback && resources.researchFinale.seconds >= RESEARCH_TIMING.handback) this.seedResearchBossCamera(resources);
      this.syncVisuals(resources); this.gameplayAudio?.update(); this.input.endFixedUpdate(); return;
    }

    if (resources.elevatorAscent?.active) {
      resources.scene.maintenanceBay?.advanceAcid(deltaSeconds);
      if (resources.elevatorAscent.update(deltaSeconds, this.input.wasPressed('skipCinematic'))) {
        this.activateCheckpoint('cp6'); this.input.resetState(); this.retargetCamera(resources);
      }
      this.syncVisuals(resources); this.gameplayAudio?.update(); this.input.endFixedUpdate(); return;
    }

    if(import.meta.env?.DEV&&this.debugInteractionEnabled&&this.input.enabled&&resources.phase.phase==='boss'&&this.input.wasPressed('debugToggleInvincibility')) {
      resources.finalBoss?.controller.toggleDevInvincibility();
    }
    if(resources.finalBoss?.cinematic) {
      this.resetCompanions();
      resources.finalBoss.update(deltaSeconds,this.input.wasPressed('skipCinematic'));
      this.commitFinalBossPhaseTwoCheckpoint(resources);
      resources.specimenAttack.cancelInput(); resources.specimenDash.cancel(); resources.specimenAbilityAudio?.setEnabled(false);this.renderLayer.cameraRig.setAimPresentationActive(false,true);
      if(resources.finalBoss.controller.consumeDefeat())this.commitBossDefeat(resources);
      if(resources.finalBoss.controller.readModel.state==='complete') {
        if(this.beginSplit()&&this.completeSplit())this.transitionPhase('complete');
      } else if(!resources.finalBoss.cinematic) {
        this.input.resetState();resources.finalBoss.restoreCamera(this.renderLayer.cameraRig.camera);this.retargetCamera(resources);
      }
      this.syncVisuals(resources);this.gameplayAudio?.update();this.input.endFixedUpdate();return;
    }

    if (resources.phase.phase === 'merging') {
      if(resources.finalBoss) {
        resources.bobMovementIntent.set(-resources.group.bobBody.position.x,0,1).normalize();
        resources.goopMovementIntent.set(-resources.group.goopBody.position.x,0,1).normalize();
        resources.voltMovementIntent.set(-resources.group.voltBody.position.x,0,1).normalize();
        this.updateBobPresentation(deltaSeconds,resources);
      }
      const form = resources.specimenForm.readModel;
      const willComplete =
        form.mergeProgress +
          deltaSeconds / form.mergeDurationSeconds >=
        1 - 1e-9;

      if (
        willComplete &&
        !this.isSpawnSafe(
          resources,
          this.authoredRoomOne ? FINAL_MERGE_ANCHOR : BLACKOUT_SPECIMEN_MERGE_ANCHOR,
          resources.specimenBody.radiusMetres,
        )
      ) {
        // Completion is guarded before the form controller can emit its
        // mergeCompleted event or hand ownership to Specimen.
        resources.specimenForm.restore('group');
        resources.phase.restore('three-slime');
        this.currentRoom = {
          ...this.currentRoom,
          roomId: 'room-3',
          phase: 'three-slime',
        };
        this.resetForwardCamera();
        this.retargetCamera(resources);
        this.notifyHUD(undefined, true);
        this.events.emit('objectiveChanged', {
          roomId: this.currentRoom.roomId,
          objective: objectiveFor(this.currentRoom),
        });
      } else if (resources.specimenForm.updateMerge(deltaSeconds)) {
        resources.specimenBody.recoverAt(this.authoredRoomOne ? FINAL_MERGE_ANCHOR : BLACKOUT_SPECIMEN_MERGE_ANCHOR);
        resources.specimenCharacter.reset();
        if (resources.finalBoss) resources.specimenCharacter.setYaw(Math.PI);
        if (!resources.phase.transition('specimen')) {
          throw new Error('Merge completed without a legal Specimen phase transition.');
        }
        this.currentRoom = {
          roomId: 'room-4a',
          phase: 'specimen',
          local: { ...this.currentRoom.local, merged: true },
        };
        this.resetForwardCamera();
        this.retargetCamera(resources);
        this.notifyHUD(undefined, true);
        if(resources.finalBoss) {
          this.renderLayer.cameraRig.setGroundOrbitYawRadians?.(Math.PI);
          this.renderLayer.cameraRig.setGroundOrbitPitchRadians?.(FINAL_SPECIMEN_START_PITCH);
          resources.checkpoints.activate('cp8','bob');
          this.transitionPhase('boss');
        }
      }
      resources.poweredDeviceRig.updateMechanics(deltaSeconds, []);
      resources.poweredDeviceRig.updateHazards(deltaSeconds, []);
      this.syncVisuals(resources);
      this.gameplayAudio?.update();
      this.input.endFixedUpdate();
      return;
    }

    if (
      resources.phase.phase === 'splitting' ||
      resources.phase.phase === 'boss-defeated'
    ) {
      resources.specimenAttack.cancelInput(); resources.specimenDash.cancel(); resources.specimenAbilityAudio?.setEnabled(false);
      resources.poweredDeviceRig.updateMechanics(deltaSeconds, []);
      resources.poweredDeviceRig.updateHazards(deltaSeconds, []);
      this.syncVisuals(resources);
      this.gameplayAudio?.update();
      this.input.endFixedUpdate();
      return;
    }

    if (this.input.enabled && this.input.wasPressed('toggleView')) this.renderLayer.cameraRig.toggleViewMode();
    let switched = false;
    if (
      this.currentRoom.phase === 'three-slime' ||
      this.currentRoom.phase === 'escape'
    ) {
      if (this.input.wasPressed('switchSlime')) {
        const previous = resources.group.activeSlimeId;
        const parkedForSwitch =
          previous === 'volt' &&
          resources.maintenanceDrone.voltMounted
            ? resources.maintenanceDrone.parkForSwitch()
            : false;
        switched = resources.group.switchNext();
        if (!switched && parkedForSwitch) {
          resources.maintenanceDrone.resumeMountedControl();
        }
        if (switched) {
          if (
            resources.group.activeSlimeId === 'volt' &&
            resources.maintenanceDrone.voltMounted
          ) {
            resources.maintenanceDrone.resumeMountedControl();
          }
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

    const droneGameplayEnabled =
      this.input.enabled &&
      this.currentRoom.roomId === 'room-1' &&
      this.currentRoom.phase === 'three-slime';
    resources.maintenanceDrone.updateMountAvailability(
      resources.group.activeSlimeId,
      resources.group.voltBody.position,
      droneGameplayEnabled,
    );

    if (
      !switched &&
      droneGameplayEnabled &&
      this.input.wasPressed('mountDrone') &&
      resources.group.activeSlimeId === 'volt'
    ) {
      if (resources.maintenanceDrone.voltMounted) {
        resources.maintenanceDrone.requestDismount(
          resources.group.voltBody,
        );
      } else {
        resources.maintenanceDrone.requestMount(
          'volt',
          resources.group.voltBody.position,
        );
      }
    }

    const moveX =
      (this.input.isDown('moveRight') ? 1 : 0) -
      (this.input.isDown('moveLeft') ? 1 : 0);
    const moveZ =
      (this.input.isDown('moveBackward') ? 1 : 0) -
      (this.input.isDown('moveForward') ? 1 : 0);

    const specimenGameplay =
      resources.phase.phase === 'specimen' ||
      resources.phase.phase === 'boss';
    const body = specimenGameplay
      ? resources.specimenBody
      : resources.group.activeBody;
    resources.bobMovementIntent.set(0, 0, 0);
    resources.goopMovementIntent.set(0, 0, 0);
    resources.voltMovementIntent.set(0, 0, 0);
    this.companions.beginStep(deltaSeconds);

    // Switching changes input ownership, not gravity. Keep the other bodies
    // falling and landing; mounted Volt is carried by the drone instead.
    if (!specimenGameplay) {
      resources.movement.set(0, 0, 0);
      for (const passiveBody of resources.group.bodies) {
        if (passiveBody === resources.group.voltBody && resources.maintenanceDrone.voltMounted) {
          if (passiveBody !== body && !switched) this.companions.hold('volt', 'mounted');
          continue;
        }
        if (passiveBody !== body || switched) {
          const id = passiveBody === resources.group.bobBody ? 'bob'
            : passiveBody === resources.group.goopBody ? 'goop' : 'volt';
          const bay = resources.maintenanceBay?.bay;
          const state: BlackoutCompanionState = {
            id, position: passiveBody.position, leader: body.position, party: resources.group.bodies,
            committedRoute: this.companions.committedWalk(id),
            bayAvailable: !!bay,
            mainRouteReady: !!bay && [resources.group.bobBody, resources.group.goopBody].every(
              slime => bay.vestibuleAt(slime.position) || bay.transitAt(slime.position)),
            bridgeLocked: resources.transit?.bridgeLocked === true,
            transitComplete: resources.transit?.complete === true || this.currentRoom.local.bossStaging === true,
            conducting: resources.electricalSystem.readModel.connectedTargetId !== undefined,
            mounted: resources.maintenanceDrone.voltMounted,
          };
          const eligible = !switched && this.input.enabled && this.currentRoom.phase === 'three-slime';
          const walk = eligible ? blackoutCompanionWalk(state) : undefined;
          const revision = Number(resources.transit?.bridgeLocked === true) |
            (Number(resources.transit?.complete === true) << 1) |
            (Number(resources.electricalSystem.readModel.connectedTargetId !== undefined) << 2);
          const holdingPower = !switched && id === 'volt' &&
            resources.electricalSystem.readModel.connectedTargetId !== undefined;
          const intent = this.companions.steer(id, passiveBody, walk, resources.collisionWorld, undefined,
            { revision, holdReason: holdingPower ? 'power' : undefined,
              waitReason: eligible && !walk ? blackoutCompanionWaitingReason(state) : undefined });
          const presentationIntent = id === 'bob' ? resources.bobMovementIntent
            : id === 'goop' ? resources.goopMovementIntent : resources.voltMovementIntent;
          presentationIntent.copy(intent);
          passiveBody.update(deltaSeconds, intent, this.companions.jump[id], this.companions.locomotion[id]);
        }
      }
    }
    if (this.companions.commit()) this.notifyHUD();

    if (!switched) {
      this.renderLayer.cameraRig.queueLookInput(
        this.input.pointerDeltaX,
        this.input.pointerDeltaY,
      );
      this.renderLayer.cameraRig.applyQueuedLookInput();

      const controllingMountedVolt =
        !specimenGameplay &&
        resources.group.activeSlimeId === 'volt' &&
        resources.maintenanceDrone.voltMounted;

      if (
        controllingMountedVolt &&
        this.input.wasClearedSinceFixedUpdate
      ) {
        resources.maintenanceDrone.suspendInput();
      }

      if (controllingMountedVolt) {
        this.renderLayer.cameraRig.copyGroundMovementDirection(
          moveX,
          moveZ,
          resources.movement,
        );
        clearJump(resources.jump, true);
        resources.maintenanceDrone.update(deltaSeconds, {
          horizontalDirection: resources.movement,
          ascendHeld: this.input.isDown('jump'),
          descendHeld: this.input.isDown('droneDescend'),
          aimHeld: this.input.isDown('aimAbility'),
          controllingVolt: true,
        });
        resources.maintenanceDrone.syncMountedVolt(
          resources.group.voltBody,
        );
      } else {
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
        resources.jump.cancelled =
          this.input.wasClearedSinceFixedUpdate;
        if (!specimenGameplay && body === resources.group.bobBody) {
          resources.bobMovementIntent.copy(resources.movement);
        } else if (!specimenGameplay && body === resources.group.goopBody) {
          // The maintenance drone reuses and clears movement below. Preserve
          // Goop's actual intent for presentation just as Bob already does.
          resources.goopMovementIntent.copy(resources.movement);
        } else if (!specimenGameplay && body === resources.group.voltBody) {
          resources.voltMovementIntent.copy(resources.movement);
        }
        if (specimenGameplay) {
          resources.specimenAbilityAudio?.setEnabled(this.input.enabled && this.input.pointerLocked && !this.input.wasClearedSinceFixedUpdate);
          resources.specimenDash.update(deltaSeconds, { enabled: this.input.enabled && this.input.pointerLocked,
            pressed: this.input.wasPressed('dash'), cancelled: this.input.wasClearedSinceFixedUpdate,
            movement: resources.movement, forward: resources.specimenAttack.readModel.aimDirection, up: body.gameplayUp });
          if (resources.specimenDash.readModel.active) resources.movement.copy(resources.specimenDash.movementDirection);
        }
        body.update(deltaSeconds, resources.movement, resources.jump, specimenGameplay ? resources.specimenDash.locomotion : undefined);

        resources.maintenanceDrone.update(deltaSeconds, {
          horizontalDirection: resources.movement.set(0, 0, 0),
          ascendHeld: false,
          descendHeld: false,
          aimHeld: false,
          controllingVolt: false,
        });
        resources.maintenanceDrone.applyFallingSupportToVolt(
          resources.group.voltBody,
        );
      }
    } else {
      resources.maintenanceDrone.update(deltaSeconds, {
        horizontalDirection: resources.movement.set(0, 0, 0),
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt:
          resources.group.activeSlimeId === 'volt',
      });
      if (resources.maintenanceDrone.voltMounted) {
        resources.maintenanceDrone.syncMountedVolt(
          resources.group.voltBody,
        );
      } else {
        resources.maintenanceDrone.applyFallingSupportToVolt(
          resources.group.voltBody,
        );
      }
    }

    if(specimenGameplay)resources.finalBoss?.advancePlatforms(deltaSeconds);
    this.updateBobPresentation(deltaSeconds, resources);
    if (!specimenGameplay) {
      // The group owns a stable Bob/Goop/Volt array, including inactive bodies.
      resources.scene.maintenanceBay?.acidInteractions.update(deltaSeconds, resources.group.bodies);
      resources.scene.transitRoom?.acidInteractions.update(deltaSeconds, resources.group.bodies);
    }

    resources.maintenanceDrone.updateMountAvailability(
      resources.group.activeSlimeId,
      resources.group.voltBody.position,
      droneGameplayEnabled,
    );

    resources.electricalSystem.update(deltaSeconds, {
      aimHeld: this.input.isDown('aimAbility'),
      fireHeld: this.input.isDown('fireAbility'),
      firePressed: this.input.wasPressed('fireAbility'),
      gameplayInputEnabled:
        this.input.enabled && this.currentRoom.phase === 'three-slime',
      pointerLocked: this.input.pointerLocked,
    });
    resources.specimenAttack.update(deltaSeconds, {
      active: specimenGameplay,
      aimHeld: this.input.isDown('aimAbility'),
      fireHeld: this.input.isDown('fireAbility'),
      firePressed: this.input.wasPressed('fireAbility'),
      fireReleased: this.input.wasReleased('fireAbility'),
      gameplayInputEnabled: this.input.enabled,
      pointerLocked: this.input.pointerLocked,
      cancelled: this.input.wasClearedSinceFixedUpdate,
    });
    resources.acidProjectileSystem.update(deltaSeconds, {
      aimHeld: this.input.isDown('aimAbility'),
      firePressed: this.input.wasPressed('fireAbility'),
      gameplayInputEnabled:
        this.input.enabled &&
        resources.deathSequence.isPlaying &&
        resources.phase.phase === 'three-slime',
      pointerLocked: this.input.pointerLocked,
    });
    resources.dissolveSystem.update(deltaSeconds);
    this.renderLayer.cameraRig.setAimPresentationActive(
      resources.electricalSystem.readModel.aimActive ||
      resources.specimenAttack.readModel.aimActive ||
      resources.acidProjectileSystem.aimReadModel.active,
    );
    if (specimenGameplay) {
      resources.specimenCharacter.setDashing(resources.specimenDash.readModel.active);
      resources.specimenCharacter.update(deltaSeconds, resources.specimenBody, resources.specimenAttack.readModel);
      resources.specimenAbilityAudio?.update();
    }
    resources.specimenPresentation.update(specimenGameplay, deltaSeconds);

    if (resources.phase.phase === 'boss') {
      if(resources.finalBoss) {
        resources.finalBoss.update(deltaSeconds);
        this.commitFinalBossPhaseTwoCheckpoint(resources);
        if(resources.finalBoss.controller.consumeDefeat())this.commitBossDefeat(resources);
      } else resources.sentinelRig.controller.update(deltaSeconds, {
        specimen: resources.specimenBody,
        requestFailure: () => this.requestFailure(),
      });
      resources.sentinelRig.syncPresentation();

      if (!resources.deathSequence.isPlaying) {
        this.syncVisuals(resources);
        this.gameplayAudio?.update();
        this.input.endFixedUpdate();
        return;
      }

      // A valid final charged hit is committed before any later environment
      // hazard in this same fixed step can fail the player.
      if (!resources.finalBoss && resources.sentinelRig.controller.consumeDefeatRequest()) {
        this.commitBossDefeat(resources);
        this.syncVisuals(resources);
        this.gameplayAudio?.update();
        this.input.endFixedUpdate();
        return;
      }
    }

    // Power is propagated from the freshly-updated Volt connection, then
    // mechanics advance once. Device motion can move the connected socket, so
    // revalidate the tether without consuming input a second time and rebuild
    // power before lethal hazards are evaluated.
    resources.poweredDeviceRig.recomputePower();
    const participatingCarriers = specimenGameplay
      ? [resources.specimenCarrierBody]
      : resources.groupCarrierBodies;
    resources.poweredDeviceRig.updateMechanics(
      deltaSeconds,
      participatingCarriers,
    );
    resources.electricalSystem.revalidateConnection();
    resources.poweredDeviceRig.recomputePower();
    if (!this.authoredRoomOne) resources.poweredDeviceRig.updateHazards(
      deltaSeconds, participatingCarriers,
    );
    // Room 1 remains physically reachable from the Room 2 arrival staging
    // corridor, so its hazards, powered door, hallway lighting and drone
    // presentation must continue advancing after the one-shot handoff.
    if (resources.maintenanceBay) {
      const bay = resources.maintenanceBay;
      const bodies = {
        bob: resources.group.bobBody,
        goop: resources.group.goopBody,
        volt: resources.group.voltBody,
      };
      if (
        bay.powered &&
        !bay.connectionClear(
          bodies.volt.position,
          resources.maintenanceDroneFixture.collider,
        )
      ) {
        resources.electricalSystem.disconnect('target-invalid');
      }
      const dronePosition = resources.maintenanceDrone.readModel.position;
      const lostDrone = bay.bay.acidAt(dronePosition);
      const lostRider = lostDrone && resources.maintenanceDrone.voltMounted;
      if (lostDrone) resources.maintenanceDrone.requestRecovery('acid');
      if (lostRider) bay.bay.acidInteractions.fallPulse(bodies.volt);
      const failed = lostRider ? 'volt' : bay.update(deltaSeconds, bodies,specimenGameplay?undefined:body.position);
      resources.dronePresentation?.update(
        deltaSeconds,
        resources.maintenanceDrone.readModel,
        resources.group.activeSlimeId === 'volt',
      );
      this.maybeActivateRoomOneTutorialCheckpoint(resources);
      if (failed) {
        this.requestFailure();
        this.gameplayAudio?.update();
        this.input.endFixedUpdate();
        return;
      }
      if (this.currentRoom.roomId === 'room-1' && !this.bayExitHintShown &&
          (bay.complete || bay.bay.vestibuleAt(bodies.bob.position) || bay.bay.vestibuleAt(bodies.goop.position))) {
        this.bayExitHintShown = true;
        this.events.emit('objectiveChanged',{roomId:'room-1',objective:'Bob and Goop: follow the corridor into Room 2. Volt: follow the vent to the side catwalk.'});
      }
      if (this.currentRoom.roomId === 'room-1' && bay.complete && Object.values(bodies).every(body => bay.bay.transitAt(body.position))) {
        this.enterTransitRoom(resources);
      }
    }

    const ascentLift = resources.scene.bossStaging?.ascentLift;
    if (resources.elevatorAscent && !resources.elevatorAscent.complete && resources.phase.phase === 'three-slime' &&
      this.currentRoom.roomId === 'room-2' && ascentLift &&
      resources.group.bodies.every(body => ascentLift.isInBoardingRoom(body.position)) &&
      resources.group.bodies.some(body => ascentLift.canBoard(body))) {
      if (this.beginElevatorAscent(resources)) {
        this.syncVisuals(resources); this.gameplayAudio?.update(); this.input.endFixedUpdate(); return;
      }
    }

    const enteringTransit = this.currentRoom.roomId === 'room-1' &&
      resources.group.bodies.some(body => resources.maintenanceBay?.bay.transitAt(body.position));
    if (resources.transit && (this.currentRoom.roomId === 'room-2' || enteringTransit)) {
      const transit = resources.transit;
      if (!transit.isActive) transit.setActive(true);
      const failed = transit.update(deltaSeconds, {
        bob: resources.group.bobBody, goop: resources.group.goopBody, volt: resources.group.voltBody,
      });
      if (failed) {
        this.requestFailure();
        this.gameplayAudio?.update();
        this.input.endFixedUpdate();
        return;
      }
      const checkpoint = BLACKOUT_TRANSIT_CHECKPOINTS[transit.checkpointStage];
      if (this.currentRoom.roomId === 'room-2' && checkpoint && resources.checkpoints.activeCheckpoint.checkpointId !== checkpoint.id) {
        this.activateCheckpoint(checkpoint.id);
      }
      if (this.currentRoom.roomId === 'room-2' && !this.currentRoom.local.transitComplete && transit.objective !== this.transitObjective) {
        this.transitObjective = transit.objective;
        this.events.emit('objectiveChanged',{roomId:'room-2',objective:transit.objective});
      }
      if (this.currentRoom.roomId === 'room-2' && transit.complete && !this.currentRoom.local.transitComplete) {
        this.currentRoom = {roomId:'room-2',phase:'three-slime',local:{transitComplete:true}};
        resources.electricalSystem.disconnect('target-invalid');
        this.events.emit('objectiveChanged',{roomId:'room-2',objective:'Reach the damaged service elevator'});
      }
    }

    if(resources.finalBoss&&resources.phase.phase==='three-slime'&&
      this.currentRoom.local.elevatorComplete===true&&resources.group.bodies.every(body=>body.position.z>185.5)) {
      resources.transit?.setActive(false);
      if(resources.researchFinale) {
        if(!resources.researchFinale.complete&&resources.group.activeBody.position.z>187.8)this.beginResearchFinale(resources);
      } else if(resources.group.activeBody.position.z>189)this.beginMerge();
    }

    if (!resources.deathSequence.isPlaying) {
      this.syncVisuals(resources);
      this.gameplayAudio?.update();
      this.input.endFixedUpdate();
      return;
    }

    if (
      resources.maintenanceDrone.readModel.position.y < OUT_OF_BOUNDS_Y
    ) {
      if (resources.maintenanceDrone.voltMounted) {
        this.requestFailure();
      } else {
        resources.maintenanceDrone.requestRecovery('out-of-bounds');
      }
    }

    // Only the participating controlled form can fail hazards/out-of-bounds.
    // Hidden original bodies remain exact objects while merged but are inert.
    const participatingBodies = specimenGameplay
      ? [resources.specimenBody]
      : resources.group.bodies;
    for (const participatingBody of participatingBodies) {
      const failureY=specimenGameplay&&resources.finalBoss?FINAL_ARENA.fallFailureY:OUT_OF_BOUNDS_Y;
      if (participatingBody.position.y < failureY) {
        if(specimenGameplay&&resources.phase.phase==='boss'&&resources.finalBoss?.controller.devInvincible) {
          participatingBody.recoverAt(FINAL_MERGE_ANCHOR);
          this.retargetCamera(resources);this.syncVisuals(resources);
          this.gameplayAudio?.update();this.input.endFixedUpdate();return;
        }
        this.requestFailure();
        this.gameplayAudio?.update();
        this.input.endFixedUpdate();
        return;
      }
    }

    this.syncVisuals(resources);
    this.gameplayAudio?.update();
    this.input.endFixedUpdate();
  }

  render(interpolationAlpha: number, stats: Readonly<LoopStats>): void {
    this.companions.beginFrame();
    const resources = this.resources;
    resources?.defeatFinale?.effects.setDensity(this.renderLayer.graphicsConfiguration.effectsDensity);
    if (resources) {
      this.renderLayer.cameraRig.setThirdPersonOverride(!resources.deathSequence.isPlaying || !!resources.ventArrival?.active || !!resources.elevatorAscent?.active || !!resources.researchFinale?.active || !!resources.finalBoss?.cinematic ||
        resources.phase.phase === 'merging' || resources.phase.phase === 'splitting' ||
        resources.phase.phase === 'boss-defeated' || resources.phase.terminal);
      this.syncVisuals(resources);
      const mergePresentation=!!resources.finalBoss&&resources.phase.phase==='merging';
      if(!mergePresentation) {
      interpolateBodyPosition(
        resources.group.bobBody,
        interpolationAlpha,
        resources.renderedBobPosition,
      );
      interpolateBodyPosition(resources.group.goopBody, interpolationAlpha, resources.renderedGoopPosition);
      interpolateBodyPosition(resources.group.voltBody, interpolationAlpha, resources.renderedVoltPosition);
      }
      if(!resources.researchFinale?.active && !resources.defeatFinale?.active) {
        interpolateBodyPosition(resources.specimenBody, interpolationAlpha, resources.renderedSpecimenPosition);
        resources.specimenCharacter.setPosition(resources.renderedSpecimenPosition); resources.specimenCharacter.present(interpolationAlpha);
      }
      if(!resources.ventArrival?.active && !resources.elevatorAscent?.active && !resources.researchFinale?.active && !resources.defeatFinale?.active){
        if(!mergePresentation) {
          resources.bobPresentation.setPosition(resources.renderedBobPosition);
          resources.goopPresentation.setPosition(resources.renderedGoopPosition);
          resources.voltPresentation.setPosition(resources.renderedVoltPosition);
        }
        resources.bobPresentation.present(interpolationAlpha);resources.goopPresentation.present(interpolationAlpha);resources.voltPresentation.present(interpolationAlpha);
      }
      resources.electricalPresentation.update(
        resources.electricalSystem.readModel,
        this.lifecycle.state === 'running' && resources.deathSequence.isPlaying ? stats.frameDeltaSeconds : 0,
        this.lifecycle.state === 'running' && resources.deathSequence.isPlaying &&
          resources.group.activeSlimeId === 'volt' && this.input.enabled &&
          this.input.pointerLocked && this.input.isDown('aimAbility'),
      );
      resources.specimenPresentation.update(
        resources.specimenForm.readModel.controlledForm === 'specimen',
      );
      const goopAimPresentationAllowed =
        this.lifecycle.state === 'running' &&
        resources.deathSequence.isPlaying &&
        resources.phase.phase === 'three-slime' &&
        !resources.ventArrival?.active &&
        !resources.elevatorAscent?.active &&
        !resources.researchFinale?.active &&
        this.input.enabled;
      resources.goopAcidPresentation.update(
        interpolationAlpha,
        stats.frameDeltaSeconds,
        goopAimPresentationAllowed,
        goopAimPresentationAllowed,
        false,
      );
      resources.transit?.projectilePresentation.update(interpolationAlpha);
      // GoopAcidPresentation owns its own aim overlay; reconcile the shared
      // camera pose after all ability presentations have updated.
      this.renderLayer.cameraRig.setAimPresentationActive(
        resources.electricalSystem.readModel.aimActive ||
        resources.specimenAttack.readModel.aimActive ||
        resources.acidProjectileSystem.aimReadModel.active,
      );

      // Render frames can run without a fixed update when the display refresh
      // rate exceeds the 60 Hz simulation rate. Queue the current pointer
      // displacement before clearing it so those render-only samples still
      // reach CameraRig.update(). This mirrors the Level 1/2 input contract and
      // prevents Volt's centre-ray aim from becoming refresh-rate dependent.
      const lookInputActive =
        resources.phase.phase === 'three-slime' ||
        resources.phase.phase === 'escape' ||
        resources.phase.phase === 'specimen' ||
        resources.phase.phase === 'boss';
      if (
        this.lifecycle.state === 'running' &&
        resources.deathSequence.isPlaying &&
        !resources.finalBoss?.cinematic &&
        !resources.elevatorAscent?.active &&
        !resources.researchFinale?.active &&
        lookInputActive &&
        this.input.enabled
      ) {
        this.renderLayer.cameraRig.queueLookInput(
          this.input.pointerDeltaX,
          this.input.pointerDeltaY,
        );
      }
    }
    this.input.endPointerUpdate();
    if(resources?.connectorCamera&&resources.specimenForm.readModel.controlledForm!=='specimen'){
      this.renderLayer.cameraRig.setContextualCamera?.(resources.connectorCamera.resolve(resources.group.activeSlimeId==='volt'));
    }
    this.renderLayer.cameraRig.update(interpolationAlpha, stats.frameDeltaSeconds);
    if(resources?.lighting){
      resources.lighting.setQuality(this.renderLayer.graphicsConfiguration,this.renderLayer.renderer.shadowMap.type);
      resources.lighting.update(stats.frameDeltaSeconds,{position:resources.specimenForm.readModel.controlledForm==='specimen'?resources.specimenBody.position:resources.group.activeBody.position,participants:resources.hallwayShadowParticipants,
        running:this.lifecycle.state==='running',cinematic:!!resources.elevatorAscent?.active||!!resources.ventArrival?.active||!!resources.researchFinale?.active||!!resources.defeatFinale?.active||!!resources.finalBoss?.cinematic});
    }
    resources?.scene.finalArena?.presentPlatforms(interpolationAlpha);
    resources?.finalBoss?.present(interpolationAlpha);
    resources?.ventArrival?.present(this.renderLayer.cameraRig.camera,interpolationAlpha);
    resources?.elevatorAscent?.present(this.renderLayer.cameraRig.camera,interpolationAlpha);
    resources?.researchFinale?.present(this.renderLayer.cameraRig.camera,interpolationAlpha);
    resources?.finalBoss?.presentCamera(this.renderLayer.cameraRig.camera);
    resources?.defeatFinale?.present(this.renderLayer.cameraRig.camera, interpolationAlpha);
    if(resources?.finalBoss&&resources.phase.phase==='merging') {
      const camera=this.renderLayer.cameraRig.camera;
      camera.position.set(-7,4.5,191);camera.lookAt(FINAL_MERGE_ANCHOR);camera.updateMatrixWorld(true);
    }
    this.gameplayAudio?.updateListener();
    if (resources) {
      this.companionIndicators ??= new CompanionIndicators(this.host);
      this.companionIndicators.update(this.renderLayer.cameraRig.camera, this.companions.passiveInteractions,
        this.lifecycle.state === 'running' && resources.deathSequence.isPlaying && this.input.enabled &&
        this.currentRoom.phase === 'three-slime' && !this.host.dataset.cinematic, stats.frameDeltaSeconds);
      this.companionIndicators.place('bob', resources.renderedBobPosition, this.renderLayer.cameraRig.camera);
      this.companionIndicators.place('goop', resources.renderedGoopPosition, this.renderLayer.cameraRig.camera);
      this.companionIndicators.place('volt', resources.renderedVoltPosition, this.renderLayer.cameraRig.camera);
    }
    // Keep the lower capture for the whole encounter (including phase changes)
    // so attacks cannot repeatedly resize Three's retained transmission target.
    const bossCapture = resources?.phase.phase === 'boss' && !resources.researchFinale?.active && !resources.defeatFinale?.active;
    if (bossCapture) this.releaseBossTransmissionCap ??= this.renderLayer.gelRendering.requestReducedTransmissionCap(.25);
    else { this.releaseBossTransmissionCap?.(); this.releaseBossTransmissionCap = undefined; }
    const bossBudget = !!bossCapture && !resources?.finalBoss?.cinematic &&
      this.renderLayer.graphicsConfiguration.graphicsProfile !== 'high';
    // Select after all cinematic cameras/actor poses have been presented.
    resources?.specimenCharacter.updateDetail(this.renderLayer.cameraRig.camera, bossBudget);
    resources?.scene.finalArena?.lighting.moonlight.setShaftEnabled(!bossBudget);
    if (resources && !resources.researchFinale?.active && !resources.defeatFinale?.active) {
      resources.goopPresentation.updateDetail(this.renderLayer.cameraRig.camera);
      resources.voltPresentation.updateDetail(this.renderLayer.cameraRig.camera);
      resources.goopPresentation.setOpacity(resources.phase.phase!=='merging'&&!resources.ventArrival?.active&&!resources.elevatorAscent?.active&&resources.group.activeSlimeId === 'goop' && !this.renderLayer.cameraRig.isFirstPersonForTarget(resources.group.goopBody)
        ? (this.renderLayer.cameraRig.aimPresentationWeight > 0.01 ? 0 : resolveCameraTargetOpacity(
          this.renderLayer.cameraRig.currentFollowDistanceMetres, 1.35, 0.55, 0.25)) : 1);
      // Every gel samples its own local lighting. A shared PMREM must not
      // make Bob visible in a dark area while the other characters disappear.
      const bobReflection = resources.goopReflectionLighting.weightAt(resources.renderedBobPosition);
      resources.bobPresentation.setReflectionIntensity(
        BLACKOUT_BOB_REFLECTION.body * bobReflection,
        BLACKOUT_BOB_REFLECTION.eyes * bobReflection,
      );
      const reflectionWeight = resources.goopReflectionLighting.weightAt(resources.renderedGoopPosition);
      resources.goopPresentation.setReflectionIntensity(0.12 * reflectionWeight, 0.28 * reflectionWeight);
      resources.voltPresentation.setOpacity(resources.phase.phase!=='merging'&&!resources.ventArrival?.active&&!resources.elevatorAscent?.active&&resources.group.activeSlimeId === 'volt' && !this.renderLayer.cameraRig.isFirstPersonForTarget(resources.group.voltBody)
        ? (this.renderLayer.cameraRig.aimPresentationWeight > 0.01 ? 0 : resolveCameraTargetOpacity(
          this.renderLayer.cameraRig.currentFollowDistanceMetres, 1.35, 0.55, 0.25)) : 1);
      const specimenControlled = resources.specimenForm.readModel.controlledForm === 'specimen';
      const specimenFirstPerson = this.renderLayer.cameraRig.isFirstPersonForTarget(resources.specimenBody);
      const specimenNearBody = specimenControlled && !!resources.finalBoss && !resources.finalBoss.cinematic && !specimenFirstPerson &&
        this.renderLayer.cameraRig.camera.position.distanceToSquared(resources.specimenBody.position) < (resources.specimenBody.radiusMetres * 1.65) ** 2;
      const specimenScale = resources.specimenBody.radiusMetres / BLACKOUT_SPECIMEN_RADIUS_METRES;
      resources.specimenCharacter.setOpacity(specimenNearBody ? 0 : specimenControlled && !specimenFirstPerson
        ? (this.renderLayer.cameraRig.aimPresentationWeight > 0.01 ? 0 : resolveCameraTargetOpacity(
          this.renderLayer.cameraRig.currentFollowDistanceMetres, 1.65 * specimenScale, 0.65 * specimenScale, 0.25)) : 1);
      const specimenReflection = resources.goopReflectionLighting.weightAt(resources.renderedSpecimenPosition);
      resources.specimenCharacter.setReflectionIntensity(2.2 * specimenReflection, 1.8 * specimenReflection);
      const voltReflection = resources.goopReflectionLighting.weightAt(resources.renderedVoltPosition);
      resources.voltPresentation.setReflectionIntensity(0.12 * voltReflection, 0.28 * voltReflection);
    }
    resources?.transit?.updatePresentation(stats.frameDeltaSeconds, this.renderLayer.cameraRig.camera);
    resources?.hallwayShadows?.prepareFrame(resources.hallwayShadowParticipants);
    if (resources) resources.scene.finalArena?.lighting.prepareFrame(resources.renderedSpecimenPosition,
      this.lifecycle.state === 'running', stats.frameDeltaSeconds, bossBudget);
    resources?.lighting?.prepareCamera(this.renderLayer.cameraRig.camera,resources.specimenForm.readModel.controlledForm==='specimen'?resources.specimenBody.position:resources.group.activeBody.position);
    try {
      // Preparation and every cinematic keep their complete authored draws.
      // Ordinary cameras may reject only geometry proven behind the shutter.
      if (this.shutterOcclusion && this.lifecycle.state === 'running' && this.input.enabled && resources &&
          resources.phase.phase !== 'merging' && !resources.ventArrival?.active &&
          !resources.elevatorAscent?.active && !resources.researchFinale?.active &&
          !resources.defeatFinale?.active && !resources.finalBoss?.cinematic) {
        if (this.arenaOcclusion && resources.phase.phase === 'boss') {
          this.arenaOcclusion.render(this.renderLayer.cameraRig.camera, this.drawPreparedScene);
        } else this.shutterOcclusion.render(this.renderLayer.cameraRig.camera, this.drawPreparedScene);
      } else this.drawPreparedScene();
    } finally { resources?.lighting?.restoreCamera(); }
  }

  getSpeedEffectStrength(): number {
    const r = this.resources;
    if (!r || this.lifecycle.state !== 'running' || !this.input.enabled || !r.deathSequence.isPlaying ||
        r.ventArrival?.active || r.finalBoss?.cinematic || this.currentRoom.phase !== 'three-slime' || r.manager.activeSlimeId !== 'goop') return 0;
    return goopSpeedEffectStrength(r.group.goopBody);
  }

  writePerformanceSnapshot(target: PerformanceGameplaySnapshot): void {
    const resources = this.resources;
    writePerformanceInput(target,this.input);
    if (resources) writePerformancePosition(target.activePosition,
      resources.specimenForm.readModel.controlledForm === 'specimen' ? resources.specimenBody.position : resources.group.activeBody.position);
    else target.activePosition.fill(0);
    target.level = 'blackout-level-3';
    target.room = this.currentRoom.roomId;
    target.gameplayState = resources && !resources.deathSequence.isPlaying
      ? resources.deathSequence.state : resources?.phase.phase ?? this.lifecycle.state;
    target.cutsceneState = resources?.defeatFinale?.active ? 'boss-defeat' : resources?.ventArrival?.active ? 'blackout-vent-arrival' : resources?.elevatorAscent?.active ? 'blackout-elevator' : resources?.researchFinale?.active ? 'blackout-research' : 'none';
    target.activeSlime =
      resources?.specimenForm.readModel.controlledForm === 'specimen'
        ? 'specimen'
        : resources?.manager.activeSlimeId ?? 'none';
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

  private enterTransitRoom(resources: BlackoutRuntimeResources): void {
    if (!resources.transit) return;
    resources.maintenanceDrone.recoverImmediately('checkpoint');
    resources.transit.setActive(true);
    // Both entrances are now physical continuations. Save a safe recovery
    // layout without snapping the bodies/camera away from their live positions.
    this.commitRoomOneCompletion(resources);
  }

  previewElevatorForDebug(): boolean {
    const resources = this.resources;
    if (!this.debugAvailable || !resources?.elevatorAscent || (this.state !== 'running' && this.state !== 'stopped')) return false;
    this.restartResources(); this.activateCheckpoint('cp3');
    resources.group.bobBody.teleport(new THREE.Vector3(-1, .86, 180));
    resources.group.goopBody.teleport(new THREE.Vector3(-1.5, .86, 175.2));
    resources.group.voltBody.teleport(new THREE.Vector3(1.5, .86, 175.2));
    this.retargetCamera(resources); this.input.releasePointerLock();
    return this.beginElevatorAscent(resources);
  }

  private beginElevatorAscent(resources: BlackoutRuntimeResources): boolean {
    if (!resources.elevatorAscent?.begin(this.renderLayer.cameraRig.camera)) return false;
    this.resetCompanions();
    resources.transit?.setActive(false); resources.electricalSystem.disconnect('target-invalid');
    resources.electricalSystem.cancelAim(); resources.acidProjectileSystem.reset(); resources.goopAcidPresentation.reset();
    resources.specimenAttack.cancelInput(); resources.specimenDash.cancel(); resources.specimenAbilityAudio?.setEnabled(false);
    resources.maintenanceDrone.suspendInput();
    this.renderLayer.cameraRig.setAimPresentationActive(false, true); this.input.resetState();
    return true;
  }

  previewResearchForDebug(): boolean {
    const resources = this.resources;
    if (!this.debugAvailable || !resources?.researchFinale || (this.state !== 'running' && this.state !== 'stopped')) return false;
    this.restartResources(); this.activateCheckpoint('cp6'); this.restoreActiveCheckpoint(resources, true);
    this.input.releasePointerLock(); return this.beginResearchFinale(resources);
  }

  previewBossDefeatForDebug(): boolean {
    if (!this.debugAvailable || !this.resources?.defeatFinale || (this.state !== 'running' && this.state !== 'stopped')) return false;
    this.teleportToFinalBoss();
    const resources = this.requireResources(); this.commitBossDefeat(resources); this.input.releasePointerLock();
    return resources.defeatFinale?.active === true;
  }

  private beginResearchFinale(resources: BlackoutRuntimeResources): boolean {
    if (!resources.researchFinale?.begin(this.renderLayer.cameraRig.camera)) return false;
    this.resetCompanions(); resources.transit?.setActive(false);
    resources.electricalSystem.disconnect('target-invalid'); resources.electricalSystem.cancelAim();
    resources.acidProjectileSystem.reset(); resources.goopAcidPresentation.reset();
    resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
    resources.maintenanceDrone.suspendInput(); this.renderLayer.cameraRig.setAimPresentationActive(false, true); this.input.resetState();
    return true;
  }

  private finishResearchFinale(resources: BlackoutRuntimeResources): void {
    resources.group.setRecoveryState({ positions: FINAL_BOSS_CHECKPOINT.bodyPositions, activeSlimeId: 'bob' });
    resources.group.restoreRecoveryState(); resources.specimenBody.recoverAt(FINAL_MERGE_ANCHOR);
    resources.specimenForm.restore('specimen'); resources.phase.restore('boss');
    resources.specimenCharacter.reset(); resources.specimenCharacter.setYaw(Math.PI);
    resources.scene.bossStaging?.ascentLift?.setArenaAccessOpen(true);
    resources.checkpoints.activate('cp8', 'bob');
    this.currentRoom = { roomId: 'room-4b', phase: 'boss', local: { finalBoss: true, merged: true, researchComplete: true } };
    resources.finalBoss?.reset(); resources.finalBoss?.startAfterArrival();
    this.input.resetState(); this.seedResearchBossCamera(resources);
    this.notifyHUD(undefined, true);
    this.events.emit('objectiveChanged', { roomId: 'room-4b', objective: 'Defeat the Exterminator' });
  }

  private seedResearchBossCamera(resources: BlackoutRuntimeResources): void {
    const rig = this.renderLayer.cameraRig;
    rig.reset(); rig.setFollowTarget(resources.specimenBody, resources.collisionWorld);
    rig.setContextualCamera?.({ profile: FINAL_SPECIMEN_CAMERA, anchor: resources.specimenBody });
    rig.setGroundOrbitYawRadians?.(Math.PI); rig.setGroundOrbitPitchRadians?.(FINAL_SPECIMEN_START_PITCH);
    rig.setThirdPersonOverride(true); rig.update(1, FINAL_SPECIMEN_CAMERA.transitionDurationSeconds);
  }

  private teleportToAuthoredRoom(room: 1 | 2 | 3): void {
    // Start each shortcut from the same clean puzzle/checkpoint baseline;
    // never carry a mounted rider, tether, burn, or extended bridge across it.
    this.restartResources();
    if (room === 1) return;
    const resources = this.requireResources();
    const checkpoint = room === 2 ? BLACKOUT_TRANSIT_CHECKPOINTS[0]! : BLACKOUT_BOSS_STAGING_CHECKPOINT;
    resources.transit?.setActive(room === 2);
    resources.group.setRecoveryState({positions:checkpoint.bodyPositions, activeSlimeId:checkpoint.activeSlimeId});
    resources.group.restoreRecoveryState();
    this.activateCheckpoint(checkpoint.id);
    this.restoreActiveCheckpoint(resources, true);
    this.renderLayer.cameraRig.setGroundOrbitYawRadians?.(Math.PI);
  }

  /** Debug-only named Room 4 action; callers must already be in Level 3. */
  private teleportToFinalBoss():void {
    if(!this.authoredRoomOne||!this.debugAvailable)return;
    this.restartResources();const resources=this.requireResources();if(!resources.finalBoss)return;
    resources.checkpoints.activate('cp8','bob');this.restoreActiveCheckpoint(resources,true);
    resources.finalBoss.reset();resources.finalBoss.start();resources.phase.restore('boss');
    this.currentRoom={roomId:'room-4b',phase:'boss',local:{finalBoss:true}};
    this.renderLayer.cameraRig.setGroundOrbitYawRadians?.(Math.PI);
  }

  private readonly loadResources = (): void => {
    const scene = new BlackoutLevelScene(this.authoredRoomOne, this.maintenanceMaps);
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
      for (const mesh of scene.bossStaging?.ascentLift?.dynamicColliders ?? []) collisionWorld.setTransformMode(mesh, ColliderTransformMode.Dynamic);

      const manager = new SlimeManager<KinematicBody>(
        BLACKOUT_SLIME_DEFINITIONS,
        this.initialProgression.activeSlimeId,
      );
      rollback(() => manager.dispose());
      const movementEvents = new EventBus<MovementEvents>();
      rollback(() => movementEvents.clear());
      const goopMovementEvents = new EventBus<MovementEvents>();
      const voltMovementEvents = new EventBus<MovementEvents>();
      rollback(() => voltMovementEvents.clear());
      rollback(() => goopMovementEvents.clear());
      const cp1 = BLACKOUT_CHECKPOINTS[0]!;
      const makeBody = (id: 'bob' | 'goop' | 'volt') => {
        const definition = manager.getDefinition(id);
        return new KinematicBody({
          world: collisionWorld,
          surfaces: surfaceRegistry,
          initialPosition: cp1.bodyPositions[id],
          events: id === 'bob' ? movementEvents : id === 'goop' ? goopMovementEvents : voltMovementEvents,
          config: {
            movementCollisionMask:
              CollisionLayer.Movement |
              (id === 'volt'
                ? CollisionLayer.MaintenanceDroneSupport
                : CollisionLayer.None),
            adhesionEnabled: definition.abilities.adhesion,
            reboundEnabled: definition.abilities.rebound,
            chargedJumpEnabled: definition.jumpMode === 'charged',
            acidSpeedMultiplier: id === 'goop' ? GOOP_ACID_SPEED_MULTIPLIER : 1,
          },
        });
      };
      const bodies = {
        bob: makeBody('bob'),
        goop: makeBody('goop'),
        volt: makeBody('volt'),
      };
      const initialActive = this.authoredRoomOne ? 'volt' :
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

      const specimenBody = new KinematicBody({
        world: collisionWorld,
        surfaces: surfaceRegistry,
        initialPosition: this.authoredRoomOne ? FINAL_MERGE_ANCHOR : BLACKOUT_SPECIMEN_MERGE_ANCHOR,
        config: {
          radiusMetres: BLACKOUT_SPECIMEN_RADIUS_METRES,
          maxSpeedMetresPerSecond: FINAL_SPECIMEN_MOVEMENT.maxSpeedMetresPerSecond,
          groundAccelerationMetresPerSecondSquared: FINAL_SPECIMEN_MOVEMENT.groundAccelerationMetresPerSecondSquared,
          groundBrakingMetresPerSecondSquared: FINAL_SPECIMEN_MOVEMENT.groundBrakingMetresPerSecondSquared,
          adhesionEnabled: true,
          reboundEnabled: true,
          chargedJumpEnabled: true,
          ...(this.authoredRoomOne ? FINAL_SPECIMEN_MOVEMENT : {}),
        },
      });
      const specimenForm = new SpecimenFormController({
        mergeDurationSeconds: 6,
      });
      rollback(() => specimenForm.dispose());

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
      if (this.authoredRoomOne) {
        checkpoints.registerCheckpoint(BLACKOUT_AUTHORED_ROOM_ONE_CP2);
        if (!scene.transitRoom) {
          checkpoints.registerCheckpoint(BLACKOUT_AUTHORED_ROOM_TWO_CP3);
        }
      } else {
        for (const checkpoint of BLACKOUT_CHECKPOINTS.slice(1)) {
          checkpoints.registerCheckpoint(checkpoint);
        }
      }
      if (scene.transitRoom) for (const checkpoint of BLACKOUT_TRANSIT_CHECKPOINTS) {
        checkpoints.registerCheckpoint(checkpoint);
      }
      if (scene.bossStaging) checkpoints.registerCheckpoint(BLACKOUT_BOSS_STAGING_CHECKPOINT);
      if (scene.finalArena) {
        checkpoints.registerCheckpoint(FINAL_BOSS_CHECKPOINT);
        checkpoints.registerCheckpoint(FINAL_BOSS_PHASE_TWO_CHECKPOINT);
      }
      checkpoints.activate('cp1', initialActive);

      const maintenanceDroneFixture =
        new MaintenanceDroneDevelopmentFixture();
      rollback(() => maintenanceDroneFixture.dispose());
      scene.root.add(maintenanceDroneFixture.root);

      const maintenanceDrone = new MaintenanceDroneController({
        world: collisionWorld,
        authoring: maintenanceDroneFixture.authoring,
        isVoltPlacementSafe: isSpawnSafe,
        voltRadiusMetres: group.voltBody.radiusMetres,
      });
      rollback(() => maintenanceDrone.dispose());
      const dronePresentation = this.authoredRoomOne
        ? new MaintenanceDronePresentation(maintenanceDroneFixture.droneRoot, this.host, collisionWorld, maintenanceDroneFixture.collider, () => maintenanceDrone.markTutorialCompleted(), scene.maintenanceBay?.surfaceMaterials, () => this.renderLayer.keyBindings) : undefined;
      if (dronePresentation) {
        if(this.renderLayer.renderer) {
          this.shadowRequest = this.renderLayer.requestShadowConfiguration('blackout', { enabled: true,contactHardening:true });
          rollback(() => { this.shadowRequest?.dispose(); this.shadowRequest = undefined; });
        }
        const material = maintenanceDroneFixture.collider.material;
        for (const item of Array.isArray(material) ? material : [material]) item.visible = false;
        rollback(() => dronePresentation.dispose());
      }

      const phase = new BlackoutPhaseController('three-slime');
      const deathSequence = new DeathSequence();
      const deathScreen = new DeathScreen({
        onRetry: this.retryAfterDeath,
        backgroundElements: [this.renderLayer.canvas],
      });
      rollback(() => deathScreen.dispose());
      this.host.append(deathScreen.element);
      const voltPresentation = new VoltCharacterPresentation(group.voltBody.radiusMetres, this.renderLayer.gelRendering);
      voltPresentation.setSpawnYaw(Math.PI);
      voltPresentation.setCameraView(this.renderLayer.cameraRig, group.voltBody);
      rollback(() => voltPresentation.dispose());
      voltPresentation.setCollisionWorld(collisionWorld);
      voltPresentation.setPosition(group.voltBody.position);
      this.renderLayer.scene.add(voltPresentation.root);
      rollback(voltMovementEvents.on('landed', event => voltPresentation.onLanding(group.voltBody.groundNormal, event.impactSpeedMetresPerSecond)));
      rollback(voltMovementEvents.on('jumped', event => voltPresentation.onLaunch(event)));
      const voltPresentationState = createBobPresentationState(group.voltBody);
      const goopPresentation = new GoopCharacterPresentation(group.goopBody.radiusMetres, this.renderLayer.gelRendering);
      goopPresentation.setSpawnYaw(Math.PI);
      goopPresentation.setCameraView(this.renderLayer.cameraRig, group.goopBody);
      rollback(() => goopPresentation.dispose());
      goopPresentation.setPosition(group.goopBody.position);
      this.renderLayer.scene.add(goopPresentation.root);
      rollback(goopMovementEvents.on('landed', event => goopPresentation.onLanding(group.goopBody.groundNormal, event.impactSpeedMetresPerSecond)));
      rollback(goopMovementEvents.on('jumped', event => goopPresentation.onLaunch(event)));
      const goopPresentationState = createBobPresentationState(group.goopBody);
      const bobPresentation = new BobCharacterPresentation(
        group.bobBody.radiusMetres, this.renderLayer.gelRendering);
      bobPresentation.setSpawnYaw(Math.PI);
      bobPresentation.setCameraView(this.renderLayer.cameraRig, group.bobBody);
      bobPresentation.setPosition(group.bobBody.position);
      rollback(() => bobPresentation.dispose());
      this.renderLayer.scene.add(bobPresentation.root);
      const bobPresentationState = createBobPresentationState(group.bobBody);
      rollback(movementEvents.on('landed', (event) => {
        bobPresentation.onLanding(
          group.bobBody.groundNormal,
          event.impactSpeedMetresPerSecond,
        );
      }));
      rollback(movementEvents.on('jumped', (event) => {
        bobPresentation.onLaunch({
          directionWorld: event.directionWorld,
          speedMetresPerSecond: event.speedMetresPerSecond,
          chargeFraction: event.chargeFraction,
        });
      }));
      const voltLight = new THREE.PointLight(this.authoredRoomOne?0xffedb2:0xffdf75,
        this.authoredRoomOne ? BLACKOUT_VOLT_LIGHT_INTENSITY.authored : BLACKOUT_VOLT_LIGHT_INTENSITY.foundation, 8, 2);
      voltLight.name = 'blackout-volt-foundation-light';
      voltLight.castShadow = false;
      voltPresentation.placement.add(voltLight);

      const specimenCharacter = new SpecimenCharacterPresentation(specimenBody.radiusMetres, this.renderLayer.gelRendering);
      specimenCharacter.setSpawnYaw(Math.PI);
      specimenCharacter.setCameraView(this.renderLayer.cameraRig, specimenBody);
      rollback(() => specimenCharacter.dispose());
      rollback(specimenBody.events.on('jumped', event => specimenCharacter.onLaunch(event)));
      rollback(specimenBody.events.on('landed', event => specimenCharacter.onLanding(event.impactSpeedMetresPerSecond, specimenBody.position, specimenBody.groundNormal)));
      this.renderLayer.scene.add(specimenCharacter.root);
      const finalPresentation=scene.finalArena?new FinalBossPresentation(specimenCharacter):undefined;
      if(finalPresentation)rollback(() => finalPresentation.dispose());
      const specimenLight = new THREE.PointLight(0x73efad, 2.4, 10, 2);
      specimenLight.name = 'blackout-specimen-light';
      specimenLight.castShadow = false;
      specimenCharacter.placement.add(specimenLight);

      const electricalTargets = new ElectricalTargetRegistry(collisionWorld);
      rollback(() => electricalTargets.dispose());

      const transit = scene.transitRoom ? new BlackoutTransitController({
        room: scene.transitRoom, world: collisionWorld, surfaces: surfaceRegistry, electricalTargets,
      }) : undefined;
      if (transit) {
        scene.root.add(transit.root);
        rollback(() => transit.dispose());
        rollback(transit.damage.events.on('damaged', ({ slimeId }) => {
          if (slimeId === 'bob') bobPresentation.onDamage(1);
          else if (slimeId === 'goop') goopPresentation.onDamage(1);
          else voltPresentation.onDamage(1);
        }));
      }
      const unregisterTransitCheckpointParticipant = transit ? checkpoints.registerParticipant(transit) : undefined;
      if (unregisterTransitCheckpointParticipant) rollback(unregisterTransitCheckpointParticipant);
      const dissolveSystem = new DissolveSystem(transit?.dissolveTargets ?? []);
      rollback(() => dissolveSystem.dispose());
      transit?.bindBurns(dissolveSystem);
      const acidProjectileSystem = new AcidProjectileSystem({
        slimeManager: manager,
        collisionWorld,
        dissolveSystem,
        aimRayProvider: this.renderLayer.cameraRig,
      });
      rollback(() => acidProjectileSystem.dispose());

      const maintenanceBay = scene.maintenanceBay
        ? new BlackoutMaintenanceBayController(scene.maintenanceBay, collisionWorld, surfaceRegistry, electricalTargets) : undefined;
      if (maintenanceBay) rollback(() => maintenanceBay.dispose());
      // Backend device/combat fixtures stay available to their existing harness,
      // but occupy a separate collision and targeting world in the authored bay.
      const fixtureWorld = this.authoredRoomOne ? new CollisionWorld() : collisionWorld;
      const fixtureSurfaces = this.authoredRoomOne ? new SurfaceRegistry() : surfaceRegistry;
      const fixtureTargets = this.authoredRoomOne ? new ElectricalTargetRegistry(fixtureWorld) : electricalTargets;

      const poweredDeviceRig = new BlackoutPoweredDeviceRig({
        collisionWorld: fixtureWorld,
        surfaceRegistry: fixtureSurfaces,
        targetRegistry: fixtureTargets,
        requestFailure: () => {
          this.requestFailure();
        },
      });
      rollback(() => poweredDeviceRig.dispose());
      scene.root.add(poweredDeviceRig.root);
      poweredDeviceRig.root.visible = !this.authoredRoomOne;
      puzzleRegistry.register(
        'blackout-powered-device-rig',
        poweredDeviceRig,
      );

      const groupCarrierBodies: readonly PoweredCarrierBody[] = [
        createPoweredCarrierBody('bob', group.bobBody),
        createPoweredCarrierBody('goop', group.goopBody),
        createPoweredCarrierBody('volt', group.voltBody),
      ];
      const specimenCarrierBody =
        createPoweredCarrierBody('specimen', specimenBody);

      const combatTargets = new CombatTargetRegistry(fixtureWorld);
      rollback(() => combatTargets.dispose());
      const combatRig = new SpecimenCombatDevelopmentRig({
        collisionWorld: fixtureWorld,
        surfaceRegistry: fixtureSurfaces,
        targetRegistry: combatTargets,
      });
      rollback(() => combatRig.dispose());
      scene.root.add(combatRig.root);
      combatRig.root.visible = !this.authoredRoomOne;
      puzzleRegistry.register(
        'specimen-combat-development-rig',
        combatRig,
      );

      const sentinelRig = new SentinelBossDevelopmentRig({
        collisionWorld: fixtureWorld,
        targetRegistry: combatTargets,
      });
      rollback(() => sentinelRig.dispose());
      scene.root.add(sentinelRig.root);
      sentinelRig.root.visible = !this.authoredRoomOne;
      puzzleRegistry.register(
        'sentinel-boss-development-rig',
        sentinelRig,
      );

      const specimenAttack = new SpecimenProjectileSystem({
        collisionWorld,
        targetRegistry: combatTargets,
        body: specimenBody,
        aimRayProvider: this.renderLayer.cameraRig,
        config: this.authoredRoomOne ? FINAL_SPECIMEN_WEAPON : { overchargeHitsRequired: 4 },
      });
      rollback(() => specimenAttack.dispose());
      rollback(specimenAttack.events.on('projectileFired', event => specimenCharacter.onShot(event.direction, event.chargeAmount, event.overcharged)));
      const specimenDash = new SpecimenDash();
      const specimenAbilityAudio = this.audio ? new SpecimenAbilityAudio(this.audio, specimenBody, specimenAttack, specimenDash) : undefined;
      if (specimenAbilityAudio) rollback(() => specimenAbilityAudio.dispose());

      const finalBoss=scene.finalArena&&finalPresentation?new FinalBossEncounter({arena:scene.finalArena,world:collisionWorld,
        targets:combatTargets,body:specimenBody,weapon:specimenAttack,presentation:finalPresentation,host:this.host,audio:this.audio,
        isPlayerInvulnerable: () => specimenDash.readModel.active,
        onPlayerDamaged: amount => specimenCharacter.onDamage(amount),
        onPlayerDodged: () => { specimenDash.confirmDodge(); },
        requestFailure:()=>this.requestFailure()}):undefined;
      if(finalBoss)rollback(()=>finalBoss.dispose());

      const specimenPresentation = new SpecimenCombatPresentation({
        scene: this.renderLayer.scene,
        host: this.host,
        source: specimenAttack,
        dash: specimenDash,
        electricGoop: this.authoredRoomOne,
      });
      rollback(() => specimenPresentation.dispose());

      const electricalSystem = new VoltElectricalSystem<KinematicBody>({
        slimeManager: manager,
        collisionWorld,
        targetRegistry: electricalTargets,
        aimRayProvider: this.renderLayer.cameraRig,
        ...(this.authoredRoomOne ? {
          // Room 2 can be entered by Volt before the group handoff changes the
          // room ID. Scope his longer reach to the physical transit chamber,
          // never to Room 1's receiver or the connecting maintenance duct.
          rangeConfigProvider: () => maintenanceBay?.bay.transitAt(group.voltBody.position)
            ? BLACKOUT_TRANSIT_VOLT_RANGES
            : BLACKOUT_MAINTENANCE_VOLT_RANGES,
        } : {}),
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

      const unregisterPoweredDevicesCheckpointParticipant =
        checkpoints.registerParticipant(poweredDeviceRig.devices);
      rollback(unregisterPoweredDevicesCheckpointParticipant);

      const unregisterCombatCheckpointParticipant =
        checkpoints.registerParticipant(combatRig);
      rollback(unregisterCombatCheckpointParticipant);

      const unregisterSentinelCheckpointParticipant =
        checkpoints.registerParticipant(sentinelRig.controller);
      rollback(unregisterSentinelCheckpointParticipant);

      const unregisterMaintenanceDroneCheckpointParticipant =
        checkpoints.registerParticipant(maintenanceDrone);
      rollback(unregisterMaintenanceDroneCheckpointParticipant);

      const electricalPresentation = new VoltElectricalPresentation({
        scene: this.renderLayer.scene,
        host: this.host,
        targetRegistry: electricalTargets,
        isVoltSelected: () => manager.activeSlimeId === 'volt' && specimenForm.readModel.controlledForm !== 'specimen',
      });
      rollback(() => electricalPresentation.dispose());

      const goopAcidPresentation = new GoopAcidPresentation({
        host: this.host,
        scene: this.renderLayer.scene,
        cameraRig: this.renderLayer.cameraRig,
        source: acidProjectileSystem,
        targets: transit?.dissolveTargets ?? [],
        onProjectileFired: direction => goopPresentation.onAcidFired(direction),
      });
      rollback(() => goopAcidPresentation.dispose());

      const ventArrival=this.playArrival&&scene.maintenanceBay?new BlackoutVentArrival({root:scene.root,
        ventCollapse:scene.maintenanceBay.entryVentCollapse,
        bodies:{bob:group.bobBody,goop:group.goopBody,volt:group.voltBody},
        presentations:{bob:bobPresentation,goop:goopPresentation,volt:voltPresentation}}):undefined;
      if(ventArrival)rollback(()=>ventArrival.dispose());
      const elevatorAscent = scene.bossStaging?.ascentLift ? new BlackoutElevatorAscent({ root: scene.root, host: this.host,
        lift: scene.bossStaging.ascentLift, bodies: { bob: group.bobBody, goop: group.goopBody, volt: group.voltBody },
        presentations: { bob: bobPresentation, goop: goopPresentation, volt: voltPresentation } }) : undefined;
      if (elevatorAscent) rollback(() => elevatorAscent.dispose());
      const researchFinale = scene.bossStaging?.ascentLift && finalPresentation && scene.finalArena ? new BlackoutResearchFinale({
        root: scene.root, host: this.host, bodies: { bob: group.bobBody, goop: group.goopBody, volt: group.voltBody },
        presentations: { bob: bobPresentation, goop: goopPresentation, volt: voltPresentation },
        specimen: specimenCharacter, specimenBody, boss: finalPresentation, arena: scene.finalArena,
      }) : undefined;
      if (researchFinale) rollback(() => researchFinale.dispose());
      const defeatFinale = finalPresentation && scene.finalArena ? new BossDefeatFinale({
        root: scene.root, host: this.host, arena: scene.finalArena, boss: finalPresentation, specimen: specimenCharacter, creditsMarkdown: this.creditsMarkdown,
        bodies: { bob: group.bobBody, goop: group.goopBody, volt: group.voltBody },
        presentations: { bob: bobPresentation, goop: goopPresentation, volt: voltPresentation },
      }) : undefined;
      if (defeatFinale) rollback(() => defeatFinale.dispose());

      const lighting=scene.maintenanceBay&&transit?new BlackoutLightingPass(scene,transit):undefined;
      if(lighting){lighting.attachLights(this.renderLayer.scene);rollback(()=>lighting.dispose());}

      this.resources = {
        lighting,
        finalBoss,
        ventArrival,
        elevatorAscent,
        researchFinale,
        defeatFinale,
        transit,
        unregisterTransitCheckpointParticipant,
        dissolveSystem,
        acidProjectileSystem,
        goopAcidPresentation,
        maintenanceBay,
        connectorCamera:maintenanceBay?new BlackoutConnectorCamera(group.voltBody):undefined,
        dronePresentation,
        hallwayShadows: scene.maintenanceBay && maintenanceBay
          ? new SpatialShadowCache(scene.maintenanceBay.hallwayShadowLights, [
              { root: maintenanceBay.door.collisionMesh, radiusMetres: 4 },
              { root: maintenanceDroneFixture.droneRoot, radiusMetres: 2, animated: true },
            ]) : undefined,
        hallwayShadowParticipants: [group.bobBody.position, group.goopBody.position, group.voltBody.position, specimenBody.position],
        scene,
        collisionWorld,
        surfaceRegistry,
        puzzleRegistry,
        electricalTargets,
        electricalSystem,
        electricalPresentation,
        poweredDeviceRig,
        groupCarrierBodies,
        specimenCarrierBody,
        combatTargets,
        combatRig,
        sentinelRig,
        maintenanceDroneFixture,
        maintenanceDrone,
        specimenBody,
        specimenForm,
        specimenAttack,
        specimenDash,
        specimenAbilityAudio,
        specimenPresentation,
        specimenCharacter,
        specimenLight,
        unregisterElectricalCheckpointParticipant,
        unregisterPoweredDevicesCheckpointParticipant,
        unregisterCombatCheckpointParticipant,
        unregisterSentinelCheckpointParticipant,
        unregisterMaintenanceDroneCheckpointParticipant,
        manager,
        group,
        checkpoints,
        phase,
        deathSequence,
        deathScreen,
        movementEvents,
        bobPresentation, goopPresentation, goopMovementEvents, goopPresentationState,
        goopReflectionLighting: new GelReflectionLighting(this.renderLayer.scene),
        renderedGoopPosition: new THREE.Vector3(), goopDeathActive: false,
        bobReflectionEnvironment: undefined,
        specimenReflectionEnvironment: undefined,
        bobPresentationState,
        bobMovementIntent: new THREE.Vector3(),
        goopMovementIntent: new THREE.Vector3(),
        renderedBobPosition: new THREE.Vector3(),
        bobDeathActive: false,
        voltPresentation, voltPresentationState, voltMovementEvents, voltMovementIntent: new THREE.Vector3(),
        renderedVoltPosition: new THREE.Vector3(), renderedSpecimenPosition: new THREE.Vector3(), voltDeathActive: false,
        voltLight,
        movement: new THREE.Vector3(),
        jump: { pressed: false, held: false, released: false, cancelled: false },
        safetyHit,
        safetyDisplacement,
      };
      if (this.audio) {
        const gameplayAudio = new GameplayAudio(this.audio, manager, [scene.maintenanceBay?.acidInteractions, scene.transitRoom?.acidInteractions].flatMap(pool => pool ? [pool.surfaceBounds] : []), () =>
          researchFinale?.active ? researchFinale.audioBody : specimenForm.readModel.controlledForm === 'specimen' ? specimenBody :
            phase.phase === 'merging' ? undefined : manager.activeBody, this.renderLayer.scene, this.renderLayer.cameraRig.camera);
        this.gameplayAudio = gameplayAudio;
        gameplayAudio.bindSpecimen(specimenBody, () => !finalBoss?.cinematic &&
          (phase.phase === 'specimen' || phase.phase === 'boss'));
        rollback(() => {
          gameplayAudio.dispose();
          if (this.gameplayAudio === gameplayAudio) this.gameplayAudio = undefined;
        });
      }

      this.currentRoom = checkpoints.activeCheckpoint.room;
      this.bayComplete = false;
      this.roomTwoInitialized = false;
      this.bayExitHintShown = false;
      this.transitObjective = '';
      this.completionEmitted = false;
      this.syncVisuals(this.resources);
      this.resources.electricalPresentation.update(
        this.resources.electricalSystem.readModel,
      );
      this.resetForwardCamera();
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
    this.gameplayAudio?.setEnabled(true);
    const resources = this.requireResources();
    resources.goopAcidPresentation.resume();
    this.input.resetState();
    if(this.currentRoom.roomId==='room-1'&&resources.checkpoints.activeCheckpoint.checkpointId==='cp1'&&resources.ventArrival?.begin(this.renderLayer.cameraRig.camera)){
      this.host.dataset.cinematic='blackout-arrival';
    }
    this.input.setEnabled(
      this.debugInteractionEnabled &&
      !resources.ventArrival?.active &&
      !resources.phase.terminal &&
      resources.deathSequence.isPlaying,
    );
  };

  private readonly stopResources = (): void => {
    this.resetCompanions();
    this.gameplayAudio?.setEnabled(false);
    const resources = this.requireResources();
    resources.electricalSystem.cancelAim();
    resources.acidProjectileSystem.cancelAim();
    resources.goopAcidPresentation.suspend();
    resources.specimenAttack.cancelInput(); resources.specimenDash.cancel(); resources.specimenAbilityAudio?.setEnabled(false);
    resources.maintenanceDrone.suspendInput();
    resources.specimenPresentation.suspend();
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.renderLayer.cameraRig.setAimPresentationActive(false);
    this.syncVisuals(resources);
    this.input.setEnabled(false);
    this.input.resetState();
  };

  private readonly restartResources = (): void => {
    this.releaseBossTransmissionCap?.(); this.releaseBossTransmissionCap = undefined;
    this.gameplayAudio?.reset();
    const resources = this.requireResources();
    resources.defeatFinale?.reset();
    resources.finalBoss?.restoreCamera(this.renderLayer.cameraRig.camera);resources.finalBoss?.reset();
    resources.ventArrival?.cancel();this.clearArrivalUi();
    resources.elevatorAscent?.reset();
    resources.researchFinale?.reset();
    resources.scene.maintenanceBay?.acidInteractions.reset();
    resources.scene.transitRoom?.acidInteractions.reset();
    this.input.resetState();
    resources.deathSequence.reset();
    resources.deathScreen.hide();
    resources.maintenanceBay?.reset();
    resources.dronePresentation?.resetTutorial();
    resources.hallwayShadows?.invalidate();resources.lighting?.reset();
    this.bayComplete = false;
    this.roomTwoInitialized = false;
    this.bayExitHintShown = false;
    this.transitObjective = '';
    resources.electricalSystem.reset('restart');
    resources.acidProjectileSystem.reset();
    resources.dissolveSystem.reset();
    resources.goopAcidPresentation.reset();
    resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.renderLayer.cameraRig.setAimPresentationActive(false);
    resources.checkpoints.resetToInitial();
    this.gameplayAudio?.reset();
    resources.puzzleRegistry.reset();
    const snapshot = resources.checkpoints.recover(
      resources.group,
      resources.specimenBody,
    );
    resources.maintenanceDrone.reconcileAfterBodyRecovery(
      resources.group.activeSlimeId,
      resources.group.voltBody,
    );
    resources.dronePresentation?.update(0, resources.maintenanceDrone.readModel,
      resources.group.activeSlimeId === 'volt');
    this.currentRoom = snapshot.room;
    this.roomTwoInitialized = snapshot.room.roomId === 'room-2';
    this.bayComplete =
      this.roomTwoInitialized ||
      snapshot.room.local.maintenanceBayComplete === true;
    resources.transit?.setActive(snapshot.room.roomId === 'room-2');
    resources.phase.restore(snapshot.room.phase);
    resources.specimenForm.restore(snapshot.controlledForm);
    resources.sentinelRig.syncPresentation();
    resources.movement.set(0, 0, 0);
    resources.bobMovementIntent.set(0, 0, 0);
    resources.goopMovementIntent.set(0, 0, 0);
    resources.voltMovementIntent.set(0, 0, 0);
    resources.bobDeathActive = false;
    resources.bobPresentation.setPosition(resources.group.bobBody.position);
    resources.bobPresentation.reset();
    resources.goopPresentation.setPosition(resources.group.goopBody.position);
    resources.goopPresentation.reset();
    resources.goopDeathActive = false;
    resources.voltPresentation.setPosition(resources.group.voltBody.position);
    resources.voltPresentation.reset(); resources.voltDeathActive = false;
    resources.specimenCharacter.reset();
    clearJump(resources.jump, false);
    this.completionEmitted = false;
    this.resetForwardCamera();
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
    this.companionIndicators?.dispose(); this.companionIndicators = undefined;
    this.releaseBossTransmissionCap?.(); this.releaseBossTransmissionCap = undefined;
    this.releaseReducedTransmissionCap?.();
    this.releaseReducedTransmissionCap = undefined;
    this.companions.reset();
    this.gameplayAudio?.dispose();
    this.gameplayAudio = undefined;
    const resources = this.requireResources();
    resources.defeatFinale?.dispose();
    resources.finalBoss?.restoreCamera(this.renderLayer.cameraRig.camera);resources.finalBoss?.dispose();
    resources.ventArrival?.dispose();this.clearArrivalUi();
    resources.elevatorAscent?.dispose();
    resources.researchFinale?.dispose();
    resources.lighting?.dispose();
    this.programPreparation?.dispose(); this.programPreparation = undefined;
    this.hiddenMaterialCulling = undefined;
    this.shutterOcclusion = undefined;
    this.arenaOcclusion = undefined;
    this.input.setEnabled(false);
    this.input.resetState();
    this.input.releasePointerLock();
    this.renderLayer.cameraRig.clearFollowTarget();
    resources.deathSequence.reset();
    resources.deathScreen.dispose();
    resources.electricalPresentation.dispose();
    resources.goopAcidPresentation.dispose();
    resources.acidProjectileSystem.dispose();
    resources.dissolveSystem.dispose();
    resources.specimenPresentation.dispose();
    resources.specimenAbilityAudio?.dispose();
    resources.specimenAttack.dispose();
    resources.electricalSystem.dispose();
    resources.unregisterElectricalCheckpointParticipant();
    resources.unregisterPoweredDevicesCheckpointParticipant();
    resources.unregisterCombatCheckpointParticipant();
    resources.unregisterSentinelCheckpointParticipant();
    resources.unregisterMaintenanceDroneCheckpointParticipant();
    resources.unregisterTransitCheckpointParticipant?.();
    resources.transit?.dispose();
    resources.dronePresentation?.dispose();
    this.shadowRequest?.dispose();
    this.shadowRequest = undefined;
    resources.maintenanceBay?.dispose();
    resources.maintenanceDrone.dispose();
    resources.maintenanceDroneFixture.dispose();
    resources.sentinelRig.dispose();
    resources.combatRig.dispose();
    resources.combatTargets.dispose();
    resources.specimenForm.dispose();
    resources.poweredDeviceRig.dispose();
    resources.electricalTargets.dispose();

    resources.movementEvents.clear();
    resources.goopMovementEvents.clear();
    resources.voltMovementEvents.clear();
    resources.bobPresentation.dispose();
    resources.goopPresentation.dispose();
    resources.voltPresentation.dispose();
    resources.specimenCharacter.dispose();
    resources.specimenReflectionEnvironment?.dispose();
    resources.bobReflectionEnvironment?.dispose();
    resources.puzzleRegistry.clear();
    resources.manager.clearLevelRegistrations();
    resources.manager.dispose();
    resources.scene.dispose();
    resources.collisionWorld.clear();
    resources.surfaceRegistry.clear();
    delete this.host.dataset.gameState;
    this.resources = undefined;
    this.currentRoom = { roomId: 'room-1', phase: 'three-slime', local: {} };
    this.bayComplete = false;
    this.roomTwoInitialized = false;
    this.bayExitHintShown = false;
    this.transitObjective = '';
    this.completionEmitted = false;
    this.notifyHUD(undefined, true);
  };

  private maybeActivateRoomOneTutorialCheckpoint(
    resources: BlackoutRuntimeResources,
  ): void {
    if (
      !this.authoredRoomOne ||
      this.roomTwoInitialized ||
      !resources.maintenanceDrone.readModel.tutorialCompleted ||
      resources.checkpoints.activeCheckpoint.checkpointId !== 'cp1'
    ) {
      return;
    }

    const room: BlackoutRoomState = {
      roomId: 'room-1',
      phase: 'three-slime',
      local: {
        ...this.currentRoom.local,
        tutorialComplete: true,
      },
    };
    resources.checkpoints.activate('cp2', 'volt', room, {
      'maintenance-drone':
        resources.maintenanceDrone.captureTutorialCheckpointState(),
    });
    this.currentRoom = room;
  }

  private commitRoomOneCompletion(
    resources: BlackoutRuntimeResources,
  ): void {
    if (
      !this.authoredRoomOne ||
      this.bayComplete ||
      this.roomTwoInitialized ||
      !resources.maintenanceBay?.complete
    ) {
      return;
    }

    this.bayComplete = true;
    this.roomTwoInitialized = true;
    resources.electricalSystem.disconnect('completion');
    resources.electricalSystem.cancelAim();
    resources.acidProjectileSystem.reset();
    resources.goopAcidPresentation.reset();
    resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
    resources.maintenanceDrone.suspendInput();
    resources.electricalPresentation.update(
      resources.electricalSystem.readModel,
    );
    this.renderLayer.cameraRig.setAimPresentationActive(false, true);
    this.input.resetState();

    const room: BlackoutRoomState = {
      roomId: 'room-2',
      phase: 'three-slime',
      local: {
        maintenanceBayComplete: true,
      },
    };
    resources.checkpoints.activate(
      'cp3',
      resources.group.activeSlimeId,
      room,
      {
        'maintenance-drone':
          resources.maintenanceDrone.captureTutorialCheckpointState(),
      },
    );
    this.currentRoom = room;
    resources.phase.restore(room.phase);
    this.notifyHUD(undefined, true);
    this.events.emit('objectiveChanged', {
      roomId: room.roomId,
      objective: objectiveFor(room),
    });
  }

  private restoreActiveCheckpoint(
    resources: BlackoutRuntimeResources,
    resumeInput: boolean,
  ): void {
    this.resetCompanions();
    resources.defeatFinale?.reset();
    resources.finalBoss?.restoreCamera(this.renderLayer.cameraRig.camera);resources.finalBoss?.reset();
    resources.ventArrival?.cancel();this.clearArrivalUi();
    resources.elevatorAscent?.reset();
    resources.researchFinale?.reset();
    resources.scene.maintenanceBay?.acidInteractions.reset();
    resources.scene.transitRoom?.acidInteractions.reset();
    this.input.setEnabled(false);
    this.input.resetState();
    resources.maintenanceBay?.reset();
    resources.dronePresentation?.resetTutorial();
    resources.hallwayShadows?.invalidate();resources.lighting?.reset();
    this.bayExitHintShown = false;
    this.transitObjective = '';
    resources.electricalSystem.reset('reset');
    resources.acidProjectileSystem.reset();
    resources.dissolveSystem.reset();
    resources.goopAcidPresentation.reset();
    resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
    resources.specimenPresentation.suspend();
    resources.electricalPresentation.update(resources.electricalSystem.readModel);
    this.renderLayer.cameraRig.setAimPresentationActive(false);
    this.gameplayAudio?.reset();
    resources.puzzleRegistry.reset();
    const snapshot = resources.checkpoints.recover(
      resources.group,
      resources.specimenBody,
    );
    resources.maintenanceDrone.reconcileAfterBodyRecovery(
      resources.group.activeSlimeId,
      resources.group.voltBody,
    );
    this.currentRoom = snapshot.room;
    resources.elevatorAscent?.reset(snapshot.room.local.elevatorComplete === true || snapshot.room.local.finalBoss === true);
    resources.researchFinale?.reset(snapshot.room.local.researchComplete === true || snapshot.room.local.finalBoss === true);
    resources.scene.bossStaging?.ascentLift?.setArenaAccessOpen(snapshot.room.local.finalBoss === true);
    resources.transit?.setActive(snapshot.room.roomId === 'room-2');
    this.roomTwoInitialized = snapshot.room.roomId === 'room-2';
    this.bayComplete =
      this.roomTwoInitialized ||
      snapshot.room.local.maintenanceBayComplete === true;
    resources.phase.restore(snapshot.room.phase);
    resources.dronePresentation?.update(0, resources.maintenanceDrone.readModel,
      resources.group.activeSlimeId === 'volt');
    resources.specimenForm.restore(snapshot.controlledForm);
    resources.sentinelRig.syncPresentation();
    if(resources.finalBoss&&snapshot.room.local.finalBoss) {
      resources.phase.restore('boss');this.currentRoom={roomId:'room-4b',phase:'boss',local:{...snapshot.room.local,finalBoss:true}};
      if(snapshot.room.local.bossPhase===2)resources.finalBoss.startPhaseTwo();else resources.finalBoss.start(true);
    }
    resources.movement.set(0, 0, 0);
    resources.bobMovementIntent.set(0, 0, 0);
    resources.goopMovementIntent.set(0, 0, 0);
    resources.voltMovementIntent.set(0, 0, 0);
    if (resumeInput || !resources.bobDeathActive) {
      resources.bobPresentation.setPosition(resources.group.bobBody.position);
      resources.bobPresentation.reset();
      resources.bobDeathActive = false;
    }
    if (resumeInput || !resources.goopDeathActive) {
      resources.goopPresentation.setPosition(resources.group.goopBody.position);
      resources.goopPresentation.reset(); resources.goopDeathActive = false;
    }
    if (resumeInput || !resources.voltDeathActive) {
      resources.voltPresentation.setPosition(resources.group.voltBody.position);
      resources.voltPresentation.reset(); resources.voltDeathActive = false;
    }
    if (resumeInput || !resources.specimenCharacter.diagnostics.deathActive) {
      resources.specimenCharacter.reset();
      if (snapshot.room.local.finalBoss) resources.specimenCharacter.setYaw(Math.PI);
    }
    clearJump(resources.jump, true);
    this.resetForwardCamera();
    if(snapshot.room.local.finalBoss)this.renderLayer.cameraRig.setGroundOrbitPitchRadians?.(FINAL_SPECIMEN_START_PITCH);
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
    this.gameplayAudio?.respawn();
    resources.goopPresentation.finishDeath(resources.group.goopBody.position);
    resources.voltPresentation.finishDeath(resources.group.voltBody.position);
    resources.voltDeathActive = false;
    resources.goopDeathActive = false;
    if (resources.bobDeathActive) {
      resources.bobPresentation.finishDeath(resources.group.bobBody.position);
      resources.bobDeathActive = false;
    }
    if (resources.specimenCharacter.diagnostics.deathActive) {
      resources.specimenCharacter.reset();
      if (this.currentRoom.local.finalBoss) resources.specimenCharacter.setYaw(Math.PI);
    }
    this.syncVisuals(resources);
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

  private assertCheckpointActivationAllowed(
    resources: BlackoutRuntimeResources,
    checkpointId: BlackoutCheckpointId,
  ): void {
    if (checkpointId !== 'cp9') return;

    if(resources.finalBoss) {
      const boss=resources.finalBoss.controller;
      if(resources.phase.phase!=='boss'||!boss.combatActive||boss.readModel.phase!==2||!boss.readModel.weakPointOpen)
        throw new Error('CP9 is only available after reaching phase two of the final boss.');
      return;
    }

    const boss = resources.sentinelRig.controller;
    if (
      resources.phase.phase !== 'boss' ||
      boss.readModel.state === 'idle' ||
      boss.readModel.state === 'defeated' ||
      !boss.checkpointSafe
    ) {
      throw new Error(
        'CP9 may only be captured at a stable boundary during an active Sentinel fight.',
      );
    }
  }

  private readonly voltAimDirection = new THREE.Vector3();
  private resetCompanions(): void {
    this.companionIndicators?.hide();
    if (this.companions.reset()) this.notifyHUD();
  }

  private updateBobPresentation(
    deltaSeconds: number,
    resources: BlackoutRuntimeResources,
  ): void {
    const bob = resources.group.bobBody;
    const state = resources.bobPresentationState;
    state.grounded = bob.grounded;
    state.attached = bob.attached;
    state.chargingJump = bob.chargingJump;
    state.movementIntentWorld = resources.bobMovementIntent;
    state.jumpCharge = bob.chargeFraction;
    state.contactCount = bob.contactsThisStep;
    state.contactSpeedMetresPerSecond =
      bob.lastContactImpactSpeedMetresPerSecond;
    state.contactName = bob.lastContactName;
    state.contactSurfaceTag = bob.lastContactSurfaceTag;
    state.landedThisStep = bob.landedThisStep;
    resources.bobPresentation.update(deltaSeconds, state);
    resources.goopPresentationState.grounded = resources.group.goopBody.grounded;
    resources.goopPresentationState.movementIntentWorld = resources.goopMovementIntent;
    resources.goopPresentation.update(deltaSeconds, resources.goopPresentationState);
    resources.voltPresentationState.grounded = resources.maintenanceDrone.voltMounted || resources.group.voltBody.grounded;
    resources.voltPresentationState.movementIntentWorld = resources.voltMovementIntent;
    resources.voltPresentation.setAimDirection(resources.electricalSystem.readModel.aimActive
      ? this.renderLayer.cameraRig.camera.getWorldDirection(this.voltAimDirection) : undefined);
    resources.voltPresentation.setPosition(resources.group.voltBody.position);
    resources.voltPresentation.update(deltaSeconds, resources.voltPresentationState);
  }

  private resetForwardCamera(): void {
    this.renderLayer.cameraRig.reset();
    this.renderLayer.cameraRig.setGroundOrbitYawRadians?.(Math.PI);
  }

  private retargetCamera(resources: BlackoutRuntimeResources): void {
    const target =
      resources.specimenForm.readModel.controlledForm === 'specimen'
        ? resources.specimenBody
        : resources.group.activeBody;
    this.renderLayer.cameraRig.setFollowTarget(
      target,
      resources.collisionWorld,
    );
    this.renderLayer.cameraRig.setContextualCamera?.(this.authoredRoomOne&&resources.specimenForm.readModel.controlledForm==='specimen'
      ?{profile:FINAL_SPECIMEN_CAMERA,anchor:target}:undefined);
  }

  private syncVisuals(resources: BlackoutRuntimeResources): void {
    if (resources.researchFinale?.active || resources.defeatFinale?.active) return;
    // The arrival borrows the models beneath local slide poses. Writing world
    // body coordinates here would double-transform them and query false ceilings.
    if(!resources.ventArrival?.active && !resources.elevatorAscent?.active){
      resources.bobPresentation.setPosition(resources.group.bobBody.position);
      resources.goopPresentation.setPosition(resources.group.goopBody.position);
      resources.voltPresentation.setPosition(resources.group.voltBody.position);
    }
    resources.specimenCharacter.setPosition(resources.specimenBody.position);
    resources.specimenCharacter.placement.scale.setScalar(1);

    const specimenControlled =
      resources.specimenForm.readModel.controlledForm === 'specimen';
    const merging = resources.phase.phase === 'merging';
    const groupVisible = !specimenControlled || merging;
    if (!resources.bobDeathActive) {
      resources.bobPresentation.setVisible(groupVisible);
    }
    resources.voltPresentation.setVisible(groupVisible);
    resources.specimenCharacter.setVisible(specimenControlled);
    resources.specimenCharacter.setTrailEnabled(specimenControlled && !resources.finalBoss?.cinematic);
    if(merging&&resources.finalBoss) {
      const progress=resources.specimenForm.readModel.mergeProgress;
      const t=THREE.MathUtils.smoothstep(progress,.05,.95);
      const pose=(id:'bob'|'goop'|'volt',target:THREE.Vector3)=>{
        target.copy(resources.group[`${id}Body`].position).lerp(FINAL_MERGE_ANCHOR,t);
        target.y+=Math.sin(t*Math.PI)*.7;return target;
      };
      resources.bobPresentation.setPosition(pose('bob',resources.renderedBobPosition));
      resources.goopPresentation.setPosition(pose('goop',resources.renderedGoopPosition));
      resources.voltPresentation.setPosition(pose('volt',resources.renderedVoltPosition));
      resources.specimenCharacter.setVisible(progress>.6);
      const size=THREE.MathUtils.smoothstep(progress,.6,1);resources.specimenCharacter.placement.scale.setScalar(size);
      resources.finalBoss.presentMerge(progress);
    }
    // Removing the light on death changes NUM_POINT_LIGHTS and cold-compiles
    // receivers. Keep its warmed slot with zero radiance; specimen mode still
    // replaces that slot with specimenLight as before.
    resources.voltLight.visible = !specimenControlled;
    resources.voltLight.intensity = resources.voltDeathActive ? 0 :
      (this.authoredRoomOne ? BLACKOUT_VOLT_LIGHT_INTENSITY.authored : BLACKOUT_VOLT_LIGHT_INTENSITY.foundation) * (resources.elevatorAscent?.voltGlowWeight ?? 1);
    resources.specimenLight.visible = specimenControlled;
    resources.specimenLight.intensity = resources.specimenCharacter.diagnostics.deathActive ? 0 : 2.4;

    resources.goopPresentation.setVisible(groupVisible);
    resources.specimenPresentation.update(specimenControlled);
  }

  private clearArrivalUi():void{
    if(this.host.dataset?.cinematic==='blackout-arrival')delete this.host.dataset.cinematic;
  }

  private isSpawnSafe(
    resources: BlackoutRuntimeResources,
    position: THREE.Vector3,
    clearanceRadius: number,
  ): boolean {
    const directions: readonly (readonly [number, number, number])[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, 1, 0],
    ];
    for (const [x, y, z] of directions) {
      resources.safetyDisplacement.set(x, y, z).multiplyScalar(0.02);
      if (
        resources.collisionWorld.sweepSphere(
          position,
          resources.safetyDisplacement,
          clearanceRadius,
          resources.safetyHit,
        ) &&
        resources.safetyHit.fraction <= 1e-5
      ) {
        return false;
      }
    }
    return true;
  }

  private areSplitAnchorsSafe(resources: BlackoutRuntimeResources): boolean {
    for (const id of ['bob', 'goop', 'volt'] as const) {
      if (
        !this.isSpawnSafe(
          resources,
          this.authoredRoomOne ? FINAL_SPLIT_ANCHORS[id] : BLACKOUT_SPLIT_BODY_POSITIONS[id],
          resources.group[id === 'bob'
            ? 'bobBody'
            : id === 'goop'
              ? 'goopBody'
              : 'voltBody'].radiusMetres,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  private commitFinalBossPhaseTwoCheckpoint(resources:BlackoutRuntimeResources):void {
    if(!resources.finalBoss?.controller.combatActive||!resources.finalBoss.controller.consumeTransition())return;
    const room:BlackoutRoomState={roomId:'room-4b',phase:'boss',local:{...this.currentRoom.local,finalBoss:true,merged:true,bossPhase:2}};
    resources.checkpoints.activate('cp9','bob',room);this.currentRoom=room;
    this.notifyHUD();this.events.emit('objectiveChanged',{roomId:room.roomId,objective:objectiveFor(room)});
  }

  private commitBossDefeat(resources: BlackoutRuntimeResources): void {
    if (resources.phase.phase !== 'boss') return;
    if (!resources.phase.transition('boss-defeated')) {
      throw new Error('Sentinel defeat could not commit Blackout boss-defeated phase.');
    }

    resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
    resources.sentinelRig.controller.cancelTransient('defeat');
    resources.sentinelRig.droneSquad.clear();
    resources.sentinelRig.syncPresentation();
    this.renderLayer.cameraRig.setAimPresentationActive(false, true);
    this.input.resetState();
    this.currentRoom = {
      ...this.currentRoom,
      roomId: 'room-4b',
      phase: 'boss-defeated',
      local: {
        ...this.currentRoom.local,
        sentinelDefeated: true,
      },
    };
    if (resources.defeatFinale) {
      this.resetCompanions(); resources.transit?.setActive(false);
      resources.electricalSystem.disconnect('target-invalid'); resources.electricalSystem.cancelAim();
      resources.acidProjectileSystem.reset(); resources.goopAcidPresentation.reset();
      resources.maintenanceDrone.suspendInput();
      resources.finalBoss?.suspend();
      resources.defeatFinale.begin(this.renderLayer.cameraRig.camera);
      this.input.releasePointerLock();
    }
    this.events.emit('objectiveChanged', {
      roomId: this.currentRoom.roomId,
      objective: objectiveFor(this.currentRoom),
    });
  }

  private commitCompletion(): void {
    const resources = this.requireResources();
    if (this.completionEmitted || !resources.phase.terminal) return;
    this.completionEmitted = true;
    this.gameplayAudio?.reset();
    this.gameplayAudio?.setEnabled(false);
    resources.electricalSystem.disconnect('completion');
    resources.electricalSystem.cancelAim();
    resources.specimenAttack.reset(); resources.specimenDash.reset(); resources.specimenAbilityAudio?.setEnabled(false);
    resources.poweredDeviceRig.recomputePower();
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
          activeSlimeId:
            resources.specimenForm.readModel.controlledForm === 'specimen'
              ? undefined
              : resources.manager.activeSlimeId,
          controlledForm:
            resources.specimenForm.readModel.controlledForm === 'specimen'
              ? 'specimen'
              : 'slime',
          activeFormLabel:
            resources.specimenForm.readModel.controlledForm === 'specimen'
              ? 'SPECIMEN'
              : undefined,
          passiveInteractions: this.companions.passiveInteractions,
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

function createPoweredCarrierBody(
  id: 'bob' | 'goop' | 'volt' | 'specimen',
  body: KinematicBody,
): PoweredCarrierBody {
  return {
    id,
    position: body.position,
    radiusMetres: body.radiusMetres,
    isSupportedBy: (collider) => body.isSupportedBy(collider),
    applyCarrierDisplacement: (displacement, carrierCollider) => {
      body.applyCarrierDisplacement(displacement, carrierCollider);
    },
  };
}

function clearJump(state: JumpInputState, cancelled: boolean): void {
  state.pressed = false;
  state.held = false;
  state.released = false;
  state.cancelled = cancelled;
}

function createBobPresentationState(
  body: KinematicBody,
): BobCharacterPresentationState {
  return {
    locomotionPositionWorld: body.locomotionPosition,
    velocityWorld: body.velocity,
    movementIntentWorld: new THREE.Vector3(),
    surfaceNormalWorld: body.groundNormal,
    gameplayUpWorld: body.gameplayUp,
    grounded: body.grounded,
    attached: body.attached,
    chargingJump: body.chargingJump,
    jumpCharge: body.chargeFraction,
    get maximumLocomotionSpeedMetresPerSecond() { return body.maximumLocomotionSpeedMetresPerSecond; },
    contactCount: body.contactsThisStep,
    contactNormalWorld: body.lastContactNormal,
    contactSpeedMetresPerSecond: body.lastContactImpactSpeedMetresPerSecond,
    contactName: body.lastContactName,
    contactSurfaceTag: body.lastContactSurfaceTag,
    landedThisStep: body.landedThisStep,
  };
}

function interpolateBodyPosition(
  body: KinematicBody,
  alpha: number,
  target: THREE.Vector3,
): void {
  target.set(
    THREE.MathUtils.lerp(body.previousPosition.x, body.position.x, alpha),
    THREE.MathUtils.lerp(body.previousPosition.y, body.position.y, alpha),
    THREE.MathUtils.lerp(body.previousPosition.z, body.position.z, alpha),
  );
}

function objectiveFor(room: BlackoutRoomState): string {
  switch (room.roomId) {
    case 'room-1': return 'Use Volt to bring the restricted sector back online';
    case 'room-2': return room.local.transitComplete ? 'Reach the damaged service elevator' : room.local.transitStage === 2
      ? 'Bob holds the bridge. Goop clears the drones. Volt crosses and locks it.'
      : room.local.transitStage === 1
        ? 'Use Volt to raise the cargo lifts and Goop to clear the drones from Bob’s route'
        : 'Restore the transit lights and clear the sewer drones for Bob';
    case 'room-3': return 'Bring all three specimens into the final chamber';
    case 'room-4a': return 'Enter the merge chamber';
    case 'room-4b': return 'Defeat the facility defence system';
    case 'ending': return room.phase === 'complete' ? 'Escape complete' : 'Escape the facility';
  }
}
