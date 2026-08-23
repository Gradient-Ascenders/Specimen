import * as THREE from 'three';

import type { LaserHazard } from '../../../hazards/LaserHazard.ts';
import type { MovingPlatform } from '../../../puzzle/MovingPlatform.ts';
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

export type RoomFiveContainmentPanel = 'front' | 'rear' | 'left' | 'right';

export interface RoomFivePanelPivots {
  readonly front: THREE.Group;
  readonly rear: THREE.Group;
  readonly left: THREE.Group;
  readonly right: THREE.Group;
}

interface PlatformDressing {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
}

const PLATFORM_DRESSINGS: readonly PlatformDressing[] = [
  { name: 'lower-platform-c', size: [4.5, 0.5, 4], position: [0.084, 76.687, 102.793] },
  { name: 'central-rest-platform', size: [5, 0.5, 4.5], position: [-0.68, 80.832, 115.652] },
  { name: 'upper-platform-a', size: [1.849, 0.523, 2.091], position: [6.109, 82.374, 110.287] },
  { name: 'upper-platform-a-001', size: [1.849, 0.523, 1.921], position: [6.109, 82.374, 115.657] },
  { name: 'upper-platform-a-003', size: [1.849, 0.523, 2.091], position: [6.109, 82.374, 105.453] },
  { name: 'final-approach-platform', size: [4.5, 0.5, 4], position: [15.436, 93.2, 120] },
  { name: 'final-bounce-platform', size: [5, 0.5, 4], position: [-9.5, 95.5, 121.5] },
];

const UP = new THREE.Vector3(0, 1, 0);
const CLOSED_PANEL_ROTATION = new THREE.Euler(0, 0, 0);

/**
 * Room 5-only presentation layer around the frozen finale route.
 *
 * Every object here is visual-only. The chamber panels are independent static
 * pivots prepared for later cutscene work; production never animates them.
 * Collision, moving-platform pose, lasers, lever state, dissolve state and the
 * contained specimen release remain owned by RoomFiveGreybox and its systems.
 */
export class RoomFiveArt {
  readonly root = new THREE.Group();
  readonly containmentAssembly = new THREE.Group();
  readonly containmentPanelRoot = new THREE.Group();
  readonly panelPivots: RoomFivePanelPivots;

  private readonly resources: ContainmentArtResources;
  private readonly signGeometries = new Set<THREE.BufferGeometry>();
  private readonly movingPlatformDressings: readonly THREE.Group[];
  private disposed = false;

  constructor(
    resources: ContainmentArtResources,
    hazards: readonly LaserHazard[],
    movingPlatforms: readonly [MovingPlatform, MovingPlatform],
  ) {
    this.resources = resources;
    this.root.name = 'room-5-production-art';
    this.containmentAssembly.name = 'room-5-containment-assembly';
    this.containmentPanelRoot.name = 'room-5-containment-panel-root';
    markVisualOnly(this.root);
    markVisualOnly(this.containmentAssembly);
    markVisualOnly(this.containmentPanelRoot);

    this.panelPivots = this.buildContainmentPanels();
    this.containmentAssembly.add(this.containmentPanelRoot);

    this.buildShell();
    this.buildContainmentBase();
    this.buildContainmentClamps();
    this.buildUpperServiceManifold();
    this.buildInstrumentationAndStressCues();
    this.buildStaticPlatforms();
    this.buildStickyInstallations();
    this.buildLaserInfrastructure(hazards);
    this.buildObservationRoom();
    this.buildObservationConnection();
    this.buildSolubleDoorSurround();
    this.buildSignage();
    this.root.add(this.containmentAssembly);

    this.movingPlatformDressings = movingPlatforms.map((platform, index) =>
      this.buildMovingPlatformDressing(platform, index + 1),
    );
    this.reset();
  }

  /** Art-preview hook only. Production code does not call this method. */
  setPanelPreview(panel: RoomFiveContainmentPanel, angleRadians: number): void {
    const pivot = this.panelPivots[panel];
    pivot.rotation.copy(CLOSED_PANEL_ROTATION);
    pivot.rotation.y = angleRadians;
  }

  reset(): void {
    for (const pivot of Object.values(this.panelPivots)) {
      pivot.rotation.copy(CLOSED_PANEL_ROTATION);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const dressing of this.movingPlatformDressings) {
      dressing.removeFromParent();
      dressing.clear();
    }
    for (const geometry of this.signGeometries) geometry.dispose();
    this.signGeometries.clear();
    this.root.clear();
  }

