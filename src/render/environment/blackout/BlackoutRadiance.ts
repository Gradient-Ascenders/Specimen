import * as THREE from 'three';
import {readGzipResponse} from '../ReadGzipResponse.ts';
import {withIsolatedPrewarmState} from '../../IsolatedResourcePrewarm.ts';
import {installContainmentSoftShadows} from '../containment/ContainmentSoftShadows.ts';
import {installBlackoutRadianceShader,type BlackoutRadianceUniforms} from './BlackoutRadianceShader.ts';
import {BLACKOUT_RADIANCE_LAYOUT as ZONES,BLACKOUT_RADIANCE_VERSION as VERSION,BLACKOUT_CAPTURE_SIZE as SIZE,
  BLACKOUT_ATLAS_WIDTH as WIDTH,BLACKOUT_ATLAS_HEIGHT as HEIGHT,BLACKOUT_ATLAS_DEPTH as DEPTH,
  BLACKOUT_REFLECTION_COLUMNS as COLUMNS} from './BlackoutLightingLayout.ts';
import type {GraphicsSettings} from '../../GraphicsProfiles.ts';

export const BLACKOUT_RADIANCE_URL=new URL('../../../../assets/environments/blackout-lighting/radiance.bin',import.meta.url).href;
export interface BlackoutRadianceBank {readonly probes:number;readonly invalidProbes:number;readonly irradiance:Uint16Array;readonly captures:readonly Uint8Array[];}
export function readBlackoutRadiance(buffer:ArrayBuffer):BlackoutRadianceBank {
  const bytes=new Uint8Array(buffer),header=new DataView(buffer);
  if(bytes.length<16||new TextDecoder().decode(bytes.subarray(0,8))!==VERSION)throw Error('Invalid Blackout radiance bank.');
  const size=header.getUint32(8,true);
  if(size>4096||size+12>bytes.length)throw Error('Invalid Blackout radiance header.');
  const metadata=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+size)));
  const probes=ZONES.reduce((n,z)=>n+z.grid[0]*z.grid[1]*z.grid[2],0);
  if(JSON.stringify(metadata.atlas)!==JSON.stringify([WIDTH,HEIGHT,DEPTH])||JSON.stringify(metadata.captureSize)!==JSON.stringify(SIZE)||metadata.zones!==ZONES.length||metadata.states!==2||metadata.probes!==probes||!Number.isInteger(metadata.invalidProbes)||metadata.invalidProbes<0||metadata.invalidProbes>probes)throw Error('Unsupported Blackout radiance layout.');
  let offset=(12+size+3)&~3;
  const count=WIDTH*HEIGHT*DEPTH*4,captureSize=SIZE[0]*SIZE[1]*4;
  if(bytes.length!==offset+count*2+captureSize*ZONES.length*2)throw Error('Truncated Blackout radiance bank.');
  const irradiance=new Uint16Array(buffer,offset,count);offset+=count*2;
  if(!irradiance.every(n=>(n&0x7c00)!==0x7c00))throw Error('Nonfinite Blackout irradiance.');
  const captures=Array.from({length:ZONES.length*2},()=>{const data=new Uint8Array(buffer,offset,captureSize);offset+=captureSize;return data;});
  return {probes,invalidProbes:metadata.invalidProbes,irradiance,captures};
}

/** One offline irradiance volume and one local reflection atlas. No live
 * reflection captures, geometry work or texture uploads occur during play. */
export class BlackoutRadiance {
  private readonly abort=new AbortController();
  private preparation:Promise<void>|undefined;
  private volume:THREE.Data3DTexture|undefined;
  private reflections:THREE.WebGLRenderTarget|undefined;
  private tileWidth=0;
  private tileHeight=0;
  private probes=0;
  private invalidProbes=0;
  private disposed=false;
  private readonly bindings=new Map<THREE.MeshStandardMaterial,{compile:THREE.Material['onBeforeCompile'];key:THREE.Material['customProgramCacheKey'];environment:THREE.Texture|null}>();
  readonly uniforms:BlackoutRadianceUniforms={bkVolume:{value:null as unknown as THREE.Data3DTexture},bkPower:{value:ZONES.map(()=>0)},bkDirectional:{value:0},bkLiquid:{value:.2},bkTime:{value:0}};

