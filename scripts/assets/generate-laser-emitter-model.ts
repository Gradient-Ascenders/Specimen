/** Extract the existing Level 1 optical head without loading its room at runtime. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = new URL('../../assets/environments/containment-room-three/room-three-laboratory.glb', import.meta.url);
const target = new URL('../../src/assets/hazards/laser-emitter.geometry.json', import.meta.url);
const bytes = await readFile(source);
const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const names = ['R3_Batch_Emitter_Graphite', 'R3_Batch_Emitter_Alloy', 'R3_LaserAperture', 'R3_LaserShutter'] as const;
if (scene.getObjectByName('R3_LaserHousing')?.userData.asset !== 'containment-room-three-laser-v1')
  throw Error('Missing Level 1 laser emitter.');
scene.updateMatrixWorld(true);
const parts: Record<string, { attributes: Record<string, { itemSize: number; values: number[] }>; index: number[] }> = {};
try {
  for (const name of names) {
    const mesh = scene.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh) || !mesh.geometry.index) throw Error('Missing emitter part: ' + name);
    if (!mesh.matrixWorld.equals(new THREE.Matrix4())) throw Error('Emitter transforms must be baked: ' + name);
    const geometry = mesh.geometry;
    const attributes: Record<string, { itemSize: number; values: number[] }> = {};
    for (const [key, attribute] of Object.entries(geometry.attributes)) {
      if (!(attribute instanceof THREE.BufferAttribute) || !(attribute.array instanceof Float32Array) || attribute.normalized)
        throw Error('Unexpected emitter attribute: ' + key);
      attributes[key] = { itemSize: attribute.itemSize, values: Array.from(attribute.array) };
    }
    parts[name] = { attributes, index: Array.from(geometry.index.array) };
  }
} finally {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  scene.traverse(object => { if (object instanceof THREE.Mesh) {
    geometries.add(object.geometry); for (const material of [object.material].flat()) materials.add(material);
  } });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
const output = JSON.stringify({ version: 1, asset: 'containment-room-three-laser-v1',
  sourceSha256: createHash('sha256').update(bytes).digest('hex'), parts }) + '\n';
if (process.argv.includes('--check')) {
  if (output !== await readFile(target, 'utf8')) throw Error('Laser emitter buffers are stale. Run node scripts/assets/generate-laser-emitter-model.ts.');
  console.log('Level 1 laser emitter buffers reproduce exactly.');
} else {
  await writeFile(target, output);
  console.log('Extracted the four Level 1 laser emitter buffers (' + Buffer.byteLength(output) + ' bytes).');
}
