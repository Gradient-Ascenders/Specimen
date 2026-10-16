import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { OpeningTrailerScene, TRAILER_BOB_CLEARANCE_RADIUS_METRES } from '../src/trailer/OpeningTrailerScene.ts';
import { OPENING_TRAILER_DURATION_SECONDS, OPENING_TRAILER_TIMING, sampleOpeningTrailer } from '../src/trailer/OpeningTrailerTimeline.ts';

const HATCH_SAMPLE_SECONDS = OPENING_TRAILER_TIMING.emergeEnd + 0.2;

test('opening starts outside a closed door and enters before the room lights turn on', () => {
  assert.equal(sampleOpeningTrailer(0).stage, 'outside');
  assert.equal(sampleOpeningTrailer(0).doorOpen, 0);
  assert.equal(sampleOpeningTrailer(2.6).doorOpen, 1);
  assert.equal(sampleOpeningTrailer(5.8).stage, 'dark-room');
  assert.equal(sampleOpeningTrailer(5.8).roomLighting, 0);
  assert.equal(sampleOpeningTrailer(6.45).stage, 'reveal');
  assert.ok(sampleOpeningTrailer(6.45).roomLighting > 0);
  assert.equal(sampleOpeningTrailer(7.25).roomLighting, 1);
});

test('entering darkness includes independent brief on-off flickers before the main reveal', () => {
  for (const seconds of [4.32, 4.81, 5.28, 5.63, 6.07]) {
    const frame = sampleOpeningTrailer(seconds);
    assert.ok(frame.roomLighting > 0 && frame.roomLighting < 0.4);
    assert.equal(frame.eggState, 'intact');
  }
  for (const seconds of [4.4, 4.9, 5.4, 5.8, 6.2]) {
    assert.equal(sampleOpeningTrailer(seconds).roomLighting, 0);
  }
});

test('the egg holds intact for several seconds after the reveal before cracking and revealing Bob', () => {
  assert.equal(sampleOpeningTrailer(10.3).eggState, 'intact');
  assert.equal(sampleOpeningTrailer(10.4).eggState, 'crack-stage-1');
  assert.equal(sampleOpeningTrailer(11.8).eggState, 'crack-stage-1');
  assert.equal(sampleOpeningTrailer(12).eggState, 'crack-stage-2');
  assert.equal(sampleOpeningTrailer(13.6).eggState, 'crack-stage-3');
  assert.equal(sampleOpeningTrailer(15.1).eggState, 'half-broken');
  assert.equal(sampleOpeningTrailer(OPENING_TRAILER_TIMING.emergeStart).emergence, 0);
  assert.ok(sampleOpeningTrailer(17.5).emergence > 0);
  assert.equal(sampleOpeningTrailer(OPENING_TRAILER_TIMING.emergeEnd).emergence, 1);
  assert.ok(OPENING_TRAILER_TIMING.shellStart - OPENING_TRAILER_TIMING.crackOne >= 4.5);
  assert.equal(sampleOpeningTrailer(OPENING_TRAILER_DURATION_SECONDS).stage, 'complete');
});

test('timeline sampling clamps invalid/boundary times and is deterministic when rewound', () => {
  for (const time of [NaN, Infinity, -1]) {
    assert.deepEqual(sampleOpeningTrailer(time), sampleOpeningTrailer(0));
  }
  assert.deepEqual(sampleOpeningTrailer(1000), sampleOpeningTrailer(OPENING_TRAILER_DURATION_SECONDS));
  const expected = sampleOpeningTrailer(11.35);
  sampleOpeningTrailer(OPENING_TRAILER_DURATION_SECONDS);
  assert.deepEqual(sampleOpeningTrailer(11.35), expected);
});

