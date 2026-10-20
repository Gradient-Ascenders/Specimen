import * as THREE from 'three';
import type { Vector3State } from '../../slime/SlimePresentationContract.ts';
import { ProximityContainmentMonitor, type ContainmentMonitorResources } from '../containment/ContainmentMonitor.ts';
import { ContainmentMonitorDialogue } from '../containment/ContainmentMonitorDialogue.ts';
import { ContainmentSurveillanceCameras } from '../containment/ContainmentSurveillanceCameras.ts';

export const CULTIVATION_ROOM_THREE_MONITOR_SCRIPT = Object.freeze([
  'They’re making their way toward Volt’s chamber',
  'It’s a high-security lockdown zone',
  'They won’t get far',
]);
export const CULTIVATION_ROOM_THREE_MONITOR_COLOURS = ['red', 'green', 'green'] as const;
// In Room 4's stationary boarding alcove: +X is left facing the lift (+Z).
export const CULTIVATION_ROOM_THREE_MONITOR_POSITION = Object.freeze({x:4.76,y:2.8,z:2.65});
export const CULTIVATION_ROOM_THREE_MONITOR_TRIGGER = Object.freeze({centre:{x:1.4,y:1,z:2.6},radius:3.4});
export const CULTIVATION_ROOM_THREE_CAMERA = Object.freeze({
  id:'cultivation-room-3-exit-surveillance-camera',roomId:3,
  position:[0,7.6,71.64] as const,yaw:Math.PI,
});

/** One terminal and one tracking camera, borrowing existing lab finishes. */
export class CultivationRoomThreeObservation {
  readonly root=new THREE.Group();
  readonly elevatorRoot=new THREE.Group();
  readonly monitor:ProximityContainmentMonitor;
  readonly cameras:ContainmentSurveillanceCameras;
  private readonly local=new THREE.Vector3();
  private disposed=false;

  constructor(resources:ContainmentMonitorResources){
    this.root.name='cultivation-room-3-observation';this.root.userData.presentationOwnedBy=this.root.name;
    this.elevatorRoot.name='cultivation-elevator-boarding-observation';this.elevatorRoot.userData.presentationOwnedBy=this.elevatorRoot.name;
    this.monitor=new ProximityContainmentMonitor(resources,{
      roomId:4,namePrefix:'cultivation-room-3',position:CULTIVATION_ROOM_THREE_MONITOR_POSITION,yaw:-Math.PI/2,
      dialogue:new ContainmentMonitorDialogue(CULTIVATION_ROOM_THREE_MONITOR_SCRIPT),
      sectionColours:CULTIVATION_ROOM_THREE_MONITOR_COLOURS,trigger:CULTIVATION_ROOM_THREE_MONITOR_TRIGGER,
    });
    this.elevatorRoot.add(this.monitor.root);
    this.cameras=new ContainmentSurveillanceCameras({3:this.root},[CULTIVATION_ROOM_THREE_CAMERA]);
  }
  update(dt:number,bob?:Vector3State,active?:Vector3State):void{
    this.updateMonitor(dt,active);this.updateCamera(dt,bob);
  }
  updateMonitor(dt:number,active?:Vector3State):void{
    if(this.disposed)return;
    this.monitor.update(dt,active?this.elevatorRoot.worldToLocal(this.local.copy(active)):undefined);
  }
  updateCamera(dt:number,bob?:Vector3State):void{
    if(this.disposed)return;
    this.cameras.update(dt,bob);
  }
  reset(preserveCompleted=false):void{if(!this.disposed){this.monitor.reset(preserveCompleted);this.cameras.reset();}}
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.monitor.dispose();this.cameras.dispose();
    this.root.removeFromParent();this.root.clear();this.elevatorRoot.removeFromParent();this.elevatorRoot.clear();
  }
}
