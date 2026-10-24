import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RESEARCH_DIALOGUE, RESEARCH_FINDINGS, RESEARCH_TIMING as T, sampleResearchSlime, sampleResearchSpecimenWorld, researchShot, researchPursuerShotTime, researchDroneDeathTime, researchDroneFireStart } from '../src/cinematics/BlackoutResearchTimeline.ts';
import { RESEARCH_WING_ORIGIN as ORIGIN, researchLocalZ } from '../src/cinematics/BlackoutResearchLayout.ts';
import { sampleResearchDrone, sampleResearchDronePosition, researchGalleryLaunchTime, researchHallLaunchTime, researchHallLaunchZ, researchSearchTarget, type ResearchFlightPose } from '../src/cinematics/BlackoutResearchFlight.ts';
import { BlackoutResearchEffects } from '../src/cinematics/BlackoutResearchEffects.ts';
import { BlackoutResearchCamera } from '../src/cinematics/BlackoutResearchCamera.ts';
import { BlackoutResearchWing } from '../src/cinematics/BlackoutResearchWing.ts';
import { ResearchArenaReveal } from '../src/cinematics/ResearchArenaReveal.ts';

test('the research escape preserves every requested line and puts the energy hypothesis before the fusion', () => {
  assert.deepEqual(RESEARCH_DIALOGUE.map(line => [line.speaker, line.text]), [
    ['goop', 'Looks like they’re quite the fans of you, Bob.'],
    ['volt', 'Never thought I’d see someone more dangerous than Goop.'],
    ['goop', 'Bob we gotta get you outta here'],
    ['green', 'Time to head back to your cells, little ones.'], ['green', 'Playtime is over.'], ['red', 'Capture them.'],
    ['volt', 'Follow my lead.'], ['red', 'Find them'], ['volt', 'I’ve got a plan, but Bob’s life could be on the line.'],
    ['goop', 'Not sure how I feel about that, but we’re toast either way.'],
    ['volt', 'Keep firing at Bob! Don’t stop!'], ['goop', 'What!?'], ['volt', 'Just do it!'],
  ]);
  for (let i = 1; i < RESEARCH_DIALOGUE.length; i++) assert.ok(RESEARCH_DIALOGUE[i]!.start >= RESEARCH_DIALOGUE[i - 1]!.end);
  assert.ok(RESEARCH_DIALOGUE[0]!.start >= 10);
  assert.ok(RESEARCH_DIALOGUE.every(line => line.end - line.start >= 2));
  assert.equal(RESEARCH_FINDINGS.length, 6);
  assert.ok(RESEARCH_FINDINGS.some(f => f.title === 'ENERGY RETENTION'));
  assert.ok(T.fusion > T.crossfire && T.blast > T.reveal && T.landing > T.glass && T.boss > T.clearPursuers);
  assert.ok(T.overload - RESEARCH_DIALOGUE.find(l => l.text === 'Capture them.')!.start < 9);
});

test('the chase uses repeated real jump arcs for Bob, while the others stay on the floor, and the blackout search is empty', () => {
  const point = new THREE.Vector3(); let takeoffs = 0, wasAirborne = false;
  for (let i = 0; i < (T.deadEnd - T.chase) * 120; i++) {
    const t = T.chase + i / 120, bob = sampleResearchSlime('bob', t, point);
    assert.ok(point.x >= 12 && point.x <= 20 && point.z >= researchLocalZ(30) && point.z <= 87);
    assert.ok(point.y <= 1.52, 'running jumps must carry forward, not tower above the others');
    if (bob.airborne && !wasAirborne) takeoffs++; wasAirborne = bob.airborne;
    for (const id of ['goop', 'volt'] as const) { const slime = sampleResearchSlime(id, t, point); assert.equal(slime.airborne, false); assert.equal(point.y, .46); }
  }
  assert.ok(takeoffs >= 24 && takeoffs <= 28);
  for (const id of ['bob', 'goop', 'volt'] as const) assert.equal(sampleResearchSlime(id, T.search + 1, point).visible, false);
  assert.equal(researchShot(22), 'bob-reaction'); assert.equal(researchShot(39), 'catastrophic-research');
});

