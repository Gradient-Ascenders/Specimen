import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { BackgroundMusic } from '../src/audio/BackgroundMusic.ts';
import { BossMusic, bossMusicEvents } from '../src/audio/BossMusic.ts';
import { CinematicMusic } from '../src/audio/CinematicMusic.ts';

class Media {
  private source = '';
  get src(): string { return this.source; }
  set src(value: string) { this.source = value; this.currentTime = 0; }
  currentTime = 0;
  paused = true;
  loop = false;
  preload = '';
  volume = 0;
  plays = 0;
  allowed = true;
  play(): Promise<void> {
    this.plays++;
    if (!this.allowed) return Promise.reject(Object.assign(new Error('gesture required'), { name: 'NotAllowedError' }));
    this.paused = false; return Promise.resolve();
  }
  pause(): void { this.paused = true; }
  removeAttribute(): void { this.src = ''; }
}

function fixture(context: TestContext) {
  context.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  context.mock.method(performance, 'now', () => Date.now());
  const players: Media[] = [];
  const music = new BackgroundMusic('./group-folder/', () => { const p = new Media(); players.push(p); return p; });
  const off = [bossMusicEvents.on('started', cue => music.beginBoss(cue)),
    bossMusicEvents.on('defeated', cue => music.defeatBoss(cue)),
    bossMusicEvents.on('stopped', cue => music.stopBoss(cue))];
  context.after(() => { off.forEach(unsubscribe => unsubscribe()); music.dispose(); });
  music.setScene('blackout', true);
  const cue = new BossMusic();
  const active = () => players.filter(p => !p.paused);
  return { players, music, cue, active };
}

test('combat owns one native loop at zero, retains its position across notifications, pause and focus', context => {
  const f = fixture(context);
  assert.equal(f.players.some(p => p.src.includes('07-blackout')), false, 'exploration does not request boss music');
  f.cue.start();
  assert.equal(f.active().length, 1);
  const player = f.active()[0]!;
  assert.equal(player.src, './group-folder/assets/audio/music/07-blackout-boss-a-flawless-getaway.ogg');
  assert.equal(player.loop, true); assert.equal(player.currentTime, 0); assert.equal(player.volume, .28);
  player.currentTime = 75;
  f.cue.start(); f.music.beginBoss(f.cue); f.music.setScene('blackout', true);
  assert.equal(player.currentTime, 75); assert.equal(player.plays, 1);
  f.music.setScene('blackout', false); assert.equal(player.paused, true);
  f.music.setScene('blackout', true); assert.equal(player.currentTime, 75); assert.equal(player.paused, false);
  f.music.setFocused(false); assert.equal(player.paused, true);
  f.music.setFocused(true); assert.equal(player.currentTime, 75); assert.equal(player.paused, false);
  f.music.setMasterVolume(.5); f.music.setMusicVolume(.5); assert.equal(player.volume, .07);
  f.music.setMusicVolume(0); assert.equal(player.volume, 0);
  f.music.setMusicVolume(1); f.music.setMasterVolume(1); assert.equal(player.volume, .28);
  context.mock.timers.tick(180_000);
  assert.equal(player.currentTime, 75, 'no gameplay timer seeks or restarts the native loop');
  assert.equal(player.plays, 3); assert.equal(f.players.length, 2);
});

test('defeat fades for 2.5 seconds, honors sliders and pause/focus, then releases music', context => {
  const f = fixture(context); f.cue.start(); const player = f.active()[0]!;
  f.cue.defeat(); f.cue.defeat(); context.mock.timers.tick(1250);
  assert.ok(Math.abs(player.volume - .14) < 1e-10);
  f.music.setMasterVolume(.5); context.mock.timers.tick(25);
  assert.ok(Math.abs(player.volume - .28 * .5 * .49) < 1e-10);
  f.music.setScene(null, false); assert.equal(player.paused, true);
  f.music.setFocused(false); context.mock.timers.tick(250);
  f.music.setScene(null, true); assert.equal(player.paused, true);
  f.music.setFocused(true); assert.equal(player.paused, false);
  assert.ok(player.volume < .07, 'resume must not undo a victory fade');
  context.mock.timers.tick(975);
  assert.equal(f.active().length, 0);
  f.music.unlock(); assert.equal(f.active().length, 0);
});

