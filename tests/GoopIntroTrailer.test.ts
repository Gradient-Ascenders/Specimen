import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadGoop } from './fixtures/GoopAssetFixture.ts';
import { GoopIntroScene } from '../src/trailer/GoopIntroScene.ts';
import { TrailerDebrisMotion } from '../src/trailer/TrailerDebrisMotion.ts';
import { GOOP_INTRO_BOB_POSITION, GOOP_INTRO_DURATION_SECONDS, GOOP_INTRO_TIMING as T, sampleGoopIntro } from '../src/trailer/GoopIntroTimeline.ts';

test('Goop introduction orders the threat, interception, counterattack and destruction', () => {
  assert.equal(sampleGoopIntro(0).stage, 'patrol');
  assert.equal(sampleGoopIntro(T.aim).stage, 'aiming');
  assert.equal(sampleGoopIntro(T.droneFire).stage, 'rescue');
  assert.equal(sampleGoopIntro(T.shieldHit).stage, 'counterattack');
  assert.equal(sampleGoopIntro(T.droneHit).stage, 'destruction');
  assert.equal(sampleGoopIntro(T.heroes).stage, 'heroes');
  assert.equal(sampleGoopIntro(GOOP_INTRO_DURATION_SECONDS).stage, 'complete');
  assert.ok(T.droneFire < T.goopLaunch && T.goopArrives < T.shieldHit);
  assert.ok(T.shieldHit < T.goopLands && T.goopLands < T.acidFire);
  assert.ok(T.acidFire < T.droneHit && T.droneHit < T.breakup);
  assert.equal(sampleGoopIntro(T.droneFire).redShotProgress, 0);
  assert.equal(sampleGoopIntro(T.shieldHit).redShotProgress, null);
  assert.equal(sampleGoopIntro(T.acidFire).acidShotProgress, 0);
  assert.equal(sampleGoopIntro(T.droneHit).acidShotProgress, null);
});

test('actor motion is continuous while the camera deliberately cuts between cinematic angles', () => {
  for (const invalid of [NaN, Infinity, -Infinity, -10]) {
    assert.deepEqual(sampleGoopIntro(invalid), sampleGoopIntro(0));
  }
  assert.deepEqual(sampleGoopIntro(100), sampleGoopIntro(GOOP_INTRO_DURATION_SECONDS));
  const saved = sampleGoopIntro(5.4);
  sampleGoopIntro(GOOP_INTRO_DURATION_SECONDS);
  assert.deepEqual(sampleGoopIntro(5.4), saved);
  let previous = sampleGoopIntro(0);
  for (let t = 0.01; t <= GOOP_INTRO_DURATION_SECONDS; t += 0.01) {
    const frame = sampleGoopIntro(t);
    for (const field of ['bobPosition', 'goopPosition', 'dronePosition'] as const) {
      assert.ok(frame[field].every(Number.isFinite));
      assert.ok(new THREE.Vector3().fromArray(previous[field]).distanceTo(new THREE.Vector3().fromArray(frame[field])) < 0.2, `${t}: ${field}`);
    }
    for (const field of ['cameraPosition', 'cameraTarget'] as const) {
      assert.ok(frame[field].every(Number.isFinite));
      if (frame.cameraShot === previous.cameraShot) {
        assert.ok(new THREE.Vector3().fromArray(previous[field]).distanceTo(new THREE.Vector3().fromArray(frame[field])) < 0.2, `${t}: ${field}`);
      }
    }
    assert.ok(frame.goopPosition[1] >= 0.45 - 1e-8);
    assert.ok(frame.cameraPosition[0] < 7.6 && frame.cameraPosition[2] < 9.6);
    const separation = Math.hypot(frame.bobPosition[0] - frame.goopPosition[0], frame.bobPosition[2] - frame.goopPosition[2]);
    assert.ok(separation >= 1.3, `${t}: Goop bumps Bob's side without passing through him`);
    previous = frame;
  }
});

