import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OpeningGameScene } from '../src/cinematics/OpeningGameScene.ts';
import { OPENING_LAB_LAYOUT } from '../src/cinematics/OpeningLaboratory.ts';
import { OpeningGamePresentation, type OpeningGamePresentationOptions } from '../src/cinematics/OpeningGamePresentation.ts';
import { OPENING_GAME_TIMING as T, sampleOpeningGame } from '../src/cinematics/OpeningGameTimeline.ts';
import { GameFlowStateModel } from '../src/ui/GameFlowUI.ts';
import { TitleScreenScene } from '../src/ui/TitleScreenScene.ts';

test('opening owns input until explicit completion and cannot replay on resume/restart', () => {
  const model = new GameFlowStateModel();
  assert.equal(model.beginOpening(), false);
  model.completeBoot();
  assert.equal(model.beginOpening(), true);
  assert.equal(model.beginOpening(), false);
  assert.equal(model.state, 'opening');
  assert.equal(model.pause(), false); assert.equal(model.start(), false);
  assert.equal(model.openSettings(), false); assert.equal(model.beginLevelTransition(), false);
  assert.equal(model.finishOpening(), true);
  assert.equal(model.finishOpening(), false);
  model.pause(); model.resume();
  assert.equal(model.state, 'playing');
});

test('cracks build slowly, containment clears before the fall, and only floor impact opens the egg', () => {
  assert.equal(sampleOpeningGame(0).eggState, 'intact');
  for (const [time, state] of [[T.crackOne, 'crack-stage-1'], [T.crackTwo, 'crack-stage-2'],
    [T.crackThree, 'crack-stage-3'], [T.impact, 'half-broken']] as const) {
    assert.equal(sampleOpeningGame(time).eggState, state);
  }
  assert.ok(T.crackThree - T.crackOne > 3);
  assert.ok(T.crackThree < T.crackComplete && T.crackComplete < T.lidStart && T.lidClear < T.tipStart);
  assert.equal(sampleOpeningGame(T.crackComplete).crackProgress, 1);
  assert.equal(sampleOpeningGame(T.lidStart).lid, 0);
  assert.equal(sampleOpeningGame(T.tipStart).lid, 1);
  assert.equal(sampleOpeningGame(T.impact - 0.01).opening, 0);
  assert.equal(sampleOpeningGame(T.shellClear).opening, 1);
  assert.equal(sampleOpeningGame(T.formStart).formation, 0);
  assert.equal(sampleOpeningGame(T.formEnd).formation, 1);
  for (const time of [NaN, Infinity, -2]) assert.deepEqual(sampleOpeningGame(time), sampleOpeningGame(0));
  assert.deepEqual(sampleOpeningGame(100), sampleOpeningGame(T.end));
});

test('Bob reforms smoothly in one second after a brief gooey hold, without changing the hatch or final fade', () => {
  assert.ok(Math.abs(T.formStart - T.shellClear - 0.25) < 1e-8);
  assert.ok(Math.abs(T.formEnd - T.formStart - 1) < 1e-8);
  assert.equal(sampleOpeningGame(T.shellClear).spread, 1);
  assert.equal(sampleOpeningGame(T.shellClear).formation, 0);
  assert.equal(sampleOpeningGame(T.impact + 3).formation, 1, 'Bob must already be normal three seconds after impact.');
  let previous = -1;
  for (let step = 0; step <= 120; step++) {
    const frame = sampleOpeningGame(THREE.MathUtils.lerp(T.formStart, T.formEnd, step / 120));
    assert.equal(frame.opening, 1, 'Shell pieces clear before Bob grows upright.');
    assert.equal(frame.spread, 1);
    assert.ok(frame.formation >= previous && frame.formation - Math.max(0, previous) < 0.02,
      'Retain the continuous eased transformation, not an instant model swap.');
    previous = frame.formation;
  }
  assert.equal(previous, 1);
  assert.ok(Math.abs(T.fadeStart - T.hatchStart - 20.8) < 1e-8);
  assert.equal(T.end, 54);
});

