import * as THREE from 'three';
import { TypewriterAudio } from '../../../audio/TypewriterAudio.ts';
import type { Vector3State } from '../../slime/SlimePresentationContract.ts';
import { ContainmentMonitorDialogue } from '../containment/ContainmentMonitorDialogue.ts';
import { createContainmentSpeechTexture, paintContainmentSpeechTexture } from '../containment/ContainmentProceduralTextures.ts';
import { GOOP_SPEECH_SIZE, GoopSpeechFraming } from '../containment/GoopSpeechFraming.ts';

export const CULTIVATION_GOOP_ARRIVAL_SCRIPT = Object.freeze([
  'That was close',
  'Thanks again for freeing me, this place is not safe',
  "What's your name?",
  '...',
  'Not much of a talker, huh?',
]);
export const CULTIVATION_GOOP_ROOM_TWO_SCRIPT = Object.freeze([
  'The door is locked',
  'You gotta keep holding that button down to keep it unlocked.',
  "I'll meet you in the other room",
]);
export const CULTIVATION_GOOP_ELEVATOR_SCRIPT = Object.freeze([
  "We're gonna need Volt if we wanna get outta here",
  'Last time, he knocked out the power to this entire place',
]);
const SCRIPTS={arrival:CULTIVATION_GOOP_ARRIVAL_SCRIPT,'room-two':CULTIVATION_GOOP_ROOM_TWO_SCRIPT,
  'elevator-arrival':CULTIVATION_GOOP_ELEVATOR_SCRIPT} as const;
export const CULTIVATION_GOOP_QUESTION_PAUSE_SECONDS = 3.5;
const HEIGHT = 2.75, RANGE = 18, FINAL_HOLD = 3.5, FADE = .4;
type Conversation = keyof typeof SCRIPTS;

/** One shared, positional speech bubble following Goop throughout Cultivation. */
export class CultivationGoopSpeech {
  readonly root = new THREE.Group();
  readonly texture = createContainmentSpeechTexture();
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly conversations = {
    arrival: new ContainmentMonitorDialogue(CULTIVATION_GOOP_ARRIVAL_SCRIPT, {
      columns:18,rows:2,sectionHoldSeconds:[2.2,3,CULTIVATION_GOOP_QUESTION_PAUSE_SECONDS,2.2],
    }),
    'room-two': new ContainmentMonitorDialogue(CULTIVATION_GOOP_ROOM_TWO_SCRIPT,{columns:18,rows:2}),
    'elevator-arrival': new ContainmentMonitorDialogue(CULTIVATION_GOOP_ELEVATOR_SCRIPT,{columns:18,rows:2}),
  };
  private readonly heard = new Set<Conversation>();
  private readonly started = new Set<Conversation>();
  private current: Conversation | undefined;
  private elapsed = 0;
  private disposed = false;
  private playerControlled = false;
  private readonly framing: GoopSpeechFraming;
  private readonly follow = new THREE.Vector3();
  private readonly speechAudio = new TypewriterAudio(this.root,{
    sound:'bob-contact-01',intervalSeconds:.32,volumeScale:.35,maxDistance:RANGE,
    localPosition:{x:0,y:-HEIGHT,z:0},
  });

  constructor(){
    this.root.name='cultivation-goop-story-speech';
    this.root.userData.presentationOwnedBy=this.root.name;
    this.texture.name='cultivation-goop-story-speech-texture';
    const geometry=new THREE.PlaneGeometry(GOOP_SPEECH_SIZE.width,GOOP_SPEECH_SIZE.height),uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
    const material=new THREE.MeshBasicMaterial({name:'cultivation-goop-story-speech-display',map:this.texture,
      transparent:true,opacity:0,depthTest:true,depthWrite:false,toneMapped:false});
    this.mesh=new THREE.Mesh(geometry,material);this.mesh.name='cultivation-goop-story-speech-billboard';
    this.mesh.renderOrder=10;this.mesh.userData.visualOnly=true;this.root.add(this.mesh);
    this.framing=new GoopSpeechFraming(this.root,this.mesh);
    this.mesh.onBeforeRender=(_renderer,_scene,camera)=>{
      if(this.disposed||material.opacity===0)return;
      this.framing.present(camera);
    };
  }

