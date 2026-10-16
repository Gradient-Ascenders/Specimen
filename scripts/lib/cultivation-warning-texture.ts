import * as THREE from 'three';

export function generateWarning() {
    const stripes = new Uint8Array(128 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const yellow = (x + y) % 64 < 32;
      const i = (y * 128 + x) * 4;
      stripes.set(yellow ? [198, 153, 39, 255] : [34, 39, 37, 255], i);
    }
  return { albedo: texture('warning-stripes', stripes, 128, true) };
}

function texture(name: string, data: Uint8Array, size: number, colour = false): THREE.DataTexture {
    const texture = new THREE.DataTexture(data, size, size);
    texture.name = `cultivation-${name}`;
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }
