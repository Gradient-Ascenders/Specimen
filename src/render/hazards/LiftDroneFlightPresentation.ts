import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DissolveTarget } from '../../abilities/DissolveTarget.ts';
import type { SecurityDronePresentation, SecurityDronePresentationResources } from './SecurityDronePresentation.ts';

/** Shared low-poly engines, with target-owned highlight uniforms on visible armor. */
export class LiftDroneFlightPresentation {
  private readonly hardware = new THREE.Group();
  private readonly flames: THREE.Mesh;
  private readonly bindings: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  private readonly highlights = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  private readonly mounts: THREE.Object3D[] = [];
  private readonly presentation: SecurityDronePresentation;
  private readonly phase: number;
  private elapsed = 0;
  private disposed = false;

  constructor(presentation: SecurityDronePresentation,
    resources: SecurityDronePresentationResources, flameMaterial: THREE.MeshBasicMaterial,
    target: DissolveTarget, phase: number) {
    this.presentation = presentation; this.phase = phase;
    // Free-flying drones do not retain the ceiling sentry's mounting bracket.
    for (const part of presentation.root.children) {
      if (part.name.endsWith('-mount') || part.name.endsWith('-linkage')) {
        this.mounts.push(part); part.visible = false;
      }
    }
    this.hardware.name = 'lift-drone-flight-hardware';
    this.hardware.userData.presentationOnly = true;
    const housings = resources.geometry('lift-engine-housings', () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        parts.push(new THREE.CylinderGeometry(.105, .13, .24, 10, 1, true).translate(side * .56, -.10, .18));
        parts.push(new THREE.TorusGeometry(.118, .025, 5, 10).rotateX(Math.PI / 2).translate(side * .56, -.22, .18));
      }
      const merged = mergeGeometries(parts, false)!;
      for (const part of parts) part.dispose();
      return merged;
    });
    this.hardware.add(new THREE.Mesh(housings, resources.material('mechanism')));
    presentation.root.add(this.hardware);
    // Clone each finish once per drone, not per part. Existing aim visibility,
    // selection, burn timing and reset all drive the same uniform objects.
    presentation.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const replace = (material: THREE.Material): THREE.Material => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return material;
        let highlighted = this.highlights.get(material);
        if (!highlighted) {
          highlighted = target.createCorrosionMaterial(material);
          this.highlights.set(material, highlighted);
        }
        return highlighted;
      };
      this.bindings.push({ mesh: object, material: object.material });
      object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
    });
    const flameGeometry = resources.geometry('lift-engine-flames', () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) for (const core of [false, true]) {
        const geometry = new THREE.ConeGeometry(core ? .047 : .085, core ? .65 : 1, 8)
          .rotateZ(Math.PI).translate(side * .56, core ? -.325 : -.5, .18);
        const colour = new THREE.Color(core ? 0xcaf8ff : 0xff8b32);
        const colours = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < colours.length; i += 3) colour.toArray(colours, i);
        geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        parts.push(geometry);
      }
      const merged = mergeGeometries(parts, false)!;
      for (const part of parts) part.dispose();
      return merged;
    });
    this.flames = new THREE.Mesh(flameGeometry, flameMaterial);
    this.flames.name = 'lift-drone-booster-flames';
    this.flames.position.y = -.225;
    this.hardware.add(this.flames);
    this.reset();
  }

  update(dt: number, powered: boolean, descending: boolean): void {
    this.elapsed += dt;
    this.flames.visible = powered;
    this.presentation.root.position.y = powered ? Math.sin(this.elapsed * 3 + this.phase) * .035 : 0;
    if (!powered) return;
    this.flames.scale.y = (descending ? .32 : .46) + Math.sin(this.elapsed * 37 + this.phase) * .045;
  }

  reset(): void {
    this.elapsed = 0;
    this.flames.visible = false;
    this.presentation.root.position.y = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const binding of this.bindings) binding.mesh.material = binding.material;
    for (const material of this.highlights.values()) material.dispose();
    this.highlights.clear(); this.bindings.length = 0;
    for (const mount of this.mounts) mount.visible = true;
    this.hardware.removeFromParent();
    this.presentation.root.position.y = 0;
  }
}