test('the trio stops before Bob tries the door, and the impact and recovery take less than two seconds', () => {
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  sampleResearchSlime('bob', T.doorJump - 2, p); sampleResearchSlime('bob', T.doorJump - .7, q);
  assert.equal(p.z, q.z); assert.equal(p.y, .46);
  sampleResearchSlime('bob', T.collision, p); assert.ok(p.z > 94 && p.y < 1.6);
  assert.equal(sampleResearchSlime('bob', T.doorLand + .01, q).airborne, false); assert.equal(q.y, .46);
  assert.ok(T.doorLand - T.doorJump < 1.5);
});

test('sentries leave actual bays, keep the director lane clear, and pursue only after the door impact', () => {
  const pose: ResearchFlightPose = { position: new THREE.Vector3(), yaw: 0, pitch: 0, bank: 0, visible: false };
  for (let i = 0; i < 8; i++) {
    sampleResearchDrone(i, researchGalleryLaunchTime(i), pose);
    assert.equal(pose.visible, true); assert.ok(pose.position.z < ORIGIN.z - 3.9);
    for (let t = T.monitorEntry; t < T.blackout; t += .5) {
      sampleResearchDrone(i, t, pose); assert.ok(Math.abs(pose.position.x - ORIGIN.x) - 1 > 3.6);
    }
    sampleResearchDrone(i, researchHallLaunchTime(i) - .01, pose); assert.equal(pose.visible, false);
    sampleResearchDrone(i, researchHallLaunchTime(i), pose); assert.equal(pose.visible, true);
    assert.ok(Math.abs(pose.position.x - (ORIGIN.x + 16)) > 5); assert.equal(pose.position.z, ORIGIN.z + researchLocalZ(researchHallLaunchZ(i)));
    sampleResearchDrone(i, T.collision, pose); assert.equal(pose.visible, false);
    for (let t = researchHallLaunchTime(i); t < T.firingLine; t += .1) {
      sampleResearchDrone(i, t, pose); assert.ok(Math.abs(pose.pitch) <= (t >= T.firingLine - 1.2 ? 1.35 : .161) && Math.abs(pose.bank) <= .025);
    }
  }
});

test('the glass overlook and fall are physically continuous, with time to see the arena before the ambush', () => {
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  sampleResearchSpecimenWorld(T.fall - .000001, p); sampleResearchSpecimenWorld(T.fall + .000001, q);
  assert.ok(p.distanceTo(q) < .0001, 'the impact must not teleport the Specimen into a separate fall stage');
  assert.ok(T.ambush - T.overlook >= 5 && T.ambush - T.overlook < 7); assert.ok(T.pitOpen < T.noticeBoss && T.noticeBoss < T.boss);
  sampleResearchDronePosition(8, T.ambush, p);
  assert.ok(p.z < ORIGIN.z + 94.5 && p.x > ORIGIN.x + 13.9 && p.x < ORIGIN.x + 18.1);
});

test('the monitor remains in the search scene and gives its red find-them order', () => {
  const wing = new BlackoutResearchWing();
  try {
    const line = RESEARCH_DIALOGUE.find(l => l.text === 'Find them')!;
    assert.ok(line.start - T.blackout >= 6); assert.ok(T.chase - line.end < 2);
    wing.present(line.start + 1); wing.setScientist(line.text, 'red');
    assert.equal(wing.monitorDrone.visible, true); assert.equal(line.speaker, 'red');
    assert.equal(wing.diagnostics.scientistText, 'Find them');
    const screen = wing.monitorDrone.getObjectByName('flying-scientist-interface') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    for (const t of [T.blackout + .1, T.search + .1, T.findThem - .1, T.findThem + 1]) {
      wing.present(t); assert.equal(wing.monitorDrone.visible, true); assert.equal(screen.material.color.getHex(), 0xffffff);
      assert.equal(screen.material.toneMapped, false, 'the live screen cannot depend on the broken room lights');
    }
  } finally { wing.dispose(); }
});

