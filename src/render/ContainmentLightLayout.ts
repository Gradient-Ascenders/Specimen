import * as THREE from 'three';
import { disposeShadowLight } from './ShadowLightResources.ts';

/** Share bounded shader signatures across authored rooms and doorway overlaps.
 * Padding contributes no radiance. Dormant shadow slots have empty one-pixel
 * maps initialized once, never recurring shadow passes. */
export class ContainmentLightLayout {
  readonly root = new THREE.Group();
  private readonly points = Array.from({ length: 7 }, () => new THREE.PointLight(0, 0));
  private readonly spots = Array.from({ length: 10 }, () => new THREE.SpotLight(0, 0));
  private readonly cameraCullSources: THREE.SpotLight[] = [];
  private readonly cameraFrustum = new THREE.Frustum();
  private readonly cameraProjection = new THREE.Matrix4();
  private readonly sourceSphere = new THREE.Sphere();
  private cameraCullKeyValue = '';

  get cameraCullKey(): string { return this.cameraCullKeyValue; }

  private readonly scene: THREE.Scene;
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.traverse(object => {
      if (object instanceof THREE.SpotLight && object.castShadow) this.cameraCullSources.push(object);
    });
    this.root.name = 'containment-shader-light-padding';
    for (const light of this.spots) {
      light.position.set(100000, 100000, 100000);
      light.target.position.set(100000, 99999, 100000);
      light.distance = .2;
      light.angle = .001;
      light.castShadow = true;
      light.shadow.mapSize.set(1, 1);
      light.shadow.camera.near = .1;
      light.shadow.camera.far = .2;
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
      this.root.add(light, light.target);
    }
    this.root.add(...this.points);
    scene.add(this.root);
    this.sync();
  }

  sync(): void {
    this.root.visible = false;
    let points = 0, spots = 0;
    this.scene.traverseVisible(object => {
      if (object instanceof THREE.PointLight) points++;
      if (object instanceof THREE.SpotLight) {
        spots++;
      }
    });
    // Room 2/3 overlaps contain six real spots. Giving them the ten-slot
    // layout carries four unused shadow coordinates and light contributions
    // through every fragment, including the gel's refraction capture. All
    // three layouts are visited by the existing hidden room/overlap prewarm.
    const target = spots <= 3 ? 3 : spots <= 6 ? 6 : 10;
    // Room 3 adds one acid spill to the six shared point slots. Pad the
    // smaller spot layouts to seven points so Room 2/3/4 and their handoffs
    // share programs. Keep the existing six-point, ten-spot duct layout.
    // Zero-radiance slots take the existing finite-light early-out.
    const pointTarget = target === 10 ? 6 : 7;
    this.points.forEach((light, i) => light.visible = i < Math.max(0, pointTarget - points));
    this.spots.forEach((light, i) => light.visible = i < Math.max(0, target - spots));
    this.root.visible = true;
  }

  /** A finite source wholly outside the view cannot light a visible receiver.
   * Keep intersecting sources, including offscreen lamps shining into view.
   * Scope this to the draw so authored visibility and cached depth survive.
   */
  withCameraCulling<T>(camera: THREE.Camera, draw: () => T): T {
    camera.updateWorldMatrix(true, false);
    this.cameraProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.cameraFrustum.setFromProjectionMatrix(this.cameraProjection, camera.coordinateSystem);
    const hidden: THREE.SpotLight[] = [];
    const paddingVisibility = this.spots.map(light => light.visible);
    const previousKey = this.cameraCullKeyValue;
    const culledIndices: number[] = [];
    for (const [index, light] of this.cameraCullSources.entries()) {
      if (light.distance <= 0) continue;
      let visible = true;
      for (let object: THREE.Object3D | null = light; object; object = object.parent) {
        if (!object.visible) { visible = false; break; }
      }
      if (!visible) continue;
      light.getWorldPosition(this.sourceSphere.center);
      this.sourceSphere.radius = light.distance;
      if (this.cameraFrustum.intersectsSphere(this.sourceSphere)) continue;
      hidden.push(light);
      culledIndices.push(index);
      light.visible = false;
    }
    this.cameraCullKeyValue = culledIndices.join(',');
    try {
      this.sync();
      return draw();
    } finally {
      for (const light of hidden) light.visible = true;
      this.spots.forEach((light, index) => light.visible = paddingVisibility[index]);
      this.cameraCullKeyValue = previousKey;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const light of this.spots) disposeShadowLight(light);
  }
}
