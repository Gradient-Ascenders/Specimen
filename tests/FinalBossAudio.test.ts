import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { FinalBossAudio } from '../src/audio/FinalBossAudio.ts';
import type { AudioPlayback } from '../src/audio/AudioManager.ts';
import type { AudioPosition } from '../src/audio/GameplayAudioEvents.ts';
import { BOSS_SOUND_IDS, SOUND_BANKS, SOUND_DEFINITIONS, type SoundId } from '../src/audio/SoundCatalog.ts';
import { FinalBossController } from '../src/boss/FinalBossController.ts';
import { FinalBossEncounter } from '../src/boss/FinalBossEncounter.ts';
import { FinalBossPresentation } from '../src/boss/FinalBossPresentation.ts';
import { ExterminationArena } from '../src/boss/ExterminationArena.ts';
import { FINAL_MERGE_ANCHOR as target, FINAL_SPECIMEN_MOVEMENT, FINAL_SPECIMEN_WEAPON } from '../src/boss/FinalBossConfig.ts';
import { CombatTargetRegistry } from '../src/combat/CombatTargetRegistry.ts';
import { SpecimenProjectileSystem } from '../src/combat/SpecimenProjectileSystem.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';

class Playback implements AudioPlayback {
  cues: {sound: SoundId; rate: number; position?: AudioPosition}[] = [];
  loops = new Map<string, SoundId>();
  active = new Set<SoundId>();
  play(sound: SoundId, position?: AudioPosition, _vary?: boolean, _volume?: number, rate = 1) {
    this.cues.push({sound, rate, position: position && {...position}}); this.active.add(sound);
  }
  startLoop(key: string, sound: SoundId) { this.loops.set(key, sound); }
  stopLoop(key: string) { this.loops.delete(key); }
  stopSound(sound: SoundId) { this.active.delete(sound); }
  stopAll() { assert.fail('boss cleanup must retain unrelated audio'); }
  setPaused() {}
  setListener() {}
  count(sound: SoundId) { return this.cues.filter(c => c.sound === sound).length; }
}
const impact = (damageUnits = 999, fullyCharged = false) => ({projectileId: 1, targetId: 'extermination-core',
  kind: 'direct' as const, fullyCharged, chargeAmount: fullyCharged ? 1 : 0, damageUnits, point: target, direction: target});
function soundFixture(random = () => 0) {
  const controller = new FinalBossController({random}), playback = new Playback(), sound = new FinalBossAudio(playback);
  const sync = () => sound.update(controller.readModel, target, target);
  const tick = (dt: number) => { controller.update(dt, target); sync(); };
  return {controller, playback, sound, sync, tick};
}

test('the 27 supplied recordings and reused drone shot ship as mono OGG; earlier banks stay unchanged', () => {
  assert.equal(BOSS_SOUND_IDS.length, 28);
  const inventory = JSON.parse(readFileSync(new URL('../docs/assets/gameplay-audio-inventory.json', import.meta.url), 'utf8'));
  for (const id of BOSS_SOUND_IDS) {
    assert.ok(SOUND_BANKS.blackout.includes(id));
    assert.ok(!SOUND_BANKS.containment.includes(id)); assert.ok(!SOUND_BANKS.cultivation.includes(id));
    const row = inventory.find((r: {path: string}) => r.path === SOUND_DEFINITIONS[id].path);
    assert.equal(row.channels, 1); assert.ok(row.durationSeconds > 0 && row.peak < .95);
    assert.equal(row.loop, SOUND_DEFINITIONS[id].loop);
  }
  assert.deepEqual(BOSS_SOUND_IDS.filter(id => SOUND_DEFINITIONS[id].loop).sort(),
    ['boss-beam-sustain-loop-01', 'boss-hover-loop-01', 'boss-shield-regeneration-loop-01']);
});

for (const [random, sound, rate] of [[.4, 'boss-orb-charge-01', 1.35/.8], [.7, 'boss-beam-charge-01', 2.6/1.6]] as const)
  test(`phase-two ${sound} fits its shorter warning and repeated updates do not replay it`, () => {
    const f = soundFixture(() => random); f.controller.startPhaseTwo(target); f.sync(); f.sync();
    assert.equal(f.playback.count(sound), 1); assert.equal(f.playback.cues.find(c => c.sound === sound)!.rate, rate);
    f.sound.reset(); assert.equal(f.playback.loops.size, 0); assert.equal(f.playback.active.size, 0);
  });

