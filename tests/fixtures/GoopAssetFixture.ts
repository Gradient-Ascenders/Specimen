import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export async function loadGoop() {
  const bytes = await readFile(new URL('../../assets/characters/goop/goop.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}
