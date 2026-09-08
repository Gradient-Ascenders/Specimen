import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Level 1 platform silhouette, attached to the existing collider for moving decks. */
export class CultivationPlatformArt {
  readonly hidden = new THREE.MeshStandardMaterial({ visible: false });
  readonly frame = new THREE.MeshStandardMaterial({ color: 0x23292b, roughness: 0.5, metalness: 0.58 });
  readonly metal = new THREE.MeshStandardMaterial({ color: 0x626c70, roughness: 0.5, metalness: 0.62 });
  readonly warning = new THREE.MeshStandardMaterial({ color: 0xdca51c, roughness: 0.48 });
  private readonly roots: THREE.Group[] = [];
  private readonly tread: THREE.MeshStandardMaterial;
  constructor(tread: THREE.MeshStandardMaterial) { this.tread = tread; }

  add(platform: THREE.Mesh): void {
    const { width: w, height: h, depth: d } = (platform.geometry as THREE.BoxGeometry).parameters;
    const root = new THREE.Group();
    root.name = `${platform.name}-level-one-platform-art`;
    root.userData.presentationOnly = true;
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const box = (material: THREE.Material, size: [number, number, number], position: [number, number, number], radius = 0.025) => {
      const geometry = new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(n => n / 3)));
      geometry.translate(...position);
      const group = parts.get(material) ?? []; group.push(geometry); parts.set(material, group);
    };
    const top = h / 2;
    box(this.tread, [w - 0.06, 0.16, d - 0.06], [0, top - 0.08, 0], 0.06);
    box(this.frame, [w + 0.08, 0.18, d + 0.08], [0, top - 0.23, 0], 0.055);
    for (const offset of [-0.3, 0.3]) {
      box(this.frame, [w * 0.76, 0.2, 0.2], [0, -h / 2 - 0.18, d * offset]);
      box(this.frame, [0.2, 0.2, d * 0.76], [w * offset, -h / 2 - 0.18, 0]);
      box(this.warning, [w * 0.28, 0.018, 0.11], [w * offset, top + 0.005, -d / 2 + 0.12], 0.01);
      for (const z of [-0.24, 0.24]) box(this.metal, [0.11, 0.4, 0.11], [w * offset, -h / 2 - 0.38, d * z]);
    }
    box(this.metal, [w * 0.82, 0.14, 0.26], [0, -h / 2 - 0.34, 0]);
    box(this.metal, [0.26, 0.14, d * 0.82], [0, -h / 2 - 0.34, 0]);
    const socket = new THREE.CylinderGeometry(Math.min(w, d) * 0.13, Math.min(w, d) * 0.13, 0.24, 12);
    socket.translate(0, -h / 2 - 0.48, 0);
    parts.get(this.metal)!.push(socket.toNonIndexed());
    socket.dispose();
    for (const [material, geometries] of parts) {
      const merged = mergeGeometries(geometries);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) throw new Error('Unable to create platform presentation.');
      const mesh = new THREE.Mesh(merged, material);
      mesh.userData.presentationOnly = true;
      root.add(mesh);
    }
    platform.add(root);
    this.roots.push(root);
  }

  /** Preserve clipped safe-deck outlines rather than filling their removed corners. */
  addClipped(platform: THREE.Mesh): void {
    const root = new THREE.Group(); root.name = platform.name + '-level-one-platform-art';
    root.userData.presentationOnly = true;
    for (const [material, scale, offset] of [[this.tread, .32, 0], [this.frame, .36, -.16]] as const) {
      const geometry = platform.geometry.clone(); geometry.scale(1, scale, 1); geometry.translate(0, offset, 0);
      root.add(new THREE.Mesh(geometry, material));
    }
    for (const x of [-.6, .6]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.16, .2, 1.8), this.frame); rail.position.set(x, -.48, 0); root.add(rail);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(.55, .018, .11), this.warning); mark.position.set(x, .005, -.65); root.add(mark);
    }
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .24, 12), this.metal); socket.position.y = -.65; root.add(socket);
    platform.add(root); this.roots.push(root);
  }

  /** Combine stationary Room 3 decks; moving Room 1/2 decks retain local children. */
  batchStatic(root: THREE.Group, cellSize?: number): void {
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const parts = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    const groups = this.roots.filter(group => { for (let p = group.parent; p; p = p.parent) if (p === root) return true; return false; });
    for (const group of groups) {
      const position = group.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
      const cell = cellSize ? [position.x, position.y, position.z].map(n => Math.floor(n / cellSize)).join(',') : 'room';
      for (const child of group.children as THREE.Mesh[]) {
        const material = child.material as THREE.Material;
        const key = material.uuid + cell;
        const part = parts.get(key) ?? {material, geometries: []};
        const geometries = part.geometries;
        let copy = child.geometry.clone();
        if (copy.index) { const indexed = copy; copy = indexed.toNonIndexed(); indexed.dispose(); }
        if (!copy.getAttribute('uv')) {
          const positions = copy.getAttribute('position'), uv = new Float32Array(positions.count * 2);
          for (let i = 0; i < positions.count; i++) { uv[i * 2] = positions.getX(i) / 5; uv[i * 2 + 1] = positions.getZ(i) / 5; }
          copy.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }
        geometries.push(copy.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld)));
        parts.set(key, part);
        child.geometry.dispose();
      }
      group.clear(); group.removeFromParent();
    }
    const batch = new THREE.Group(); batch.name = 'cultivation-static-platform-art'; batch.userData.presentationOnly = true;
    for (const {material, geometries} of parts.values()) {
      const geometry = mergeGeometries(geometries)!;
      geometries.forEach(g => g.dispose()); batch.add(new THREE.Mesh(geometry, material));
    }
    root.add(batch); this.roots.push(batch);
  }

  dispose(): void {
    for (const root of this.roots) {
      root.removeFromParent(); root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    }
    this.roots.length = 0;
    for (const material of [this.hidden, this.frame, this.metal, this.warning]) material.dispose();
  }
}
