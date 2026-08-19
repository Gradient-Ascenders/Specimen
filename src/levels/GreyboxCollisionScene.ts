import * as THREE from 'three';

import {
  SlimeVisual,
  type SlimeVisualDiagnostics,
  type SlimeVisualImpact,
  type SlimeVisualLaunch,
  type SlimeVisualState,
  type Vector3State,
} from '../render/slime/SlimeVisual';
import type { SurfaceTag } from '../physics/SurfaceRegistry';

type CollisionCase =
  | 'floor'
  | 'wall'
  | 'ledge'
  | 'slope'
  | 'gap'
  | 'platform';

interface TestBox {
  name: string;
  testCase: CollisionCase;
  size: readonly [number, number, number];
  position: readonly [number, number, number];
  material: THREE.Material;
  surfaceTag: SurfaceTag;
  rotationZ?: number;
}

const SPAWN_POSITION = new THREE.Vector3(-4, 0.46, 5);
const RECOVERY_POSITION = new THREE.Vector3(6.5, -2.2, 2);

export class GreyboxCollisionScene {
  readonly root = new THREE.Group();

  private readonly collisionMeshList: THREE.Mesh[] = [];
  private readonly slimeVisual: SlimeVisual;
  private recoveryDelay = 0;
  private recoveryCallback: (() => void) | undefined;

  constructor() {
    this.root.name = 'greybox-collision-test-scene';

    const materials = {
      floor: this.createMaterial(0x81909b),
      wall: this.createMaterial(0x568bd8),
      ledge: this.createMaterial(0xe3994b),
      slope: this.createMaterial(0xd6c650),
      gap: this.createMaterial(0xd95f8d),
      platform: this.createMaterial(0x62bf83),
      sticky: this.createMaterial(0x49c9b7),
      nonStick: this.createMaterial(0xe06f5f),
      bouncy: this.createMaterial(0xb987e8),
    } satisfies Record<
      CollisionCase | 'sticky' | 'nonStick' | 'bouncy',
      THREE.MeshStandardMaterial
    >;

    const boxes: TestBox[] = [
      {
        name: 'case-floor-8m-by-10m',
        testCase: 'floor',
        size: [8, 0.4, 10],
        position: [-4, -0.2, 2],
        material: materials.floor,
        surfaceTag: 'default',
      },
      {
        name: 'case-wall-default-3m-high',
        testCase: 'wall',
        size: [0.4, 3, 4],
        position: [-7.2, 1.5, 0],
        material: materials.wall,
        surfaceTag: 'default',
      },
      {
        name: 'case-wall-sticky-3m-high',
        testCase: 'wall',
        size: [0.4, 3, 3],
        position: [-4.8, 1.5, -3.2],
        material: materials.sticky,
        surfaceTag: 'sticky',
      },
      {
        name: 'case-wall-non-stick-3m-high',
        testCase: 'wall',
        size: [0.4, 3, 3],
        position: [-1.5, 1.5, -3.2],
        material: materials.nonStick,
        surfaceTag: 'nonStick',
      },
      {
        name: 'case-ledge-1m-high',
        testCase: 'ledge',
        size: [2, 1, 2],
        position: [-3.8, 0.5, 2.5],
        material: materials.ledge,
        surfaceTag: 'default',
      },
      {
        name: 'case-slope-15-degrees',
        testCase: 'slope',
        size: [4, 0.35, 4],
        position: [0.2, 0.35, 0.5],
        rotationZ: -THREE.MathUtils.degToRad(15),
        material: materials.slope,
        surfaceTag: 'default',
      },
      {
        name: 'case-gap-near-edge',
        testCase: 'gap',
        size: [3, 0.4, 7],
        position: [4, -0.2, 2],
        material: materials.gap,
        surfaceTag: 'default',
      },
      {
        name: 'case-gap-far-edge',
        testCase: 'gap',
        size: [3, 0.4, 7],
        position: [9, -0.2, 2],
        material: materials.gap,
        surfaceTag: 'default',
      },
      {
        name: 'case-platform-1.5m-high',
        testCase: 'platform',
        size: [2.5, 0.35, 2.5],
        position: [9, 1.5, 0],
        material: materials.platform,
        surfaceTag: 'default',
      },
      {
        name: 'case-bounce-pad-0.2m-high',
        testCase: 'platform',
        size: [1.5, 0.2, 1.5],
        position: [-1.1, 0.1, 5],
        material: materials.bouncy,
        surfaceTag: 'bouncy',
      },
    ];

    for (const box of boxes) this.addTestBox(box);

    const grid = new THREE.GridHelper(24, 24, 0x587067, 0x263b34);
    grid.name = 'scale-grid-1m-spacing';
    grid.position.y = 0.012;
    this.root.add(grid);

    this.addScaleReference();
    this.addSpawnMarker();
    this.addRecoveryMarker();

    this.slimeVisual = new SlimeVisual({ radiusMetres: 0.45 });
    this.root.add(this.slimeVisual.mesh);
    this.resetProbe();
  }

