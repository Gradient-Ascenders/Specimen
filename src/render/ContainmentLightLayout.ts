import * as THREE from 'three';
import { disposeShadowLight } from './ShadowLightResources.ts';
import type { Vector3State } from './slime/SlimePresentationContract.ts';

// Include the complete open vent and its frame. Keep the duct rig whenever
// this portal can be seen, including upward looks from the chamber floor.
const ROOM_ONE_VENT = new THREE.Box3(new THREE.Vector3(-6.1, 4.9, 5.4), new THREE.Vector3(-3.5, 7.2, 6.25));

function insideLowerChamber(position: Vector3State): boolean {
  return Math.abs(position.x) < 6.75 && position.y > 0 && position.y < 4.5 &&
    position.z > -5.75 && position.z < 5.15;
}

function visibilityMask(objects: readonly THREE.Object3D[]): number {
  let mask = 0;
  objects.forEach((object, index) => { if (object.visible) mask |= 1 << index; });
  return mask;
}

function restoreVisibility(objects: readonly THREE.Object3D[], mask: number): void {
  objects.forEach((object, index) => { object.visible = (mask & (1 << index)) !== 0; });
}

/** Share bounded shader signatures across authored rooms and doorway overlaps.
 * Padding contributes no radiance. Dormant shadow slots have empty one-pixel
 * maps initialized once, never recurring shadow passes. */
export class ContainmentLightLayout {
  readonly root = new THREE.Group();
  private readonly points = Array.from({ length: 7 }, () => new THREE.PointLight(0, 0));
  private readonly spots = Array.from({ length: 10 }, () => new THREE.SpotLight(0, 0));
  private readonly cameraCullSources: THREE.SpotLight[] = [];
  private readonly roomOneDuctSources: THREE.SpotLight[] = [];
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
      if (object instanceof THREE.SpotLight && object.name.startsWith('room-1-to-2-duct-')) this.roomOneDuctSources.push(object);
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

  /** Only enclosed, lower-chamber views can exclude all four duct sources.
   * Both positions guard first-person, climbing and trailing-camera views. */
  withRoomOneView<T>(position: Vector3State, camera: THREE.Camera, draw: () => T): T {
    if (!insideLowerChamber(position) || !insideLowerChamber(camera.position)) return draw();
    camera.updateWorldMatrix(true, false);
    this.cameraProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.cameraFrustum.setFromProjectionMatrix(this.cameraProjection, camera.coordinateSystem);
    if (this.cameraFrustum.intersectsBox(ROOM_ONE_VENT)) return draw();
    return this.withRoomOneChamberLights(draw);
  }

  /** Synchronous scope shared by gameplay and hidden preparation. No light
   * intensity, map ownership or renderer-global shadow setting changes. */
  withRoomOneChamberLights<T>(draw: () => T): T {
    if (this.roomOneDuctSources.length === 0) return draw();
    const sources = visibilityMask(this.roomOneDuctSources);
    const points = visibilityMask(this.points), spots = visibilityMask(this.spots);
    const previousKey = this.cameraCullKeyValue;
    for (const light of this.roomOneDuctSources) light.visible = false;
    this.cameraCullKeyValue = 'room-1-chamber';
    try {
      this.sync();
      return draw();
    } finally {
      restoreVisibility(this.roomOneDuctSources, sources);
      restoreVisibility(this.points, points);
      restoreVisibility(this.spots, spots);
      this.cameraCullKeyValue = previousKey;
    }
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
    const pointVisibility = visibilityMask(this.points), spotVisibility = visibilityMask(this.spots);
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
    // An empty culled set still owns temporary padding. Its restoration can
    // expose the previous room's padding, so it must differ from an unscoped
    // draw and trigger the runtime's light-state refresh on scope exit.
    this.cameraCullKeyValue = `camera:${culledIndices.join(',')}`;
    try {
      this.sync();
      return draw();
    } finally {
      for (const light of hidden) light.visible = true;
      restoreVisibility(this.points, pointVisibility);
      restoreVisibility(this.spots, spotVisibility);
      this.cameraCullKeyValue = previousKey;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const light of this.spots) disposeShadowLight(light);
  }
}
