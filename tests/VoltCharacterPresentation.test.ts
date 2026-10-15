import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { loadVolt } from './fixtures/VoltAssetFixture.ts';
import { disposeVoltAsset, validateVoltAsset, VOLT_MORPHS } from '../src/render/volt/VoltAsset.ts';
import { VoltCharacterPresentation } from '../src/render/volt/VoltCharacterPresentation.ts';
import { prepareCharacterCameraFades } from '../src/render/slime/PrepareCharacterCameraFades.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';

const state = () => ({ locomotionPositionWorld: new THREE.Vector3(), velocityWorld: new THREE.Vector3(),
  movementIntentWorld: new THREE.Vector3(), maximumLocomotionSpeedMetresPerSecond: 5.5, grounded: true });

test('hidden Volt avoids ceiling queries and resolves the current ceiling before revealing', async () => {
  const p = new VoltCharacterPresentation(), world = new CollisionWorld();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 4), new THREE.MeshBasicMaterial());
  roof.position.y = 1.25; roof.updateMatrixWorld(true); world.register(roof);
  p.setCollisionWorld(world); p.setVisible(false); await p.prepare(loadVolt);
  let queries = 0;
  const raycast = world.raycast.bind(world);
  world.raycast = (...args) => { queries++; return raycast(...args); };
  const motion = state();
  motion.grounded = false; motion.velocityWorld.y = 2;
  p.setPosition(new THREE.Vector3(0, 0.46, 0));
  p.onLaunch({ speedMetresPerSecond: 6, directionWorld: new THREE.Vector3(0, 1, 0), chargeFraction: 0 });
  for (let i = 0; i < 6; i++) { p.update(1 / 60, motion); p.present(0.5); }
  assert.equal(queries, 0);
  assert.equal(p.diagnostics.visible, false);
  const weights = { ...p.diagnostics.weights };
  assert.ok(weights.Stretch > 0, 'hidden animation still advances');
  p.setVisible(true); p.present(0.5);
  assert.equal(queries, 9);
  assert.equal(p.diagnostics.visible, true);
  const body = p.root.getObjectByName('Volt-Body') as THREE.Mesh;
  assert.ok(body.morphTargetInfluences![body.morphTargetDictionary!.Headroom] > 0,
    'the first revealed frame must fit below the ceiling');
  assert.deepEqual(p.diagnostics.weights, weights, 'revealing does not restart animation');
  p.dispose(); world.clear(); roof.geometry.dispose(); (roof.material as THREE.Material).dispose();
});

test('real GLB validates sparse morphs, connected manifold geometry and exact Volt metadata', async () => {
  const root = await loadVolt(), asset = validateVoltAsset(root);
  assert.equal(asset.body.geometry.index!.count, 96192);
  assert.equal(asset.maps[0].colorSpace, THREE.SRGBColorSpace);
  assert.equal(asset.maps[1].colorSpace, THREE.NoColorSpace);
  disposeVoltAsset(root);
  for (const mutate of [
    (r: THREE.Group) => { r.getObjectByName('Volt')!.userData.asset = 'goop-concept-sculpt-v1'; },
    (r: THREE.Group) => { r.add(new THREE.Camera()); },
    (r: THREE.Group) => { r.position.x = NaN; },
    (r: THREE.Group) => { (r.getObjectByName('Volt-Body') as THREE.Mesh).geometry.getAttribute('uv').setX(0, NaN); },
    (r: THREE.Group) => { (r.getObjectByName('Volt-Body') as THREE.Mesh).geometry.index!.setX(0, 999999); },
    (r: THREE.Group) => { (r.getObjectByName('Volt-Body') as THREE.Mesh).geometry.getAttribute('normal').setX(0, NaN); },
    (r: THREE.Group) => { (r.getObjectByName('Volt-Eye-Left') as THREE.Mesh).morphTargetDictionary!.Blink = 0; },
    (r: THREE.Group) => { (r.getObjectByName('Volt-Body') as THREE.Mesh).geometry.morphAttributes.normal![1]!.setX(0, Infinity); },
    (r: THREE.Group) => { (r.getObjectByName('Volt-Body') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>).material.roughness = 0.18; },
  ]) {
    const fresh = await loadVolt(); mutate(fresh);
    assert.throws(() => validateVoltAsset(fresh), /Volt asset contract/); disposeVoltAsset(fresh);
  }
});

