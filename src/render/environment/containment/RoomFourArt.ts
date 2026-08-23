import * as THREE from 'three';

import type { LaserHazard } from '../../../hazards/LaserHazard.ts';
import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import {
  createBorrowedBox,
  createBorrowedCylinder,
  createChamferedBox,
  createInstancedBoxes,
  createInstancedChamferedBoxes,
  createRectangularFrame,
  createSignagePanel,
  markVisualOnly,
} from './ContainmentModularComponents.ts';

const SHAFT_CENTRE_X = 9;
const SHAFT_CENTRE_Z = 85.5;
const SHAFT_MIN_Y = 26;
const SHAFT_MAX_Y = 76.5;
const SHAFT_CENTRE_Y = (SHAFT_MIN_Y + SHAFT_MAX_Y) * 0.5;
const SHAFT_HEIGHT = SHAFT_MAX_Y - SHAFT_MIN_Y;
const WEST_FACE_X = 2.72;
const EAST_FACE_X = 15.28;
const SOUTH_FACE_Z = 79.72;
const NORTH_FACE_Z = 91.28;
const STRUCTURAL_BAND_Y = [34.5, 43.8, 53.4, 62.8, 71.2] as const;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Room 4-only static dressing for the frozen cargo-elevator sequence.
 *
 * Every mesh is presentation-only. Wall relief remains inside the existing
 * wall volumes; shaft machinery sits beside the elevator clearance or below
 * the failure boundary. The elevator, lasers, exit lock and reset controller
 * remain owned by RoomFourGreybox and its puzzle components.
 */
export class RoomFourArt {
  readonly root = new THREE.Group();

  private readonly resources: ContainmentArtResources;
  private readonly signGeometries = new Set<THREE.BufferGeometry>();
  private disposed = false;

