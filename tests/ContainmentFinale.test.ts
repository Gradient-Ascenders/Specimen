import { cinematicMusicEvents, type CinematicMusic } from '../src/audio/CinematicMusic.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CONTAINMENT_FINALE_SHOTS, CONTAINMENT_FINALE_TIMING as T, FINALE_VENT, sampleContainmentFinale } from '../src/cinematics/ContainmentFinaleTimeline.ts';
import { ContainmentFinaleVisuals, reinforcementPosition } from '../src/cinematics/ContainmentFinaleVisuals.ts';
import { ContainmentFinalePresentation } from '../src/cinematics/ContainmentFinalePresentation.ts';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { ContainmentLevelController } from '../src/levels/ContainmentLevelController.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import type { KinematicBody } from '../src/physics/KinematicBody.ts';
import type { ContainmentFinaleOverlay } from '../src/cinematics/ContainmentFinaleOverlay.ts';
import { createAuthoredDissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { DissolveSystem } from '../src/abilities/DissolveSystem.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { finaleTime as F } from '../src/cinematics/ContainmentFinaleTiming.ts';

test('all cinematic shots cover a single deterministic timeline with finite camera/actor poses', () => {
  assert.equal(CONTAINMENT_FINALE_SHOTS[0].start, 0);
  assert.equal(CONTAINMENT_FINALE_SHOTS.at(-1)!.end, T.end);
  CONTAINMENT_FINALE_SHOTS.forEach((shot, i) => {
    if (i) assert.equal(shot.start, CONTAINMENT_FINALE_SHOTS[i - 1].end);
    for (let t = shot.start + .001; t < shot.end; t += .1) {
      const f = sampleContainmentFinale(t);
      assert.equal(f.shot, shot.id);
      for (const p of [f.bob, f.goop, f.drone, f.cameraPosition, f.cameraTarget]) assert.ok(p.every(Number.isFinite));
      assert.ok(new THREE.Vector3().fromArray(f.cameraPosition).distanceTo(new THREE.Vector3().fromArray(f.cameraTarget)) > .2);
    }
  });
  assert.equal(sampleContainmentFinale(NaN).seconds, 0);
  assert.equal(sampleContainmentFinale(900).seconds, T.end);
});

test('the drone is a surprise, scans are readable, and Thanks precedes reinforcements', () => {
  assert.equal(sampleContainmentFinale(14.999).droneVisible, false);
  assert.equal(sampleContainmentFinale(15).droneVisible, true);
  assert.equal(sampleContainmentFinale(19).scan, 'bob');
  assert.equal(sampleContainmentFinale(23).scan, 'goop');
  assert.ok(T.scanPan - T.scanBob >= 3); assert.ok(T.combat - T.scanGoop >= 3);
  assert.equal(sampleContainmentFinale(F(65)).thank, true);
  assert.equal(sampleContainmentFinale(T.reinforcements).thank, false);
  assert.equal(sampleContainmentFinale(F(67.3)).reinforcementCount, 3);
});

test('the front hatch hinges above the opening, swings only outward, and shares its release/skip/reset pose',()=>{
  const world=new ContainmentLevelScene(()=>{}),room=world.roomFive,pivot=room.art.panelPivots.front;
  const box=new THREE.Box3();
  try{
    assert.deepEqual(pivot.position.toArray(),[0,78.5,107.74]);
    for(let progress=0;progress<=1;progress+=.01){
      room.art.setReleaseProgress(progress);world.root.updateMatrixWorld(true);box.setFromObject(pivot);
      assert.ok(box.max.z<107.91,'No part of the hatch swings into the occupied cell.');
      assert.equal(pivot.rotation.y,0);assert.equal(pivot.rotation.z,0);
    }
    room.art.setReleaseProgress(1);world.root.updateMatrixWorld(true);box.setFromObject(pivot);
    assert.ok(box.min.y>78.3,'The fully opened hatch stays overhead, clear of the floor exit.');
    room.art.setReleaseProgress(-1);assert.equal(pivot.rotation.x,0);
    room.art.setReleaseProgress(2);assert.equal(pivot.rotation.x,1.65);
    room.reset();assert.equal(pivot.rotation.x,0);
    room.beginEnding();room.updateEnding(4.2);
    assert.ok(Math.abs(pivot.rotation.x-sampleContainmentFinale(4.2).panelOpen*1.65)<1e-9);
    room.finishEnding();assert.equal(pivot.rotation.x,1.65);
    room.reset();assert.equal(pivot.rotation.x,0);
  }finally{world.dispose();}
});

test('the finale excludes earlier room art without hiding light ancestry or borrowed actors, even if a draw throws', () => {
  const world = new ContainmentLevelScene(() => {});
  const roots = [world.teaching.roomOneArt.root, world.teaching.roomTwoArt.root, world.roomThree.root, world.roomFour.root, world.roomFive.root, world.bob.root];
  const before = roots.map(root => root.visible);
  const visibleLights = () => { const lights: THREE.Light[] = []; world.root.traverseVisible(object => { if (object instanceof THREE.Light) lights.push(object); }); return lights; };
  const lights = visibleLights();
  try {
    assert.throws(() => world.withRoomFiveCinematicScope(() => {
      assert.equal(world.teaching.roomOneArt.root.visible, false);
      assert.equal(world.teaching.roomTwoArt.root.visible, false);
      assert.equal(world.roomThree.root.visible, false);
      assert.equal(world.roomFive.root.visible, true); assert.equal(world.bob.root.visible, true);
      assert.deepEqual(visibleLights(), lights);
      throw Error('draw failed');
    }), /draw failed/);
    assert.deepEqual(roots.map(root => root.visible), before);
  } finally { world.dispose(); }
});

test('Bob launches directly from the platform, mounts the drone, lands safely, then both use the real vent opening', () => {
  for (let t = F(39.25); t < T.leap; t += .01) {
    const f = sampleContainmentFinale(t);
    assert.equal(f.bobAttached, false); assert.equal(f.bobAirborne, false);
    assert.ok(Math.abs(f.bob[1]-96.21)<1e-10, 'Bob stays planted on the platform instead of climbing the sticky wall.');
  }
  for (const t of [50, 52, 56]) {
    const f = sampleContainmentFinale(t); assert.equal(f.latched, true);
    assert.ok(Math.abs(f.bob[0] - f.drone[0]) < .001);
    const sole = f.bob[1] - .45 * (1 - .25 * f.mountCompression);
    assert.ok(Math.abs(sole - (f.drone[1] + .51)) < .001, 'The compressed slime stays seated on the upper deck.');
  }
  assert.equal(sampleContainmentFinale(T.restLanding).bob[1], 81.542);
  assert.equal(sampleContainmentFinale(T.safeLanding).bob[1], 75.21);
  for (let t = 0; t < T.dive; t += .05) assert.ok(sampleContainmentFinale(t).goop[1] >= 75.20);
  for (const p of [sampleContainmentFinale(F(80.4)).bob, sampleContainmentFinale(F(81)).goop]) {
    assert.ok(Math.abs(p[0] - FINALE_VENT.x) < FINALE_VENT.width / 2 - .35);
    assert.ok(Math.abs(p[2] - FINALE_VENT.z) < FINALE_VENT.width / 2 - .35); assert.ok(p[1] < FINALE_VENT.y);
  }
});

test('pooled visual resources are prepared in separate jobs and stay fixed throughout playback', async () => {
  const v = new ContainmentFinaleVisuals();
  try {
    const labels: string[] = [];
    for (const job of v.preparationJobs()) { labels.push(job.label); await job.run(); }
    assert.ok(labels.length >= 14); assert.equal(v.drones.length, 4);
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(); let meshes = 0;
    v.root.traverse(object => { if (object instanceof THREE.Mesh) { geometry.add(object.geometry);
      for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m); meshes++; } });
    const count = v.root.children.length;
    for (let t = 0; t <= T.end; t += .1) v.update(sampleContainmentFinale(t));
    assert.equal(v.root.children.length, count);
    let later = 0; v.root.traverse(object => { if (object instanceof THREE.Mesh) {
      assert.ok(geometry.has(object.geometry)); for (const m of Array.isArray(object.material) ? object.material : [object.material]) assert.ok(materials.has(m)); later++;
    } }); assert.equal(later, meshes);
    v.update(sampleContainmentFinale(F(65)));
    const wreck = v.root.getObjectByName('finale-settling-drone-wreck') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < wreck.count; i++) {
      wreck.getMatrixAt(i, matrix); const e = matrix.elements;
      for (const axis of [1, 2, 4, 6, 8, 9]) assert.ok(Math.abs(e[axis]) < 1e-6, 'Settled plates lie flat, without continuous rotation.');
      assert.ok(Math.min(Math.abs(e[13] - 74.79), Math.abs(e[13] - 81.122)) < 1e-5, 'No floating wreck above the floor or platform.');
    }
    const ray = new THREE.Raycaster(new THREE.Vector3(FINALE_VENT.x, 75, FINALE_VENT.z), new THREE.Vector3(0, -1, 0), 0, 5);
    v.root.visible = true; v.root.updateMatrixWorld(true);
    assert.equal(ray.intersectObject(v.annex, true).length, 0, 'The floor has a geometric opening deep enough to dive through.');
    for (let i = 0; i < 3; i++) {
      const p = reinforcementPosition(F(75.4) + i * .55, i);
      assert.ok(p[1]>75&&p[1]<79.2);assert.ok(p[2]<124,'Pursuers stop outside the narrow vent.');
    }
  } finally { v.dispose(); v.dispose(); }
});