  private buildShell(): void {
    const {
      mainCeramic,
      secondaryCeramic,
      clinicalFloor,
      graphite,
      mechanicalBacking,
      serviceMetal,
      structuralSteel,
      neutralFixture,
    } = this.resources.materials;

    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-5-clinical-floor-skin',
        size: [39.55, 0.1, 33.55],
        radius: 0.045,
        position: [0, 74.72, 108.5],
        material: clinicalFloor,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-5-west-wall-mechanical-substrate',
        size: [0.08, 25.7, 33.55],
        position: [-19.79, 87.75, 108.5],
        material: mechanicalBacking,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-5-east-wall-mechanical-substrate',
        size: [0.08, 25.7, 33.55],
        position: [19.79, 87.75, 108.5],
        material: mechanicalBacking,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-5-ceiling-clean-substrate',
        size: [39.55, 0.08, 33.55],
        position: [0, 100.54, 108.5],
        material: mainCeramic,
      }),
    );

    const wallPanels = [
      { name: 'west-front', size: [13.0, 10.0, 0.12] as const, position: [-19.7, 81.0, 99.0] as const, rotation: [0, Math.PI / 2, 0] as const, material: mainCeramic },
      { name: 'west-rear', size: [14.7, 10.0, 0.12] as const, position: [-19.7, 81.0, 117.2] as const, rotation: [0, Math.PI / 2, 0] as const, material: secondaryCeramic },
      { name: 'west-upper', size: [25.8, 10.7, 0.12] as const, position: [-19.7, 94.6, 108.5] as const, rotation: [0, Math.PI / 2, 0] as const, material: mainCeramic },
      { name: 'east-front', size: [12.5, 8.5, 0.12] as const, position: [19.7, 80.2, 98.5] as const, rotation: [0, -Math.PI / 2, 0] as const, material: secondaryCeramic },
      { name: 'east-rear-lower', size: [10.1, 8.5, 0.12] as const, position: [19.7, 80.2, 120.0] as const, rotation: [0, -Math.PI / 2, 0] as const, material: mainCeramic },
      { name: 'east-upper-front', size: [9.4, 5.4, 0.12] as const, position: [19.7, 97.3, 98.6] as const, rotation: [0, -Math.PI / 2, 0] as const, material: mainCeramic },
      { name: 'east-upper-rear', size: [8.2, 5.4, 0.12] as const, position: [19.7, 97.3, 121.2] as const, rotation: [0, -Math.PI / 2, 0] as const, material: secondaryCeramic },
    ];
    for (const panel of wallPanels) {
      this.root.add(createChamferedBox(this.resources, {
        name: `room-5-${panel.name}-clinical-wall-zone`,
        size: panel.size,
        radius: 0.06,
        position: panel.position,
        rotation: panel.rotation,
        material: panel.material,
      }));
    }

    // Front and rear skins exactly respect the authored openings.
    const frontRearSkins = [
      { name: 'front-west', size: [27.2, 25.7, 0.12] as const, position: [-6.25, 87.75, 91.71] as const, material: mainCeramic },
      { name: 'front-east', size: [9.2, 25.7, 0.12] as const, position: [15.25, 87.75, 91.71] as const, material: secondaryCeramic },
      { name: 'front-entry-header', size: [2.72, 21.7, 0.12] as const, position: [9, 89.75, 91.71] as const, material: mainCeramic },
      { name: 'rear-west', size: [7.72, 25.7, 0.12] as const, position: [-16, 87.75, 125.29] as const, rotation: [0, Math.PI, 0] as const, material: secondaryCeramic },
      { name: 'rear-left-of-door', size: [6.22, 25.7, 0.12] as const, position: [-4.75, 87.75, 125.29] as const, rotation: [0, Math.PI, 0] as const, material: mainCeramic },
      { name: 'rear-right-of-door', size: [18.22, 25.7, 0.12] as const, position: [10.75, 87.75, 125.29] as const, rotation: [0, Math.PI, 0] as const, material: secondaryCeramic },
      { name: 'rear-door-header', size: [2.72, 21.2, 0.12] as const, position: [0, 90, 125.29] as const, rotation: [0, Math.PI, 0] as const, material: mainCeramic },
      { name: 'rear-observation-sill', size: [3.72, 21.9, 0.12] as const, position: [-10, 85.85, 125.29] as const, rotation: [0, Math.PI, 0] as const, material: mainCeramic },
    ];
    for (const panel of frontRearSkins) {
      this.root.add(createChamferedBox(this.resources, {
        name: `room-5-${panel.name}-clinical-skin`,
        size: panel.size,
        radius: 0.055,
        position: panel.position,
        rotation: panel.rotation,
        material: panel.material,
      }));
    }

    this.root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-major-graphite-wall-load-ribs',
        size: [0.3, 25.1, 0.4],
        radius: 0.055,
        material: structuralSteel,
        transforms: [
          { position: [-19.62, 87.75, 96.3] },
          { position: [-19.62, 87.75, 120.8] },
          { position: [19.62, 87.75, 96.3] },
          { position: [19.62, 87.75, 120.8] },
        ],
      }),
      createInstancedBoxes(
        this.resources,
        'room-5-floor-recessed-service-seams',
        graphite,
        [-12, -4, 4, 12].map((x) => ({
          position: [x, 74.776, 108.5] as const,
          size: [0.035, 0.012, 31.8] as const,
        })),
      ),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-ceiling-primary-service-spines',
        size: [0.38, 0.38, 29.0],
        radius: 0.065,
        material: serviceMetal,
        transforms: [-13.2, 0, 13.2].map((x) => ({ position: [x, 100.26, 108.5] })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-5-ceiling-static-fixture-diffusers',
        neutralFixture,
        [
          [-11.5, 100.05, 97.5], [0, 100.05, 97.5], [11.5, 100.05, 97.5],
          [-11.5, 100.05, 120.0], [11.5, 100.05, 120.0],
        ].map((position) => ({
          position: position as [number, number, number],
          size: [4.6, 0.08, 0.45] as const,
        })),
      ),
    );
  }

  private buildContainmentPanels(): RoomFivePanelPivots {
    const front = this.createContainmentPanel('front', [-2.45, 77.08, 107.74], 'x-positive');
    const rear = this.createContainmentPanel('rear', [2.45, 77.08, 112.26], 'x-negative');
    const left = this.createContainmentPanel('left', [-2.56, 77.08, 112.12], 'z-negative');
    const right = this.createContainmentPanel('right', [2.56, 77.08, 107.88], 'z-positive');
    this.containmentPanelRoot.add(front, rear, left, right);
    return { front, rear, left, right };
  }

  private createContainmentPanel(
    panel: RoomFiveContainmentPanel,
    pivotPosition: readonly [number, number, number],
    direction: 'x-positive' | 'x-negative' | 'z-positive' | 'z-negative',
  ): THREE.Group {
    const { containmentGlass, graphite, gasket, serviceMetal } =
      this.resources.materials;
    const pivot = new THREE.Group();
    pivot.name = `room-5-containment-panel-${panel}-pivot`;
    pivot.position.set(...pivotPosition);
    pivot.userData.panel = panel;
    pivot.userData.initialState = 'closed';
    pivot.userData.cutsceneReady = true;
    markVisualOnly(pivot);

    const leaf = new THREE.Group();
    leaf.name = `room-5-containment-panel-${panel}-leaf`;
    markVisualOnly(leaf);
    const alongX = direction.startsWith('x');
    const sign = direction.endsWith('positive') ? 1 : -1;
    const leafOffset = sign * (alongX ? 2.45 : 2.12);
    if (alongX) leaf.position.x = leafOffset;
    else leaf.position.z = leafOffset;

    leaf.add(
      createChamferedBox(this.resources, {
        name: `room-5-containment-panel-${panel}-reinforced-pane`,
        size: alongX ? [4.58, 2.48, 0.055] : [0.055, 2.48, 3.92],
        radius: 0.025,
        material: containmentGlass,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: `room-5-containment-panel-${panel}-graphite-gasket`,
        size: alongX ? [4.78, 0.16, 0.12] : [0.12, 0.16, 4.12],
        radius: 0.025,
        material: gasket,
        transforms: [-1.34, 1.34].map((y) => ({ position: [0, y, 0] })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: `room-5-containment-panel-${panel}-structural-stiles`,
        size: alongX ? [0.18, 2.82, 0.16] : [0.16, 2.82, 0.18],
        radius: 0.03,
        material: graphite,
        transforms: [-1, 1].map((edge) => ({
          position: alongX ? [edge * 2.38, 0, 0] : [0, 0, edge * 2.05],
        })),
      }),
      createInstancedBoxes(
        this.resources,
        `room-5-containment-panel-${panel}-hinge-knuckles`,
        serviceMetal,
        [-0.86, 0, 0.86].map((y) => ({
          position: alongX
            ? [-sign * 2.47, y, 0] as const
            : [0, y, -sign * 2.14] as const,
          size: alongX ? [0.18, 0.3, 0.25] as const : [0.25, 0.3, 0.18] as const,
        })),
      ),
    );
    pivot.add(leaf);
    return pivot;
  }

  private buildContainmentBase(): void {
    const {
      secondaryCeramic,
      graphite,
      serviceMetal,
      structuralSteel,
      gasket,
      warningStatus,
      staticCyanEmissive,
      containmentGlass,
    } = this.resources.materials;
    const base = new THREE.Group();
    base.name = 'room-5-containment-base';
    markVisualOnly(base);
    const lowerRing = new THREE.Group();
    lowerRing.name = 'room-5-lower-containment-ring';
    markVisualOnly(lowerRing);
    const upperRing = new THREE.Group();
    upperRing.name = 'room-5-upper-containment-ring';
    markVisualOnly(upperRing);

    base.add(
      createInstancedBoxes(
        this.resources,
        'room-5-containment-floor-zone-graphite-inlay',
        graphite,
        [
          { position: [0, 74.787, 105.45] as const, size: [9.2, 0.018, 0.08] as const },
          { position: [0, 74.787, 114.55] as const, size: [9.2, 0.018, 0.08] as const },
          { position: [-4.56, 74.787, 110] as const, size: [0.08, 0.018, 9.1] as const },
          { position: [4.56, 74.787, 110] as const, size: [0.08, 0.018, 9.1] as const },
        ],
      ),
      createInstancedBoxes(
        this.resources,
        'room-5-containment-floor-zone-warning-corners',
        warningStatus,
        [
          [-4.15, 74.798, 105.45], [4.15, 74.798, 105.45],
          [-4.15, 74.798, 114.55], [4.15, 74.798, 114.55],
        ].map((position) => ({
          position: position as [number, number, number],
          size: [0.5, 0.012, 0.12] as const,
        })),
      ),
      createChamferedBox(this.resources, {
        name: 'room-5-containment-instrumentation-plinth',
        size: [5.92, 0.46, 5.92],
        radius: 0.14,
        position: [0, 75.33, 110],
        material: structuralSteel,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-containment-clean-load-deck',
        size: [5.72, 0.12, 5.72],
        radius: 0.08,
        position: [0, 75.515, 110],
        material: secondaryCeramic,
      }),
      createInstancedBoxes(
        this.resources,
        'room-5-containment-recessed-drain-slots',
        gasket,
        [-1.55, -0.52, 0.52, 1.55].map((x) => ({
          position: [x, 75.582, 107.38] as const,
          size: [0.55, 0.018, 0.08] as const,
        })),
      ),
      createChamferedBox(this.resources, {
        name: 'room-5-containment-front-instrumentation-bank',
        size: [3.55, 0.34, 0.25],
        radius: 0.055,
        position: [0, 75.32, 107.06],
        material: graphite,
      }),
      createInstancedBoxes(
        this.resources,
        'room-5-containment-front-status-array',
        staticCyanEmissive,
        [-1.05, -0.52, 0, 0.52].map((x) => ({
          position: [x, 75.35, 106.925] as const,
          size: [0.26, 0.08, 0.03] as const,
        })),
      ),
      createBorrowedBox(this.resources, {
        name: 'room-5-containment-overpressure-status',
        size: [0.32, 0.1, 0.03],
        position: [1.12, 75.35, 106.925],
        material: warningStatus,
      }),
    );

    lowerRing.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-lower-ring-primary-load-beams',
        size: [5.45, 0.3, 0.34],
        radius: 0.07,
        material: secondaryCeramic,
        transforms: [107.62, 112.38].map((z) => ({ position: [0, 75.78, z] })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-lower-ring-cross-load-beams',
        size: [4.42, 0.3, 0.34],
        radius: 0.07,
        material: serviceMetal,
        transforms: [-2.7, 2.7].map((x) => ({
          position: [x, 75.78, 110],
          rotation: [0, Math.PI / 2, 0],
        })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-5-lower-ring-dark-pressure-gasket',
        gasket,
        [
          { position: [0, 75.98, 107.74] as const, size: [5.05, 0.1, 0.1] as const },
          { position: [0, 75.98, 112.26] as const, size: [5.05, 0.1, 0.1] as const },
          { position: [-2.54, 75.98, 110] as const, size: [0.1, 0.1, 4.42] as const },
          { position: [2.54, 75.98, 110] as const, size: [0.1, 0.1, 4.42] as const },
        ],
      ),
    );

    upperRing.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-upper-ring-longitudinal-housing',
        size: [5.0, 0.28, 0.3],
        radius: 0.06,
        material: secondaryCeramic,
        transforms: [107.78, 112.22].map((z) => ({ position: [0, 78.48, z] })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-upper-ring-cross-housing',
        size: [4.15, 0.28, 0.3],
        radius: 0.06,
        material: serviceMetal,
        transforms: [-2.48, 2.48].map((x) => ({
          position: [x, 78.48, 110],
          rotation: [0, Math.PI / 2, 0],
        })),
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-containment-traversable-roof-pane',
        size: [4.72, 0.055, 4.08],
        radius: 0.025,
        position: [0, 78.645, 110],
        material: containmentGlass,
      }),
    );

    base.add(lowerRing, upperRing);
    this.containmentAssembly.add(base);
  }

  private buildContainmentClamps(): void {
    const {
      secondaryCeramic,
      graphite,
      serviceMetal,
      gasket,
      warningStatus,
    } = this.resources.materials;
    const clamps = new THREE.Group();
    clamps.name = 'room-5-structural-clamps';
    markVisualOnly(clamps);
    const definitions = [
      { name: 'front', position: [0, 77.12, 107.42] as const, alongX: true },
      { name: 'rear', position: [0, 77.12, 112.58] as const, alongX: true },
      { name: 'left', position: [-2.8, 77.12, 110] as const, alongX: false },
      { name: 'right', position: [2.8, 77.12, 110] as const, alongX: false },
    ];
    for (const [index, definition] of definitions.entries()) {
      const root = new THREE.Group();
      root.name = `room-5-containment-${definition.name}-restraint-clamp`;
      markVisualOnly(root);
      root.add(
        createChamferedBox(this.resources, {
          name: `${root.name}-spine`,
          size: definition.alongX ? [1.25, 2.45, 0.42] : [0.42, 2.45, 1.25],
          radius: 0.1,
          position: definition.position,
          material: secondaryCeramic,
        }),
        createInstancedChamferedBoxes(this.resources, {
          name: `${root.name}-load-jaws`,
          size: definition.alongX ? [1.65, 0.28, 0.58] : [0.58, 0.28, 1.65],
          radius: 0.065,
          material: graphite,
          transforms: [76.0, 78.25].map((y) => ({
            position: [definition.position[0], y, definition.position[2]],
          })),
        }),
        createBorrowedCylinder(this.resources, {
          name: `${root.name}-pressure-actuator`,
          size: [0.2, 1.6, 0.2],
          position: definition.position,
          material: serviceMetal,
        }),
        createBorrowedCylinder(this.resources, {
          name: `${root.name}-lower-isolation-collar`,
          size: [0.33, 0.16, 0.33],
          position: [definition.position[0], 75.98, definition.position[2]],
          material: gasket,
        }),
      );
      if (index === 1) {
        root.add(createBorrowedBox(this.resources, {
          name: 'room-5-rear-clamp-static-overload-indicator',
          size: definition.alongX ? [0.42, 0.14, 0.035] : [0.035, 0.14, 0.42],
          position: [definition.position[0], 77.55, definition.position[2] - 0.225],
          material: warningStatus,
        }));
      }
      clamps.add(root);
    }
    this.containmentAssembly.add(clamps);
  }

  private buildUpperServiceManifold(): void {
    const { graphite, serviceMetal, structuralSteel, gasket, warningStatus } =
      this.resources.materials;
    const manifold = new THREE.Group();
    manifold.name = 'room-5-upper-service-manifold';
    markVisualOnly(manifold);
    manifold.add(
      createChamferedBox(this.resources, {
        name: 'room-5-upper-manifold-pressure-header',
        size: [3.4, 0.55, 0.72],
        radius: 0.12,
        position: [0, 99.75, 111.7],
        material: structuralSteel,
      }),
      this.createPipeBetween(
        'room-5-major-overhead-compound-feed',
        [-18.9, 99.72, 111.7],
        [0, 99.72, 111.7],
        0.24,
        serviceMetal,
      ),
      createBorrowedCylinder(this.resources, {
        name: 'room-5-overhead-compound-feed-wall-flange',
        size: [0.48, 0.18, 0.48],
        position: [-19.25, 99.72, 111.7],
        rotation: [0, 0, Math.PI / 2],
        material: graphite,
      }),
      createBorrowedCylinder(this.resources, {
        name: 'room-5-overhead-compound-feed-manifold-flange',
        size: [0.42, 0.16, 0.42],
        position: [-1.65, 99.72, 111.7],
        rotation: [0, 0, Math.PI / 2],
        material: gasket,
      }),
      this.createPipeBetween(
        'room-5-manifold-rear-pressure-drop',
        [-1.75, 99.45, 112.2],
        [-1.75, 78.55, 112.2],
        0.105,
        serviceMetal,
      ),
      createBorrowedCylinder(this.resources, {
        name: 'room-5-manifold-rear-pressure-drop-upper-coupler',
        size: [0.2, 0.2, 0.2],
        position: [-1.75, 99.2, 112.2],
        material: graphite,
      }),
      createBorrowedCylinder(this.resources, {
        name: 'room-5-manifold-rear-pressure-drop-chamber-coupler',
        size: [0.23, 0.16, 0.23],
        position: [-1.75, 78.58, 112.2],
        material: gasket,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-manifold-pressure-regulator-body',
        size: [0.9, 0.85, 0.8],
        radius: 0.13,
        position: [0.78, 99.72, 111.7],
        material: graphite,
      }),
      createBorrowedCylinder(this.resources, {
        name: 'room-5-manifold-pressure-regulator-dial',
        size: [0.32, 0.12, 0.32],
        position: [0.78, 99.72, 111.25],
        rotation: [Math.PI / 2, 0, 0],
        material: warningStatus,
      }),
    );
    this.containmentAssembly.add(manifold);
  }

  private buildInstrumentationAndStressCues(): void {
    const {
      graphite,
      serviceMetal,
      gasket,
      warningStatus,
      lockedStatus,
      staticCyanEmissive,
      solubleComposite,
    } = this.resources.materials;
    const instrumentation = new THREE.Group();
    instrumentation.name = 'room-5-containment-instrumentation';
    markVisualOnly(instrumentation);
    instrumentation.add(
      createChamferedBox(this.resources, {
        name: 'room-5-containment-asymmetric-monitoring-pod',
        size: [1.15, 1.35, 0.42],
        radius: 0.11,
        position: [2.4, 76.92, 108.25],
        material: graphite,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-5-containment-monitoring-screen',
        size: [0.72, 0.52, 0.035],
        position: [2.4, 77.08, 108.02],
        material: staticCyanEmissive,
      }),
      createInstancedBoxes(
        this.resources,
        'room-5-containment-monitoring-readout-bars',
        warningStatus,
        [76.72, 76.9].map((y) => ({
          position: [2.4, y, 108.0] as const,
          size: [0.58, 0.055, 0.025] as const,
        })),
      ),
      createChamferedBox(this.resources, {
        name: 'room-5-containment-exposed-maintenance-cover',
        size: [1.2, 0.12, 0.9],
        radius: 0.06,
        position: [-1.8, 75.66, 107.13],
        rotation: [0.02, 0, -0.035],
        material: serviceMetal,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-5-containment-cracked-seal-cover-cue',
        size: [0.78, 0.025, 0.06],
        position: [-1.8, 75.735, 107.1],
        rotation: [0, 0.22, -0.08],
        material: gasket,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-5-containment-localized-feed-staining',
        size: [0.38, 0.035, 0.65],
        position: [-1.75, 75.605, 112.22],
        rotation: [0, 0.16, 0],
        material: solubleComposite,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-5-containment-pressure-warning-slot',
        size: [0.5, 0.1, 0.035],
        position: [0, 77.42, 107.20],
        material: lockedStatus,
      }),
    );

    const specimenId = this.makeSign(
      {
        name: 'room-5-contained-specimen-identification',
        label: 'primaryContainment',
        size: [1.55, 0.43],
        position: [-2, 76.55, 107.1],
        rotation: [0, Math.PI, 0],
      },
      0.26,
    );
    instrumentation.add(specimenId);
    this.containmentAssembly.add(instrumentation);
  }

  private buildStaticPlatforms(): void {
    for (const platform of PLATFORM_DRESSINGS) {
      this.root.add(this.createPlatformDressing(platform));
    }
  }

  private createPlatformDressing(platform: PlatformDressing): THREE.Group {
    const { secondaryCeramic, graphite, serviceMetal, warningStatus } =
      this.resources.materials;
    const [width, height, depth] = platform.size;
    const [x, y, z] = platform.position;
    const top = y + height * 0.5;
    const root = new THREE.Group();
    root.name = `room-5-${platform.name}-precision-platform-dressing`;
    markVisualOnly(root);
    root.add(
      createChamferedBox(this.resources, {
        name: `room-5-${platform.name}-durable-clean-tread`,
        size: [width - 0.05, 0.15, depth - 0.05],
        radius: 0.055,
        position: [x, top - 0.075, z],
        material: secondaryCeramic,
      }),
      createChamferedBox(this.resources, {
        name: `room-5-${platform.name}-service-metal-deck-seat`,
        size: [width + 0.06, 0.18, depth + 0.06],
        radius: 0.05,
        position: [x, top - 0.24, z],
        material: serviceMetal,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: `room-5-${platform.name}-graphite-underframe`,
        size: [width * 0.78, 0.18, 0.18],
        radius: 0.03,
        material: graphite,
        transforms: [-0.3, 0.3].map((offset) => ({
          position: [x, y - height * 0.5 - 0.18, z + depth * offset],
        })),
      }),
      createInstancedBoxes(
        this.resources,
        `room-5-${platform.name}-sparse-amber-identifiers`,
        warningStatus,
        [-0.27, 0.27].map((offset) => ({
          position: [x + width * offset, top + 0.004, z] as const,
          size: [0.34, 0.016, 0.055] as const,
        })),
      ),
      createBorrowedCylinder(this.resources, {
        name: `room-5-${platform.name}-underside-actuator-socket`,
        size: [Math.min(width, depth) * 0.14, 0.18, Math.min(width, depth) * 0.14],
        position: [x, y - height * 0.5 - 0.2, z],
        material: serviceMetal,
      }),
    );
    return root;
  }

  private buildMovingPlatformDressing(
    platform: MovingPlatform,
    index: number,
  ): THREE.Group {
    const { elevatorTread, graphite, serviceMetal, warningStatus } =
      this.resources.materials;
    const root = new THREE.Group();
    root.name = `room-5-moving-platform-${index}-production-dressing`;
    markVisualOnly(root);
    const width = platform.size.x;
    const height = platform.size.y;
    const depth = platform.size.z;
    root.add(
      createChamferedBox(this.resources, {
        name: `${root.name}-durable-clean-tread`,
        size: [width - 0.045, 0.15, depth - 0.045],
        radius: 0.05,
        position: [0, height * 0.5 - 0.075, 0],
        material: elevatorTread,
      }),
      createChamferedBox(this.resources, {
        name: `${root.name}-graphite-underbody`,
        size: [width - 0.14, 0.22, depth - 0.14],
        radius: 0.055,
        position: [0, -height * 0.5 + 0.11, 0],
        material: graphite,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: `${root.name}-side-socket-housings`,
        size: [0.28, 0.24, 0.5],
        radius: 0.04,
        material: serviceMetal,
        transforms: [-0.32, 0.32].map((offset) => ({
          position: [width * offset, -height * 0.5 - 0.08, 0],
        })),
      }),
      createInstancedBoxes(
        this.resources,
        `${root.name}-amber-edge-ticks`,
        warningStatus,
        [-0.27, 0.27].map((offset) => ({
          position: [width * offset, height * 0.5 + 0.004, 0] as const,
          size: [0.26, 0.016, 0.05] as const,
        })),
      ),
    );
    platform.root.add(root);
    return root;
  }

  private buildStickyInstallations(): void {
    const { graphite, serviceMetal, gasket, stickyMembrane, staticCyanEmissive } =
      this.resources.materials;
    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-5-east-ascent-adhesion-cartridge-backing',
        size: [0.1, 18.75, 5.82],
        radius: 0.045,
        position: [19.755, 89.5, 107.247],
        material: gasket,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-east-ascent-adhesion-membrane',
        size: [0.035, 18.20, 5.32],
        radius: 0.08,
        position: [19.69, 89.5, 107.247],
        material: stickyMembrane,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-east-ascent-extension-cartridge-backing',
        size: [0.1, 3.55, 11.68],
        radius: 0.045,
        position: [19.755, 97.068, 115.636],
        material: gasket,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-east-ascent-extension-adhesion-membrane',
        size: [0.035, 3.08, 11.18],
        radius: 0.08,
        position: [19.69, 97.068, 115.636],
        material: stickyMembrane,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-east-ascent-high-security-frame-verticals',
        size: [0.18, 18.65, 0.22],
        radius: 0.035,
        material: serviceMetal,
        transforms: [104.38, 110.12].map((z) => ({ position: [19.72, 89.5, z] })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-5-east-ascent-transfer-calibration-ticks',
        staticCyanEmissive,
        [82.0, 85.4, 88.8, 92.2, 95.6].map((y) => ({
          position: [19.665, y, 104.25] as const,
          size: [0.025, 0.08, 0.38] as const,
        })),
      ),
    );

    for (const [panelNumber, x] of [[1, 10], [3, 2], [5, -6]] as const) {
      this.root.add(
        createChamferedBox(this.resources, {
          name: `room-5-final-transfer-${panelNumber}-adhesion-backing`,
          size: [3.38, 6.88, 0.1],
          radius: 0.05,
          position: [x, 95.2, 125.235],
          material: gasket,
        }),
        createChamferedBox(this.resources, {
          name: `room-5-final-transfer-${panelNumber}-adhesion-membrane`,
          size: [2.9, 6.38, 0.035],
          radius: 0.075,
          position: [x, 95.2, 125.155],
          material: stickyMembrane,
        }),
        createInstancedChamferedBoxes(this.resources, {
          name: `room-5-final-transfer-${panelNumber}-security-frame-verticals`,
          size: [0.18, 6.82, 0.18],
          radius: 0.035,
          material: graphite,
          transforms: [-1.62, 1.62].map((offset) => ({
            position: [x + offset, 95.2, 125.22],
          })),
        }),
        createInstancedChamferedBoxes(this.resources, {
          name: `room-5-final-transfer-${panelNumber}-security-frame-horizontals`,
          size: [3.34, 0.18, 0.18],
          radius: 0.035,
          material: serviceMetal,
          transforms: [91.78, 98.62].map((y) => ({ position: [x, y, 125.22] })),
        }),
      );
    }
  }

  private buildLaserInfrastructure(hazards: readonly LaserHazard[]): void {
    const { graphite, serviceMetal, structuralSteel, lockedStatus } =
      this.resources.materials;
    const hazardMap = new Map(hazards.map((hazard) => [hazard.id, hazard]));
    const eastWallIds = [
      'room-5-laser-3', 'room-5-laser-4', 'room-5-laser-5',
      'room-5-laser-6', 'room-5-laser-7',
    ] as const;
    const eastWallHazards = eastWallIds.map((id) => {
      const hazard = hazardMap.get(id);
      if (!hazard) throw new Error(`Missing Room 5 laser art source ${id}.`);
      return hazard;
    });
    this.root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-east-wall-laser-service-tracks',
        size: [0.1, 6.0, 0.42],
        radius: 0.045,
        material: structuralSteel,
        transforms: eastWallHazards.map((hazard) => ({
          position: [19.74, hazard.start.y, hazard.start.z],
        })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-5-east-wall-laser-track-running-faces',
        serviceMetal,
        eastWallHazards.map((hazard) => ({
          position: [19.675, hazard.start.y, hazard.start.z] as const,
          size: [0.03, 5.4, 0.16] as const,
        })),
      ),
      createInstancedBoxes(
        this.resources,
        'room-5-east-wall-laser-warning-registers',
        lockedStatus,
        eastWallHazards.map((hazard) => ({
          position: [19.65, hazard.start.y + 2.65, hazard.start.z] as const,
          size: [0.025, 0.14, 0.42] as const,
        })),
      ),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-rear-wall-final-laser-vertical-rails',
        size: [0.5, 7.9, 0.1],
        radius: 0.045,
        material: graphite,
        transforms: [-4.148, 8.369].map((x) => ({ position: [x, 95.2, 125.24] })),
      }),
    );
  }

  private buildObservationRoom(): void {
    const {
      mainCeramic,
      secondaryCeramic,
      clinicalFloor,
      graphite,
      mechanicalBacking,
      serviceMetal,
      structuralSteel,
      gasket,
      containmentGlass,
      staticCyanEmissive,
      warningStatus,
    } = this.resources.materials;
    const observation = new THREE.Group();
    observation.name = 'room-5-observation-control-room';
    markVisualOnly(observation);
    observation.add(
      createChamferedBox(this.resources, {
        name: 'room-5-observation-floor-clean-skin',
        size: [7.72, 0.1, 6.72],
        radius: 0.045,
        position: [-10, 97.48, 129],
        material: clinicalFloor,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-5-observation-back-wall-dark-substrate',
        size: [7.72, 6.7, 0.08],
        position: [-10, 100.75, 132.29],
        material: mechanicalBacking,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-observation-back-wall-ceramic-shell',
        size: [7.28, 6.25, 0.12],
        radius: 0.06,
        position: [-10, 100.75, 132.23],
        material: secondaryCeramic,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-observation-west-wall-ceramic-shell',
        size: [6.72, 6.5, 0.12],
        radius: 0.06,
        position: [-13.79, 100.75, 129],
        rotation: [0, Math.PI / 2, 0],
        material: mainCeramic,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-observation-east-wall-ceramic-shell',
        size: [6.72, 6.5, 0.12],
        radius: 0.06,
        position: [-6.21, 100.75, 129],
        rotation: [0, -Math.PI / 2, 0],
        material: secondaryCeramic,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-observation-roof-clean-shell',
        size: [7.72, 0.12, 6.72],
        radius: 0.06,
        position: [-10, 104.03, 129],
        material: mainCeramic,
      }),
    );

    for (const x of [-13.05, -6.95]) {
      observation.add(
        createRectangularFrame(this.resources, {
          name: `room-5-observation-window-${x < -10 ? 'left' : 'right'}-graphite-frame`,
          width: 2.08,
          height: 3.4,
          barWidth: 0.24,
          depth: 0.2,
          position: [x, 99.35, 125.25],
          material: graphite,
        }),
        createChamferedBox(this.resources, {
          name: `room-5-observation-window-${x < -10 ? 'left' : 'right'}-reinforced-pane`,
          size: [1.66, 2.94, 0.055],
          radius: 0.025,
          position: [x, 99.35, 125.18],
          material: containmentGlass,
        }),
        createBorrowedBox(this.resources, {
          name: `room-5-observation-window-${x < -10 ? 'left' : 'right'}-instrumentation-sill`,
          size: [2.18, 0.24, 0.42],
          position: [x, 97.61, 125.38],
          material: structuralSteel,
        }),
      );
    }

    observation.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-observation-access-opening-graphite-jambs',
        size: [0.32, 6.45, 0.32],
        radius: 0.055,
        material: graphite,
        transforms: [-12.15, -7.85].map((x) => ({ position: [x, 100.72, 125.36] })),
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-observation-console-load-plinth',
        size: [4.8, 1.1, 0.58],
        radius: 0.12,
        position: [-10, 98.2, 131.78],
        material: structuralSteel,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-observation-angled-control-console',
        size: [4.45, 1.1, 0.42],
        radius: 0.1,
        position: [-10, 99.05, 131.62],
        rotation: [-0.24, 0, 0],
        material: graphite,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-observation-console-instrumentation-panel-left',
        size: [1.45, 0.68, 0.06],
        radius: 0.045,
        position: [-11.35, 99.3, 131.34],
        rotation: [-0.24, 0, 0],
        material: staticCyanEmissive,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-observation-console-instrumentation-panel-right',
        size: [1.45, 0.68, 0.06],
        radius: 0.045,
        position: [-8.65, 99.3, 131.34],
        rotation: [-0.24, 0, 0],
        material: warningStatus,
      }),
      createBorrowedCylinder(this.resources, {
        name: 'room-5-observation-mechanical-lever-socket',
        size: [0.52, 0.18, 0.52],
        position: [-10, 98.96, 131.4],
        rotation: [Math.PI / 2, 0, 0],
        material: serviceMetal,
      }),
      createBorrowedCylinder(this.resources, {
        name: 'room-5-observation-lever-socket-dark-gasket',
        size: [0.36, 0.19, 0.36],
        position: [-10, 98.93, 131.28],
        rotation: [Math.PI / 2, 0, 0],
        material: gasket,
      }),
    );

    const schematic = new THREE.Group();
    schematic.name = 'room-5-observation-chamber-schematic-display';
    markVisualOnly(schematic);
    schematic.add(
      createChamferedBox(this.resources, {
        name: 'room-5-observation-chamber-schematic-backing',
        size: [4.6, 2.15, 0.14],
        radius: 0.08,
        position: [-10, 102.6, 132.12],
        material: graphite,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-5-observation-chamber-schematic-screen',
        size: [4.2, 1.75, 0.035],
        position: [-10, 102.6, 132.03],
        material: staticCyanEmissive,
      }),
      createInstancedBoxes(
        this.resources,
        'room-5-observation-chamber-schematic-rings',
        gasket,
        [102.05, 103.15].map((y) => ({
          position: [-10, y, 131.995] as const,
          size: [2.0, 0.12, 0.03] as const,
        })),
      ),
      createInstancedBoxes(
        this.resources,
        'room-5-observation-chamber-schematic-clamps',
        warningStatus,
        [-11.2, -8.8].map((x) => ({
          position: [x, 102.6, 131.99] as const,
          size: [0.14, 1.35, 0.035] as const,
        })),
      ),
    );
    observation.add(schematic);
    this.root.add(observation);
  }

  private buildObservationConnection(): void {
    const { graphite, serviceMetal, staticCyanEmissive } =
      this.resources.materials;
    const connection = new THREE.Group();
    connection.name = 'room-5-observation-connection';
    markVisualOnly(connection);
    connection.add(
      createChamferedBox(this.resources, {
        name: 'room-5-floor-recessed-containment-control-trunk',
        size: [7.0, 0.025, 0.34],
        radius: 0.035,
        position: [-6.2, 74.785, 113.0],
        material: graphite,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-floor-recessed-observation-return-trunk',
        size: [0.34, 0.025, 11.9],
        radius: 0.035,
        position: [-9.7, 74.785, 118.95],
        material: serviceMetal,
      }),
      createChamferedBox(this.resources, {
        name: 'room-5-rear-wall-observation-control-riser',
        size: [0.42, 20.8, 0.08],
        radius: 0.055,
        position: [-9.7, 86.9, 125.22],
        material: graphite,
      }),
      createInstancedBoxes(
        this.resources,
        'room-5-observation-control-riser-signal-slots',
        staticCyanEmissive,
        [79.2, 83.0, 86.8, 90.6, 94.4].map((y) => ({
          position: [-9.7, y, 125.165] as const,
          size: [0.18, 0.34, 0.025] as const,
        })),
      ),
    );
    this.root.add(connection);
  }

  private buildSolubleDoorSurround(): void {
    const { graphite, serviceMetal, warningStatus } = this.resources.materials;
    this.root.add(
      createRectangularFrame(this.resources, {
        name: 'room-5-soluble-composite-door-structural-frame',
        width: 3.45,
        height: 4.95,
        barWidth: 0.28,
        depth: 0.22,
        position: [0, 77, 125.12],
        material: graphite,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-5-soluble-composite-door-pressure-latches',
        size: [0.28, 0.52, 0.3],
        radius: 0.055,
        material: serviceMetal,
        transforms: [75.7, 78.3].flatMap((y) => [
          { position: [-1.65, y, 125.02] as const },
          { position: [1.65, y, 125.02] as const },
        ]),
      }),
      createBorrowedBox(this.resources, {
        name: 'room-5-soluble-composite-door-corrosion-marker',
        size: [1.25, 0.18, 0.025],
        position: [0, 77.1, 125.075],
        material: warningStatus,
      }),
    );
  }

  private buildSignage(): void {
    const signs = [
      { name: 'room-5-entry-primary-containment-sign', label: 'roomFive' as const, size: [5.0, 1.2] as const, position: [5.0, 80.2, 91.62] as const },
      { name: 'room-5-pressure-array-sign', label: 'pressureArray' as const, size: [3.7, 0.9] as const, position: [-19.62, 84.0, 110] as const, rotation: [0, Math.PI / 2, 0] as const },
      { name: 'room-5-observation-control-sign', label: 'observationControl' as const, size: [3.8, 0.92] as const, position: [-10, 103.15, 125.10] as const },
      { name: 'room-5-soluble-access-sign', label: 'compositeAccess' as const, size: [2.65, 0.65] as const, position: [0, 80.05, 125.10] as const },
    ];
    for (const sign of signs) this.root.add(this.makeSign(sign));
  }

  private makeSign(
    options: Parameters<typeof createSignagePanel>[1],
    backingOffset = 0.13,
  ): THREE.Group {
    const { graphite, serviceMetal } = this.resources.materials;
    const group = new THREE.Group();
    group.name = `${options.name}-mounted-assembly`;
    markVisualOnly(group);
    const sign = createSignagePanel(this.resources, options);
    this.signGeometries.add(sign.geometry);
    const signRotation = new THREE.Euler(...(options.rotation ?? [0, 0, 0]));
    const signNormal = new THREE.Vector3(0, 0, 1).applyEuler(signRotation);
    const backingPosition: [number, number, number] = [
      options.position[0] - signNormal.x * backingOffset,
      options.position[1] - signNormal.y * backingOffset,
      options.position[2] - signNormal.z * backingOffset,
    ];
    group.add(
      createChamferedBox(this.resources, {
        name: `${options.name}-recessed-backing`,
        size: [options.size[0] + 0.34, options.size[1] + 0.28, 0.14],
        radius: 0.045,
        position: backingPosition,
        rotation: options.rotation,
        material: graphite,
      }),
      createRectangularFrame(this.resources, {
        name: `${options.name}-service-frame`,
        width: options.size[0] + 0.52,
        height: options.size[1] + 0.46,
        barWidth: 0.1,
        depth: 0.08,
        position: options.position,
        material: serviceMetal,
      }),
      sign.mesh,
    );
    if (options.rotation) {
      const frame = group.getObjectByName(`${options.name}-service-frame`);
      frame?.rotation.set(...options.rotation);
    }
    return group;
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
