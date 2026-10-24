import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { OpeningGameScene, type OpeningSceneOptions } from '../src/cinematics/OpeningGameScene.ts';
import { OPENING_GAME_TIMING as T, sampleOpeningGame } from '../src/cinematics/OpeningGameTimeline.ts';
import { OpeningLaboratory, OPENING_DOOR_SHOTS, OPENING_EXPERIMENTS, OPENING_LAB_LAYOUT as L } from '../src/cinematics/OpeningLaboratory.ts';
import { OpeningRoomOne, OPENING_ROOM_ONE_LAYOUT as R } from '../src/cinematics/OpeningRoomOne.ts';
import { RenderShadowPolicy, type RenderLayer } from '../src/render/RenderLayer.ts';
import { createContainmentExperimentDirectoryTexture } from '../src/render/environment/containment/ContainmentProceduralTextures.ts';
import { TitleScreenScene } from '../src/ui/TitleScreenScene.ts';
import { RoomOneArt } from '../src/render/environment/containment/RoomOneArt.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import {useOpeningAssetFixtures} from './helpers/OpeningLaboratoryAsset.ts';
import {auditRoomOneRearWall} from './helpers/RoomOneRearWallSurfaces.ts';

const createScene = (options?: OpeningSceneOptions) => { const scene = new OpeningGameScene(new TitleScreenScene(), undefined, options); scene.begin(); return scene; };

test('the opening blacks out, tours experiment doors, enters Bob’s lab and only then hatches', () => {
  assert.equal(sampleOpeningGame(0).fade, 0);
  for (const time of [T.blackoutEnd, 0.9, T.labReveal]) assert.equal(sampleOpeningGame(time).fade, 1);
  assert.equal(sampleOpeningGame(T.labVisible).fade, 0);
  for (const [time, stage] of [[0, 'blackout'], [T.labReveal, 'laboratory'], [T.labEstablished, 'experiments'],
    [T.bobDoor, 'bob-door'], [T.entryStart, 'entering'], [T.hatchStart, 'awakening'], [T.crackOne, 'cracking']] as const) {
    assert.equal(sampleOpeningGame(time).stage, stage);
  }
  assert.ok(T.doorClear < T.entryStart);
  assert.ok(T.hatchStart < T.crackOne);
  assert.equal(T.end, 54);
  assert.deepEqual(OPENING_EXPERIMENTS.map(entry => entry.specimen), ['PLUTO', 'MIMIC', 'GOOP', 'VOLT', 'BOB']);
  assert.equal(OPENING_DOOR_SHOTS.length, OPENING_EXPERIMENTS.length);
  for (let time = 0; time < T.hatchStart; time += 0.125) {
    const frame = sampleOpeningGame(time);
    assert.equal(frame.hatchSeconds, 0);
    assert.equal(frame.eggState, 'intact'); assert.equal(frame.rock, 0);
  }
});

test('five different experiment/danger plaques share one deterministic, upright atlas', () => {
  const scene = createScene(), atlas = scene.laboratory.labelTexture;
  const copy = createContainmentExperimentDirectoryTexture(OPENING_EXPERIMENTS);
  try {
    assert.equal(scene.laboratory.labels.length, 5);
    assert.equal(new Set(scene.laboratory.labels.map(label => label.material)).size, 1);
    assert.deepEqual([atlas.image.width, atlas.image.height], [512, 1024]);
    assert.equal(atlas.image.data.byteLength, 2_097_152);
    assert.deepEqual(atlas.image.data, copy.image.data);
    assert.deepEqual(atlas.userData.directoryLines.at(-1), ['SP-01', 'EXPERIMENT: BOB', 'DANGER: UNKNOWN']);
    const goop = OPENING_EXPERIMENTS.find(entry => entry.specimen === 'GOOP')!;
    const mimic = OPENING_EXPERIMENTS.find(entry => entry.specimen === 'MIMIC')!;
    const volt = OPENING_EXPERIMENTS.find(entry => entry.specimen === 'VOLT')!;
    assert.equal(goop.threat, 'CRITICAL');assert.equal(volt.threat,'CRITICAL');assert.equal(mimic.threat,'HIGH');
    assert.equal(goop.colour,volt.colour);assert.equal(mimic.colour,0xe9b05a);
    assert.deepEqual(atlas.userData.directoryLines[2], ['SP-02', 'EXPERIMENT: GOOP', 'DANGER: CRITICAL']);
    scene.laboratory.labels.forEach((label, index) => {
      assert.deepEqual(label.userData.labelLines, atlas.userData.directoryLines[index]);
      const positions = label.geometry.getAttribute('position'), uv = label.geometry.getAttribute('uv');
      for (let vertex = 0; vertex < uv.count; vertex++) {
        const expected = (index * 128 + (positions.getY(vertex) > 0 ? 0 : 128)) / 1024;
        assert.equal(uv.getY(vertex), expected, 'The plaque must be upright, not read from another atlas row.');
      }
    });
    assert.equal(new Set(atlas.userData.directoryLines.map((row: string[]) => row[1])).size, 5);
    // Check the actual uploaded pixels, not only the label metadata.
    for (const [index, expected] of [[0, [117, 213, 149, 255]], [1, [233, 176, 90, 255]],
      [2, [238, 112, 107, 255]], [3,[238,112,107,255]], [4, [112, 185, 241, 255]]] as const) {
      const pixel = ((index * 128 + 20) * 512 + 14) * 4;
      assert.deepEqual(Array.from(atlas.image.data.slice(pixel, pixel + 4)), expected);
    }
    assert.throws(() => createContainmentExperimentDirectoryTexture([]), /one to eight/);
  } finally { copy.dispose(); scene.dispose(); }
});

