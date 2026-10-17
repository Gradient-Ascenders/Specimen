import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { RoomOneMonitor, ROOM_ONE_MONITOR_POSITION } from '../src/render/environment/containment/RoomOneMonitor.ts';
import { RoomOneMonitorDialogue, ROOM_ONE_MONITOR_SCRIPT, ROOM_ONE_MONITOR_TIMING as T,
  ROOM_ONE_MONITOR_COLUMNS, ROOM_ONE_MONITOR_ROWS, paginateMonitorSections } from '../src/render/environment/containment/RoomOneMonitorDialogue.ts';

test('the monitor starts at six gameplay seconds and reveals one uppercase character at a time', () => {
  const dialogue = new RoomOneMonitorDialogue();
  assert.equal(T.delaySeconds, 6);
  assert.equal(dialogue.readModel.text, '');
  assert.equal(dialogue.update(5.99), false);
  assert.equal(dialogue.update(.01), true);
  assert.equal(dialogue.readModel.text, 'I');
  assert.equal(dialogue.readModel.typing, true);
  assert.equal(dialogue.update(T.characterSeconds / 2), false);
  assert.equal(dialogue.readModel.text, 'I');
  assert.equal(dialogue.update(T.characterSeconds / 2), true);
  assert.equal(dialogue.readModel.text, 'IN');
});

test('sections have a three-second pause, clear the previous message and retain the final one', () => {
  const dialogue = new RoomOneMonitorDialogue();
  const first = ROOM_ONE_MONITOR_SCRIPT[0].toUpperCase();
  const firstFinished = T.delaySeconds + (first.length - 1) * T.characterSeconds;
  assert.equal(T.sectionHoldSeconds, 3);
  dialogue.update(firstFinished);
  assert.equal(dialogue.readModel.text, 'INTERESTING...');
  assert.equal(dialogue.readModel.typing, false);
  assert.equal(dialogue.update(T.sectionHoldSeconds - .001), false);
  assert.equal(dialogue.readModel.text.replace('\n', ' '), first);
  dialogue.update(.001);
  assert.equal(dialogue.readModel.sectionIndex, 1);
  assert.equal(dialogue.readModel.text, 'S', 'clear instead of appending the next section');
  dialogue.update((ROOM_ONE_MONITOR_SCRIPT[1].length - 1) * T.characterSeconds);
  assert.equal(dialogue.readModel.text, 'SPECIMEN: BOB HAS\nAWOKEN');
  assert.equal(dialogue.readModel.complete, false);
  dialogue.update(T.sectionHoldSeconds - .001);
  assert.equal(dialogue.readModel.sectionIndex, 1);
  dialogue.update(.001);
  assert.equal(dialogue.readModel.sectionIndex, 2);
  assert.equal(dialogue.readModel.text, 'W');
  dialogue.update(30);
  assert.equal(dialogue.readModel.text, 'WE ARE OBSERVING');
  assert.equal(dialogue.readModel.complete, true);
  assert.equal(dialogue.update(100), false);
  assert.equal(dialogue.readModel.text, 'WE ARE OBSERVING');
});

test('full pages wait two seconds, then clear and continue the same section at the same type size', () => {
  assert.equal(T.pageHoldSeconds, 2);
  const sections = ['One two three four five six'];
  const pages = paginateMonitorSections(sections, 7, 1);
  assert.deepEqual(pages.map(page => page.text), ['ONE TWO', 'THREE', 'FOUR', 'FIVE', 'SIX']);
  const dialogue = new RoomOneMonitorDialogue(sections, 7, 1);
  dialogue.update(T.delaySeconds + (pages[0].text.length - 1) * T.characterSeconds);
  assert.equal(dialogue.readModel.text, 'ONE TWO');
  dialogue.update(T.pageHoldSeconds - .001);
  assert.equal(dialogue.readModel.text, 'ONE TWO');
  dialogue.update(.001);
  assert.equal(dialogue.readModel.text, 'T');
  assert.equal(dialogue.readModel.pageIndex, 1);
  assert.equal(dialogue.readModel.sectionIndex, 0);
  dialogue.update(100);
  assert.equal(dialogue.readModel.text, 'SIX');
  assert.equal(dialogue.readModel.complete, true);
});

