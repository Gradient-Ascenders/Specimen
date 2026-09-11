import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import type {
  SpecimenAttackReadModel,
  SpecimenProjectileReadState,
} from '../src/combat/SpecimenProjectileSystem.ts';
import { SpecimenCombatPresentation } from '../src/render/specimen/SpecimenCombatPresentation.ts';

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  className = '';
  hidden = false;
  isConnected = false;
  textContent: string | null = '';
  max = 0;
  value = 0;

  setAttribute(): void {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.isConnected = true;
      this.children.push(child);
    }
  }

  remove(): void {
    this.isConnected = false;
  }
}

const readModel: SpecimenAttackReadModel = {
  aimActive: true,
  charging: true,
  chargeAmount: 0.5,
  fullyCharged: false,
  cooldownRemainingSeconds: 0,
  cooldownProgress: 1,
  canStartCharge: false,
  aimOrigin: { x: 0, y: 0, z: 0 },
  aimDirection: { x: 0, y: 0, z: 1 },
  aimPoint: { x: 0, y: 0, z: 10 },
  liveProjectileCount: 2,
};

function projectile(
  id: number,
  active: boolean,
  x: number,
): SpecimenProjectileReadState {
  return {
    id,
    active,
    position: { x, y: 1, z: 2 },
    previousPosition: { x: x - 0.1, y: 1, z: 2 },
    direction: { x: 0, y: 0, z: 1 },
    chargeAmount: 0.5,
    fullyCharged: false,
    radiusMetres: 0.15,
  };
}

test('Specimen combat presentation reuses one bounded projectile mesh and one overlay', () => {
  const scene = new THREE.Scene();
  const host = new FakeElement();
  const states = Array.from({ length: 12 }, (_, index) =>
    projectile(index + 1, index < 2, index),
  );
  const presentation = new SpecimenCombatPresentation({
    scene,
    host: host as unknown as HTMLElement,
    source: {
      readModel,
      projectileStates: states,
    },
    document: {
      createElement: () => new FakeElement(),
    } as unknown as Document,
  });

  try {
    presentation.update(true);
    const projectileMesh = presentation.root.getObjectByName(
      'specimen-electric-acid-projectiles',
    );
    assert.ok(projectileMesh instanceof THREE.InstancedMesh);
    assert.equal(projectileMesh.count, 2);
    assert.deepEqual(presentation.getDiagnostics(), {
      activeProjectileCount: 2,
      capacity: 12,
      overlayAttached: true,
    });

    const rootCount = scene.children.filter(
      (child) => child.name === 'specimen-combat-presentation',
    ).length;
    assert.equal(rootCount, 1);
    assert.equal(host.children.length, 1);

    for (const state of states) {
      (state as { active: boolean }).active = false;
    }
    presentation.update(true);
    assert.equal(projectileMesh.count, 0);
    assert.equal(
      presentation.getDiagnostics().capacity,
      12,
    );
  } finally {
    presentation.dispose();
  }

  assert.equal(
    scene.children.some(
      (child) => child.name === 'specimen-combat-presentation',
    ),
    false,
  );
  assert.equal(host.children[0]?.isConnected, false);
});
