import * as THREE from 'three';

import type { BlackoutCheckpointParticipant } from '../levels/BlackoutCheckpointManager.ts';
import type { SerializableValue } from '../levels/BlackoutRuntimeState.ts';
import {
  ColliderTransformMode,
  DEFAULT_SOLID_COLLISION_LAYERS,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import type { ResettablePuzzleComponent } from '../puzzle/PuzzleRegistry.ts';
import {
  CombatDroneTarget,
  FixtureCombatTarget,
  type FixtureCombatTargetSnapshot,
} from './CombatTargetAdapters.ts';
import type { CombatTargetRegistry } from './CombatTargetRegistry.ts';

type FixtureId =
  | 'specimen-target-ordinary'
  | 'specimen-target-reinforced'
  | 'specimen-target-weak-point'
  | 'specimen-target-splash'
  | 'specimen-target-covered'
  | 'specimen-target-drone';

interface RigSnapshot {
  readonly targets: Readonly<Record<FixtureId, FixtureCombatTargetSnapshot>>;
}

/**
 * Independent #127 verification harness.
 *
 * Room 4A and the Sentinel will replace these fixtures; the target and attack
 * contracts remain reusable.
 */
export class SpecimenCombatDevelopmentRig
implements ResettablePuzzleComponent, BlackoutCheckpointParticipant {
  readonly id = 'specimen-combat-development-rig';
  readonly root = new THREE.Group();

  readonly ordinary: FixtureCombatTarget;
  readonly reinforced: FixtureCombatTarget;
  readonly weakPoint: FixtureCombatTarget;
  readonly splash: FixtureCombatTarget;
  readonly covered: FixtureCombatTarget;
  readonly drone: CombatDroneTarget;
  readonly stickyWall: THREE.Mesh;
  readonly coverWall: THREE.Mesh;

  private readonly world: CollisionWorld;
  private readonly surfaces: SurfaceRegistry;
  private readonly unregisterTargets: (() => void)[] = [];
  private readonly droneOwner: DevelopmentDroneOwner;
  private disposed = false;

  constructor(options: {
    readonly collisionWorld: CollisionWorld;
    readonly surfaceRegistry: SurfaceRegistry;
    readonly targetRegistry: CombatTargetRegistry;
  }) {
    this.world = options.collisionWorld;
    this.surfaces = options.surfaceRegistry;
    this.root.name = 'specimen-combat-development-rig';

    const ordinaryMesh = this.createTargetMesh(
      'specimen-target-ordinary-hit',
      new THREE.Vector3(0, 1, 68),
      0x8b6f55,
    );
    const reinforcedMesh = this.createTargetMesh(
      'specimen-target-reinforced-hit',
      new THREE.Vector3(3.2, 1, 68),
      0x65717e,
    );
    const weakMesh = this.createTargetMesh(
      'specimen-target-weak-point-hit',
      new THREE.Vector3(-3.2, 1, 68),
      0xb43131,
    );
    const splashMesh = this.createTargetMesh(
      'specimen-target-splash-hit',
      new THREE.Vector3(1.6, 1, 71),
      0x826045,
    );
    const coveredMesh = this.createTargetMesh(
      'specimen-target-covered-hit',
      new THREE.Vector3(-1.6, 1, 72.2),
      0x826045,
    );

    this.ordinary = new FixtureCombatTarget({
      id: 'specimen-target-ordinary',
      hitMeshes: [ordinaryMesh],
      healthUnits: 2,
    });
    this.reinforced = new FixtureCombatTarget({
      id: 'specimen-target-reinforced',
      hitMeshes: [reinforcedMesh],
      kind: 'reinforced',
      healthUnits: 2.5,
    });
    this.weakPoint = new FixtureCombatTarget({
      id: 'specimen-target-weak-point',
      hitMeshes: [weakMesh],
      kind: 'weak-point',
      healthUnits: 2,
      weakPointInitiallyOpen: false,
    });
    this.splash = new FixtureCombatTarget({
      id: 'specimen-target-splash',
      hitMeshes: [splashMesh],
      healthUnits: 2,
    });
    this.covered = new FixtureCombatTarget({
      id: 'specimen-target-covered',
      hitMeshes: [coveredMesh],
      healthUnits: 2,
    });

    this.droneOwner = new DevelopmentDroneOwner(
      this.createTargetMesh(
        'specimen-target-drone-hit',
        new THREE.Vector3(6, 1, 69.5),
        0x56616b,
      ),
      this.world,
      this.surfaces,
    );
    this.drone = new CombatDroneTarget({
      id: 'specimen-target-drone',
      hitMeshes: [this.droneOwner.mesh],
      owner: this.droneOwner,
      healthUnits: 2,
    });

    this.coverWall = this.createSolidBox(
      'specimen-splash-cover-wall',
      new THREE.Vector3(2.4, 2.5, 0.35),
      new THREE.Vector3(-1.2, 1.25, 71),
      'default',
      0x30353a,
    );
    this.stickyWall = this.createSolidBox(
      'specimen-sticky-development-wall',
      new THREE.Vector3(0.35, 4.5, 5),
      new THREE.Vector3(-7.2, 2.25, 64),
      'sticky',
      0x514760,
    );

    try {
      for (const target of [
        this.ordinary,
        this.reinforced,
        this.weakPoint,
        this.splash,
        this.covered,
      ]) {
        this.unregisterTargets.push(
          options.targetRegistry.register(target, {
            registerCollision: true,
            transformMode: ColliderTransformMode.Static,
          }),
        );
      }
      this.unregisterTargets.push(
        options.targetRegistry.register(this.drone),
      );
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  capture(): SerializableValue {
    const targets = {
      [this.ordinary.id]: serializeTarget(this.ordinary.captureState()),
      [this.reinforced.id]: serializeTarget(this.reinforced.captureState()),
      [this.weakPoint.id]: serializeTarget(this.weakPoint.captureState()),
      [this.splash.id]: serializeTarget(this.splash.captureState()),
      [this.covered.id]: serializeTarget(this.covered.captureState()),
      [this.drone.id]: serializeTarget(this.drone.captureState()),
    };
    return { targets };
  }

  restore(state: SerializableValue): void {
    const snapshot = readSnapshot(state);
    this.ordinary.restoreState(snapshot.targets[this.ordinary.id]);
    this.reinforced.restoreState(snapshot.targets[this.reinforced.id]);
    this.weakPoint.restoreState(snapshot.targets[this.weakPoint.id]);
    this.splash.restoreState(snapshot.targets[this.splash.id]);
    this.covered.restoreState(snapshot.targets[this.covered.id]);
    this.drone.restoreState(snapshot.targets[this.drone.id]);
  }

  resetTransient(): void {}

  reset(): void {
    if (this.disposed) return;
    this.ordinary.reset();
    this.reinforced.reset();
    this.weakPoint.reset();
    this.splash.reset();
    this.covered.reset();
    this.drone.reset();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let index = this.unregisterTargets.length - 1; index >= 0; index -= 1) {
      this.unregisterTargets[index]?.();
    }
    this.unregisterTargets.length = 0;
    this.droneOwner.dispose();

    for (const mesh of [this.coverWall, this.stickyWall]) {
      this.world.unregister(mesh);
      this.surfaces.unregister(mesh);
    }

    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object === this.droneOwner.mesh) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    this.root.clear();
  }

  private createTargetMesh(
    name: string,
    position: THREE.Vector3,
    colour: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.2, 0.45),
      new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.55,
        metalness: 0.45,
      }),
    );
    mesh.name = name;
    mesh.position.copy(position);
    mesh.userData.authoringRole = 'specimen-combat-target';
    this.root.add(mesh);
    return mesh;
  }

  private createSolidBox(
    name: string,
    size: THREE.Vector3,
    position: THREE.Vector3,
    surfaceTag: 'default' | 'sticky',
    colour: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.75,
        metalness: 0.25,
      }),
    );
    mesh.name = name;
    mesh.position.copy(position);
    mesh.userData.surfaceTag = surfaceTag;
    this.root.add(mesh);
    this.world.register(
      mesh,
      DEFAULT_SOLID_COLLISION_LAYERS,
      ColliderTransformMode.Static,
    );
    this.surfaces.register(mesh);
    return mesh;
  }
}