test('both drone groups keep their weapons locked on the Specimen until their individual destruction', () => {
  const pose: ResearchFlightPose = { position: new THREE.Vector3(), yaw: 0, pitch: 0, bank: 0, visible: false };
  const target = new THREE.Vector3(), forward = new THREE.Vector3(), direction = new THREE.Vector3();
  for (let i = 0; i < 12; i++) for (const t of [researchDroneFireStart(i), researchDroneDeathTime(i) - .01]) {
    sampleResearchDrone(i, t, pose); assert.equal(pose.visible, true);
    sampleResearchSpecimenWorld(t, target); target.y += .7; direction.subVectors(target, pose.position).normalize();
    forward.set(0, 0, -1).applyEuler(new THREE.Euler(pose.pitch, pose.yaw, pose.bank, 'YXZ'));
    assert.ok(forward.dot(direction) > .999, `drone ${i} aims away from Specimen at ${t}`);
    sampleResearchDrone(i, researchDroneDeathTime(i) + .001, pose); assert.equal(pose.visible, false);
  }
});

test('continuous hostile fire reaches and is absorbed by the Specimen without growing any effect pool', () => {
  const fx = new BlackoutResearchEffects(), actors = [0, 1, 2].map(() => ({ position: new THREE.Vector3() }));
  const drones = Array.from({ length: 12 }, () => new THREE.Vector3()), specimen = new THREE.Vector3();
  const present = (t: number) => {
    actors.forEach((a, i) => { sampleResearchSlime((['bob', 'goop', 'volt'] as const)[i]!, t, a.position); a.position.add(ORIGIN); });
    drones.forEach((p, i) => sampleResearchDronePosition(i, t, p)); sampleResearchSpecimenWorld(t, specimen); fx.present(t, actors, specimen, drones);
  };
  try {
    for (const [start, end] of [[T.reveal + 1.2, T.blast], [T.landing + 1.2, researchDroneDeathTime(8)]]) {
      let incoming = 0, absorbed = 0;
      for (let t = start; t < end; t += 1 / 60) {
        present(t); incoming += fx.diagnostics.incomingProjectiles; absorbed += fx.diagnostics.absorbedShots;
        const target = new THREE.Vector3().fromArray(fx.diagnostics.absorptionTarget);
        assert.ok(target.distanceTo(specimen.clone().add(new THREE.Vector3(0, .7, 0))) < 1e-8);
        assert.ok(fx.absorptionRings.count <= 32 && fx.bolts.count <= 256 && fx.sparks.count <= 192);
        assert.equal(fx.absorptionRings.count, fx.diagnostics.absorbedShots);
      }
      assert.ok(incoming > 100 && absorbed > 100, 'the surviving drones must sustain a visible barrage');
    }
    present(researchDroneDeathTime(11) + 2); assert.equal(fx.diagnostics.incomingProjectiles, 0); assert.equal(fx.diagnostics.absorbedShots, 0);
    fx.reset(); assert.equal(fx.absorptionRings.count, 0);
  } finally { fx.dispose(); }
});

test('the pit stays covered until after the final kill, then opens before the boss arrives', () => {
  const gate = new ResearchArenaReveal();
  try {
    gate.present(T.overlook + 1); assert.equal(gate.diagnostics.pitCoverVisible, true); assert.equal(gate.diagnostics.pitOpenProgress, 0);
    assert.ok(T.pitUnlock > researchPursuerShotTime(3) + .28);
    gate.present(T.noticeBoss); assert.ok(gate.diagnostics.pitOpenProgress > 0 && gate.diagnostics.pitOpenProgress < 1);
    gate.present(T.boss); assert.equal(gate.diagnostics.pitOpenProgress, 1); assert.equal(gate.diagnostics.pitCoverVisible, false);
    gate.reset(); assert.equal(gate.root.visible, false);
  } finally { gate.dispose(); }
});