test('trailer camera crosses an already-open door, stays inside, and frames the existing containment', () => {
  const scene = new OpeningTrailerScene();
  const camera = new THREE.PerspectiveCamera();
  scene.apply(sampleOpeningTrailer(0), camera);
  assert.ok(camera.position.z > 6);
  for (let seconds = 0; seconds <= OPENING_TRAILER_DURATION_SECONDS; seconds += 0.05) {
    const frame = sampleOpeningTrailer(seconds);
    scene.apply(frame, camera);
    if (Math.abs(camera.position.z - 6) < 0.5) {
      assert.equal(frame.doorOpen, 1);
      assert.ok(camera.position.x > 2.8 && camera.position.x < 5.8);
    }
    if (seconds > 5.4) assert.ok(camera.position.z < 5.5);
    assert.ok(Math.abs(camera.position.x) < 7);
  }
  scene.apply(sampleOpeningTrailer(5.8), camera);
  assert.ok(scene.roomLights.every(light => light.intensity === 0));
  scene.apply(sampleOpeningTrailer(HATCH_SAMPLE_SECONDS), camera);
  assert.ok(camera.position.distanceTo(scene.room.eggRoot.position) < 3);
  assert.equal(scene.room.intactFrameAndPanes.visible, true);
  assert.equal(scene.room.shatteredFrameAndDebris.visible, false);
  scene.apply(sampleOpeningTrailer(10.3));
  scene.root.updateMatrixWorld(true);
  const intactShell = scene.eggFracture.root;
  // The whole egg, rather than only its dome, must sit above the machine base.
  assert.ok(new THREE.Box3().setFromObject(intactShell, true).min.y >= 1.65);
  const ceiling = scene.room.root.getObjectByName('room-1-containment-upper-gasket-seat')!;
  const ceilingBottom = new THREE.Box3().setFromObject(ceiling).min.y;
  assert.ok(new THREE.Box3().setFromObject(intactShell, true).max.y < ceilingBottom);
  for (let seconds = OPENING_TRAILER_TIMING.shellStart; seconds <= HATCH_SAMPLE_SECONDS; seconds += 0.1) {
    scene.apply(sampleOpeningTrailer(seconds));
    scene.root.updateMatrixWorld(true);
    for (const fragment of scene.eggFracture.fragments) {
      const bounds = new THREE.Box3().setFromObject(fragment.root, true);
      const context = `${seconds}: ${fragment.root.name}`;
      assert.ok(bounds.max.y < ceilingBottom, context);
      assert.ok(bounds.min.y >= 1.65, context);
      assert.ok(bounds.min.x >= -0.935 && bounds.max.x <= 0.935, context);
      assert.ok(bounds.min.z >= -1.375 && bounds.max.z <= 0.375, context);
    }
  }
  scene.dispose();
});

test('partial hatch rewinds cleanly without changing light counts or allocating scene resources', () => {
  const scene = new OpeningTrailerScene();
  const originalObjectCount = countObjects(scene.root);
  const originalResources = scene.resources.diagnostics;
  scene.apply(sampleOpeningTrailer(HATCH_SAMPLE_SECONDS));
  assert.ok(scene.eggFracture.fragments.some(fragment => fragment.root.rotation.x !== 0));
  assert.equal(scene.bob.root.visible, true);
  assert.ok(scene.eggFracture.fragments.every(fragment => fragment.cracks.visible));
  assert.ok(scene.roomLights.every(light => light.visible));
  const transforms = captureTransforms(scene);
  scene.apply(sampleOpeningTrailer(0));
  assert.ok(scene.eggFracture.fragments.every(fragment => fragment.root.rotation.x === 0 && !fragment.cracks.visible));
  assert.equal(scene.bob.root.visible, true); // Hidden by the intact opaque egg, never spawned mid-shot.
  assert.ok(Object.values(scene.room.eggStates).every(state => !state.visible));
  assert.ok(scene.roomLights.every(light => light.visible && light.intensity === 0));
  scene.apply(sampleOpeningTrailer(HATCH_SAMPLE_SECONDS));
  assert.deepEqual(captureTransforms(scene), transforms);
  assert.equal(countObjects(scene.root), originalObjectCount);
  assert.deepEqual(scene.resources.diagnostics, originalResources);
  scene.dispose();
  scene.dispose();
  assert.equal(scene.resources.diagnostics.disposed, true);
  assert.equal(scene.root.children.length, 0);
});