class DevelopmentDroneOwner {
  readonly mesh: THREE.Mesh;
  private readonly world: CollisionWorld;
  private readonly surfaces: SurfaceRegistry;
  private collisionEnabled = true;
  private disposed = false;

  constructor(
    mesh: THREE.Mesh,
    world: CollisionWorld,
    surfaces: SurfaceRegistry,
  ) {
    this.mesh = mesh;
    this.world = world;
    this.surfaces = surfaces;
    this.mesh.userData.surfaceTag = 'default';
    this.mesh.userData.authoringRole = 'specimen-combat-enabled-drone';
    this.world.register(
      this.mesh,
      DEFAULT_SOLID_COLLISION_LAYERS,
      ColliderTransformMode.Static,
    );
    this.surfaces.register(this.mesh);
  }

  setEnabled(enabled: boolean): void {
    this.mesh.userData.droneEnabled = enabled;
  }

  setCollisionEnabled(enabled: boolean): void {
    if (this.disposed || this.collisionEnabled === enabled) return;
    this.collisionEnabled = enabled;
    if (enabled) {
      this.world.register(
        this.mesh,
        DEFAULT_SOLID_COLLISION_LAYERS,
        ColliderTransformMode.Static,
      );
      this.surfaces.register(this.mesh);
    } else {
      this.world.unregister(this.mesh);
      this.surfaces.unregister(this.mesh);
    }
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  clearOwnedProjectiles(): void {
    this.mesh.userData.hostileProjectilesCleared =
      (Number(this.mesh.userData.hostileProjectilesCleared) || 0) + 1;
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.collisionEnabled) {
      this.world.unregister(this.mesh);
      this.surfaces.unregister(this.mesh);
    }
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    const materials = Array.isArray(this.mesh.material)
      ? this.mesh.material
      : [this.mesh.material];
    for (const material of materials) material.dispose();
    this.disposed = true;
  }
}

