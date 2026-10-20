import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { ContainmentLevelController } from '../src/levels/ContainmentLevelController.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { DeathSequence } from '../src/systems/DeathSequence.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { ContainmentMonitorDialogue, MONITOR_DIALOGUE_TIMING as T, paginateMonitorSections } from '../src/render/environment/containment/ContainmentMonitorDialogue.ts';
import { createContainmentMonitorTexture, paintContainmentMonitorTexture } from '../src/render/environment/containment/ContainmentProceduralTextures.ts';
import { RoomFiveMonitor, ROOM_FIVE_MONITOR_POSITION, ROOM_FIVE_MONITOR_TRIGGER,
  ROOM_FIVE_MONITOR_SCRIPT, ROOM_FIVE_MONITOR_COLOURS, ROOM_FIVE_MONITOR_PAGE_HOLD_SECONDS } from '../src/render/environment/containment/RoomFiveMonitor.ts';
import { RoomFiveGoopSpeech, ROOM_FIVE_GOOP_SPEECH_SCRIPT, ROOM_FIVE_GOOP_SPEECH_TRIGGER,
  ROOM_FIVE_GOOP_SPEECH_TIMING } from '../src/render/environment/containment/RoomFiveGoopSpeech.ts';

const platform = ROOM_FIVE_MONITOR_TRIGGER.centre;
const nearGoop = { x: .084, y: 77.397, z: 102.793 };
const entrance = { x: 9, y: 75.21, z: 93.5 };

function bodyColour(texture: THREE.DataTexture): 'red' | 'green' | 'blank' {
  const pixels = texture.image.data as Uint8Array;
  for (let y = 80; y < 210; y++) for (let x = 24; x < 480; x++) {
    const at = (y * 512 + x) * 4;
    if (pixels[at] > pixels[at + 1] + 60 && pixels[at] > pixels[at + 2] + 60) return 'red';
    if (pixels[at + 1] > pixels[at] + 50 && pixels[at + 1] > pixels[at + 2] + 40) return 'green';
  }
  return 'blank';
}

test('Room 5 monitor starts at the central platform and paginates the green response before the final red line', () => {
  const resources = new ContainmentArtResources(), monitor = new RoomFiveMonitor(resources);
  try {
    assert.deepEqual(ROOM_FIVE_MONITOR_SCRIPT, ['We must intervene before he goes further',
      'No, we must first determine the full extent of Bob’s capabilities.', 'I’ll deploy a drone as a precaution.']);
    assert.deepEqual(ROOM_FIVE_MONITOR_COLOURS, ['red', 'green', 'red']);
    for (const position of [undefined, entrance, nearGoop, { ...platform, y: 75.21 },
      { x: 15.436, y: 93.91, z: 120 }]) monitor.update(120, position);
    assert.equal(monitor.hasActivated, false); assert.equal(bodyColour(monitor.texture), 'blank');
    monitor.update(0, platform);
    const pages = paginateMonitorSections(ROOM_FIVE_MONITOR_SCRIPT);
    assert.deepEqual(pages.map(page => page.sectionIndex), [0, 1, 1, 2]);
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index], colour = ROOM_FIVE_MONITOR_COLOURS[page.sectionIndex];
      assert.equal(monitor.dialogue.readModel.text, page.text[0]);
      assert.equal(bodyColour(monitor.texture), colour);
      monitor.update((page.text.length - 1) * T.characterSeconds, entrance);
      assert.equal(monitor.dialogue.readModel.text, page.text);
      assert.equal(bodyColour(monitor.texture), colour);
      if (index < pages.length - 1) {
        const sameSection = pages[index + 1].sectionIndex === page.sectionIndex;
        const hold = sameSection ? ROOM_FIVE_MONITOR_PAGE_HOLD_SECONDS[page.sectionIndex] : T.sectionHoldSeconds;
        const version = monitor.texture.version;
        monitor.update(hold - .001, entrance); assert.equal(monitor.texture.version, version);
        monitor.update(.001, entrance);
      }
    }
    assert.equal(monitor.dialogue.readModel.complete, true);
    const version = monitor.texture.version;
    monitor.update(120, platform); assert.equal(monitor.texture.version, version);
    monitor.reset(); monitor.update(120, entrance); assert.equal(monitor.hasActivated, false);
    assert.equal(monitor.dialogue.readModel.text, '');
  } finally { monitor.dispose(); resources.dispose(); }
});

