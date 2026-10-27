import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { parseExterminatorModelAsset, EXTERMINATOR_MODEL_VERSION } from '../src/boss/ExterminatorModelAsset.ts';
import { ExterminatorMinionPresentation } from '../src/boss/ExterminatorMinionPresentation.ts';
import { ExterminatorDebris } from '../src/boss/ExterminatorDebris.ts';
import { FinalBossPresentation } from '../src/boss/FinalBossPresentation.ts';
import { BossDefeatSet } from '../src/cinematics/BossDefeatSet.ts';
import { FinalBossController } from '../src/boss/FinalBossController.ts';
import { FINAL_ARENA, FINAL_BOSS_TUNING as T, FINAL_MERGE_ANCHOR, FINAL_SPECIMEN_MOVEMENT } from '../src/boss/FinalBossConfig.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { FinalBossEncounter } from '../src/boss/FinalBossEncounter.ts';
import { ExterminationArena } from '../src/boss/ExterminationArena.ts';
import { CombatTargetRegistry } from '../src/combat/CombatTargetRegistry.ts';
import { SpecimenProjectileSystem } from '../src/combat/SpecimenProjectileSystem.ts';

async function asset() {
  const b = await readFile(new URL('../assets/characters/exterminator/exterminator-family.glb', import.meta.url));
  return parseExterminatorModelAsset(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
function body() { return new KinematicBody({ world: new CollisionWorld(), surfaces: new SurfaceRegistry(), initialPosition: FINAL_MERGE_ANCHOR, config: FINAL_SPECIMEN_MOVEMENT }); }
function encounter() {
  class Element {
    dataset: Record<string, string> = {}; hidden = false; className = ''; textContent = ''; value = 0; max = 0; onclick: unknown;
    ownerDocument = { createElement: () => new Element() }; append(..._children: Element[]): void {} setAttribute(_a: string, _b: string): void {} remove(): void {}
  }
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry(), targets = new CombatTargetRegistry(world), arena = new ExterminationArena();
  world.registerAll(arena.collisionMeshes); surfaces.registerAll(arena.collisionMeshes);
  const player = new KinematicBody({ world, surfaces, initialPosition: FINAL_MERGE_ANCHOR, config: FINAL_SPECIMEN_MOVEMENT });
  const weapon = new SpecimenProjectileSystem({ collisionWorld: world, targetRegistry: targets, body: player, aimRayProvider: { copyAimRay: (o, d) => { o.copy(player.position); d.set(0, 0, 1); } } });
  const p = new FinalBossPresentation(), boss = new FinalBossEncounter({ world, arena, targets, body: player, weapon, presentation: p, host: new Element() as unknown as HTMLElement, requestFailure: () => false });
  return { boss, p, dispose: () => { boss.dispose(); weapon.dispose(); targets.dispose(); arena.dispose(); world.clear(); surfaces.clear(); } };
}

test('the authored drone family has four metric rigid templates, bounded detail and shared fine finish maps', async () => {
  const a = await asset();
  try {
    assert.deepEqual(a.root.children.map(o => o.name).sort(), ['EX_Boss', 'SW_Advanced', 'SW_Guardian', 'SW_Pursuer']);
    let triangles = 0;
    a.root.traverse(o => {
      assert.ok(!(o instanceof THREE.Camera || o instanceof THREE.Light));
      if (!(o instanceof THREE.Mesh)) return;
      assert.ok(o.geometry.getAttribute('normal')); assert.ok(o.geometry.getAttribute('uv'));
      triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
    });
    assert.ok(triangles < 100_000); assert.equal(a.diagnostics.textures, 2);
    assert.equal(a.root.getObjectByName('EX_Boss')!.userData.asset, EXTERMINATOR_MODEL_VERSION);
    for (const style of ['Guardian', 'Pursuer', 'Advanced'] as const) {
      const clone = a.cloneMinion(style), size = new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3());
      assert.ok(size.x >= 1.75 && size.x <= 1.9, `${style}: ${size.toArray()}`);
      assert.ok(size.y <= 1 && size.z <= 1.7);
    }
  } finally { a.dispose(); }
});

test('small flying drones are 15 percent larger, distinguish roles and bank without moving their collider parent', async () => {
  const a = await asset(), drone = new ExterminatorMinionPresentation(), parent = new THREE.Group(); parent.position.set(8, 5, 2); parent.add(drone.root);
  try {
    drone.adopt(a); assert.equal(drone.root.scale.x, 1.15);
    drone.setGuardian(false); assert.equal(drone.root.children[0]!.visible, false); assert.equal(drone.root.children[1]!.visible, true);
    let emitter: THREE.Object3D | undefined;
    drone.root.children[1]!.traverse(o => { if (o.userData.dronePart === 'SW_Emitter') emitter = o; });
    assert.equal(emitter!.visible, false);
    drone.setAimDirection({ x: 1, y: 0, z: -1 }); drone.setVelocity({ x: 12, y: 0, z: -8 }); drone.fire(); drone.update(1 / 60, 1);
    assert.ok(Math.abs(drone.root.rotation.y) > .01); assert.ok(Math.abs(drone.root.rotation.z) > .001);
    assert.ok(drone.root.children[1]!.position.z > 0); assert.deepEqual(parent.position.toArray(), [8, 5, 2]);
    drone.setGuardian(true); assert.equal(drone.root.children[0]!.visible, true);
    drone.reset(); assert.deepEqual(drone.root.rotation.toArray().slice(0, 3), [0, 0, 0]);
    const advanced = new ExterminatorMinionPresentation(true); advanced.adopt(a);
    assert.equal(advanced.root.scale.x, 1.15 * T.advancedScale); advanced.dispose();
  } finally { drone.dispose(); a.dispose(); }
});

test('authored boss articulation preserves core, projectile proxies and emitter positions while rebuilding actual RAM contact', async () => {
  const a = await asset(), p = new FinalBossPresentation(), controller = new FinalBossController(), player = body();
  const ending = new BossDefeatSet(); p.rollRig.add(ending.bossDamage);
  try {
    p.refreshWorldAnchors(); const proxy = p.armour, core = p.core, eye = p.eyeMuzzle.clone();
    p.adoptDroneModel(a.cloneBoss()); assert.equal(p.armour, proxy); assert.equal(p.core, core); assert.ok(p.eyeMuzzle.distanceTo(eye) < 1e-6);
    assert.ok(p.ramHull.widthMetres > 45 && p.ramHull.widthMetres < 50);
    controller.start(true); for (let i = 1; i < 40; i++) p.update(controller.readModel, i / 60, player);
    const iris = p.machine.getObjectByName('EX_Iris_0')!;
    assert.ok(iris.position.x > .85 && iris.position.z > -4.2, 'the quadrant must retract into its housing behind the exposed lens');
    const gun = p.machine.getObjectByName('EX_Gun_L')!;
    const before = p.copyGunMuzzle(0, new THREE.Vector3()); p.kickGuns(); p.update(controller.readModel, 40 / 60, player);
    assert.ok(gun.position.z > -2.4); assert.ok(p.copyGunMuzzle(0, new THREE.Vector3()).distanceTo(before) > .05);
    const fan = p.machine.getObjectByName('EX_Fan_LF')!; p.machine.updateMatrixWorld(true);
    const centre = fan.localToWorld(new THREE.Vector3(-1.25, .4, -1.25)), point = fan.localToWorld(new THREE.Vector3(2.4, 0, 0));
    p.ramHull.capturePreviousPose(); assert.equal(p.ramHull.intersectsPlayer(point, point, .2), true);
    assert.equal(p.ramHull.intersectsPlayer(centre, centre, .08), false, 'the fan retains an actual open aperture around the narrow hub/bridges');
    const model = controller.readModel; model.attack = 'ram'; model.stage = 'active'; model.progress = .5;
    p.update(model, .7, player); p.machine.position.y = T.ramHeight; p.machine.rotation.set(0, 0, 0); p.machine.updateMatrixWorld(true);
    for (const name of ['LF', 'LB', 'RF', 'RB']) {
      const top = new THREE.Box3().setFromObject(p.machine.getObjectByName(`EX_Fan_${name}`)!).max.y;
      assert.ok(top < 11.6, `RAM wing ${name} must retain the full-charge jump clearance: ${top}`);
    }
  } finally { ending.bossDamage.removeFromParent(); ending.dispose(); p.dispose(); controller.dispose(); a.dispose(); }
});

test('phase two reveals damaged machinery and retry restores the authored panels, gimbals and shutters', async () => {
  const a = await asset(), p = new FinalBossPresentation(), controller = new FinalBossController(), player = body();
  try {
    p.adoptDroneModel(a.cloneBoss()); controller.startPhaseTwo(player.position); p.update(controller.readModel, .1, player);
    assert.equal(p.machine.getObjectByName('EX_Breakaway_L')!.visible, false);
    assert.equal(p.machine.getObjectByName('EX_Damaged_L')!.visible, true);
    assert.ok(Math.abs(p.machine.getObjectByName('EX_Breakaway_R')!.rotation.z) > .4);
    // Visibility flags alone miss machinery that is still buried in the base
    // hull. A real inspection ray must reach the newly exposed hot module.
    p.machine.updateMatrixWorld(true);
    const exposed = p.machine.getObjectByName('EX_Damaged_L')!, visible: THREE.Mesh[] = [];
    let hot: THREE.Mesh | undefined;
    exposed.traverse(o => { if (o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.name === 'EX_Amber') hot = o; });
    p.rollRig.traverseVisible(o => { if (o instanceof THREE.Mesh && (Array.isArray(o.material) ? o.material.some(m => m.visible) : o.material.visible)) visible.push(o); });
    const at = new THREE.Box3().setFromObject(hot!).getCenter(new THREE.Vector3()), above = at.clone().add(new THREE.Vector3(0, 20, 0));
    assert.equal(new THREE.Raycaster(above, at.clone().sub(above).normalize()).intersectObjects(visible, false)[0]!.object, hot);
    p.reset(); assert.equal(p.machine.getObjectByName('EX_Breakaway_L')!.visible, true);
    assert.equal(p.machine.getObjectByName('EX_Damaged_L')!.visible, false);
    assert.equal(p.machine.getObjectByName('EX_Fan_LF')!.rotation.x, 0);
    assert.equal(p.machine.getObjectByName('EX_Iris_0')!.position.x, 0);
  } finally { p.dispose(); controller.dispose(); a.dispose(); }
});

test('cloned drones share immutable resources, release them once, and never dispose the borrowed environment', async () => {
  const a = await asset(), first = a.cloneMinion('Guardian'), second = a.cloneMinion('Guardian');
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  let gc = 0, mc = 0, tc = 0, ec = 0;
  a.root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return; geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) { materials.add(m); const s = m as THREE.MeshStandardMaterial; if (s.normalMap) textures.add(s.normalMap); if (s.roughnessMap) textures.add(s.roughnessMap); }
  });
  for (const g of geometries) g.addEventListener('dispose', () => gc++);
  for (const m of materials) m.addEventListener('dispose', () => mc++);
  for (const t of textures) t.addEventListener('dispose', () => tc++);
  const env = new THREE.Texture(); env.addEventListener('dispose', () => ec++); a.setEnvironment(env);
  const meshes = (r: THREE.Object3D) => { const list: THREE.Mesh[] = []; r.traverse(o => { if (o instanceof THREE.Mesh) list.push(o); }); return list; };
  meshes(first).forEach((m, i) => { assert.equal(m.geometry, meshes(second)[i]!.geometry); assert.equal(m.material, meshes(second)[i]!.material); });
  a.dispose(); a.dispose(); assert.equal(gc, geometries.size); assert.equal(mc, materials.size); assert.equal(tc, 2); assert.equal(ec, 0); env.dispose();
});

