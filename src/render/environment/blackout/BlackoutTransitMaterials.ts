import * as THREE from 'three';

/** The recipient owns its material; the maintenance kit owns all three maps. */
export function borrowBlackoutMaps(material: THREE.MeshStandardMaterial, source: THREE.MeshStandardMaterial): void {
  material.map = source.map;
  material.normalMap = source.normalMap;
  material.roughnessMap = source.roughnessMap;
  material.roughness = 1;
  material.userData.tileSizeMetres = source.userData.tileSizeMetres;
  material.needsUpdate = true;
}

/** Retraction changes physical length. Reuse the UV buffer and full-pose chart. */
export function updateBlackoutStretchUVs(geometry: THREE.BufferGeometry, fullUVs: Float32Array, stretch: number): void {
  const uv = geometry.getAttribute('uv'), normals = geometry.getAttribute('normal'), positions = geometry.getAttribute('position');
  for (let i = 0; i < uv.count; i++) {
    // End caps keep their transverse chart; all long faces shrink along U.
    const fullU = fullUVs[i * 2];
    // Object-local box charts are centred on zero. Hold the negative-X
    // deployment end fixed, including charts whose U direction is reversed.
    const startU = positions.getX(i) < 0 ? fullU : -fullU;
    uv.setX(i, Math.abs(normals.getX(i)) < .5 ? startU + (fullU - startU) * stretch : fullU);
  }
  uv.needsUpdate = true;
}
