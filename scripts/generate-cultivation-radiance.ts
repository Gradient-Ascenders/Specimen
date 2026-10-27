/** Export real static render surfaces and fixture state for an isolated BVH bake.
 * --check verifies inputs and packed provenance without launching Blender. */
import * as THREE from 'three';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { cultivationAssets } from './lib/read-cultivation-assets.ts';
import { CultivationSewerLighting } from '../src/render/environment/cultivation/CultivationSewerLighting.ts';
import { CULTIVATION_RADIANCE_LAYOUT, CULTIVATION_RADIANCE_VERSION, CULTIVATION_CAPTURE_SIZE,
  CULTIVATION_PROBE_RAYS, CULTIVATION_ATLAS_WIDTH, CULTIVATION_ATLAS_HEIGHT, CULTIVATION_ATLAS_DEPTH,
  CULTIVATION_LIGHTING_TINTS } from '../src/render/environment/cultivation/CultivationRadianceLayout.ts';

const directory = new URL('../assets/environments/cultivation-lighting/', import.meta.url);
const evidence = new URL('../artifacts/evidence/cultivation-lighting/', import.meta.url);
const sha = (v: Uint8Array | string) => createHash('sha256').update(v).digest('hex');
const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
const sewerLighting = new CultivationSewerLighting(scene.roomFive.root);
const meshes: THREE.Mesh[] = [], lights: object[] = [];
const dynamic = new Set<THREE.Object3D>([...scene.dynamicCollisionMeshes, ...scene.roomTwo.dynamicTransformRoots,
  ...scene.roomThree.dynamicTransformRoots, ...scene.roomFour.dynamicTransformRoots, ...scene.roomFive.dynamicTransformRoots,
  ...scene.roomOne.platformDrops.flatMap(drop => drop.dynamicTransformRoots), ...scene.voltFinaleSet.dynamicTransformRoots,
  ...scene.roomOne.solubleTargetMeshes, ...scene.roomTwo.solubleTargetMeshes, ...scene.roomThree.solubleTargetMeshes,
  ...scene.roomOneToTwoPassage.doors.map(door => door.root), ...scene.roomTwoToThreeGoopPassage.doors.map(door => door.root), scene.filtrationArt.fan]);
const origin = scene.root.position.clone(), world = new THREE.Vector3(), point = new THREE.Vector3();
let triangles = 0;
try {
  scene.root.updateMatrixWorld(true);
  scene.root.traverseVisible(object => {
    for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (dynamic.has(parent)) return;
    if (object instanceof THREE.PointLight || object instanceof THREE.SpotLight) {
      if (object.intensity <= 0 || object.distance <= 0) return;
      lights.push({ name: object.name, position: object.getWorldPosition(world).sub(origin).toArray(), colour: object.color.toArray(),
        intensity: object.intensity, range: object.distance, decay: object.decay,
        ...(object instanceof THREE.SpotLight ? { target: object.target.getWorldPosition(world).sub(origin).toArray(),
          angle: object.angle, penumbra: object.penumbra } : {}) });
    }
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || object.userData.runtimeProxy ||
        object.userData.sharedLaserEmitter || /monitor|speech|surveillance|camera|arrow|sign|acid|sewer-liquid|radiation/i.test(object.name)) return;
    const materials = [object.material].flat();
    if (materials.length !== 1 || !(materials[0] instanceof THREE.MeshStandardMaterial) || !materials[0].visible || materials[0].transparent) return;
    meshes.push(object); triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
  });
  const packed = new Float32Array(triangles * 15);
  let cursor = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry, position = geometry.getAttribute('position'), index = geometry.index;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const colour = material.color.clone();
    if (material.map) colour.multiplyScalar(.72);
    const count = index?.count ?? position.count;
    for (let i = 0; i < count; i += 3) {
      for (let corner = 0; corner < 3; corner++) {
        point.fromBufferAttribute(position, index ? index.getX(i + corner) : i + corner).applyMatrix4(mesh.matrixWorld).sub(origin);
        packed[cursor++] = point.x; packed[cursor++] = point.y; packed[cursor++] = point.z;
      }
      for (const v of colour.toArray()) packed[cursor++] = v;
      for (const v of material.emissive.toArray()) packed[cursor++] = v * material.emissiveIntensity;
    }
  }
  const geometryBytes = new Uint8Array(packed.buffer);
  const input = { version: CULTIVATION_RADIANCE_VERSION,
    sources: { authoredAssetsSha256: sha(await readFile(new URL('../src/assets/cultivation/authored-assets.bin', import.meta.url))),
      generatorSha256: sha(await readFile(new URL('bake-radiance.py', directory))) },
    geometrySha256: sha(geometryBytes), triangles, meshCount: meshes.length, lights,
    layout: CULTIVATION_RADIANCE_LAYOUT, zoneTints: CULTIVATION_LIGHTING_TINTS, rays: CULTIVATION_PROBE_RAYS, captureSize: CULTIVATION_CAPTURE_SIZE,
    atlas: [CULTIVATION_ATLAS_WIDTH, CULTIVATION_ATLAS_HEIGHT, CULTIVATION_ATLAS_DEPTH],
    geometryFile: '../../../artifacts/evidence/cultivation-lighting/bake-geometry.bin',
    liquids: [
      { min: [-18, -1, 8], max: [18, .2, 50], colour: [.025, .065, .004] },
      { min: [-19, -1, 86], max: [19, .2, 123], colour: [.025, .065, .004] },
      { min: [-24, -1, 151], max: [24, .2, 223], colour: [.035, .085, .004] },
      { min: [-20, -1, 258], max: [20, .2, 322], colour: [.04, .12, .006] },
      { min: [37, -13, 258], max: [43, -12, 382], colour: [.025, .065, .004] },
    ] };
  const text = JSON.stringify(input, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (text !== await readFile(new URL('bake-input.json', directory), 'utf8')) throw Error('Cultivation radiance inputs are stale. Regenerate the bake.');
    const bytes = gunzipSync(await readFile(new URL('radiance.bin', directory))), size = bytes.readUInt32LE(8);
    const header = JSON.parse(bytes.subarray(12, 12 + size).toString());
    if (bytes.subarray(0, 8).toString() !== input.version || header.inputSha256 !== sha(text)) throw Error('Stale Cultivation radiance bank.');
    const offset = (12 + size + 3) & ~3;
    const expected = offset + input.atlas.reduce((a, b) => a * b, 1) * 8 + input.layout.length * 2 * input.captureSize[0] * input.captureSize[1] * 4;
    if (bytes.length !== expected) throw Error('Truncated Cultivation radiance payload.');
    console.log('Cultivation radiance inputs and packed provenance match.');
  } else {
    await mkdir(directory, { recursive: true }); await mkdir(evidence, { recursive: true });
    await writeFile(new URL('bake-input.json', directory), text);
    await writeFile(new URL('bake-geometry.bin', evidence), gzipSync(geometryBytes, { level: 9, mtime: 0 } as never));
    console.log(`Exported ${meshes.length} actual static surfaces, ${triangles} triangles and ${lights.length} fixed lights.`);
  }
} finally { sewerLighting.dispose(); scene.dispose(); }
