import * as THREE from 'three';

import type { ElevatorSequenceState } from '../../../puzzle/ElevatorSequence.ts';
import type { RoomFourGreybox } from '../../../levels/RoomFourGreybox.ts';
import type {
  RoomFiveEndingState,
  RoomFiveGreybox,
} from '../../../levels/RoomFiveGreybox.ts';
import type { RoomOneArt } from './RoomOneArt.ts';
import { ContainmentPointEffect } from './ContainmentPointEffect.ts';

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
  readonly activeParticleCount: number;
  readonly disposed: boolean;
}

export interface ContainmentLightingRigOptions {
  readonly levelRoot: THREE.Object3D;
  readonly roomOneArt: RoomOneArt;
  readonly roomFour: RoomFourGreybox;
  readonly roomFive: RoomFiveGreybox;
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

  private readonly roomOneFixtureLights: readonly THREE.PointLight[];
  private readonly roomOnePedestalKey: THREE.SpotLight;
  private readonly roomOneRimLight: THREE.PointLight;
  private readonly roomFourZoneLights: readonly THREE.PointLight[];
  private readonly roomFiveChamberLight: THREE.PointLight;
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
  private disposed = false;

  constructor(options: ContainmentLightingRigOptions) {
    this.levelRoot = options.levelRoot;
    this.roomFour = options.roomFour;
    this.roomFive = options.roomFive;
    this.root.name = 'containment-authored-lighting-and-effects';
    this.root.userData.presentationOnly = true;

    const ambient = new THREE.HemisphereLight(0xcfe4f4, 0x19211f, 0.78);
    ambient.name = 'containment-cold-clinical-foundation';
    this.root.add(ambient);

    for (const roomId of ROOM_IDS) {
      const group = new THREE.Group();
      group.name = `containment-room-${roomId}-lighting-rig`;
      group.userData.presentationOnly = true;
      this.roomGroups.set(roomId, group);
      this.root.add(group);
    }

    const roomOne = this.room(1);
    this.roomOneFixtureLights = [
      this.point('room-1-fluorescent-a-received-light', [-3.8, 7.45, -1.5], CLINICAL_COLOUR, 58, 13),
      this.point('room-1-fluorescent-b-received-light', [3.8, 7.45, -1.5], CLINICAL_COLOUR, 58, 13),
    ];
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
    this.roomOneRimLight = this.point(
      'room-1-egg-glass-catchlight',
      [0, 2.7, 0.95],
      0x9bd7ff,
      18,
      5.5,
    );
    roomOne.add(this.roomOnePedestalKey, this.roomOnePedestalKey.target, this.roomOneRimLight);

    const ductLight = this.point(
      'room-1-to-2-duct-reflected-cue',
      [-6.6, 11.8, 25.6],
      DUCT_COLOUR,
      24,
      11,
    );
    const ductEntranceSpill = this.point(
      'room-1-to-2-duct-entrance-spill',
      [-4.8, 6.45, 9.2],
      0xb9d9e7,
      9,
      8,
    );
    const ductRampBounce = this.point(
      'room-1-to-2-duct-ramp-reflected-light',
      [-4.8, 7.0, 14.5],
      DUCT_COLOUR,
      6,
      11,
    );
    roomOne.add(ductEntranceSpill, ductRampBounce, ductLight);
    roomOne.add(
      this.fixture(
        'room-1-to-2-duct-exit-fixture',
        [-6.65, 12.38, 25.5],
        [1.15, 0.06, 0.22],
        this.ductEmitterMaterial,
      ),
    );
    roomOne.add(this.bobImpactEffect.points);

    const roomTwo = this.room(2);
    roomTwo.add(
      this.point('room-2-drop-zone-light', [-8, 16.55, 35], CLINICAL_COLOUR, 280, 25),
      this.point('room-2-lower-route-light', [0, 16.55, 39], 0xc9e9f5, 260, 25),
      this.point('room-2-sticky-and-exit-route-light', [8, 16.55, 43], 0xc3e4ee, 280, 25),
    );

    const roomThree = this.room(3);
    roomThree.add(
      this.point('room-3-clinical-entry-received-light', [-6.5, 30, 54], CLINICAL_COLOUR, 250, 30),
      this.point('room-3-industrial-route-received-light', [8, 29, 64], 0xb2cad5, 210, 28),
      this.point('room-3-acid-reflected-light', [0, 7.2, 64], ACID_COLOUR, 75, 18),
      this.point('room-3-high-exit-vent-cue', [9, 32.5, 74.3], 0xb6e4dd, 95, 16),
    );

    const roomFour = this.room(4);
    this.roomFourZoneLights = [
      this.point('room-4-lower-amber-received-light', [9, 33, 85.5], AMBER_COLOUR, 7, 16),
      this.point('room-4-middle-escalation-received-light', [9, 53, 85.5], ORANGE_COLOUR, 4, 19),
      this.point('room-4-upper-arrival-received-light', [9, 74, 88.5], 0x8aa7b2, 4, 17),
    ];
    roomFour.add(...this.roomFourZoneLights);
    this.buildShaftFixtures(roomFour);

    const roomFive = this.room(5);
    roomFive.add(
      this.point('room-5-safe-entry-received-light', [9, 100, 96], CLINICAL_COLOUR, 320, 32),
      this.point('room-5-upper-traversal-received-light', [10, 100, 116], 0xbadbe8, 240, 28),
    );
    this.roomFiveChamberLight = this.point(
      'room-5-containment-state-light',
      [0, 79.8, 110],
      ACID_COLOUR,
      62,
      14,
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
      this.roomFiveRevealLight,
      this.roomFiveRevealLight.target,
      this.roomFiveObservationLight,
      this.roomFiveObservationLight.target,
      this.goopReleaseEffect.points,
    );
    this.attachContainmentLockFixtures();
    this.authorShadowIntent(options.roomOneArt);

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
    return {
      activeRoomId: this.activeRoomIdValue,
      bobHatchState: this.bobHatchStateValue,
      goopReleaseState: this.goopReleaseStateValue,
      goopReleaseManuallyDriven: this.goopReleaseManuallyDriven,
      roomFourElevatorState: this.roomFour.elevator.state,
      authoredLightCount,
      visibleAuthoredLightCount,
      shadowCastingLightCount,
      activeParticleCount:
        this.bobImpactEffect.activeParticleCount +
        this.goopReleaseEffect.activeParticleCount,
      disposed: this.disposed,
    };
  }

