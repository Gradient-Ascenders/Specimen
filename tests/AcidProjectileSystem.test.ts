import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  AcidProjectileSystem,
  type AimRayProvider,
} from '../src/abilities/AcidProjectileSystem.ts';
import { DissolveSystem } from '../src/abilities/DissolveSystem.ts';
import { DissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

class TestBody {
  readonly position: THREE.Vector3;
  readonly radiusMetres = 0.45;

  constructor(position: THREE.Vector3) {
    this.position = position.clone();
  }
}

class TestSlimeManager {
  readonly bob = new TestBody(new THREE.Vector3());
  readonly goop = new TestBody(new THREE.Vector3());
  activeSlimeId: 'bob' | 'goop' = 'goop';

  get activeBody(): TestBody {
    return this.activeSlimeId === 'goop' ? this.goop : this.bob;
  }

  activate(id: 'bob' | 'goop'): void {
    this.activeSlimeId = id;
  }

  canActiveUseAbility(ability: 'dissolve'): boolean {
    return ability === 'dissolve' && this.activeSlimeId === 'goop';
  }
}

class TestAimRay implements AimRayProvider {
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;

  constructor(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ) {
    this.origin = origin;
    this.direction = direction;
  }

  copyAimRay(origin: THREE.Vector3, direction: THREE.Vector3): void {
    origin.copy(this.origin);
    direction.copy(this.direction);
  }
}

interface Fixture {
  readonly world: CollisionWorld;
  readonly surfaces: SurfaceRegistry;
  readonly manager: TestSlimeManager;
  readonly dissolve: DissolveSystem;
  readonly target: DissolveTarget;
  readonly targetMesh: THREE.Mesh;
  readonly ownedMeshes: THREE.Mesh[];
  dispose(): void;
}

function createFixture(
  targetPosition = new THREE.Vector3(0, 0, -3),
  additionalTargetPositions: readonly THREE.Vector3[] = [],
): Fixture {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const manager = new TestSlimeManager();

  const targetPositions = [targetPosition, ...additionalTargetPositions];
  const ownedMeshes: THREE.Mesh[] = [];
  const targets = targetPositions.map((position, index) => {
    const id = index === 0 ? 'soluble-target' : `soluble-target-${index + 1}`;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 0.02),
      new THREE.MeshStandardMaterial(),
    );
    mesh.name = id;
    mesh.position.copy(position);
    mesh.userData.surfaceTag = 'default';
    world.register(mesh);
    surfaces.register(mesh);
    ownedMeshes.push(mesh);
    return new DissolveTarget({
      id,
      mesh,
      collisionWorld: world,
      surfaceRegistry: surfaces,
      dissolveDurationSeconds: 2,
      collisionDisableProgress: 0.75,
    });
  });
  const target = targets[0];
  const targetMesh = target.mesh;
  const dissolve = new DissolveSystem(targets);

  return {
    world,
    surfaces,
    manager,
    dissolve,
    target,
    targetMesh,
    ownedMeshes,
    dispose: () => {
      dissolve.dispose();
      for (const dissolveTarget of targets) dissolveTarget.dispose();
      for (const mesh of ownedMeshes) {
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) material.dispose();
      }
    },
  };
}

function addWorldBox(
  fixture: Fixture,
  name: string,
  size: THREE.Vector3,
  position: THREE.Vector3,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial(),
  );
  mesh.name = name;
  mesh.position.copy(position);
  fixture.world.register(mesh);
  fixture.ownedMeshes.push(mesh);
  return mesh;
}

const AIM_ONLY = {
  aimHeld: true,
  firePressed: false,
  gameplayInputEnabled: true,
  pointerLocked: true,
} as const;

