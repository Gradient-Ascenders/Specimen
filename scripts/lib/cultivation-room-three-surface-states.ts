import * as THREE from 'three';
import type {LevelTwoPreviewScene} from '../../src/levels/LevelTwoPreviewScene.ts';
import type {DissolveTarget} from '../../src/abilities/DissolveTarget.ts';
import type {RoomThreeDroneEncounter} from '../../src/hazards/RoomThreeDroneEncounter.ts';

/** Real wall, laser and drone controllers pose the extraction hall for review. */
export function visitCultivationRoomThreeSurfaceStates(scene:LevelTwoPreviewScene,targets:readonly DissolveTarget[],encounter:RoomThreeDroneEncounter,visit:(name:string)=>void):void{
  const room=scene.roomThree,zero=new THREE.Vector3();
  const braces=targets.filter(t=>t.mesh.userData.roomId===3&&t.mesh.name.endsWith('-wooden-latch'));
  const cables=targets.filter(t=>t.mesh.userData.authoringRole==='ceiling-drone-soluble-support-cable');
  const reset=()=>{for(const target of targets)target.reset();scene.reset();encounter.reset();};
  const step=(dt:number)=>encounter.update(dt,'goop',zero,{bob:false,goop:false});
  reset();visit('room-three-initial');
  for(const target of braces)target.advance(target.dissolveDurationSeconds*.45);
  visit('room-three-latches-dissolving');
  for(const target of braces)target.advance(target.dissolveDurationSeconds);
  room.update(.3,[]);visit('room-three-walls-descending');
  room.update(.7,[]);visit('room-three-walls-landed');
  room.update(.6,[]);visit('room-three-laser-sweep');
  for(const target of cables)target.advance(target.dissolveDurationSeconds*.45);
  step(.1);visit('room-three-drone-supports-dissolving');
  for(const target of cables)target.advance(target.dissolveDurationSeconds);
  step(.01);step(.3);visit('room-three-drones-falling');
  step(.7);visit('room-three-drones-disabled');
  step(13);step(.8);visit('room-three-cable-deploying');
  step(1.2);step(.8);visit('room-three-drones-reinstalling');
  step(1);visit('room-three-drones-restored');
  for(const drone of encounter.groundDrones)drone.beginCinematicPush();
  step(.4);visit('room-three-sentries-tipping');
  step(.6);visit('room-three-sentries-disabled');
  reset();visit('room-three-reset');
}
