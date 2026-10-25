import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readGzipResponse } from '../ReadGzipResponse.ts';

export const ROOM_ONE_SHELL_URL = new URL('../../../../assets/environments/containment-room-one/room-one-shell.glb', import.meta.url).href;
export const ROOM_ONE_MAPS_URL = new URL('../../../../assets/environments/containment-room-one/room-one-maps.bin', import.meta.url).href;
export const ROOM_ONE_COMPRESSED_MAPS_URL = new URL('../../../../assets/environments/containment-room-one/room-one-maps-bc7.bin', import.meta.url).href;
export const ROOM_ONE_SHELL_VERSION = 'containment-room-one-v1';
const MAP_SIZES = [2048,512,512,1024,512,512] as const;
const MAP_NAMES = ['ceramic-color','ceramic-normal','ceramic-orm','resin-color','resin-normal','resin-orm'] as const;
const HEADER_BYTES = 8 + MAP_SIZES.length * 8;
export interface RoomOneMap { readonly size: number; readonly pixels: Uint8Array; }
export interface RoomOneCompressedMap { readonly size: number; readonly mipmaps: readonly THREE.CompressedTextureMipmap[]; }
export interface RoomOneShellAsset { readonly root: THREE.Group; readonly maps: readonly RoomOneMap[]; readonly compressedMaps?: readonly RoomOneCompressedMap[]; }

/** Native BC7 blocks, validated before texture creation. Original RGBA remains
 * the fallback on devices without BPTC and on failed optional-bank loads. */
export function readRoomOneCompressedMaps(buffer: ArrayBuffer): readonly RoomOneCompressedMap[] {
  if (buffer.byteLength < HEADER_BYTES) throw new Error('Truncated Room 1 BC7 maps.');
  const bytes = new Uint8Array(buffer), header = new DataView(buffer);
  if (String.fromCharCode(...bytes.subarray(0,8)) !== 'R1BC7001') throw new Error('Unsupported Room 1 BC7 maps.');
  let offset = HEADER_BYTES;
  const maps = MAP_SIZES.map((size,index) => {
    const levels = Math.log2(size) + 1;
    if (header.getUint32(8+index*8,true) !== size || header.getUint32(12+index*8,true) !== levels) throw new Error('Invalid Room 1 BC7 dimensions.');
    const mipmaps: THREE.CompressedTextureMipmap[] = [];
    for (let level=0; level<levels; level++) {
      const width = Math.max(1,size >> level), length = Math.ceil(width/4) ** 2 * 16;
      if (offset+4+length > buffer.byteLength || header.getUint32(offset,true) !== length) throw new Error('Invalid Room 1 BC7 mip.');
      offset += 4;
      mipmaps.push({width,height:width,data:new Uint8Array(buffer,offset,length)}); offset += length;
    }
    return {size,mipmaps};
  });
  if (offset !== buffer.byteLength) throw new Error('Unexpected Room 1 BC7 data.');
  return maps;
}

/** Validate before allocating GPU resources. Views borrow one decompressed bank. */
export function readRoomOneMaps(buffer: ArrayBuffer): readonly RoomOneMap[] {
  if (buffer.byteLength < HEADER_BYTES) throw new Error('Truncated Room 1 surface maps.');
  const bytes = new Uint8Array(buffer), header = new DataView(buffer);
  if (String.fromCharCode(...bytes.subarray(0,8)) !== 'SPCR1001') throw new Error('Unsupported Room 1 surface maps.');
  let offset = HEADER_BYTES;
  const maps = MAP_SIZES.map((size,index) => {
    if (header.getUint32(8+index*8,true) !== size || header.getUint32(12+index*8,true) !== size) throw new Error(`Invalid Room 1 map size: ${MAP_NAMES[index]}.`);
    const length = size*size*4;
    if (offset+length > buffer.byteLength) throw new Error('Truncated Room 1 map pixels.');
    const pixels = new Uint8Array(buffer,offset,length); offset += length;
    return {size,pixels};
  });
  if (offset !== buffer.byteLength) throw new Error('Unexpected trailing Room 1 map data.');
  return maps;
}

