import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  BobCharacterPresentation,
} from '../src/render/bob/BobCharacterPresentation.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import type { SlimeVisualState } from '../src/render/slime/SlimeVisual.ts';
import { ContainmentTeachingScene } from '../src/levels/ContainmentTeachingScene.ts';
import { DEFAULT_DEATH_BURST_DURATION_SECONDS } from '../src/systems/DeathSequence.ts';

const ASSET_URL = new URL(
  '../assets/characters/bob/bob-authored.glb',
  import.meta.url,
);

async function loadAsset(): Promise<THREE.Group> {
  const bytes = await readFile(ASSET_URL);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return (await new GLTFLoader().parseAsync(buffer, '')).scene;
}

function state(): SlimeVisualState {
  return {
    velocityWorld: new THREE.Vector3(1, 0, -2),
    surfaceNormalWorld: new THREE.Vector3(0, 1, 0),
    gameplayUpWorld: new THREE.Vector3(0, 1, 0),
    grounded: true,
    attached: false,
    jumpCharge: 0.4,
    maximumLocomotionSpeedMetresPerSecond: 5.5,
    contactCount: 1,
    contactNormalWorld: new THREE.Vector3(0, 1, 0),
    contactSpeedMetresPerSecond: 0,
    contactName: 'room-1-floor',
    contactSurfaceTag: 'default',
    landedThisStep: false,
  };
}

function getCharacter(root: THREE.Object3D): THREE.Group {
  const character = root.getObjectByName('player-slime-bob-character');
  assert.ok(character instanceof THREE.Group);
  return character;
}

function weight(bob: BobCharacterPresentation, meshName: string, pose: string): number {
  const mesh = bob.root.getObjectByName(meshName);
  assert.ok(mesh instanceof THREE.Mesh);
  assert.ok(mesh.morphTargetDictionary?.[pose] !== undefined, `missing ${pose}`);
  return mesh.morphTargetInfluences![mesh.morphTargetDictionary[pose]!]!;
}

test('authoritative charge uses authored compression and copies seats to both lenses', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  bob.update(1 / 60, { ...state(), jumpCharge: 1 });
  bob.present();
  assert.equal(weight(bob, 'Bob-Body', 'squash'), 1);
  assert.equal(weight(bob, 'Bob-Body', 'flatten'), 0);
  for (const name of ['Bob-Eye-Left', 'Bob-Eye-Right']) {
    assert.equal(weight(bob, name, 'squash'), 1);
    assert.ok(weight(bob, name, 'effort') > 0);
  }
  bob.update(1 / 60, { ...state(), jumpCharge: 0 });
  assert.equal(weight(bob, 'Bob-Body', 'squash'), 0);
  bob.dispose();
});

test('Gate 2 materials present lit cyan gel and glossy eyes without self-light or catchlights', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const character = getCharacter(bob.root);
  const body = character.getObjectByName('Bob-Body');
  const leftEye = character.getObjectByName('Bob-Eye-Left');
  const rightEye = character.getObjectByName('Bob-Eye-Right');

  assert.ok(body instanceof THREE.Mesh);
  assert.ok(leftEye instanceof THREE.Mesh);
  assert.ok(rightEye instanceof THREE.Mesh);
  assert.ok(body.material instanceof THREE.MeshPhysicalMaterial);
  assert.ok(leftEye.material instanceof THREE.MeshPhysicalMaterial);
  assert.equal(rightEye.material, leftEye.material);

  assert.equal(body.material.name, 'Bob-Gel-Body');
  assert.ok(body.material.color.g > body.material.color.r * 2);
  assert.ok(body.material.color.b > body.material.color.r * 2);
  assert.ok(body.material.transmission > 0);
  assert.ok(body.material.transmission < 0.5);
  assert.equal(body.material.emissive.getHex(), 0x000000);
  assert.equal(body.material.emissiveIntensity, 0);

  assert.equal(leftEye.material.name, 'Bob-Glossy-Eyes');
  assert.ok(leftEye.material.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.04);
  assert.ok(leftEye.material.roughness < 0.3);
  assert.equal(leftEye.material.emissive.getHex(), 0x000000);
  assert.equal(leftEye.material.emissiveIntensity, 0);

  assert.equal(character.getObjectByName('Bob-Catchlight-Left'), undefined);
  assert.equal(character.getObjectByName('Bob-Catchlight-Right'), undefined);
  assert.ok(bob.diagnostics.materials);
  assert.equal(bob.diagnostics.materials.selfLit, false);
  assert.equal(bob.diagnostics.materials.catchlightCount, 0);
  assert.ok(
    bob.diagnostics.materials.maximumSecondaryDisplacementMetres <= 0.012,
  );

  bob.dispose();
});