function countObjects(root: THREE.Object3D): number {
  let count = 0;
  root.traverse(() => count += 1);
  return count;
}

function captureTransforms(scene: OpeningTrailerScene): unknown {
  scene.root.updateMatrixWorld(true);
  return [scene.eggFracture.root, ...scene.eggFracture.fragments.map(fragment => fragment.root), scene.bob.root].map(object => ({
    name: object.name,
    matrix: object.matrixWorld.toArray(),
    visible: object.visible,
  }));
}

test('every visible crack is a true shared border of the exact pieces that separate', () => {
  const scene = new OpeningTrailerScene();
  const egg = scene.eggFracture;
  const vertices = egg.fragments.map(fragment => {
    const data = fragment.shell.geometry.getAttribute('position');
    const points: THREE.Vector3[] = [];
    const outerCount = fragment.shell.geometry.groups[0].count;
    for (let index = 0; index < outerCount; index += 1) {
      points.push(new THREE.Vector3().fromBufferAttribute(data, index).add(fragment.centre));
    }
    return points;
  });
  assert.equal(egg.fragments.length, 6);
  assert.ok(egg.seams.length > 50);
  for (const seam of egg.seams) {
    for (const owner of seam.owners) {
      for (const point of [seam.a, seam.b]) {
        assert.ok(vertices[owner].some(vertex => vertex.distanceToSquared(point) < 1e-12));
      }
    }
  }
  egg.apply('crack-stage-1', 0);
  const firstStage = egg.fragments.reduce((sum, fragment) => sum + fragment.cracks.geometry.drawRange.count, 0);
  egg.apply('crack-stage-3', 0);
  const finalStage = egg.fragments.reduce((sum, fragment) => sum + fragment.cracks.geometry.drawRange.count, 0);
  assert.ok(firstStage > 0 && finalStage > firstStage);
  for (const fragment of egg.fragments) assert.equal(fragment.cracks.parent, fragment.shell.parent);
  for (const fragment of egg.fragments) {
    const ribbon = fragment.cracks.geometry.getAttribute('position');
    for (let index = 0; index < ribbon.count; index += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(ribbon, index).add(fragment.centre);
      assert.ok(point.length() >= 0.499 && point.length() <= 0.504);
    }
  }
  scene.dispose();
});

test('hatch reveals only Bob with a continuous settling pose and no separate fluid effects', () => {
  const scene = new OpeningTrailerScene();
  const initialCount = countObjects(scene.root);
  const position = scene.bob.root.position.clone();
  const scale = scene.bob.root.scale.clone();
  for (let seconds = 0; seconds <= OPENING_TRAILER_DURATION_SECONDS; seconds += 0.025) {
    scene.apply(sampleOpeningTrailer(seconds));
    assert.equal(scene.bob.root.visible, true);
    assert.ok(position.distanceTo(scene.bob.root.position) < 0.025, `${seconds}: position jumps`);
    assert.ok(scale.distanceTo(scene.bob.root.scale) < 0.01, `${seconds}: scale jumps`);
    position.copy(scene.bob.root.position);
    scale.copy(scene.bob.root.scale);
  }
  assert.equal(scene.root.getObjectByName('trailer-natural-gel-spill'), undefined);
  assert.equal(scene.root.getObjectByName('trailer-bob-merging-gel-lobes'), undefined);
  assert.equal(countObjects(scene.root), initialCount);
  scene.dispose();
});

