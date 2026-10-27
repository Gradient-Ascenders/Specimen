import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { ExterminationArena } from '../src/boss/ExterminationArena.ts';
import { parseExterminationLairAsset } from '../src/boss/ExterminationLairAsset.ts';
import { FINAL_ARENA, FINAL_ARENA_RING, FINAL_SPECIMEN_MOVEMENT } from '../src/boss/FinalBossConfig.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';

async function asset() {
  const bytes = await readFile(new URL('../assets/environments/extermination-lair/extermination-lair.glb', import.meta.url));
  return parseExterminationLairAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

test('the enlarged cover leaves a complete main running circuit for the real specimen body', () => {
  const arena = new ExterminationArena(), world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  world.registerAll(arena.collisionMeshes); surfaces.registerAll(arena.collisionMeshes);
  const radius = FINAL_ARENA_RING.radius, body = new KinematicBody({ world, surfaces, config: FINAL_SPECIMEN_MOVEMENT,
    initialPosition: new THREE.Vector3(0, 2.07, FINAL_ARENA.centreZ - radius) });
  const direction = new THREE.Vector3(); let travel = 0, previous = -Math.PI / 2;
  try {
    for (let i = 0; i < 2200; i++) {
      const a = Math.atan2(body.position.z - FINAL_ARENA.centreZ, body.position.x);
      const r = Math.hypot(body.position.x, body.position.z - FINAL_ARENA.centreZ);
      direction.set(-Math.sin(a) - Math.cos(a) * (r - radius) * .3, 0, Math.cos(a) - Math.sin(a) * (r - radius) * .3).normalize();
      body.update(1 / 60, direction);
      travel += Math.atan2(Math.sin(a - previous), Math.cos(a - previous)); previous = a;
      assert.ok(body.position.y > 2, 'the circuit must stay on the deck');
    }
    assert.ok(travel > Math.PI * 2, 'larger cover must not block the full circuit');
  } finally { arena.dispose(); world.clear(); surfaces.clear(); }
});

test('RAM removes visible cover with its solid, reset reuses the art, and disposal releases owned resources once', async () => {
  const arena = new ExterminationArena(); arena.adoptArt(await asset());
  const geometry = new Set<THREE.BufferGeometry>(), material = new Set<THREE.Material>();
  arena.root.traverse(o => { if (o instanceof THREE.Mesh) { geometry.add(o.geometry); for (const m of [o.material].flat()) material.add(m); } });
  let geometries = 0, materials = 0;
  for (const g of geometry) g.addEventListener('dispose', () => geometries++);
  for (const m of material) m.addEventListener('dispose', () => materials++);
  const covers = arena.cover.map(c => c.children[0]);
  for (const c of arena.cover) arena.breakCoverAlong(c.position, c.position, .1);
  assert.ok(arena.cover.every(c => !c.visible)); assert.ok(arena.coverAssemblies.every(c => !c.visible));
  for (let i = 0; i < 3; i++) {
    arena.reset(); assert.ok(arena.cover.every(c => c.visible));
    assert.deepEqual(arena.cover.map(c => c.children[0]), covers);
  }
  arena.deployment(.2); const hatch = arena.root.getObjectByName('lair-deployment-hatch-rig')!;
  assert.equal(hatch.position.x, 0); assert.ok(hatch.position.y > 100);
  arena.deployment(1); assert.equal(hatch.position.x, 58);
  arena.reset(); assert.equal(hatch.position.y, 95.2);
  arena.dispose(); arena.dispose();
  assert.equal(geometries, geometry.size); assert.equal(materials, material.size);
});

