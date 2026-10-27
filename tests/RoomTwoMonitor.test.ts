import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { MONITOR_DIALOGUE_TIMING as T, paginateMonitorSections } from '../src/render/environment/containment/ContainmentMonitorDialogue.ts';
import { createContainmentMonitorTexture, paintContainmentMonitorTexture, MONITOR_TEXT_COLOURS,
  type MonitorTextColour } from '../src/render/environment/containment/ContainmentProceduralTextures.ts';
import { RoomTwoMonitor, ROOM_TWO_MONITOR_POSITION, ROOM_TWO_MONITOR_TRIGGER,
  ROOM_TWO_MONITOR_SCRIPT, ROOM_TWO_MONITOR_COLOURS } from '../src/render/environment/containment/RoomTwoMonitor.ts';
import { ROOM_ONE_MONITOR_SCRIPT } from '../src/render/environment/containment/RoomOneMonitorDialogue.ts';

const near = ROOM_TWO_MONITOR_TRIGGER.centre;
const far = { x: -9, y: .46, z: 31 };

function colouredPixels(texture: THREE.DataTexture, colour: MonitorTextColour): number {
  const pixels = texture.image.data as Uint8Array, rgb = MONITOR_TEXT_COLOURS[colour];
  let count = 0;
  // Only the dialogue body, not the fixed header/footer or status LED.
  for (let y = 80; y < 210; y++) for (let x = 24; x < 480; x++) {
    const at = (y * 512 + x) * 4;
    if (pixels[at] === rgb[0] && pixels[at + 1] === rgb[1] && pixels[at + 2] === rgb[2]) count++;
  }
  return count;
}

test('Room 2 waits indefinitely for the side-jump platform, not the floor, entrance or upper return route', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomTwoMonitor(assets);
  try {
    const initialVersion = monitor.texture.version;
    for (const position of [undefined, far, { ...near, y: .46 },
      { x: 8.8, y: 10.31, z: 37.65683 }, { x: NaN, y: near.y, z: near.z }]) {
      monitor.update(120, position);
      assert.equal(monitor.hasActivated, false);
      assert.equal(monitor.dialogue.readModel.text, '');
      assert.equal(monitor.texture.version, initialVersion, 'No recurring uploads while the screen is dormant.');
    }
    monitor.update(0, near);
    assert.equal(monitor.hasActivated, true);
    assert.equal(monitor.dialogue.readModel.text, 'S', 'Proximity starts immediately, with no six-second Room 1 delay.');
  } finally { monitor.dispose(); assets.dispose(); }
});

test('the proximity boundary includes the whole platform and starts only once, continuing after departure', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomTwoMonitor(assets);
  try {
    const radius = ROOM_TWO_MONITOR_TRIGGER.radius;
    monitor.update(1, { ...near, x: near.x + radius + .001 });
    assert.equal(monitor.hasActivated, false);
    monitor.update(0, { ...near, x: near.x + radius });
    assert.equal(monitor.hasActivated, true);
    assert.equal(monitor.dialogue.readModel.text, 'S');
    monitor.update(2, far);
    const text = monitor.dialogue.readModel.text;
    assert.ok(text.length > 1);
    monitor.update(0, near);
    assert.equal(monitor.dialogue.readModel.text, text, 'Re-entry cannot restart the typewriter.');
    monitor.reset();
    assert.equal(monitor.hasActivated, false); assert.equal(monitor.dialogue.readModel.text, '');
    monitor.update(120, far); assert.equal(monitor.dialogue.readModel.text, '');
    monitor.update(0, near); assert.equal(monitor.dialogue.readModel.text, 'S');
  } finally { monitor.dispose(); assets.dispose(); }
});

test('all requested sections type in uppercase with red/green/red body and cursor, pauses and unchanged page capacity', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomTwoMonitor(assets);
  try {
    assert.deepEqual(ROOM_TWO_MONITOR_SCRIPT, ['Subject exhibits remarkable elastic resilience.',
      'Could the specimen be impervious to laser radiation?', 'We will observe']);
    assert.deepEqual(ROOM_TWO_MONITOR_COLOURS, ['red', 'green', 'red']);
    const pages = paginateMonitorSections(ROOM_TWO_MONITOR_SCRIPT);
    assert.equal(pages.length, 3, 'Every complete section fits the shared three-row screen.');
    monitor.update(0, near);
    for (let index = 0; index < pages.length; index++) {
      const colour = ROOM_TWO_MONITOR_COLOURS[index];
      assert.equal(monitor.dialogue.readModel.sectionIndex, index);
      assert.equal(monitor.dialogue.readModel.text, pages[index].text[0]);
      assert.ok(colouredPixels(monitor.texture, colour) > 0);
      monitor.update((pages[index].text.length - 1) * T.characterSeconds, far);
      assert.equal(monitor.dialogue.readModel.text, pages[index].text);
      assert.equal(monitor.dialogue.readModel.typing, false);
      assert.ok(colouredPixels(monitor.texture, colour) > 0);
      assert.equal(colouredPixels(monitor.texture, colour === 'red' ? 'green' : 'red'), 0);
      if (index < pages.length - 1) {
        const version = monitor.texture.version;
        monitor.update(T.sectionHoldSeconds - .001, far);
        assert.equal(monitor.texture.version, version, 'A section pause must not upload the texture again.');
        monitor.update(.001, far);
      }
    }
    assert.equal(monitor.dialogue.readModel.text, 'WE WILL OBSERVE');
    assert.equal(monitor.dialogue.readModel.complete, true);
    const finishedVersion = monitor.texture.version;
    for (let i = 0; i < 120; i++) monitor.update(1 / 60, far);
    assert.equal(monitor.texture.version, finishedVersion);
  } finally { monitor.dispose(); assets.dispose(); }
});

