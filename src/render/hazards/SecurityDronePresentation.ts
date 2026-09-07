import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type {
  SecurityDroneConfig,
  SecurityDroneState,
} from '../../hazards/SecurityDrone.ts';

const MODEL_FORWARD = new THREE.Vector3(0, 0, -1);
const MODEL_UP = new THREE.Vector3(0, 1, 0);
const EPSILON = 1e-10;

type SharedMaterialRole =
  | 'armour'
  | 'armourShadow'
  | 'mechanism'
  | 'barrel';

export interface SecurityDronePresentationResourceDiagnostics {
  readonly geometryCount: number;
  readonly materialCount: number;
}

/** Encounter-local immutable resources shared by compatible drone visuals. */
export class SecurityDronePresentationResources {
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly materials: Readonly<
    Record<SharedMaterialRole, THREE.MeshStandardMaterial>
  > = {
    armour: new THREE.MeshStandardMaterial({
      color: 0xe4e9e8,
      roughness: 0.27,
      metalness: 0.48,
    }),
    armourShadow: new THREE.MeshStandardMaterial({
      color: 0x778389,
      roughness: 0.38,
      metalness: 0.72,
    }),
    mechanism: new THREE.MeshStandardMaterial({
      color: 0x10171a,
      roughness: 0.34,
      metalness: 0.82,
    }),
    barrel: new THREE.MeshStandardMaterial({
      color: 0x293338,
      roughness: 0.24,
      metalness: 0.9,
    }),
  };
  private disposed = false;

  get diagnostics(): SecurityDronePresentationResourceDiagnostics {
    return {
      geometryCount: this.geometries.size,
      materialCount: Object.keys(this.materials).length,
    };
  }

  material(role: SharedMaterialRole): THREE.MeshStandardMaterial {
    if (this.disposed) throw new Error('Drone presentation resources are disposed.');
    return this.materials[role];
  }

  geometry<Geometry extends THREE.BufferGeometry>(
    key: string,
    create: () => Geometry,
  ): Geometry {
    if (this.disposed) throw new Error('Drone presentation resources are disposed.');
    const existing = this.geometries.get(key);
    if (existing) return existing as Geometry;
    const geometry = create();
    this.geometries.set(key, geometry);
    return geometry;
  }

  dispose(): void {
    if (this.disposed) return;
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.geometries.clear();
    this.disposed = true;
  }
}

/**
 * Original clean-laboratory sentry presentation for the deterministic drone.
 * Gameplay continues to use the separate invisible box collider.
 */
export class SecurityDronePresentation {
  readonly root = new THREE.Group();
  readonly aimHead = new THREE.Group();
  readonly eye: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;

  private readonly resources: SecurityDronePresentationResources;
  private readonly ownsResources: boolean;
  private readonly materials = new Set<THREE.Material>();
  private readonly localAimDirection = new THREE.Vector3();
  private readonly defaultForward = new THREE.Vector3();
  private disposed = false;