test('each door plaque is fully framed and unobstructed in the Blender set, including portrait', async context => {
  useOpeningAssetFixtures(context);
  const scene = createScene(), point = new THREE.Vector3(), direction = new THREE.Vector3();
  try {
    await scene.laboratory.prepare();
    for (const aspect of [16 / 9, 4 / 3, 1, 320 / 900]) for (const reducedMotion of [false, true]) {
      OPENING_DOOR_SHOTS.forEach((shot, index) => {
        for (const offset of [-0.4, 0, 0.4]) {
          scene.apply(sampleOpeningGame(shot + offset), aspect, reducedMotion);
          scene.room.scene.updateMatrixWorld(true); scene.room.camera.updateMatrixWorld(true);
          const label = scene.laboratory.labels[index];
          const positions = label.geometry.getAttribute('position');
          for (let vertex = 0; vertex < positions.count; vertex++) {
            point.fromBufferAttribute(positions, vertex).applyMatrix4(label.matrixWorld).project(scene.room.camera);
            assert.ok(Math.abs(point.x) < 0.99 && Math.abs(point.y) < 0.8 && point.z > -1 && point.z < 1,
              `${label.name}: cropped at aspect ${aspect}, reduced motion ${reducedMotion}`);
          }
          // Avoid the plane's shared triangle diagonal, where a mathematically
          // exact centre hit can miss both triangles through floating-point error.
          point.set(0.13, 0.039, 0).applyMatrix4(label.matrixWorld);
          direction.copy(point).sub(scene.room.camera.position);
          const ray = new THREE.Raycaster(scene.room.camera.position, direction.clone().normalize(), 0, direction.length() + 0.01);
          const hits = ray.intersectObjects([scene.laboratory.root, scene.laboratory.entrance], true);
          assert.equal(hits[0]?.object === label, true, `${label.name} must not be hidden behind its door/wall (first hit: ${hits[0]?.object.name}).`);
        }
      });
    }
  } finally { scene.dispose(); }
});

test('the entire Bob plaque stays unobstructed throughout the authored approach, not just its centre', async context => {
  useOpeningAssetFixtures(context);
  const scene = createScene(), point = new THREE.Vector3(), direction = new THREE.Vector3();
  try {
    await scene.laboratory.prepare();
    const label = scene.laboratory.labels.at(-1)!;
    const width = 3, height = 0.75;
    for (let seconds = T.bobDoor; seconds < T.entryStart; seconds += 0.15) {
      scene.apply(sampleOpeningGame(seconds), 16 / 9);
      scene.room.scene.updateMatrixWorld(true);
      // Include the upper lettering rows: the old beam missed the centre ray
      // while hiding a horizontal band across EXPERIMENT: BOB.
      for (const x of [-0.46, -0.13, 0.07, 0.46]) for (const y of [-0.46, -0.2, 0.06, 0.27, 0.36, 0.46]) {
        point.set(x * width, y * height, 0).applyMatrix4(label.matrixWorld);
        direction.copy(point).sub(scene.room.camera.position);
        const first = new THREE.Raycaster(scene.room.camera.position, direction.clone().normalize(), 0, direction.length() + 0.01)
          .intersectObjects([scene.laboratory.root, scene.laboratory.entrance], true)[0];
        assert.equal(first?.object===label, true, `Plaque obscured at ${seconds}, local sample ${x}, ${y} by ${first?.object.name}.`);
      }
    }
  } finally { scene.dispose(); }
});

