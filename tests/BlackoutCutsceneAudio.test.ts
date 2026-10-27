import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BlackoutElevatorAudio, BlackoutResearchAudio, CutsceneMovementAudio } from '../src/audio/BlackoutCutsceneAudio.ts';
import { gameplayAudioEvents, type AudioPosition } from '../src/audio/GameplayAudioEvents.ts';
import { BLACKOUT_CUTSCENE_SOUND_IDS, SOUND_BANKS, SOUND_DEFINITIONS, type SoundId } from '../src/audio/SoundCatalog.ts';
import { ELEVATOR_TIMING as E } from '../src/cinematics/BlackoutElevatorTimeline.ts';
import { RESEARCH_TIMING as T, RESEARCH_LIGHT_FAILURES, sampleResearchSlime, sampleResearchSpecimenWorld, researchDroneDeathTime } from '../src/cinematics/BlackoutResearchTimeline.ts';
import { sampleResearchDronePosition } from '../src/cinematics/BlackoutResearchFlight.ts';
import { RESEARCH_WING_ORIGIN as ORIGIN } from '../src/cinematics/BlackoutResearchLayout.ts';
import { BlackoutResearchEffects } from '../src/cinematics/BlackoutResearchEffects.ts';

function capture() {
  let time=0;
  const cues:{time:number;sound:SoundId;position?:AudioPosition;volume:number}[]=[],stopped:SoundId[]=[],loops=new Map<string,{sound:SoundId;rate:number;volume:number}>();
  const off=[gameplayAudioEvents.on('cue',c=>cues.push({time,sound:c.sound,position:c.position && {...c.position},volume:c.volumeScale??1})),
    gameplayAudioEvents.on('loop',c=>loops.set(c.key,{sound:c.sound,rate:c.playbackRate??1,volume:c.volumeScale??1})),
    gameplayAudioEvents.on('stop',c=>loops.delete(c.key)),gameplayAudioEvents.on('stopSound',c=>stopped.push(c.sound))];
  return {cues,loops,stopped,set time(t:number){time=t;},count:(sound:SoundId)=>cues.filter(c=>c.sound===sound).length,
    dispose:()=>off.forEach(f=>f())};
}
const boss={x:0,y:18,z:300};

test('the 17 selected recordings and reused destruction clip stay in Blackout; Goop power failure reuses its original file',()=>{
  assert.equal(BLACKOUT_CUTSCENE_SOUND_IDS.length,18);
  const report=JSON.parse(readFileSync(new URL('../docs/assets/blackout-cutscene-audio-import.json',import.meta.url),'utf8'));
  assert.equal(report.clips.length,17); assert.equal(report.archive,'latest-cutcenes.tar');
  assert.ok(!report.clips.some((c:{id:string})=>c.id.includes('power-failure')));
  for(const id of BLACKOUT_CUTSCENE_SOUND_IDS) {
    assert.ok(SOUND_BANKS.blackout.includes(id)); assert.ok(!SOUND_BANKS.containment.includes(id)); assert.ok(!SOUND_BANKS.cultivation.includes(id));
    assert.equal(readFileSync(new URL(`../public/${SOUND_DEFINITIONS[id].path}`,import.meta.url)).subarray(0,4).toString(),'OggS');
  }
  assert.deepEqual(BLACKOUT_CUTSCENE_SOUND_IDS.filter(id=>SOUND_DEFINITIONS[id].loop).sort(),
    ['blackout-lift-travel-loop-01','research-fusion-charge-loop-01','research-pit-retract-loop-01']);
});

test('lift audio matches power, three-second ramps and doors, stays still on a repeated frame and cleans up only its own sounds',()=>{
  const audio=new BlackoutElevatorAudio(),c=capture();
  try {
    for(let n=-240;n<=55*60;n++) {
      const t=n/60;c.time=t;audio.update(t-1/60,t);
      if(t===E.lift+.5) {assert.equal(c.loops.get('blackout-elevator-motor')?.sound,'blackout-lift-travel-loop-01');assert.ok(c.loops.get('blackout-elevator-motor')!.rate<1);}
      if(t===E.arrival) assert.equal(c.loops.has('blackout-elevator-motor'),false);
    }
    assert.equal(c.count('volt-shoot-01'),3);assert.equal(c.count('blackout-lift-power-restore-01'),1);
    assert.equal(c.cues.find(c=>c.sound==='blackout-lift-start-01')!.time,E.lift);
    assert.equal(c.cues.find(c=>c.sound==='blackout-lift-stop-01')!.time,E.arrival-3);
    assert.equal(c.count('world-door-stop-01'),2);
    const count=c.cues.length;audio.update(54,55);assert.equal(c.cues.length,count);
    audio.stop();assert.equal(c.loops.size,0);assert.ok(c.stopped.includes('blackout-lift-stop-01'));
    assert.ok(!c.stopped.includes('boss-final-explosion-01'));
  } finally {audio.stop();c.dispose();}
});