export async function parseRoomOneShell(bytes: ArrayBuffer): Promise<THREE.Group> {
  const {scene} = await new GLTFLoader().parseAsync(bytes,'');
  if (scene.getObjectByName('R1_Architecture')?.userData.asset !== ROOM_ONE_SHELL_VERSION) {
    disposeAsset(scene); throw new Error('Unexpected Room 1 architecture version.');
  }
  return scene;
}

async function loadRoomOneShell(signal: AbortSignal): Promise<RoomOneShellAsset> {
  const responses = await Promise.all([fetch(ROOM_ONE_SHELL_URL,{signal}),fetch(ROOM_ONE_MAPS_URL,{signal})]);
  if (responses.some(response=>!response.ok)) throw new Error('Could not load Room 1 architecture.');
  const [geometry,maps] = await Promise.all([responses[0]!.arrayBuffer(),readGzipResponse(responses[1]!,signal)]);
  const bank = readRoomOneMaps(maps);
  const root = await parseRoomOneShell(geometry);
  return {root,maps:bank};
}

export async function loadRoomOneCompressedShell(signal: AbortSignal): Promise<RoomOneShellAsset> {
  // Fetch geometry only once; a missing compressed bank retries the RGBA maps.
  const geometry = fetch(ROOM_ONE_SHELL_URL,{signal}).then(response => {
    if (!response.ok) throw new Error('Could not load Room 1 architecture.');
    return response.arrayBuffer();
  });
  const maps = (async () => {
    try {
      const response = await fetch(ROOM_ONE_COMPRESSED_MAPS_URL,{signal});
      if (!response.ok) throw new Error('Could not load Room 1 BC7 maps.');
      return {maps:[],compressedMaps:readRoomOneCompressedMaps(await readGzipResponse(response,signal))};
    } catch (error) {
      if (signal.aborted) throw error;
      const response = await fetch(ROOM_ONE_MAPS_URL,{signal});
      if (!response.ok) throw new Error('Could not load Room 1 surface maps.');
      return {maps:readRoomOneMaps(await readGzipResponse(response,signal))};
    }
  })();
  const [bytes,bank] = await Promise.all([geometry,maps]);
  return {root:await parseRoomOneShell(bytes),...bank};
}

/** Owns only the authored shell. Colliders, pod animation and puzzle state stay
 * with their existing owners. The same asset also dresses the opening shot. */
export class RoomOneShell {
  readonly root = new THREE.Group();
  private readonly abort = new AbortController();
  private readonly textures: (THREE.DataTexture | THREE.CompressedTexture)[] = [];
  private readonly materials = new Set<THREE.Material>();
  private readonly finishes = new Map<string,THREE.Material>();
  private asset: THREE.Group | undefined;
  private preparation: Promise<void> | undefined;
  private disposed = false;

  constructor() {
    this.root.name = 'room-1-authored-shell';
    this.root.userData.visualOnly = true;
    this.root.userData.staticBatchExcluded = true; // Already material-batched in Blender.
  }