test('the extended wing suggests large rooms while the camera advances through every label shot', () => {
  const scene = createScene();
  try {
    assert.equal(L.backZ - L.frontZ, 74, 'Remove the two unused rooms without compressing the remaining door spacing.');
    for (let index = 1; index < OPENING_EXPERIMENTS.length - 1; index++) assert.ok(OPENING_EXPERIMENTS[index - 1].z - OPENING_EXPERIMENTS[index].z >= 13);
    for (let index = 2; index < OPENING_EXPERIMENTS.length - 1; index++) assert.ok(OPENING_EXPERIMENTS[index - 2].z - OPENING_EXPERIMENTS[index].z >= 26);
    let previousZ = Infinity;
    const speed = (L.startZ - L.endZ) / (T.entryStart - T.labReveal), step = 1 / 30;
    for (let time = T.labReveal; time < T.hatchStart; time += step) {
      scene.apply(sampleOpeningGame(time), 16 / 9);
      const { position } = scene.room.camera;
      assert.ok(position.z < previousZ, `Forward travel cannot pause at ${time}.`);
      if (time < T.entryStart) {
        assert.equal(position.x, L.centreX);
        assert.equal(position.y, L.eyeHeight, 'Panning must not lift the dolly towards the ceiling.');
        if (Number.isFinite(previousZ)) assert.ok(Math.abs(previousZ - position.z - speed * step) < 1e-10);
      }
      previousZ = position.z;
    }
  } finally { scene.dispose(); }
});

test('door-to-door pans stay level, turn slowly and tilt only slightly after facing each plaque', () => {
  const scene = createScene(), previous = new THREE.Quaternion(), direction = new THREE.Vector3();
  try {
    scene.apply(sampleOpeningGame(T.labReveal), 16 / 9); previous.copy(scene.room.camera.quaternion);
    const step = 1 / 60;
    for (let time = T.labReveal + step; time < T.entryStart; time += step) {
      scene.apply(sampleOpeningGame(time), 16 / 9);
      const camera = scene.room.camera;
      assert.equal(camera.rotation.z, 0, 'No rolling/banking during the horizontal pan.');
      assert.ok(camera.rotation.x >= 0 && camera.rotation.x <= 0.245, 'Only a small upward plaque tilt, never the roof.');
      assert.ok(previous.angleTo(camera.quaternion) / step < THREE.MathUtils.degToRad(45), 'No rapid whip-pan between opposite doors.');
      previous.copy(camera.quaternion);
    }
    for (let index = 1; index < OPENING_EXPERIMENTS.length - 1; index++) {
      const panMidpoint = (OPENING_DOOR_SHOTS[index - 1] + 0.4 + OPENING_DOOR_SHOTS[index] - 1.5) / 2;
      scene.apply(sampleOpeningGame(panMidpoint), 16 / 9);
      assert.equal(scene.room.camera.rotation.x, 0, 'Keep the middle of the pan horizontal.');
      scene.apply(sampleOpeningGame(OPENING_DOOR_SHOTS[index]), 16 / 9);
      scene.room.camera.getWorldDirection(direction);
      assert.equal(Math.sign(direction.x), OPENING_EXPERIMENTS[index].side);
      assert.ok(scene.room.camera.rotation.x > 0.1, 'Tilt up once facing the label.');
    }
  } finally { scene.dispose(); }
});

test('the hatch has restrained neutral lighting while the wing keeps readable plaques and four fixed lights', () => {
  const scene = createScene();
  try {
    for (const time of [T.labVisible, ...OPENING_DOOR_SHOTS, T.hatchStart, T.impact, T.formEnd]) {
      scene.apply(sampleOpeningGame(time), 16 / 9);
      const lights: THREE.Light[] = [];
      scene.room.scene.traverseVisible(object => { if (object instanceof THREE.Light) lights.push(object); });
      assert.equal(lights.length, 4);
      assert.ok(scene.room.keyLight.intensity >= 160 && scene.room.keyLight.intensity <= 210);
      const fill = lights.find(light => light instanceof THREE.HemisphereLight)!;
      assert.ok(fill.intensity >= 0.57 && fill.intensity <= 0.8);
      assert.equal(lights.filter(light => light.castShadow).length, 1);
      if (time >= T.hatchStart) {
        assert.equal(scene.room.keyLight.intensity, 165, 'Avoid the previous 340-intensity blown-out hatch key.');
        assert.equal(fill.intensity, 0.58);
        const rim = lights.find(light => light.name === 'title-laboratory-rim')!;
        assert.equal(rim.intensity, 14);
        assert.equal(rim.color.getHex(), 0xb0cbd1, 'A neutral cool rim, not a purple wash on the chamber.');
      }
    }
  } finally { scene.dispose(); }
});

