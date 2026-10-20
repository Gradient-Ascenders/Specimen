import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { CameraRig } from '../src/render/CameraRig.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { MONITOR_DIALOGUE_TIMING as T, paginateMonitorSections } from '../src/render/environment/containment/ContainmentMonitorDialogue.ts';
import { createContainmentMonitorTexture, paintContainmentMonitorTexture, MONITOR_TEXT_COLOURS,
  type MonitorTextColour } from '../src/render/environment/containment/ContainmentProceduralTextures.ts';
import { RoomThreeMonitor, ROOM_THREE_MONITOR_POSITION, ROOM_THREE_MONITOR_TRIGGER,
  ROOM_THREE_MONITOR_SCRIPT, ROOM_THREE_MONITOR_COLOURS } from '../src/render/environment/containment/RoomThreeMonitor.ts';

const near = ROOM_THREE_MONITOR_TRIGGER.centre;
const entrance = { x: 0, y: 10.86, z: 51.4 };

function colouredPixels(texture: THREE.DataTexture, colour: MonitorTextColour): number {
  const pixels = texture.image.data as Uint8Array, rgb = MONITOR_TEXT_COLOURS[colour];
  let count = 0;
  for (let y = 80; y < 210; y++) for (let x = 24; x < 480; x++) {
    const at = (y * 512 + x) * 4;
    if (pixels[at] === rgb[0] && pixels[at + 1] === rgb[1] && pixels[at + 2] === rgb[2]) count++;
  }
  return count;
}

test('Room 3 waits for the pictured gap platform, not the entrance, acid basin or upper route', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomThreeMonitor(assets);
  try {
    const version = monitor.texture.version;
    for (const position of [undefined, entrance, { ...near, y: 5.51 },
      { x: 10, y: 22.81, z: 60.5406 }, { x: NaN, y: near.y, z: near.z }]) {
      monitor.update(120, position);
      assert.equal(monitor.hasActivated, false);
      assert.equal(monitor.dialogue.readModel.text, '');
      assert.equal(monitor.texture.version, version);
    }
    monitor.update(0, near);
    assert.equal(monitor.hasActivated, true);
    assert.equal(monitor.dialogue.readModel.text, 'A');
    monitor.update(1, entrance);
    const started = monitor.dialogue.readModel.text;
    assert.ok(started.length > 1, 'Leaving the platform must not stop typing.');
    monitor.update(0, near);
    assert.equal(monitor.dialogue.readModel.text, started, 'Re-entry must not restart the script.');
    monitor.reset();
    assert.equal(monitor.hasActivated, false); assert.equal(monitor.dialogue.readModel.text, '');
    monitor.update(120, entrance); assert.equal(monitor.dialogue.readModel.text, '');
    monitor.update(0, near); assert.equal(monitor.dialogue.readModel.text, 'A');
  } finally { monitor.dispose(); assets.dispose(); }
});

test('Room 3 preserves the exact lines, uppercase typing, punctuation, pauses and green/red/red colours', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomThreeMonitor(assets);
  try {
    assert.deepEqual(ROOM_THREE_MONITOR_SCRIPT, ['Another Acid leak?', 'Due to Goop’s poor behavior',
      'His termination may be considered']);
    assert.deepEqual(ROOM_THREE_MONITOR_COLOURS, ['green', 'red', 'red']);
    const pages = paginateMonitorSections(ROOM_THREE_MONITOR_SCRIPT);
    assert.equal(pages.length, 3);
    monitor.update(0, near);
    for (let index = 0; index < pages.length; index++) {
      const colour = ROOM_THREE_MONITOR_COLOURS[index];
      assert.equal(monitor.dialogue.readModel.sectionIndex, index);
      assert.equal(monitor.dialogue.readModel.text, pages[index].text[0]);
      assert.ok(colouredPixels(monitor.texture, colour) > 0, 'Typing cursor uses the section colour.');
      monitor.update((pages[index].text.length - 1) * T.characterSeconds, entrance);
      assert.equal(monitor.dialogue.readModel.text, pages[index].text);
      assert.equal(monitor.dialogue.readModel.typing, false);
      assert.ok(colouredPixels(monitor.texture, colour) > 0);
      assert.equal(colouredPixels(monitor.texture, colour === 'red' ? 'green' : 'red'), 0);
      if (index < pages.length - 1) {
        const version = monitor.texture.version;
        monitor.update(T.sectionHoldSeconds - .001, entrance);
        assert.equal(monitor.texture.version, version);
        monitor.update(.001, entrance);
      }
    }
    assert.equal(monitor.dialogue.readModel.complete, true);
    const finished = monitor.texture.version;
    monitor.update(120, near); assert.equal(monitor.texture.version, finished);
  } finally { monitor.dispose(); assets.dispose(); }
});

test('every Room 3 character, including the possessive apostrophe, produces a visible glyph', () => {
  const texture = createContainmentMonitorTexture();
  try {
    const characters = new Set(ROOM_THREE_MONITOR_SCRIPT.join('').toUpperCase().replace(/\s/g, ''));
    characters.add("'");
    for (const character of characters) {
      paintContainmentMonitorTexture(texture, character, false, 'red');
      assert.ok(colouredPixels(texture, 'red') > 0, `Missing visible glyph: ${character}`);
    }
  } finally { texture.dispose(); }
});

