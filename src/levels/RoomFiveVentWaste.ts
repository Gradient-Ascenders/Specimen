import * as THREE from 'three';

/** Shared shoreline for rendering and acid contact, so dry corners stay safe. */
export class RoomFiveVentWaste {
  readonly outline: THREE.Vector2[] = [];
  readonly x: number;
  readonly z: number;
  constructor(x: number, z: number, width: number, length: number, seed: number, pooled = false) {
    this.x = x; this.z = z;
    if (pooled) {
      // Wall-bound flooded stretches meet exactly at the duct corner.
      this.outline.push(new THREE.Vector2(-width / 2, -length / 2), new THREE.Vector2(width / 2, -length / 2),
        new THREE.Vector2(width / 2, length / 2), new THREE.Vector2(-width / 2, length / 2));
      if (seed === 6) {
        this.outline.pop(); this.outline.shift();
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          this.outline.push(new THREE.Vector2(-width / 2 + .23 + .19 * Math.sin(t * 13) + .09 * Math.sin(t * 29), length * (.5 - t)));
        }
      }
    } else {
      for (let i = 0; i < 64; i++) {
        const a = i * Math.PI * 2 / 64;
        const r = .86 + .075 * Math.sin(a * 3 + seed * 1.7) + .045 * Math.cos(a * 5 - seed);
        this.outline.push(new THREE.Vector2(Math.cos(a) * width / 2 * r, Math.sin(a) * length / 2 * r));
      }
    }
  }
  createMesh(material: THREE.Material, index: number): THREE.Mesh {
    const geometry = new THREE.ShapeGeometry(new THREE.Shape(this.outline.map(p => new THREE.Vector2(p.x, -p.y))));
    // Shape XY becomes floor XZ, with the front face pointing upwards.
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `room-5-vent-acid-${index}`;
    mesh.position.set(this.x, .2195, this.z);
    mesh.userData.textureRole = 'acid-floor';
    return mesh;
  }
  contains(x: number, z: number): boolean {
    x -= this.x; z -= this.z;
    let inside = false;
    for (let i = 0, j = this.outline.length - 1; i < this.outline.length; j = i++) {
      const a = this.outline[i], b = this.outline[j];
      if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
}
