import * as THREE from 'three';
import type { LevelTwoRoomThreeGreybox } from '../levels/LevelTwoRoomThreeGreybox.ts';

export interface RoomThreeDescentStep {
  readonly landingName:string;
  readonly hold:THREE.Vector3;
  readonly from:THREE.Vector3;
  readonly to:THREE.Vector3;
  readonly walkStart:number;
  readonly chargeStart:number;
  readonly start:number;
  readonly end:number;
  readonly chargeFraction:number;
  readonly horizontalDelaySeconds?:number;
}
export const ROOM_THREE_DESCENT_GRAVITY=12;
export const ROOM_THREE_DESCENT_FLOOR=Object.freeze({x:8.6,y:.35,z:70.8});
export const ROOM_THREE_DESCENT_PLATFORMS=Object.freeze([
  'cultivation-room-3-bob-last-island','cultivation-room-3-bob-drop-launch',
]);
const ease=(u:number)=>{u=THREE.MathUtils.clamp(u,0,1);return u*u*(3-2*u);};

/** One leap from the top to the safe bank, with a small elastic landing rebound. */
export class CultivationRoomThreeDescent {
  readonly steps:RoomThreeDescentStep[]=[];
  private readonly initial=new THREE.Vector3();
  private readonly centre=new THREE.Vector3();
  private readonly direction=new THREE.Vector3();
  private readonly approachFrom=new THREE.Vector3();
  private readonly approachTo=new THREE.Vector3();
  private approachStart=0;
  private approachEnd=0;
  private readonly room:LevelTwoRoomThreeGreybox;
  private readonly radius:number;
  constructor(room:LevelTwoRoomThreeGreybox,radius:number){this.room=room;this.radius=radius;}
  get landSeconds():number{return Math.max(this.steps.at(-1)?.end??0,this.approachEnd);}

  begin(start:THREE.Vector3,platform:string):void{
    if(!ROOM_THREE_DESCENT_PLATFORMS.includes(platform))throw new Error('Unknown Room 3 descent platform.');
    this.initial.copy(start);this.steps.length=0;this.approachStart=this.approachEnd=0;
    const to=new THREE.Vector3(ROOM_THREE_DESCENT_FLOOR.x,ROOM_THREE_DESCENT_FLOOR.y+this.radius+.01,ROOM_THREE_DESCENT_FLOOR.z);
    const mesh=this.room.collisionMeshes.find(mesh=>mesh.name===platform);
    if(!mesh)throw new Error(`Missing Room 3 descent platform: ${platform}`);
    mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox!;
    bounds.getCenter(this.centre);this.centre.y=bounds.max.y+this.radius+.01;
    this.room.root.worldToLocal(mesh.localToWorld(this.centre));
    this.direction.subVectors(to,this.centre);this.direction.y=0;this.direction.normalize();
    const halfX=(bounds.max.x-bounds.min.x)/2-this.radius-.12,halfZ=(bounds.max.z-bounds.min.z)/2-this.radius-.12;
    const distance=Math.min(Math.abs(this.direction.x)>1e-6?halfX/Math.abs(this.direction.x):Infinity,
      Math.abs(this.direction.z)>1e-6?halfZ/Math.abs(this.direction.z):Infinity);
    const from=this.centre.clone().addScaledVector(this.direction,distance),walkStart=.8;
    const chargeStart=walkStart+THREE.MathUtils.clamp(start.distanceTo(from)/4.5,.32,.85),jumpStart=chargeStart+.32;
    // Keep a natural upward launch, then let gravity carry him all the way down.
    const launchSpeed=6.5,gravity=ROOM_THREE_DESCENT_GRAVITY;
    const flight=(launchSpeed+Math.sqrt(launchSpeed*launchSpeed+2*gravity*(from.y-to.y)))/gravity;
    const end=jumpStart+flight;
    this.steps.push({landingName:'floor',hold:start.clone(),from,to,walkStart,chargeStart,start:jumpStart,end,chargeFraction:.45});
    // A real floor contact/squash, not another platform or an airborne pause.
    this.steps.push({landingName:'rebound',hold:to,from:to,to,walkStart:end,chargeStart:end,
      start:end+.18,end:end+.18+.52,chargeFraction:.12});
  }

  /** A skipped upper route rejoins from Bob's real landing, never from upstairs. */
  beginFromBottom(start:THREE.Vector3,onDrone:boolean):void{
    this.initial.copy(start);this.steps.length=0;
    const floorY=ROOM_THREE_DESCENT_FLOOR.y+this.radius+.01;
    this.approachTo.set(ROOM_THREE_DESCENT_FLOOR.x,floorY,ROOM_THREE_DESCENT_FLOOR.z);
    this.approachFrom.copy(start);this.approachStart=.6;
    // The front of the bank is occupied by the sentries. Clear the row at the
    // current X first, then walk along its unobstructed rear service lane.
    if(onDrone||start.z<70.2){
      const to=new THREE.Vector3(start.x,floorY,ROOM_THREE_DESCENT_FLOOR.z),jumpStart=.8;
      const launchSpeed=8,gravity=ROOM_THREE_DESCENT_GRAVITY;
      const flight=(launchSpeed+Math.sqrt(launchSpeed*launchSpeed+2*gravity*(start.y-to.y)))/gravity;
      const end=jumpStart+flight;
      this.steps.push({landingName:'floor',hold:start.clone(),from:start.clone(),to,
        walkStart:.4,chargeStart:.4,start:jumpStart,end,chargeFraction:.3,horizontalDelaySeconds:.32});
      this.approachFrom.copy(to);this.approachStart=end+.3;
    }
    this.approachEnd=this.approachStart+Math.max(.32,this.approachFrom.distanceTo(this.approachTo)/4);
  }
  sample(t:number,target:THREE.Vector3):void{
    target.copy(this.initial);
    for(const step of this.steps){
      if(t<step.walkStart){target.copy(step.hold);return;}
      if(t<step.chargeStart){target.lerpVectors(step.hold,step.from,ease((t-step.walkStart)/(step.chargeStart-step.walkStart)));return;}
      if(t<step.start){target.copy(step.from);return;}
      if(t<step.end){
        const age=t-step.start,duration=step.end-step.start,delay=step.horizontalDelaySeconds??0,u=(age-delay)/(duration-delay);
        target.lerpVectors(step.from,step.to,ease(u));
        target.y=step.from.y+((step.to.y-step.from.y)/duration+ROOM_THREE_DESCENT_GRAVITY*duration/2)*age-
          ROOM_THREE_DESCENT_GRAVITY*age*age/2;return;
      }
      target.copy(step.to);
    }
    if(this.approachEnd>0&&t>=this.approachStart){
      target.lerpVectors(this.approachFrom,this.approachTo,ease((t-this.approachStart)/(this.approachEnd-this.approachStart)));
    }
  }
  velocity(step:RoomThreeDescentStep,t:number,target:THREE.Vector3):void{
    const duration=step.end-step.start,delay=step.horizontalDelaySeconds??0;
    const u=THREE.MathUtils.clamp((t-step.start-delay)/(duration-delay),0,1),horizontal=6*u*(1-u)/(duration-delay);
    target.set((step.to.x-step.from.x)*horizontal,
      (step.to.y-step.from.y)/duration+ROOM_THREE_DESCENT_GRAVITY*duration/2-ROOM_THREE_DESCENT_GRAVITY*(t-step.start),
      (step.to.z-step.from.z)*horizontal);
  }
}