test('beam ignition and sustained loop follow active fire, stop for charged-hit stun, resume, and stop in recovery', () => {
  const f = soundFixture(() => .9); f.controller.start(true); f.sync(); f.tick(2.6);
  assert.equal(f.playback.count('boss-beam-ignite-01'), 1);
  assert.equal(f.playback.loops.get('final-boss-beam'), 'boss-beam-sustain-loop-01');
  f.controller.applyImpact(impact(1, true)); f.tick(.1);
  assert.equal(f.playback.loops.has('final-boss-beam'), false);
  assert.equal(f.playback.count('boss-beam-shutdown-01'), 1);
  f.tick(.41); assert.equal(f.playback.loops.has('final-boss-beam'), true);
  for (let i=0;i<2000 && f.controller.readModel.stage === 'active';i++) f.tick(1/60);
  assert.equal(f.controller.readModel.stage, 'recovery'); assert.equal(f.playback.loops.has('final-boss-beam'), false);
  f.controller.suspend(); f.sync(); f.sound.reset();
  assert.equal(f.playback.loops.size, 0); assert.equal(f.playback.active.size, 0);
});

test('the real shield threshold activates once, persists without a timeout, and collapses only after the last defender', () => {
  const f = soundFixture(); f.controller.start(true); f.sync();
  f.controller.applyImpact(impact()); f.sync(); f.tick(1.35); f.tick(30);
  assert.equal(f.playback.count('boss-shield-activate-01'), 1);
  assert.equal(f.playback.loops.get('final-boss-shield'), 'boss-shield-regeneration-loop-01');
  while (f.controller.readModel.defendersRemaining > 1) f.controller.droneDestroyed();
  f.sync(); assert.equal(f.playback.count('boss-shield-collapse-01'), 0);
  f.controller.droneDestroyed(); f.sync(); f.sync();
  assert.equal(f.playback.count('boss-shield-collapse-01'), 1); assert.equal(f.playback.loops.has('final-boss-shield'), false);
  f.sound.reset();
});

test('destruction sounds the reactor immediately and the explosion only at its actual cinematic beat; skip discards future beats', () => {
  for (const skip of [false, true]) {
    const f = soundFixture(); f.controller.startPhaseTwo(target); f.sync();
    for (let i=0;i<4;i++) f.controller.applyImpact(impact());
    f.tick(1/60); assert.equal(f.controller.readModel.state, 'defeated');
    assert.equal(f.playback.count('boss-reactor-failure-01'), 1);
    assert.equal(f.playback.loops.size, 0); f.tick(3.84);
    assert.equal(f.playback.count('boss-final-explosion-01'), 0);
    if (skip) { f.sound.skipCinematic(); f.controller.skipCinematic(target); f.sync(); }
    else { f.tick(.02); f.sync(); }
    assert.equal(f.playback.count('boss-final-explosion-01'), skip ? 0 : 1);
    f.sound.reset(); assert.equal(f.playback.active.size, 0);
  }
});

class Element {
  dataset: Record<string,string> = {}; hidden=false; className=''; textContent=''; value=0; max=0; onclick: unknown;
  ownerDocument={createElement:()=>new Element()}; append(..._children: Element[]) {} setAttribute(_a:string,_b:string) {} remove() {}
}
function encounter(random = () => 0) {
  const arena=new ExterminationArena(), world=new CollisionWorld(), surfaces=new SurfaceRegistry(), targets=new CombatTargetRegistry(world);
  world.registerAll(arena.collisionMeshes); surfaces.registerAll(arena.collisionMeshes);
  const body=new KinematicBody({world,surfaces,initialPosition:target,config:FINAL_SPECIMEN_MOVEMENT});
  const weapon=new SpecimenProjectileSystem({collisionWorld:world,targetRegistry:targets,body,config:FINAL_SPECIMEN_WEAPON,
    aimRayProvider:{copyAimRay:(o,d)=>{o.copy(body.position);d.set(0,0,1);}}});
  const playback=new Playback(), presentation=new FinalBossPresentation();
  const boss=new FinalBossEncounter({arena,world,targets,body,weapon,presentation,random,audio:playback,
    host:new Element() as unknown as HTMLElement,requestFailure:()=>{boss.suspend();return true;}});
  const tick=(n=1)=>{for(let i=0;i<n;i++)boss.update(1/60);};
  return {boss,body,playback,tick,dispose:()=>{boss.dispose();weapon.dispose();targets.dispose();arena.dispose();world.clear();surfaces.clear();}};
}

