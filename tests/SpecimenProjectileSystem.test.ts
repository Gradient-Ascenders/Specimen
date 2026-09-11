import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { FixtureCombatTarget } from '../src/combat/CombatTargetAdapters.ts';
import { CombatTargetRegistry } from '../src/combat/CombatTargetRegistry.ts';
import {
  SpecimenProjectileSystem,
  type SpecimenAttackControls,
} from '../src/combat/SpecimenProjectileSystem.ts';
import {
  ColliderTransformMode,
  CollisionWorld,
  DEFAULT_SOLID_COLLISION_LAYERS,
} from '../src/physics/CollisionWorld.ts';

const BODY_POSITION = new THREE.Vector3(0, 0.675, 0);

const controls = (
  overrides: Partial<SpecimenAttackControls> = {},
): SpecimenAttackControls => ({
  active: true,
  aimHeld: true,
  fireHeld: false,
  firePressed: false,
  fireReleased: false,
  gameplayInputEnabled: true,
  pointerLocked: true,
  cancelled: false,
  ...overrides,
});

function createFixture(
  config: ConstructorParameters<typeof SpecimenProjectileSystem>[0]['config'] = {},
) {
  const world = new CollisionWorld();
  const registry = new CombatTargetRegistry(world);
  const body = {
    position: BODY_POSITION.clone(),
    radiusMetres: 0.675,
  };
  const aimOrigin = BODY_POSITION.clone();
  const aimDirection = new THREE.Vector3(0, 0, 1);
  const system = new SpecimenProjectileSystem({
    collisionWorld: world,
    targetRegistry: registry,
    body,
    aimRayProvider: {
      copyAimRay: (origin, direction) => {
        origin.copy(aimOrigin);
        direction.copy(aimDirection);
      },
    },
    config,
  });

  return {
    world,
    registry,
    body,
    aimOrigin,
    aimDirection,
    system,
    dispose: () => {
      system.dispose();
      registry.dispose();
    },
  };
}

function addTarget(
  fixture: ReturnType<typeof createFixture>,
  id: string,
  position: THREE.Vector3,
  options: {
    kind?: 'ordinary' | 'reinforced' | 'weak-point';
    healthUnits?: number;
    weakPointInitiallyOpen?: boolean;
    onDestroyed?: () => void;
    meshes?: number;
  } = {},
) {
  const meshes = Array.from({ length: options.meshes ?? 1 }, (_, index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.3));
    mesh.name = `${id}-hit-${index}`;
    mesh.position.copy(position).add(new THREE.Vector3(index * 0.1, 0, 0));
    return mesh;
  });
  const target = new FixtureCombatTarget({
    id,
    hitMeshes: meshes,
    kind: options.kind,
    healthUnits: options.healthUnits ?? 3,
    weakPointInitiallyOpen: options.weakPointInitiallyOpen,
    splashAnchor: meshes[0],
    onDestroyed: options.onDestroyed,
  });
  const unregister = fixture.registry.register(target, {
    registerCollision: true,
    transformMode: ColliderTransformMode.Static,
  });
  return {
    target,
    meshes,
    unregister,
    dispose: () => {
      unregister();
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) material.dispose();
      }
    },
  };
}

function fireTap(system: SpecimenProjectileSystem): void {
  system.update(1 / 60, controls({
    firePressed: true,
    fireReleased: true,
  }));
}

function readyCooldown(system: SpecimenProjectileSystem): void {
  system.update(0.81, controls());
}

