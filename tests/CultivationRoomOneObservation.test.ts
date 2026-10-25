import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { auditOpaqueSurfaces } from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';
import { CultivationRoomOneObservation, CULTIVATION_ROOM_ONE_MONITOR_SCRIPT as SCRIPT,
  CULTIVATION_ROOM_ONE_MONITOR_COLOURS as COLOURS, CULTIVATION_ROOM_ONE_MONITOR_TRIGGER as TRIGGER } from '../src/render/environment/cultivation/CultivationRoomOneObservation.ts';
import { MONITOR_DIALOGUE_TIMING as T, paginateMonitorSections } from '../src/render/environment/containment/ContainmentMonitorDialogue.ts';
import { MONITOR_TEXT_COLOURS, type MonitorTextColour } from '../src/render/environment/containment/ContainmentProceduralTextures.ts';

function fixture(){
  const materials={graphite:new THREE.MeshStandardMaterial(),serviceMetal:new THREE.MeshStandardMaterial()};
  const observation=new CultivationRoomOneObservation({materials}),parent=new THREE.Group();
  parent.position.set(64,2,10);parent.rotation.y=.3;parent.add(observation.root);
  return {observation,parent,materials,near:parent.localToWorld(new THREE.Vector3().copy(TRIGGER.centre)),
    dispose(){observation.dispose();materials.graphite.dispose();materials.serviceMetal.dispose();}};
}
function pixels(texture:THREE.DataTexture,colour:MonitorTextColour){
  const data=texture.image.data as Uint8Array,rgb=MONITOR_TEXT_COLOURS[colour];let count=0;
  for(let y=80;y<210;y++)for(let x=24;x<480;x++){
    const i=(y*512+x)*4;if(data[i]===rgb[0]&&data[i+1]===rgb[1]&&data[i+2]===rgb[2])count++;
  }
  return count;
}

test('the new Room 1 terminal types the requested uppercase red/green/green sections with reading pauses',()=>{
  const f=fixture(),m=f.observation.monitor;
  try{
    assert.deepEqual(SCRIPT,['Goop and Bob must be retrieved immediately','The area is too hazardous for retrieval','We must wait']);
    assert.deepEqual(COLOURS,['red','green','green']);
    const initial=m.texture.version;
    f.observation.update(120);assert.equal(m.hasActivated,false);assert.equal(m.texture.version,initial);
    f.observation.update(120,undefined,f.parent.localToWorld(new THREE.Vector3(-10,.66,5.5)));
    assert.equal(m.hasActivated,false);assert.equal(m.dialogue.readModel.text,'');
    f.observation.update(0,undefined,f.near);assert.equal(m.hasActivated,true);
    const pages=paginateMonitorSections(SCRIPT);assert.equal(pages.length,3);
    for(let i=0;i<pages.length;i++){
      assert.equal(m.dialogue.readModel.sectionIndex,i);assert.equal(m.dialogue.readModel.text,pages[i].text[0]);
      f.observation.update((pages[i].text.length-1)*T.characterSeconds);
      assert.equal(m.dialogue.readModel.text,pages[i].text);assert.equal(m.dialogue.readModel.typing,false);
      assert.ok(pixels(m.texture,COLOURS[i])>0);assert.equal(pixels(m.texture,COLOURS[i]==='red'?'green':'red'),0);
      if(i<pages.length-1){
        const version=m.texture.version;f.observation.update(T.sectionHoldSeconds-.001);
        assert.equal(m.texture.version,version);f.observation.update(.001);
      }
    }
    assert.equal(m.dialogue.readModel.text,'WE MUST WAIT');assert.equal(m.dialogue.readModel.complete,true);
    const finished=m.texture.version;f.observation.update(120,undefined,f.near);assert.equal(m.texture.version,finished);
    f.observation.reset();assert.equal(m.hasActivated,false);assert.equal(m.dialogue.readModel.text,'');
  }finally{f.dispose();}
});

test('the fixture tracks Bob, not active Goop, and the terminal audio originates at its real transformed screen',()=>{
  const f=fixture(),camera=f.observation.cameras.cameras[0],cues:{sound:string;position:THREE.Vector3}[]=[];
  const off=gameplayAudioEvents.on('cue',cue=>{if(cue.position)cues.push({sound:cue.sound,position:new THREE.Vector3().copy(cue.position)});});
  try{
    const bob=camera.root.localToWorld(new THREE.Vector3(3,-2,12).add(camera.pan.position));
    const active=camera.root.localToWorld(new THREE.Vector3(-3,-2,12).add(camera.pan.position));
    f.observation.update(.1,bob,active);assert.ok(camera.pan.rotation.y>0,'The camera follows Bob even when Goop is controlled.');
    f.observation.update(0,bob,f.near);
    assert.equal(cues.length,1);assert.equal(cues[0].sound,'world-sign-tick-01');
    assert.ok(cues[0].position.distanceTo(f.observation.monitor.root.getWorldPosition(new THREE.Vector3()))<1e-9);
    const text=f.observation.monitor.dialogue.readModel.text,yaw=camera.pan.rotation.y;
    f.observation.update(0,bob,f.near);assert.equal(f.observation.monitor.dialogue.readModel.text,text);assert.equal(camera.pan.rotation.y,yaw);
    f.observation.root.visible=false;f.observation.update(1,bob,f.near);assert.equal(cues.length,1,'Hidden text never emits ticks.');
  }finally{off();f.dispose();}
});

