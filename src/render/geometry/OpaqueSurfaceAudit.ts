import * as THREE from 'three';

export interface SurfaceTriangle {
  owner: string;
  mesh: THREE.Mesh;
  instance: number;
  materialIndex: number;
  material: THREE.Material;
  points: THREE.Vector3[];
  normal: THREE.Vector3;
  plane: number;
  axis: number;
  min: number[];
  max: number[];
  triangle: number;
}
export interface SurfaceConflict {
  first: string;
  second: string;
  triangles: number;
  area: number;
  separation: number;
  centre: number[];
  normal: number[];
  firstTriangle: number;
  secondTriangle: number;
  firstMaterial: string;
  secondMaterial: string;
}

/** Inspect submitted triangles, including material groups, instances and same-batch overlaps. */
export function collectOpaqueTriangles(root: THREE.Object3D): SurfaceTriangle[] {
  root.updateWorldMatrix(true, true);
  const triangles: SurfaceTriangle[] = [];
  root.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const ranges = Array.isArray(object.material) ? geometry.groups : [{ start: 0, count: geometry.index?.count ?? position.count, materialIndex: 0 }];
    const instance = new THREE.Matrix4(), matrix = new THREE.Matrix4();
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    for (let k = 0; k < count; k++) {
      matrix.copy(object.matrixWorld);
      if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(k, instance); matrix.multiply(instance); }
      const path: string[] = [];
      for (let parent: THREE.Object3D | null = object; parent && parent !== root; parent = parent.parent) path.unshift(parent.name || parent.type);
      const owner = path.join('/') + (object instanceof THREE.InstancedMesh ? `[${k}]` : '');
      for (const range of ranges) {
        const material = materials[range.materialIndex ?? 0];
        if (!material?.visible || material.transparent || material.opacity < 1 || !material.colorWrite || !material.depthTest) continue;
        const start = Math.max(range.start, geometry.drawRange.start);
        const end = Math.min(range.start + range.count, geometry.drawRange.start + geometry.drawRange.count, geometry.index?.count ?? position.count);
        for (let i = start; i + 2 < end; i += 3) {
          const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(position, geometry.index?.getX(i + j) ?? i + j).applyMatrix4(matrix));
          const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
          if (normal.lengthSq() < 1e-16) continue;
          normal.normalize();
          if (matrix.determinant() < 0) normal.negate();
          if (material.side === THREE.BackSide) normal.negate();
          const axis = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)].indexOf(Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)));
          triangles.push({owner, mesh: object, instance: k, materialIndex: range.materialIndex ?? 0, material, points, normal, plane: normal.dot(points[0]), axis,
            min: [0, 1, 2].map(a => Math.min(...points.map(p => p.getComponent(a)))),
            max: [0, 1, 2].map(a => Math.max(...points.map(p => p.getComponent(a)))), triangle: i / 3});
        }
      }
    }
  });
  return triangles;
}

type Point = readonly [number, number];
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function overlap(a: SurfaceTriangle, b: SurfaceTriangle): Point[] {
  const axes = [0, 1, 2].filter(axis => axis !== a.axis);
  const project = (p: THREE.Vector3): Point => [p.getComponent(axes[0]), p.getComponent(axes[1])];
  let polygon = a.points.map(project);
  const clip = b.points.map(project);
  const sign = Math.sign(cross(clip[0], clip[1], clip[2]));
  for (let i = 0; i < 3 && polygon.length; i++) {
    const p = clip[i], q = clip[(i + 1) % 3], output: Point[] = [];
    for (let j = 0; j < polygon.length; j++) {
      const from = polygon[j], to = polygon[(j + 1) % polygon.length];
      const d1 = sign * cross(p, q, from), d2 = sign * cross(p, q, to);
      if (d1 >= 0) output.push(from);
      if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
        const t = d1 / (d1 - d2);
        output.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
      }
    }
    polygon = output;
  }
  return polygon;
}

