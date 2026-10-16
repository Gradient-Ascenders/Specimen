import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { AudioManager, type AudioPlayback } from '../src/audio/AudioManager.ts';
import { GameplayAudio, type AcidPoolBounds } from '../src/audio/GameplayAudio.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';
import { SOUND_BANKS, SOUND_DEFINITIONS, soundUrl, type SoundId } from '../src/audio/SoundCatalog.ts';
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
import { BlackoutLevelRuntime } from '../src/levels/BlackoutLevelRuntime.ts';

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

const useLegacySpatialApi = (node: Node): number[] => {
  delete (node as Partial<Node>).positionX;
  delete (node as Partial<Node>).positionY;
  delete (node as Partial<Node>).positionZ;
  const position: number[] = [];
  (node as Node & { setPosition(x: number, y: number, z: number): void }).setPosition =
    (x, y, z) => { position.splice(0, position.length, x, y, z); };
  return position;
};

test('all 18 runtime assets exist as OGG and resolve beneath a relative deployment base', () => {
  const ids = Object.keys(SOUND_DEFINITIONS) as SoundId[];
  assert.equal(ids.length, 18);
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
    assert.equal(requests,SOUND_BANKS.blackout.length); assert.equal(audio.diagnostics.loaded,SOUND_BANKS.blackout.length);
    audio.setPaused(false);
    audio.play('bob-jump-01'); assert.equal(context.sources.length,0);
    audio.startLoop('move','volt-circuit-hold-loop-01', { x: 1,y: 2,z: 3 });
    audio.unlock(); await Promise.resolve();
    assert.equal(context.sources.length,1);
    for (let i=0;i<10;i++) audio.startLoop('move','volt-circuit-hold-loop-01',{ x: 4,y: 2,z: 3 });
    assert.equal(context.sources.length,1); assert.equal(context.panners[0].positionX.value,4);
    audio.setPaused(true); await Promise.resolve();
    audio.play('bob-jump-01'); assert.equal(context.sources.length,1);
    audio.setPaused(false); await Promise.resolve();
    assert.equal(context.sources.length,1);
    audio.play('bob-jump-01');
    assert.equal(context.sources[1].buffer, (audio as any).buffers.get('bob-jump-01'));
    for(let i=0;i<20;i++) { context.currentTime += 0.1; audio.play('bob-jump-01'); }
    assert.equal(audio.diagnostics.voices,4); // power loop + three jump voices
    audio.setVolumes(0,0.25);
    assert.equal((audio as any).master.gain.value,0);
    assert.equal((audio as any).effects.gain.value,0.25);
    audio.setFocused(false); await Promise.resolve(); assert.equal(context.state,'suspended');
    audio.setFocused(true); await Promise.resolve(); assert.equal(context.state,'running');
    audio.stopLoop('move'); audio.stopLoop('move'); assert.equal(audio.diagnostics.loops,0);
    for (const sound of Object.keys(SOUND_DEFINITIONS) as SoundId[]) {
      if (!SOUND_DEFINITIONS[sound].loop) for(let i=0;i<3;i++) { context.currentTime += 0.1; audio.play(sound); }
    }
    assert.equal(audio.diagnostics.voices,24);
    audio.stopAll(); assert.equal(audio.diagnostics.voices,0);
    assert.ok(context.sources.every(s => s.disconnected));
    for(let i=0;i<4;i++) audio.startLoop(`dissolve:${i}`,'goop-dissolve-loop-01');
    assert.equal(audio.diagnostics.voices,3);
    audio.stopLoop('dissolve:0');
    assert.equal(audio.diagnostics.voices,3); // fourth loop acquires released capacity
    audio.dispose(); assert.equal(context.state,'closed');
  } finally { globalThis.fetch = originalFetch; audio.dispose(); }
});

