import type { SphereTriggerOccupant } from '../puzzle/BoxTriggerSensor.ts';
import { ProximityShutterDoor } from '../puzzle/ProximityShutterDoor.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';

export interface LevelTwoLabPassageGreyboxOptions {
  readonly id: string;
  readonly fromRoomId: 1 | 2;
  readonly toRoomId: 2 | 3;
  readonly widthMetres: number;
  readonly heightMetres: number;
  readonly lengthMetres: number;
  readonly doorwayWidthMetres: number;
  readonly doorwayHeightMetres: number;
  readonly entryInitiallyLocked?: boolean;
  readonly routeOwner?: 'both' | 'bob' | 'goop';
}

/**
 * Small, neutral laboratory passage separating two Cultivation puzzle rooms.
 * It deliberately owns no puzzle state so art can later dress it without
 * coupling room progression to decorative geometry.
 */
export class LevelTwoLabPassageGreybox {
  readonly builder: GreyboxRoomBuilder;
  readonly root;
  readonly collisionMeshes;
  readonly entryDoor: ProximityShutterDoor;
  readonly exitDoor: ProximityShutterDoor;
  readonly doors: readonly ProximityShutterDoor[];

  constructor(options: LevelTwoLabPassageGreyboxOptions) {
    if (!options.id) throw new Error('Level 2 passage IDs cannot be empty.');
    for (const dimension of [
      options.widthMetres,
      options.heightMetres,
      options.lengthMetres,
      options.doorwayWidthMetres,
      options.doorwayHeightMetres,
    ]) {
      if (!Number.isFinite(dimension) || dimension <= 0) {
        throw new Error('Level 2 passage dimensions must be positive.');
      }
    }
    if (
      options.doorwayWidthMetres >= options.widthMetres ||
      options.doorwayHeightMetres >= options.heightMetres
    ) {
      throw new Error(
        'Level 2 passage doorways must be smaller than their passage shell.',
      );
    }

    this.builder = new GreyboxRoomBuilder(options.id);
    this.root = this.builder.root;
    this.collisionMeshes = this.builder.collisionMeshes;
    Object.assign(this.root.userData, {
      levelId: 'cultivation',
      passageRole: 'laboratory-transition',
      fromRoomId: options.fromRoomId,
      toRoomId: options.toRoomId,
      routeOwner: options.routeOwner ?? 'both',
    });
    this.build(options);
    this.entryDoor = this.addDoor(
      options,
      'entry',
      0.25,
      options.entryInitiallyLocked ?? false,
    );
    this.exitDoor = this.addDoor(
      options,
      'exit',
      options.lengthMetres - 0.25,
      false,
    );
    this.doors = [this.entryDoor, this.exitDoor];
  }

  update(
    deltaSeconds: number,
    occupants: Iterable<SphereTriggerOccupant>,
  ): void {
    for (const door of this.doors) door.update(deltaSeconds, occupants);
  }

  reset(): void {
    for (const door of this.doors) door.reset();
  }

  dispose(): void {
    for (const door of this.doors) door.dispose();
    this.builder.dispose();
  }

  private build(options: LevelTwoLabPassageGreyboxOptions): void {
    const { floor, support, wall } = this.builder.materials;
    const halfWidth = options.widthMetres * 0.5;
    const halfHeight = options.heightMetres * 0.5;
    const halfLength = options.lengthMetres * 0.5;

    this.builder.addCollider({
      name: `${options.id}-floor`,
      size: [options.widthMetres, 0.4, options.lengthMetres],
      position: [0, 0, halfLength],
      material: floor,
    });
    this.builder.addCollider({
      name: `${options.id}-ceiling`,
      size: [options.widthMetres, 0.3, options.lengthMetres],
      position: [0, options.heightMetres, halfLength],
      material: wall,
    });
    this.builder.addCollider({
      name: `${options.id}-west-wall`,
      size: [0.3, options.heightMetres, options.lengthMetres],
      position: [-halfWidth, halfHeight, halfLength],
      material: wall,
    });
    this.builder.addCollider({
      name: `${options.id}-east-wall`,
      size: [0.3, options.heightMetres, options.lengthMetres],
      position: [halfWidth, halfHeight, halfLength],
      material: wall,
    });

    // Non-colliding frames divide the blank shell into readable lab bays and
    // give the art pass obvious anchors without obstructing either slime.
    for (const [index, z] of [
      options.lengthMetres / 3,
      (options.lengthMetres * 2) / 3,
    ].entries()) {
      this.builder.addVisualBox({
        name: `${options.id}-ceiling-frame-${index + 1}`,
        size: [options.widthMetres - 0.35, 0.28, 0.32],
        position: [0, options.heightMetres - 0.22, z],
        material: support,
      });
      this.builder.addLight(
        `${options.id}-light-${index + 1}`,
        [0, options.heightMetres - 0.8, z],
        0xdff7ff,
        8,
        Math.max(options.widthMetres, 8),
      );
    }
  }

  private addDoor(
    options: LevelTwoLabPassageGreyboxOptions,
    location: 'entry' | 'exit',
    z: number,
    initiallyLocked: boolean,
  ): ProximityShutterDoor {
    const id = `${options.id}-${location}`;
    const door = new ProximityShutterDoor({
      id,
      widthMetres: options.doorwayWidthMetres,
      heightMetres: options.doorwayHeightMetres,
      initiallyLocked,
      proximityDepthMetres: 7,
    });
    door.root.position.z = z;
    door.root.userData.fromRoomId = options.fromRoomId;
    door.root.userData.toRoomId = options.toRoomId;
    door.root.userData.passageDoorLocation = location;
    this.root.add(door.root);
    this.collisionMeshes.push(door.collisionMesh);

    const { wall } = this.builder.materials;
    const sideWidth =
      (options.widthMetres - options.doorwayWidthMetres) * 0.5;
    const sideOffset = options.doorwayWidthMetres * 0.5 + sideWidth * 0.5;
    const headerHeight =
      options.heightMetres - options.doorwayHeightMetres;
    this.builder.addCollider({
      name: `${id}-partition-west`,
      size: [sideWidth, options.heightMetres, 0.35],
      position: [-sideOffset, options.heightMetres * 0.5, z],
      material: wall,
    });
    this.builder.addCollider({
      name: `${id}-partition-east`,
      size: [sideWidth, options.heightMetres, 0.35],
      position: [sideOffset, options.heightMetres * 0.5, z],
      material: wall,
    });
    this.builder.addCollider({
      name: `${id}-partition-header`,
      size: [
        options.doorwayWidthMetres,
        headerHeight,
        0.35,
      ],
      position: [
        0,
        options.doorwayHeightMetres + headerHeight * 0.5,
        z,
      ],
      material: wall,
    });
    return door;
  }
}
