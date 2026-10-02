import * as THREE from 'three';

/** Copies own programs, but borrow maps and the presentation's shader uniforms. */
export function copyPrewarmMaterial(material: THREE.Material): THREE.Material {
  const copy = material instanceof THREE.MeshPhysicalMaterial ? new THREE.MeshPhysicalMaterial().copy(material)
    : material instanceof THREE.MeshStandardMaterial ? new THREE.MeshStandardMaterial().copy(material)
    : material.clone();
  if (copy instanceof THREE.ShaderMaterial && material instanceof THREE.ShaderMaterial) {
    copy.uniforms = material.uniforms;
  }
  copy.onBeforeCompile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  copy.customProgramCacheKey = () => key;
  return copy;
}

/** Match r185 WebGLShadowMap.getDepthMaterial for PCF, without mutating live materials. */
export function createShadowPrewarmMaterial(
  source: THREE.Mesh,
  material: THREE.Material,
  distance: boolean,
): THREE.MeshDepthMaterial | THREE.MeshDistanceMaterial {
  const custom = distance ? source.customDistanceMaterial : source.customDepthMaterial;
  const shadow = (custom ? copyPrewarmMaterial(custom) : distance
    ? new THREE.MeshDistanceMaterial() : new THREE.MeshDepthMaterial()) as
      THREE.MeshDepthMaterial | THREE.MeshDistanceMaterial;
  const surface = material as THREE.MeshStandardMaterial;
  shadow.side = surface.shadowSide ?? (surface.side === THREE.FrontSide ? THREE.BackSide
    : surface.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
  shadow.visible = surface.visible;
  shadow.map = surface.map;
  shadow.alphaMap = surface.alphaMap;
  shadow.alphaTest = surface.alphaToCoverage ? 0.5 : surface.alphaTest;
  shadow.clipShadows = surface.clipShadows;
  shadow.clippingPlanes = surface.clippingPlanes;
  shadow.clipIntersection = surface.clipIntersection;
  shadow.displacementMap = surface.displacementMap;
  shadow.displacementScale = surface.displacementScale;
  shadow.displacementBias = surface.displacementBias;
  Object.assign(shadow, { wireframe: surface.wireframe, wireframeLinewidth: surface.wireframeLinewidth });
  return shadow;
}

export function createDepthPrewarmGroup(root: THREE.Object3D): {
  group: THREE.Group;
  dispose(): void;
} {
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const instances: THREE.InstancedMesh[] = [];
  root.traverse(source => {
    if (!(source instanceof THREE.Mesh) || !source.castShadow) return;
    for (const surface of Array.isArray(source.material) ? source.material : [source.material]) {
      if (!surface.visible) continue;
      const material = createShadowPrewarmMaterial(source, surface, false);
      const proxy = source.clone(false); proxy.material = material;
      proxy.visible = true; proxy.frustumCulled = false; proxy.castShadow = false;
      if (proxy instanceof THREE.InstancedMesh) instances.push(proxy);
      materials.push(material); group.add(proxy);
    }
  });
  let disposed = false;
  return { group, dispose() {
    if (disposed) return;
    disposed = true;
    group.clear();
    for (const material of materials) material.dispose();
    for (const instance of instances) instance.dispose();
  } };
}