test('the director follows Bob, cranes up, reverses for the rescue and cuts to the drone impact', () => {
  for (const [time, shot] of [
    [0.8, 'follow-bob'], [2.4, 'drone-reveal'], [T.droneFire + 0.05, 'drone-reveal'],
    [T.reverseCut, 'bob-reverse'], [T.shieldHit, 'bob-reverse'], [T.acidFire, 'bob-reverse'],
    [T.impactCut, 'drone-impact'], [T.droneHit, 'drone-impact'], [10, 'heroes'],
  ] as const) assert.equal(sampleGoopIntro(time).cameraShot, shot);
  assert.ok(new THREE.Vector3().fromArray(sampleGoopIntro(0).bobPosition)
    .distanceTo(new THREE.Vector3().fromArray(sampleGoopIntro(T.lookUp).bobPosition)) > 1.5);
  assert.ok(sampleGoopIntro(2.4).bobLookUp > 0.9);
  assert.equal(sampleGoopIntro(T.goopContact).bobPush, 0);
  assert.equal(sampleGoopIntro(T.shieldHit).bobPush, 1);
  assert.ok(new THREE.Vector3().fromArray(sampleGoopIntro(T.shieldHit).bobPosition)
    .distanceTo(new THREE.Vector3().fromArray(GOOP_INTRO_BOB_POSITION)) >= 1.49);
  for (const cut of [T.reverseCut, T.impactCut]) {
    const before = sampleGoopIntro(cut - 0.001), after = sampleGoopIntro(cut);
    const viewBefore = new THREE.Vector3().fromArray(before.cameraTarget).sub(new THREE.Vector3().fromArray(before.cameraPosition));
    const viewAfter = new THREE.Vector3().fromArray(after.cameraTarget).sub(new THREE.Vector3().fromArray(after.cameraPosition));
    assert.ok(viewBefore.angleTo(viewAfter) > 2, `${cut}: a reverse angle, not another continuous wide shot`);
  }
});

test('the entire drone stays outside the opening frame until the upward reveal', () => {
  const scene = new GoopIntroScene();
  const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 50);
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const bounds = new THREE.Box3();
  try {
    for (const aspect of [9 / 16, 4 / 3, 16 / 9, 21 / 9]) {
      camera.aspect = aspect;
      for (let frame = 0; frame <= 96; frame++) {
        const time = T.lookUp * frame / 96;
        scene.apply(sampleGoopIntro(time), camera);
        scene.root.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        bounds.setFromObject(scene.drone.rig, true);
        assert.equal(scene.drone.rig.visible, true, 'the reveal must not pop hidden hardware into the scene');
        assert.equal(frustum.intersectsBox(bounds), false, `${aspect}, ${time}: no lens, fan or casing should spoil the surprise`);
      }
      scene.apply(sampleGoopIntro(2.4), camera);
      scene.root.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      assert.ok(frustum.containsPoint(scene.drone.rig.getWorldPosition(new THREE.Vector3())), 'the upward move must reveal the attacker before it fires');
    }
  } finally { scene.dispose(); }
});

test('projectiles and destruction effects have exclusive, replayable lifetimes', () => {
  const scene = new GoopIntroScene();
  try {
    scene.apply(sampleGoopIntro(3.5));
    assert.equal(scene.incomingShot.visible, true);
    assert.equal(scene.acidShot.visible, false);
    assert.ok(scene.incomingShot.position.distanceTo(scene.drone.fireOrigin) > 0.1);
    scene.apply(sampleGoopIntro(4));
    assert.equal(scene.incomingShot.visible, false);
    assert.equal(scene.shieldSparks.visible, true);
    scene.apply(sampleGoopIntro(5.4));
    assert.equal(scene.acidShot.visible, true);
    scene.apply(sampleGoopIntro(6.2));
    assert.equal(scene.acidShot.visible, false);
    assert.equal(scene.drone.rig.visible, false);
    assert.equal(scene.drone.wreck.visible, true);
    assert.equal(scene.impactSparks.visible, true);
    assert.equal(scene.smoke.visible, true);
    scene.apply(sampleGoopIntro(0));
    assert.equal(scene.drone.rig.visible, true);
    assert.equal(scene.drone.wreck.visible, false);
    for (const object of [scene.incomingShot, scene.acidShot, scene.charge, scene.shieldSparks, scene.impactSparks, scene.smoke]) {
      assert.equal(object.visible, false, object.name);
    }
    assert.equal(scene.bob.root.visible, true);
    assert.equal(scene.goop.root.visible, true);
  } finally { scene.dispose(); }
});

