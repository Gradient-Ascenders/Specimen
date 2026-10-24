import * as THREE from 'three';
import {readGzipResponse} from '../ReadGzipResponse.ts';
import {withIsolatedPrewarmState} from '../../IsolatedResourcePrewarm.ts';
import type {GraphicsSettings} from '../../GraphicsProfiles.ts';
import {CONTAINMENT_CAPTURE_SIZE,CONTAINMENT_PROBE_ATLAS_WIDTH,CONTAINMENT_PROBE_ATLAS_HEIGHT,
  CONTAINMENT_PROBE_ATLAS_DEPTH,CONTAINMENT_RADIANCE_VERSION,CONTAINMENT_PROBE_LAYOUT} from './ContainmentProbeLayout.ts';
import {installContainmentRadianceShader,type ContainmentRadianceUniforms} from './ContainmentRadianceShader.ts';

export const CONTAINMENT_RADIANCE_URL=new URL('../../../../assets/environments/containment-lighting/radiance.bin',import.meta.url).href;
export interface ContainmentRadianceBank {readonly probes:number;readonly irradiance:Uint16Array;readonly captures:readonly Uint8Array[];}

/** Validate lengths and layout before any GPU allocation. Views borrow one
 * decompressed bank; the volume retains its source for context restoration. */
export function readContainmentRadiance(buffer:ArrayBuffer):ContainmentRadianceBank{
  const bytes=new Uint8Array(buffer),header=new DataView(buffer);
  if(bytes.length<16||new TextDecoder().decode(bytes.subarray(0,8))!==CONTAINMENT_RADIANCE_VERSION)throw new Error('Invalid Containment radiance bank.');
  const size=header.getUint32(8,true);
  if(size>4096||12+size>bytes.length)throw new Error('Invalid Containment radiance header.');
  const metadata=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+size)));
  const atlas=[CONTAINMENT_PROBE_ATLAS_WIDTH,CONTAINMENT_PROBE_ATLAS_HEIGHT,CONTAINMENT_PROBE_ATLAS_DEPTH];
  const probes=CONTAINMENT_PROBE_LAYOUT.reduce((n,p)=>n+p.grid[0]*p.grid[1]*p.grid[2],0);
  if(JSON.stringify(metadata.atlas)!==JSON.stringify(atlas)||JSON.stringify(metadata.captureSize)!==JSON.stringify(CONTAINMENT_CAPTURE_SIZE)||metadata.probes!==probes)
    throw new Error('Unsupported Containment radiance layout.');
  let offset=(12+size+3)&~3;
  const count=atlas.reduce((a,b)=>a*b,1)*4,captureBytes=CONTAINMENT_CAPTURE_SIZE[0]*CONTAINMENT_CAPTURE_SIZE[1]*4;
  if(bytes.length!==offset+count*2+captureBytes*5)throw new Error('Truncated Containment radiance pixels.');
  const irradiance=new Uint16Array(buffer,offset,count);offset+=count*2;
  const captures=Array.from({length:5},()=>{const data=new Uint8Array(buffer,offset,captureBytes);offset+=captureBytes;return data;});
  return {probes,irradiance,captures};
}

/** Owns one irradiance volume and one packed PMREM atlas. Room capture data is
 * offline-baked; PMREM filtering runs once behind loading, never per frame. */
export class ContainmentRadiance {
  private readonly abort=new AbortController();
  private preparation:Promise<void>|undefined;
  private volume:THREE.Data3DTexture|undefined;
  private reflections:THREE.WebGLRenderTarget|undefined;
  private uniforms:ContainmentRadianceUniforms|undefined;
  private readonly materials=new Set<THREE.MeshStandardMaterial>();
  private probes=0;
  private tileHeight=0;
  private directional=0;
  private disposed=false;

