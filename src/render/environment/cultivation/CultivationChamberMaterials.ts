import * as THREE from 'three';
import type { GreyboxRoomBuilder } from '../../../levels/GreyboxRoomBuilder.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';

/** Owns the chamber-specific cables and safe-floor boundary resources. */
export class CultivationChamberMaterials {
  readonly textures: THREE.DataTexture[] = [];
  readonly cable = new THREE.MeshStandardMaterial({ name: 'cultivation-reinforced-soluble-cable', color: 0x302922, roughness: 0.67, metalness: 0.22 });
  readonly warning: THREE.MeshStandardMaterial;
  private readonly decorations: THREE.Mesh[] = [];
  private disposed = false;

  constructor() {
    const stripes = new Uint8Array(128 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const yellow = (x + y) % 64 < 32;
      const i = (y * 128 + x) * 4;
      stripes.set(yellow ? [198, 153, 39, 255] : [34, 39, 37, 255], i);
    }
    this.warning = new THREE.MeshStandardMaterial({ name: 'cultivation-hazard-boundary', map: this.texture('warning-stripes', stripes, 128, true), roughness: 0.8, metalness: 0.12 });
  }

  overrides(builder: GreyboxRoomBuilder, lab: CultivationLabMaterials): ReadonlyMap<string, THREE.MeshStandardMaterial> {
    const overrides = new Map<string, THREE.MeshStandardMaterial>();
    builder.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData.textureRole === 'soluble-cable') overrides.set(object.name, this.cable);
      if (object.material === builder.materials.sticky && object.visible) overrides.set(object.name, lab.sticky);
    });
    return overrides;
  }

  addBoundary(root: THREE.Group): void {
    // Only the authored final safe floor has this ground-level safe/hazard boundary.
    const geometry = new THREE.BoxGeometry(47.5, 0.025, 0.38);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 47.5);
    const strip = new THREE.Mesh(geometry, this.warning);
    strip.name = 'cultivation-room-3-safe-boundary-warning';
    strip.userData.presentationOnly = true;
    strip.position.set(0, 0.3675, 66.22);
    root.add(strip);
    this.decorations.push(strip);
  }

  get diagnostics() {
    return { materialCount: 2, textureCount: this.textures.length,
      textureBytes: this.textures.reduce((sum, texture) => sum + (texture.image.data?.byteLength ?? 0), 0), addedDrawCalls: this.decorations.length };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.decorations) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    for (const material of [this.cable, this.warning]) material.dispose();
    for (const texture of this.textures) texture.dispose();
  }

  private texture(name: string, data: Uint8Array, size: number, colour = false): THREE.DataTexture {
    const texture = new THREE.DataTexture(data, size, size);
    texture.name = `cultivation-${name}`;
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.textures.push(texture);
    return texture;
  }
}