test('preparation deduplicates, retains requests/maps, owns resources once and borrows PMREM', async () => {
  const p = new VoltCharacterPresentation(), root = await loadVolt(), env = new THREE.Texture();
  const original = validateVoltAsset(root), imported = new Set([original.body.material, original.eyes[0].material]);
  const resources = [...original.maps, ...imported, ...[original.body, ...original.eyes].map(m => m.geometry)];
  const disposed = new Map<object, number>();
  for (const r of [...resources, env]) r.addEventListener('dispose', () => disposed.set(r, (disposed.get(r) ?? 0) + 1));
  let resolve!: (r: THREE.Group) => void, calls = 0;
  const loader = () => { calls++; return new Promise<THREE.Group>(r => { resolve = r; }); };
  p.setVisible(false); p.setOpacity(0.4); p.setShadowCasting(false); p.setReflectionEnvironment(env); p.setReflectionIntensity(0.2, 0.3);
  const first = p.prepare(loader); assert.equal(p.prepare(loader), first); await Promise.resolve(); assert.equal(calls, 1);
  resolve(root); await first;
  assert.equal(p.ready, true); assert.equal(p.diagnostics.visible, false); assert.equal(p.diagnostics.opacity, 0.4);
  assert.equal(p.diagnostics.materials!.bodyReflectionIntensity, 0.2);
  const body = original.body.material as THREE.MeshPhysicalMaterial;
  assert.equal(body.emissiveMap, original.maps[0]); assert.equal(body.roughnessMap, original.maps[1]);
  assert.equal(body.roughness, 1); assert.equal(body.side, THREE.FrontSide); assert.equal(body.transmission, 0.55);
  const roughnessPixels = (original.maps[1] as THREE.DataTexture).image.data;
  const green: number[] = [];
  for (let i = 1; i < roughnessPixels.length; i += 4) green.push(roughnessPixels[i]! / 255);
  assert.ok(Math.abs(Math.min(...green) - 0.18) < 0.005);
  assert.ok(Math.abs(Math.max(...green) - 0.28) < 0.005);
  assert.ok(new Set(green).size > 20, 'retain the continuous green-channel roughness ramp');
  for (const m of imported) assert.equal(disposed.get(m), 1);
  for (const map of original.maps) assert.equal(disposed.get(map), undefined);
  const owned = [body, original.eyes[0].material, original.body.customDepthMaterial!, original.body.customDistanceMaterial!,
    original.eyes[0].customDepthMaterial!, original.eyes[0].customDistanceMaterial!];
  for (const r of owned) r.addEventListener('dispose', () => disposed.set(r, (disposed.get(r) ?? 0) + 1));
  p.dispose(); p.dispose();
  for (const r of [...resources, ...owned]) assert.equal(disposed.get(r), 1);
  assert.equal(disposed.get(env), undefined); env.dispose();
});

test('failed load retries and late completion after unload releases data without attachment', async () => {
  const p = new VoltCharacterPresentation(); await assert.rejects(p.prepare(async () => { throw new Error('offline'); }), /offline/);
  await p.prepare(loadVolt); p.dispose();
  const late = new VoltCharacterPresentation(), root = await loadVolt(), asset = validateVoltAsset(root);
  let resolve!: (r: THREE.Group) => void;
  const pending = late.prepare(() => new Promise<THREE.Group>(r => { resolve = r; }));
  let disposed = 0; asset.maps[0].addEventListener('dispose', () => disposed++);
  await Promise.resolve(); late.dispose(); resolve(root); await pending;
  assert.equal(late.ready, false); assert.equal(late.root.children.length, 0); assert.equal(disposed, 1);
});

