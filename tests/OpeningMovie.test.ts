import { cinematicMusicEvents, type CinematicMusic } from '../src/audio/CinematicMusic.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OpeningMoviePresentation, type OpeningMoviePresentationOptions } from '../src/cinematics/OpeningMoviePresentation.ts';

const flushPromises = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred() {
  let resolve!: () => void, reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  class Video extends EventTarget {
    className = ''; tabIndex = 0; playsInline = false; muted = false;
    preload = ''; controls = true; hidden = false; src = ''; currentTime = 0;
    plays = 0; pauses = 0; loads = 0; removed = false; rejectPlay = false;
    setAttribute() {}
    removeAttribute(name: string) { if (name === 'src') this.src = ''; }
    load() { this.loads++; }
    play() { this.plays++; return this.rejectPlay ? Promise.reject(new Error('autoplay')) : Promise.resolve(); }
    pause() { this.pauses++; }
    remove() { this.removed = true; }
    emit(name: string) { this.dispatchEvent(new Event(name)); }
  }
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const host = { dataset: {} as Record<string, string>, ownerDocument: doc };
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const fades: number[] = [], statuses: { message: string; failed: boolean }[] = [];
  const ready = deferred();
  let levelPromise = ready.promise;
  let id = 0, blackouts = 0, levelLoads = 0, completions = 0, clockTime = 0;
  const video = new Video();
  const options = {
    host, videoHost: { prepend() {} }, source: 'opening.mp4', sourceStartSeconds: .8,
    window: {
      performance: { now: () => clockTime },
      requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; },
      cancelAnimationFrame: (frame: number) => frames.delete(frame),
      setTimeout: (callback: () => void, delay: number) => {
        const timer = ++id;
        timers.set(timer, { callback: () => { timers.delete(timer); callback(); }, delay });
        return timer;
      },
      clearTimeout: (timer: number) => timers.delete(timer),
    },
    createVideo: () => video,
    onBlackout: () => { assert.equal(fades.at(-1), 1); blackouts++; },
    prepareLevel: () => { levelLoads++; return levelPromise; },
    onComplete: () => { completions++; },
    onStatus: (message: string, failed: boolean) => statuses.push({ message, failed }),
    onFade: (fade: number) => fades.push(fade),
  };
  const player = new OpeningMoviePresentation(options as unknown as OpeningMoviePresentationOptions);
  const flushFrames = () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); };
  const blackout = () => { for (let i = 0; i < 9; i++) player.render(.1); flushFrames(); flushFrames(); };
  const playing = async () => { player.start(); blackout(); video.emit('playing'); flushFrames(); flushFrames(); await flushPromises(); };
  return { player, video, host, doc, frames, timers, fades, statuses, ready, flushFrames, blackout, playing,
    advance: (ms: number) => { clockTime += ms; },
    counts: () => ({ blackouts, levelLoads, completions }),
    setLevelPromise: (promise: Promise<void>) => { levelPromise = promise; } };
}

test('MP4 starts after a painted menu blackout and full Level 1 preparation overlaps native playback', async () => {
  const f = fixture(); f.player.start(); f.player.start();
  assert.equal(f.video.loads, 1); assert.equal(f.video.muted, true); assert.equal(f.video.hidden, true);
  assert.equal(f.host.dataset.openingMode, 'video');
  for (let i = 0; i < 9; i++) f.player.render(.1);
  assert.equal(f.fades.at(-1), 1); assert.equal(f.video.plays, 0);
  f.flushFrames(); assert.equal(f.counts().blackouts, 0);
  f.flushFrames(); assert.equal(f.counts().blackouts, 1); assert.equal(f.video.plays, 1);
  assert.equal(f.counts().levelLoads, 0);
  f.video.emit('playing'); assert.equal(f.fades.at(-1), 0);
  f.flushFrames(); assert.equal(f.counts().levelLoads, 0);
  f.flushFrames(); await flushPromises(); assert.equal(f.counts().levelLoads, 1);
  f.video.currentTime = 10; f.player.render(.016);
  assert.equal(f.host.dataset.openingStage, 'experiments');
  assert.equal(f.host.dataset.openingState, 'playing');
  f.ready.resolve(); await flushPromises();
  assert.equal(f.counts().completions, 0, 'Ready gameplay must not cut the movie short.');
  f.video.emit('playing'); f.flushFrames(); f.flushFrames(); await flushPromises();
  assert.equal(f.counts().levelLoads, 1, 'Resume/playing events cannot duplicate preparation.');
  f.video.emit('ended'); assert.equal(f.counts().completions, 1);
  f.video.emit('ended'); f.player.skip(); assert.equal(f.counts().completions, 1);
  f.player.dispose();
});

