import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { AudioManager, type AudioPlayback } from '../src/audio/AudioManager.ts';
import { GameplayAudio } from '../src/audio/GameplayAudio.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';
import { SOUND_DEFINITIONS, soundUrl, type SoundId } from '../src/audio/SoundCatalog.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import type { MovementEvents } from '../src/physics/MovementEvents.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { SlimeManager } from '../src/slimes/SlimeManager.ts';
import { AcidProjectileSystem } from '../src/abilities/AcidProjectileSystem.ts';
import { DissolveSystem } from '../src/abilities/DissolveSystem.ts';
import { DissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { DroneProjectileSystem } from '../src/hazards/DroneProjectileSystem.ts';
import { SlimeDamageSystem } from '../src/systems/SlimeDamageSystem.ts';
import { PoweredDeviceCore } from '../src/electrical/PoweredDeviceCore.ts';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { VoltElectricalSystem } from '../src/abilities/VoltElectricalSystem.ts';
import { GameSettings } from '../src/ui/GameSettings.ts';
import { BlackoutTransitController } from '../src/levels/BlackoutTransitController.ts';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';

class Parameter {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
}
class Node {
  gain = new Parameter();
  playbackRate = new Parameter();
  positionX = new Parameter(); positionY = new Parameter(); positionZ = new Parameter();
  threshold = new Parameter(); ratio = new Parameter();
  loop = false; buffer: unknown; onended: (() => void) | null = null;
  starts = 0; stopped = false; disconnected = false;
  connect() {} disconnect() { this.disconnected = true; }
  start() { this.starts++; } stop() { this.stopped = true; this.onended?.(); }
}
class Context {
  state = 'suspended'; currentTime = 0;
  destination = new Node(); listener = new Node();
  sources: Node[] = []; panners: Node[] = [];
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createBufferSource() { const node = new Node(); this.sources.push(node); return node; }
  createPanner() { const node = new Node(); this.panners.push(node); return node; }
  async decodeAudioData() { return { duration: 1 }; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}

test('all 54 runtime assets exist as OGG and resolve beneath a relative deployment base', () => {
  const ids = Object.keys(SOUND_DEFINITIONS) as SoundId[];
  assert.equal(ids.length, 54);
  for (const id of ids) {
    const path = SOUND_DEFINITIONS[id].path;
    assert.equal(readFileSync(new URL(`../public/${path}`, import.meta.url)).subarray(0,4).toString(), 'OggS');
    assert.equal(new URL(soundUrl(id), 'https://example.test/group-folder/').pathname, `/group-folder/${path}`);
    assert.equal(soundUrl(id, '/group-folder/'), `/group-folder/${path}`);
  }
  for (const folder of ['bob','goop','volt','turrets'])
    assert.ok(readdirSync(new URL(`../public/assets/audio/${folder}/`, import.meta.url)).every(f => f.endsWith('.ogg')));
});

test('cached loading, autoplay, keyed loops, pause, position, limits, volume and teardown', async () => {
  const originalFetch = globalThis.fetch, context = new Context();
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(new Uint8Array([1])); };
  const audio = new AudioManager('./', () => context as unknown as AudioContext);
  try {
    await audio.preload(); await audio.preload();
    assert.equal(requests,54); assert.equal(audio.diagnostics.loaded,54);
    audio.setPaused(false);
    audio.play('bob-jump-01'); assert.equal(context.sources.length,0);
    audio.startLoop('move','bob-movement-loop-01', { x: 1,y: 2,z: 3 });
    audio.unlock(); await Promise.resolve();
    assert.equal(context.sources.length,1);
    for (let i=0;i<10;i++) audio.startLoop('move','bob-movement-loop-01',{ x: 4,y: 2,z: 3 });
    assert.equal(context.sources.length,1); assert.equal(context.panners[0].positionX.value,4);
    audio.setPaused(true); await Promise.resolve();
    audio.play('bob-jump-01'); assert.equal(context.sources.length,1);
    audio.setPaused(false); await Promise.resolve();
    assert.equal(context.sources.length,1);
    audio.play('bob-jump-01');
    assert.equal(context.sources[1].buffer, (audio as any).buffers.get('bob-jump-01'));
    for(let i=0;i<20;i++) { context.currentTime += 0.1; audio.play('bob-jump-01'); }
    assert.equal(audio.diagnostics.voices,4); // movement + three jump voices
    audio.setVolumes(0,0.25);
    assert.equal((audio as any).master.gain.value,0);
    assert.equal((audio as any).effects.gain.value,0.25);
    audio.setFocused(false); await Promise.resolve(); assert.equal(context.state,'suspended');
    audio.setFocused(true); await Promise.resolve(); assert.equal(context.state,'running');
    audio.stopLoop('move'); audio.stopLoop('move'); assert.equal(audio.diagnostics.loops,0);
    for (const sound of Object.keys(SOUND_DEFINITIONS) as SoundId[]) {
      if (!SOUND_DEFINITIONS[sound].loop) { context.currentTime += 0.1; audio.play(sound); }
    }
    assert.equal(audio.diagnostics.voices,24);
    audio.stopAll(); assert.equal(audio.diagnostics.voices,0);
    assert.ok(context.sources.every(s => s.disconnected));
    for(let i=0;i<5;i++) audio.startLoop(`flight:${i}`,'goop-projectile-flight-loop-01');
    assert.equal(audio.diagnostics.voices,4);
    audio.stopLoop('flight:0');
    assert.equal(audio.diagnostics.voices,4); // fifth loop acquires released capacity
    audio.dispose(); assert.equal(context.state,'closed');
  } finally { globalThis.fetch = originalFetch; audio.dispose(); }
});

test('one failed decode does not prevent other assets playing; stale one-shots are discarded', async () => {
  const originalFetch = globalThis.fetch, context = new Context();
  globalThis.fetch = async path => new Response(new Uint8Array([1]), { status: String(path).includes('bob-jump-01') ? 404 : 200 });
  const audio = new AudioManager('./', () => context as unknown as AudioContext);
  try {
    await audio.preload();
    audio.play('goop-jump-01');
    audio.setPaused(false); audio.unlock(); await Promise.resolve();
    assert.equal(context.sources.length,0);
    assert.deepEqual(audio.diagnostics.failed,['bob-jump-01']);
    audio.play('bob-jump-01'); audio.play('goop-jump-01');
    assert.equal(context.sources.length,1);
  } finally { globalThis.fetch = originalFetch; audio.dispose(); }
});

class Playback implements AudioPlayback {
  cues: SoundId[] = []; loops = new Map<string, SoundId>(); paused = true;
  play(sound: SoundId) { this.cues.push(sound); }
  startLoop(key: string, sound: SoundId) { this.loops.set(key,sound); }
  stopLoop(key: string) { this.loops.delete(key); }
  stopAll() { this.loops.clear(); }
  setPaused(paused: boolean) { this.paused = paused; }
  setListener() {}
}
function directorFixture(initialIds = ['bob', 'goop', 'volt']) {
  const audio = new Playback();
  const bodies = Object.fromEntries(['bob','goop','volt'].map(id => [id, {
    position: { x: 0,y: 1,z: 0 }, velocity: { x: 1,y: 0,z: 0 },
    groundNormal: { x: 0,y: 1,z: 0 }, grounded: true, attached: false,
    chargingJump: false, events: new EventBus<MovementEvents>(),
  }]));
  const registered = new Set(initialIds);
  const manager = {
    activeSlimeId: 'bob', get activeBody() { return bodies[this.activeSlimeId]; },
    getBody: (id: string) => registered.has(id) ? bodies[id] : undefined, events: new EventBus<any>(),
  };
  const acid = { projectileStates: [] as any[] };
  const director = new GameplayAudio(audio, manager as unknown as SlimeManager<KinematicBody>, acid as unknown as AcidProjectileSystem<KinematicBody>);
  return { audio,bodies,manager,acid,director,registered };
}

test('Volt unlocked later in Cultivation acquires jump and landing audio exactly once', () => {
  const {audio,bodies,manager,director,registered}=directorFixture(['bob','goop']);
  try {
    director.setEnabled(true);
    registered.add('volt'); manager.events.emit('registered',{slimeId:'volt'});
    manager.events.emit('registered',{slimeId:'volt'});
    bodies.volt.events.emit('jumped',{chargeFraction:0,speedMetresPerSecond:4,directionWorld:{x:0,y:1,z:0}});
    bodies.volt.events.emit('landed',{impactSpeedMetresPerSecond:9});
    assert.deepEqual(audio.cues,['volt-jump-01','volt-land-hard-01']);
    registered.delete('volt');
    bodies.volt.events.emit('landed',{impactSpeedMetresPerSecond:9});
    assert.equal(audio.cues.length,2);
  } finally { director.dispose(); }
});

test('ground/air/wall movement, switching and charging cancel without duplicate cues', () => {
  const {audio,bodies,manager,director} = directorFixture();
  try {
    director.update(); assert.equal(audio.loops.size,0);
    director.setEnabled(true); director.update();
    assert.equal(audio.loops.get('character:movement'),'bob-movement-loop-01');
    bodies.bob.attached=true; director.update();
    assert.equal(audio.loops.get('character:movement'),'bob-wall-crawl-loop-01');
    bodies.bob.grounded=false; director.update(); assert.equal(audio.loops.size,0);
    bodies.bob.grounded=true; bodies.bob.chargingJump=true;
    director.update(); director.update();
    assert.equal(audio.cues.filter(s=>s==='bob-squish-01').length,1);
    bodies.goop.events.emit('jumped',{chargeFraction:0,speedMetresPerSecond:4,directionWorld:{x:0,y:1,z:0}});
    assert.ok(audio.loops.has('character:charge')); // another body's impulse cannot cancel Bob
    bodies.bob.chargingJump=false; director.update(); assert.ok(!audio.loops.has('character:charge'));
    bodies.bob.chargingJump=true; director.update();
    manager.activeSlimeId='goop'; manager.events.emit('activeChanged',{});
    assert.equal(audio.loops.size,0); director.update();
    assert.equal(audio.loops.get('character:movement'),'goop-movement-loop-01');
    bodies.goop.velocity.x=0; director.update();
    assert.equal(audio.loops.get('character:idle'),'goop-idle-bubbles-loop-01');
  } finally { director.dispose(); }
});

test('pause, world loops, projectile destruction, reset, respawn and unload clear state', () => {
  const {audio,manager,acid,director} = directorFixture();
  director.setEnabled(true);
  gameplayAudioEvents.emit('loop',{key:'volt:circuit',sound:'volt-circuit-hold-loop-01',position:{x:0,y:0,z:0}});
  manager.activeSlimeId='goop'; manager.events.emit('activeChanged',{}); director.update();
  assert.ok(audio.loops.has('volt:circuit')); // inactive Volt keeps delivering power
  director.setEnabled(false); director.setEnabled(false);
  assert.ok(audio.paused); assert.ok(audio.loops.has('volt:circuit'));
  director.setEnabled(true); assert.equal(audio.loops.size,1);
  acid.projectileStates.push({id:42,active:true,position:{x:0,y:0,z:0}});
  director.update(); assert.ok(audio.loops.has('acid:42'));
  acid.projectileStates[0].active=false;
  gameplayAudioEvents.emit('stop',{key:'acid:42'}); assert.ok(!audio.loops.has('acid:42'));
  director.reset(); assert.equal(audio.loops.size,0);
  director.died('goop'); director.respawn();
  assert.equal(audio.cues.at(-1),'goop-respawn-01');
  director.dispose(); assert.equal(audio.loops.size,0);
  const before=audio.cues.length;
  gameplayAudioEvents.emit('cue',{sound:'specimen-turret-shot'});
  assert.equal(audio.cues.length,before);
});

test('real accepted turret spawns produce exactly one cue; rejected spawns stay silent', () => {
  const cues: string[] = [];
  const off=gameplayAudioEvents.on('cue', ({sound})=>cues.push(sound));
  const damage=new SlimeDamageSystem(), world=new CollisionWorld();
  const system=new DroneProjectileSystem(world,damage,{poolCapacity:1});
  const owner=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
  try {
    assert.equal(system.spawn('turret',owner,new THREE.Vector3(),new THREE.Vector3(0,0,1)),true);
    assert.equal(system.spawn('turret',owner,new THREE.Vector3(),new THREE.Vector3(0,0,1)),false);
    assert.deepEqual(cues,['specimen-turret-shot']);
    system.reset();
    system.spawn('turret',owner,new THREE.Vector3(),new THREE.Vector3(0,0,1));
    assert.equal(cues.length,2);
  } finally { off(); system.dispose(); damage.dispose(); owner.geometry.dispose(); }
});

test('successful acid shots, real collisions, burn completion and expiry own audio once', () => {
  const cues: SoundId[] = [], stops: string[] = [], loops: string[] = [];
  const offs=[gameplayAudioEvents.on('cue',e=>cues.push(e.sound)), gameplayAudioEvents.on('stop',e=>stops.push(e.key)), gameplayAudioEvents.on('loop',e=>loops.push(e.key))];
  const world=new CollisionWorld(), surfaces=new SurfaceRegistry();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,0.05),new THREE.MeshStandardMaterial()); mesh.position.z=-2; world.register(mesh); surfaces.register(mesh);
  const target=new DissolveTarget({id:'barrier',mesh,collisionWorld:world,surfaceRegistry:surfaces,dissolveDurationSeconds:0.2,collisionDisableProgress:0.75});
  const dissolve=new DissolveSystem([target]);
  const body={position:new THREE.Vector3(),radiusMetres:0.45};
  const manager={activeSlimeId:'goop',activeBody:body,canActiveUseAbility:()=>true};
  const acid=new AcidProjectileSystem({slimeManager:manager,collisionWorld:world,dissolveSystem:dissolve,aimRayProvider:{copyAimRay:(o,d)=>{o.set(0,0,0);d.set(0,0,-1);}}});
  const controls={aimHeld:true,firePressed:true,gameplayInputEnabled:true,pointerLocked:true};
  try {
    acid.update(1/60,controls); acid.update(1/60,controls);
    assert.equal(cues.filter(s=>s==='goop-shoot-01').length,1);
    for(let i=0;i<30;i++) { acid.update(1/60,{...controls,firePressed:false}); dissolve.update(1/60); }
    assert.equal(cues.filter(s=>s==='goop-projectile-impact-01').length,1);
    assert.equal(cues.filter(s=>s==='goop-dissolve-start-01').length,1);
    assert.equal(cues.filter(s=>s==='goop-dissolve-complete-01').length,1);
    assert.deepEqual(loops,['dissolve:barrier']); assert.ok(stops.includes('dissolve:barrier')); assert.ok(stops.includes('acid:1'));
    acid.update(0.5,controls);
    acid.update(5,{...controls,firePressed:false});
    assert.ok(stops.includes('acid:2'));
    dissolve.reset(); target.reset(); dissolve.startBurn(target); dissolve.dispose();
    assert.equal(stops.filter(k=>k==='dissolve:barrier').length,2);
  } finally { for(const off of offs)off(); acid.dispose(); dissolve.dispose(); target.dispose(); world.clear(); mesh.geometry.dispose(); }
});

