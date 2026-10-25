import * as THREE from 'three';
import type {LevelTwoPreviewScene} from '../../../levels/LevelTwoPreviewScene.ts';
import {CULTIVATION_BLENDER_ASSETS} from './CultivationBlenderManifest.ts';
import {optimizeFiniteLightEvaluation} from './FiniteLightEvaluation.ts';
import type {DissolveTarget} from '../../../abilities/DissolveTarget.ts';

/** Pure presentation adapter. Runtime controller roots still own every pose.
 * The existing asset bank supplies exact GLB buffers before GPU preparation. */
export class CultivationBlenderArt {
  private readonly hidden=new THREE.MeshBasicMaterial({visible:false});
  private readonly hiddenSoluble=new THREE.MeshStandardMaterial({visible:false});
  private readonly solubleSkins:{mesh:THREE.Mesh;source:THREE.MeshStandardMaterial;owner:string;target?:DissolveTarget;material?:THREE.MeshStandardMaterial}[]=[];
  private readonly bindings:{mesh:THREE.Mesh;material:THREE.Material|THREE.Material[]}[]=[];
  private readonly meshes:THREE.Mesh[]=[];
  private readonly geometries=new Set<THREE.BufferGeometry>();
  private readonly materials=new Map<string,THREE.MeshStandardMaterial|THREE.MeshBasicMaterial>();
  private readonly textures:THREE.Texture[]=[];
  private disposed=false;
  readonly diagnostics={assets:0,meshes:0,geometries:0,triangles:0,retiredMeshes:0,newTextures:0,textureBytes:0};
  constructor(scene:LevelTwoPreviewScene){
    const maps=CULTIVATION_BLENDER_ASSETS.length?scene.assets.textures('blender-finishes'):undefined;
    if(maps){
      this.textures.push(...Object.values(maps));this.diagnostics.newTextures=this.textures.length;
      this.diagnostics.textureBytes=Object.values(maps).reduce((sum,texture)=>sum+(texture.image.data?.byteLength??0),0);
    }
    const legacy=new Map<string,THREE.MeshBasicMaterial>();
    scene.voltFinaleSet.annex.traverse(o=>{
      if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshBasicMaterial)legacy.set(o.material.name,o.material);
    });
    const finish=(name:string,escape=false,nursery=false):THREE.MeshStandardMaterial|THREE.MeshBasicMaterial=>{
      const key=(escape?'escape:':nursery?'nursery:':'')+name,old=this.materials.get(key);if(old)return old;
      if(escape){
        // The cinematic airway already uses unlit finishes. Reuse those exact
        // materials without adding lights or baking directional illumination.
        const roles:Record<string,string>={Ceramic:'duct-galvanised-panels',Cool:'duct-galvanised-panels',
          Resin:'duct-pressed-floor',Graphite:'duct-lining',Alloy:'vent-flanges',Oxide:'duct-copper-services',Amber:'duct-safety-yellow',Ink:'duct-galvanised-panels'};
        const source=legacy.get('volt-finale-'+roles[name]);if(!source)throw Error('Missing existing escape finish: '+name);
        const material=source.clone();material.name='cultivation-blender-escape-'+name.toLowerCase();material.vertexColors=true;
        this.materials.set(key,material);return material;
      }
      const palette:Record<string,[THREE.MeshStandardMaterial,number]>={
        Ceramic:[scene.contaminationArt.finishes.wall,0xd8d6c4],Cool:[scene.contaminationArt.finishes.wall,0x78968a],
        Resin:[scene.contaminationArt.finishes.floor,0x9aaba4],Graphite:[scene.labArt.metal,0x303f40],
        Alloy:[scene.contaminationArt.finishes.metal,0x839690],Oxide:[scene.contaminationArt.finishes.metal,0x967045],
        Amber:[scene.labArt.metal,0xc28c3b],
        Foliage:[scene.contaminationArt.finishes.wall,0x50713b],Loam:[scene.contaminationArt.finishes.floor,0x55432e],
        Lamp:[scene.labArt.fixture,0xf3f2e9],
        Deck:[scene.labArt.platform,0xc7c8b6],
        Ink:[scene.labArt.wall,0xe5e3d4],
        Paint:[scene.labArt.platform,0xc7c8bd],Seal:[scene.labArt.metal,0x252c28],
        Composite:[scene.contaminationArt.finishes.wall,0xaeb1a4],
      };
      const spec=palette[name];if(!spec)throw Error(`Unknown Cultivation Blender finish: ${name}`);
      const material=spec[0].clone();material.color.setHex(spec[1]);material.vertexColors=true;
      if(nursery){
        const neutral:Record<string,number>={Ceramic:0xc7c6bc,Cool:0x92958f,Resin:0x9a9d96,
          Graphite:0x343a37,Alloy:0x858b87,Oxide:0x73796f};
        if(neutral[name]!==undefined)material.color.setHex(neutral[name]);
      }
      if(nursery&&['Ceramic','Cool','Resin','Deck','Paint'].includes(name)){
        material.onBeforeCompile=spec[0].onBeforeCompile;
        material.customProgramCacheKey=()=>spec[0].customProgramCacheKey()+':nursery';
      }
      material.name='cultivation-blender-'+name.toLowerCase();
      if(!nursery||['Foliage','Loam','Lamp','Ink','Graphite','Seal'].includes(name)){
        material.bumpMap=null;material.map=null;material.roughnessMap=null;material.normalMap=null;
      }
      if(!nursery&&maps&&['Ceramic','Cool','Resin','Oxide'].includes(name)){
        const family=name==='Ceramic'||name==='Cool'?'ceramic':'resin';
        material.map=maps[family+'Colour'];material.normalMap=maps[family+'Normal'];
        material.roughnessMap=maps[family+'Orm'];material.normalScale.set(.3,.3);material.roughness=1;
      }
      // Diffuse/normal/ORM only: no baked radiance, emissive maps or new lights.
      if(name!=='Lamp'){material.emissive.setHex(0);material.emissiveIntensity=0;material.emissiveMap=null;}
      if(nursery){material.name='cultivation-nursery-'+name.toLowerCase();material.roughness=Math.max(.86,material.roughness);
        if(['Foliage','Loam','Paint','Seal'].includes(name))material.metalness=0;}
      if(name==='Ink'){material.metalness=0;material.roughness=.9;}
      optimizeFiniteLightEvaluation(material);
      this.materials.set(key,material);return material;
    };
    try{
      for(const asset of CULTIVATION_BLENDER_ASSETS){
        const owner=(scene as unknown as Record<string,{root:THREE.Group}>)[asset.owner]?.root;
        if(!owner)throw Error(`Missing Cultivation Blender owner: ${asset.owner}`);
        const names=new Set(asset.retireNames);
        owner.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          const original=object.name.replace(/-surface-skin$/,'');
          let subtree=false;for(let p:THREE.Object3D|null=object.parent;p&&p!==owner;p=p.parent)
            if(asset.retireSubtrees?.includes(p.name)){subtree=true;break;}
          if(!names.has(original)&&!asset.retirePrefixes.some(prefix=>object.name.startsWith(prefix))&&!subtree)return;
          this.bindings.push({mesh:object,material:object.material});
          object.material=object.userData.soluble===true?this.hiddenSoluble:this.hidden;
        });
        const geometries=scene.assets.geometries('cultivation-blender-'+asset.id,()=>{throw Error('Blender GLB geometry must be registered by the offline generator');});
        for(const batch of asset.batches){
          const geometry=geometries[batch.geometry??batch.name];if(!geometry)throw Error(`Missing authored GLB batch: ${batch.name}`);
          const parent=batch.target?owner.getObjectByName(batch.target):asset.owner==='roomFour'?scene.roomFourGeometry:owner;
          if(!parent)throw Error(`Missing authored mechanism owner: ${batch.target}`);
          const mesh=new THREE.Mesh(geometry,finish(batch.finish,asset.id==='escape-duct',asset.id==='room-1'));mesh.name=batch.name;
          mesh.userData.presentationOnly=true;mesh.userData.blenderBatch=true;
          if(parent.userData.soluble===true)this.solubleSkins.push({mesh,source:mesh.material as THREE.MeshStandardMaterial,owner:parent.name});
          if(asset.id==='escape-duct')mesh.userData.shadowProxyReceiver=true;
          parent.add(mesh);mesh.updateMatrix();mesh.matrixAutoUpdate=false;this.meshes.push(mesh);
          this.geometries.add(geometry);
          this.diagnostics.triangles+=(geometry.index?.count??geometry.getAttribute('position').count)/3;
        }
        this.diagnostics.assets++;
      }
      this.diagnostics.meshes=this.meshes.length;this.diagnostics.retiredMeshes=this.bindings.length;
      this.diagnostics.geometries=this.geometries.size;
    }catch(error){this.dispose();throw error;}
  }
  bindDissolveTargets(targets:readonly DissolveTarget[]):void{
    for(const skin of this.solubleSkins){
      const target=targets.find(target=>target.mesh.name===skin.owner);
      if(!target)throw Error('Missing authored support target: '+skin.owner);
      if(skin.target===target)continue;
      skin.material?.dispose();skin.target=target;
      skin.material=target.createPresentationMaterial(skin.source);
      optimizeFiniteLightEvaluation(skin.material);skin.mesh.material=skin.material;
      skin.mesh.customDepthMaterial=target.mesh.customDepthMaterial;
      skin.mesh.customDistanceMaterial=target.mesh.customDistanceMaterial;
    }
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    for(const skin of this.solubleSkins){skin.material?.dispose();skin.mesh.customDepthMaterial=undefined;skin.mesh.customDistanceMaterial=undefined;}
    for(const mesh of this.meshes)mesh.removeFromParent();
    for(const geometry of this.geometries)geometry.dispose();
    for(const binding of this.bindings)binding.mesh.material=binding.material;
    for(const material of this.materials.values())material.dispose();
    for(const texture of this.textures)texture.dispose();
    this.hidden.dispose();
    this.hiddenSoluble.dispose();
  }
}