test('one failed decode does not prevent other assets playing; stale one-shots are discarded', async () => {
  const originalFetch = globalThis.fetch, context = new Context();
  globalThis.fetch = async path => new Response(new Uint8Array([1]), { status: String(path).includes('bob-jump-01') ? 404 : 200 });
  const audio = new AudioManager('./', () => context as unknown as AudioContext);
  try {
    await audio.preload();
    audio.play('bob-contact-01');
    audio.setPaused(false); audio.unlock(); await Promise.resolve();
    assert.equal(context.sources.length,0);
    assert.deepEqual(audio.diagnostics.failed,['bob-jump-01']);
    audio.play('bob-jump-01'); audio.play('bob-contact-01');
    assert.equal(context.sources.length,1);
  } finally { globalThis.fetch = originalFetch; audio.dispose(); }
});

test('shared contact samples can play quietly without changing the next full-strength cue', async () => {
  const originalFetch = globalThis.fetch, context = new Context();
  globalThis.fetch = async () => new Response(new Uint8Array([1]));
  const audio = new AudioManager('./', () => context as unknown as AudioContext);
  try {
    await audio.preload(['bob-contact-01']);
    audio.setPaused(false); audio.unlock(); await Promise.resolve();
    audio.play('bob-contact-01', undefined, false, 0.25);
    assert.equal([...(audio as any).voices][0].gain.gain.value, SOUND_DEFINITIONS['bob-contact-01'].volume * 0.25);
    context.currentTime += 0.1;
    audio.play('bob-contact-01');
    assert.equal([...(audio as any).voices][1].gain.gain.value, SOUND_DEFINITIONS['bob-contact-01'].volume);
    context.currentTime += 0.1;
    audio.play('bob-contact-01', undefined, false, 0);
    audio.play('bob-contact-01', undefined, false, NaN);
    assert.equal(audio.diagnostics.voices, 2);
  } finally { globalThis.fetch = originalFetch; audio.dispose(); }
});

test('progression banks deduplicate overlapping loads and unlock, with at most four concurrent decodes', async () => {
  const originalFetch = globalThis.fetch, context = new Context();
  const requests: string[] = [];
  let active = 0, peak = 0, contexts = 0;
  context.decodeAudioData = async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--; return { duration: 1 };
  };
  globalThis.fetch = async url => { requests.push(String(url)); return new Response(new Uint8Array([1])); };
  const audio = new AudioManager('/group-folder/', () => { contexts++; return context as unknown as AudioContext; });
  try {
    const initial = audio.preload(SOUND_BANKS.containment);
    const preload = audio.preload.bind(audio);
    let gesturePreloads = 0;
    audio.preload = sounds => { gesturePreloads++; return preload(sounds); };
    for (let i = 0; i < 100; i++) audio.unlock();
    assert.equal(gesturePreloads, 1, 'key auto-repeat must not rebuild bank promises');
    await Promise.all([initial, audio.preload(SOUND_BANKS.containment)]);
    assert.equal(requests.length, SOUND_BANKS.containment.length); assert.equal(contexts, 1);
    assert.ok(requests.every(url => !url.includes('/volt/') && !url.includes('/turrets/')));
    assert.equal(peak, 4); assert.equal(audio.diagnostics.pending, 0);
    await Promise.all([audio.preload(SOUND_BANKS.cultivation), audio.preload(SOUND_BANKS.containment)]);
    assert.equal(requests.length, SOUND_BANKS.cultivation.length); assert.equal(audio.diagnostics.loaded, SOUND_BANKS.cultivation.length);
    assert.ok(requests.some(url => url.includes('/turrets/')), 'Cultivation combat already has turrets');
    assert.ok(SOUND_BANKS.cultivation.includes('bob-jump-01'), 'rescued Volt shares body cues');
    assert.ok(!SOUND_BANKS.cultivation.some(id=>id.startsWith('volt-')), 'electrical cues wait for Blackout');
    await audio.preload(SOUND_BANKS.blackout);
    assert.equal(requests.length, SOUND_BANKS.blackout.length); assert.equal(new Set(requests).size, SOUND_BANKS.blackout.length);
    assert.equal(contexts, 1); assert.equal(peak, 4);
  } finally { globalThis.fetch = originalFetch; audio.dispose(); }
});

