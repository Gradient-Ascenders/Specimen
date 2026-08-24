import * as THREE from 'three';

import type {
  SecurityDroneConfig,
  SecurityDroneState,
} from '../../hazards/SecurityDrone.ts';

const MODEL_FORWARD = new THREE.Vector3(0, 0, -1);
const MODEL_UP = new THREE.Vector3(0, 1, 0);
const EPSILON = 1e-10;

/**
 * Original clean-laboratory sentry presentation for the deterministic drone.
 * Gameplay continues to use the separate invisible box collider.
 */
export class SecurityDronePresentation {
  readonly root = new THREE.Group();
  readonly aimHead = new THREE.Group();
  readonly eye: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;

  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly localAimDirection = new THREE.Vector3();
  private readonly defaultForward = new THREE.Vector3();
  private disposed = false;

  constructor(config: SecurityDroneConfig) {
    this.root.name = `${config.id}-presentation`;
    this.root.userData.presentationOnly = true;
    this.aimHead.name = `${config.id}-tracking-head`;
    this.aimHead.userData.presentationOnly = true;
    this.root.add(this.aimHead);

    const width = config.colliderSize.x;
    const height = config.colliderSize.y;
    const depth = config.colliderSize.z;
    const smallest = Math.min(width, height, depth);
    const armour = this.material(new THREE.MeshStandardMaterial({
      color: 0xe4e9e8,
      roughness: 0.27,
      metalness: 0.48,
    }));
    const armourShadow = this.material(new THREE.MeshStandardMaterial({
      color: 0x778389,
      roughness: 0.38,
      metalness: 0.72,
    }));
    const mechanism = this.material(new THREE.MeshStandardMaterial({
      color: 0x10171a,
      roughness: 0.34,
      metalness: 0.82,
    }));
    const barrel = this.material(new THREE.MeshStandardMaterial({
      color: 0x293338,
      roughness: 0.24,
      metalness: 0.9,
    }));

    const shellGeometry = this.geometry(new THREE.SphereGeometry(0.5, 20, 14));
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

    for (const side of [-1, 1] as const) {
      this.addMesh(
        this.aimHead,
        `${config.id}-${side < 0 ? 'left' : 'right'}-gun-pod`,
        shellGeometry,
        armourShadow,
        [side * width * 0.39, -height * 0.01, -depth * 0.06],
        [width * 0.24, height * 0.48, depth * 0.48],
      );
    }

    const barrelGeometry = this.geometry(new THREE.CylinderGeometry(
      smallest * 0.055,
      smallest * 0.072,
      depth * 0.58,
      10,
    ));
    for (const side of [-1, 1] as const) {
      const gun = new THREE.Mesh(barrelGeometry, barrel);
      gun.name = `${config.id}-${side < 0 ? 'left' : 'right'}-barrel`;
      gun.position.set(side * width * 0.36, 0, -depth * 0.48);
      gun.rotation.x = Math.PI * 0.5;
      gun.userData.presentationOnly = true;
      this.aimHead.add(gun);
    }

    this.eye = new THREE.Mesh(
      this.geometry(new THREE.SphereGeometry(smallest * 0.115, 16, 10)),
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

    const neckGeometry = this.geometry(new THREE.CylinderGeometry(
      smallest * 0.1,
      smallest * 0.14,
      height * 0.48,
      10,
    ));
    const neck = new THREE.Mesh(neckGeometry, mechanism);
    neck.name = `${config.id}-head-bearing`;
    neck.position.y = config.type === 'ground' ? -height * 0.39 : height * 0.42;
    neck.userData.presentationOnly = true;
    this.root.add(neck);

    if (config.type === 'ground') {
      this.buildGroundBase(config.id, width, height, depth, armourShadow, mechanism);
    } else {
      this.buildCeilingClamp(config.id, width, height, depth, armourShadow, mechanism);
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
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.disposed = true;
  }

  private buildGroundBase(
    id: string,
    width: number,
    height: number,
    depth: number,
    armour: THREE.MeshStandardMaterial,
    mechanism: THREE.MeshStandardMaterial,
  ): void {
    const hubGeometry = this.geometry(new THREE.CylinderGeometry(
      width * 0.16,
      width * 0.22,
      height * 0.18,
      12,
    ));
    this.addMesh(
      this.root,
      `${id}-tripod-hub`,
      hubGeometry,
      armour,
      [0, -height * 0.49, depth * 0.09],
      [1, 1, 1],
    );

    const legGeometry = this.geometry(new THREE.CylinderGeometry(1, 1.35, 1, 8));
    const start = new THREE.Vector3(0, -height * 0.48, depth * 0.1);
    const endpoints = [
      new THREE.Vector3(-width * 0.37, -height * 0.68, depth * 0.3),
      new THREE.Vector3(width * 0.37, -height * 0.68, depth * 0.3),
      new THREE.Vector3(0, -height * 0.68, -depth * 0.32),
    ];
    endpoints.forEach((end, index) => {
      this.addRod(
        `${id}-tripod-leg-${index + 1}`,
        start,
        end,
        legGeometry,
        mechanism,
        Math.min(width, height, depth) * 0.055,
      );
    });
  }

  private buildCeilingClamp(
    id: string,
    width: number,
    height: number,
    depth: number,
    armour: THREE.MeshStandardMaterial,
    mechanism: THREE.MeshStandardMaterial,
  ): void {
    const clampGeometry = this.geometry(new THREE.CylinderGeometry(
      width * 0.22,
      width * 0.15,
      height * 0.2,
      12,
    ));
    this.addMesh(
      this.root,
      `${id}-ceiling-clamp`,
      clampGeometry,
      armour,
      [0, height * 0.59, depth * 0.06],
      [1, 1, 1],
    );
    const braceGeometry = this.geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
    const top = new THREE.Vector3(0, height * 0.56, depth * 0.06);
    for (const side of [-1, 1] as const) {
      this.addRod(
        `${id}-${side < 0 ? 'left' : 'right'}-ceiling-brace`,
        top,
        new THREE.Vector3(side * width * 0.31, height * 0.27, depth * 0.14),
        braceGeometry,
        mechanism,
        Math.min(width, height, depth) * 0.05,
      );
    }
  }

  private addRod(
    name: string,
    start: THREE.Vector3,
    end: THREE.Vector3,
    geometry: THREE.CylinderGeometry,
    material: THREE.MeshStandardMaterial,
    radius: number,
  ): void {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.lerpVectors(start, end, 0.5);
    mesh.quaternion.setFromUnitVectors(MODEL_UP, direction.normalize());
    mesh.scale.set(radius, length, radius);
    mesh.userData.presentationOnly = true;
    this.root.add(mesh);
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

  private geometry<Geometry extends THREE.BufferGeometry>(
    geometry: Geometry,
  ): Geometry {
    this.geometries.add(geometry);
    return geometry;
  }

  private material<Material extends THREE.Material>(material: Material): Material {
    this.materials.add(material);
    return material;
  }
}
