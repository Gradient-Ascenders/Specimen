import * as THREE from 'three';

const SIZE = 512;
function hash(x: number, y: number): number {
  let n = Math.imul(x + 31, 374761393) ^ Math.imul(y + 67, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}
function noise(u: number, v: number, cells: number): number {
  const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const at = (a: number, b: number) => hash(((a % cells) + cells) % cells, ((b % cells) + cells) % cells);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), sx),
    THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy);
}

/** Opaque gel remains readable; dried patches never resemble holes in the route. */
export function createCultivationMembraneTextures() {
  const albedo = new Uint8Array(SIZE * SIZE * 4), roughness = new Uint8Array(albedo.length);
  const normal = new Uint8Array(albedo.length), heights = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE;
    const broad = noise(u, v, 4), fine = noise(u, v, 64);
    const folds = noise(u + .16 + (broad - .5) * .16,
      v + (noise(u + .31, v, 4) - .5) * .16, 24);
    const vein = 1 - THREE.MathUtils.smoothstep(Math.abs(folds - .5), .025, .11);
    const dried = THREE.MathUtils.smoothstep(broad * .8 + fine * .2, .58, .82) * .65;
    const bloom = THREE.MathUtils.smoothstep(folds, .3, .8);
    const i = (y * SIZE + x) * 4;
    albedo[i] = 85 + bloom * 12 + vein * 6 + dried * 17;
    albedo[i + 1] = 160 + bloom * 17 + vein * 9 - dried * 44;
    albedo[i + 2] = 138 + bloom * 12 + vein * 7 - dried * 40;
    for (let c = 0; c < 3; c++) roughness[i + c] = 151 + dried * 75 - vein * 15;
    albedo[i + 3] = roughness[i + 3] = 255;
    heights[y * SIZE + x] = folds * .4 + vein * .05 + fine * .018 - dried * .05;
  }
  const height = (x: number, y: number) => heights[((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (height(x + 1, y) - height(x - 1, y)) * 3;
    const dy = (height(x, y + 1) - height(x, y - 1)) * 3;
    const inverse = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * SIZE + x) * 4;
    normal.set([(-dx * inverse * .5 + .5) * 255, (-dy * inverse * .5 + .5) * 255, (inverse * .5 + .5) * 255, 255], i);
  }
  const texture = (role: string, pixels: Uint8Array, color = false) => {
    const map = new THREE.DataTexture(pixels, SIZE, SIZE);
    map.name = `cultivation-aged-membrane-${role}`;
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
    return map;
  };
  return { albedo: texture('albedo', albedo, true), roughness: texture('roughness', roughness), normal: texture('normal', normal) };
}

export function createCultivationMembraneMaterial(maps: ReturnType<typeof createCultivationMembraneTextures>) {
  const material = new THREE.MeshStandardMaterial({ name: 'cultivation-aged-adhesive-membrane',
    color: 0xffffff, map: maps.albedo, normalMap: maps.normal, normalScale: new THREE.Vector2(.32, .32),
    roughness: .82, roughnessMap: maps.roughness, metalness: 0,
    emissive: 0x398c70, emissiveIntensity: .14, emissiveMap: maps.albedo });
  configureCultivationMembraneMaterial(material);
  return material;
}

/** Reapply to material clones before composing the finite-light optimization. */
export function configureCultivationMembraneMaterial(material: THREE.MeshStandardMaterial): void {
  material.userData.cultivationMembrane = true;
  material.userData.tileSizeMetres = [8, 8];
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec4 membranePanel; varying vec4 vMembranePanel;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMembranePanel = membranePanel;');
    shader.fragmentShader = 'varying vec4 vMembranePanel;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float membraneEdge = min(min(vMembranePanel.x, vMembranePanel.z-vMembranePanel.x),
        min(vMembranePanel.y, vMembranePanel.w-vMembranePanel.y));
      float membraneRim = 1.0-smoothstep(0.075,0.095,membraneEdge);
      float membraneCrust = (1.0-smoothstep(0.15,0.32,membraneEdge))*(0.4+0.6*diffuseColor.g);
      diffuseColor.rgb *= mix(vec3(1.0),vec3(0.62,0.67,0.49),membraneCrust*0.65);
      float membraneLip = smoothstep(0.095,0.11,membraneEdge)*(1.0-smoothstep(0.13,0.15,membraneEdge));
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.24,0.49,0.37),membraneLip*0.6);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.022,0.04,0.035),membraneRim*0.92);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor,0.87,membraneCrust);');
  };
  material.customProgramCacheKey = () => 'cultivation-aged-membrane-rim-v2';
}

/** Per-face metre coordinates survive static batching and the authored wall drops. */
export function mapCultivationMembranePanel(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!, size = bounds.getSize(new THREE.Vector3());
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const panel = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) - bounds.min.x, y = positions.getY(i) - bounds.min.y, z = positions.getZ(i) - bounds.min.z;
    const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i));
    panel.set(nx > .5 ? [z, y, size.z, size.y] : ny > .5 ? [x, z, size.x, size.z] : [x, y, size.x, size.y], i * 4);
  }
  geometry.setAttribute('membranePanel', new THREE.BufferAttribute(panel, 4));
}
