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

interface PlatformDressing {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly support: 'basin' | 'suspended';
  readonly safetySide: 'x' | 'z';
}

const PLATFORM_DRESSINGS: readonly PlatformDressing[] = [
  { name: 'entry-platform', size: [8, 0.5, 5], position: [0, 10.15, 51.5], support: 'basin', safetySide: 'x' },
  { name: 'platform-a-bounce', size: [4.5, 0.5, 4], position: [2.7885, 10.9032, 57.6261], support: 'basin', safetySide: 'z' },
  { name: 'platform-b-gap', size: [5.13, 0.5, 4], position: [11.2583, 11.4329, 59], support: 'basin', safetySide: 'x' },
  { name: 'wall-exit-ledge', size: [4.6, 0.5, 4.8], position: [14.7, 21.1, 66], support: 'suspended', safetySide: 'z' },
  { name: 'platform-c', size: [4.2, 0.5, 4], position: [10, 22.1, 60.5406], support: 'suspended', safetySide: 'x' },
  { name: 'platform-d', size: [4, 0.5, 4], position: [5, 23.7, 62.839], support: 'suspended', safetySide: 'z' },
  { name: 'platform-e', size: [4, 0.5, 4], position: [-0.4591, 24.1676, 68.5505], support: 'suspended', safetySide: 'x' },
  { name: 'platform-f', size: [4.2, 0.5, 4], position: [5.7, 25.0753, 73.5], support: 'suspended', safetySide: 'z' },
];

const UP = new THREE.Vector3(0, 1, 0);

/** Room 3-only visual layer around the frozen acid, laser and traversal route. */
export class RoomThreeArt {
  readonly root = new THREE.Group();
  readonly acidSurfaceMaterial: THREE.MeshStandardMaterial;
  readonly acidSurface: THREE.Mesh;

  private readonly resources: ContainmentArtResources;
  private readonly signGeometries = new Set<THREE.BufferGeometry>();
  private disposed = false;

  constructor(
    resources: ContainmentArtResources,
    hazards: readonly LaserHazard[],
  ) {
    this.resources = resources;
    this.root.name = 'room-3-production-art';
    markVisualOnly(this.root);

    // Static foundation only. A later graphics pass may replace this material
    // through acidSurface without changing the authoritative acid collider.
    this.acidSurfaceMaterial = new THREE.MeshStandardMaterial({
      name: 'room-3-acid-static-foundation',
      color: 0x557c24,
      emissive: 0x142704,
      emissiveIntensity: 0.12,
      roughness: 0.31,
      metalness: 0,
      map: resources.textures.acidFoundationAlbedo,
      normalMap: resources.textures.ceramicNormal,
      roughnessMap: resources.textures.ceramicRoughness,
      normalScale: new THREE.Vector2(0.025, 0.025),
    });
    this.acidSurface = createBorrowedBox(resources, {
      name: 'room-3-acid-surface-material-integration-point',
      size: [32.7, 0.05, 26.7],
      position: [0, 5.025, 63],
      material: this.acidSurfaceMaterial,
    });
    this.acidSurface.userData.materialRole = 'replaceable-acid-surface';
    this.acidSurface.userData.authoritativeCollider = 'room-3-acid-floor';

    this.buildBasin();
    this.buildWallArchitecture();
    this.buildPlatforms();
    this.buildStickyInstallations();
    this.buildLaserInfrastructure(hazards);
    this.buildCeilingInfrastructure();
    this.buildChemicalServiceRuns();
    this.buildTransferDuct();
    this.buildTransitionsAndSignage();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.acidSurfaceMaterial.dispose();
    for (const geometry of this.signGeometries) geometry.dispose();
    this.signGeometries.clear();
    this.root.clear();
  }

