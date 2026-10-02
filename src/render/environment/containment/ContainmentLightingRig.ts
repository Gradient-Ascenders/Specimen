import * as THREE from 'three';

import type { ElevatorSequenceState } from '../../../puzzle/ElevatorSequence.ts';
import type { RoomFourGreybox } from '../../../levels/RoomFourGreybox.ts';
import type {
  RoomFiveEndingState,
  RoomFiveGreybox,
} from '../../../levels/RoomFiveGreybox.ts';
import type { BobCharacterPresentation } from '../../bob/BobCharacterPresentation.ts';
import type { RoomOneArt } from './RoomOneArt.ts';
import { ContainmentPointEffect } from './ContainmentPointEffect.ts';
import { DissolveMaterial } from '../../dissolve/DissolveMaterial.ts';
import type { Vector3State } from '../../slime/SlimePresentationContract.ts';
import {
  authorContainmentShadowRoles,
  configureContainmentShadow,
  containmentRoomLightWeights,
  CONTAINMENT_SHADOW_HANDOFFS,
  CONTAINMENT_FIXTURE_AIMS,
} from './ContainmentShadowCoverage.ts';

export type ContainmentLightingRoomId = 1 | 2 | 3 | 4 | 5;

export type BobHatchLightingState =
  | 'gameplay'
  | 'establishing'
  | 'emergence'
  | 'impact'
  | 'complete';

export type GoopReleaseLightingState =
  | 'normal'
  | 'warning'
  | 'locks-disengaging'
  | 'opening'
  | 'reveal'
  | 'released';

export type CutsceneFinalizationMode = 'completed' | 'skipped';

export interface ContainmentCutsceneLighting {
  setBobHatchLightingState(state: BobHatchLightingState): void;
  finalizeBobHatch(mode: CutsceneFinalizationMode): void;
  setGoopReleaseLightingState(state: GoopReleaseLightingState): void;
  finalizeGoopRelease(mode: CutsceneFinalizationMode): void;
}

export interface ContainmentLightingDiagnostics {
  readonly activeRoomId: ContainmentLightingRoomId;
  readonly bobHatchState: BobHatchLightingState;
  readonly goopReleaseState: GoopReleaseLightingState;
  readonly goopReleaseManuallyDriven: boolean;
  readonly roomFourElevatorState: ElevatorSequenceState;
  readonly authoredLightCount: number;
  readonly visibleAuthoredLightCount: number;
  readonly shadowCastingLightCount: number;
  readonly visibleShadowSourceNames: readonly string[];
  readonly shadowPassCount: number;
  readonly shadowUpdatePassCount: number;
  readonly shadowMapTexels: number;
  readonly visibleRoomIds: readonly ContainmentLightingRoomId[];
  readonly activeParticleCount: number;
  readonly goopStateApplicationCount: number;
  readonly elevatorStateApplicationCount: number;
  readonly disposed: boolean;
  readonly bobReflectionZone: 'room' | 'duct';
  readonly bobBodyReflectionTarget: number;
  readonly bobEyeReflectionTarget: number;
}

export interface ContainmentLightingRigOptions {
  readonly levelRoot: THREE.Object3D;
  readonly roomOneArt: RoomOneArt;
  readonly roomFour: RoomFourGreybox;
  readonly roomFive: RoomFiveGreybox;
  readonly bob: BobCharacterPresentation;
}

const ROOM_IDS: readonly ContainmentLightingRoomId[] = [1, 2, 3, 4, 5];
const PREWARM_ROOM_IDS: readonly ContainmentLightingRoomId[] = [1, 2, 3, 4, 5];
const CLINICAL_COLOUR = 0xd9efff;
const DUCT_COLOUR = 0x86aabd;
const AMBER_COLOUR = 0xffaa2a;
const ORANGE_COLOUR = 0xff6624;
const ALARM_COLOUR = 0xff263f;
const ACID_COLOUR = 0x87d62e;
const RELEASE_GREEN_COLOUR = 0x7eff43;
const ARRIVAL_GREEN_COLOUR = 0x49ef91;
const BOB_ROOM_REFLECTIONS = {
  1: { body: 0.42, eyes: 1.12 },
  2: { body: 0.56, eyes: 1.02 },
  3: { body: 0.38, eyes: 0.74 },
  4: { body: 0.2, eyes: 0.46 },
  5: { body: 0.34, eyes: 0.68 },
} as const satisfies Record<
  ContainmentLightingRoomId,
  { readonly body: number; readonly eyes: number }
>;
const BOB_DUCT_REFLECTION = { body: 0.1, eyes: 0.24 } as const;

/**
 * Authored Level 1 lighting and bounded environmental effects.
 *
 * Elevator and release presentation are mappings of existing authoritative
 * state. The cutscene API can temporarily provide the finer presentation
 * phases #38 needs without exposing individual Three.js objects.
 */
export class ContainmentLightingRig implements ContainmentCutsceneLighting {
  readonly root = new THREE.Group();

