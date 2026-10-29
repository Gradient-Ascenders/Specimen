import * as THREE from 'three';
import { gzipSync, gunzipSync } from 'node:zlib';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readRoomOneCompressedMaps} from '../../src/render/environment/containment/RoomOneShell.ts';
import {
  type BakedArray, type BakedGeometry, type BakedTexture,
  type CultivationAssetManifest, type CultivationAssetSource, type CultivationTexture, type SurfaceRepairStep,
} from '../../src/render/environment/cultivation/CultivationBakedAssets.ts';
import type { LevelTwoPreviewScene } from '../../src/levels/LevelTwoPreviewScene.ts';
import { createCultivationEquipmentWear } from './CultivationEquipmentWear.ts';
import { createCultivationPlatformWear } from './CultivationPlatformWear.ts';
import { createCultivationMembraneTextures, createCultivationBiofilmTextures } from './CultivationMembraneMaterial.ts';
import { generateLabFinish } from './cultivation-lab-textures.ts';
import { generateGlass, generateWeather } from './cultivation-contamination-textures.ts';
import { generateWarning } from './cultivation-warning-texture.ts';
import { createAcidFoundationAlbedo, createContainmentCeramicTextures } from '../../src/render/environment/containment/ContainmentProceduralTextures.ts';
import { generateCultivationSurfaceRepairs } from './cultivation-surface-repairs.ts';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CULTIVATION_BLENDER_ASSETS} from '../../src/render/environment/cultivation/CultivationBlenderManifest.ts';

const blenderSources=new Map<string,Record<string,THREE.BufferGeometry>>();
for(const asset of CULTIVATION_BLENDER_ASSETS){
  const bytes=await readFile(new URL(`../../assets/environments/cultivation/${asset.id}.glb`,import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);const parts:Record<string,THREE.BufferGeometry>={};
  const wanted=new Set(asset.batches.map(batch=>batch.geometry??batch.name));
  scene.traverse(object=>{if(object instanceof THREE.Mesh){
    if(wanted.has(object.name))parts[object.name]=object.geometry.clone().applyMatrix4(object.matrixWorld);
    object.geometry.dispose();
    for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();
  }});
  blenderSources.set('cultivation-blender-'+asset.id,parts);
}
{
  const bytes=await readFile(new URL('../../assets/characters/cultivation-security/cultivation-security.glb',import.meta.url));
  const data=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  if(data.images?.length||data.cameras?.length||data.animations?.length||data.extensions?.KHR_lights_punctual)
    throw Error('Security export must contain geometry only.');
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);const parts:Record<string,THREE.BufferGeometry>={};
  scene.traverse(object=>{if(object instanceof THREE.Mesh){
    if(!/^CV_(ceiling|ground|lift|quarantine)_(full|distant)_(armour|armourShadow|mechanism|barrel|mount|linkage)$/.test(object.name))
      throw Error('Unexpected security export mesh: '+object.name);
    parts[object.name]=object.geometry.clone().applyMatrix4(object.matrixWorld);
    object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();
  }});
  if(Object.keys(parts).length!==40)throw Error('Security export needs 40 role/detail buffers.');
  blenderSources.set('cultivation-security-drones',parts);
}
{
  // Reuse the exact Level 1 camera, without loading its opening architecture at runtime.
  const bytes=await readFile(new URL('../../assets/environments/opening-laboratory/opening-laboratory.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);const prefab=scene.getObjectByName('OI_Camera');
  if(prefab?.userData.asset!=='opening-surveillance-v1')throw Error('Unexpected shared surveillance camera');
  const inverse=prefab.matrixWorld.clone().invert(),parts:Record<string,THREE.BufferGeometry>={};
  prefab.traverse(object=>{if(object instanceof THREE.Mesh)
    parts[object.name]=object.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld));});
  blenderSources.set('surveillance-camera',parts);
  scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();
    for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
}

/** Offline only. Runtime has no dependency on this module or its generators. */
export class CultivationAssetGenerator implements CultivationAssetSource {
  private readonly chunks: Uint8Array[] = [];
  private byteLength = 0;
  private readonly arrays = new Map<string, BakedArray>();
  private readonly textureData: Record<string, Record<string, BakedTexture>> = {};
  private readonly geometryData: Record<string, BakedGeometry> = {};
  private readonly geometrySets: Record<string, string[]> = {};
  private readonly boundData: Record<string, Record<string, readonly number[]>> = {};
  private readonly repairs: SurfaceRepairStep[] = [];
  private readonly textureCache = new Map<string, Record<string, CultivationTexture>>();

