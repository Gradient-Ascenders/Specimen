import * as THREE from 'three';
import { disposeShadowLight } from './ShadowLightResources.ts';

/** Share two shader signatures across authored rooms and doorway overlaps.
 * Padding contributes no radiance. Dormant shadow slots have empty one-pixel
 * maps initialized once, never recurring shadow passes. */
export class ContainmentLightLayout {
  readonly root = new THREE.Group();
  private readonly points = Array.from({ length: 3 }, () => new THREE.PointLight(0, 0));
  private readonly spots = Array.from({ length: 10 }, () => new THREE.SpotLight(0, 0));

  private readonly scene: THREE.Scene;
  constructor(scene: THREE.Scene) {
    this.scene = scene;
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
    this.points.forEach((light, i) => light.visible = i < Math.max(0, 3 - points));
    // Small rooms keep their three shadow coordinates. Padding every room
    // to the doorway maximum saves compilation but makes Room 3 slower.
    const target = spots <= 3 ? 3 : 10;
    this.spots.forEach((light, i) => light.visible = i < Math.max(0, target - spots));
    this.root.visible = true;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const light of this.spots) disposeShadowLight(light);
  }
}
