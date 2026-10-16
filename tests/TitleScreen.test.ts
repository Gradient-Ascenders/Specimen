import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { TitleScreenScene, TITLE_EGG_CENTRE, TITLE_ORBIT_RADIUS_METRES, TITLE_ORBIT_SECONDS,
  TITLE_WOBBLE_START_SECONDS, TITLE_WOBBLE_INTERVAL_SECONDS, TITLE_WOBBLE_DURATION_SECONDS } from '../src/ui/TitleScreenScene.ts';
import { TitleScreenPresentation, TITLE_PIXEL_BUDGET } from '../src/ui/TitleScreenPresentation.ts';
import { RenderShadowPolicy, type RenderLayer } from '../src/render/RenderLayer.ts';

test('title camera completes a seamless 360 orbit inside the room, always looking at the egg', () => {
  const title = new TitleScreenScene(), target = new THREE.Vector3().copy(TITLE_EGG_CENTRE);
  const direction = new THREE.Vector3(), expected = new THREE.Vector3();
  title.update(0, 16 / 9);
  const firstPosition = title.camera.position.clone(), firstQuaternion = title.camera.quaternion.clone();
  let previousAngle = Math.atan2(firstPosition.x, firstPosition.z - target.z), totalAngle = 0;
  for (let seconds = 0; seconds <= TITLE_ORBIT_SECONDS; seconds += 0.5) {
    title.update(seconds, 16 / 9);
    const camera = title.camera;
    assert.ok(Math.abs(camera.position.x) < 6.6 && Math.abs(camera.position.z) < 5.5);
    assert.ok(Math.abs(Math.hypot(camera.position.x, camera.position.z - target.z) - TITLE_ORBIT_RADIUS_METRES) < 1e-9);
    camera.getWorldDirection(direction);
    expected.copy(target).sub(camera.position).normalize();
    assert.ok(direction.dot(expected) > 1 - 1e-10);
    const angle = Math.atan2(camera.position.x, camera.position.z - target.z);
    totalAngle += Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle));
    previousAngle = angle;
  }
  assert.ok(Math.abs(totalAngle - Math.PI * 2) < 1e-9);
  assert.ok(title.camera.position.distanceTo(firstPosition) < 1e-9);
  assert.ok(title.camera.quaternion.angleTo(firstQuaternion) < 1e-7);
  title.dispose();
});

test('egg shakes frequently from its base but remains intact, contained and seated without new resources', () => {
  const title = new TitleScreenScene();
  const counts = title.resources.diagnostics, children: THREE.Object3D[] = [];
  title.scene.traverse(object => children.push(object));
  assert.ok(TITLE_WOBBLE_INTERVAL_SECONDS < 7 && TITLE_WOBBLE_START_SECONDS <= 2);
  for (const seconds of [0, 0.5, TITLE_WOBBLE_START_SECONDS - 0.01,
    TITLE_WOBBLE_START_SECONDS + TITLE_WOBBLE_DURATION_SECONDS + 0.1]) {
    assert.equal(title.update(seconds, 16 / 9), false);
    assert.equal(title.eggRoot.rotation.x, 0);
    assert.equal(title.eggRoot.rotation.z, 0);
  }
  for (const seconds of [TITLE_WOBBLE_START_SECONDS + 0.7,
    TITLE_WOBBLE_START_SECONDS + TITLE_WOBBLE_INTERVAL_SECONDS + 0.7]) {
    assert.equal(title.update(seconds, 16 / 9), true);
    assert.ok(Math.abs(title.eggRoot.rotation.z) > 0.06);
  }
  let strongestRock = 0, largestTopSwing = 0;
  const bottom = new THREE.Vector3(), top = new THREE.Vector3();
  for (let seconds = 0; seconds < 100; seconds += 1 / 60) {
    title.update(seconds, 16 / 9);
    title.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(title.eggRoot, true);
    assert.ok(bounds.min.y > 1.65 && bounds.max.y < 2.8);
    assert.ok(bounds.min.y < 1.69, 'The shell must stay seated, not hover during the shake.');
    assert.ok(bounds.min.x > -0.94 && bounds.max.x < 0.94);
    assert.ok(Math.hypot(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
      Math.max(Math.abs(bounds.min.z - TITLE_EGG_CENTRE.z), Math.abs(bounds.max.z - TITLE_EGG_CENTRE.z))) < 1.05,
    'The shaking shell must clear the cylindrical glass.');
    assert.equal(title.shell.visible, true);
    strongestRock = Math.max(strongestRock, Math.abs(title.eggRoot.rotation.z));
    bottom.set(0, -0.5, 0).applyMatrix4(title.eggRoot.matrixWorld);
    top.set(0, 0.5, 0).applyMatrix4(title.eggRoot.matrixWorld);
    assert.ok(Math.hypot(bottom.x, bottom.z - TITLE_EGG_CENTRE.z) < 1e-7,
      'The bottom must stay laterally anchored while the top rocks.');
    assert.ok(Math.abs(bottom.y - 1.66) < 0.035);
    largestTopSwing = Math.max(largestTopSwing, Math.hypot(top.x, top.z - TITLE_EGG_CENTRE.z));
  }
  const after: THREE.Object3D[] = [];
  title.scene.traverse(object => after.push(object));
  assert.deepEqual(after, children);
  assert.deepEqual(title.resources.diagnostics, counts);
  assert.ok(strongestRock > 0.15 && strongestRock < THREE.MathUtils.degToRad(13),
    'The shake should stay noticeable, with a softened peak below 13 degrees.');
  assert.ok(largestTopSwing > 0.15);
  assert.equal(title.shell.parent, title.eggRoot);
  assert.ok(title.scene.getObjectByName('title-pod-curved-glass'));
  assert.equal(title.scene.getObjectByName('title-pod-curved-glass')!.parent, title.pod);
  assert.ok(!after.some(object => /room-1-|sticky|laser|vent|pressure-plate/.test(object.name)),
    'The menu must not import gameplay obstacles or the authored gameplay room.');
  const lights: THREE.Light[] = [];
  title.scene.traverse(object => { if (object instanceof THREE.Light) lights.push(object); });
  assert.equal(lights.length, 4);
  assert.equal(lights.filter(light => light.castShadow).length, 1);
  assert.deepEqual(title.keyLight.shadow.mapSize.toArray(), [512, 512]);
  title.dispose();
});

