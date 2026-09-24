import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  BobCharacterPresentation,
  type BobCharacterPresentationState,
} from '../src/render/bob/BobCharacterPresentation.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
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

function state(
  locomotionPositionWorld = new THREE.Vector3(),
  velocityWorld = new THREE.Vector3(1, 0, -2),
): BobCharacterPresentationState {
  return {
    locomotionPositionWorld,
    velocityWorld,
    movementIntentWorld: new THREE.Vector3(),
    surfaceNormalWorld: new THREE.Vector3(0, 1, 0),
    gameplayUpWorld: new THREE.Vector3(0, 1, 0),
    grounded: true,
    attached: false,
    chargingJump: false,
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

function wallClearance(bob: BobCharacterPresentation, normal: THREE.Vector3): number {
  bob.root.updateMatrixWorld(true);
  const body = bob.root.getObjectByName('Bob-Body') as THREE.Mesh;
  const positions = body.geometry.getAttribute('position');
  const morphs = body.geometry.morphAttributes.position;
  const point = new THREE.Vector3();
  let minimum = Infinity;
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    for (let pose = 0; pose < morphs.length; pose += 1) {
      point.addScaledVector(
        new THREE.Vector3().fromBufferAttribute(morphs[pose]!, index),
        body.morphTargetInfluences![pose]!,
      );
    }
    point.applyMatrix4(body.matrixWorld);
    minimum = Math.min(minimum, point.dot(normal));
  }
  return minimum;
}

test('wall transition keeps the authored body in front of the support plane', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const normal = new THREE.Vector3(1, 0, 0);
  const wall = {
    ...state(new THREE.Vector3(0.45, 0, 0), new THREE.Vector3(0, 2, 0)),
    grounded: true,
    attached: true,
    surfaceNormalWorld: normal,
    jumpCharge: 0,
  };
  bob.setPosition(new THREE.Vector3(0.45, 0, 0));
  bob.update(0, { ...state(), jumpCharge: 0 });
  let minimum = Infinity;
  for (let step = 0; step < 40; step += 1) {
    bob.update(1 / 60, wall);
    bob.present();
    minimum = Math.min(minimum, wallClearance(bob, normal));
  }
  assert.ok(minimum >= -0.01, `body entered wall by ${-minimum} m`);
  bob.dispose();
});

test('floor-to-wall attachment keeps Bob visually continuous while rotating', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const position = new THREE.Vector3(0.45, 0.45, 0);
  bob.setPosition(position);
  bob.setYaw(-Math.PI / 2);
  const floor = {
    ...state(position, new THREE.Vector3(1, 0, 0)),
    movementIntentWorld: new THREE.Vector3(1, 0, 0),
    jumpCharge: 0,
  };
  bob.update(1 / 60, floor);
  bob.present();
  const character = getCharacter(bob.root);
  let priorPosition = character.position.clone();
  let priorRotation = character.quaternion.clone();
  let greatestPositionStep = 0;
  let greatestRotationStep = 0;
  let minimumFloorClearance = Infinity;
  const wall = {
    ...floor,
    attached: true,
    surfaceNormalWorld: new THREE.Vector3(1, 0, 0),
    gameplayUpWorld: new THREE.Vector3(1, 0, 0),
  };
  for (let step = 0; step < 40; step += 1) {
    bob.update(1 / 60, wall);
    bob.present();
    assert.ok(wallClearance(bob, wall.surfaceNormalWorld) >= -0.01);
    greatestPositionStep = Math.max(greatestPositionStep,
      character.position.distanceTo(priorPosition));
    greatestRotationStep = Math.max(greatestRotationStep,
      character.quaternion.angleTo(priorRotation));
    priorPosition.copy(character.position);
    priorRotation.copy(character.quaternion);
  }
  for (let step = 0; step < 40; step += 1) {
    bob.update(1 / 60, floor);
    bob.present();
    minimumFloorClearance = Math.min(minimumFloorClearance,
      wallClearance(bob, floor.surfaceNormalWorld));
    greatestPositionStep = Math.max(greatestPositionStep,
      character.position.distanceTo(priorPosition));
    greatestRotationStep = Math.max(greatestRotationStep,
      character.quaternion.angleTo(priorRotation));
    priorPosition.copy(character.position);
    priorRotation.copy(character.quaternion);
  }
  assert.ok(greatestPositionStep < 0.045,
    `visible body moved ${greatestPositionStep.toFixed(3)} m in one frame`);
  assert.ok(greatestRotationStep < THREE.MathUtils.degToRad(7),
    `visible body turned ${THREE.MathUtils.radToDeg(greatestRotationStep).toFixed(1)} degrees in one frame`);
  assert.ok(minimumFloorClearance >= -0.03,
    `body penetrated the floor by ${-minimumFloorClearance.toFixed(3)} m`);
  bob.dispose();
});

