import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WorldAudio, WorldAudioSource } from '../src/audio/WorldAudio.ts';
import type { AudioPlayback } from '../src/audio/AudioManager.ts';
import type { AudioPosition } from '../src/audio/GameplayAudioEvents.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';
import type { SoundId } from '../src/audio/SoundCatalog.ts';
import { Door } from '../src/puzzle/Door.ts';
import { VerticalBlastDoor } from '../src/puzzle/VerticalBlastDoor.ts';
import { ProximityShutterDoor } from '../src/puzzle/ProximityShutterDoor.ts';
import { MovingPlatform } from '../src/puzzle/MovingPlatform.ts';
import { PressurePlate } from '../src/puzzle/PressurePlate.ts';
import { WallButton } from '../src/puzzle/WallButton.ts';
import { LaserHazard } from '../src/hazards/LaserHazard.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { LevelTwoRoomFourGreybox } from '../src/levels/LevelTwoRoomFourGreybox.ts';

class Playback implements AudioPlayback {
  cues: SoundId[]=[];
  loops=new Map<string,{sound:SoundId;position?:AudioPosition}>();
  play(sound:SoundId) {this.cues.push(sound);}
  startLoop(key:string,sound:SoundId,position?:AudioPosition) {this.loops.set(key,{sound,position:position?{...position}:undefined});}
  stopLoop(key:string) {this.loops.delete(key);}
  stopAll() {this.loops.clear();}
  setPaused() {}
  setListener() {}
}
const origin={x:0,y:1,z:0};
function fixture() {
  const root=new THREE.Group(), playback=new Playback(), audio=new WorldAudio(playback,root);
  return {root,playback,audio};
}

test('door travel follows resolved movement and arrival clunks follow real endpoints only',()=>{
  const {root,playback,audio}=fixture();
  const door=new Door({id:'audio',position:new THREE.Vector3(),openDurationSeconds:1}); root.add(door.root);
  try {
    audio.update(origin); door.setOpen(true); audio.update(origin); assert.equal(playback.loops.size,0);
    door.update(.25); audio.update(origin); assert.equal([...playback.loops.values()][0].sound,'world-door-movement-loop-01');
    door.setOpen(false); door.update(.1); audio.update(origin); assert.equal(playback.loops.size,1); assert.deepEqual(playback.cues,[]);
    door.setOpen(true); door.update(1); audio.update(origin);
    assert.equal(playback.loops.size,0); assert.deepEqual(playback.cues,['world-door-stop-01']);
    audio.update(origin); assert.equal(playback.cues.length,1);
    door.setOpen(false); door.update(.2); audio.update(origin); assert.equal(playback.loops.size,1);
    door.reset(); audio.update(origin); assert.equal(playback.loops.size,0); assert.equal(playback.cues.length,1);
    door.setOpen(true); door.update(.2); audio.update(origin); door.dispose(); audio.update(origin); assert.equal(playback.loops.size,0);
  } finally {audio.dispose(); door.dispose();}
});

test('blocked blast doors fall silent and reopening resumes without a false arrival',()=>{
  const {root,playback,audio}=fixture(), world=new CollisionWorld(), surfaces=new SurfaceRegistry();
  const door=new VerticalBlastDoor({id:'blocked',collisionWorld:world,surfaceRegistry:surfaces,closedPosition:new THREE.Vector3(0,2,0),panelSize:new THREE.Vector3(4,4,.4),travelAxis:new THREE.Vector3(0,1,0),travelDistance:4.5,openingDurationSeconds:1,closingDurationSeconds:1,obstructionCentre:new THREE.Vector3(),obstructionSize:new THREE.Vector3(4.8,4.8,2)});
  root.add(door.root);
  const obstacle={id:'bob',position:new THREE.Vector3(0,2,0),radiusMetres:.45};
  try {
    door.setOpen(true); door.update(1,[]); audio.update(origin); playback.cues=[];
    door.setOpen(false); door.update(.2,[]); audio.update(origin); assert.equal(playback.loops.size,1);
    door.update(.1,[obstacle]); audio.update(origin); assert.equal(door.state,'blocked'); assert.equal(playback.loops.size,0);
    assert.deepEqual(playback.cues,[]);
    door.update(.1,[obstacle]); audio.update(origin); assert.equal(door.state,'reopening'); assert.equal(playback.loops.size,1);
    door.restoreState({progress:0,desiredOpen:false}); audio.update(origin); assert.equal(playback.loops.size,0); assert.deepEqual(playback.cues,[]);
  } finally {audio.dispose();door.dispose();world.clear();surfaces.clear();}
});

