import * as THREE from 'three';

import type { SlimeId } from './SlimeRoster.ts';

export interface SlimePairPresentationPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Development-readable Goop proxy and active-control indication for #28. */
export class SlimePairPresentation {
  readonly root = new THREE.Group();

  private readonly goopMesh: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshStandardMaterial
  >;
  private readonly activeRing: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;

  constructor(radiusMetres: number) {
    this.root.name = 'persistent-two-body-presentation';

    this.goopMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radiusMetres, 24, 18),
      new THREE.MeshStandardMaterial({
        color: 0x91cf4b,
        emissive: 0x18380a,
        emissiveIntensity: 0.28,
        roughness: 0.42,
      }),
    );
    this.goopMesh.name = 'goop-development-body';
    this.root.add(this.goopMesh);

    this.activeRing = new THREE.Mesh(
      new THREE.TorusGeometry(radiusMetres * 1.35, 0.045, 10, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffe889,
        toneMapped: false,
      }),
    );
    this.activeRing.name = 'active-slime-control-indicator';
    this.activeRing.rotation.x = Math.PI / 2;
    this.root.add(this.activeRing);
  }

  update(
    bobPosition: SlimePairPresentationPosition,
    goopPosition: SlimePairPresentationPosition,
    activeSlimeId: SlimeId,
  ): void {
    this.goopMesh.position.set(
      goopPosition.x,
      goopPosition.y,
      goopPosition.z,
    );

    const activePosition =
      activeSlimeId === 'goop' ? goopPosition : bobPosition;
    this.activeRing.position.set(
      activePosition.x,
      activePosition.y - 0.43,
      activePosition.z,
    );
  }

  dispose(): void {
    this.goopMesh.geometry.dispose();
    this.goopMesh.material.dispose();
    this.activeRing.geometry.dispose();
    this.activeRing.material.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
