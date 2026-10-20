import * as THREE from 'three';
import type { Vector3State } from '../../slime/SlimePresentationContract.ts';
import { ProximityContainmentMonitor, type ContainmentMonitorResources } from '../containment/ContainmentMonitor.ts';
import { ContainmentMonitorDialogue } from '../containment/ContainmentMonitorDialogue.ts';
import { ContainmentSurveillanceCameras } from '../containment/ContainmentSurveillanceCameras.ts';

export const CULTIVATION_ROOM_TWO_MONITOR_POSITION=Object.freeze({x:0,y:6.35,z:44.64});
export const CULTIVATION_ROOM_TWO_MONITOR_TRIGGER=Object.freeze({centre:Object.freeze({x:0,y:1,z:40.5}),radius:7.5});
export const CULTIVATION_ROOM_TWO_MONITOR_SCRIPT=Object.freeze([
  'The drones won’t contain Goop, He’ll simply destroy them',
  'That’s precisely why we developed the new shield system',
  'Only a handful of drones are equipped with this system',
  'We must use them wisely',
]);
export const CULTIVATION_ROOM_TWO_MONITOR_COLOURS=['green','red','green','green'] as const;
// Facing the west wall, screen-left is +Z: clear of the final sticky panel.
export const CULTIVATION_ROOM_TWO_CAMERA=Object.freeze({
  id:'cultivation-room-2-button-surveillance-camera',roomId:2,
  position:[-18.76,15.7,33.6] as const,yaw:Math.PI/2,
});

export class CultivationRoomTwoObservation {
  readonly root=new THREE.Group();
  readonly monitor:ProximityContainmentMonitor;
  readonly cameras:ContainmentSurveillanceCameras;
  private readonly localActive=new THREE.Vector3();
  private disposed=false;
  constructor(resources:ContainmentMonitorResources){
    this.root.name='cultivation-room-2-observation';this.root.userData.presentationOwnedBy=this.root.name;
    this.root.updateMatrix();this.root.matrixAutoUpdate=false;
    this.monitor=new ProximityContainmentMonitor(resources,{
      roomId:2,namePrefix:'cultivation-room-2',position:CULTIVATION_ROOM_TWO_MONITOR_POSITION,yaw:Math.PI,
      dialogue:new ContainmentMonitorDialogue(CULTIVATION_ROOM_TWO_MONITOR_SCRIPT,{columns:20}),
      sectionColours:CULTIVATION_ROOM_TWO_MONITOR_COLOURS,trigger:CULTIVATION_ROOM_TWO_MONITOR_TRIGGER,
    });
    this.root.add(this.monitor.root);this.cameras=new ContainmentSurveillanceCameras({2:this.root},[CULTIVATION_ROOM_TWO_CAMERA]);
  }
  update(dt:number,bob?:Vector3State,active?:Vector3State):void{
    if(this.disposed)return;
    this.monitor.update(dt,active?this.root.worldToLocal(this.localActive.copy(active)):undefined);this.cameras.update(dt,bob);
  }
  reset(preserveCompleted=false):void{if(!this.disposed){this.monitor.reset(preserveCompleted);this.cameras.reset();}}
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    this.monitor.dispose();this.cameras.dispose();this.root.removeFromParent();this.root.clear();
  }
}
