import * as THREE from 'three';

import type {
  SlimeVisualDiagnostics,
  SlimeVisualLaunch,
  SlimeVisualState,
  Vector3State,
} from '../render/slime/SlimeVisual.ts';
import type { SlimeBurstDiagnostics } from '../render/slime/SlimeBurstPresentation.ts';
import { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import {
  consolidateContainmentRoomStaticVisuals,
  type ContainmentStaticBatchDiagnostics,
  type ContainmentStaticBatchResult,
} from '../render/environment/containment/ContainmentStaticBatching.ts';
import {
  ContainmentLightingRig,
  type ContainmentCutsceneLighting,
  type ContainmentLightingDiagnostics,
} from '../render/environment/containment/ContainmentLightingRig.ts';
import { ContainmentTeachingScene } from './ContainmentTeachingScene.ts';
import { RoomFiveGreybox, type RoomFiveHazardFailure } from './RoomFiveGreybox.ts';
import { RoomFourGreybox, type RoomFourHazardFailure } from './RoomFourGreybox.ts';
import { RoomThreeGreybox, type RoomThreeHazardFailure } from './RoomThreeGreybox.ts';

export type ContainmentHazardFailure =
  | RoomThreeHazardFailure
  | RoomFourHazardFailure
  | RoomFiveHazardFailure;

/**
 * Exact first-use geometry owners measured on Intel Iris Xe / ANGLE D3D11.
 *
 * Event A was the 354 -> 361 upload batch and Event B was the 444 -> 460
 * batch in the authoritative DPR1 production trace. Keep this allowlist
 * explicit: additions require another physical-Iris first-use measurement.
 */
export const MEASURED_FIRST_USE_GEOMETRY_OWNER_NAMES = {
  eventA: [
    'room-2-upper-step-b-durable-composite-tread',
    'room-2-production-art-static-batch-16',
    'duct-segment-c-floor-main',
    'duct-final-run-floor',
    'room-2-upper-longitudinal-service-spine',
    'room-2-production-art-static-batch-17',
    'room-2-upper-step-b-restrained-safety-inlays',
  ],
  eventB: [
    'room-3-panel-east-upper-entry',
    'room-1-containment-overhead-service-coupler',
    'room-2-panel-east-upper-south',
    'room-2-production-art-static-batch-14',
    'room-3-production-art-static-batch-18',
    'room-3-production-art-static-batch-20',
    'room-1-production-art-static-batch-1',
    'room-2-production-art-static-batch-15',
    'room-3-production-art-static-batch-19',
    'room-3-production-art-static-batch-21',
    'room-4-north-recessed-ventilation-module',
    'room-1-vent-route-identifier-backing',
    'room-2-ascent-route-identifier-backing',
    'room-1-vent-route-identifier',
    'room-2-ascent-route-identifier',
    'room-3-production-art-static-batch-28',
  ],
} as const;

const MEASURED_FIRST_USE_GEOMETRY_OWNER_ALLOWLIST = [
  ...MEASURED_FIRST_USE_GEOMETRY_OWNER_NAMES.eventA,
  ...MEASURED_FIRST_USE_GEOMETRY_OWNER_NAMES.eventB,
] as const;

export interface MeasuredFirstUseGeometryPrimeDiagnostics {
  readonly ownerNames: readonly string[];
  readonly resourceCount: number;
  readonly uniqueGeometryCount: number;
  readonly instancedResourceCount: number;
  readonly resourcesPrimed: boolean;
  readonly resourcePrimeCount: number;
}

// These static meshes are intentionally discoverable by authored-name checks
// and visual/collider alignment diagnostics. Keeping them separate costs only
// a handful of calls while preserving their inspectable identity.
const PRESERVED_STATIC_ART_NAMES = {
  roomOne: new Set([
    'room-1-ceiling-neutral-diffuser--3.8',
    'room-1-ceiling-neutral-diffuser-3.8',
  ]),
  roomTwo: new Set([
    'room-2-observation-reinforced-glass',
    'room-2-upper-structural-cross-members',
    'room-2-platform-a-height-lesson-durable-composite-tread',
    'room-2-ceiling-neutral-diffuser-1',
  ]),
  roomThree: new Set([
    'room-3-basin-substantial-perimeter-curbs',
    'room-3-entry-platform-actuator-column',
    'room-3-platform-c-underside-actuator-socket',
    'room-3-to-4-duct-floor-clean-liner',
    'room-3-to-4-duct-clean-side-liners',
    'room-3-to-4-duct-service-side-liners',
    'room-3-to-4-duct-side-transition-seams',
    'room-3-to-4-duct-ceiling-backing',
    'room-3-to-4-shaft-end-service-portal-left',
    'room-3-panel-west-south-lower',
    'room-3-panel-east-entry-quiet',
    'room-3-entry-panel-east',
    'room-3-main-adhesion-replaceable-membrane',
    'room-3-final-adhesion-replaceable-membrane',
    'room-3-entry-graphite-jambs',
    'room-3-ceiling-major-service-trusses',
    'room-3-ceiling-static-diffuser-1',
    'room-3-exit-duct-graphite-collar-left',
  ]),
  roomFour: new Set([
    'room-4-major-north-south-structural-ribs',
    'room-4-elevator-continuous-guide-rails',
    'room-4-main-vertical-power-trunk',
    'room-4-south-recessed-maintenance-bay',
    'room-4-laser-origin-precision-instrument-housings',
    'room-4-lower-elevator-machinery-base',
    'room-4-upper-receiving-portal-structural-frame',
    'room-4-entry-core-sign-recessed-backing',
    'room-4-service-level-s01-sign-recessed-backing',
    'room-4-transfer-array-s02-sign-recessed-backing',
    'room-4-laser-core-sign-recessed-backing',
    'room-4-room-five-destination-sign-recessed-backing',
  ]),
  roomFive: new Set([
    'room-5-containment-base',
    'room-5-lower-containment-ring',
    'room-5-upper-containment-ring',
    'room-5-structural-clamps',
    'room-5-upper-service-manifold',
    'room-5-major-overhead-compound-feed',
    'room-5-observation-control-room',
    'room-5-observation-angled-control-console',
    'room-5-observation-connection',
    'room-5-soluble-composite-door-structural-frame',
    'room-5-east-ascent-adhesion-membrane',
    'room-5-east-ascent-extension-adhesion-membrane',
    'room-5-east-front-clinical-wall-zone',
    'room-5-east-upper-rear-clinical-wall-zone',
    'room-5-ceiling-static-fixture-diffusers',
  ]),
} as const;

/** Complete Level 1 scene composition while preserving the teaching-scene API. */
export class ContainmentLevelScene {
  readonly root = new THREE.Group();
  readonly artResources = new ContainmentArtResources();
  readonly teaching: ContainmentTeachingScene;
  readonly roomThree: RoomThreeGreybox;
  readonly roomFour: RoomFourGreybox;
  readonly roomFive: RoomFiveGreybox;
  readonly lighting: ContainmentLightingRig;
  readonly staticBatchDiagnostics: readonly ContainmentStaticBatchDiagnostics[];
  private readonly staticBatches: readonly ContainmentStaticBatchResult[];
  private readonly measuredFirstUseGeometryResources: readonly THREE.Mesh[];
  private measuredFirstUseGeometryResourcesPrimed = false;
  private measuredFirstUseGeometryResourcePrimeCount = 0;

  constructor(
    requestHazardFailure: (failure: ContainmentHazardFailure) => void,
    options: { readonly includeDevelopmentHelpers?: boolean } = {},
  ) {
    // Retain the validated hierarchy name because it is part of the frozen
    // collision parent path; production art is layered beneath it.
    this.root.name = 'containment-level-greybox';
    this.teaching = new ContainmentTeachingScene(this.artResources, options);
    this.roomThree = new RoomThreeGreybox(requestHazardFailure, this.artResources);
    this.roomFour = new RoomFourGreybox(requestHazardFailure, this.artResources);
    this.roomFive = new RoomFiveGreybox(requestHazardFailure, this.artResources);
    this.root.add(
      this.teaching.root,
      this.roomThree.root,
      this.roomFour.root,
      this.roomFive.root,
    );
    this.lighting = new ContainmentLightingRig({
      levelRoot: this.root,
      roomOneArt: this.teaching.roomOneArt,
      roomFour: this.roomFour,
      roomFive: this.roomFive,
    });
    this.root.add(this.lighting.root);
    this.staticBatches = [
      consolidateContainmentRoomStaticVisuals(this.teaching.roomOneArt.root, {
        excludedRoots: [this.teaching.roomOneArt.specimenAssembly],
        preservedNames: PRESERVED_STATIC_ART_NAMES.roomOne,
      }),
      consolidateContainmentRoomStaticVisuals(this.teaching.roomTwoArt.root, {
        preservedNames: PRESERVED_STATIC_ART_NAMES.roomTwo,
      }),
      consolidateContainmentRoomStaticVisuals(this.roomThree.art.root, {
        preservedNames: PRESERVED_STATIC_ART_NAMES.roomThree,
        cellSize: 4,
      }),
      consolidateContainmentRoomStaticVisuals(this.roomFour.art.root, {
        preservedNames: PRESERVED_STATIC_ART_NAMES.roomFour,
      }),
      consolidateContainmentRoomStaticVisuals(this.roomFive.art.root, {
        excludedRoots: [this.roomFive.art.containmentAssembly],
        preservedNames: PRESERVED_STATIC_ART_NAMES.roomFive,
      }),
    ];
    this.staticBatchDiagnostics = this.staticBatches.map(
      ({ diagnostics }) => diagnostics,
    );
    this.measuredFirstUseGeometryResources =
      resolveMeasuredFirstUseGeometryResources(this.root);
  }

  /** Small #38-facing API; callers never need individual fixture objects. */
  get cutsceneLighting(): ContainmentCutsceneLighting {
    return this.lighting.cutsceneLighting;
  }

  get lightingDiagnostics(): ContainmentLightingDiagnostics {
    return this.lighting.diagnostics;
  }

  get collisionMeshes(): readonly THREE.Mesh[] {
    return [
      ...this.teaching.collisionMeshes,
      ...this.roomThree.collisionMeshes,
      ...this.roomFour.collisionMeshes,
      ...this.roomFive.collisionMeshes,
    ];
  }

  /** Colliders whose authored gameplay transform changes after registration. */
  get dynamicCollisionMeshes(): readonly THREE.Mesh[] {
    return [
      this.roomFour.elevatorPlatform.collisionMesh,
      this.roomFive.movingPlatformOne.collisionMesh,
      this.roomFive.movingPlatformTwo.collisionMesh,
    ];
  }

  /** Authored camera boundaries and opaque camera-only presentation meshes. */
  get cameraObstructionMeshes(): readonly THREE.Mesh[] {
    return [
      ...this.roomThree.builder.cameraObstructionMeshes,
      ...this.roomFour.cameraObstructionMeshes,
      ...this.roomFive.builder.cameraObstructionMeshes,
    ];
  }

  /** Explicitly-authored meshes eligible for Goop's dissolve runtime. */
  get solubleTargetMeshes(): readonly THREE.Mesh[] {
    return [
      ...this.teaching.solubleTargetMeshes,
      this.roomFive.goopWoodenDoor,
    ];
  }

  get slimeDiagnostics(): SlimeVisualDiagnostics {
    return this.teaching.slimeDiagnostics;
  }

  get deathBurstDiagnostics(): SlimeBurstDiagnostics {
    return this.teaching.deathBurstDiagnostics;
  }

  get measuredFirstUseGeometryPrimeDiagnostics(): MeasuredFirstUseGeometryPrimeDiagnostics {
    return {
      ownerNames: MEASURED_FIRST_USE_GEOMETRY_OWNER_ALLOWLIST,
      resourceCount: this.measuredFirstUseGeometryResources.length,
      uniqueGeometryCount: new Set(
        this.measuredFirstUseGeometryResources.map(({ geometry }) => geometry),
      ).size,
      instancedResourceCount: this.measuredFirstUseGeometryResources.filter(
        (resource) => resource instanceof THREE.InstancedMesh,
      ).length,
      resourcesPrimed: this.measuredFirstUseGeometryResourcesPrimed,
      resourcePrimeCount: this.measuredFirstUseGeometryResourcePrimeCount,
    };
  }

  primeMeasuredFirstUseGeometryResources(
    render: (resources: readonly THREE.Mesh[]) => void,
  ): boolean {
    if (this.measuredFirstUseGeometryResourcesPrimed) return false;
    render(this.measuredFirstUseGeometryResources);
    this.measuredFirstUseGeometryResourcesPrimed = true;
    this.measuredFirstUseGeometryResourcePrimeCount += 1;
    return true;
  }

  primeDeathBurstResources(
    render: (root: THREE.Object3D) => void,
  ): boolean {
    return this.teaching.primeDeathBurstResources(render);
  }

  copySpawnPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.teaching.copySpawnPosition(target);
  }

  copyOutOfBoundsTestPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.teaching.copyOutOfBoundsTestPosition(target);
  }

  copyRoomTwoSafeLandingPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.teaching.copyRoomTwoSafeLandingPosition(target);
  }

  setProbePosition(position: Vector3State): void {
    this.teaching.setProbePosition(position);
  }

  setProbeYaw(yawRadians: number): void {
    this.teaching.setProbeYaw(yawRadians);
  }

  setProbeOpacity(opacity: number): void {
    this.teaching.setProbeOpacity(opacity);
  }

  isInsideCameraTightVent(position: Vector3State): boolean {
    return (
      this.teaching.isInsideCameraTightVent(position) ||
      this.roomThree.isInsideCameraTightVent(position)
    );
  }

  presentProbe(): void {
    this.teaching.presentProbe();
  }

  update(deltaSeconds: number, visualState?: SlimeVisualState): void {
    this.teaching.update(deltaSeconds, visualState);
    this.roomThree.updatePresentation(deltaSeconds);
    this.lighting.update(deltaSeconds);
  }

  resetPresentation(): void {
    this.lighting.reset();
  }

  reconcilePresentationAfterRecovery(): void {
    this.lighting.reconcileAuthoritativeState(true);
  }

  startDeath(position: Vector3State): boolean {
    return this.teaching.startDeath(position);
  }

  updateDeath(deltaSeconds: number): void {
    this.teaching.updateDeath(deltaSeconds);
  }

  finishDeath(position: Vector3State): void {
    this.teaching.finishDeath(position);
  }

  resetProbe(): void {
    this.teaching.resetProbe();
  }

  onSlimeLanding(
    normalWorld: Vector3State,
    impactSpeedMetresPerSecond: number,
  ): void {
    this.teaching.onSlimeLanding(normalWorld, impactSpeedMetresPerSecond);
  }

  onSlimeLaunch(launch: SlimeVisualLaunch): void {
    this.teaching.onSlimeLaunch(launch);
  }

  dispose(): void {
    this.lighting.dispose();
    for (const staticBatch of this.staticBatches) staticBatch.dispose();
    this.roomFive.dispose();
    this.roomFour.dispose();
    this.roomThree.dispose();
    this.teaching.dispose();
    this.artResources.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}

function resolveMeasuredFirstUseGeometryResources(
  root: THREE.Object3D,
): readonly THREE.Mesh[] {
  const resources = MEASURED_FIRST_USE_GEOMETRY_OWNER_ALLOWLIST.map((name) => {
    const object = root.getObjectByName(name);
    if (!(object instanceof THREE.Mesh)) {
      throw new Error(
        `Measured first-use geometry owner is missing or not renderable: ${name}`,
      );
    }
    return object;
  });
  const uniqueResources = new Set(resources);
  const uniqueGeometries = new Set(resources.map(({ geometry }) => geometry));
  if (
    uniqueResources.size !== MEASURED_FIRST_USE_GEOMETRY_OWNER_ALLOWLIST.length ||
    uniqueGeometries.size !== MEASURED_FIRST_USE_GEOMETRY_OWNER_ALLOWLIST.length
  ) {
    throw new Error(
      'Measured first-use geometry allowlist must resolve to 23 unique owners and GPU geometries.',
    );
  }
  return resources;
}