  constructor(
    config: SecurityDroneConfig,
    resources?: SecurityDronePresentationResources,
  ) {
    this.resources = resources ?? new SecurityDronePresentationResources();
    this.ownsResources = resources === undefined;
    this.root.name = `${config.id}-presentation`;
    this.root.userData.presentationOnly = true;
    this.aimHead.name = `${config.id}-tracking-head`;
    this.aimHead.userData.presentationOnly = true;
    this.root.add(this.aimHead);

    const width = config.colliderSize.x;
    const height = config.colliderSize.y;
    const depth = config.colliderSize.z;
    const smallest = Math.min(width, height, depth);
    const dimensionsKey = `${config.type}:${width}:${height}:${depth}`;
    const armour = this.resources.material('armour');
    const armourShadow = this.resources.material('armourShadow');
    const mechanism = this.resources.material('mechanism');
    const barrel = this.resources.material('barrel');

    const shellGeometry = this.resources.geometry(
      'unit-shell',
      () => new THREE.SphereGeometry(0.5, 20, 14),
    );
    this.addMesh(
      this.aimHead,
      `${config.id}-armoured-shell`,
      shellGeometry,
      armour,
      [0, 0.04 * height, 0.04 * depth],
      [width * 0.72, height * 0.82, depth * 0.68],
    );
    this.addMesh(
      this.aimHead,
      `${config.id}-dark-face`,
      shellGeometry,
      mechanism,
      [0, 0.03 * height, -depth * 0.3],
      [width * 0.43, height * 0.46, depth * 0.36],
    );

    const podGeometry = this.resources.geometry(
      `head-pods:${dimensionsKey}`,
      () => mergeCopies(
        shellGeometry,
        ([-1, 1] as const).map((side) => transform(
          [side * width * 0.39, -height * 0.01, -depth * 0.06],
          [0, 0, 0],
          [width * 0.24, height * 0.48, depth * 0.48],
        )),
      ),
    );
    this.addMesh(
      this.aimHead,
      `${config.id}-gun-pods`,
      podGeometry,
      armourShadow,
      [0, 0, 0],
      [1, 1, 1],
    );

    const barrelGeometry = this.resources.geometry(
      `barrels:${dimensionsKey}`,
      () => {
        const source = new THREE.CylinderGeometry(
          smallest * 0.055,
          smallest * 0.072,
          depth * 0.58,
          10,
        );
        const merged = mergeCopies(
          source,
          ([-1, 1] as const).map((side) => transform(
            [side * width * 0.36, 0, -depth * 0.48],
            [Math.PI * 0.5, 0, 0],
            [1, 1, 1],
          )),
        );
        source.dispose();
        return merged;
      },
    );
    this.addMesh(
      this.aimHead,
      `${config.id}-barrels`,
      barrelGeometry,
      barrel,
      [0, 0, 0],
      [1, 1, 1],
    );
    for (const side of [-1, 1] as const) {
      const anchor = new THREE.Object3D();
      anchor.name = `${config.id}-${side < 0 ? 'left' : 'right'}-barrel`;
      anchor.position.set(side * width * 0.36, 0, -depth * 0.48);
      anchor.rotation.x = Math.PI * 0.5;
      anchor.userData.presentationOnly = true;
      this.aimHead.add(anchor);
    }

    this.eye = new THREE.Mesh(
      this.resources.geometry(
        `indicator:${smallest}`,
        () => new THREE.SphereGeometry(smallest * 0.115, 16, 10),
      ) as THREE.SphereGeometry,
      this.material(new THREE.MeshBasicMaterial({
        color: 0xff4057,
        toneMapped: false,
      })),
    );
    this.eye.name = `${config.id}-front-indicator`;
    this.eye.position.set(0, 0, -depth * 0.51);
    this.eye.userData.presentationOnly = true;
    this.eye.userData.droneId = config.id;
    this.aimHead.add(this.eye);

    if (config.type === 'ground') {
      this.buildGroundBase(config.id, dimensionsKey, width, height, depth);
    } else {
      this.buildCeilingClamp(config.id, dimensionsKey, width, height, depth);
    }

    this.defaultForward.copy(config.forward).normalize();
    this.setAimDirection(this.defaultForward);
    this.setState('scanning', true);
  }

