import * as THREE from 'three';

import { BLACKOUT_FOUNDATION_LENGTH_METRES } from './BlackoutFoundationManifest.ts';

/** Minimal dark, traversable Level 3 foundation used until Room 1 authoring lands. */
export class BlackoutLevelScene {
  readonly root = new THREE.Group();
  readonly collisionMeshes: readonly THREE.Mesh[];

  constructor() {
    this.root.name = 'blackout-level-3-foundation';

    const collisionMeshes: THREE.Mesh[] = [];
    collisionMeshes.push(
      this.addCollisionBox(
        'blackout-foundation-floor',
        new THREE.Vector3(18, 0.4, BLACKOUT_FOUNDATION_LENGTH_METRES),
        new THREE.Vector3(0, -0.2, BLACKOUT_FOUNDATION_LENGTH_METRES / 2 - 2),
        0x171b20,
      ),
      this.addCollisionBox(
        'blackout-foundation-left-wall',
        new THREE.Vector3(0.4, 5, BLACKOUT_FOUNDATION_LENGTH_METRES),
        new THREE.Vector3(-9, 2.5, BLACKOUT_FOUNDATION_LENGTH_METRES / 2 - 2),
        0x11151a,
      ),
      this.addCollisionBox(
        'blackout-foundation-right-wall',
        new THREE.Vector3(0.4, 5, BLACKOUT_FOUNDATION_LENGTH_METRES),
        new THREE.Vector3(9, 2.5, BLACKOUT_FOUNDATION_LENGTH_METRES / 2 - 2),
        0x11151a,
      ),
    );

    const ambient = new THREE.HemisphereLight(0x26303c, 0x050608, 0.16);
    ambient.name = 'blackout-ambient-floor';
    this.root.add(ambient);

    for (let z = 4; z <= 76; z += 12) {
      const emergency = new THREE.PointLight(0xff3b2f, 0.45, 7, 2);
      emergency.name = `blackout-emergency-light-${z}`;
      emergency.position.set(z % 24 === 4 ? -6.5 : 6.5, 3.4, z);
      emergency.castShadow = false;
      this.root.add(emergency);

      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.12, 0.7),
        new THREE.MeshBasicMaterial({ color: 0xff3b2f }),
      );
      marker.name = `blackout-emergency-marker-${z}`;
      marker.position.copy(emergency.position);
      this.root.add(marker);
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

  private addCollisionBox(
    name: string,
    size: THREE.Vector3,
    position: THREE.Vector3,
    colour: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.9,
        metalness: 0.2,
      }),
    );
    mesh.name = name;
    mesh.position.copy(position);
    mesh.userData.surfaceTag = 'default';
    mesh.userData.authoringRole = 'blackout-foundation-collision';
    this.root.add(mesh);
    return mesh;
  }
}