test('research sound follows the authored light, transformation, door impact, fall and pit beats and reuses power-down once',()=>{
  const audio=new BlackoutResearchAudio(),c=capture();
  try {
    for(let n=1;n<=T.duration*60;n++) {const t=n/60;c.time=t;audio.update((n-1)/60,t,boss);}
    assert.equal(c.count('escape-power-down-01'),1);
    assert.ok(Math.abs(c.cues.find(c=>c.sound==='escape-power-down-01')!.time-T.blackout)<.02);
    const lamps=c.cues.filter(c=>c.sound==='research-light-rupture-01');assert.equal(lamps.length,4);
    lamps.forEach((cue,i)=>assert.ok(cue.time>=RESEARCH_LIGHT_FAILURES[i]!.at && cue.time-RESEARCH_LIGHT_FAILURES[i]!.at<.02));
    for(const [sound,at] of [['research-slime-fusion-01',T.attraction],['research-fusion-burst-01',T.fusion+.8],
      ['research-door-breach-01',T.doorBlast+.25],['research-glass-shatter-01',T.glass],['research-shaft-fall-01',T.fall],
      ['research-specimen-land-01',T.landing],['research-pit-unlock-01',T.pitUnlock],['research-pit-stop-01',T.pitClear]] as const) {
      assert.equal(c.count(sound),1,sound); const cue=c.cues.find(c=>c.sound===sound)!; assert.ok(cue.time>=at && cue.time-at<.02,sound);
    }
    assert.equal(c.count('specimen-heavy-blast-01'),2); assert.equal(c.count('research-drone-destroy-01'),12);
    c.cues.filter(c=>c.sound==='research-drone-destroy-01').forEach((cue,i)=>assert.ok(Math.abs(cue.time-researchDroneDeathTime(i))<.02));
    assert.ok(c.count('boss-drone-shot-01')>20); assert.equal(c.count('boss-emergence-01'),1);
    assert.ok(c.cues.filter(c=>c.sound==='boss-drone-shot-01').every(c=>c.volume===.15),
      'only research firing uses the quieter cinematic mix; every authored shot is still emitted');
    assert.ok(!c.cues.some(c=>c.sound==='world-vent-break-01' || c.sound==='world-platform-land-01'));
    assert.deepEqual([...c.loops.keys()],['research-boss-hover']);
    audio.stop();assert.equal(c.loops.size,0);assert.ok(c.stopped.includes('escape-power-down-01'));
  } finally {audio.stop();c.dispose();}
});

test('drone absorption sounds start on visible contact rather than when projectiles leave the muzzles',()=>{
  const audio=new BlackoutResearchAudio(),c=capture(),fx=new BlackoutResearchEffects();
  const actors=[0,1,2].map(()=>({position:new THREE.Vector3()})),specimen=new THREE.Vector3(),drones=Array.from({length:12},()=>new THREE.Vector3());
  let impacts=0;
  try {
    for(let n=Math.ceil((T.reveal+.5)*120);n<(T.reveal+3)*120;n++) {
      const t=n/120;c.time=t;const before=c.count('research-energy-absorb-01');audio.update(t-1/120,t,boss);
      actors.forEach((a,i)=>{sampleResearchSlime((['bob','goop','volt'] as const)[i]!,t,a.position);a.position.add(ORIGIN);});
      sampleResearchSpecimenWorld(t,specimen);drones.forEach((p,i)=>sampleResearchDronePosition(i,t,p));fx.present(t,actors,specimen,drones);
      if(c.count('research-energy-absorb-01')>before) {assert.ok(fx.diagnostics.absorbedShots>0);impacts++;}
    }
    assert.ok(impacts>5);
  } finally {audio.stop();c.dispose();fx.dispose();}
});

test('skip cleanup releases fusion, pit, flight and long one-shots without emitting skipped events; reset permits a clean replay',()=>{
  for(const t of [T.crossfire+4,T.fusion+1,T.fall+.2,T.pitOpen+1]) {
    const audio=new BlackoutResearchAudio(),c=capture();
    try {
      audio.update(t-.01,t,boss);const count=c.cues.length;audio.stop();
      assert.equal(c.loops.size,0);assert.equal(c.cues.length,count);assert.equal(c.count('boss-emergence-01'),0);
      audio.update(T.blackout-.01,T.blackout,boss);assert.equal(c.count('escape-power-down-01'),1);
      audio.update(T.blackout-.01,T.blackout,boss);assert.equal(c.count('escape-power-down-01'),1);
    } finally {audio.stop();c.dispose();}
  }
});

test('cinematic movement has distance-based contacts and jumps, but no steps from a stationary lift, hidden actors or teleport',()=>{
  const movement=new CutsceneMovementAudio(),point=new THREE.Vector3(),sounds:SoundId[]=[];
  const update=(t:number,x:number,air=false,audible=true)=>{point.x=x;movement.update('bob',t,point,air,audible,s=>sounds.push(s));};
  update(0,0);update(.1,0);update(.2,0);assert.equal(sounds.length,0);
  for(let n=3;n<=8;n++)update(n/10,(n-2)*.3);
  assert.equal(sounds.filter(s=>s==='bob-contact-01').length,1);
  update(.9,1.9,true);update(1,2,true);update(1.1,2.1,false);
  assert.deepEqual(sounds.slice(-2),['bob-jump-01','bob-land-soft-01']);
  const count=sounds.length;update(1.2,90);update(1.3,90.3,false,false);update(8,100);assert.equal(sounds.length,count);
  movement.reset();update(0,0);assert.equal(sounds.length,count);
});