test('camera stays in the sealed wing and crosses an open physical portal instead of a solid wall', () => {
  const scene = createScene(), previous = new THREE.Vector3(), direction = new THREE.Vector3();
  try {
    scene.apply(sampleOpeningGame(T.blackoutEnd), 16 / 9);
    previous.copy(scene.room.camera.position);
    let crossings = 0;
    for (let time = T.blackoutEnd + 1 / 60; time <= T.hatchStart; time += 1 / 60) {
      const frame = sampleOpeningGame(time);
      scene.apply(frame, 16 / 9); scene.room.scene.updateMatrixWorld(true);
      const camera = scene.room.camera;
      assert.ok(camera.position.y > 0.5 && camera.position.y < 4.2);
      if (camera.position.z > R.doorwayZ) assert.ok(Math.abs(camera.position.x - L.centreX) < 3.1 && camera.position.z < L.backZ);
      else assert.ok(Math.abs(camera.position.x) < R.halfWidth - 0.2 && camera.position.z > R.backZ && camera.position.z < R.doorwayZ);
      direction.copy(camera.position).sub(previous);
      if (direction.length() > 1e-6) {
        const ray = new THREE.Raycaster(previous, direction.clone().normalize(), 0, direction.length());
        assert.deepEqual(ray.intersectObject(scene.laboratory.entrance, true), [], 'No door/frame camera clipping.');
      }
      if (previous.z >= R.doorwayZ && camera.position.z < R.doorwayZ) {
        crossings++;
        assert.equal(frame.doorOpen, 1);
        assert.ok(Math.abs(camera.position.x - R.doorwayX) < 1.35);
      }
      previous.copy(camera.position);
    }
    assert.equal(crossings, 1);
    scene.apply(sampleOpeningGame(T.hatchStart + 0.2), 16 / 9);
    scene.room.scene.updateMatrixWorld(true);
    assert.equal(sampleOpeningGame(T.hatchStart + 0.2).doorOpen, 0);
    const ray = new THREE.Raycaster(new THREE.Vector3(R.doorwayX, 2, 4.5), new THREE.Vector3(0, 0, 1), 0, 3);
    assert.ok(ray.intersectObjects([...scene.laboratory.doorLeaves], true).length > 0, 'The closed leaves seal the wall opening behind us.');
    assert.equal(scene.laboratory.root.visible, false, 'Do not render the experiment wing during the hatch.');
  } finally { scene.dispose(); }
});

test('sliding leaves remain clear of solid frame parts and retract into covered side pockets', () => {
  const scene = createScene(), matrix = new THREE.Matrix4(), world = new THREE.Matrix4();
  try {
    scene.apply(sampleOpeningGame(T.doorStart), 16 / 9);
    scene.room.scene.updateMatrixWorld(true);
    const structures: { name: string; bounds: THREE.Box3 }[] = [];
    const collectStructures = (object: THREE.Object3D) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      const names: string[] | undefined = object.userData.staticBatchSourceNames;
      object.geometry.computeBoundingBox();
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, matrix); world.multiplyMatrices(object.matrixWorld, matrix);
        structures.push({ name: names?.[index] ?? `${object.name}-${index}`, bounds: object.geometry.boundingBox!.clone().applyMatrix4(world) });
      }
    };
    scene.laboratory.entrance.traverse(collectStructures);
    for (const child of scene.laboratory.root.children) collectStructures(child);
    assert.equal(structures.filter(part => /pocket-.*-(front|back|end)$/.test(part.name)).length, 6);
    for (const [start, end] of [[T.doorStart, T.doorClear], [T.doorClose, T.hatchStart + 0.2]]) {
      for (let sample = 0; sample <= 100; sample++) {
        const frame = sampleOpeningGame(THREE.MathUtils.lerp(start, end, sample / 100));
        scene.apply(frame, 16 / 9); scene.room.scene.updateMatrixWorld(true);
        for (const leaf of scene.laboratory.doorLeaves) leaf.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          const bounds = new THREE.Box3().setFromObject(object);
          for (const part of structures) {
            const x = Math.min(bounds.max.x, part.bounds.max.x) - Math.max(bounds.min.x, part.bounds.min.x);
            const y = Math.min(bounds.max.y, part.bounds.max.y) - Math.max(bounds.min.y, part.bounds.min.y);
            const z = Math.min(bounds.max.z, part.bounds.max.z) - Math.max(bounds.min.z, part.bounds.min.z);
            assert.ok(x <= 1e-5 || y <= 1e-5 || z <= 1e-5, `${object.name} intersects ${part.name} at door openness ${frame.doorOpen}`);
          }
          if (frame.doorOpen === 1) {
            assert.ok(Math.abs(bounds.min.x - R.doorwayX) >= R.doorwayHalfWidth && Math.abs(bounds.max.x - R.doorwayX) >= R.doorwayHalfWidth, 'Retracted leaves clear the entire 3.1m entrance.');
            assert.ok(bounds.min.y >= 0.04 && bounds.max.y < 3.9, 'Clear the threshold and overhead guide.');
          }
        });
      }
    }
    // Both faces of the housing cover each fully retracted panel. A peek
    // through its opening must hit casing, not a leaf ghosting through a wall.
    scene.apply(sampleOpeningGame(T.doorClear), 16 / 9); scene.room.scene.updateMatrixWorld(true);
    for (const side of [-1, 1]) for (const [z, direction, face] of [[7, -1, 'front'], [4.5, 1, 'back']] as const) {
      const ray = new THREE.Raycaster(new THREE.Vector3(R.doorwayX + side * 2.4, 2, z + 0.6), new THREE.Vector3(0, 0, direction), 0, 4);
      const hit = ray.intersectObject(scene.laboratory.entrance, true)[0];
      assert.ok(hit?.object instanceof THREE.InstancedMesh);
      assert.equal(hit.object.userData.staticBatchSourceNames[hit.instanceId!], `opening-bob-door-pocket-${side}-${face}`);
    }
  } finally { scene.dispose(); }
});