test('the laser-radiation question mark is visibly drawn rather than silently omitted', () => {
  const texture = createContainmentMonitorTexture();
  try {
    assert.equal(colouredPixels(texture, 'green'), 0);
    paintContainmentMonitorTexture(texture, '?', false, 'green');
    assert.ok(colouredPixels(texture, 'green') > 0);
    paintContainmentMonitorTexture(texture, '', false, 'green');
    assert.equal(colouredPixels(texture, 'green'), 0);
  } finally { texture.dispose(); }
});

test('every dialogue letter and punctuation mark produces a visible glyph', () => {
  const texture = createContainmentMonitorTexture();
  const characters = new Set([...ROOM_ONE_MONITOR_SCRIPT, ...ROOM_TWO_MONITOR_SCRIPT].join('').toUpperCase().replace(/\s/g, ''));
  try {
    for (const character of characters) {
      paintContainmentMonitorTexture(texture, character, false, 'red');
      assert.ok(colouredPixels(texture, 'red') > 0, `Missing visible glyph: ${character}`);
    }
  } finally { texture.dispose(); }
});

test('Room 2 is mounted inward on the clean wall panel at sticky-wall height with three draws and no lights', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomTwoMonitor(assets);
  try {
    assert.deepEqual(monitor.root.position.toArray(), Object.values(ROOM_TWO_MONITOR_POSITION));
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(monitor.root.quaternion);
    assert.ok(normal.x < -.999);
    const bounds = new THREE.Box3().setFromObject(monitor.root);
    assert.ok(bounds.max.x > 14.795 && bounds.min.x < 14.65, 'Brackets reach the wall while the screen faces the player.');
    let meshes = 0;
    monitor.root.traverse(object => {
      assert.equal(object.matrixAutoUpdate, false);
      assert.ok(!(object instanceof THREE.Light));
      if (object instanceof THREE.Mesh) {
        meshes++;
        assert.equal(object.castShadow, false); assert.equal(object.userData.visualOnly, true);
      }
    });
    assert.equal(meshes, 3);
    assert.equal(monitor.texture.image.data.byteLength, 524288);
    assert.equal(monitor.texture.generateMipmaps, false);
    assert.equal(monitor.screen.material.toneMapped, false);
  } finally { monitor.dispose(); assets.dispose(); }
});

test('disposal is idempotent and cannot activate or repaint a dead monitor', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomTwoMonitor(assets);
  const owned = new Set<THREE.EventDispatcher<any>>([monitor.texture, monitor.screen.material]);
  monitor.root.traverse(object => { if (object instanceof THREE.Mesh) owned.add(object.geometry); });
  const disposals = new Map([...owned].map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource)! + 1));
  try {
    const version = monitor.texture.version;
    monitor.dispose(); monitor.dispose(); monitor.update(60, near); monitor.reset();
    assert.equal(monitor.hasActivated, false);
    assert.equal(monitor.texture.version, version);
    for (const count of disposals.values()) assert.equal(count, 1);
  } finally { assets.dispose(); }
});

for (const includeDevelopmentHelpers of [false, true]) {
  test(`Level 1 wires active-player proximity and restart without altering collisions or measured batches (dev ${includeDevelopmentHelpers})`, () => {
    const scene = new ContainmentLevelScene(() => {}, { includeDevelopmentHelpers });
    try {
      const monitor = scene.roomTwoMonitor;
      assert.equal(monitor.root.parent, scene.teaching.roomTwoArt.root);
      const sticky = scene.collisionMeshes.find(mesh => mesh.name === 'room-2-sticky-catch-wall')!;
      assert.equal(monitor.root.position.y, sticky.position.y);
      const platform = scene.collisionMeshes.find(mesh => mesh.name === 'room-2-platform-c-side-jump')!;
      assert.equal(near.x, platform.position.x); assert.equal(near.z, platform.position.z);
      for (const x of [-1.9, 1.9]) for (const z of [-1.75, 1.75]) {
        assert.ok(x * x + z * z <= ROOM_TWO_MONITOR_TRIGGER.radius ** 2, 'All platform corners are in range.');
      }
      const colliders = scene.collisionMeshes.map(mesh => mesh.uuid);
      scene.update(60, near, far);
      assert.equal(monitor.hasActivated, false, 'An inactive slime at the platform cannot trigger the monitor.');
      scene.update(1 / 60, near, near);
      assert.equal(monitor.dialogue.readModel.text, 'S');
      scene.updateDeath(5); assert.equal(monitor.dialogue.readModel.text, 'S');
      scene.resetPresentation(); assert.equal(monitor.hasActivated, false);
      scene.update(60, far, far); assert.equal(monitor.dialogue.readModel.text, '');
      scene.update(1 / 60, near, near); assert.equal(monitor.dialogue.readModel.text, 'S');
      assert.deepEqual(scene.collisionMeshes.map(mesh => mesh.uuid), colliders);
      assert.equal(scene.collisionMeshes.some(mesh => monitor.root.getObjectById(mesh.id) !== undefined), false);
      assert.equal(scene.measuredFirstUseGeometryPrimeDiagnostics.resourceCount, 23);
    } finally { scene.dispose(); }
  });
}
