import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CultivationGoopSpeech, CULTIVATION_GOOP_ARRIVAL_SCRIPT, CULTIVATION_GOOP_ROOM_TWO_SCRIPT,
  CULTIVATION_GOOP_ELEVATOR_SCRIPT, CULTIVATION_GOOP_QUESTION_PAUSE_SECONDS } from '../src/render/environment/cultivation/CultivationGoopSpeech.ts';
import { CultivationRoomTwoObservation, CULTIVATION_ROOM_TWO_MONITOR_SCRIPT as SCRIPT,
  CULTIVATION_ROOM_TWO_MONITOR_COLOURS as COLOURS, CULTIVATION_ROOM_TWO_MONITOR_TRIGGER as TRIGGER } from '../src/render/environment/cultivation/CultivationRoomTwoObservation.ts';
import { ContainmentMonitorDialogue, MONITOR_DIALOGUE_TIMING as T, paginateMonitorSections } from '../src/render/environment/containment/ContainmentMonitorDialogue.ts';
import { MONITOR_TEXT_COLOURS, createContainmentMonitorTexture, paintContainmentMonitorTexture } from '../src/render/environment/containment/ContainmentProceduralTextures.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';
import { auditOpaqueSurfaces } from '../src/render/geometry/OpaqueSurfaceAudit.ts';

const goop=new THREE.Vector3(64,.66,5.5),bob=new THREE.Vector3(62,.66,5.5);

test('Goop waits for player movement, then delivers the arrival conversation with a real question pause',()=>{
  const speech=new CultivationGoopSpeech(),parent=new THREE.Group();parent.position.x=64;parent.add(speech.root);
  const cues:{sound:string;position:THREE.Vector3}[]=[];
  const off=gameplayAudioEvents.on('cue',cue=>{if(cue.position)cues.push({sound:cue.sound,position:new THREE.Vector3().copy(cue.position)});});
  try{
    assert.deepEqual(CULTIVATION_GOOP_ARRIVAL_SCRIPT,['That was close','Thanks again for freeing me, this place is not safe',"What's your name?",'...','Not much of a talker, huh?']);
    const dormant=speech.texture.version;
    speech.update(120,1,goop,bob,false);speech.update(0,1,goop,bob,true);
    assert.equal(speech.activeConversation,undefined);assert.equal(speech.texture.version,dormant);assert.equal(cues.length,0);
    speech.update(.01,1,goop,bob,true);assert.equal(speech.activeConversation,'arrival');assert.equal(speech.readModel!.text,'T');
    assert.equal(cues.length,1);assert.ok(cues[0].position.distanceTo(goop)<1e-8,'Voice follows Goop, not the balloon or listener.');
    const pages=paginateMonitorSections(CULTIVATION_GOOP_ARRIVAL_SCRIPT,18,2),seen=new Set<string>();
    for(let i=0;i<4000;i++){
      speech.update(.01,1,goop,bob);if(!speech.readModel!.typing)seen.add(speech.readModel!.text);
    }
    assert.deepEqual([...seen],pages.map(page=>page.text));assert.equal(speech.hasHeard('arrival'),true);
    assert.equal(speech.mesh.material.opacity,0);
    const version=speech.texture.version;speech.update(120,1,goop,bob,true);assert.equal(speech.texture.version,version);
    const question=new ContainmentMonitorDialogue(["What's your name?",'...'],{sectionHoldSeconds:[CULTIVATION_GOOP_QUESTION_PAUSE_SECONDS]});
    question.update(("What's your name?".length-1)*T.characterSeconds);assert.equal(question.readModel.typing,false);
    question.update(CULTIVATION_GOOP_QUESTION_PAUSE_SECONDS-.001);assert.equal(question.readModel.sectionIndex,0);
    question.update(.001);assert.equal(question.readModel.sectionIndex,1);assert.equal(question.readModel.text,'.');
    for(const invalid of [-1,NaN,Infinity])assert.throws(()=>new ContainmentMonitorDialogue(['TEST'],{sectionHoldSeconds:[invalid]}),/hold/);
  }finally{off();speech.dispose();}
});

