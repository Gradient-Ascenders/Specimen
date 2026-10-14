import * as THREE from 'three';
import { BLACKOUT_MAINTENANCE_FINISHES as finishes, type BlackoutMaterialFamily, type BlackoutDetailFinish } from './BlackoutMaintenanceFinish.ts';
import type { BlackoutMaintenanceMapData } from './BlackoutMaintenanceMapData.ts';
export type { BlackoutMaterialFamily, BlackoutDetailFinish } from './BlackoutMaintenanceFinish.ts';

/** One bay owns GPU resources; prebaked CPU map data is borrowed from its runtime. */
export class BlackoutMaintenanceMaterials {
  private readonly materials = new Map<BlackoutMaterialFamily, THREE.MeshStandardMaterial>();
  private readonly textures: THREE.DataTexture[] = [];
  private readonly details = new Map<BlackoutDetailFinish, THREE.MeshStandardMaterial>();
  private disposed = false;

  private readonly data: BlackoutMaintenanceMapData;

  constructor(data: BlackoutMaintenanceMapData) { this.data = data; }

  get(family: BlackoutMaterialFamily): THREE.MeshStandardMaterial {
    if (this.disposed) throw new Error('Blackout material kit has been disposed.');
    const existing = this.materials.get(family);
    if (existing) return existing;
    const finish = finishes[family];
    const [albedo, roughness, normal] = this.data.maps[family];
    const material = new THREE.MeshStandardMaterial({
      name: `blackout-${family}`, map: this.texture(family, 'albedo', albedo, THREE.SRGBColorSpace),
      roughnessMap: this.texture(family, 'roughness', roughness, THREE.NoColorSpace),
      normalMap: this.texture(family, 'normal', normal, THREE.NoColorSpace),
      roughness: 1, metalness: finish.metalness, emissive: 0x000000, emissiveIntensity: 0,
    });
    material.userData.tileSizeMetres = finish.tile;
    this.materials.set(family, material);
    return material;
  }

  owns(material: THREE.Material): boolean {
    return [...this.materials.values(), ...this.details.values()].includes(material as THREE.MeshStandardMaterial);
  }

  /** Small fittings share the machinery's data maps; no extra texture allocations. */
  detail(finish: BlackoutDetailFinish): THREE.MeshStandardMaterial {
    if (this.disposed) throw new Error('Blackout material kit has been disposed.');
    const existing = this.details.get(finish);
    if (existing) return existing;
    const base = this.get(finish === 'droneTrim' ? 'dronePaint' : 'machineryMetal');
    const colors = { circuitBoard: 0x194d32, copper: 0x967138, rubber: 0x141b17, droneTrim: 0xaaa080, steel: 0x66706b };
    const metalness = { circuitBoard: .15, copper: .65, rubber: .05, droneTrim: .28, steel: .72 };
    const material = base.clone();
    material.name = `blackout-${finish}`;
    material.color.setHex(colors[finish]); material.metalness = metalness[finish];
    if (finish !== 'droneTrim') material.map = null;
    this.details.set(finish, material);
    return material;
  }

  get diagnostics() {
    return { materialCount: this.materials.size + this.details.size, textureCount: this.textures.length,
      // Exact complete mip chain for RGBA8, excluding driver overhead.
      estimatedTextureBytes: this.textures.reduce((bytes, texture) => bytes + (texture.image.width ** 2 * 4 - 1) / 3 * 4, 0) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of this.materials.values()) material.dispose();
    for (const material of this.details.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.clear(); this.details.clear(); this.textures.length = 0;
  }

  private texture(family: string, suffix: string, data: Uint8Array, colorSpace: THREE.ColorSpace): THREE.DataTexture {
    const size = Math.sqrt(data.length / 4);
    const texture = new THREE.DataTexture(data, size, size);
    texture.name = `blackout-${family}-${suffix}`; texture.colorSpace = colorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
    this.textures.push(texture); return texture;
  }
}
