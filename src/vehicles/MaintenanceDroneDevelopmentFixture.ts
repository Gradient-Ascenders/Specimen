import * as THREE from 'three';

import type { MaintenanceDroneAuthoring } from './MaintenanceDroneController.ts';

/**
 * Backend-only Room 1 fixture used until #145 supplies the authored model,
 * collider and presentation anchors. The runtime contract is intentionally the
 * same so final room authoring can replace this without changing gameplay.
 */
export class MaintenanceDroneDevelopmentFixture {
  readonly root = new THREE.Group();
  readonly droneRoot = new THREE.Group();
  readonly collider: THREE.Mesh;
  readonly mountAnchor = new THREE.Object3D();
  readonly riderAnchor = new THREE.Object3D();
  readonly dismountAnchor = new THREE.Object3D();
  readonly recoveryAnchor = new THREE.Object3D();
  readonly authoring: MaintenanceDroneAuthoring;

  constructor() {
    this.root.name = 'maintenance-drone-development-fixture';
    this.droneRoot.name = 'maintenance-drone-root';
    this.droneRoot.position.set(3.5, 0.95, 2);
    this.root.add(this.droneRoot);

    this.collider = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.5, 1.65),
      new THREE.MeshStandardMaterial({
        color: 0x8c7a37,
        emissive: 0x503d08,
        emissiveIntensity: 0.55,
        roughness: 0.65,
        metalness: 0.5,
      }),
    );
    this.collider.name = 'maintenance-drone-authored-collider';
    this.collider.userData.authoringRole =
      'maintenance-drone-collider';
    this.droneRoot.add(this.collider);

    this.mountAnchor.name = 'maintenance-drone-mount-anchor';
    this.mountAnchor.position.set(-0.5, 0, 0);
    this.droneRoot.add(this.mountAnchor);

    this.riderAnchor.name = 'maintenance-drone-rider-anchor';
    this.riderAnchor.position.set(0, 0.78, 0);
    this.droneRoot.add(this.riderAnchor);

    this.dismountAnchor.name = 'maintenance-drone-dismount-anchor';
    this.dismountAnchor.position.set(0, 0.84, 0);
    this.droneRoot.add(this.dismountAnchor);

    this.recoveryAnchor.name = 'maintenance-drone-recovery-anchor';
    this.recoveryAnchor.position.copy(this.droneRoot.position);
    this.root.add(this.recoveryAnchor);

    this.authoring = {
      root: this.droneRoot,
      collider: this.collider,
      mountAnchor: this.mountAnchor,
      riderAnchor: this.riderAnchor,
      dismountAnchor: this.dismountAnchor,
      recoveryAnchor: this.recoveryAnchor,
    };
  }

  dispose(): void {
    this.root.removeFromParent();
    this.collider.geometry.dispose();
    const materials = Array.isArray(this.collider.material)
      ? this.collider.material
      : [this.collider.material];
    for (const material of materials) material.dispose();
    this.root.clear();
  }
}