test('encounter preparation fetches once and every retry reuses the prepared boss and all wing templates', async () => {
  const bytes = await readFile(new URL('../assets/characters/exterminator/exterminator-family.glb', import.meta.url));
  const fetch = globalThis.fetch, f = encounter(); let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(bytes); };
  try {
    const first = f.boss.prepare(); assert.equal(f.boss.prepare(), first); await first;
    const before = f.boss.modelDiagnostics; assert.equal(before.ready, true);
    assert.ok(f.p.machine.getObjectByName('EX_Boss'));
    for (let i = 0; i < 3; i++) { f.boss.reset(); f.boss.start(true); f.boss.update(1 / 60); await f.boss.prepare(); }
    assert.equal(requests, 1); assert.deepEqual(f.boss.modelDiagnostics, before);
    assert.equal((f.boss.squad.root.children[0]!.children[0] as THREE.Mesh<THREE.BoxGeometry>).geometry.parameters.width, 1.8 * T.minionScale);
  } finally { globalThis.fetch = fetch; f.dispose(); }
});

test('unloading while the model loads aborts the request and prevents late models from attaching to a disposed fight', async () => {
  const bytes = await readFile(new URL('../assets/characters/exterminator/exterminator-family.glb', import.meta.url));
  const fetch = globalThis.fetch, f = encounter(); let release: (response: Response) => void = () => {}; let signal: AbortSignal | undefined;
  globalThis.fetch = async (_input, options) => { signal = options?.signal ?? undefined; return new Promise<Response>(resolve => { release = resolve; }); };
  try {
    const pending = f.boss.prepare(); f.boss.dispose(); assert.equal(signal!.aborted, true);
    release(new Response(bytes)); await pending;
    assert.equal(f.boss.modelDiagnostics.ready, false); assert.equal(f.p.root.children.length, 0);
    await f.boss.prepare();
  } finally { globalThis.fetch = fetch; f.dispose(); }
});

test('mechanical destruction pools stay bounded, use the destruction position and clear on retry', () => {
  const debris = new ExterminatorDebris();
  try {
    for (let i = 0; i < 30; i++) debris.burst({ x: 12, y: 9, z: FINAL_ARENA.centreZ }, 1.15);
    debris.update(1 / 60);
    const matrix = new THREE.Matrix4();
    for (const child of debris.root.children) {
      const mesh = child as THREE.InstancedMesh; assert.ok(mesh.count <= mesh.instanceMatrix.count);
      mesh.getMatrixAt(0, matrix); const p = new THREE.Vector3().setFromMatrixPosition(matrix);
      assert.ok(Math.abs(p.x - 12) < 1 && Math.abs(p.z - FINAL_ARENA.centreZ) < 1);
    }
    debris.reset(); for (const child of debris.root.children) assert.equal((child as THREE.InstancedMesh).count, 0);
  } finally { debris.dispose(); }
});

