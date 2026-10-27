import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyExterminationShadowRoles } from './ExterminationShadowRoles.ts';

export const EXTERMINATOR_MODEL_URL = new URL('../../assets/characters/exterminator/exterminator-family.glb', import.meta.url).href;
export const EXTERMINATOR_MODEL_VERSION = 'exterminator-family-v1';
export type ExterminatorMinionStyle = 'Guardian' | 'Pursuer' | 'Advanced';
const ROOTS = ['EX_Boss', 'SW_Guardian', 'SW_Pursuer', 'SW_Advanced'] as const;

/** One encounter owns all immutable geometry, finishes and fine surface maps.
 * Clones own transforms only; retry never reparses or recreates these resources. */
export class ExterminatorModelAsset {
  readonly root: THREE.Group;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.MeshStandardMaterial>();
  private readonly textures: THREE.DataTexture[];
  private disposed = false;
  constructor(root: THREE.Group) {
    this.root = root;
    for (const name of ROOTS) {
      const object = root.getObjectByName(name);
      if (!object || object.userData.asset !== EXTERMINATOR_MODEL_VERSION) throw new Error(`Invalid Exterminator model root: ${name}`);
    }
    this.textures = createMachineSurfaceMaps();
    root.traverse(o => {
      if (o instanceof THREE.Camera || o instanceof THREE.Light || o instanceof THREE.SkinnedMesh) throw new Error('Drone export must contain rigid model parts only.');
      if (!(o instanceof THREE.Mesh)) return;
      const p = o.geometry.getAttribute('position');
      if (!p || !Array.from(p.array).every(Number.isFinite)) throw new Error(`Invalid drone geometry: ${o.name}`);
      this.geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!(m instanceof THREE.MeshStandardMaterial)) throw new Error(`Invalid drone finish: ${m.name}`);
        if (this.materials.has(m)) continue;
        this.materials.add(m);
        if (/_(Red|Amber|White)$/.test(m.name)) {
          m.toneMapped = false;
        } else {
          m.roughnessMap = this.textures[0]!; m.normalMap = this.textures[1]!;
          m.normalScale.setScalar(/Glass|Rubber/.test(m.name) ? .015 : .11);
          m.envMapIntensity = .75;
        }
      }
    });
    applyExterminationShadowRoles(root, true);
  }
  cloneBoss(): THREE.Object3D { return this.clone('EX_Boss'); }
  cloneMinion(style: ExterminatorMinionStyle): THREE.Object3D { return this.clone(`SW_${style}`); }
  private clone(name: string): THREE.Object3D {
    if (this.disposed) throw new Error('Drone model asset was disposed.');
    const object = this.root.getObjectByName(name)!.clone(true);
    object.position.set(0, 0, 0); object.scale.setScalar(1); return object;
  }
  setEnvironment(texture: THREE.Texture | null): void {
    for (const m of this.materials) { m.envMap = texture; m.needsUpdate = true; }
  }
  get diagnostics() { return { ready: !this.disposed, geometries: this.geometries.size, materials: this.materials.size, textures: this.textures.length }; }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.root.removeFromParent(); this.root.clear();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
export async function parseExterminatorModelAsset(bytes: ArrayBuffer): Promise<ExterminatorModelAsset> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  return new ExterminatorModelAsset(gltf.scene);
}
export async function loadExterminatorModelAsset(signal: AbortSignal): Promise<ExterminatorModelAsset> {
  const response = await fetch(EXTERMINATOR_MODEL_URL, { signal });
  if (!response.ok) throw new Error(`Could not load Exterminator model: HTTP ${response.status}`);
  return parseExterminatorModelAsset(await response.arrayBuffer());
}

/** Original, seamless 512px micro finish: restrained brushed grain and roughness,
 * shared at metric scale. Larger wear patches and seams are authored geometry. */
function createMachineSurfaceMaps(): THREE.DataTexture[] {
  const size = 512, rough = new Uint8Array(size * size * 4), normal = new Uint8Array(rough.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const grain = Math.sin(x * Math.PI / 2 + Math.sin(y * Math.PI / 16)) * .5 + Math.sin(y * Math.PI / 4) * .25;
    const r = Math.round(238 + grain * 11);
    rough.set([r, r, r, 255], i);
    normal.set([Math.round(128 + grain * 9), Math.round(128 + Math.sin(y * Math.PI / 8) * 3), 255, 255], i);
  }
  return [rough, normal].map((data, i) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.name = `exterminator-original-${i ? 'normal' : 'roughness'}`;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
  });
}
