import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { prepareShadowSamplerMaps, renderIsolatedConfiguration, withIsolatedPrewarmState } from '../src/render/IsolatedResourcePrewarm.ts';
import { copyPrewarmMaterial, createShadowPrewarmMaterial, createDepthPrewarmGroup } from '../src/render/ShadowPrewarmMaterial.ts';
import { ShadowedDroneBeam } from '../src/render/hazards/ShadowedDroneBeam.ts';
import { BlackoutPresentationPreparation } from '../src/render/BlackoutPresentationPreparation.ts';
import { CultivationPreparationQueue } from '../src/render/CultivationPreparationQueue.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { RenderShadowPolicy, type RenderLayer } from '../src/render/RenderLayer.ts';
import { VoltCharacterPresentation } from '../src/render/volt/VoltCharacterPresentation.ts';
import { loadVolt } from './fixtures/VoltAssetFixture.ts';
import { OpeningGameScene } from '../src/cinematics/OpeningGameScene.ts';
import { TitleScreenScene } from '../src/ui/TitleScreenScene.ts';

function fixture() {
  let viewport = new THREE.Vector4(4, 5, 960, 600), scissor = viewport.clone(), test = false;
  const borrowedTarget = new THREE.WebGLCubeRenderTarget(8);
  let target: THREE.WebGLRenderTarget | null = borrowedTarget, face = 3, mip = 2;
  const renderer = {
    transmissionResolutionScale: 0.5,
    getPixelRatio: () => 0.75,
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
  const snapshot = () => ({viewport: viewport.toArray(), scissor: scissor.toArray(), test, target, face, mip, transmissionScale: renderer.transmissionResolutionScale, counters: {...renderer.info.render}, shadows: {...renderer.shadowMap}});
  return {renderer, snapshot, borrowedTarget};
}

for (const fail of [false,true]) test(`retained-camera transmission primer isolates bounded clones and restores ownership (${fail})`, () => {
  const live=new THREE.Scene(), prepared=new THREE.Scene(), camera=new THREE.PerspectiveCamera();
  const geometry=new THREE.BoxGeometry(), material=new THREE.MeshPhysicalMaterial({transmission:.28});
  const original=new THREE.Mesh(geometry,material), proxy=new THREE.Mesh(geometry,material);
  original.layers.enable(31);
  const liveLight=new THREE.PointLight(), selected=new THREE.PointLight(), excluded=new THREE.PointLight();excluded.layers.mask=0;
  live.add(original,liveLight);prepared.add(selected,excluded);
  const objects=[original,proxy,liveLight,selected,excluded,camera], masks=objects.map(o=>o.layers.mask);
  const renderer={render(scene:THREE.Scene,view:THREE.Camera){
    assert.equal(scene,live);assert.equal(view,camera);
    assert.equal(camera.layers.test(original.layers),false);assert.equal(camera.layers.test(liveLight.layers),false);
    assert.equal(camera.layers.test(selected.layers),true);assert.equal(camera.layers.test(excluded.layers),false);
    assert.equal(camera.layers.test(proxy.layers),true);
    if(fail) throw Error('driver');
  }} as THREE.WebGLRenderer;
  if(fail) assert.throws(()=>renderIsolatedConfiguration(renderer,live,camera,prepared,[proxy]),/driver/);
  else renderIsolatedConfiguration(renderer,live,camera,prepared,[proxy]);
  assert.deepEqual(objects.map(o=>o.layers.mask),masks);assert.equal(prepared.parent,null);assert.equal(proxy.parent,null);
  assert.deepEqual(live.children,[original,liveLight]);geometry.dispose();material.dispose();
});

test('preparation restores render target face, viewport, counters and shadow state before async settlement and after throws', async () => {
  const {renderer, snapshot, borrowedTarget} = fixture();
  const target = new THREE.WebGLRenderTarget(1, 1);
  const policy = new RenderShadowPolicy(renderer.shadowMap);
  const before = snapshot();
  const pending = withIsolatedPrewarmState(renderer as unknown as THREE.WebGLRenderer, () => policy.withPreparation(false, async () => {
    assert.equal(renderer.transmissionResolutionScale, 1, 'one-pixel primers keep a nonzero transmission target');
    assert.deepEqual(renderer.getViewport(new THREE.Vector4()).toArray(), [0, 0, 2, 2]);
    renderer.info.render.calls = 100;
    await Promise.resolve();
    assert.deepEqual(snapshot(), before);
  }), target);
  assert.deepEqual(snapshot(), before);
  await pending;
  assert.throws(() => withIsolatedPrewarmState(renderer as unknown as THREE.WebGLRenderer, () => {
    assert.equal(renderer.transmissionResolutionScale, 1);
    renderer.info.render.calls = 99; throw new Error('driver');
  }, target), /driver/);
  assert.deepEqual(snapshot(), before);
  withIsolatedPrewarmState(renderer as unknown as THREE.WebGLRenderer, () => { renderer.info.render.frame++; });
  assert.equal(renderer.info.render.frame, before.counters.frame + 1, 'upload generation must stay monotonic');
  target.dispose(); borrowedTarget.dispose();
});

test('tiny preparation viewports retain a physical transmission texel below native resolution', () => {
  for (const density of [.1, .5, .75, 1, 2]) for (const transmissionResolutionScale of [.5, 1]) {
    const { renderer, snapshot, borrowedTarget } = fixture();
    const scaled = Object.assign(renderer, { getPixelRatio: () => density, transmissionResolutionScale });
    const before = snapshot(), target = new THREE.WebGLRenderTarget(1, 1);
    for (const destination of [undefined, target]) withIsolatedPrewarmState(scaled as unknown as THREE.WebGLRenderer, () => {
      const [x, y, width, height] = snapshot().viewport;
      assert.equal(scaled.transmissionResolutionScale, 1);
      assert.ok(Math.floor(width * density * scaled.transmissionResolutionScale) >= 1);
      assert.ok(Math.floor(height * density * scaled.transmissionResolutionScale) >= 1);
      if (!destination) assert.ok(x + width < 0 && y + height < 0);
      assert.ok(width * density < 4 && height * density < 4);
    }, destination);
    assert.deepEqual(snapshot(), before);
    target.dispose(); borrowedTarget.dispose();
  }
});

for (const scale of [.5, 1]) test(`opening primers retain live transmission dimensions and restore scale ${scale}`, async () => {
  const {renderer, borrowedTarget} = fixture();
  renderer.transmissionResolutionScale = scale;
  const policy = new RenderShadowPolicy(renderer.shadowMap);
  const room = new TitleScreenScene();
  const opening = new OpeningGameScene(room, undefined, {yieldFrame: async () => {}});
  const previousViewport = new THREE.Vector4(0, 0, 12, 12);
  room.camera.viewport = previousViewport;
  // Model/resource loading is tested separately; inspect the real opening's
  // preparation calls without requiring a GPU in the Node test runner.
  opening.bob.prepare = async () => {};
  opening.laboratory.prepare = async () => {};
  const tinyScales: number[] = [], liveScales: number[] = [];
  renderer.render = (_scene, camera) => {
    const target = renderer.getRenderTarget();
    if (tinyScales.length === 0) assert.deepEqual(camera.viewport?.toArray(), [3, 3, 720, 450],
      'Use physical live dimensions, not the shadow pass\'s one-pixel target viewport.');
    else assert.equal(camera.viewport, previousViewport);
    (target?.width === 1 ? tinyScales : liveScales).push(renderer.transmissionResolutionScale);
  };
  const context = {SYNC_GPU_COMMANDS_COMPLETE:1, ALREADY_SIGNALED:2, CONDITION_SATISFIED:3, WAIT_FAILED:4,
    fenceSync: () => ({}), clientWaitSync: () => 2, deleteSync: () => {}, flush: () => {}, isContextLost: () => false};
  Object.assign(renderer, {getContext: () => context});
  try {
    await opening.prepare({renderer: renderer as unknown as THREE.WebGLRenderer,
      withShadowPreparation: (paused, draw) => policy.withPreparation(paused, draw)});
    assert.deepEqual(tinyScales, [scale, 1], 'only the camera-sized transmission primer restores fractional quality');
    assert.deepEqual(liveScales, [scale], 'the first visible-size prime retains the requested quality');
    assert.equal(room.camera.viewport, previousViewport);
    assert.equal(renderer.transmissionResolutionScale, scale);
    assert.ok(renderer.getRenderTarget() === borrowedTarget);
  } finally { opening.dispose(); borrowedTarget.dispose(); }
});

test('cancelled Cultivation compile releases owned maps once and cannot overwrite the next shadow owner', async () => {
  const {renderer, borrowedTarget} = fixture(), scene = new THREE.Scene();
  const preview = new LevelTwoPreviewScene(() => {}, cultivationAssets); scene.add(preview.root);
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


for (const type of [THREE.PCFShadowMap, THREE.BasicShadowMap]) test(`cinematic camera changes initialize only missing shadow samplers and retain cached maps (${type})`, () => {
  const {renderer, snapshot, borrowedTarget} = fixture(); renderer.shadowMap.type = type;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const lights = [new THREE.SpotLight(), new THREE.SpotLight()];
  for (const light of lights) { light.castShadow = true; light.shadow.autoUpdate = false; light.shadow.needsUpdate = false; }
  lights[1].layers.mask = 0; scene.add(mesh, ...lights);
  const comparison = type === THREE.PCFShadowMap ? THREE.LessEqualCompare : null;
  let draws = 0;
  renderer.render = (drawScene, view) => {
    draws++;
    assert.equal(drawScene, scene);
    assert.equal(view.layers.test(mesh.layers), false, 'sampler allocation never submits the room geometry');
    assert.equal(renderer.shadowMap.enabled, true); assert.equal(renderer.shadowMap.needsUpdate, true);
    for (const light of lights) if (light.layers.test(view.layers) && light.shadow.needsUpdate) {
      const map = new THREE.WebGLRenderTarget(1, 1);
      map.depthTexture = new THREE.DepthTexture(1, 1); map.depthTexture.compareFunction = comparison;
      light.shadow.map = map; light.shadow.needsUpdate = false;
    }
  };
  const before = snapshot();
  try {
    prepareShadowSamplerMaps(renderer as unknown as THREE.WebGLRenderer, scene, camera);
    const first = lights[0].shadow.map;
    assert.equal(first?.depthTexture?.compareFunction, comparison);
    assert.equal(lights[1].shadow.map, null, 'an unselected camera layout allocates nothing');
    assert.equal(lights[0].shadow.needsUpdate, true, 'the first live frame must capture real casters');
    lights[0].layers.mask = 0; lights[1].layers.mask = 1;
    prepareShadowSamplerMaps(renderer as unknown as THREE.WebGLRenderer, scene, camera);
    assert.equal(lights[1].shadow.map?.depthTexture?.compareFunction, comparison);
    assert.equal(lights[0].shadow.map, first, 'the previous camera keeps its owned map');
    lights[0].layers.mask = 1;
    prepareShadowSamplerMaps(renderer as unknown as THREE.WebGLRenderer, scene, camera);
    assert.equal(draws, 2, 'returning to prepared light layouts performs no extra draw');
    assert.ok(lights.every(light => !light.shadow.autoUpdate && light.shadow.needsUpdate));
    assert.deepEqual(snapshot(), before); assert.equal(camera.layers.mask, 1); assert.equal(mesh.layers.mask, 1);
  } finally {
    for (const light of lights) { light.shadow.map?.depthTexture?.dispose(); light.shadow.dispose(); }
    mesh.geometry.dispose(); mesh.material.dispose(); borrowedTarget.dispose();
  }
});

test('Blackout allocates PCF maps before isolated receiver draws', async () => {
  const { renderer, borrowedTarget } = fixture();
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.castShadow = mesh.receiveShadow = true;
  const light = new THREE.SpotLight(); light.castShadow = true;
  scene.add(mesh, light);
  let isolatedDraws = 0;
  renderer.render = (drawScene) => {
    if (drawScene === scene && scene.children.some(o => o instanceof THREE.Group)) {
      isolatedDraws++;
      assert.equal(light.shadow.map?.depthTexture?.compareFunction, THREE.LessEqualCompare,
        'PCF receiver proxies require an allocated comparison texture');
    } else if (drawScene === scene) {
      const map = new THREE.WebGLRenderTarget(1, 1);
      map.depthTexture = new THREE.DepthTexture(1, 1);
      map.depthTexture.compareFunction = THREE.LessEqualCompare;
      light.shadow.map = map;
    }
  };
  const policy = new RenderShadowPolicy(renderer.shadowMap);
  const layer = { renderer, scene, withShadowPreparation: policy.withPreparation.bind(policy) } as unknown as RenderLayer;
  const preparation = new BlackoutPresentationPreparation();
  try {
    await preparation.prepare(layer, camera);
    assert.ok(isolatedDraws > 0);
    assert.equal(light.shadow.needsUpdate, true);
  } finally {
    preparation.dispose(); light.shadow.map?.depthTexture?.dispose(); light.shadow.map?.dispose();
    mesh.geometry.dispose(); mesh.material.dispose(); borrowedTarget.dispose();
  }
});


test('unallocated drone beam shadows bind a matching fallback without becoming visible', () => {
  const light = new THREE.SpotLight();
  const beam = new ShadowedDroneBeam(light, 10, .34), { mesh } = beam;
  const material = mesh.material;
  const fallback = material.uniforms.beamShadow.value as THREE.DepthTexture;
  assert.ok(fallback.version > 0, 'fallback must upload before its first draw');
  let disposals = 0; fallback.addEventListener('dispose', () => disposals++);
  const renderer = { shadowMap: { type: THREE.PCFShadowMap } } as THREE.WebGLRenderer;
  const draw = () => mesh.onBeforeRender(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), mesh.geometry, material, null);
  draw();
  assert.equal(fallback.compareFunction, THREE.LessEqualCompare);
  assert.equal(material.uniforms.beamShadowReady.value, false);
  renderer.shadowMap.type = THREE.BasicShadowMap;
  beam.setShadowType(renderer.shadowMap.type);
  assert.equal(fallback.compareFunction, null, 'hidden preparation copies must already have a raw-depth fallback');
  draw();
  assert.equal(disposals, 1, 'switching to raw sampling releases the comparison-mode GPU allocation');
  assert.equal(fallback.compareFunction, null);
  assert.equal(material.defines.SHADOW_COMPARE, undefined);
  const map = new THREE.WebGLRenderTarget(1, 1);
  map.depthTexture = new THREE.DepthTexture(1, 1); light.shadow.map = map; draw();
  assert.equal(material.uniforms.beamShadow.value, map.depthTexture);
  assert.equal(material.uniforms.beamShadowReady.value, true);
  renderer.shadowMap.type = THREE.PCFShadowMap; draw();
  assert.equal(disposals, 2, 'switching back recreates the comparison texture');
  assert.equal(material.uniforms.beamShadow.value, fallback, 'a raw light map cannot survive in a hidden comparison-sampler copy');
  assert.equal(material.uniforms.beamShadowReady.value, false);
  material.dispose(); assert.equal(disposals, 3);
  mesh.geometry.dispose(); map.depthTexture.dispose(); map.dispose();
});

test('hidden Volt prewarms morph, transmission, faded-eye and actual caster variants without changing live state', async () => {
  const { renderer, borrowedTarget } = fixture();
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), volt = new VoltCharacterPresentation();
  await volt.prepare(loadVolt); volt.setVisible(false); scene.add(volt.root);
  const expectedMorphs = new Map<THREE.BufferGeometry, { mesh: THREE.Mesh; dictionary: Record<string, number>; influences: number[] }>();
  volt.root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.name.startsWith('Volt-')) return;
    if (object.name === 'Volt-Body') {
      assert.equal(object.geometry.morphAttributes.position!.length, 6);
      object.morphTargetInfluences![object.morphTargetDictionary!.Headroom] = 0.35;
    } else assert.equal(object.geometry.morphAttributes.position!.length, 5);
    expectedMorphs.set(object.geometry, { mesh: object, dictionary: { ...object.morphTargetDictionary }, influences: [...object.morphTargetInfluences!] });
  });
  const light = new THREE.SpotLight(); light.castShadow = true; scene.add(light);
  const variants = new Set<string>();
  renderer.compileAsync = async group => {
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.name.startsWith('Volt-')) return;
      assert.equal(object.geometry.morphTargetsRelative, true);
      const expected = expectedMorphs.get(object.geometry)!; assert.ok(expected, 'proxy retains its live geometry');
      assert.equal(object.geometry.morphAttributes.position!.length, expected.influences.length);
      assert.equal(object.geometry.morphAttributes.normal!.length, expected.influences.length);
      assert.deepEqual(object.morphTargetDictionary, expected.dictionary);
      assert.deepEqual(object.morphTargetInfluences, expected.influences, 'retain the live headroom pose while prewarming');
      const material = object.material as THREE.Material;
      variants.add(`${object.name}:${material.type}:${material.transparent}`);
    });
  };
  const policy = new RenderShadowPolicy(renderer.shadowMap), preparation = new BlackoutPresentationPreparation();
  const before = volt.diagnostics;
  try {
    await preparation.prepare({ renderer, scene, withShadowPreparation: policy.withPreparation.bind(policy) } as unknown as RenderLayer, camera);
    for (const name of ['Volt-Body', 'Volt-Eye-Left', 'Volt-Eye-Right']) {
      assert.ok(variants.has(`${name}:MeshPhysicalMaterial:true`));
      assert.ok(variants.has(`${name}:MeshDepthMaterial:false`));
      if (name !== 'Volt-Body') assert.ok(variants.has(`${name}:MeshPhysicalMaterial:false`));
    }
    assert.deepEqual(volt.diagnostics, before);
    for (const expected of expectedMorphs.values()) assert.deepEqual(expected.mesh.morphTargetInfluences, expected.influences);
  } finally { preparation.dispose(); volt.dispose(); borrowedTarget.dispose(); }
});

