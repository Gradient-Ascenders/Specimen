import * as THREE from 'three';

/** Broad laboratory reflections for the clear fusion gel. Generated once per
 * level; the source never enters gameplay or adds per-frame lights/draws. */
export class SpecimenReflectionEnvironment {
  readonly texture: THREE.Texture;
  private readonly target: THREE.WebGLRenderTarget;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer) {
    const source = new THREE.Scene();
    source.background = new THREE.Color(0.025, 0.08, 0.075);
    const geometry = new THREE.PlaneGeometry(1, 1);
    const materials: THREE.MeshBasicMaterial[] = [];
    const panel = (position: [number, number, number], size: [number, number], color: number, intensity: number) => {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide,
      });
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position); mesh.scale.set(size[0], size[1], 1); mesh.lookAt(0, 0, 0);
      source.add(mesh);
    };
    panel([-4, 4, -4], [3, 6], 0xaffff5, 5);
    panel([4, 2, -3], [2.8, 5], 0xe6ffba, 3);
    panel([0, 6, 1], [5, 4], 0xdbffff, 3);
    panel([-5, 0, 4], [3, 5], 0x6caf65, 1.7);
    panel([4, -2, 4], [3, 4], 0x73c28b, 2);
    const generator = new THREE.PMREMGenerator(renderer);
    try {
      this.target = generator.fromScene(source, 0.08, 0.1, 30, { size: 128 });
    } finally {
      generator.dispose(); geometry.dispose();
      for (const material of materials) material.dispose();
      source.clear();
    }
    this.texture = this.target.texture;
    this.texture.name = 'specimen-laboratory-pmrem';
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.target.dispose();
  }
}