test('capture order locks every sentry onto the trio and search cones sweep independent targets', () => {
  const pose: ResearchFlightPose = { position: new THREE.Vector3(), yaw: 0, pitch: 0, bank: 0, visible: false };
  const target = new THREE.Vector3(0, .85, researchLocalZ(25.6)).add(ORIGIN);
  const direction = new THREE.Vector3(), forward = new THREE.Vector3(), scans = [];
  for (let i = 0; i < 8; i++) {
    sampleResearchDrone(i, 110, pose);
    direction.subVectors(target, pose.position).normalize();
    forward.set(0, 0, -1).applyEuler(new THREE.Euler(pose.pitch, pose.yaw, pose.bank, 'YXZ'));
    assert.ok(forward.dot(direction) > .995, `sentry ${i} is not pointing at the trio`);
    scans.push(researchSearchTarget(i, T.search + 3, new THREE.Vector3()));
  }
  for (let i = 0; i < scans.length; i++) for (let n = i + 1; n < scans.length; n++) assert.ok(scans[i]!.distanceTo(scans[n]!) > .4);
});

test('arrived hallway sentries aim down at Bob rather than away from the trio', () => {
  const pose: ResearchFlightPose = { position: new THREE.Vector3(), yaw: 0, pitch: 0, bank: 0, visible: false };
  const target = new THREE.Vector3(), forward = new THREE.Vector3(), direction = new THREE.Vector3();
  for (const t of [T.firingLine, T.firingLine + 2, T.crossfire - .1]) for (let i = 0; i < 8; i++) {
    sampleResearchSlime('bob', t, target); target.add(ORIGIN); target.y += .35;
    sampleResearchDrone(i, t, pose); direction.subVectors(target, pose.position).normalize();
    forward.set(0, 0, -1).applyEuler(new THREE.Euler(pose.pitch, pose.yaw, pose.bank, 'YXZ'));
    assert.ok(forward.dot(direction) > .999, `hall sentry ${i} points away at ${t}`);
  }
});

test('queued pursuit drones remain separated and distant during the door impact, then the ram group accelerates sharply', () => {
  const poses: ResearchFlightPose[] = Array.from({ length: 8 }, () => ({ position: new THREE.Vector3(), yaw: 0, pitch: 0, bank: 0, visible: false }));
  for (let t = T.pursuit; t < T.crossfire; t += .05) {
    poses.forEach((p, i) => sampleResearchDrone(i, t, p));
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (poses[i]!.visible && poses[j]!.visible) {
      assert.ok(poses[i]!.position.distanceTo(poses[j]!.position) > 2.4, `drones ${i}/${j} overlap at ${t}`);
    }
  }
  const bob = new THREE.Vector3(); sampleResearchSlime('bob', T.collision, bob); bob.add(ORIGIN);
  poses.forEach((p, i) => { sampleResearchDrone(i, T.collision, p); assert.ok(p.position.distanceTo(bob) > 22); });
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  sampleResearchDronePosition(8, T.ambush + .35, p); sampleResearchDronePosition(8, T.ambush + .4, q);
  assert.ok(p.distanceTo(q) / .05 > 18, 'the ambush must be a high-speed impact, not a slow hover');
  assert.equal(T.firingLine, RESEARCH_DIALOGUE.find(l => l.text === 'Just do it!')!.start);
  for (let i = 0; i < 8; i++) {
    let previous = -Infinity;
    for (let t = researchHallLaunchTime(i) + .05; t < T.firingLine; t += .05) {
      sampleResearchDronePosition(i, t, p); assert.ok(p.z > previous, `pursuer ${i} stopped or reversed at ${t}`); previous = p.z;
    }
    sampleResearchDronePosition(i, T.firingLine, p); sampleResearchDronePosition(i, T.firingLine + 1, q);
    assert.equal(p.z, q.z); assert.ok(previous < p.z);
    sampleResearchDronePosition(i, 179, p); sampleResearchDronePosition(i, 179.1, q); const early = q.z - p.z;
    sampleResearchDronePosition(i, 185, p); sampleResearchDronePosition(i, 185.1, q);
    assert.ok(Math.abs(q.z - p.z - early) < 1e-9, 'pursuit cruise must not slow down between dialogue cuts');
  }
});