test('the full doorway transom seals the old gaps up to the hallway ceiling', () => {
  const scene = createScene(), target = new THREE.Vector3();
  try {
    for (const time of [T.bobDoor, T.doorClear]) {
      scene.apply(sampleOpeningGame(time), 16 / 9); scene.room.scene.updateMatrixWorld(true);
      const origin = new THREE.Vector3(R.doorwayX, L.eyeHeight, L.endZ);
      for (const x of [-3.3, -2.3, -1.6, 0, 1.6, 2.3, 3.3]) for (const y of [4.19, 4.35, 4.59]) {
        target.set(R.doorwayX + x, y, R.doorwayZ);
        const direction = target.clone().sub(origin);
        const hits = new THREE.Raycaster(origin, direction.normalize(), 0, origin.distanceTo(target) + 0.6)
          .intersectObject(scene.laboratory.entrance, true);
        assert.ok(hits.length > 0, `Unsealed overhead gap at offset ${x}, height ${y}.`);
      }
    }
  } finally { scene.dispose(); }
});

test('the hatch uses the Blender Room 1 shell and real gameplay dressing', async context => {
  useOpeningAssetFixtures(context);
  const scene = createScene(), art = new RoomOneArt(scene.room.resources);
  try {
    await scene.laboratory.prepare();
    const names = new Set<string>();
    scene.laboratory.roomOne.root.traverse(object => {
      if (object instanceof THREE.Mesh) for (const name of object.userData.staticBatchSourceNames ?? [object.name]) names.add(name);
    });
    for (const child of art.root.children) {
      if (child === art.specimenAssembly || child.name === 'room-1-locked-laboratory-door-assembly') continue;
      child.traverse(object => { if (object instanceof THREE.Mesh) assert.ok(names.has(object.name), object.name); });
    }
    const shell=scene.laboratory.roomOne.root.getObjectByName('R1_Architecture')!;
    assert.ok(shell);assert.equal(shell.children.length,9);
    assert.ok(names.has('R1_Shell_Light'),'Ceiling fixtures are authored into the shared Blender shell.');
    assert.ok(![...names].some(name => /^title-|room-1-(pod|egg|pedestal)/.test(name)), 'Keep the one actual menu pod/egg, not a duplicate specimen.');
    scene.apply(sampleOpeningGame(T.hatchStart), 16 / 9); scene.room.scene.updateMatrixWorld(true);
    assert.equal(scene.laboratory.roomOne.root.visible, true);
    assert.equal(scene.laboratory.menuEnvironment.visible, false);
    const up = new THREE.Raycaster(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, 1, 0), 0, 5)
      .intersectObject(scene.laboratory.roomOne.root, true)[0];
    assert.ok(up); assert.ok(Math.abs(up.point.y - R.ceilingY) < 1e-6);
    const down = new THREE.Raycaster(new THREE.Vector3(2, 1, 0), new THREE.Vector3(0, -1, 0), 0, 2)
      .intersectObject(scene.laboratory.roomOne.root, true)[0];
    assert.ok(down); assert.ok(Math.abs(down.point.y) < 1e-6);
    assert.ok(scene.laboratory.roomOne.root.userData.staticBatchDiagnostics.drawCallsRemoved > 0,
      'Remaining gameplay dressing still consolidates alongside the nine already-batched Blender meshes.');
    scene.apply(sampleOpeningGame(0), 16 / 9);
    assert.equal(scene.laboratory.menuEnvironment.visible, true);
    assert.equal(scene.laboratory.roomOne.root.visible, false);
  } finally { art.dispose(); scene.dispose(); }
});

test('the prepared intro rear wall stays free of opaque overlap through entry, hatch, lid lift and reset',async context=>{
  useOpeningAssetFixtures(context);
  const scene=createScene();
  try {
    await scene.laboratory.prepare();
    for(const seconds of [T.entryStart+3,T.hatchStart,T.crackTwo,T.lidClear,T.formEnd,0,T.hatchStart]){
      scene.apply(sampleOpeningGame(seconds),16/9);
      for(const tolerance of [.0001,.002]){
        assert.deepEqual(auditRoomOneRearWall(scene.room.scene,tolerance).conflicts,[],`Rear wall overlap at ${seconds}s, ${tolerance} m.`);
      }
    }
  } finally {scene.dispose();}
});