  private readonly levelRoot: THREE.Object3D;
  private readonly roomFour: RoomFourGreybox;
  private readonly roomFive: RoomFiveGreybox;
  private readonly bob: BobCharacterPresentation;
  private readonly roomGroups = new Map<ContainmentLightingRoomId, THREE.Group>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly attachedPanelFixtures: THREE.Object3D[] = [];
  private readonly unitBox = this.geometry(new THREE.BoxGeometry(1, 1, 1));
  private readonly fixtureHousingMaterial = this.material(
    new THREE.MeshStandardMaterial({
      name: 'containment-light-fixture-graphite-housing',
      color: 0x202629,
      roughness: 0.52,
      metalness: 0.58,
    }),
  );
  private readonly ductEmitterMaterial = this.emissiveMaterial(
    'containment-duct-cue-emitter',
    DUCT_COLOUR,
    0.8,
  );
  private readonly shaftEmitterMaterials = [
    this.emissiveMaterial('room-4-lower-shaft-emitter', AMBER_COLOUR, 0.5),
    this.emissiveMaterial('room-4-middle-shaft-emitter', ORANGE_COLOUR, 0.35),
    this.emissiveMaterial('room-4-upper-shaft-emitter', 0x7d96a0, 0.25),
  ] as const;
  private readonly lockEmitterMaterial = this.emissiveMaterial(
    'room-5-containment-lock-status-emitter',
    0x65b9bf,
    0.65,
  );

  private readonly roomOneFixtureLights: readonly THREE.SpotLight[];
  private readonly roomOnePedestalKey: THREE.SpotLight;
  private readonly roomFourZoneLights: readonly THREE.SpotLight[];
  private readonly roomFiveChamberLight: THREE.SpotLight;
  private readonly roomFiveRevealLight: THREE.SpotLight;
  private readonly roomFiveObservationLight: THREE.SpotLight;
  private readonly bobImpactEffect = new ContainmentPointEffect({
    name: 'room-1-bob-containment-impact-sparkles',
    colour: 0xc9efff,
    count: 12,
    sizeMetres: 0.045,
    lifetimeSeconds: 0.65,
    horizontalSpeedMetresPerSecond: 1.15,
    upwardSpeedMetresPerSecond: 1.25,
    gravityMetresPerSecondSquared: 3.5,
    seed: 33,
  });
  private readonly goopReleaseEffect = new ContainmentPointEffect({
    name: 'room-5-goop-release-vapour',
    colour: 0xb4ff72,
    count: 18,
    sizeMetres: 0.09,
    lifetimeSeconds: 1.15,
    horizontalSpeedMetresPerSecond: 0.42,
    upwardSpeedMetresPerSecond: 0.85,
    gravityMetresPerSecondSquared: -0.08,
    seed: 38,
  });

  private activeRoomIdValue: ContainmentLightingRoomId = 1;
  private bobHatchStateValue: BobHatchLightingState = 'gameplay';
  private goopReleaseStateValue: GoopReleaseLightingState = 'normal';
  private goopReleaseManuallyDriven = false;
  private goopStateElapsedSeconds = 0;
  private lastElevatorState: ElevatorSequenceState | undefined;
  private lastElevatorProgress = Number.NaN;
  private lastElevatorStateElapsedSeconds = Number.NaN;
  private goopStateApplicationCount = 0;
  private elevatorStateApplicationCount = 0;
  private disposed = false;
  private bobInDarkDuct = false;
  private traversalPosition: Vector3State | undefined;
  private readonly shadowLights: (THREE.PointLight | THREE.SpotLight)[] = [];
  private readonly authoredIntensities = new Map<THREE.Light, number>();
  private readonly previousShadowParticipants: THREE.Vector3[] = [];
  private readonly shadowMovingOwners: {
    readonly root: THREE.Object3D;
    readonly radius: number;
    readonly matrix: THREE.Matrix4;
    readonly centre: THREE.Vector3;
    visible: boolean;
  }[] = [];
  private readonly shadowSourcePosition = new THREE.Vector3();
  private readonly shadowSphere = new THREE.Sphere();
  private lastDoorDissolveAmount = 0;