test('tap, partial, and full charge all derive damage cooldown and splash from one chargeAmount', () => {
  const fixture = createFixture({
    projectileSpeedMetresPerSecond: 1,
    projectileLifetimeSeconds: 60,
  });
  const fired: Array<{
    chargeAmount: number;
    damageUnits: number;
    splashRadiusMetres: number;
  }> = [];
  let fullCueCount = 0;
  fixture.system.events.on('projectileFired', (event) => {
    fired.push(event);
  });
  fixture.system.events.on('fullChargeReached', () => {
    fullCueCount += 1;
  });

  try {
    fireTap(fixture.system);
    assert.equal(fired[0]?.chargeAmount, 0);
    assert.equal(fired[0]?.damageUnits, 1);
    assert.equal(fired[0]?.splashRadiusMetres, 0);
    assert.ok(
      Math.abs(fixture.system.readModel.cooldownRemainingSeconds - 0.35) <
        0.02,
    );
    assert.equal(fixture.system.readModel.cooldownProgress, 0);

    readyCooldown(fixture.system);
    fixture.system.update(0.75, controls({
      firePressed: true,
      fireHeld: true,
    }));
    assert.ok(
      Math.abs(fixture.system.readModel.chargeAmount - 0.5) < 1e-12,
    );
    fixture.system.update(1 / 60, controls({
      fireReleased: true,
    }));
    assert.ok(Math.abs(fired[1]!.chargeAmount - 0.5) < 1e-12);
    assert.ok(Math.abs(fired[1]!.damageUnits - 2) < 1e-12);
    assert.ok(Math.abs(fired[1]!.splashRadiusMetres - 1.5) < 1e-12);
    assert.equal(fixture.system.readModel.cooldownProgress, 0);

    readyCooldown(fixture.system);
    fixture.system.update(1.5, controls({
      firePressed: true,
      fireHeld: true,
    }));
    assert.equal(fixture.system.readModel.fullyCharged, true);
    assert.equal(fullCueCount, 1);
    fixture.system.update(0.5, controls({
      fireHeld: true,
    }));
    assert.equal(fullCueCount, 1);
    assert.equal(fired.length, 2);
    fixture.system.update(1 / 60, controls({
      fireReleased: true,
    }));
    assert.equal(fired[2]!.chargeAmount, 1);
    assert.equal(fired[2]!.damageUnits, 3);
    assert.equal(fired[2]!.splashRadiusMetres, 3);
  } finally {
    fixture.dispose();
  }
});

test('charge cancellation and cooldown require a fresh press and never buffer held fire', () => {
  const fixture = createFixture({
    projectileSpeedMetresPerSecond: 1,
    projectileLifetimeSeconds: 60,
  });
  let fired = 0;
  fixture.system.events.on('projectileFired', () => {
    fired += 1;
  });

  try {
    fixture.system.update(0.5, controls({
      firePressed: true,
      fireHeld: true,
    }));
    assert.ok(fixture.system.readModel.chargeAmount > 0);

    fixture.system.update(1 / 60, controls({
      aimHeld: false,
      fireHeld: true,
    }));
    assert.equal(fixture.system.readModel.charging, false);
    assert.equal(fixture.system.readModel.chargeAmount, 0);

    fixture.system.update(1 / 60, controls({
      fireHeld: true,
    }));
    assert.equal(fixture.system.readModel.charging, false);
    assert.equal(fired, 0);

    fixture.system.update(1 / 60, controls({
      firePressed: true,
      fireReleased: true,
    }));
    assert.equal(fired, 1);

    fixture.system.update(0.1, controls({
      firePressed: true,
      fireHeld: true,
    }));
    assert.equal(fixture.system.readModel.charging, false);
    fixture.system.update(0.4, controls({
      fireHeld: true,
    }));
    assert.equal(fixture.system.readModel.charging, false);
    assert.equal(fired, 1);

    fixture.system.update(1 / 60, controls({
      firePressed: true,
      fireReleased: true,
    }));
    assert.equal(fired, 2);
  } finally {
    fixture.dispose();
  }
});

test('pool exhaustion rejects release without replacing live shots or starting cooldown', () => {
  const fixture = createFixture({
    maximumLiveProjectiles: 2,
    projectileSpeedMetresPerSecond: 0.5,
    projectileLifetimeSeconds: 120,
  });
  const ids: number[] = [];
  const rejected: string[] = [];
  fixture.system.events.on('projectileFired', ({ projectileId }) => {
    ids.push(projectileId);
  });
  fixture.system.events.on('shotRejected', ({ reason }) => {
    rejected.push(reason);
  });

  try {
    fireTap(fixture.system);
    readyCooldown(fixture.system);
    fireTap(fixture.system);
    readyCooldown(fixture.system);
    assert.equal(fixture.system.readModel.liveProjectileCount, 2);

    fireTap(fixture.system);

    assert.deepEqual(rejected, ['pool-full']);
    assert.equal(ids.length, 2);
    assert.equal(fixture.system.readModel.liveProjectileCount, 2);
    assert.equal(fixture.system.readModel.cooldownRemainingSeconds, 0);
    assert.deepEqual(
      fixture.system.projectileStates
        .filter((state) => state.active)
        .map((state) => state.id),
      ids,
    );
  } finally {
    fixture.dispose();
  }
});