test('entry instructions take priority, freeze out of earshot/pause, follow Goop and remember completed conversations on recovery',()=>{
  const speech=new CultivationGoopSpeech(),parent=new THREE.Group();parent.position.set(64,0,0);parent.add(speech.root);
  try{
    assert.deepEqual(CULTIVATION_GOOP_ROOM_TWO_SCRIPT,['The door is locked','You gotta keep holding that button down to keep it unlocked.',"I'll meet you in the other room"]);
    speech.update(.1,1,goop,bob,true);speech.update(.1,2,goop,bob,false,true,true);
    assert.equal(speech.activeConversation,'room-two');assert.equal(speech.readModel!.sectionIndex,0);
    const text=speech.readModel!.text,version=speech.texture.version;
    speech.update(120,2,goop,{x:64,y:.66,z:100});speech.update(0,2,goop,bob);
    assert.equal(speech.readModel!.text,text);assert.equal(speech.texture.version,version);
    speech.update(120,2,goop,bob,false,false);assert.equal(speech.readModel!.text,text);
    const moved=goop.clone().add(new THREE.Vector3(2,0,1));speech.update(.2,2,moved,bob);
    assert.ok(speech.root.getWorldPosition(new THREE.Vector3()).distanceTo(moved.clone().add(new THREE.Vector3(0,2.75,0)))<1e-8);
    speech.reset(true);speech.update(.01,2,goop,bob,false,true,true);assert.equal(speech.readModel!.text,'T','Unfinished hints restart after death.');
    speech.update(speech.conversations['room-two'].durationSeconds,2,goop,bob);assert.equal(speech.hasHeard('room-two'),true);
    speech.reset(true);speech.update(20,2,goop,bob,false,true,true);assert.equal(speech.activeConversation,undefined,'Completed hints do not repeat on checkpoint recovery.');
    speech.reset();speech.update(.01,2,goop,bob,false,true,true);assert.equal(speech.activeConversation,'room-two','A full restart permits a fresh conversation.');
  }finally{speech.dispose();}
});

test('the Volt conversation waits for the elevator stop, continues into Room 5, and remembers completed speech',()=>{
  const speech=new CultivationGoopSpeech(),parent=new THREE.Group();parent.position.set(64,0,0);parent.add(speech.root);
  const speaker=new THREE.Vector3(64,.66,237),listener=speaker.clone().add(new THREE.Vector3(2,0,0));
  const cues:THREE.Vector3[]=[];const off=gameplayAudioEvents.on('cue',cue=>{
    if(cue.sound==='bob-contact-01'&&cue.position)cues.push(new THREE.Vector3().copy(cue.position));
  });
  try{
    assert.deepEqual(CULTIVATION_GOOP_ELEVATOR_SCRIPT,["We're gonna need Volt if we wanna get outta here",
      'Last time, he knocked out the power to this entire place']);
    const texture=speech.texture,geometry=speech.mesh.geometry,material=speech.mesh.material;
    speech.update(120,4,speaker,listener);speech.update(120,5,speaker,listener);
    speech.update(0,4,speaker,listener,false,true,false,true);
    assert.equal(speech.activeConversation,undefined);assert.equal(cues.length,0,'No voice while descending or paused.');
    speech.update(.01,4,speaker,listener,false,true,false,true);
    assert.equal(speech.activeConversation,'elevator-arrival');assert.equal(speech.readModel!.text,'W');
    speech.setPlayerControlled(false);assert.equal(speech.mesh.material.depthTest,false,'Volt exposition stays readable through the low vent even while Bob is controlled.');
    assert.equal(cues.length,1);assert.ok(cues[0].distanceTo(speaker)<1e-8,'The existing voice source stays on Goop.');
    speech.reset(true);speech.update(.01,5,speaker,listener,false,true,false,true);
    assert.equal(speech.readModel!.text,'W','Interrupted dialogue can restart after recovery.');
    const paused={...speech.readModel!},version=speech.texture.version;
    speech.update(0,5,speaker,listener,false,true,false,true);
    speech.update(120,5,speaker,listener,false,false,false,true);
    speech.update(120,5,speaker,listener.clone().add(new THREE.Vector3(30,0,0)),false,true,false,true);
    assert.deepEqual(speech.readModel,paused);assert.equal(speech.texture.version,version);
    const pages=paginateMonitorSections(CULTIVATION_GOOP_ELEVATOR_SCRIPT,18,2),seen=new Set<string>();
    for(let i=0;i<Math.ceil((speech.conversations['elevator-arrival'].durationSeconds+5)*100);i++){
      speech.update(.01,i<100?4:5,speaker,listener,false,true,false,true);
      if(!speech.readModel!.typing)seen.add(speech.readModel!.text);
    }
    assert.deepEqual([...seen],pages.map(page=>page.text),'Every word appears in the original section order.');
    assert.equal(speech.hasHeard('elevator-arrival'),true);assert.equal(speech.mesh.material.opacity,0);
    assert.equal(speech.texture,texture);assert.equal(speech.mesh.geometry,geometry);assert.equal(speech.mesh.material,material);
    speech.reset(true);cues.length=0;speech.update(120,5,speaker,listener,false,true,false,true);
    assert.equal(speech.activeConversation,undefined);assert.equal(cues.length,0,'Completed dialogue never repeats after a checkpoint death.');
    assert.equal(speech.mesh.material.depthTest,true,'Reset restores the normal world bubble for other conversations.');
    speech.reset();speech.update(.01,4,speaker,listener,false,true,false,true);
    assert.equal(speech.activeConversation,'elevator-arrival','A full level restart clears conversation memory.');
  }finally{off();speech.dispose();}
});