test('stationary wall facing stays stable after upward motion', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const wall = {
    ...state(new THREE.Vector3(0.45, 0, 0), new THREE.Vector3(0, 2, 0)),
    grounded: true,
    attached: true,
    surfaceNormalWorld: new THREE.Vector3(1, 0, 0),
    jumpCharge: 0,
  };
  for (let step = 0; step < 40; step += 1) bob.update(1 / 60, wall);
  bob.present();
  const character = getCharacter(bob.root);
  const movingForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(character.quaternion);
  assert.ok(movingForward.y > 0.9);
  for (let step = 0; step < 40; step += 1) {
    bob.update(1 / 60, { ...wall, velocityWorld: new THREE.Vector3() });
  }
  bob.present();
  const idleForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(character.quaternion);
  assert.ok(idleForward.dot(movingForward) > 0.95,
    `idle wall heading changed to ${idleForward.toArray()}`);
  bob.dispose();
});

test('wall facing follows player intent even without resolved movement, then holds', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const wall = {
    ...state(new THREE.Vector3(0, 0, -0.45), new THREE.Vector3()),
    grounded: true,
    attached: true,
    surfaceNormalWorld: new THREE.Vector3(0, 0, -1),
    jumpCharge: 0,
  };
  for (let step = 0; step < 30; step += 1) bob.update(1 / 60, wall);
  bob.present();
  const character = getCharacter(bob.root);
  const initialForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(character.quaternion);
  assert.ok(initialForward.y > 0.95, 'uncommanded wall attachment faces up');

  const intended = new THREE.Vector3(1, 0, 0);
  for (let step = 0; step < 30; step += 1) {
    bob.update(1 / 60, { ...wall, movementIntentWorld: intended });
  }
  bob.present();
  const commandedForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(character.quaternion);
  assert.ok(commandedForward.dot(intended) > 0.95);

  for (let step = 0; step < 30; step += 1) bob.update(1 / 60, wall);
  bob.present();
  const idleForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(character.quaternion);
  assert.ok(idleForward.dot(intended) > 0.95);
  bob.dispose();
});

test('wall reversal counterleans through Neutral before the frame turns', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const position = new THREE.Vector3();
  const wallNormal = new THREE.Vector3(1, 0, 0);
  const upward = new THREE.Vector3(0, 5.5, 0);
  const downward = upward.clone().negate();
  const wall = {
    ...state(position, upward),
    grounded: false,
    attached: true,
    surfaceNormalWorld: wallNormal,
    gameplayUpWorld: wallNormal,
    movementIntentWorld: upward.clone().normalize(),
    jumpCharge: 0,
  };
  bob.update(0, wall);
  for (let step = 0; step < 45; step += 1) {
    position.addScaledVector(upward, 1 / 60);
    bob.update(1 / 60, wall);
  }
  bob.present();
  const character = getCharacter(bob.root);
  const originalFrame = character.quaternion.clone();
  assert.ok(weight(bob, 'Bob-Body', 'move-forward') > 0.9);

  let crossedNeutral = false;
  let greatestTurnStep = 0;
  let previousFrame = originalFrame.clone();
  for (let step = 0; step < 60; step += 1) {
    position.addScaledVector(downward, 1 / 60);
    bob.update(1 / 60, {
      ...wall,
      velocityWorld: downward,
      movementIntentWorld: downward.clone().normalize(),
    });
    bob.present();
    const signedLean = weight(bob, 'Bob-Body', 'move-forward') -
      weight(bob, 'Bob-Body', 'move-reverse');
    if (!crossedNeutral && signedLean <= 0) crossedNeutral = true;
    if (!crossedNeutral) {
      assert.ok(character.quaternion.angleTo(originalFrame) < 1e-6,
        'wall frame turned before the directional lean crossed Neutral');
    }
    greatestTurnStep = Math.max(
      greatestTurnStep,
      character.quaternion.angleTo(previousFrame),
    );
    previousFrame = character.quaternion.clone();
  }

  const finalForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(character.quaternion);
  assert.ok(crossedNeutral, 'wall reversal never crossed Neutral');
  assert.ok(finalForward.dot(downward.clone().normalize()) > 0.99,
    'wall presentation did not finish facing reversed travel');
  assert.ok(weight(bob, 'Bob-Body', 'move-forward') > 0.9,
    'directional lean did not follow the reversed wall frame');
  assert.ok(greatestTurnStep <= THREE.MathUtils.degToRad(6.01),
    'wall reversal exceeded the support-frame turn bound');
  bob.dispose();
});

