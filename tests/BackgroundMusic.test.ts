import { strict as assert } from 'node:assert';
import test from 'node:test';
import { BackgroundMusic, musicForFlow } from '../src/audio/BackgroundMusic.ts';

test('soundtrack follows menu origin, pause, opening, and three gameplay levels', () => {
  assert.deepEqual(musicForFlow('loading', 'title', 'containment'), { track: null, play: false });
  assert.deepEqual(musicForFlow('title', 'title', 'containment'), { track: 'intro', play: true });
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

test('track switching streams a second element and releases the previous one', async () => {
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
  await new Promise(resolve => setTimeout(resolve, 455));
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
