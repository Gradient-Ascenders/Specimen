import * as THREE from 'three';

import type { DissolveTarget } from '../abilities/DissolveTarget.ts';
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
import type { ProximityShutterDoor } from '../puzzle/ProximityShutterDoor.ts';
import { GreyboxDropPreview } from './GreyboxDropPreview.ts';
import { LEVEL_TWO_BOB_AIR_DUCT_LAYOUT } from './LevelTwoAirDuctGreybox.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';

export const LEVEL_TWO_ROOM_TWO_BOB_SPAWN = new THREE.Vector3(-3, 0.66, 4);
export const LEVEL_TWO_ROOM_TWO_GOOP_SPAWN = new THREE.Vector3(3, 0.66, 4);

interface BlockAssemblyDefinition {
  readonly id: string;
  readonly finalPosition: readonly [number, number, number];
  readonly suspendedPosition: readonly [number, number, number];
}

const BLOCK_ASSEMBLIES: readonly BlockAssemblyDefinition[] = [
  {
    id: 'cultivation-room-2-block-1',
    finalPosition: [-11.5, 12.5, 30],
    suspendedPosition: [-11.5, 19.5, 30],
  },
  {
    id: 'cultivation-room-2-block-2',
    finalPosition: [-5.5, 14, 35],
    suspendedPosition: [-5.5, 20.5, 35],
  },
  {
    id: 'cultivation-room-2-block-3',
    finalPosition: [1, 15.5, 39.5],
    suspendedPosition: [1, 21, 39.5],
  },
];

const WALL_BUTTON_PRESS_DURATION_SECONDS = 0.6;
const WALL_BUTTON_PRESS_TRAVEL_METRES = 0.14;
const WALL_BUTTON_READY_COLOUR = new THREE.Color(0xe53945);
const WALL_BUTTON_READY_EMISSIVE = new THREE.Color(0x5a0008);
const WALL_BUTTON_PRESSED_COLOUR = new THREE.Color(0x62ff91);
const WALL_BUTTON_PRESSED_EMISSIVE = new THREE.Color(0x0d8a35);

export interface LevelTwoRoomTwoHazardFailure {
  readonly roomId: 2;
  readonly hazardId: string;
  readonly slimeId?: RadioactiveFloorSlimeId;
}

export interface LevelTwoRoomTwoOccupant extends RadioactiveFloorOccupant {
  readonly attached?: boolean;
  readonly supportCollider?: THREE.Mesh | null;
}

interface LocalLaserContactTarget extends LaserContactTarget {
  readonly id: RadioactiveFloorSlimeId;
  readonly position: THREE.Vector3;
  radiusMetres: number;
}

interface WallButtonPresentation {
  readonly surface: THREE.Mesh;
  readonly pad: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  readonly statusLight: THREE.PointLight;
  readonly padRestX: number;
}

/** Large Room 2 split-route puzzle with measured wall lasers and block jumps. */
export class LevelTwoRoomTwoGreybox {
  readonly builder = new GreyboxRoomBuilder('cultivation-room-2-greybox');
  readonly root = this.builder.root;
  readonly collisionMeshes = this.builder.collisionMeshes;
  readonly solubleTargetMeshes: THREE.Mesh[] = [];
  readonly blockDrops: GreyboxDropPreview[] = [];
  readonly lasers: LaserHazardSystem;
  readonly radiationHazard: RadioactiveFloorHazard;
  readonly wallButton: THREE.Mesh;

  private readonly goopExitDoor: ProximityShutterDoor;
  private readonly wallButtonPresentation: WallButtonPresentation;
  private readonly laserPresentation: LaserHazardPresentation;
  private readonly localLaserTargetById: Readonly<
    Record<RadioactiveFloorSlimeId, LocalLaserContactTarget>
  > = {
    bob: { id: 'bob', position: new THREE.Vector3(), radiusMetres: 0.45 },
    goop: { id: 'goop', position: new THREE.Vector3(), radiusMetres: 0.45 },
  };
  private readonly localLaserTargets: LocalLaserContactTarget[] = [];
  private wallButtonPresentationPressed: boolean | undefined;
  private wallButtonPressProgress = 0;