test('resolved supported travel holds a directional lean without a gait cycle', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const position = new THREE.Vector3(0, 0.45, 0);
  const velocity = new THREE.Vector3(0, 0, -5.5);
  bob.update(0, { ...state(position, velocity), jumpCharge: 0 });
  assert.equal(weight(bob, 'Bob-Body', 'move-forward'), 0);
  for (let step = 0; step < 60; step += 1) {
    position.addScaledVector(velocity, 1 / 60);
    bob.update(1 / 60, { ...state(position, velocity), jumpCharge: 0 });
  }
  const held = weight(bob, 'Bob-Body', 'move-forward');
  assert.ok(held > 0.99);
  assert.equal(weight(bob, 'Bob-Body', 'move-reverse'), 0);
  assert.equal(bob.diagnostics.locomotionPhase, 0);
  position.addScaledVector(velocity, 1 / 60);
  bob.update(1 / 60, { ...state(position, velocity), jumpCharge: 0 });
  assert.ok(Math.abs(weight(bob, 'Bob-Body', 'move-forward') - held) < 0.001);
  for (const eye of ['Bob-Eye-Left', 'Bob-Eye-Right']) {
    assert.equal(weight(bob, eye, 'move-forward'), weight(bob, 'Bob-Body', 'move-forward'));
  }
  bob.dispose();
});

test('presentation aligns to wall support, holds launch frame and recovers upright', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const wall = {
    ...state(new THREE.Vector3(), new THREE.Vector3(0, 2, 0)),
    grounded: false,
    attached: true,
    surfaceNormalWorld: new THREE.Vector3(1, 0, 0),
    jumpCharge: 0,
  };
  const up = new THREE.Vector3(0, 1, 0);
  bob.update(0.3, wall);
  bob.update(0.3, { ...wall, locomotionPositionWorld: new THREE.Vector3(0, 0.6, 0) });
  bob.present();
  assert.ok(up.clone().applyQuaternion(getCharacter(bob.root).quaternion)
    .distanceTo(wall.surfaceNormalWorld) < 1e-5);
  assert.ok(weight(bob, 'Bob-Body', 'move-forward') > 0);

  bob.onLaunch({ directionWorld: new THREE.Vector3(1, 0, 0),
    speedMetresPerSecond: 8, chargeFraction: 1 });
  bob.update(0.05, { ...wall, attached: false });
  bob.present();
  assert.ok(up.clone().applyQuaternion(getCharacter(bob.root).quaternion)
    .distanceTo(wall.surfaceNormalWorld) < 1e-5);
  assert.equal(weight(bob, 'Bob-Body', 'move-forward'), 0);

  bob.update(0.3, { ...wall, attached: false });
  bob.update(0.3, { ...wall, attached: false });
  bob.present();
  assert.ok(up.clone().applyQuaternion(getCharacter(bob.root).quaternion)
    .distanceTo(up) < 1e-5);
  bob.reset();
  assert.ok(getCharacter(bob.root).quaternion.angleTo(new THREE.Quaternion()) < 1e-5);
  bob.dispose();
});

