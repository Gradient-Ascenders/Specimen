import * as THREE from 'three';

/**
 * Metric face UVs for uniquely owned authored boxes. Only the UV attribute is
 * replaced: collider positions, normals, indices and bounds retain identity.
 * Room anchoring joins coplanar panels; object anchoring travels with a prop.
 * Rotated face tangents retain true ramp length instead of foreshortening it.
 */
export function mapBlackoutBoxUVs(
  geometry: THREE.BufferGeometry,
  objectToRoom: THREE.Matrix4,
  tileMetres: readonly [number, number],
  anchor: 'room' | 'object' = 'room',
): void {
  if (tileMetres.some(size => !Number.isFinite(size) || size <= 0)) {
    throw new Error('Blackout texture dimensions must be positive metres.');
  }
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const uv = new THREE.BufferAttribute(new Float32Array(positions.count * 2), 2);
  const matrix = objectToRoom.clone();
  if (anchor === 'object') {
    const scale = new THREE.Vector3().setFromMatrixScale(matrix);
    matrix.makeScale(scale.x, scale.y, scale.z);
  }
  const linear = new THREE.Matrix3().setFromMatrix4(matrix);
  const point = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
    if (Math.abs(nx) > .5) { u.set(0, 0, -Math.sign(nx)); v.set(0, 1, 0); }
    else if (Math.abs(ny) > .5) { u.set(1, 0, 0); v.set(0, 0, -Math.sign(ny)); }
    else { u.set(Math.sign(nz), 0, 0); v.set(0, 1, 0); }
    u.applyMatrix3(linear).normalize(); v.applyMatrix3(linear).normalize();
    point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
    uv.setXY(i, point.dot(u) / tileMetres[0], point.dot(v) / tileMetres[1]);
  }
  geometry.setAttribute('uv', uv);
}

/** Retain each primitive's native curved charts, scaled by their physical span. */
export function mapBlackoutPropUVs(geometry: THREE.BufferGeometry, tile: readonly [number, number]): void {
  if (geometry.type === 'BoxGeometry') {
    mapBlackoutBoxUVs(geometry, new THREE.Matrix4(), tile, 'object');
    return;
  }
  const uv = geometry.getAttribute('uv');
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  if (geometry.type === 'RoundedBoxGeometry') {
    const p = (geometry as THREE.BoxGeometry & { parameters: { radius: number } }).parameters;
    const span = (length: number) => length - 2 * p.radius + Math.PI * p.radius / 2;
    const charts = [[p.depth, p.height], [p.depth, p.height], [p.width, p.depth], [p.width, p.depth], [p.width, p.height], [p.width, p.height]];
    for (let i = 0; i < uv.count; i++) {
      const [width, height] = charts[Math.floor(i / (uv.count / 6))];
      uv.setXY(i, uv.getX(i) * span(width) / tile[0], uv.getY(i) * span(height) / tile[1]);
    }
  } else if (geometry instanceof THREE.CylinderGeometry) {
    const p = geometry.parameters, radius = Math.max(p.radiusTop, p.radiusBottom);
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(normals.getY(i)) > .999) uv.setXY(i, positions.getX(i) / tile[0], positions.getZ(i) / tile[1]);
      else uv.setXY(i, uv.getX(i) * 2 * Math.PI * radius / tile[0], uv.getY(i) * p.height / tile[1]);
    }
  } else if (geometry instanceof THREE.TorusGeometry || geometry instanceof THREE.TubeGeometry) {
    const length = geometry instanceof THREE.TorusGeometry ? geometry.parameters.radius * geometry.parameters.arc : geometry.parameters.path.getLength();
    const radius = geometry instanceof THREE.TorusGeometry ? geometry.parameters.tube : geometry.parameters.radius;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * length / tile[0], uv.getY(i) * 2 * Math.PI * radius / tile[1]);
  } else {
    throw new Error(`Unsupported blackout prop geometry: ${geometry.type}`);
  }
  uv.needsUpdate = true;
}