  async prepare(renderer:THREE.WebGLRenderer,roots:readonly THREE.Object3D[],loader?:(signal:AbortSignal)=>Promise<BlackoutRadianceBank>):Promise<void> {
    if(this.disposed)return;
    await(this.preparation??=this.load(renderer,loader).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;}));
    if(this.disposed||!this.reflections)return;
    for(const root of roots)root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||object.userData.lightingOnly)return;
      for(const material of [object.material].flat()){
        if(!(material instanceof THREE.MeshStandardMaterial)||!material.visible)continue;
        const reflective=!!material.envMap||material instanceof THREE.MeshPhysicalMaterial||material.roughness<.45;
        if(!this.bindings.has(material)){
          this.bindings.set(material,{compile:material.onBeforeCompile,key:material.customProgramCacheKey,environment:material.envMap});
          installContainmentSoftShadows(material);
          installBlackoutRadianceShader(material,this.uniforms,this.tileWidth,this.tileHeight);
        }
        if(reflective)material.envMap=this.reflections!.texture;
      }
    });
  }

  get texture():THREE.Texture|null{return this.reflections?.texture??null;}
  setQuality(settings:GraphicsSettings):void {this.uniforms.bkDirectional.value=settings.shadowMapSizeCap>512?1:0;this.uniforms.bkLiquid.value=settings.effectsDensity*.4;}
  get diagnostics(){return {ready:!!this.reflections,probes:this.probes,invalidProbes:this.invalidProbes,volumeBytes:WIDTH*HEIGHT*DEPTH*8,reflectionWidth:this.reflections?.width??0,reflectionHeight:this.reflections?.height??0,materials:this.bindings.size,liveCaptures:0};}

  private async load(renderer:THREE.WebGLRenderer,loader?:(signal:AbortSignal)=>Promise<BlackoutRadianceBank>):Promise<void> {
    let bank:BlackoutRadianceBank;
    if(loader)bank=await loader(this.abort.signal);
    else{
      const response=await fetch(BLACKOUT_RADIANCE_URL,{signal:this.abort.signal});
      if(!response.ok)throw Error('Could not load Blackout radiance.');
      bank=readBlackoutRadiance(await readGzipResponse(response,this.abort.signal));
    }
    if(this.disposed)return;
    const volume=new THREE.Data3DTexture(bank.irradiance,WIDTH,HEIGHT,DEPTH);
    volume.name='blackout-emergency-powered-L1';volume.type=THREE.HalfFloatType;volume.format=THREE.RGBAFormat;
    volume.minFilter=volume.magFilter=THREE.LinearFilter;volume.generateMipmaps=false;volume.unpackAlignment=1;volume.needsUpdate=true;
    const generator=new THREE.PMREMGenerator(renderer);let atlas:THREE.WebGLRenderTarget|undefined;
    try{
      withIsolatedPrewarmState(renderer,()=>{
        for(const [index,pixels]of bank.captures.entries()){
          const half=new Uint16Array(pixels.length);
          for(let i=0;i<pixels.length;i+=4){const factor=pixels[i+3]===0?0:2**(pixels[i+3]-128)/256;
            for(let c=0;c<3;c++)half[i+c]=THREE.DataUtils.toHalfFloat(pixels[i+c]*factor);
            half[i+3]=THREE.DataUtils.toHalfFloat(1);
          }
          const source=new THREE.DataTexture(half,...SIZE,THREE.RGBAFormat,THREE.HalfFloatType);
          source.mapping=THREE.EquirectangularReflectionMapping;source.colorSpace=THREE.LinearSRGBColorSpace;source.needsUpdate=true;
          let tile:THREE.WebGLRenderTarget|undefined;
          try{
            tile=generator.fromEquirectangular(source);
            if(!atlas){this.tileWidth=tile.width;this.tileHeight=tile.height;
              atlas=new THREE.WebGLRenderTarget(tile.width*COLUMNS,tile.height*Math.ceil(ZONES.length*2/COLUMNS),{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,generateMipmaps:false});
              atlas.texture.mapping=THREE.CubeUVReflectionMapping;atlas.texture.name='blackout-local-two-state-reflections';renderer.initRenderTarget(atlas);
            }
            renderer.copyTextureToTexture(tile.texture,atlas.texture,null,new THREE.Vector2(index%COLUMNS*this.tileWidth,Math.floor(index/COLUMNS)*this.tileHeight));
          }finally{tile?.dispose();source.dispose();}
        }
        renderer.initTexture(volume);
      });
      this.volume=volume;this.reflections=atlas;this.uniforms.bkVolume.value=volume;this.probes=bank.probes;this.invalidProbes=bank.invalidProbes;
    }catch(error){volume.dispose();atlas?.dispose();throw error;}
    finally{generator.dispose();}
  }

  dispose():void {
    if(this.disposed)return;this.disposed=true;this.abort.abort();
    for(const [material,old]of this.bindings){material.onBeforeCompile=old.compile;material.customProgramCacheKey=old.key;material.envMap=old.environment;material.needsUpdate=true;}
    this.bindings.clear();this.volume?.dispose();this.reflections?.dispose();this.volume=undefined;this.reflections=undefined;
  }
}
