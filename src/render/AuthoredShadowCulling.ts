import * as THREE from 'three';

/** Long authored batches have very loose bounding spheres. Three can submit
 * them to several cube-shadow faces even when their box misses that face.
 * Skip their vertices on those faces, retaining the original visible mesh,
 * shadow silhouette and every moving actor. No private renderer hooks. */
export class AuthoredShadowCulling {
  enabled = true;
  readonly diagnostics = { tested: 0, culled: 0 };
  private active = false;
  private readonly restoreHooks: (() => void)[] = [];
  private readonly pending = new Map<THREE.BufferGeometry, number>();
  private readonly cameras = new WeakMap<THREE.Camera, { projection: THREE.Matrix4; view: THREE.Matrix4; frustum: THREE.Frustum }>();
  private readonly matrix = new THREE.Matrix4();

  constructor(root: THREE.Object3D) {
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.userData.blenderBatch || object instanceof THREE.InstancedMesh ||
          object instanceof THREE.SkinnedMesh || object.customDepthMaterial || object.customDistanceMaterial ||
          Object.keys(object.geometry.morphAttributes).length ||
          [object.material].flat().some(material => (material as THREE.MeshStandardMaterial).displacementMap)) return;
      const before = object.onBeforeShadow, after = object.onAfterShadow;
      const world = new THREE.Matrix4(), box = new THREE.Box3();
      let geometry: THREE.BufferGeometry | undefined;
      object.onBeforeShadow = (...args) => {
        before.apply(object, args);
        if (!this.active || !this.enabled) return;
        const camera = args[3], current = args[4];
        if (geometry !== current || !world.equals(object.matrixWorld)) {
          geometry = current; world.copy(object.matrixWorld);
          if (!current.boundingBox) current.computeBoundingBox();
          box.copy(current.boundingBox!).applyMatrix4(world).expandByScalar(.02);
        }
        let view = this.cameras.get(camera);
        if (!view) {
          view = { projection: new THREE.Matrix4(), view: new THREE.Matrix4(), frustum: new THREE.Frustum() };
          this.cameras.set(camera, view);
          // Force initialization even for an identity orthographic test camera.
          view.projection.elements[0] = NaN;
        }
        if (!view.projection.equals(camera.projectionMatrix) || !view.view.equals(camera.matrixWorldInverse)) {
          view.projection.copy(camera.projectionMatrix); view.view.copy(camera.matrixWorldInverse);
          this.matrix.multiplyMatrices(view.projection, view.view);
          view.frustum.setFromProjectionMatrix(this.matrix, camera.coordinateSystem, camera.reversedDepth);
        }
        this.diagnostics.tested++;
        if (view.frustum.intersectsBox(box)) return;
        this.diagnostics.culled++;
        this.pending.set(current, current.drawRange.count); current.drawRange.count = 0;
      };
      object.onAfterShadow = (...args) => {
        this.restore(args[4]);
        after.apply(object, args);
      };
      this.restoreHooks.push(() => { object.onBeforeShadow = before; object.onAfterShadow = after; });
    });
  }

  render(draw: () => void): void {
    this.diagnostics.tested = this.diagnostics.culled = 0;
    this.active = true;
    try { draw(); }
    finally {
      // onAfterShadow cannot run when a driver/draw hook throws.
      for (const geometry of this.pending.keys()) this.restore(geometry);
      this.active = false;
    }
  }

  dispose(): void {
    for (const geometry of this.pending.keys()) this.restore(geometry);
    for (const restore of this.restoreHooks) restore();
    this.restoreHooks.length = 0;
  }

  private restore(geometry: THREE.BufferGeometry): void {
    const count = this.pending.get(geometry);
    if (count === undefined) return;
    geometry.drawRange.count = count; this.pending.delete(geometry);
  }
}