test('tapered egg normals are smooth across the UV seam and poles', () => {
  const title = new TitleScreenScene();
  const geometry = title.shell.geometry, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const coincident = new Map<string, number[]>(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    const key = [positions.getX(index), positions.getY(index), positions.getZ(index)]
      .map(value => Math.round(value * 1e6)).join(',');
    const group = coincident.get(key) ?? []; group.push(index); coincident.set(key, group);
    assert.ok(Math.abs(a.fromBufferAttribute(normals, index).length() - 1) < 1e-6);
  }
  let seamsChecked = 0;
  for (const group of coincident.values()) if (group.length > 1) {
    a.fromBufferAttribute(normals, group[0]); seamsChecked++;
    for (const index of group.slice(1)) {
      assert.ok(a.distanceTo(b.fromBufferAttribute(normals, index)) < 1e-6,
        'Coincident vertices must share the same surface normal instead of a visible shading split.');
    }
  }
  assert.ok(seamsChecked >= 20);
  title.dispose();
});

test('pod supports do not stripe the egg with bar shadows, while the egg still receives and casts other shadows', () => {
  const title = new TitleScreenScene();
  for (let index = 0; index < 4; index++) {
    const support = title.scene.getObjectByName(`title-pod-stanchion-${index}`)!;
    assert.equal(support.visible, true);
    assert.equal(support.castShadow, false);
  }
  assert.equal(title.keyLight.castShadow, true);
  assert.equal(title.shell.castShadow, true);
  assert.equal(title.shell.receiveShadow, true);
  title.dispose();
});

