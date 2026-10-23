import { readFile, writeFile } from 'node:fs/promises';
import { ExterminationArena } from '../src/boss/ExterminationArena.ts';
import { parseExterminationLairAsset } from '../src/boss/ExterminationLairAsset.ts';
import { auditOpaqueSurfaces } from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import { BlackoutBossStaging } from '../src/levels/BlackoutBossStaging.ts';
import * as THREE from 'three';

const data = await readFile(new URL('../assets/environments/extermination-lair/extermination-lair.glb', import.meta.url));
const arena = new ExterminationArena();
const staging = new BlackoutBossStaging(true), scene = new THREE.Group();
scene.add(arena.root, staging.root);
const tolerance = Number(process.env.SURFACE_TOLERANCE ?? '.0001');
if (!(tolerance > 0 && tolerance <= .05)) throw new Error('Invalid surface tolerance.');
const states = process.env.SURFACE_STATES?.split(',') ?? ['initial', 'deployment', 'combat', 'escape', 'reset'];
const results = [];
try {
  arena.adoptArt(await parseExterminationLairAsset(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
  for (const state of states) {
    arena.reset();
    if (state === 'deployment') { arena.setDoors(true); arena.deployment(.5); }
    else if (state === 'combat') { arena.setDoors(true); arena.deployment(1); }
    else if (state === 'escape') {
      arena.setDoors(true, true); arena.deployment(1); arena.setDamaged(true);
      for (const c of arena.cover) arena.breakCoverAlong(c.position, c.position, .1);
    } else if (!['initial', 'reset'].includes(state)) throw new Error(`Unknown arena state ${state}.`);
    const result = { state, tolerance, ...auditOpaqueSurfaces(scene, tolerance) };
    results.push(result);
    console.log(`${state}: ${result.triangleCount} opaque triangles, ${result.conflicts.length} conflicts at ${tolerance} m`);
  }
  await writeFile(process.argv[2] ?? '/tmp/extermination-lair-surfaces.json', JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => r.conflicts.length)) process.exitCode = 1;
} finally { arena.dispose(); staging.dispose(); }