/** Positive-area intersections only; shared edges and opposite opaque front faces cannot fight. */
export function findOpaqueSurfaceOverlaps(triangles: readonly SurfaceTriangle[], tolerance: number, visit: (a: SurfaceTriangle, b: SurfaceTriangle, area: number, separation: number, centre: THREE.Vector3) => void): void {
  const buckets = new Map<string, SurfaceTriangle[]>();
  for (const triangle of triangles) {
    // Canonicalise the normal for the broad phase; check sidedness below.
    const n = triangle.normal.clone(); if (n.getComponent(triangle.axis) < 0) n.negate();
    const key = n.toArray().map(v => Math.round(v * 10000)).join(',');
    const list = buckets.get(key) ?? []; list.push(triangle); buckets.set(key, list);
  }
  // Plane-interval clustering avoids comparing every horizontal face in the
  // level against every other one. Project extents, not just a rounded plane
  // constant, so slight normal differences cannot drop a nearby candidate.
  // Search neighbouring normal bins too: nearly parallel faces can straddle a
  // quantisation boundary. Union only bins inside the actual angular tolerance.
  const keys = [...buckets.keys()], parents = keys.map((_, i) => i);
  const indices = new Map(keys.map((key, i) => [key, i]));
  const leader = (i: number): number => parents[i] === i ? i : (parents[i] = leader(parents[i]));
  for (const [i, key] of keys.entries()) {
    const [x, y, z] = key.split(',').map(Number), a = buckets.get(key)![0];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      const j = indices.get(`${x + dx},${y + dy},${z + dz}`);
      if (j === undefined || j <= i) continue;
      const b = buckets.get(keys[j])![0];
      if (a.axis === b.axis && Math.abs(a.normal.dot(b.normal)) >= .99999999) parents[leader(j)] = leader(i);
    }
  }
  const normalGroups = new Map<number, SurfaceTriangle[]>();
  for (const [i, key] of keys.entries()) {
    const id = leader(i), group = normalGroups.get(id) ?? [];
    for (const triangle of buckets.get(key)!) group.push(triangle);
    normalGroups.set(id, group);
  }
  const planes: SurfaceTriangle[][] = [];
  for (const bucket of normalGroups.values()) {
    const normal = bucket[0].normal;
    const intervals = bucket.map(triangle => {
      const ds = triangle.points.map(p => normal.dot(p));
      return {triangle, lo: Math.min(...ds), hi: Math.max(...ds)};
    }).sort((a, b) => a.lo - b.lo);
    let end = -Infinity, group: SurfaceTriangle[] = [];
    for (const interval of intervals) {
      if (interval.lo > end + tolerance) {group = []; planes.push(group); end = -Infinity;}
      group.push(interval.triangle); end = Math.max(interval.hi, end);
    }
  }
  for (const list of planes) {
    const sweep = (list[0].axis + 1) % 3, other = (list[0].axis + 2) % 3;
    list.sort((a, b) => a.min[sweep] - b.min[sweep]);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length && list[j].min[sweep] < a.max[sweep] - 1e-8; j++) {
        const b = list[j];
        if (b.max[sweep] <= a.min[sweep] + 1e-8 || b.min[other] >= a.max[other] - 1e-8 || b.max[other] <= a.min[other] + 1e-8) continue;
        const dot = a.normal.dot(b.normal);
        if (dot < 0 && a.material.side !== THREE.DoubleSide && b.material.side !== THREE.DoubleSide) continue;
        if (Math.abs(dot) < .99999999) continue;
        const separation = Math.max(...b.points.map(p => Math.abs(a.normal.dot(p) - a.plane)), ...a.points.map(p => Math.abs(b.normal.dot(p) - b.plane)));
        if (separation > tolerance) continue;
        // Explicit decal bias is already an intentional ordering, unlike renderOrder alone.
        if ((a.material.polygonOffset || b.material.polygonOffset) &&
          (a.material.polygonOffsetFactor !== b.material.polygonOffsetFactor || a.material.polygonOffsetUnits !== b.material.polygonOffsetUnits)) continue;
        const polygon = overlap(a, b);
        let area = 0;
        for (let k = 1; k + 1 < polygon.length; k++) area += Math.abs(cross(polygon[0], polygon[k], polygon[k + 1])) / 2;
        area /= Math.abs(a.normal.getComponent(a.axis));
        // Float32 joins can overlap by a few micrometres after world transforms.
        // Reject slivers thinner than 10 micrometres as numerical shared edges.
        const perimeter = polygon.reduce((sum, p, k) => {
          const q = polygon[(k + 1) % polygon.length]; return sum + Math.hypot(p[0] - q[0], p[1] - q[1]);
        }, 0);
        if (area < 1e-7 || 2 * area / perimeter < .00001) continue;
        const axes = [0, 1, 2].filter(axis => axis !== a.axis);
        const centre = new THREE.Vector3();
        centre.setComponent(axes[0], polygon.reduce((s, p) => s + p[0], 0) / polygon.length);
        centre.setComponent(axes[1], polygon.reduce((s, p) => s + p[1], 0) / polygon.length);
        centre.setComponent(a.axis, (a.plane - a.normal.dot(centre)) / a.normal.getComponent(a.axis));
        visit(a, b, area, separation, centre);
      }
    }
  }
}

export function auditOpaqueSurfaces(root: THREE.Object3D, tolerance = .002): { triangleCount: number; conflicts: SurfaceConflict[] } {
  const triangles = collectOpaqueTriangles(root);
  const groups = new Map<string, SurfaceConflict>();
  findOpaqueSurfaceOverlaps(triangles, tolerance, (a, b, area, separation, centre) => {
    const owners = [a.owner, b.owner].sort();
    const normal = a.normal.toArray().map(v => Math.round(v * 1000) / 1000);
    const key = `${owners.join('|')}|${normal.join(',')}`;
    const [first, second] = a.owner <= b.owner ? [a, b] : [b, a];
    const record = groups.get(key) ?? {first: owners[0], second: owners[1], triangles: 0, area: 0, separation: 0, centre: centre.toArray(), normal,
      firstTriangle: first.triangle, secondTriangle: second.triangle,
      firstMaterial: first.material.name || first.material.type, secondMaterial: second.material.name || second.material.type};
    record.triangles++; record.area += area; record.separation = Math.max(record.separation, separation);
    groups.set(key, record);
  });
  return {triangleCount: triangles.length, conflicts: [...groups.values()].sort((a, b) => b.area - a.area)};
}
