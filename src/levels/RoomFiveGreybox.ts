import type { GelRendering } from '../render/slime/GelRendering.ts';
import { GoopCharacterPresentation } from '../render/goop/GoopCharacterPresentation.ts';
import * as THREE from 'three';
import { CONTAINMENT_FINALE_TIMING, sampleContainmentFinale } from '../cinematics/ContainmentFinaleTimeline.ts';

import { LaserHazard } from '../hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../hazards/LaserHazardSystem.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import { RoomFiveArt } from '../render/environment/containment/RoomFiveArt.ts';
import type {RoomFiveShellLoader} from '../render/environment/containment/RoomFiveShell.ts';
import type {AuthoredLaserEmitter} from '../render/hazards/LaserHazardPresentation.ts';
import { RoomFiveGoopSpeech } from '../render/environment/containment/RoomFiveGoopSpeech.ts';
import type { Vector3State } from '../render/slime/SlimePresentationContract.ts';
import { LaserHazardPresentation } from '../render/hazards/LaserHazardPresentation.ts';
import { MovingPlatform } from '../puzzle/MovingPlatform.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';
import { LevelTriggerVolume } from './LevelTriggerVolume.ts';
import { ROOM_FIVE_ESCAPE } from './RoomFiveEscapeLayout.ts';
import { createWoodenVentCoverGeometry } from '../render/environment/containment/WoodenVentCover.ts';

export const ROOM_5_ENTRY_CHECKPOINT_POSITION = new THREE.Vector3(9, 75.21, 94);
export const ROOM_5_ENTRY_CHECKPOINT_ID = 'containment-room-5-entry';
export const ROOM_5_PUZZLE_GROUP_ID = 'containment-room-5';

/** Simple solid shapes for the authored furnishings, leaving the button's
 * centre aisle and the cinematic escape route clear. */
export const ROOM_FIVE_SOLID_PROPS = [
  {name:'operator-worktop',size:[1.3,.14,2.5],position:[-12.85,98.37,129.1]},
  {name:'operator-pedestal',size:[.7,.75,.7],position:[-12.85,97.93,129.1]},
  {name:'operator-monitor',size:[.16,.72,.92],position:[-13.36,98.89,129.1]},
  {name:'operator-monitor-stand',size:[.10,.12,.15],position:[-13.36,98.50,129.1]},
  {name:'operator-keyboard',size:[.34,.025,.7],position:[-12.7,98.465,129.1]},
  {name:'operator-chair-seat',size:[.55,.10,.62],position:[-11.95,98.02,129.1]},
  {name:'operator-chair-back',size:[.10,.62,.60],position:[-11.67,98.33,129.1]},
  {name:'operator-chair-pedestal',size:[.13,.42,.13],position:[-11.95,97.76,129.1]},
  {name:'equipment-cabinet',size:[.55,1.8,1.3],position:[-6.5,98.43,130.8]},
  {name:'release-console',size:[2.1,1.65,.30],position:[-10,98.45,131.48]},
  {name:'cell-service-unit-a',size:[.58,1.45,1.25],position:[3.25,75.475,109]},
  {name:'cell-service-unit-b',size:[.58,1.45,1.25],position:[3.25,75.475,111.3]},
  {name:'escape-sleeve-left',size:[.33,1.8,.92],position:[-1.065,75.65,124.84]},
  {name:'escape-sleeve-right',size:[.33,1.8,.92],position:[1.065,75.65,124.84]},
  {name:'escape-sleeve-top',size:[1.8,.15,.92],position:[0,76.475,124.84]},
] as const;

export type RoomFiveEndingState =
  | 'traversal'
  | 'buttonPress'
  | 'containmentFailure'
  | 'finale'
  | 'released';

export interface RoomFiveHazardFailure {
  readonly roomId: 'room-5';
  readonly hazardId: string;
}

const BUTTON_PRESS_SECONDS = 1;
export const ROOM_FIVE_RELEASE_BUTTON = Object.freeze({
  position: [-10, 98.45, 131.14] as const,
  size: [1.05, 1.05, .24] as const,
  travel: .085,
});
const CONTAINMENT_FAILURE_SECONDS = 4.5;
const STICKY_WALL_THICKNESS_METRES = 0.022;
const MODERATE_LASER_PERIOD_SECONDS = 5;
const MOVING_PLATFORM_TRAVEL_DURATION_SECONDS = 3.2;
const LASER_FIVE_TO_SEVEN_DISTANCE_METRES = 5.545;
const MOTION_OFFSET_EPSILON_METRES = 1e-12;

