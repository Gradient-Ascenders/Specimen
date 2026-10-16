import * as THREE from 'three';
import { ACID_NOISE_BASE64, ACID_NOISE_SIZE } from './acidNoise.generated.ts';

// Decode immutable baked bytes once; each material owns its GPU texture. This
// tiny embedded bank is available synchronously even in offline construction.
const pixels = Uint8Array.from(atob(ACID_NOISE_BASE64), character => character.charCodeAt(0));
export function createAcidNoiseTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(pixels, ACID_NOISE_SIZE, ACID_NOISE_SIZE, THREE.RedFormat);
  texture.name = 'acid-baked-flow-fbm';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
