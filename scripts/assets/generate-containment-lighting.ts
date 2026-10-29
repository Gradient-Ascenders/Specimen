/** Bake coarse opaque silhouettes offline; gameplay never scans mesh topology. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const files=[
  ['containment-room-one/room-one-shell.glb',['R1_Architecture']],
  ['containment-room-two/room-two-hall.glb',['R2_Architecture']],
  ['containment-room-three/room-three-laboratory.glb',['R3_Architecture']],
  ['containment-room-four/room-four-lift.glb',['R4_Architecture','R4_Car','R4_DoorLeft','R4_DoorRight']],
  ['containment-room-five/room-five-atrium.glb',['R5_Architecture','R5_Cell','R5_Front','R5_Rear','R5_Left','R5_Right','R5_CarriageOne','R5_CarriageTwo']],
] as const;
const result:Record<string,number[][]>={},hashes:Record<string,string>={};
for(const [file,anchors] of files){
  const bytes=await readFile(new URL('../../assets/environments/'+file,import.meta.url));
  hashes[file]=createHash('sha256').update(bytes).digest('hex');
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  for(const name of anchors){
    const anchor=scene.getObjectByName(name);if(!anchor)throw new Error(`Missing lighting anchor ${name}`);
    const inverse=anchor.matrixWorld.clone().invert(),boxes:number[][]=[];
    anchor.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||/_(Glass|Light|Screen|Sticky|Status|Security)$/.test(object.name))return;
      const geometry=object.geometry,position=geometry.getAttribute('position'),index=geometry.index;
      const parents=Int32Array.from({length:position.count},(_,i)=>i),positions:THREE.Vector3[]=[];
      const find=(i:number):number=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
      const join=(a:number,b:number)=>{a=find(a);b=find(b);if(a!==b)parents[b]=a;};
      const welded=new Map<string,number>(),matrix=inverse.clone().multiply(object.matrixWorld);
      for(let i=0;i<position.count;i++){
        const p=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix);positions.push(p);
        const key=[p.x,p.y,p.z].map(v=>Math.round(v*10000)).join(',');
        const previous=welded.get(key);if(previous!==undefined)join(i,previous);else welded.set(key,i);
      }
      const count=index?.count??position.count;
      for(let i=0;i<count;i+=3){const a=index?index.getX(i):i;join(a,index?index.getX(i+1):i+1);join(a,index?index.getX(i+2):i+2);}
      const components=new Map<number,THREE.Box3>();
      positions.forEach((p,i)=>{const root=find(i);let box=components.get(root);if(!box){box=new THREE.Box3();components.set(root,box);}box.expandByPoint(p);});
      const measures=new Map<number,{area:number;volume:number}>();
      const u=new THREE.Vector3(),v=new THREE.Vector3(),cross=new THREE.Vector3(),centre=new THREE.Vector3();
      for(let i=0;i<count;i+=3){
        const ai=index?index.getX(i):i,bi=index?index.getX(i+1):i+1,ci=index?index.getX(i+2):i+2,root=find(ai);
        let measure=measures.get(root);if(!measure){measure={area:0,volume:0};measures.set(root,measure);}
        const a=positions[ai],b=positions[bi],c=positions[ci];
        u.subVectors(b,a);v.subVectors(c,a);cross.crossVectors(u,v);measure.area+=cross.length()/2;
        components.get(root)!.getCenter(centre);
        u.subVectors(b,centre);v.subVectors(c,centre);cross.crossVectors(u,v);
        measure.volume+=((a.x-centre.x)*cross.x+(a.y-centre.y)*cross.y+(a.z-centre.z)*cross.z)/6;
      }
      for(const [component,box] of components){
        const size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
        const measure=measures.get(component)!;
        const dimensions=size.toArray().sort((a,b)=>b-a);
        if(dimensions[0]<.45||dimensions[1]<.135)continue;
        if(dimensions[2]<.02){
          // Horizontal landings/raised decks need an underside silhouette.
          // Single wall skins are excluded: their bounds can span a doorway.
          if(size.y>.02||size.x>8||size.z>8)continue;
          if(measure.area<size.x*size.z*.95)continue;
          const moving=/_(Car|CarriageOne|CarriageTwo)$/.test(name);
          const floor=name.startsWith('R5')?74.75:name.startsWith('R4')?26:name.startsWith('R3')?6.8:0;
          if(!moving&&centre.y<floor+.35)continue;
          size.y=.10;centre.y-=.052;
        }else{
          // A connected ring/frame can have a large empty centre. Only nearly
          // solid box components may be replaced by a filled silhouette.
          if(Math.abs(measure.volume)<size.x*size.y*size.z*.85)continue;
          // Slightly inset silhouettes avoid shadowing beyond bevelled faces.
          size.set(Math.max(.01,size.x-.016),Math.max(.01,size.y-.016),Math.max(.01,size.z-.016));
        }
        boxes.push([...centre.toArray(),...size.toArray()].map(v=>Number(v.toFixed(4))));
      }
    });
    // Small fittings already have receiver shading; cap each assembly's work.
    result[name]=boxes.sort((a,b)=>b[3]*b[4]*b[5]-a[3]*a[4]*a[5]).slice(0,64)
      .sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  }
  const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  scene.traverse(o=>{if(o instanceof THREE.Mesh){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
const text='// Generated by scripts/assets/generate-containment-lighting.ts; do not edit.\n'+
  'export const CONTAINMENT_LIGHTING_SOURCE_HASHES='+JSON.stringify(hashes,null,2)+' as const;\n'+
  'export const CONTAINMENT_LIGHTING_BOXES:Readonly<Record<string,readonly (readonly number[])[]>>={\n'+
  Object.entries(result).map(([name,boxes])=>`  ${JSON.stringify(name)}:${JSON.stringify(boxes)},`).join('\n')+'\n};\n';
const target=new URL('../../src/render/environment/containment/ContainmentLightingBake.ts',import.meta.url);
if(process.argv.includes('--check')){
  if(await readFile(target,'utf8')!==text)throw new Error('Containment lighting bake is stale.');
}else await writeFile(target,text);
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([name,boxes])=>[name,boxes.length]))));