interface RoomFiveLaserMotionDefinition {
  readonly id: string;
  readonly axis: readonly [number, number, number];
  readonly amplitudeMetres: number;
  readonly centreOffsetMetres: number;
  readonly phaseRadians: number;
  readonly periodSeconds: number;
}

interface RoomFiveLaserMotion {
  readonly hazard: LaserHazard;
  readonly definition: RoomFiveLaserMotionDefinition;
}

const ROOM_FIVE_LASER_MOTIONS: readonly RoomFiveLaserMotionDefinition[] = [
  { id: 'room-5-laser-1', axis: [0, 1, 0], amplitudeMetres: 2.25, centreOffsetMetres: 0, phaseRadians: 0, periodSeconds: MODERATE_LASER_PERIOD_SECONDS },
  { id: 'room-5-laser-2', axis: [0, 1, 0], amplitudeMetres: 2, centreOffsetMetres: 0, phaseRadians: Math.PI, periodSeconds: MODERATE_LASER_PERIOD_SECONDS },
  { id: 'room-5-laser-3', axis: [0, 1, 0], amplitudeMetres: 2.1, centreOffsetMetres: 0, phaseRadians: 0, periodSeconds: MODERATE_LASER_PERIOD_SECONDS },
  { id: 'room-5-laser-4', axis: [0, 1, 0], amplitudeMetres: 2.1, centreOffsetMetres: 0, phaseRadians: Math.PI, periodSeconds: MODERATE_LASER_PERIOD_SECONDS },
  {
    id: 'room-5-laser-5',
    axis: [0, 0, 1],
    amplitudeMetres: LASER_FIVE_TO_SEVEN_DISTANCE_METRES * 0.5,
    centreOffsetMetres: LASER_FIVE_TO_SEVEN_DISTANCE_METRES * 0.5,
    phaseRadians: -Math.PI * 0.5,
    periodSeconds: MODERATE_LASER_PERIOD_SECONDS,
  },
  {
    id: 'room-5-laser-7',
    axis: [0, 0, 1],
    amplitudeMetres: LASER_FIVE_TO_SEVEN_DISTANCE_METRES * 0.5,
    centreOffsetMetres: -LASER_FIVE_TO_SEVEN_DISTANCE_METRES * 0.5,
    phaseRadians: Math.PI * 0.5,
    periodSeconds: MODERATE_LASER_PERIOD_SECONDS,
  },
  { id: 'room-5-laser-8', axis: [0, 1, 0], amplitudeMetres: 3.25, centreOffsetMetres: 0, phaseRadians: 0, periodSeconds: MODERATE_LASER_PERIOD_SECONDS },
];

/** Room 5's mastery route and authoritative, fixed-clock Goop rescue finale. */
export class RoomFiveGreybox {
  readonly builder = new GreyboxRoomBuilder('containment-room-5-greybox');
  readonly root = this.builder.root;
  readonly collisionMeshes = this.builder.collisionMeshes;
  readonly movingPlatformOne = new MovingPlatform({
    id: 'room-5-moving-platform-1',
    start: new THREE.Vector3(2.136, 82.374, 100.384),
    end: new THREE.Vector3(10.082, 82.374, 100.384),
    size: new THREE.Vector3(1.849, 0.523, 2.091),
    travelDurationSeconds: MOVING_PLATFORM_TRAVEL_DURATION_SECONDS,
    initialProgress: 0.5,
    initialTarget: 'end',
  });
  readonly movingPlatformTwo = new MovingPlatform({
    id: 'room-5-moving-platform-2',
    start: new THREE.Vector3(15.109, 82.374, 100.384),
    end: new THREE.Vector3(15.109, 82.374, 107.234),
    size: new THREE.Vector3(1.849, 0.523, 2.091),
    travelDurationSeconds: MOVING_PLATFORM_TRAVEL_DURATION_SECONDS,
    initialTarget: 'end',
  });
  readonly goopWoodenDoor: THREE.Mesh;
  readonly releaseButtonName = 'room-5-observation-release-button';
  readonly releaseButton: THREE.Mesh;
  readonly entryCheckpointTrigger = new LevelTriggerVolume({
    id: 'room-5-entry-checkpoint-trigger',
    centre: new THREE.Vector3(9, 76, 93.5),
    size: new THREE.Vector3(4, 3, 3),
  });
  readonly observationTrigger = new LevelTriggerVolume({
    id: 'room-5-observation-room-trigger',
    centre: new THREE.Vector3(-10, 99.3, 128.8),
    size: new THREE.Vector3(7, 3.6, 5.5),
  });
  readonly failureVolume = new LevelTriggerVolume({
    id: 'room-5-fall-failure',
    // Begin at the Room 5 floor/front wall (Z=91.5), keeping the original
    // back boundary at Z=128. The old Z=89 edge reached into the rising lift.
    centre: new THREE.Vector3(0, 68, 109.75),
    size: new THREE.Vector3(44, 12, 36.5),
  });
  readonly lasers: LaserHazardSystem;
  readonly art: RoomFiveArt;