test('dispose cancels queued audio and ignores decodes that complete after teardown', async () => {
  const originalFetch = globalThis.fetch, context = new Context();
  const decodes: Array<() => void> = [];
  let requests = 0;
  context.decodeAudioData = () => new Promise(resolve => decodes.push(() => resolve({ duration: 1 })));
  globalThis.fetch = async () => { requests++; return new Response(new Uint8Array([1])); };
  const audio = new AudioManager('./', () => context as unknown as AudioContext);
  try {
    const pending = audio.preload();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(decodes.length, 4);
    audio.dispose();
    for (const finish of decodes) finish();
    await pending;
    assert.equal(requests, 4); assert.equal(audio.diagnostics.loaded, 0);
    assert.equal(audio.diagnostics.pending, 0); assert.equal(audio.diagnostics.activeLoads, 0);
    await audio.preload(); audio.unlock(); assert.equal(requests, 4);
  } finally { globalThis.fetch = originalFetch; audio.dispose(); }
});

test('unsupported audio is optional and only attempts one context across banks', async () => {
  let attempts = 0;
  const audio = new AudioManager('./', () => { attempts++; throw new Error('unsupported'); });
  await Promise.all([audio.preload(SOUND_BANKS.containment), audio.preload(SOUND_BANKS.cultivation)]);
  audio.unlock();
  assert.equal(attempts, 1); assert.equal(audio.diagnostics.loaded, 0); audio.dispose();
});

test('legacy Web Audio positioning and callback decoding cannot stop gameplay', async () => {
  const originalFetch = globalThis.fetch, context = new Context();
  const listenerPosition = useLegacySpatialApi(context.listener);
  const pannerPositions: number[][] = [];
  context.createPanner = () => {
    const node = new Node();
    pannerPositions.push(useLegacySpatialApi(node));
    context.panners.push(node);
    return node;
  };
  context.decodeAudioData = ((_: ArrayBuffer, success: (buffer: { duration: number }) => void) => {
    queueMicrotask(() => success({ duration: 1 }));
    return undefined;
  }) as unknown as Context['decodeAudioData'];
  globalThis.fetch = async () => new Response(new Uint8Array([1]));
  const audio = new AudioManager('./', () => context as unknown as AudioContext);
  try {
    await audio.preload(['bob-jump-01']);
    audio.setPaused(false); audio.unlock(); await Promise.resolve();
    audio.setListener({ x: 7, y: 8, z: 9 });
    audio.play('bob-jump-01', { x: 4, y: 5, z: 6 });
    assert.deepEqual(listenerPosition, [7, 8, 9]);
    assert.equal(context.panners.length, 1);
    assert.deepEqual(pannerPositions, [[4, 5, 6]]);
  } finally { globalThis.fetch = originalFetch; audio.dispose(); }
});

class Playback implements AudioPlayback {
  cues: SoundId[] = []; loops = new Map<string, SoundId>(); paused = true;
  levels: number[] = [];
  loopPositions = new Map<string, {x:number;y:number;z:number}>();
  play(sound: SoundId, _position?: unknown, _varyPitch?: boolean, volumeScale = 1) { this.cues.push(sound); this.levels.push(volumeScale); }
  startLoop(key: string, sound: SoundId, position?: {x:number;y:number;z:number}) { this.loops.set(key,sound); if(position) this.loopPositions.set(key,{...position}); }
  stopLoop(key: string) { this.loops.delete(key); }
  stopAll() { this.loops.clear(); }
  setPaused(paused: boolean) { this.paused = paused; }
  listener = {x:0,y:0,z:0};
  setListener(position: {x:number;y:number;z:number}) { this.listener={...position}; }
}
function directorFixture(initialIds = ['bob', 'goop', 'volt'], pools: readonly AcidPoolBounds[] = []) {
  const audio = new Playback();
  const bodies = Object.fromEntries(['bob','goop','volt'].map(id => [id, {
    position: { x: 0,y: 1,z: 0 }, locomotionPosition: { x: 0,y: 0,z: 0 }, landedThisStep: false, velocity: { x: 1,y: 0,z: 0 },
    groundNormal: { x: 0,y: 1,z: 0 }, grounded: true, attached: false,
    chargingJump: false, events: new EventBus<MovementEvents>(),
  }]));
  const registered = new Set(initialIds);
  const manager = {
    activeSlimeId: 'bob', get activeBody() { return bodies[this.activeSlimeId]; },
    getBody: (id: string) => registered.has(id) ? bodies[id] : undefined, events: new EventBus<any>(),
  };
  const director = new GameplayAudio(audio, manager as unknown as SlimeManager<KinematicBody>, pools);
  return { audio,bodies,manager,director,registered };
}

