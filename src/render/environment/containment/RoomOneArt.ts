import * as THREE from 'three';
import { RoomOneShell } from './RoomOneShell.ts';

import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import {
  createBorrowedCylinder,
  createChamferedBox,
  createInstancedChamferedBoxes,
  createSignagePanel,
  markVisualOnly,
} from './ContainmentModularComponents.ts';
import { ContainmentSpecimenPod, SPECIMEN_POD_LID_RAISE_METRES } from './ContainmentSpecimenPod.ts';

export type RoomOneEggState =
  | 'intact'
  | 'crack-stage-1'
  | 'crack-stage-2'
  | 'crack-stage-3'
  | 'half-broken';
export type RoomOneContainmentBoxState = 'intact' | 'shattered' | 'open';

const EGG_STATES: readonly RoomOneEggState[] = [
  'intact',
  'crack-stage-1',
  'crack-stage-2',
  'crack-stage-3',
  'half-broken',
];

/** Static Room 1 production dressing and cutscene-ready hero states. */
export class RoomOneArt {
  readonly root = new THREE.Group();
  readonly shell = new RoomOneShell();
  readonly specimenAssembly = new THREE.Group();
  readonly pedestalDressing = new THREE.Group();
  readonly containmentBoxRoot = new THREE.Group();
  readonly intactFrameAndPanes = new THREE.Group();
  readonly shatteredFrameAndDebris = new THREE.Group();
  readonly eggRoot = new THREE.Group();
  readonly eggStates: Readonly<Record<RoomOneEggState, THREE.Group>>;

  private readonly uniqueGeometries = new Set<THREE.BufferGeometry>();
  private readonly specimenPod: ContainmentSpecimenPod;
  private readonly resources: ContainmentArtResources;
  private disposed = false;

  constructor(resources: ContainmentArtResources) {
    this.resources = resources;
    this.specimenPod = new ContainmentSpecimenPod(resources, 'room-1-pod', {
      'pedestal-shell': 'room-1-pedestal-clean-shell',
      'instrument-deck': 'room-1-containment-lower-instrumentation-base',
      'upper-gasket': 'room-1-containment-upper-gasket-seat',
      'overhead-feed-neck': 'room-1-containment-overhead-service-coupler',
    }, 7.85);
    this.root.name = 'room-1-production-art';
    this.specimenAssembly.name = 'room-1-specimen-assembly';
    this.pedestalDressing.name = 'room-1-pedestal-dressing';
    this.containmentBoxRoot.name = 'room-1-containment-box-root';
    this.intactFrameAndPanes.name = 'room-1-containment-box-intact-frame-and-panes';
    this.shatteredFrameAndDebris.name = 'room-1-containment-box-shattered-frame-and-debris';
    this.eggRoot.name = 'room-1-egg-root';
    for (const object of [
      this.root,
      this.specimenAssembly,
      this.pedestalDressing,
      this.containmentBoxRoot,
      this.intactFrameAndPanes,
      this.shatteredFrameAndDebris,
      this.eggRoot,
    ]) markVisualOnly(object);

    this.root.add(this.shell.root);
    this.buildSpecimenPod();
    this.eggStates = this.buildEggStates();
    this.buildDoor();
    this.buildStickyRoute();
    this.buildVentTransition();
    this.buildSignage();

    this.specimenAssembly.add(
      this.pedestalDressing,
      this.containmentBoxRoot,
      this.eggRoot,
    );
    this.root.add(this.specimenAssembly);
    this.reset();
  }

  get eggStateNames(): readonly RoomOneEggState[] {
    return EGG_STATES;
  }

  prepare(): Promise<void> { return this.shell.prepare(); }

  setEggState(state: RoomOneEggState): void {
    for (const name of EGG_STATES) this.eggStates[name].visible = name === state;
  }

  setContainmentBoxState(state: RoomOneContainmentBoxState): void {
    this.intactFrameAndPanes.visible = state !== 'shattered';
    this.intactFrameAndPanes.position.y = state === 'open' ? SPECIMEN_POD_LID_RAISE_METRES : 0;
    this.specimenPod.setLidLift(this.intactFrameAndPanes.position.y);
    this.shatteredFrameAndDebris.visible = state === 'shattered';
  }