  private readonly laserPresentation: LaserHazardPresentation;
  private readonly movingPlatforms = [
    this.movingPlatformOne,
    this.movingPlatformTwo,
  ] as const;
  private readonly laserMotions: readonly RoomFiveLaserMotion[];
  private readonly laserTranslationOffset = new THREE.Vector3();
  private readonly releaseButtonCap: THREE.Mesh;
  private readonly buttonContactPoint = new THREE.Vector3();
  readonly goopPresentation: GoopCharacterPresentation;
  readonly goopSpeech = new RoomFiveGoopSpeech();
  private readonly containedGoopPosition = new THREE.Vector3(0, 76.546, 110);
  private readonly goopPresentationState = {
    locomotionPositionWorld: new THREE.Vector3(),
    velocityWorld: new THREE.Vector3(),
    maximumLocomotionSpeedMetresPerSecond: 5.5,
    movementIntentWorld: new THREE.Vector3(),
    // The capsule supports the resting pose; release motion is scripted.
    grounded: true,
  };
  private endingStateValue: RoomFiveEndingState = 'traversal';
  private endingElapsedSeconds = 0;
  private traversalElapsedSeconds = 0;

  constructor(
    requestFailure: (failure: RoomFiveHazardFailure) => void,
    artResources: ContainmentArtResources,
    gelRendering?: GelRendering,
  ) {
    this.goopPresentation = new GoopCharacterPresentation(undefined, gelRendering);
    this.goopWoodenDoor = this.buildShell();
    const solubleDoorMaterial = artResources.materials.solubleComposite.clone();
    solubleDoorMaterial.name = 'room-5-soluble-biological-composite-source';
    solubleDoorMaterial.color.setHex(0x927651);
    solubleDoorMaterial.emissive.setHex(0x121408);
    solubleDoorMaterial.emissiveIntensity = 0.1;
    solubleDoorMaterial.roughness = 0.82;
    solubleDoorMaterial.normalScale.set(0.25, 0.25);
    this.goopWoodenDoor.material = solubleDoorMaterial;
    this.buildTraversal();
    const endingObjects = this.buildContainmentAndObservationRoom();
    this.releaseButton = endingObjects.button;
    this.releaseButtonCap = endingObjects.cap;
    this.root.add(this.goopPresentation.root, this.goopSpeech.root);
    const buttonMaterial = artResources.materials.warningStatus.clone();
    buttonMaterial.name = 'room-5-release-button-cap';
    buttonMaterial.color.setHex(0x4ccee1);
    buttonMaterial.emissive.setHex(0x126477);
    buttonMaterial.emissiveIntensity = .4;
    this.releaseButtonCap.material = buttonMaterial;
    const hazards = this.createHazards();
    this.laserMotions = ROOM_FIVE_LASER_MOTIONS.map((definition) => {
      const hazard = hazards.find((candidate) => candidate.id === definition.id);
      if (!hazard) {
        throw new Error(`Missing Room 5 moving laser "${definition.id}".`);
      }
      return { hazard, definition };
    });
    this.lasers = new LaserHazardSystem({
      id: 'room-5-lasers',
      hazards,
      requestRecovery: (hazard) =>
        requestFailure({ roomId: 'room-5', hazardId: hazard.id }),
    });
    this.laserPresentation = new LaserHazardPresentation(hazards);
    this.art = new RoomFiveArt(
      artResources,
      hazards,
      [this.movingPlatformOne, this.movingPlatformTwo],
    );
    this.releaseButtonCap.add(this.art.shell.button);
    for(const prop of ROOM_FIVE_SOLID_PROPS){
      const collider=this.builder.addCollider({name:`room-5-prop-${prop.name}`,size:prop.size,position:prop.position,
        material:this.builder.materials.wall});
      collider.userData.solidProp=true;
    }
    this.hideGameplayColliders();
    this.root.add(this.lasers.root, this.laserPresentation.root, this.art.root);
    this.resetEndingPresentation();
  }

