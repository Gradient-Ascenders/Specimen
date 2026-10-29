import * as THREE from 'three';

/** A rectangle strictly inside an authored opaque surface. Its local +Z faces
 * the camera. Insets include bevels, gaps and the depth of the front surface. */
export interface CameraOccluder {
  readonly mesh: THREE.Mesh;
  readonly frame: THREE.Matrix4;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly depthMargin: number;
  /** For a plane inside a solid volume, include the whole opaque piece when
   * proving that material cutouts cannot remove its front surfaces. */
  readonly clippingBounds?: THREE.Box3;
}

type Submit = THREE.WebGLRenderer['renderBufferDirect'];
const unsafeMaterial = (material: THREE.Material): boolean => !material.depthTest || material instanceof THREE.ShaderMaterial ||
  !!('displacementMap' in material && material.displacementMap);
const unsafeMaterials = (material: THREE.Material | THREE.Material[]): boolean =>
  Array.isArray(material) ? material.some(unsafeMaterial) : unsafeMaterial(material);

/** Camera-only rejection: a complete mesh box must fit behind one opaque
 * rectangle. Shadow cameras, lights, collision and object visibility survive.
 * Decisions use live world matrices after Three has updated the scene. */
export class CameraOcclusion {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sources = new WeakMap<THREE.Object3D, {
    epoch: number; hidden: boolean; geometry: THREE.BufferGeometry;
    positionVersion: number; instanceVersion: number; count: number;
  }>();
  private readonly occluders;
  private readonly world = new THREE.Matrix4();
  private readonly relative = new THREE.Matrix4();
  private readonly clip = new THREE.Matrix4();
  private readonly box = new THREE.Box3();
  private readonly centre = new THREE.Vector3();
  private camera: THREE.PerspectiveCamera | undefined;
  private previous: Submit | undefined;
  private epoch = 0;
  private prepared = false;
  private rejected = 0;

