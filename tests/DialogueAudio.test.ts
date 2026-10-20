import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { TypewriterAudio } from '../src/audio/TypewriterAudio.ts';
import { gameplayAudioEvents, type AudioPosition } from '../src/audio/GameplayAudioEvents.ts';
import { GameplayAudio } from '../src/audio/GameplayAudio.ts';
import type { AudioPlayback } from '../src/audio/AudioManager.ts';
import type { SoundId } from '../src/audio/SoundCatalog.ts';
import { EventBus } from '../src/core/EventBus.ts';
import type { KinematicBody } from '../src/physics/KinematicBody.ts';
import type { SlimeManager } from '../src/slimes/SlimeManager.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { RoomOneMonitor } from '../src/render/environment/containment/RoomOneMonitor.ts';
import { RoomTwoMonitor, ROOM_TWO_MONITOR_TRIGGER } from '../src/render/environment/containment/RoomTwoMonitor.ts';
import { RoomThreeMonitor, ROOM_THREE_MONITOR_TRIGGER } from '../src/render/environment/containment/RoomThreeMonitor.ts';
import { RoomFiveMonitor, ROOM_FIVE_MONITOR_TRIGGER } from '../src/render/environment/containment/RoomFiveMonitor.ts';
import { RoomFiveGoopSpeech, ROOM_FIVE_GOOP_SPEECH_TRIGGER, ROOM_FIVE_GOOP_SPEECH_SCRIPT } from '../src/render/environment/containment/RoomFiveGoopSpeech.ts';
import { MONITOR_DIALOGUE_TIMING, paginateMonitorSections } from '../src/render/environment/containment/ContainmentMonitorDialogue.ts';

function captureCues() {
  const cues: { sound: SoundId; position?: AudioPosition; volumeScale?: number; maxDistance?: number }[] = [];
  const off = gameplayAudioEvents.on('cue', cue => cues.push({
    ...cue, position: cue.position ? { ...cue.position } : undefined,
  }));
  return { cues, off };
}

test('typewriter accents follow new non-whitespace text, never holds or catch-up backlogs', () => {
  const audio = new TypewriterAudio(new THREE.Group(), {
    sound: 'world-sign-tick-01', intervalSeconds: .12, maxDistance: 14,
  });
  const { cues, off } = captureCues();
  try {
    audio.update(0, { text: '', pageIndex: 0 });
    audio.update(0, { text: 'H', pageIndex: 0 });
    assert.equal(cues.length, 1);
    audio.update(.03, { text: 'HE', pageIndex: 0 });
    audio.update(.1, { text: 'HE ', pageIndex: 0 });
    assert.equal(cues.length, 1, 'neither throttled letters nor spaces queue a click');
    audio.update(10, { text: 'HE ', pageIndex: 0 });
    assert.equal(cues.length, 1, 'a hold cannot replay a previously throttled letter');
    audio.update(0, { text: 'HE L', pageIndex: 0 });
    assert.equal(cues.length, 2);
    audio.update(120, { text: 'A WHOLE NEW PAGE', pageIndex: 1 });
    assert.equal(cues.length, 3, 'one accent rather than one per skipped character');
    audio.update(10, { text: '', pageIndex: 1 });
    assert.equal(cues.length, 3, 'clearing text stays silent');
    audio.reset();
    assert.equal(cues.length, 3, 'resetting stays silent');
    audio.update(0, { text: 'H', pageIndex: 0 });
    assert.equal(cues.length, 4);
    for (const delta of [-1, NaN, Infinity]) {
      assert.throws(() => audio.update(delta, { text: 'HE', pageIndex: 0 }), /timestep/);
    }
  } finally { off(); }
});

test('typewriter sources respect hidden ancestors, world transforms and a local speaker offset', () => {
  const parent = new THREE.Group(), root = new THREE.Group();
  parent.position.set(40, 2, 80); parent.rotation.y = .6;
  root.position.set(3, 4, 5); parent.add(root);
  const local = new THREE.Vector3(0, -3, 0);
  const audio = new TypewriterAudio(root, {
    sound: 'bob-contact-01', intervalSeconds: .32, volumeScale: .35, maxDistance: 12, localPosition: local,
  });
  const { cues, off } = captureCues();
  try {
    parent.visible = false;
    audio.update(0, { text: 'H', pageIndex: 0 });
    assert.equal(cues.length, 0);
    parent.visible = true;
    audio.update(1, { text: 'H', pageIndex: 0 });
    assert.equal(cues.length, 0, 'showing old text does not replay it');
    audio.update(0, { text: 'HE', pageIndex: 0 });
    assert.equal(cues.length, 1);
    const expected = root.localToWorld(local.clone());
    assert.ok(expected.distanceTo(new THREE.Vector3().copy(cues[0].position!)) < 1e-10);
    assert.equal(cues[0].volumeScale, .35); assert.equal(cues[0].maxDistance, 12);
    audio.update(1, { text: 'HIDDEN', pageIndex: 1 }, false);
    audio.update(1, { text: 'HIDDEN', pageIndex: 1 });
    assert.equal(cues.length, 1, 'an inaudible page cannot build an audio backlog');
  } finally { off(); }
});