test('Room 3 mounts low on the left panel without floating, new lights or a traversal obstacle', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomThreeMonitor(assets);
  try {
    assert.deepEqual(monitor.root.position.toArray(), Object.values(ROOM_THREE_MONITOR_POSITION));
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(monitor.root.quaternion);
    assert.ok(normal.x < -.999, 'The screen faces into the room.');
    const bounds = new THREE.Box3().setFromObject(monitor.root);
    assert.ok(bounds.max.x > 16.8 && bounds.min.x < 16.65, 'Brackets meet the east-entry panel.');
    assert.ok(bounds.min.y >= 5.8 && bounds.max.y < 14.8);
    assert.ok(bounds.min.z > 49.6 && bounds.max.z < 58.4, 'All hardware fits left of the sticky installation.');
    let meshes = 0;
    monitor.root.traverse(object => {
      assert.equal(object.matrixAutoUpdate, false);
      assert.ok(!(object instanceof THREE.Light));
      if (object instanceof THREE.Mesh) {
        meshes++; assert.equal(object.castShadow, false); assert.equal(object.userData.visualOnly, true);
      }
    });
    assert.equal(meshes, 3); assert.equal(monitor.texture.image.data.byteLength, 524288);
    const version = monitor.texture.version;
    monitor.dispose(); monitor.dispose(); monitor.update(10, near); monitor.reset();
    assert.equal(monitor.hasActivated, false); assert.equal(monitor.texture.version, version);
  } finally { monitor.dispose(); assets.dispose(); }
});

test('Room 2 cladding cannot protrude into Room 3 as a floating slab beside the monitor', () => {
  const scene = new ContainmentLevelScene(() => {});
  try {
    scene.root.updateMatrixWorld(true);
    const panel = scene.teaching.roomTwoArt.root.getObjectByName('room-2-panel-east-upper-north')!;
    const bounds = new THREE.Box3().setFromObject(panel);
    assert.ok(Math.abs(bounds.min.z - 39.725) < 1e-5, 'Keep the existing Room 2 front edge.');
    assert.ok(bounds.max.z <= 48.85001, 'The cladding ends at Room 2’s rear wall.');
    const rig = new CameraRig(), position = new THREE.Vector3(near.x, near.y, near.z);
    rig.setFollowTarget({ position, previousPosition: position.clone(), velocity: new THREE.Vector3(),
      gameplayUp: new THREE.Vector3(0, 1, 0), grounded: true, attached: false }, new CollisionWorld());
    rig.setGroundOrbitYawRadians(-Math.PI / 2 + .24);
    rig.queueLookInput(0, (-.03 - Math.PI / 10) / .002);
    for (let frame = 0; frame < 180; frame++) rig.update(1, 1 / 60);
    rig.camera.aspect = 1280 / 720; rig.camera.updateProjectionMatrix(); rig.camera.updateMatrixWorld(true);
    const visuals: THREE.Mesh[] = [];
    // Inspect both rooms, not only Room 3: the unwanted piece belonged to Room 2.
    scene.root.traverseVisible(object => {
      if (object instanceof THREE.Mesh && !Array.isArray(object.material) &&
        object.material.visible && object.userData.visualOnly) visuals.push(object);
    });
    for (const y of [100, 300]) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(70 / 1280 * 2 - 1, 1 - y / 720 * 2), rig.camera);
      const hit = ray.intersectObjects(visuals, false)[0];
      assert.equal(hit?.object.name, 'room-3-entry-panel-east',
        'The normal sealed Room 3 wall must be visible, not a floating panel from the previous room.');
    }
    assert.equal(scene.measuredFirstUseGeometryPrimeDiagnostics.resourceCount, 23);
  } finally { scene.dispose(); }
});

for (const includeDevelopmentHelpers of [false, true]) {
  test(`Level 1 wires Room 3's active-player trigger, death freeze and level restart (dev ${includeDevelopmentHelpers})`, () => {
    const scene = new ContainmentLevelScene(() => {}, { includeDevelopmentHelpers });
    try {
      const monitor = scene.roomThreeMonitor;
      assert.equal(monitor.root.parent, scene.roomThree.art.root);
      const platform = scene.collisionMeshes.find(mesh => mesh.name === 'room-3-platform-b-gap')!;
      assert.equal(near.x, platform.position.x); assert.equal(near.z, platform.position.z);
      assert.ok(Math.abs(near.y - (platform.position.y + .25 + .46)) < 1e-8);
      for (const x of [-2.565, 2.565]) for (const z of [-2, 2]) {
        assert.ok(x * x + z * z <= ROOM_THREE_MONITOR_TRIGGER.radius ** 2);
      }
      const colliders = scene.collisionMeshes.map(mesh => mesh.uuid);
      scene.update(60, near, entrance);
      assert.equal(monitor.hasActivated, false, 'An inactive Bob cannot trigger it.');
      scene.update(1 / 60, entrance, near);
      assert.equal(monitor.dialogue.readModel.text, 'A');
      scene.updateDeath(5); assert.equal(monitor.dialogue.readModel.text, 'A');
      scene.resetPresentation(); assert.equal(monitor.hasActivated, false);
      scene.update(60, entrance, entrance); assert.equal(monitor.dialogue.readModel.text, '');
      scene.update(1 / 60, near, near); assert.equal(monitor.dialogue.readModel.text, 'A');
      assert.deepEqual(scene.collisionMeshes.map(mesh => mesh.uuid), colliders);
      assert.equal(scene.collisionMeshes.some(mesh => /monitor/.test(mesh.name)), false);
      assert.equal(scene.measuredFirstUseGeometryPrimeDiagnostics.resourceCount, 23);
    } finally { scene.dispose(); }
  });
}
