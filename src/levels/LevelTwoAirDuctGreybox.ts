import * as THREE from 'three';

import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';

/** Shared placement and clear-space contract for Bob's Room 2-to-3 duct. */
export const LEVEL_TWO_BOB_AIR_DUCT_LAYOUT = {
  centreXMetres: 8,
  floorYMetres: 18.8,
  innerWidthMetres: 2,
  innerHeightMetres: 2.1,
  wallBayWidthMetres: 3.2,
  wallJambWidthMetres: 0.6,
} as const;

export interface LevelTwoAirDuctGreyboxOptions {
  readonly id: string;
  readonly fromRoomId: 2;
  readonly toRoomId: 3;
  readonly innerWidthMetres: number;
  readonly innerHeightMetres: number;
  readonly lengthMetres: number;
  readonly stickyEntryLengthMetres?: number;
}

/**
 * Narrow, fully enclosed ventilation run between Bob's elevated Room 2 and
 * Room 3 openings. It deliberately has no security shutter: this route is the
 * open vent promised by the room design, not a second laboratory corridor.
 */
export class LevelTwoAirDuctGreybox {
  readonly builder: GreyboxRoomBuilder;
  readonly root;
  readonly collisionMeshes;

  constructor(options: LevelTwoAirDuctGreyboxOptions) {
    if (!options.id) throw new Error('Level 2 air-duct IDs cannot be empty.');
    for (const dimension of [
      options.innerWidthMetres,
      options.innerHeightMetres,
      options.lengthMetres,
    ]) {
      if (!Number.isFinite(dimension) || dimension <= 0) {
        throw new Error('Level 2 air-duct dimensions must be positive.');
      }
    }

    const stickyEntryLengthMetres =
      options.stickyEntryLengthMetres ?? 1.5;
    if (
      !Number.isFinite(stickyEntryLengthMetres) ||
      stickyEntryLengthMetres <= 0 ||
      stickyEntryLengthMetres >= options.lengthMetres
    ) {
      throw new Error(
        'Level 2 air-duct sticky entry must fit inside the duct length.',
      );
    }

    this.builder = new GreyboxRoomBuilder(options.id);
    this.root = this.builder.root;
    this.collisionMeshes = this.builder.collisionMeshes;
    Object.assign(this.root.userData, {
      levelId: 'cultivation',
      transitionRole: 'ventilation-air-duct',
      environmentRole: 'air-duct',
      fromRoomId: options.fromRoomId,
      toRoomId: options.toRoomId,
      routeOwner: 'bob',
      innerSizeMetres: [
        options.innerWidthMetres,
        options.innerHeightMetres,
      ],
    });
    this.build(options, stickyEntryLengthMetres);
  }

  dispose(): void {
    this.builder.dispose();
  }

  private build(
    options: LevelTwoAirDuctGreyboxOptions,
    stickyEntryLengthMetres: number,
  ): void {
    const { duct, sticky, support } = this.builder.materials;
    const wallThickness = 0.18;
    const floorThickness = 0.24;
    const halfWidth = options.innerWidthMetres * 0.5;
    const halfHeight = options.innerHeightMetres * 0.5;
    const halfLength = options.lengthMetres * 0.5;
    const metalFloorLength =
      options.lengthMetres - stickyEntryLengthMetres;

    const stickyEntry = this.builder.addCollider({
      name: `${options.id}-sticky-entry-floor`,
      size: [
        options.innerWidthMetres,
        floorThickness,
        stickyEntryLengthMetres,
      ],
      position: [0, -floorThickness * 0.5, stickyEntryLengthMetres * 0.5],
      material: sticky,
      surfaceTag: 'sticky',
      textureRole: 'sticky-vent-tile',
    });
    Object.assign(stickyEntry.userData, {
      environmentRole: 'air-duct-entry',
      routeOwner: 'bob',
    });

    this.addMetalCollider({
      name: `${options.id}-floor`,
      size: [options.innerWidthMetres, floorThickness, metalFloorLength],
      position: [
        0,
        -floorThickness * 0.5,
        stickyEntryLengthMetres + metalFloorLength * 0.5,
      ],
      material: duct,
    });
    this.addMetalCollider({
      name: `${options.id}-ceiling`,
      size: [options.innerWidthMetres, wallThickness, options.lengthMetres],
      position: [
        0,
        options.innerHeightMetres + wallThickness * 0.5,
        halfLength,
      ],
      material: duct,
    });
    this.addMetalCollider({
      name: `${options.id}-west-wall`,
      size: [wallThickness, options.innerHeightMetres, options.lengthMetres],
      position: [
        -halfWidth - wallThickness * 0.5,
        halfHeight,
        halfLength,
      ],
      material: duct,
    });
    this.addMetalCollider({
      name: `${options.id}-east-wall`,
      size: [wallThickness, options.innerHeightMetres, options.lengthMetres],
      position: [
        halfWidth + wallThickness * 0.5,
        halfHeight,
        halfLength,
      ],
      material: duct,
    });

    const emitterMaterial = new THREE.MeshStandardMaterial({
      color: 0xbdd9df,
      emissive: 0x8fc7d4,
      emissiveIntensity: 1.25,
      roughness: 0.34,
      metalness: 0.08,
    });
    const fixturePositions = [
      options.lengthMetres * 0.25,
      options.lengthMetres * 0.5,
      options.lengthMetres * 0.75,
    ];
    for (const [index, z] of fixturePositions.entries()) {
      const fixture = this.builder.addVisualBox({
        name: `${options.id}-ceiling-light-${index + 1}`,
        size: [options.innerWidthMetres * 0.48, 0.06, 0.34],
        position: [0, options.innerHeightMetres - 0.05, z],
        material: emitterMaterial,
      });
      Object.assign(fixture.userData, {
        presentationOnly: true,
        environmentRole: 'air-duct-light-source',
      });
      this.builder.addLight(
        `${options.id}-received-light-${index + 1}`,
        [0, options.innerHeightMetres - 0.45, z],
        0xbfe8f2,
        6,
        8,
      );
    }

    // Sparse metal ribs make the long connector read as manufactured ducting
    // without adding collision lips that could snag the slime.
    for (const [index, z] of [0.35, halfLength, options.lengthMetres - 0.35].entries()) {
      for (const [side, x] of [
        ['west', -halfWidth + 0.05],
        ['east', halfWidth - 0.05],
      ] as const) {
        const rib = this.builder.addVisualBox({
          name: `${options.id}-rib-${index + 1}-${side}`,
          size: [0.1, options.innerHeightMetres, 0.14],
          position: [x, halfHeight, z],
          material: support,
        });
        rib.userData.presentationOnly = true;
      }
      const ceilingRib = this.builder.addVisualBox({
        name: `${options.id}-rib-${index + 1}-ceiling`,
        size: [options.innerWidthMetres, 0.1, 0.14],
        position: [0, options.innerHeightMetres - 0.05, z],
        material: support,
      });
      ceilingRib.userData.presentationOnly = true;
    }
  }

  private addMetalCollider(options: Parameters<GreyboxRoomBuilder['addCollider']>[0]): void {
    const collider = this.builder.addCollider(options);
    Object.assign(collider.userData, {
      textureRole: 'air-duct-metal',
      environmentRole: 'air-duct-shell',
      routeOwner: 'bob',
    });
  }
}
