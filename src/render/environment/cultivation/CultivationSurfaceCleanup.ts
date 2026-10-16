import * as THREE from 'three';
import type { LevelTwoPreviewScene } from '../../../levels/LevelTwoPreviewScene.ts';
import type { CultivationAssetSource } from './CultivationBakedAssets.ts';

/** Final presentation pass, after batching and before physics registration. */
export class CultivationSurfaceCleanup {
  private readonly hidden = new THREE.MeshBasicMaterial({visible: false});
  private readonly replacements: {mesh: THREE.Mesh; geometry: THREE.BufferGeometry; repaired: THREE.BufferGeometry}[] = [];
  private readonly proxies: {mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; proxy: THREE.Mesh}[] = [];
  private disposed = false;
  readonly repairedMeshes: number;

  constructor(scene: LevelTwoPreviewScene, assets: CultivationAssetSource) {
    const colliders = new Set(scene.collisionMeshes);
    try {
      this.repairedMeshes = assets.repair(scene, (mesh, geometry) => this.install(mesh, geometry, colliders));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private install(mesh: THREE.Mesh, geometry: THREE.BufferGeometry, colliders: Set<THREE.Mesh>): void {
    if (colliders.has(mesh) || mesh instanceof THREE.InstancedMesh) {
      const proxy = new THREE.Mesh(geometry, mesh.material);
      proxy.name = `${mesh.name}-surface-skin`;
      proxy.userData = {...mesh.userData, presentationOnly: true};
      proxy.castShadow = mesh.castShadow; proxy.receiveShadow = mesh.receiveShadow;
      proxy.layers.mask = mesh.layers.mask;
      mesh.add(proxy);
      this.proxies.push({mesh, material: mesh.material, proxy});
      mesh.material = this.hidden;
    } else {
      this.replacements.push({mesh, geometry: mesh.geometry, repaired: geometry});
      mesh.geometry = geometry;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const {mesh, geometry, repaired} of [...this.replacements].reverse()) { mesh.geometry = geometry; repaired.dispose(); }
    for (const {mesh, material, proxy} of this.proxies) { mesh.material = material; proxy.removeFromParent(); proxy.geometry.dispose(); }
    this.hidden.dispose();
  }
}