  setAimDirection(direction: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }): void {
    if (this.disposed) return;
    this.localAimDirection.set(direction.x, direction.y, direction.z);
    if (this.localAimDirection.lengthSq() <= EPSILON) {
      this.localAimDirection.copy(this.defaultForward);
    } else {
      this.localAimDirection.normalize();
    }
    this.aimHead.quaternion.setFromUnitVectors(
      MODEL_FORWARD,
      this.localAimDirection,
    );
  }

  setState(state: SecurityDroneState, enabled: boolean): void {
    if (this.disposed) return;
    let colour = 0xff4057;
    let scale = 1;
    if (!enabled || state === 'disabled') {
      colour = 0x4a2026;
      scale = 0.78;
    } else if (state === 'warning') {
      colour = 0xffb02e;
      scale = 1.18;
    } else if (state === 'firing') {
      colour = 0xff173b;
      scale = 1.35;
    } else if (state === 'targetLost' || state === 'cooldown') {
      colour = 0x9a3442;
      scale = 0.9;
    }
    this.eye.material.color.setHex(colour);
    this.eye.scale.setScalar(scale);
  }

  dispose(): void {
    if (this.disposed) return;
    this.root.removeFromParent();
    this.root.clear();
    for (const material of this.materials) material.dispose();
    this.materials.clear();
    if (this.ownsResources) this.resources.dispose();
    this.disposed = true;
  }

  private buildGroundBase(
    id: string,
    dimensionsKey: string,
    width: number,
    height: number,
    depth: number,
  ): void {
    const hubGeometry = this.resources.geometry(
      `ground-hub:${dimensionsKey}`,
      () => new THREE.CylinderGeometry(
        width * 0.16,
        width * 0.22,
        height * 0.18,
        12,
      ),
    );
    this.addMesh(
      this.root,
      `${id}-tripod-hub`,
      hubGeometry,
      this.resources.material('armourShadow'),
      [0, -height * 0.49, depth * 0.09],
      [1, 1, 1],
    );

    const bodyGeometry = this.resources.geometry(
      `ground-mechanism:${dimensionsKey}`,
      () => {
        const neck = new THREE.CylinderGeometry(
          Math.min(width, height, depth) * 0.1,
          Math.min(width, height, depth) * 0.14,
          height * 0.48,
          10,
        );
        const leg = new THREE.CylinderGeometry(1, 1.35, 1, 8);
        const parts = [
          neck.clone().applyMatrix4(transform(
            [0, -height * 0.39, 0],
            [0, 0, 0],
            [1, 1, 1],
          )),
        ];
        const start = new THREE.Vector3(0, -height * 0.48, depth * 0.1);
        for (const end of [
          new THREE.Vector3(-width * 0.37, -height * 0.68, depth * 0.3),
          new THREE.Vector3(width * 0.37, -height * 0.68, depth * 0.3),
          new THREE.Vector3(0, -height * 0.68, -depth * 0.32),
        ]) {
          parts.push(leg.clone().applyMatrix4(rodTransform(
            start,
            end,
            Math.min(width, height, depth) * 0.055,
          )));
        }
        neck.dispose();
        leg.dispose();
        return mergeOwned(parts);
      },
    );
    this.addMesh(
      this.root,
      `${id}-ground-mechanism`,
      bodyGeometry,
      this.resources.material('mechanism'),
      [0, 0, 0],
      [1, 1, 1],
    );
  }

  private buildCeilingClamp(
    id: string,
    dimensionsKey: string,
    width: number,
    height: number,
    depth: number,
  ): void {
    const clampGeometry = this.resources.geometry(
      `ceiling-clamp:${dimensionsKey}`,
      () => new THREE.CylinderGeometry(
        width * 0.22,
        width * 0.15,
        height * 0.2,
        12,
      ),
    );
    this.addMesh(
      this.root,
      `${id}-ceiling-clamp`,
      clampGeometry,
      this.resources.material('armourShadow'),
      [0, height * 0.59, depth * 0.06],
      [1, 1, 1],
    );

    const bodyGeometry = this.resources.geometry(
      `ceiling-mechanism:${dimensionsKey}`,
      () => {
        const neck = new THREE.CylinderGeometry(
          Math.min(width, height, depth) * 0.1,
          Math.min(width, height, depth) * 0.14,
          height * 0.48,
          10,
        );
        const brace = new THREE.CylinderGeometry(1, 1, 1, 8);
        const parts = [
          neck.clone().applyMatrix4(transform(
            [0, height * 0.42, 0],
            [0, 0, 0],
            [1, 1, 1],
          )),
        ];
        const top = new THREE.Vector3(0, height * 0.56, depth * 0.06);
        for (const side of [-1, 1] as const) {
          parts.push(brace.clone().applyMatrix4(rodTransform(
            top,
            new THREE.Vector3(
              side * width * 0.31,
              height * 0.27,
              depth * 0.14,
            ),
            Math.min(width, height, depth) * 0.05,
          )));
        }
        neck.dispose();
        brace.dispose();
        return mergeOwned(parts);
      },
    );
    this.addMesh(
      this.root,
      `${id}-ceiling-mechanism`,
      bodyGeometry,
      this.resources.material('mechanism'),
      [0, 0, 0],
      [1, 1, 1],
    );
  }

  private addMesh<Geometry extends THREE.BufferGeometry>(
    parent: THREE.Object3D,
    name: string,
    geometry: Geometry,
    material: THREE.MeshStandardMaterial,
    position: readonly [number, number, number],
    scale: readonly [number, number, number],
  ): THREE.Mesh<Geometry, THREE.MeshStandardMaterial> {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.userData.presentationOnly = true;
    parent.add(mesh);
    return mesh;
  }

  private material<Material extends THREE.Material>(material: Material): Material {
    this.materials.add(material);
    return material;
  }
}

function transform(
  position: readonly [number, number, number],
  rotation: readonly [number, number, number],
  scale: readonly [number, number, number],
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
}

function rodTransform(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
): THREE.Matrix4 {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  return new THREE.Matrix4().compose(
    new THREE.Vector3().lerpVectors(start, end, 0.5),
    new THREE.Quaternion().setFromUnitVectors(MODEL_UP, direction.normalize()),
    new THREE.Vector3(radius, length, radius),
  );
}

function mergeCopies(
  source: THREE.BufferGeometry,
  transforms: readonly THREE.Matrix4[],
): THREE.BufferGeometry {
  return mergeOwned(
    transforms.map((matrix) => source.clone().applyMatrix4(matrix)),
  );
}

function mergeOwned(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Unable to merge compatible drone presentation geometry.');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
