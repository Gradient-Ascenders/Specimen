/** Rebuild the Blender material studio's input from the real room controller.
 * TGA files contain colour/data only; no lighting or shadow bake is involved. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import * as THREE from 'three';
import {createCultivationBiofilmTextures} from '../lib/CultivationMembraneMaterial.ts';
import {createCultivationStickyRouteGeometry} from '../../src/render/environment/cultivation/CultivationStickyRouteGeometry.ts';
import {LevelTwoLabPassageGreybox} from '../../src/levels/LevelTwoLabPassageGreybox.ts';
import {LevelTwoRoomTwoGreybox} from '../../src/levels/LevelTwoRoomTwoGreybox.ts';

const folder=resolve(process.argv[2]??'artifacts/evidence/cultivation-blender/adhesive-revision/studio-input');
await mkdir(folder,{recursive:true});
const maps=createCultivationBiofilmTextures();
for(const [role,map] of Object.entries(maps)){
  const {width,height,data}=map.image as {width:number;height:number;data:Uint8Array};
  const file=Buffer.alloc(18+data.length);file[2]=2;file.writeUInt16LE(width,12);file.writeUInt16LE(height,14);
  file[16]=32;file[17]=8;
  for(let i=0;i<data.length;i+=4){file[18+i]=data[i+2];file[19+i]=data[i+1];file[20+i]=data[i];file[21+i]=255;}
  await writeFile(resolve(folder,role+'.tga'),file);map.dispose();
}
const passage=new LevelTwoLabPassageGreybox({id:'adhesive-studio-door',fromRoomId:2,toRoomId:3,
  widthMetres:7,heightMetres:6.5,lengthMetres:28,doorwayWidthMetres:4,doorwayHeightMetres:4.6,entryInitiallyLocked:true});
const room=new LevelTwoRoomTwoGreybox(()=>{},passage.entryDoor);
const panels=room.collisionMeshes.filter(m=>/^cultivation-room-2-sticky-route-[a-e]$/.test(m.name)) as THREE.Mesh<THREE.BoxGeometry>[];
const geometry=createCultivationStickyRouteGeometry(panels,4);
try{
  const attributes=Object.fromEntries(Object.entries(geometry.attributes).map(([name,a])=>[name,Array.from(a.array)]));
  await writeFile(resolve(folder,'route.json'),JSON.stringify({kind:'Review only; exact production route union',attributes}));
  console.log('Prepared three 512px maps and the production route for Blender review.');
}finally{geometry.dispose();room.dispose();passage.dispose();}
