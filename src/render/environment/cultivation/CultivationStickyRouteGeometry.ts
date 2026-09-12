import * as THREE from 'three';

type Rect = { left: number; right: number; bottom: number; top: number };
type Edge = readonly [number, number, number, number];
const ordered = (values: number[]) => [...new Set(values.map(v => Number(v.toFixed(5))))].sort((a, b) => a - b);

/** One render skin for the coplanar Room 2 route. Original boxes remain the colliders. */
export function createCultivationStickyRouteGeometry(panels: readonly THREE.Mesh<THREE.BoxGeometry>[]): THREE.BufferGeometry {
  const rectangles: Rect[] = panels.map(panel => {
    const { height, depth } = panel.geometry.parameters;
    return { left: panel.position.z - depth / 2, right: panel.position.z + depth / 2,
      bottom: panel.position.y - height / 2, top: panel.position.y + height / 2 };
  });
  const inside = (u: number, v: number) => rectangles.some(r => u > r.left && u < r.right && v > r.bottom && v < r.top);
  const us = ordered(rectangles.flatMap(r => [r.left, r.right]));
  const vs = ordered(rectangles.flatMap(r => [r.bottom, r.top]));
  const edges: Edge[] = [];
  const occupied = (i: number, j: number) => i >= 0 && j >= 0 && i < us.length - 1 && j < vs.length - 1 &&
    inside((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2);
  for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) {
    if (!occupied(i, j)) continue;
    const u = us[i], U = us[i + 1], v = vs[j], V = vs[j + 1];
    if (!occupied(i - 1, j)) edges.push([u, v, u, V]);
    if (!occupied(i + 1, j)) edges.push([U, V, U, v]);
    if (!occupied(i, j - 1)) edges.push([U, v, u, v]);
    if (!occupied(i, j + 1)) edges.push([u, V, U, V]);
  }
  const distance = (u: number, v: number) => Math.min(...edges.map(([a, b, c, d]) => {
    const t = THREE.MathUtils.clamp(((u - a) * (c - a) + (v - b) * (d - b)) / ((c - a) ** 2 + (d - b) ** 2), 0, 1);
    return Math.hypot(u - a - t * (c - a), v - b - t * (d - b));
  }));
  // Extra cuts only at the rim widths keep its distance field crisp without a
  // full-resolution grid or a fragment shader that loops over the outline.
  const cuts = (values: number[]) => ordered(values.flatMap(v => [v - .32, v - .15, v - .09, v, v + .09, v + .15, v + .32]));
  const uCuts = cuts(us), vCuts = cuts(vs);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], membrane: number[] = [];
  const x = panels[0].position.x, halfWidth = panels[0].geometry.parameters.width / 2;
  const vertex = (point: THREE.Vector3, normal: THREE.Vector3, edgeDistance: number) => {
    positions.push(...point.toArray()); normals.push(...normal.toArray());
    uvs.push((Math.abs(normal.x) > .5 ? -normal.x * point.z : normal.z * point.x) / 8, point.y / 8);
    // The material's minimum-of-four distances also accepts a baked union
    // distance, so no artificial border appears on the tessellation edges.
    membrane.push(edgeDistance, 100, 200, 200);
  };
  const quad = (points: THREE.Vector3[], normal: THREE.Vector3, distances: number[]) => {
    const facing = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).dot(normal);
    for (const i of facing > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) vertex(points[i], normal, distances[i]);
  };
  for (let i = 0; i < uCuts.length - 1; i++) for (let j = 0; j < vCuts.length - 1; j++) {
    const u = uCuts[i], U = uCuts[i + 1], v = vCuts[j], V = vCuts[j + 1];
    if (!inside((u + U) / 2, (v + V) / 2)) continue;
    const corners = [[u, v], [U, v], [U, V], [u, V]];
    const distances = corners.map(([a, b]) => distance(a, b));
    for (const side of [-1, 1]) quad(corners.map(([a, b]) => new THREE.Vector3(x + side * halfWidth, b, a)),
      new THREE.Vector3(side, 0, 0), distances);
  }
  // Only exterior side faces remain; overlapping box sides are removed too.
  for (const [u, v, U, V] of edges) {
    const normal = new THREE.Vector3(0, U - u, v - V).normalize();
    quad([new THREE.Vector3(x - halfWidth, v, u), new THREE.Vector3(x + halfWidth, v, u),
      new THREE.Vector3(x + halfWidth, V, U), new THREE.Vector3(x - halfWidth, V, U)], normal, [0, 0, 0, 0]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('membranePanel', new THREE.Float32BufferAttribute(membrane, 4));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