  constructor(
    requestFailure: (failure: LevelTwoRoomTwoHazardFailure) => void,
    goopExitDoor: ProximityShutterDoor,
  ) {
    this.root.userData.levelId = 'cultivation';
    this.root.userData.roomId = 2;
    const radiationFloor = this.buildShell();
    this.radiationHazard = new RadioactiveFloorHazard({
      id: radiationFloor.name,
      mesh: radiationFloor,
      lethalSlimeIds: ['bob'],
      requestRecovery: (slimeId) =>
        requestFailure({
          roomId: 2,
          hazardId: radiationFloor.name,
          slimeId,
        }),
    });
    this.goopExitDoor = goopExitDoor;
    this.wallButtonPresentation = this.buildStickyButtonRoute();
    this.wallButton = this.wallButtonPresentation.surface;
    this.setWallButtonPresentationPressed(false, true);
    this.buildBlastDoor();
    this.buildSuspendedBlocks();
    this.buildBobExitVent();
    this.addProgressionAnchors();

    const hazards = this.createLasers();
    this.lasers = new LaserHazardSystem({
      id: 'cultivation-room-2-wall-route-lasers',
      hazards,
      requestRecovery: (hazard, target) =>
        requestFailure({
          roomId: 2,
          hazardId: hazard.id,
          slimeId: asSlimeId(target.id),
        }),
    });
    this.laserPresentation = new LaserHazardPresentation(hazards);
    this.root.add(this.lasers.root, this.laserPresentation.root);
  }

  bindDissolveTargets(targets: readonly DissolveTarget[]): void {
    for (const drop of this.blockDrops) drop.bind(targets);
  }

