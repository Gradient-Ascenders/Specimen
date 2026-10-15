import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Decode the actual embedded 8-bit RGB/RGBA PNGs, avoiding browser image APIs in
 * Node. Geometry, accessors (including sparse targets), materials and metadata
 * still pass through the production GLTFLoader. */
export async function loadVolt() {
  const bytes = await readFile(new URL('../../assets/characters/volt/volt.glb', import.meta.url));
  const loader = new GLTFLoader();
  loader.register(parser => ({
    name: 'VoltNodePNGFixture',
    async loadTexture(index: number) {
      const definition = parser.json.textures[index];
      const source = parser.json.images[definition.source];
      const png = Buffer.from(await parser.getDependency('bufferView', source.bufferView));
      const texture = decodePNG(png);
      const sampler = parser.json.samplers[definition.sampler];
      const wraps: Record<number, THREE.Wrapping> = { 33071: THREE.ClampToEdgeWrapping, 10497: THREE.RepeatWrapping, 33648: THREE.MirroredRepeatWrapping };
      const filters: Record<number, THREE.TextureFilter> = {
        9728: THREE.NearestFilter, 9729: THREE.LinearFilter,
        9984: THREE.NearestMipmapNearestFilter, 9985: THREE.LinearMipmapNearestFilter,
        9986: THREE.NearestMipmapLinearFilter, 9987: THREE.LinearMipmapLinearFilter,
      };
      texture.flipY = false;
      texture.wrapS = wraps[sampler.wrapS ?? 10497]!; texture.wrapT = wraps[sampler.wrapT ?? 10497]!;
      texture.magFilter = filters[sampler.magFilter ?? 9729] as THREE.MagnificationTextureFilter;
      texture.minFilter = filters[sampler.minFilter ?? 9987] as THREE.MinificationTextureFilter;
      texture.generateMipmaps = true; texture.needsUpdate = true;
      return texture;
    },
  }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}

function decodePNG(png: Buffer): THREE.DataTexture {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (png[24] !== 8 || ![2, 6].includes(png[25]!) || png[28] !== 0) throw new Error('Fixture expects non-interlaced RGBA8 PNG');
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const channels = png[25] === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(chunks)), pixels = new Uint8Array(width * height * channels), stride = width * channels;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upperLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels]! : 0;
      const p = left + up - upperLeft;
      const paeth = Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - upperLeft)
        ? left : Math.abs(p - up) <= Math.abs(p - upperLeft) ? up : upperLeft;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      if (prediction === undefined) throw new Error('Invalid PNG filter');
      pixels[y * stride + x] = raw[y * (stride + 1) + x + 1]! + prediction;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) { rgba.set(pixels.subarray(i * channels, i * channels + channels), i * 4); if (channels === 3) rgba[i * 4 + 3] = 255; }
  return new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
}