test('launch releases charge, hands off to airborne, and landing reconciles the visual envelope', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  bob.update(1 / 60, { ...state(), jumpCharge: 1 });
  bob.onLaunch({ directionWorld: new THREE.Vector3(0, 1, 0), speedMetresPerSecond: 8, chargeFraction: 1 });
  const flying = { ...state(), grounded: false, jumpCharge: 0 };
  bob.update(1 / 60, flying);
  assert.ok(weight(bob, 'Bob-Body', 'launch') > 0.8);
  assert.equal(weight(bob, 'Bob-Body', 'squash'), 0);
  bob.update(0.4, flying);
  assert.equal(weight(bob, 'Bob-Body', 'launch'), 0);
  assert.equal(weight(bob, 'Bob-Body', 'airborne'), 1);
  bob.onLanding(new THREE.Vector3(0, 1, 0), 8.5);
  bob.update(1 / 60, { ...state(), jumpCharge: 0 });
  assert.equal(weight(bob, 'Bob-Body', 'airborne'), 0);
  assert.ok(weight(bob, 'Bob-Body', 'flatten') > 0.5);
  assert.ok(weight(bob, 'Bob-Body', 'squash') + weight(bob, 'Bob-Body', 'flatten') <= 1);
  bob.update(1, { ...state(), jumpCharge: 0 });
  assert.equal(weight(bob, 'Bob-Body', 'flatten'), 0);
  assert.equal(weight(bob, 'Bob-Body', 'squash'), 0);
  bob.dispose();
});

test('Gate 2 secondary motion follows presentation time, ages impacts and resets cleanly', async () => {
  const loadedRoot = await loadAsset();
  const importedMaterials = new Set<THREE.Material>();
  loadedRoot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) importedMaterials.add(material);
  });
  const importedDisposalCounts = new Map<THREE.Material, number>();
  for (const material of importedMaterials) {
    importedDisposalCounts.set(material, 0);
    material.addEventListener('dispose', () => {
      importedDisposalCounts.set(
        material,
        importedDisposalCounts.get(material)! + 1,
      );
    });
  }

  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(async () => loadedRoot);
  assert.ok(
    [...importedDisposalCounts.values()].every((count) => count === 1),
  );

  bob.update(0.25, state());
  assert.equal(bob.diagnostics.materials?.elapsedTimeSeconds, 0.25);

  bob.onImpact({
    normalWorld: new THREE.Vector3(1, 0, 0),
    strength: 0.8,
    kind: 'wall',
  });
  bob.present();
  assert.equal(bob.diagnostics.materials?.impactStrength, 0.8);
  assert.equal(bob.diagnostics.materials?.impactAgeSeconds, 0);

  bob.update(0.2, state());
  bob.present();
  assert.equal(bob.diagnostics.materials?.impactAgeSeconds, 0.2);

  bob.update(1.5, state());
  bob.present();
  assert.equal(bob.diagnostics.materials?.impactAgeSeconds, 1.2);
  assert.equal(bob.diagnostics.materials?.impactStrength, 0);

  bob.reset();
  assert.equal(bob.diagnostics.materials?.elapsedTimeSeconds, 0);
  assert.equal(bob.diagnostics.materials?.impactStrength, 0);
  assert.equal(bob.diagnostics.materials?.impactAgeSeconds, 1.2);

  bob.dispose();
});

