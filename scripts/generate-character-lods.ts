import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

// Offline index-only simplification: every retained vertex keeps its approved
// normal, UV and ALL relative morphs. No runtime simplifier or duplicate vertex
// streams, materials, shadow variants or animation state are needed.
await MeshoptSimplifier.ready;
const check = process.argv.includes('--check');
for (const character of ['goop', 'volt']) {
  const source = await readFile(new URL(`../assets/characters/${character}/${character}.glb`, import.meta.url));
  const jsonLength = source.readUInt32LE(12);
  const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  const binary = source.subarray(28 + jsonLength);
  function attribute(index: number): Float32Array {
    const a = gltf.accessors[index];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as string]!;
    const output = new Float32Array(a.count * width);
    const componentBytes = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
    function component(offset: number, type = a.componentType): number {
      if (type === 5126) return binary.readFloatLE(offset);
      if (type === 5125) return binary.readUInt32LE(offset);
      if (type === 5123) return binary.readUInt16LE(offset);
      if (type === 5121) return binary.readUInt8(offset);
      throw new Error(`Unsupported GLB component ${type}`);
    }
    if (a.bufferView !== undefined) {
      const view = gltf.bufferViews[a.bufferView];
      for (let vertex = 0; vertex < a.count; vertex++) for (let channel = 0; channel < width; channel++) {
        output[vertex * width + channel] = component((view.byteOffset ?? 0) + (a.byteOffset ?? 0) + vertex * (view.byteStride ?? width * componentBytes) + channel * componentBytes);
      }
    }
    if (a.sparse) {
      const { indices, values, count } = a.sparse;
      const indexBytes = indices.componentType === 5125 ? 4 : indices.componentType === 5123 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const vertex = component((gltf.bufferViews[indices.bufferView].byteOffset ?? 0) + (indices.byteOffset ?? 0) + i * indexBytes, indices.componentType);
        for (let channel = 0; channel < width; channel++) output[vertex * width + channel] = component((gltf.bufferViews[values.bufferView].byteOffset ?? 0) + (values.byteOffset ?? 0) + (i * width + channel) * componentBytes);
      }
    }
    return output;
  }
  const payload: Buffer[] = [];
  const meshes = gltf.meshes.map((mesh: { name: string; primitives: any[] }) => {
    if (mesh.primitives.length !== 1) throw new Error('Expected one primitive per character mesh');
    const p = mesh.primitives[0];
    const positions = attribute(p.attributes.POSITION);
    const indices = new Uint16Array(attribute(p.indices));
    const channels = [attribute(p.attributes.NORMAL)];
    const weights = [0.15, 0.15, 0.15];
    if (p.attributes.TEXCOORD_0 !== undefined) { channels.push(attribute(p.attributes.TEXCOORD_0)); weights.push(0.4, 0.4); }
    for (const target of p.targets ?? []) {
      if (target.POSITION !== undefined) { channels.push(attribute(target.POSITION)); weights.push(1, 1, 1); }
    }
    const vertices = positions.length / 3;
    const attributes = new Float32Array(vertices * weights.length);
    for (let vertex = 0; vertex < vertices; vertex++) {
      let offset = 0;
      for (const channel of channels) {
        const width = channel.length / vertices;
        attributes.set(channel.subarray(vertex * width, (vertex + 1) * width), vertex * weights.length + offset);
        offset += width;
      }
    }
    const [lod, error] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, weights.length, weights, null,
      Math.floor(indices.length / 12) * 3, 0.004, ['LockBorder']);
    const bytes = Buffer.alloc(lod.length * 2);
    lod.forEach((value: number, i: number) => bytes.writeUInt16LE(value, i * 2));
    payload.push(bytes);
    return { name: mesh.name, vertices, indices: lod.length, sourceTriangles: indices.length / 3, error };
  });
  const metadata = Buffer.from(JSON.stringify({ sourceSHA256: createHash('sha256').update(source).digest('hex'), meshes }));
  const header = Buffer.alloc(12); header.write('SLOD0001'); header.writeUInt32LE(metadata.length, 8);
  const output = Buffer.concat([header, metadata, ...payload]);
  const url = new URL(`../src/assets/characters/${character}-lod.bin`, import.meta.url);
  if (check) {
    if (!output.equals(await readFile(url))) throw new Error(`${character} LOD is stale. Run npm run generate:character-lods.`);
  } else {
    await mkdir(new URL('../src/assets/characters/', import.meta.url), { recursive: true });
    await writeFile(url, output);
  }
  console.log(`${character} LOD: ${meshes.map((m: { sourceTriangles: number; indices: number }) => `${m.sourceTriangles} → ${m.indices / 3} triangles`).join(', ')} (${output.length} bytes)${check ? ' reproduced exactly' : ''}`);
}