  update(
    deltaSeconds: number,
    occupants: readonly LevelTwoRoomTwoOccupant[],
  ): void {
    let bobHoldingButton = false;
    this.root.updateWorldMatrix(true, false);
    this.localLaserTargets.length = 0;
    for (const occupant of occupants) {
      if (occupant.id === 'bob') {
        bobHoldingButton =
          occupant.attached === true &&
          occupant.supportCollider === this.wallButton;
      }
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
    this.setWallButtonPresentationPressed(bobHoldingButton);
    this.updateWallButtonPressAnimation(deltaSeconds);
    this.goopExitDoor.setLocked(!bobHoldingButton);

    for (const drop of this.blockDrops) drop.update(deltaSeconds);
    this.lasers.updateTargets(deltaSeconds, this.localLaserTargets);
    this.laserPresentation.sync();
  }

  updateRadiation(
    occupants: Iterable<RadioactiveFloorOccupant>,
  ): void {
    this.radiationHazard.update(occupants);
  }

  reset(): void {
    for (const drop of this.blockDrops) drop.reset();
    this.radiationHazard.reset();
    this.setWallButtonPresentationPressed(false, true);
    this.goopExitDoor.setLocked(true);
    this.lasers.reset();
    this.laserPresentation.sync();
  }

  dispose(): void {
    for (const drop of this.blockDrops) drop.dispose();
    this.blockDrops.length = 0;
    this.radiationHazard.dispose();
    this.laserPresentation.dispose();
    this.lasers.dispose();
    this.solubleTargetMeshes.length = 0;
    this.builder.dispose();
  }

  private buildShell(): THREE.Mesh {
    const { acid, floor, wall } = this.builder.materials;

    this.builder.addCollider({
      name: 'cultivation-room-2-start-floor',
      size: [37.6, 0.4, 8],
      position: [0, 0, 4],
      material: floor,
    });
    const radiation = this.builder.addCollider({
      name: 'cultivation-room-2-radioactive-floor',
      size: [37.6, 0.3, 37],
      position: [0, -0.15, 26.5],
      material: acid,
      textureRole: 'acid-floor',
    });
    radiation.userData.levelId = 'cultivation';
    radiation.userData.roomId = 2;
    radiation.userData.hazardRole = 'radioactive';
    radiation.userData.hazardPolicy = 'bob-lethal-goop-immune';
    this.builder.addCollider({
      name: 'cultivation-room-2-west-wall',
      size: [0.4, 24, 45],
      position: [-19, 12, 22.5],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-2-east-wall',
      size: [0.4, 24, 45],
      position: [19, 12, 22.5],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-2-ceiling',
      size: [38, 0.4, 45],
      position: [0, 24, 22.5],
      material: wall,
    });

    this.builder.addCollider({
      name: 'cultivation-room-2-entry-wall-west',
      size: [17, 24, 0.4],
      position: [-10.5, 12, 0],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-2-entry-wall-east',
      size: [17, 24, 0.4],
      position: [10.5, 12, 0],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-2-entry-wall-header',
      size: [4, 19.4, 0.4],
      position: [0, 14.3, 0],
      material: wall,
    });

    this.builder.addLight(
      'cultivation-room-2-radiation-light-near',
      [-7, 3.5, 17],
      0xa7ff32,
      18,
      24,
    );
    this.builder.addLight(
      'cultivation-room-2-radiation-light-far',
      [7, 3.5, 32],
      0xa7ff32,
      18,
      24,
    );
    this.builder.addLight(
      'cultivation-room-2-button-light',
      [-17, 17, 27],
      0xffc45e,
      10,
      13,
    );
    return radiation;
  }

  private buildStickyButtonRoute(): WallButtonPresentation {
    const { sticky, support } = this.builder.materials;
    const panels: ReadonlyArray<{
      readonly id: string;
      readonly size: readonly [number, number, number];
      readonly position: readonly [number, number, number];
    }> = [
      { id: 'a', size: [0.18, 5.5, 7], position: [-18.72, 3.1, 7.5] },
      { id: 'b', size: [0.18, 4.8, 6], position: [-18.72, 6, 12.5] },
      { id: 'c', size: [0.18, 5.2, 7], position: [-18.72, 8.8, 17.5] },
      { id: 'd', size: [0.18, 5.2, 7], position: [-18.72, 11.2, 22.5] },
      { id: 'e', size: [0.18, 5.5, 7], position: [-18.72, 13.6, 27.5] },
    ];

    for (const panel of panels) {
      const collider = this.builder.addCollider({
        name: `cultivation-room-2-sticky-route-${panel.id}`,
        size: panel.size,
        position: panel.position,
        material: sticky,
        surfaceTag: 'sticky',
        movementFaceMode: 'vertical-sides',
        textureRole: 'sticky-wall-tile',
      });
      collider.userData.levelId = 'cultivation';
      collider.userData.roomId = 2;
      collider.userData.routeOrder = panels.indexOf(panel) + 1;
    }

    const buttonCollisionMaterial = new THREE.MeshBasicMaterial({
      visible: false,
    });
    const button = this.builder.addCollider({
      name: 'cultivation-room-2-wall-button',
      size: [0.28, 1.5, 1.5],
      position: [-18.5, 14.2, 28.5],
      material: buttonCollisionMaterial,
      surfaceTag: 'sticky',
      movementFaceMode: 'vertical-sides',
    });
    button.userData.levelId = 'cultivation';
    button.userData.roomId = 2;
    button.userData.interactionRole = 'bob-adhesion-hold-button';
    button.userData.controlsId = 'cultivation-room-2-blast-door';
    button.userData.textureRole = 'sticky-button-face';

    const padMaterial = new THREE.MeshStandardMaterial({
      color: WALL_BUTTON_READY_COLOUR,
      emissive: WALL_BUTTON_READY_EMISSIVE,
      emissiveIntensity: 0.3,
      roughness: 0.38,
      metalness: 0.18,
    });
    const padRestX = -18.49;
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 1.4, 1.4),
      padMaterial,
    );
    pad.name = 'cultivation-room-2-wall-button-pad';
    pad.position.set(padRestX, 14.2, 28.5);
    pad.userData.presentationOnly = true;
    pad.userData.visualRole = 'wall-button-square-pad';
    pad.userData.textureRole = 'sticky-button-face';
    this.root.add(pad);