test('the drone breaks into the same visible hardware, not replacement rubble', () => {
  const scene = new GoopIntroScene();
  try {
    scene.apply(sampleGoopIntro(T.breakup));
    scene.root.updateMatrixWorld(true);
    assert.equal(scene.drone.wreck.children.length, 7, 'one housing, two independent barrels and four lift fans');
    const intact = vertexCloud(scene.drone.rig), broken = vertexCloud(scene.drone.wreck);
    assert.equal(broken.length, intact.length, 'no hardware disappears or gets duplicated on breakup');
    intact.forEach((point, i) => assert.equal(broken[i], point, `vertex ${i}: the original hardware must not jump on detachment`));
    const left = scene.drone.wreck.getObjectByName('trailer-attack-drone-barrels-left')!.children[0] as THREE.Mesh;
    const right = scene.drone.wreck.getObjectByName('trailer-attack-drone-barrels-right')!.children[0] as THREE.Mesh;
    assert.notEqual(left.geometry, right.geometry, 'the two disconnected barrels are separate physical pieces');
    scene.apply(sampleGoopIntro(9));
    scene.root.updateMatrixWorld(true);
    for (const part of scene.drone.wreck.children) {
      const bounds = new THREE.Box3().setFromObject(part, true);
      assert.ok(bounds.min.y >= 0.0029 && bounds.min.y <= 0.0031, `${part.name}: ${bounds.min.y}`);
    }
  } finally { scene.dispose(); }
});

test('wreckage accelerates under gravity, bounces, loses momentum and rests on broad surfaces', () => {
  const scene = new GoopIntroScene();
  const camera = new THREE.PerspectiveCamera(43, 16 / 9, 0.1, 50);
  const projected = new THREE.Vector3();
  try {
    const samples = [0.1, 0.2, 0.3].map(age => {
      scene.apply(sampleGoopIntro(T.breakup + age));
      return scene.drone.wreck.children.map(part => part.position.clone());
    });
    for (let i = 0; i < scene.drone.wreck.children.length; i++) {
      const acceleration = (samples[0]![i]!.y - 2 * samples[1]![i]!.y + samples[2]![i]!.y) / 0.01;
      assert.ok(acceleration < -9.5 && acceleration > -10, `${i}: gravity, not an eased path (${acceleration})`);
    }
    const last = new Map<THREE.Object3D, THREE.Vector3>();
    const touched = new Set<THREE.Object3D>(), bounced = new Set<THREE.Object3D>();
    const bounds = new THREE.Box3();
    // Sub-frame samples also cover interpolation between baked physics steps.
    for (let age = 0; age <= 3; age += 0.017) {
      scene.apply(sampleGoopIntro(T.breakup + age), camera);
      scene.root.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      for (const part of scene.drone.wreck.children) {
        bounds.setFromObject(part, true);
        assert.ok(bounds.min.y >= 0.00299, `${age}: ${part.name} must never pass through the floor`);
        if (T.breakup + age < T.heroes) {
          for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
            projected.set(x, y, z).project(camera);
            assert.ok(Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95,
              `${age}: the camera must catch ${part.name}'s faster fall and landing`);
          }
        }
        if (bounds.min.y < 0.004) touched.add(part);
        if (touched.has(part) && bounds.min.y > 0.015) bounced.add(part);
        const before = last.get(part);
        if (before) assert.ok(part.position.distanceTo(before) < 0.16, `${age}: ${part.name} must not teleport onto its resting pose`);
        last.set(part, part.position.clone());
      }
    }
    assert.equal(touched.size, 7, 'every piece reaches the ground');
    assert.ok(bounced.size > 0, 'hardware can rebound rather than simply snapping to the floor');
    scene.apply(sampleGoopIntro(10));
    const resting = scene.drone.wreck.children.map(part => ({ position: part.position.clone(), rotation: part.quaternion.clone() }));
    scene.apply(sampleGoopIntro(GOOP_INTRO_DURATION_SECONDS));
    scene.root.updateMatrixWorld(true);
    const finalBounds = scene.drone.wreck.children.map(part => new THREE.Box3().setFromObject(part, true));
    for (let i = 0; i < finalBounds.length; i++) for (let j = i + 1; j < finalBounds.length; j++) {
      assert.equal(finalBounds[i]!.intersectsBox(finalBounds[j]!), false, 'outward-scattered hardware should not settle through another piece');
    }
    scene.drone.wreck.children.forEach((part, i) => {
      assert.ok(part.position.distanceTo(resting[i]!.position) < 0.001, `${part.name}: friction should stop translation`);
      assert.ok(part.quaternion.angleTo(resting[i]!.rotation) < 0.01, `${part.name}: no persistent spinning or wobbling`);
      const hardware = part.children[0]!;
      const rotation = hardware.getWorldQuaternion(new THREE.Quaternion());
      if (part.name.includes('barrels')) {
        assert.ok(Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).y) < 0.025, `${part.name}: barrels lie lengthways, not balanced on a tip`);
      } else {
        assert.ok(Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).y) > 0.95, `${part.name}: casing and fan rings settle almost flat`);
      }
    });
  } finally { scene.dispose(); }
});

