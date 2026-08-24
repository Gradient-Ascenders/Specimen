import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import type {
  AcidAimReadModel,
  AcidProjectileEvents,
  AcidProjectileReadState,
} from '../src/abilities/AcidProjectileSystem.ts';
import { DissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { CameraRig } from '../src/render/CameraRig.ts';
import {
  GoopAcidPresentation,
  resolveGoopCrosshairState,
} from '../src/render/acid/GoopAcidPresentation.ts';

interface MutableAimModel {
  active: boolean;
  readonly aimOrigin: { x: number; y: number; z: number };
  readonly aimDirection: { x: number; y: number; z: number };
  readonly aimPoint: { x: number; y: number; z: number };
  readonly maximumRangeMetres: number;
  targetedSolubleId: string | undefined;
  readonly visibleSolubleIds: string[];
  canFire: boolean;
  cooldownProgress: number;
  cooldownRemainingSeconds: number;
}

interface MutableProjectileState {
  id: number;
  active: boolean;
  readonly position: { x: number; y: number; z: number };
  readonly previousPosition: { x: number; y: number; z: number };
  readonly direction: { x: number; y: number; z: number };
}

class FakeClassList {
  private readonly values = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) this.values.add(token);
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) this.values.delete(token);
  }
}

class FakeElement {
  readonly dataset: DOMStringMap = {};
  readonly classList = new FakeClassList();
  readonly children: FakeElement[] = [];
  ownerDocument: FakeDocument | null = null;
  className = '';
  hidden = false;
  isConnected = false;
  readonly offsetWidth = 32;

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.isConnected = true;
      this.children.push(child);
    }
  }

  setAttribute(): void {}

  remove(): void {
    this.isConnected = false;
  }
}

class FakeDocument {
  createElement(): FakeElement {
    const element = new FakeElement();
    element.ownerDocument = this;
    return element;
  }
}

interface Fixture {
  readonly target: DissolveTarget;
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.BoxGeometry;
  readonly material: THREE.MeshStandardMaterial;
  readonly world: CollisionWorld;
  readonly surfaces: SurfaceRegistry;
  readonly aim: MutableAimModel;
  readonly projectile: MutableProjectileState;
  readonly events: EventBus<AcidProjectileEvents>;
  readonly host: FakeElement;
  readonly scene: THREE.Scene;
  readonly rig: CameraRig;
  readonly presentation: GoopAcidPresentation;
}