  async prepareArt(borrowFinish:(name:string)=>THREE.Material,kit:AuthoredLaserEmitter,loader?:RoomFiveShellLoader):Promise<void>{
    await this.art.prepare(borrowFinish,loader);
    this.art.shell.attachLasers(this.laserPresentation,kit);
    (this.releaseButtonCap.material as THREE.Material).visible=false;
  }

  get renderSources():readonly THREE.Object3D[]{
    return [this.art.root,...this.art.movingPlatformDressings,this.laserPresentation.root,this.releaseButtonCap,
      this.goopWoodenDoor,this.goopSpeech.root];
  }

  get endingState(): RoomFiveEndingState {
    return this.endingStateValue;
  }

  get releaseComplete(): boolean {
    return this.endingStateValue === 'released';
  }

  get endingSeconds(): number { return this.endingElapsedSeconds; }

  /** Keep the legacy dissolve/checkpoint identity; this is now a wooden vent cover. */
  get goopVentCover(): THREE.Mesh { return this.goopWoodenDoor; }

  /** Scripted world position; the presentation root itself stays at the origin. */
  get goopReleasePosition(): THREE.Vector3 {
    return this.containedGoopPosition.clone();
  }

  updatePresentation(deltaSeconds: number, activePosition?: Vector3State): void {
    // Release translation belongs to the ending sequence, not locomotion.
    this.goopPresentation.update(deltaSeconds, this.goopPresentationState);
    this.goopPresentation.present();
    this.goopSpeech.update(deltaSeconds, activePosition, this.endingStateValue === 'traversal');
  }

  /** Normalized progress inside the current authoritative ending phase. */
  get endingProgress(): number {
    if (this.endingStateValue === 'buttonPress') {
      return THREE.MathUtils.clamp(
        this.endingElapsedSeconds / BUTTON_PRESS_SECONDS,
        0,
        1,
      );
    }
    if (this.endingStateValue === 'containmentFailure') {
      return THREE.MathUtils.clamp(
        (this.endingElapsedSeconds - BUTTON_PRESS_SECONDS) / CONTAINMENT_FAILURE_SECONDS,
        0,
        1,
      );
    }
    return this.endingStateValue === 'released' || this.endingStateValue === 'finale' ? 1 : 0;
  }

  updateEntryTrigger(body: KinematicBody): void {
    this.entryCheckpointTrigger.update(body);
  }

  updateFailureTrigger(body: KinematicBody): void {
    this.failureVolume.update(body);
  }

  /** A normal contact button: no sticky attachment or extra key is needed. */
  isReleaseButtonPressed(body: Pick<KinematicBody, 'position' | 'radiusMetres'>): boolean {
    const { position: p, size } = ROOM_FIVE_RELEASE_BUTTON;
    if (body.position.z > p[2] || !(body.radiusMetres > 0)) return false;
    this.buttonContactPoint.set(
      THREE.MathUtils.clamp(body.position.x, p[0]-size[0]/2, p[0]+size[0]/2),
      THREE.MathUtils.clamp(body.position.y, p[1]-size[1]/2, p[1]+size[1]/2),
      THREE.MathUtils.clamp(body.position.z, p[2]-size[2]/2, p[2]+size[2]/2),
    );
    return this.buttonContactPoint.distanceToSquared(body.position) <= (body.radiusMetres + .04) ** 2;
  }

  setReleaseButtonProgress(progress: number): void {
    // Move only the visual cap. The registered static collider never changes.
    this.releaseButtonCap.position.z = 131.035 + ROOM_FIVE_RELEASE_BUTTON.travel * THREE.MathUtils.clamp(progress,0,1);
  }

