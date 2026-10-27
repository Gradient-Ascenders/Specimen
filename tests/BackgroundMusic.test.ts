import { strict as assert } from 'node:assert';
import test, { type TestContext } from 'node:test';
import { BackgroundMusic, musicForFlow } from '../src/audio/BackgroundMusic.ts';

test('soundtrack follows menu origin, pause, opening, and three gameplay levels', () => {
  assert.deepEqual(musicForFlow('loading', 'title', 'containment'), { track: null, play: false });
  assert.deepEqual(musicForFlow('title', 'title', 'containment'), { track: 'intro', play: true });
  assert.deepEqual(musicForFlow('levelSelect', 'title', 'containment'), { track: 'intro', play: true });
  assert.deepEqual(musicForFlow('cutsceneSelect', 'title', 'containment'), { track: 'intro', play: true });
  assert.deepEqual(musicForFlow('settings', 'title', 'containment'), { track: 'intro', play: true });
  assert.deepEqual(musicForFlow('credits', 'title', 'containment'), { track: 'intro', play: true });
  assert.deepEqual(musicForFlow('opening', 'title', 'containment'), { track: null, play: true });
  assert.deepEqual(musicForFlow('playing', 'title', 'containment'), { track: 'containment', play: true });
  assert.deepEqual(musicForFlow('paused', 'paused', 'containment'), { track: 'containment', play: false });
  assert.deepEqual(musicForFlow('settings', 'paused', 'containment'), { track: 'containment', play: false });
  assert.deepEqual(musicForFlow('restarting', 'paused', 'containment'), { track: 'containment', play: false });
  assert.deepEqual(musicForFlow('transitioning', 'paused', 'cultivation'), { track: null, play: true });
  assert.deepEqual(musicForFlow('playing', 'paused', 'cultivation'), { track: 'cultivation', play: true });
  assert.deepEqual(musicForFlow('playing', 'paused', 'blackout'), { track: 'blackout', play: true });
  assert.deepEqual(musicForFlow('transitionFailed', 'paused', 'blackout'), { track: null, play: false });
});

class FakeAudio {
  currentTime = 0;
  src = '';
  loop = false;
  preload = '';
  volume = 0;
  paused = true;
  plays = 0;
  play(): Promise<void> { this.paused = false; ++this.plays; return Promise.resolve(); }
  pause(): void { this.paused = true; }
  removeAttribute(attribute: string): void { if (attribute === 'src') this.src = ''; }
}

test('title music attempts immediate playback and obeys volume and focus', () => {
  const players: FakeAudio[] = [];
  const music = new BackgroundMusic('./', () => {
    const player = new FakeAudio();
    players.push(player);
    return player;
  });
  music.setScene('intro', true);
  assert.equal(players.length, 2);
  assert.equal(players[0]?.plays, 0);
  assert.equal(players[1]?.plays, 1); // Immediate title attempt, no user gesture.
  assert.equal(players[0]?.preload, 'none');
  assert.equal(players[1]?.preload, 'none');
  music.unlock();
  assert.equal(players[1]?.plays, 1);
  assert.equal(players[1]?.loop, true);
  assert.equal(players[1]?.src, './assets/audio/music/00-intro-osmotic-memory.ogg');
  music.setMasterVolume(0);
  assert.equal(players[1]?.volume, 0);
  music.setMasterVolume(0.5);
  assert.equal(players[1]?.volume, 0.14);
  music.setMusicVolume(0.5); assert.equal(players[1]?.volume, 0.07);
  music.setMusicVolume(0); assert.equal(players[1]?.volume, 0);
  music.setMusicVolume(1); assert.equal(players[1]?.volume, 0.14);
  music.setScene('intro', false);
  assert.equal(players[1]?.paused, true);
  music.setScene('intro', true);
  assert.equal(players[1]?.paused, false);
  music.setFocused(false);
  assert.equal(players[1]?.paused, true);
  music.setFocused(true);
  assert.equal(players[1]?.paused, false);
  music.dispose();
  assert.equal(players[1]?.paused, true);
  assert.equal(players[0]?.src, '');
  assert.equal(players[1]?.src, '');
});

test('track switching streams a second element and releases the previous one', context => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const players: FakeAudio[] = [];
  const music = new BackgroundMusic('./', () => {
    const player = new FakeAudio();
    players.push(player);
    return player;
  });
  music.setScene('intro', true);
  music.unlock();
  music.setScene('containment', true);
  assert.equal(players[0]?.src, './assets/audio/music/01-containment-thought-loop.ogg');
  assert.equal(players[0]?.paused, false);
  context.mock.timers.tick(400);
  assert.equal(players[1]?.paused, true);
  assert.equal(players[0]?.volume, 0.28);
  music.dispose();
});

