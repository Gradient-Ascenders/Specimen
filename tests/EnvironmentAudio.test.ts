import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WorldAudio, WorldAudioSource } from '../src/audio/WorldAudio.ts';
import type { AudioPlayback } from '../src/audio/AudioManager.ts';
import { gameplayAudioEvents, type AudioPosition } from '../src/audio/GameplayAudioEvents.ts';
import type { SoundId } from '../src/audio/SoundCatalog.ts';
import { GreyboxDropPreview } from '../src/levels/GreyboxDropPreview.ts';
import { DissolveSystem } from '../src/abilities/DissolveSystem.ts';
import { DissolveTarget, createAuthoredDissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { LevelTwoRoomFiveGreybox } from '../src/levels/LevelTwoRoomFiveGreybox.ts';
import { CultivationPlatformBoosters } from '../src/render/environment/cultivation/CultivationPlatformBoosters.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { RoomOneMonitor } from '../src/render/environment/containment/RoomOneMonitor.ts';

class Playback implements AudioPlayback {
  loops = new Map<string, { sound: SoundId; position?: AudioPosition }>();
  play() {}
  startLoop(key: string, sound: SoundId, position?: AudioPosition) { this.loops.set(key, { sound, position: position ? {...position} : undefined }); }
  stopLoop(key: string) { this.loops.delete(key); }
  stopAll() { this.loops.clear(); }
  setPaused() {}
  setListener() {}
}

test('flight and hover voices are bounded separately, follow nearest sources, and stop when unpowered, hidden, distant or disposed', () => {
  const root = new THREE.Group(), other = new THREE.Group(), playback = new Playback(), audio = new WorldAudio(playback, root);
  let powered = true;
  const nodes = Array.from({length: 8}, (_, i) => { const node = new THREE.Group(); node.position.x = i; root.add(node); return node; });
  other.add(nodes[7]);
  const sources = nodes.map((node, i) => new WorldAudioSource({ root: node, kind: i < 5 ? 'drone' : 'hover', enabled: () => powered }));
  try {
    audio.update({x:0,y:0,z:0}); assert.equal(playback.loops.size, 3);
    assert.equal(playback.loops.get('world:drone:0')!.position!.x, 0);
    assert.equal(playback.loops.get('world:hover:0')!.position!.x, 5);
    const keys = [...playback.loops.keys()];
    audio.update({x:4,y:0,z:0}); assert.deepEqual([...playback.loops.keys()], keys);
    assert.equal(playback.loops.get('world:drone:0')!.position!.x, 4);
    powered = false; audio.update({x:4,y:0,z:0}); assert.equal(playback.loops.size, 0);
    powered = true; root.visible = false; audio.update({x:4,y:0,z:0});
    // The scene root itself may be toggled during transitions too.
    assert.equal(playback.loops.size, 0);
    root.visible = true; audio.update({x:100,y:0,z:0}); assert.equal(playback.loops.size, 0);
    audio.update({x:4,y:0,z:0}); assert.equal(playback.loops.size, 3);
    for (const source of sources) source.dispose(); audio.update({x:4,y:0,z:0}); assert.equal(playback.loops.size, 0);
  } finally { audio.dispose(); for (const source of sources) source.dispose(); }
});

test('falling previews sound release and landing once at their transformed positions, with silent resets', () => {
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry(), root = new THREE.Group(); root.position.set(40,0,80);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(3,.5,3), new THREE.MeshStandardMaterial()); root.add(mesh);
  const support = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial());
  const target = new DissolveTarget({ id:'support', mesh:support, collisionWorld:world, surfaceRegistry:surfaces, dissolveDurationSeconds:1, collisionDisableProgress:.8 });
  const drop = new GreyboxDropPreview({ id:'platform', mesh, solubleTargetId:'support', suspendedPosition:new THREE.Vector3(0,4,0), landingPosition:new THREE.Vector3(0,.5,0), fallDurationSeconds:.85 });
  const cues: {sound:SoundId; position?:AudioPosition}[] = [];
  const off = gameplayAudioEvents.on('cue', cue => cues.push(cue));
  try {
    drop.bind([target]); target.advance(.5); drop.update(.2); assert.equal(cues.length,0);
    target.advance(.5); assert.equal(cues.length,1); assert.deepEqual({...cues[0].position!},{x:40,y:4,z:80});
    drop.update(.85); drop.update(1); assert.deepEqual(cues.map(c=>c.sound),['world-platform-fall-01','world-platform-land-01']);
    assert.deepEqual({...cues[1].position!},{x:40,y:.5,z:80});
    drop.reset(); target.reset(); assert.equal(cues.length,2);
    drop.dispose(); target.advance(1); drop.update(1); assert.equal(cues.length,2);
  } finally { off(); drop.dispose(); target.dispose(); mesh.geometry.dispose(); support.geometry.dispose(); (mesh.material as THREE.Material).dispose(); (support.material as THREE.Material).dispose(); }
});

