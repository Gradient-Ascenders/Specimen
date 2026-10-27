import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BobCharacterPresentation } from '../src/render/bob/BobCharacterPresentation.ts';
import { GoopCharacterPresentation } from '../src/render/goop/GoopCharacterPresentation.ts';
import { VoltCharacterPresentation } from '../src/render/volt/VoltCharacterPresentation.ts';
import { SpecimenCharacterPresentation } from '../src/render/specimen/SpecimenCharacterPresentation.ts';
import { loadGoop } from './fixtures/GoopAssetFixture.ts';
import { loadVolt } from './fixtures/VoltAssetFixture.ts';
import { loadSpecimen } from './fixtures/SpecimenAssetFixture.ts';

async function loadBob(): Promise<THREE.Group> {
  const bytes = await readFile(new URL('../assets/characters/bob/bob-authored.glb', import.meta.url));
  return (await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
  )).scene;
}

const zero = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const idle = {
  position: zero, locomotionPosition: zero, velocity: zero, gameplayUp: up,
  locomotionPositionWorld: zero, velocityWorld: zero, movementIntentWorld: zero,
  gameplayUpWorld: up, surfaceNormalWorld: up, grounded: true, attached: false,
  chargingJump: false, jumpCharge: 0, chargeFraction: 0, landedThisStep: false,
  maximumLocomotionSpeedMetresPerSecond: 5.5,
};

test('authored characters retain the level heading after recovery and through idle interpolation', async () => {
  const bob = new BobCharacterPresentation(), goop = new GoopCharacterPresentation();
  const volt = new VoltCharacterPresentation(), specimen = new SpecimenCharacterPresentation();
  const characters = [bob, goop, volt, specimen];
  try {
    // Configure before loading, as runtimes do. Cinematic turns remain temporary.
    for (const p of characters) { p.setSpawnYaw(Math.PI); p.setYaw(-Math.PI / 2); }
    await Promise.all([bob.prepare(loadBob), goop.prepare(loadGoop), volt.prepare(loadVolt), specimen.prepare(loadSpecimen)]);
    for (const p of [bob, goop, volt]) {
      p.startDeath(zero); p.updateDeath(.2); p.finishDeath(zero);
      p.update(1 / 60, idle);
    }
    specimen.startDeath(zero); specimen.updateDeath(.2); specimen.reset();
    specimen.update(1 / 60, idle, { aimActive: false, aimDirection: zero, chargeAmount: 0 });
    for (const alpha of [0, .5, 1]) {
      for (const p of characters) p.present(alpha);
      for (const p of [bob, goop, volt]) {
        const group = p.root.getObjectByName(`player-slime-${p === bob ? 'bob' : p === goop ? 'goop' : 'volt'}-character`)!;
        const heading = new THREE.Vector3(0, 0, -1).applyQuaternion(group.quaternion);
        assert.ok(heading.z > .999, 'the first recovered frame must face the route, without a half-turn');
      }
      assert.ok(Math.abs(specimen.diagnostics.yaw - Math.PI) < 1e-6);
    }
    // A later checkpoint can choose a different route without changing other characters.
    goop.setSpawnYaw(-Math.PI / 2); goop.setYaw(0); goop.reset();
    assert.equal(goop.diagnostics.facingYawRadians, -Math.PI / 2);
    assert.equal(bob.diagnostics.facingYawRadians, Math.PI);
  } finally { for (const p of characters) p.dispose(); }
});