const monitorCases = [
  { room: 1, create: (assets: ContainmentArtResources) => new RoomOneMonitor(assets), delay: 6, near: undefined },
  { room: 2, create: (assets: ContainmentArtResources) => new RoomTwoMonitor(assets), delay: 0, near: ROOM_TWO_MONITOR_TRIGGER.centre },
  { room: 3, create: (assets: ContainmentArtResources) => new RoomThreeMonitor(assets), delay: 0, near: ROOM_THREE_MONITOR_TRIGGER.centre },
  { room: 5, create: (assets: ContainmentArtResources) => new RoomFiveMonitor(assets), delay: 0, near: ROOM_FIVE_MONITOR_TRIGGER.centre },
];

for (const fixture of monitorCases) {
  test(`Room ${fixture.room} uses shared terminal ticks without early, doubled, reset or disposal cues`, () => {
    const assets = new ContainmentArtResources(), monitor = fixture.create(assets);
    const { cues, off } = captureCues();
    try {
      monitor.update(fixture.delay ? 5.99 : 120);
      assert.equal(cues.length, 0);
      monitor.update(fixture.delay ? .01 : 0, fixture.near);
      assert.equal(cues.length, 1, 'one initial click, including Room 1 after the shared refactor');
      assert.equal(cues[0].sound, 'world-sign-tick-01');
      assert.equal(cues[0].maxDistance, 14); assert.equal(cues[0].volumeScale, 1);
      assert.deepEqual(cues[0].position, { ...monitor.root.position });
      monitor.update(.01, fixture.near); assert.equal(cues.length, 1);
      monitor.update(.18, fixture.near); assert.equal(cues.length, 2);
      const beforeCatchUp = cues.length;
      monitor.update(30, fixture.near);
      assert.ok(cues.length - beforeCatchUp <= 1);
      monitor.update(120, fixture.near);
      assert.equal(monitor.dialogue.readModel.complete, true);
      const complete = cues.length;
      monitor.update(120, fixture.near); assert.equal(cues.length, complete);
      monitor.reset(); assert.equal(cues.length, complete);
      monitor.update(fixture.delay ? 5.99 : 120);
      assert.equal(cues.length, complete);
      monitor.update(fixture.delay ? .01 : 0, fixture.near);
      assert.equal(cues.length, complete + 1);
      monitor.dispose(); monitor.update(120, fixture.near); monitor.reset();
      assert.equal(cues.length, complete + 1);
    } finally { off(); monitor.dispose(); assets.dispose(); }
  });
}

test('Goop has quieter, slower slime blips at the cell rather than mechanical ticks above his head', () => {
  const speech = new RoomFiveGoopSpeech(), near = ROOM_FIVE_GOOP_SPEECH_TRIGGER.centre;
  const { cues, off } = captureCues();
  try {
    speech.update(120); assert.equal(cues.length, 0);
    speech.update(.01, near); assert.equal(cues.length, 1);
    assert.equal(cues[0].sound, 'bob-contact-01');
    assert.equal(cues[0].volumeScale, .35); assert.equal(cues[0].maxDistance, 12);
    assert.deepEqual(cues[0].position, { ...near });
    speech.update(.09, near); assert.equal(cues.length, 1);
    speech.update(.25, near); assert.equal(cues.length, 2);
    const text = speech.dialogue.readModel.text;
    speech.update(120, { x: 100, y: 100, z: 100 });
    assert.equal(cues.length, 2); assert.equal(speech.dialogue.readModel.text, text);
    speech.update(.001, near);
    assert.equal(cues.length, 2, 'returning to the same visible text is silent');
    speech.update(1, near); assert.equal(cues.length, 3, 'a frame hitch gives just one blip');
    speech.update(120, near, false); assert.equal(cues.length, 3);
    assert.equal(speech.isShowing, false);
    speech.update(120, near);
    assert.equal(speech.hasFinished, true); assert.equal(speech.isShowing, false);
    assert.equal(cues.length, 3, 'skipping directly past the fade cannot play an invisible line');
    speech.update(1, near); assert.equal(cues.length, 3);
    speech.reset(); assert.equal(cues.length, 3);
    speech.update(.01, near); assert.equal(cues.length, 4);
    speech.dispose(); speech.update(10, near); speech.reset();
    assert.equal(cues.length, 4);
  } finally { off(); speech.dispose(); }
});