test('only the pause before CAPABILITIES is halved; the green response retains normal typing speed', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomFiveMonitor(assets);
  const original = new ContainmentMonitorDialogue(ROOM_FIVE_MONITOR_SCRIPT);
  const pages = paginateMonitorSections(ROOM_FIVE_MONITOR_SCRIPT);
  try {
    assert.deepEqual(ROOM_FIVE_MONITOR_PAGE_HOLD_SECONDS, [2, 1, 2]);
    const greenStart = (pages[0].text.length - 1) * T.characterSeconds + T.sectionHoldSeconds;
    monitor.update(greenStart, platform); original.update(greenStart);
    assert.equal(monitor.dialogue.readModel.text, original.readModel.text);
    assert.equal(monitor.dialogue.readModel.sectionIndex, 1);
    for (let count = 2; count <= pages[1].text.length; count++) {
      monitor.update(T.characterSeconds - .001, platform); original.update(T.characterSeconds - .001);
      assert.equal(monitor.dialogue.readModel.text.length, count - 1, 'No early green letters.');
      monitor.update(.001, platform); original.update(.001);
      assert.equal(monitor.dialogue.readModel.text, pages[1].text.slice(0, count));
      assert.equal(monitor.dialogue.readModel.text, original.readModel.text);
    }
    const version = monitor.texture.version;
    monitor.update(.999, platform); original.update(.999);
    assert.equal(monitor.dialogue.readModel.text, pages[1].text);
    assert.equal(monitor.texture.version, version);
    monitor.update(.001, platform); original.update(.001);
    assert.equal(monitor.dialogue.readModel.pageIndex, 2);
    assert.equal(monitor.dialogue.readModel.text, 'C', 'The overflow page starts exactly one second later.');
    assert.equal(original.readModel.pageIndex, 1, 'The normal two-second page hold is unchanged.');
    monitor.update(T.characterSeconds - .001, platform);
    assert.equal(monitor.dialogue.readModel.text, 'C');
    monitor.update(.001, platform);
    assert.equal(monitor.dialogue.readModel.text, 'CA', 'CAPABILITIES also types at the original character rate.');
    for (const seconds of [-1, NaN, Infinity]) {
      assert.throws(() => new ContainmentMonitorDialogue(['TEST'], { sectionPageHoldSeconds: [seconds] }), /page hold/);
    }
  } finally { monitor.dispose(); assets.dispose(); }
});

test('Room 5 punctuation is visible, including commas, apostrophes and Goop’s exclamations', () => {
  const texture = createContainmentMonitorTexture();
  try {
    for (const character of new Set([...ROOM_FIVE_MONITOR_SCRIPT, ...ROOM_FIVE_GOOP_SPEECH_SCRIPT]
      .join('').toUpperCase().replace(/\s/g, ''))) {
      paintContainmentMonitorTexture(texture, character, false, 'red');
      assert.equal(bodyColour(texture), 'red', `Missing glyph: ${character}`);
    }
  } finally { texture.dispose(); }
});

test('Goop starts only near his cell, freezes out of range, and delivers four distinct pleas once', () => {
  const speech = new RoomFiveGoopSpeech();
  try {
    assert.deepEqual(ROOM_FIVE_GOOP_SPEECH_SCRIPT, ['Hey! You!', 'Get me outta here!',
      'They will kill you too', 'The switch is at the top']);
    const originalVersion = speech.texture.version;
    for (const position of [undefined, entrance, { ...nearGoop, y: 100 }, { x: NaN, y: 76.546, z: 110 }]) {
      speech.update(120, position); assert.equal(speech.hasActivated, false);
      assert.equal(speech.isShowing, false); assert.equal(speech.texture.version, originalVersion);
    }
    speech.update(.01, nearGoop); assert.equal(speech.hasActivated, true); assert.equal(speech.isShowing, true);
    const first = speech.dialogue.readModel.text;
    speech.update(120, entrance); assert.equal(speech.isShowing, false);
    assert.equal(speech.dialogue.readModel.text, first, 'Walking away must not consume Goop’s warning.');
    const seen = new Set<number>();
    for (let tick = 0; tick < 40 * 60; tick++) {
      speech.update(1 / 60, nearGoop);
      if (!speech.dialogue.readModel.typing) seen.add(speech.dialogue.readModel.sectionIndex);
    }
    assert.deepEqual([...seen], [0, 1, 2, 3]); assert.equal(speech.hasFinished, true);
    assert.equal(speech.isShowing, false); assert.equal(speech.dialogue.readModel.text, 'THE SWITCH IS AT\nTHE TOP');
    const version = speech.texture.version;
    speech.update(120, nearGoop); assert.equal(speech.texture.version, version); assert.equal(speech.isShowing, false);
    speech.reset(); assert.equal(speech.hasActivated, false); assert.equal(speech.hasFinished, false);
    speech.update(.1, nearGoop); assert.equal(speech.isShowing, true);
    speech.update(120, nearGoop, false); assert.equal(speech.isShowing, false, 'No plea after the release sequence begins.');
  } finally { speech.dispose(); }
});

