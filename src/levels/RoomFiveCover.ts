import * as THREE from 'three';
import type { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';

interface Point { x: number; z: number }
interface Plane { x: number; z: number; d: number; colour?: number; route?: number }
function clip(polygon: Point[], plane: Plane): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], c = polygon[(i + 1) % polygon.length];
    const da = a.x * plane.x + a.z * plane.z - plane.d, dc = c.x * plane.x + c.z * plane.z - plane.d;
    if (da <= 1e-8) result.push(a);
    if ((da < 0) !== (dc < 0)) {
      const t = da / (da - dc); result.push({ x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t });
    }
  }
  return result;
}
function prism(points: Point[], bottom: number, top: number): THREE.BufferGeometry {
  const vertices: number[] = [], indices: number[] = [];
  for (const y of [bottom, top]) for (const p of points) vertices.push(p.x, y, p.z);
  const n = points.length;
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i, i + 1, n, n + i + 1, n + i);
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; indices.push(i, n + i, j, j, n + i, n + j); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices);
  geometry.computeVertexNormals(); return geometry;
}

/** A single clipped deck and mitred cover, with conservative box-strip collision. */
export function addRoomFiveCover(b: GreyboxRoomBuilder, index: number, station: readonly number[],
  covers: readonly { x: number; z: number; colour: number; route: number }[]): void {
  const [x, y, z] = station;
  const planes: Plane[] = [
    { x: 1, z: 0, d: 2.5 }, { x: -1, z: 0, d: 2.5 },
    { x: 0, z: 1, d: 2.5 }, { x: 0, z: -1, d: 2.5 },
    ...covers.map(c => ({ ...c, d: 1.525 })),
  ];
  let polygon: Point[] = [{ x: -2.5, z: -2.5 }, { x: 2.5, z: -2.5 }, { x: 2.5, z: 2.5 }, { x: -2.5, z: 2.5 }];
  for (const plane of planes) polygon = clip(polygon, plane);
  const floor = new THREE.Mesh(prism(polygon, -.5, 0), b.materials.support);
  floor.name = `room-5-safe-${index}-deck`; floor.position.set(x, y, z); b.root.add(floor);
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  // Do not register the polygon's bounding box: it would recreate the removed corners.
  for (let strip = 0; strip < 40; strip++) {
    const left = -2.5 + strip * .125, right = left + .125;
    let lo = -2.5, hi = 2.5, valid = true;
    for (const plane of planes) {
      const worst = Math.max(plane.x * left, plane.x * right);
      if (Math.abs(plane.z) < 1e-8) { if (worst > plane.d + 1e-8) valid = false; }
      else if (plane.z > 0) hi = Math.min(hi, (plane.d - worst) / plane.z);
      else lo = Math.max(lo, (plane.d - worst) / plane.z);
    }
    if (!valid || hi <= lo) continue;
    const mesh = b.addCollider({ name: `room-5-safe-${index}-floor`, size: [.125, .5, hi - lo],
      position: [x + (left + right) / 2, y - .25, z + (lo + hi) / 2], material: hidden });
    mesh.name += `-strip-${strip}`; mesh.userData.safeStation = index;
  }
  const outer = polygon.map(p => {
    const boundaries = planes.filter(plane => Math.abs(plane.x * p.x + plane.z * p.z - plane.d) < 1e-6);
    const a = boundaries[0], c = boundaries[1];
    if (!a || !c) return p;
    const ad = a.d + (a.colour === undefined ? 0 : .25), cd = c.d + (c.colour === undefined ? 0 : .25);
    const determinant = a.x * c.z - c.x * a.z;
    if (Math.abs(determinant) < 1e-8) return p;
    return { x: (ad * c.z - cd * a.z) / determinant, z: (a.x * cd - c.x * ad) / determinant };
  });
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length, a = polygon[i], c = polygon[j];
    const plane = planes.find(p => p.colour !== undefined &&
      Math.abs(p.x * a.x + p.z * a.z - p.d) < 1e-6 && Math.abs(p.x * c.x + p.z * c.z - p.d) < 1e-6);
    if (!plane) continue;
    const footprint = [a, c, outer[j], outer[i]];
    // Keep winding consistent for the prism's outward-facing faces.
    const area = footprint.reduce((sum, p, k) => { const next = footprint[(k + 1) % footprint.length]; return sum + p.x * next.z - next.x * p.z; }, 0);
    if (area < 0) footprint.reverse();
    const panel = new THREE.Mesh(prism(footprint, 0, 3.2), b.materials.support);
    panel.name = `room-5-safe-${index}-network-${plane.route}-baffle`; panel.position.set(x, y, z); b.root.add(panel);
    const collider = b.addCollider({ name: `${panel.name}-collision`,
      size: [Math.hypot(c.x - a.x, c.z - a.z), 3.2, .25],
      position: [x + (a.x + c.x) / 2 + plane.x * .125, y + 1.6, z + (a.z + c.z) / 2 + plane.z * .125], material: hidden });
    collider.rotation.y = Math.atan2(plane.x, plane.z);
  }
  // Suspend from points that actually lie on the carved deck.
  for (const [i, point] of polygon.entries()) {
    const px = x + point.x * .86, pz = z + point.z * .86;
    b.addVisualBox({ name: `room-5-safe-${index}-suspension-${i}`, size: [.1, 38 - y, .1],
      position: [px, (38 + y) / 2, pz], material: b.materials.cable });
  }
}
