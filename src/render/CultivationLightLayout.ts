import * as THREE from 'three';

/** Keep ordinary-room shader arrays compatible without adding spot or shadow passes. */
export class CultivationLightLayout {
  readonly root = new THREE.Group();
  private readonly points: THREE.PointLight[] = [];
  constructor(scene: THREE.Scene) {
    this.root.name = 'cultivation-shader-light-padding';
    for (let i = 0; i < 17; i++) this.points.push(new THREE.PointLight(0, 0));
    this.root.add(...this.points); scene.add(this.root); this.sync(scene);
  }
  sync(scene: THREE.Scene): void {
    this.root.visible = false;
    let points = 0, searchlights = false;
    scene.traverseVisible(o => {
      if (o instanceof THREE.PointLight && !o.castShadow) points++;
      if (o instanceof THREE.SpotLight && o.castShadow) searchlights = true;
    });
    // Keep compatible small layouts without inflating the elevator's two lights
    // to the seventeen needed by Room 3. Zero-radiance slots still cost GPU work.
    // Room 5 keeps the same layout when the two elevator lights leave view.
    const target = searchlights ? Math.max(9, points) : [2, 8, 17].find(count => count >= points) ?? points;
    this.points.forEach((light, i) => light.visible = i < Math.max(0, target - points));
    this.root.visible = true;
  }
  dispose(): void { this.root.removeFromParent(); }
}