test('cracks grow bit by bit to their full seam network before the glass lifts', () => {
  const scene = createScene();
  try {
    const versions = scene.fracture.fragments.map(piece => piece.cracks.geometry.getAttribute('position').version);
    let lastCount = 0;
    const distinctCounts = new Set<number>();
    for (let sample = 0; sample <= 120; sample++) {
      const time = THREE.MathUtils.lerp(T.crackOne, T.crackComplete, sample / 120);
      const frame = sampleOpeningGame(time); scene.apply(frame, 16 / 9);
      assert.equal(frame.lid, 0, 'Keep the complete glass container down throughout cracking.');
      assert.equal(frame.tip, 0); assert.equal(frame.fall, 0); assert.equal(frame.opening, 0);
      assert.equal(scene.lid.position.y, 0);
      const count = scene.fracture.fragments.reduce((sum, piece) => sum + piece.cracks.geometry.drawRange.count, 0);
      assert.ok(count >= lastCount, 'Seams must grow, not blink between disconnected states.');
      for (const piece of scene.fracture.fragments) assert.equal(piece.cracks.geometry.drawRange.count % 6, 0);
      distinctCounts.add(count); lastCount = count;
    }
    assert.ok(distinctCounts.size > 25, 'A continuous small-segment buildup, not only three instant crack changes.');
    assert.equal(lastCount, scene.fracture.fragments.reduce((sum, piece) => sum + piece.crackCounts[3], 0));
    scene.apply(sampleOpeningGame((T.crackComplete + T.lidStart) / 2), 16 / 9);
    assert.equal(scene.lid.position.y, 0, 'Hold the fully cracked shell before the glass responds.');
    scene.apply(sampleOpeningGame(T.lidStart + 0.2), 16 / 9);
    assert.ok(scene.lid.position.y > 0);
    assert.deepEqual(scene.fracture.fragments.map(piece => piece.cracks.geometry.getAttribute('position').version), versions,
      'Progress changes draw ranges only; do not remesh/upload cracks during playback.');
    scene.apply(sampleOpeningGame(T.crackOne), 16 / 9);
    assert.equal(scene.lid.position.y, 0);
    assert.equal(scene.fracture.fragments.reduce((sum, piece) => sum + piece.cracks.geometry.drawRange.count, 0), 0, 'Seeking backwards rewinds the progressive seams.');
  } finally { scene.dispose(); }
});

test('each close-up frames newly growing cracks instead of only the already-cracked side', () => {
  const scene = createScene(), point = new THREE.Vector3(), vertex = new THREE.Vector3(), projected = new THREE.Vector3();
  try {
    for (const aspect of [16 / 9, 1, 320 / 900]) for (const reduced of [false, true]) {
      for (const [stage, start, end] of [[1, T.crackOne, T.crackTwo], [2, T.crackTwo, T.crackThree], [3, T.crackThree, T.crackComplete]]) {
        let visibleDuringWave = 0;
        for (const fraction of [0.2, 0.4, 0.6, 0.8, 0.95]) {
          scene.apply(sampleOpeningGame(THREE.MathUtils.lerp(start, end, fraction)), aspect, reduced);
          scene.room.scene.updateMatrixWorld(true); scene.room.camera.updateMatrixWorld(true);
          const blockers: THREE.Object3D[] = [];
          scene.room.scene.traverseVisible(object => {
            if (object instanceof THREE.Mesh && !(Array.isArray(object.material) ? object.material : [object.material]).every(material => material.transparent)) blockers.push(object);
          });
          let newCracksInView = 0;
          for (const piece of scene.fracture.fragments) {
            const mesh = piece.cracks, positions = mesh.geometry.getAttribute('position');
            for (let index = piece.crackCounts[stage - 1]; index < mesh.geometry.drawRange.count; index += 6) {
              point.set(0, 0, 0);
              for (let corner = 0; corner < 3; corner++) point.add(vertex.fromBufferAttribute(positions, index + corner));
              point.divideScalar(3).applyMatrix4(mesh.matrixWorld);
              projected.copy(point).project(scene.room.camera);
              if (Math.abs(projected.x) > 0.94 || Math.abs(projected.y) > 0.9 || Math.abs(projected.z) > 1) continue;
              const direction = point.clone().sub(scene.room.camera.position), distance = direction.length();
              const hit = new THREE.Raycaster(scene.room.camera.position, direction.normalize(), 0, distance + 0.001)
                .intersectObjects(blockers, false)[0];
              if (!hit || hit.object === mesh || hit.distance >= distance - 0.0003) newCracksInView++;
            }
          }
          assert.ok(newCracksInView > 0, `Wave ${stage}, ${fraction}, aspect ${aspect}, reduced ${reduced}: new seams are hidden or offscreen.`);
          visibleDuringWave = Math.max(visibleDuringWave, newCracksInView);
        }
        assert.ok(visibleDuringWave >= 8, 'A clearly growing seam network, not one incidental visible pixel.');
      }
    }
  } finally { scene.dispose(); }
});