  private buildBasin(): void {
    const { graphite, serviceMetal, mechanicalBacking, warningStatus } =
      this.resources.materials;

    this.root.add(
      this.acidSurface,
      createBorrowedBox(this.resources, {
        name: 'room-3-basin-chemical-resistant-well',
        size: [33.1, 1.35, 27.1],
        position: [0, 4.35, 63],
        material: mechanicalBacking,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-3-basin-substantial-perimeter-curbs',
        size: [32.85, 0.55, 0.56],
        radius: 0.08,
        material: graphite,
        transforms: [
          { position: [0, 5.26, 49.62] },
          { position: [0, 5.26, 76.38] },
          { position: [-16.38, 5.26, 63], rotation: [0, Math.PI / 2, 0], scale: [0.82, 1, 1] },
          { position: [16.38, 5.26, 63], rotation: [0, Math.PI / 2, 0], scale: [0.82, 1, 1] },
        ],
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-3-basin-service-metal-inner-edges',
        size: [32.4, 0.13, 0.18],
        radius: 0.025,
        material: serviceMetal,
        transforms: [
          { position: [0, 5.54, 49.88] },
          { position: [0, 5.54, 76.12] },
          { position: [-16.12, 5.54, 63], rotation: [0, Math.PI / 2, 0], scale: [0.81, 1, 1] },
          { position: [16.12, 5.54, 63], rotation: [0, Math.PI / 2, 0], scale: [0.81, 1, 1] },
        ],
      }),
      createInstancedBoxes(this.resources, 'room-3-basin-overflow-slots', graphite, [
        ...[-11.5, -5.8, 0, 5.8, 11.5].map((x) => ({ position: [x, 5.56, 49.79] as const, size: [1.65, 0.035, 0.2] as const })),
        ...[-10.5, -3.5, 3.5, 10.5].map((z) => ({ position: [-16.03, 5.56, 63 + z] as const, size: [0.2, 0.035, 1.65] as const })),
      ]),
      createInstancedBoxes(this.resources, 'room-3-basin-sparse-amber-edge-identifiers', warningStatus, [
        { position: [-12.2, 5.575, 49.73], size: [2.4, 0.025, 0.08] },
        { position: [11.1, 5.575, 76.27], size: [2.4, 0.025, 0.08] },
        { position: [16.27, 5.575, 55.5], size: [0.08, 0.025, 2.1] },
      ]),
    );
  }

  private buildWallArchitecture(): void {
    const { mainCeramic, secondaryCeramic, mechanicalBacking, serviceMetal } =
      this.resources.materials;

    this.root.add(
      createBorrowedBox(this.resources, { name: 'room-3-west-wall-mechanical-substrate', size: [0.08, 28.9, 27.4], position: [-16.96, 19.6, 63], material: mechanicalBacking }),
      createBorrowedBox(this.resources, { name: 'room-3-east-wall-mechanical-substrate', size: [0.08, 28.9, 27.4], position: [16.96, 19.6, 63], material: mechanicalBacking }),
    );

    const sidePanels = [
      { name: 'west-south-lower', position: [-16.86, 11.2, 54.1] as const, size: [9.2, 10.7, 0.12] as const, rotation: [0, Math.PI / 2, 0] as const, material: mainCeramic },
      { name: 'west-north-lower', position: [-16.86, 11.2, 71.0] as const, size: [8.6, 10.7, 0.12] as const, rotation: [0, Math.PI / 2, 0] as const, material: secondaryCeramic },
      { name: 'west-upper-quiet', position: [-16.86, 26.3, 57.1] as const, size: [14.9, 8.8, 0.12] as const, rotation: [0, Math.PI / 2, 0] as const, material: mainCeramic },
      { name: 'west-upper-service', position: [-16.86, 26.3, 72.3] as const, size: [8.8, 8.8, 0.12] as const, rotation: [0, Math.PI / 2, 0] as const, material: secondaryCeramic },
      { name: 'east-entry-quiet', position: [16.86, 10.3, 54.0] as const, size: [8.8, 9.0, 0.12] as const, rotation: [0, -Math.PI / 2, 0] as const, material: secondaryCeramic },
      { name: 'east-rear-lower', position: [16.86, 10.3, 72.4] as const, size: [7.7, 9.0, 0.12] as const, rotation: [0, -Math.PI / 2, 0] as const, material: mainCeramic },
      { name: 'east-upper-entry', position: [16.86, 28.2, 55.2] as const, size: [11.2, 5.6, 0.12] as const, rotation: [0, -Math.PI / 2, 0] as const, material: mainCeramic },
      { name: 'east-upper-rear', position: [16.86, 28.2, 70.9] as const, size: [9.7, 5.6, 0.12] as const, rotation: [0, -Math.PI / 2, 0] as const, material: secondaryCeramic },
    ];
    for (const panel of sidePanels) {
      this.root.add(createChamferedBox(this.resources, {
        name: `room-3-panel-${panel.name}`,
        size: panel.size,
        radius: 0.055,
        position: panel.position,
        rotation: panel.rotation,
        material: panel.material,
      }));
    }

    this.root.add(
      createChamferedBox(this.resources, { name: 'room-3-entry-panel-west', size: [15.1, 22.8, 0.12], radius: 0.06, position: [-9.25, 19.1, 49.14], material: mainCeramic }),
      createChamferedBox(this.resources, { name: 'room-3-entry-panel-east', size: [15.1, 22.8, 0.12], radius: 0.06, position: [9.25, 19.1, 49.14], material: secondaryCeramic }),
      createChamferedBox(this.resources, { name: 'room-3-entry-panel-above', size: [2.72, 19.8, 0.12], radius: 0.05, position: [0, 24.25, 49.14], material: mainCeramic }),
      createChamferedBox(this.resources, { name: 'room-3-entry-panel-below', size: [2.72, 4.9, 0.12], radius: 0.05, position: [0, 7.6, 49.14], material: secondaryCeramic }),
      createChamferedBox(this.resources, { name: 'room-3-rear-panel-west', size: [24.3, 28.8, 0.12], radius: 0.06, position: [-4.65, 19.6, 76.86], rotation: [0, Math.PI, 0], material: mainCeramic }),
      createChamferedBox(this.resources, { name: 'room-3-rear-panel-east', size: [6.7, 28.8, 0.12], radius: 0.06, position: [13.55, 19.6, 76.86], rotation: [0, Math.PI, 0], material: secondaryCeramic }),
      createInstancedChamferedBoxes(this.resources, { name: 'room-3-purposeful-service-rails', size: [0.22, 8.5, 0.34], radius: 0.035, material: serviceMetal, transforms: [
        { position: [-16.93, 18.2, 62.2] }, { position: [-16.93, 18.2, 67.7] },
        { position: [16.93, 18.2, 57.4] }, { position: [16.93, 18.2, 68.6] },
      ] }),
    );
  }

