import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { ExterminationLighting } from '../src/boss/ExterminationLighting.ts';
import { applyExterminationShadowRoles } from '../src/boss/ExterminationShadowRoles.ts';
import { ExterminationArena } from '../src/boss/ExterminationArena.ts';
import { parseExterminationLairAsset } from '../src/boss/ExterminationLairAsset.ts';
import { GraphicsResourcePolicy } from '../src/render/GraphicsResourcePolicy.ts';
import { FINAL_ARENA } from '../src/boss/FinalBossConfig.ts';

test('arena uses one focused shadow pass at each graphics cap and no decorative cube shadows', () => {
  const scene = new THREE.Scene(), lighting = new ExterminationLighting(); scene.add(lighting.root);
  const policy = new GraphicsResourcePolicy(scene);
  try {
    const lights: THREE.Light[] = []; lighting.root.traverse(o => { if (o instanceof THREE.Light) lights.push(o); });
    assert.equal(lights.filter(l => l.castShadow).length, 1);
    assert.equal(lights.filter(l => l instanceof THREE.PointLight).length, 2);
    assert.equal(lights.filter(l => l instanceof THREE.SpotLight).length, 2);
    assert.ok(lights.filter(l => l instanceof THREE.SpotLight).every(l => !l.castShadow));
    assert.ok(lights.filter(l => l instanceof THREE.PointLight).every(l => !l.castShadow));
    assert.ok(lights.every(l => l.intensity === 0), 'the arena must not wash out unpowered Blackout rooms');
    assert.equal(lighting.key.shadow.autoUpdate, false);
    assert.equal(lighting.key.shadow.needsUpdate, true, 'the first PCF sampler still needs valid storage');
    for (const cap of [512, 1024, 2048, 512]) {
      policy.setQuality(cap, 1);
      assert.deepEqual(lighting.key.shadow.mapSize.toArray(), [Math.min(cap, 1024), Math.min(cap, 1024)]);
      assert.equal(lighting.key.shadow.camera.right - lighting.key.shadow.camera.left, 60);
    }
    lighting.setRoofOpening(1); lighting.setPowered(true); const key = lighting.key.intensity;
    assert.ok(lights.every(l => l.intensity > 0 || l.name.includes('emergency')));
    lighting.setPowered(true, true);
    assert.ok(lighting.key.intensity > 0 && lighting.key.intensity < key);
    assert.ok(lights.find(l => l.name === 'extermination-emergency-spill')!.intensity > 0);
    lighting.setPowered(false); assert.ok(lights.every(l => l.intensity === 0));
  } finally { policy.dispose(); lighting.dispose(); }
});

test('moonlight enters the real roof opening only after the hatch clears, keeps one cheap shaft and frees its resources once', () => {
  const arena = new ExterminationArena(), moon = arena.lighting.moonlight;
  try {
    arena.setPowered(true); arena.deployment(0);
    assert.equal(moon.shaft.visible, false); assert.equal(moon.light.intensity, 0);
    arena.deployment(.4); assert.equal(moon.shaft.visible, false);
    arena.deployment(.7); assert.equal(moon.shaft.visible, true);
    const partial = moon.light.intensity;
    arena.deployment(1); assert.ok(moon.light.intensity > partial);
    const roof = moon.light.position;
    assert.ok(Math.hypot(roof.x, roof.z - FINAL_ARENA.centreZ) + 7 < 29, 'the shaft starts inside the existing aperture');
    assert.ok(Math.abs(roof.y - FINAL_ARENA.ceilingY) < 2);
    const landing = moon.light.target.position;
    assert.ok(Math.hypot(landing.x, landing.z - FINAL_ARENA.centreZ) > 62 && Math.hypot(landing.x, landing.z - FINAL_ARENA.centreZ) < 99.5);
    assert.equal(moon.light.castShadow, false); assert.equal(moon.light.shadow.map, null);
    assert.equal(moon.shaft.material.depthWrite, false); assert.equal(moon.shaft.material.depthTest, true);
    assert.equal(moon.shaft.material.side, THREE.BackSide);
    assert.ok(moon.shaft.geometry.getAttribute('position').count < 200);
    const intensity = moon.light.intensity; arena.setPowered(true, true);
    assert.equal(moon.light.intensity, intensity, 'moonlight remains steady through the emergency phase');
    arena.reset(); assert.equal(moon.shaft.visible, false); assert.equal(moon.light.intensity, 0);
    let disposals = 0;
    for (const resource of [moon.shaft.geometry, moon.shaft.material]) resource.addEventListener('dispose', () => disposals++);
    arena.dispose(); arena.dispose(); assert.equal(disposals, 2);
  } finally { arena.dispose(); }
});