test('damage and rupture own Stress exclusively, then clear on recovery and disposal', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  bob.onDamage(0.8);
  bob.update(1 / 60, { ...state(), jumpCharge: 1 });
  assert.ok(weight(bob, 'Bob-Body', 'stress') > 0.6);
  assert.equal(weight(bob, 'Bob-Body', 'squash'), 0);
  assert.ok(weight(bob, 'Bob-Eye-Left', 'stress-expression') > 0);
  bob.startDeath(new THREE.Vector3());
  bob.updateDeath(0.04);
  assert.ok(weight(bob, 'Bob-Body', 'stress') > 0);
  assert.deepEqual(getCharacter(bob.root).scale.toArray(), [1, 1, 1]);
  assert.equal(bob.root.getObjectByName('player-slime-death-burst')!.visible, false);
  bob.update(0.1, state());
  bob.onLaunch({ directionWorld: new THREE.Vector3(0, 1, 0), speedMetresPerSecond: 8, chargeFraction: 1 });
  assert.equal(weight(bob, 'Bob-Body', 'launch'), 0);
  bob.updateDeath(0.04);
  assert.equal(bob.diagnostics.visible, false);
  assert.equal(bob.root.getObjectByName('player-slime-death-burst')!.visible, true);
  bob.finishDeath(new THREE.Vector3());
  for (const meshName of ['Bob-Body', 'Bob-Eye-Left', 'Bob-Eye-Right']) {
    const mesh = bob.root.getObjectByName(meshName) as THREE.Mesh;
    assert.ok(mesh.morphTargetInfluences!.every(value => value === 0));
  }
  bob.onDamage(1);
  const mesh = bob.root.getObjectByName('Bob-Body') as THREE.Mesh;
  bob.dispose();
  assert.ok(mesh.morphTargetInfluences!.every(value => value === 0));
  assert.equal(bob.startDeath(new THREE.Vector3()), false);
});

test('independent expressions are bounded during flattening and reset without changing eye seats', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  bob.setExpression('blink', 1);
  bob.onLanding(new THREE.Vector3(0, 1, 0), 8.5);
  bob.update(0, { ...state(), jumpCharge: 0 });
  for (const eye of ['Bob-Eye-Left', 'Bob-Eye-Right']) {
    assert.equal(weight(bob, eye, 'flatten'), 1);
    assert.ok(weight(bob, eye, 'blink') > 0);
    assert.ok(weight(bob, eye, 'blink') <= 0.45);
  }
  bob.reset();
  bob.update(0, { ...state(), jumpCharge: 0 });
  assert.equal(weight(bob, 'Bob-Eye-Left', 'blink'), 0);
  bob.dispose();
});

test('supported reaction and expression blends keep both lenses on the body surface', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const body = bob.root.getObjectByName('Bob-Body') as THREE.Mesh;
  const point = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const direction = new THREE.Vector3(0, 0, 1);
  for (const reaction of [0, 0.5, 1, 1.5, 2, 'launch', 'airborne', 'damage'] as const) {
    for (const expression of ['blink', 'effort', 'surprise', 'stress-expression', 'all'] as const) {
      for (const amount of [0.25, 0.5, 1]) {
        bob.reset();
        if (typeof reaction === 'number') {
          bob.onLanding(new THREE.Vector3(0, 1, 0), 1.5 + reaction * 3.5);
          bob.update(0, { ...state(), jumpCharge: 0 });
        } else if (reaction === 'damage') {
          bob.onDamage(1);
          bob.update(0, { ...state(), jumpCharge: 0 });
        } else {
          if (reaction === 'launch') bob.onLaunch({ directionWorld: direction, speedMetresPerSecond: 8, chargeFraction: 1 });
          bob.update(0, { ...state(), grounded: false, jumpCharge: 0 });
        }
        if (expression === 'all') {
          for (const name of ['blink', 'effort', 'surprise', 'stress-expression'] as const) bob.setExpression(name, amount);
        } else {
          bob.setExpression(expression, amount);
        }
        bob.root.updateMatrixWorld(true);
        for (const name of ['Bob-Eye-Left', 'Bob-Eye-Right']) {
          const eye = bob.root.getObjectByName(name) as THREE.Mesh;
          for (let vertex = 0; vertex < eye.geometry.getAttribute('position').count; vertex++) {
            eye.getVertexPosition(vertex, point);
            origin.set(point.x, point.y, -2);
            ray.set(origin, direction);
            const hit = ray.intersectObject(body, false)[0];
            assert.ok(hit, `${name} detached at ${reaction}/${expression}/${amount}`);
            const gap = hit.point.z - point.z;
            assert.ok(gap >= -0.002 && gap <= 0.055,
              `${name} seat gap ${gap} at ${reaction}/${expression}/${amount}`);
          }
        }
      }
    }
  }
  bob.dispose();
});