  private buildPlatforms(): void {
    for (const platform of PLATFORM_DRESSINGS) this.buildPlatform(platform);
  }

  private buildPlatform(platform: PlatformDressing): void {
    const { secondaryCeramic, graphite, serviceMetal, warningStatus } =
      this.resources.materials;
    const [width, height, depth] = platform.size;
    const [x, y, z] = platform.position;
    const top = y + height * 0.5;
    const root = new THREE.Group();
    root.name = `room-3-${platform.name}-test-rig-dressing`;
    markVisualOnly(root);
    root.add(
      createChamferedBox(this.resources, { name: `room-3-${platform.name}-durable-composite-tread`, size: [width - 0.06, 0.16, depth - 0.06], radius: 0.06, position: [x, top - 0.08, z], material: secondaryCeramic }),
      createChamferedBox(this.resources, { name: `room-3-${platform.name}-service-metal-deck-seat`, size: [width + 0.08, 0.18, depth + 0.08], radius: 0.05, position: [x, top - 0.24, z], material: serviceMetal }),
      createInstancedChamferedBoxes(this.resources, { name: `room-3-${platform.name}-graphite-underframe`, size: [width * 0.78, 0.2, 0.2], radius: 0.03, material: graphite, transforms: [-0.31, 0.31].map((offset) => ({ position: [x, y - height * 0.5 - 0.19, z + depth * offset] })) }),
      createInstancedChamferedBoxes(this.resources, { name: `room-3-${platform.name}-cross-members`, size: [0.2, 0.2, depth * 0.78], radius: 0.03, material: graphite, transforms: [-0.31, 0.31].map((offset) => ({ position: [x + width * offset, y - height * 0.5 - 0.19, z] })) }),
      createInstancedBoxes(this.resources, `room-3-${platform.name}-sparse-safety-ticks`, warningStatus, [-0.28, 0.28].map((offset) => ({
        position: platform.safetySide === 'x' ? [x + width * offset, top + 0.006, z] : [x, top + 0.006, z + depth * offset],
        size: platform.safetySide === 'x' ? [0.38, 0.018, 0.055] : [0.055, 0.018, 0.38],
      }))),
    );

    if (platform.support === 'basin') {
      const baseY = 5.65;
      const pistonTop = y - height * 0.5 - 0.3;
      root.add(
        this.createPipeBetween(`room-3-${platform.name}-actuator-column`, [x, baseY, z], [x, pistonTop, z], 0.34, graphite),
        createBorrowedCylinder(this.resources, { name: `room-3-${platform.name}-actuator-base-socket`, size: [0.72, 0.22, 0.72], position: [x, baseY, z], material: serviceMetal }),
        createBorrowedCylinder(this.resources, { name: `room-3-${platform.name}-actuator-upper-collar`, size: [0.56, 0.18, 0.56], position: [x, pistonTop, z], material: serviceMetal }),
      );
    } else {
      const underside = y - height * 0.5 - 0.3;
      root.add(
        createBorrowedCylinder(this.resources, {
          name: `room-3-${platform.name}-underside-actuator-socket`,
          size: [0.42, 0.2, 0.42],
          position: [x, underside, z],
          material: serviceMetal,
        }),
      );
    }
    this.root.add(root);
  }