function createScene(): OpeningGameScene {
  const room = new TitleScreenScene();
  room.update(15, 16 / 9);
  const scene = new OpeningGameScene(room);
  scene.begin();
  return scene;
}

test('the opening removes the inherited opaque menu scrim while retaining its authored fade', async () => {
  const css = await readFile(new URL('../src/ui/ui-theme.css', import.meta.url), 'utf8');
  const screen = css.match(/\.opening-screen\s*\{([^}]+)\}/)?.[1];
  assert.ok(screen);
  assert.match(screen, /background:\s*transparent\s*;/);
  assert.doesNotMatch(screen, /(?:opacity|filter|backdrop-filter)\s*:/);
  assert.match(css, /\.opening-fade\s*\{[^}]*opacity:\s*var\(--opening-fade,\s*0\)/);
});

test('opening uses the exact menu pod, shell surface, label and fixed four-light layout', () => {
  const scene = createScene(), room = scene.room;
  assert.equal(room.scene.getObjectByName('title-custom-containment-pod'), room.pod);
  assert.equal(scene.lid.getObjectByName('title-pod-curved-glass')?.parent, scene.lid);
  assert.ok(room.pod.getObjectByName('title-pod-specimen-label'));
  const objects = new Set<THREE.Object3D>(), geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  room.scene.traverse(object => {
    objects.add(object);
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  for (const time of [0, 3.5, 7.8, 9.6, T.hatchStart + 13, T.end, 0, T.hatchStart + 9.6]) {
    scene.apply(sampleOpeningGame(time), 16 / 9);
    let lights = 0;
    room.scene.traverse(object => {
      assert.ok(objects.has(object));
      if (object instanceof THREE.Light) lights++;
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        assert.ok(geometries.has(object.geometry));
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) assert.ok(materials.has(material));
      }
    });
    assert.equal(lights, 4);
    assert.equal(room.shell.visible, sampleOpeningGame(time).eggState === 'intact');
    assert.equal(scene.fracture.root.visible, !room.shell.visible);
    assert.equal(scene.bob.root.visible, time >= T.impact);
    const camera = room.camera.position;
    if (time < T.blackoutEnd || time >= T.hatchStart) {
      assert.ok(Math.hypot(camera.x, camera.z + 0.5) < 6, 'The menu and hatch cameras stay inside their room shells.');
    } else {
      assert.ok(Math.abs(camera.x - OPENING_LAB_LAYOUT.centreX) < 3.1 && camera.z > 6.3 && camera.z < OPENING_LAB_LAYOUT.backZ, 'The fly-through stays inside its laboratory wing.');
    }
  }
  scene.dispose(); scene.dispose();
  assert.equal(room.resources.diagnostics.disposed, true);
  assert.equal(room.scene.children.length, 0);
});

test('the egg leaves the pedestal before impact and all broken pieces settle onto the floor', () => {
  const scene = createScene(), point = new THREE.Vector3();
  scene.apply(sampleOpeningGame(T.fallStart), 16 / 9);
  const releasedY = scene.room.eggRoot.position.y;
  assert.ok(Math.hypot(scene.room.eggRoot.position.x, scene.room.eggRoot.position.z + 0.5) > 1.9);
  scene.apply(sampleOpeningGame(T.impact), 16 / 9);
  assert.ok(scene.room.eggRoot.position.y < releasedY - 1.5);
  for (let seconds = T.impact; seconds <= T.end; seconds += 0.125) {
    scene.apply(sampleOpeningGame(seconds), 16 / 9);
    scene.room.scene.updateMatrixWorld(true);
    for (const piece of scene.fracture.fragments) {
      let lowest = Infinity;
      for (const mesh of [piece.shell, piece.cracks]) {
        const positions = mesh.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) {
          point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
          lowest = Math.min(lowest, point.y);
        }
      }
      assert.ok(lowest >= -1e-6, `${seconds}: ${piece.root.name} below floor`);
      if (seconds >= T.formStart) assert.ok(lowest < 1e-6, `${piece.root.name} floats after landing`);
    }
  }
  scene.dispose();
});

