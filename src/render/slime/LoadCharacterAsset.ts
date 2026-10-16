import type { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Consume the response before parsing. Three's FileLoader wraps the response
 * in another stream, which can report ERR_ABORTED in Chromium after a complete
 * GLB download. Native consumption also propagates real body/network failures.
 * Each parse owns a fresh scene, geometry, morph state and materials. */
export async function loadCharacterAsset(url: string): Promise<Group> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Character asset ${url}: HTTP ${response.status} ${response.statusText}`);
  const bytes = await response.arrayBuffer();
  return parseCharacterAsset(bytes, url);
}

/** Raw preloads share bytes, never mutable scenes, geometry or materials. */
export async function parseCharacterAsset(bytes: ArrayBuffer, url: string): Promise<Group> {
  const gltf = await new GLTFLoader().parseAsync(bytes, new URL('.', url).href);
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}