test('MP4 end holds black when Level 1 is late and completes exactly once after readiness', async () => {
  const f = fixture(); await f.playing();
  f.video.emit('ended'); f.player.render(.016);
  assert.equal(f.counts().completions, 0);
  assert.equal(f.host.dataset.openingStage, 'complete');
  assert.equal(f.host.dataset.openingState, 'waiting'); assert.equal(f.fades.at(-1), 1);
  assert.equal(f.statuses.at(-1)?.message, 'Preparing Level 1…');
  f.ready.resolve(); await flushPromises();
  assert.equal(f.counts().completions, 1); f.player.dispose();
});

test('immediate Skip never waits for a media download and paints before loading gameplay', async () => {
  const f = fixture(); f.player.start(); f.player.skip(); f.player.skip();
  assert.equal(f.counts().levelLoads, 0); assert.equal(f.fades.at(-1), 1);
  f.flushFrames(); assert.equal(f.counts().blackouts, 0);
  f.flushFrames(); assert.equal(f.counts().blackouts, 1);
  f.flushFrames(); f.flushFrames(); await flushPromises();
  assert.equal(f.counts().levelLoads, 1); assert.equal(f.video.plays, 0);
  f.video.emit('playing'); assert.equal(f.fades.at(-1), 1);
  f.ready.resolve(); await flushPromises(); assert.equal(f.counts().completions, 1);
  f.player.dispose();
});

test('autoplay rejection can be retried or skipped without starting another Level 1 load', async () => {
  const f = fixture(); f.video.rejectPlay = true;
  f.player.start(); f.blackout(); await flushPromises();
  f.flushFrames(); f.flushFrames(); await flushPromises();
  assert.equal(f.host.dataset.openingState, 'failed'); assert.equal(f.counts().levelLoads, 1);
  f.video.rejectPlay = false; f.player.retry(); f.video.emit('playing');
  assert.equal(f.host.dataset.openingState, 'playing');
  assert.equal(f.video.plays, 2);
  f.video.emit('error'); assert.equal(f.host.dataset.openingState, 'failed');
  f.ready.resolve(); await flushPromises(); assert.equal(f.counts().completions, 0);
  f.player.skip(); assert.equal(f.counts().completions, 1);
  assert.equal(f.counts().levelLoads, 1); f.player.dispose();
});

test('Level 1 failure can retry after the movie, while playback never restarts', async () => {
  const f = fixture(); await f.playing();
  f.ready.reject(new Error('model')); await flushPromises();
  assert.equal(f.host.dataset.openingState, 'failed');
  f.video.emit('ended'); assert.equal(f.counts().completions, 0);
  const retry = deferred(); f.setLevelPromise(retry.promise);
  f.player.retry(); f.flushFrames(); f.flushFrames(); await flushPromises();
  assert.equal(f.counts().levelLoads, 2); assert.equal(f.video.plays, 1);
  retry.resolve(); await flushPromises(); assert.equal(f.counts().completions, 1);
  f.player.dispose();
});

test('hidden tabs pause the movie and resume only an unfinished, non-skipped intro', async () => {
  const f = fixture(); await f.playing();
  f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.video.pauses, 1);
  f.doc.hidden = false; f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.video.plays, 2);
  f.player.skip(); f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.video.plays, 2); f.player.dispose();
});