test('Goop’s final hint remains readable for four seconds before fading without new textures or geometry', () => {
  const speech = new RoomFiveGoopSpeech();
  try {
    const geometry = speech.mesh.geometry, texture = speech.texture, material = speech.mesh.material;
    const pages = paginateMonitorSections(ROOM_FIVE_GOOP_SPEECH_SCRIPT, 18, 2);
    assert.equal(pages.length, 4);
    const duration = pages.reduce((sum, page) => sum + (page.text.length - 1) * T.characterSeconds, 0) + 3 * T.sectionHoldSeconds;
    speech.update(duration, nearGoop);
    assert.equal(speech.dialogue.readModel.complete, true); assert.equal(material.opacity, 1);
    const version = texture.version;
    speech.update(ROOM_FIVE_GOOP_SPEECH_TIMING.finalHoldSeconds, nearGoop); assert.ok(material.opacity > .99999);
    speech.update(ROOM_FIVE_GOOP_SPEECH_TIMING.fadeSeconds / 2, nearGoop);
    assert.ok(material.opacity > .49 && material.opacity < .51);
    speech.update(ROOM_FIVE_GOOP_SPEECH_TIMING.fadeSeconds / 2 + .001, nearGoop);
    assert.equal(speech.hasFinished, true); assert.equal(speech.isShowing, false);
    assert.equal(texture.version, version); assert.equal(speech.mesh.geometry, geometry);
    assert.equal(speech.mesh.material, material); assert.equal(speech.texture, texture);
    assert.equal(texture.image.data.byteLength, 524288); assert.equal(texture.generateMipmaps, false);
  } finally { speech.dispose(); }
});

test('the speech panel faces the actual camera and respects occlusion, without added lighting or collision', () => {
  const speech = new RoomFiveGoopSpeech(), parent = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  try {
    parent.rotation.y = .4; parent.add(speech.root); parent.updateMatrixWorld(true);
    camera.position.set(4, 83, 120); camera.lookAt(0, 79.7, 110); camera.updateMatrixWorld(true);
    speech.update(1, nearGoop);
    speech.mesh.onBeforeRender(undefined as any, undefined as any, camera, undefined as any, undefined as any, undefined as any);
    const actual = speech.mesh.getWorldQuaternion(new THREE.Quaternion());
    assert.ok(actual.angleTo(camera.getWorldQuaternion(new THREE.Quaternion())) < 1e-6);
    assert.equal(speech.mesh.material.depthTest, true); assert.equal(speech.mesh.material.depthWrite, false);
    assert.equal(speech.mesh.castShadow, false); assert.equal(speech.mesh.userData.visualOnly, true);
    assert.equal(speech.root.children.length, 1); assert.ok(!(speech.mesh instanceof THREE.Light));
    const pixels = speech.texture.image.data as Uint8Array;
    assert.equal(pixels[3], 0, 'Texture outside the speech balloon stays transparent.');
    assert.ok(pixels[(225 * 512 + 256) * 4 + 3] > 0, 'The balloon has a visible tail pointing towards Goop.');
    const owned = [speech.texture, speech.mesh.material, speech.mesh.geometry], disposals = [0, 0, 0];
    owned.forEach((resource, index) => resource.addEventListener('dispose', () => { disposals[index]++; }));
    speech.dispose(); speech.dispose(); speech.update(10, nearGoop); speech.reset();
    assert.deepEqual(disposals, [1, 1, 1]);
  } finally { speech.dispose(); }
});