test('Bob stays inside the egg from the start and is revealed continuously without shell intersections', async () => {
  const scene = new OpeningTrailerScene();
  const bytes = await readFile(new URL('../assets/characters/bob/bob-authored.glb', import.meta.url));
  await scene.bob.prepare(async () => (await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
  )).scene);
  const liveMeshes = ['Bob-Body', 'Bob-Eye-Left', 'Bob-Eye-Right'].map(name => {
    const mesh = scene.bob.root.getObjectByName(name);
    assert.ok(mesh instanceof THREE.Mesh);
    return mesh;
  });
  const point = new THREE.Vector3();
  const triangle = new THREE.Triangle();
  const origin = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const envelopeCentre = new THREE.Vector3();
  const envelopeRadii = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let checkedPoses = 0;
  const sampleTimes = [0, 8.1, 13.8];
  for (let seconds = OPENING_TRAILER_TIMING.shellStart; seconds <= OPENING_TRAILER_DURATION_SECONDS; seconds += 0.125) {
    sampleTimes.push(seconds);
  }
  for (const seconds of sampleTimes) {
    const frame = sampleOpeningTrailer(seconds);
    scene.apply(frame);
    scene.root.updateMatrixWorld(true);
    assert.equal(scene.bob.root.visible, true);
    assert.ok(scene.bob.root.scale.x >= 0.5);
    checkedPoses += 1;
    envelopeCentre.copy(scene.bob.root.position);
    envelopeCentre.y += scene.bob.root.scale.y * 0.04;
    envelopeRadii.set(scene.bob.root.scale.x * 0.64, scene.bob.root.scale.y * 0.7, scene.bob.root.scale.z * 0.59);
    let modelRadius = 0;
    // Check the actual authored body and expression-morphed eyes, with room
    // left over for the material's few millimetres of secondary deformation.
    for (const mesh of liveMeshes) {
      const positions = mesh.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
        const radius = Math.hypot(point.x - scene.bob.root.position.x, point.z - scene.bob.root.position.z);
        modelRadius = Math.max(modelRadius, radius);
        assert.ok(radius + 0.01 < TRAILER_BOB_CLEARANCE_RADIUS_METRES, `${seconds}: ${mesh.name}`);
        assert.ok(point.y >= 1.655, `${seconds}: ${mesh.name} below the floor`);
        assert.ok(point.sub(envelopeCentre).divide(envelopeRadii).lengthSq() < 1,
          `${seconds}: ${mesh.name} exceeds its clearance envelope`);
      }
    }
    for (const fragment of scene.eggFracture.fragments) {
      direction.copy(fragment.currentClearanceDirection).transformDirection(scene.room.eggRoot.matrixWorld);
      direction.y = 0;
      direction.normalize();
      for (const mesh of [fragment.shell, fragment.cracks]) {
        const positions = mesh.geometry.getAttribute('position');
        if (fragment.clearanceActive) {
          // Rotating pieces stay wholly beyond a separating plane outside
          // the real model, including its secondary shader deformation.
          for (let index = 0; index < positions.count; index += 1) {
            point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
            const projection = (point.x - scene.bob.root.position.x) * direction.x +
              (point.z - scene.bob.root.position.z) * direction.z;
            assert.ok(projection >= modelRadius + 0.01, `${seconds}: ${mesh.name} rolls through Bob`);
          }
        } else {
          // Before rolling, pieces slide outward from the closed shell.
          // Test complete triangles against the enclosing body ellipsoid,
          // not just vertices, which could miss a face crossing the model.
          for (let index = 0; index < positions.count; index += 3) {
            for (const [corner, vertex] of [[triangle.a, index], [triangle.b, index + 1], [triangle.c, index + 2]] as const) {
              corner.fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld)
                .sub(envelopeCentre).divide(envelopeRadii);
            }
            triangle.closestPointToPoint(origin, closest);
            assert.ok(closest.lengthSq() >= 1, `${seconds}: ${mesh.name} intersects Bob before rolling`);
          }
        }
      }
    }
  }
  assert.ok(checkedPoses >= 20);
  scene.dispose();
});
