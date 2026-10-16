import assert from 'node:assert/strict';
import test from 'node:test';
import { ContainmentSoundscape, type ContainmentAudioState } from '../src/audio/ContainmentSoundscape.ts';
import type { AudioPlayback } from '../src/audio/AudioManager.ts';
import type { SoundId } from '../src/audio/SoundCatalog.ts';

test('Containment preview follows real checkpoint, identity and laser changes; recovery stays silent', () => {
  const loops = new Map<string, SoundId>();
  const cues: SoundId[] = [];
  const fades: number[] = [];
  const audio: AudioPlayback = {
    play: sound => { cues.push(sound); },
    startLoop: (key, sound) => { loops.set(key, sound); },
    stopLoop: (key, fade = 0) => { loops.delete(key); fades.push(fade); },
    stopAll: () => loops.clear(), setPaused() {}, setListener() {},
  };
  const laser = { id: 'beam', enabled: false, start: { x: 0, y: 12, z: 55 } };
  let state: ContainmentAudioState = { roomId: 1, checkpointId: 'spawn', activeSlimeId: 'bob', playing: true, lasers: [laser] };
  const soundscape = new ContainmentSoundscape(audio, () => state);
  soundscape.update(); soundscape.update();
  assert.equal(loops.size, 3);
  assert.deepEqual(cues, []);
  state = { ...state, roomId: 2, checkpointId: 'room-2' };
  soundscape.update(); soundscape.update();
  assert.deepEqual(cues, ['lab-checkpoint']);
  assert.equal(loops.has('containment:machine'), false);
  state = { ...state, roomId: 3, checkpointId: 'room-3' };
  soundscape.update();
  laser.enabled = true; soundscape.update(); soundscape.update();
  laser.enabled = false; soundscape.update();
  assert.deepEqual(cues, ['lab-checkpoint', 'lab-checkpoint', 'lab-laser-on', 'lab-laser-off']);
  state = { ...state, activeSlimeId: 'goop' }; soundscape.update();
  assert.equal(cues.at(-1), 'lab-switch');
  const count = cues.length;
  state = { ...state, checkpointId: 'spawn', roomId: 1, activeSlimeId: 'bob' };
  laser.enabled = true; soundscape.reset(); soundscape.update();
  assert.equal(cues.length, count, 'restoration must not sound like a puzzle success');
  state = { ...state, playing: false }; soundscape.update();
  assert.deepEqual([...loops.keys()], ['containment:score'], 'death silences the environment and retains music');
  state = { ...state, playing: true, roomId: 4 }; soundscape.update();
  assert.equal(loops.size, 0, 'the preview must not follow the player into later rooms or levels');
  assert.ok(fades.includes(1.5));
  soundscape.dispose();
  state = { ...state, roomId: 1 }; soundscape.update();
  assert.equal(loops.size, 0);
});