test('floor impacts lose energy, friction stops sliding and seeking is independent of playback frame rate', () => {
  const vertices: THREE.Vector3[] = [];
  for (const x of [-0.1, 0.1]) for (const y of [-0.1, 0.1]) for (const z of [-0.1, 0.1]) vertices.push(new THREE.Vector3(x, y, z));
  const motion = new TrailerDebrisMotion(vertices, new THREE.Vector3(0, 1.5, 0),
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 3);
  const piece = new THREE.Group(), point = new THREE.Vector3();
  let touched = false, maximumBounce = 0;
  for (let time = 0; time <= 3; time += 1 / 240) {
    motion.apply(time, piece);
    const bottom = piece.position.y + Math.min(...vertices.map(vertex => point.copy(vertex).applyQuaternion(piece.quaternion).y));
    assert.ok(bottom >= 0.00299, 'interpolated contact geometry remains above the floor');
    if (bottom < 0.004) touched = true;
    if (touched) maximumBounce = Math.max(maximumBounce, bottom);
  }
  assert.ok(maximumBounce > 0.02 && maximumBounce < 0.08, 'a small rebound loses most of the original 1.4 m drop energy');
  assert.ok(piece.position.x > 0.4 && piece.position.x < 0.7, 'floor friction arrests the initial 1 m/s slide');
  motion.apply(1.371, piece);
  const expected = piece.matrix.compose(piece.position, piece.quaternion, piece.scale).toArray();
  for (const fps of [24, 30, 60, 144]) {
    for (let time = 0; time < 3; time += 1 / fps) motion.apply(time, piece);
    motion.apply(1.371, piece);
    assert.deepEqual(piece.matrix.compose(piece.position, piece.quaternion, piece.scale).toArray(), expected, `${fps} fps playback and backward seeking must reproduce the same pose`);
  }
});

test('seeking never creates scene resources and restores all visible poses', () => {
  const scene = new GoopIntroScene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 50);
  try {
    const count = resourceCounts(scene.root);
    const art = scene.resources.diagnostics;
    scene.apply(sampleGoopIntro(6.2), camera);
    const first = visibleTransforms(scene.root);
    scene.apply(sampleGoopIntro(0), camera);
    scene.apply(sampleGoopIntro(10), camera);
    scene.apply(sampleGoopIntro(6.2), camera);
    assert.deepEqual(visibleTransforms(scene.root), first);
    assert.deepEqual(resourceCounts(scene.root), count);
    assert.deepEqual(scene.resources.diagnostics, art);
    assert.ok(camera.position.toArray().every(Number.isFinite));
  } finally { scene.dispose(); }
  scene.dispose();
  assert.equal(scene.root.children.length, 0);
  assert.equal(scene.resources.diagnostics.disposed, true);
});