test('electrical discharge/connect/power transitions do not retrigger during a held tether', () => {
  const cues: SoundId[] = [], loops: string[] = [], stops: string[] = [];
  const offs=[gameplayAudioEvents.on('cue',e=>cues.push(e.sound)), gameplayAudioEvents.on('loop',e=>loops.push(e.key)), gameplayAudioEvents.on('stop',e=>stops.push(e.key))];
  const world=new CollisionWorld(), registry=new ElectricalTargetRegistry(world);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,0.1)); mesh.position.z=-3;
  const core=new PoweredDeviceCore({id:'lamp',displayName:'Lamp',hitMeshes:[mesh],audioKind:'light'}); registry.register(core);
  const body={position:new THREE.Vector3(),radiusMetres:0.45};
  const manager={activeSlimeId:'volt',getBody:()=>body,canActiveUseAbility:()=>true};
  const volt=new VoltElectricalSystem({slimeManager:manager,collisionWorld:world,targetRegistry:registry,aimRayProvider:{copyAimRay:(o,d)=>{o.set(0,0,0);d.set(0,0,-1);}}});
  const controls={aimHeld:true,fireHeld:true,firePressed:true,gameplayInputEnabled:true,pointerLocked:true};
  try {
    for(let i=0;i<20;i++) volt.update(1/60,controls);
    assert.equal(volt.connected,true);
    for(const sound of ['volt-shoot-01','volt-electric-impact-01','volt-circuit-connect-01','volt-light-activate-01']) assert.equal(cues.filter(s=>s===sound).length,1);
    assert.deepEqual(loops,['volt:circuit']);
    manager.activeSlimeId='bob'; volt.update(1/60,controls); assert.equal(volt.connected,true);
    volt.disconnect('movement'); volt.disconnect('movement');
    assert.equal(cues.filter(s=>s==='volt-circuit-release-01').length,1); assert.deepEqual(stops,['volt:circuit']);
  } finally { for(const off of offs)off(); volt.dispose(); core.dispose(); registry.dispose(); world.clear(); mesh.geometry.dispose(); }
});

