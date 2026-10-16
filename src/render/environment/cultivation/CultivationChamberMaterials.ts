import type { CultivationAssetSource } from './CultivationBakedAssets.ts';
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

  constructor(assets: CultivationAssetSource) {
    const stripes = assets.textures('warning').albedo;
    this.textures.push(stripes);
    this.warning = new THREE.MeshStandardMaterial({ name: 'cultivation-hazard-boundary', map: stripes, roughness: 0.8, metalness: 0.12 });
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


}