test('Bob is inside the shell from the first shot and continuously becomes the real authored model', async () => {
  const scene = createScene();
  const bytes = await readFile(new URL('../assets/characters/bob/bob-authored.glb', import.meta.url));
  await scene.bob.prepare(async () => (await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene);
  const body = scene.bob.root.getObjectByName('Bob-Body') as THREE.Mesh;
  assert.ok(body instanceof THREE.Mesh);
  scene.apply(sampleOpeningGame(0), 16 / 9);
  assert.equal(scene.bob.root.visible, false, 'Bob is posed inside, but his hidden gel must not trigger a full-scene transmission pass.');
  scene.room.scene.updateMatrixWorld(true);
  const eggBounds = new THREE.Box3().setFromObject(scene.fracture.root, true);
  assert.ok(eggBounds.containsBox(new THREE.Box3().setFromObject(body, true)));
  for (const time of [T.hatchStart, T.crackOne, T.crackTwo, T.crackThree, T.fallStart, T.impact - 0.001, T.impact]) {
    scene.apply(sampleOpeningGame(time), 16 / 9);
    let transmissions = 0;
    scene.room.scene.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) transmissions++;
      }
    });
    assert.equal(transmissions, time < T.impact ? 0 : 1, 'Only the actual first shell opening needs Bob’s physical gel capture.');
  }
  scene.apply(sampleOpeningGame(T.formStart - 0.2), 16 / 9);
  assert.ok(scene.bob.root.scale.x > 1.3 && scene.bob.root.scale.y < 0.2, 'Gooey puddle before reforming.');
  const point = new THREE.Vector3();
  for (let seconds = T.shellClear; seconds <= T.end; seconds += 0.125) {
    scene.apply(sampleOpeningGame(seconds), 16 / 9);
    scene.room.scene.updateMatrixWorld(true);
    let radius = 0;
    const positions = body.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      body.getVertexPosition(index, point).applyMatrix4(body.matrixWorld);
      assert.ok(point.y >= -0.01, `${seconds}: Bob clips the floor`);
      radius = Math.max(radius, Math.hypot(point.x - scene.bob.root.position.x, point.z - scene.bob.root.position.z));
    }
    for (const piece of scene.fracture.fragments) {
      const direction = piece.currentClearanceDirection;
      // Every vertex beyond a separating plane also bounds complete triangles.
      for (const mesh of [piece.shell, piece.cracks]) {
        const positions = mesh.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) {
          point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld).sub(scene.bob.root.position);
          assert.ok(point.dot(direction) >= radius + 0.01, `${seconds}: ${mesh.name} intersects Bob`);
        }
      }
    }
  }
  scene.apply(sampleOpeningGame(T.formEnd), 16 / 9);
  assert.deepEqual(scene.bob.root.scale.toArray(), [1, 1, 1]);
  assert.equal(scene.bob.root.position.y, 0.45);
  scene.room.scene.updateMatrixWorld(true);
  const front = new THREE.Vector3(0, 0, -1).transformDirection(body.matrixWorld).setY(0).normalize();
  const toCamera = scene.room.camera.position.clone().sub(scene.bob.root.position).setY(0).normalize();
  assert.ok(front.dot(toCamera) > 0.99, 'The reveal must show Bob’s face, not his back.');
  for (const aspect of [16 / 9, 1, 320 / 900]) {
    for (const seconds of [T.impact + 1.8, T.formStart + 1.5, T.formEnd, T.fadeStart - 0.2]) {
      scene.apply(sampleOpeningGame(seconds), aspect);
      scene.room.scene.updateMatrixWorld(true);
      scene.room.camera.updateMatrixWorld(true);
      if (seconds >= T.formEnd) {
        front.set(0, 0, -1).transformDirection(body.matrixWorld).setY(0).normalize();
        toCamera.copy(scene.room.camera.position).sub(scene.bob.root.position).setY(0).normalize();
        assert.ok(front.dot(toCamera) > 0.99, `Bob must face the escaped reveal camera at aspect ${aspect}.`);
      }
      const positions = body.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        body.getVertexPosition(index, point).applyMatrix4(body.matrixWorld).project(scene.room.camera);
        assert.ok(Math.abs(point.x) < 0.98 && Math.abs(point.y) < 0.88,
          `${seconds} at aspect ${aspect}: Bob cropped at ${point.x}, ${point.y}`);
      }
    }
  }
  scene.dispose();
});