  private buildStickyInstallations(): void {
    const { gasket, graphite, serviceMetal, stickyMembrane, staticCyanEmissive } =
      this.resources.materials;

    this.root.add(
      createChamferedBox(this.resources, { name: 'room-3-main-adhesion-test-backing', size: [0.18, 10.1, 8.6], radius: 0.055, position: [16.76, 17.25, 63], material: gasket }),
      createChamferedBox(this.resources, { name: 'room-3-main-adhesion-replaceable-membrane', size: [0.12, 9.28, 7.78], radius: 0.08, position: [16.69, 17.25, 63], material: stickyMembrane }),
      createInstancedChamferedBoxes(this.resources, { name: 'room-3-main-adhesion-cartridge-frame-verticals', size: [0.24, 10.0, 0.28], radius: 0.04, material: serviceMetal, transforms: [59, 67].map((z) => ({ position: [16.79, 17.25, z] })) }),
      createInstancedChamferedBoxes(this.resources, { name: 'room-3-main-adhesion-cartridge-frame-horizontals', size: [0.24, 0.28, 8.0], radius: 0.04, material: graphite, transforms: [12.5, 22].map((y) => ({ position: [16.79, y, 63] })) }),
      createInstancedBoxes(this.resources, 'room-3-main-adhesion-measurement-ticks', staticCyanEmissive, [13.4, 15.1, 16.8, 18.5, 20.2].map((y) => ({ position: [16.62, y, 58.88], size: [0.035, 0.06, 0.38] }))),
      createChamferedBox(this.resources, { name: 'room-3-final-adhesion-test-backing', size: [4.6, 7.9, 0.18], radius: 0.055, position: [9, 27.68, 76.78], material: gasket }),
      createChamferedBox(this.resources, { name: 'room-3-final-adhesion-replaceable-membrane', size: [3.82, 7.14, 0.12], radius: 0.08, position: [9, 27.68, 76.69], material: stickyMembrane }),
      createInstancedChamferedBoxes(this.resources, { name: 'room-3-final-adhesion-cartridge-frame-verticals', size: [0.26, 7.72, 0.28], radius: 0.04, material: serviceMetal, transforms: [7, 11].map((x) => ({ position: [x, 27.68, 76.79] })) }),
      createInstancedChamferedBoxes(this.resources, { name: 'room-3-final-adhesion-cartridge-frame-horizontals', size: [4.0, 0.26, 0.28], radius: 0.04, material: graphite, transforms: [24, 31.36].map((y) => ({ position: [9, y, 76.79] })) }),
    );
  }

