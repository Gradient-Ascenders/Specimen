import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { BossDefeatAudio } from '../../../src/audio/BossDefeatAudio.ts';
import { gameplayAudioEvents } from '../../../src/audio/GameplayAudioEvents.ts';
import { ENDING_SOUND_IDS, SOUND_BANKS, SOUND_DEFINITIONS, type SoundId } from '../../../src/audio/SoundCatalog.ts';
import { ENDING_TIMING as T, endingGoopHitTime } from '../../../src/cinematics/BossDefeatTimeline.ts';

function fixture() {
  const track = new BossDefeatAudio(), loops = new Map<string, { sound: SoundId; volumeScale?: number }>();
  const cues: { time: number; sound: SoundId }[] = [], heard = new Set<SoundId>(), stopped = new Set<SoundId>();
  let time = -1 / 60, events = 0;
  const off = [
    gameplayAudioEvents.on('cue', cue => { cues.push({ time, sound: cue.sound }); heard.add(cue.sound); events++; }),
    gameplayAudioEvents.on('loop', loop => { loops.set(loop.key, loop); heard.add(loop.sound); events++; }),
    gameplayAudioEvents.on('stop', ({ key }) => { loops.delete(key); events++; }),
    gameplayAudioEvents.on('stopSound', ({ sound }) => { stopped.add(sound); events++; }),
  ];
  const update = (t: number) => { const before = time; time = t; track.update(before, t); };
  const advance = (t: number) => {
    for (let frame = Math.floor(time * 60 + 1e-7) + 1; frame / 60 <= t + 1e-8; frame++) update(frame / 60);
  };
  return { track, loops, cues, heard, stopped, update, advance, get events() { return events; },
    dispose: () => { track.stop(); for (const unsubscribe of off) unsubscribe(); } };
}

test('the ending follows charge, beam flight, separation, Goop hits and all twelve collapse blasts', () => {
  const f = fixture();
  try {
    f.advance(.5);
    assert.equal(f.loops.get('ending:collapse')?.sound, 'ending-structural-rumble-loop-01', 'rumble starts with the boss-defeat handoff');
    assert.ok(f.loops.get('ending:collapse')!.volumeScale! > 0);
    f.advance(T.black - 1 / 60);
    const times = (sound: SoundId) => f.cues.filter(c => c.sound === sound).map(c => c.time);
    for (const [sound, at] of [
      ['ending-specimen-charge-01', T.charge], ['boss-beam-ignite-01', T.fire],
      ['specimen-heavy-blast-01', T.specimenFire], ['ending-beam-collision-impact-01', T.impact],
      ['ending-energy-overload-rise-01', T.orbit], ['boss-final-explosion-01', T.explosion],
      ['ending-slime-separate-01', T.split], ['ending-boss-wreck-fall-01', T.explosion],
    ] as const) {
      assert.equal(times(sound).length, 1, sound);
      assert.ok(Math.abs(times(sound)[0]! - at) < 1 / 60 + 1e-8, sound);
    }
    const hits = times('ending-goop-hit-01');
    assert.equal(hits.length, 3);
    hits.forEach((at, i) => assert.ok(Math.abs(at - endingGoopHitTime(i)) < 1 / 60 + 1e-8));
    assert.equal(times('ending-collapse-blast-01').length, 12);
    assert.equal(times('ending-girder-crash-01').length, 2);
    assert.equal(times('ending-debris-impact-01').length, 6);
    assert.equal(times('ending-debris-impact-01').filter(at => at >= T.goodbye && at <= T.goodbyeEnd).length, 0);
    assert.ok(times('ending-projectile-flyby-01').length > 10);
    assert.ok(times('goop-shoot-01').length > 15);
    assert.equal(times('volt-shoot-01').length, 0, 'Goop uses his own weapon');
    assert.equal(times('world-drone-dissolve-01').length, 0);
    assert.equal(times('cultivation-cover-drone-impact-01').length, 0);
    f.advance(T.credits);
    assert.deepEqual(ENDING_SOUND_IDS.filter(id => !f.heard.has(id)), [], 'every imported cue and the collision alias is routed');
    assert.equal(f.loops.size, 0, 'outdoor ambience finishes before credits');
  } finally { f.dispose(); }
});

test('blackout stops owned one-shot tails and loops; daylight starts only outdoor ambience and the exit door', () => {
  const f = fixture();
  try {
    f.advance(T.black);
    assert.equal(f.loops.size, 0);
    for (const sound of ['ending-collapse-blast-01', 'ending-girder-crash-01', 'ending-structural-rumble-loop-01'] as const)
      assert.ok(f.stopped.has(sound), sound);
    const count = f.cues.length;
    f.advance(T.daylight - 1 / 60);
    assert.equal(f.cues.length, count); assert.equal(f.loops.size, 0);
    f.advance(T.daylight + .5);
    assert.deepEqual([...f.loops.keys()].sort(), ['ending:exit-door', 'ending:outside']);
    f.advance(T.daylight + 2);
    assert.deepEqual([...f.loops.keys()], ['ending:outside']);
  } finally { f.dispose(); }
});

test('farewell ducks combat and collapse, and static samples or seeks cannot replay a backlog', () => {
  const f = fixture();
  try {
    f.advance(T.goodbye - 1);
    const normal = f.loops.get('ending:collapse')!.volumeScale!;
    f.advance(T.goodbye + .2);
    assert.ok(f.loops.get('ending:collapse')!.volumeScale! <= normal * .26);
    const events = f.events;
    f.update(T.goodbye + .2); assert.equal(f.events, events);
    const count = f.cues.length;
    f.update(T.daylight + .5);
    assert.equal(f.cues.length, count, 'seeking does not play missed destruction or movement cues');
    assert.deepEqual([...f.loops.keys()].sort(), ['ending:exit-door', 'ending:outside']);
    const afterSeek = f.events;
    f.track.update(T.goodbye + .2, T.daylight + .5);
    assert.equal(f.events, afterSeek, 'repeating the same seek cannot restart the new shot');
  } finally { f.dispose(); }
});

test('release stops reused clips and allows a fresh attempt without touching unrelated loops', () => {
  const f = fixture();
  try {
    f.advance(T.explosion + .5);
    f.loops.set('unrelated', { sound: 'world-machinery-loop-01' });
    f.track.stop();
    assert.deepEqual([...f.loops.keys()], ['unrelated']);
    for (const sound of ['boss-final-explosion-01', 'ending-slime-separate-01', 'ending-boss-wreck-fall-01'] as const)
      assert.ok(f.stopped.has(sound), sound);
    f.track.update(-1 / 60, 0);
    assert.ok(f.loops.has('ending:damaged-boss'));
  } finally { f.dispose(); }
});

test('the ending bank ships fourteen recordings and one reuse, restricted to Blackout', () => {
  assert.equal(ENDING_SOUND_IDS.length, 15);
  assert.equal(ENDING_SOUND_IDS.filter(id => SOUND_DEFINITIONS[id].path.startsWith('assets/audio/ending/')).length, 14);
  for (const sound of ENDING_SOUND_IDS) {
    assert.ok(existsSync(`public/${SOUND_DEFINITIONS[sound].path}`), sound);
    assert.ok(SOUND_BANKS.blackout.includes(sound));
    assert.ok(!SOUND_BANKS.containment.includes(sound)); assert.ok(!SOUND_BANKS.cultivation.includes(sound));
  }
});
