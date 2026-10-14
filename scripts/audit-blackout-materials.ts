import { readBlackoutMaintenanceMapData } from '../src/render/environment/blackout/BlackoutMaintenanceMapData.ts';
/** Node-side authored-surface audit; run before and after the texture pass. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { BlackoutMaintenanceBay } from '../src/levels/BlackoutMaintenanceBay.ts';

const compressed = readFileSync(new URL('../src/assets/blackout/maintenance-maps.bin', import.meta.url));
const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
const mapData = readBlackoutMaintenanceMapData(await new Response(stream).arrayBuffer());
const bay = new BlackoutMaintenanceBay(mapData);
const materials = new Set<THREE.Material>();
const surfaces: object[] = [];
bay.root.traverse(object => {
  if (!(object instanceof THREE.Mesh) || object.userData.visualOnly) return;
  const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
  meshMaterials.forEach(material => materials.add(material));
  surfaces.push({ name: object.name, collider: bay.collisionMeshes.includes(object),
    position: object.position.toArray(), rotation: object.rotation.toArray(), scale: object.scale.toArray(),
    positionHash: createHash('sha256').update(Buffer.from(object.geometry.attributes.position.array.buffer)).digest('hex'),
    normalHash: createHash('sha256').update(Buffer.from(object.geometry.attributes.normal.array.buffer)).digest('hex'),
    indexHash: createHash('sha256').update(Buffer.from(object.geometry.index!.array.buffer)).digest('hex'),
    userData: object.userData, castShadow: object.castShadow, receiveShadow: object.receiveShadow });
});
const directory = `artifacts/issue-162/checkpoint-1/${process.argv[2] ?? 'after'}`;
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/authored-surfaces.json`, JSON.stringify({ surfaces }, null, 2) + '\n');
console.log(`${surfaces.length} authored meshes, ${bay.collisionMeshes.length} colliders, ${materials.size} material identities including hidden proxies`);
bay.dispose();