test('wall-jump recovery preserves heading without velocity-driven twist', async () => {
  const bobs = [
    new BobCharacterPresentation(0.45),
    new BobCharacterPresentation(0.45),
  ] as const;
  await Promise.all(bobs.map((bob) => bob.prepare(loadAsset)));
  const wallNormal = new THREE.Vector3(1, 0, 0);
  const gameplayUp = new THREE.Vector3(0, 1, 0);
  const wall = {
    ...state(new THREE.Vector3(), new THREE.Vector3(0, 4, 0)),
    grounded: false,
    attached: true,
    surfaceNormalWorld: wallNormal,
    gameplayUpWorld: gameplayUp,
    movementIntentWorld: new THREE.Vector3(0, 1, 0),
    jumpCharge: 1,
  };
  for (const bob of bobs) {
    for (let step = 0; step < 30; step += 1) bob.update(1 / 60, wall);
    bob.present();
    bob.onLaunch({
      directionWorld: wallNormal,
      speedMetresPerSecond: 8,
      chargeFraction: 1,
    });
  }

  const characters = bobs.map((bob) => getCharacter(bob.root));
  assert.ok(characters[0].quaternion.angleTo(characters[1].quaternion) < 1e-6,
    'wall-aligned setup produced different presentation frames');
  const takeoffQuaternion = characters[0].quaternion.clone();
  const previousUp = wallNormal.clone();
  const previousForward = new THREE.Vector3(0, 1, 0);
  const previousQuaternion = characters[0].quaternion.clone();
  const swing = new THREE.Quaternion();
  const currentUp = new THREE.Vector3();
  const currentForward = new THREE.Vector3();
  const transportedForward = new THREE.Vector3();
  let recoveryStarted = false;

  for (let step = 0; step < 60; step += 1) {
    const velocities = [
      new THREE.Vector3(8, 3, 5),
      new THREE.Vector3(-4, -7, 2),
    ] as const;
    for (let index = 0; index < bobs.length; index += 1) {
      bobs[index].update(1 / 60, {
        ...wall,
        attached: false,
        jumpCharge: 0,
        velocityWorld: velocities[index],
      });
      bobs[index].present();
    }

    const velocityFrameDifference = characters[0].quaternion
      .angleTo(characters[1].quaternion);
    assert.ok(velocityFrameDifference < 1e-6,
      `airborne velocity changed Bob's orientation by ${velocityFrameDifference}`);
    const recoveryStepRadians = previousQuaternion.angleTo(
      characters[0].quaternion,
    );
    assert.ok(recoveryStepRadians <= THREE.MathUtils.degToRad(6.01),
      `airborne recovery turned ${THREE.MathUtils.radToDeg(recoveryStepRadians)} degrees`);

    currentUp.copy(THREE.Object3D.DEFAULT_UP)
      .applyQuaternion(characters[0].quaternion);
    currentForward.copy(new THREE.Vector3(0, 0, -1))
      .applyQuaternion(characters[0].quaternion);
    if (currentUp.distanceTo(previousUp) > 1e-6) {
      recoveryStarted = true;
      swing.setFromUnitVectors(previousUp, currentUp);
      transportedForward.copy(previousForward).applyQuaternion(swing);
      assert.ok(currentForward.dot(transportedForward) > 0.9999,
        'upright recovery introduced twist around Bob\'s local up');
    } else if (!recoveryStarted) {
      assert.ok(currentUp.distanceTo(wallNormal) < 1e-6,
        'launch did not retain the wall-aligned takeoff frame');
      assert.ok(characters[0].quaternion.angleTo(takeoffQuaternion) < 1e-6,
        'launch twisted away from the wall-aligned takeoff heading');
    }
    previousUp.copy(currentUp);
    previousForward.copy(currentForward);
    previousQuaternion.copy(characters[0].quaternion);
  }

  assert.ok(recoveryStarted, 'wall-jump frame never began upright recovery');
  assert.ok(currentUp.distanceTo(gameplayUp) < 1e-5,
    'wall-jump frame did not recover to authoritative gameplay up');
  for (const bob of bobs) bob.dispose();
});