test('settled fragments are reused without losing absolute-time seek or floor contact', () => {
  const scene = createScene();
  try {
    scene.apply(sampleOpeningGame(T.impact + 3), 16 / 9);
    const settled = scene.fracture.fragments.map(piece => [piece.root.position.toArray(), piece.root.quaternion.toArray()]);
    scene.apply(sampleOpeningGame(T.end), 16 / 9);
    assert.deepEqual(scene.fracture.fragments.map(piece => [piece.root.position.toArray(), piece.root.quaternion.toArray()]), settled);
    scene.apply(sampleOpeningGame(T.impact + 0.2), 16 / 9);
    scene.apply(sampleOpeningGame(T.end), 16 / 9);
    assert.deepEqual(scene.fracture.fragments.map(piece => [piece.root.position.toArray(), piece.root.quaternion.toArray()]), settled);
  } finally { scene.dispose(); }
});

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function playerFixture() {
  let sceneLoads = 0, preloads = 0, levelLoads = 0, completions = 0, disposals = 0, draws = 0, nextFrame = 0;
  const sceneReady = deferred(), preloadReady = deferred(), levelReady = deferred(), frames = new Map<number, FrameRequestCallback>();
  const tasks: (() => void)[] = [];
  let scenePromise = sceneReady.promise;
  let levelPromise = levelReady.promise;
  const host = { dataset: {} as Record<string, string>, clientWidth: 640, clientHeight: 360, ownerDocument: { hidden: false } };
  const fades: number[] = [];
  const scene = { room: { scene: {}, camera: {} }, needsShadowUpdate: true, begin() {}, apply() {},
    prepare: () => { sceneLoads++; return scenePromise; }, dispose: () => { disposals++; } };
  const layer = { setPresentationResolution() {}, withShadowPreparation: (_: boolean, action: () => unknown) => action(),
    renderer: { shadowMap: {}, render: () => { draws++; } } };
  const statuses: { message: string; failed: boolean }[] = [];
  const options = { scene, renderLayer: layer, host, window: {
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout: (callback: () => void) => { tasks.push(callback); return tasks.length; },
  }, preloadLevel: () => { preloads++; return preloadReady.promise; },
  prepareLevel: () => {
    assert.equal(fades.at(-1), 1, 'Full world/model/GPU preparation must stay behind a blackout.');
    levelLoads++; return levelPromise;
  },
  onComplete: () => { completions++; }, onStatus: (message: string, failed: boolean) => statuses.push({ message, failed }),
  onFade: (opacity: number) => fades.push(opacity) };
  const player = new OpeningGamePresentation(options as unknown as OpeningGamePresentationOptions);
  const flushFrames = () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); };
  const blackout = () => { for (let frame = 0; frame < 9; frame++) player.render(0.1); };
  return { player, host, frames, tasks, sceneReady, preloadReady, levelReady, statuses, fades, flushFrames, blackout,
    setScenePromise: (promise: Promise<void>) => { scenePromise = promise; },
    setLevelPromise: (promise: Promise<void>) => { levelPromise = promise; },
    counts: () => ({ sceneLoads, preloads, levelLoads, completions, disposals, draws }) };
}
const flushPromises = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('full preparation yields browser tasks only after the live opening paints its blackout', async () => {
  const f = playerFixture(); f.player.start();
  let settled = false;
  const visible = f.player.yieldPreparation().then(() => { settled = true; });
  assert.equal(f.tasks.length, 0); assert.equal(settled, false);
  f.flushFrames(); await visible;
  f.player.skip(); f.flushFrames(); f.flushFrames();
  f.sceneReady.resolve(); await flushPromises();
  assert.equal(f.counts().levelLoads, 1); assert.equal(f.fades.at(-1), 1);
  settled = false;
  const hidden = f.player.yieldPreparation().then(() => { settled = true; });
  assert.equal(f.tasks.length, 1); assert.equal(settled, false, 'the next GPU job must remain asynchronous');
  f.tasks.shift()!(); await hidden;
  f.player.dispose(); await f.player.yieldPreparation();
  assert.equal(f.tasks.length, 0);
});

