import * as THREE from 'three';

import {
  LaserHazard,
  type LaserContactTarget,
} from '../hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../hazards/LaserHazardSystem.ts';
import {
  RadioactiveFloorHazard,
  type RadioactiveFloorOccupant,
  type RadioactiveFloorSlimeId,
} from '../hazards/RadioactiveFloorHazard.ts';
import { LaserHazardPresentation } from '../render/hazards/LaserHazardPresentation.ts';
import {
  consolidateCultivationRoomThreeStaticColliders,
  type CultivationRoomThreeStaticBatchDiagnostics,
} from '../render/environment/cultivation/CultivationRoomThreeStaticBatching.ts';
import { LEVEL_TWO_BOB_AIR_DUCT_LAYOUT } from './LevelTwoAirDuctGreybox.ts';
import { CULTIVATION_ROOM_THREE_DRONE_AUTHORING } from './CultivationRoomThreeAuthoring.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';

export const LEVEL_TWO_ROOM_THREE_BOB_SPAWN = new THREE.Vector3(
  8,
  19.7,
  2.8,
);
export const LEVEL_TWO_ROOM_THREE_GOOP_SPAWN = new THREE.Vector3(
  0,
  0.46,
  2.8,
);

export interface LevelTwoRoomThreeHazardFailure {
  readonly roomId: 3;
  readonly hazardId: string;
  readonly slimeId?: RadioactiveFloorSlimeId;
}

interface LocalLaserContactTarget extends LaserContactTarget {
  readonly id: RadioactiveFloorSlimeId;
  readonly position: THREE.Vector3;
  radiusMetres: number;
}

/**
 * Large Room 3 cooperation chamber.
 *
 * Drone bodies are supplied by the Issue #96 encounter owner. This scene owns
 * their soluble cables, radiation floor, cover, lasers, and checkpoint geometry.
 */
export class LevelTwoRoomThreeGreybox {
  readonly builder = new GreyboxRoomBuilder('cultivation-room-3-greybox');
  readonly root = this.builder.root;
  readonly collisionMeshes = this.builder.collisionMeshes;
  readonly solubleTargetMeshes: THREE.Mesh[] = [];
  readonly lasers: LaserHazardSystem;
  readonly radiationHazard: RadioactiveFloorHazard;
  readonly staticBatchDiagnostics: CultivationRoomThreeStaticBatchDiagnostics;

  private readonly laserPresentation: LaserHazardPresentation;
  private readonly localLaserTargetById: Readonly<
    Record<RadioactiveFloorSlimeId, LocalLaserContactTarget>
  > = {
    bob: { id: 'bob', position: new THREE.Vector3(), radiusMetres: 0.45 },
    goop: { id: 'goop', position: new THREE.Vector3(), radiusMetres: 0.45 },
  };
  private readonly localLaserTargets: LocalLaserContactTarget[] = [];
  constructor(
    requestFailure: (failure: LevelTwoRoomThreeHazardFailure) => void,
  ) {
    this.root.userData.levelId = 'cultivation';
    this.root.userData.roomId = 3;
    const radiationFloor = this.buildShell();
    this.radiationHazard = new RadioactiveFloorHazard({
      id: radiationFloor.name,
      mesh: radiationFloor,
      lethalSlimeIds: ['bob'],
      requestRecovery: (slimeId) =>
        requestFailure({
          roomId: 3,
          hazardId: radiationFloor.name,
          slimeId,
        }),
    });
    this.buildBobUpperRoute();
    this.buildGoopCoverRoute();
    this.buildRoofDronePlaceholders();
    this.buildFinalSecurityArea();
    this.addCheckpointAnchors();
    this.staticBatchDiagnostics =
      consolidateCultivationRoomThreeStaticColliders(
        this.root,
        this.collisionMeshes,
      );

    const hazards = this.createLasers();
    this.lasers = new LaserHazardSystem({
      id: 'cultivation-room-3-upper-route-lasers',
      hazards,
      requestRecovery: (hazard, target) =>
        requestFailure({
          roomId: 3,
          hazardId: hazard.id,
          slimeId: asSlimeId(target.id),
        }),
    });
    this.laserPresentation = new LaserHazardPresentation(hazards);
    this.root.add(this.lasers.root, this.laserPresentation.root);
  }