  private buildLaserInfrastructure(hazards: readonly LaserHazard[]): void {
    const hazardMap = new Map(hazards.map((hazard) => [hazard.id, hazard]));
    for (const id of [
      'room-3-first-static-laser',
      'room-3-charged-gap-laser',
      'room-3-wall-route-laser-low',
      'room-3-wall-route-laser-high',
      'room-3-final-vent-laser',
    ]) {
      const hazard = hazardMap.get(id);
      if (!hazard) continue;
      const direction = new THREE.Vector3(
        hazard.end.x - hazard.start.x,
        hazard.end.y - hazard.start.y,
        hazard.end.z - hazard.start.z,
      ).normalize();
      this.root.add(
        this.createInstrumentHousing(`${id}-start-instrument-housing`, hazard.start, direction),
        this.createInstrumentHousing(`${id}-end-instrument-housing`, hazard.end, direction.clone().multiplyScalar(-1)),
      );
    }

    for (const id of ['room-3-wall-route-laser-low', 'room-3-wall-route-laser-high']) {
      const hazard = hazardMap.get(id);
      if (!hazard) continue;
      for (const [index, point] of [hazard.start, hazard.end].entries()) {
        this.root.add(createChamferedBox(this.resources, {
          name: `${id}-wall-alignment-bracket-${index + 1}`,
          size: [0.58, 0.18, 0.18],
          radius: 0.035,
          position: [16.74, point.y, point.z],
          material: this.resources.materials.serviceMetal,
        }));
      }
    }

    const sweep = hazardMap.get('room-3-upper-sweep-laser');
    if (sweep) {
      const direction = new THREE.Vector3(
        sweep.end.x - sweep.start.x,
        sweep.end.y - sweep.start.y,
        sweep.end.z - sweep.start.z,
      ).normalize();
      this.root.add(
        this.createInstrumentHousing('room-3-upper-sweep-origin-instrument-housing', sweep.start, direction),
      );
    }
  }

  private createInstrumentHousing(
    name: string,
    point: { readonly x: number; readonly y: number; readonly z: number },
    direction: THREE.Vector3,
  ): THREE.Group {
    const root = new THREE.Group();
    root.name = name;
    root.position.set(point.x, point.y, point.z);
    root.quaternion.setFromUnitVectors(UP, direction);
    root.scale.setScalar(0.52);
    markVisualOnly(root);
    root.add(
      createChamferedBox(this.resources, { name: `${name}-graphite-recess`, size: [1.15, 0.24, 1.15], radius: 0.09, position: [0, -0.38, 0], material: this.resources.materials.graphite }),
      createChamferedBox(this.resources, { name: `${name}-precision-mounting-plate`, size: [0.84, 0.18, 0.84], radius: 0.06, position: [0, -0.19, 0], material: this.resources.materials.serviceMetal }),
      createInstancedChamferedBoxes(this.resources, { name: `${name}-alignment-brackets`, size: [0.14, 0.58, 0.14], radius: 0.025, material: this.resources.materials.graphite, transforms: [-0.43, 0.43].map((x) => ({ position: [x, -0.44, 0] })) }),
      createBorrowedBox(this.resources, { name: `${name}-service-connection`, size: [0.28, 0.34, 0.28], position: [0, -0.68, 0], material: this.resources.materials.gasket }),
    );
    return root;
  }

  private buildCeilingInfrastructure(): void {
    const { graphite, serviceMetal, secondaryCeramic, neutralFixture } =
      this.resources.materials;
    this.root.add(
      createInstancedChamferedBoxes(this.resources, { name: 'room-3-ceiling-major-service-trusses', size: [32.6, 0.52, 0.62], radius: 0.075, material: graphite, transforms: [54, 63, 72].map((z) => ({ position: [0, 34.08, z] })) }),
      createInstancedChamferedBoxes(this.resources, { name: 'room-3-ceiling-longitudinal-guide-rails', size: [0.34, 0.34, 25.8], radius: 0.05, material: serviceMetal, transforms: [-8.4, 8.4].map((x) => ({ position: [x, 34.02, 63] })) }),
      createChamferedBox(this.resources, { name: 'room-3-ceiling-acid-extraction-duct', size: [4.6, 0.82, 18.8], radius: 0.14, position: [-12.8, 33.2, 63.8], material: secondaryCeramic }),
      createInstancedBoxes(this.resources, 'room-3-ceiling-cable-tray-ribs', graphite, [56, 59.5, 63, 66.5, 70].map((z) => ({ position: [12.7, 33.96, z], size: [2.8, 0.16, 0.18] }))),
      createBorrowedBox(this.resources, { name: 'room-3-ceiling-cable-tray-spine', size: [0.26, 0.18, 17.6], position: [12.7, 33.96, 63], material: serviceMetal }),
      ...[55, 64, 73].flatMap((z, index) => [
        createChamferedBox(this.resources, { name: `room-3-ceiling-fixture-housing-${index + 1}`, size: [3.6, 0.25, 0.92], radius: 0.055, position: [0, 34.05, z], material: graphite }),
        createChamferedBox(this.resources, { name: `room-3-ceiling-static-diffuser-${index + 1}`, size: [3.0, 0.045, 0.52], radius: 0.018, position: [0, 33.9, z], material: neutralFixture }),
      ]),
    );
  }

