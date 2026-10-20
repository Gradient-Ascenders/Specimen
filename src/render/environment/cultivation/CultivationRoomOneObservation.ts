import * as THREE from 'three';
import type { Vector3State } from '../../slime/SlimePresentationContract.ts';
import { ProximityContainmentMonitor, type ContainmentMonitorResources } from '../containment/ContainmentMonitor.ts';
import { ContainmentMonitorDialogue } from '../containment/ContainmentMonitorDialogue.ts';
import { ContainmentSurveillanceCameras } from '../containment/ContainmentSurveillanceCameras.ts';

// Looking toward the +Z exit, screen-left is +X and screen-right is -X.
export const CULTIVATION_ROOM_ONE_MONITOR_POSITION = Object.freeze({x:-5.3,y:3,z:49.64});
export const CULTIVATION_ROOM_ONE_MONITOR_TRIGGER = Object.freeze({
  centre:Object.freeze({x:0,y:1,z:45.5}),radius:6,
});
export const CULTIVATION_ROOM_ONE_MONITOR_SCRIPT = Object.freeze([
  'Goop and Bob must be retrieved immediately',
  'The area is too hazardous for retrieval',
  'We must wait',
]);
export const CULTIVATION_ROOM_ONE_MONITOR_COLOURS = ['red','green','green'] as const;
export const CULTIVATION_ROOM_ONE_CAMERA = Object.freeze({
  id:'cultivation-room-1-exit-surveillance-camera',roomId:1,
  position:[3.25,4.35,49.65] as const,yaw:Math.PI,
});

/** Reuses the existing terminal/camera models without loading Level 1's art assets. */
export class CultivationRoomOneObservation {
  readonly root=new THREE.Group();
  readonly monitor:ProximityContainmentMonitor;
  readonly cameras:ContainmentSurveillanceCameras;
  private readonly localActive=new THREE.Vector3();
  private disposed=false;

  constructor(resources:ContainmentMonitorResources){
    this.root.name='cultivation-room-1-observation';
    this.root.userData.presentationOwnedBy=this.root.name;
    this.root.updateMatrix();this.root.matrixAutoUpdate=false;
    this.monitor=new ProximityContainmentMonitor(resources,{
      roomId:1,namePrefix:'cultivation-room-1',position:CULTIVATION_ROOM_ONE_MONITOR_POSITION,yaw:Math.PI,
      dialogue:new ContainmentMonitorDialogue(CULTIVATION_ROOM_ONE_MONITOR_SCRIPT),
      sectionColours:CULTIVATION_ROOM_ONE_MONITOR_COLOURS,trigger:CULTIVATION_ROOM_ONE_MONITOR_TRIGGER,
    });
    this.root.add(this.monitor.root);
    this.cameras=new ContainmentSurveillanceCameras({1:this.root},[CULTIVATION_ROOM_ONE_CAMERA]);
  }

  update(deltaSeconds:number,bobPosition?:Vector3State,activePosition?:Vector3State):void{
    if(this.disposed)return;
    // Proximity is authored in room space; tracking and sound use world space.
    const local=activePosition?this.root.worldToLocal(this.localActive.copy(activePosition)):undefined;
    this.monitor.update(deltaSeconds,local);
    this.cameras.update(deltaSeconds,bobPosition);
  }

  reset(preserveCompleted=false):void{if(!this.disposed){this.monitor.reset(preserveCompleted);this.cameras.reset();}}
  dispose():void{
    if(this.disposed)return;
    this.disposed=true;this.monitor.dispose();this.cameras.dispose();this.root.removeFromParent();this.root.clear();
  }
}
