import * as THREE from 'three';
import type {LevelTwoPreviewScene} from '../../src/levels/LevelTwoPreviewScene.ts';
import type {DissolveTarget} from '../../src/abilities/DissolveTarget.ts';

/** Production controller poses for the load cradles, hold control and shared exit. */
export function visitCultivationRoomTwoSurfaceStates(scene:LevelTwoPreviewScene,targets:readonly DissolveTarget[],visit:(name:string)=>void):void{
  const room=scene.roomTwo,door=scene.roomTwoToThreeGoopPassage.entryDoor;
  const reset=()=>{for(const target of targets)target.reset();scene.reset();};
  const braces=targets.filter(target=>target.mesh.userData.roomId===2);
  reset();visit('room-two-initial');
  for(const target of braces)target.advance(target.dissolveDurationSeconds*.45);
  visit('room-two-dissolving');
  for(const target of braces)target.advance(target.dissolveDurationSeconds);
  room.update(.25,[]);visit('room-two-drops-quarter');
  room.update(.45,[]);visit('room-two-drops-late');
  room.update(.5,[]);visit('room-two-landed');
  const bob=room.root.localToWorld(new THREE.Vector3(-18,14.2,28.5));
  const goop=room.root.localToWorld(new THREE.Vector3(0,.66,45.5));
  const held=[{id:'bob',position:bob,radiusMetres:.45,attached:true,supportCollider:room.wallButton}];
  room.update(.3,held);door.update(.24,[{id:'goop',position:goop,radiusMetres:.45}]);
  visit('room-two-button-pressing');
  room.update(.3,held);door.update(2,[{id:'goop',position:goop,radiusMetres:.45}]);
  visit('room-two-button-held-door-open');
  room.update(.3,[]);door.update(.24,[]);visit('room-two-button-releasing');
  room.update(.3,[]);door.update(2,[]);visit('room-two-door-reclosed');
  reset();visit('room-two-reset');
}