  private array(array: THREE.TypedArray, delta = 0): BakedArray {
    const type = array.constructor.name as BakedArray['type'];
    if (!['Float32Array', 'Int16Array', 'Uint32Array', 'Uint16Array', 'Uint8Array'].includes(type)) throw new Error(`Unsupported bake array: ${type}`);
    const input = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const key = type + ':' + delta + ':' + createHash('sha256').update(input).digest('hex');
    const existing = this.arrays.get(key);
    if (existing) return existing;
    const padding = (4 - this.byteLength % 4) % 4;
    if (padding) { this.chunks.push(new Uint8Array(padding)); this.byteLength += padding; }
    const offset = this.byteLength;
    const bytes = input.slice();
    if(delta){
      const Words=array.BYTES_PER_ELEMENT===4?Uint32Array:Uint16Array;
      const words=new Words(bytes.buffer,bytes.byteOffset,bytes.byteLength/Words.BYTES_PER_ELEMENT);
      for(let i=words.length-1;i>=delta;i--)words[i]-=words[i-delta];
    }
    this.chunks.push(bytes); this.byteLength += bytes.byteLength;
    const spec = { offset, length: array.length, type, ...(delta?{delta}:{}) };
    this.arrays.set(key, spec); return spec;
  }

  textures(key: string): Record<string, CultivationTexture> {
    const cached = this.textureCache.get(key);
    if (cached) return Object.fromEntries(Object.entries(cached).map(([role, map]) => [role, map.clone()]));
    const maps = this.generateTextures(key);
    this.textureCache.set(key, maps);
    this.textureData[key] = Object.fromEntries(Object.entries(maps).map(([role, map]) => {
      const bc7 = map instanceof THREE.CompressedTexture ? map.mipmaps.map(mip => ({pixels:this.array(mip.data),width:mip.width,height:mip.height})) : undefined;
      return [role, {
      pixels: bc7 ? bc7[0].pixels : this.array((map.image as THREE.DataTextureImageData).data as Uint8Array), ...(bc7 ? {bc7} : {}), width: map.image.width, height: map.image.height,
      name: map.name, colorSpace: map.colorSpace as THREE.ColorSpace, wrapS: map.wrapS, wrapT: map.wrapT,
      magFilter: map.magFilter, minFilter: map.minFilter, generateMipmaps: map.generateMipmaps,
      anisotropy: map.anisotropy, repeat: map.repeat.toArray(), offset: map.offset.toArray(),
    }];}));
    // Owners can change sampler state without changing the generation inputs.
    return Object.fromEntries(Object.entries(maps).map(([role, map]) => [role, map.clone()]));
  }