test('instance primers upload both live buffers sharing a geometry and never dispose borrowed storage', async () => {
  const { renderer, borrowedTarget } = fixture();
  const scene = new THREE.Scene(), preview = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  scene.add(preview.root);
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  geometry.morphAttributes.position = [geometry.getAttribute('position').clone()];
  const morph = new THREE.Mesh(geometry, material);
  morph.morphTargetInfluences![0] = .4;
  const originals = [new THREE.InstancedMesh(geometry, material, 2), new THREE.InstancedMesh(geometry, material, 2)];
  for (const [index, mesh] of originals.entries()) {
    mesh.name = `shared-geometry-live-instance-${index}`;
    mesh.setColorAt(0, new THREE.Color('red'));
    mesh.setMorphAt(0, morph);
    scene.add(mesh);
  }
  const buffers = new Set<THREE.InstancedBufferAttribute>();
  let textureDisposals = 0;
  for (const mesh of originals) mesh.morphTexture!.addEventListener('dispose', () => textureDisposals++);
  const maps = originals.map(mesh => ({matrix:mesh.instanceMatrix, color:mesh.instanceColor, morph:mesh.morphTexture}));
  renderer.render = prepared => {
    prepared.traverseVisible(object => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      if ([object.material].flat().every(material => !material.visible)) return;
      buffers.add(object.instanceMatrix);
      if (object.instanceColor) buffers.add(object.instanceColor);
      // Model Three's disposal listener: releasing a proxy must not release
      // attributes that are still owned by a live mesh.
      if (!object.hasEventListener('dispose', release)) object.addEventListener('dispose', release);
    });
  };
  function release(event: THREE.Event<'dispose', THREE.InstancedMesh>): void {
    buffers.delete(event.target.instanceMatrix);
    if (event.target.instanceColor) buffers.delete(event.target.instanceColor);
  }
  const policy = new RenderShadowPolicy(renderer.shadowMap);
  const layer = {renderer, scene, cameraRig:{camera:new THREE.PerspectiveCamera()}, withShadowPreparation:policy.withPreparation.bind(policy)} as unknown as RenderLayer;
  const queue = new CultivationPreparationQueue(layer, preview);
  const raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => Number(setTimeout(() => callback(performance.now()), 0));
  try {
    await queue.prepareInitial();
    for (const {matrix, color} of maps) {
      assert.ok(buffers.has(matrix), 'warm the actual source matrix buffer');
      assert.ok(buffers.has(color!), 'same-geometry instances need their own color buffers');
    }
    preview.updatePresentationVisibility({z:0}, {z:0});
    const before = buffers.size;
    renderer.render(scene);
    assert.equal(buffers.size, before, 'the first live draw creates no instance buffers');
    queue.dispose();
    for (const {matrix, color} of maps) { assert.ok(buffers.has(matrix)); assert.ok(buffers.has(color!)); }
    assert.equal(textureDisposals, 0, 'proxy cleanup preserves live morph textures');
    originals.forEach((mesh, i) => {
      assert.equal(mesh.instanceMatrix, maps[i].matrix);
      assert.equal(mesh.instanceColor, maps[i].color);
      assert.equal(mesh.morphTexture, maps[i].morph);
    });
  } finally {
    queue.dispose(); globalThis.requestAnimationFrame = raf;
    for (const mesh of originals) mesh.dispose();
    preview.dispose(); geometry.dispose(); material.dispose(); borrowedTarget.dispose();
  }
  assert.equal(textureDisposals, 2);
});