for (const includeDevelopmentHelpers of [false, true]) {
  test(`Room 5 deaths retry unfinished Goop dialogue but retain completed dialogue until level restart (dev ${includeDevelopmentHelpers})`, () => {
    const scene = new ContainmentLevelScene(() => {}, { includeDevelopmentHelpers });
    const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
    world.registerAll(scene.collisionMeshes); surfaces.registerAll(scene.collisionMeshes);
    const body = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(0, .46, -2.6) });
    const death = new DeathSequence({ burstDurationSeconds: .05 });
    const controller = new ContainmentLevelController({ scene, body, collisionWorld: world,
      requestDeath: recovery => death.requestDeath(recovery) });
    try {
      const speech = scene.roomFive.goopSpeech;
      const pages = paginateMonitorSections(ROOM_FIVE_GOOP_SPEECH_SCRIPT, 18, 2);
      const duration = pages.reduce((sum, page) => sum + (page.text.length - 1) * T.characterSeconds, 0)
        + (pages.length - 1) * T.sectionHoldSeconds;
      const geometry = speech.mesh.geometry, texture = speech.texture, material = speech.mesh.material;
      for (const elapsed of [.3, duration - T.characterSeconds, duration,
        duration + ROOM_FIVE_GOOP_SPEECH_TIMING.finalHoldSeconds + ROOM_FIVE_GOOP_SPEECH_TIMING.fadeSeconds + .01]) {
        controller.reset(); controller.teleportToRoomForDebug(5);
        body.teleport(nearGoop); scene.update(elapsed, body.position);
        const complete = speech.dialogue.readModel.complete;
        assert.equal(complete, elapsed >= duration);
        const text = speech.dialogue.readModel.text, version = texture.version;
        assert.equal(controller.requestHazardFailure({ roomId: 'room-5', hazardId: 'dialogue-retry-test' }), true);
        scene.updateDeath(10); assert.equal(speech.dialogue.readModel.text, text);
        death.update(.05); assert.equal(death.completeRetry(), true);
        assert.equal(controller.activeRoomId, 5);
        assert.equal(controller.activeCheckpointId, 'containment-room-5-entry');
        assert.deepEqual(body.position.toArray(), [9, 75.21, 94]);
        assert.equal(speech.isShowing, false);
        if (complete) {
          assert.equal(speech.hasFinished, true);
          scene.update(120, nearGoop);
          assert.equal(speech.isShowing, false, 'Completed warnings must not repeat after Retry.');
          assert.equal(speech.dialogue.readModel.text, text);
          assert.equal(texture.version, version, 'Recovery must not repaint completed dialogue.');
          controller.recoverActiveCheckpoint(); scene.update(120, nearGoop);
          assert.equal(speech.isShowing, false, 'Further deaths must retain the same completion.');
        } else {
          assert.equal(speech.hasActivated, false); assert.equal(speech.hasFinished, false);
          assert.equal(speech.dialogue.readModel.text, '');
          scene.update(0, nearGoop);
          assert.equal(speech.dialogue.readModel.text, 'H', 'Unfinished warnings start again from Hey! You!');
        }
        assert.equal(speech.mesh.geometry, geometry); assert.equal(speech.texture, texture);
        assert.equal(speech.mesh.material, material);
      }
      controller.reset(); controller.teleportToRoomForDebug(5); scene.update(0, nearGoop);
      assert.equal(speech.hasFinished, false); assert.equal(speech.dialogue.readModel.text, 'H',
        'A full level restart must clear remembered dialogue.');
    } finally { controller.dispose(); world.clear(); surfaces.clear(); scene.dispose(); }
  });

  test(`Room 5 wires both conversations to the active player and resets safely (dev ${includeDevelopmentHelpers})`, () => {
    const scene = new ContainmentLevelScene(() => {}, { includeDevelopmentHelpers });
    try {
      const monitor = scene.roomFiveMonitor, speech = scene.roomFive.goopSpeech;
      const colliders = scene.collisionMeshes.map(mesh => mesh.uuid);
      assert.deepEqual(monitor.root.position.toArray(), Object.values(ROOM_FIVE_MONITOR_POSITION));
      const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(monitor.root.quaternion);
      assert.ok(screenNormal.z < -.999);
      const bounds = new THREE.Box3().setFromObject(monitor.root);
      assert.ok(bounds.max.z > 125.23 && bounds.min.z < 125.08);
      assert.ok(bounds.min.y > 79.4, 'The monitor stays above the actual Goop door.');
      const rest = scene.collisionMeshes.find(mesh => mesh.name === 'room-5-central-rest-platform')!;
      assert.equal(platform.x, rest.position.x); assert.equal(platform.z, rest.position.z);
      assert.ok(Math.abs(platform.y - rest.position.y - .71) < 1e-8);
      assert.deepEqual(scene.roomFive.goopReleasePosition.toArray(), Object.values(ROOM_FIVE_GOOP_SPEECH_TRIGGER.centre));
      scene.update(120, platform, entrance);
      assert.equal(monitor.hasActivated, false); assert.equal(speech.hasActivated, false);
      scene.update(.2, entrance, nearGoop); assert.equal(speech.isShowing, true);
      assert.equal(monitor.hasActivated, false);
      const text = speech.dialogue.readModel.text;
      scene.updateDeath(10); assert.equal(speech.dialogue.readModel.text, text);
      scene.update(.01, platform, platform); assert.equal(monitor.hasActivated, true);
      scene.resetPresentation(); assert.equal(monitor.hasActivated, false); assert.equal(speech.hasActivated, false);
      scene.update(.2, nearGoop, nearGoop); assert.equal(speech.isShowing, true);
      scene.roomFive.beginEnding(); scene.update(.2, nearGoop, nearGoop); assert.equal(speech.isShowing, false);
      scene.roomFive.reset(); assert.equal(speech.hasActivated, false);
      assert.deepEqual(scene.collisionMeshes.map(mesh => mesh.uuid), colliders);
      assert.equal(scene.measuredFirstUseGeometryPrimeDiagnostics.resourceCount, 23);
    } finally { scene.dispose(); }
  });
}