test('independent instances resolve each mesh dictionary, interpolate bounded morphs and reset every weight', async () => {
  const a = new VoltCharacterPresentation(), b = new VoltCharacterPresentation();
  await Promise.all([a.prepare(loadVolt), b.prepare(loadVolt)]);
  const eye = a.root.getObjectByName('Volt-Eye-Left') as THREE.Mesh;
  // Legal dictionaries can order controls differently on each mesh.
  const dictionary = eye.morphTargetDictionary!;
  const old = dictionary.Squash; dictionary.Squash = dictionary.Stretch; dictionary.Stretch = old;
  for (const channel of ['position', 'normal'] as const) {
    const targets = eye.geometry.morphAttributes[channel]!;
    [targets[0], targets[1]] = [targets[1]!, targets[0]!];
  }
  const s = state(); s.grounded = false;
  a.onLaunch({ directionWorld: new THREE.Vector3(0, 1, 0), speedMetresPerSecond: 6, chargeFraction: 0 });
  a.update(1 / 60, s); a.present(0.5);
  assert.ok(a.diagnostics.weights.Stretch > 0 && a.diagnostics.weights.Stretch <= 0.5);
  for (const m of a.diagnostics.meshes) assert.deepEqual(m.weights, a.diagnostics.weights);
  assert.equal(b.diagnostics.weights.Stretch, 0);
  assert.notEqual((a.root.getObjectByName('Volt-Body') as THREE.Mesh).geometry, (b.root.getObjectByName('Volt-Body') as THREE.Mesh).geometry);
  a.update(0, s); const paused = a.diagnostics; a.update(0, s); assert.deepEqual(a.diagnostics, paused);
  s.grounded = true; a.onLanding(new THREE.Vector3(0, 1, 0), 9); a.update(1 / 60, s);
  assert.ok(a.diagnostics.weights.Squash > 0); assert.equal(a.diagnostics.weights.Stretch, 0);
  a.update(2, s); assert.equal(a.diagnostics.weights.Squash, 0);
  a.reset(); for (const m of a.diagnostics.meshes) for (const name of VOLT_MORPHS) assert.equal(m.weights[name], 0);
  a.dispose(); b.dispose();
});

test('carrier/teleport/passive motion does not steer or flex, normal travel does and idle settles', () => {
  const p = new VoltCharacterPresentation(), s = state(), dt = 1 / 60;
  p.update(dt, s); p.setPosition(new THREE.Vector3(12, 3, 9)); p.update(dt, s);
  s.locomotionPositionWorld.x += 0.05; p.update(dt, s); assert.equal(p.diagnostics.facingYawRadians, 0);
  s.movementIntentWorld.x = 1; s.locomotionPositionWorld.x += 15; p.update(dt, s); assert.equal(p.diagnostics.facingYawRadians, 0);
  s.locomotionPositionWorld.x += 0.05; p.update(dt, s); assert.ok(p.diagnostics.facingYawRadians < 0);
  assert.ok(p.diagnostics.weights.CrestFlexRight > 0);
  s.movementIntentWorld.set(0, 0, 0); for (let i = 0; i < 120; i++) p.update(dt, s);
  assert.equal(p.diagnostics.weights.CrestFlexLeft + p.diagnostics.weights.CrestFlexRight, 0); p.dispose();
});