test('two-line specimen plate replaces the four-light panel on the front of the pedestal', () => {
  const title = new TitleScreenScene();
  const plate = title.pod.getObjectByName('title-pod-specimen-label');
  assert.ok(plate instanceof THREE.Mesh);
  assert.equal(plate.parent, title.pod);
  assert.equal(title.pod.getObjectByName('title-pod-instrument-bezel'), undefined);
  for (let index = 0; index < 4; index++) {
    assert.equal(title.pod.getObjectByName(`title-pod-status-${index}`), undefined);
  }
  assert.equal(plate.position.y, 1.05);
  assert.ok(plate.geometry instanceof THREE.CylinderGeometry);
  assert.equal(plate.geometry.parameters.thetaStart, -0.5);
  assert.equal(plate.geometry.parameters.thetaLength, 1);
  assert.ok(plate.material instanceof THREE.MeshStandardMaterial);
  const texture = plate.material.map;
  assert.ok(texture instanceof THREE.DataTexture);
  assert.deepEqual(texture.userData.labelLines, ['SPECIMEN: BOB', 'DANGER THREAT: UNKNOWN']);
  assert.equal(texture.image.width, 512); assert.equal(texture.image.height, 192);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(plate.material.emissiveMap, texture);
  const positions = plate.geometry.getAttribute('position'), uv = plate.geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index++) {
    assert.ok(Math.abs(Math.hypot(positions.getX(index), positions.getZ(index)) - 1.265) < 1e-6,
      'The label follows the pedestal curvature without intersecting its surface.');
    assert.equal(uv.getY(index), positions.getY(index) > 0 ? 0 : 1);
  }
  title.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(plate, true);
  assert.ok(bounds.min.y > 0.8 && bounds.max.y < 1.3);
  const textureVersion = texture.version, pose = plate.matrixWorld.clone();
  title.update(TITLE_WOBBLE_START_SECONDS + 0.7, 16 / 9);
  title.scene.updateMatrixWorld(true);
  assert.deepEqual(plate.matrixWorld, pose, 'The plate stays on the container, not the shaking shell.');
  assert.equal(texture.version, textureVersion, 'The label is generated once, never uploaded per frame.');
  title.dispose();
});

test('portrait framing clears the controls and reduced motion freezes the orbit and shake', () => {
  const title = new TitleScreenScene(), target = new THREE.Vector3().copy(TITLE_EGG_CENTRE);
  for (const aspect of [16 / 9, 4 / 3, 320 / 900]) {
    title.update(4.2, aspect);
    title.camera.updateMatrixWorld(true);
    const projected = target.clone().project(title.camera);
    assert.ok(Math.abs(projected.x - (aspect >= 1.3 ? 0.3 : 0)) < 1e-8);
    assert.ok(Math.abs(projected.y - (aspect < 1.3 ? 0.36 : 0)) < 1e-8);
    assert.equal(title.camera.aspect, aspect);
    assert.ok(title.camera.fov <= 78);
  }
  title.update(0, 16 / 9, true);
  const initial = title.camera.position.clone();
  assert.equal(title.update(4.2, 16 / 9, true), false);
  assert.deepEqual(title.camera.position, initial);
  assert.equal(title.eggRoot.rotation.z, 0);
  title.dispose();
});

test('title disposal releases its shadow, materials, geometry and instance buffers exactly once', () => {
  const title = new TitleScreenScene(), owned = new Set<THREE.EventDispatcher<any>>();
  title.scene.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      owned.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        owned.add(material);
        if (material instanceof THREE.MeshStandardMaterial && material.map) owned.add(material.map);
      }
    }
    if (object instanceof THREE.InstancedMesh) owned.add(object);
  });
  const shadow = new THREE.WebGLRenderTarget(512, 512);
  title.keyLight.shadow.map = shadow;
  owned.add(shadow);
  const disposals = new Map([...owned].map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource)! + 1));
  title.dispose(); title.dispose();
  assert.equal(title.resources.diagnostics.disposed, true);
  assert.equal(title.scene.children.length, 0);
  for (const [resource, count] of disposals) assert.equal(count, 1, (resource as any).name);
});

function presentationFixture(reducedMotion = false) {
  let draws = 0, sceneDisposals = 0, compileResolve: (() => void) | undefined;
  const shadowRefreshes: boolean[] = [], budgets: (number | undefined)[] = [];
  const shadowMap = { enabled: false, type: THREE.BasicShadowMap as THREE.ShadowMapType,
    autoUpdate: true, needsUpdate: false };
  const policy = new RenderShadowPolicy(shadowMap);
  const listener = new Set<() => void>();
  const motion = { matches: reducedMotion, addEventListener: (_: string, cb: () => void) => listener.add(cb),
    removeEventListener: (_: string, cb: () => void) => listener.delete(cb) };
  const host = { clientWidth: 1920, clientHeight: 1080, dataset: {} as Record<string, string>, ownerDocument: { hidden: false } };
  const hostWindow = { devicePixelRatio: 2, matchMedia: () => motion };
  const scene = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    update: (seconds: number, _aspect: number, reduced: boolean) => {
      const phase = seconds % TITLE_WOBBLE_INTERVAL_SECONDS - TITLE_WOBBLE_START_SECONDS;
      return !reduced && phase > 0 && phase < TITLE_WOBBLE_DURATION_SECONDS;
    },
    dispose: () => sceneDisposals++ };
  const renderer = { shadowMap, compileAsync: () => new Promise<void>(resolve => { compileResolve = resolve; }),
    render: () => { draws++; shadowRefreshes.push(shadowMap.needsUpdate); } };
  const canvas = { width: 1280, height: 720 };
  const renderLayer = { renderer, canvas, withShadowPreparation: policy.withPreparation.bind(policy),
    setPresentationResolution: (budget: number | undefined) => budgets.push(budget) };
  const presentation = new TitleScreenPresentation({ host: host as unknown as HTMLElement,
    window: hostWindow as unknown as Window, renderLayer: renderLayer as unknown as RenderLayer, scene });
  return { presentation, host, hostWindow, canvas, motion, listener, shadowMap, budgets, shadowRefreshes,
    resolveCompile: () => compileResolve!(), draws: () => draws, sceneDisposals: () => sceneDisposals };
}