test('high-speed projectiles sweep thin geometry and resolve only the first blocking hit', () => {
  const fixture = createFixture({
    projectileSpeedMetresPerSecond: 150,
  });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.03));
  wall.name = 'thin-projectile-wall';
  wall.position.set(0, 0.675, 4);
  fixture.world.register(
    wall,
    DEFAULT_SOLID_COLLISION_LAYERS,
    ColliderTransformMode.Static,
  );
  let worldImpacts = 0;
  let despawns = 0;
  fixture.system.events.on('impact', ({ kind }) => {
    if (kind === 'world') worldImpacts += 1;
  });
  fixture.system.events.on('projectileDespawned', ({ reason }) => {
    if (reason === 'impact') despawns += 1;
  });

  try {
    fireTap(fixture.system);
    fixture.system.update(0.1, controls());

    assert.equal(worldImpacts, 1);
    assert.equal(despawns, 1);
    assert.equal(fixture.system.readModel.liveProjectileCount, 0);

    fixture.system.update(0.2, controls());
    assert.equal(worldImpacts, 1);
  } finally {
    fixture.world.unregister(wall);
    wall.geometry.dispose();
    const materials = Array.isArray(wall.material)
      ? wall.material
      : [wall.material];
    for (const material of materials) material.dispose();
    fixture.dispose();
  }
});

test('full charged direct hit breaks reinforced armour while partial and splash impacts cannot', () => {
  const fixture = createFixture();
  const reinforced = addTarget(
    fixture,
    'reinforced',
    new THREE.Vector3(0, 0.675, 5),
    {
      kind: 'reinforced',
      healthUnits: 2.5,
    },
  );

  try {
    fixture.system.update(0.75, controls({
      firePressed: true,
      fireHeld: true,
    }));
    fixture.system.update(1 / 60, controls({
      fireReleased: true,
    }));
    fixture.system.update(0.2, controls());
    assert.equal(reinforced.target.destroyed, false);
    assert.equal(reinforced.target.healthUnits, 2.5);

    readyCooldown(fixture.system);
    fixture.system.update(1.5, controls({
      firePressed: true,
      fireHeld: true,
    }));
    fixture.system.update(1 / 60, controls({
      fireReleased: true,
    }));
    fixture.system.update(0.2, controls());

    assert.equal(reinforced.target.destroyed, true);
  } finally {
    reinforced.dispose();
    fixture.dispose();
  }
});

test('charged splash is distance-attenuated, deduplicates direct targets, and is blocked by walls', () => {
  const fixture = createFixture();
  const direct = addTarget(
    fixture,
    'direct',
    new THREE.Vector3(0, 0.675, 5),
    { healthUnits: 10, meshes: 2 },
  );
  const open = addTarget(
    fixture,
    'open-splash',
    new THREE.Vector3(1.4, 0.675, 5),
    { healthUnits: 10 },
  );
  const covered = addTarget(
    fixture,
    'covered-splash',
    new THREE.Vector3(-1.8, 0.675, 5),
    { healthUnits: 10 },
  );
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 1.8));
  cover.name = 'splash-cover';
  cover.position.set(-0.9, 0.675, 5);
  fixture.world.register(
    cover,
    DEFAULT_SOLID_COLLISION_LAYERS,
    ColliderTransformMode.Static,
  );
  const impacts: Array<{ id: string; kind: string }> = [];
  fixture.system.events.on('targetImpact', ({ impact }) => {
    impacts.push({ id: impact.targetId, kind: impact.kind });
  });

  try {
    fixture.system.update(1.5, controls({
      firePressed: true,
      fireHeld: true,
    }));
    fixture.system.update(1 / 60, controls({
      fireReleased: true,
    }));
    fixture.system.update(0.2, controls());

    assert.equal(
      impacts.filter((item) => item.id === 'direct').length,
      1,
    );
    assert.deepEqual(
      impacts.find((item) => item.id === 'direct'),
      { id: 'direct', kind: 'direct' },
    );
    assert.ok(open.target.healthUnits < 10);
    assert.equal(covered.target.healthUnits, 10);
    assert.equal(
      impacts.some((item) => item.id === 'covered-splash'),
      false,
    );
  } finally {
    fixture.world.unregister(cover);
    cover.geometry.dispose();
    const materials = Array.isArray(cover.material)
      ? cover.material
      : [cover.material];
    for (const material of materials) material.dispose();
    direct.dispose();
    open.dispose();
    covered.dispose();
    fixture.dispose();
  }
});

test('splash eligibility is gathered before reactions and removed targets are not hit after a direct destruction callback', () => {
  const fixture = createFixture();
  let unregisterSplash: (() => void) | undefined;
  const direct = addTarget(
    fixture,
    'removing-direct',
    new THREE.Vector3(0, 0.675, 5),
    {
      healthUnits: 1,
      onDestroyed: () => {
        unregisterSplash?.();
      },
    },
  );
  const splash = addTarget(
    fixture,
    'removed-splash',
    new THREE.Vector3(1, 0.675, 5),
    { healthUnits: 5 },
  );
  unregisterSplash = splash.unregister;

  try {
    fixture.system.update(1.5, controls({
      firePressed: true,
      fireHeld: true,
    }));
    fixture.system.update(1 / 60, controls({
      fireReleased: true,
    }));
    fixture.system.update(0.2, controls());

    assert.equal(direct.target.destroyed, true);
    assert.equal(splash.target.healthUnits, 5);
  } finally {
    direct.dispose();
    // unregister is idempotent through the closure.
    splash.dispose();
    fixture.dispose();
  }
});

