/** Stable authored gameplay/light snapshots and editable reference geometry.
 * Presentation names/buffers are recorded separately from protected colliders. */
import * as THREE from 'three';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {cultivationAssets} from '../lib/read-cultivation-assets.ts';
import {LevelTwoPreviewScene} from '../../src/levels/LevelTwoPreviewScene.ts';
import {visitLevelTwoSurfaceStates} from '../lib/level-two-surface-states.ts';

const output=resolve(process.argv[2]??'artifacts/evidence/cultivation-blender/baseline');
mkdirSync(output,{recursive:true});
const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets);
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const n=(value:number)=>Math.round(value*1e6)/1e6;
const path=(o:THREE.Object3D):string=>o===scene.root?'':`${o.parent?path(o.parent)+'/':''}${o.name}`;
const states:Record<string,unknown>={};
visitLevelTwoSurfaceStates(scene,state=>{
  const colliders=scene.collisionMeshes.map(mesh=>({name:mesh.name,path:path(mesh),
    matrix:mesh.matrixWorld.toArray().map(n),position:mesh.position.toArray().map(n),
    quaternion:mesh.quaternion.toArray().map(n),scale:mesh.scale.toArray().map(n),
    geometry:hash({position:Array.from(mesh.geometry.getAttribute('position').array),
      index:mesh.geometry.index?Array.from(mesh.geometry.index.array):null}),metadata:mesh.userData}));
  const lights:unknown[]=[];
  scene.root.traverse(o=>{if(o instanceof THREE.Light){const l=o as THREE.PointLight;
    lights.push({name:o.name,path:path(o),matrix:o.matrixWorld.toArray().map(n),visible:o.visible,
      colour:o.color.toArray(),intensity:o.intensity,distance:l.distance,decay:l.decay,castShadow:o.castShadow,
      shadow:l.shadow?{size:l.shadow.mapSize.toArray(),bias:l.shadow.bias,normalBias:l.shadow.normalBias,
        near:l.shadow.camera.near,far:l.shadow.camera.far}:null});}});
  states[state]={colliders,lights,colliderHash:hash(colliders),lightHash:hash(lights)};
});
writeFileSync(resolve(output,'contracts.json'),JSON.stringify(states,null,2)+'\n');
for(const child of scene.root.children)child.visible=true;
scene.roomFourGeometry.visible=true;
const owners=[['room-1',scene.roomOne],['passage-1-2',scene.roomOneToTwoPassage],
  ['room-2',scene.roomTwo],['passage-2-3',scene.roomTwoToThreeGoopPassage],
  ['bob-duct',scene.roomTwoToThreeBobAirDuct],['room-3',scene.roomThree],
  ['room-4',scene.roomFour],['room-5',scene.roomFive]] as const;
for(const [id,room]of owners){
  room.root.updateWorldMatrix(true,true);
  const inverse=room.root.matrixWorld.clone().invert(),objects:unknown[]=[],inventory:unknown[]=[];
  const collisions=new Set(room.collisionMeshes);
  room.root.traverse(o=>{
    let visible=true;for(let p:THREE.Object3D|null=o;p&&p!==room.root;p=p.parent)visible&&=p.visible;
    if(!(o instanceof THREE.Mesh))return;
    const materials=(Array.isArray(o.material)?o.material:[o.material]);
    visible&&=materials.some(m=>m.visible);
    const pos=o.geometry.getAttribute('position');if(!pos)return;
    const box=new THREE.Box3().setFromObject(o,true);
    const localBox=box.clone().applyMatrix4(inverse);
    const count=o instanceof THREE.InstancedMesh?o.count:1;
    inventory.push({name:o.name,path:path(o),visible,collider:collisions.has(o),
      materials:materials.map(m=>m.name||m.type),bounds:[...localBox.min.toArray(),...localBox.max.toArray()].map(n),
      instances:count,triangles:(o.geometry.index?.count??pos.count)/3*count,metadata:o.userData});
    if(!visible&&!collisions.has(o))return;
    for(let i=0;i<count;i++){
      const matrix=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld);
      if(o instanceof THREE.InstancedMesh){const instance=new THREE.Matrix4();o.getMatrixAt(i,instance);matrix.multiply(instance);}
      objects.push({name:o.name+(count>1?`[${i}]`:''),path:path(o),matrix:matrix.toArray(),visible,
        collider:collisions.has(o),metadata:o.userData,vertices:Array.from({length:pos.count},(_,j)=>[pos.getX(j),pos.getY(j),pos.getZ(j)]),
        indices:o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:pos.count},(_,j)=>j),
        materials:materials.map(m=>{const p=m as THREE.MeshStandardMaterial;return{name:m.name,color:p.color?.toArray()??[.4,.5,.5],
          roughness:p.roughness??.8,metalness:p.metalness??0,opacity:m.opacity,side:m.side};}),groups:o.geometry.groups});
    }
  });
  writeFileSync(resolve(output,id+'.scene.json'),JSON.stringify({id,units:'metres',coordinates:'Three.js Y-up, room-local',objects}));
  writeFileSync(resolve(output,id+'.inventory.json'),JSON.stringify(inventory,null,2)+'\n');
  console.log(id,inventory.length,'mesh owners;',inventory.filter((x:any)=>x.visible).length,'visible');
}
const files=['CultivationLevelRuntime.ts','CultivationLevelGameplay.ts','CultivationFoundationManifest.ts',
  'CultivationLevelController.ts','CultivationRoomThreeController.ts','CultivationRoomFourController.ts',
  'CultivationRoomFiveController.ts','LevelTwoRoomOneGreybox.ts','LevelTwoRoomTwoGreybox.ts',
  'LevelTwoRoomThreeGreybox.ts','LevelTwoRoomFourGreybox.ts','LevelTwoRoomFiveGreybox.ts',
  'LevelTwoAirDuctGreybox.ts','LevelTwoLabPassageGreybox.ts'];
writeFileSync(resolve(output,'protected-source.json'),JSON.stringify(Object.fromEntries(files.map(file=>[
  file,createHash('sha256').update(readFileSync(resolve('src/levels',file))).digest('hex')
])),null,2)+'\n');
scene.dispose();console.log('Recorded',Object.keys(states).length,'mechanism states in',output);