  updateTraversal(
    deltaSeconds: number,
    body: KinematicBody,
    persistentBodies: readonly KinematicBody[],
  ): void {
    if (this.endingStateValue !== 'traversal') return;
    this.updateMovingPlatforms(deltaSeconds, persistentBodies);
    this.updateLaserMotions(deltaSeconds);
    this.lasers.update(deltaSeconds, body);
    this.laserPresentation.sync();
    this.observationTrigger.update(body);
  }

  beginEnding(): boolean {
    if (this.endingStateValue !== 'traversal') return false;
    this.endingStateValue = 'buttonPress';
    this.endingElapsedSeconds = 0;
    for (const hazard of this.lasers.hazards) hazard.setCircuitGateEnabled(false);
    this.laserPresentation.sync();
    this.goopSpeech.root.visible = false;
    return true;
  }

  /** The fixed simulation clock owns the whole finale, including pause/skip. */
  updateEnding(deltaSeconds: number): boolean {
    if (this.endingStateValue === 'traversal' || this.endingStateValue === 'released') {
      return false;
    }

    this.endingElapsedSeconds = Math.min(CONTAINMENT_FINALE_TIMING.end,
      this.endingElapsedSeconds + Math.max(0, deltaSeconds));
    this.setReleaseButtonProgress(Math.min(1,this.endingElapsedSeconds / .25));
    this.endingStateValue = this.endingElapsedSeconds < BUTTON_PRESS_SECONDS ? 'buttonPress'
      : this.endingElapsedSeconds < 5.5 ? 'containmentFailure' : 'finale';
    const frame = sampleContainmentFinale(this.endingElapsedSeconds);
    this.containedGoopPosition.fromArray(frame.goop);
    this.art.setReleaseProgress(frame.panelOpen);
    if (this.endingElapsedSeconds < CONTAINMENT_FINALE_TIMING.end) return false;
    this.finishEnding();
    return true;
  }

  /** Same endpoint for normal playback and a user-requested skip. */
  finishEnding(): void {
    this.endingElapsedSeconds = CONTAINMENT_FINALE_TIMING.end;
    this.endingStateValue = 'released';
    this.setReleaseButtonProgress(1);
    this.containedGoopPosition.fromArray(sampleContainmentFinale(CONTAINMENT_FINALE_TIMING.end).goop);
    this.art.setReleaseProgress(1);
    this.goopPresentation.setVisible(false);
  }

  reset(): void {
    this.traversalElapsedSeconds = 0;
    for (const platform of this.movingPlatforms) platform.reset();
    this.lasers.reset();
    this.applyLaserMotions();
    this.entryCheckpointTrigger.reset();
    this.observationTrigger.reset();
    this.failureVolume.reset();
    this.laserPresentation.sync();
    this.art.reset();
    this.resetEndingPresentation();
    // Room resets are checkpoint-local; the full scene restart clears speech memory.
    this.goopSpeech.resetForCheckpointRecovery();
  }

  dispose(): void {
    this.entryCheckpointTrigger.dispose();
    this.observationTrigger.dispose();
    this.failureVolume.dispose();
    this.art.dispose();
    this.laserPresentation.dispose();
    this.lasers.dispose();
    for (const platform of this.movingPlatforms) platform.dispose();
    this.goopPresentation.dispose();
    this.goopSpeech.dispose();
    this.builder.dispose();
  }

  private updateMovingPlatforms(
    deltaSeconds: number,
    persistentBodies: readonly KinematicBody[],
  ): void {
    for (const platform of this.movingPlatforms) {
      platform.update(deltaSeconds);

      if (platform.displacement.lengthSq() > 0) {
        for (const body of persistentBodies) {
          if (!body.isSupportedBy(platform.collisionMesh)) continue;
          body.applyCarrierDisplacement(
            platform.displacement,
            platform.collisionMesh,
          );
        }
      }

      if (platform.isAtEnd) platform.setActive(false);
      else if (platform.isAtStart) platform.setActive(true);
    }
  }

  private updateLaserMotions(deltaSeconds: number): void {
    this.traversalElapsedSeconds += deltaSeconds;
    this.applyLaserMotions();
  }

