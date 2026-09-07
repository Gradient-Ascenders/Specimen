import * as THREE from 'three';
import type { DissolveTarget } from '../abilities/DissolveTarget.ts';
import { GreyboxDropPreview } from './GreyboxDropPreview.ts';

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
  LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.centreXMetres,
  LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.floorYMetres + 0.46,
  -3,
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
  readonly wallDrops: GreyboxDropPreview[] = [];
  private readonly wallTethers: THREE.Mesh[] = [];
  private readonly wallLaserGroups: THREE.Group[] = [];
  private laserMotionSeconds = 0;
  private readonly laserOffset = new THREE.Vector3();
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
    for (const hazard of hazards) {
      const group = new THREE.Group();
      group.name = `${hazard.id}-wall-mounted-visuals`;
      const parts = this.laserPresentation.root.children.filter(child => child.userData.laserHazardId === hazard.id);
      group.add(...parts);
      this.laserPresentation.root.add(group);
      this.wallLaserGroups.push(group);
    }
    this.root.add(this.lasers.root, this.laserPresentation.root);
    this.syncWallLasers();
    this.laserPresentation.sync();
  }

  bindDissolveTargets(targets: readonly DissolveTarget[]): void {
    for (const drop of this.wallDrops) drop.bind(targets);
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
    for (const drop of this.wallDrops) drop.update(deltaSeconds);
    this.laserMotionSeconds += deltaSeconds;
    this.syncWallLasers();
    this.lasers.updateTargets(deltaSeconds, this.localLaserTargets);
    this.laserPresentation.sync();
  }

  private syncWallLasers(): void {
    // Full six-metre wall height, bottom-to-top in 0.8 seconds.
    this.lasers.hazards[0].setTranslationOffset(this.laserOffset.set(
      0, this.wallDrops[0].mesh.position.y - 21 + 3 * Math.sin(this.laserMotionSeconds * Math.PI * 2 / 1.6), 0,
    ));
    this.lasers.hazards[1].setTranslationOffset(this.laserOffset.set(
      0, this.wallDrops[1].mesh.position.y - 23, 3.85 * Math.sin(this.laserMotionSeconds * Math.PI * 2 / 2),
    ));
    this.lasers.hazards[2].setTranslationOffset(this.laserOffset.set(
      0, this.wallDrops[2].mesh.position.y - 24.825 + 4.475 * Math.sin(this.laserMotionSeconds * Math.PI * 2 / 2.4), 0,
    ));
    for (let index = 0; index < this.lasers.hazards.length; index++) {
      const laser = this.lasers.hazards[index];
      laser.copyStart(this.laserOffset);
      const exposed = this.wallDrops[index].state !== 'suspended' && this.laserOffset.y < 29.35;
      laser.setEnabled(exposed);
      this.wallLaserGroups[index].visible = exposed;
    }
    for (let index = 0; index < this.wallDrops.length; index++) {
      const mesh = this.wallDrops[index].mesh;
      this.wallTethers[index].visible = mesh.position.y + (mesh.geometry as THREE.BoxGeometry).parameters.height / 2 < 29.65;
    }
  }

  updateRadiation(
    occupants: Iterable<RadioactiveFloorOccupant>,
  ): void {
    this.radiationHazard.update(occupants);
  }

  reset(): void {
    for (const drop of this.wallDrops) drop.reset();
    this.radiationHazard.reset();
    this.lasers.reset();
    this.laserMotionSeconds = 0;
    this.syncWallLasers();
    this.laserPresentation.sync();
  }

  dispose(): void {
    for (const drop of this.wallDrops) drop.dispose();
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
      { id: 'entry', size: [6, .5, 6.8], position: [8, 18.55, 3.6], routeBeat: 'read-first-drone' },
      { id: 'launch-island', size: [3, .5, 3], position: [8, 19.4, 9.5], routeBeat: 'straight-warmup-jump' },
      { id: 'cross-beam', size: [4, .5, 2.5], position: [3.5, 19.9, 14], routeBeat: 'diagonal-to-first-laser-wall' },
      { id: 'first-wall-exit', size: [4, .5, 3], position: [1, 23.75, 21], routeBeat: 'first-drone-window' },
      { id: 'offset-island', size: [3, .5, 3], position: [-4, 24, 25.5], routeBeat: 'offset-precision-jump' },
      { id: 'west-runup', size: [3.5, .5, 3], position: [-9, 22, 30], routeBeat: 'approach-sweeping-wall' },
      { id: 'west-wall-exit', size: [4, .5, 3.5], position: [-16, 26, 38], routeBeat: 'second-drone-window' },
      { id: 'west-return-island', size: [3, .5, 3], position: [-10, 26, 38], routeBeat: 'return-from-wall-crest' },
      { id: 'cross-room-a', size: [3, .5, 3], position: [-5, 25.5, 42], routeBeat: 'long-diagonal' },
      { id: 'cross-room-b', size: [3, .5, 3], position: [0, 22.7, 46.5], routeBeat: 'drop-to-final-wall-approach' },
      { id: 'final-wall-exit', size: [4, .5, 3], position: [3, 25.6, 54.5], routeBeat: 'third-drone-window' },
      { id: 'last-island', size: [3, .5, 3], position: [9, 24.8, 59], routeBeat: 'last-precision-jump' },
      { id: 'drop-launch', size: [4.5, .5, 3], position: [5, 24, 63], routeBeat: 'drop-behind-ground-drones-no-fall-damage' },
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
      size: [8, 6, 0.18],
      position: [1, 21, 18],
      material: sticky,
    });
    this.addStickyPanel({
      name: 'cultivation-room-3-central-sticky-transfer',
      size: [0.18, 7, 8],
      position: [-13, 23, 35.5],
      material: sticky,
    });
    // Continuous adhesive floor from the wall crest to the landing. The
    // horizontal surface gives edge adhesion a real new ground to acquire.
    this.builder.addCollider({
      name: 'cultivation-room-3-first-wall-sticky-landing',
      size: [4, .18, 1.55], position: [1, 23.91, 18.725], material: sticky,
      surfaceTag: 'sticky', textureRole: 'sticky-vent-tile',
    });
    this.addStickyPanel({
      name: 'cultivation-room-3-high-sticky-transfer',
      size: [8, 9.65, 0.18],
      position: [3, 24.825, 51],
      material: sticky,
    });
    this.buildThirdWallOpening();
    this.builder.addCollider({
      name: 'cultivation-room-3-second-wall-sticky-landing',
      size: [.96, .18, 3.5], position: [-13.52, 26.41, 38], material: sticky,
      surfaceTag: 'sticky', textureRole: 'sticky-vent-tile',
    });
    this.addStickyPanel({
      name: 'cultivation-room-3-cover-sticky-transfer',
      size: [.18, 8.35, 7.5], position: [-1.5, 25.475, 24.75], material: sticky,
    });
    this.addStickyPanel({
      name: 'cultivation-room-3-second-cover-sticky-transfer',
      size: [9.5, 8, .18], position: [-8.25, 25.65, 39.8], material: sticky,
    });
    this.configureDropWalls();

    // Supports make each rest area read as a maintenance route rather than a
    // collection of arbitrary boxes suspended in an empty room.
    for (const [name, x, y, z, height] of [
      ['first-wall-exit', 1, 11.8, 21, 23.6],
      ['west-wall-exit', -16, 13, 38, 26],
      ['final-wall-exit', 3, 12.8, 54.5, 25.6],
    ] as const) {
      this.builder.addCollider({
        name: `cultivation-room-3-${name}-support`,
        size: [0.8, height, 0.8],
        position: [x, y, z],
        material: support,
      });
    }
  }

  private buildThirdWallOpening(): void {
    const panel = this.root.getObjectByName('cultivation-room-3-high-sticky-transfer') as THREE.Mesh;
    // The parent keeps the assembly pose, but only the four solid sections
    // participate in rendering/collision. There is no invisible box in the hole.
    this.collisionMeshes.splice(this.collisionMeshes.indexOf(panel), 1);
    panel.material = new THREE.MeshBasicMaterial({ visible: false });
    const sections = [
      { name: 'below-opening', size: [8, 5.85, .18], position: [3, 22.925, 51] },
      { name: 'above-opening', size: [8, 1.6, .18], position: [3, 28.85, 51] },
      { name: 'opening-left', size: [2.8, 2.2, .18], position: [.4, 26.95, 51] },
      { name: 'opening-right', size: [2.8, 2.2, .18], position: [5.6, 26.95, 51] },
    ] as const;
    for (const section of sections) {
      const part = this.builder.addCollider({
        name: `${panel.name}-${section.name}`, size: section.size, position: section.position,
        material: this.builder.materials.sticky, surfaceTag: 'sticky',
        movementFaceMode: 'vertical-sides', textureRole: 'sticky-wall-tile',
      });
      Object.assign(part.userData, { levelId: 'cultivation', roomId: 3, routeOwner: 'bob' });
      panel.attach(part);
    }
    const floor = this.builder.addCollider({
      name: `${panel.name}-opening-floor`, size: [2.4, .18, 1.91],
      position: [3, 25.76, 52.045], material: this.builder.materials.sticky,
      surfaceTag: 'sticky', textureRole: 'sticky-vent-tile',
    });
    panel.attach(floor);
  }

  private configureDropWalls(): void {
    for (const [index, name] of ['entry', 'central', 'high', 'cover', 'second-cover'].entries()) {
      const panel = this.root.getObjectByName(`cultivation-room-3-${name}-sticky-transfer`) as THREE.Mesh<THREE.BoxGeometry>;
      const landing = panel.position.clone();
      panel.userData.dynamicAssembly = true;
      const height = panel.geometry.parameters.height;
      const thinX = panel.geometry.parameters.width < panel.geometry.parameters.depth;
      // Guide rails visually attach the travelling emitters to their panel.
      for (const side of index < 3 ? [-1, 1] : []) {
        const rail = this.builder.addVisualBox({
          name: `${panel.name}-laser-guide-${side}`,
          size: index === 1 ? [.3, .1, 7.9] : [.1, height - .1, .3],
          position: [0, 0, 0], material: this.builder.materials.support,
        });
        panel.add(rail);
        rail.position.set(index === 1 ? .2 : side * 3.85, index === 1 ? side * 3.35 : 0, index === 1 ? 0 : -.2);
      }
      const raised = landing.clone();
      // Store the entire panel above the ceiling underside. Only its wooden
      // retaining latch protrudes into the room for Goop to shoot.
      raised.y = 29.85 + height / 2;
      const brace = this.builder.addCollider({
        name: `${panel.name}-wooden-latch`,
        size: thinX ? [.65, .4, 2.4] : [2.4, .4, .65],
        position: [raised.x, 29.6, raised.z],
        material: this.builder.materials.wood,
        interactionRole: 'goop-dissolvable',
      });
      Object.assign(brace.userData, {
        soluble: true, solubleId: brace.name, roomId: 3, levelId: 'cultivation',
        textureRole: 'wooden-support', dissolveDurationSeconds: .8,
        releaseMode: 'permanent-sticky-wall-drop',
      });
      this.solubleTargetMeshes.push(brace);
      const lipName = index === 0 ? 'first' : index === 1 ? 'second' : undefined;
      if (lipName) {
        const lip = this.root.getObjectByName(`cultivation-room-3-${lipName}-wall-sticky-landing`)!;
        panel.attach(lip);
      }
      const tether = this.builder.addVisualBox({
        name: `${panel.name}-retaining-cable`, size: [.1, 1, .1],
        position: [landing.x, 29.65, landing.z], material: this.builder.materials.cable,
      });
      this.wallTethers.push(tether);
      this.wallDrops.push(new GreyboxDropPreview({
        id: `${panel.name}-drop`, mesh: panel, solubleTargetId: brace.name,
        suspendedPosition: raised, landingPosition: landing,
        fallDurationSeconds: .9, fallTiltRadians: 0,
        tetherMesh: tether, tetherAnchorPosition: new THREE.Vector3(landing.x, 29.65, landing.z),
        tetherAttachmentOffsetY: height / 2,
      }));
      this.builder.addVisualBox({
        name: `${panel.name}-ceiling-mount`,
        size: [panel.geometry.parameters.width + .42, .3, panel.geometry.parameters.depth + .42],
        position: [landing.x, 29.65, landing.z], material: this.builder.materials.support,
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
        start: new THREE.Vector3(-2.85, 21, 17.65),
        end: new THREE.Vector3(4.85, 21, 17.65),
      }),
      new LaserHazard({
        id: 'cultivation-room-3-central-sticky-laser',
        start: new THREE.Vector3(-12.65, 19.65, 35.5),
        end: new THREE.Vector3(-12.65, 26.35, 35.5),
      }),
      new LaserHazard({
        id: 'cultivation-room-3-high-sticky-laser',
        start: new THREE.Vector3(-0.85, 24.825, 50.65),
        end: new THREE.Vector3(6.85, 24.825, 50.65),
      }),
    ];
  }
}

const asSlimeId = (
  id: string | undefined,
): RadioactiveFloorSlimeId | undefined =>
  id === 'bob' || id === 'goop' ? id : undefined;
