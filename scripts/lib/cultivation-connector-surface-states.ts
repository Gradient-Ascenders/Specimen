import * as THREE from 'three';
import type {LevelTwoPreviewScene} from '../../src/levels/LevelTwoPreviewScene.ts';
import type {DissolveTarget} from '../../src/abilities/DissolveTarget.ts';

/** Existing controllers pose the two connector doors and the filtration fan. */
export function visitCultivationConnectorSurfaceStates(scene:LevelTwoPreviewScene,targets:readonly DissolveTarget[],visit:(name:string)=>void):void{
  const passage=scene.roomTwoToThreeGoopPassage,art=scene.filtrationArt;
  const reset=()=>{for(const target of targets)target.reset();scene.reset();};
  const fanStep=(ticks:number)=>{for(let i=0;i<ticks;i++)art.update(.1);};
  const occupants=(z:number)=>[{id:'goop',position:passage.root.localToWorld(new THREE.Vector3(0,.86,z)),radiusMetres:.45}];
  reset();visit('connectors-initial');
  const bob=scene.roomTwo.root.localToWorld(new THREE.Vector3(-18,14.2,28.5));
  scene.roomTwo.update(.6,[{id:'bob',position:bob,radiusMetres:.45,attached:true,supportCollider:scene.roomTwo.wallButton}]);
  passage.entryDoor.update(.24,occupants(.5));fanStep(11);visit('connectors-entry-opening');
  passage.entryDoor.update(2,occupants(.5));fanStep(23);visit('connectors-entry-open');
  passage.exitDoor.update(.24,occupants(27.5));fanStep(31);visit('connectors-exit-opening');
  passage.exitDoor.update(2,occupants(27.5));fanStep(39);visit('connectors-both-open');
  passage.entryDoor.update(.24,[]);passage.exitDoor.update(.24,[]);fanStep(15);visit('connectors-closing');
  passage.update(2,[]);scene.roomTwo.update(.6,[]);visit('connectors-reclosed');
  reset();visit('connectors-reset');
}
