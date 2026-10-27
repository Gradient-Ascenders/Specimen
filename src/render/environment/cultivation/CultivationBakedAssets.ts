import * as THREE from 'three';
import { readGzipResponse } from '../ReadGzipResponse.ts';
import type { LevelTwoPreviewScene } from '../../../levels/LevelTwoPreviewScene.ts';

export interface SurfaceRepairStep {
  readonly path: readonly number[];
  readonly name: string;
  readonly geometry: string;
}

/** CPU inputs are borrowed; every returned GPU resource belongs to its caller. */
export type CultivationTexture = THREE.DataTexture | THREE.CompressedTexture;
export interface CultivationAssetSource {
  textures(key: string): Record<string, CultivationTexture>;
  geometry(key: string, generate: () => THREE.BufferGeometry): THREE.BufferGeometry;
  geometries(key: string, generate: () => Record<string, THREE.BufferGeometry>): Record<string, THREE.BufferGeometry>;
  bounds(key: string, generate: () => Record<string, readonly number[]>): Readonly<Record<string, readonly number[]>>;
  repair(scene: LevelTwoPreviewScene, install: (mesh: THREE.Mesh, geometry: THREE.BufferGeometry) => void): number;
}

/** Set the source before derived resource field initializers execute. */
export class CultivationAssetOwner {
  readonly assets: CultivationAssetSource;
  constructor(assets: CultivationAssetSource) { this.assets = assets; }
}

export interface BakedArray {
  readonly offset: number;
  readonly length: number;
  readonly type: 'Float32Array' | 'Int16Array' | 'Uint32Array' | 'Uint16Array' | 'Uint8Array';
  /** Lossless word-delta stride. Decoded directly into the caller's own copy. */
  readonly delta?: number;
}
export interface BakedGeometry {
  readonly attributes: Readonly<Record<string, BakedArray & { itemSize: number; normalized: boolean }>>;
  readonly index?: BakedArray;
  readonly groups: readonly { start: number; count: number; materialIndex?: number }[];
  readonly box?: readonly number[];
  readonly sphere: readonly number[];
}
export interface BakedTexture {
  readonly pixels: BakedArray;
  readonly bc7?: readonly { readonly pixels: BakedArray; readonly width: number; readonly height: number }[];
  readonly width: number;
  readonly height: number;
  readonly name: string;
  readonly colorSpace: THREE.ColorSpace;
  readonly wrapS: THREE.Wrapping;
  readonly wrapT: THREE.Wrapping;
  readonly magFilter: THREE.MagnificationTextureFilter;
  readonly minFilter: THREE.MinificationTextureFilter;
  readonly generateMipmaps: boolean;
  readonly anisotropy: number;
  readonly repeat: readonly [number, number];
  readonly offset: readonly [number, number];
}
export interface CultivationAssetManifest {
  readonly version: 1;
  readonly textures: Readonly<Record<string, Readonly<Record<string, BakedTexture>>>>;
  readonly geometries: Readonly<Record<string, BakedGeometry>>;
  readonly geometrySets: Readonly<Record<string, readonly string[]>>;
  readonly bounds: Readonly<Record<string, Readonly<Record<string, readonly number[]>>>>;
  readonly repairs: readonly SurfaceRepairStep[];
}

const MAGIC = 'SPCCUL01';
const arrayTypes = { Float32Array, Int16Array, Uint32Array, Uint16Array, Uint8Array };