test('unmuting during victory restores only the remaining fade envelope', context => {
  const f = fixture(context); f.music.setMusicVolume(0); f.cue.start();
  const player = f.active()[0]!; player.currentTime = 90;
  f.cue.defeat(); context.mock.timers.tick(500);
  assert.equal(player.volume, 0);
  f.music.setMusicVolume(.5); context.mock.timers.tick(25);
  assert.ok(Math.abs(player.volume - .28 * .5 * .79) < 1e-10);
  assert.equal(player.currentTime, 90); assert.equal(player.plays, 1);
  context.mock.timers.tick(1975); assert.equal(f.active().length, 0);
});

test('a delayed timer callback still completes victory fade after 2.5 elapsed seconds', context => {
  const f = fixture(context); f.cue.start(); f.cue.defeat();
  context.mock.method(performance, 'now', () => 2500);
  context.mock.timers.tick(25);
  assert.equal(f.active().length, 0, 'heavy rendering must not require 100 delivered timer callbacks');
});

for (const ending of ['death', 'defeat'] as const) {
  test(`${ending} then retry creates a fresh loop; stale stops and fades cannot affect it`, context => {
    const f = fixture(context); f.cue.start(); f.active()[0]!.currentTime = 120;
    if (ending === 'defeat') { f.cue.defeat(); context.mock.timers.tick(1000); }
    f.cue.stop(); assert.equal(f.active().length, 0);
    for (let retry = 0; retry < 4; retry++) {
      const next = new BossMusic(); next.start(); const player = f.active()[0]!;
      assert.equal(player.currentTime, 0); assert.equal(player.volume, .28);
      f.music.stopBoss(f.cue); context.mock.timers.tick(3000);
      assert.equal(f.active().length, 1); assert.equal(player.paused, false);
      player.currentTime = 12; next.stop(); next.stop();
    }
    assert.equal(f.players.length, 2);
  });
}

test('abandonment, cinematic takeover and disposal cancel victory fades and cannot resurrect boss audio', context => {
  const f = fixture(context); f.cue.start(); f.cue.defeat(); context.mock.timers.tick(500);
  f.music.cancelBoss(); f.music.setScene('intro', true); context.mock.timers.tick(3000);
  assert.equal(f.active().length, 1); assert.match(f.active()[0]!.src, /00-intro/);
  const second = new BossMusic(); second.start(); second.defeat();
  const film = new CinematicMusic('rescue', 129); film.update(0); f.music.beginCinematic(film);
  second.stop(); context.mock.timers.tick(50);
  assert.equal(f.active().length, 1); assert.match(f.active()[0]!.src, /06-cultivation/); assert.equal(f.active()[0]!.loop, false);
  f.music.dispose(); context.mock.timers.tick(10_000);
  assert.equal(f.active().length, 0); assert.ok(f.players.every(p => p.src === ''));
});

test('autoplay rejection waits for a gesture without losing native looping or ownership', async context => {
  const f = fixture(context); f.players.forEach(p => { p.allowed = false; }); f.cue.start();
  await Promise.resolve(); const player = f.players.find(p => p.src.includes('07-blackout'))!;
  assert.equal(player.paused, true); const attempts = player.plays;
  f.music.setScene('blackout', true); context.mock.timers.tick(1000); assert.equal(player.plays, attempts);
  player.allowed = true; f.music.unlock(); await Promise.resolve();
  assert.equal(player.paused, false); assert.equal(player.loop, true); assert.equal(player.currentTime, 0);
});
