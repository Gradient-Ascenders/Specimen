import type { GelRendering } from '../render/slime/GelRendering.ts';
import { createContainmentPlatformBoosters } from '../render/environment/containment/ContainmentPlatformBoosters.ts';
import type { PlatformBoosters } from '../render/environment/PlatformBoosters.ts';
import * as THREE from 'three';

import type { BobCharacterPresentation } from '../render/bob/BobCharacterPresentation.ts';
import type { Vector3State } from '../render/slime/SlimePresentationContract.ts';
import { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import { RoomOneMonitor } from '../render/environment/containment/RoomOneMonitor.ts';
import { RoomTwoMonitor } from '../render/environment/containment/RoomTwoMonitor.ts';
import { RoomThreeMonitor } from '../render/environment/containment/RoomThreeMonitor.ts';
import { RoomFiveMonitor } from '../render/environment/containment/RoomFiveMonitor.ts';
import { ContainmentSurveillanceCameras } from '../render/environment/containment/ContainmentSurveillanceCameras.ts';
import { fitContainmentShadowCullingBounds } from '../render/environment/containment/ContainmentShadowCoverage.ts';
import type {RoomTwoShellLoader} from '../render/environment/containment/RoomTwoShell.ts';
import type {RoomThreeShellLoader} from '../render/environment/containment/RoomThreeShell.ts';
import type {RoomFourShellLoader} from '../render/environment/containment/RoomFourShell.ts';
import type {ContainmentSurveillanceModelLoader} from '../render/environment/containment/ContainmentSurveillanceModel.ts';
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
 * Historical first-use owners measured on Intel Iris Xe / ANGLE D3D11.
 *
 * Event A was the 354 -> 361 upload batch and Event B was the 444 -> 460
 * batch in the authoritative DPR1 production trace. CPU-only storyboards keep
 * this list. Once Room 2 prepares, its authored buffers replace its retired
 * entries; the old hardware timings do not describe those new buffers.
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
    'room-5-escape-vent-structural-frame',
    'room-5-east-ascent-adhesion-membrane',
    'room-5-east-ascent-extension-adhesion-membrane',
    'room-5-east-front-clinical-wall-zone',
    'room-5-east-upper-rear-clinical-wall-zone',
    'room-5-ceiling-static-fixture-diffusers',
  ]),
} as const;

/** Complete Level 1 scene composition while preserving the teaching-scene API. */
export class ContainmentLevelScene {
  readonly platformBoosters: PlatformBoosters;
  readonly root = new THREE.Group();
  readonly artResources = new ContainmentArtResources();
  readonly teaching: ContainmentTeachingScene;
  readonly roomThree: RoomThreeGreybox;
  readonly roomFour: RoomFourGreybox;
  readonly roomFive: RoomFiveGreybox;
  readonly lighting: ContainmentLightingRig;
  readonly roomOneMonitor: RoomOneMonitor;
  readonly roomTwoMonitor: RoomTwoMonitor;
  readonly roomThreeMonitor: RoomThreeMonitor;
  readonly roomFiveMonitor: RoomFiveMonitor;
  readonly surveillanceCameras: ContainmentSurveillanceCameras;
  readonly staticBatchDiagnostics: readonly ContainmentStaticBatchDiagnostics[];
  private readonly staticBatches: readonly ContainmentStaticBatchResult[];
  private readonly measuredFirstUseGeometryResources: readonly THREE.Mesh[];
  private measuredFirstUseGeometryResourcesPrimed = false;
  private measuredFirstUseGeometryResourcePrimeCount = 0;
  private disposed=false;
  private readonly roomOneOccludedBranches: readonly { root: THREE.Object3D; visible: boolean }[];
  private readonly roomTwoOccludedBranches: readonly { root: THREE.Object3D; visible: boolean }[];
  private readonly completedRoomOneBranches: readonly { root: THREE.Object3D; visible: boolean }[];
  private readonly roomThreeOccludedBranches: readonly { root: THREE.Object3D; visible: boolean }[];
  private readonly finaleOccludedBranches: readonly { root: THREE.Object3D; visible: boolean }[];