  setActiveRoom(roomId: ContainmentLightingRoomId): void {
    if (this.activeRoomIdValue === roomId) return;
    this.activeRoomIdValue = roomId;
    this.applyRoomVisibility();
  }

  /**
   * Visit each room presentation during the hidden loading prewarm.
   * The caller may reuse Room 2's compiled signature for Room 4.
   */
  async prewarmShaderConfigurations(
    compileCurrentConfiguration: (
      roomId: ContainmentLightingRoomId,
    ) => Promise<void>,
  ): Promise<void> {
    const initialRoomId = this.activeRoomIdValue;
    try {
      for (const roomId of PREWARM_ROOM_IDS) {
        this.setActiveRoom(roomId);
        await compileCurrentConfiguration(roomId);
      }
    } finally {
      this.setActiveRoom(initialRoomId);
    }
  }

  setBobHatchLightingState(state: BobHatchLightingState): void {
    if (this.bobHatchStateValue === state) return;
    this.bobHatchStateValue = state;
    if (state === 'impact') {
      this.bobImpactEffect.start([0, 0.62, -0.5]);
    } else if (state === 'gameplay' || state === 'complete') {
      this.bobImpactEffect.reset();
    }
    this.applyBobHatchState();
  }

  finalizeBobHatch(_mode: CutsceneFinalizationMode): void {
    this.bobHatchStateValue = 'complete';
    this.bobImpactEffect.reset();
    this.applyBobHatchState();
  }