for(const controlled of ['bob','goop'] as const)test(`the real elevator starts Volt dialogue exactly when it stops, with ${controlled} controlled`,()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets);
  try{
    const b=scene.roomFour.root.localToWorld(new THREE.Vector3(-.8,.66,10));
    const g=scene.roomFour.root.localToWorld(new THREE.Vector3(.8,.66,10));
    const occupants=[{id:'bob' as const,position:b,radiusMetres:.45},{id:'goop' as const,position:g,radiusMetres:.45}];
    const active=controlled==='bob'?b:g;scene.goopSpeech.setPlayerControlled(controlled==='goop');
    scene.updatePresentationVisibility(active,active);
    scene.update(1.5,4,occupants,undefined,undefined,active);
    assert.equal(scene.roomFour.controller.readModel.state,'descendingIntro');
    scene.update(59.99,4,occupants,undefined,undefined,active);
    assert.equal(scene.roomFour.controller.running,true);assert.equal(scene.goopSpeech.activeConversation,undefined);
    scene.goopSpeech.update(0,4,g,active,false,true,false,true);assert.equal(scene.goopSpeech.activeConversation,undefined);
    scene.update(.01,4,occupants,undefined,undefined,active);
    assert.equal(scene.roomFour.controller.readModel.state,'arrival');assert.equal(scene.roomFour.controller.running,false);
    assert.equal(scene.goopSpeech.activeConversation,'elevator-arrival');assert.equal(scene.goopSpeech.readModel!.text,'W');
    assert.equal(scene.goopSpeech.mesh.material.depthTest,false,'Both listeners can read the exchange at the narrow vent entrance.');
    b.copy(scene.roomFive.root.localToWorld(new THREE.Vector3(-.5,.66,1.5)));
    g.copy(scene.roomFive.root.localToWorld(new THREE.Vector3(.5,.66,1.5)));
    scene.updatePresentationVisibility(active,active);scene.update(.2,5,occupants,undefined,undefined,active);
    assert.equal(scene.goopSpeech.activeConversation,'elevator-arrival');assert.ok(scene.goopSpeech.readModel!.text.length>1,'Entering Room 5 continues, rather than restarts or hides, the conversation.');
    scene.update(scene.goopSpeech.conversations['elevator-arrival'].durationSeconds,5,occupants,undefined,undefined,active);
    assert.equal(scene.goopSpeech.hasHeard('elevator-arrival'),true);
    scene.reset({preserveCompletedDialogue:true});scene.roomFour.controller.restoreArrival();scene.updatePresentationVisibility(active,active);
    scene.update(.01,5,occupants,undefined,undefined,active);assert.equal(scene.goopSpeech.activeConversation,undefined);
  }finally{scene.dispose();}
});