test('fusion energy tracks Bob’s body, debris precedes the smoke cover, and drone hits make real detonations', () => {
  const fx = new BlackoutResearchEffects(), actors = [0, 1, 2].map(() => ({ position: new THREE.Vector3() }));
  const drones = Array.from({ length: 12 }, () => new THREE.Vector3()), specimen = new THREE.Vector3();
  const present = (t: number) => {
    actors.forEach((a, i) => { sampleResearchSlime((['bob', 'goop', 'volt'] as const)[i]!, t, a.position); a.position.add(ORIGIN); });
    drones.forEach((p, i) => sampleResearchDronePosition(i, t, p)); sampleResearchSpecimenWorld(t, specimen); fx.present(t, actors, specimen, drones);
  };
  try {
    present(T.crossfire + 6);
    const center = new THREE.Vector3().fromArray(fx.diagnostics.energyCenter);
    assert.ok(center.distanceTo(actors[0]!.position) < .1); assert.ok(fx.diagnostics.debris > 0);
    present(T.fusion + 1); assert.equal(fx.diagnostics.smokeCover, 1); assert.ok(fx.diagnostics.smoke > 20);
    present(T.reveal + 2); assert.equal(fx.diagnostics.smokeCover, 0); assert.equal(fx.diagnostics.smoke, 0);
    present(T.blast + .6); assert.ok(fx.diagnostics.detonations >= 12);
  } finally { fx.dispose(); }
});

test('the returning pursuers are destroyed by four separate visible bullets, never a simultaneous beam fan', () => {
  const fx = new BlackoutResearchEffects(), actors = [0, 1, 2].map(() => ({ position: ORIGIN.clone() }));
  const drones = Array.from({ length: 12 }, () => new THREE.Vector3()), specimen = new THREE.Vector3();
  try {
    for (let i = 0; i < 4; i++) {
      const t = researchPursuerShotTime(i) + .12;
      drones.forEach((p, id) => sampleResearchDronePosition(id, t, p)); sampleResearchSpecimenWorld(t, specimen);
      fx.present(t, actors, specimen, drones); assert.equal(fx.diagnostics.shots, 1); assert.equal(fx.diagnostics.bolts, fx.diagnostics.incomingProjectiles * 2);
      fx.present(researchPursuerShotTime(i) + .4, actors, specimen, drones); assert.equal(fx.diagnostics.shots, 0);
    }
  } finally { fx.dispose(); }
});

