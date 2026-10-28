import type { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The playable and captive Volt prepare together. Share only their in-flight
// download; each caller still parses an independently owned character scene.
const pendingBytes = new Map<string, Promise<ArrayBuffer>>();

/** Consume the response before parsing. Three's FileLoader wraps the response
 * in another stream, which can report ERR_ABORTED in Chromium after a complete
 * GLB download. Native consumption also propagates real body/network failures.
 * Each parse owns a fresh scene, geometry, morph state and materials. */
export async function loadCharacterAsset(url: string): Promise<Group> {
  let pending = pendingBytes.get(url);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Character asset ${url}: HTTP ${response.status} ${response.statusText}`);
      return response.arrayBuffer();
    })().finally(() => pendingBytes.delete(url));
    pendingBytes.set(url, pending);
  }
  return parseCharacterAsset(await pending, url);
}

/** Raw preloads share bytes, never mutable scenes, geometry or materials. */
export async function parseCharacterAsset(bytes: ArrayBuffer, url: string): Promise<Group> {
  const gltf = await new GLTFLoader().parseAsync(bytes, new URL('.', url).href);
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}