test('the authored production scene mounts the camera left and monitor right of the same exit and respects room culling/reset',()=>{
  const world=new LevelTwoPreviewScene(()=>{},cultivationAssets),o=world.roomOneObservation,m=o.monitor,camera=o.cameras.cameras[0];
  try{
    const door=world.roomOneToTwoPassage.entryDoor.root;
    world.root.updateMatrixWorld(true);
    const doorWorld=door.getWorldPosition(new THREE.Vector3());
    const cameraWorld=camera.root.getWorldPosition(new THREE.Vector3()),monitorWorld=m.root.getWorldPosition(new THREE.Vector3());
    assert.ok(cameraWorld.x>doorWorld.x+2.5,'Looking along +Z, screen-left is +X.');
    assert.ok(monitorWorld.x<doorWorld.x-4.5,'Screen-right is -X; the monitor clears the doorway.');
    assert.ok(Math.abs(cameraWorld.z-monitorWorld.z)<.1);
    assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(m.root.quaternion).z<-.999);
    let meshes=0,lights=0;
    o.root.traverse(node=>{if(node instanceof THREE.Light)lights++;if(node instanceof THREE.Mesh){
      meshes++;assert.equal(node.castShadow,false);assert.equal(world.collisionMeshes.includes(node),false);assert.equal(node.layers.mask,1);
    }});
    assert.equal(meshes,11);assert.equal(lights,0);assert.equal(camera.pan.matrixAutoUpdate,true);assert.equal(camera.tilt.matrixAutoUpdate,true);
    assert.equal(world.surveillanceArt.diagnostics.cameras,3);
    assert.ok(camera.tilt.getObjectByName('containment-authored-surveillance-camera'));
    assert.deepEqual(auditOpaqueSurfaces(o.root).conflicts,[], 'Monitor corners and camera brackets must not z-fight.');
    const bob=world.copyRoomSpawnPosition(1,'bob',new THREE.Vector3()),goop=o.root.localToWorld(new THREE.Vector3().copy(TRIGGER.centre));
    const occupants=[{id:'bob' as const,position:bob,radiusMetres:.45},{id:'goop' as const,position:goop,radiusMetres:.45}];
    world.updatePresentationVisibility({z:40},goop);world.update(.01,1,occupants,undefined,undefined,goop);
    assert.equal(m.dialogue.readModel.text,'G');world.update(.5,1,occupants,undefined,undefined,goop);
    assert.deepEqual(auditOpaqueSurfaces(o.root).conflicts,[], 'Tracking must not introduce overlapping coplanar faces.');
    const text=m.dialogue.readModel.text,yaw=camera.pan.rotation.y;
    world.updatePresentationVisibility({z:200},{z:200});world.update(3,3,occupants,undefined,undefined,goop);
    assert.equal(m.dialogue.readModel.text,text);assert.equal(camera.pan.rotation.y,yaw,'Culled Room 1 observation does no cosmetic work.');
    world.reset();assert.equal(m.hasActivated,false);assert.equal(m.dialogue.readModel.text,'');assert.equal(camera.pan.rotation.y,0);
    assert.equal(m.screen.material.toneMapped,false);assert.equal(m.texture.generateMipmaps,false);
  }finally{world.dispose();}
});

test('disposal is once-only, preserves borrowed finishes and cannot repaint or track after disposal',()=>{
  const f=fixture(),o=f.observation,owned=new Set<THREE.EventDispatcher<any>>([o.monitor.texture,o.monitor.screen.material]);
  o.root.traverse(node=>{if(node instanceof THREE.Mesh){owned.add(node.geometry);
    for(const mat of Array.isArray(node.material)?node.material:[node.material])if(!Object.values(f.materials).includes(mat))owned.add(mat);
  }});
  const counts=new Map([...owned].map(resource=>[resource,0]));let borrowed=0;
  for(const [resource]of counts)resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)!+1));
  for(const material of Object.values(f.materials))material.addEventListener('dispose',()=>borrowed++);
  try{
    o.dispose();o.dispose();o.update(120,undefined,f.near);o.reset();
    assert.equal(borrowed,0);for(const count of counts.values())assert.equal(count,1);
    assert.equal(o.monitor.dialogue.readModel.text,'');assert.equal(o.root.parent,null);
  }finally{f.dispose();}
});
