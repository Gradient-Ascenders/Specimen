import type { CultivationAssetSource } from './CultivationBakedAssets.ts';
import * as THREE from 'three';
import type { GreyboxRoomBuilder } from '../../../levels/GreyboxRoomBuilder.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import {optimizeFiniteLightEvaluation} from './FiniteLightEvaluation.ts';

/** Owns the chamber-specific cables and safe-floor boundary resources. */
export class CultivationChamberMaterials {
  readonly textures: import('./CultivationBakedAssets.ts').CultivationTexture[] = [];
  readonly cable = new THREE.MeshStandardMaterial({ name: 'cultivation-reinforced-soluble-cable', color: 0x302922, roughness: 0.67, metalness: 0.22 });
  readonly warning: THREE.MeshStandardMaterial;
  private landing?:THREE.MeshStandardMaterial;
  private biofilm?:THREE.MeshStandardMaterial;
  private readonly decorations: THREE.Mesh[] = [];
  private disposed = false;

  constructor(assets: CultivationAssetSource) {
    const stripes = assets.textures('warning').albedo;
    this.textures.push(stripes);
    this.warning = new THREE.MeshStandardMaterial({ name: 'cultivation-hazard-boundary', map: stripes, roughness: 0.8, metalness: 0.12 });
  }

  overrides(builder: GreyboxRoomBuilder, lab: CultivationLabMaterials): ReadonlyMap<string, THREE.MeshStandardMaterial> {
    const overrides = new Map<string, THREE.MeshStandardMaterial>();
    // Borrow the approved dirty deck maps without adding a new platform
    // assembly beneath these thin, authoritative adhesive landing shelves.
    if(!this.landing){
      this.landing=lab.platform.clone();this.landing.name='cultivation-extraction-dirty-metal-landing';
      this.landing.roughness=.94;this.landing.metalness=.18;
      this.landing.userData.tileSizeMetres=[8,8];
      optimizeFiniteLightEvaluation(this.landing);
    }
    if(!this.biofilm){
      // The extraction walls use the shared growth maps continuously, without
      // the rectangular crust/lip shader that reads as an added side frame.
      this.biofilm=lab.nurserySticky.clone();this.biofilm.name='cultivation-extraction-unframed-biofilm';
      delete this.biofilm.userData.cultivationMembrane;
      optimizeFiniteLightEvaluation(this.biofilm);
    }
    builder.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData.textureRole === 'soluble-cable') overrides.set(object.name, this.cable);
      if (object.material === builder.materials.sticky && object.visible) {
        const biofilm=object.name.startsWith('cultivation-room-3-entry-sticky-transfer')||
          object.name.startsWith('cultivation-room-3-central-sticky-transfer')||
          (object.name.startsWith('cultivation-room-3-high-sticky-transfer')&&!object.name.endsWith('-opening-floor'));
        const landing=object.name==='cultivation-room-3-first-wall-sticky-landing'||
          object.name==='cultivation-room-3-high-sticky-transfer-opening-floor';
        overrides.set(object.name,landing?this.landing!:biofilm?this.biofilm!:lab.duct);
      }
    });
    return overrides;
  }

  addBoundary(root: THREE.Group): void {
    // Only the authored final safe floor has this ground-level safe/hazard boundary.
    // Keep the tape's opaque edge clear of the existing tipped sentry faceplate.
    const geometry = new THREE.BoxGeometry(47.5, 0.025, 0.34);
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
      textureBytes: this.textures.reduce((sum, texture) => sum + (texture instanceof THREE.DataTexture ? texture.image.data?.byteLength??0 : texture.mipmaps.reduce((n,m)=>n+m.data.byteLength,0)), 0), addedDrawCalls: this.decorations.length };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.decorations) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    for (const material of [this.cable, this.warning,this.landing,this.biofilm]) material?.dispose();
    for (const texture of this.textures) texture.dispose();
  }


}