test('aim/fade separates navigation light, prewarm restores opacity and Volt death never resurrects', async () => {
  const p = new VoltCharacterPresentation(); await p.prepare(loadVolt);
  const light = new THREE.PointLight(); p.placement.add(light); p.setPosition(new THREE.Vector3(2, 0.46, 3));
  p.setOpacity(0); assert.equal(p.diagnostics.visible, false); assert.equal(light.visible, true);
  assert.deepEqual(light.getWorldPosition(new THREE.Vector3()).toArray(), [2, 0.46, 3]);
  p.setOpacity(0.3); await assert.rejects(prepareCharacterCameraFades([p], () => { throw new Error('compile'); }), /compile/);
  assert.equal(p.diagnostics.opacity, 0.3); p.setOpacity(1);
  const body = p.root.getObjectByName('Volt-Body') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  assert.equal((p.root.getObjectByName('Volt-Eye-Left') as typeof body).material.transparent, false);
  const position = new THREE.Vector3(2, 0.46, 3);
  assert.equal(p.startDeath(position), true); assert.equal(p.startDeath(position), false); p.updateDeath(0.08);
  p.setVisible(true); p.update(1 / 60, state()); p.present(); assert.equal(p.diagnostics.visible, false); assert.equal(body.castShadow, false);
  assert.deepEqual(p.diagnostics.deathBurst.origin.toArray(), position.toArray());
  p.finishDeath(position); assert.equal(p.diagnostics.visible, true); assert.equal(p.diagnostics.opacity, 1); p.dispose();
});

test('legal combined morphs preserve sole, volume, finite normals and outward non-collapsed faces', async () => {
  const root = await loadVolt(), asset = validateVoltAsset(root);
  const poses = [
    [0, 0, 0, 0, 0], [1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1],
    [0.5, 0, 0.5, 0.5, 0], [0, 0.5, 1, 0, 0.5],
  ];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const original = new THREE.Vector3(), deformed = new THREE.Vector3(), edge = new THREE.Vector3();
  for (const weights of poses) for (const mesh of [asset.body, ...asset.eyes]) {
    for (const [i, name] of VOLT_MORPHS.entries()) mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]] = weights[i]!;
    const positions = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal'), index = mesh.geometry.index!;
    let minimum = Infinity, maximum = -Infinity, volume = 0;
    for (let i = 0; i < positions.count; i++) {
      mesh.getVertexPosition(i, a);
      assert.ok(a.toArray().every(Number.isFinite)); minimum = Math.min(minimum, a.y); maximum = Math.max(maximum, a.y);
      b.fromBufferAttribute(normals, i);
      for (const name of VOLT_MORPHS) {
        const target = mesh.morphTargetDictionary![name];
        b.addScaledVector(c.fromBufferAttribute(mesh.geometry.morphAttributes.normal![target]!, i), mesh.morphTargetInfluences![target]!);
      }
      assert.ok(b.toArray().every(Number.isFinite) && b.length() > 0.1);
    }
    if (mesh === asset.body) {
      assert.ok(Math.abs(minimum + 0.45) < 1e-6);
      if (weights[3] === 0 && weights[4] === 0) {
        const height = 1.79 * (1 - 0.1 * weights[0]! + 0.09 * weights[1]!);
        assert.ok(Math.abs(maximum - (-0.45 + height)) < 1e-6);
      }
    }
    for (let i = 0; i < index.count; i += 3) {
      const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
      a.fromBufferAttribute(positions, ia); b.fromBufferAttribute(positions, ib); c.fromBufferAttribute(positions, ic);
      original.subVectors(b, a).cross(edge.subVectors(c, a));
      mesh.getVertexPosition(ia, a); mesh.getVertexPosition(ib, b); mesh.getVertexPosition(ic, c);
      volume += a.dot(deformed.crossVectors(b, c)) / 6;
      deformed.subVectors(b, a).cross(edge.subVectors(c, a));
      assert.ok(deformed.lengthSq() > 1e-20, `${mesh.name} collapsed face`);
      assert.ok(deformed.dot(original) > 0, `${mesh.name} inverted face`);
    }
    assert.ok(volume > 0);
    if (mesh === asset.body && weights[3] === 0 && weights[4] === 0) assert.ok(Math.abs(volume - 0.7985415) < 1e-5, 'body-only morphs preserve horizontal volume');
  }
  disposeVoltAsset(root);
});