test('title render work is bounded to 30Hz, caches resting shadows, and never alters gameplay shadow policy', async () => {
  const fixture = presentationFixture(), { presentation } = fixture;
  const originalShadow = { ...fixture.shadowMap };
  const prepared = presentation.prepare(); fixture.resolveCompile(); await prepared;
  for (let frame = 0; frame < 600; frame++) presentation.render(1 / 60);
  assert.equal(fixture.draws(), 301); // Initial frame plus 300 animated frames.
  assert.ok(fixture.shadowRefreshes.filter(Boolean).length < 100);
  assert.deepEqual(fixture.shadowMap, originalShadow);
  assert.equal(fixture.host.dataset.titleMotion, 'orbiting');
  assert.ok(fixture.budgets.every(budget => budget === TITLE_PIXEL_BUDGET));
  fixture.host.ownerDocument.hidden = true;
  presentation.render(1); assert.equal(fixture.draws(), 301);
  presentation.dispose(); presentation.dispose();
  assert.equal(fixture.sceneDisposals(), 1);
  assert.equal(fixture.budgets.at(-1), undefined);
  assert.equal(fixture.listener.size, 0);
  assert.deepEqual(fixture.host.dataset, {});
  presentation.render(1); assert.equal(fixture.draws(), 301);
});

test('reduced motion renders once and on resize/DPI changes, including title-origin submenus', async () => {
  const fixture = presentationFixture(true), { presentation } = fixture;
  const prepared = presentation.prepare(); fixture.resolveCompile(); await prepared;
  for (let frame = 0; frame < 120; frame++) presentation.render(1 / 60);
  assert.equal(fixture.draws(), 1);
  assert.equal(fixture.host.dataset.titleMotion, 'still');
  fixture.host.clientWidth = 960; presentation.render(0); assert.equal(fixture.draws(), 2);
  fixture.hostWindow.devicePixelRatio = 1; presentation.render(0); assert.equal(fixture.draws(), 3);
  fixture.canvas.width = 960; fixture.canvas.height = 540;
  presentation.render(0); assert.equal(fixture.draws(), 4); // Density setting at the same CSS/DPR.
  fixture.motion.matches = false;
  for (const listener of fixture.listener) listener();
  presentation.render(0); assert.equal(fixture.draws(), 5);
  presentation.dispose();
});

test('disposing while shader preparation is pending cannot restart the title or reapply its pixel cap', async () => {
  const fixture = presentationFixture(), prepared = fixture.presentation.prepare();
  fixture.presentation.dispose(); fixture.resolveCompile(); await prepared;
  assert.equal(fixture.draws(), 0);
  assert.deepEqual(fixture.budgets, [undefined]);
  assert.deepEqual(fixture.host.dataset, {});
});

test('saved menu-motion preference updates the title without overriding system reduced motion', async () => {
  const fixture = presentationFixture(), { presentation } = fixture;
  const prepared = presentation.prepare(); fixture.resolveCompile(); await prepared;
  presentation.setReducedMotion(true); presentation.render(0);
  const draws = fixture.draws();
  for (let frame = 0; frame < 120; frame++) presentation.render(1 / 60);
  assert.equal(fixture.draws(), draws);
  assert.equal(fixture.host.dataset.titleMotion, 'still');
  presentation.setReducedMotion(false); presentation.render(0);
  assert.equal(fixture.host.dataset.titleMotion, 'orbiting');
  fixture.motion.matches = true;
  for (const listener of fixture.listener) listener();
  presentation.setReducedMotion(false); presentation.render(0);
  assert.equal(fixture.host.dataset.titleMotion, 'still');
  presentation.dispose();
});