class AutoplayDeniedAudio extends FakeAudio {
  allowed = false;
  override play(): Promise<void> {
    ++this.plays;
    if (!this.allowed) {
      return Promise.reject(Object.assign(new Error('User gesture required'), { name: 'NotAllowedError' }));
    }
    this.paused = false;
    return Promise.resolve();
  }
}

test('autoplay rejection presents an opt-in until a trusted retry succeeds', async () => {
  const players: AutoplayDeniedAudio[] = [];
  const music = new BackgroundMusic('./', () => {
    const player = new AutoplayDeniedAudio();
    players.push(player);
    return player;
  });
  const blocks: boolean[] = [];
  music.setAutoplayBlockedListener(value => blocks.push(value));
  music.setScene('intro', true);
  await Promise.resolve();
  assert.deepEqual(blocks, [false, true]);
  assert.equal(players[1]?.paused, true);
  players[1]!.allowed = true;
  music.unlock();
  await Promise.resolve();
  assert.equal(players[1]?.paused, false);
  assert.deepEqual(blocks, [false, true, false]);
  assert.equal(players[1]?.plays, 2);
  music.setScene('intro', true);
  assert.equal(players[1]?.plays, 2);
  music.dispose();
});

test('failed playback on a stopped scene never shows the autoplay prompt', async () => {
  const music = new BackgroundMusic('./', () => new AutoplayDeniedAudio());
  const blocks: boolean[] = [];
  music.setAutoplayBlockedListener(value => blocks.push(value));
  music.setScene('intro', true);
  music.setScene(null, false);
  await Promise.resolve();
  assert.deepEqual(blocks, [false]);
  music.dispose();
});

// Cinematic routing exercises the same two streaming players as normal BGM.
import { CinematicMusic, cinematicMusicEvents } from '../src/audio/CinematicMusic.ts';

function cinematicFixture(context: TestContext) {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const players: FakeAudio[] = [];
  const music = new BackgroundMusic('./group-folder/', () => {
    const player = new FakeAudio(); players.push(player); return player;
  });
  const offStart = cinematicMusicEvents.on('started', cue => music.beginCinematic(cue));
  const offStop = cinematicMusicEvents.on('stopped', cue => music.endCinematic(cue));
  context.after(() => { offStart(); offStop(); music.dispose(); });
  const active = () => players.filter(player => !player.paused);
  return { music, players, active };
}

test('all cinematic tracks preempt level music without overlap, loop or duplicate players', context => {
  const f = cinematicFixture(context);
  f.music.setScene('containment', true);
  for (const [track, file, gain] of [
    ['awakening', '04-opening-tension.ogg', 1],
    ['escape', '05-containment-escape-high-tech-lab.ogg', .60],
    ['rescue', '06-cultivation-volt-rescue-digital-slash.ogg', 1.75],
    ['ascent', '08-blackout-elevator-quiet-ascent.ogg', 1.1],
    ['research', '09-blackout-research-the-specimen.ogg', 1.4],
  ] as const) {
    const cue = new CinematicMusic(track, 129);
    cue.update(0);
    assert.equal(f.active().length, 1);
    const player = f.active()[0]!;
    assert.equal(player.src, './group-folder/assets/audio/music/' + file);
    assert.equal(player.loop, false);
    assert.equal(player.currentTime, 0, 'supplied trimmed recordings start at zero, without an additional song offset');
    assert.equal(player.volume, .28 * gain);
    // Normal flow notifications must not reclaim music during an in-level film.
    f.music.setScene('containment', true);
    assert.equal(f.active()[0], player);
    f.music.setMasterVolume(.5); f.music.setMusicVolume(.5);
    assert.equal(player.volume, .28 * gain * .25);
    f.music.setMasterVolume(1); f.music.setMusicVolume(1);
    cue.stop(); f.music.setScene('cultivation', true);
    context.mock.timers.tick(800);
    assert.equal(player.paused, true);
    assert.equal(f.active().length, 1);
    context.mock.timers.tick(400);
    assert.match(f.active()[0]!.src, /02-cultivation/);
    assert.equal(f.active()[0]!.loop, true);
  }
  assert.equal(f.players.length, 2);
});