  setGoopReleaseLightingState(state: GoopReleaseLightingState): void {
    this.goopReleaseManuallyDriven = true;
    this.setGoopReleaseState(state);
  }

  finalizeGoopRelease(_mode: CutsceneFinalizationMode): void {
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
    this.syncElevatorLighting();
  }

  reset(): void {
    this.activeRoomIdValue = 1;
    this.bobHatchStateValue = 'gameplay';
    this.goopReleaseManuallyDriven = false;
    this.goopReleaseStateValue = 'normal';
    this.goopStateElapsedSeconds = 0;
    this.bobImpactEffect.reset();
    this.goopReleaseEffect.reset();
    this.applyRoomVisibility();
    this.applyBobHatchState();
    this.applyGoopReleaseState();
    this.syncElevatorLighting();
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    this.goopStateElapsedSeconds += deltaSeconds;
    if (!this.goopReleaseManuallyDriven) {
      this.setGoopReleaseState(
        mapRoomFiveEndingState(
          this.roomFive.endingState,
          this.roomFive.endingProgress,
        ),
      );
    }
    this.syncElevatorLighting();
    this.applyGoopReleaseState();
    this.bobImpactEffect.update(deltaSeconds);
    this.goopReleaseEffect.update(deltaSeconds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
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
    for (const [roomId, group] of this.roomGroups) {
      group.visible = roomId === this.activeRoomIdValue;
    }
  }

  private applyBobHatchState(): void {
    const state = this.bobHatchStateValue;
    const fixtureIntensity = state === 'establishing' ? 52 : 58;
    for (const light of this.roomOneFixtureLights) light.intensity = fixtureIntensity;

    if (state === 'establishing') {
      this.roomOnePedestalKey.intensity = 78;
      this.roomOneRimLight.intensity = 26;
    } else if (state === 'emergence') {
      this.roomOnePedestalKey.intensity = 92;
      this.roomOneRimLight.intensity = 34;
    } else if (state === 'impact') {
      this.roomOnePedestalKey.intensity = 110;
      this.roomOneRimLight.intensity = 42;
    } else {
      this.roomOnePedestalKey.intensity = 62;
      this.roomOneRimLight.intensity = 18;
    }
  }

  private setGoopReleaseState(state: GoopReleaseLightingState): void {
    if (this.goopReleaseStateValue === state) return;
    this.goopReleaseStateValue = state;
    this.goopStateElapsedSeconds = 0;
    if (state === 'opening') {
      this.goopReleaseEffect.start([0, 75.75, 110]);
    } else if (state === 'normal' || state === 'released') {
      this.goopReleaseEffect.reset();
    }
    this.applyGoopReleaseState();
  }

  private applyGoopReleaseState(): void {
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
    this.roomFiveChamberLight.intensity = chamberIntensity;
    this.roomFiveRevealLight.color.setHex(RELEASE_GREEN_COLOUR);
    this.roomFiveRevealLight.intensity = revealIntensity;
    this.lockEmitterMaterial.color.setHex(lockColour);
    this.lockEmitterMaterial.emissive.setHex(lockColour);
    this.lockEmitterMaterial.emissiveIntensity = lockIntensity;
  }

  private syncElevatorLighting(): void {
    const state = this.roomFour.elevator.state;
    const progress = this.roomFour.elevator.ascentProgress;
    const warningPulse =
      0.55 +
      Math.sin(this.roomFour.elevator.stateElapsedSeconds * Math.PI * 3) ** 2 *
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
      light.intensity = intensities[index];
      const material = this.shaftEmitterMaterials[index];
      material.color.setHex(colours[index]);
      material.emissive.setHex(colours[index]);
      material.emissiveIntensity = Math.max(0.25, intensities[index] * 0.09);
    }
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
        if (/glass|pane|debris|sparkle|vapour/i.test(object.name)) return;
        object.castShadow = true;
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