test('authored blink/body motion keeps the complete eye outline seated', async () => {
  const root = await loadVolt(), asset = validateVoltAsset(root), ray = new THREE.Raycaster();
  const point = new THREE.Vector3();
  const poses = [[0, 0, 0, 0, 0], [1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0.5, 0]];
  for (const [eyeIndex, eye] of asset.eyes.entries()) {
    const basis = eye.geometry.getAttribute('position'), normals = eye.geometry.getAttribute('normal');
    const sign = eyeIndex === 0 ? -1 : 1, outline: number[] = [];
    for (let i = 0; i < basis.count; i++) {
      const vertical = (basis.getY(i) + 0.097) / 0.219;
      const horizontal = (basis.getX(i) - sign * 0.261 - sign * 0.014 * vertical) / (0.124 * (1 - 0.12 * vertical));
      if (Math.abs(horizontal * horizontal + vertical * vertical - 1) < 1e-5 && normals.getZ(i) < 0) outline.push(i);
    }
    assert.equal(outline.length, 64, 'sample the whole authored perimeter');
    for (const weights of poses) {
      for (const mesh of [asset.body, ...asset.eyes]) for (const [i, name] of VOLT_MORPHS.entries()) {
        mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]] = weights[i]!;
      }
      root.updateMatrixWorld(true);
      for (const index of outline) {
        eye.getVertexPosition(index, point);
        ray.set(new THREE.Vector3(point.x, point.y, -3), new THREE.Vector3(0, 0, 1));
        const hit = ray.intersectObject(asset.body)[0]; assert.ok(hit);
        const depth = hit.point.z - point.z;
        // Body-only volume compensation also scales the 2 mm seat in Z.
        const expected = -0.002 / Math.sqrt(1 - 0.1 * weights[0]! + 0.09 * weights[1]!);
        assert.ok(Math.abs(depth - expected) < 2e-5, `${eye.name} perimeter depth ${depth}`);
      }
    }
  }
  disposeVoltAsset(root);
});

test('visible and shadow passes share time/fade uniforms and use authored morph chunks', async () => {
  const p = new VoltCharacterPresentation(); await p.prepare(loadVolt);
  const body = p.root.getObjectByName('Volt-Body') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  const compile = (material: THREE.Material, type: string) => {
    const library = THREE.ShaderLib[type]!;
    const shader = { vertexShader: library.vertexShader, fragmentShader: library.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer); return shader;
  };
  const surface = compile(body.material, 'physical');
  for (const shadow of [compile(body.customDepthMaterial!, 'depth'), compile(body.customDistanceMaterial!, 'distance')]) {
    assert.match(shadow.vertexShader, /#include <morphtarget_vertex>/);
    assert.equal(shadow.uniforms.uBobSecondaryTime, surface.uniforms.uBobSecondaryTime);
    assert.equal(shadow.uniforms.uBobImpactStrength, surface.uniforms.uBobImpactStrength);
    for (const name of ['uVoltBaseOffset', 'uVoltCrestLag', 'uVoltLandingRipple']) {
      assert.equal(shadow.uniforms[name], surface.uniforms[name]);
    }
    assert.match(shadow.vertexShader, /transformed \+= voltElasticPosition\(position\) - position/);
    assert.ok(shadow.uniforms.uBobShadowOpacity);
  }
  assert.ok(Math.abs(p.diagnostics.materials!.maximumSecondaryDisplacementMetres - 0.0045) < 1e-12);
  p.update(1 / 60, state()); assert.equal(surface.uniforms.uBobSecondaryTime.value, 1 / 60);
  const eye = p.root.getObjectByName('Volt-Eye-Left') as THREE.Mesh;
  assert.equal(eye.userData.cameraFadeEye, true);
  const proxy = eye.clone(false); assert.equal(proxy.geometry, eye.geometry);
  assert.deepEqual(proxy.morphTargetDictionary, eye.morphTargetDictionary);
  assert.deepEqual(proxy.morphTargetInfluences, eye.morphTargetInfluences); p.dispose();
});
