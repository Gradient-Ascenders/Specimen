import * as THREE from 'three';

/** Debug-only visual proof layered directly onto authoritative colliders. */
export class ContainmentCollisionOverlay {
  private readonly edgeGeometry: THREE.EdgesGeometry;
  private readonly defaultMaterial = overlayMaterial(0x00f6ff);
  private readonly stickyMaterial = overlayMaterial(0xff4fd8);
  private readonly solubleMaterial = overlayMaterial(0xffb000);
  private readonly lines: THREE.LineSegments[] = [];
  private disposed = false;
  private visible = false;

  constructor(collisionMeshes: readonly THREE.Mesh[]) {
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.edgeGeometry = new THREE.EdgesGeometry(unitBox);
    this.edgeGeometry.name = 'containment-debug-collision-unit-edges';
    unitBox.dispose();

    for (const collider of collisionMeshes) {
      collider.geometry.computeBoundingBox();
      const bounds = collider.geometry.boundingBox;
      if (!bounds) {
        throw new Error(`Collider ${collider.name} has no overlay bounds.`);
      }
      const size = bounds.getSize(new THREE.Vector3());
      const centre = bounds.getCenter(new THREE.Vector3());
      const material = collider.userData.soluble === true
        ? this.solubleMaterial
        : collider.userData.surfaceTag === 'sticky'
          ? this.stickyMaterial
          : this.defaultMaterial;
      const line = new THREE.LineSegments(this.edgeGeometry, material);
      line.name = `${collider.name}-debug-collision-overlay`;
      line.position.copy(centre);
      line.scale.copy(size);
      line.visible = false;
      line.renderOrder = 900;
      line.userData.visualOnly = true;
      line.userData.collisionOverlayFor = collider.name;
      collider.add(line);
      this.lines.push(line);
    }
  }

  get colliderCount(): number {
    return this.lines.length;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    if (this.disposed) return;
    this.visible = visible;
    for (const line of this.lines) line.visible = visible;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const line of this.lines) line.removeFromParent();
    this.lines.length = 0;
    this.edgeGeometry.dispose();
    this.defaultMaterial.dispose();
    this.stickyMaterial.dispose();
    this.solubleMaterial.dispose();
    this.visible = false;
  }
}

function overlayMaterial(colour: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: colour,
    transparent: true,
    opacity: 0.92,
    // Evidence mode intentionally draws through the production dressing so
    // collider alignment remains inspectable even where frames overlap it.
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}