test('only active Goop can aim and fire', () => {
  const fixture = createFixture();
  const system = new AcidProjectileSystem({
    slimeManager: fixture.manager,
    collisionWorld: fixture.world,
    dissolveSystem: fixture.dissolve,
    aimRayProvider: new TestAimRay(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ),
  });

  system.update(1 / 60, AIM_ONLY);
  assert.equal(system.aimReadModel.active, true);
  assert.equal(system.aimReadModel.maximumRangeMetres, 75);
  assert.equal(system.aimReadModel.targetedSolubleId, 'soluble-target');
  assert.deepEqual(system.aimReadModel.visibleSolubleIds, ['soluble-target']);

  system.update(1 / 60, {
    ...AIM_ONLY,
    firePressed: true,
    pointerLocked: false,
  });
  assert.equal(system.aimReadModel.active, false);
  assert.equal(system.getDiagnostics().firedCount, 0);

  fixture.manager.activate('bob');
  system.update(1 / 60, {
    ...AIM_ONLY,
    firePressed: true,
  });
  assert.equal(system.aimReadModel.active, false);
  assert.equal(system.getDiagnostics().firedCount, 0);

  system.dispose();
  fixture.dispose();
});

test('the default 75 metre range keeps distant highlighted targets reachable', () => {
  const fixture = createFixture(new THREE.Vector3(0, 0, -70));
  const system = new AcidProjectileSystem({
    slimeManager: fixture.manager,
    collisionWorld: fixture.world,
    dissolveSystem: fixture.dissolve,
    aimRayProvider: new TestAimRay(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ),
  });

  system.update(1 / 60, AIM_ONLY);
  assert.deepEqual(system.aimReadModel.visibleSolubleIds, ['soluble-target']);
  assert.equal(system.aimReadModel.targetedSolubleId, 'soluble-target');

  system.update(1 / 60, {
    ...AIM_ONLY,
    firePressed: true,
  });
  for (
    let step = 0;
    step < 300 && system.getDiagnostics().solubleImpactCount === 0;
    step += 1
  ) {
    system.update(1 / 60, AIM_ONLY);
  }

  assert.equal(system.getDiagnostics().solubleImpactCount, 1);
  assert.equal(fixture.dissolve.activeBurnCount, 1);

  system.dispose();
  fixture.dispose();
});

test('a high-speed acid projectile sweeps through a thin soluble target', () => {
  const fixture = createFixture();
  const system = new AcidProjectileSystem({
    slimeManager: fixture.manager,
    collisionWorld: fixture.world,
    dissolveSystem: fixture.dissolve,
    aimRayProvider: new TestAimRay(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ),
    config: {
      projectileSpeedMetresPerSecond: 120,
    },
  });
  let impactCount = 0;
  system.events.on('solubleImpact', () => {
    impactCount += 1;
  });

  system.update(1 / 30, {
    ...AIM_ONLY,
    firePressed: true,
  });

  assert.equal(impactCount, 1);
  assert.equal(system.getDiagnostics().liveProjectileCount, 0);
  assert.equal(fixture.dissolve.activeBurnCount, 1);
  fixture.manager.activate('bob');
  fixture.dissolve.update(0.5);
  assert.equal(fixture.target.progress, 0.25);

  system.dispose();
  fixture.dispose();
});

test('projectile collision near Goop overrides an unobstructed offset camera', () => {
  const fixture = createFixture(new THREE.Vector3(2, 0, -3));
  addWorldBox(
    fixture,
    'near-goop-wall',
    new THREE.Vector3(1.6, 2, 0.2),
    new THREE.Vector3(0.7, 0, -1),
  );
  const system = new AcidProjectileSystem({
    slimeManager: fixture.manager,
    collisionWorld: fixture.world,
    dissolveSystem: fixture.dissolve,
    aimRayProvider: new TestAimRay(
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ),
    config: {
      projectileSpeedMetresPerSecond: 120,
    },
  });

  system.update(1 / 30, AIM_ONLY);
  assert.equal(system.aimReadModel.targetedSolubleId, 'soluble-target');
  system.update(1 / 30, {
    ...AIM_ONLY,
    firePressed: true,
  });

  assert.equal(system.getDiagnostics().worldImpactCount, 1);
  assert.equal(system.getDiagnostics().solubleImpactCount, 0);
  assert.equal(fixture.dissolve.activeBurnCount, 0);

  system.dispose();
  fixture.dispose();
});