test('only light assets prepare during the film; Skip paints black before full Level 1 preparation', async () => {
  const f = playerFixture(); f.player.start(); f.player.start();
  assert.equal(f.host.dataset.openingMode, 'live');
  assert.equal(f.counts().sceneLoads, 0); assert.equal(f.counts().levelLoads, 0);
  f.blackout(); f.flushFrames(); f.flushFrames(); await flushPromises();
  assert.equal(f.counts().sceneLoads, 1);
  assert.equal(f.counts().levelLoads, 0, 'do not contend with the opening startup jobs');
  f.sceneReady.resolve(); await flushPromises();
  assert.equal(f.counts().preloads, 1);
  assert.equal(f.counts().levelLoads, 0);
  for (let i = 0; i < 55; i++) f.player.render(.1);
  assert.equal(f.host.dataset.openingStage, 'experiments');
  assert.equal(f.fades.at(-1), 0, 'The film cannot wait for speculative network requests.');
  assert.equal(f.statuses.at(-1)?.message, '');
  f.preloadReady.resolve(); await flushPromises();
  assert.equal(f.counts().levelLoads, 0, 'A completed download must not trigger parsing or GPU work during playback.');
  f.player.skip(); assert.equal(f.counts().completions, 0);
  assert.equal(f.host.dataset.openingState, 'waiting');
  assert.equal(f.fades.at(-1), 1);
  assert.equal(f.counts().levelLoads, 0);
  f.flushFrames(); assert.equal(f.counts().levelLoads, 0, 'Allow a full blackout paint.');
  f.flushFrames(); await flushPromises(); assert.equal(f.counts().levelLoads, 1);
  f.levelReady.resolve(); await flushPromises();
  assert.equal(f.counts().completions, 1);
  f.player.skip(); assert.equal(f.counts().completions, 1);
  f.player.dispose();
});

test('automatic finish starts full preparation after the final fade; hidden tabs do not spend film time', async () => {
  const f = playerFixture(); f.player.start();
  f.blackout(); f.flushFrames(); f.flushFrames(); f.sceneReady.resolve(); await flushPromises();
  assert.equal(f.counts().completions, 0);
  f.host.ownerDocument.hidden = true;
  for (let i = 0; i < 200; i++) f.player.render(0.1);
  assert.equal(f.counts().draws, 0);
  f.host.ownerDocument.hidden = false;
  for (let i = 0; i < Math.ceil(T.end * 10) + 1; i++) f.player.render(0.1);
  assert.equal(f.host.dataset.openingStage, 'complete');
  assert.equal(f.counts().levelLoads, 0);
  assert.equal(f.fades.at(-1), 1);
  assert.equal(f.host.dataset.openingState, 'waiting');
  f.flushFrames(); assert.equal(f.counts().levelLoads, 0);
  f.flushFrames(); await flushPromises(); assert.equal(f.counts().levelLoads, 1);
  const endDraws = f.counts().draws;
  for (let i = 0; i < 100; i++) f.player.render(.1);
  assert.equal(f.counts().draws, endDraws, 'No cinematic draws compete with final GPU preparation.');
  f.levelReady.resolve(); await flushPromises();
  assert.equal(f.counts().completions, 1);
  f.player.dispose();
});

test('preparation fades the retained title to black without spending the laboratory tour time', async () => {
  const f = playerFixture(); f.player.start();
  for (let i = 0; i < 100; i++) f.player.render(0.1);
  assert.equal(f.counts().draws, 0);
  assert.equal(f.fades.at(-1), 1);
  assert.ok(f.fades[0] > 0 && f.fades[0] < 1);
  assert.equal(f.counts().sceneLoads, 0, 'The blackout must paint before heavy setup starts.');
  f.flushFrames();
  assert.equal(f.counts().sceneLoads, 0, 'Keep a complete paint between the fade and construction.');
  f.flushFrames();
  assert.equal(f.counts().sceneLoads, 1);
  f.sceneReady.resolve(); await flushPromises();
  assert.equal(f.counts().levelLoads, 0);
  assert.equal(f.counts().preloads, 1);
  assert.equal(f.fades.at(-1), 1);
  f.player.render(0.1);
  assert.equal(f.host.dataset.openingStage, 'blackout');
  for (let i = 0; i < 12; i++) f.player.render(0.1);
  assert.equal(f.host.dataset.openingStage, 'laboratory');
  assert.ok(f.fades.at(-1)! < 1);
  f.player.dispose();
});