test('Volt unlocked later in Cultivation acquires jump and landing audio exactly once', () => {
  const {audio,bodies,manager,director,registered}=directorFixture(['bob','goop']);
  try {
    director.setEnabled(true);
    registered.add('volt'); manager.events.emit('registered',{slimeId:'volt'});
    manager.events.emit('registered',{slimeId:'volt'});
    bodies.volt.events.emit('jumped',{chargeFraction:0,speedMetresPerSecond:4,directionWorld:{x:0,y:1,z:0}});
    bodies.volt.events.emit('landed',{impactSpeedMetresPerSecond:9});
    assert.deepEqual(audio.cues,['bob-jump-01','bob-land-hard-01']);
    registered.delete('volt');
    bodies.volt.events.emit('landed',{impactSpeedMetresPerSecond:9});
    assert.equal(audio.cues.length,2);
  } finally { director.dispose(); }
});

test('Bob movement uses quiet resolved-distance contacts, stays silent while charging, and clears on switching', () => {
  const {audio,bodies,manager,director} = directorFixture();
  try {
    director.update(); assert.equal(audio.loops.size,0);
    director.setEnabled(true); director.update();
    assert.equal(audio.loops.size,0); assert.equal(audio.cues.length,0);
    // Carrier transport and apparent velocity without resolved travel are quiet.
    bodies.bob.position.x+=10; director.update(); director.update();
    assert.equal(audio.cues.length,0);
    bodies.bob.locomotionPosition.x+=1.3; director.update();
    assert.deepEqual(audio.cues,['bob-contact-01']); assert.equal(audio.levels[0],0.35);
    bodies.bob.attached=true;
    bodies.bob.locomotionPosition.x+=1.3; director.update();
    assert.equal(audio.cues.length,2); assert.equal(audio.levels[1],0.25);
    bodies.bob.velocity.x=0; bodies.bob.locomotionPosition.x+=2; director.update();
    assert.equal(audio.cues.length,2, 'idle travel must not leave a stored footstep');
    bodies.bob.velocity.x=1; bodies.bob.grounded=false;
    bodies.bob.locomotionPosition.x+=2; director.update(); assert.equal(audio.cues.length,2);
    bodies.bob.grounded=true; bodies.bob.chargingJump=true;
    bodies.bob.locomotionPosition.x+=2;
    director.update(); director.update();
    assert.equal(audio.cues.length,2); assert.equal(audio.loops.size,0);
    bodies.goop.events.emit('jumped',{chargeFraction:0,speedMetresPerSecond:4,directionWorld:{x:0,y:1,z:0}});
    assert.equal(audio.cues.at(-1),'bob-jump-01');
    bodies.bob.chargingJump=false; director.update();
    manager.activeSlimeId='goop'; manager.events.emit('activeChanged',{});
    assert.equal(audio.loops.size,0); director.update();
    assert.equal(audio.loops.size,0);
    const before=audio.cues.length;
    bodies.goop.locomotionPosition.x+=1.3; director.update();
    assert.equal(audio.cues.length,before+1); assert.equal(audio.cues.at(-1),'bob-contact-01');
    bodies.goop.velocity.x=0; director.update();
    assert.equal(audio.loops.size,0);
  } finally { director.dispose(); }
});

