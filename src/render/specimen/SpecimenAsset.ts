import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const SPECIMEN_ASSET_URL = new URL('../../../assets/characters/specimen/specimen.glb', import.meta.url).href;
export const SPECIMEN_ASSET_VERSION = 'specimen-yellow-bolt-tips-v12';
export const SPECIMEN_RESTING_SOLE = -0.45;
export const SPECIMEN_TRIANGLES = 108352;

export interface SpecimenAsset {
  readonly root: THREE.Group;
  readonly meshes: readonly THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>[];
}

export async function loadSpecimenAsset(): Promise<THREE.Group> {
  const response = await fetch(SPECIMEN_ASSET_URL);
  if (!response.ok) throw new Error(`Specimen asset request failed: ${response.status}`);
  return parseSpecimenAsset(await response.arrayBuffer());
}

export async function parseSpecimenAsset(bytes: ArrayBuffer): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  // Three supports the authored morph tracks, but not Blender's optional
  // material-pointer tracks. Gameplay charge owns that emission at runtime.
  loader.register(parser => ({
    name: 'SpecimenGameplayCharge',
    beforeRoot() {
      for (const animation of parser.json.animations ?? []) {
        animation.channels = animation.channels.filter(
          (channel: { target: { path: string } }) => channel.target.path !== 'pointer');
      }
      return null;
    },
  }));
  const gltf = await loader.parseAsync(bytes, '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}

export function validateSpecimenAsset(root: THREE.Group): SpecimenAsset {
  const character = root.getObjectByName('The_Specimen');
  if (character?.userData.asset !== SPECIMEN_ASSET_VERSION) throw new Error('Unexpected Specimen asset version');
  const meshes: SpecimenAsset['meshes'][number][] = [];
  let triangles = 0;
  root.traverse(object => {
    if (object instanceof THREE.Light || object instanceof THREE.Camera || object instanceof THREE.SkinnedMesh) {
      throw new Error('Specimen must contain only the authored morph meshes');
    }
    if (!(object instanceof THREE.Mesh)) return;
    if (!(object.material instanceof THREE.MeshPhysicalMaterial)) throw new Error(`Invalid Specimen material: ${object.name}`);
    const position = object.geometry.getAttribute('position');
    if (!position || !object.geometry.index || object.morphTargetDictionary?.Breathe === undefined) {
      throw new Error(`Invalid Specimen geometry: ${object.name}`);
    }
    for (const attribute of [...Object.values(object.geometry.attributes), ...Object.values(object.geometry.morphAttributes).flat()] as THREE.BufferAttribute[]) {
      if (!attribute.array.every(Number.isFinite)) throw new Error(`Non-finite Specimen geometry: ${object.name}`);
    }
    if (!object.geometry.index.array.every((index: number) => index < position.count)) throw new Error(`Invalid Specimen indices: ${object.name}`);
    triangles += object.geometry.index.count / 3;
    meshes.push(object as SpecimenAsset['meshes'][number]);
  });
  if (meshes.length !== 10 || triangles !== SPECIMEN_TRIANGLES ||
    !['Idle', 'Settle', 'Charge'].every(name => root.animations.some(clip => clip.name === name))) {
    throw new Error('Incomplete Specimen asset');
  }
  return { root, meshes };
}

/** The environment is borrowed from the level; all GLB resources are instance owned. */
export function disposeSpecimenAsset(root: THREE.Group, environment: THREE.Texture | null = null): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of [object.material, object.customDepthMaterial, object.customDistanceMaterial].flat()) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture && value !== environment) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  root.removeFromParent(); root.clear();
}
