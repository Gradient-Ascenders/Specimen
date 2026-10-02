import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { withIsolatedPrewarmState } from '../src/render/IsolatedResourcePrewarm.ts';
import { copyPrewarmMaterial, createShadowPrewarmMaterial, createDepthPrewarmGroup } from '../src/render/ShadowPrewarmMaterial.ts';
import { BlackoutPresentationPreparation } from '../src/render/BlackoutPresentationPreparation.ts';
import { CultivationPreparationQueue } from '../src/render/CultivationPreparationQueue.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { RenderShadowPolicy, type RenderLayer } from '../src/render/RenderLayer.ts';

function fixture() {
  let viewport = new THREE.Vector4(4, 5, 960, 600), scissor = viewport.clone(), test = false;
  const borrowedTarget = new THREE.WebGLCubeRenderTarget(8);
  let target: THREE.WebGLRenderTarget | null = borrowedTarget, face = 3, mip = 2;
  const renderer = {
    info: {render: {calls: 7, triangles: 42, points:0, lines:0, frame: 12}, programs: []},
    shadowMap: {enabled: true, autoUpdate: true, needsUpdate: true, type: THREE.PCFShadowMap as THREE.ShadowMapType},
    getViewport: (out: THREE.Vector4) => out.copy(viewport), setViewport: (v: THREE.Vector4 | number, y?: number, w?: number, h?: number) => { viewport = v instanceof THREE.Vector4 ? v.clone() : new THREE.Vector4(v, y, w, h); },
    getScissor: (out: THREE.Vector4) => out.copy(scissor), setScissor: (v: THREE.Vector4 | number, y?: number, w?: number, h?: number) => { scissor = v instanceof THREE.Vector4 ? v.clone() : new THREE.Vector4(v, y, w, h); },
    getScissorTest: () => test, setScissorTest: (v: boolean) => { test = v; },
    getRenderTarget: () => target, setRenderTarget: (v: THREE.WebGLRenderTarget | null, f = 0, m = 0) => { target = v; face = f; mip = m; },
    getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    properties: {get: () => ({})},
    extensions: {has: () => true}, initTexture: () => {}, initRenderTarget: (_target: THREE.WebGLRenderTarget) => {},
    compileAsync: async (_group: THREE.Object3D, _camera: THREE.Camera, _scene: THREE.Scene) => {},
    render: (_scene: THREE.Scene, _camera: THREE.Camera) => { renderer.info.render.calls++; },
  };
  const snapshot = () => ({viewport: viewport.toArray(), scissor: scissor.toArray(), test, target, face, mip, counters: {...renderer.info.render}, shadows: {...renderer.shadowMap}});
  return {renderer, snapshot, borrowedTarget};
}

test('preparation restores render target face, viewport, counters and shadow state before async settlement and after throws', async () => {
  const {renderer, snapshot, borrowedTarget} = fixture();
  const target = new THREE.WebGLRenderTarget(1, 1);
  const policy = new RenderShadowPolicy(renderer.shadowMap);
  const before = snapshot();
  const pending = withIsolatedPrewarmState(renderer as unknown as THREE.WebGLRenderer, () => policy.withPreparation(false, async () => {
    renderer.info.render.calls = 100;
    await Promise.resolve();
    assert.deepEqual(snapshot(), before);
  }), target);
  assert.deepEqual(snapshot(), before);
  await pending;
  assert.throws(() => withIsolatedPrewarmState(renderer as unknown as THREE.WebGLRenderer, () => {
    renderer.info.render.calls = 99; throw new Error('driver');
  }, target), /driver/);
  assert.deepEqual(snapshot(), before);
  withIsolatedPrewarmState(renderer as unknown as THREE.WebGLRenderer, () => { renderer.info.render.frame++; });
  assert.equal(renderer.info.render.frame, before.counters.frame + 1, 'upload generation must stay monotonic');
  target.dispose(); borrowedTarget.dispose();
});

test('cancelled Cultivation compile releases owned maps once and cannot overwrite the next shadow owner', async () => {
  const {renderer, borrowedTarget} = fixture(), scene = new THREE.Scene();
  const preview = new LevelTwoPreviewScene(() => {}); scene.add(preview.root);
  const policy = new RenderShadowPolicy(renderer.shadowMap);
  const camera = new THREE.PerspectiveCamera();
  const layer = {renderer, scene, cameraRig: {camera}, withShadowPreparation: policy.withPreparation.bind(policy)} as unknown as RenderLayer;
  const queue = new CultivationPreparationQueue(layer, preview);
  let release: (() => void) | undefined, mapDisposals = 0, mapCount = 0;
  renderer.initRenderTarget = target => { mapCount++; target.addEventListener('dispose', () => mapDisposals++); };
  renderer.compileAsync = async () => { await new Promise<void>(resolve => { release = resolve; }); };
  let borrowedDisposals = 0;
  const borrowed = new Set<THREE.BufferGeometry>();
  preview.root.traverse(object => { if (object instanceof THREE.Mesh) borrowed.add(object.geometry); });
  for (const geometry of borrowed) geometry.addEventListener('dispose', () => borrowedDisposals++);
  for (let i = 0; i < 1000 && !release; i++) queue.tick(0, true);
  assert.ok(release, 'reaches the asynchronous compiler batch');
  queue.dispose(); queue.dispose();
  const next = policy.request('next-level', {enabled:true});
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(policy.activeOwner, 'next-level'); assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(mapDisposals, mapCount); assert.ok(mapCount > 0);
  assert.equal(borrowedDisposals, 0);
  next.dispose(); preview.dispose(); borrowedTarget.dispose();
});