  update(
    deltaSeconds: number,
    occupants: readonly RadioactiveFloorOccupant[],
  ): void {
    this.root.updateWorldMatrix(true, false);
    this.localLaserTargets.length = 0;
    for (const occupant of occupants) {
      const localTarget = this.localLaserTargetById[occupant.id];
      localTarget.position.set(
        occupant.position.x,
        occupant.position.y,
        occupant.position.z,
      );
      this.root.worldToLocal(localTarget.position);
      localTarget.radiusMetres = occupant.radiusMetres;
      this.localLaserTargets.push(localTarget);
    }
    this.lasers.updateTargets(deltaSeconds, this.localLaserTargets);
    this.laserPresentation.sync();
  }

  updateRadiation(
    occupants: Iterable<RadioactiveFloorOccupant>,
  ): void {
    this.radiationHazard.update(occupants);
  }

  reset(): void {
    this.radiationHazard.reset();
    this.lasers.reset();
    this.laserPresentation.sync();
  }

  dispose(): void {
    this.radiationHazard.dispose();
    this.laserPresentation.dispose();
    this.lasers.dispose();
    this.solubleTargetMeshes.length = 0;
    this.builder.dispose();
  }

  private buildShell(): THREE.Mesh {
    const { acid, floor, wall } = this.builder.materials;
    const duct = LEVEL_TWO_BOB_AIR_DUCT_LAYOUT;
    const roomHeightMetres = 30;
    const openingTopMetres = duct.floorYMetres + duct.innerHeightMetres;
    const jambOffsetXMetres =
      duct.innerWidthMetres * 0.5 + duct.wallJambWidthMetres * 0.5;

    const radiation = this.builder.addCollider({
      name: 'cultivation-room-3-radioactive-floor',
      size: [47.6, 0.3, 66],
      position: [0, -0.15, 33],
      material: acid,
      textureRole: 'acid-floor',
    });
    Object.assign(radiation.userData, {
      levelId: 'cultivation',
      roomId: 3,
      hazardRole: 'radioactive',
      hazardPolicy: 'bob-lethal-goop-immune',
    });

    this.builder.addCollider({
      name: 'cultivation-room-3-final-safe-floor',
      size: [47.6, 0.5, 6],
      position: [0, 0.1, 69],
      material: floor,
    });
    this.builder.addCollider({
      name: 'cultivation-room-3-west-wall',
      size: [0.4, 30, 72],
      position: [-24, 15, 36],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-3-east-wall',
      size: [0.4, 30, 72],
      position: [24, 15, 36],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-3-ceiling',
      size: [48, 0.4, 72],
      position: [0, 30, 36],
      material: wall,
    });

    // The Room 2 connectors remain physically aligned: Goop enters at x=0
    // on the lower layer and Bob enters at x=8 through the elevated vent.
    this.builder.addCollider({
      name: 'cultivation-room-3-entry-wall-west',
      size: [22, 30, 0.4],
      position: [-13, 15, 0],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-3-entry-wall-between-openings',
      size: [4.4, 30, 0.4],
      position: [4.2, 15, 0],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-3-entry-wall-east',
      size: [14.4, 30, 0.4],
      position: [16.8, 15, 0],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-3-above-goop-door',
      size: [4, 25.4, 0.4],
      position: [0, 17.3, 0],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-3-below-bob-vent',
      size: [duct.wallBayWidthMetres, duct.floorYMetres, 0.4],
      position: [duct.centreXMetres, duct.floorYMetres * 0.5, 0],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-3-above-bob-vent',
      size: [
        duct.wallBayWidthMetres,
        roomHeightMetres - openingTopMetres,
        0.4,
      ],
      position: [
        duct.centreXMetres,
        (roomHeightMetres + openingTopMetres) * 0.5,
        0,
      ],
      material: wall,
    });
    for (const [side, direction] of [
      ['west', -1],
      ['east', 1],
    ] as const) {
      this.builder.addCollider({
        name: `cultivation-room-3-bob-vent-${side}-jamb`,
        size: [duct.wallJambWidthMetres, duct.innerHeightMetres, 0.4],
        position: [
          duct.centreXMetres + direction * jambOffsetXMetres,
          duct.floorYMetres + duct.innerHeightMetres * 0.5,
          0,
        ],
        material: wall,
      });
    }

    this.builder.addLight(
      'cultivation-room-3-radiation-light-near',
      [-10, 4, 17],
      0xa7ff32,
      22,
      29,
    );
    this.builder.addLight(
      'cultivation-room-3-radiation-light-middle',
      [10, 4, 37],
      0xa7ff32,
      22,
      29,
    );
    this.builder.addLight(
      'cultivation-room-3-radiation-light-far',
      [-8, 4, 56],
      0xa7ff32,
      22,
      29,
    );
    this.builder.addLight(
      'cultivation-room-3-security-light',
      [0, 8, 69],
      0xff596e,
      16,
      20,
    );
    return radiation;
  }