test('audio controls remain session settings across gameplay resets', () => {
  const settings=new GameSettings(); let updates=0; settings.subscribe(()=>updates++);
  settings.setMasterVolume(0); settings.setSoundEffectsVolume(0.3); settings.setSoundEffectsVolume(0.3);
  assert.equal(settings.value.masterVolume,0); assert.equal(settings.value.soundEffectsVolume,0.3); assert.equal(updates,3);
});

test('real jump and floor landing select single cues without duplicate obstacle impact', () => {
  const world=new CollisionWorld(), surfaces=new SurfaceRegistry();
  const floor=new THREE.Mesh(new THREE.BoxGeometry(20,1,20)); floor.position.y=-0.5;
  world.register(floor); surfaces.register(floor);
  const body=new KinematicBody({world,surfaces,initialPosition:new THREE.Vector3(0,0.46,0)});
  const manager={activeSlimeId:'bob',activeBody:body,getBody:(id:string)=>id==='bob'?body:undefined,events:new EventBus<any>()};
  const playback=new Playback();
  const director=new GameplayAudio(playback,manager as unknown as SlimeManager<KinematicBody>,{projectileStates:[]} as unknown as AcidProjectileSystem<KinematicBody>);
  try {
    director.setEnabled(true);
    body.update(1/60,new THREE.Vector3(),{pressed:true,held:true,released:false}); director.update();
    assert.ok(playback.loops.has('character:charge'));
    body.update(1/60,new THREE.Vector3(),{pressed:false,held:false,released:true});
    assert.ok(!playback.loops.has('character:charge'));
    assert.equal(playback.cues.filter(s=>s==='bob-jump-01').length,1);
    // Airborne button presses cannot manufacture another launch.
    body.update(1/60,new THREE.Vector3(),{pressed:true,held:false,released:false});
    for(let i=0;i<120;i++) body.update(1/60,new THREE.Vector3());
    assert.equal(playback.cues.filter(s=>s==='bob-jump-01').length,1);
    assert.equal(playback.cues.filter(s=>s==='bob-land-soft-01').length,1);
    assert.ok(!playback.cues.includes('bob-impact-01'));
  } finally { director.dispose(); world.clear(); floor.geometry.dispose(); }
});