test('the near shadow frustum follows the complete ring and charged jumps without changing light direction', () => {
  const lighting = new ExterminationLighting(); lighting.setPowered(true);
  const axis = lighting.key.position.clone().sub(lighting.key.target.position), sphere = new THREE.Sphere();
  try {
    for (let i = 0; i < 16; i++) {
      const position = new THREE.Vector3(Math.cos(i * Math.PI / 8) * 83, 2.07, FINAL_ARENA.centreZ + Math.sin(i * Math.PI / 8) * 83);
      lighting.prepareFrame(position);
      assert.ok(lighting.key.position.clone().sub(lighting.key.target.position).distanceTo(axis) < 1e-8);
      lighting.key.updateWorldMatrix(true, false); lighting.key.shadow.updateMatrices(lighting.key);
      for (const height of [2.07, 14]) {
        sphere.center.copy(position); sphere.center.y = height; sphere.radius = 1.65;
        assert.ok(lighting.key.shadow.getFrustum().intersectsSphere(sphere), `ring ${i}, height ${height}`);
      }
    }
    // Choose the centre of a snapped texel, away from rounding boundaries.
    lighting.prepareFrame({ x: 0, z: 0 }); const snapped = lighting.key.target.position.clone();
    lighting.prepareFrame({ x: .000001, z: .000001 });
    const right = axis.clone().cross(THREE.Object3D.DEFAULT_UP).normalize();
    const up = axis.clone().cross(right).normalize();
    const drift = lighting.key.target.position.clone().sub(snapped);
    assert.ok(Math.abs(drift.dot(right)) < 1e-8 && Math.abs(drift.dot(up)) < 1e-8);
    lighting.key.shadow.map = new THREE.WebGLRenderTarget(1, 1); lighting.key.shadow.needsUpdate = false;
    lighting.prepareFrame({ x: 0, z: 0 }, false);
    assert.equal(lighting.key.shadow.autoUpdate, false, 'paused poses do not redraw a depth map');
    lighting.setPowered(false); lighting.key.shadow.needsUpdate = false;
    lighting.prepareFrame({ x: 12, z: 24 });
    assert.equal(lighting.key.shadow.needsUpdate, false, 'unpowered camera travel must not schedule shadow work');
    lighting.setPowered(true); assert.equal(lighting.key.shadow.needsUpdate, true);
  } finally { lighting.dispose(); }
});

test('shadow roles exclude glass, emitters, effects and invisible colliders without replacing custom depth materials', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const materials = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial({ transparent: true }),
    new THREE.MeshStandardMaterial({ visible: false }), new THREE.MeshStandardMaterial({ emissive: 0xff1100, emissiveIntensity: 2 }), new THREE.MeshBasicMaterial()];
  const meshes = materials.map(m => new THREE.Mesh(geometry, m)); root.add(...meshes);
  const depth = new THREE.MeshDepthMaterial(); meshes[0]!.customDepthMaterial = depth;
  applyExterminationShadowRoles(root, true);
  assert.equal(meshes[0]!.castShadow, true); assert.equal(meshes[0]!.receiveShadow, true);
  assert.equal(meshes[0]!.customDepthMaterial, depth);
  for (const mesh of meshes.slice(1)) assert.deepEqual([mesh.castShadow, mesh.receiveShadow], [false, false]);
  for (const m of [...materials, depth]) m.dispose(); geometry.dispose();
});

test('authored cover casts onto the receiving shell; destruction/retry reuse the single map and disposal frees it once', async () => {
  const bytes = await readFile(new URL('../assets/environments/extermination-lair/extermination-lair.glb', import.meta.url));
  const asset = await parseExterminationLairAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const arena = new ExterminationArena(); arena.adoptArt(asset);
  const map = new THREE.WebGLRenderTarget(16, 16); let disposed = 0; map.addEventListener('dispose', () => disposed++);
  arena.lighting.key.shadow.map = map;
  try {
    let receivers = 0, casters = 0;
    asset.staticRoot.traverse(o => { if (o instanceof THREE.Mesh) { assert.equal(o.castShadow, false); if (o.receiveShadow) receivers++; } });
    arena.cover[0]!.traverse(o => { if (o instanceof THREE.Mesh && o.castShadow) casters++; });
    assert.ok(receivers > 0 && casters > 0);
    assert.ok(arena.collisionMeshes.every(m => !m.castShadow && !m.receiveShadow));
    const cover = arena.cover[0]!; arena.setPowered(true);
    arena.breakCoverAlong(cover.position, cover.position, 0); assert.equal(cover.visible, false);
    arena.reset(); assert.equal(cover.visible, true); assert.equal(arena.lighting.key.shadow.autoUpdate, false);
    assert.equal(arena.lighting.key.shadow.map, map);
    arena.setPowered(true, true); assert.equal(arena.lighting.key.shadow.map, map);
  } finally { arena.dispose(); arena.dispose(); }
  assert.equal(disposed, 1); assert.equal(arena.lighting.key.shadow.map, null);
});