test('Room 2 monitor shows four complete uppercased pages in green/red/green/green and starts only near its door',()=>{
  const materials={graphite:new THREE.MeshStandardMaterial(),serviceMetal:new THREE.MeshStandardMaterial()};
  const observation=new CultivationRoomTwoObservation({materials}),monitor=observation.monitor;
  try{
    assert.deepEqual(COLOURS,['green','red','green','green']);assert.deepEqual(SCRIPT,[
      'The drones won’t contain Goop, He’ll simply destroy them','That’s precisely why we developed the new shield system',
      'Only a handful of drones are equipped with this system','We must use them wisely']);
    observation.update(120,undefined,{x:0,y:.66,z:4});assert.equal(monitor.hasActivated,false);
    observation.update(0,undefined,TRIGGER.centre);
    const pages=paginateMonitorSections(SCRIPT,20);assert.equal(pages.length,4);
    for(let i=0;i<pages.length;i++){
      assert.equal(monitor.dialogue.readModel.sectionIndex,i);
      observation.update((pages[i].text.length-1)*T.characterSeconds);
      assert.equal(monitor.dialogue.readModel.text,pages[i].text);
      const pixels=monitor.texture.image.data as Uint8Array,rgb=MONITOR_TEXT_COLOURS[COLOURS[i]];
      let matches=0;for(let y=80;y<210;y++)for(let x=24;x<480;x++){
        const at=(y*512+x)*4;if(pixels[at]===rgb[0]&&pixels[at+1]===rgb[1]&&pixels[at+2]===rgb[2])matches++;
      }
      assert.ok(matches>0);if(i<pages.length-1)observation.update(T.sectionHoldSeconds);
    }
    assert.equal(monitor.dialogue.readModel.complete,true);observation.reset();assert.equal(monitor.hasActivated,false);
  }finally{observation.dispose();Object.values(materials).forEach(m=>m.dispose());}
});

test('the real scene mounts CCTV left of the sticky control, a monitor above the shutter, and a dressed but unchanged hold button',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),observation=scene.roomTwoObservation,pad=scene.root.getObjectByName('cultivation-room-2-wall-button-pad') as THREE.Mesh<THREE.BoxGeometry,THREE.MeshStandardMaterial>;
  try{
    const camera=observation.cameras.cameras[0],monitor=observation.monitor;
    assert.ok(camera.root.position.z>31.5&&camera.root.position.y>14.5,'Screen-left facing the west wall is +Z.');
    assert.ok(monitor.root.position.y-1.34>4.6,'The whole screen clears the shutter header.');assert.equal(monitor.root.position.x,0);
    assert.equal(camera.pan.matrixAutoUpdate,true);assert.equal(camera.tilt.matrixAutoUpdate,true);
    assert.ok(scene.root.getObjectByName('cultivation-room-2-wall-button-armoured-housing'));
    const bars=scene.root.getObjectByName('cultivation-room-2-wall-button-status-bars') as THREE.Mesh;
    assert.equal(scene.root.getObjectByName('cultivation-room-2-wall-button-hold-label'),undefined);
    assert.equal(bars.material,pad.material);assert.equal(pad.geometry.type,'RoundedBoxGeometry');
    assert.deepEqual(scene.roomTwo.wallButton.userData.sizeMetres,[.28,1.5,1.5]);assert.equal(scene.roomTwo.wallButton.userData.surfaceTag,'sticky');
    const b=scene.copyRoomSpawnPosition(2,'bob',new THREE.Vector3()),g=scene.copyRoomSpawnPosition(2,'goop',new THREE.Vector3());
    scene.updatePresentationVisibility(b,b);scene.update(.01,2,[{id:'bob',position:b,radiusMetres:.45},{id:'goop',position:g,radiusMetres:.45}],undefined,undefined,b);
    assert.equal(scene.goopSpeech.activeConversation,'room-two');
    scene.roomTwo.update(.6,[{id:'bob',position:b,radiusMetres:.45,attached:true,supportCollider:scene.roomTwo.wallButton}]);
    assert.equal(scene.roomTwoToThreeGoopPassage.entryDoor.locked,false);assert.equal(pad.material.color.getHex(),0x62ff91);
    assert.deepEqual(auditOpaqueSurfaces(scene.roomTwoButtonArt.root).conflicts,[]);
    assert.deepEqual(auditOpaqueSurfaces(scene.roomTwoButtonArt.root,.01).conflicts,[],'captive fasteners clear the housing face');
    scene.roomTwoButtonArt.root.traverse(node=>assert.ok(!(node instanceof THREE.Light),'The dressing adds no lights.'));
    scene.goopSpeech.update(120,2,g,g);scene.reset({preserveCompletedDialogue:true});assert.equal(scene.goopSpeech.hasHeard('room-two'),true);
    scene.reset();assert.equal(scene.goopSpeech.hasHeard('room-two'),false);assert.equal(pad.material.color.getHex(),0xe53945);
  }finally{scene.dispose();}
});