test('authored timed light receivers start charging, become ready once and cancel on reset', () => {
  const room=new BlackoutTransitRoom(), world=new CollisionWorld(), surfaces=new SurfaceRegistry();
  world.registerAll(room.collisionMeshes); surfaces.registerAll(room.collisionMeshes);
  const registry=new ElectricalTargetRegistry(world);
  const controller=new BlackoutTransitController({room,world,surfaces,electricalTargets:registry});
  const cues: SoundId[]=[], loops:string[]=[], stops:string[]=[];
  const offs=[gameplayAudioEvents.on('cue',e=>cues.push(e.sound)),gameplayAudioEvents.on('loop',e=>loops.push(e.key)),gameplayAudioEvents.on('stop',e=>stops.push(e.key))];
  const fake=(x:number)=>({position:new THREE.Vector3(x,2,90),previousPosition:new THREE.Vector3(x,2,90),radiusMetres:0.45,grounded:true,attached:false,isSupportedBy:()=>false,applyCarrierDisplacement:()=>{}} as unknown as KinematicBody);
  try {
    controller.setActive(true);
    const receiver=controller.lights[0]; receiver.target.setConnectionState(true);
    for(let i=0;i<120;i++) controller.update(1/60,{bob:fake(15),goop:fake(18),volt:fake(-16)});
    assert.equal(cues.filter(s=>s==='volt-charge-ready-01').length,1);
    assert.equal(cues.filter(s=>s==='volt-light-activate-01').length,1);
    assert.equal(loops.filter(k=>k===`charge:${receiver.target.id}`).length,1);
    assert.ok(stops.includes(`charge:${receiver.target.id}`));
    controller.reset(); receiver.target.setConnectionState(true); controller.reset();
    assert.equal(stops.filter(k=>k===`charge:${receiver.target.id}`).length,3);
  } finally { for(const off of offs)off(); controller.dispose(); registry.dispose(); room.dispose(); world.clear(); surfaces.clear(); }
});
