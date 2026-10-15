import * as THREE from 'three';
import { gzipSync } from 'node:zlib';
import {
  type BakedArray, type BakedGeometry, type BakedTexture,
  type CultivationAssetManifest, type CultivationAssetSource, type SurfaceRepairStep,
} from '../../src/render/environment/cultivation/CultivationBakedAssets.ts';
import type { LevelTwoPreviewScene } from '../../src/levels/LevelTwoPreviewScene.ts';
import { createCultivationEquipmentWear } from './CultivationEquipmentWear.ts';
import { createCultivationPlatformWear } from './CultivationPlatformWear.ts';
import { createCultivationMembraneTextures } from './CultivationMembraneMaterial.ts';
import { generateLabFinish } from './cultivation-lab-textures.ts';
import { generateGlass, generateWeather } from './cultivation-contamination-textures.ts';
import { generateWarning } from './cultivation-warning-texture.ts';
import { createAcidFoundationAlbedo, createContainmentCeramicTextures } from '../../src/render/environment/containment/ContainmentProceduralTextures.ts';
import { generateCultivationSurfaceRepairs } from './cultivation-surface-repairs.ts';

/** Offline only. Runtime has no dependency on this module or its generators. */
export class CultivationAssetGenerator implements CultivationAssetSource {
  private readonly chunks: Uint8Array[] = [];
  private byteLength = 0;
  private readonly textureData: Record<string, Record<string, BakedTexture>> = {};
  private readonly geometryData: Record<string, BakedGeometry> = {};
  private readonly geometrySets: Record<string, string[]> = {};
  private readonly boundData: Record<string, Record<string, readonly number[]>> = {};
  private readonly repairs: SurfaceRepairStep[] = [];
  private readonly textureCache = new Map<string, Record<string, THREE.DataTexture>>();

  private array(array: THREE.TypedArray): BakedArray {
    const type = array.constructor.name as BakedArray['type'];
    if (!['Float32Array', 'Uint32Array', 'Uint16Array', 'Uint8Array'].includes(type)) throw new Error(`Unsupported bake array: ${type}`);
    const padding = (4 - this.byteLength % 4) % 4;
    if (padding) { this.chunks.push(new Uint8Array(padding)); this.byteLength += padding; }
    const offset = this.byteLength;
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength).slice();
    this.chunks.push(bytes); this.byteLength += bytes.byteLength;
    return { offset, length: array.length, type };
  }

  textures(key: string): Record<string, THREE.DataTexture> {
    const cached = this.textureCache.get(key);
    if (cached) return Object.fromEntries(Object.entries(cached).map(([role, map]) => [role, map.clone()]));
    const maps = this.generateTextures(key);
    this.textureCache.set(key, maps);
    this.textureData[key] = Object.fromEntries(Object.entries(maps).map(([role, map]) => [role, {
      pixels: this.array(map.image.data as Uint8Array), width: map.image.width, height: map.image.height,
      name: map.name, colorSpace: map.colorSpace, wrapS: map.wrapS, wrapT: map.wrapT,
      magFilter: map.magFilter, minFilter: map.minFilter, generateMipmaps: map.generateMipmaps,
      anisotropy: map.anisotropy, repeat: map.repeat.toArray(), offset: map.offset.toArray(),
    }]));
    // Owners can change sampler state without changing the generation inputs.
    return Object.fromEntries(Object.entries(maps).map(([role, map]) => [role, map.clone()]));
  }

  private generateTextures(key: string): Record<string, THREE.DataTexture> {
    switch (key) {
      case 'membrane': return createCultivationMembraneTextures();
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
      const result = generateWeather(base.albedo, finish as Parameters<typeof generateWeather>[1]);
      Object.values(base).forEach(map => map.dispose());
      return result;
    }
    throw new Error(`Unknown Cultivation texture generator: ${key}`);
  }

  geometry(key: string, generate: () => THREE.BufferGeometry): THREE.BufferGeometry {
    if (this.geometryData[key]) throw new Error(`Duplicate geometry bake key: ${key}`);
    const geometry = generate();
    const attributes: Record<string, BakedArray & { itemSize: number; normalized: boolean }> = {};
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      if (attribute instanceof THREE.InterleavedBufferAttribute) throw new Error('Interleaved bake attributes are unsupported.');
      attributes[name] = { ...this.array(attribute.array), itemSize: attribute.itemSize, normalized: attribute.normalized };
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const box = geometry.boundingBox!, sphere = geometry.boundingSphere!;
    this.geometryData[key] = {
      attributes, ...(geometry.index ? { index: this.array(geometry.index.array) } : {}),
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
    const geometries = generate();
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