test('Goop’s inter-line reading pauses are silent and the next page starts with one blip', () => {
  const speech = new RoomFiveGoopSpeech(), near = ROOM_FIVE_GOOP_SPEECH_TRIGGER.centre;
  const { cues, off } = captureCues();
  try {
    speech.update(8 * .09, near);
    assert.equal(speech.dialogue.readModel.text, 'HEY! YOU!'); assert.equal(cues.length, 1);
    speech.update(2.999, near); assert.equal(cues.length, 1);
    speech.update(.001, near);
    assert.equal(speech.dialogue.readModel.text, 'G'); assert.equal(cues.length, 2);
  } finally { off(); speech.dispose(); }
});

test('checkpoint recovery never replays Goop blips after his completed final hint', () => {
  const speech = new RoomFiveGoopSpeech(), near = ROOM_FIVE_GOOP_SPEECH_TRIGGER.centre;
  const { cues, off } = captureCues();
  try {
    speech.update(.3, near);
    const partialCues = cues.length;
    speech.resetForCheckpointRecovery();
    assert.equal(cues.length, partialCues, 'Resetting partial dialogue is silent.');
    speech.update(.01, near);
    assert.equal(cues.length, partialCues + 1, 'The unfinished warning can restart normally.');
    speech.reset();
    const pages = paginateMonitorSections(ROOM_FIVE_GOOP_SPEECH_SCRIPT, 18, 2);
    const duration = pages.reduce((sum, page) => sum + (page.text.length - 1) * MONITOR_DIALOGUE_TIMING.characterSeconds, 0)
      + (pages.length - 1) * MONITOR_DIALOGUE_TIMING.sectionHoldSeconds;
    speech.update(duration, near);
    assert.equal(speech.dialogue.readModel.complete, true);
    assert.equal(speech.isShowing, true, 'The final hint is still in its reading hold.');
    const completeCues = cues.length;
    for (let retry = 0; retry < 3; retry++) {
      speech.resetForCheckpointRecovery(); speech.update(120, near);
      assert.equal(cues.length, completeCues, 'Completed dialogue stays silent across repeated deaths.');
    }
    speech.reset(); speech.update(.01, near);
    assert.equal(cues.length, completeCues + 1, 'A full restart rearms the conversation and its audio.');
  } finally { off(); speech.dispose(); }
});

class Playback implements AudioPlayback {
  cues: SoundId[] = [];
  play(sound: SoundId) { this.cues.push(sound); }
  startLoop() {} stopLoop() {} stopAll() {} setPaused() {} setListener() {}
}

test('dialogue cues use existing gameplay pause, death and distance gates without a resume backlog', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomTwoMonitor(assets), audio = new Playback();
  const near = ROOM_TWO_MONITOR_TRIGGER.centre;
  const body = { position: new THREE.Vector3().copy(near), velocity: new THREE.Vector3(),
    groundNormal: new THREE.Vector3(0, 1, 0), locomotionPosition: new THREE.Vector3(),
    grounded: true, chargingJump: false, landedThisStep: false, events: new EventBus<any>() };
  const manager = { activeSlimeId: 'bob', activeBody: body,
    getBody: (id: string) => id === 'bob' ? body : undefined, events: new EventBus<any>() };
  const director = new GameplayAudio(audio, manager as unknown as SlimeManager<KinematicBody>);
  try {
    monitor.update(0, near); assert.equal(audio.cues.length, 0);
    monitor.reset(); director.setEnabled(true); director.update();
    monitor.update(0, near); assert.deepEqual(audio.cues, ['world-sign-tick-01']);
    director.setEnabled(false); monitor.update(.4, near); assert.equal(audio.cues.length, 1);
    director.setEnabled(true); monitor.update(.01, near); assert.equal(audio.cues.length, 1);
    monitor.update(.36, near); assert.equal(audio.cues.length, 2);
    body.position.set(1000, 1000, 1000); monitor.update(.36, near); assert.equal(audio.cues.length, 2);
    body.position.copy(near); monitor.update(0, near); assert.equal(audio.cues.length, 2);
    monitor.update(.36, near); assert.equal(audio.cues.length, 3);
    director.died('bob'); const afterDeath = audio.cues.length;
    monitor.update(.4, near); assert.equal(audio.cues.length, afterDeath);
    director.respawn(); monitor.reset(); const afterRespawn = audio.cues.length;
    monitor.update(0, near); assert.equal(audio.cues.length, afterRespawn + 1);
  } finally { director.dispose(); monitor.dispose(); assets.dispose(); }
});
