import * as THREE from 'three';
import { collectOpaqueTriangles, findOpaqueSurfaceOverlaps, type SurfaceTriangle } from './OpaqueSurfaceAudit.ts';

type Vertex = { point: THREE.Vector3; weights: THREE.Vector3 };
/** Subtract a convex triangle in its supporting plane, retaining interpolants for every cut. */
function subtract(polygon: Vertex[], cutter: SurfaceTriangle, normal: THREE.Vector3): Vertex[][] {
  const result: Vertex[][] = [];
  let remaining = polygon;
  const winding = cutter.points[1].clone().sub(cutter.points[0]).cross(cutter.points[2].clone().sub(cutter.points[0])).dot(normal) < 0 ? -1 : 1;
  for (let i = 0; i < 3 && remaining.length; i++) {
    const origin = cutter.points[i], edge = cutter.points[(i + 1) % 3].clone().sub(origin);
    const inward = normal.clone().cross(edge).multiplyScalar(winding).normalize();
    const inside: Vertex[] = [], outside: Vertex[] = [];
    for (let j = 0; j < remaining.length; j++) {
      const a = remaining[j], b = remaining[(j + 1) % remaining.length];
      const da = inward.dot(a.point.clone().sub(origin)), db = inward.dot(b.point.clone().sub(origin));
      if (da >= -1e-8) inside.push(a);
      if (da <= 1e-8) outside.push(a);
      if ((da > 1e-8 && db < -1e-8) || (da < -1e-8 && db > 1e-8)) {
        const t = da / (da - db);
        const vertex = {point: a.point.clone().lerp(b.point, t), weights: a.weights.clone().lerp(b.weights, t)};
        inside.push(vertex); outside.push(vertex);
      }
    }
    if (outside.length >= 3) result.push(outside);
    remaining = inside;
  }
  return result;
}

/**
 * Bake away duplicate opaque coverage only inside a stable motion/visibility domain.
 * Returns replacement render geometries; callers retain gameplay and resource ownership.
 * No material bias, camera setting, source vertices or transforms are modified.
 */
export function createCoplanarSurfaceRepairs(root: THREE.Object3D,
  domain: (mesh: THREE.Mesh) => object | string,
): Map<THREE.Mesh, THREE.BufferGeometry> {
  const triangles = collectOpaqueTriangles(root);
  const order = new Map(triangles.map((triangle, i) => [triangle, i]));
  const cuts = new Map<SurfaceTriangle, SurfaceTriangle[]>();
  findOpaqueSurfaceOverlaps(triangles, .00001, (a, b) => {
    if (domain(a.mesh) !== domain(b.mesh)) return;
    if (a.mesh.userData.soluble || b.mesh.userData.soluble) return;
    // Smaller authored surfaces (trim, plates) win over their supporting shell.
    // A stable tie-break also eliminates duplicates within the same material batch.
    const size = (t: SurfaceTriangle) => t.points[1].clone().sub(t.points[0]).cross(t.points[2].clone().sub(t.points[0])).lengthSq();
    const delta = size(a) - size(b);
    const [loser, winner] = delta > 1e-8 || (Math.abs(delta) <= 1e-8 && order.get(a)! > order.get(b)!) ? [a, b] : [b, a];
    const list = cuts.get(loser) ?? []; list.push(winner); cuts.set(loser, list);
  });
  const affected = new Set([...cuts.keys()].map(t => t.mesh));
  const byMesh = new Map<THREE.Mesh, SurfaceTriangle[]>();
  for (const triangle of triangles) if (affected.has(triangle.mesh)) {
    const list = byMesh.get(triangle.mesh) ?? []; list.push(triangle); byMesh.set(triangle.mesh, list);
  }
  const replacements = new Map<THREE.Mesh, THREE.BufferGeometry>();
  for (const [mesh, faces] of byMesh) {
    // These level meshes have a single opaque finish. Mixed transparent groups,
    // skinning and morph deformation require an author-specific repair.
    if (Array.isArray(mesh.material) || mesh instanceof THREE.SkinnedMesh ||
      (mesh instanceof THREE.InstancedMesh && mesh.instanceColor) || Object.keys(mesh.geometry.morphAttributes).length) continue;
    const sourceGeometry: THREE.BufferGeometry = mesh.geometry;
    const attributes = Object.entries(sourceGeometry.attributes);
    const arrays = attributes.map(() => [] as number[]);
    const inverse = mesh.matrixWorld.clone().invert();
    const local = new THREE.Vector3();
    for (const face of faces) {
      let polygons = [face.points.map((point, i) => ({point, weights: new THREE.Vector3().setComponent(i, 1)}))];
      for (const cutter of cuts.get(face) ?? []) polygons = polygons.flatMap(polygon => subtract(polygon, cutter, face.normal));
      for (const polygon of polygons) for (let i = 1; i + 1 < polygon.length; i++) {
        const vertices = [polygon[0], polygon[i], polygon[i + 1]];
        if (vertices[1].point.clone().sub(vertices[0].point).cross(vertices[2].point.clone().sub(vertices[0].point)).lengthSq() < 1e-16) continue;
        for (const vertex of vertices) {
          for (const [a, [name, attribute]] of attributes.entries()) {
            const values = new Array<number>(attribute.itemSize).fill(0);
            for (let corner = 0; corner < 3; corner++) {
              const index = mesh.geometry.index?.getX(face.triangle * 3 + corner) ?? face.triangle * 3 + corner;
              for (let component = 0; component < attribute.itemSize; component++) values[component] += attribute.getComponent(index, component) * vertex.weights.getComponent(corner);
            }
            if (name === 'position') { local.copy(vertex.point).applyMatrix4(inverse); values.splice(0, 3, ...local.toArray()); }
            if (name === 'normal' && mesh instanceof THREE.InstancedMesh) {
              // Instances are baked into one local mesh, so normals must follow each instance.
              const matrix = new THREE.Matrix4(); mesh.getMatrixAt(face.instance, matrix);
              local.fromArray(values).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
              values.splice(0, 3, ...local.toArray());
            } else if (name === 'normal') {
              local.fromArray(values).normalize();
              values.splice(0, 3, ...local.toArray());
            }
            arrays[a].push(...values);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    attributes.forEach(([name, attribute], i) => geometry.setAttribute(name, new THREE.Float32BufferAttribute(arrays[i], attribute.itemSize)));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    replacements.set(mesh, geometry);
  }
  return replacements;
}