test('pause, world corrosion, reset, respawn and unload clear state', () => {
  const {audio,manager,director} = directorFixture();
  director.setEnabled(true);
  gameplayAudioEvents.emit('loop',{key:'volt:circuit',sound:'volt-circuit-hold-loop-01',position:{x:0,y:0,z:0}});
  manager.activeSlimeId='goop'; manager.events.emit('activeChanged',{}); director.update();
  assert.ok(audio.loops.has('volt:circuit')); // inactive Volt keeps delivering power
  director.setEnabled(false); director.setEnabled(false);
  assert.ok(audio.paused); assert.ok(audio.loops.has('volt:circuit'));
  director.setEnabled(true); assert.equal(audio.loops.size,1);
  gameplayAudioEvents.emit('loop',{key:'dissolve:barrier',sound:'goop-dissolve-loop-01',position:{x:0,y:0,z:0}});
  director.update(); assert.ok(audio.loops.has('dissolve:barrier'));
  gameplayAudioEvents.emit('stop',{key:'dissolve:barrier'}); assert.ok(!audio.loops.has('dissolve:barrier'));
  director.reset(); assert.equal(audio.loops.size,0);
  director.died('goop'); director.respawn();
  assert.equal(audio.cues.at(-1),'bob-contact-01');
  director.dispose(); assert.equal(audio.loops.size,0);
  const before=audio.cues.length;
  gameplayAudioEvents.emit('cue',{sound:'specimen-turret-shot'});
  assert.equal(audio.cues.length,before);
});

test('Bob uses selected jump, contact, peel and rupture cues; retry and restored state cannot trigger old effects', () => {
  const {audio,bodies,director}=directorFixture();
  const jump = (chargeFraction: number) => bodies.bob.events.emit('jumped', {
    chargeFraction, speedMetresPerSecond: 8, directionWorld: {x:0,y:1,z:0},
  });
  try {
    director.setEnabled(true);
    jump(0.79); jump(0.8);
    bodies.bob.events.emit('attached',{});
    bodies.bob.events.emit('regripped',{});
    bodies.bob.events.emit('detached',{lostSupport:false});
    bodies.bob.events.emit('detached',{lostSupport:true});
    bodies.bob.events.emit('obstacleImpact',{speedMetresPerSecond:4});
    bodies.bob.events.emit('landed',{impactSpeedMetresPerSecond:3});
    bodies.bob.events.emit('bounced',{});
    assert.deepEqual(audio.cues, ['bob-jump-01','bob-charged-jump-01','bob-contact-01','bob-contact-01',
      'bob-detach-01','bob-detach-01','bob-contact-01','bob-land-soft-01','bob-land-hard-01']);
    director.died('bob');
    assert.equal(audio.cues.at(-1),'bob-fall-01');
    const count = audio.cues.length;
    jump(1); bodies.bob.events.emit('attached',{});
    assert.equal(audio.cues.length,count);
    director.respawn();
    assert.equal(audio.cues.at(-1),'bob-contact-01');
    assert.equal(audio.levels.at(-1),0.8);
    director.reset();
    const resetCount=audio.cues.length;
    bodies.bob.events.emit('attached',{}); jump(1);
    assert.equal(audio.cues.length,resetCount);
  } finally { director.dispose(); }
});

test('a real heavy Bob landing and its passive rebound produce one hard-landing sound', () => {
  const world=new CollisionWorld(), surfaces=new SurfaceRegistry();
  const floor=new THREE.Mesh(new THREE.BoxGeometry(20,1,20)); floor.position.y=-0.5;
  world.register(floor); surfaces.register(floor);
  const body=new KinematicBody({world,surfaces,initialPosition:new THREE.Vector3(0,6,0)});
  const manager={activeSlimeId:'bob',activeBody:body,getBody:(id:string)=>id==='bob'?body:undefined,events:new EventBus<any>()};
  const audio=new Playback();
  const director=new GameplayAudio(audio,manager as unknown as SlimeManager<KinematicBody>);
  try {
    director.setEnabled(true);
    for(let i=0;i<120;i++) {
      body.update(1/60,new THREE.Vector3()); director.update();
      if(body.lastLandingImpactSpeedMetresPerSecond>=10) break;
    }
    assert.ok(body.lastLandingImpactSpeedMetresPerSecond>=10);
    assert.ok(body.velocity.y>0, 'hard landing must still apply the real reaction hop');
    assert.deepEqual(audio.cues,['bob-land-hard-01']);
  } finally { director.dispose(); world.clear(); floor.geometry.dispose(); }
});