  get collisionMeshes(): readonly THREE.Mesh[] {
    return this.collisionMeshList;
  }

  get slimeDiagnostics(): SlimeVisualDiagnostics {
    return this.slimeVisual.diagnostics;
  }

  copySpawnPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(SPAWN_POSITION);
  }

  copyRecoveryPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(RECOVERY_POSITION);
  }

  setProbePosition(position: Vector3State): void {
    this.slimeVisual.setPosition(position);
  }

  update(deltaSeconds: number, visualState: SlimeVisualState): void {
    this.slimeVisual.update(deltaSeconds, visualState);

    if (this.recoveryDelay <= 0) return;

    this.recoveryDelay -= deltaSeconds;
    if (this.recoveryDelay > 0) return;

    this.resetProbe();
    this.recoveryCallback?.();
    this.recoveryCallback = undefined;
  }

  resetProbe(): void {
    this.recoveryDelay = 0;
    this.slimeVisual.setPosition(SPAWN_POSITION);
    this.slimeVisual.reset();
  }

  simulateFall(onRecovered: () => void): void {
    this.slimeVisual.setPosition(RECOVERY_POSITION);
    this.recoveryCallback = onRecovered;
    this.recoveryDelay = 0.7;
  }

  onSlimeImpact(impact: SlimeVisualImpact): void {
    this.slimeVisual.onImpact(impact);
  }

  onSlimeLanding(
    normalWorld: Vector3State,
    impactSpeedMetresPerSecond: number,
  ): void {
    this.slimeVisual.onLanding(
      normalWorld,
      impactSpeedMetresPerSecond,
    );
  }

  onSlimeLaunch(launch: SlimeVisualLaunch): void {
    this.slimeVisual.onLaunch(launch);
  }

  dispose(): void {
    this.slimeVisual.dispose();
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) {
        return;
      }

      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    this.collisionMeshList.length = 0;
    this.root.clear();
  }

  private createMaterial(colour: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: colour,
      roughness: 0.82,
      metalness: 0.02,
    });
  }

  private addTestBox(testBox: TestBox): void {
    const geometry = new THREE.BoxGeometry(...testBox.size);
    const mesh = new THREE.Mesh(geometry, testBox.material);
    mesh.name = testBox.name;
    mesh.position.set(...testBox.position);
    mesh.rotation.z = testBox.rotationZ ?? 0;
    mesh.userData.collisionCase = testBox.testCase;
    mesh.userData.sizeMetres = [...testBox.size];
    mesh.userData.surfaceTag = testBox.surfaceTag;
    this.root.add(mesh);
    this.collisionMeshList.push(mesh);

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xe8fff2 }),
    );
    outline.name = `${testBox.name}-outline`;
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    this.root.add(outline);
  }

  private addScaleReference(): void {
    const scaleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1, 0.08),
      scaleMaterial,
    );
    bar.name = 'scale-reference-1m';
    bar.position.set(-8.3, 0.5, 6.2);
    bar.userData.heightMetres = 1;
    this.root.add(bar);

    for (const y of [0, 1]) {
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.05, 0.08),
        scaleMaterial,
      );
      tick.name = `scale-reference-${y}m-tick`;
      tick.position.set(-8.3, y, 6.2);
      this.root.add(tick);
    }
  }

  private addSpawnMarker(): void {
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.055, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0x54e8e0 }),
    );
    marker.name = 'spawn-marker-known-safe-position';
    marker.position.set(SPAWN_POSITION.x, 0.04, SPAWN_POSITION.z);
    marker.rotation.x = Math.PI / 2;
    marker.userData.spawnPosition = SPAWN_POSITION.toArray();
    this.root.add(marker);
  }

  private addRecoveryMarker(): void {
    const marker = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 0.4, 5)),
      new THREE.LineBasicMaterial({ color: 0xff5678 }),
    );
    marker.name = 'recovery-volume-below-gap';
    marker.position.copy(RECOVERY_POSITION);
    marker.userData.resetsTo = SPAWN_POSITION.toArray();
    this.root.add(marker);
  }
}