  private applyLaserMotions(): void {
    for (const { hazard, definition } of this.laserMotions) {
      const angle =
        definition.phaseRadians +
        (this.traversalElapsedSeconds / definition.periodSeconds) *
          Math.PI *
          2;
      const calculatedOffsetMetres =
        definition.centreOffsetMetres +
        Math.sin(angle) * definition.amplitudeMetres;
      const offsetMetres =
        Math.abs(calculatedOffsetMetres) <= MOTION_OFFSET_EPSILON_METRES
          ? 0
          : calculatedOffsetMetres;
      this.laserTranslationOffset
        .set(...definition.axis)
        .multiplyScalar(offsetMetres);
      hazard.setTranslationOffset(this.laserTranslationOffset);
    }
  }

  private buildShell(): THREE.Mesh {
    const { floor, wall, wood } = this.builder.materials;
    this.builder.addCollider({ name: 'room-5-floor', size: [40, 0.4, 34], position: [0, 74.55, 108.5], material: floor });
    this.builder.addCollider({ name: 'room-5-west-wall', size: [0.4, 26, 34], position: [-20, 87.75, 108.5], material: wall });
    this.builder.addCollider({ name: 'room-5-east-wall', size: [0.4, 26, 34], position: [20, 87.75, 108.5], material: wall });
    this.builder.addCollider({ name: 'room-5-ceiling', size: [40, 0.4, 34], position: [0, 100.75, 108.5], material: wall });

    // Front wall opening lines up with Room 4's top exit.
    this.builder.addCollider({ name: 'room-5-front-wall-west', size: [27.5, 26, 0.4], position: [-6.25, 87.75, 91.5], material: wall });
    this.builder.addCollider({ name: 'room-5-front-wall-east', size: [9.5, 26, 0.4], position: [15.25, 87.75, 91.5], material: wall });
    this.builder.addCollider({ name: 'room-5-front-wall-above-entry', size: [3, 22, 0.4], position: [9, 89.75, 91.5], material: wall });

    // Rear wall is split around the high observation-room opening and the
    // floor-level Goop route. The small duct shares the sticky-panel wall plane and
    // uses the containment glass centre as its horizontal reference (x = 0).
    this.builder.addCollider({ name: 'room-5-rear-wall-west', size: [8, 26, 0.4], position: [-16, 87.75, 125.5], material: wall });
    this.builder.addCollider({ name: 'room-5-rear-wall-east-left-of-goop-door', size: [7.1, 26, 0.4], position: [-4.45, 87.75, 125.5], material: wall });
    this.builder.addCollider({ name: 'room-5-rear-wall-east-right-of-goop-door', size: [19.1, 26, 0.4], position: [10.45, 87.75, 125.5], material: wall });
    this.builder.addCollider({ name: 'room-5-rear-wall-above-goop-door', size: [ROOM_FIVE_ESCAPE.ventWidth,24.35,.4], position: [0,88.575,125.5], material: wall });
    this.builder.addCollider({ name: 'room-5-rear-wall-below-observation', size: [4, 22.2, 0.4], position: [-10, 85.85, 125.5], material: wall });

    const goopWoodenDoor = this.builder.addCollider({
      name: 'room-5-goop-wooden-door',
      size: ROOM_FIVE_ESCAPE.coverSize,
      position: ROOM_FIVE_ESCAPE.coverPosition,
      material: wood,
      interactionRole: 'goop-dissolvable',
      textureRole: 'wooden-door',
    });
    goopWoodenDoor.geometry.dispose();
    goopWoodenDoor.geometry=createWoodenVentCoverGeometry();
    goopWoodenDoor.userData.presentationRole='solid-wooden-vent-cover';
    goopWoodenDoor.userData.soluble = true;
    goopWoodenDoor.userData.solubleId = goopWoodenDoor.name;
    goopWoodenDoor.userData.dissolveDurationSeconds = 1.8;
    goopWoodenDoor.userData.dissolveCollisionDisableProgress = 0.72;
    goopWoodenDoor.userData.dissolveActivationRangeMetres = 0.12;

    return goopWoodenDoor;
  }

