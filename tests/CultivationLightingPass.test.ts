import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { readCultivationRadiance, CultivationRadiance } from '../src/render/environment/cultivation/CultivationRadiance.ts';
import { CULTIVATION_RADIANCE_LAYOUT, CULTIVATION_ATLAS_WIDTH, CULTIVATION_ATLAS_HEIGHT, CULTIVATION_ZONE_DEPTH,
  cultivationRadianceZone } from '../src/render/environment/cultivation/CultivationRadianceLayout.ts';
import { installCultivationRadianceShader } from '../src/render/environment/cultivation/CultivationRadianceShader.ts';
import { installContainmentSoftShadows } from '../src/render/environment/containment/ContainmentSoftShadows.ts';
import { CultivationLightingPass } from '../src/render/environment/cultivation/CultivationLightingPass.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { GRAPHICS_PROFILES } from '../src/render/GraphicsProfiles.ts';

test('the actual two-state bake retains spatial bounce, validity weights and distinct local reflections', async () => {
  const packed = await readFile(new URL('../assets/environments/cultivation-lighting/radiance.bin', import.meta.url));
  const bytes = gunzipSync(packed), buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const bank = readCultivationRadiance(buffer);
  assert.equal(bank.probes, 3829); assert.equal(bank.captures.length, 26);
  assert.ok(packed.length < 1_500_000); assert.ok(bank.invalidProbes > 0 && bank.invalidProbes < bank.probes);
  assert.equal(new Set(bank.captures.map(p => Buffer.from(p).toString('base64'))).size, 26);
  assert.ok(bank.captures.every(p => p.some((n, i) => i % 4 === 3 && n > 0)));
  const stride = CULTIVATION_ATLAS_WIDTH * CULTIVATION_ATLAS_HEIGHT * 4;
  let offset = 0;
  for (const zone of CULTIVATION_RADIANCE_LAYOUT) {
    const start = (offset + 1) * stride, end = (offset + zone.grid[2] + 1) * stride;
    assert.ok(bank.irradiance.subarray(start, end).some((n, i) => i % 4 !== 3 && THREE.DataUtils.fromHalfFloat(n) > .0001), zone.name);
    assert.deepEqual(bank.irradiance.subarray(offset * stride, (offset + 1) * stride),
      bank.irradiance.subarray((offset + 1) * stride, (offset + 2) * stride), 'padded zone borders');
    offset += zone.grid[2] + 2;
  }
  assert.equal(offset, CULTIVATION_ZONE_DEPTH);
  assert.notDeepEqual(bank.irradiance.subarray(0, stride * offset), bank.irradiance.subarray(stride * offset));
  for (const half of bank.irradiance) assert.ok(Number.isFinite(THREE.DataUtils.fromHalfFloat(half)));
  assert.throws(() => readCultivationRadiance(buffer.slice(0, -2)), /Truncated/);
  const wrong = buffer.slice(0); new Uint8Array(wrong)[0] = 0;
  assert.throws(() => readCultivationRadiance(wrong), /Invalid/);
});

test('room selection distinguishes the elevated duct, recycled lift heights, chamber and separate sewer', () => {
  for (const [point, zone] of [
    [[0, 1, 25], 0], [[0, 2, 64], 1], [[0, 10, 100], 2], [[0, 2, 137], 3], [[8, 19.8, 137], 4],
    [[0, 15, 188], 5], [[0, 4, 237], 6], [[0, 26, 237], 7], [[0, 1, 246], 8], [[32, 1, 255], 9],
    [[0, 20, 287], 10], [[40, -7, 304], 11],
    [[23.1, -4, 335], 12], [[24.9, -4, 335], 12], [[26.8, -4, 335], 12],
  ] as const) assert.equal(cultivationRadianceZone(new THREE.Vector3(...point)), zone);
});