test('wall jump charge preserves the facing Bob had before charging', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const position = new THREE.Vector3();
  const wallNormal = new THREE.Vector3(1, 0, 0);
  const chosenFacing = new THREE.Vector3(0, 0, 1);
  const wall = {
    ...state(position, chosenFacing.clone().multiplyScalar(5.5)),
    grounded: false,
    attached: true,
    surfaceNormalWorld: wallNormal,
    gameplayUpWorld: wallNormal,
    movementIntentWorld: chosenFacing,
    jumpCharge: 0,
  };

  for (let step = 0; step < 30; step += 1) {
    position.addScaledVector(chosenFacing, 5.5 / 60);
    bob.update(1 / 60, wall);
  }
  bob.present();
  const character = getCharacter(bob.root);
  const facingBeforeCharge = character.quaternion.clone();
  const forwardBeforeCharge = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(facingBeforeCharge);
  assert.ok(forwardBeforeCharge.dot(chosenFacing) > 0.99);

  // Input can still be held while Space charges. That must not turn Bob away
  // from the direction he had when the charge started.
  bob.update(1 / 60, {
    ...wall,
    velocityWorld: new THREE.Vector3(),
    movementIntentWorld: new THREE.Vector3(0, 1, 0),
    chargingJump: true,
    jumpCharge: 0,
  });
  bob.present();
  assert.ok(character.quaternion.angleTo(facingBeforeCharge) < 1e-6,
    'the zero-progress charge step changed Bob\'s wall facing');
  for (let step = 0; step < 30; step += 1) {
    bob.update(1 / 60, {
      ...wall,
      velocityWorld: new THREE.Vector3(),
      movementIntentWorld: new THREE.Vector3(0, 1, 0),
      chargingJump: true,
      jumpCharge: (step + 1) / 30,
    });
  }
  bob.present();
  assert.ok(character.quaternion.angleTo(facingBeforeCharge) < 1e-6,
    'charging turned Bob away from his pre-jump wall facing');

  bob.onLaunch({
    directionWorld: wallNormal,
    speedMetresPerSecond: 8,
    chargeFraction: 1,
  });
  bob.update(1 / 60, {
    ...wall,
    grounded: false,
    attached: false,
    chargingJump: false,
    velocityWorld: wallNormal.clone().multiplyScalar(8),
    movementIntentWorld: new THREE.Vector3(0, 1, 0),
    jumpCharge: 0,
  });
  bob.present();
  assert.ok(character.quaternion.angleTo(facingBeforeCharge) < 1e-6,
    'takeoff did not retain the pre-charge wall facing');
  bob.dispose();
});

test('stationary wall jump charge keeps Bob in contact with the wall', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const position = new THREE.Vector3(0.45, 0, 0);
  const wallNormal = new THREE.Vector3(1, 0, 0);
  const wall = {
    ...state(position, new THREE.Vector3()),
    grounded: false,
    attached: true,
    surfaceNormalWorld: wallNormal,
    gameplayUpWorld: wallNormal,
    jumpCharge: 0,
  };
  bob.setPosition(position);
  bob.update(0.3, wall);
  bob.present();
  for (let step = 0; step < 30; step += 1) {
    bob.update(1 / 60, {
      ...wall,
      chargingJump: true,
      jumpCharge: (step + 1) / 30,
    });
    bob.present();
    const clearance = wallClearance(bob, wallNormal);
    assert.ok(clearance >= -0.01,
      `charging body entered wall by ${-clearance.toFixed(3)} m`);
    assert.ok(clearance <= 0.015,
      `charging body floated ${clearance.toFixed(3)} m above wall`);
  }

  bob.dispose();
});

test('instant wall jump preserves the last displayed side and backward headings', async () => {
  const wallNormal = new THREE.Vector3(0, 0, -1);
  const headings = [
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, -1, 0),
  ];

  for (const heading of headings) {
    const bob = new BobCharacterPresentation(0.45);
    await bob.prepare(loadAsset);
    const wall = {
      ...state(new THREE.Vector3(), heading.clone().multiplyScalar(5.5)),
      grounded: false,
      attached: true,
      surfaceNormalWorld: wallNormal,
      gameplayUpWorld: wallNormal,
      movementIntentWorld: heading,
      jumpCharge: 0,
    };

    for (let step = 0; step < 30; step += 1) bob.update(1 / 60, wall);
    bob.present();
    const character = getCharacter(bob.root);
    const displayedBeforeJump = character.quaternion.clone();
    assert.ok(new THREE.Vector3(0, 0, -1)
      .applyQuaternion(displayedBeforeJump).dot(heading) > 0.99);

    // A press and release can arrive in one fixed step, so presentation never
    // observes chargingJump. Any queued support-frame work must not replace the
    // heading that was actually visible when the launch event arrived.
    for (let step = 0; step < 4; step += 1) {
      bob.update(1 / 60, {
        ...wall,
        movementIntentWorld: new THREE.Vector3(0, 1, 0),
      });
    }
    bob.onLaunch({
      directionWorld: wallNormal,
      speedMetresPerSecond: 8,
      chargeFraction: 0,
    });
    bob.update(1 / 60, {
      ...wall,
      grounded: false,
      attached: false,
      velocityWorld: wallNormal.clone().multiplyScalar(8),
      movementIntentWorld: new THREE.Vector3(),
    });
    bob.present();

    assert.ok(character.quaternion.angleTo(displayedBeforeJump) < 1e-6,
      `instant wall takeoff replaced heading ${heading.toArray()}`);
    bob.dispose();
  }
});