  private buildTraversal(): void {
    const { platform, support, sticky } = this.builder.materials;

    // Latest Blender-authored Room 5 traversal.
    // Objects deleted in Blender are intentionally not rebuilt here.
    this.builder.addCollider({ name: 'room-5-lower-platform-c', size: [4.5, 0.5, 4], position: [0.084, 76.687, 102.793], material: platform });

    this.builder.addCollider({ name: 'room-5-central-rest-platform', size: [5, 0.5, 4.5], position: [-0.68, 80.832, 115.652], material: platform });
    this.builder.addCollider({ name: 'room-5-containment-route-top', size: [6, 0.5, 6], position: [0, 75.325, 110], material: support });

    this.builder.addCollider({ name: 'room-5-upper-platform-a', size: [1.849, 0.523, 2.091], position: [6.109, 82.374, 110.287], material: platform });
    this.builder.addCollider({ name: 'room-5-upper-platform-a.001', size: [1.849, 0.523, 1.921], position: [6.109, 82.374, 115.657], material: platform });
    this.builder.addCollider({ name: 'room-5-upper-platform-a.003', size: [1.849, 0.523, 2.091], position: [6.109, 82.374, 105.453], material: platform });

    // Blender Empty reference markers (not runtime geometry):
    // room-5-mp1-reference -> [10.082, 82.636, 100.036]
    // room-5-mp2-reference -> [14.976, 82.636, 107.234]
    // Runtime X/Z routes use only the requested axis from each marker.
    this.root.add(this.movingPlatformOne.root, this.movingPlatformTwo.root);
    this.collisionMeshes.push(
      this.movingPlatformOne.collisionMesh,
      this.movingPlatformTwo.collisionMesh,
    );

    // The Blender mesh is an L-shape. Keep it as two ordinary sticky box
    // colliders so the collision system treats every visible section as solid.
    this.builder.addCollider({
      name: 'room-5-east-sticky-ascent',
      size: [STICKY_WALL_THICKNESS_METRES, 18.352, 5.46],
      position: [19.72, 89.5, 107.247],
      material: sticky,
      surfaceTag: 'sticky',
      movementFaceMode: 'vertical-sides',
      textureRole: 'sticky-wall-tile',
    });
    this.builder.addCollider({
      name: 'room-5-east-sticky-ascent-extension',
      size: [STICKY_WALL_THICKNESS_METRES, 3.192, 11.328],
      position: [19.72, 97.068, 115.636],
      material: sticky,
      surfaceTag: 'sticky',
      movementFaceMode: 'vertical-sides',
      textureRole: 'sticky-wall-tile',
    });

    this.builder.addCollider({ name: 'room-5-final-approach-platform', size: [4.5, 0.5, 4], position: [15.436, 93.2, 120], material: platform });

    // Keep the two edge panels and the direct middle panel from the original
    // five-panel route. The wider gaps make the laser traversal less crowded.
    for (const [panelNumber, x] of [[1, 10], [3, 2], [5, -6]] as const) {
      this.builder.addCollider({
        name: `room-5-final-sticky-transfer-${panelNumber}`,
        size: [3, 6.5, STICKY_WALL_THICKNESS_METRES],
        position: [x, 95.2, 125.18],
        material: sticky,
        surfaceTag: 'sticky',
        movementFaceMode: 'vertical-sides',
        textureRole: 'sticky-wall-tile',
      });
    }

    this.builder.addCollider({ name: 'room-5-final-bounce-platform', size: [5, 0.5, 4], position: [-9.5, 95.5, 121.5], material: platform });
  }