  private generateTextures(key: string): Record<string, CultivationTexture> {
    switch (key) {
      case 'blender-finishes': {
        // Reuse the accepted Level 1 diffuse/normal/ORM bakes unchanged. One
        // shared bank serves every Cultivation room, rather than per-room maps.
        const bytes=gunzipSync(readFileSync(new URL('../../assets/environments/containment-room-one/room-one-maps-bc7.bin',import.meta.url)));
        const needsResin=CULTIVATION_BLENDER_ASSETS.some(asset=>asset.id!=='room-1'&&asset.id!=='escape-duct'&&
          asset.batches.some(batch=>batch.finish==='Resin'||batch.finish==='Oxide'));
        const maps=readRoomOneCompressedMaps(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)).filter((_,i)=>i<3||needsResin);
        const names=['ceramicColour','ceramicNormal','ceramicOrm','resinColour','resinNormal','resinOrm'];
        return Object.fromEntries(maps.map((map,index)=>{
          const texture=new THREE.CompressedTexture([...map.mipmaps],map.size,map.size,THREE.RGBA_BPTC_Format);
          texture.name='cultivation-shared-level-one-'+names[index];
          texture.colorSpace=index%3===0?THREE.SRGBColorSpace:THREE.NoColorSpace;
          texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=false;
          texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
          texture.anisotropy=4;texture.needsUpdate=true;return[names[index],texture];
        }));
      }
      case 'membrane': return createCultivationMembraneTextures();
      case 'membrane-biofilm': return createCultivationBiofilmTextures();
      case 'platform-deck': return createCultivationPlatformWear('deck');
      case 'platform-pole': return createCultivationPlatformWear('pole');
      case 'equipment-panel': return createCultivationEquipmentWear();
      case 'equipment-drone': return createCultivationEquipmentWear(true);
      case 'ceramic': return createContainmentCeramicTextures();
      case 'acid': return { albedo: createAcidFoundationAlbedo() };
      case 'glass': return generateGlass();
      case 'warning': return generateWarning();
    }
    const finish = key.slice(key.indexOf('-') + 1);
    if (key.startsWith('lab-') && ['wall', 'floor', 'ceiling', 'metal', 'duct'].includes(finish)) {
      return generateLabFinish(finish as Parameters<typeof generateLabFinish>[0]);
    }
    if (key.startsWith('weather-') && ['wall', 'floor', 'ceiling', 'metal'].includes(finish)) {
      const base = this.textures(`lab-${finish}`);
      if (!(base.albedo instanceof THREE.DataTexture)) throw Error('Weather generation needs RGBA inputs.');
      const result = generateWeather(base.albedo, finish as Parameters<typeof generateWeather>[1]);
      Object.values(base).forEach(map => map.dispose());
      return result;
    }
    throw new Error(`Unknown Cultivation texture generator: ${key}`);
  }

  geometry(key: string, generate: () => THREE.BufferGeometry): THREE.BufferGeometry {
    if (this.geometryData[key]) throw new Error(`Duplicate geometry bake key: ${key}`);
    const geometry = generate();
    // Presentation normals and linear vertex colours do not need float32.
    // Positions/UVs, topology, groups and authoritative collision stay exact.
    if (key.startsWith('cultivation-blender-') || key.startsWith('cultivation-security-drones/')) {
      for (const [name, Type, scale] of [['normal', Int16Array, 32767], ['color', Uint8Array, 255]] as const) {
        const source = geometry.getAttribute(name);
        if (!source) continue;
        const normalizedColour16 = name==='color' && source.normalized && source.array instanceof Uint16Array;
        if (!(source.array instanceof Float32Array) && !normalizedColour16) continue;
        const minimum=name==='normal'?-1:0;
        // Preserve HDR/other custom ranges instead of silently clamping them.
        if (!normalizedColour16 && source.array.some(value=>!Number.isFinite(value)||value<minimum||value>1)) continue;
        const values = new Type(source.array.length);
        const factor=normalizedColour16?scale/65535:scale;
        for (let i=0; i<values.length; i++) values[i] = Math.round(source.array[i] * factor);
        geometry.setAttribute(name, new THREE.BufferAttribute(values, source.itemSize, true));
      }
      if (geometry.index?.array instanceof Uint32Array && geometry.getAttribute('position').count < 65536)
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(geometry.index.array), 1));
    }
    const attributes: Record<string, BakedArray & { itemSize: number; normalized: boolean }> = {};
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      if (attribute instanceof THREE.InterleavedBufferAttribute) throw new Error('Interleaved bake attributes are unsupported.');
      attributes[name] = { ...this.array(attribute.array,attribute.array.BYTES_PER_ELEMENT>1?attribute.itemSize:0), itemSize: attribute.itemSize, normalized: attribute.normalized };
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const box = geometry.boundingBox!, sphere = geometry.boundingSphere!;
    this.geometryData[key] = {
      attributes, ...(geometry.index ? { index: this.array(geometry.index.array,geometry.index.array.BYTES_PER_ELEMENT>1?1:0) } : {}),
      groups: geometry.groups.map(group => ({ ...group })),
      ...(!box.isEmpty() ? { box: [...box.min.toArray(), ...box.max.toArray()] } : {}),
      sphere: [...sphere.center.toArray(), sphere.radius],
    };
    return geometry;
  }

  repair(scene: LevelTwoPreviewScene, install: (mesh: THREE.Mesh, geometry: THREE.BufferGeometry) => void): number {
    return generateCultivationSurfaceRepairs(scene, repairs => {
      for (const [mesh, geometry] of repairs) {
        const path: number[] = [];
        for (let node: THREE.Object3D = mesh; node !== scene.root;) {
          const parent = node.parent;
          if (!parent) throw new Error(`Unparented bake target: ${mesh.name}`);
          path.unshift(parent.children.indexOf(node)); node = parent;
        }
        const key = `repair-${this.repairs.length}`;
        this.geometry(key, () => geometry);
        this.repairs.push({ path, name: mesh.name, geometry: key });
        install(mesh, geometry);
      }
    });
  }

  geometries(key: string, generate: () => Record<string, THREE.BufferGeometry>): Record<string, THREE.BufferGeometry> {
    const source=blenderSources.get(key);
    const geometries = source?Object.fromEntries(Object.entries(source).map(([name,geometry])=>[name,geometry.clone()])):generate();
    this.geometrySets[key] = Object.keys(geometries);
    for (const [role, geometry] of Object.entries(geometries)) this.geometry(`${key}/${role}`, () => geometry);
    return geometries;
  }

  bounds(key: string, generate: () => Record<string, readonly number[]>): Readonly<Record<string, readonly number[]>> {
    return this.boundData[key] ??= generate();
  }

  bundle(): Uint8Array {
    const manifest: CultivationAssetManifest = { version: 1, textures: this.textureData, geometries: this.geometryData, geometrySets: this.geometrySets, bounds: this.boundData, repairs: this.repairs };
    const json = new TextEncoder().encode(JSON.stringify(manifest));
    const size = json.length + (4 - json.length % 4) % 4;
    const header = Buffer.alloc(12 + size, 32);
    header.write('SPCCUL01'); header.writeUInt32LE(size, 8); header.set(json, 12);
    const compressed = gzipSync(Buffer.concat([header, ...this.chunks]), { level: 9 });
    compressed[9] = 255;
    return compressed;
  }

  dispose(): void {
    for (const maps of this.textureCache.values()) for (const map of Object.values(maps)) map.dispose();
    this.textureCache.clear();
  }
}