test('landing after a wall jump preserves the recovered wall heading', async () => {
  const wallNormal = new THREE.Vector3(0, 0, -1);
  const worldUp = new THREE.Vector3(0, 1, 0);
  const headings = [
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, -1, 0),
  ];

  for (const heading of headings) {
    const bob = new BobCharacterPresentation(0.45);
    await bob.prepare(loadAsset);
    const wall = {
      ...state(new THREE.Vector3(), heading.clone().multiplyScalar(5.5)),
      grounded: false,
      attached: true,
      surfaceNormalWorld: wallNormal,
      gameplayUpWorld: wallNormal,
      movementIntentWorld: heading,
      jumpCharge: 0,
    };
    for (let step = 0; step < 30; step += 1) bob.update(1 / 60, wall);
    bob.present();
    bob.onLaunch({
      directionWorld: wallNormal,
      speedMetresPerSecond: 8,
      chargeFraction: 0,
    });

    for (let step = 0; step < 90; step += 1) {
      bob.update(1 / 60, {
        ...wall,
        grounded: false,
        attached: false,
        movementIntentWorld: new THREE.Vector3(),
        jumpCharge: 0,
      });
    }
    for (let step = 0; step < 30; step += 1) {
      bob.update(1 / 60, {
        ...wall,
        grounded: false,
        attached: false,
        gameplayUpWorld: worldUp,
        movementIntentWorld: new THREE.Vector3(),
        jumpCharge: 0,
      });
    }
    bob.present();
    const character = getCharacter(bob.root);
    const recoveredHeading = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(character.quaternion);
    assert.ok(Math.abs(recoveredHeading.dot(worldUp)) < 1e-6);

    for (let step = 0; step < 30; step += 1) {
      bob.update(1 / 60, {
        ...wall,
        grounded: true,
        attached: false,
        surfaceNormalWorld: worldUp,
        gameplayUpWorld: worldUp,
        velocityWorld: new THREE.Vector3(),
        movementIntentWorld: new THREE.Vector3(),
        jumpCharge: 0,
      });
    }
    bob.present();
    const landedHeading = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(character.quaternion);
    assert.ok(landedHeading.dot(recoveredHeading) > 0.9999,
      `landing changed ${recoveredHeading.toArray()} to ${landedHeading.toArray()}`);
    bob.dispose();
  }
});

test('reattaching after a wall jump preserves the last wall heading', async () => {
  const wallNormal = new THREE.Vector3(0, 0, -1);
  const headings = [
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, -1, 0),
  ];

  for (const heading of headings) {
    const bob = new BobCharacterPresentation(0.45);
    await bob.prepare(loadAsset);
    const wall = {
      ...state(new THREE.Vector3(), heading.clone().multiplyScalar(5.5)),
      grounded: true,
      attached: true,
      surfaceNormalWorld: wallNormal,
      gameplayUpWorld: wallNormal,
      movementIntentWorld: heading,
      jumpCharge: 0,
    };
    for (let step = 0; step < 30; step += 1) bob.update(1 / 60, wall);
    bob.present();
    const character = getCharacter(bob.root);
    const displayedBeforeJump = character.quaternion.clone();
    bob.onLaunch({
      directionWorld: wallNormal,
      speedMetresPerSecond: 8,
      chargeFraction: 0,
    });

    for (let step = 0; step < 30; step += 1) {
      bob.update(1 / 60, {
        ...wall,
        grounded: false,
        attached: false,
        velocityWorld: wallNormal.clone().multiplyScalar(2),
        movementIntentWorld: new THREE.Vector3(),
      });
    }
    for (let step = 0; step < 30; step += 1) {
      bob.update(1 / 60, {
        ...wall,
        velocityWorld: new THREE.Vector3(),
        movementIntentWorld: new THREE.Vector3(),
      });
    }
    bob.present();

    assert.ok(character.quaternion.angleTo(displayedBeforeJump) < 1e-6,
      `wall reattachment replaced heading ${heading.toArray()}`);
    bob.dispose();
  }
});

