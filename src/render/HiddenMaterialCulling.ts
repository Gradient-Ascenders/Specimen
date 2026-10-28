import * as THREE from 'three';

/** Three uploads geometry before checking material.visible. Retired collider
 * skins must also leave the render layers to avoid first-use buffer uploads.
 * Keep object visibility and child layers intact: physics uses mesh.visible,
 * and authored art can still be parented beneath the hidden collider. */
export class HiddenMaterialCulling {
  private readonly sources: { mesh: THREE.Mesh; mask: number; culled: boolean }[] = [];

  /** Collect after authored art and encounter owners have been attached. */
  constructor(root: THREE.Object3D) {
    root.traverse(object => {
      if (object instanceof THREE.Mesh && this.hidden(object)) {
        this.sources.push({ mesh: object, mask: 0, culled: false });
      }
    });
  }

  render(draw: () => void): void {
    try {
      for (const source of this.sources) {
        // A replaced material or debug reveal must remain drawable. Capture
        // the current mask rather than overwriting later layer changes.
        source.culled = this.hidden(source.mesh);
        if (!source.culled) continue;
        source.mask = source.mesh.layers.mask;
        source.mesh.layers.disableAll();
      }
      draw();
    } finally {
      for (const source of this.sources) {
        if (source.culled) source.mesh.layers.mask = source.mask;
        source.culled = false;
      }
    }
  }

  private hidden(mesh: THREE.Mesh): boolean {
    const material = mesh.material;
    return Array.isArray(material) ? material.every(entry => !entry.visible) : !material.visible;
  }
}