function createFixture(): Fixture {
  const geometry = new THREE.BoxGeometry(2, 2, 0.4);
  const material = new THREE.MeshStandardMaterial({
    color: 0x684526,
    roughness: 0.75,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'acid-presentation-target';
  mesh.userData.surfaceTag = 'default';
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.register(mesh);
  surfaces.register(mesh);
  const target = new DissolveTarget({
    id: mesh.name,
    mesh,
    collisionWorld: world,
    surfaceRegistry: surfaces,
    dissolveDurationSeconds: 2,
    collisionDisableProgress: 0.7,
  });
  const aim: MutableAimModel = {
    active: false,
    aimOrigin: { x: 0, y: 0, z: 0 },
    aimDirection: { x: 0, y: 0, z: -1 },
    aimPoint: { x: 0, y: 0, z: -10 },
    maximumRangeMetres: 75,
    targetedSolubleId: undefined,
    visibleSolubleIds: [],
    canFire: false,
    cooldownProgress: 1,
    cooldownRemainingSeconds: 0,
  };
  const projectile: MutableProjectileState = {
    id: 0,
    active: false,
    position: { x: 0, y: 1, z: -2 },
    previousPosition: { x: 0, y: 1, z: -1.7 },
    direction: { x: 0, y: 0, z: -1 },
  };
  const events = new EventBus<AcidProjectileEvents>();
  const document = new FakeDocument();
  const host = document.createElement();
  host.isConnected = true;
  const scene = new THREE.Scene();
  const rig = new CameraRig();
  const presentation = new GoopAcidPresentation({
    host: host as unknown as HTMLElement,
    scene,
    cameraRig: rig,
    source: {
      aimReadModel: aim as AcidAimReadModel,
      projectileStates: [projectile as AcidProjectileReadState],
      events,
    },
    targets: [target],
    document: document as unknown as Document,
  });
  return {
    target,
    mesh,
    geometry,
    material,
    world,
    surfaces,
    aim,
    projectile,
    events,
    host,
    scene,
    rig,
    presentation,
  };
}

function disposeFixture(fixture: Fixture): void {
  fixture.presentation.dispose();
  fixture.target.dispose();
  fixture.geometry.dispose();
  fixture.material.dispose();
  fixture.world.clear();
  fixture.surfaces.clear();
}

test('crosshair mapping follows only the authoritative aim target and readiness', () => {
  const fixture = createFixture();
  try {
    const aim = fixture.aim as AcidAimReadModel;
    assert.equal(resolveGoopCrosshairState(aim, true), 'hidden');
    fixture.aim.active = true;
    assert.equal(resolveGoopCrosshairState(aim, true), 'neutral');
    fixture.aim.targetedSolubleId = fixture.target.id;
    assert.equal(resolveGoopCrosshairState(aim, true), 'cooldown');
    fixture.aim.canFire = true;
    assert.equal(resolveGoopCrosshairState(aim, true), 'ready');
    assert.equal(resolveGoopCrosshairState(aim, false), 'hidden');
  } finally {
    disposeFixture(fixture);
  }
});

test('candidate and selected highlights transition without changing dissolve progress', () => {
  const fixture = createFixture();
  try {
    fixture.presentation.update(1, 1 / 60, true);
    assert.equal(fixture.target.renderDiagnostics.aimHighlightStrength, 0);
    assert.equal(fixture.host.children.length, 1);

    fixture.aim.active = true;
    fixture.aim.visibleSolubleIds.push(fixture.target.id);
    fixture.aim.canFire = true;
    fixture.presentation.update(1, 0.2, true);
    assert.equal(fixture.target.renderDiagnostics.aimHighlightStrength, 0.34);
    assert.equal(fixture.target.renderDiagnostics.aimSelectedStrength, 0);
    assert.equal(fixture.presentation.getDiagnostics().crosshairState, 'neutral');

    fixture.aim.targetedSolubleId = fixture.target.id;
    fixture.presentation.update(1, 0.2, true);
    assert.equal(fixture.target.renderDiagnostics.aimHighlightStrength, 1);
    assert.equal(fixture.target.renderDiagnostics.aimSelectedStrength, 1);
    assert.equal(fixture.presentation.getDiagnostics().crosshairState, 'ready');
    assert.equal(fixture.target.progress, 0);

    fixture.target.advance(0.4);
    fixture.aim.canFire = false;
    fixture.presentation.update(1, 1 / 60, true);
    assert.equal(fixture.target.progress, 0.2);
    assert.equal(fixture.target.renderDiagnostics.dissolveAmount, 0.2);
    assert.equal(fixture.presentation.getDiagnostics().crosshairState, 'cooldown');

    fixture.aim.active = false;
    fixture.aim.visibleSolubleIds.length = 0;
    fixture.aim.targetedSolubleId = undefined;
    fixture.presentation.update(1, 0.2, true);
    assert.equal(fixture.target.renderDiagnostics.aimHighlightStrength, 0);
    assert.equal(fixture.target.renderDiagnostics.aimSelectedStrength, 0);
    assert.equal(fixture.presentation.getDiagnostics().crosshairState, 'hidden');

    fixture.presentation.reset();
    fixture.presentation.reset();
    assert.equal(fixture.host.children.length, 1);
  } finally {
    disposeFixture(fixture);
  }
});

test('authoritative projectiles, impacts, burns, and resets reconcile pooled visuals', () => {
  const fixture = createFixture();
  try {
    fixture.projectile.id = 4;
    fixture.projectile.active = true;
    fixture.presentation.update(0.5, 1 / 60, true);
    let diagnostics = fixture.presentation.getDiagnostics();
    assert.equal(diagnostics.activeProjectileCount, 1);
    assert.equal(diagnostics.activeTrailCount, 1);
    assert.equal(diagnostics.projectileSlotCount, 1);
    assert.equal(diagnostics.dropletCapacity, 48);

    fixture.events.emit('worldImpact', {
      projectileId: 4,
      objectName: 'ordinary-wall',
      point: { x: 1, y: 2, z: 3 },
    });
    fixture.projectile.active = false;
    fixture.presentation.update(1, 0, true);
    diagnostics = fixture.presentation.getDiagnostics();
    assert.equal(diagnostics.activeProjectileCount, 0);
    assert.equal(diagnostics.activeTrailCount, 0);
    assert.equal(diagnostics.activeDropletCount, 4);
    assert.equal(diagnostics.activeFlashCount, 1);

    fixture.events.emit('burnStarted', { targetId: fixture.target.id });
    fixture.events.emit('solubleImpact', {
      projectileId: 5,
      targetId: fixture.target.id,
      point: { x: 0, y: 0, z: 0 },
      burnStarted: true,
    });
    fixture.presentation.update(1, 0.1, true);
    const initialBurnStrength =
      fixture.target.renderDiagnostics.burnHighlightStrength;
    assert.ok(initialBurnStrength > 0);
    assert.equal(fixture.presentation.getDiagnostics().burningTargetCount, 1);

    fixture.events.emit('solubleImpact', {
      projectileId: 6,
      targetId: fixture.target.id,
      point: { x: 0.1, y: 0, z: 0 },
      burnStarted: false,
    });
    fixture.presentation.update(1, 0.05, true);
    assert.ok(
      fixture.target.renderDiagnostics.burnHighlightStrength <
        initialBurnStrength,
    );

    fixture.target.advance(0.44);
    fixture.presentation.update(1, 0.05, true);
    assert.equal(fixture.target.progress, 0.22);
    assert.equal(fixture.target.renderDiagnostics.burnHighlightStrength, 0);

    // Switching/idle aim does not remove an authoritative in-flight shot.
    fixture.projectile.active = true;
    fixture.aim.active = false;
    fixture.presentation.update(0.5, 1 / 60, true);
    assert.equal(fixture.presentation.getDiagnostics().activeProjectileCount, 1);

    fixture.presentation.suspend();
    assert.equal(fixture.presentation.getDiagnostics().crosshairState, 'hidden');
    assert.equal(fixture.presentation.getDiagnostics().activeDropletCount, 0);
    fixture.presentation.reset();
    diagnostics = fixture.presentation.getDiagnostics();
    assert.equal(diagnostics.activeProjectileCount, 0);
    assert.equal(diagnostics.activeDropletCount, 0);
    assert.equal(diagnostics.activeFlashCount, 0);
    assert.equal(diagnostics.burningTargetCount, 0);
    assert.equal(fixture.target.renderDiagnostics.burnHighlightStrength, 0);
  } finally {
    disposeFixture(fixture);
  }
});

test('disposal is idempotent and removes the one owned DOM element', () => {
  const fixture = createFixture();
  fixture.presentation.dispose();
  fixture.presentation.dispose();
  assert.equal(fixture.presentation.crosshairElement.isConnected, false);
  fixture.target.dispose();
  fixture.geometry.dispose();
  fixture.material.dispose();
  fixture.world.clear();
  fixture.surfaces.clear();
});