test('authored Goop really intercepts the shot and all later GPU resources are primed before playback', async () => {
  const scene = new GoopIntroScene();
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 50);
  world.add(scene.root);
  try {
    const bytes = await readFile(new URL('../assets/characters/bob/bob-authored.glb', import.meta.url));
    await Promise.all([
      scene.bob.prepare(async () => (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene),
      scene.goop.prepare(loadGoop),
    ]);
    let compiled = 0, drawn = 0;
    const renderer = {
      compileAsync: async () => {
        compiled++;
        assert.equal(scene.drone.rig.visible, true);
        assert.equal(scene.drone.wreck.visible, true);
        for (const effect of [scene.incomingShot, scene.acidShot, scene.charge, scene.shieldSparks, scene.impactSparks, scene.smoke]) {
          assert.equal(effect.visible, true, effect.name);
        }
      },
      render: () => { drawn++; },
    } as unknown as THREE.WebGLRenderer;
    await scene.prepare(renderer, world, camera);
    assert.equal(compiled, 1);
    assert.equal(drawn, 1);
    assert.equal(scene.bob.ready, true);
    assert.equal(scene.goop.ready, true);
    assert.equal(scene.drone.wreck.visible, false);
    assert.equal(scene.incomingShot.visible, false);

    const frustum = new THREE.Frustum();
    for (const time of [0, 0.8, T.lookUp, 2.5, T.reverseCut]) {
      scene.apply(sampleGoopIntro(time), camera);
      scene.root.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const goopBounds = new THREE.Box3().setFromObject(scene.goop.root.getObjectByName('Goop-Body')!, true);
      assert.equal(frustum.intersectsBox(goopBounds), false, `${time}: Goop must enter from off-screen, not be revealed early`);
    }

    scene.apply(sampleGoopIntro(T.shieldHit));
    scene.root.updateMatrixWorld(true);
    const direction = new THREE.Vector3().fromArray(GOOP_INTRO_BOB_POSITION).sub(scene.drone.fireOrigin).normalize();
    const hit = new THREE.Raycaster(scene.drone.fireOrigin, direction)
      .intersectObject(scene.goop.root.getObjectByName('Goop-Body')!)[0]!;
    assert.ok(hit, 'incoming shot must hit the authored gel mesh');
    assert.ok(hit.point.distanceTo(scene.shieldPosition) <= 0.02001);
    assert.ok(hit.distance < new THREE.Vector3().fromArray(GOOP_INTRO_BOB_POSITION).distanceTo(scene.drone.fireOrigin) - 0.9);
    assert.equal(new THREE.Raycaster(scene.drone.fireOrigin, direction)
      .intersectObject(scene.bob.root.getObjectByName('Bob-Body')!).length, 0,
      'the shove really moves Bob clear of the fired shot');
    scene.apply(sampleGoopIntro(T.goopLands));
    assert.ok(scene.shieldEffectPosition.y < scene.shieldPosition.y - 0.15,
      'the interception flash follows Goop down instead of floating above his head');
    for (let t = 0; t <= GOOP_INTRO_DURATION_SECONDS; t += 0.1) {
      scene.apply(sampleGoopIntro(t));
      scene.root.updateMatrixWorld(true);
      const bobFloor = new THREE.Box3().setFromObject(scene.bob.root.getObjectByName('Bob-Body')!, true).min.y;
      const goopFloor = new THREE.Box3().setFromObject(scene.goop.root.getObjectByName('Goop-Body')!, true).min.y;
      assert.ok(bobFloor > -0.005, `${t}: Bob below floor`);
      assert.ok(goopFloor > -0.005, `${t}: Goop below floor`);
    }
  } finally { scene.dispose(); }
});

function resourceCounts(root: THREE.Object3D) {
  const geometry = new Set<string>(), materials = new Set<string>();
  let objects = 0;
  root.traverse(object => {
    objects++;
    if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
      geometry.add(object.geometry.uuid);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material.uuid);
    }
  });
  return { objects, geometry: [...geometry], materials: [...materials] };
}

function visibleTransforms(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const transforms: unknown[] = [];
  root.traverseVisible(object => transforms.push([object.name, object.matrixWorld.toArray()]));
  return transforms;
}

function vertexCloud(root: THREE.Object3D): string[] {
  const points: string[] = [], point = new THREE.Vector3();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      points.push(point.toArray().map(value => Math.round(value * 1e6)).join(','));
    }
  });
  return points.sort();
}