test('security cameras sweep faster without changing their arc or reduced-motion stillness', () => {
  const scene = createScene(), head = scene.laboratory.cameraHeads[0], tilt = scene.laboratory.cameraTilts[0];
  try {
    scene.apply(sampleOpeningGame(0), 16 / 9);
    const yaw = head.rotation.y, pitch = tilt.rotation.x;
    scene.apply(sampleOpeningGame(0.1), 16 / 9);
    assert.ok(head.rotation.y - yaw > 0.05 && head.rotation.y - yaw < 0.06, 'A roughly 2.5x faster horizontal sweep, not a larger erratic arc.');
    assert.ok(tilt.rotation.x - pitch > 0.01, 'The tilt joint also scans faster.');
    for (let time = 1; time < 20; time += 0.1) {
      scene.apply(sampleOpeningGame(time), 16 / 9);
      assert.ok(Math.abs(head.rotation.y) <= 0.82);
      assert.ok(tilt.rotation.x >= 0.06 && tilt.rotation.x <= 0.3);
    }
    scene.apply(sampleOpeningGame(2), 16 / 9, true);
    const reducedYaw = head.rotation.y, reducedPitch = tilt.rotation.x;
    scene.apply(sampleOpeningGame(10), 16 / 9, true);
    assert.equal(head.rotation.y, reducedYaw); assert.equal(tilt.rotation.x, reducedPitch);
  } finally { scene.dispose(); }
});

test('the Blender fly-through shares camera buffers, four light slots and one cached shadow with bounded draws', async context => {
  useOpeningAssetFixtures(context);
  const scene = createScene(), objects = new Set<THREE.Object3D>(), geometry = new Set(), materials = new Set();
  const versions = new Map<THREE.InstancedMesh, number>();
  try {
    await scene.laboratory.prepare();
    scene.room.scene.traverse(object => {
      objects.add(object);
      if (object instanceof THREE.Mesh) {
        geometry.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
      if (object instanceof THREE.InstancedMesh) versions.set(object, object.instanceMatrix.version);
    });
    const textureVersion = scene.laboratory.labelTexture.version;
    for (let time = 1; time <= T.end; time += 0.25) {
      scene.apply(sampleOpeningGame(time), 16 / 9);
      let lights = 0, shadowLights = 0, meshObjects = 0;
      scene.room.scene.traverseVisible(object => {
        assert.ok(objects.has(object));
        if (object instanceof THREE.Light) { lights++; if (object.castShadow) shadowLights++; }
        if (object instanceof THREE.Mesh) {
          meshObjects++;
          assert.ok(geometry.has(object.geometry));
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) assert.ok(materials.has(material));
        }
      });
      assert.equal(lights, 4); assert.equal(shadowLights, 1);
      if (time < T.doorStart) {
        assert.ok(meshObjects <= 48, 'Eight set batches, four shared camera batches per gimbal, plaques and the physical entrance stay bounded.');
        assert.equal(scene.laboratory.observatory.visible, false);
      }
      if (time > 1 && time < T.doorStart) assert.equal(scene.needsShadowUpdate, false,
        'Moving only the camera/recording heads must reuse static corridor depth.');
    }
    assert.deepEqual(scene.room.keyLight.shadow.mapSize.toArray(), [512, 512]);
    for (const [mesh, version] of versions) assert.equal(mesh.instanceMatrix.version, version);
    assert.equal(scene.laboratory.labelTexture.version, textureVersion);
    const head = scene.laboratory.cameraHeads[0], tilt = scene.laboratory.cameraTilts[0];
    assert.equal(scene.laboratory.cameraHeads.length, 4);
    scene.apply(sampleOpeningGame(4), 16 / 9); const rotation = head.rotation.clone();
    const tiltRotation = tilt.rotation.clone();
    scene.apply(sampleOpeningGame(8), 16 / 9); assert.notDeepEqual(head.rotation, rotation);
    assert.notDeepEqual(tilt.rotation, tiltRotation);
    assert.equal(tilt.parent, head);
    let cameraMeshes = 0, cameraTriangles = 0;
    head.traverse(child => {
      if (child instanceof THREE.Mesh) { cameraMeshes++; assert.equal(child.castShadow, false); }
      if (child instanceof THREE.Mesh) cameraTriangles += (child.geometry.index?.count??child.geometry.getAttribute('position').count)/3;
    });
    assert.equal(cameraMeshes, 5, 'Four authored material batches and the existing recording LED.');
    assert.ok(cameraTriangles>1_500&&cameraTriangles<2_500,'Detailed camera hardware stays below 2.5k triangles.');
    const cameras=scene.laboratory.cameraTilts.map(tilt=>tilt.getObjectByName('opening-authored-surveillance-camera')!);
    for(let index=1;index<cameras.length;index++)for(let part=0;part<4;part++){
      assert.equal((cameras[index].children[part] as THREE.Mesh).geometry,(cameras[0].children[part] as THREE.Mesh).geometry);
      assert.equal((cameras[index].children[part] as THREE.Mesh).material,(cameras[0].children[part] as THREE.Mesh).material);
    }
    scene.apply(sampleOpeningGame(8), 16 / 9, true);
    const reducedRotation = head.rotation.clone(), reducedTilt = tilt.rotation.clone();
    scene.apply(sampleOpeningGame(12), 16 / 9, true);
    assert.ok(head.rotation.equals(reducedRotation)); assert.ok(tilt.rotation.equals(reducedTilt));
  } finally { scene.dispose(); }
});

