import * as THREE from 'three';
import { CollisionHit, CollisionLayer, type CollisionWorld } from '../../physics/CollisionWorld.ts';
import type { SlimeMaterial } from './SlimeMaterial.ts';

/** Small scene-light approximation for the existing handwritten slime shader. */
export class SlimeLightSampler {
  readonly sources: { light: THREE.PointLight | THREE.SpotLight; ignored?: THREE.Mesh }[] = [];
  private readonly position = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly keyDirection = new THREE.Vector3();
  private readonly key = new THREE.Color();
  private readonly fill = new THREE.Color();
  private readonly contribution = new THREE.Color();
  private readonly hit = new CollisionHit();
  apply(material: SlimeMaterial, body: THREE.Vector3, world: CollisionWorld): void {
    let strongest = 0;
    this.key.setRGB(0, 0, 0); this.fill.setRGB(.004, .006, .005); this.keyDirection.set(0, 1, 0);
    for (const { light, ignored } of this.sources) {
      let visible = true;
      for (let node: THREE.Object3D | null = light; node; node = node.parent) if (!node.visible) { visible = false; break; }
      if (!visible || light.intensity <= 0) continue;
      light.getWorldPosition(this.position); this.delta.copy(body).sub(this.position);
      const distance = this.delta.length();
      if (distance < .001 || (light.distance > 0 && distance >= light.distance)) continue;
      let weight = light.intensity / Math.max(1, Math.pow(distance, light.decay));
      if (light.distance > 0) weight *= Math.pow(Math.max(0, 1 - Math.pow(distance / light.distance, 4)), 2);
      if (light instanceof THREE.SpotLight) {
        light.target.getWorldPosition(this.target); this.forward.copy(this.target).sub(this.position).normalize();
        const cosine = this.forward.dot(this.delta) / distance;
        weight *= THREE.MathUtils.smoothstep(cosine, Math.cos(light.angle), Math.cos(light.angle * (1 - light.penumbra)));
      }
      if (weight < .001 || world.sweepSphere(this.position, this.delta, .01, this.hit, CollisionLayer.LineOfSight, ignored)) continue;
      const luminance = weight * (.2126 * light.color.r + .7152 * light.color.g + .0722 * light.color.b);
      if (luminance > strongest) {
        this.fill.add(this.contribution.copy(this.key).multiplyScalar(.12));
        strongest = luminance; this.key.copy(light.color).multiplyScalar(weight);
        this.keyDirection.copy(this.delta).multiplyScalar(-1 / distance);
      } else this.fill.add(this.contribution.copy(light.color).multiplyScalar(weight * .12));
    }
    material.setEnvironmentLighting(this.keyDirection, this.key, this.fill);
  }
}