test('acid treats explicitly non-soluble drone bodies as ordinary world impacts', () => {
  const fixture = createFixture(new THREE.Vector3(0, 0, -4));
  const drone = addWorldBox(
    fixture,
    'test-drone-body',
    new THREE.Vector3(1, 1, 0.6),
    new THREE.Vector3(0, 0, -2),
  );
  drone.userData.soluble = false;
  drone.userData.authoringRole = 'acid-resistant-drone';
  const system = new AcidProjectileSystem({
    slimeManager: fixture.manager,
    collisionWorld: fixture.world,
    dissolveSystem: fixture.dissolve,
    aimRayProvider: new TestAimRay(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)),
    config: { projectileSpeedMetresPerSecond: 120 },
  });
  let impactRole: string | undefined;
  system.events.on('worldImpact', ({ authoringRole }) => {
    impactRole = authoringRole;
  });

  system.update(1 / 30, { ...AIM_ONLY, firePressed: true });
  assert.equal(impactRole, 'acid-resistant-drone');
  assert.equal(fixture.dissolve.activeBurnCount, 0);
  assert.equal(fixture.target.progress, 0);

  system.dispose();
  fixture.dispose();
});

test('cooldown and projectile-pool limits bound deterministic shot count', () => {
  const fixture = createFixture(new THREE.Vector3(0, 0, -80));
  const system = new AcidProjectileSystem({
    slimeManager: fixture.manager,
    collisionWorld: fixture.world,
    dissolveSystem: fixture.dissolve,
    aimRayProvider: new TestAimRay(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ),
    config: {
      maximumLiveProjectiles: 1,
      projectileSpeedMetresPerSecond: 1,
      fireCooldownSeconds: 0.1,
    },
  });

  system.update(0.01, { ...AIM_ONLY, firePressed: true });
  assert.equal(system.getDiagnostics().firedCount, 1);
  assert.deepEqual(system.aimReadModel.visibleSolubleIds, []);
  system.update(0.2, { ...AIM_ONLY, firePressed: true });
  assert.equal(system.aimReadModel.canFire, false);
  assert.equal(system.getDiagnostics().firedCount, 1);

  system.reset();
  assert.equal(system.getDiagnostics().liveProjectileCount, 0);
  assert.equal(system.aimReadModel.cooldownProgress, 1);

  system.dispose();
  fixture.dispose();
});

test('occluded candidates cannot exceed the fixed-step visibility probe cap', () => {
  const fixture = createFixture(
    new THREE.Vector3(-3, 0, -5),
    [
      new THREE.Vector3(-1, 0, -5),
      new THREE.Vector3(1, 0, -5),
      new THREE.Vector3(3, 0, -5),
    ],
  );
  addWorldBox(
    fixture,
    'occluding-wall',
    new THREE.Vector3(10, 4, 0.2),
    new THREE.Vector3(0, 0, -2),
  );
  const system = new AcidProjectileSystem({
    slimeManager: fixture.manager,
    collisionWorld: fixture.world,
    dissolveSystem: fixture.dissolve,
    aimRayProvider: new TestAimRay(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ),
    config: {
      maximumVisibleTargets: 2,
    },
  });

  system.update(1 / 60, AIM_ONLY);

  assert.deepEqual(system.aimReadModel.visibleSolubleIds, []);
  assert.equal(system.getDiagnostics().visibilityProbeCount, 2);

  system.dispose();
  fixture.dispose();
});

test('the camera-ray target is retained after earlier candidates exhaust the probe cap', () => {
  const fixture = createFixture(
    new THREE.Vector3(-3, 0, -5),
    [
      new THREE.Vector3(3, 0, -5),
      new THREE.Vector3(0, 0, -5),
    ],
  );
  addWorldBox(
    fixture,
    'left-occluder',
    new THREE.Vector3(1, 4, 0.2),
    new THREE.Vector3(-1.2, 0, -2),
  );
  addWorldBox(
    fixture,
    'right-occluder',
    new THREE.Vector3(1, 4, 0.2),
    new THREE.Vector3(1.2, 0, -2),
  );
  const system = new AcidProjectileSystem({
    slimeManager: fixture.manager,
    collisionWorld: fixture.world,
    dissolveSystem: fixture.dissolve,
    aimRayProvider: new TestAimRay(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ),
    config: {
      maximumVisibleTargets: 2,
    },
  });

  system.update(1 / 60, AIM_ONLY);

  assert.deepEqual(system.aimReadModel.visibleSolubleIds, [
    'soluble-target-3',
  ]);
  assert.equal(
    system.aimReadModel.targetedSolubleId,
    'soluble-target-3',
  );
  assert.equal(system.getDiagnostics().visibilityProbeCount, 2);

  system.dispose();
  fixture.dispose();
});