  /** The egg has already fallen and hatched: do not respawn it on the pedestal. */
  setOpeningAftermath(): void {
    this.setContainmentBoxState('open');
    this.eggRoot.visible = false;
  }

  reset(): void {
    this.containmentBoxRoot.position.set(0, 1.1, -0.5);
    this.containmentBoxRoot.rotation.set(0, 0, 0);
    this.containmentBoxRoot.scale.set(1, 1, 1);
    this.eggRoot.visible = true;
    this.setContainmentBoxState('intact');
    this.setEggState('intact');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.shell.dispose();
    this.specimenPod.dispose();
    for (const geometry of this.uniqueGeometries) geometry.dispose();
    this.uniqueGeometries.clear();
    this.root.clear();
  }

  private buildSpecimenPod(): void {
    this.pedestalDressing.position.set(0, 0, -0.5);
    this.pedestalDressing.add(...this.specimenPod.pedestal.children);
    this.specimenPod.ceilingMount.position.z = -0.5;
    this.specimenAssembly.add(this.specimenPod.ceilingMount);
    // Keep the established animation origin without changing shared dimensions.
    for (const part of [...this.specimenPod.chamber.children]) {
      part.position.y -= 1.1;
      this.intactFrameAndPanes.add(part);
      if (part.name.endsWith('curved-glass')) continue;
      const damagedPart = part.clone();
      damagedPart.name = `${part.name}-damaged`;
      this.shatteredFrameAndDebris.add(damagedPart);
    }
    this.shatteredFrameAndDebris.add(this.createGlassDebris());
    this.containmentBoxRoot.add(this.intactFrameAndPanes, this.shatteredFrameAndDebris);
  }