test('the Blender GLB contains only the authored wing and reusable door parts, with no startup cube or preview lights', async () => {
  const data = await readFile(new URL('../assets/environments/research-wing/research-wing.glb', import.meta.url));
  const asset = (await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')).scene;
  let count = 0, triangles = 0;
  asset.traverse(o => {
    assert.ok(!(o instanceof THREE.Camera) && !(o instanceof THREE.Light));
    assert.ok(!/^Cube(?:\.\d+)?$/.test(o.name), 'Blender startup objects must not enter the export');
    if (!(o instanceof THREE.Mesh)) return;
    count++; const p = o.geometry.getAttribute('position'); assert.ok(p.array.every(Number.isFinite));
    triangles += (o.geometry.index?.count ?? p.count) / 3;
  });
  assert.ok(count <= 48 && count >= 30); assert.ok(triangles < 80_000);
  assert.ok(asset.getObjectByName('Research_DeadEndDoor'));
  assert.ok(asset.getObjectByName('Research_Bay_Director'));
  assert.ok(asset.getObjectByName('Research_GalleryLamp_25'));
  const bounds = new THREE.Box3().setFromObject(asset); assert.ok(bounds.min.x < -8 && bounds.max.z > 111);
  asset.updateMatrixWorld(true);
  for (const [x, z] of [[0, 1], [13, 26], [16, 31], [16, 50], [16, 83], [16, 90], [16, 107]]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 2, researchLocalZ(z)), new THREE.Vector3(0, -1, 0), 0, 2.2);
    assert.ok(ray.intersectObject(asset, true).length, `continuous floor missing at ${x}, ${z}`);
  }
  const back = new THREE.Raycaster(new THREE.Vector3(0, 4, researchLocalZ(4)), new THREE.Vector3(0, 0, -1), 0, 15);
  assert.ok(back.intersectObject(asset, true).length, 'the gallery entrance must not look into empty space');
  for (const z of [83.8, 84.2, 94.8, 95.2, 95.8]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(16.137, .1, z), new THREE.Vector3(0, -1, 0), 0, .15);
    assert.equal(ray.intersectObject(asset, true).length, 1, `overlapping floor surfaces at ${z}`);
  }
  for (const x of [8.7, 23.3]) for (const z of [97, 103, 109]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, .1, z), new THREE.Vector3(0, -1, 0), 0, .15);
    assert.equal(ray.intersectObject(asset, true).length, 1, `a support cap overlaps the floor at ${x}/${z}`);
  }
  for (const side of ['Left', 'Right']) {
    const hatch = asset.getObjectByName(`Research_Bay_Hall_${side}`)!, box = new THREE.Box3().setFromObject(hatch);
    assert.ok(box.min.y > 2.53 && box.max.y < 5.27, 'shutters need visible clearance from the sill and header');
    assert.ok(box.getSize(new THREE.Vector3()).z > 9, 'four launch lanes need a wide opening');
    assert.ok((hatch as THREE.Mesh).material instanceof THREE.MeshStandardMaterial);
    assert.equal(((hatch as THREE.Mesh).material as THREE.Material).side, THREE.FrontSide);
    assert.ok(side === 'Left' ? box.max.x < 12.02 : box.min.x > 19.98, 'shutters must stay behind the wall face while lifting');
  }
  for (const side of [-1, 1]) for (const [y, z] of [[1.55, 50.13], [1.65, 50.13], [5.75, 50.13], [5.85, 50.13], [3.72, 46.42], [3.72, 53.58]]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(16, y, researchLocalZ(z)), new THREE.Vector3(side, 0, 0), 0, 7);
    const hits = ray.intersectObject(asset, true), near = hits[0]!.distance;
    assert.equal(hits.filter(h => Math.abs(h.distance - near) < .025).length, 1, `bay caps or cheeks overlap the wall at ${side}/${y}/${z}`);
  }
  const camera = new BlackoutResearchCamera(), eye = new THREE.Vector3(), target = new THREE.Vector3();
  const anchors = { bob: new THREE.Vector3(), group: new THREE.Vector3(), specimen: new THREE.Vector3() };
  for (let t = 0; t < T.glass; t += .25) {
    sampleResearchSlime('bob', t, anchors.bob); anchors.bob.add(ORIGIN);
    anchors.group.copy(anchors.bob).setY(ORIGIN.y); sampleResearchSpecimenWorld(t, anchors.specimen);
    camera.sample(t, anchors, eye, target); eye.sub(ORIGIN);
    const ray = new THREE.Raycaster(eye, target.sub(ORIGIN).sub(eye).normalize(), 0, .25);
    assert.equal(ray.intersectObject(asset, true).length, 0, `camera starts inside scenery at t=${t}`);
  }
  asset.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) m.dispose(); } });
});