  private buildBobUpperRoute(): void {
    const { platform, sticky, support } = this.builder.materials;

    const platforms: ReadonlyArray<{
      readonly id: string;
      readonly size: readonly [number, number, number];
      readonly position: readonly [number, number, number];
      readonly routeBeat: string;
    }> = [
      { id: 'entry', size: [6, 0.5, 7], position: [8, 19, 3.5], routeBeat: 'read-first-sticky-transfer' },
      { id: 'drone-1-rest', size: [5, 0.5, 4], position: [14, 24.4, 13], routeBeat: 'recover-after-first-sticky-laser' },
      { id: 'beam-1', size: [3.5, 0.45, 3.5], position: [14, 24.8, 19], routeBeat: 'measured-forward-jump' },
      { id: 'beam-2', size: [3.5, 0.45, 3.5], position: [9, 23.9, 25], routeBeat: 'measured-diagonal-jump' },
      { id: 'drone-2-rest', size: [4.5, 0.5, 4], position: [2.5, 23, 30], routeBeat: 'cooperation-pause' },
      { id: 'central-wall-exit', size: [4, 0.5, 4], position: [-5, 23.7, 43], routeBeat: 'recover-after-second-sticky-laser' },
      { id: 'beam-3', size: [3.5, 0.45, 3.5], position: [-10, 22.3, 48.5], routeBeat: 'high-wall-approach' },
      { id: 'drone-3-rest', size: [4, 0.5, 3.5], position: [-15, 25, 57.5], routeBeat: 'recover-after-third-sticky-laser' },
      { id: 'descent-1', size: [3.5, 0.5, 3.5], position: [-18, 21, 61], routeBeat: 'controlled-descent' },
      { id: 'descent-2', size: [3.5, 0.5, 3.5], position: [-14, 17, 64.5], routeBeat: 'controlled-descent' },
      { id: 'descent-3', size: [4, 0.5, 4], position: [-9, 13, 67], routeBeat: 'cross-behind-ground-drones' },
      { id: 'security-rear-landing', size: [4, 0.5, 4], position: [-3, 8, 69.5], routeBeat: 'approach-ground-drones-from-rear' },
      { id: 'security-floor-step', size: [4, 0.5, 3.2], position: [2, 3.5, 70.2], routeBeat: 'finish-descent-behind-drones' },
    ];

    for (const definition of platforms) {
      const collider = this.builder.addCollider({
        name: `cultivation-room-3-bob-${definition.id}`,
        size: definition.size,
        position: definition.position,
        material: platform,
      });
      Object.assign(collider.userData, {
        levelId: 'cultivation',
        roomId: 3,
        routeOwner: 'bob',
        routeBeat: definition.routeBeat,
      });
    }

    this.addStickyPanel({
      name: 'cultivation-room-3-entry-sticky-transfer',
      size: [8, 8, 0.18],
      position: [8, 21, 10.5],
      material: sticky,
    });
    this.addStickyPanel({
      name: 'cultivation-room-3-central-sticky-transfer',
      size: [0.18, 8, 9],
      position: [-1, 20, 36],
      material: sticky,
    });
    this.addStickyPanel({
      name: 'cultivation-room-3-high-sticky-transfer',
      size: [8, 8, 0.18],
      position: [-9, 22, 54],
      material: sticky,
    });

    // Supports make each rest area read as a maintenance route rather than a
    // collection of arbitrary boxes suspended in an empty room.
    for (const [name, x, y, z, height] of [
      ['drone-1-rest', 14, 12.2, 13, 24.4],
      ['drone-2-rest', 2.5, 11.5, 30, 23],
      ['central-wall-exit', -5, 11.85, 43, 23.7],
    ] as const) {
      this.builder.addCollider({
        name: `cultivation-room-3-${name}-support`,
        size: [0.8, height, 0.8],
        position: [x, y, z],
        material: support,
      });
    }
  }