test('no Level 1 construction or speculative work competes with the cinematic startup jobs', async () => {
  const f = playerFixture(); f.player.start(); f.blackout(); f.flushFrames(); f.flushFrames();
  await flushPromises();
  for (let i = 0; i < 20; i++) f.player.render(.1);
  assert.equal(f.counts().levelLoads, 0, 'heavy construction must not overlap the cinematic shader/geometry jobs');
  assert.equal(f.counts().preloads, 0);
  assert.equal(f.fades.at(-1), 1);
  f.sceneReady.resolve(); await flushPromises();
  assert.equal(f.counts().levelLoads, 0);
  assert.equal(f.counts().preloads, 1);
  f.player.render(.1);
  assert.equal(f.host.dataset.openingStage, 'blackout');
  f.player.dispose();
});

test('a failed opening still prepares Level 1 so Skip can recover without a retry', async () => {
  const f = playerFixture(); f.player.start(); f.blackout(); f.flushFrames(); f.flushFrames();
  f.sceneReady.reject(new Error('opening shader failed')); await flushPromises();
  assert.equal(f.counts().levelLoads, 0);
  f.flushFrames(); f.flushFrames(); await flushPromises();
  assert.equal(f.counts().levelLoads, 1);
  f.levelReady.resolve(); await flushPromises();
  f.player.skip(); assert.equal(f.counts().completions, 1);
  f.player.dispose();
});

test('Skip cannot release cinematic materials while their shader compilation is pending', async () => {
  const f = playerFixture(); f.player.start();
  f.blackout(); f.flushFrames(); f.flushFrames(); f.levelReady.resolve(); await flushPromises();
  f.player.skip(); assert.equal(f.counts().completions, 0);
  f.flushFrames(); f.flushFrames(); await flushPromises();
  assert.equal(f.counts().levelLoads, 0, 'Even a painted Skip cannot overlap the pending cinematic compilation.');
  f.sceneReady.resolve(); await flushPromises();
  assert.equal(f.counts().completions, 1);
  f.player.dispose();
});

test('speculative failure cannot interrupt the clip; final preparation failure exposes retry without duplicate jobs', async () => {
  const f = playerFixture(); f.player.start(); f.blackout(); f.flushFrames(); f.flushFrames(); await flushPromises();
  f.sceneReady.resolve(); await flushPromises();
  f.preloadReady.reject(new Error('speculative network failure')); await flushPromises();
  for (let i = 0; i < 55; i++) f.player.render(.1);
  assert.equal(f.host.dataset.openingState, 'playing');
  assert.equal(f.host.dataset.openingStage, 'experiments');
  assert.equal(f.counts().levelLoads, 0);
  f.player.skip(); f.flushFrames(); f.flushFrames(); await flushPromises();
  f.levelReady.reject(new Error('network')); await flushPromises();
  assert.equal(f.host.dataset.openingState, 'failed');
  assert.equal(f.statuses.at(-1)?.failed, true);
  assert.equal(f.counts().completions, 0);
  f.setLevelPromise(Promise.resolve());
  f.player.retry(); f.player.retry();
  await flushPromises();
  assert.equal(f.counts().levelLoads, 2, 'Retry cannot duplicate the pending preparation.');
  assert.equal(f.counts().preloads, 1);
  f.player.skip(); assert.equal(f.counts().completions, 1);
  f.player.dispose(); f.player.dispose();
  assert.equal(f.counts().disposals, 1);
  const g = playerFixture(); g.player.start(); g.player.dispose();
  g.flushFrames(); g.sceneReady.resolve(); await flushPromises();
  assert.equal(g.counts().levelLoads, 0); assert.equal(g.counts().completions, 0);
  assert.deepEqual(g.host.dataset, {});
  const h = playerFixture(); h.player.start(); h.blackout(); h.flushFrames(); h.flushFrames();
  h.sceneReady.resolve(); await flushPromises(); h.player.skip(); h.player.dispose();
  h.flushFrames(); h.flushFrames(); h.preloadReady.resolve(); await flushPromises();
  assert.equal(h.counts().levelLoads, 0, 'Disposal cancels the queued post-fade construction.');
  assert.equal(h.counts().completions, 0);
});