for(const first of ['bob','goop'] as const)test(`Room 2 speech waits for both occupants even when ${first} enters first`,()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets);
  try{
    const bob=scene.copyRoomSpawnPosition(first==='bob'?2:1,'bob',new THREE.Vector3());
    const goop=scene.copyRoomSpawnPosition(first==='goop'?2:1,'goop',new THREE.Vector3());
    const occupants=[{id:'bob' as const,position:bob,radiusMetres:.45},{id:'goop' as const,position:goop,radiusMetres:.45}];
    const active=first==='bob'?bob:goop;
    scene.updatePresentationVisibility(active,active);
    scene.update(60,2,occupants,undefined,undefined,active);
    assert.equal(scene.goopSpeech.activeConversation,undefined,'The checkpoint/controlled room alone cannot trigger the conversation.');
    scene.copyRoomSpawnPosition(2,first==='bob'?'goop':'bob',first==='bob'?goop:bob);
    scene.update(.01,2,occupants.filter(o=>o.id===first),undefined,undefined,active);
    assert.equal(scene.goopSpeech.activeConversation,undefined,'Both occupants must actually be present.');
    scene.goopSpeech.update(0,2,goop,active,false,true,true);assert.equal(scene.goopSpeech.activeConversation,undefined,'Paused entry does not start speech.');
    scene.update(.01,2,occupants,undefined,undefined,active);
    assert.equal(scene.goopSpeech.activeConversation,'room-two');assert.equal(scene.goopSpeech.readModel!.text,'T');
    scene.update(120,2,occupants,undefined,undefined,active);assert.equal(scene.goopSpeech.hasHeard('room-two'),true);
    scene.reset({preserveCompletedDialogue:true});scene.update(120,2,occupants,undefined,undefined,active);
    assert.equal(scene.goopSpeech.activeConversation,undefined,'A finished conversation is not retriggered after death.');
  }finally{scene.dispose();}
});