test('merged control clears original-character travel and follows the actual controlled body', () => {
  const {audio,director,manager,bodies}=directorFixture();
  try {
    manager.activeSlimeId='volt';
    director.setEnabled(true); director.update();
    bodies.volt.locomotionPosition.x+=1.3; director.update();
    assert.deepEqual(audio.cues,['bob-contact-01']);
    bodies.volt.locomotionPosition.x+=1.3;
    (director as any).controlledBody=()=>({position:{x:50,y:2,z:20}});
    director.update();
    assert.equal(audio.loops.size,0);
    assert.deepEqual(audio.listener,{x:50,y:2,z:20});
    assert.deepEqual(audio.cues,['bob-contact-01']);
    (director as any).controlledBody=()=>manager.activeBody; director.update();
    assert.equal(audio.cues.length,1, 'merged travel must not leave a stored step');
  } finally {director.dispose();}
});

test('terminal Blackout completion stops all voices once even though the scene remains loaded', () => {
  const {audio,director}=directorFixture();
  const noop=()=>{};
  const runtime:any={
    completionEmitted:false,gameplayAudio:director,
    requireResources:()=>({phase:{terminal:true},electricalSystem:{disconnect:noop,cancelAim:noop,readModel:{}},specimenAttack:{reset:noop},poweredDeviceRig:{recomputePower:noop},electricalPresentation:{update:noop}}),
    renderLayer:{cameraRig:{setAimPresentationActive:noop}},input:{setEnabled:noop,releasePointerLock:noop},host:{dataset:{}},events:new EventBus<any>(),
  };
  let completions=0; runtime.events.on('completed',()=>completions++);
  try {
    director.setEnabled(true); director.update();
    gameplayAudioEvents.emit('loop',{key:'volt:circuit',sound:'volt-circuit-hold-loop-01',position:{x:0,y:0,z:0}});
    assert.ok(audio.loops.size>0);
    (BlackoutLevelRuntime.prototype as any).commitCompletion.call(runtime);
    (BlackoutLevelRuntime.prototype as any).commitCompletion.call(runtime);
    director.update();
    assert.equal(completions,1); assert.equal(audio.loops.size,0); assert.equal(audio.paused,true);
    const before=audio.cues.length;
    gameplayAudioEvents.emit('cue',{sound:'specimen-turret-shot'});
    assert.equal(audio.cues.length,before);
  } finally {director.dispose();}
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
    assert.deepEqual(cues,['goop-shoot-01','goop-projectile-impact-01','goop-dissolve-complete-01']);
    assert.equal(cues.filter(s=>s==='goop-dissolve-complete-01').length,1);
    assert.deepEqual(loops,['dissolve:barrier']); assert.ok(stops.includes('dissolve:barrier'));
    acid.update(0.5,controls);
    acid.update(5,{...controls,firePressed:false});
    assert.equal(acid.projectileStates.filter(p=>p.active).length,0);
    assert.deepEqual(stops,['dissolve:barrier']);
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
    for(const sound of ['volt-shoot-01','volt-circuit-connect-01','volt-charge-ready-01']) assert.equal(cues.filter(s=>s===sound).length,1);
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
  const director=new GameplayAudio(playback,manager as unknown as SlimeManager<KinematicBody>);
  try {
    director.setEnabled(true);
    body.update(1/60,new THREE.Vector3(),{pressed:true,held:true,released:false}); director.update();
    assert.equal(playback.loops.size,0); assert.equal(playback.cues.length,0);
    body.update(1/60,new THREE.Vector3(),{pressed:false,held:false,released:true});
    assert.ok(!playback.loops.has('character:charge'));
    assert.equal(playback.cues.filter(s=>s==='bob-jump-01').length,1);
    // Airborne button presses cannot manufacture another launch.
    body.update(1/60,new THREE.Vector3(),{pressed:true,held:false,released:false});
    for(let i=0;i<120;i++) body.update(1/60,new THREE.Vector3());
    assert.equal(playback.cues.filter(s=>s==='bob-jump-01').length,1);
    assert.equal(playback.cues.filter(s=>s==='bob-land-soft-01').length,1);
    assert.ok(!playback.cues.includes('bob-contact-01'));
  } finally { director.dispose(); world.clear(); floor.geometry.dispose(); }
});