  private buildChemicalServiceRuns(): void {
    const { serviceMetal, graphite, warningStatus } = this.resources.materials;
    const runs = [
      { z: 68.8, radius: 0.19, material: serviceMetal },
      { z: 71.1, radius: 0.15, material: graphite },
    ] as const;
    runs.forEach((run, index) => {
      const upper: readonly [number, number, number] = [-16.05, 28.5, run.z];
      const elbow: readonly [number, number, number] = [-16.05, 7.15, run.z];
      const basin: readonly [number, number, number] = [-14.9, 5.72, run.z];
      this.root.add(
        this.createPipeBetween(`room-3-chemical-pipe-${index + 1}-vertical`, upper, elbow, run.radius, run.material),
        this.createPipeBetween(`room-3-chemical-pipe-${index + 1}-basin-feed`, elbow, basin, run.radius, run.material),
        createBorrowedCylinder(this.resources, { name: `room-3-chemical-pipe-${index + 1}-upper-flange`, size: [run.radius * 1.65, 0.12, run.radius * 1.65], position: upper, material: warningStatus }),
        createBorrowedCylinder(this.resources, { name: `room-3-chemical-pipe-${index + 1}-basin-flange`, size: [run.radius * 1.65, 0.12, run.radius * 1.65], position: basin, rotation: [0, 0, Math.PI / 2], material: serviceMetal }),
        createBorrowedCylinder(this.resources, { name: `room-3-chemical-pipe-${index + 1}-elbow-joint`, size: [run.radius * 1.45, run.radius * 1.45, run.radius * 1.45], position: elbow, material: serviceMetal }),
      );
    });
    this.root.add(createInstancedBoxes(
      this.resources,
      'room-3-chemical-pipe-wall-brackets',
      graphite,
      [10, 15, 20, 25].flatMap((y) => runs.map((run) => ({ position: [-16.42, y, run.z], size: [0.5, 0.12, 0.5] }))),
    ));
  }

