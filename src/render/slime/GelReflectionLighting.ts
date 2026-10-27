import * as THREE from 'three';
import type { Vector3State } from './SlimePresentationContract.ts';

/** Bounded reflection fill from existing local lights; owns no environment map.
 * Register the final level hierarchy once, then sample each character's position. */
export class GelReflectionLighting {
  private readonly lights: (THREE.PointLight | THREE.SpotLight)[] = [];
  private readonly position = new THREE.Vector3();
  private readonly fromLight = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  constructor(scene: THREE.Object3D) {
    scene.traverse(object => {
      if (object instanceof THREE.PointLight || object instanceof THREE.SpotLight) this.lights.push(object);
    });
  }

  weightAt(position: Vector3State): number {
    let illumination = 0;
    for (const light of this.lights) {
      if (light.intensity <= 0) continue;
      let visible = true;
      for (let ancestor: THREE.Object3D | null = light; ancestor; ancestor = ancestor.parent) {
        if (!ancestor.visible) { visible = false; break; }
      }
      if (!visible) continue;
      light.getWorldPosition(this.position);
      this.fromLight.set(position.x, position.y, position.z).sub(this.position);
      const distance = this.fromLight.length();
      if (light.distance > 0 && distance >= light.distance) continue;
      let cone = 1;
      if (light instanceof THREE.SpotLight) {
        light.target.getWorldPosition(this.target);
        this.target.sub(this.position).normalize();
        const cosine = distance > 1e-6 ? this.fromLight.dot(this.target) / distance : 1;
        cone = light.penumbra > 0
          ? THREE.MathUtils.smoothstep(cosine, Math.cos(light.angle), Math.cos(light.angle * (1 - light.penumbra)))
          : cosine >= Math.cos(light.angle) ? 1 : 0;
      }
      const cutoff = light.distance > 0 ? (1 - (distance / light.distance) ** 4) ** 2 : 1;
      illumination += cone * cutoff * light.intensity / (1 + distance ** light.decay);
    }
    return THREE.MathUtils.clamp(illumination * 0.4, 0, 1);
  }
}