test('opening room releases source and generated instances once without disposing shared assets', context => {
  const resources = new ContainmentArtResources();
  const disposals = new Map<THREE.InstancedMesh, number>();
  const originalDispose = THREE.InstancedMesh.prototype.dispose;
  context.mock.method(THREE.InstancedMesh.prototype, 'dispose', function(this: THREE.InstancedMesh) {
    disposals.set(this, (disposals.get(this) ?? 0) + 1);
    originalDispose.call(this);
  });
  const room = new OpeningRoomOne(resources);
  const batches: THREE.InstancedMesh[] = [];
  room.root.traverse(object => {
    if (object instanceof THREE.InstancedMesh && object.userData.staticBatchSourceNames) batches.push(object);
  });
  let sharedDisposals = 0;
  for (const resource of [resources.geometries.unitBox, resources.materials.mainCeramic, resources.textures.ceramicNormal]) {
    resource.addEventListener('dispose', () => { sharedDisposals++; });
  }
  try {
    assert.ok(batches.length > 0, 'exercise generated instance buffers, not only merged geometry');
    room.dispose(); room.dispose();
    for (const batch of batches) assert.equal(disposals.get(batch), 1, batch.name);
    assert.ok([...disposals.keys()].some(instance => instance.name === 'room-1-containment-box-deterministic-glass-debris'),
      'excluded source instances must still be released');
    for (const [instance, count] of disposals) assert.equal(count, 1, instance.name);
    assert.equal(sharedDisposals, 0, 'the room borrows shared geometry, materials and textures');
  } finally { room.dispose(); resources.dispose(); }
});

test('cinematic disposal releases the wing/atlas and borrowed-room resources exactly once', () => {
  const room = new TitleScreenScene(), wing = new OpeningLaboratory(room);
  const resources = new Set<THREE.EventDispatcher<any>>();
  room.scene.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
      }
    }
    if (object instanceof THREE.InstancedMesh) resources.add(object);
  });
  const disposals = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource)! + 1));
  wing.apply(sampleOpeningGame(T.end), false); wing.dispose(); wing.dispose();
  room.dispose(); room.dispose();
  for (const [resource, count] of disposals) assert.equal(count, 1, (resource as any).name);
  assert.equal(room.scene.children.length, 0);
});