test('only the final sewer-drone burn uses the Goop-derived destruction edit, without duplicate completion or reset cues', () => {
  const room = new LevelTwoRoomFiveGreybox(() => {}), world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  const target = createAuthoredDissolveTarget(room.brokenCore, world, surfaces)!;
  const system = new DissolveSystem([target]); room.bindDissolveTargets([target]); room.bindBurns(system);
  const cues: SoundId[] = [], stops: string[] = [];
  const offs = [gameplayAudioEvents.on('cue', e=>cues.push(e.sound)), gameplayAudioEvents.on('stop', e=>stops.push(e.key))];
  try {
    for (let hit=0;hit<3;hit++) {
      assert.equal(system.startBurn(target),'started'); assert.equal(system.startBurn(target),'already-burning');
      system.update(target.dissolveDurationSeconds); system.update(.01);
    }
    assert.deepEqual(cues,['goop-dissolve-complete-01','goop-dissolve-complete-01','world-drone-dissolve-01']);
    assert.equal(stops.length,3); assert.equal(room.controller.brokenDroneState,'destroyed');
    system.reset(); target.reset(); room.reset(); assert.equal(cues.length,3);
    system.startBurn(target); system.reset(); assert.equal(cues.length,3);
  } finally { for (const off of offs) off(); room.dispose(); system.dispose(); target.dispose(); }
});

test('stationary platform boosters follow the nearest engine through room offsets and leave no voice on disposal', () => {
  const room = new LevelTwoRoomFiveGreybox(() => {}), playback = new Playback(), root = new THREE.Group();
  room.root.position.set(64,0,242); root.add(room.root);
  const art = new CultivationPlatformBoosters(room), audio = new WorldAudio(playback,root);
  const deck = room.root.children.find(o=>/^room-5-route-\d+-jump-\d+$/.test(o.name))!;
  const listener = deck.getWorldPosition(new THREE.Vector3()); listener.y += 1;
  try {
    audio.update(listener); assert.equal(playback.loops.size,1);
    const voice = playback.loops.get('world:hover:0')!;
    assert.equal(voice.sound,'world-platform-hover-loop-01'); assert.equal(voice.position!.x,listener.x);
    assert.equal(voice.position!.z,listener.z);
    room.root.visible=false; audio.update(listener); assert.equal(playback.loops.size,0);
    room.root.visible=true; audio.update(listener); assert.equal(playback.loops.size,1);
    art.dispose(); audio.update(listener); assert.equal(playback.loops.size,0);
  } finally { audio.dispose(); art.dispose(); room.dispose(); }
});

test('monitor ticks follow newly visible letters, throttle catch-up, and stay silent on holds/reset/disposal', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomOneMonitor(assets), cues: SoundId[] = [];
  const off = gameplayAudioEvents.on('cue',e=>cues.push(e.sound));
  try {
    monitor.update(5.99); assert.equal(cues.length,0);
    monitor.update(.01); assert.deepEqual(cues,['world-sign-tick-01']);
    monitor.update(.01); monitor.update(.08); assert.equal(cues.length,1);
    monitor.update(.09); assert.equal(cues.length,2);
    monitor.update(30); assert.equal(cues.length,3,'one tick instead of replaying skipped letters');
    monitor.update(30); assert.equal(cues.length,3);
    monitor.reset(); assert.equal(cues.length,3);
    monitor.update(6); assert.equal(cues.length,4);
    monitor.dispose(); monitor.update(20); assert.equal(cues.length,4);
  } finally { off(); monitor.dispose(); assets.dispose(); }
});