  constructor(options: ContainmentLightingRigOptions) {
    this.levelRoot = options.levelRoot;
    this.roomFour = options.roomFour;
    this.roomFive = options.roomFive;
    this.bob = options.bob;
    this.root.name = 'containment-authored-lighting-and-effects';
    this.root.userData.presentationOnly = true;

    const ambient = new THREE.HemisphereLight(0xcfe4f4, 0x19211f, 0.78);
    ambient.name = 'containment-cold-clinical-foundation';
    this.root.add(ambient);
    this.applyBobReflectionTarget();

    for (const roomId of ROOM_IDS) {
      const group = new THREE.Group();
      group.name = `containment-room-${roomId}-lighting-rig`;
      group.userData.presentationOnly = true;
      this.roomGroups.set(roomId, group);
      this.root.add(group);
    }

    const roomOne = this.room(1);
    this.roomOneFixtureLights = [
      this.downlight('room-1-fluorescent-a-received-light', [-3.8, 7.45, -1.5], CLINICAL_COLOUR, 58, 13),
      this.downlight('room-1-fluorescent-b-received-light', [3.8, 7.45, -1.5], CLINICAL_COLOUR, 58, 13),
    ];
    // Keep the existing fluorescent sources; duct keys are fitted separately.
    roomOne.add(...this.roomOneFixtureLights);
    this.roomOnePedestalKey = this.spot(
      'room-1-pedestal-soft-key',
      [0, 6.4, -0.5],
      [0, 1.65, -0.5],
      62,
      10,
      0.48,
      0.72,
      CLINICAL_COLOUR,
    );
    this.roomOnePedestalKey.castShadow = true;
    this.roomOnePedestalKey.shadow.mapSize.set(1024, 1024);
    this.roomOnePedestalKey.shadow.camera.near = 0.35;
    // SpotLightShadow derives far from the authored light distance (10 m).
    this.roomOnePedestalKey.shadow.camera.far = this.roomOnePedestalKey.distance;
    this.roomOnePedestalKey.shadow.bias = -0.0001;
    this.roomOnePedestalKey.shadow.normalBias = 0.015;
    this.roomOnePedestalKey.shadow.radius = 1.5;
    this.roomOnePedestalKey.shadow.autoUpdate = true;
    roomOne.add(this.roomOnePedestalKey, this.roomOnePedestalKey.target);

    const ductLight = this.downlight(
      'room-1-to-2-duct-reflected-cue',
      [-8.4, 12.25, 26.5],
      DUCT_COLOUR,
      24,
      11,
    );
    roomOne.add(ductLight);
    roomOne.add(
      this.fixture(
        'room-1-to-2-duct-exit-fixture',
        [-8.4, 12.38, 26.5],
        [1.15, 0.06, 0.22],
        this.ductEmitterMaterial,
      ),
    );
    roomOne.add(this.bobImpactEffect.points);
    // Dim service luminaires inside the enclosed low run and ramp. These use
    // the existing duct cue palette, not a character-following light.
    for (const [name, position, target, distance, angle] of [
      ['low-run', [-4.8, 7.12, 10.5], [-4.8, 5.2, 10.5], 6.5, 1.25],
      ['ramp', [-4.8, 11.7, 22], [-4.8, 6.2, 14], 12, 0.65],
      ['turn', [-4.8, 12.4, 24], [-6.5, 10.5, 24], 6, 1.0],
    ] as const) {
      const key = this.spot(`room-1-to-2-duct-${name}-key`, position, target,
        3, distance, angle, 0.3, DUCT_COLOUR);
      roomOne.add(key, key.target,
        this.fixture(`room-1-to-2-duct-${name}-fixture`, position,
          [0.55, 0.04, 0.16], this.ductEmitterMaterial));
    }

    const roomTwo = this.room(2);
    roomTwo.add(
      this.downlight('room-2-drop-zone-light', [-8, 16.55, 35], CLINICAL_COLOUR, 280, 25),
      this.downlight('room-2-lower-route-light', [0, 16.55, 39], 0xc9e9f5, 260, 25),
      this.downlight('room-2-sticky-and-exit-route-light', [8, 16.55, 43], 0xc3e4ee, 280, 25),
    );

    const roomThree = this.room(3);
    roomThree.add(
      this.downlight('room-3-clinical-entry-received-light', [-6.5, 30, 54], CLINICAL_COLOUR, 250, 30),
      this.downlight('room-3-industrial-route-received-light', [8, 29, 64], 0xb2cad5, 210, 28),
      this.point('room-3-acid-reflected-light', [0, 7.2, 64], ACID_COLOUR, 75, 18),
      this.downlight('room-3-high-exit-vent-cue', [9, 32.5, 74.3], 0xb6e4dd, 95, 16),
    );

    const roomFour = this.room(4);
    this.roomFourZoneLights = [
      this.spot('room-4-lower-amber-received-light', [3.35, 41, 85.5], [9, 33, 85.5], 7, 16, 1, .18, AMBER_COLOUR),
      this.spot('room-4-middle-escalation-received-light', [3.35, 65, 85.5], [9, 49, 85.5], 4, 28, 1, .18, ORANGE_COLOUR),
      this.spot('room-4-upper-arrival-received-light', [3.35, 77, 85.5], [9, 70, 85.5], 4, 17, 1, .18, 0x8aa7b2),
    ];
    roomFour.add(...this.roomFourZoneLights);
    roomFour.add(...this.roomFourZoneLights.map(light => light.target));
    this.buildShaftFixtures(roomFour);

    const roomFive = this.room(5);
    roomFive.add(
      this.downlight('room-5-safe-entry-received-light', [9, 100, 96], CLINICAL_COLOUR, 320, 32),
      this.downlight('room-5-upper-traversal-received-light', [10, 100, 116], 0xbadbe8, 240, 32),
    );
    this.roomFiveChamberLight = this.spot(
      'room-5-containment-state-light',
      [0, 79.8, 110],
      [0, 75, 114],
      62,
      14,
      1.25,
      .2,
      ACID_COLOUR,
    );
    this.roomFiveRevealLight = this.spot(
      'room-5-goop-reveal-rim-light',
      [0, 82.5, 106],
      [0, 76.4, 110],
      0,
      15,
      0.56,
      0.72,
      RELEASE_GREEN_COLOUR,
    );
    this.roomFiveObservationLight = this.spot(
      'room-5-observation-lever-key',
      [-10, 103.5, 128],
      [-10, 99, 131.25],
      78,
      14,
      0.62,
      0.7,
      0xd7efff,
    );
    roomFive.add(
      this.roomFiveChamberLight,
      this.roomFiveChamberLight.target,
      this.roomFiveRevealLight,
      this.roomFiveRevealLight.target,
      this.roomFiveObservationLight,
      this.roomFiveObservationLight.target,
      this.goopReleaseEffect.points,
    );
    this.attachContainmentLockFixtures();
    this.authorShadowIntent(options.roomOneArt);
    authorContainmentShadowRoles(this.levelRoot);
    this.root.traverse(object => {
      if (!(object instanceof THREE.PointLight || object instanceof THREE.SpotLight)) return;
      this.authoredIntensities.set(object, object.intensity);
      if (configureContainmentShadow(object)) this.shadowLights.push(object);
    });
    for (const [root, radius] of [
      [this.roomFour.elevatorPlatform.root, 7],
      [this.roomFive.movingPlatformOne.root, 4],
      [this.roomFive.movingPlatformTwo.root, 4],
      [options.roomOneArt.specimenAssembly, 4],
      [options.roomOneArt.eggRoot, 2],
      [options.roomOneArt.containmentBoxRoot, 3],
      [options.roomOneArt.intactFrameAndPanes, 3],
      [options.roomOneArt.shatteredFrameAndDebris, 3],
      ...Object.values(options.roomOneArt.eggStates).map(root => [root, 2] as const),
      [this.levelRoot.getObjectByName('room-1-locked-laboratory-door-assembly')!, 5],
      [this.levelRoot.getObjectByName('room-4-cargo-elevator-room5-closed-shutter')!, 4],
      ...Object.values(this.roomFive.art.panelPivots).map(root => [root, 5] as const),
    ] as const) {
      root.updateWorldMatrix(true, false);
      this.shadowMovingOwners.push({ root, radius, matrix: root.matrixWorld.clone(),
        centre: root.getWorldPosition(new THREE.Vector3()), visible: root.visible });
    }

    this.applyRoomVisibility();
    this.applyBobHatchState();
    this.reconcileAuthoritativeState(true);
  }

