import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CultivationGoopSpeech } from '../src/render/environment/cultivation/CultivationGoopSpeech.ts';
import { RoomFiveGoopSpeech } from '../src/render/environment/containment/RoomFiveGoopSpeech.ts';
import { GOOP_SPEECH_SIZE } from '../src/render/environment/containment/GoopSpeechFraming.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';

const draw = (speech: CultivationGoopSpeech, camera: THREE.PerspectiveCamera) =>
  speech.mesh.onBeforeRender(undefined as any, undefined as any, camera, undefined as any, undefined as any, undefined as any);

test('Goop speech is smaller in both levels without changing the typewriter or allocating another display',()=>{
  const story=new CultivationGoopSpeech(),rescue=new RoomFiveGoopSpeech();
  try{
    for(const speech of [story,rescue]){
      assert.equal(speech.mesh.geometry.parameters.width,GOOP_SPEECH_SIZE.width);
      assert.equal(speech.mesh.geometry.parameters.height,GOOP_SPEECH_SIZE.height);
      assert.ok(GOOP_SPEECH_SIZE.width<4.8&&GOOP_SPEECH_SIZE.height<2.4);
      assert.equal(speech.mesh.material.depthWrite,false);assert.equal(speech.mesh.castShadow,false);
    }
  }finally{story.dispose();rescue.dispose();}
});

test('the entire self-view plane clears the production roster in landscape, square and portrait layouts',()=>{
  const speech=new CultivationGoopSpeech(),camera=new THREE.PerspectiveCamera(48,16/9,.1,200),goop=new THREE.Vector3(55,.66,4);
  try{
    speech.setPlayerControlled(true);speech.update(1,1,goop,goop,true);
    camera.position.set(55,2.6,-1);camera.lookAt(goop);camera.updateMatrixWorld(true);
    for(const [width,height,rosterLeft,rosterTop,rosterBottom]of [[800,450,488,113.59375,327.015625],[600,600,294,113.6,327.1],[420,800,120,92.8,307]]){
      camera.aspect=width/height;camera.updateProjectionMatrix();draw(speech,camera);
      const p=speech.mesh.geometry.getAttribute('position'),corners=[];
      for(let i=0;i<p.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(speech.mesh.matrixWorld).project(camera);
        corners.push({x:(point.x+1)*width/2,y:(1-point.y)*height/2});
      }
      const right=Math.max(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y));
      assert.ok(right<rosterLeft||bottom<rosterTop||top>rosterBottom,JSON.stringify({width,height,right,top,bottom}));
    }
  }finally{speech.dispose();}
});

test('every corner of controlled Goop dialogue fits portrait, landscape, close/aim and turned cameras; his voice stays in the world',()=>{
  const speech=new CultivationGoopSpeech(),parent=new THREE.Group();
  parent.position.set(64,0,0);parent.rotation.y=.4;parent.scale.setScalar(1.2);parent.add(speech.root);
  const goop=new THREE.Vector3(54,.66,4),camera=new THREE.PerspectiveCamera(48,16/9,.1,200);
  const cues:THREE.Vector3[]=[];
  const off=gameplayAudioEvents.on('cue',cue=>{if(cue.position)cues.push(new THREE.Vector3().copy(cue.position));});
  try{
    speech.setPlayerControlled(true);speech.update(1,1,goop,goop,true);parent.updateMatrixWorld(true);
    const geometry=speech.mesh.geometry,material=speech.mesh.material,texture=speech.texture;
    assert.equal(material.depthTest,false,'The self-view panel cannot be occluded by the player or a nearby wall.');
    assert.equal(speech.mesh.frustumCulled,false,'Framing still runs when the above-head anchor would have been outside the view.');
    for(const aspect of [32/9,16/9,1,9/16,.35])for(const distance of [.08,.3,1.5,5.2,7])for(const pitch of [-1.2,0,1.1]){
      camera.aspect=aspect;camera.position.set(goop.x+distance,goop.y+.35,goop.z);
      camera.rotation.set(pitch,2.7,.15);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
      draw(speech,camera);
      const positions=geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++){
        const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(speech.mesh.matrixWorld).project(camera);
        assert.ok(Math.abs(p.x)<.9&&Math.abs(p.y)<.85&&p.z>-1&&p.z<1,JSON.stringify({aspect,distance,pitch,p}));
        if(aspect<1)assert.ok(p.y<-.21&&p.y>-.63,'Portrait dialogue clears the top-right roster.');
        else if(aspect<1.5)assert.ok(p.x<-.04,'Square views keep the whole panel left of the roster.');
        else assert.ok(p.y>.43,'Landscape dialogue clears the top of the roster.');
      }
      const facing=speech.mesh.getWorldQuaternion(new THREE.Quaternion());
      assert.ok(Math.abs(facing.dot(camera.getWorldQuaternion(new THREE.Quaternion())))>1-1e-8);
      assert.equal(speech.mesh.geometry,geometry);assert.equal(speech.mesh.material,material);assert.equal(speech.texture,texture);
    }
    speech.update(.4,1,goop,goop);
    assert.ok(cues.length>=2);for(const cue of cues)assert.ok(cue.distanceTo(goop)<1e-8);
    speech.setPlayerControlled(false);draw(speech,camera);
    assert.equal(material.depthTest,true);assert.deepEqual(speech.mesh.position.toArray(),[0,0,0]);
    assert.equal(speech.mesh.renderOrder,10,'Switching back to Bob restores the smaller world-space balloon.');
    speech.reset();speech.update(1,1,goop,goop,true);draw(speech,camera);
    assert.equal(material.depthTest,true);
  }finally{off();speech.dispose();}
});