/** Validated offline buffers; no generation, triangle search, or global cache. */
export class CultivationBakedAssets implements CultivationAssetSource {
  readonly manifest: CultivationAssetManifest;
  private readonly bytes: ArrayBuffer;
  private readonly byteOffset: number;
  private usedByteLength = 0;
  constructor(manifest: CultivationAssetManifest, bytes: ArrayBuffer, byteOffset = 0) {
    this.manifest = manifest; this.bytes = bytes; this.byteOffset = byteOffset;
    if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset % 4 || byteOffset > bytes.byteLength) {
      throw new Error('Invalid Cultivation data offset.');
    }
    if (manifest.version !== 1 || !manifest.textures || !manifest.geometries || !manifest.geometrySets || !manifest.bounds || !Array.isArray(manifest.repairs)) {
      throw new Error('Unsupported Cultivation asset manifest.');
    }
    for (const maps of Object.values(manifest.textures)) for (const map of Object.values(maps)) {
      if (!Number.isSafeInteger(map.width) || !Number.isSafeInteger(map.height) || map.width < 1 || map.height < 1 ||
          map.pixels.type !== 'Uint8Array' || map.pixels.delta !== undefined || (!map.bc7 && map.pixels.length !== map.width * map.height * 4)) {
        throw new Error(`Invalid Cultivation texture: ${map.name}`);
      }
      this.array(map.pixels);
      if (map.bc7) {
        if (map.width !== map.height || (map.width & (map.width - 1)) ||
            map.bc7.length !== Math.log2(map.width) + 1 ||
            JSON.stringify(map.pixels) !== JSON.stringify(map.bc7[0]?.pixels)) throw new Error('Invalid Cultivation BC7 chain.');
        for (const [level, mip] of map.bc7.entries()) {
          const size = Math.max(1, map.width >> level);
          if (mip.width !== size || mip.height !== size || mip.pixels.type !== 'Uint8Array' || mip.pixels.delta !== undefined ||
              mip.pixels.length !== Math.ceil(size / 4) ** 2 * 16) throw new Error('Invalid Cultivation BC7 mip.');
          this.array(mip.pixels);
        }
      }
    }
    for (const geometry of Object.values(manifest.geometries)) {
      if (!geometry.attributes.position || !Array.isArray(geometry.groups)) throw new Error('Invalid Cultivation geometry.');
      if (geometry.sphere?.length !== 4 || geometry.sphere.some(value => !Number.isFinite(value)) || geometry.sphere[3] < 0 ||
          (geometry.box && (geometry.box.length !== 6 || geometry.box.some(value => !Number.isFinite(value))))) {
        throw new Error('Invalid Cultivation geometry bounds.');
      }
      for (const attribute of Object.values(geometry.attributes)) {
        if (!Number.isInteger(attribute.itemSize) || attribute.itemSize < 1 || attribute.length % attribute.itemSize) {
          throw new Error('Invalid Cultivation attribute.');
        }
        this.array(attribute);
      }
      if (geometry.index) this.array(geometry.index);
    }
    for (const [key, roles] of Object.entries(manifest.geometrySets)) {
      if (!Array.isArray(roles) || roles.some(role => typeof role !== 'string' || !manifest.geometries[`${key}/${role}`])) {
        throw new Error('Invalid Cultivation geometry set.');
      }
    }
    for (const bounds of Object.values(manifest.bounds)) for (const values of Object.values(bounds)) {
      if (!Array.isArray(values) || values.length !== 6 || values.some(value => !Number.isFinite(value))) {
        throw new Error('Invalid Cultivation prop bounds.');
      }
    }
    for (const step of manifest.repairs) {
      if (!Array.isArray(step.path) || step.path.some((index: number) => !Number.isSafeInteger(index) || index < 0) ||
          !manifest.geometries[step.geometry]) throw new Error('Invalid Cultivation repair.');
    }
    if (this.usedByteLength !== bytes.byteLength - byteOffset) throw new Error('Unexpected trailing Cultivation data.');
  }

  private array(spec: BakedArray): THREE.TypedArray {
    const Type = Object.prototype.hasOwnProperty.call(arrayTypes, spec.type)
      ? arrayTypes[spec.type]
      : undefined;
    if (!Type || !Number.isSafeInteger(spec.offset) || !Number.isSafeInteger(spec.length) || spec.offset < 0 ||
        spec.length < 0 || spec.offset % Type.BYTES_PER_ELEMENT ||
        (spec.delta !== undefined && (!Number.isInteger(spec.delta) || spec.delta < 1 || spec.delta > 16 || Type.BYTES_PER_ELEMENT < 2)) ||
        spec.offset + spec.length * Type.BYTES_PER_ELEMENT > this.bytes.byteLength - this.byteOffset) {
      throw new Error('Invalid or truncated Cultivation asset buffer.');
    }
    this.usedByteLength = Math.max(this.usedByteLength, spec.offset + spec.length * Type.BYTES_PER_ELEMENT);
    return new Type(this.bytes, this.byteOffset + spec.offset, spec.length);
  }

  private geometryArray(spec:BakedArray):THREE.TypedArray{
    const source=this.array(spec);
    // Copy bytes rather than float values: encoded float words may contain
    // NaN bit patterns, whose payload must survive until lossless decoding.
    const bytes=new Uint8Array(source.buffer,source.byteOffset,source.byteLength).slice();
    if(spec.delta){
      const Words=source.BYTES_PER_ELEMENT===4?Uint32Array:Uint16Array;
      const words=new Words(bytes.buffer);
      for(let i=spec.delta;i<words.length;i++)words[i]+=words[i-spec.delta];
    }
    return new arrayTypes[spec.type](bytes.buffer);
  }

  textures(key: string): Record<string, CultivationTexture> {
    const maps = this.manifest.textures[key];
    if (!maps) throw new Error(`Missing baked Cultivation textures: ${key}`);
    return Object.fromEntries(Object.entries(maps).map(([role, spec]) => {
      const texture = spec.bc7
        ? new THREE.CompressedTexture(spec.bc7.map(mip => ({data:this.array(mip.pixels) as Uint8Array, width:mip.width, height:mip.height})), spec.width, spec.height, THREE.RGBA_BPTC_Format)
        : new THREE.DataTexture(this.array(spec.pixels) as Uint8Array, spec.width, spec.height);
      texture.name = spec.name; texture.colorSpace = spec.colorSpace;
      texture.wrapS = spec.wrapS; texture.wrapT = spec.wrapT;
      texture.magFilter = spec.magFilter; texture.minFilter = spec.minFilter;
      texture.generateMipmaps = spec.generateMipmaps; texture.anisotropy = spec.anisotropy;
      texture.repeat.fromArray(spec.repeat); texture.offset.fromArray(spec.offset);
      texture.needsUpdate = true;
      return [role, texture];
    }));
  }

  geometry(key: string): THREE.BufferGeometry {
    const spec = this.manifest.geometries[key];
    if (!spec) throw new Error(`Missing baked Cultivation geometry: ${key}`);
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(spec.attributes)) {
      // Presentation code may edit UVs; never lend mutable geometry arrays.
      geometry.setAttribute(name, new THREE.BufferAttribute(this.geometryArray(attribute), attribute.itemSize, attribute.normalized));
    }
    if (spec.index) geometry.setIndex(new THREE.BufferAttribute(this.geometryArray(spec.index), 1));
    for (const group of spec.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    geometry.boundingBox = spec.box
      ? new THREE.Box3(new THREE.Vector3().fromArray(spec.box), new THREE.Vector3().fromArray(spec.box, 3))
      : new THREE.Box3();
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3().fromArray(spec.sphere), spec.sphere[3]);
    return geometry;
  }

  geometries(key: string): Record<string, THREE.BufferGeometry> {
    const roles = this.manifest.geometrySets[key];
    if (!roles) throw new Error(`Missing baked Cultivation geometry set: ${key}`);
    return Object.fromEntries(roles.map(role => [role, this.geometry(`${key}/${role}`)]));
  }

  bounds(key: string): Readonly<Record<string, readonly number[]>> {
    const bounds = this.manifest.bounds[key];
    if (!bounds) throw new Error(`Missing baked Cultivation bounds: ${key}`);
    return bounds;
  }

  repair(scene: LevelTwoPreviewScene, install: (mesh: THREE.Mesh, geometry: THREE.BufferGeometry) => void): number {
    for (const step of this.manifest.repairs) {
      let object: THREE.Object3D | undefined = scene.root;
      for (const index of step.path) object = object?.children[index];
      if (!(object instanceof THREE.Mesh) || object.name !== step.name) {
        throw new Error(`Stale Cultivation repair target: ${step.name}. Regenerate assets.`);
      }
      install(object, this.geometry(step.geometry));
    }
    return this.manifest.repairs.length;
  }
}

/** Fixed header followed by padded JSON and aligned binary arrays. */
export function readCultivationBakedAssets(buffer: ArrayBuffer): CultivationBakedAssets {
  if (buffer.byteLength < 12 || new TextDecoder().decode(new Uint8Array(buffer, 0, 8)) !== MAGIC) {
    throw new Error('Unsupported or truncated Cultivation asset bundle.');
  }
  const size = new DataView(buffer).getUint32(8, true);
  if (size < 2 || size % 4 || size > buffer.byteLength - 12) throw new Error('Invalid Cultivation manifest size.');
  const manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 12, size))) as CultivationAssetManifest;
  return new CultivationBakedAssets(manifest, buffer, 12 + size);
}

export async function loadCultivationBakedAssets(url: URL, signal?: AbortSignal): Promise<CultivationBakedAssets> {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error(`Could not load Cultivation assets: HTTP ${response.status}`);
  const buffer = await readGzipResponse(response, signal);
  return readCultivationBakedAssets(buffer);
}