  /**
   * Presentation skin for the authoritative Room 3-to-4 duct colliders.
   *
   * The greybox owns a complete floor, roof and two side walls from z=77 to
   * z=80.8. Those meshes are collision-only in the art build, so this layer
   * follows their inner faces and hands the clean Room 3 shell over to Room
   * 4's darker service threshold without changing the playable opening.
   */
  private buildTransferDuct(): void {
    const {
      secondaryCeramic,
      serviceMetal,
      structuralSteel,
      mechanicalBacking,
      neutralFixture,
    } = this.resources.materials;

    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-3-to-4-duct-floor-clean-liner',
        size: [2.32, 0.1, 1.25],
        radius: 0.035,
        position: [9, 31.185, 77.675],
        material: secondaryCeramic,
      }),
      createChamferedBox(this.resources, {
        name: 'room-3-to-4-duct-floor-service-liner',
        size: [2.32, 0.1, 1.17],
        radius: 0.035,
        position: [9, 31.185, 78.895],
        material: serviceMetal,
      }),
      createChamferedBox(this.resources, {
        name: 'room-3-to-4-duct-ceiling-backing',
        size: [2.31, 0.08, 3.7],
        radius: 0.025,
        position: [8.951, 33.405, 78.9],
        material: mechanicalBacking,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-3-to-4-duct-clean-side-liners',
        size: [0.06, 2.12, 1.24],
        radius: 0.025,
        material: secondaryCeramic,
        transforms: [7.95, 10.05].map((x) => ({
          position: [x, 32.25, 77.67],
        })),
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-3-to-4-duct-service-side-liners',
        size: [0.06, 2.12, 2.24],
        radius: 0.025,
        material: serviceMetal,
        transforms: [7.95, 10.05].map((x) => ({
          position: [x, 32.25, 79.49],
        })),
      }),
      createInstancedBoxes(
        this.resources,
        'room-3-to-4-duct-side-transition-seams',
        structuralSteel,
        [
          { position: [7.995, 32.25, 78.33], size: [0.07, 2.12, 0.12] },
          { position: [10.005, 32.25, 78.33], size: [0.07, 2.12, 0.12] },
        ],
      ),
      createInstancedBoxes(
        this.resources,
        'room-3-to-4-duct-ceiling-service-ribs',
        structuralSteel,
        [77.45, 78.65, 79.85].map((z) => ({
          position: [8.951, 33.34, z],
          size: [2.28, 0.08, 0.14],
        })),
      ),
      createRectangularFrame(this.resources, {
        name: 'room-3-to-4-shaft-end-service-portal',
        width: 2.64,
        height: 2.58,
        barWidth: 0.18,
        depth: 0.16,
        position: [9, 32.25, 79.56],
        material: structuralSteel,
      }),
      createBorrowedBox(this.resources, {
        name: 'room-3-to-4-duct-neutral-ceiling-diffuser',
        size: [1.45, 0.035, 0.34],
        position: [8.951, 33.35, 78.7],
        material: neutralFixture,
      }),
    );
  }

  private buildTransitionsAndSignage(): void {
    const { graphite, serviceMetal, secondaryCeramic } = this.resources.materials;
    this.root.add(
      createChamferedBox(this.resources, { name: 'room-3-entry-instrumented-threshold', size: [3.45, 0.22, 0.5], radius: 0.05, position: [0, 10.13, 49.48], material: serviceMetal }),
      createInstancedChamferedBoxes(this.resources, { name: 'room-3-entry-graphite-jambs', size: [0.34, 4.2, 0.38], radius: 0.055, material: graphite, transforms: [-1.72, 1.72].map((x) => ({ position: [x, 12.1, 49.0] })) }),
      createRectangularFrame(this.resources, { name: 'room-3-exit-duct-graphite-collar', width: 3.0, height: 3.15, barWidth: 0.28, depth: 0.32, position: [9, 32.2, 76.82], material: graphite }),
      createRectangularFrame(this.resources, { name: 'room-3-exit-duct-service-liner', width: 2.62, height: 2.72, barWidth: 0.12, depth: 0.2, position: [9, 32.2, 76.78], material: serviceMetal }),
      createChamferedBox(this.resources, { name: 'room-3-exit-duct-ceramic-header', size: [4.3, 0.58, 0.5], radius: 0.08, position: [9, 34.0, 76.82], material: secondaryCeramic }),
    );

    const signs = [
      // The entry panels' interior face is z=49.20. These signs sit across a
      // deliberate 4 cm air gap instead of sharing that opaque depth plane.
      { name: 'room-3-entry-sector-sign', label: 'roomThree' as const, size: [4.5, 1.12] as const, position: [4.5, 15.8, 49.24] as const },
      { name: 'room-3-chemical-containment-sign', label: 'chemical' as const, size: [4.7, 1.14] as const, position: [-7.6, 8.0, 49.24] as const },
      { name: 'room-3-laser-array-sign', label: 'laserArray' as const, size: [4.2, 1.05] as const, position: [16.76, 24.4, 63] as const, rotation: [0, -Math.PI / 2, 0] as const },
      { name: 'room-3-adhesion-test-sign', label: 'adhesionTest' as const, size: [3.8, 0.96] as const, position: [16.76, 22.75, 63] as const, rotation: [0, -Math.PI / 2, 0] as const },
    ];
    for (const sign of signs) {
      const created = createSignagePanel(this.resources, sign);
      this.signGeometries.add(created.geometry);
      this.root.add(created.mesh);
    }
  }

  private createPipeBetween(
    name: string,
    start: readonly [number, number, number],
    end: readonly [number, number, number],
    radius: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const startVector = new THREE.Vector3(...start);
    const endVector = new THREE.Vector3(...end);
    const direction = new THREE.Vector3().subVectors(endVector, startVector);
    const length = direction.length();
    const mesh = createBorrowedCylinder(this.resources, {
      name,
      size: [radius, length, radius],
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