  get activeConversation():Conversation|undefined{return this.current;}
  get readModel(){return this.current?this.conversations[this.current].readModel:undefined;}
  hasHeard(conversation:Conversation):boolean{return this.heard.has(conversation);}
  setPlayerControlled(controlled:boolean):void{
    this.playerControlled=controlled;
    // This conversation crosses the low exit vent. Keep its existing balloon
    // screen-safe for either listener, without moving the positional voice.
    this.framing.setPlayerControlled(controlled||this.current==='elevator-arrival');
  }

  update(dt:number,roomId:number,goop:Vector3State,active:Vector3State|undefined,playerMoved=false,rendered=true,bothInRoomTwo=false,elevatorArrived=false):void{
    if(this.disposed)return;
    if(!Number.isFinite(dt)||dt<0)throw new RangeError('Invalid speech timestep.');
    this.follow.copy(goop);
    this.root.parent?.worldToLocal(this.follow);this.root.position.copy(this.follow);this.root.position.y+=HEIGHT;
    if(dt>0&&elevatorArrived&&(roomId===4||roomId===5)&&!this.started.has('elevator-arrival')&&!this.heard.has('elevator-arrival'))this.begin('elevator-arrival');
    else if(dt>0&&roomId===2&&bothInRoomTwo&&!this.started.has('room-two')&&!this.heard.has('room-two'))this.begin('room-two');
    else if(dt>0&&roomId===1&&playerMoved&&!this.started.has('arrival')&&!this.heard.has('arrival')&&!this.started.has('room-two'))this.begin('arrival');
    const dialogue=this.current?this.conversations[this.current]:undefined;
    const inConversationRoom=this.current==='elevator-arrival'?(roomId===4||roomId===5):roomId<=2;
    const audible=rendered&&!!active&&this.followDistanceSquared(goop,active)<=RANGE*RANGE&&inConversationRoom;
    if(!dialogue||!audible){
      this.mesh.material.opacity=0;if(dialogue)this.speechAudio.update(dt,dialogue.readModel,false);return;
    }
    this.elapsed+=dt;
    if(dialogue.update(dt)){
      const {text,typing,sectionIndex}=dialogue.readModel;
      paintContainmentSpeechTexture(this.texture,text,typing,sectionIndex,this.current?SCRIPTS[this.current].length:0);
    }
    const reveal=Math.min(1,this.elapsed/.22),fade=1-THREE.MathUtils.clamp((this.elapsed-dialogue.durationSeconds-FINAL_HOLD)/FADE,0,1);
    this.mesh.material.opacity=reveal*fade;
    this.framing.setRevealScale(.94+.06*(1-(1-reveal)**3));
    if(dialogue.readModel.complete&&this.current)this.heard.add(this.current);
    this.speechAudio.update(dt,dialogue.readModel,this.mesh.material.opacity>0);
  }

  reset(preserveCompleted=false):void{
    if(this.disposed)return;
    if(!preserveCompleted)this.heard.clear();
    this.started.clear();this.current=undefined;this.elapsed=0;
    this.setPlayerControlled(this.playerControlled);
    this.framing.setRevealScale(1);
    for(const dialogue of Object.values(this.conversations))dialogue.reset();
    this.mesh.material.opacity=0;this.speechAudio.reset();paintContainmentSpeechTexture(this.texture,'',false,0);
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    this.mesh.onBeforeRender=()=>{};this.root.removeFromParent();this.root.clear();
    this.mesh.geometry.dispose();this.mesh.material.dispose();this.texture.dispose();
  }
  private begin(conversation:Conversation):void{
    // A later-room conversation takes priority over an unfinished earlier one.
    this.current=conversation;this.started.add(conversation);this.elapsed=0;this.speechAudio.reset();
    this.setPlayerControlled(this.playerControlled);
    paintContainmentSpeechTexture(this.texture,'',false,0);
  }
  private followDistanceSquared(a:Vector3State,b:Vector3State):number{
    return (a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2;
  }
}