test('timed receivers sound completion once, share tether audio and stay silent on cancelled charging', () => {
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
    assert.deepEqual(cues,['volt-charge-ready-01']);
    assert.deepEqual(loops,[], 'charging must not layer another buzz over the tether');
    assert.deepEqual(stops,[]);
    controller.reset(); receiver.target.setConnectionState(true); controller.reset();
    assert.deepEqual(cues,['volt-charge-ready-01']);
    receiver.target.setConnectionState(true);
    for(let i=0;i<120;i++) controller.update(1/60,{bob:fake(15),goop:fake(18),volt:fake(-16)});
    assert.deepEqual(cues,['volt-charge-ready-01','volt-charge-ready-01']);
  } finally { for(const off of offs)off(); controller.dispose(); registry.dispose(); room.dispose(); world.clear(); surfaces.clear(); }
});


test('Goop shares selected body cues without borrowing Bob adhesion or charged jump', () => {
  const {audio,bodies,manager,director}=directorFixture();
  try {
    manager.activeSlimeId='goop'; director.setEnabled(true);
    bodies.goop.events.emit('jumped',{chargeFraction:1,speedMetresPerSecond:8,directionWorld:{x:0,y:1,z:0}});
    bodies.goop.events.emit('landed',{impactSpeedMetresPerSecond:3});
    bodies.goop.events.emit('landed',{impactSpeedMetresPerSecond:9});
    bodies.goop.events.emit('obstacleImpact',{speedMetresPerSecond:4});
    bodies.goop.events.emit('attached',{}); bodies.goop.events.emit('detached',{lostSupport:false});
    director.died('goop'); director.update(); director.respawn();
    assert.deepEqual(audio.cues,['bob-jump-01','bob-land-soft-01','bob-land-hard-01','bob-contact-01','bob-fall-01','bob-contact-01']);
    assert.equal(audio.levels.at(-1),0.8);
  } finally { director.dispose(); }
});

test('acid pool ambience follows the nearest surface, survives switching and clears on death, reset and unload', () => {
  const pools=[{min:{x:50,y:0,z:-50},max:{x:150,y:0,z:50}}, {min:{x:60,y:0,z:-50},max:{x:160,y:0,z:50}}];
  const {audio,bodies,manager,director}=directorFixture(undefined,pools);
  try {
    director.setEnabled(true); director.update(); assert.equal(audio.loops.size,0);
    bodies.bob.position.x=51; director.update();
    assert.deepEqual([...audio.loops.values()],['goop-acid-puddle-loop-01']);
    assert.deepEqual(audio.loopPositions.get('environment:acid'),{x:51,y:0,z:0});
    // The basin centre is 49 m away; distance must use the surface itself.
    manager.activeSlimeId='goop'; bodies.goop.position.x=52; manager.events.emit('activeChanged',{}); director.update();
    assert.equal(audio.loops.size,1);
    director.setEnabled(false); assert.equal(audio.paused,true); assert.equal(audio.loops.size,1);
    director.setEnabled(true); director.update(); assert.equal(audio.loops.size,1);
    // Merged control keeps environmental sound but never character motion.
    (director as any).controlledBody=()=>({position:{x:55,y:1,z:0}}); director.update();
    assert.deepEqual(audio.listener,{x:55,y:1,z:0}); assert.equal(audio.loops.size,1);
    (director as any).controlledBody=()=>undefined; director.update(); assert.equal(audio.loops.size,0);
    (director as any).controlledBody=()=>manager.activeBody;
    director.update(); director.died('goop'); director.update(); assert.equal(audio.loops.size,0);
    director.respawn(); director.update(); assert.equal(audio.loops.size,1);
    director.reset(); assert.equal(audio.loops.size,0);
    director.update(); assert.equal(audio.loops.size,1);
    bodies.goop.position.x=0; director.update(); assert.equal(audio.loops.size,0);
    bodies.goop.position.x=52; director.update(); director.dispose(); assert.equal(audio.loops.size,0);
  } finally { director.dispose(); }
});