test('Gate 2 eye fade invalidates the material program only when transparency changes', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const eye = getCharacter(bob.root).getObjectByName('Bob-Eye-Left');
  assert.ok(eye instanceof THREE.Mesh);
  assert.ok(eye.material instanceof THREE.MeshPhysicalMaterial);

  const initialVersion = eye.material.version;
  bob.setOpacity(0.35);
  assert.equal(eye.material.transparent, true);
  assert.equal(eye.material.version, initialVersion + 1);

  bob.setOpacity(0.2);
  assert.equal(eye.material.version, initialVersion + 1);

  bob.setOpacity(1);
  assert.equal(eye.material.transparent, false);
  assert.equal(eye.material.version, initialVersion + 2);

  bob.dispose();
});

test('neutral Bob presentation loads, follows authoritative transforms, fades, resets and disposes', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const character = getCharacter(bob.root);

  assert.equal(bob.ready, true);
  assert.ok(character.getObjectByName('Bob-Body'));

  const source = state();
  const sourceSnapshot = JSON.stringify(source);
  bob.setPosition(new THREE.Vector3(2, 3, 4));
  bob.setYaw(Math.PI / 3);
  bob.setOpacity(0.35);
  bob.update(1 / 60, source);
  bob.present();

  assert.deepEqual(character.position.toArray(), [2, 3, 4]);
  assert.equal(character.rotation.y, Math.PI / 3);
  assert.equal(JSON.stringify(source), sourceSnapshot);
  character.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      assert.equal(material.opacity, 0.35);
      assert.equal(material.transparent, true);
    }
  });

  bob.setVisible(false);
  bob.reset();
  assert.equal(character.visible, true);
  assert.equal(bob.diagnostics.speed, 0);
  assert.equal(bob.diagnostics.jumpCharge, 0);
  character.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      assert.equal((object.material as THREE.Material).opacity, 1);
    }
  });

  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  const disposalCounts = new Map<
    THREE.BufferGeometry | THREE.Material,
    number
  >();
  bob.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) resources.add(material);
  });
  for (const resource of resources) {
    disposalCounts.set(resource, 0);
    resource.addEventListener('dispose', () => {
      disposalCounts.set(resource, disposalCounts.get(resource)! + 1);
    });
  }

  bob.dispose();
  bob.dispose();
  assert.equal(bob.ready, false);
  assert.equal(bob.root.children.length, 0);
  assert.ok([...disposalCounts.values()].every((count) => count === 1));
});

test('Bob presentation owns visibility, death hooks and combined diagnostics', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);

  bob.setVisible(false);
  assert.equal(bob.diagnostics.visible, false);
  bob.setVisible(true);

  const deathPosition = new THREE.Vector3(4, 2, -3);
  assert.equal(bob.startDeath(deathPosition), true);
  assert.equal(bob.diagnostics.deathBurst.active, true);
  assert.deepEqual(bob.diagnostics.deathBurst.origin.toArray(), [4, 2, -3]);
  assert.equal(bob.diagnostics.visible, true);

  bob.updateDeath(0.08);
  assert.equal(bob.diagnostics.visible, false);

  const recoveryPosition = new THREE.Vector3(-1, 0.45, 6);
  bob.finishDeath(recoveryPosition);
  assert.equal(bob.diagnostics.visible, true);
  assert.equal(bob.diagnostics.deathBurst.active, false);
  assert.deepEqual(bob.root.position.toArray(), [0, 0, 0]);
  assert.deepEqual(
    bob.root.getObjectByName('player-slime-bob-character')?.position.toArray(),
    [-1, 0.45, 6],
  );

  bob.dispose();
});