test('bounce, liquid response and PCSS compose with authored deformation using uniform-only lighting states', () => {
  const material = new THREE.MeshPhysicalMaterial(), volume = new THREE.Data3DTexture();
  material.onBeforeCompile = shader => { shader.vertexShader += '\n// authored gel and dissolve retained'; shader.uniforms.original = { value: 7 }; };
  material.customProgramCacheKey = () => 'original-gel';
  installContainmentSoftShadows(material);
  const uniforms = { cvVolume: { value: volume }, cvOrigin: { value: new THREE.Vector3(64, 0, 0) }, cvPower: { value: CULTIVATION_RADIANCE_LAYOUT.map(() => 1) },
    cvDirectional: { value: 1 }, cvTime: { value: 0 }, cvLift: { value: 0 }, cvLiquidStrength: { value: .5 } };
  installCultivationRadianceShader(material, uniforms, 336, 128);
  const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader as never, null as never);
  assert.ok(shader.vertexShader.includes('authored gel and dissolve retained'));
  assert.ok(shader.fragmentShader.includes('cShadowLinearDepth'));
  assert.ok(shader.fragmentShader.includes('energy/max(base.a,.025)'));
  assert.ok(shader.fragmentShader.includes('cultivationLiquidBounce'));
  assert.ok(shader.fragmentShader.includes('cultivationRoomRadiance'));
  assert.ok(shader.fragmentShader.includes('mod(tile,4.0)'));
  assert.equal((shader.uniforms as typeof uniforms).cvPower, uniforms.cvPower);
  const key = material.customProgramCacheKey(), version = material.version;
  uniforms.cvPower.value[10] = .35; uniforms.cvTime.value = 2;
  assert.equal(material.customProgramCacheKey(), key); assert.equal(material.version, version);
  const derived = new THREE.MeshStandardMaterial();
  derived.onBeforeCompile = (s, r) => { material.onBeforeCompile(s, r); s.vertexShader += '\n// inherited local wear'; };
  installCultivationRadianceShader(derived, uniforms, 336, 128);
  const inherited = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  derived.onBeforeCompile(inherited as never, null as never);
  assert.equal(inherited.fragmentShader.match(/vec3 cultivationIndirect\(/g)?.length, 1);
  assert.ok(inherited.vertexShader.includes('inherited local wear'));
  derived.dispose(); material.dispose(); volume.dispose();
});

test('real machinery drives coordinated lighting without changing physics or allocating lights, and unload restores borrowers', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  const colliders = scene.collisionMeshes.map(mesh => ({ mesh, geometry: mesh.geometry, position: mesh.position.toArray() }));
  const lights: THREE.Light[] = []; scene.root.traverse(o => { if (o instanceof THREE.Light) lights.push(o); });
  const before = lights.map(light => ({ light, colour: light.color.clone(), intensity: light.intensity }));
  const radiance = new CultivationRadiance(scene.root.position), pass = new CultivationLightingPass(scene, radiance);
  try {
    const after: THREE.Light[] = []; scene.root.traverse(o => { if (o instanceof THREE.Light) after.push(o); });
    assert.deepEqual(after, lights); assert.equal(pass.diagnostics.additionalLights, 0); assert.equal(pass.diagnostics.additionalShadowMaps, 0);
    assert.equal(pass.diagnostics.shafts, 7); assert.equal(pass.diagnostics.heroShadows, 4);
    pass.setQuality(GRAPHICS_PROFILES.high.settings, THREE.BasicShadowMap);
    const heroes = lights.filter((light): light is THREE.SpotLight => light instanceof THREE.SpotLight && light.shadow.radius < 0);
    assert.equal(heroes.length, 4);
    assert.ok(heroes.every(light => light.shadow.mapSize.x === 1024 && light.shadow.camera.near === .35));
    pass.setQuality(GRAPHICS_PROFILES.minimum.settings, THREE.PCFShadowMap);
    assert.ok(heroes.every(light => light.shadow.radius === 1.5 && light.shadow.mapSize.x === 512));
    const initial = pass.diagnostics.powers[10]; scene.roomFive.controller.security.toggle('red');
    for (let i = 0; i < 30; i++) pass.update(1 / 60);
    assert.ok(pass.diagnostics.powers[10] < initial);
    scene.roomFive.controller.security.release(); scene.roomFive.controller.releaseElapsed = 4;
    scene.roomFour.controller.restoreArrival(); pass.update(1 / 60);
    assert.equal(pass.diagnostics.lift, 1);
    scene.root.traverse(o => { if (o instanceof THREE.PointLight && o.name === 'room-5-volt-glow') assert.equal(o.intensity, 0); });
    scene.roomFour.controller.reset(); scene.roomFive.controller.reset(); pass.update(0);
    assert.equal(pass.diagnostics.lift, 0); assert.equal(pass.diagnostics.powers[10], 1);
    for (const item of colliders) { assert.equal(item.mesh.geometry, item.geometry); assert.deepEqual(item.mesh.position.toArray(), item.position); }
    pass.dispose(); pass.dispose();
    for (const item of before) { assert.ok(item.light.color.equals(item.colour)); assert.equal(item.light.intensity, item.intensity); }
  } finally { pass.dispose(); scene.dispose(); }
});