test('a delayed rejection from the hidden-tab playback cannot fail a successful resume', async () => {
  const f = fixture();
  const oldPlayback = deferred();
  f.video.play = () => { f.video.plays++; return oldPlayback.promise; };
  f.player.start(); f.blackout();
  f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange'));
  f.video.play = () => { f.video.plays++; return Promise.resolve(); };
  f.doc.hidden = false; f.doc.dispatchEvent(new Event('visibilitychange'));
  f.video.emit('playing');
  f.flushFrames(); f.flushFrames(); await flushPromises();
  oldPlayback.reject(Object.assign(new Error('Playback interrupted by pause'), { name: 'AbortError' }));
  await flushPromises();
  assert.equal(f.video.plays, 2);
  assert.equal(f.host.dataset.openingState, 'playing');
  assert.equal(f.statuses.at(-1)?.failed, false);
  f.ready.resolve(); await flushPromises();
  f.video.emit('ended');
  assert.equal(f.counts().completions, 1);
  f.player.dispose();
});

test('warm-up slices are paced during video and released on Skip/disposal', async () => {
  const f = fixture(); await f.playing();
  let yielded = false;
  void f.player.yieldPreparation().then(() => { yielded = true; });
  assert.equal([...f.timers.values()][0].delay, 80); await flushPromises(); assert.equal(yielded, false);
  f.player.skip(); await flushPromises(); assert.equal(yielded, true); assert.equal(f.timers.size, 0);
  let disposedYield = false;
  void f.player.yieldPreparation().then(() => { disposedYield = true; });
  assert.equal([...f.timers.values()][0].delay, 0);
  f.player.dispose(); f.player.dispose(); await flushPromises();
  assert.equal(disposedYield, true); assert.equal(f.video.removed, true); assert.equal(f.video.src, '');
  assert.deepEqual(f.host.dataset, {}); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
  f.ready.resolve(); await flushPromises(); assert.equal(f.counts().completions, 0);
  f.video.emit('error'); f.video.emit('ended'); assert.deepEqual(f.host.dataset, {});
});

test('dispose before blackout cancels queued title release, playback and gameplay work', async () => {
  const f = fixture(); f.player.start(); f.player.skip(); f.player.dispose();
  f.flushFrames(); f.flushFrames(); await flushPromises();
  assert.deepEqual(f.counts(), { blackouts: 0, levelLoads: 0, completions: 0 });
  assert.equal(f.video.plays, 0);
});

test('small upload slices yield one video frame; costly jobs give playback extra recovery time', async () => {
  const f = fixture(); await f.playing();
  const first = f.player.yieldPreparation();
  const firstJob = [...f.timers.values()][0]; assert.equal(firstJob.delay, 80);
  firstJob.callback(); await first;
  f.advance(2);
  const cheap = f.player.yieldPreparation();
  const cheapJob = [...f.timers.values()][0]; assert.equal(cheapJob.delay, 33);
  cheapJob.callback(); await cheap;
  f.advance(25);
  const expensive = f.player.yieldPreparation();
  assert.equal([...f.timers.values()][0].delay, 80);
  f.player.dispose(); await expensive;
});

test('MP4 music begins with visible media and tracks stalls, seeks, errors and skip', async () => {
  const cues: CinematicMusic[] = [], stopped: CinematicMusic[] = [];
  const offs = [cinematicMusicEvents.on('started', cue => cues.push(cue)), cinematicMusicEvents.on('stopped', cue => stopped.push(cue))];
  const f = fixture();
  try {
    f.player.start(); f.blackout(); assert.equal(cues.length, 0);
    f.video.emit('playing'); assert.equal(cues.length, 1);
    const cue = cues[0]!; assert.equal(cue.track, 'awakening');
    f.video.currentTime = 22; f.player.render(.016); assert.equal(cue.seconds, 22);
    for (const event of ['waiting', 'pause', 'seeking']) {
      f.video.emit(event); assert.equal(cue.playing, false);
      f.video.currentTime = 5; f.video.emit('playing'); assert.equal(cue.playing, true); assert.equal(cue.seconds, 5);
    }
    assert.equal(cues.length, 1, 'resume is the same ownership session');
    f.video.emit('error'); assert.equal(cue.playing, false);
    f.player.retry(); f.video.currentTime = 0; f.video.emit('playing');
    assert.equal(cue.seconds, 0); assert.equal(cues.length, 1);
    f.player.skip(); f.player.dispose(); assert.deepEqual(stopped, [cue]);
    assert.equal(f.video.muted, true);
  } finally { f.player.dispose(); offs.forEach(off => off()); }
});