  get cutsceneLighting(): ContainmentCutsceneLighting {
    return this;
  }

  get diagnostics(): ContainmentLightingDiagnostics {
    let authoredLightCount = 0;
    let visibleAuthoredLightCount = 0;
    let shadowCastingLightCount = 0;
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Light)) return;
      authoredLightCount += 1;
      if (object.castShadow) shadowCastingLightCount += 1;
      if (isEffectivelyVisible(object)) visibleAuthoredLightCount += 1;
    });
    const visibleShadowLights = this.shadowLights.filter(isEffectivelyVisible);
    return {
      activeRoomId: this.activeRoomIdValue,
      bobHatchState: this.bobHatchStateValue,
      goopReleaseState: this.goopReleaseStateValue,
      goopReleaseManuallyDriven: this.goopReleaseManuallyDriven,
      roomFourElevatorState: this.roomFour.elevator.state,
      authoredLightCount,
      visibleAuthoredLightCount,
      shadowCastingLightCount,
      visibleShadowSourceNames: visibleShadowLights.map(light => light.name),
      shadowPassCount: visibleShadowLights.reduce((count, light) => count + (light instanceof THREE.PointLight ? 6 : 1), 0),
      shadowUpdatePassCount: visibleShadowLights.reduce((count, light) => count +
        (light.shadow.autoUpdate || light.shadow.needsUpdate || !light.shadow.map ? (light instanceof THREE.PointLight ? 6 : 1) : 0), 0),
      shadowMapTexels: visibleShadowLights.reduce((count, light) => count + light.shadow.mapSize.x * light.shadow.mapSize.y * (light instanceof THREE.PointLight ? 6 : 1), 0),
      visibleRoomIds: ROOM_IDS.filter(roomId => this.room(roomId).visible),
      activeParticleCount:
        this.bobImpactEffect.activeParticleCount +
        this.goopReleaseEffect.activeParticleCount,
      goopStateApplicationCount: this.goopStateApplicationCount,
      elevatorStateApplicationCount: this.elevatorStateApplicationCount,
      disposed: this.disposed,
      bobReflectionZone: this.bobInDarkDuct ? 'duct' : 'room',
      bobBodyReflectionTarget: this.bobReflectionTarget.body,
      bobEyeReflectionTarget: this.bobReflectionTarget.eyes,
    };
  }

  setActiveRoom(roomId: ContainmentLightingRoomId): void {
    if (this.activeRoomIdValue === roomId) return;
    this.activeRoomIdValue = roomId;
    this.applyRoomVisibility();
    this.applyBobReflectionTarget();
  }

  setTraversalPosition(position: Vector3State): void {
    // Borrow the existing body position: no duplicate movement or timer state.
    this.traversalPosition = position;
    this.applyRoomVisibility();
  }

  /** Call after presenting poses, immediately before the live draw.
   * Static zones retain their maps. Current dynamic occupants stay live; a
   * departed occupant or changed assembly invalidates both old/new coverage.
   */
  prepareShadowFrame(participants: readonly Vector3State[]): void {
    if (this.disposed) return;
    const changedOwners: { centre: THREE.Vector3; radius: number }[] = [];
    for (const owner of this.shadowMovingOwners) {
      owner.root.updateWorldMatrix(true, false);
      if (owner.matrix.equals(owner.root.matrixWorld) && owner.visible === owner.root.visible) continue;
      changedOwners.push({ centre: owner.centre.clone(), radius: owner.radius });
      owner.root.getWorldPosition(owner.centre);
      changedOwners.push({ centre: owner.centre, radius: owner.radius });
      owner.matrix.copy(owner.root.matrixWorld);
      owner.visible = owner.root.visible;
    }
    // Dissolve shaders change silhouettes without changing a transform.
    const dissolvingDoor = this.roomFive.goopWoodenDoor;
    const doorMaterials = [dissolvingDoor.material].flat();
    const dissolveAmount = doorMaterials.find((material): material is DissolveMaterial =>
      material instanceof DissolveMaterial)?.dissolveAmountUniform.value ?? 0;
    const dissolveLive = dissolvingDoor.visible && dissolveAmount > 0 && dissolveAmount < 1;
    const dissolveChanged = dissolveAmount !== this.lastDoorDissolveAmount;
    for (const light of this.shadowLights) {
      const shadow = light.shadow;
      light.getWorldPosition(this.shadowSourcePosition);
      if (light instanceof THREE.SpotLight) {
        light.target.updateWorldMatrix(true, false);
        light.shadow.updateMatrices(light);
      }
      const intersects = (position: Vector3State, radius: number): boolean => {
        this.shadowSphere.center.set(position.x, position.y, position.z);
        this.shadowSphere.radius = radius;
        if (this.shadowSourcePosition.distanceTo(this.shadowSphere.center) > light.distance + radius) return false;
        return !(light instanceof THREE.SpotLight) || light.shadow.getFrustum().intersectsSphere(this.shadowSphere);
      };
      const dynamic = participants.some(position => intersects(position, 1.5)) ||
        (dissolveLive && intersects(dissolvingDoor.getWorldPosition(this.shadowSphere.center), 4));
      shadow.autoUpdate = dynamic;
      if (!shadow.map || (dissolveChanged && intersects(dissolvingDoor.getWorldPosition(this.shadowSphere.center), 4)) ||
        changedOwners.some(owner => intersects(owner.centre, owner.radius)) ||
        (!dynamic && this.previousShadowParticipants.some(position => intersects(position, 1.5)))) {
        shadow.needsUpdate = true;
      }
    }
    participants.forEach((position, index) => {
      const previous = this.previousShadowParticipants[index] ??= new THREE.Vector3();
      previous.set(position.x, position.y, position.z);
    });
    this.previousShadowParticipants.length = participants.length;
    this.lastDoorDissolveAmount = dissolveAmount;
  }

  private invalidateShadowMaps(): void {
    for (const light of this.shadowLights) light.shadow.needsUpdate = true;
    this.previousShadowParticipants.length = 0;
  }

  setBobInDarkDuct(inDarkDuct: boolean): void {
    if (this.bobInDarkDuct === inDarkDuct) return;
    this.bobInDarkDuct = inDarkDuct;
    this.applyBobReflectionTarget();
  }

  /**
   * Visit each room and doorway overlap during the hidden loading prewarm.
   */
  async prewarmShaderConfigurations(
    compileCurrentConfiguration: (
      roomId: ContainmentLightingRoomId,
      coverageRoomIds: readonly ContainmentLightingRoomId[],
    ) => Promise<void>,
  ): Promise<void> {
    const initialRoomId = this.activeRoomIdValue;
    const initialPosition = this.traversalPosition;
    try {
      this.traversalPosition = undefined;
      for (const roomId of PREWARM_ROOM_IDS) {
        this.setActiveRoom(roomId);
        this.applyRoomVisibility();
        await compileCurrentConfiguration(roomId, [roomId]);
      }
      // Adjacent rigs coexist during spatial handoffs; prepare their combined
      // light and receive-shadow signatures before gameplay crosses a doorway.
      for (const handoff of CONTAINMENT_SHADOW_HANDOFFS) {
        this.activeRoomIdValue = handoff.rooms[0];
        this.traversalPosition = { x: 0, y: (handoff.minY + handoff.maxY) / 2, z: handoff.z };
        this.applyRoomVisibility();
        await compileCurrentConfiguration(handoff.rooms[0], handoff.rooms);
      }
    } finally {
      this.traversalPosition = initialPosition;
      this.setActiveRoom(initialRoomId);
      this.applyRoomVisibility();
      this.applyBobReflectionTarget();
    }
  }

  setBobHatchLightingState(state: BobHatchLightingState): void {
    if (this.bobHatchStateValue === state) return;
    this.bobHatchStateValue = state;
    this.invalidateShadowMaps();
    if (state === 'impact') {
      this.bobImpactEffect.start([0, 0.62, -0.5]);
    } else if (state === 'gameplay' || state === 'complete') {
      this.bobImpactEffect.reset();
    }
    this.applyBobHatchState();
  }

  finalizeBobHatch(_mode: CutsceneFinalizationMode): void {
    this.invalidateShadowMaps();
    this.bobHatchStateValue = 'complete';
    this.bobImpactEffect.reset();
    this.applyBobHatchState();
  }

  setGoopReleaseLightingState(state: GoopReleaseLightingState): void {
    this.goopReleaseManuallyDriven = true;
    this.setGoopReleaseState(state);
  }

  finalizeGoopRelease(_mode: CutsceneFinalizationMode): void {
    this.invalidateShadowMaps();
    this.goopReleaseManuallyDriven = true;
    this.setGoopReleaseState('released');
    this.goopReleaseEffect.reset();
  }

  /**
   * Re-read gameplay state after checkpoint recovery, restart or debug entry.
   * This is also the deterministic handoff back from future cutscene control.
   */
  reconcileAuthoritativeState(clearTransientEffects = false): void {
    if (clearTransientEffects) {
      this.invalidateShadowMaps();
      this.bobImpactEffect.reset();
      this.goopReleaseEffect.reset();
      this.bobHatchStateValue = 'gameplay';
      this.goopReleaseManuallyDriven = false;
      this.applyBobHatchState();
    }
    if (!this.goopReleaseManuallyDriven) {
      this.setGoopReleaseState(
        mapRoomFiveEndingState(
          this.roomFive.endingState,
          this.roomFive.endingProgress,
        ),
      );
    }
    this.syncElevatorLighting(true);
    if (clearTransientEffects) this.applyBobReflectionTarget(true);
  }

  reset(): void {
    this.invalidateShadowMaps();
    this.activeRoomIdValue = 1;
    this.bobHatchStateValue = 'gameplay';
    this.goopReleaseManuallyDriven = false;
    this.goopReleaseStateValue = 'normal';
    this.goopStateElapsedSeconds = 0;
    this.bobInDarkDuct = false;
    this.traversalPosition = undefined;
    this.bobImpactEffect.reset();
    this.goopReleaseEffect.reset();
    this.applyRoomVisibility();
    this.applyBobHatchState();
    this.applyGoopReleaseState();
    this.syncElevatorLighting(true);
    this.applyBobReflectionTarget(true);
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    this.goopStateElapsedSeconds += deltaSeconds;
    let goopStateChanged = false;
    if (!this.goopReleaseManuallyDriven) {
      goopStateChanged = this.setGoopReleaseState(
        mapRoomFiveEndingState(
          this.roomFive.endingState,
          this.roomFive.endingProgress,
        ),
      );
    }
    if (!goopStateChanged && this.goopReleaseStateValue === 'warning') {
      this.applyGoopReleaseState();
    }
    this.syncElevatorLighting();
    this.bobImpactEffect.update(deltaSeconds);
    this.goopReleaseEffect.update(deltaSeconds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const light of this.shadowLights) {
      light.shadow.dispose();
      light.shadow.map = null;
      light.shadow.mapPass = null;
    }
    this.shadowLights.length = 0;
    this.authoredIntensities.clear();
    this.shadowMovingOwners.length = 0;
    this.previousShadowParticipants.length = 0;
    this.traversalPosition = undefined;
    this.bobImpactEffect.dispose();
    this.goopReleaseEffect.dispose();
    for (const fixture of this.attachedPanelFixtures) fixture.removeFromParent();
    this.attachedPanelFixtures.length = 0;
    this.root.removeFromParent();
    this.root.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear();
    this.materials.clear();
  }

  private room(roomId: ContainmentLightingRoomId): THREE.Group {
    const group = this.roomGroups.get(roomId);
    if (!group) throw new Error(`Missing Containment Room ${roomId} lighting rig.`);
    return group;
  }

  private applyRoomVisibility(): void {
    const weights = containmentRoomLightWeights(this.activeRoomIdValue, this.traversalPosition);
    for (const [roomId, group] of this.roomGroups) {
      const weight = weights.get(roomId) ?? 0;
      group.visible = weight > 0;
      group.traverse(object => {
        if (!(object instanceof THREE.Light)) return;
        object.intensity = (this.authoredIntensities.get(object) ?? object.intensity) * weight;
      });
    }
  }

  private setAuthoredIntensity(light: THREE.Light, intensity: number): void {
    this.authoredIntensities.set(light, intensity);
    light.intensity = intensity;
  }

  private get bobReflectionTarget(): {
    readonly body: number;
    readonly eyes: number;
  } {
    return this.bobInDarkDuct
      ? BOB_DUCT_REFLECTION
      : BOB_ROOM_REFLECTIONS[this.activeRoomIdValue];
  }

  private applyBobReflectionTarget(snap = false): void {
    const target = this.bobReflectionTarget;
    this.bob.setReflectionIntensity(target.body, target.eyes, snap);
  }

  private applyBobHatchState(): void {
    const state = this.bobHatchStateValue;
    const fixtureIntensity = state === 'establishing' ? 52 : 58;
    for (const light of this.roomOneFixtureLights) this.setAuthoredIntensity(light, fixtureIntensity);

    if (state === 'establishing') {
      this.setAuthoredIntensity(this.roomOnePedestalKey, 78);
    } else if (state === 'emergence') {
      this.setAuthoredIntensity(this.roomOnePedestalKey, 92);
    } else if (state === 'impact') {
      this.setAuthoredIntensity(this.roomOnePedestalKey, 110);
    } else {
      this.setAuthoredIntensity(this.roomOnePedestalKey, 62);
    }
    this.applyRoomVisibility();
  }

  private setGoopReleaseState(state: GoopReleaseLightingState): boolean {
    if (this.goopReleaseStateValue === state) return false;
    this.goopReleaseStateValue = state;
    this.invalidateShadowMaps();
    this.goopStateElapsedSeconds = 0;
    if (state === 'opening') {
      this.goopReleaseEffect.start([0, 75.75, 110]);
    } else if (state === 'normal' || state === 'released') {
      this.goopReleaseEffect.reset();
    }
    this.applyGoopReleaseState();
    return true;
  }

  private applyGoopReleaseState(): void {
    this.goopStateApplicationCount += 1;
    const state = this.goopReleaseStateValue;
    const pulse = 0.58 + Math.sin(this.goopStateElapsedSeconds * Math.PI * 3) ** 2 * 0.42;
    let chamberColour = ACID_COLOUR;
    let chamberIntensity = 62;
    let revealIntensity = 0;
    let lockColour = 0x65b9bf;
    let lockIntensity = 0.65;

    if (state === 'warning') {
      chamberColour = ALARM_COLOUR;
      chamberIntensity = 95 * pulse;
      lockColour = ALARM_COLOUR;
      lockIntensity = 2.8 * pulse;
    } else if (state === 'locks-disengaging') {
      chamberColour = ORANGE_COLOUR;
      chamberIntensity = 82;
      revealIntensity = 24;
      lockColour = AMBER_COLOUR;
      lockIntensity = 2.7;
    } else if (state === 'opening') {
      chamberColour = 0xc0a23a;
      chamberIntensity = 70;
      revealIntensity = 78;
      lockColour = ARRIVAL_GREEN_COLOUR;
      lockIntensity = 2.1;
    } else if (state === 'reveal') {
      chamberColour = RELEASE_GREEN_COLOUR;
      chamberIntensity = 92;
      revealIntensity = 150;
      lockColour = ARRIVAL_GREEN_COLOUR;
      lockIntensity = 1.8;
    } else if (state === 'released') {
      chamberColour = 0x85d94b;
      chamberIntensity = 68;
      revealIntensity = 95;
      lockColour = 0x4fbe7d;
      lockIntensity = 0.9;
    }

    this.roomFiveChamberLight.color.setHex(chamberColour);
    this.setAuthoredIntensity(this.roomFiveChamberLight, chamberIntensity);
    this.roomFiveRevealLight.color.setHex(RELEASE_GREEN_COLOUR);
    this.setAuthoredIntensity(this.roomFiveRevealLight, revealIntensity);
    this.lockEmitterMaterial.color.setHex(lockColour);
    this.lockEmitterMaterial.emissive.setHex(lockColour);
    this.lockEmitterMaterial.emissiveIntensity = lockIntensity;
    this.applyRoomVisibility();
  }

  private syncElevatorLighting(force = false): void {
    const state = this.roomFour.elevator.state;
    const progress = this.roomFour.elevator.ascentProgress;
    const stateElapsedSeconds = this.roomFour.elevator.stateElapsedSeconds;
    if (!force && state === this.lastElevatorState) {
      if (state === 'warning') {
        if (stateElapsedSeconds === this.lastElevatorStateElapsedSeconds) return;
      } else if (state === 'ascending') {
        if (progress === this.lastElevatorProgress) return;
      } else {
        return;
      }
    }
    this.lastElevatorState = state;
    this.lastElevatorProgress = progress;
    this.lastElevatorStateElapsedSeconds = stateElapsedSeconds;
    this.elevatorStateApplicationCount += 1;
    const warningPulse =
      0.55 +
      Math.sin(stateElapsedSeconds * Math.PI * 3) ** 2 *
        0.45;
    let lower = 7;
    let middle = 4;
    let upper = 4;
    let upperColour = 0x8aa7b2;

    if (state === 'warning') {
      lower = 22 * warningPulse;
      middle = 7 * warningPulse;
    } else if (state === 'ascending') {
      lower = 8 + (1 - progress) * 9;
      middle = 9 + Math.sin(progress * Math.PI) * 16;
      upper = 5 + progress * 8;
      upperColour = ORANGE_COLOUR;
    } else if (state === 'arrivalPause') {
      lower = 4;
      middle = 5;
      upper = 25;
      upperColour = ARRIVAL_GREEN_COLOUR;
    } else if (state === 'exitReady') {
      lower = 3;
      middle = 3;
      upper = 14;
      upperColour = ARRIVAL_GREEN_COLOUR;
    }

    const intensities = [lower, middle, upper] as const;
    const colours = [AMBER_COLOUR, ORANGE_COLOUR, upperColour] as const;
    for (let index = 0; index < this.roomFourZoneLights.length; index += 1) {
      const light = this.roomFourZoneLights[index];
      light.color.setHex(colours[index]);
      this.setAuthoredIntensity(light, intensities[index]);
      const material = this.shaftEmitterMaterials[index];
      material.color.setHex(colours[index]);
      material.emissive.setHex(colours[index]);
      material.emissiveIntensity = Math.max(0.25, intensities[index] * 0.09);
    }
    this.applyRoomVisibility();
  }

  private buildShaftFixtures(parent: THREE.Group): void {
    const zones = [
      { material: this.shaftEmitterMaterials[0], yValues: [34, 41] },
      { material: this.shaftEmitterMaterials[1], yValues: [49, 57, 65] },
      { material: this.shaftEmitterMaterials[2], yValues: [72, 77] },
    ] as const;
    for (const [zoneIndex, zone] of zones.entries()) {
      for (const [fixtureIndex, y] of zone.yValues.entries()) {
        parent.add(
          this.fixture(
            `room-4-shaft-zone-${zoneIndex + 1}-fixture-${fixtureIndex + 1}`,
            [3.05, y, 85.5],
            [0.08, 1.3, 0.34],
            zone.material,
          ),
        );
      }
    }
  }

  private attachContainmentLockFixtures(): void {
    for (const [panelName, pivot] of Object.entries(this.roomFive.art.panelPivots)) {
      const fixture = this.fixture(
        `room-5-containment-${panelName}-lock-status`,
        [0, 0.9, 0],
        [0.34, 0.18, 0.2],
        this.lockEmitterMaterial,
      );
      fixture.userData.cutsceneOwnedBy = 'containment-lighting';
      pivot.add(fixture);
      this.attachedPanelFixtures.push(fixture);
    }
  }

  private authorShadowIntent(roomOneArt: RoomOneArt): void {
    const castRoots = [
      roomOneArt.pedestalDressing,
      roomOneArt.containmentBoxRoot,
      this.roomFour.elevatorPlatform.root,
      this.roomFive.art.containmentAssembly,
    ];
    for (const root of castRoots) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some((material) => material.transparent || !material.visible)) return;
        if (/glass|debris|sparkle|vapour/i.test(object.name)) return;
        if (root !== roomOneArt.pedestalDressing && root !== roomOneArt.containmentBoxRoot && /pane/i.test(object.name)) return;
        object.castShadow = true;
        if (root === roomOneArt.pedestalDressing || root === roomOneArt.containmentBoxRoot) {
          object.receiveShadow = true;
        }
        object.userData.shadowIntent = 'selected-major-caster';
      });
    }

    this.levelRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!/floor|platform|tread|load-deck/i.test(object.name)) return;
      if (/collision-only/i.test(object.material.name)) return;
      object.receiveShadow = true;
      object.userData.shadowIntent = 'selected-major-receiver';
    });
  }

  /** Select opaque Room 1 wall batches after batching, preserving measured owner names. */
  configureRoomOneShadowReceivers(roomOneArt: RoomOneArt): void {
    roomOneArt.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const names: string[] = object.userData.staticBatchSourceNames ?? [object.name];
      if (!names.some((name) => name.startsWith('room-1-panel-'))) return;
      object.receiveShadow = true;
    });
  }

  private fixture(
    name: string,
    position: readonly [number, number, number],
    size: readonly [number, number, number],
    emitterMaterial: THREE.Material,
  ): THREE.Group {
    const root = new THREE.Group();
    root.name = name;
    root.position.set(...position);
    root.userData.presentationOnly = true;
    root.userData.visualOnly = true;
    root.userData.visibleLightSource = true;

    const housing = new THREE.Mesh(this.unitBox, this.fixtureHousingMaterial);
    housing.name = `${name}-housing`;
    housing.userData.presentationOnly = true;
    housing.userData.visualOnly = true;
    housing.scale.set(size[0] + 0.12, size[1] + 0.12, size[2] + 0.1);
    const lens = new THREE.Mesh(this.unitBox, emitterMaterial);
    lens.name = `${name}-emissive-lens`;
    lens.userData.presentationOnly = true;
    lens.userData.visualOnly = true;
    lens.scale.set(...size);
    lens.position.z = size[2] * 0.32;
    root.add(housing, lens);
    return root;
  }

  private point(
    name: string,
    position: readonly [number, number, number],
    colour: number,
    intensity: number,
    distance: number,
  ): THREE.PointLight {
    const light = new THREE.PointLight(colour, intensity, distance, 2);
    light.name = name;
    light.position.set(...position);
    light.castShadow = false;
    light.userData.presentationOnly = true;
    light.userData.authoredFixtureSource = true;
    return light;
  }

  /** Broad downward fixture cone retains existing colour, distance and intensity.
   * One depth pass replaces the six cubemap faces a ceiling point would need.
   */
  private downlight(
    name: string,
    position: readonly [number, number, number],
    colour: number,
    intensity: number,
    distance: number,
  ): THREE.SpotLight {
    const light = this.spot(name, position,
      CONTAINMENT_FIXTURE_AIMS[name] ?? [position[0], position[1] - 1, position[2]],
      intensity, distance, 1.0, 0.18, colour);
    // Targets remain owned by the rig, independent of moving assemblies.
    this.root.add(light.target);
    return light;
  }

  private spot(
    name: string,
    position: readonly [number, number, number],
    target: readonly [number, number, number],
    intensity: number,
    distance: number,
    angle: number,
    penumbra: number,
    colour: number,
  ): THREE.SpotLight {
    const light = new THREE.SpotLight(
      colour,
      intensity,
      distance,
      angle,
      penumbra,
      2,
    );
    light.name = name;
    light.position.set(...position);
    light.target.name = `${name}-target`;
    light.target.position.set(...target);
    light.castShadow = false;
    light.userData.presentationOnly = true;
    light.userData.authoredFixtureSource = true;
    return light;
  }

  private emissiveMaterial(
    name: string,
    colour: number,
    intensity: number,
  ): THREE.MeshStandardMaterial {
    return this.material(
      new THREE.MeshStandardMaterial({
        name,
        color: colour,
        emissive: colour,
        emissiveIntensity: intensity,
        roughness: 0.38,
        metalness: 0.08,
      }),
    );
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private material<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }
}

function mapRoomFiveEndingState(
  state: RoomFiveEndingState,
  progress: number,
): GoopReleaseLightingState {
  if (state === 'traversal') return 'normal';
  if (state === 'leverPull') return 'warning';
  if (state === 'released') return 'released';
  if (progress < 0.25) return 'locks-disengaging';
  if (progress < 0.78) return 'opening';
  return 'reveal';
}

function isEffectivelyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}