test('wrapping stays inside the screen, preserves every word and splits oversize words without shrinking', () => {
  const sections = ['one two three four five six seven eight nine ten '.repeat(8), 'abcdefghijklmnop'];
  const pages = paginateMonitorSections(sections);
  for (const page of pages) {
    assert.ok(page.text.split('\n').length <= ROOM_ONE_MONITOR_ROWS);
    for (const line of page.text.split('\n')) assert.ok(line.length <= ROOM_ONE_MONITOR_COLUMNS);
  }
  assert.equal(pages.filter(page => page.sectionIndex === 0).map(page => page.text).join(' ').replace(/\s+/g, ' '),
    sections[0].trim().toUpperCase());
  assert.deepEqual(paginateMonitorSections(['abcdefghijklmnop'], 5, 2).map(page => page.text), ['ABCDE\nFGHIJ', 'KLMNO\nP']);
  for (const columns of [0, -1, .5]) assert.throws(() => paginateMonitorSections(sections, columns), /dimensions/);
  assert.throws(() => paginateMonitorSections(sections, 18, 0), /dimensions/);
});

test('fixed-step chunking, reset and invalid time cannot skip or corrupt the dialogue', () => {
  const coarse = new RoomOneMonitorDialogue(), fine = new RoomOneMonitorDialogue();
  coarse.update(11);
  for (let i = 0; i < 660; i++) fine.update(1 / 60);
  assert.deepEqual(fine.readModel, coarse.readModel);
  coarse.reset();
  assert.equal(coarse.readModel.text, '');
  coarse.update(5.9); assert.equal(coarse.readModel.text, '');
  coarse.update(.1); assert.equal(coarse.readModel.text, 'I');
  for (const time of [-1, Infinity, NaN]) assert.throws(() => coarse.update(time), /timestep/);
  assert.equal(coarse.readModel.text, 'I');
});

test('the monitor is centred on the right wall when facing the exit, upright and firmly wall-mounted', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomOneMonitor(assets);
  try {
    assert.deepEqual(monitor.root.position.toArray(), [-6.62, 4, 0]);
    assert.deepEqual(monitor.root.position.toArray(), Object.values(ROOM_ONE_MONITOR_POSITION));
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(monitor.root.quaternion);
    assert.ok(normal.x > .999, 'screen faces inward from the -X wall');
    const right = new THREE.Vector3(4.3, 0, 6.3).normalize().cross(new THREE.Vector3(0, 1, 0));
    assert.ok(monitor.root.position.clone().setY(0).dot(right) > 0, 'on the viewer right, not world +X');
    const bounds = new THREE.Box3().setFromObject(monitor.root);
    assert.ok(bounds.min.x < -6.675 && bounds.max.x > -6.5, 'brackets enter the wall panels while the display sits in front');
    const positions = monitor.screen.geometry.getAttribute('position'), uv = monitor.screen.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) assert.equal(uv.getY(i), positions.getY(i) > 0 ? 0 : 1);
    let meshes = 0, lights = 0;
    monitor.root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        meshes++;
        assert.equal(object.userData.visualOnly, true);
        assert.equal(object.castShadow, false, 'no extra shadow submissions');
      }
      if (object instanceof THREE.Light) lights++;
    });
    assert.equal(meshes, 3); assert.equal(lights, 0);
    assert.equal(monitor.screen.material.toneMapped, false);
  } finally { monitor.dispose(); assets.dispose(); }
});