test('proximity shutters use the same travel and stop sources and reset silently',()=>{
  const {root,playback,audio}=fixture();
  const door=new ProximityShutterDoor({id:'shutter',widthMetres:4,heightMetres:4,openDurationSeconds:1}); root.add(door.root);
  const occupants=[{id:'bob',position:new THREE.Vector3(0,1,0),radiusMetres:.45}];
  try {
    door.update(.2,occupants); audio.update(origin); assert.equal(playback.loops.size,1);
    door.update(1,occupants); audio.update(origin); assert.deepEqual(playback.cues,['world-door-stop-01']);
    door.update(.2,[]); audio.update(origin); assert.equal(playback.loops.size,1);
    door.reset(); audio.update(origin); assert.equal(playback.loops.size,0); assert.equal(playback.cues.length,1);
  } finally {audio.dispose();door.dispose();}
});

test('platforms sound actual travel, stay silent while held, and stop at the destination',()=>{
  const {root,playback,audio}=fixture();
  const platform=new MovingPlatform({id:'lift',start:new THREE.Vector3(),end:new THREE.Vector3(0,5,0),travelDurationSeconds:1});root.add(platform.root);
  try {
    platform.setActive(true); audio.update(origin); assert.equal(playback.loops.size,0);
    platform.update(.1); audio.update(origin); assert.equal([...playback.loops.values()][0].sound,'world-machinery-loop-01');
    platform.hold();audio.update(origin);assert.equal(playback.loops.size,0);
    platform.update(.1);audio.update(origin);assert.equal(playback.loops.size,1);
    platform.update(1);audio.update(origin);assert.equal(playback.loops.size,0);assert.deepEqual(playback.cues,[]);
    platform.restoreState({progress:.5,target:'start'});audio.update(origin);assert.equal(playback.loops.size,0);
    platform.update(.1);audio.update(origin);assert.equal(playback.loops.size,1);
    audio.reset(); assert.equal(playback.loops.size,0); audio.update(origin); assert.equal(playback.loops.size,0);
    platform.update(.1);audio.update(origin);assert.equal(playback.loops.size,1);
    audio.dispose();assert.equal(playback.loops.size,0);
  } finally {audio.dispose();platform.dispose();}
});

test('loop selection is bounded, positional and isolated between level roots',()=>{
  const {root,playback,audio}=fixture();
  const otherRoot=new THREE.Group(); let progress=0;
  const handles=Array.from({length:5},(_,i)=>{const node=new THREE.Group();node.position.x=i; (i===4?otherRoot:root).add(node);return new WorldAudioSource({root:node,kind:'machinery',progress:()=>progress});});
  try {
    progress=.1;audio.update(origin);assert.equal(playback.loops.size,2);
    assert.deepEqual([...playback.loops.values()].map(v=>v.position!.x),[0,1]);
    progress=.2;audio.update({x:3,y:1,z:0});assert.deepEqual([...playback.loops.values()].map(v=>v.position!.x).sort(),[2,3]);
    progress=.3;audio.update({x:100,y:1,z:0});assert.equal(playback.loops.size,0);
    progress=.4;audio.update(undefined);assert.equal(playback.loops.size,0);
  } finally {audio.dispose();for(const h of handles)h.dispose();}
});