  constructor(renderer: THREE.WebGLRenderer,
    occluders: readonly CameraOccluder[], roots: readonly THREE.Object3D[]) {
    this.renderer = renderer;
    this.occluders = occluders.map(source => ({ ...source, geometry: source.mesh.geometry,
      clipCentre: source.clippingBounds?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3(),
      clipHalfSize: source.clippingBounds?.getSize(new THREE.Vector3()).multiplyScalar(.5) ??
        new THREE.Vector3(source.halfWidth, source.halfHeight, source.depthMargin),
      inverse: new THREE.Matrix4(), eye: new THREE.Vector3(), active: false }));
    for (const root of roots) root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh ||
          Object.keys(object.geometry.morphAttributes).length ||
          unsafeMaterials(object.material)) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const position = object.geometry.getAttribute('position');
      this.sources.set(object, { epoch: -1, hidden: false, geometry: object.geometry,
        positionVersion: position instanceof THREE.BufferAttribute ? position.version : position.data.version,
        instanceVersion: -1, count: -1 });
    });
  }

  get culledDraws(): number { return this.rejected; }

  render(camera: THREE.Camera, draw: () => void): void {
    this.rejected = 0;
    if (this.camera || !(camera instanceof THREE.PerspectiveCamera) ||
        !camera.layers.isEnabled(0) || this.renderer.clippingPlanes.length) { draw(); return; }
    const previous = this.renderer.renderBufferDirect;
    this.camera = camera; this.previous = previous; this.epoch++; this.prepared = false;
    this.renderer.renderBufferDirect = this.submit;
    try { draw(); }
    finally { this.renderer.renderBufferDirect = previous; this.previous = undefined; this.camera = undefined; }
  }

  private readonly submit: Submit = (camera, scene, geometry, material, object, group) => {
    if (camera === this.camera && !scene.overrideMaterial && this.hidden(object)) { this.rejected++; return; }
    this.previous!.call(this.renderer, camera, scene, geometry, material, object, group);
  };

  private prepare(): void {
    for (const source of this.occluders) {
      source.active = false;
      if (source.mesh.geometry !== source.geometry || !source.mesh.layers.test(this.camera!.layers) || [source.mesh.material].flat().some(material =>
        !material.visible || !material.colorWrite || !material.depthWrite || material.transparent ||
        material.opacity < 1 || material.side === THREE.BackSide || material.alphaTest > 0 ||
        ('wireframe' in material && material.wireframe) ||
        ('alphaMap' in material && material.alphaMap) || ('transmission' in material && Number(material.transmission) > 0))) continue;
      let visible = true;
      for (let ancestor: THREE.Object3D | null = source.mesh; ancestor; ancestor = ancestor.parent) {
        if (!ancestor.visible) { visible = false; break; }
      }
      if (!visible) continue;
      this.world.multiplyMatrices(source.mesh.matrixWorld, source.frame);
      if (this.renderer.localClippingEnabled) {
        this.centre.copy(source.clipCentre).applyMatrix4(this.world);
        const m = this.world.elements, half = source.clipHalfSize;
        const kept = (plane: THREE.Plane): boolean => {
          const n = plane.normal;
          return plane.distanceToPoint(this.centre) -
            Math.abs(n.x * m[0]! + n.y * m[1]! + n.z * m[2]!) * half.x -
            Math.abs(n.x * m[4]! + n.y * m[5]! + n.z * m[6]!) * half.y -
            Math.abs(n.x * m[8]! + n.y * m[9]! + n.z * m[10]!) * half.z > 1e-5;
        };
        if ([source.mesh.material].flat().some(material => material.clippingPlanes?.length &&
          !(material.clipIntersection ? material.clippingPlanes.some(kept) : material.clippingPlanes.every(kept)))) continue;
      }
      source.inverse.copy(this.world).invert();
      source.eye.setFromMatrixPosition(this.camera!.matrixWorld).applyMatrix4(source.inverse);
      if (source.eye.z <= source.depthMargin) continue;
      this.clip.multiplyMatrices(this.camera!.projectionMatrix, this.camera!.matrixWorldInverse).multiply(this.world);
      const m = this.clip.elements;
      // Keep the entire inset and its front surface beyond the near plane.
      const nearest = m[14]! + m[15]! - Math.abs(m[2]! + m[3]!) * source.halfWidth -
        Math.abs(m[6]! + m[7]!) * source.halfHeight - Math.abs(m[10]! + m[11]!) * source.depthMargin;
      source.active = nearest > 1e-5;
    }
    this.prepared = true;
  }

  private hidden(object: THREE.Object3D): boolean {
    const source = this.sources.get(object);
    if (!source) return false;
    if (source.epoch === this.epoch) return source.hidden;
    source.epoch = this.epoch; source.hidden = false;
    const mesh = object as THREE.Mesh, geometry = mesh.geometry;
    // Replacement/deforming geometry must remain drawable until explicitly
    // registered again. Instanced banks use their complete live envelope.
    if (geometry !== source.geometry || Object.keys(geometry.morphAttributes).length) return false;
    if (unsafeMaterials(mesh.material)) return false;
    const position = geometry.getAttribute('position');
    const version = position instanceof THREE.BufferAttribute ? position.version : position.data.version;
    if (!geometry.boundingBox || source.positionVersion !== version) {
      geometry.computeBoundingBox(); source.positionVersion = version;
      source.instanceVersion = -1;
    }
    let bounds = geometry.boundingBox!;
    if (mesh instanceof THREE.InstancedMesh) {
      if (!mesh.boundingBox || source.instanceVersion !== mesh.instanceMatrix.version || source.count !== mesh.count) {
        mesh.computeBoundingBox(); source.instanceVersion = mesh.instanceMatrix.version; source.count = mesh.count;
      }
      bounds = mesh.boundingBox!;
    }
    if (bounds.isEmpty()) return false;
    if (!this.prepared) this.prepare();
    for (const occluder of this.occluders) {
      if (!occluder.active) continue;
      this.box.copy(bounds).applyMatrix4(this.relative.multiplyMatrices(occluder.inverse, mesh.matrixWorld));
      if (this.box.max.z >= -occluder.depthMargin) continue;
      let covered = true;
      for (let corner = 0; corner < 8; corner++) {
        const x = corner & 1 ? this.box.max.x : this.box.min.x;
        const y = corner & 2 ? this.box.max.y : this.box.min.y;
        const z = corner & 4 ? this.box.max.z : this.box.min.z;
        const t = occluder.eye.z / (occluder.eye.z - z);
        const px = occluder.eye.x + t * (x - occluder.eye.x);
        const py = occluder.eye.y + t * (y - occluder.eye.y);
        if (!(Math.abs(px) < occluder.halfWidth && Math.abs(py) < occluder.halfHeight)) { covered = false; break; }
      }
      if (covered) { source.hidden = true; return true; }
    }
    return false;
  }
}