  prepare(loader: (signal: AbortSignal)=>Promise<RoomOneShellAsset> = loadRoomOneShell): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.preparation ??= loader(this.abort.signal).then(asset=>{
      if (this.disposed) {disposeAsset(asset.root);return;}
      this.adopt(asset);
    }).catch(error=>{
      this.preparation=undefined;
      if (!this.disposed) throw error;
    });
  }

  private adopt(asset: RoomOneShellAsset): void {
    const textures = (asset.compressedMaps ?? asset.maps).map((map,index)=>{
      const compressed = 'mipmaps' in map;
      const texture = compressed
        ? new THREE.CompressedTexture([...map.mipmaps],map.size,map.size,THREE.RGBA_BPTC_Format)
        : new THREE.DataTexture(map.pixels,map.size,map.size,THREE.RGBAFormat);
      texture.name = `room-1-${MAP_NAMES[index]}`;
      texture.colorSpace = index%3 === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.generateMipmaps = !compressed;
      texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 4; texture.needsUpdate = true;
      this.textures.push(texture); return texture;
    });
    const finish = (family: number,tint: readonly [number,number,number])=>new THREE.MeshStandardMaterial({
      color:new THREE.Color(...tint),map:textures[family*3],normalMap:textures[family*3+1],
      normalScale:new THREE.Vector2(.3,.3),roughness:1,roughnessMap:textures[family*3+2],metalness:0,
    });
    const finishes: Record<string,THREE.Material> = {
      R1_Ivory:finish(0,[.88,.86,.79]),R1_Cool:finish(0,[.43,.53,.55]),
      R1_Resin:finish(1,[.43,.50,.51]),R1_Island:finish(1,[.57,.62,.61]),
      R1_Graphite:new THREE.MeshStandardMaterial({color:new THREE.Color(.028,.043,.052),roughness:.65,metalness:.25}),
      R1_Alloy:new THREE.MeshStandardMaterial({color:new THREE.Color(.28,.35,.37),roughness:.37,metalness:.7}),
      R1_Glass:new THREE.MeshStandardMaterial({color:new THREE.Color(.13,.24,.27),roughness:.17,metalness:.12,transparent:true,opacity:.19,depthWrite:false}),
      R1_Light:new THREE.MeshBasicMaterial({color:new THREE.Color(.76,.86,.88),toneMapped:false}),
      R1_Screen:new THREE.MeshBasicMaterial({color:new THREE.Color(.055,.23,.25),toneMapped:false}),
      R1_Amber:new THREE.MeshStandardMaterial({color:new THREE.Color(.52,.28,.06),roughness:.5,metalness:.12}),
    };
    for (const [name,material] of Object.entries(finishes)) {
      material.name=`room-1-shell-${name.slice(3).toLowerCase()}`;
      this.materials.add(material);this.finishes.set(name.slice(3),material);
    }
    const replaced = new Set<THREE.Material>();
    asset.root.traverse(object=>{
      object.userData.visualOnly = true;
      if (!(object instanceof THREE.Mesh)) return;
      const source = Array.isArray(object.material) ? object.material : [object.material];
      const mapped = source.map(material=>{
        replaced.add(material);
        const finishName = object.name.replace('R1_Shell_','R1_');
        const finish = finishes[finishName];
        if (!finish) throw new Error(`Unknown Room 1 finish batch: ${object.name}.`);
        return finish;
      });
      object.material = mapped.length === 1 ? mapped[0]! : mapped;
      object.castShadow = false; // Existing pod/actors cast; the shell receives.
      object.receiveShadow = mapped.every(material=>material instanceof THREE.MeshStandardMaterial&&!material.transparent);
    });
    for (const material of replaced) material.dispose();
    this.asset = asset.root; this.root.add(asset.root);
    this.root.updateWorldMatrix(true,true);
  }

  get diagnostics() {
    let meshes=0,triangles=0;
    this.asset?.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.lightingOnly){meshes++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}});
    return {ready:!!this.asset,meshes,triangles,textureCount:this.textures.length,
      textureBytes:this.textures.reduce((sum,texture)=>sum+(texture instanceof THREE.CompressedTexture
        ? texture.mipmaps.reduce((bytes,mip)=>bytes+mip.data.byteLength,0) : texture.image.data?.byteLength??0),0),disposed:this.disposed};
  }

  /** Borrowed by the opening wing; ownership stays with this shell. */
  borrowFinish(name: string): THREE.Material {
    const material=this.finishes.get(name);
    if (!material || this.disposed) throw new Error(`Room 1 finish is not prepared: ${name}.`);
    return material;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed=true; this.abort.abort();
    if (this.asset) disposeAsset(this.asset,false);
    this.asset=undefined;
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.clear(); this.finishes.clear(); this.textures.length=0;
    this.root.removeFromParent(); this.root.clear();
  }
}

function disposeAsset(root: THREE.Group, materials = true): void {
  const geometry = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.lightingOnly){geometry.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])ownedMaterials.add(m);}});
  for (const value of geometry) value.dispose();
  if (materials) for (const value of ownedMaterials) value.dispose();
  root.removeFromParent();root.clear();
}
