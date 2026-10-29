import * as THREE from 'three';

type Submit = THREE.WebGLRenderer['renderBufferDirect'];
interface Source {
  readonly bounds: THREE.Box3;
  epoch: number;
  hidden: boolean;
}

/** Skip authored old-room camera submissions covered by the closed ascent gate.
 * The authored opaque gate body is 8.06 × 5.27 m; the inset rectangle below
 * stays inside its bevels and slats. A box is hidden only when every corner
 * lies behind that rectangle's perspective cone. Shadows keep their draws.
 */
export class BlackoutShutterOcclusion {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly gate: THREE.Object3D;
  private readonly sources = new WeakMap<THREE.Object3D, Source>();
  private readonly inverseGate = new THREE.Matrix4();
  private readonly relative = new THREE.Matrix4();
  private readonly gateClip = new THREE.Matrix4();
  private readonly eye = new THREE.Vector3();
  private camera: THREE.Camera | undefined;
  private previous: Submit | undefined;
  private epoch = 0;
  private gatePrepared = false;
  private gateOccludes = false;

  constructor(renderer: THREE.WebGLRenderer, gate: THREE.Object3D,
    scene: THREE.Object3D) {
    this.renderer = renderer;
    this.gate = gate;
    // Only the Room 1/2 authored geometry bank is eligible. Moving skins
    // retain their live owners; world bounds are recomputed each draw scope.
    // Actors, lights and simulation objects are never hidden or relayered.
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !/^B3_R[12]_Batch_/.test(object.name) ||
          object instanceof THREE.SkinnedMesh ||
          object instanceof THREE.InstancedMesh || object.matrixAutoUpdate ||
          object.customDepthMaterial || object.customDistanceMaterial ||
          Object.keys(object.geometry.morphAttributes).length) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some(material => 'displacementMap' in material && material.displacementMap)) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      this.sources.set(object, { bounds: new THREE.Box3(), epoch: -1, hidden: false });
    });
  }

  render(camera: THREE.Camera, draw: () => void): void {
    // 3.05 m is the fully closed rear-gate centre in BlackoutAscentLift.
    // Do not approximate a moving/partly open gate, or a debug camera layer.
    if (this.camera || !(camera instanceof THREE.PerspectiveCamera) ||
        Math.abs(this.gate.position.y - 3.05) > 1e-6 ||
        !camera.layers.isEnabled(0)) { draw(); return; }
    for (let ancestor: THREE.Object3D | null = this.gate; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) { draw(); return; }
    }
    const previous = this.renderer.renderBufferDirect;
    this.camera = camera;
    this.previous = previous;
    this.epoch++;
    this.gatePrepared = false;
    this.renderer.renderBufferDirect = this.submit;
    try { draw(); }
    finally {
      this.renderer.renderBufferDirect = previous;
      this.previous = undefined;
      this.camera = undefined;
    }
  }

  private readonly submit: Submit = (camera, scene, geometry, material, object, group) => {
    if (camera === this.camera && this.hidden(object)) return;
    this.previous!.call(this.renderer, camera, scene, geometry, material, object, group);
  };

  private hidden(object: THREE.Object3D): boolean {
    const source = this.sources.get(object);
    if (!source) return false;
    if (source.epoch === this.epoch) return source.hidden;
    source.epoch = this.epoch;
    source.hidden = false;
    // Renderer has now updated world matrices. Recompute each draw scope so
    // camera parenting and changed scene transforms cannot leave stale bounds.
    if (!this.gatePrepared) {
      this.inverseGate.copy(this.gate.matrixWorld).invert();
      this.eye.setFromMatrixPosition(this.camera!.matrixWorld).applyMatrix4(this.inverseGate);
      // A near plane can cut away the occluder while leaving distant art
      // visible. Require the whole inset (including its front surface) to
      // remain beyond it; close or sharply tilted cameras keep all draws.
      this.gateClip.multiplyMatrices(this.camera!.projectionMatrix, this.camera!.matrixWorldInverse)
        .multiply(this.gate.matrixWorld);
      const m = this.gateClip.elements;
      const nearest = m[14]! + m[15]! - Math.abs(m[2]! + m[3]!) * 3.8 -
        Math.abs(m[6]! + m[7]!) * 2.4 - Math.abs(m[10]! + m[11]!) * .2;
      this.gateOccludes = this.eye.z > .2 && nearest > 1e-5;
      this.gatePrepared = true;
    }
    if (!this.gateOccludes) return false;
    const mesh = object as THREE.Mesh;
    const box = source.bounds.copy(mesh.geometry.boundingBox!).applyMatrix4(
      this.relative.multiplyMatrices(this.inverseGate, mesh.matrixWorld),
    );
    if (box.max.z >= -.2) return false;
    for (let corner = 0; corner < 8; corner++) {
      const x = corner & 1 ? box.max.x : box.min.x;
      const y = corner & 2 ? box.max.y : box.min.y;
      const z = corner & 4 ? box.max.z : box.min.z;
      const t = this.eye.z / (this.eye.z - z);
      const px = this.eye.x + t * (x - this.eye.x);
      const py = this.eye.y + t * (y - this.eye.y);
      if (Math.abs(px) >= 3.8 || Math.abs(py) >= 2.4) return false;
    }
    source.hidden = true;
    return true;
  }
}
