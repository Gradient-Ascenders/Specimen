import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { ExterminationArena } from '../src/boss/ExterminationArena.ts';
import { parseExterminationLairAsset, EXTERMINATION_LAIR_VERSION } from '../src/boss/ExterminationLairAsset.ts';
import { EXTERMINATION_LAIR_COVER } from '../src/boss/ExterminationLairLayout.ts';
import { FINAL_ARENA, FINAL_ARENA_RING, FINAL_SPECIMEN_MOVEMENT } from '../src/boss/FinalBossConfig.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';

async function asset() {
  const bytes = await readFile(new URL('../assets/environments/extermination-lair/extermination-lair.glb', import.meta.url));
  return parseExterminationLairAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

test('the production lair exports only its seven owned roots, with metric geometry and fitted cover templates', async () => {
  const a = await asset(), arena = new ExterminationArena();
  try {
    assert.equal(a.root.children.length, 7);
    assert.equal(a.staticRoot.userData.asset, EXTERMINATION_LAIR_VERSION);
    assert.equal(a.staticRoot.userData.floorInnerRadius, FINAL_ARENA_RING.innerRadius);
    assert.equal(a.staticRoot.userData.floorOuterRadius, FINAL_ARENA_RING.outerRadius);
    assert.equal(a.staticRoot.userData.ceilingHeight, FINAL_ARENA.ceilingY);
    assert.equal(a.root.getObjectByName('Cube'), undefined);
    for (const template of Object.values(a.coverTemplates)) {
      const size = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3());
      assert.ok(size.distanceTo(new THREE.Vector3(7, 4.2, 3.2)) < .03, `${template.name}: ${size.toArray()}`);
    }
    arena.adoptArt(a);
    assert.equal(arena.artDiagnostics.ready, true); assert.equal(arena.cover.length, 10);
    assert.equal(arena.root.getObjectByName('lair-unprepared-preview'), undefined);
    for (const [i, collider] of arena.cover.entries()) {
      const def = EXTERMINATION_LAIR_COVER[i]!, art = collider.children[0]!;
      assert.ok(art.position.length() < 1e-6);
      assert.deepEqual(collider.geometry.parameters.width, def.size[0]);
      assert.equal(art.scale.x, def.size[0] / 7);
      assert.equal(art.scale.y, def.size[1] / 4.2);
    }
  } finally { arena.dispose(); }
});

test('authored deck finishes partition the annulus and never skin across the pit', async () => {
  const a = await asset(), arena = new ExterminationArena();
  try {
    arena.adoptArt(a); arena.root.updateMatrixWorld(true);
    let area = 0; const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    a.staticRoot.traverse(o => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || !['floor', 'repairDeck', 'grate', 'steel'].includes(o.material.userData.exterminationFinish)) return;
      const p = o.geometry.getAttribute('position'), index = o.geometry.index;
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        for (let j = 0; j < 3; j++) v[j]!.fromBufferAttribute(p, index?.getX(i + j) ?? i + j).applyMatrix4(o.matrixWorld);
        if (!v.every(p => Math.abs(p.y - FINAL_ARENA.floorY) < 1e-5)) continue;
        if (v.some(p => Math.hypot(p.x, p.z - FINAL_ARENA.centreZ) > FINAL_ARENA_RING.outerRadius + .01)) continue;
        // The narrow structural lip projects 0.4 m into the shaft; the actual
        // walking plates, including their steel inner band, begin at 62 m.
        if (o.material.userData.exterminationFinish === 'steel' && v.some(p => Math.hypot(p.x, p.z - FINAL_ARENA.centreZ) < FINAL_ARENA_RING.innerRadius)) continue;
        for (const point of v) assert.ok(Math.hypot(point.x, point.z - FINAL_ARENA.centreZ) >= FINAL_ARENA_RING.innerRadius);
        const normal = v[1]!.clone().sub(v[0]!).cross(v[2]!.clone().sub(v[0]!));
        if (normal.y > 0) area += normal.length() / 2;
      }
    });
    const expected = Math.PI * (FINAL_ARENA_RING.outerRadius ** 2 - FINAL_ARENA_RING.innerRadius ** 2);
    assert.ok(area > expected * .985 && area < expected, `deck area ${area}, annulus ${expected}`);
  } finally { arena.dispose(); }
});

test('the doorway lettering sits inside a backing panel that is actually mounted on solid architecture', async () => {
  const a = await asset(), arena = new ExterminationArena(); arena.adoptArt(a);
  try {
    arena.root.updateMatrixWorld(true);
    const architecture = a.staticRoot.children.filter(o => o instanceof THREE.Mesh);
    for (const [name, outward] of [['Lair_EntrySign', 1], ['Lair_ExitSign', -1]] as const) {
      const sign = a.staticRoot.getObjectByName(name)!;
      assert.ok(sign, `${name} must have its own mounted assembly`);
      const label = sign.children.find(o => o.name.endsWith('Lair_SignPaint'))!;
      const panel = sign.children.find(o => o.name.endsWith('Lair_Graphite'))!;
      const letters = new THREE.Box3().setFromObject(label), backing = new THREE.Box3().setFromObject(panel);
      assert.ok(letters.min.x > backing.min.x && letters.max.x < backing.max.x);
      assert.ok(letters.min.y > backing.min.y && letters.max.y < backing.max.y);
      const rear = outward > 0 ? letters.min.z : letters.max.z;
      const face = outward > 0 ? backing.max.z : backing.min.z;
      assert.ok(Math.abs(rear - face) < .00003, `${name} lettering must touch the panel`);
      const wallZ = outward > 0 ? backing.min.z : backing.max.z;
      const origin = backing.getCenter(new THREE.Vector3()); origin.z = wallZ + outward * .02;
      const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -outward), 0, .04);
      assert.ok(ray.intersectObjects(architecture).some(h => Math.abs(h.point.z - wallZ) < .00003), `${name} needs a wall immediately behind it`);
    }
  } finally { arena.dispose(); }
});

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