  private addStickyPanel(options: {
    readonly name: string;
    readonly size: readonly [number, number, number];
    readonly position: readonly [number, number, number];
    readonly material: THREE.Material;
  }): void {
    const panel = this.builder.addCollider({
      ...options,
      surfaceTag: 'sticky',
      movementFaceMode: 'vertical-sides',
      textureRole: 'sticky-wall-tile',
    });
    Object.assign(panel.userData, {
      levelId: 'cultivation',
      roomId: 3,
      routeOwner: 'bob',
    });
  }

  private buildGoopCoverRoute(): void {
    const { containment, support } = this.builder.materials;
    const checkpointShield = this.builder.addCollider({
      name: 'cultivation-room-3-goop-checkpoint-shield',
      size: [8, 4.5, 1],
      position: [0, 2.25, 7],
      material: containment,
    });
    Object.assign(checkpointShield.userData, {
      levelId: 'cultivation',
      roomId: 3,
      routeOwner: 'goop',
      coverRole: 'checkpoint-spawn-shield',
    });

    const covers: ReadonlyArray<{
      readonly position: readonly [number, number, number];
      readonly size: readonly [number, number, number];
    }> = [
      { position: [-10, 1.75, 9], size: [5, 3.5, 3] },
      { position: [9, 2, 14], size: [4.5, 4, 3] },
      { position: [-13, 1.6, 20], size: [5.5, 3.2, 3] },
      { position: [5, 2.2, 25], size: [5, 4.4, 3.2] },
      { position: [15, 1.8, 31], size: [5, 3.6, 3] },
      { position: [-7, 2.1, 37], size: [5.5, 4.2, 3.2] },
      { position: [10, 1.7, 43], size: [4.5, 3.4, 3] },
      { position: [-14, 2, 49], size: [5, 4, 3.2] },
      { position: [2, 1.8, 55], size: [5.5, 3.6, 3] },
      { position: [14, 2.2, 61], size: [5, 4.4, 3.2] },
    ];

    covers.forEach((cover, index) => {
      const collider = this.builder.addCollider({
        name: `cultivation-room-3-goop-cover-${index + 1}`,
        size: cover.size,
        position: cover.position,
        material: index % 2 === 0 ? containment : support,
      });
      Object.assign(collider.userData, {
        levelId: 'cultivation',
        roomId: 3,
        routeOwner: 'goop',
        coverRole: 'drone-line-of-sight-blocker',
      });
    });
  }

  private buildRoofDronePlaceholders(): void {
    const { cable: cableMaterial } = this.builder.materials;

    for (const definition of CULTIVATION_ROOM_THREE_DRONE_AUTHORING.ceilingDrones) {
      const { id, initialPosition, colliderSize } = definition.drone;
      const { x, y, z } = initialPosition;
      const cableBottom = y + colliderSize.y * 0.5;
      const cableTop = definition.hatchPosition.y;
      const cableLength = cableTop - cableBottom;
      const cable = this.builder.addCollider({
        name: definition.supportTargetId,
        size: [0.22, cableLength, 0.22],
        position: [x, cableBottom + cableLength * 0.5, z],
        material: cableMaterial,
        interactionRole: 'goop-dissolvable',
      });
      Object.assign(cable.userData, {
        soluble: true,
        solubleId: cable.name,
        authoringRole: 'ceiling-drone-soluble-support-cable',
        textureRole: 'soluble-cable',
        levelId: 'cultivation',
        roomId: 3,
        droneId: id,
        releaseMode: 'temporary-roof-drone-disable',
        replacementDelaySeconds: 10,
        dissolveDurationSeconds: 0.8,
        dissolveCollisionDisableProgress: 0.72,
        dissolveActivationRangeMetres: 0.18,
      });
      this.solubleTargetMeshes.push(cable);

      const marker = this.builder.addVisualBox({
        name: `${id}-soluble-marker-band`,
        size: [0.48, 0.32, 0.48],
        position: [x, cable.position.y, z],
        material: this.builder.materials.etch,
      });
      marker.userData.presentationOnly = true;
      marker.userData.targetId = cable.name;
      cable.add(marker);
      marker.position.set(0, 0, 0);
    }
  }