for (const [track, duration, halfVolume] of [['awakening', 53.2, .14], ['rescue', 129, .245], ['ascent', 70, .154], ['research', 277, .196]] as const) {
test(`${track} media clock seeks, stalls, pause/focus, settings and resume retain ownership through natural completion`, context => {
  const f = cinematicFixture(context);
  f.music.setScene(null, true);
  const cue = new CinematicMusic(track, duration); cue.update(0);
  const player = f.active()[0]!;
  cue.update(12); context.mock.timers.tick(50);
  assert.equal(player.currentTime, 12);
  cue.pause(); context.mock.timers.tick(50); assert.equal(player.paused, true);
  cue.update(12); context.mock.timers.tick(50); assert.equal(player.paused, false);
  f.music.setScene(null, false); assert.equal(player.paused, true);
  cue.update(13); f.music.setScene(null, true); assert.equal(player.paused, false);
  f.music.setFocused(false); assert.equal(player.paused, true);
  cue.update(14); f.music.setFocused(true); assert.equal(player.paused, false);
  context.mock.timers.tick(50); assert.equal(player.currentTime, 14);
  cue.update(3); context.mock.timers.tick(50); assert.equal(player.currentTime, 3);
  context.mock.timers.tick(250); assert.equal(player.paused, true, 'a frozen live clock must pause even with background muting disabled');
  cue.update(3.1); context.mock.timers.tick(50); assert.equal(player.paused, false);
  cue.update(duration - .5); context.mock.timers.tick(50);
  assert.ok(Math.abs(player.volume - halfVolume) < 1e-10, 'last second follows the actual movie clock');
  cue.update(duration); context.mock.timers.tick(800);
  assert.equal(f.active().length, 0);
});
}

test('replay resets to the beginning, stale stop cannot cancel replacement, and disposal clears timers', context => {
  const f = cinematicFixture(context); f.music.setScene('containment', true);
  const first = new CinematicMusic('rescue', 129); first.update(0);
  first.update(30); context.mock.timers.tick(50);
  const second = new CinematicMusic('rescue', 129); second.update(0);
  first.stop(); context.mock.timers.tick(50);
  assert.equal(f.active().length, 1); assert.equal(f.active()[0]!.currentTime, 0);
  f.music.cancelCinematic(); f.music.setScene('intro', true);
  second.stop(); context.mock.timers.tick(800);
  assert.match(f.active()[0]!.src, /00-intro/);
  f.music.dispose(); context.mock.timers.tick(1000);
  assert.equal(f.active().length, 0); assert.ok(f.players.every(player => player.src === ''));
});

test('focus loss during a skip fade cannot resurrect the outgoing cinematic', context => {
  const f = cinematicFixture(context); f.music.setScene('cultivation', true);
  const cue = new CinematicMusic('rescue', 129); cue.update(0); cue.stop();
  f.music.setScene('blackout', true); f.music.setFocused(false);
  context.mock.timers.tick(1000); assert.equal(f.active().length, 0);
  f.music.setFocused(true); assert.equal(f.active().length, 1);
  assert.match(f.active()[0]!.src, /03-blackout/);
});

test('rejected cinematic playback stays silent until gesture retry and cannot stop progression', async context => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const players: AutoplayDeniedAudio[] = [];
  const music = new BackgroundMusic('./', () => { const p = new AutoplayDeniedAudio(); players.push(p); return p; });
  context.after(() => music.dispose());
  music.setScene(null, true);
  const cue = new CinematicMusic('rescue', 129); cue.update(0); music.beginCinematic(cue);
  await Promise.resolve();
  const player = players.find(p => p.src.includes('06-'))!;
  assert.equal(player.paused, true);
  cue.update(2); context.mock.timers.tick(100);
  assert.equal(player.plays, 1, 'do not retry blocked playback every sync tick');
  player.allowed = true; music.unlock(); await Promise.resolve();
  assert.equal(player.paused, false); assert.equal(player.currentTime, 2);
  music.endCinematic(cue); music.dispose();
  context.mock.timers.tick(1000); assert.ok(players.every(p => p.paused));
});

test('completed finales remain silent until flow supplies the destination, including delayed transitions', context => {
  const f = cinematicFixture(context); f.music.setScene('containment', true);
  const cue = new CinematicMusic('escape', 80); cue.update(0); cue.stop();
  context.mock.timers.tick(1600); assert.equal(f.active().length, 0);
  f.music.setScene('cultivation', true); context.mock.timers.tick(400);
  assert.equal(f.active().length, 1); assert.match(f.active()[0]!.src, /02-cultivation/);
});

test('synchronous media failures cannot escape cinematic start or disposal', context => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  class BrokenAudio extends FakeAudio { override play(): Promise<void> { throw new Error('decoder'); } }
  const music = new BackgroundMusic('./', () => new BrokenAudio());
  music.setScene(null, true); const cue = new CinematicMusic('escape', 80); cue.update(0);
  assert.doesNotThrow(() => music.beginCinematic(cue));
  assert.doesNotThrow(() => context.mock.timers.tick(100));
  assert.doesNotThrow(() => { music.endCinematic(cue); music.dispose(); context.mock.timers.tick(1000); });
});