test('carrier transport and blocked movement cannot manufacture a lean', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3(0, 0, -3);
  bob.update(1 / 60, { ...state(position, velocity), jumpCharge: 0 });
  for (let step = 0; step < 30; step += 1) {
    position.y += 0.01;
    bob.update(1 / 60, { ...state(position, velocity), jumpCharge: 0 });
  }
  assert.equal(weight(bob, 'Bob-Body', 'move-forward'), 0);
  bob.dispose();
});

test('stopping settles the held lean and idle drift retains heading', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const position = new THREE.Vector3(0, 0.45, 0);
  const velocity = new THREE.Vector3(0, 0, -3);
  bob.update(0, { ...state(position, velocity), jumpCharge: 0 });
  for (let step = 0; step < 20; step += 1) {
    position.addScaledVector(velocity, 1 / 60);
    bob.update(1 / 60, { ...state(position, velocity), jumpCharge: 0 });
  }
  const moving = weight(bob, 'Bob-Body', 'move-forward');
  bob.update(1 / 60, { ...state(position, new THREE.Vector3()), jumpCharge: 0 });
  const settling = weight(bob, 'Bob-Body', 'move-forward');
  assert.ok(settling > 0 && settling < moving);
  for (let step = 0; step < 120; step += 1) {
    const jitter = new THREE.Vector3(step % 2 ? 0.05 : -0.05, 0, 0);
    position.addScaledVector(jitter, 1 / 60);
    bob.update(1 / 60, { ...state(position, jitter), jumpCharge: 0 });
  }
  assert.equal(weight(bob, 'Bob-Body', 'move-forward'), 0);
  assert.equal(weight(bob, 'Bob-Body', 'move-reverse'), 0);
  assert.ok(Math.abs(bob.diagnostics.facingYawRadians) < 1e-9);
  bob.dispose();
});

test('sharp reversal counterleans before a bounded turn and becomes forward travel', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const position = new THREE.Vector3(0, 0.45, 0);
  const forward = new THREE.Vector3(0, 0, -5.5);
  const reverse = new THREE.Vector3(0, 0, 5.5);
  bob.update(0, { ...state(position, forward), jumpCharge: 0 });
  for (let step = 0; step < 30; step += 1) {
    position.addScaledVector(forward, 1 / 60);
    bob.update(1 / 60, { ...state(position, forward), jumpCharge: 0 });
  }
  let crossedNeutral = false;
  let counterleanBeforeTurn = false;
  let previousYaw = bob.diagnostics.facingYawRadians;
  for (let step = 0; step < 60; step += 1) {
    position.addScaledVector(reverse, 1 / 60);
    bob.update(1 / 60, { ...state(position, reverse), jumpCharge: 0 });
    bob.present();
    const lean = weight(bob, 'Bob-Body', 'move-forward') -
      weight(bob, 'Bob-Body', 'move-reverse');
    if (Math.abs(lean) < 0.08) crossedNeutral = true;
    if (lean < -0.3 && Math.abs(bob.diagnostics.facingYawRadians) < 1e-9) {
      counterleanBeforeTurn = true;
    }
    assert.ok(Math.abs(bob.diagnostics.facingYawRadians - previousYaw) <=
      THREE.MathUtils.degToRad(9.1));
    previousYaw = bob.diagnostics.facingYawRadians;
  }
  assert.ok(crossedNeutral);
  assert.ok(counterleanBeforeTurn);
  assert.equal(bob.diagnostics.reversing, false);
  assert.ok(Math.abs(Math.abs(bob.diagnostics.facingYawRadians) - Math.PI) < 1e-6);
  assert.ok(weight(bob, 'Bob-Body', 'move-forward') > 0.9);
  bob.dispose();
});

