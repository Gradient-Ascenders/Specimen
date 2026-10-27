import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeShadowLight } from '../../ShadowLightResources.ts';

/** Fixed service fittings: route markers and gentle, fixture-motivated rim
 * light. All geometry is visual only; the existing light selector owns cost. */
export class CultivationDarkAreaLighting {
  readonly root = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private disposed = false;

  constructor(parent: THREE.Group) {
    this.root.name = 'room-5-dark-area-service-fittings';
    this.root.userData.presentationOnly = true;
    const housing = new THREE.MeshStandardMaterial({ name: 'cultivation-service-lamp-housing',
      color: 0x3b403e, metalness: .35, roughness: .84 });
    const lens = (name: string, colour: number) => new THREE.MeshStandardMaterial({
      name: `cultivation-service-${name}-practical`, color: colour, emissive: colour,
      emissiveIntensity: .65, roughness: .55,
    });
    const cool = lens('cool', 0xbacede), amber = lens('amber', 0xd5ad72);
    this.materials.push(housing, cool, amber);
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const box = (material: THREE.Material, size: [number, number, number], at: [number, number, number], rotation = 0) => {
      const geometry = new THREE.BoxGeometry(...size).rotateZ(rotation).translate(...at);
      const list = parts.get(material) ?? []; list.push(geometry); parts.set(material, list);
    };
    // Surface-mounted arrows sit in front of the fork's rear wall, with real
    // thickness and separation between backing, lens and wall.
    for (const side of [-1, 1]) for (const distance of [2.4, 4.4]) {
      const x = side * distance, material = side < 0 ? cool : amber;
      box(housing, [.64, .24, .05], [x, .48, 10.15]);
      const shape = new THREE.Shape();
      for (const [i, [px, py]] of [[-.23, -.025], [.04, -.025], [.04, -.09], [.24, 0],
        [.04, .09], [.04, .025], [-.23, .025]].entries()) {
        if (i === 0) shape.moveTo(side * px, py); else shape.lineTo(side * px, py);
      }
      shape.closePath();
      const arrow = new THREE.ExtrudeGeometry(shape, { depth: .018, bevelEnabled: false }).translate(x, .48, 10.104);
      const list = parts.get(material) ?? []; list.push(arrow); parts.set(material, list);
    }
    // Small wall fittings illuminate the sides and backs of the elevated
    // route. Short ranges retain the chamber's dark central volume.
    for (const [i, [side, y, z]] of [
      [-1, 12, 37], [1, 18, 57], [-1, 26, 50], [1, 31, 35],
    ].entries()) {
      if (i === 3) {
        box(housing, [1.12, .18, .34], [0, 37.62, 37]);
        box(cool, [.82, .035, .11], [0, 37.51, 37]);
      } else {
        box(housing, [.18, .34, 1.12], [side * 19.62, y, z]);
        box(cool, [.035, .11, .82], [side * 19.51, y, z]);
      }
      const light = new THREE.PointLight(0xc3d1db, i === 2 ? 24 : 16, i === 2 ? 21 : 14, 2);
      light.name = `room-5-chamber-service-rim-${i}`;
      if (i === 3) light.position.set(0, 37.25, 37); else light.position.set(side * 19.25, y, z);
      light.castShadow = false; this.root.add(light); this.lights.push(light);
    }
    for (const [material, pieces] of parts) {
      const sources = pieces.map(piece => piece.index ? piece.toNonIndexed() : piece);
      const geometry = mergeGeometries(sources)!;
      for (const piece of new Set([...pieces, ...sources])) piece.dispose();
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${this.root.name}-${material.name}`;
      mesh.castShadow = material === housing; mesh.receiveShadow = true;
      mesh.userData.presentationOnly = true; this.root.add(mesh);
    }
    parent.add(this.root);
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.root.removeFromParent();
    for (const light of this.lights) disposeShadowLight(light);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.root.clear();
  }
}
