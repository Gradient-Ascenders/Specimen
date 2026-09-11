import * as THREE from 'three';

import type { ElectricalConnectionTarget } from '../abilities/ElectricalTargetRegistry.ts';
import { BLACKOUT_FOUNDATION_LENGTH_METRES } from './BlackoutFoundationManifest.ts';

export class BlackoutElectricalFixtureTarget
implements ElectricalConnectionTarget {
  readonly id: string;
  readonly displayName: string;
  readonly mesh: THREE.Mesh;
  readonly hitMeshes: readonly THREE.Mesh[];
  private available = true;
  private connected = false;

  constructor(
    id: string,
    displayName: string,
    mesh: THREE.Mesh,
  ) {
    this.id = id;
    this.displayName = displayName;
    this.mesh = mesh;
    this.hitMeshes = [mesh];
  }

  copySocketWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    target.set(0, 0, 0);
    return this.mesh.localToWorld(target);
  }

  isAvailable(): boolean {
    return this.available && this.mesh.visible;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  setConnectionState(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    this.mesh.userData.electricalConnected = connected;
  }

  get connectionActive(): boolean {
    return this.connected;
  }
}

/** Minimal dark, traversable Level 3 foundation used until Room 1 authoring lands. */
export class BlackoutLevelScene {
  readonly root = new THREE.Group();
  readonly collisionMeshes: readonly THREE.Mesh[];
  readonly electricalTargets: readonly BlackoutElectricalFixtureTarget[];
  readonly incompatibleElectricalFixture: THREE.Mesh;

  private readonly movingElectricalTarget: BlackoutElectricalFixtureTarget;
  private fixtureTimeSeconds = 0;

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
      // Development-only LOS fixture for #122. Room 1 replaces this harness.
      this.addCollisionBox(
        'blackout-electrical-fixture-obstruction',
        new THREE.Vector3(1.5, 2.4, 0.35),
        new THREE.Vector3(4.2, 1.2, 7.2),
        0x252b31,
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

    const valid = this.addElectricalFixtureTarget(
      'fixture-terminal',
      'Development Terminal',
      new THREE.Vector3(0, 1.1, 8),
    );
    const obstructed = this.addElectricalFixtureTarget(
      'fixture-obstructed',
      'Obstructed Development Terminal',
      new THREE.Vector3(4.2, 1.1, 9),
    );
    this.movingElectricalTarget = this.addElectricalFixtureTarget(
      'fixture-moving',
      'Moving Development Terminal',
      new THREE.Vector3(-4.2, 1.1, 10.5),
    );
    const removable = this.addElectricalFixtureTarget(
      'fixture-removable',
      'Removable Development Terminal',
      new THREE.Vector3(1.8, 1.1, 13),
    );

    this.incompatibleElectricalFixture = this.addFixtureMesh(
      'blackout-electrical-fixture-incompatible',
      new THREE.Vector3(-1.8, 1.1, 13),
      0x4a5057,
    );
    this.incompatibleElectricalFixture.userData.authoringRole =
      'development-electrical-incompatible';

    this.electricalTargets = [
      valid,
      obstructed,
      this.movingElectricalTarget,
      removable,
    ];
    this.collisionMeshes = collisionMeshes;
  }

  updateElectricalFixtures(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.fixtureTimeSeconds += deltaSeconds;
    this.movingElectricalTarget.mesh.position.x =
      -4.2 + Math.sin(this.fixtureTimeSeconds * 0.8) * 1.4;
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

  private addElectricalFixtureTarget(
    id: string,
    displayName: string,
    position: THREE.Vector3,
  ): BlackoutElectricalFixtureTarget {
    const mesh = this.addFixtureMesh(
      `blackout-electrical-${id}`,
      position,
      0x7b6b16,
    );
    mesh.userData.authoringRole = 'development-electrical-target';
    mesh.userData.electricalTargetId = id;
    return new BlackoutElectricalFixtureTarget(id, displayName, mesh);
  }

  private addFixtureMesh(
    name: string,
    position: THREE.Vector3,
    colour: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.2, 0.35),
      new THREE.MeshStandardMaterial({
        color: colour,
        emissive: colour,
        emissiveIntensity: 0.18,
        roughness: 0.55,
        metalness: 0.55,
      }),
    );
    mesh.name = name;
    mesh.position.copy(position);
    this.root.add(mesh);
    return mesh;
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
