import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Sparse maintenance lamps; stable light slots and no additional shadow maps. */
export class CultivationSewerLighting {
  readonly root = new THREE.Group();
  private readonly lamps: { light: THREE.PointLight; bulb: THREE.MeshStandardMaterial; intensity: number }[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private elapsed = 0;
  private disposed = false;

  constructor(parent: THREE.Group, maps?: { bumpMap: THREE.Texture | null; roughnessMap: THREE.Texture | null }) {
    this.root.name = 'room-5-sewer-maintenance-lighting';
    this.root.userData.presentationOnly = true;
    const iron = new THREE.MeshStandardMaterial({ color: 0x353b2c, roughness: .94, metalness: .25,
      bumpMap: maps?.bumpMap ?? null, roughnessMap: maps?.roughnessMap ?? null, bumpScale: .015 });
    this.materials.push(iron);
    // The entry and far bank get small pools of light. Neither reaches the
    // dormant drone at z=70; the existing controls guide the final approach.
    for (const [i, spec] of [
      { x: 48.1, z: 34, color: 0xa6b68a, intensity: 2.6, reach: 25 },
      { x: 31.9, z: 102, color: 0xb9aa7d, intensity: 2.1, reach: 26 },
    ].entries()) {
      const fixture = new THREE.Group(); fixture.name = `room-5-sewer-caged-lamp-${i}`;
      fixture.position.set(spec.x, -6.8, spec.z);
      fixture.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(spec.x > 40 ? -.84 : .84, -.54, 0).normalize());
      this.root.add(fixture);
      const pieces = [new THREE.BoxGeometry(.78, 1.08, .12)];
      for (const x of [-.34, .34]) pieces.push(new THREE.BoxGeometry(.1, 1.02, .18).translate(x, 0, .165));
      for (const y of [-.46, .46]) pieces.push(new THREE.BoxGeometry(.55, .1, .18).translate(0, y, .165));
      for (const y of [-.22, 0, .22]) pieces.push(new THREE.BoxGeometry(.55, .035, .04).translate(0, y, .23));
      const cage = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose()); this.geometries.push(cage);
      fixture.add(new THREE.Mesh(cage, iron));
      const bulb = new THREE.MeshStandardMaterial({ color: 0x90917d, emissive: spec.color, emissiveIntensity: .55, roughness: .65 });
      this.materials.push(bulb);
      const glass = new THREE.BoxGeometry(.52, .79, .07); this.geometries.push(glass);
      const lens = new THREE.Mesh(glass, bulb); lens.position.z = .105; fixture.add(lens);
      const light = new THREE.PointLight(spec.color, spec.intensity, spec.reach, 1);
      light.name = `room-5-sewer-maintenance-spill-${i}`;
      light.position.z = .38; light.castShadow = false; fixture.add(light);
      this.lamps.push({light, bulb, intensity: spec.intensity});
    }
    parent.add(this.root); this.update(0);
  }

  update(dt: number): void {
    this.elapsed += dt;
    for (const [i, lamp] of this.lamps.entries()) {
      const t = (this.elapsed + i * 3.4) % 19;
      const sag = THREE.MathUtils.smoothstep(t, 7.2, 7.5) * (1 - THREE.MathUtils.smoothstep(t, 8.3, 9.5));
      const tremor = .035 * Math.sin(this.elapsed * 2.1 + i) * Math.sin(this.elapsed * 3.7 + 2 * i);
      const power = 1 - (i === 1 ? .82 : .24) * sag + tremor;
      lamp.light.intensity = lamp.intensity * power;
      lamp.bulb.emissiveIntensity = .55 * power;
    }
  }

  reset(): void { this.elapsed = 0; this.update(0); }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.root.removeFromParent();
    for (const lamp of this.lamps) lamp.light.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
