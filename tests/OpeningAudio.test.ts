import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { OpeningAudio } from '../src/audio/OpeningAudio.ts';
import type { AudioPlayback } from '../src/audio/AudioManager.ts';
import { SOUND_BANKS, SOUND_DEFINITIONS, type SoundId } from '../src/audio/SoundCatalog.ts';
import { OPENING_GAME_TIMING as T } from '../src/cinematics/OpeningGameTimeline.ts';

class Playback implements AudioPlayback {
  cues: SoundId[] = [];
  loops = new Map<string, {sound:SoundId;scale:number}>();
  stopped: SoundId[] = [];
  paused = true;
  play(sound:SoundId) { this.cues.push(sound); }
  startLoop(key:string,sound:SoundId,_position?:unknown,scale=1) { this.loops.set(key,{sound,scale}); }
  stopLoop(key:string) { this.loops.delete(key); }
  stopSound(sound:SoundId) { this.stopped.push(sound); }
  stopAll() { throw new Error('Intro cleanup must not stop unrelated game audio.'); }
  setPaused(paused:boolean) { this.paused=paused; }
  setListener() {}
}

test('the full intro varies camera recordings, synchronizes cracks/impact/reforming and cleans up at the end',()=>{
  const playback=new Playback(),audio=new OpeningAudio(playback);
  assert.equal(SOUND_BANKS.intro.length,14);
  for(const id of SOUND_BANKS.intro)
    assert.equal(readFileSync(new URL(`../public/${SOUND_DEFINITIONS[id].path}`,import.meta.url)).subarray(0,4).toString(),'OggS');
  for(let frame=0;frame<=T.end*30;frame++){
    const time=frame/30;audio.update(time);
    if(time<T.impact)assert.ok(!playback.cues.includes('intro-egg-break-impact-01'));
    if(time<T.formStart)assert.ok(!playback.cues.includes('intro-bob-reform-01'));
    if(time===10)assert.equal(playback.loops.get('opening:lab')?.scale,1);
  }
  assert.equal(playback.cues.filter(sound=>sound==='intro-egg-crack-01').length,3);
  assert.deepEqual(playback.cues.filter(sound=>sound.startsWith('intro-camera-')),
    ['intro-camera-servo-01','intro-camera-servo-02','intro-camera-servo-03','intro-camera-servo-01']);
  for(const sound of SOUND_BANKS.intro.filter(id=>!SOUND_DEFINITIONS[id].loop))assert.ok(playback.cues.includes(sound),sound);
  assert.equal(playback.cues.filter(sound=>sound==='intro-egg-break-impact-01').length,1);
  assert.equal(playback.loops.size,0);
  assert.deepEqual(playback.stopped,SOUND_BANKS.intro);
});

test('pause resumes existing ownership; repeated frames, seeks, skips and disposal never replay queued sounds',()=>{
  const playback=new Playback(),audio=new OpeningAudio(playback);
  for(let frame=0;frame<=180;frame++)audio.update(frame/30);
  const count=playback.cues.length;
  audio.update(6);assert.equal(playback.cues.length,count);
  audio.pause();assert.equal(playback.paused,true);
  audio.update(6);assert.equal(playback.paused,false);assert.equal(playback.cues.length,count);
  audio.update(T.impact+1);assert.equal(playback.cues.length,count,'a seek cannot replay every skipped event');
  audio.stop();audio.stop();audio.update(T.formEnd);
  assert.equal(playback.cues.length,count);assert.equal(playback.loops.size,0);
  assert.deepEqual(playback.stopped,SOUND_BANKS.intro,'cleanup stops only the intro clips, once');
});