test('fixed-step subdivision reaches the same sustained lean', async () => {
  const coarse = new BobCharacterPresentation(0.45);
  const fine = new BobCharacterPresentation(0.45);
  await Promise.all([coarse.prepare(loadAsset), fine.prepare(loadAsset)]);
  for (const [bob, dt] of [[coarse, 1 / 60], [fine, 1 / 120]] as const) {
    const position = new THREE.Vector3(0, 0.45, 0);
    bob.update(0, { ...state(position, new THREE.Vector3()), jumpCharge: 0 });
    for (let step = 1; step <= 60 / (dt * 60); step += 1) {
      const elapsed = step * dt;
      const speed = 5.5 * Math.min(1, elapsed / 0.25);
      position.z -= speed * dt;
      bob.update(dt, { ...state(position, new THREE.Vector3(0, 0, -speed)), jumpCharge: 0 });
    }
  }
  assert.ok(Math.abs(weight(coarse, 'Bob-Body', 'move-forward') -
    weight(fine, 'Bob-Body', 'move-forward')) < 0.005);
  coarse.dispose();
  fine.dispose();
});

test('heading hysteresis ignores small direction noise while Bob is moving', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const position = new THREE.Vector3(0, 0.45, 0);
  const forward = new THREE.Vector3(0, 0, -3);
  bob.update(1 / 60, { ...state(position, forward), jumpCharge: 0 });

  for (let step = 0; step < 60; step += 1) {
    const angle = THREE.MathUtils.degToRad(step % 2 === 0 ? 4 : -4);
    const noisyForward = new THREE.Vector3(
      -Math.sin(angle) * 3,
      0,
      -Math.cos(angle) * 3,
    );
    position.addScaledVector(noisyForward, 1 / 60);
    bob.update(1 / 60, {
      ...state(position, noisyForward),
      jumpCharge: 0,
    });
  }
  bob.present();

  assert.ok(Math.abs(getCharacter(bob.root).rotation.y) < 1e-9);
  assert.ok(Math.abs(bob.diagnostics.facingYawRadians) < 1e-9);
  bob.dispose();
});

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
  assert.equal(body.material.roughness, 0.28);
  assert.equal(body.material.clearcoat, 0.35);
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

test('Bob shares one external reflection map and eases room-authored intensity', async () => {
  const bob = new BobCharacterPresentation(0.45);
  const environment = new THREE.Texture();
  environment.name = 'test-bob-laboratory-pmrem';
  let environmentDisposeCount = 0;
  environment.addEventListener('dispose', () => {
    environmentDisposeCount += 1;
  });
  bob.setReflectionEnvironment(environment);
  bob.setReflectionIntensity(0.62, 1.12);
  await bob.prepare(loadAsset);

  const character = getCharacter(bob.root);
  const body = character.getObjectByName('Bob-Body');
  const leftEye = character.getObjectByName('Bob-Eye-Left');
  assert.ok(body instanceof THREE.Mesh);
  assert.ok(leftEye instanceof THREE.Mesh);
  assert.ok(body.material instanceof THREE.MeshPhysicalMaterial);
  assert.ok(leftEye.material instanceof THREE.MeshPhysicalMaterial);
  assert.equal(body.material.envMap, environment);
  assert.equal(leftEye.material.envMap, environment);
  assert.equal(body.material.envMapIntensity, 0.62);
  assert.equal(leftEye.material.envMapIntensity, 1.12);

  bob.setReflectionIntensity(0.1, 0.24);
  bob.update(0.25, { ...state(), jumpCharge: 0 });
  assert.ok(body.material.envMapIntensity < 0.62);
  assert.ok(body.material.envMapIntensity > 0.1);
  assert.ok(leftEye.material.envMapIntensity < 1.12);
  assert.ok(leftEye.material.envMapIntensity > 0.24);
  assert.equal(
    bob.diagnostics.materials?.reflectionMapName,
    environment.name,
  );
  assert.equal(
    bob.diagnostics.materials?.targetBodyReflectionIntensity,
    0.1,
  );
  assert.equal(
    bob.diagnostics.materials?.targetEyeReflectionIntensity,
    0.24,
  );

  bob.dispose();
  assert.equal(environmentDisposeCount, 0);
  environment.dispose();
  assert.equal(environmentDisposeCount, 1);
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
  bob.setOpacity(0.35);
  bob.update(1 / 60, source);
  bob.setYaw(Math.PI / 3);
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