test('custom shadow copies preserve deformation/dissolve hooks and uniform ownership, clipping and alpha variants', () => {
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture();
  const surface = new THREE.MeshStandardMaterial({map: texture, alphaTest: .2, displacementMap: texture, displacementScale: .4});
  surface.clipShadows = true; surface.clippingPlanes = [new THREE.Plane()]; surface.clipIntersection = true;
  surface.shadowSide = THREE.DoubleSide; surface.alphaToCoverage = true;
  const uniforms = {coverage: {value: .5}};
  const depth = new THREE.ShaderMaterial({uniforms});
  depth.customProgramCacheKey = () => 'owned-dissolve';
  depth.onBeforeCompile = () => {};
  const mesh = new THREE.InstancedMesh(geometry, surface, 1); mesh.castShadow = true; mesh.customDepthMaterial = depth;
  const material = createShadowPrewarmMaterial(mesh, surface, false);
  assert.equal((material as unknown as THREE.ShaderMaterial).uniforms, uniforms);
  assert.equal(material.onBeforeCompile, depth.onBeforeCompile);
  assert.equal(material.customProgramCacheKey(), 'owned-dissolve');
  assert.equal(material.alphaTest, .5); assert.equal(material.map, texture);
  assert.equal(material.clippingPlanes, surface.clippingPlanes); assert.equal(material.clipShadows, true);
  assert.equal(material.displacementScale, .4); assert.equal(material.side, THREE.DoubleSide);
  let borrowedDisposals = 0;
  for (const resource of [geometry, texture, surface, depth]) resource.addEventListener('dispose', () => borrowedDisposals++);
  const batch = createDepthPrewarmGroup(mesh);
  assert.ok(batch.group.children[0] instanceof THREE.InstancedMesh);
  assert.equal(batch.group.children[0].geometry, geometry);
  batch.dispose(); batch.dispose(); material.dispose();
  const copy = copyPrewarmMaterial(depth); copy.dispose();
  assert.equal(borrowedDisposals, 0);
  mesh.dispose(); geometry.dispose(); texture.dispose(); surface.dispose(); depth.dispose();
});

for (const mode of ['complete', 'reject', 'cancel']) test(`Blackout prepares hidden forms and restores/disposes owned resources (${mode})`, async () => {
  const {renderer, snapshot, borrowedTarget} = fixture();
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, material); mesh.visible = false; mesh.castShadow = true; mesh.name = 'Bob-Eye-Left';
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial(); mesh.customDepthMaterial.customProgramCacheKey = () => 'bob-depth';
  scene.add(mesh);
  const light = new THREE.SpotLight(); light.castShadow = true; light.intensity = 0; scene.add(light);
  let borrowedDisposals = 0, ownedDisposals = 0;
  for (const resource of [geometry, material, mesh.customDepthMaterial]) resource.addEventListener('dispose', () => borrowedDisposals++);
  let release: (() => void) | undefined;
  const observed = new Set<THREE.Material>();
  renderer.compileAsync = async (group, _camera, targetScene) => {
    if (group.children.some(o => o instanceof THREE.Mesh && o.material instanceof THREE.MeshDepthMaterial)) assert.equal(targetScene.fog, null);
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const m = object.material;
      if (!observed.has(m)) { observed.add(m); m.addEventListener('dispose', () => ownedDisposals++); }
    });
    if (mode === 'reject') throw new Error('compile rejected');
    if (mode === 'cancel') await new Promise<void>(resolve => { release = resolve; });
  };
  const policy = new RenderShadowPolicy(renderer.shadowMap);
  const before = snapshot();
  const layer = {renderer, scene, withShadowPreparation: policy.withPreparation.bind(policy)} as unknown as RenderLayer;
  const preparation = new BlackoutPresentationPreparation();
  const promise = preparation.prepare(layer, camera);
  assert.deepEqual(snapshot(), before);
  if (mode === 'cancel') {
    preparation.dispose(); assert.equal(ownedDisposals, 0, 'pending compile retains its copies'); release!();
  }
  if (mode === 'reject') await assert.rejects(promise, /compile rejected/); else await promise;
  assert.equal(mesh.parent, scene); assert.equal(mesh.visible, false);
  assert.equal(borrowedDisposals, 0); assert.deepEqual(snapshot(), before);
  if (mode === 'complete') {
    assert.ok([...observed].some(m => m.transparent));
    assert.ok([...observed].some(m => m.customProgramCacheKey() === 'bob-depth'));
    assert.equal([...observed].some(m => m instanceof THREE.MeshDistanceMaterial), false);
    assert.equal(light.shadow.needsUpdate, true);
  }
  preparation.dispose(); preparation.dispose();
  assert.equal(ownedDisposals, observed.size);
  assert.equal(borrowedDisposals, 0);
  geometry.dispose(); material.dispose(); mesh.customDepthMaterial.dispose(); borrowedTarget.dispose();
});