  constructor(
    resources: ContainmentArtResources,
    hazards: readonly LaserHazard[],
  ) {
    this.resources = resources;
    this.root.name = 'room-4-production-art';
    markVisualOnly(this.root);

    this.buildWallZones();
    this.buildStructuralRibs();
    this.buildGuideSystem();
    this.buildCableAndFluidInfrastructure();
    this.buildMaintenanceModules();
    this.buildLaserInfrastructure(hazards);
    this.buildBottomMachinery();
    this.buildTopArrival();
    this.buildSectorSignage();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const geometry of this.signGeometries) geometry.dispose();
    this.signGeometries.clear();
    this.root.clear();
  }

  private buildWallZones(): void {
    const {
      mainCeramic,
      secondaryCeramic,
      mechanicalBacking,
      structuralSteel,
      serviceMetal,
    } = this.resources.materials;

    // Substrates mirror the exact split wall colliders so neither doorway is
    // visually sealed by a presentation mesh.
    this.root.add(
      createBorrowedBox(this.resources, {
        name: 'room-4-west-wall-mechanical-substrate',
        size: [0.08, SHAFT_HEIGHT, 11.55],
        position: [WEST_FACE_X + 0.01, SHAFT_CENTRE_Y, SHAFT_CENTRE_Z],
        material: mechanicalBacking,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-4-east-wall-mechanical-substrate',
        size: [0.08, SHAFT_HEIGHT, 11.55],
        position: [EAST_FACE_X - 0.01, SHAFT_CENTRE_Y, SHAFT_CENTRE_Z],
        material: mechanicalBacking,
      }),
      ...[
        { name: 'south-west', size: [5.05, 50.5, 0.08] as const, position: [5.1, 51, SOUTH_FACE_Z - 0.01] as const },
        { name: 'south-east', size: [5.05, 50.5, 0.08] as const, position: [12.9, 51, SOUTH_FACE_Z - 0.01] as const },
        { name: 'south-entry-header', size: [2.5, 43.8, 0.08] as const, position: [9, 55.1, SOUTH_FACE_Z - 0.01] as const },
        { name: 'south-entry-sill', size: [2.5, 2.85, 0.08] as const, position: [9, 27.55, SOUTH_FACE_Z - 0.01] as const },
        { name: 'north-west', size: [5.05, 50.5, 0.08] as const, position: [5.1, 51, NORTH_FACE_Z + 0.01] as const },
        { name: 'north-east', size: [5.05, 50.5, 0.08] as const, position: [12.9, 51, NORTH_FACE_Z + 0.01] as const },
        { name: 'north-exit-lower', size: [2.5, 46.8, 0.08] as const, position: [9, 49, NORTH_FACE_Z + 0.01] as const },
      ].map(({ name, size, position }) =>
        createBorrowedBox(this.resources, {
          name: `room-4-${name}-mechanical-substrate`,
          size,
          position,
          material: mechanicalBacking,
        }),
      ),
    );

    // The four walls have deliberately different jobs: west is elevator
    // machinery, east is utilities, south is maintenance, north is the cleaner
    // destination wall. Large zones avoid a uniform panel-grid rhythm.
    this.root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-west-wall-large-clean-skin-zones',
        size: [4.1, 7.2, 0.12],
        radius: 0.055,
        material: secondaryCeramic,
        transforms: [
          { position: [WEST_FACE_X + 0.055, 31.1, 81.9], rotation: [0, Math.PI / 2, 0], scale: [0.92, 0.7, 1] },
          { position: [WEST_FACE_X + 0.055, 48.6, 89.0], rotation: [0, Math.PI / 2, 0], scale: [0.88, 1.05, 1] },
          { position: [WEST_FACE_X + 0.055, 67.0, 81.8], rotation: [0, Math.PI / 2, 0], scale: [0.9, 0.88, 1] },
        ],
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-east-wall-asymmetric-ceramic-service-skin',
        size: [4.2, 8.2, 0.12],
        radius: 0.055,
        material: mainCeramic,
        transforms: [
          { position: [EAST_FACE_X - 0.055, 31.7, 88.8], rotation: [0, -Math.PI / 2, 0], scale: [0.85, 0.75, 1] },
          { position: [EAST_FACE_X - 0.055, 47.5, 81.8], rotation: [0, -Math.PI / 2, 0], scale: [0.88, 0.92, 1] },
          { position: [EAST_FACE_X - 0.055, 66.9, 88.8], rotation: [0, -Math.PI / 2, 0], scale: [0.84, 0.86, 1] },
        ],
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-south-wall-quiet-ceramic-regions',
        secondaryCeramic,
        [
          { position: [5.15, 31.3, SOUTH_FACE_Z + 0.055], size: [4.45, 8.4, 0.12] },
          { position: [12.75, 47.8, SOUTH_FACE_Z + 0.055], size: [4.45, 9.8, 0.12] },
          { position: [5.15, 66.8, SOUTH_FACE_Z + 0.055], size: [4.45, 7.3, 0.12] },
        ],
      ),
      createInstancedBoxes(
        this.resources,
        'room-4-north-wall-clean-destination-skin',
        mainCeramic,
        [
          { position: [5.15, 34.0, NORTH_FACE_Z - 0.055], size: [4.5, 11.0, 0.12] },
          { position: [12.85, 34.0, NORTH_FACE_Z - 0.055], size: [4.5, 11.0, 0.12] },
          { position: [5.15, 66.4, NORTH_FACE_Z - 0.055], size: [4.5, 7.8, 0.12] },
          { position: [12.85, 66.4, NORTH_FACE_Z - 0.055], size: [4.5, 7.8, 0.12] },
        ],
      ),
      createInstancedBoxes(
        this.resources,
        'room-4-wall-large-service-seams',
        serviceMetal,
        [
          { position: [WEST_FACE_X + 0.12, 39.1, 89.0], size: [0.045, 0.18, 3.7] },
          { position: [WEST_FACE_X + 0.12, 58.6, 81.9], size: [0.045, 0.18, 3.6] },
          { position: [EAST_FACE_X - 0.12, 39.0, 81.8], size: [0.045, 0.18, 3.7] },
          { position: [EAST_FACE_X - 0.12, 58.8, 88.8], size: [0.045, 0.18, 3.5] },
        ],
      ),
      createInstancedBoxes(
        this.resources,
        'room-4-corner-load-columns',
        structuralSteel,
        [
          [WEST_FACE_X + 0.035, SHAFT_CENTRE_Y, 80.0],
          [WEST_FACE_X + 0.035, SHAFT_CENTRE_Y, 91.0],
          [EAST_FACE_X - 0.035, SHAFT_CENTRE_Y, 80.0],
          [EAST_FACE_X - 0.035, SHAFT_CENTRE_Y, 91.0],
        ].map((position) => ({
          position: position as [number, number, number],
          size: [0.18, SHAFT_HEIGHT - 0.5, 0.28] as const,
        })),
      ),
    );
  }

  private buildStructuralRibs(): void {
    const { structuralSteel, serviceMetal } = this.resources.materials;
    const northSouth = STRUCTURAL_BAND_Y.flatMap((y) => [
      { position: [SHAFT_CENTRE_X, y, 79.69] as const },
      { position: [SHAFT_CENTRE_X, y, 91.31] as const },
    ]);
    const eastWest = STRUCTURAL_BAND_Y.flatMap((y) => [
      { position: [2.69, y, SHAFT_CENTRE_Z] as const, rotation: [0, Math.PI / 2, 0] as const },
      { position: [15.31, y, SHAFT_CENTRE_Z] as const, rotation: [0, Math.PI / 2, 0] as const },
    ]);

    this.root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-major-north-south-structural-ribs',
        size: [12.35, 0.62, 0.3],
        radius: 0.09,
        material: structuralSteel,
        transforms: northSouth,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-major-east-west-structural-ribs',
        size: [11.35, 0.62, 0.3],
        radius: 0.09,
        material: structuralSteel,
        transforms: eastWest,
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-structural-rib-galvanized-face-plates',
        serviceMetal,
        STRUCTURAL_BAND_Y.flatMap((y) => [
          { position: [SHAFT_CENTRE_X, y, 79.86] as const, size: [10.8, 0.12, 0.035] as const },
          { position: [SHAFT_CENTRE_X, y, 91.14] as const, size: [10.8, 0.12, 0.035] as const },
          { position: [2.86, y, SHAFT_CENTRE_Z] as const, size: [0.035, 0.12, 9.9] as const },
          { position: [15.14, y, SHAFT_CENTRE_Z] as const, size: [0.035, 0.12, 9.9] as const },
        ]),
      ),
    );
  }

  private buildGuideSystem(): void {
    const { structuralSteel, serviceMetal, gasket } =
      this.resources.materials;
    const railZ = [83.25, 87.75] as const;
    const mountY = [31.2, 38.9, 48.5, 58.1, 67.7, 73.3] as const;

    this.root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-elevator-continuous-guide-rails',
        size: [0.24, 48.4, 0.34],
        radius: 0.045,
        material: structuralSteel,
        transforms: railZ.map((z) => ({ position: [2.86, 51.0, z] })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-elevator-guide-running-faces',
        size: [0.08, 47.9, 0.16],
        radius: 0.025,
        material: serviceMetal,
        transforms: railZ.map((z) => ({ position: [3.005, 51.0, z] })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-guide-rail-wall-mounts',
        serviceMetal,
        mountY.flatMap((y) =>
          railZ.map((z) => ({
            position: [2.78, y, z] as const,
            size: [0.26, 0.2, 0.94] as const,
          })),
        ),
      ),
      createInstancedBoxes(
        this.resources,
        'room-4-guide-rail-isolation-pads',
        gasket,
        mountY.flatMap((y) =>
          railZ.map((z) => ({
            position: [2.735, y, z] as const,
            size: [0.035, 0.42, 0.56] as const,
          })),
        ),
      ),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-upper-guide-receiving-heads',
        size: [0.82, 1.3, 1.12],
        radius: 0.1,
        material: structuralSteel,
        transforms: railZ.map((z) => ({ position: [3.05, 74.6, z] })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-upper-guide-receiver-collars',
        serviceMetal,
        railZ.map((z) => ({
          position: [3.48, 74.6, z] as const,
          size: [0.12, 0.58, 0.64] as const,
        })),
      ),
    );
  }

  private buildCableAndFluidInfrastructure(): void {
    const { structuralSteel, serviceMetal, graphite, gasket, warningStatus } =
      this.resources.materials;

    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-4-main-vertical-power-trunk',
        size: [0.4, 37.8, 1.28],
        radius: 0.08,
        position: [15.08, 50.2, 82.3],
        material: structuralSteel,
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-power-trunk-access-bands',
        serviceMetal,
        [33.0, 40.5, 48.0, 55.5, 63.0, 68.7].map((y) => ({
          position: [14.86, y, 82.3] as const,
          size: [0.08, 0.22, 1.36] as const,
        })),
      ),
      createInstancedBoxes(
        this.resources,
        'room-4-power-trunk-wall-brackets',
        graphite,
        [34.8, 44.3, 53.9, 63.4].map((y) => ({
          position: [15.22, y, 82.3] as const,
          size: [0.18, 0.46, 1.62] as const,
        })),
      ),
      createChamferedBox(this.resources, {
        name: 'room-4-lower-power-distribution-cabinet',
        size: [0.66, 2.45, 2.2],
        radius: 0.11,
        position: [14.91, 29.0, 82.3],
        material: structuralSteel,
      }),
      createChamferedBox(this.resources, {
        name: 'room-4-upper-power-distribution-cabinet',
        size: [0.66, 2.45, 2.2],
        radius: 0.11,
        position: [14.91, 71.0, 82.3],
        material: serviceMetal,
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-power-cabinet-status-slots',
        warningStatus,
        [29.3, 71.3].map((y) => ({
          position: [14.54, y, 82.3] as const,
          size: [0.035, 0.12, 0.74] as const,
        })),
      ),
    );

    const pipeRuns = [
      { z: 88.25, radius: 0.14, material: serviceMetal },
      { z: 89.05, radius: 0.105, material: graphite },
    ] as const;
    for (const [index, run] of pipeRuns.entries()) {
      this.root.add(
        this.createPipeBetween(
          `room-4-service-riser-${index + 1}`,
          [15.05, 28.4, run.z],
          [15.05, 70.3, run.z],
          run.radius,
          run.material,
        ),
        createBorrowedCylinder(this.resources, {
          name: `room-4-service-riser-${index + 1}-lower-flange`,
          size: [run.radius * 1.65, 0.13, run.radius * 1.65],
          position: [15.05, 28.4, run.z],
          material: gasket,
        }),
        createBorrowedCylinder(this.resources, {
          name: `room-4-service-riser-${index + 1}-upper-flange`,
          size: [run.radius * 1.65, 0.13, run.radius * 1.65],
          position: [15.05, 70.3, run.z],
          material: serviceMetal,
        }),
      );
    }
    this.root.add(
      createInstancedBoxes(
        this.resources,
        'room-4-service-riser-wall-brackets',
        structuralSteel,
        [33.2, 42.7, 52.2, 61.7, 69.0].flatMap((y) =>
          pipeRuns.map((run) => ({
            position: [15.22, y, run.z] as const,
            size: [0.18, 0.16, 0.5] as const,
          })),
        ),
      ),
    );
  }

  private buildMaintenanceModules(): void {
    const {
      structuralSteel,
      serviceMetal,
      mechanicalBacking,
      gasket,
      neutralFixture,
    } = this.resources.materials;

    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-4-south-recessed-maintenance-bay',
        size: [3.8, 4.6, 0.13],
        radius: 0.08,
        position: [5.35, 56.7, SOUTH_FACE_Z + 0.075],
        material: mechanicalBacking,
      }),
      createRectangularFrame(this.resources, {
        name: 'room-4-south-maintenance-bay-load-frame',
        width: 3.5,
        height: 4.3,
        barWidth: 0.24,
        depth: 0.11,
        position: [5.35, 56.7, SOUTH_FACE_Z + 0.15],
        material: structuralSteel,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-south-maintenance-bay-cabinets',
        size: [1.3, 1.45, 0.18],
        radius: 0.07,
        material: serviceMetal,
        transforms: [
          { position: [4.55, 57.4, SOUTH_FACE_Z + 0.2] },
          { position: [6.15, 57.4, SOUTH_FACE_Z + 0.2] },
          { position: [5.35, 55.55, SOUTH_FACE_Z + 0.2], scale: [1.55, 0.55, 1] },
        ],
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-south-maintenance-cabinet-gaskets',
        gasket,
        [4.55, 6.15].map((x) => ({
          position: [x, 57.4, SOUTH_FACE_Z + 0.305] as const,
          size: [0.82, 0.92, 0.025] as const,
        })),
      ),
      createBorrowedBox(this.resources, {
        name: 'room-4-south-maintenance-static-task-lamp',
        size: [2.1, 0.14, 0.08],
        position: [5.35, 59.35, SOUTH_FACE_Z + 0.23],
        material: neutralFixture,
      }),
      createChamferedBox(this.resources, {
        name: 'room-4-north-recessed-ventilation-module',
        size: [3.7, 3.2, 0.14],
        radius: 0.08,
        position: [12.85, 47.5, NORTH_FACE_Z - 0.08],
        material: mechanicalBacking,
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-north-ventilation-module-louvres',
        serviceMetal,
        [46.5, 47.0, 47.5, 48.0, 48.5].map((y) => ({
          position: [12.85, y, NORTH_FACE_Z - 0.17] as const,
          size: [3.05, 0.16, 0.08] as const,
        })),
      ),
    );
  }

  private buildLaserInfrastructure(hazards: readonly LaserHazard[]): void {
    const { structuralSteel, serviceMetal, graphite, lockedStatus } =
      this.resources.materials;
    const mounts = hazards.map((hazard) => {
      const west = hazard.start.x < SHAFT_CENTRE_X;
      return {
        position: [west ? 3.1 : 14.9, hazard.start.y, hazard.start.z] as const,
        rotation: [0, 0, west ? Math.PI / 2 : -Math.PI / 2] as const,
      };
    });
    const wallPads = hazards.map((hazard) => ({
      position: [
        hazard.start.x < SHAFT_CENTRE_X ? WEST_FACE_X + 0.025 : EAST_FACE_X - 0.025,
        hazard.start.y,
        hazard.start.z,
      ] as const,
      size: [0.08, 1.15, 1.15] as const,
    }));

    this.root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-laser-origin-precision-instrument-housings',
        size: [0.72, 0.68, 0.68],
        radius: 0.11,
        material: structuralSteel,
        transforms: mounts,
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-laser-origin-recessed-wall-plates',
        graphite,
        wallPads,
      ),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-laser-origin-alignment-collars',
        size: [0.16, 0.86, 0.86],
        radius: 0.06,
        material: serviceMetal,
        transforms: hazards.map((hazard) => ({
          position: [
            hazard.start.x < SHAFT_CENTRE_X ? 3.47 : 14.53,
            hazard.start.y,
            hazard.start.z,
          ],
        })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-laser-origin-hazard-identifiers',
        lockedStatus,
        hazards.map((hazard) => ({
          position: [
            hazard.start.x < SHAFT_CENTRE_X ? WEST_FACE_X + 0.08 : EAST_FACE_X - 0.08,
            hazard.start.y + 0.48,
            hazard.start.z,
          ] as const,
          size: [0.035, 0.12, 0.52] as const,
        })),
      ),
      createInstancedBoxes(
        this.resources,
        'room-4-laser-origin-service-feeds',
        graphite,
        hazards.map((hazard) => {
          const nearestBand = STRUCTURAL_BAND_Y.reduce((nearest, band) =>
            Math.abs(band - hazard.start.y) < Math.abs(nearest - hazard.start.y)
              ? band
              : nearest,
          );
          const height = Math.max(0.35, Math.abs(nearestBand - hazard.start.y));
          return {
            position: [
              hazard.start.x < SHAFT_CENTRE_X ? WEST_FACE_X + 0.055 : EAST_FACE_X - 0.055,
              (nearestBand + hazard.start.y) * 0.5,
              hazard.start.z + 0.48,
            ] as const,
            size: [0.04, height, 0.1] as const,
          };
        }),
      ),
    );
  }

  private buildBottomMachinery(): void {
    const { elevatorTread, structuralSteel, serviceMetal, gasket, warningStatus } =
      this.resources.materials;

    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-4-shaft-floor-durable-service-surface',
        size: [12.7, 0.12, 12.7],
        radius: 0.08,
        position: [9, 26.05, 85.5],
        material: elevatorTread,
      }),
      createChamferedBox(this.resources, {
        name: 'room-4-lower-elevator-machinery-base',
        size: [9.4, 0.22, 9.4],
        radius: 0.12,
        position: [9, 26.18, 85.5],
        material: structuralSteel,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-lower-guide-termination-blocks',
        size: [1.05, 1.18, 1.28],
        radius: 0.11,
        material: structuralSteel,
        transforms: [83.25, 87.75].map((z) => ({ position: [3.15, 26.72, z] })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-lower-load-buffer-stops',
        size: [0.72, 1.38, 0.72],
        radius: 0.16,
        material: serviceMetal,
        transforms: [
          [6.2, 26.8, 82.7],
          [11.8, 26.8, 82.7],
          [6.2, 26.8, 88.3],
          [11.8, 26.8, 88.3],
        ].map((position) => ({ position: position as [number, number, number] })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-4-lower-buffer-rubber-faces',
        gasket,
        [
          [6.2, 27.48, 82.7],
          [11.8, 27.48, 82.7],
          [6.2, 27.48, 88.3],
          [11.8, 27.48, 88.3],
        ].map((position) => ({
          position: position as [number, number, number],
          size: [0.52, 0.08, 0.52] as const,
        })),
      ),
      createInstancedBoxes(
        this.resources,
        'room-4-lower-machinery-sparse-amber-indexing',
        warningStatus,
        [
          { position: [5.25, 26.305, 81.25] as const, size: [2.0, 0.025, 0.08] as const },
          { position: [12.75, 26.305, 89.75] as const, size: [2.0, 0.025, 0.08] as const },
        ],
      ),
      createChamferedBox(this.resources, {
        name: 'room-4-entry-duct-service-threshold',
        size: [2.36, 0.12, 1.18],
        radius: 0.04,
        position: [9, 31.18, 80.1],
        material: serviceMetal,
      }),
    );
  }

  private buildTopArrival(): void {
    const {
      mainCeramic,
      secondaryCeramic,
      structuralSteel,
      serviceMetal,
      elevatorTread,
      neutralFixture,
    } = this.resources.materials;

    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-4-exit-platform-composite-tread',
        size: [4.45, 0.16, 2.95],
        radius: 0.07,
        position: [9, 74.74, 90.2],
        material: elevatorTread,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-exit-platform-graphite-underframe',
        size: [3.8, 0.2, 0.22],
        radius: 0.035,
        material: structuralSteel,
        transforms: [89.15, 91.2].map((z) => ({ position: [9, 74.12, z] })),
      }),
      createRectangularFrame(this.resources, {
        name: 'room-4-upper-receiving-portal-structural-frame',
        width: 3.55,
        height: 5.25,
        barWidth: 0.42,
        depth: 0.34,
        position: [9, 76.8, 91.36],
        material: structuralSteel,
      }),
      createRectangularFrame(this.resources, {
        name: 'room-4-upper-receiving-portal-service-liner',
        width: 2.95,
        height: 4.65,
        barWidth: 0.14,
        depth: 0.2,
        position: [9, 76.8, 91.16],
        material: serviceMetal,
      }),
      createChamferedBox(this.resources, {
        name: 'room-4-upper-clean-facility-return-header',
        size: [5.25, 0.78, 0.42],
        radius: 0.1,
        position: [9, 79.35, 91.35],
        material: mainCeramic,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-4-upper-clean-facility-return-jambs',
        size: [0.72, 4.7, 0.42],
        radius: 0.08,
        material: secondaryCeramic,
        transforms: [7.1, 10.9].map((x) => ({ position: [x, 76.8, 91.35] })),
      }),
      createChamferedBox(this.resources, {
        name: 'room-4-upper-destination-static-light-housing',
        size: [2.8, 0.28, 0.36],
        radius: 0.055,
        position: [9, 79.18, 90.98],
        material: structuralSteel,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-4-upper-destination-static-white-diffuser',
        size: [2.3, 0.08, 0.1],
        position: [9, 79.04, 90.76],
        material: neutralFixture,
      }),
    );
  }

  private buildSectorSignage(): void {
    const { structuralSteel, serviceMetal } = this.resources.materials;
    const signs = [
      {
        name: 'room-4-entry-core-sign',
        label: 'roomFour' as const,
        size: [4.4, 1.05] as const,
        position: [9, 34.65, 79.965] as const,
        backingPosition: [9, 34.65, 79.88] as const,
        backingSize: [4.78, 1.38, 0.14] as const,
        frameSize: [5.02, 1.62] as const,
      },
      {
        name: 'room-4-service-level-s01-sign',
        label: 'serviceOne' as const,
        size: [3.4, 0.82] as const,
        position: [5.15, 42.25, 91.075] as const,
        rotation: [0, Math.PI, 0] as const,
        backingPosition: [5.15, 42.25, 91.16] as const,
        backingSize: [3.72, 1.12, 0.14] as const,
        frameSize: [3.94, 1.34] as const,
      },
      {
        name: 'room-4-transfer-array-s02-sign',
        label: 'transferTwo' as const,
        size: [3.4, 0.82] as const,
        position: [12.85, 58.65, 91.075] as const,
        rotation: [0, Math.PI, 0] as const,
        backingPosition: [12.85, 58.65, 91.16] as const,
        backingSize: [3.72, 1.12, 0.14] as const,
        frameSize: [3.94, 1.34] as const,
      },
      {
        name: 'room-4-laser-core-sign',
        label: 'laserCore' as const,
        size: [3.35, 0.8] as const,
        position: [5.15, 65.0, 79.965] as const,
        backingPosition: [5.15, 65.0, 79.88] as const,
        backingSize: [3.67, 1.1, 0.14] as const,
        frameSize: [3.89, 1.32] as const,
      },
      {
        name: 'room-4-room-five-destination-sign',
        label: 'roomFiveExit' as const,
        size: [2.65, 0.68] as const,
        position: [9, 78.05, 90.945] as const,
        rotation: [0, Math.PI, 0] as const,
        backingPosition: [9, 78.05, 91.03] as const,
        backingSize: [2.95, 0.96, 0.14] as const,
        frameSize: [3.17, 1.18] as const,
      },
    ];
    for (const sign of signs) {
      const backing = createChamferedBox(this.resources, {
        name: `${sign.name}-recessed-backing`,
        size: sign.backingSize,
        radius: 0.045,
        position: sign.backingPosition,
        material: structuralSteel,
      });
      const frame = createRectangularFrame(this.resources, {
        name: `${sign.name}-service-frame`,
        width: sign.frameSize[0],
        height: sign.frameSize[1],
        barWidth: 0.11,
        depth: 0.1,
        position: [
          sign.backingPosition[0],
          sign.backingPosition[1],
          sign.position[2] > sign.backingPosition[2]
            ? sign.position[2] - 0.025
            : sign.position[2] + 0.025,
        ],
        material: serviceMetal,
      });
      const created = createSignagePanel(this.resources, sign);
      this.signGeometries.add(created.geometry);
      this.root.add(backing, frame, created.mesh);
    }
  }

  private createPipeBetween(
    name: string,
    start: readonly [number, number, number],
    end: readonly [number, number, number],
    radius: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const direction = new THREE.Vector3(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2],
    );
    const mesh = createBorrowedCylinder(this.resources, {
      name,
      size: [radius, direction.length(), radius],
      position: [
        (start[0] + end[0]) * 0.5,
        (start[1] + end[1]) * 0.5,
        (start[2] + end[2]) * 0.5,
      ],
      material,
    });
    mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    return mesh;
  }
}
