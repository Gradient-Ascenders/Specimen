import * as THREE from 'three';

import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import {
  createBorrowedBox,
  createBorrowedCylinder,
  createChamferedBox,
  createInstancedBoxes,
  createInstancedChamferedBoxes,
  createSignagePanel,
  markVisualOnly,
} from './ContainmentModularComponents.ts';

interface PlatformDressing {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly safetySide?: 'x' | 'z';
}

const PLATFORM_DRESSINGS: readonly PlatformDressing[] = [
  {
    name: 'platform-a-height-lesson',
    size: [3.15, 0.5, 3.15],
    position: [-6.37855, 1.46779, 37.78357],
    safetySide: 'z',
  },
  {
    name: 'platform-b-gap-lesson',
    size: [2.82146, 0.5, 3.5],
    position: [-0.5, 2.55, 37],
    safetySide: 'x',
  },
  {
    name: 'platform-c-side-jump',
    size: [3.8, 0.5, 3.5],
    position: [4.2, 3.85, 31.0999],
    safetySide: 'z',
  },
  {
    name: 'platform-d-sticky-launch',
    size: [4, 0.5, 4],
    position: [8.5, 5.2, 38.5],
    safetySide: 'x',
  },
  {
    name: 'top-of-sticky-wall-ledge',
    size: [3.1, 0.35, 4.7],
    position: [13.25, 9.15, 42.9],
    safetySide: 'z',
  },
  {
    name: 'upper-step-a',
    size: [4, 0.4, 3.5],
    position: [8.8, 9.65, 37.65683],
    safetySide: 'z',
  },
  {
    name: 'upper-step-b',
    size: [3.6, 0.4, 3.4],
    position: [0.87909, 10.15, 38.41571],
    safetySide: 'x',
  },
  {
    name: 'exit-balcony',
    size: [7, 0.5, 4],
    position: [0, 10.65, 46.79795],
    safetySide: 'x',
  },
];

/** Room 2-only visual dressing layered around the frozen teaching route. */
export class RoomTwoArt {
  readonly root = new THREE.Group();

  private readonly resources: ContainmentArtResources;
  private readonly uniqueGeometries = new Set<THREE.BufferGeometry>();
  private disposed = false;