for(const roomId of [1,2] as const)test(`Room ${roomId} completed monitors survive checkpoint recovery without retyping or audio`,()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),observation=roomId===1?scene.roomOneObservation:scene.roomTwoObservation;
  const monitor=observation.monitor;
  const cues:string[]=[];const off=gameplayAudioEvents.on('cue',cue=>cues.push(cue.sound));
  try{
    const near=observation.root.localToWorld(new THREE.Vector3(roomId===1?0:TRIGGER.centre.x,1,roomId===1?45.5:TRIGGER.centre.z));
    const occupants=[{id:'bob' as const,position:near,radiusMetres:.45},{id:'goop' as const,position:near,radiusMetres:.45}];
    scene.updatePresentationVisibility(near,near);scene.update(.1,roomId,occupants,undefined,undefined,near);
    assert.equal(monitor.hasActivated,true);assert.equal(monitor.dialogue.readModel.complete,false);
    scene.reset({preserveCompletedDialogue:true});assert.equal(monitor.hasActivated,false,'An unfinished monitor restarts.');
    scene.updatePresentationVisibility(near,near);scene.update(.01,roomId,occupants,undefined,undefined,near);
    assert.equal(monitor.dialogue.readModel.text[0],roomId===1?'G':'T');
    scene.update(monitor.dialogue.durationSeconds,roomId,occupants,undefined,undefined,near);
    assert.equal(monitor.dialogue.readModel.complete,true);
    const final={...monitor.dialogue.readModel},version=monitor.texture.version;
    // Isolate terminal audio from the independent Goop conversation.
    cues.length=0;
    for(let deaths=0;deaths<2;deaths++){
      scene.reset({preserveCompletedDialogue:true});scene.updatePresentationVisibility(near,near);
      scene.update(120,roomId,occupants,undefined,undefined,near);
      assert.equal(monitor.hasActivated,true);assert.deepEqual(monitor.dialogue.readModel,final);
      assert.equal(monitor.texture.version,version);
    }
    assert.equal(cues.filter(sound=>sound==='world-sign-tick-01').length,0);
    scene.reset();assert.equal(monitor.hasActivated,false);assert.equal(monitor.dialogue.readModel.complete,false);
    assert.equal(monitor.dialogue.readModel.text,'','A full restart clears the dialogue.');
  }finally{off();scene.dispose();}
});

test('every Cultivation monitor letter is rendered, including the Q and its tail in EQUIPPED',()=>{
  const texture=createContainmentMonitorTexture(),colour=MONITOR_TEXT_COLOURS.green;
  const body=()=>{
    const data=texture.image.data as Uint8Array,marks:number[]=[];
    for(let y=80;y<210;y++)for(let x=24;x<480;x++){
      const at=(y*512+x)*4;if(colour.every((c,i)=>data[at+i]===c))marks.push(at);
    }
    return marks;
  };
  try{
    for(const letter of new Set(SCRIPT.join('').toUpperCase().replace(/\s/g,''))){
      paintContainmentMonitorTexture(texture,letter,false);assert.ok(body().length>0,`Missing glyph: ${letter}`);
    }
    paintContainmentMonitorTexture(texture,'O',false);const round=new Set(body());
    paintContainmentMonitorTexture(texture,'Q',false);assert.ok(body().some(at=>!round.has(at)),'Q has its own visible diagonal tail.');
    paintContainmentMonitorTexture(texture,'EQUIPPED',false);const equipped=body();
    paintContainmentMonitorTexture(texture,'E UIPPED',false);const missing=new Set(body());
    assert.ok(equipped.some(at=>!missing.has(at)),'EQUIPPED includes actual Q strokes, not a blank.');
  }finally{texture.dispose();}
});

for(const active of ['bob','goop'] as const)test(`real scene arrival speech can start from moving ${active}, but never from elapsed load time`,()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets);
  try{
    const bob=scene.copyRoomSpawnPosition(1,'bob',new THREE.Vector3()),goop=scene.copyRoomSpawnPosition(1,'goop',new THREE.Vector3());
    const occupants=[{id:'bob' as const,position:bob,radiusMetres:.45},{id:'goop' as const,position:goop,radiusMetres:.45}];
    const position=active==='bob'?bob:goop;scene.updatePresentationVisibility(position,position);
    scene.update(60,1,occupants,undefined,undefined,position);assert.equal(scene.goopSpeech.activeConversation,undefined);
    scene.update(.01,1,occupants,undefined,undefined,position,true);assert.equal(scene.goopSpeech.activeConversation,'arrival');
  }finally{scene.dispose();}
});