  private createGlassDebris(): THREE.InstancedMesh {
    const count = 14;
    const shards = new THREE.InstancedMesh(
      this.resources.geometries.glassShard,
      this.resources.materials.containmentGlass,
      count,
    );
    shards.name = 'room-1-containment-box-deterministic-glass-debris';
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399963229728653;
      const radius = 0.28 + (index % 5) * 0.12;
      position.set(Math.cos(angle) * radius, 0.51 + (index % 3) * 0.018, -0.4 + Math.sin(angle) * radius);
      euler.set(angle * 0.31, angle * 0.53, angle * 0.19);
      quaternion.setFromEuler(euler);
      const length = 0.08 + (index % 5) * 0.025;
      scale.set(length * 0.55, length * 0.18, length);
      matrix.compose(position, quaternion, scale);
      shards.setMatrixAt(index, matrix);
    }
    shards.instanceMatrix.needsUpdate = true;
    shards.computeBoundingBox();
    shards.computeBoundingSphere();
    markVisualOnly(shards);
    return shards;
  }

  private buildEggStates(): Readonly<Record<RoomOneEggState, THREE.Group>> {
    this.eggRoot.position.set(0, 2.22, -0.5);
    this.eggRoot.scale.set(0.9, 1.12, 0.9);
    const states = {} as Record<RoomOneEggState, THREE.Group>;
    EGG_STATES.forEach((state, stateIndex) => {
      const group = new THREE.Group();
      group.name = `room-1-egg-state-${state}`;
      markVisualOnly(group);
      if (state === 'half-broken') {
        this.addHalfBrokenShell(group);
      } else {
        const shell = new THREE.Mesh(
          this.resources.geometries.unitSphere,
          this.resources.materials.specimenShell,
        );
        shell.name = `${group.name}-shell`;
        markVisualOnly(shell);
        group.add(shell);
        for (let crackIndex = 0; crackIndex < stateIndex; crackIndex += 1) {
          group.add(this.createCrack(crackIndex));
        }
      }
      states[state] = group;
      this.eggRoot.add(group);
    });
    return states;
  }

  private createCrack(index: number): THREE.Mesh {
    const paths: readonly (readonly THREE.Vector3[])[] = [
      [new THREE.Vector3(-0.04, 0.45, -0.225), new THREE.Vector3(0.02, 0.29, -0.414), new THREE.Vector3(-0.1, 0.12, -0.475), new THREE.Vector3(0.03, -0.04, -0.492)],
      [new THREE.Vector3(0.03, -0.04, -0.492), new THREE.Vector3(0.2, -0.14, -0.448), new THREE.Vector3(0.14, -0.3, -0.37), new THREE.Vector3(0.27, -0.4, -0.225)],
      [new THREE.Vector3(-0.1, 0.12, -0.475), new THREE.Vector3(-0.25, 0.05, -0.426), new THREE.Vector3(-0.34, -0.08, -0.348), new THREE.Vector3(-0.3, -0.25, -0.28)],
    ];
    const curve = new THREE.CatmullRomCurve3([...paths[index]]);
    const geometry = new THREE.TubeGeometry(curve, 16, 0.011, 5, false);
    geometry.name = `room-1-egg-crack-${index + 1}-geometry`;
    this.uniqueGeometries.add(geometry);
    const crack = new THREE.Mesh(geometry, this.resources.materials.crack);
    crack.name = `room-1-egg-crack-${index + 1}`;
    markVisualOnly(crack);
    return crack;
  }

  private addHalfBrokenShell(group: THREE.Group): void {
    const lowerShellGeometry = new THREE.SphereGeometry(0.5, 28, 12, 0, Math.PI * 2, Math.PI * 0.47, Math.PI * 0.53);
    lowerShellGeometry.name = 'room-1-egg-half-broken-shell-geometry';
    const rimGeometry = new THREE.TorusGeometry(0.43, 0.025, 6, 28);
    rimGeometry.name = 'room-1-egg-half-broken-rim-geometry';
    this.uniqueGeometries.add(lowerShellGeometry);
    this.uniqueGeometries.add(rimGeometry);
    const shell = new THREE.Mesh(lowerShellGeometry, this.resources.materials.specimenShell);
    shell.name = 'room-1-egg-half-broken-lower-shell';
    const interior = new THREE.Mesh(lowerShellGeometry, this.resources.materials.specimenShellInterior);
    interior.name = 'room-1-egg-half-broken-interior';
    interior.scale.setScalar(0.97);
    const rim = new THREE.Mesh(rimGeometry, this.resources.materials.crack);
    rim.name = 'room-1-egg-half-broken-jagged-rim';
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1, 0.86, 1);
    for (const object of [shell, interior, rim]) markVisualOnly(object);
    group.add(shell, interior, rim);
  }

  private buildDoor(): void {
    const { mainCeramic, secondaryCeramic, graphite, serviceMetal, mechanicalBacking, gasket, lockedStatus } =
      this.resources.materials;
    const door = new THREE.Group();
    door.name = 'room-1-locked-laboratory-door-assembly';
    door.position.set(4.3, 1.78, 5.65);
    markVisualOnly(door);
    door.userData.staticBatchExcluded = true;
    door.add(
      createChamferedBox(this.resources, {
        name: 'room-1-door-recessed-cavity',
        size: [3.38, 3.72, 0.16],
        radius: 0.04,
        position: [0, 0, 0],
        material: mechanicalBacking,
      }),
      createChamferedBox(this.resources, {
        name: 'room-1-door-bevelled-sliding-slab',
        size: [2.58, 2.92, 0.16],
        radius: 0.065,
        position: [-0.12, -0.13, -0.17],
        material: mainCeramic,
      }),
      createChamferedBox(this.resources, {
        name: 'room-1-door-secondary-guide-panel',
        size: [0.34, 2.32, 0.045],
        radius: 0.035,
        position: [-1.02, -0.11, -0.285],
        material: secondaryCeramic,
      }),
      createChamferedBox(this.resources, {
        name: 'room-1-door-offset-gasket-groove',
        size: [0.055, 2.42, 0.04],
        radius: 0.015,
        position: [0.58, -0.1, -0.285],
        material: gasket,
      }),
      createChamferedBox(this.resources, {
        name: 'room-1-door-gasket-line',
        size: [2.73, 3.08, 0.055],
        radius: 0.075,
        position: [-0.12, -0.13, -0.07],
        material: gasket,
      }),
      createChamferedBox(this.resources, {
        name: 'room-1-door-top-actuator-housing',
        size: [2.82, 0.38, 0.4],
        radius: 0.055,
        position: [-0.05, 1.63, -0.17],
        material: serviceMetal,
      }),
      createBorrowedCylinder(this.resources, {
        name: 'room-1-door-track-actuator',
        size: [0.12, 1.05, 0.12],
        position: [0.02, 1.63, -0.4],
        rotation: [0, 0, Math.PI / 2],
        material: graphite,
      }),
      createChamferedBox(this.resources, {
        name: 'room-1-door-side-status-housing',
        size: [0.42, 0.78, 0.2],
        radius: 0.05,
        position: [1.56, 0.28, -0.16],
        material: graphite,
      }),
      createChamferedBox(this.resources, {
        name: 'room-1-door-locked-state-indicator',
        size: [0.14, 0.3, 0.04],
        radius: 0.025,
        position: [1.56, 0.38, -0.285],
        material: lockedStatus,
      }),
      createChamferedBox(this.resources, {
        name: 'room-1-door-floor-track',
        size: [2.78, 0.12, 0.34],
        radius: 0.025,
        position: [-0.08, -1.65, -0.14],
        material: serviceMetal,
      }),
    );
    const sign = this.createSign('room-1-locked-door-sign', 'locked', [1.42, 0.44], [-0.05, 0.92, -0.35]);
    door.add(sign);
    this.root.add(door);
  }

  private buildStickyRoute(): void {
    const { mechanicalBacking, graphite, serviceMetal, stickyMembrane } =
      this.resources.materials;
    // Keep the visible membrane behind the sticky collider's room-facing
    // surface at z = 5.8 so Bob's collider and silhouette meet the same wall.
    const artDepthShift = 0.36;
    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-1-sticky-wall-recessed-backing',
        size: [2.24, 5.38, 0.14],
        radius: 0.055,
        position: [-4.8, 2.61, 5.7 + artDepthShift],
        material: mechanicalBacking,
      }),
    );
    this.addChamferedFrame(
      this.root,
      'room-1-sticky-wall-containment-frame',
      [-4.8, 2.61, 5.58 + artDepthShift],
      2.18,
      5.32,
      0.16,
      0.16,
      graphite,
    );
    const membraneGeometry = this.createOrganicMembraneGeometry(1.78, 4.92, 0.055, 13);
    const membrane = new THREE.Mesh(membraneGeometry, stickyMembrane);
    membrane.name = 'room-1-sticky-wall-inset-organic-membrane';
    membrane.position.set(-4.8, 2.58, 5.49 + artDepthShift);
    markVisualOnly(membrane);
    this.root.add(membrane);

    this.root.add(
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-1-sticky-wall-mechanical-clamps',
        size: [0.28, 0.14, 0.18],
        radius: 0.028,
        material: serviceMetal,
        transforms: [
          [-5.83, 1.05, 5.45 + artDepthShift],
          [-5.83, 3.8, 5.45 + artDepthShift],
          [-3.77, 1.4, 5.45 + artDepthShift],
          [-3.77, 4.15, 5.45 + artDepthShift],
        ].map((position) => ({ position: position as [number, number, number] })),
      }),
    );
  }

  private buildVentTransition(): void {
    const { mechanicalBacking, graphite, serviceMetal } = this.resources.materials;
    this.addChamferedFrame(
      this.root,
      'room-1-vent-deep-graphite-collar',
      [-4.8, 6.02, 5.56],
      2.36,
      1.78,
      0.2,
      0.3,
      graphite,
    );
    this.addChamferedFrame(
      this.root,
      'room-1-vent-inner-service-flange',
      [-4.8, 6.02, 5.42],
      2.1,
      1.5,
      0.075,
      0.22,
      serviceMetal,
    );
    this.root.add(
      createChamferedBox(this.resources, {
        name: 'room-1-vent-shadow-cavity-top',
        size: [1.88, 0.16, 0.75],
        radius: 0.025,
        position: [-4.8, 6.69, 5.92],
        material: mechanicalBacking,
      }),
      createInstancedChamferedBoxes(this.resources, {
        name: 'room-1-vent-purposeful-duct-ribs',
        size: [0.07, 1.25, 0.55],
        radius: 0.015,
        material: serviceMetal,
        transforms: [
          { position: [-5.7, 6.03, 6.15] },
          { position: [-3.9, 6.03, 6.15] },
        ],
      }),
    );
  }

  private buildSignage(): void {
    this.root.add(
      this.createSign('room-1-containment-bay-identifier', 'bay', [2.65, 0.76], [-1.65, 6.58, 5.61]),
      this.createSign('room-1-vent-route-identifier', 'vent', [1.68, 0.46], [-4.8, 7.25, 5.58]),
    );
  }

  private createSign(
    name: string,
    label: 'bay' | 'specimen' | 'locked' | 'vent',
    size: readonly [number, number],
    position: readonly [number, number, number],
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `${name}-assembly`;
    markVisualOnly(group);
    group.add(
      createChamferedBox(this.resources, {
        name: `${name}-backing`,
        size: [size[0] + 0.1, size[1] + 0.1, 0.07],
        radius: 0.025,
        position,
        material: this.resources.materials.gasket,
      }),
    );
    const sign = createSignagePanel(this.resources, {
      name,
      label,
      size,
      position: [position[0], position[1], position[2] - 0.04],
      rotation: [0, Math.PI, 0],
    });
    this.uniqueGeometries.add(sign.geometry);
    group.add(sign.mesh);
    return group;
  }

  private addChamferedFrame(
    parent: THREE.Object3D,
    name: string,
    position: readonly [number, number, number],
    width: number,
    height: number,
    barWidth: number,
    depth: number,
    material: THREE.Material,
  ): void {
    const root = new THREE.Group();
    root.name = name;
    root.position.set(...position);
    markVisualOnly(root);
    root.add(
      createChamferedBox(this.resources, {
        name: `${name}-top`, size: [width, barWidth, depth], radius: 0.03,
        position: [0, height * 0.5, 0], material,
      }),
      createChamferedBox(this.resources, {
        name: `${name}-bottom`, size: [width, barWidth, depth], radius: 0.03,
        position: [0, -height * 0.5, 0], material,
      }),
      createChamferedBox(this.resources, {
        name: `${name}-left`, size: [barWidth, height, depth], radius: 0.03,
        position: [-width * 0.5, 0, 0], material,
      }),
      createChamferedBox(this.resources, {
        name: `${name}-right`, size: [barWidth, height, depth], radius: 0.03,
        position: [width * 0.5, 0, 0], material,
      }),
    );
    parent.add(root);
  }

  private createOrganicMembraneGeometry(
    width: number,
    height: number,
    depth: number,
    seed: number,
  ): THREE.ExtrudeGeometry {
    const shape = new THREE.Shape();
    const points: THREE.Vector2[] = [];
    const segments = 8;
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      points.push(new THREE.Vector2(-width * 0.5 + t * width, -height * 0.5 + edgeOffset(index, seed) * 0.035));
    }
    for (let index = 1; index <= segments; index += 1) {
      const t = index / segments;
      points.push(new THREE.Vector2(width * 0.5 + edgeOffset(index, seed + 7) * 0.035, -height * 0.5 + t * height));
    }
    for (let index = 1; index <= segments; index += 1) {
      const t = index / segments;
      points.push(new THREE.Vector2(width * 0.5 - t * width, height * 0.5 + edgeOffset(index, seed + 13) * 0.035));
    }
    for (let index = 1; index < segments; index += 1) {
      const t = index / segments;
      points.push(new THREE.Vector2(-width * 0.5 + edgeOffset(index, seed + 19) * 0.035, height * 0.5 - t * height));
    }
    shape.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) shape.lineTo(point.x, point.y);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.018,
      bevelThickness: 0.014,
    });
    geometry.translate(0, 0, -depth * 0.5);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const uvs = geometry.getAttribute('uv');
    for (let index = 0; index < positions.count; index += 1) {
      if (Math.abs(normals.getZ(index)) < 0.9) continue;
      uvs.setXY(
        index,
        positions.getX(index) / width + 0.5,
        positions.getY(index) / height + 0.5,
      );
    }
    uvs.needsUpdate = true;
    geometry.name = `room-1-organic-membrane-${seed}-geometry`;
    this.uniqueGeometries.add(geometry);
    return geometry;
  }
}

function edgeOffset(index: number, seed: number): number {
  return Math.sin(index * 2.173 + seed * 0.719) * 0.7 + Math.sin(index * 4.31 + seed) * 0.3;
}