  constructor(resources: ContainmentArtResources) {
    this.resources = resources;
    this.root.name = 'room-2-production-art';
    markVisualOnly(this.root);

    this.buildFloor();
    this.buildPerimeterArchitecture();
    this.buildUpperServiceCanopy();
    this.buildPlatformSequence();
    this.buildStickyCatchWall();
    this.buildObservationBay();
    this.buildTransitionsAndSignage();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const geometry of this.uniqueGeometries) geometry.dispose();
    this.uniqueGeometries.clear();
    this.root.clear();
  }

  private buildFloor(): void {
    const { clinicalFloor, graphite, serviceMetal } = this.resources.materials;
    this.root.add(
      createBorrowedBox(this.resources, {
        name: 'room-2-floor-recessed-graphite-bed',
        size: [29.7, 0.08, 21.7],
        position: [0, -0.11, 38],
        material: graphite,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-2-large-quiet-floor-panels',
        size: [9.78, 0.1, 21.5],
        radius: 0.025,
        material: clinicalFloor,
        transforms: [-9.93, 0, 9.93].map((x) => ({
          position: [x, -0.055, 38],
        })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-2-floor-route-inlays',
        serviceMetal,
        [
          { position: [-8.35, 0.004, 32.5], size: [0.12, 0.012, 1.35] },
          { position: [-7.95, 0.004, 33.38], size: [0.12, 0.012, 0.72], rotation: [0, -0.58, 0] },
          { position: [-8.75, 0.004, 33.38], size: [0.12, 0.012, 0.72], rotation: [0, 0.58, 0] },
        ],
      ),
    );
  }

  private buildPerimeterArchitecture(): void {
    const { mainCeramic, secondaryCeramic, mechanicalBacking, serviceMetal } =
      this.resources.materials;

    // Dark substrate remains visible only through deliberate panel gaps and
    // service apertures. These backing volumes sit inside the wall colliders.
    this.root.add(
      createBorrowedBox(this.resources, {
        name: 'room-2-west-mechanical-substrate',
        size: [0.09, 17.7, 21.7],
        position: [-14.945, 9, 38],
        material: mechanicalBacking,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-2-east-mechanical-substrate',
        size: [0.09, 17.7, 21.7],
        position: [14.945, 9, 38],
        material: mechanicalBacking,
      }),
    );

    const sidePanels: readonly {
      name: string;
      position: readonly [number, number, number];
      size: readonly [number, number, number];
      rotation: readonly [number, number, number];
      secondary?: boolean;
    }[] = [
      // West wall leaves a broad observation recess around y=8, z=39.
      { name: 'west-lower-south', position: [-14.85, 2.35, 31.8], size: [12.0, 4.35, 0.11], rotation: [0, Math.PI / 2, 0] },
      { name: 'west-lower-north', position: [-14.85, 2.35, 44.55], size: [12.95, 4.35, 0.11], rotation: [0, Math.PI / 2, 0], secondary: true },
      { name: 'west-observation-south', position: [-14.85, 8.2, 30.45], size: [5.0, 7.0, 0.11], rotation: [0, Math.PI / 2, 0], secondary: true },
      { name: 'west-observation-north', position: [-14.85, 8.2, 47.0], size: [3.25, 7.0, 0.11], rotation: [0, Math.PI / 2, 0] },
      { name: 'west-upper-quiet', position: [-14.85, 14.55, 33.0], size: [11.5, 5.65, 0.11], rotation: [0, Math.PI / 2, 0] },
      { name: 'west-upper-service', position: [-14.85, 14.55, 44.85], size: [11.55, 5.65, 0.11], rotation: [0, Math.PI / 2, 0], secondary: true },

      // East wall becomes denser around the authored sticky installation.
      { name: 'east-lower-south', position: [14.85, 2.15, 32.8], size: [11.2, 3.95, 0.11], rotation: [0, -Math.PI / 2, 0], secondary: true },
      { name: 'east-lower-north', position: [14.85, 2.15, 44.45], size: [11.75, 3.95, 0.11], rotation: [0, -Math.PI / 2, 0] },
      { name: 'east-mid-south', position: [14.85, 8.15, 31.7], size: [8.7, 7.55, 0.11], rotation: [0, -Math.PI / 2, 0] },
      { name: 'east-mid-sticky-shoulder', position: [14.85, 8.15, 47.45], size: [2.45, 7.55, 0.11], rotation: [0, -Math.PI / 2, 0], secondary: true },
      { name: 'east-upper-south', position: [14.85, 14.7, 33.4], size: [12.1, 5.35, 0.11], rotation: [0, -Math.PI / 2, 0], secondary: true },
      { name: 'east-upper-north', position: [14.85, 14.7, 45.6], size: [11.75, 5.35, 0.11], rotation: [0, -Math.PI / 2, 0] },
    ];
    for (const panel of sidePanels) {
      this.root.add(
        createChamferedBox(this.resources, {
          name: `room-2-panel-${panel.name}`,
          size: panel.size,
          radius: 0.04,
          position: panel.position,
          rotation: panel.rotation,
          material: panel.secondary ? secondaryCeramic : mainCeramic,
        }),
      );
    }

    this.buildEndWallPanels(27.15, false);
    this.buildEndWallPanels(48.85, true);

    // Vertical service splines establish the larger chamber scale without
    // covering every seam with trim.
    this.root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-2-west-selective-service-splines',
        size: [0.16, 5.6, 0.28],
        radius: 0.025,
        material: serviceMetal,
        transforms: [31.8, 46.3].map((z) => ({
          position: [-14.69, 14.35, z],
        })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-2-east-sticky-service-splines',
        size: [0.16, 5.9, 0.28],
        radius: 0.025,
        material: serviceMetal,
        transforms: [38.8, 47.25].map((z) => ({
          position: [14.69, 14.2, z],
        })),
      }),
    );
  }

  private buildEndWallPanels(z: number, front: boolean): void {
    const { mainCeramic, secondaryCeramic, mechanicalBacking } =
      this.resources.materials;
    const prefix = front ? 'front' : 'rear';
    const faceZ = front ? z - 0.06 : z + 0.06;
    const rotation: readonly [number, number, number] = front
      ? [0, Math.PI, 0]
      : [0, 0, 0];
    const openingX = front ? 0 : -8.4;
    const openingWidth = front ? 3 : 2.2;
    const openingBottom = front ? 10.4 : 10.2;
    const openingTop = front ? 14.1 : 12.8;

    this.root.add(
      createBorrowedBox(this.resources, {
        name: `room-2-${prefix}-wall-mechanical-substrate`,
        size: [29.7, 17.7, 0.08],
        position: [0, 9, z + (front ? 0.045 : -0.045)],
        material: mechanicalBacking,
      }),
    );

    const leftEdge = -14.8;
    const rightEdge = 14.8;
    const openingLeft = openingX - openingWidth * 0.5;
    const openingRight = openingX + openingWidth * 0.5;
    const panels = [
      {
        name: 'lower-left',
        size: [openingX - leftEdge - openingWidth * 0.5 - 0.14, 5.0, 0.11] as const,
        position: [(leftEdge + openingLeft) * 0.5, 2.65, faceZ] as const,
        secondary: false,
      },
      {
        name: 'lower-right',
        size: [rightEdge - openingRight - 0.14, 5.0, 0.11] as const,
        position: [(openingRight + rightEdge) * 0.5, 2.65, faceZ] as const,
        secondary: true,
      },
      {
        name: 'middle-left',
        size: [openingX - leftEdge - openingWidth * 0.5 - 0.14, 5.15, 0.11] as const,
        position: [(leftEdge + openingLeft) * 0.5, 7.82, faceZ] as const,
        secondary: true,
      },
      {
        name: 'middle-right',
        size: [rightEdge - openingRight - 0.14, 5.15, 0.11] as const,
        position: [(openingRight + rightEdge) * 0.5, 7.82, faceZ] as const,
        secondary: false,
      },
      {
        name: 'opening-below',
        size: [openingWidth - 0.12, openingBottom - 0.12, 0.11] as const,
        position: [openingX, openingBottom * 0.5, faceZ] as const,
        secondary: false,
      },
      {
        name: 'opening-above',
        size: [openingWidth - 0.12, 18 - openingTop - 0.12, 0.11] as const,
        position: [openingX, (18 + openingTop) * 0.5, faceZ] as const,
        secondary: true,
      },
      {
        name: 'upper-left',
        size: [openingX - leftEdge - openingWidth * 0.5 - 0.14, 5.0, 0.11] as const,
        position: [(leftEdge + openingLeft) * 0.5, 15.25, faceZ] as const,
        secondary: false,
      },
      {
        name: 'upper-right',
        size: [rightEdge - openingRight - 0.14, 5.0, 0.11] as const,
        position: [(openingRight + rightEdge) * 0.5, 15.25, faceZ] as const,
        secondary: front,
      },
    ];

    for (const panel of panels) {
      if (panel.size[0] <= 0 || panel.size[1] <= 0) continue;
      this.root.add(
        createChamferedBox(this.resources, {
          name: `room-2-panel-${prefix}-${panel.name}`,
          size: panel.size,
          radius: 0.04,
          position: panel.position,
          rotation,
          material: panel.secondary ? secondaryCeramic : mainCeramic,
        }),
      );
    }
  }

  private buildUpperServiceCanopy(): void {
    const { mainCeramic, secondaryCeramic, graphite, serviceMetal, neutralFixture } =
      this.resources.materials;

    this.root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-2-upper-structural-cross-members',
        size: [28.6, 0.34, 0.48],
        radius: 0.055,
        material: graphite,
        transforms: [31.2, 44.8].map((z) => ({
          position: [0, 17.22, z],
        })),
      }),
      createChamferedBox(this.resources, {
        name: 'room-2-upper-longitudinal-service-spine',
        size: [0.62, 0.44, 17.1],
        radius: 0.065,
        position: [1.6, 17.16, 38],
        material: serviceMetal,
      }),
      createChamferedBox(this.resources, {
        name: 'room-2-upper-canopy-south-module',
        size: [11.2, 0.24, 5.1],
        radius: 0.08,
        position: [-7.9, 17.52, 33.8],
        material: mainCeramic,
      }),
      createChamferedBox(this.resources, {
        name: 'room-2-upper-canopy-north-module',
        size: [12.4, 0.24, 5.6],
        radius: 0.08,
        position: [6.5, 17.52, 42.2],
        material: secondaryCeramic,
      }),
    );

    const fixtures = [
      [-8, 16.84, 35],
      [0, 16.84, 39],
      [8, 16.84, 43],
    ] as const;
    for (let index = 0; index < fixtures.length; index += 1) {
      const [x, y, z] = fixtures[index];
      this.root.add(
        createChamferedBox(this.resources, {
          name: `room-2-ceiling-fixture-housing-${index + 1}`,
          size: [3.4, 0.24, 0.9],
          radius: 0.055,
          position: [x, y + 0.13, z],
          material: graphite,
        }),
        createChamferedBox(this.resources, {
          name: `room-2-ceiling-neutral-diffuser-${index + 1}`,
          size: [2.85, 0.045, 0.52],
          radius: 0.018,
          position: [x, y - 0.01, z],
          material: neutralFixture,
        }),
      );
    }
  }

  private buildPlatformSequence(): void {
    for (const platform of PLATFORM_DRESSINGS) this.buildPlatform(platform);
  }

  private buildPlatform(platform: PlatformDressing): void {
    const { secondaryCeramic, graphite, serviceMetal, warningStatus } =
      this.resources.materials;
    const [width, height, depth] = platform.size;
    const [x, y, z] = platform.position;
    const top = y + height * 0.5;
    const root = new THREE.Group();
    root.name = `room-2-${platform.name}-mechanical-dressing`;
    markVisualOnly(root);
    root.add(
      createChamferedBox(this.resources, {
        name: `room-2-${platform.name}-durable-composite-tread`,
        size: [width - 0.06, 0.16, depth - 0.06],
        radius: 0.06,
        position: [x, top - 0.08, z],
        material: secondaryCeramic,
      }),
      createChamferedBox(this.resources, {
        name: `room-2-${platform.name}-graphite-deck-seat`,
        size: [width + 0.08, 0.18, depth + 0.08],
        radius: 0.055,
        position: [x, top - 0.23, z],
        material: serviceMetal,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: `room-2-${platform.name}-underside-longitudinal-rails`,
        size: [width * 0.76, 0.2, 0.2],
        radius: 0.035,
        material: graphite,
        transforms: [-0.3, 0.3].map((offset) => ({
          position: [x, y - height * 0.5 - 0.18, z + depth * offset],
        })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: `room-2-${platform.name}-underside-transverse-rails`,
        size: [0.2, 0.2, depth * 0.76],
        radius: 0.035,
        material: graphite,
        transforms: [-0.3, 0.3].map((offset) => ({
          position: [x + width * offset, y - height * 0.5 - 0.18, z],
        })),
      }),
      createInstancedBoxes(
        this.resources,
        `room-2-${platform.name}-underside-cross-braces`,
        serviceMetal,
        [
          { position: [x, y - height * 0.5 - 0.34, z], size: [width * 0.82, 0.14, 0.26] },
          { position: [x, y - height * 0.5 - 0.34, z], size: [0.26, 0.14, depth * 0.82] },
        ],
      ),
      createInstancedBoxes(
        this.resources,
        `room-2-${platform.name}-actuator-rods`,
        serviceMetal,
        [
          [-0.24, -0.24],
          [-0.24, 0.24],
          [0.24, -0.24],
          [0.24, 0.24],
        ].map(([offsetX, offsetZ]) => ({
          position: [
            x + width * offsetX,
            y - height * 0.5 - 0.38,
            z + depth * offsetZ,
          ],
          size: [0.11, 0.4, 0.11],
        })),
      ),
      createBorrowedCylinder(this.resources, {
        name: `room-2-${platform.name}-central-actuator-socket`,
        size: [Math.min(width, depth) * 0.13, 0.24, Math.min(width, depth) * 0.13],
        position: [x, y - height * 0.5 - 0.48, z],
        material: serviceMetal,
      }),
    );

    const safetyAlongX = platform.safetySide === 'x';
    const markerSize: readonly [number, number, number] = safetyAlongX
      ? [width * 0.28, 0.018, 0.11]
      : [0.11, 0.018, depth * 0.28];
    const markerOffset = safetyAlongX
      ? [0, top + 0.005, -depth * 0.5 + 0.12]
      : [-width * 0.5 + 0.12, top + 0.005, 0];
    root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: `room-2-${platform.name}-restrained-safety-inlays`,
        size: markerSize,
        radius: 0.01,
        material: warningStatus,
        transforms: [-0.3, 0.3].map((offset) => ({
          position: [
            x + markerOffset[0] + (safetyAlongX ? offset * width : 0),
            markerOffset[1],
            z + markerOffset[2] + (safetyAlongX ? 0 : offset * depth),
          ],
        })),
      }),
    );
    this.root.add(root);
  }

  private buildStickyCatchWall(): void {
    const { mechanicalBacking, graphite, serviceMetal, stickyMembrane } =
      this.resources.materials;
    const membrane = createChamferedBox(this.resources, {
      name: 'room-2-sticky-catch-wall-inset-organic-membrane',
      size: [0.055, 6.55, 6.08],
      radius: 0.045,
      position: [14.696, 7.73804, 43.0006],
      material: stickyMembrane,
    });
    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-2-sticky-catch-wall-recessed-backing',
        size: [0.13, 7.28, 6.88],
        radius: 0.07,
        position: [14.77, 7.73804, 43.0006],
        material: mechanicalBacking,
      }),
      membrane,
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-2-sticky-catch-wall-vertical-frame',
        size: [0.18, 7.2, 0.22],
        radius: 0.035,
        material: graphite,
        transforms: [-3.3, 3.3].map((offset) => ({
          position: [14.66, 7.73804, 43.0006 + offset],
        })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-2-sticky-catch-wall-horizontal-frame',
        size: [0.18, 0.22, 6.82],
        radius: 0.035,
        material: graphite,
        transforms: [-3.58, 3.58].map((offset) => ({
          position: [14.66, 7.73804 + offset, 43.0006],
        })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-2-sticky-catch-wall-mechanical-clamps',
        size: [0.26, 0.32, 0.48],
        radius: 0.04,
        material: serviceMetal,
        transforms: [
          [14.54, 5.05, 39.62],
          [14.54, 9.5, 39.62],
          [14.54, 5.85, 46.38],
          [14.54, 10.3, 46.38],
        ].map((position) => ({
          position: position as [number, number, number],
        })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-2-sticky-catch-wall-route-height-marks',
        serviceMetal,
        [5.1, 6.2, 7.3, 8.4, 9.5, 10.6].map((y, index) => ({
          position: [14.645, y, 47.02],
          size: [0.025, 0.055, index % 2 === 0 ? 0.7 : 0.42],
        })),
      ),
    );
  }

  private buildObservationBay(): void {
    const { containmentGlass, graphite, mechanicalBacking, serviceMetal } =
      this.resources.materials;
    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-2-observation-dark-recess',
        size: [0.13, 3.55, 8.25],
        radius: 0.06,
        position: [-14.76, 8.2, 39.2],
        material: mechanicalBacking,
      }),
      createChamferedBox(this.resources, {
        name: 'room-2-observation-reinforced-glass',
        size: [0.035, 2.82, 7.46],
        radius: 0.025,
        position: [-14.65, 8.2, 39.2],
        material: containmentGlass,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-2-observation-horizontal-frame',
        size: [0.2, 0.25, 8.22],
        radius: 0.04,
        material: graphite,
        transforms: [-1.7, 1.7].map((offset) => ({
          position: [-14.58, 8.2 + offset, 39.2],
        })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-2-observation-vertical-mullions',
        size: [0.2, 3.35, 0.22],
        radius: 0.035,
        material: graphite,
        transforms: [-4.0, -1.32, 1.32, 4.0].map((offset) => ({
          position: [-14.58, 8.2, 39.2 + offset],
        })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-2-observation-lower-instrument-housings',
        size: [0.28, 0.42, 1.15],
        radius: 0.055,
        material: serviceMetal,
        transforms: [-2.45, 0, 2.45].map((offset) => ({
          position: [-14.48, 6.18, 39.2 + offset],
        })),
      }),
    );
  }

  private buildTransitionsAndSignage(): void {
    const { graphite, serviceMetal, gasket } = this.resources.materials;
    this.addWallOpeningFrame(
      'room-2-entry-duct-collar',
      [-8.4, 11.5, 27.27],
      2.55,
      2.9,
      0.2,
      graphite,
    );
    this.addWallOpeningFrame(
      'room-2-entry-duct-inner-flange',
      [-8.4, 11.5, 27.18],
      2.25,
      2.55,
      0.08,
      serviceMetal,
    );
    this.addWallOpeningFrame(
      'room-2-exit-transition-collar',
      [0, 12.25, 48.68],
      3.5,
      4.15,
      0.23,
      graphite,
    );
    this.addWallOpeningFrame(
      'room-2-exit-transition-inner-flange',
      [0, 12.25, 48.59],
      3.18,
      3.82,
      0.085,
      serviceMetal,
    );

    const chamberSign = createSignagePanel(this.resources, {
      name: 'room-2-chamber-identifier',
      label: 'chamber',
      size: [3.35, 0.84],
      position: [-4.35, 14.65, 48.665],
      rotation: [0, Math.PI, 0],
    });
    this.uniqueGeometries.add(chamberSign.geometry);
    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-2-chamber-identifier-backing',
        size: [3.47, 0.96, 0.07],
        radius: 0.03,
        position: [-4.35, 14.65, 48.72],
        material: gasket,
      }),
      chamberSign.mesh,
    );

    const ascentSign = createSignagePanel(this.resources, {
      name: 'room-2-ascent-route-identifier',
      label: 'ascent',
      size: [2.25, 0.62],
      position: [14.585, 12.45, 43.0],
      rotation: [0, -Math.PI / 2, 0],
    });
    this.uniqueGeometries.add(ascentSign.geometry);
    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-2-ascent-route-identifier-backing',
        size: [0.07, 0.74, 2.37],
        radius: 0.03,
        position: [14.64, 12.45, 43.0],
        material: gasket,
      }),
      ascentSign.mesh,
    );
  }

  private addWallOpeningFrame(
    name: string,
    position: readonly [number, number, number],
    width: number,
    height: number,
    barWidth: number,
    material: THREE.Material,
  ): void {
    this.root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: `${name}-horizontal-members`,
        size: [width, barWidth, 0.2],
        radius: 0.035,
        material,
        transforms: [-height * 0.5, height * 0.5].map((offset) => ({
          position: [position[0], position[1] + offset, position[2]],
        })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: `${name}-vertical-members`,
        size: [barWidth, height, 0.2],
        radius: 0.035,
        material,
        transforms: [-width * 0.5, width * 0.5].map((offset) => ({
          position: [position[0] + offset, position[1], position[2]],
        })),
      }),
    );
  }
}