  async prepare(renderer:THREE.WebGLRenderer,root:THREE.Object3D):Promise<void>{
    if(this.disposed)return;
    await (this.preparation??=this.load(renderer).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;}));
    if(this.disposed||!this.reflections||!this.uniforms)return;
    // Include any newly prepared character/camera fade materials, retaining
    // their deformation, dissolve and finite-light hooks and cache keys.
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||object.userData.lightingOnly)return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(!(material instanceof THREE.MeshStandardMaterial)||this.materials.has(material))continue;
        // Matte walls need the baked irradiance but gain little from an extra
        // specular environment lookup. Keep local reflections on gel, glass,
        // polished finishes and metals, avoiding CubeUV programs on every wall.
        if(material.envMap||material instanceof THREE.MeshPhysicalMaterial||material.transparent||material.metalness>=.2||material.roughness<.5)
          material.envMap=this.reflections!.texture;
        installContainmentRadianceShader(material,this.uniforms!,this.tileHeight);
        this.materials.add(material);
      }
    });
  }

  setQuality(settings:GraphicsSettings):void{
    this.directional=settings.shadowMapSizeCap>512?1:0;
    if(this.uniforms)this.uniforms.cDirectionalIrradiance.value=this.directional;
  }

  get texture():THREE.Texture|null{return this.reflections?.texture??null;}

  private async load(renderer:THREE.WebGLRenderer):Promise<void>{
    const response=await fetch(CONTAINMENT_RADIANCE_URL,{signal:this.abort.signal});
    if(!response.ok)throw new Error('Could not load Containment radiance.');
    const bank=readContainmentRadiance(await readGzipResponse(response,this.abort.signal));
    if(this.disposed)return;
    const volume=new THREE.Data3DTexture(bank.irradiance,CONTAINMENT_PROBE_ATLAS_WIDTH,CONTAINMENT_PROBE_ATLAS_HEIGHT,CONTAINMENT_PROBE_ATLAS_DEPTH);
    volume.name='containment-baked-indirect-L1';volume.type=THREE.HalfFloatType;volume.format=THREE.RGBAFormat;
    volume.minFilter=volume.magFilter=THREE.LinearFilter;volume.generateMipmaps=false;volume.unpackAlignment=1;volume.needsUpdate=true;
    const generator=new THREE.PMREMGenerator(renderer);
    let atlas:THREE.WebGLRenderTarget|undefined;
    try{
      withIsolatedPrewarmState(renderer,()=>{
        for(const [room,pixels] of bank.captures.entries()){
          const half=new Uint16Array(pixels.length);
          for(let i=0;i<pixels.length;i+=4){
            const factor=pixels[i+3]===0?0:2**(pixels[i+3]-128)/256;
            for(let channel=0;channel<3;channel++)half[i+channel]=THREE.DataUtils.toHalfFloat(pixels[i+channel]*factor);
            half[i+3]=THREE.DataUtils.toHalfFloat(1);
          }
          const texture=new THREE.DataTexture(half,...CONTAINMENT_CAPTURE_SIZE,THREE.RGBAFormat,THREE.HalfFloatType);
          texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.LinearSRGBColorSpace;texture.needsUpdate=true;
          let target:THREE.WebGLRenderTarget|undefined;
          try{
            target=generator.fromEquirectangular(texture);
            if(!atlas){
              this.tileHeight=target.height;
              atlas=new THREE.WebGLRenderTarget(target.width,target.height*5,{type:THREE.HalfFloatType,
                minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,generateMipmaps:false});
              atlas.texture.mapping=THREE.CubeUVReflectionMapping;atlas.texture.name='containment-five-room-parallax-pmrem';
              renderer.initRenderTarget(atlas);
            }
            renderer.copyTextureToTexture(target.texture,atlas.texture,null,new THREE.Vector2(0,room*target.height));
          }finally{target?.dispose();texture.dispose();}
        }
      });
      this.volume=volume;this.reflections=atlas;this.probes=bank.probes;
      this.uniforms={cIrradiance:{value:volume},cDirectionalIrradiance:{value:this.directional},cIndirectStrength:{value:1}};
    }catch(error){volume.dispose();atlas?.dispose();throw error;}
    finally{generator.dispose();}
  }

  get diagnostics(){return {ready:!!this.reflections,probes:this.probes,textureCount:this.reflections?2:0,
    textureName:this.reflections?.texture.name,mapSize:this.tileHeight/4,
    textureBytes:(this.volume?.image.data?.byteLength??0)+(this.reflections?this.reflections.width*this.reflections.height*8:0),
    reflectionCaptureCount:this.reflections?5:0,runtimeCaptures:0,directionalIrradiance:this.directional===1,
    materialCount:this.materials.size,disposed:this.disposed};}

  dispose():void{
    if(this.disposed)return;this.disposed=true;this.abort.abort();
    this.volume?.dispose();this.reflections?.dispose();this.materials.clear();
    this.volume=undefined;this.reflections=undefined;this.uniforms=undefined;
  }
}
