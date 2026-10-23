import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CONTAINMENT_FINALE_AUDIO_CUES as CUES, containmentDroneFlightSound,
  ContainmentFinaleMovementAudio, containmentProjectileImpactSound, stopContainmentFinaleAudio } from '../src/audio/ContainmentFinaleAudio.ts';
import type { AudioPlayback } from '../src/audio/AudioManager.ts';
import { SOUND_BANKS, SOUND_DEFINITIONS } from '../src/audio/SoundCatalog.ts';
import { CONTAINMENT_FINALE_TIMING as T, finaleTime as F } from '../src/cinematics/ContainmentFinaleTiming.ts';
import { sampleContainmentFinale } from '../src/cinematics/ContainmentFinaleTimeline.ts';

test('escape slime movement follows grounded travel for both actors, not waiting, jumps or drone transport', () => {
  const movement = new ContainmentFinaleMovementAudio();
  const counts = { bob: 0, goop: 0 };
  for (let step = 0; step <= Math.ceil(T.end * 60); step++) {
    const frame = sampleContainmentFinale(step / 60);
    movement.update(frame, (position, volumeScale) => {
      const bob = position === frame.bob;
      counts[bob ? 'bob' : 'goop']++;
      assert.equal(bob ? frame.bobAirborne || frame.bobCharging || frame.latched : frame.goopAirborne || frame.goopCharging, false);
      assert.ok(frame.seconds < 10 || frame.seconds >= T.combat, 'the stationary scan sequence is silent');
      assert.equal(volumeScale, .35);
    });
  }
  assert.ok(counts.bob > 5, 'Bob sounds during his approach and escape');
  assert.ok(counts.goop > 5, 'Goop sounds during the fight and escape');
});

test('escape slime movement does not replay travel on seeks, repeat samples or reset', () => {
  const movement = new ContainmentFinaleMovementAudio();
  const unexpected = () => assert.fail('a seek or initial sample must not sound like walking');
  movement.update(sampleContainmentFinale(0), unexpected);
  movement.update(sampleContainmentFinale(T.chase), unexpected);
  movement.update(sampleContainmentFinale(T.chase), unexpected);
  movement.update(sampleContainmentFinale(3), unexpected);
  movement.reset();
  movement.update(sampleContainmentFinale(T.chase + .1), unexpected);
});

test('escape recordings cover the authored cues and keep the wooden vent on normal Goop dissolution',()=>{
  assert.equal(SOUND_BANKS.escape.length,9);
  for(const sound of SOUND_BANKS.escape)
    assert.equal(readFileSync(new URL(`../public/${SOUND_DEFINITIONS[sound].path}`,import.meta.url)).subarray(0,4).toString(),'OggS');
  assert.deepEqual(CUES.filter(([,sound])=>sound==='escape-drone-scan-01').map(([time])=>time),[T.scanBob,T.scanGoop]);
  assert.deepEqual(CUES.filter(([,sound])=>sound==='escape-scan-result-01').map(([time])=>time),[T.scanBobComplete,T.scanGoopComplete]);
  assert.ok(CUES.some(([time,sound])=>time===T.powerOff&&sound==='escape-power-down-01'));
  assert.ok(CUES.some(([time,sound])=>time===T.cellOpen&&sound==='escape-cell-hatch-open-01'));
  assert.ok(CUES.some(([time,sound])=>time===T.terminate&&sound==='escape-termination-warning-01'));
  assert.ok(CUES.some(([time,sound])=>time===T.droneHit&&sound==='escape-drone-destruction-01'));
  assert.ok(CUES.some(([time,sound])=>time===T.doorOpen&&sound==='goop-dissolve-complete-01'));
  assert.deepEqual(CUES.filter(([,sound])=>sound==='escape-shaft-fall-01').map(([time])=>time),[T.goopDive,T.bobDive]);
  assert.equal(containmentDroneFlightSound(T.latch-.01),'world-drone-flight-loop-01');
  assert.equal(containmentDroneFlightSound(T.latch),'escape-drone-strain-loop-01');
  assert.equal(containmentDroneFlightSound(F(56.8)),'world-drone-flight-loop-01');
});

test('surface hits sound once without false near-miss impacts, and cleanup releases only the escape sounds and loops',()=>{
  assert.equal(containmentProjectileImpactSound({green:false,to:[0,74.85,110]}),'escape-projectile-metal-impact-01');
  assert.equal(containmentProjectileImpactSound({green:false,to:[1,76,125.14]}),'escape-projectile-metal-impact-01');
  assert.equal(containmentProjectileImpactSound({green:false,to:[0,90,110]}),undefined);
  assert.equal(containmentProjectileImpactSound({green:false,to:[0,74.8,142],ductNearMiss:true}),undefined);
  assert.equal(containmentProjectileImpactSound({green:true,to:[0,74.85,110]}),undefined,'the scripted fatal acid hit has its own destruction cue');
  assert.equal(containmentProjectileImpactSound({green:true,to:[0,90,110],impact:{normal:[0,1,0],objectName:'wall'}}),'goop-projectile-impact-01');
  const loops:string[]=[],sounds:string[]=[];
  stopContainmentFinaleAudio({stopLoop(key:string){loops.push(key);},stopSound(sound:string){sounds.push(sound);}} as AudioPlayback);
  assert.deepEqual(loops,['containment-finale-alarm','containment-finale-flight','containment-finale-door']);
  assert.deepEqual(sounds,SOUND_BANKS.escape);
});