test('death/reset clears charge, cooldown, and every pooled projectile without reallocating slots', () => {
  const fixture = createFixture({
    projectileSpeedMetresPerSecond: 1,
    projectileLifetimeSeconds: 60,
  });
  const states = fixture.system.projectileStates;

  try {
    fireTap(fixture.system);
    readyCooldown(fixture.system);
    fixture.system.update(0.5, controls({
      firePressed: true,
      fireHeld: true,
    }));
    assert.ok(fixture.system.readModel.liveProjectileCount > 0);
    assert.ok(fixture.system.readModel.chargeAmount > 0);

    fixture.system.reset();

    assert.equal(fixture.system.projectileStates, states);
    assert.equal(fixture.system.readModel.liveProjectileCount, 0);
    assert.equal(fixture.system.readModel.charging, false);
    assert.equal(fixture.system.readModel.chargeAmount, 0);
    assert.equal(fixture.system.readModel.cooldownRemainingSeconds, 0);
    assert.equal(
      fixture.system.projectileStates.every((state) => !state.active),
      true,
    );
  } finally {
    fixture.dispose();
  }
});


test('reset invoked from a destruction reaction clears the pool and aborts remaining splash work safely', () => {
  const fixture = createFixture();
  let direct: ReturnType<typeof addTarget> | undefined;
  const splash = addTarget(
    fixture,
    'reset-splash',
    new THREE.Vector3(1, 0.675, 5),
    { healthUnits: 5 },
  );
  direct = addTarget(
    fixture,
    'reset-direct',
    new THREE.Vector3(0, 0.675, 5),
    {
      healthUnits: 1,
      onDestroyed: () => {
        fixture.system.reset();
      },
    },
  );

  try {
    fixture.system.update(1.5, controls({
      firePressed: true,
      fireHeld: true,
    }));
    fixture.system.update(1 / 60, controls({
      fireReleased: true,
    }));
    fixture.system.update(0.2, controls());

    assert.equal(direct.target.destroyed, true);
    assert.equal(splash.target.healthUnits, 5);
    assert.equal(fixture.system.readModel.liveProjectileCount, 0);
    assert.equal(
      fixture.system.projectileStates.every((state) => !state.active),
      true,
    );

    // Repeated recovery/reset remains idempotent after the callback-driven one.
    fixture.system.reset();
    fixture.system.reset();
    assert.equal(fixture.system.readModel.liveProjectileCount, 0);
  } finally {
    direct?.dispose();
    splash.dispose();
    fixture.dispose();
  }
});


test('splash LOS accepts the candidate target own pre-registered default-layer collider as the terminal hit', () => {
  const fixture = createFixture();
  const direct = addTarget(
    fixture,
    'solid-los-direct',
    new THREE.Vector3(0, 0.675, 5),
    { healthUnits: 10 },
  );

  const candidateMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.2, 0.5),
  );
  candidateMesh.name = 'solid-los-candidate-collider';
  candidateMesh.position.set(1.4, 0.675, 5);
  fixture.world.register(
    candidateMesh,
    DEFAULT_SOLID_COLLISION_LAYERS,
    ColliderTransformMode.Static,
  );
  const candidate = new FixtureCombatTarget({
    id: 'solid-los-candidate',
    hitMeshes: [candidateMesh],
    healthUnits: 10,
  });
  const unregisterCandidate = fixture.registry.register(candidate);

  try {
    fixture.system.update(1.5, controls({
      firePressed: true,
      fireHeld: true,
    }));
    fixture.system.update(1 / 60, controls({
      fireReleased: true,
    }));
    fixture.system.update(0.2, controls());

    assert.equal(direct.target.healthUnits, 7);
    assert.ok(
      candidate.healthUnits < 10,
      'candidate own LineOfSight collider must terminate visibility rather than self-occlude',
    );
  } finally {
    unregisterCandidate();
    fixture.world.unregister(candidateMesh);
    candidateMesh.geometry.dispose();
    const materials = Array.isArray(candidateMesh.material)
      ? candidateMesh.material
      : [candidateMesh.material];
    for (const material of materials) material.dispose();
    direct.dispose();
    fixture.dispose();
  }
});