test('laser hum follows the nearest active beam segment through world offsets and circuit gating',()=>{
  const {root,playback,audio}=fixture(), room=new THREE.Group();room.position.set(50,0,20);root.add(room);
  const lasers=[0,3].map(z=>new LaserHazard({id:`beam-${z}`,start:{x:-50,y:1,z},end:{x:50,y:1,z}}));for(const l of lasers)room.add(l.root);
  try {
    audio.update({x:2,y:1,z:21});assert.equal(playback.loops.size,1);
    assert.deepEqual([...playback.loops.values()][0].position,{x:2,y:1,z:20});
    lasers[0].setCircuitGateEnabled(false);audio.update({x:2,y:1,z:21});assert.deepEqual([...playback.loops.values()][0].position,{x:2,y:1,z:23});
    lasers[1].setEnabled(false);audio.update({x:2,y:1,z:21});assert.equal(playback.loops.size,0);
    lasers[1].setEnabled(true);room.visible=false;audio.update({x:2,y:1,z:21});assert.equal(playback.loops.size,0);
    room.visible=true;audio.update({x:2,y:1,z:40});assert.equal(playback.loops.size,0);
    audio.update({x:2,y:1,z:23});assert.equal(playback.loops.size,1);
    lasers[1].dispose();audio.update({x:2,y:1,z:23});assert.equal(playback.loops.size,0);
  } finally {audio.dispose();for(const l of lasers)l.dispose();}
});

test('pressure plates and wall controls play press/release once and reset silently',()=>{
  const cues:SoundId[]=[];const off=gameplayAudioEvents.on('cue',e=>cues.push(e.sound));
  const plate=new PressurePlate({id:'plate',position:new THREE.Vector3()});
  const world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  const bob={position:new THREE.Vector3(.6,0,0),radiusMetres:.45,attached:false,supportCollider:null as THREE.Mesh|null};
  const button=new WallButton({id:'wall',collisionWorld:world,surfaceRegistry:surfaces,position:new THREE.Vector3(),surfaceSize:new THREE.Vector3(.2,1.5,1.8),contactCentre:new THREE.Vector3(.55,0,0),contactSize:new THREE.Vector3(1.4,2,2.2),requiredOccupant:{id:'bob',body:bob}});
  try {
    plate.setOccupants(['bob']);plate.setOccupants(['bob']);plate.setOccupants([]);plate.setOccupants(['bob']);plate.reset();
    assert.deepEqual(cues,['world-activation-01','world-release-01','world-activation-01']);cues.length=0;
    button.setEnabled(true);button.update([{id:'bob',body:bob}]);assert.equal(cues.length,0);
    bob.attached=true;bob.supportCollider=button.surfaceMesh;button.update([{id:'bob',body:bob}]);button.update([{id:'bob',body:bob}]);
    bob.attached=false;button.update([{id:'bob',body:bob}]);bob.attached=true;button.update([{id:'bob',body:bob}]);button.reset();
    assert.deepEqual(cues,['world-activation-01','world-release-01','world-activation-01']);
  } finally {off();plate.dispose();button.dispose();world.clear();surfaces.clear();}
});

test('Cultivation scrolling-shaft elevator sounds its authoritative descent',()=>{
  const {root,playback,audio}=fixture(), room=new LevelTwoRoomFourGreybox();root.add(room.root);
  const listener={x:0,y:1,z:10};
  try {
    audio.update(listener);assert.equal(playback.loops.size,0);
    room.controller.update(1.5,true,true); room.controller.update(.2,true,true);audio.update(listener);
    assert.ok([...playback.loops.values()].some(v=>v.sound==='world-machinery-loop-01'));
    room.reset();audio.update(listener);assert.equal(playback.loops.size,0);
    room.controller.restoreArrival();audio.update(listener);assert.equal(playback.loops.size,0);
  } finally {audio.dispose();room.dispose();}
});