test('retrying a failed clip cannot reveal it while recovery GPU preparation is still running', async () => {
  const f = playerFixture(); f.player.start(); f.blackout(); f.flushFrames(); f.flushFrames();
  f.sceneReady.reject(new Error('opening failure')); await flushPromises();
  f.flushFrames(); f.flushFrames(); await flushPromises();
  f.setScenePromise(Promise.resolve()); f.player.retry(); await flushPromises();
  for (let i = 0; i < 55; i++) f.player.render(.1);
  assert.equal(f.counts().draws, 0); assert.equal(f.fades.at(-1), 1);
  assert.equal(f.counts().preloads, 0, 'The recovering level already owns its real downloads.');
  f.levelReady.resolve(); await flushPromises();
  for (let i = 0; i < 55; i++) f.player.render(.1);
  assert.equal(f.host.dataset.openingStage, 'experiments');
  f.player.dispose();
});

test('Retry restarts both failed prerequisites and recovers once in either completion order', async () => {
  for (const skip of [false, true]) for (const first of ['scene', 'level'] as const) {
    const f = playerFixture(); f.player.start(); f.blackout(); f.flushFrames(); f.flushFrames();
    if (skip) f.player.skip();
    f.sceneReady.reject(new Error('opening asset unavailable')); await flushPromises();
    f.flushFrames(); f.flushFrames(); await flushPromises();
    assert.equal(f.counts().levelLoads, 1);
    f.levelReady.reject(new Error('level asset unavailable')); await flushPromises();
    assert.equal(f.host.dataset.openingState, 'failed');
    assert.equal(f.statuses.at(-1)?.failed, true);

    const sceneRetry = deferred(), levelRetry = deferred();
    f.setScenePromise(sceneRetry.promise); f.setLevelPromise(levelRetry.promise);
    f.player.retry(); f.player.retry(); await flushPromises();
    assert.equal(f.counts().sceneLoads, 2);
    assert.equal(f.counts().levelLoads, 2, 'Retry must restart Level 1 even while the opening is unready.');
    assert.equal(f.statuses.at(-1)?.failed, false);

    (first === 'scene' ? sceneRetry : levelRetry).resolve(); await flushPromises();
    for (let i = 0; i < 55; i++) f.player.render(.1);
    assert.equal(f.counts().draws, 0, 'Do not reveal either recovered scene before both prerequisites settle.');
    assert.equal(f.fades.at(-1), 1);
    assert.equal(f.counts().completions, 0);

    (first === 'scene' ? levelRetry : sceneRetry).resolve(); await flushPromises();
    if (!skip) {
      for (let i = 0; i < 55; i++) f.player.render(.1);
      assert.equal(f.host.dataset.openingStage, 'experiments', 'Recovery must resume the film, not stall on black.');
      assert.equal(f.host.dataset.openingState, 'playing');
      assert.equal(f.statuses.at(-1)?.message, '');
      for (let i = 0; i < Math.ceil(T.end * 10) + 1; i++) f.player.render(.1);
    }
    assert.equal(f.counts().completions, 1);
    assert.equal(f.counts().preloads, 0, 'Recovery reuses mandatory preparation, not speculative downloads.');
    f.player.retry(); f.player.skip(); await flushPromises();
    assert.equal(f.counts().sceneLoads, 2); assert.equal(f.counts().levelLoads, 2);
    assert.equal(f.counts().completions, 1, 'Repeated Retry/Skip cannot hand off twice.');
    f.player.dispose();
  }
});

test('playback shares the existing loop with a 30Hz cap and stops redrawing while final preparation waits', async () => {
  const f = playerFixture(); f.player.start();
  f.blackout(); f.flushFrames(); f.flushFrames(); f.sceneReady.resolve(); await flushPromises();
  for (let frame = 0; frame < 60; frame++) f.player.render(1 / 60);
  assert.ok(f.counts().draws >= 29 && f.counts().draws <= 31);
  f.player.skip(); f.player.render(0.1);
  const endDraws = f.counts().draws;
  for (let frame = 0; frame < 600; frame++) f.player.render(1 / 60);
  assert.equal(f.counts().draws, endDraws);
  f.player.dispose(); f.levelReady.resolve(); await flushPromises();
  assert.equal(f.counts().completions, 0);
});
