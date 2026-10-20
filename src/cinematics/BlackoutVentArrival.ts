import * as THREE from 'three';
import type {KinematicBody} from '../physics/KinematicBody.ts';
import type {BobCharacterPresentation,BobCharacterPresentationState} from '../render/bob/BobCharacterPresentation.ts';
import type {GoopCharacterPresentation} from '../render/goop/GoopCharacterPresentation.ts';
import type {VoltCharacterPresentation} from '../render/volt/VoltCharacterPresentation.ts';
import {gameplayAudioEvents} from '../audio/GameplayAudioEvents.ts';
import type {BlackoutEntryVentCollapse} from '../render/environment/blackout/BlackoutEntryVentCollapse.ts';
import {BLACKOUT_ENTRY_VENT as V,blackoutArrivalSmooth as smooth,blackoutEntryVentFloor,blackoutEntryVentPitch,
  sampleBlackoutArrival,type BlackoutArrivalSlime} from './BlackoutVentArrivalLayout.ts';

type Presentation=BobCharacterPresentation|GoopCharacterPresentation|VoltCharacterPresentation;
interface Options {
  readonly root:THREE.Group;
  readonly bodies:Readonly<Record<BlackoutArrivalSlime,KinematicBody>>;
  readonly presentations:Readonly<Record<BlackoutArrivalSlime,Presentation>>;
  readonly ventCollapse:BlackoutEntryVentCollapse;
}
interface Actor {
  readonly id:BlackoutArrivalSlime;readonly body:KinematicBody;readonly presentation:Presentation;readonly pose:THREE.Group;
  readonly position:THREE.Vector3;readonly previous:THREE.Vector3;readonly velocity:THREE.Vector3;
  readonly state:BobCharacterPresentationState;parent:THREE.Object3D|null;
}
const UP=new THREE.Vector3(0,1,0),ZERO=new THREE.Vector3();

/** Seven-second, level-owned arrival. Borrows the existing bodies/models and
 * warmed bay materials; no scene loading, body recreation or gameplay clocks.
 * The quiet hand-back blends to the still-running follow rig. */
export class BlackoutVentArrival {
  readonly actors:readonly Actor[];
  private playing=false;
  private played=false;
  private disposed=false;
  private elapsed=0;
  private previousElapsed=0;
  private readonly eye=new THREE.Vector3();
  private readonly target=new THREE.Vector3();
  private readonly sample=new THREE.Vector3();
  private readonly look=new THREE.Matrix4();
  private readonly orientation=new THREE.Quaternion();
  private readonly direction=new THREE.Vector3(0,0,1);
  private camera:THREE.PerspectiveCamera|undefined;
  private cameraFov=48;
  private cameraNear=.1;
  private readonly ambient:THREE.HemisphereLight|undefined;
  private ambientIntensity=0;
  private readonly ventCollapse:BlackoutEntryVentCollapse;