test('aim mode highlights a hanging rope when its lower tip is occluded', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const manager = new TestSlimeManager();
  const rope = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 6, 0.48),
    new THREE.MeshStandardMaterial(),
  );
  rope.name = 'hanging-rope';
  rope.position.set(0, 4, -6);
  rope.userData.surfaceTag = 'default';
  world.register(rope);
  surfaces.register(rope);
  const target = new DissolveTarget({
    id: rope.name,
    mesh: rope,
    collisionWorld: world,
    surfaceRegistry: surfaces,
    dissolveDurationSeconds: 2,
    collisionDisableProgress: 0.75,
  });
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(5, 1, 5),
    new THREE.MeshStandardMaterial(),
  );
  platform.name = 'suspended-platform';
  platform.position.set(0, 0.5, -6);
  world.register(platform);
  const dissolve = new DissolveSystem([target]);
  const system = new AcidProjectileSystem({
    slimeManager: manager,
    collisionWorld: world,
    dissolveSystem: dissolve,
    aimRayProvider: new TestAimRay(
      new THREE.Vector3(),
      new THREE.Vector3(1, 0, -1),
    ),
  });

  system.update(1 / 60, AIM_ONLY);

  assert.equal(system.aimReadModel.targetedSolubleId, undefined);
  assert.deepEqual(system.aimReadModel.visibleSolubleIds, ['hanging-rope']);
  assert.equal(system.getDiagnostics().visibilityProbeCount, 1);

  system.dispose();
  dissolve.dispose();
  target.dispose();
  world.clear();
  surfaces.clear();
  rope.geometry.dispose();
  rope.material.dispose();
  platform.geometry.dispose();
  platform.material.dispose();
});

test('cooldown accepts the next shot exactly at the configured boundary', () => {
  const fixture = createFixture(new THREE.Vector3(0, 0, -20));
  const system = new AcidProjectileSystem({
    slimeManager: fixture.manager,
    collisionWorld: fixture.world,
    dissolveSystem: fixture.dissolve,
    aimRayProvider: new TestAimRay(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ),
    config: {
      projectileSpeedMetresPerSecond: 1,
      fireCooldownSeconds: 0.45,
    },
  });

  system.update(0.01, { ...AIM_ONLY, firePressed: true });
  system.update(0.44, { ...AIM_ONLY, firePressed: true });
  assert.equal(system.getDiagnostics().firedCount, 1);
  system.update(0.01, { ...AIM_ONLY, firePressed: true });
  assert.equal(system.getDiagnostics().firedCount, 2);

  system.dispose();
  fixture.dispose();
});

test('room-scoped aim eligibility follows Goop physical entry before shared progression', () => {
  const fixture = createFixture(new THREE.Vector3(0, 0, -5));
  fixture.target.mesh.userData.roomId = 3;
  let goopPhysicalRoomId = 2;
  const system = new AcidProjectileSystem({
    slimeManager: fixture.manager,
    collisionWorld: fixture.world,
    dissolveSystem: fixture.dissolve,
    aimRayProvider: new TestAimRay(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ),
    isTargetEnabled: (target) =>
      target.mesh.userData.roomId === goopPhysicalRoomId,
  });

  system.update(1 / 60, AIM_ONLY);
  assert.equal(system.aimReadModel.targetedSolubleId, undefined);
  assert.deepEqual(system.aimReadModel.visibleSolubleIds, []);

  goopPhysicalRoomId = 3;
  system.update(1 / 60, AIM_ONLY);
  assert.equal(system.aimReadModel.targetedSolubleId, fixture.target.id);
  assert.deepEqual(system.aimReadModel.visibleSolubleIds, [fixture.target.id]);

  system.dispose();
  fixture.dispose();
});