test('the button gates real beams, stops carrier motion, and skip emits the normal next-level handoff only once', () => {
  const scene = new ContainmentLevelScene(() => {}), collisionWorld = new CollisionWorld();
  const body = { position: new THREE.Vector3(-10, 97.95, 130.55), previousPosition: new THREE.Vector3(), velocity: new THREE.Vector3(),
    attached: false, radiusMetres: .45, attachmentSurfaceName: '',
    recoverAt(p: THREE.Vector3) { this.position.copy(p); }, clearMotionState() {}, isSupportedBy() { return false; } };
  const controller = new ContainmentLevelController({ scene, collisionWorld, body: body as unknown as KinematicBody, requestDeath: () => false });
  let completed = 0; controller.events.on('completed', event => { assert.equal(event.nextLevelId, 'level-2'); completed++; });
  try {
    controller.teleportToRoomForDebug(5); body.position.set(-10, 97.95, 130.55);
    controller.update(.2); controller.update(.2); assert.equal(controller.state, 'completing');
    assert.ok(scene.roomFive.lasers.hazards.every(hazard => !hazard.enabled));
    const platform = scene.roomFive.movingPlatformOne.collisionMesh.position.clone();
    scene.roomFive.updateTraversal(10, body as unknown as KinematicBody, []);
    assert.ok(scene.roomFive.movingPlatformOne.collisionMesh.position.equals(platform));
    controller.update(70); assert.equal(completed, 0);
    controller.skipEnding(); controller.skipEnding(); controller.update(100); assert.equal(completed, 1);
    assert.ok(scene.roomFive.goopReleasePosition.equals(new THREE.Vector3(.5,68,138.9)));
    scene.roomFive.reset(); assert.equal(scene.roomFive.endingSeconds, 0);
  } finally { controller.dispose(); collisionWorld.clear(); scene.dispose(); }
});