test('death burst waits at frame zero until Stress anticipation finishes', () => {
  const bob = new BobCharacterPresentation(0.45);

  assert.equal(bob.startDeath(new THREE.Vector3(4, 2, -3)), true);
  assert.equal(bob.diagnostics.deathBurst.elapsedSeconds, 0);

  bob.updateDeath(0.074);
  assert.equal(bob.diagnostics.deathBurst.elapsedSeconds, 0);

  bob.updateDeath(0.001);
  assert.equal(bob.diagnostics.deathBurst.elapsedSeconds, 0);
  assert.equal(
    bob.root.getObjectByName('player-slime-death-burst')!.visible,
    true,
  );

  bob.updateDeath(0.01);
  assert.ok(
    Math.abs(bob.diagnostics.deathBurst.elapsedSeconds - 0.01) < 1e-12,
  );

  bob.dispose();
});

test('finished death ignores a late presentation update', () => {
  const bob = new BobCharacterPresentation(0.45);
  const deathPosition = new THREE.Vector3(4, 2, -3);
  const recoveryPosition = new THREE.Vector3(-1, 0.45, 6);

  assert.equal(bob.startDeath(deathPosition), true);
  bob.finishDeath(recoveryPosition);
  bob.updateDeath(0.08);

  assert.equal(bob.diagnostics.visible, true);
  assert.equal(bob.diagnostics.deathBurst.active, false);
  assert.deepEqual(getCharacter(bob.root).position.toArray(), [-1, 0.45, 6]);

  bob.dispose();
});

test('neutral reset ignores a late death presentation update', () => {
  const bob = new BobCharacterPresentation(0.45);

  assert.equal(bob.startDeath(new THREE.Vector3(4, 2, -3)), true);
  bob.reset();
  bob.updateDeath(0.08);

  assert.equal(bob.diagnostics.visible, true);
  assert.equal(bob.diagnostics.deathBurst.active, false);

  bob.dispose();
});

test('death cannot restart after the burst expires before recovery', () => {
  const bob = new BobCharacterPresentation(0.45);
  const deathPosition = new THREE.Vector3(4, 2, -3);

  assert.equal(bob.startDeath(deathPosition), true);
  bob.updateDeath(0.075 + DEFAULT_DEATH_BURST_DURATION_SECONDS);
  assert.equal(bob.diagnostics.deathBurst.active, false);

  assert.equal(bob.startDeath(new THREE.Vector3(20, 10, 5)), false);
  assert.deepEqual(bob.diagnostics.deathBurst.origin.toArray(), [4, 2, -3]);
  assert.equal(bob.diagnostics.visible, false);

  bob.dispose();
});

test('Level 1 owns one shared Bob presentation without changing authoritative input', async () => {
  const art = new ContainmentArtResources();
  const scene = new ContainmentTeachingScene(art);
  await scene.bob.prepare(loadAsset);

  const bobOwners: THREE.Object3D[] = [];
  scene.root.traverse((object) => {
    if (object.name.startsWith('player-slime-')) bobOwners.push(object);
  });
  assert.equal(scene.bob.ready, true);
  assert.equal(scene.bob.root.parent, scene.root);
  assert.equal(
    bobOwners.filter((object) => object.name === 'player-slime-bob-character')
      .length,
    1,
  );
  assert.equal(
    bobOwners.some((object) =>
      object.name.startsWith('player-slime-visual-radius'),
    ),
    false,
  );

  const authoritativeState = state();
  const snapshot = JSON.stringify(authoritativeState);
  scene.bob.update(1 / 60, authoritativeState);
  scene.bob.present();
  assert.equal(JSON.stringify(authoritativeState), snapshot);

  scene.dispose();
  art.dispose();
});