    const statusLight = this.builder.addLight(
      'cultivation-room-2-wall-button-status-light',
      [-17.9, 14.2, 28.5],
      0xe53945,
      1,
      5,
    );
    statusLight.userData.presentationOnly = true;
    statusLight.userData.visualRole = 'wall-button-status';

    this.builder.addCollider({
      name: 'cultivation-room-2-button-rest-ledge',
      size: [2.6, 0.5, 3],
      position: [-17.35, 11.6, 29],
      material: support,
    });
    return {
      surface: button,
      pad,
      statusLight,
      padRestX,
    };
  }

  private buildBlastDoor(): void {
    const { wall } = this.builder.materials;
    const duct = LEVEL_TWO_BOB_AIR_DUCT_LAYOUT;
    const roomHeightMetres = 24;
    const openingTopMetres = duct.floorYMetres + duct.innerHeightMetres;
    const jambOffsetXMetres =
      duct.innerWidthMetres * 0.5 + duct.wallJambWidthMetres * 0.5;

    this.builder.addCollider({
      name: 'cultivation-room-2-far-wall-west',
      size: [17, 24, 0.4],
      position: [-10.5, 12, 45],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-2-far-wall-middle',
      size: [4.4, 24, 0.4],
      position: [4.2, 12, 45],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-2-far-wall-east',
      size: [9.4, 24, 0.4],
      position: [14.3, 12, 45],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-2-above-blast-door',
      size: [4, 19.4, 0.4],
      position: [0, 14.3, 45],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-2-below-bob-vent',
      size: [duct.wallBayWidthMetres, duct.floorYMetres, 0.4],
      position: [duct.centreXMetres, duct.floorYMetres * 0.5, 45],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-2-above-bob-vent',
      size: [
        duct.wallBayWidthMetres,
        roomHeightMetres - openingTopMetres,
        0.4,
      ],
      position: [
        duct.centreXMetres,
        (roomHeightMetres + openingTopMetres) * 0.5,
        45,
      ],
      material: wall,
    });
    for (const [side, direction] of [
      ['west', -1],
      ['east', 1],
    ] as const) {
      this.builder.addCollider({
        name: `cultivation-room-2-bob-vent-${side}-jamb`,
        size: [duct.wallJambWidthMetres, duct.innerHeightMetres, 0.4],
        position: [
          duct.centreXMetres + direction * jambOffsetXMetres,
          duct.floorYMetres + duct.innerHeightMetres * 0.5,
          45,
        ],
        material: wall,
      });
    }

  }

  private buildSuspendedBlocks(): void {
    const { etch, platform, support, wood } = this.builder.materials;

    for (const definition of BLOCK_ASSEMBLIES) {
      const [suspendedX, , suspendedZ] = definition.suspendedPosition;
      const block = this.builder.addCollider({
        name: `${definition.id}-block`,
        size: [3.8, 0.6, 3.8],
        position: definition.suspendedPosition,
        material: platform,
      });
      block.userData.levelId = 'cultivation';
      block.userData.roomId = 2;
      block.userData.assemblyId = definition.id;
      block.userData.suspendedPosition = [...definition.suspendedPosition];
      block.userData.landingPosition = [...definition.finalPosition];
      block.userData.releaseMode = 'rope-limited-elevated-drop';

      this.builder.addVisualBox({
        name: `${definition.id}-ceiling-mount`,
        size: [1.7, 0.5, 1.7],
        position: [suspendedX, 23.55, suspendedZ],
        material: support,
      });
      const strongRope = this.builder.addVisualBox({
        name: `${definition.id}-non-soluble-rope`,
        size: [0.22, 1, 0.22],
        position: [suspendedX, 22.8, suspendedZ],
        material: support,
      });

      const brace = this.builder.addCollider({
        name: `${definition.id}-soluble-wooden-brace`,
        size: [2.2, 0.5, 0.8],
        position: [suspendedX, 23.1, suspendedZ],
        material: wood,
        interactionRole: 'goop-dissolvable',
      });
      brace.userData.soluble = true;
      brace.userData.solubleId = brace.name;
      brace.userData.textureRole = 'soluble-wooden-brace';
      brace.userData.levelId = 'cultivation';
      brace.userData.roomId = 2;
      brace.userData.assemblyId = definition.id;
      brace.userData.releaseMode = 'rope-limited-elevated-drop';
      this.solubleTargetMeshes.push(brace);

      const marker = this.builder.addVisualBox({
        name: `${definition.id}-soluble-marker`,
        size: [0.9, 0.58, 0.88],
        position: [suspendedX, 23.1, suspendedZ],
        material: etch,
      });
      marker.userData.presentationOnly = true;
      marker.userData.targetId = brace.name;
      brace.add(marker);
      marker.position.set(0, 0, 0);

      this.blockDrops.push(
        new GreyboxDropPreview({
          id: definition.id,
          mesh: block,
          solubleTargetId: brace.name,
          suspendedPosition: new THREE.Vector3(...definition.suspendedPosition),
          landingPosition: new THREE.Vector3(...definition.finalPosition),
          fallDurationSeconds: 1,
          fallTiltRadians: 0.05,
          tetherMesh: strongRope,
          tetherAnchorPosition: new THREE.Vector3(
            suspendedX,
            22.9,
            suspendedZ,
          ),
          tetherAttachmentOffsetY: 0.3,
        }),
      );
    }
  }

  private buildBobExitVent(): void {
    const { sticky } = this.builder.materials;
    const duct = LEVEL_TWO_BOB_AIR_DUCT_LAYOUT;

    // End the adhesive route exactly at the lower edge of the open vent.
    // The previous 6 x 8 m panel extended across the aperture itself, making
    // the visually open vent a solid sticky collider.
    const stickyApproach = this.builder.addCollider({
      name: 'cultivation-room-2-final-vent-sticky-approach',
      size: [duct.innerWidthMetres, 3, 0.18],
      position: [
        duct.centreXMetres,
        duct.floorYMetres - 1.5,
        44.72,
      ],
      material: sticky,
      surfaceTag: 'sticky',
      movementFaceMode: 'vertical-sides',
      textureRole: 'sticky-wall-tile',
    });
    stickyApproach.userData.levelId = 'cultivation';
    stickyApproach.userData.roomId = 2;
  }

  private addProgressionAnchors(): void {
    this.addAnchor(
      'cultivation-room-2-bob-checkpoint-anchor',
      LEVEL_TWO_ROOM_TWO_BOB_SPAWN,
      { checkpointRole: 'bob' },
    );
    this.addAnchor(
      'cultivation-room-2-goop-checkpoint-anchor',
      LEVEL_TWO_ROOM_TWO_GOOP_SPAWN,
      { checkpointRole: 'goop' },
    );
    this.addAnchor(
      'cultivation-room-2-goop-room-3-entry-trigger-anchor',
      new THREE.Vector3(0, 3, 47),
      {
        triggerRole: 'split-room-entry',
        requiredSlimeId: 'goop',
        sizeMetres: [4, 4.6, 3],
      },
    );
    this.addAnchor(
      'cultivation-room-2-bob-room-3-entry-trigger-anchor',
      new THREE.Vector3(
        LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.centreXMetres,
        LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.floorYMetres +
          LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.innerHeightMetres * 0.5,
        48,
      ),
      {
        triggerRole: 'split-room-entry',
        requiredSlimeId: 'bob',
        sizeMetres: [
          LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.innerWidthMetres,
          LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.innerHeightMetres,
          3,
        ],
      },
    );
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
      roomId: 2,
    });
    this.root.add(anchor);
  }

  private createLasers(): readonly LaserHazard[] {
    return [
      new LaserHazard({
        id: 'cultivation-room-2-laser-1-panel-b-crossbar',
        start: new THREE.Vector3(-18.38, 6.3, 10),
        end: new THREE.Vector3(-18.38, 6.3, 15.35),
      }),
      new LaserHazard({
        id: 'cultivation-room-2-laser-2-panel-c-vertical',
        start: new THREE.Vector3(-18.38, 6.8, 19.3),
        end: new THREE.Vector3(-18.38, 11.1, 19.3),
        timeline: {
          axisWorld: new THREE.Vector3(1, 0, 0),
          repeat: true,
          steps: [
            { kind: 'hold', durationSeconds: 0.5, enabled: true, angleRadians: -0.18 },
            { kind: 'sweep', durationSeconds: 1.8, enabled: true, fromAngleRadians: -0.18, toAngleRadians: 0.18 },
            { kind: 'hold', durationSeconds: 0.5, enabled: true, angleRadians: 0.18 },
            { kind: 'sweep', durationSeconds: 1.8, enabled: true, fromAngleRadians: 0.18, toAngleRadians: -0.18 },
          ],
        },
      }),
    ];
  }

  private setWallButtonPresentationPressed(
    pressed: boolean,
    immediate = false,
  ): void {
    if (this.wallButtonPresentationPressed === pressed && !immediate) return;
    this.wallButtonPresentationPressed = pressed;
    const { surface } = this.wallButtonPresentation;
    surface.userData.pressed = pressed;
    surface.userData.presentationState = pressed ? 'pressed-green' : 'ready-red';
    if (immediate) {
      this.wallButtonPressProgress = pressed ? 1 : 0;
      this.writeWallButtonPressPose();
    }
  }

  private updateWallButtonPressAnimation(deltaSeconds: number): void {
    const target = this.wallButtonPresentationPressed ? 1 : 0;
    const maximumStep =
      Math.max(0, deltaSeconds) / WALL_BUTTON_PRESS_DURATION_SECONDS;
    this.wallButtonPressProgress += THREE.MathUtils.clamp(
      target - this.wallButtonPressProgress,
      -maximumStep,
      maximumStep,
    );
    this.writeWallButtonPressPose();
  }

  private writeWallButtonPressPose(): void {
    const { surface, pad, statusLight, padRestX } =
      this.wallButtonPresentation;
    const progress = this.wallButtonPressProgress;
    pad.position.x =
      padRestX - WALL_BUTTON_PRESS_TRAVEL_METRES * progress;
    pad.material.color.lerpColors(
      WALL_BUTTON_READY_COLOUR,
      WALL_BUTTON_PRESSED_COLOUR,
      progress,
    );
    pad.material.emissive.lerpColors(
      WALL_BUTTON_READY_EMISSIVE,
      WALL_BUTTON_PRESSED_EMISSIVE,
      progress,
    );
    pad.material.emissiveIntensity = THREE.MathUtils.lerp(0.3, 1.5, progress);
    pad.userData.presentationState = surface.userData.presentationState;
    pad.userData.pressProgress = progress;
    pad.userData.pressDurationSeconds = WALL_BUTTON_PRESS_DURATION_SECONDS;
    statusLight.color.lerpColors(
      WALL_BUTTON_READY_COLOUR,
      WALL_BUTTON_PRESSED_COLOUR,
      progress,
    );
    statusLight.intensity = THREE.MathUtils.lerp(1, 8, progress);
    statusLight.userData.presentationState = surface.userData.presentationState;
  }
}

const asSlimeId = (
  id: string | undefined,
): RadioactiveFloorSlimeId | undefined =>
  id === 'bob' || id === 'goop' ? id : undefined;
