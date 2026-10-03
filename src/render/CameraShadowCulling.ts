import * as THREE from 'three';

/** A finite light entirely outside the camera cannot illuminate a visible
 * receiver. Keep its valid depth map, but defer updates until it returns.
 * Light registration and shadow sampler counts never change. */
export class CameraShadowCulling {
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly sources;

  constructor(lights: readonly (THREE.PointLight | THREE.SpotLight)[]) {
    this.sources = lights.map(light => ({ light, culled: false, autoUpdate: false, needsUpdate: false }));
  }

  prepare(camera: THREE.Camera): void {
    camera.updateWorldMatrix(true, false);
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection, camera.coordinateSystem);
    for (const source of this.sources) {
      const { light } = source;
      source.culled = false;
      // Even a zero-radiance light needs a valid first map for its PCF sampler.
      if (!light.castShadow || !light.shadow.map || light.distance <= 0) continue;
      light.getWorldPosition(this.sphere.center);
      this.sphere.radius = light.distance;
      if (this.frustum.intersectsSphere(this.sphere)) continue;
      source.culled = true;
      source.autoUpdate = light.shadow.autoUpdate;
      source.needsUpdate = light.shadow.needsUpdate;
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = false;
    }
  }

  restore(): void {
    for (const source of this.sources) {
      if (!source.culled) continue;
      source.light.shadow.autoUpdate = source.autoUpdate;
      source.light.shadow.needsUpdate = source.needsUpdate;
      source.culled = false;
    }
  }
}