test('typing reuses one small texture and all geometry, uploading only for visible text changes', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomOneMonitor(assets);
  try {
    const texture = monitor.texture, pixels = texture.image.data;
    const material = monitor.screen.material, geometry = monitor.screen.geometry;
    assert.deepEqual([texture.image.width, texture.image.height], [512, 256]);
    assert.equal(pixels.byteLength, 524288);
    assert.equal(texture.generateMipmaps, false);
    const initial = texture.version;
    monitor.update(5.99); assert.equal(texture.version, initial);
    monitor.update(.01); assert.equal(texture.version, initial + 1);
    monitor.update(.01); assert.equal(texture.version, initial + 1);
    const bodyHasText = () => {
      for (let y = 80; y < 210; y++) for (let x = 24; x < 480; x++) {
        if ((texture.image.data as Uint8Array)[(y * 512 + x) * 4] > 150) return true;
      }
      return false;
    };
    assert.equal(bodyHasText(), true, 'typed characters must change the uploaded pixels');
    monitor.update(50);
    const completeVersion = texture.version;
    for (let i = 0; i < 120; i++) monitor.update(1 / 60);
    assert.equal(texture.version, completeVersion, 'finished messages do no recurring texture work');
    assert.equal(monitor.texture, texture); assert.equal(texture.image.data, pixels);
    assert.equal(monitor.screen.material, material); assert.equal(monitor.screen.geometry, geometry);
    monitor.reset(); assert.equal(bodyHasText(), false);
    monitor.update(6); assert.equal(monitor.dialogue.readModel.text, 'I');
  } finally { monitor.dispose(); assets.dispose(); }
});

test('the monitor releases only owned GPU resources, exactly once, and stops updating after disposal', () => {
  const assets = new ContainmentArtResources(), monitor = new RoomOneMonitor(assets);
  const owned = new Set<THREE.EventDispatcher<any>>([monitor.texture, monitor.screen.material]);
  monitor.root.traverse(object => { if (object instanceof THREE.Mesh) owned.add(object.geometry); });
  const disposals = new Map([...owned].map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource)! + 1));
  let sharedDisposals = 0;
  for (const material of [assets.materials.graphite, assets.materials.serviceMetal]) {
    material.addEventListener('dispose', () => { sharedDisposals++; });
  }
  try {
    monitor.update(6); monitor.dispose(); monitor.dispose();
    for (const count of disposals.values()) assert.equal(count, 1);
    assert.equal(sharedDisposals, 0);
    const version = monitor.texture.version;
    monitor.update(20); monitor.reset();
    assert.equal(monitor.texture.version, version);
    assert.equal(monitor.root.children.length, 0);
  } finally { assets.dispose(); }
});

for (const includeDevelopmentHelpers of [false, true]) {
  test(`Level 1 owns the monitor timer and restart without changing frozen collision (dev ${includeDevelopmentHelpers})`, () => {
    const scene = new ContainmentLevelScene(() => {}, { includeDevelopmentHelpers });
    try {
      assert.equal(scene.roomOneMonitor.root.parent, scene.teaching.roomOneArt.root);
      assert.equal(scene.roomOneMonitor.dialogue.readModel.text, '', 'construction/preloading does not start the text');
      const colliderIds = scene.collisionMeshes.map(mesh => mesh.uuid);
      assert.equal(scene.collisionMeshes.some(mesh => mesh.name.includes('monitor')), false);
      scene.update(5.99); assert.equal(scene.roomOneMonitor.dialogue.readModel.text, '');
      scene.update(.01); assert.equal(scene.roomOneMonitor.dialogue.readModel.text, 'I');
      scene.updateDeath(2); assert.equal(scene.roomOneMonitor.dialogue.readModel.text, 'I', 'death presentation is not gameplay time');
      scene.resetPresentation(); assert.equal(scene.roomOneMonitor.dialogue.readModel.text, '');
      scene.update(6); assert.equal(scene.roomOneMonitor.dialogue.readModel.text, 'I');
      assert.deepEqual(scene.collisionMeshes.map(mesh => mesh.uuid), colliderIds);
      assert.equal(scene.measuredFirstUseGeometryPrimeDiagnostics.resourceCount, 23);
    } finally { scene.dispose(); }
  });
}