  constructor(options:Options){
    this.ventCollapse=options.ventCollapse;
    let ambient:THREE.HemisphereLight|undefined;
    options.root.traverse(node=>{if(node instanceof THREE.HemisphereLight)ambient??=node;});this.ambient=ambient;
    this.actors=(['bob','goop','volt'] as const).map(id=>{
      const body=options.bodies[id],presentation=options.presentations[id],pose=new THREE.Group();
      pose.name=`blackout-arrival-${id}`;pose.visible=false;options.root.add(pose);
      const position=new THREE.Vector3(),previous=new THREE.Vector3(),velocity=new THREE.Vector3();
      const state:BobCharacterPresentationState={locomotionPositionWorld:position,velocityWorld:velocity,movementIntentWorld:ZERO,
        maximumLocomotionSpeedMetresPerSecond:6,surfaceNormalWorld:UP,gameplayUpWorld:UP,grounded:true,attached:false,
        chargingJump:false,jumpCharge:0,contactCount:0,contactNormalWorld:UP,contactSpeedMetresPerSecond:0,
        contactName:'',contactSurfaceTag:'default',landedThisStep:false};
      return{id,body,presentation,pose,position,previous,velocity,state,parent:null};
    });
  }
  get active():boolean{return this.playing;}
  get seconds():number{return this.elapsed;}
  get complete():boolean{return this.played&&!this.playing;}
  begin(camera:THREE.PerspectiveCamera):boolean{
    if(this.played||this.disposed)return false;
    this.played=this.playing=true;this.elapsed=this.previousElapsed=0;
    this.ventCollapse.openForArrival();
    this.camera=camera;this.cameraFov=camera.fov;this.cameraNear=camera.near;camera.near=.06;camera.updateProjectionMatrix();
    if(this.ambient){this.ambientIntensity=this.ambient.intensity;this.ambient.intensity=Math.max(this.ambientIntensity,.14);}
    for(const actor of this.actors){
      sampleBlackoutArrival(actor.id,0,actor.position);actor.previous.copy(actor.position);
      actor.pose.position.copy(actor.position);actor.pose.visible=true;
      actor.parent=actor.presentation.root.parent;actor.pose.add(actor.presentation.root);
      actor.presentation.setPosition(ZERO);actor.presentation.reset();actor.presentation.setYaw(Math.PI);
      actor.body.syncKinematicPose(actor.position);actor.presentation.setVisible(true);actor.presentation.setOpacity(1);
    }
    this.updateActors(0,1/60);return true;
  }
  update(dt:number):boolean{
    if(!this.playing)return false;
    if(!Number.isFinite(dt)||dt<=0)throw new RangeError('Invalid Blackout arrival timestep.');
    this.previousElapsed=this.elapsed;this.elapsed=Math.min(V.duration,this.elapsed+dt);
    this.updateActors(this.elapsed,dt);
    this.ventCollapse.update(this.elapsed);
    if(this.previousElapsed<V.collapseImpact&&this.elapsed>=V.collapseImpact)
      gameplayAudioEvents.emit('cue',{sound:'world-platform-land-01',position:this.ventCollapse.collisionMesh.position,volumeScale:.7,maxDistance:35});
    if(this.elapsed>=V.duration){
      // Reacquire the real floor before normal movement resumes. CP1 and its
      // three existing body identities remain the recovery authority.
      for(const actor of this.actors)actor.body.teleport(actor.position);
      this.cancel();return true;
    }
    return false;
  }
  private updateActors(t:number,dt:number):void{
    for(const actor of this.actors){
      sampleBlackoutArrival(actor.id,t,actor.position);sampleBlackoutArrival(actor.id,this.previousElapsed,actor.previous);
      actor.velocity.subVectors(actor.position,actor.previous).divideScalar(dt);
      actor.body.syncKinematicPose(actor.position,actor.previous);actor.pose.position.copy(actor.position);
      actor.presentation.setPosition(ZERO);
      actor.state.grounded=t<V.release[actor.id]||t>=V.land[actor.id];actor.state.landedThisStep=false;
      if(this.previousElapsed<V.release[actor.id]&&t>=V.release[actor.id]){
        actor.presentation.onLaunch({directionWorld:this.direction,speedMetresPerSecond:6,chargeFraction:0});
        gameplayAudioEvents.emit('cue',{sound:'bob-fall-01',position:actor.position,volumeScale:.5,maxDistance:35});
      }
      if(this.previousElapsed<V.land[actor.id]&&t>=V.land[actor.id]){
        const impact=2*V.floorY/(V.land[actor.id]-V.release[actor.id]);
        actor.presentation.onLanding(UP,impact);actor.state.landedThisStep=true;
        gameplayAudioEvents.emit('cue',{sound:actor.id==='bob'?'bob-land-hard-01':'bob-land-soft-01',position:actor.position,volumeScale:.7,maxDistance:35});
      }
      actor.presentation.update(dt,actor.state);
    }
  }
  present(camera:THREE.PerspectiveCamera,alpha:number):void{
    if(!this.playing)return;
    const t=THREE.MathUtils.lerp(this.previousElapsed,this.elapsed,THREE.MathUtils.clamp(alpha,0,1));
    this.ventCollapse.present(t);
    for(const actor of this.actors){
      sampleBlackoutArrival(actor.id,t,this.sample);actor.pose.position.copy(this.sample);
      const u=THREE.MathUtils.clamp((t-V.release[actor.id])/(V.land[actor.id]-V.release[actor.id]),0,1);
      actor.pose.rotation.set(t<V.release[actor.id]?blackoutEntryVentPitch(this.sample.z):.12*Math.sin(Math.PI*u),0,0);
      actor.presentation.setPosition(ZERO);actor.presentation.setVisible(true);actor.presentation.setOpacity(1);actor.presentation.present(alpha);
    }
    let fov=54;
    if(t<2){
      sampleBlackoutArrival('volt',t,this.sample);
      const z=this.sample.z-2.3;this.eye.set(1.5,blackoutEntryVentFloor(z)+2.15,z);
      sampleBlackoutArrival('bob',t,this.target);this.target.y+=.3;fov=61;
    }else if(t<2.85){
      this.eye.set(1.45,4.25,-.4);sampleBlackoutArrival('bob',t,this.target);this.target.y+=.3;fov=61;
    }else{
      const u=smooth((t-2.85)/2.35);this.eye.set(THREE.MathUtils.lerp(6,3.5,u),THREE.MathUtils.lerp(3.2,2.2,u),THREE.MathUtils.lerp(6.6,7.2,u));
      this.target.set(0,0,0);
      for(const id of ['bob','goop','volt'] as const){sampleBlackoutArrival(id,t,this.sample);this.target.addScaledVector(this.sample,1/3);}
      this.target.y+=.45;
      if(t>=5.2){
        // Stay in front of the group, not behind the parked maintenance
        // drone where its rotor would mask Volt's landing/recovery.
        const settle=smooth((t-5.2)/.8);this.eye.lerp(this.sample.set(1.2,1.9,7.2),settle);
        this.target.lerp(this.sample.set(0,1,1.6),settle);fov=52;
      }
    }
    this.look.lookAt(this.eye,this.target,UP);this.orientation.setFromRotationMatrix(this.look);
    const blend=smooth((t-V.returnStart)/(V.duration-V.returnStart));
    // Lift the existing ambient slot just enough to read Goop/Bob in the
    // unpowered chute. No added lights, and no flash when normal play returns.
    if(this.ambient)this.ambient.intensity=THREE.MathUtils.lerp(Math.max(this.ambientIntensity,.14),this.ambientIntensity,blend);
    camera.position.lerpVectors(this.eye,camera.position,blend);camera.quaternion.slerp(this.orientation,1-blend);
    camera.fov=THREE.MathUtils.lerp(fov,this.cameraFov,blend);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  }
  cancel():void{
    if(this.playing){
      this.ventCollapse.seal();
      for(const actor of this.actors){
        if(actor.parent)actor.parent.add(actor.presentation.root);else actor.presentation.root.removeFromParent();
        actor.pose.visible=false;actor.presentation.setPosition(actor.body.position);
      }
      if(this.camera){this.camera.fov=this.cameraFov;this.camera.near=this.cameraNear;this.camera.updateProjectionMatrix();}
      if(this.ambient)this.ambient.intensity=this.ambientIntensity;
    }
    this.playing=false;
  }
  dispose():void{if(this.disposed)return;this.disposed=true;this.cancel();this.actors.forEach(actor=>actor.pose.removeFromParent());}
}