  private buildFinalSecurityArea(): void {
    const { duct, exit, wall } = this.builder.materials;

    this.builder.addCollider({ name: 'cultivation-room-3-exit-wall-west', size: [21, 30, 0.4], position: [-13.5, 15, 72], material: wall });
    this.builder.addCollider({ name: 'cultivation-room-3-exit-wall-east', size: [21, 30, 0.4], position: [13.5, 15, 72], material: wall });
    this.builder.addCollider({ name: 'cultivation-room-3-exit-wall-header', size: [6, 24, 0.4], position: [0, 18, 72], material: wall });
    this.builder.addCollider({ name: 'cultivation-room-3-exit-connector-floor', size: [6, 0.4, 4], position: [0, 0, 74], material: duct });
    this.builder.addVisualBox({ name: 'cultivation-room-3-exit-status-header', size: [6.4, 0.45, 0.5], position: [0, 6.3, 71.7], material: exit });

  }

  private addCheckpointAnchors(): void {
    this.addAnchor('cultivation-room-3-bob-checkpoint-anchor', LEVEL_TWO_ROOM_THREE_BOB_SPAWN, { checkpointRole: 'bob-upper' });
    this.addAnchor('cultivation-room-3-goop-checkpoint-anchor', LEVEL_TWO_ROOM_THREE_GOOP_SPAWN, { checkpointRole: 'goop-lower' });
    this.addAnchor('cultivation-room-3-bob-exit-trigger-anchor', new THREE.Vector3(-1.5, 3, 73.5), {
      triggerRole: 'bob-room-completion',
      sizeMetres: [3, 6, 3],
    });
    this.addAnchor('cultivation-room-3-goop-exit-trigger-anchor', new THREE.Vector3(1.5, 3, 73.5), {
      triggerRole: 'goop-room-completion',
      sizeMetres: [3, 6, 3],
    });
  }

  private addAnchor(
    name: string,
    position: THREE.Vector3,
    metadata: Readonly<Record<string, unknown>>,
  ): void {
    const anchor = new THREE.Object3D();
    anchor.name = name;
    anchor.position.copy(position);
    Object.assign(anchor.userData, metadata, {
      levelId: 'cultivation',
      roomId: 3,
    });
    this.root.add(anchor);
  }

  private createLasers(): readonly LaserHazard[] {
    return [
      new LaserHazard({
        id: 'cultivation-room-3-entry-sticky-laser',
        start: new THREE.Vector3(4.15, 20.5, 10.35),
        end: new THREE.Vector3(11.85, 20.5, 10.35),
        timeline: {
          axisWorld: new THREE.Vector3(0, 0, 1),
          repeat: true,
          steps: [
            { kind: 'hold', durationSeconds: 1.3, enabled: true, angleRadians: 0 },
            { kind: 'hold', durationSeconds: 0.9, enabled: false, angleRadians: 0 },
          ],
        },
      }),
      new LaserHazard({
        id: 'cultivation-room-3-central-sticky-laser',
        start: new THREE.Vector3(-0.65, 20, 31.7),
        end: new THREE.Vector3(-0.65, 20, 40.3),
        timeline: {
          axisWorld: new THREE.Vector3(1, 0, 0),
          repeat: true,
          steps: [
            { kind: 'hold', durationSeconds: 0.45, enabled: true, angleRadians: -0.2 },
            { kind: 'sweep', durationSeconds: 1.7, enabled: true, fromAngleRadians: -0.2, toAngleRadians: 0.2 },
            { kind: 'hold', durationSeconds: 0.45, enabled: true, angleRadians: 0.2 },
            { kind: 'sweep', durationSeconds: 1.7, enabled: true, fromAngleRadians: 0.2, toAngleRadians: -0.2 },
          ],
        },
      }),
      new LaserHazard({
        id: 'cultivation-room-3-high-sticky-laser',
        start: new THREE.Vector3(-12.85, 21.5, 53.65),
        end: new THREE.Vector3(-5.15, 21.5, 53.65),
        timeline: {
          axisWorld: new THREE.Vector3(0, 0, 1),
          repeat: true,
          steps: [
            { kind: 'hold', durationSeconds: 1.1, enabled: true, angleRadians: 0 },
            { kind: 'hold', durationSeconds: 1, enabled: false, angleRadians: 0 },
          ],
        },
      }),
    ];
  }
}

const asSlimeId = (
  id: string | undefined,
): RadioactiveFloorSlimeId | undefined =>
  id === 'bob' || id === 'goop' ? id : undefined;
