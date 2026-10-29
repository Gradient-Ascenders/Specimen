import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const VENT_URL = new URL('../../../../assets/environments/containment-vent/vent.glb', import.meta.url).href;

/** Blender-authored, material-batched lining; gameplay collision stays in TeachingScene. */
export class ContainmentVentArt {
  readonly root = new THREE.Group();
  private readonly abort = new AbortController();
  private preparation: Promise<void> | undefined;
  private disposed = false;

  constructor() {
    this.root.name = 'containment-authored-vent';
    this.root.userData.visualOnly = true;
    this.root.userData.staticBatchExcluded = true;
  }

  prepare(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.preparation ??= this.load().catch(error => {
      this.preparation = undefined;
      if (!this.disposed) throw error;
    });
  }

  private async load(): Promise<void> {
    const response = await fetch(VENT_URL, { signal: this.abort.signal });
    if (!response.ok) throw new Error('Could not load containment vent.');
    const { scene } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    scene.traverse(object => {
      object.userData.visualOnly = true;
      if (!(object instanceof THREE.Mesh)) return;
      const imported = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of imported) material.dispose();
      // The authored vertex colours contain the complete dim shading. No live
      // lighting, textures, shadow variants, or double application of tint.
      object.material = new THREE.MeshBasicMaterial({ vertexColors: true });
      object.material.name = `${object.name}-baked`;
      object.castShadow = false;
      object.receiveShadow = false;
    });
    if (this.disposed) { this.release(scene); return; }
    this.root.add(scene);
  }

  private release(root: THREE.Object3D): void {
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.release(this.root);
    this.root.clear();
    this.root.removeFromParent();
  }
}
