import * as THREE from 'three';
import type {LevelTwoPreviewScene} from '../../src/levels/LevelTwoPreviewScene.ts';
import type {ElevatorDroneEncounter} from '../../src/hazards/ElevatorDroneEncounter.ts';

/** Existing lift/door/encounter owners drive every sampled pose. No debug animation clock. */
export function visitCultivationLiftSurfaceStates(scene:LevelTwoPreviewScene,encounter:ElevatorDroneEncounter,visit:(name:string)=>void,restoreTargets:()=>void=()=>{}):void{
  const room=scene.roomFour,door=room.entrance;
  const reset=()=>{scene.reset();restoreTargets();encounter.reset();};
  const sample=(name:string)=>{scene.elevatorArt.update(room.controller.progress);scene.root.updateWorldMatrix(true,true);visit(name);};
  reset();sample('lift-closed');
  const near=door.root.localToWorld(new THREE.Vector3(0,1,-1));
  door.update(.24,[{id:'bob',position:near,radiusMetres:.45}]);sample('lift-entrance-opening');
  door.update(1,[{id:'bob',position:near,radiusMetres:.45}]);sample('lift-entrance-open');
  const occupants=['bob','goop'].map((id,i)=>({id,radiusMetres:.45,position:room.root.localToWorld(new THREE.Vector3(i?2:-2,.66,9))}));
  room.update(.6,[occupants[0]]);sample('lift-waiting-for-goop');
  room.update(1.5,occupants);sample('lift-boarding-confirmed');
  let elapsed=0;
  for(const [time,name]of [[.3,'lift-starting'],[15.3,'lift-first-wave'],[30.3,'lift-second-wave'],[45.3,'lift-third-wave'],[57.3,'lift-braking'],[60,'lift-arrival-shield-start']] as const){
    while(elapsed<time-1e-8){const dt=Math.min(1/30,time-elapsed);room.update(dt,occupants);encounter.update(dt,'goop');elapsed+=dt;}
    sample(name);
  }
  room.update(.4,occupants);encounter.update(.4,'goop');sample('lift-arrival-half-open');
  room.update(.39,occupants);encounter.update(.39,'goop');sample('lift-arrival-running-return');
  room.update(.71,occupants);encounter.update(.71,'goop');sample('lift-arrival-open');
  reset();room.update(1.5,occupants);room.update(2.2,occupants);encounter.update(2.2,'goop');sample('lift-emitter-rail-pass');
  reset();sample('lift-reset');
}
