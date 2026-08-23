import * as THREE from 'three';

import type { CultivationFoundationManifest } from './CultivationFoundationManifest.ts';

interface BoxAuthoring {
  readonly id: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly colour: number;
}

/** Minimal playable geometry used to exercise the Cultivation runtime contract. */
export class CultivationLevelScene {
  readonly root = new THREE.Group();
  readonly collisionMeshes: readonly THREE.Mesh[];

  constructor(manifest: CultivationFoundationManifest) {
    this.root.name = 'cultivation-level-2-foundation';
    const collisionMeshes: THREE.Mesh[] = [];
    const boxes: readonly BoxAuthoring[] = [
      { id: 'cultivation-foundation-floor', size: [16, 0.4, 42], position: [0, -0.2, 19], colour: 0x64716b },
      { id: 'cultivation-foundation-left-wall', size: [0.4, 5, 42], position: [-8, 2.5, 19], colour: 0x43514c },
      { id: 'cultivation-foundation-right-wall', size: [0.4, 5, 42], position: [8, 2.5, 19], colour: 0x43514c },
      { id: 'cultivation-foundation-entry-wall', size: [16, 5, 0.4], position: [0, 2.5, -2], colour: 0x43514c },
      { id: 'cultivation-room-3-upper-bob-platform', size: [5, 0.4, 5], position: [-2.5, 4, 34], colour: 0xd3b94f },
    ];
    for (const box of boxes) collisionMeshes.push(this.addCollisionBox(box));

    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.3, 2),
      new THREE.MeshStandardMaterial({ color: 0x8b9d96, roughness: 0.8 }),
    );
    vent.name = 'cultivation-entrance-ceiling-vent';
    vent.position.set(0, 4.5, 1);
    vent.userData.authoringRole = 'entrance-ceiling-vent';
    this.root.add(vent);

    for (const hazard of manifest.radioactiveHazards) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x78ff45,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(hazard.size.x, hazard.size.y, hazard.size.z),
        material,
      );
      mesh.name = `${hazard.id}-presentation`;
      mesh.position.copy(hazard.centre);
      mesh.userData.authoringRole = 'radioactive-hazard';
      mesh.userData.hazardId = hazard.id;
      mesh.userData.hazardType = 'radioactive';
      this.root.add(mesh);
    }

    this.collisionMeshes = collisionMeshes;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.root.clear();
  }

  private addCollisionBox(box: BoxAuthoring): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...box.size),
      new THREE.MeshStandardMaterial({ color: box.colour, roughness: 0.85 }),
    );
    mesh.name = box.id;
    mesh.position.set(...box.position);
    mesh.userData.surfaceTag = 'default';
    mesh.userData.authoringRole = 'cultivation-collision';
    mesh.userData.sizeMetres = [...box.size];
    this.root.add(mesh);
    return mesh;
  }
}