test('startup yields between isolated submissions, primes the actual first view under black and drains its GPU queue', async context => {
  useOpeningAssetFixtures(context);
  let turn = 0;
  const jobs: number[] = [];
  const scene = createScene({ deferConstruction: true, yieldFrame: async () => {
    turn++;
    if (turn === 1) {
      assert.equal(scene.room.scene.getObjectByName('opening-menu-egg-fracture'), undefined);
      assert.equal(scene.room.scene.getObjectByName('opening-authored-room-one'), undefined);
    }
    if (turn === 2) {
      assert.ok(scene.room.scene.getObjectByName('opening-menu-egg-fracture'));
      assert.equal(scene.room.scene.getObjectByName('opening-authored-room-one'), undefined,
        'Do not construct both expensive scenes in the same startup job.');
      scene.bob.prepare = async () => {};
    }
  } });
  assert.equal(scene.room.scene.getObjectByName('opening-menu-egg-fracture'), undefined,
    'The Start-handler constructor must leave the warmed title intact.');
  let viewport = new THREE.Vector4(0, 0, 640, 360), scissor = viewport.clone(), scissorTest = false;
  let target: THREE.WebGLRenderTarget | null = null;
  const targetDisposals = new Map<THREE.WebGLRenderTarget, number>();
  let compiles = 0, draws = 0, fencePolls = 0, fencesReleased = 0;
  const fence = {} as WebGLSync;
  const renderer = {
    transmissionResolutionScale: 0.5, info: { render: { calls: 4, triangles: 10, points: 0, lines: 0 } },
    shadowMap: { enabled: true, type: THREE.PCFShadowMap, autoUpdate: false, needsUpdate: false },
    getViewport: (out: THREE.Vector4) => out.copy(viewport),
    setViewport: (x: THREE.Vector4 | number, y?: number, w?: number, h?: number) => { viewport = x instanceof THREE.Vector4 ? x.clone() : new THREE.Vector4(x, y, w, h); },
    getScissor: (out: THREE.Vector4) => out.copy(scissor),
    setScissor: (x: THREE.Vector4 | number, y?: number, w?: number, h?: number) => { scissor = x instanceof THREE.Vector4 ? x.clone() : new THREE.Vector4(x, y, w, h); },
    getScissorTest: () => scissorTest, setScissorTest: (value: boolean) => { scissorTest = value; },
    getRenderTarget: () => target,
    setRenderTarget(value: THREE.WebGLRenderTarget | null) { target = value; },
    getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    getContext: () => ({
      SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2, CONDITION_SATISFIED: 4, WAIT_FAILED: 8,
      fenceSync: () => fence, flush() {}, isContextLost: () => false,
      clientWaitSync: () => ++fencePolls === 1 ? 16 : 4,
      deleteSync: (value: WebGLSync) => { assert.equal(value, fence); fencesReleased++; },
    }),
    compileAsync: async () => {
      compiles++;
      jobs.push(turn);
      assert.equal(scene.laboratory.root.visible, true); assert.equal(scene.laboratory.observatory.visible, true);
      assert.equal(scene.laboratory.menuEnvironment.visible, false);
      assert.equal(scene.laboratory.roomOne.root.visible, true);
    },
    render: (_root: THREE.Scene, camera: THREE.PerspectiveCamera) => {
      draws++;
      jobs.push(turn);
      if (draws < 3) {
        assert.ok(target instanceof THREE.WebGLRenderTarget, 'Resource-only primers stay off the default framebuffer.');
        assert.equal(target.width, 1); assert.equal(target.height, 1);
        if (!targetDisposals.has(target)) {
          const current = target; targetDisposals.set(current, 0);
          current.addEventListener('dispose', () => targetDisposals.set(current, targetDisposals.get(current)! + 1));
        }
        assert.ok(viewport.x === 0 && scissorTest);
        assert.deepEqual(viewport.toArray(), [0, 0, 1, 1]);
        if (draws === 1) {
          assert.deepEqual(camera.viewport?.toArray(), [0, 0, 640, 360],
            'Size the camera-owned transmission attachment independently of shadow viewport restores.');
          assert.equal(renderer.transmissionResolutionScale, 0.5);
        } else {
          assert.equal(camera.viewport, undefined, 'Restore the camera after the transmission primer.');
          assert.equal(renderer.transmissionResolutionScale, 1);
        }
      } else {
        assert.equal(target, null, 'One real canvas view is primed under the initial painted blackout.');
        assert.deepEqual(viewport.toArray(), [0, 0, 640, 360]);
        assert.equal(renderer.transmissionResolutionScale, 0.5,
          'Restore the requested quality before the actual canvas-sized draw.');
        assert.equal(scissorTest, false);
        assert.equal(scene.laboratory.root.visible, true);
        assert.equal(scene.laboratory.observatory.visible, false);
      }
      if (draws === 2) {
        assert.equal(camera.position.z, L.backZ + 12);
        assert.equal(scene.laboratory.root.visible, true);
      }
    },
  };
  const policy = new RenderShadowPolicy(renderer.shadowMap);
  try {
    const layer = { renderer, withShadowPreparation: policy.withPreparation.bind(policy) } as unknown as RenderLayer;
    await Promise.all([scene.prepare(layer), scene.prepare(layer)]);
    assert.equal(compiles, 1); assert.equal(draws, 3);
    assert.equal(new Set(jobs).size, 4, 'Compilation, isolated uploads and the real first view each yield.');
    assert.equal(fencePolls, 2); assert.equal(fencesReleased, 1);
    assert.deepEqual(viewport.toArray(), [0, 0, 640, 360]);
    assert.equal(renderer.transmissionResolutionScale, 0.5); assert.equal(scissorTest, false);
    assert.equal(target, null); assert.equal(targetDisposals.size, 1);
    assert.deepEqual([...targetDisposals.values()], [1], 'release the shared temporary framebuffer exactly once');
    assert.equal(scene.room.camera.far, 24);
    assert.equal(scene.laboratory.root.visible, false);
  } finally { scene.dispose(); }
});

test('cancelling deferred startup releases the menu and partial hatch without constructing a late room', async () => {
  for (const builtHatch of [false, true]) {
    const frames: (() => void)[] = [];
    const scene = createScene({ deferConstruction: true, yieldFrame: () => new Promise(resolve => frames.push(resolve)) });
    const ready = scene.prepare({} as RenderLayer);
    if (builtHatch) {
      frames.shift()!();
      await Promise.resolve(); await Promise.resolve();
      assert.ok(scene.room.scene.getObjectByName('opening-menu-egg-fracture'));
    }
    assert.equal(scene.room.scene.getObjectByName('opening-authored-room-one'), undefined);
    scene.dispose(); scene.dispose();
    frames.shift()!(); await ready;
    assert.equal(frames.length, 0);
    assert.equal(scene.room.scene.children.length, 0);
    assert.equal(scene.room.resources.diagnostics.disposed, true);
  }
});