  private buildContainmentAndObservationRoom(): {
    readonly button: THREE.Mesh; readonly cap: THREE.Mesh;
  } {
    const { glass, floor, wall } = this.builder.materials;

    // Latest Blender scene keeps the containment glass and Etch but removes
    // the old frame and sliding-door meshes.
    // The transparent enclosure is also a solid traversal object: Bob can
    // land and jump on its roof, while its sides remain ordinary blockers.
    this.builder.addCollider({ name: 'room-5-containment-glass', size: [5.1, 3.2, 4.5], position: [0, 77.075, 110], material: glass });

    // Observation room remains unchanged in the Blender-authored scene.
    this.builder.addCollider({ name: 'room-5-observation-floor', size: [8, 0.4, 7], position: [-10, 97.3, 129], material: floor });
    this.builder.addCollider({ name: 'room-5-observation-roof', size: [8, 0.3, 7], position: [-10, 104.2, 129], material: wall });
    this.builder.addCollider({ name: 'room-5-observation-west-wall', size: [0.3, 7, 7], position: [-14, 100.75, 129], material: wall });
    this.builder.addCollider({ name: 'room-5-observation-east-wall', size: [0.3, 7, 7], position: [-6, 100.75, 129], material: wall });
    this.builder.addCollider({ name: 'room-5-observation-back-wall', size: [8, 7, 0.3], position: [-10, 100.75, 132.5], material: wall });
    this.builder.addVisualBox({ name: 'room-5-observation-window-left', size: [1.7, 3, 0.12], position: [-13.05, 99.2, 125.32], material: glass });
    this.builder.addVisualBox({ name: 'room-5-observation-window-right', size: [1.7, 3, 0.12], position: [-6.95, 99.2, 125.32], material: glass });

    const button = this.builder.addCollider({
      name: this.releaseButtonName,
      size: ROOM_FIVE_RELEASE_BUTTON.size,
      position: ROOM_FIVE_RELEASE_BUTTON.position,
      material: wall,
    });
    button.userData.interactionRole = 'goop-release-button';
    const cap = this.builder.addVisualBox({name:'room-5-observation-release-button-cap',
      size:[.92,.92,.16],position:[-10,98.45,131.035],material:wall});
    cap.geometry.dispose();cap.geometry = new THREE.CylinderGeometry(.46,.46,.16,24);
    cap.rotation.x = Math.PI / 2;
    cap.userData.presentationOwnedBy = 'room-5-release-button';
    return { button, cap };
  }

  private hideGameplayColliders(): void {
    for (const [role, material] of Object.entries(this.builder.materials)) {
      material.name = `containment-room-5-${role}-collision-only`;
      material.visible = false;
    }
    (this.goopWoodenDoor.material as THREE.Material).visible = true;
    for (const platform of this.movingPlatforms) {
      platform.collisionMesh.material.name =
        `${platform.collisionMesh.name}-collision-only`;
      platform.collisionMesh.material.visible = false;
    }
  }


  private resetEndingPresentation(): void {
    this.endingStateValue = 'traversal';
    this.endingElapsedSeconds = 0;
    this.setReleaseButtonProgress(0);
    this.containedGoopPosition.set(0, 76.546, 110);
    this.goopPresentation.reset();
    this.goopPresentation.setPosition(this.containedGoopPosition);
    this.goopSpeech.root.visible = true;
  }

  private createHazards(): readonly LaserHazard[] {
    return [
      new LaserHazard({
        id: 'room-5-laser-1',
        start: new THREE.Vector3(2.778, 82.84, 111.277),
        end: new THREE.Vector3(2.54, 83.031, 120.272),
      }),
      new LaserHazard({
        id: 'room-5-laser-2',
        start: new THREE.Vector3(2.912, 83.002, 102.872),
        end: new THREE.Vector3(9.312, 83.003, 102.873),
      }),
      new LaserHazard({
        id: 'room-5-laser-3',
        start: new THREE.Vector3(19.623, 85.217, 102.893),
        end: new THREE.Vector3(19.385, 85.407, 111.888),
      }),
      new LaserHazard({
        id: 'room-5-laser-4',
        start: new THREE.Vector3(19.623, 90.728, 102.893),
        end: new THREE.Vector3(19.385, 90.918, 111.888),
      }),
      new LaserHazard({
        id: 'room-5-laser-5',
        start: new THREE.Vector3(19.54, 95.323, 111.065),
        end: new THREE.Vector3(19.572, 98.88, 111.188),
      }),
      new LaserHazard({
        id: 'room-5-laser-6',
        start: new THREE.Vector3(19.231, 82.016, 107.44),
        end: new THREE.Vector3(19.263, 99.206, 107.563),
      }),
      new LaserHazard({
        id: 'room-5-laser-7',
        start: new THREE.Vector3(19.071, 95.323, 116.61),
        end: new THREE.Vector3(19.103, 98.88, 116.733),
      }),
      new LaserHazard({
        id: 'room-5-laser-8',
        start: new THREE.Vector3(-4.148, 95.2, 124.701),
        end: new THREE.Vector3(8.369, 95.198, 124.701),
      }),
    ];
  }
}