function serializeTarget(
  snapshot: FixtureCombatTargetSnapshot,
): SerializableValue {
  return {
    healthUnits: snapshot.healthUnits,
    enabled: snapshot.enabled,
    weakPointOpen: snapshot.weakPointOpen,
    destroyed: snapshot.destroyed,
  };
}

function readSnapshot(value: SerializableValue): RigSnapshot {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Invalid Specimen combat rig checkpoint snapshot.');
  }
  const rawTargets = (
    value as Readonly<Record<string, SerializableValue>>
  ).targets;
  if (
    !rawTargets ||
    Array.isArray(rawTargets) ||
    typeof rawTargets !== 'object'
  ) {
    throw new Error('Specimen combat rig snapshot is missing targets.');
  }

  const targets = rawTargets as Readonly<Record<string, SerializableValue>>;
  const read = (id: FixtureId): FixtureCombatTargetSnapshot => {
    const raw = targets[id];
    if (!raw || Array.isArray(raw) || typeof raw !== 'object') {
      throw new Error(`Specimen combat rig snapshot is missing "${id}".`);
    }
    const object = raw as Readonly<Record<string, SerializableValue>>;
    if (
      typeof object.healthUnits !== 'number' ||
      typeof object.enabled !== 'boolean' ||
      typeof object.weakPointOpen !== 'boolean' ||
      typeof object.destroyed !== 'boolean'
    ) {
      throw new Error(`Invalid Specimen combat target state for "${id}".`);
    }
    return {
      healthUnits: object.healthUnits,
      enabled: object.enabled,
      weakPointOpen: object.weakPointOpen,
      destroyed: object.destroyed,
    };
  };

  return {
    targets: {
      'specimen-target-ordinary': read('specimen-target-ordinary'),
      'specimen-target-reinforced': read('specimen-target-reinforced'),
      'specimen-target-weak-point': read('specimen-target-weak-point'),
      'specimen-target-splash': read('specimen-target-splash'),
      'specimen-target-covered': read('specimen-target-covered'),
      'specimen-target-drone': read('specimen-target-drone'),
    },
  };
}
