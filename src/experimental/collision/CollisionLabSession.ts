import { DeformableBody } from '../ground/DeformableBody.ts';
import { IDLE, type GroundBody, type GroundInput } from '../ground/GroundBody.ts';
import { ACCEPTED_GROUND_CONFIG, ACCEPTED_GROUND_REFERENCE_ID } from '../ground/MaterialPresets.ts';
import { MAX_RECORDING_TICKS, reversalInputs, stateDigest } from '../ground/GroundSession.ts';
import { CageWorldContacts } from './CageWorldContacts.ts';
import { COLLISION_SCENARIOS, CollisionLabScene } from './CollisionLabScenes.ts';
import { KinematicCollisionBody } from './KinematicCollisionBody.ts';

export type CollisionMode='finite-cage'|'plane-reference'|'kinematic';
export interface CollisionTape {
  version:1; reference: typeof ACCEPTED_GROUND_REFERENCE_ID;
  scene:string; mode:CollisionMode; friction:number; inputs:GroundInput[]; expected?:string;
}

export class CollisionLabSession {
  scene:CollisionLabScene;
  body:GroundBody;
  mode:CollisionMode='finite-cage';
  friction=ACCEPTED_GROUND_CONFIG.friction;
  tick=0;
  state:'live'|'recording'|'replaying'|'finished'='live';
  result='';
  saved:CollisionTape|undefined;
  private tape:CollisionTape|undefined;

  constructor(){
    this.scene=new CollisionLabScene(COLLISION_SCENARIOS[0]);
    this.body=this.createBody();
  }
  private createBody():GroundBody {
    if(this.mode==='kinematic')return new KinematicCollisionBody(this.scene);
    return new DeformableBody({...ACCEPTED_GROUND_CONFIG,friction:this.friction},
      this.mode==='finite-cage'?new CageWorldContacts(this.scene.world):undefined,this.scene.definition.spawn);
  }
  configure(sceneId:string,mode:CollisionMode=this.mode,friction=this.friction):void {
    const definition=COLLISION_SCENARIOS.find(scene=>scene.id===sceneId);
    if(!definition)throw new Error('Unknown collision scenario.');
    // The plane reference deliberately exists only in the flat comparison.
    this.mode=mode==='plane-reference'&&sceneId!=='flat'?'finite-cage':mode;
    this.friction=friction;this.body.dispose();this.scene.dispose();
    this.scene=new CollisionLabScene(definition);this.body=this.createBody();this.reset();
  }
  reset():void {
    this.body.reset(this.scene.definition.spawn);this.tick=0;this.state='live';this.result='';this.tape=undefined;
    if(this.body instanceof DeformableBody){
      const {initialScale,initialVelocity,spawn}=this.scene.definition;
      if(initialScale){
        for(let j=0;j<this.body.positions.length;j++)this.body.positions[j]=spawn[j%3]+(this.body.positions[j]-spawn[j%3])*initialScale[j%3];
        this.body.collision?.reset(this.body);this.body.previous.set(this.body.positions);
      }
      if(initialVelocity)for(let j=0;j<this.body.velocities.length;j++)this.body.velocities[j]=initialVelocity[j%3];
    }
  }
  private newTape(inputs:GroundInput[]=[]):CollisionTape {
    return {version:1,reference:ACCEPTED_GROUND_REFERENCE_ID,scene:this.scene.definition.id,mode:this.mode,friction:this.friction,inputs};
  }
  record():void {this.reset();this.tape=this.newTape();this.state='recording';}
  stop():void {
    if(this.state!=='recording'||!this.tape)return;
    this.tape.expected=JSON.stringify(this.body.snapshot());this.saved=this.tape;this.tape=undefined;this.state='finished';
    this.result=`Recorded ${this.tick} ticks · ${stateDigest(this.saved.expected!)}`;
  }
  play(tape:CollisionTape):void {
    if(tape.reference!==ACCEPTED_GROUND_REFERENCE_ID)throw new Error('Tape uses a different accepted reference.');
    this.configure(tape.scene,tape.mode,tape.friction);this.tape={...tape,inputs:tape.inputs.map(input=>({...input}))};
    this.state='replaying';if(!tape.inputs.length)this.finish();
  }
  demo():void {this.play(this.newTape(reversalInputs()));}
  private finish():void {
    const state=JSON.stringify(this.body.snapshot()),tape=this.tape!;
    this.result=tape.expected===undefined?`Tape complete · ${stateDigest(state)}`:
      `${tape.expected===state?'EXACT replay match':'REPLAY MISMATCH'} · ${stateDigest(state)}`;
    this.saved={...tape,expected:tape.expected??state};this.tape=undefined;this.state='finished';
  }
  step(input:GroundInput=IDLE):void {
    if(this.state==='finished')return;
    const sampled=this.state==='replaying'?this.tape!.inputs[this.tick]:input;
    this.body.step(sampled);this.tick++;
    if(this.state==='recording'){this.tape!.inputs.push({...sampled});if(this.tick===MAX_RECORDING_TICKS)this.stop();}
    else if(this.state==='replaying'&&this.tick===this.tape!.inputs.length)this.finish();
  }
  dispose():void {this.body.dispose();this.scene.dispose();}
}