  get goop() { return this.teaching.goop; }

  get bob(): BobCharacterPresentation {
    return this.teaching.bob;
  }

  constructor(
    requestHazardFailure: (failure: ContainmentHazardFailure) => void,
    options: { readonly includeDevelopmentHelpers?: boolean; readonly gelRendering?: GelRendering } = {},
  ) {
    // Retain the validated hierarchy name because it is part of the frozen
    // collision parent path; production art is layered beneath it.
    this.root.name = 'containment-level-greybox';
    this.teaching = new ContainmentTeachingScene(this.artResources, options);
    this.roomThree = new RoomThreeGreybox(requestHazardFailure, this.artResources);
    this.roomFour = new RoomFourGreybox(requestHazardFailure, this.artResources);
    this.roomFive = new RoomFiveGreybox(requestHazardFailure, this.artResources, options.gelRendering);
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
      bob: this.teaching.bob,
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
    this.lighting.configureRoomOneShadowReceivers(this.teaching.roomOneArt);
    fitContainmentShadowCullingBounds(this.root);
    // Attach after the measured batches are built: the independently-owned
    // screen must not alter first-use batch identities or gameplay collision.
    this.roomOneMonitor = new RoomOneMonitor(this.artResources);
    this.teaching.roomOneArt.root.add(this.roomOneMonitor.root);
    this.roomTwoMonitor = new RoomTwoMonitor(this.artResources);
    this.teaching.roomTwoArt.root.add(this.roomTwoMonitor.root);
    this.roomThreeMonitor = new RoomThreeMonitor(this.artResources);
    this.roomThree.art.root.add(this.roomThreeMonitor.root);
    this.roomFiveMonitor = new RoomFiveMonitor(this.artResources);
    this.roomFive.art.root.add(this.roomFiveMonitor.root);
    // Dynamic gimbals must not enter the frozen room-local static batches.
    this.surveillanceCameras = new ContainmentSurveillanceCameras({
      1: this.teaching.roomOneArt.root, 2: this.teaching.roomTwoArt.root,
      3: this.roomThree.art.root, 5: this.roomFive.art.root,
    });
    this.surveillanceCameras.reset(this.teaching.copySpawnPosition(new THREE.Vector3()));
    this.platformBoosters = createContainmentPlatformBoosters(this);
    this.measuredFirstUseGeometryResources =
      resolveMeasuredFirstUseGeometryResources(this.root);
    // Preserve light-bearing ancestry (including the elevator warning lamps):
    // hiding those lights changes the shader layout of the local room.
    this.roomOneOccludedBranches = collectLightlessBranches([
      this.roomThree.root, this.roomFour.root, this.roomFive.root,
    ]);
    this.roomTwoOccludedBranches = collectLightlessBranches([this.roomFour.root,this.roomFive.root]);
    this.completedRoomOneBranches = collectLightlessBranches([this.teaching.roomOneArt.root]);
    this.roomThreeOccludedBranches = collectLightlessBranches([this.roomFive.root]);
    this.finaleOccludedBranches = collectLightlessBranches([
      this.teaching.roomOneArt.root, this.teaching.roomTwoArt.root,
      this.roomThree.root, this.roomFour.root,
    ]);
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

  async prepareEnvironmentArt(roomTwoLoader?:RoomTwoShellLoader,roomThreeLoader?:RoomThreeShellLoader,
    cameraLoader?:ContainmentSurveillanceModelLoader,roomFourLoader?:RoomFourShellLoader):Promise<void>{
    await this.teaching.roomOneArt.prepare();
    if(this.disposed)return;
    await this.teaching.roomTwoArt.prepare(name=>this.teaching.roomOneArt.shell.borrowFinish(name),roomTwoLoader);
    if(this.disposed)return;
    await this.surveillanceCameras.prepare(name=>this.teaching.roomOneArt.shell.borrowFinish(name),cameraLoader);
    if(this.disposed)return;
    await this.roomThree.prepareArt(name=>this.teaching.roomOneArt.shell.borrowFinish(name),roomThreeLoader);
    if(this.disposed)return;
    await this.roomFour.prepareArt(name=>this.teaching.roomOneArt.shell.borrowFinish(name),
      this.roomThree.art.shell.borrowLaserEmitter()!,roomFourLoader);
  }

  private currentFirstUseGeometryResources():readonly THREE.Mesh[]{
    // The old hardware timings are historical. Prime the new authored buffers
    // explicitly instead of uploading retired procedural Room 2/3 proxies.
    const roomTwo=this.teaching.roomTwoArt.shell,roomThree=this.roomThree.art.shell,roomFour=this.roomFour.art.shell;
    return [...this.measuredFirstUseGeometryResources.filter(object=>
      !(roomTwo.ready&&object.name.startsWith('room-2-'))&&!(roomThree.ready&&object.name.startsWith('room-3-'))&&
      !(roomFour.ready&&object.name.startsWith('room-4-'))),
      ...(roomTwo.ready?roomTwo.renderMeshes:[]),...(roomThree.ready?this.roomThree.authoredRenderMeshes:[]),
      ...this.surveillanceCameras.authoredRenderMeshes,...(roomFour.ready?roomFour.renderMeshes:[])];
  }

  /** Explicitly-authored meshes eligible for Goop's dissolve runtime. */
  get solubleTargetMeshes(): readonly THREE.Mesh[] {
    return [this.roomFive.goopWoodenDoor];
  }

  get measuredFirstUseGeometryPrimeDiagnostics(): MeasuredFirstUseGeometryPrimeDiagnostics {
    const resources=this.currentFirstUseGeometryResources();
    return {
      ownerNames: resources.map(object=>object.name),
      resourceCount: resources.length,
      uniqueGeometryCount: new Set(
        resources.map(({ geometry }) => geometry),
      ).size,
      instancedResourceCount: resources.filter(
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
    render(this.currentFirstUseGeometryResources());
    this.measuredFirstUseGeometryResourcesPrimed = true;
    this.measuredFirstUseGeometryResourcePrimeCount += 1;
    return true;
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

  isInsideCameraTightVent(position: Vector3State): boolean {
    return (
      this.teaching.isInsideCameraTightVent(position) ||
      this.roomThree.isInsideCameraTightVent(position)
    );
  }

  /**
   * Enclosed rooms cannot see scenery beyond their solid ceilings and duct
   * turns. Use both actor and camera positions: the Room 2 checkpoint can lag
   * the drop, and a trailing camera can still be inside an earlier portal.
   * Cull only for the draw, preserving light ancestry and authored visibility.
   * Stop before each exit so doorway views and subsequent rooms are unchanged.
   */
  withEnclosedRoomOcclusion<T>(
    activePosition: Vector3State,
    cameraPosition: Vector3State,
    draw: () => T,
  ): T {
    const roomId = this.lighting.activeRoomId;
    const branches = roomId === 1 &&
      activePosition.z < 24 && cameraPosition.z < 24 &&
      activePosition.y < 14 && cameraPosition.y < 14
      ? this.roomOneOccludedBranches
      : roomId <= 3 &&
        activePosition.z >= 24 && cameraPosition.z >= 24 &&
        activePosition.z < 49 && cameraPosition.z < 49 &&
        activePosition.y < 18 && cameraPosition.y < 18
        ? this.roomTwoOccludedBranches
        : roomId === 3 &&
        activePosition.z < 78 && cameraPosition.z < 78 &&
        activePosition.y < 34 && cameraPosition.y < 34
        ? this.roomThreeOccludedBranches
        : undefined;
    // Past the two opaque duct bends, the old pod is fully occluded. Keeping
    // it submitted creates otherwise-unused material variants under later rigs.
    const completedRoomOne = (roomId <= 3 &&
      activePosition.z >= 25.1 && cameraPosition.z >= 25.1 &&
      activePosition.z < 78 && cameraPosition.z < 78 &&
      activePosition.y < 34 && cameraPosition.y < 34) ||
      // The enclosed lift is beyond two offset rooms and their opaque walls.
      // The old pod cannot be seen here, even during the low arrival camera.
      (roomId===4&&activePosition.z>=79.2&&cameraPosition.z>=79.2)
      ? this.completedRoomOneBranches : undefined;
    if (!branches && !completedRoomOne) return draw();

    if(branches)for (const branch of branches) {
      branch.visible = branch.root.visible;
      branch.root.visible = false;
    }
    if(completedRoomOne)for(const branch of completedRoomOne){
      branch.visible=branch.root.visible;branch.root.visible=false;
    }
    try {
      return draw();
    } finally {
      if(completedRoomOne)for(const branch of completedRoomOne)branch.root.visible=branch.visible;
      if(branches)for (const branch of branches) branch.root.visible = branch.visible;
    }
  }

  /** The finale cannot see earlier chambers. Keep their lights' ancestry and
   * borrowed character roots intact, but don't submit their enclosed geometry. */
  withRoomFiveCinematicScope<T>(draw: () => T): T {
    for (const branch of this.finaleOccludedBranches) {
      branch.visible = branch.root.visible; branch.root.visible = false;
    }
    try { return draw(); }
    finally { for (const branch of this.finaleOccludedBranches) branch.root.visible = branch.visible; }
  }

  update(deltaSeconds: number, bobPosition?: Vector3State, activePosition = bobPosition): void {
    this.surveillanceCameras.update(deltaSeconds, bobPosition);
    this.roomOneMonitor.update(deltaSeconds);
    this.roomTwoMonitor.update(deltaSeconds, activePosition);
    this.roomThreeMonitor.update(deltaSeconds, activePosition);
    this.roomFiveMonitor.update(deltaSeconds, activePosition);
    if (activePosition) this.lighting.setTraversalPosition(activePosition);
    if (bobPosition) {
      this.lighting.setBobInDarkDuct(
        this.isInsideCameraTightVent(bobPosition),
      );
    }
    this.roomThree.updatePresentation(deltaSeconds);
    this.roomFive.updatePresentation(deltaSeconds, activePosition);
    this.lighting.update(deltaSeconds);
  }

  resetPresentation(): void {
    this.platformBoosters.reset();
    this.lighting.reset();
    this.roomOneMonitor.reset();
    this.roomTwoMonitor.reset();
    this.roomThreeMonitor.reset();
    this.roomFiveMonitor.reset();
    this.roomFive.goopSpeech.reset();
    this.surveillanceCameras.reset();
  }

  reconcilePresentationAfterRecovery(bobPosition: Vector3State): void {
    this.platformBoosters.reset();
    this.surveillanceCameras.reset(bobPosition);
    this.lighting.setTraversalPosition(bobPosition);
    this.lighting.setBobInDarkDuct(
      this.isInsideCameraTightVent(bobPosition),
    );
    this.lighting.reconcileAuthoritativeState(true);
  }

  updateDeath(deltaSeconds: number): void {
    this.roomThree.updatePresentation(deltaSeconds);
  }

  resetTeachingPresentation(): void {
    this.teaching.resetTeachingPresentation();
  }

  dispose(): void {
    if(this.disposed)return;
    this.disposed=true;
    this.platformBoosters.dispose();
    this.surveillanceCameras.dispose();
    this.roomOneMonitor.dispose();
    this.roomTwoMonitor.dispose();
    this.roomThreeMonitor.dispose();
    this.roomFiveMonitor.dispose();
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

function collectLightlessBranches(roots: readonly THREE.Object3D[]):
  { root: THREE.Object3D; visible: boolean }[] {
  const branches: { root: THREE.Object3D; visible: boolean }[] = [];
  for (const root of roots) {
    const lightAncestors = new Set<THREE.Object3D>();
    root.traverse(object => {
      if (!(object instanceof THREE.Light)) return;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
        lightAncestors.add(parent);
        if (parent === root) break;
      }
    });
    const collect = (object: THREE.Object3D): void => {
      if (lightAncestors.has(object)) object.children.forEach(collect);
      else branches.push({ root: object, visible: object.visible });
    };
    collect(root);
  }
  return branches;
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