test('the film borrows existing actors, freezes on the same clock, restores owners and never disposes their models', async () => {
  const world = new ContainmentLevelScene(() => {}), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 16 / 9, .2, 90);
  scene.add(world.root); const bobParent = world.bob.root.parent, goopParent = world.roomFive.goopPresentation.root.parent;
  const staticRoot = world.roomFive.art.containmentAssembly.children.find(root => root !== world.roomFive.art.containmentPanelRoot)!;
  const staticVisible = staticRoot.visible;
  let disposedSourceGeometry = 0;
  staticRoot.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.addEventListener('dispose', () => disposedSourceGeometry++); });
  let opened = 0, hidden = 0, renderCount = 0;
  const overlay = { render() { renderCount++; }, hide() { hidden++; } } as unknown as ContainmentFinaleOverlay;
  const collisions = new CollisionWorld(), surfaces = new SurfaceRegistry(), door = world.roomFive.goopWoodenDoor;
  collisions.register(door); surfaces.register(door);
  const target = createAuthoredDissolveTarget(door, collisions, surfaces)!;
  const dissolve = new DissolveSystem([target]);
  const film = new ContainmentFinalePresentation({ scene, world, camera, overlay, cue() {}, openDoor() { opened++; dissolve.startBurn(target); } });
  try {
    for (const job of film.preparationJobs()) await job.run();
    assert.ok(film.setDressing.diagnostics.drawCallsRemoved >= 20, 'The stationary cell should use fewer submissions without altering its appearance.');
    film.begin(new THREE.Vector3(-10, 99.3, 131.08)); film.render(50);
    assert.equal(staticRoot.visible, false); assert.equal(world.roomFive.art.containmentPanelRoot.visible, true);
    const position = world.bob.root.getWorldPosition(new THREE.Vector3()); film.render(50);
    assert.ok(world.bob.root.getWorldPosition(new THREE.Vector3()).equals(position));
    film.fixedUpdate(T.doorHit-.01); assert.equal(opened, 0); assert.equal(target.progress, 0);
    film.fixedUpdate(T.doorHit); film.fixedUpdate(T.doorHit+.1); assert.equal(opened, 1);
    dissolve.update(1.8); assert.equal(target.completed, true); assert.equal(target.collisionEnabled, false); assert.equal(door.visible, false);
    assert.ok(sampleContainmentFinale(F(72.2)).bob[2] < 125.1, 'The door finishes burning before either actor crosses it.');
    assert.ok(sampleContainmentFinale(F(72.6)).goop[2] < 125.1);
    film.reset(); assert.equal(film.active, false); assert.ok(hidden > 0); assert.ok(renderCount > 0);
    assert.equal(staticRoot.visible, staticVisible);
    assert.equal(world.bob.root.parent, bobParent); assert.equal(world.roomFive.goopPresentation.root.parent, goopParent);
    assert.equal(camera.fov, 55); assert.equal(camera.near, .2); assert.equal(camera.far, 90);
    film.dispose(); assert.equal(world.bob.root.parent, bobParent);
    assert.equal(disposedSourceGeometry, 0, 'Cinematic batch disposal must not free borrowed gameplay geometry.');
    assert.ok(world.bob.root.children.length > 0, 'Borrowed model owner survives film disposal.');
  } finally { film.dispose(); dissolve.dispose(); target.dispose(); surfaces.clear(); collisions.clear(); world.dispose(); }
});