test('Volt shares body sounds and resolved-distance contacts, with no idle or movement loops', () => {
  const {audio,bodies,manager,director}=directorFixture();
  try {
    manager.activeSlimeId='volt'; director.setEnabled(true); director.update();
    bodies.volt.position.x+=10; director.update(); assert.equal(audio.cues.length,0);
    bodies.volt.locomotionPosition.x+=1.3; director.update();
    assert.deepEqual(audio.cues,['bob-contact-01']); assert.equal(audio.levels[0],0.35);
    bodies.volt.velocity.x=0; director.update(); assert.equal(audio.loops.size,0);
    bodies.volt.events.emit('jumped',{chargeFraction:1,speedMetresPerSecond:8,directionWorld:{x:0,y:1,z:0}});
    bodies.volt.events.emit('landed',{impactSpeedMetresPerSecond:3});
    bodies.volt.events.emit('landed',{impactSpeedMetresPerSecond:9});
    bodies.volt.events.emit('obstacleImpact',{speedMetresPerSecond:4});
    bodies.volt.events.emit('attached',{}); bodies.volt.events.emit('detached',{lostSupport:false});
    director.died('volt'); director.update(); director.respawn();
    assert.deepEqual(audio.cues,['bob-contact-01','bob-jump-01','bob-land-soft-01','bob-land-hard-01','bob-contact-01','bob-fall-01','bob-contact-01']);
  } finally { director.dispose(); }
});

test('powered devices reuse a quieter completion cue and gameplay forwards its playback scale', () => {
  const {audio,director}=directorFixture();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
  const core=new PoweredDeviceCore({id:'lamp-audio',displayName:'Lamp',hitMeshes:[mesh],audioKind:'light'});
  try {
    director.setEnabled(true);
    core.setConnectionState(true); core.setConnectionState(true);
    assert.deepEqual(audio.cues,['volt-charge-ready-01']); assert.deepEqual(audio.levels,[0.45]);
    gameplayAudioEvents.emit('cue',{sound:'volt-charge-ready-01'});
    assert.deepEqual(audio.levels,[0.45,1]);
    director.reset(); core.setConnectionState(false); core.setConnectionState(true);
    assert.equal(audio.cues.length,2, 'restoration must not sound device activation');
  } finally {core.dispose(); director.dispose(); mesh.geometry.dispose();}
});

test('sustained power is mixed quietly with one voice, pauses cleanly and stops on disconnect', async () => {
  const originalFetch=globalThis.fetch, context=new Context();
  globalThis.fetch=async()=>new Response(new Uint8Array([1]));
  const audio=new AudioManager('./',()=>context as unknown as AudioContext);
  try {
    await audio.preload(['volt-circuit-hold-loop-01','volt-circuit-connect-01']);
    audio.setPaused(false); audio.unlock(); await Promise.resolve();
    for(let i=0;i<60;i++) audio.startLoop('volt:circuit','volt-circuit-hold-loop-01');
    audio.play('volt-circuit-connect-01');
    const voices=[...(audio as any).voices];
    const loop=voices.find(v=>v.key==='volt:circuit'), connection=voices.find(v=>!v.key);
    assert.ok(loop.gain.gain.value < connection.gain.gain.value*0.2, 'power must sit well below the one-shots');
    assert.equal(context.sources.filter(s=>s.loop).length,1);
    audio.setPaused(true); await Promise.resolve(); assert.equal(context.state,'suspended');
    audio.setPaused(false); await Promise.resolve(); assert.equal(context.sources.filter(s=>s.loop).length,1);
    audio.stopLoop('volt:circuit'); assert.equal(audio.diagnostics.loops,0); assert.equal(loop.source.stopped,true);
  } finally {audio.dispose(); globalThis.fetch=originalFetch;}
});
