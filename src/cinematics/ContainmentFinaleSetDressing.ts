import * as THREE from 'three';
import { consolidateContainmentRoomStaticVisuals, type ContainmentStaticBatchResult } from '../render/environment/containment/ContainmentStaticBatching.ts';
import type { CinematicPreparationJob } from './IdleCinematicPreparation.ts';

/** Cutscene-only batches of the real cell. Materials/unchanged geometry remain
 * borrowed; original named gameplay/art objects are never merged or removed. */
export class ContainmentFinaleSetDressing {
  readonly root = new THREE.Group();
  readonly diagnostics = { sourceMeshes: 0, drawCallsRemoved: 0 };
  private readonly sources: { root: THREE.Object3D; visible: boolean }[] = [];
  private readonly batches: ContainmentStaticBatchResult[] = [];
  private readonly instances: THREE.InstancedMesh[] = [];
  private active = false;
  private disposed = false;
  constructor() { this.root.name = 'finale-cell-static-batches'; }

  *preparationJobs(assembly: THREE.Group, movingPanels: THREE.Group): Generator<CinematicPreparationJob> {
    for (const source of assembly.children) {
      if (source === movingPanels) continue;
      yield { label: `finale copy ${source.name}`, run: () => {
        source.updateWorldMatrix(true, true);
        const clone = new THREE.Group(); clone.name = `finale-${source.name}`;
        const copy = source.clone(true);
        copy.matrix.copy(source.matrixWorld); copy.matrixAutoUpdate = false;
        copy.traverse(object => { if (object instanceof THREE.InstancedMesh) this.instances.push(object); });
        clone.add(copy); this.root.add(clone);
        this.sources.push({ root: source, visible: source.visible });
      } };
    }
    const materials = new Set<THREE.Material>();
    this.root.traverse(object => {
      if (object instanceof THREE.Mesh && !Array.isArray(object.material)) materials.add(object.material);
    });
    for (const material of materials) {
      yield { label: `finale batch cell ${material.name || material.type}`, run: () => {
        const preservedNames = new Set<string>();
        this.root.traverse(object => {
          if (object instanceof THREE.Mesh && object.material !== material) preservedNames.add(object.name);
        });
        // One finish per idle job; the cell stays a bounded six-metre set.
        const batch = consolidateContainmentRoomStaticVisuals(this.root, { cellSize: 64, preservedNames });
        this.batches.push(batch);
        this.diagnostics.sourceMeshes += batch.diagnostics.sourceMeshCount;
        this.diagnostics.drawCallsRemoved += batch.diagnostics.drawCallsRemoved;
      } };
    }
  }

  begin(): void {
    if (this.active || this.disposed) return;
    this.active = true;
    for (const source of this.sources) { source.visible = source.root.visible; source.root.visible = false; }
  }
  reset(): void {
    if (!this.active) return;
    for (const source of this.sources) source.root.visible = source.visible;
    this.active = false;
  }
  dispose(): void {
    if (this.disposed) return;
    this.reset(); this.disposed = true;
    this.batches.forEach(batch => batch.dispose());
    // Instance buffers belong to the copies; materials/source geometry do not.
    this.instances.forEach(instance => instance.dispose());
    this.root.removeFromParent(); this.root.clear();
  }
}