test('Containment music starts with the prepared film and ends on its real clock, skip or disposal', async () => {
  const world = new ContainmentLevelScene(() => {}), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.add(world.root);
  const overlay = { render() {}, hide() {} } as unknown as ContainmentFinaleOverlay;
  const film = new ContainmentFinalePresentation({ scene, world, camera, overlay, cue() {}, openDoor() {} });
  const cues: CinematicMusic[] = [], stopped: CinematicMusic[] = [];
  const offs = [cinematicMusicEvents.on('started', cue => cues.push(cue)), cinematicMusicEvents.on('stopped', cue => stopped.push(cue))];
  try {
    for (const job of film.preparationJobs()) await job.run();
    assert.equal(cues.length, 0);
    film.begin(new THREE.Vector3()); const first = cues[0]!;
    assert.equal(first.track, 'escape'); assert.equal(first.duration, T.end);
    film.render(T.end - .5); assert.equal(first.seconds, T.end - .5);
    film.fixedUpdate(T.end); assert.deepEqual(stopped, [first]);
    film.reset(); film.begin(new THREE.Vector3()); const second = cues[1]!;
    assert.notEqual(first, second); assert.equal(second.seconds, 0);
    film.render(T.end); assert.deepEqual(stopped, [first, second]);
    film.reset(); film.begin(new THREE.Vector3()); film.dispose();
    assert.deepEqual(stopped, cues);
  } finally { film.dispose(); world.dispose(); offs.forEach(off => off()); }
});
