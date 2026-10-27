import * as THREE from 'three';
import type {LevelTwoPreviewScene} from '../../../levels/LevelTwoPreviewScene.ts';
import {CULTIVATION_BLENDER_ASSETS} from './CultivationBlenderManifest.ts';
import {optimizeFiniteLightEvaluation} from './FiniteLightEvaluation.ts';
import type {DissolveTarget} from '../../../abilities/DissolveTarget.ts';
import {ROOM_ONE_MAPS_URL, readRoomOneMaps, type RoomOneMap} from '../containment/RoomOneShell.ts';
import {readGzipResponse} from '../ReadGzipResponse.ts';

async function loadFallbackMaps(signal:AbortSignal):Promise<readonly RoomOneMap[]>{
  const response=await fetch(ROOM_ONE_MAPS_URL,{signal});
  if(!response.ok)throw Error('Could not load Cultivation fallback finishes.');
  return readRoomOneMaps(await readGzipResponse(response,signal));
}

/** Pure presentation adapter. Runtime controller roots still own every pose.
 * The asset bank supplies exact positions and compact normal/colour buffers. */
export class CultivationBlenderArt {
  private readonly hidden=new THREE.MeshBasicMaterial({visible:false});
  private readonly hiddenSoluble=new THREE.MeshStandardMaterial({visible:false});
  private readonly solubleSkins:{mesh:THREE.Mesh;source:THREE.MeshStandardMaterial;owner:string;target?:DissolveTarget;material?:THREE.MeshStandardMaterial}[]=[];
  private readonly bindings:{mesh:THREE.Mesh;material:THREE.Material|THREE.Material[]}[]=[];
  private readonly meshes:THREE.Mesh[]=[];
  private readonly deferred:{target:string;mesh:THREE.Mesh}[]=[];
  private readonly runtimeBindings=new Set<()=>void>();
  private readonly geometries=new Set<THREE.BufferGeometry>();
  private readonly materials=new Map<string,THREE.MeshStandardMaterial|THREE.MeshBasicMaterial>();
  private readonly textures:THREE.Texture[]=[];
  private readonly abort=new AbortController();
  private preparation:Promise<void>|undefined;
  private disposed=false;
  readonly diagnostics={assets:0,meshes:0,geometries:0,triangles:0,retiredMeshes:0,newTextures:0,textureBytes:0,compressedFinishes:false};
  constructor(scene:LevelTwoPreviewScene){
    const maps=CULTIVATION_BLENDER_ASSETS.length?scene.assets.textures('blender-finishes'):undefined;
    if(maps){
      this.textures.push(...Object.values(maps));this.diagnostics.newTextures=this.textures.length;
      this.diagnostics.textureBytes=Object.values(maps).reduce((sum,texture)=>sum+(texture instanceof THREE.CompressedTexture
        ? texture.mipmaps.reduce((n,mip)=>n+mip.data.byteLength,0) : texture.image.data?.byteLength??0),0);
      this.diagnostics.compressedFinishes=Object.values(maps).every(texture=>texture instanceof THREE.CompressedTexture);
    }
    const legacy=new Map<string,THREE.MeshBasicMaterial>();
    scene.voltFinaleSet.annex.traverse(o=>{
      if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshBasicMaterial)legacy.set(o.material.name,o.material);
    });
    const finish=(name:string,escape=false,nursery=false):THREE.MeshStandardMaterial|THREE.MeshBasicMaterial=>{
      if(name==='CellGlass'){
        const old=this.materials.get(name);if(old)return old;
        const material=new THREE.MeshStandardMaterial({name:'room-5-containment-clean-glass',color:0xa6c8ca,
          roughness:.2,metalness:.04,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide,vertexColors:true});
        this.materials.set(name,material);return material;
      }
      if(name==='HallGlass'||name==='TestGlass'){
        const key='hall:glass',old=this.materials.get(key);if(old)return old;
        const source=scene.contaminationArt.glass,material=source.clone();
        material.name='cultivation-hall-stained-observation-glass';material.vertexColors=true;
        material.opacity=.50;material.onBeforeCompile=source.onBeforeCompile;
        material.customProgramCacheKey=()=>source.customProgramCacheKey()+':hall';
        this.materials.set(key,material);return material;
      }
      if(name.startsWith('Hall'))return finish(name.slice(4),false,true);
      if(name.startsWith('Test'))return finish(name.slice(4),false,true);
      const key=(escape?'escape:':nursery?'nursery:':'')+name,old=this.materials.get(key);if(old)return old;
      if(name==='LiftLamp'){
        const material=scene.labArt.fixture.clone();
        material.name='cultivation-lift-original-practical';material.color.setHex(0xb7d8cd);
        material.emissive.setHex(0x9dcec1);material.emissiveIntensity=.65;material.roughness=.45;
        optimizeFiniteLightEvaluation(material);this.materials.set(key,material);return material;
      }
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
        Rust:[scene.contaminationArt.finishes.metal,0xbcb7ab],
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
      if(name==='Rust'){material.metalness=.12;material.roughness=.98;}
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
          if(object.userData.sharedLaserEmitter)return;
          const original=object.name.replace(/-surface-skin$/,'');
          let subtree=false;for(let p:THREE.Object3D|null=object.parent;p&&p!==owner;p=p.parent)
            if(asset.retireSubtrees?.includes(p.name)){subtree=true;break;}
          if(!names.has(original)&&!asset.retirePrefixes.some(prefix=>object.name.startsWith(prefix))&&!subtree)return;
          this.bindings.push({mesh:object,material:object.material});
          object.material=object.userData.soluble===true?this.hiddenSoluble:this.hidden;
        });
        const geometries=scene.assets.geometries('cultivation-blender-'+asset.id,()=>{throw Error('Blender GLB geometry must be registered by the offline generator');});
        for(const batch of asset.batches){
          // Older room exports included a second skin over each optical head.
          // The shared Level 1 emitter now owns all of this hardware.
          if(/-presentation-emitter-(start|end)$/.test(batch.target))continue;
          const geometry=geometries[batch.geometry??batch.name];if(!geometry)throw Error(`Missing authored GLB batch: ${batch.name}`);
          const parent=batch.target?owner.getObjectByName(batch.target):asset.owner==='roomFour'?scene.roomFourGeometry:owner;
          const deferred=!parent&&asset.id==='room-3'&&/^cultivation-room-3-roof-drone-[123]-replacement-(cable|hatch)$/.test(batch.target);
          if(!parent&&!deferred)throw Error(`Missing authored mechanism owner: ${batch.target}`);
          const mesh=new THREE.Mesh(geometry,finish(batch.finish,asset.id==='escape-duct',asset.id==='room-1'));mesh.name=batch.name;
          mesh.userData.presentationOnly=true;mesh.userData.blenderBatch=true;
          if(parent?.userData.soluble===true)this.solubleSkins.push({mesh,source:mesh.material as THREE.MeshStandardMaterial,owner:parent.name});
          if(asset.id==='escape-duct'||batch.target==='cultivation-filtration-slow-fan'||batch.name.includes('_cover_')||batch.name.includes('_decks_'))mesh.userData.shadowProxyReceiver=true;
          if(deferred)this.deferred.push({target:batch.target,mesh});else parent!.add(mesh);
          mesh.updateMatrix();mesh.matrixAutoUpdate=false;this.meshes.push(mesh);
          this.geometries.add(geometry);
          this.diagnostics.triangles+=(geometry.index?.count??geometry.getAttribute('position').count)/3;
        }
        this.diagnostics.assets++;
      }
      this.diagnostics.meshes=this.meshes.length;this.diagnostics.retiredMeshes=this.bindings.length;
      this.diagnostics.geometries=this.geometries.size;
    }catch(error){this.dispose();throw error;}
  }
  /** Native blocks are already in the level bank. Unsupported devices fetch
   * the original RGBA maps before shader collection or any GPU upload. */
  prepare(renderer:Pick<THREE.WebGLRenderer,'extensions'>,loader=loadFallbackMaps):Promise<void>{
    if(this.disposed||!this.diagnostics.compressedFinishes||renderer.extensions.has('EXT_texture_compression_bptc'))return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(maps=>{
      if(this.disposed)return;
      if(maps.length<this.textures.length)throw Error('Incomplete Cultivation fallback finishes.');
      const replacements=new Map<THREE.Texture,THREE.DataTexture>();
      for(const [index,old]of this.textures.entries()){
        const map=maps[index],texture=new THREE.DataTexture(map.pixels,map.size,map.size,THREE.RGBAFormat);
        texture.name=old.name;texture.colorSpace=old.colorSpace;texture.wrapS=old.wrapS;texture.wrapT=old.wrapT;
        texture.magFilter=old.magFilter;texture.minFilter=old.minFilter;texture.anisotropy=old.anisotropy;
        texture.repeat.copy(old.repeat);texture.offset.copy(old.offset);texture.generateMipmaps=true;texture.needsUpdate=true;
        replacements.set(old,texture);
      }
      const materials=new Set<THREE.Material>(this.materials.values());
      for(const mesh of this.meshes)for(const material of [mesh.material].flat())materials.add(material);
      for(const material of materials)if(material instanceof THREE.MeshStandardMaterial){
        for(const key of ['map','normalMap','roughnessMap'] as const){const old=material[key];if(old&&replacements.has(old))material[key]=replacements.get(old)!;}
        material.needsUpdate=true;
      }
      for(let i=0;i<this.textures.length;i++){const old=this.textures[i];this.textures[i]=replacements.get(old)!;old.dispose();}
      this.diagnostics.compressedFinishes=false;
      this.diagnostics.textureBytes=maps.slice(0,this.textures.length).reduce((sum,map)=>sum+map.pixels.byteLength,0);
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }
  /** The existing encounter owns deployment poses and visibility; this layer
   * lends only its prepared authored skin until that encounter unloads. */
  attachRuntimeOwners(root:THREE.Object3D):()=>void{
    const bindings:{owner:THREE.Mesh;mesh:THREE.Mesh}[]=[];
    const originals=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();
    for(const entry of this.deferred){
      const owner=root.getObjectByName(entry.target);
      if(!(owner instanceof THREE.Mesh))throw Error(`Missing runtime presentation owner: ${entry.target}`);
      if(entry.mesh.parent)throw Error(`Runtime presentation is already attached: ${entry.target}`);
      if(!originals.has(owner)){originals.set(owner,owner.material);owner.material=this.hidden;}
      bindings.push({owner,mesh:entry.mesh});
      entry.mesh.castShadow=owner.castShadow;entry.mesh.receiveShadow=owner.receiveShadow;owner.add(entry.mesh);
    }
    let detached=false;
    const detach=()=>{if(detached)return;detached=true;
      for(const b of bindings)b.mesh.removeFromParent();
      for(const [owner,material]of originals)owner.material=material;
      this.runtimeBindings.delete(detach);
    };
    this.runtimeBindings.add(detach);return detach;
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
    if(this.disposed)return;this.disposed=true;this.abort.abort();
    for(const detach of this.runtimeBindings)detach();
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