test('actual cannon spawns emit one sound per triple volley, and resetting or suspending leaves no boss voices', () => {
  const f=encounter(); try {
    f.boss.start(true); let shots=0; f.boss.projectiles.events.on('fired',e=>{if(e.kind==='gun')shots++;});
    f.tick(90); assert.ok(shots >= 9); assert.equal(f.playback.count('boss-cannon-volley-01'),shots/3);
    assert.equal(f.playback.count('boss-cannon-spin-up-01'),1);
    f.boss.suspend(); assert.equal(f.playback.loops.size,0); assert.equal(f.playback.active.size,0);
    f.boss.reset(); f.boss.start(true); assert.equal(f.playback.count('boss-cannon-spin-up-01'),2);
  } finally {f.dispose();}
});

test('actual orb contacts play damage/burst, and a medical pickup sounds only when it restores health', () => {
  const f=encounter(); try {
    f.boss.start(true); f.boss.healthPacks.drop(f.body.position); f.tick();
    assert.equal(f.playback.count('boss-health-pickup-01'),0); assert.equal(f.boss.healthPacks.activeCount,1);
    f.boss.projectiles.fireOrb(f.body.position.clone().add(new THREE.Vector3(0,4,0)),f.body.position);
    f.boss.projectiles.update(.1,f.body);
    assert.equal(f.playback.count('specimen-damage-01'),1); assert.equal(f.playback.count('boss-orb-burst-01'),1);
    f.tick(); f.tick();
    assert.equal(f.playback.count('boss-health-pickup-01'),1); assert.equal(f.boss.healthPacks.activeCount,0);
    assert.equal(f.boss.controller.readModel.playerHealth,100);
  } finally {f.dispose();}
});

test('actual defensive deployment sounds once and only a cleared wave sounds shield collapse', () => {
  const f=encounter(); try {
    f.boss.start(true); f.boss.controller.applyImpact(impact()); f.tick(85);
    assert.equal(f.playback.count('boss-drone-deploy-01'),1);
    assert.equal(f.playback.count('boss-shield-collapse-01'),0);
    for(let i=0,n=f.boss.controller.readModel.defendersRemaining;i<n;i++)f.boss.controller.droneDestroyed();
    f.tick(); assert.equal(f.playback.count('boss-shield-collapse-01'),1);
    f.boss.reset(); assert.equal(f.playback.loops.size,0);
  } finally {f.dispose();}
});

for (const phase of [1,2]) test(`phase ${phase} drones sound each real shot from the firing drone and stop on suspension`, () => {
  const f=encounter(); try {
    let shots=0;
    if(phase===1) {
      f.boss.start(true);
      f.boss.squad.events.on('projectileFired',({droneId})=>{
        shots++;
        const root=f.boss.squad.root.children.find(r=>r.name===`${droneId}-sentinel-drone`)!;
        assert.deepEqual(f.playback.cues.at(-1)?.position,{...root.position});
      });
    } else {
      f.boss.startPhaseTwo();
      for(const wing of f.boss.reinforcements.wings)wing.squad.events.on('projectileFired',({droneId})=>{
        shots++;
        const root=wing.squad.root.children.find(r=>r.name===`${droneId}-sentinel-drone`)!;
        assert.deepEqual(f.playback.cues.at(-1)?.position,{...root.position});
      });
    }
    f.boss.controller.damagePlayer=()=>false;
    f.boss.controller.applyImpact(impact()); f.tick(240);
    assert.ok(shots>0); assert.equal(f.playback.count('boss-drone-shot-01'),shots);
    f.boss.suspend(); assert.equal(f.playback.active.has('boss-drone-shot-01'),false);
    f.tick(60); assert.equal(f.playback.count('boss-drone-shot-01'),shots);
  } finally {f.dispose();}
});
