import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BlackoutAscentLift, BLACKOUT_ASCENT_LIFT as V } from '../src/levels/BlackoutAscentLift.ts';
import { BlackoutElevatorAscent } from '../src/cinematics/BlackoutElevatorAscent.ts';
import { ELEVATOR_DIALOGUE, ELEVATOR_TIMING as T, elevatorBoardingRoute, sampleElevatorBoarding, elevatorTravel } from '../src/cinematics/BlackoutElevatorTimeline.ts';
import { CollisionWorld, CollisionHit, ColliderTransformMode } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { BobCharacterPresentation } from '../src/render/bob/BobCharacterPresentation.ts';
import { GoopCharacterPresentation } from '../src/render/goop/GoopCharacterPresentation.ts';
import { VoltCharacterPresentation } from '../src/render/volt/VoltCharacterPresentation.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';
import { cinematicMusicEvents, type CinematicMusic } from '../src/audio/CinematicMusic.ts';

function setup() {
  const lift = new BlackoutAscentLift(), root = new THREE.Group(), world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  root.add(lift.root); const ambient = new THREE.HemisphereLight(0x34404a, 0x080a0b, .025); root.add(ambient);
  world.registerAll(lift.collisionMeshes, undefined, ColliderTransformMode.Static); surfaces.registerAll(lift.collisionMeshes);
  lift.dynamicColliders.forEach(m => world.setTransformMode(m, ColliderTransformMode.Dynamic));
  const bodies = { bob: new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(-1.4, .86, 175) }),
    goop: new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(0, .86, 180.7) }),
    volt: new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(1.4, .86, 174.5) }) };
  const presentations = { bob: new BobCharacterPresentation(.45), goop: new GoopCharacterPresentation(.45), volt: new VoltCharacterPresentation(.45) };
  Object.values(presentations).forEach(p => root.add(p.root));
  const host = { dataset: {} } as HTMLElement, camera = new THREE.PerspectiveCamera(48, 16 / 9, .1, 200);
  const movie = new BlackoutElevatorAscent({ root, host, lift, bodies, presentations });
  return { root, world, surfaces, lift, bodies, presentations, host, camera, movie, ambient,
    dispose() { movie.dispose(); Object.values(presentations).forEach(p => p.dispose()); lift.dispose(); world.clear(); surfaces.clear(); } };
}

test('the elevator uses exactly the four requested lines with room for silence, and a smooth accelerating/braking ascent', () => {
  assert.deepEqual(ELEVATOR_DIALOGUE.map(l => [l.speaker, l.text]), [
    ['goop', 'Might need some of that electricity of yours, Volt.'], ['volt', 'When do you ever not need it?'],
    ['goop', 'This place is a living hell'], ['volt', 'Tell me about it'],
  ]);
  assert.ok(ELEVATOR_DIALOGUE[2].start - T.lift >= 10, 'the shared forward-facing ascent starts with a quiet pause before the final exchange');
  assert.ok(T.arrival - ELEVATOR_DIALOGUE[3].end > 12);
  assert.ok(elevatorTravel(T.arrival) > 60);
  let last = 0, lastSpeed = 0;
  for (let i = 0; i < T.duration * 120; i++) {
    const distance = elevatorTravel(i / 120), speed = (distance - last) * 120;
    assert.ok(speed >= -1e-9 && speed <= 2.401); assert.ok(Math.abs(speed - lastSpeed) < .007);
    last = distance; lastSpeed = speed;
  }
  assert.equal(lastSpeed, 0);
});

test('boarding starts at actual positions, takes the open side of the propped shutter and supports an already-boarded actor', () => {
  for (const [id, position] of [['bob', new THREE.Vector3(10, 8.06, 142.5)], ['goop', new THREE.Vector3(10, -.52, 139)],
    ['volt', new THREE.Vector3(-16, 2.96, 132)], ['bob', V.standing.bob.clone()]] as const) {
    const route = elevatorBoardingRoute(id, position, .45), point = new THREE.Vector3(), previous = position.clone();
    sampleElevatorBoarding(route, 0, point); assert.ok(point.distanceTo(position) < 1e-9);
    for (let i = 1; i < Math.ceil(route.duration * 120); i++) {
      const air = sampleElevatorBoarding(route, i / 120, point);
      assert.ok(point.distanceTo(previous) < .065, `${id} route snaps at ${i / 120}`);
      if (point.z > 153 && point.z < 157) { assert.ok(point.x < 0); assert.ok(!air); }
      previous.copy(point);
    }
    sampleElevatorBoarding(route, route.duration, point); assert.ok(point.distanceTo(V.standing[id]) < 1e-9);
  }
});

test('the solid lift connects the hallway to a gated lab, and its whole supported deck triggers boarding, not a flyover or nearby floor', () => {
  const s = setup(); try {
    const body = s.bodies.goop, hit = new CollisionHit();
    body.teleport(new THREE.Vector3(0, .86, 180.7)); assert.equal(s.lift.canBoard(body), true);
    body.teleport(new THREE.Vector3(0, 3, 180.7)); assert.equal(s.lift.canBoard(body), false);
    body.teleport(new THREE.Vector3(0, .86, 175)); assert.equal(body.grounded, true); assert.equal(s.lift.canBoard(body), false);
    for (const p of [new THREE.Vector3(3.26, .86, 178.7), new THREE.Vector3(-3.26, .86, 180.7), new THREE.Vector3(0, .86, 177.05)]) {
      body.teleport(p); assert.equal(s.lift.canBoard(body), true, 'do not reject the deck edges with a smaller invisible trigger box');
    }
    assert.equal(s.world.sweepSphere(new THREE.Vector3(0, .87, 183), new THREE.Vector3(0, 0, 4), .45, hit), true);
    assert.equal(hit.object?.name, 'lift-front-landing-shutter');
    s.lift.setArrived(true);
    assert.equal(s.world.sweepSphere(new THREE.Vector3(0, .87, 183), new THREE.Vector3(0, 0, 4), .45, hit), false);
    body.teleport(new THREE.Vector3(0, .86, 184));
    for (let i = 0; i < 120 && body.position.z < 187.2; i++) body.update(1 / 60, new THREE.Vector3(0, 0, 1));
    assert.ok(body.position.z > 187 && body.position.y > .84);
    for (const mesh of s.lift.collisionMeshes) assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
  } finally { s.dispose(); }
});

test('the boarding room contains the waiting apron and lift, but not the approach hallway, lab landing or shaft below', () => {
  const lift = new BlackoutAscentLift(); try {
    for (const p of [[-1.5, .86, 175.2], [0, .86, 180.7], [1.5, 2, 180.7]]) assert.equal(lift.isInBoardingRoom(new THREE.Vector3(...p)), true);
    for (const p of [[0, .86, 173], [0, .86, 151], [0, .86, 187], [6.2, .86, 180.7], [0, -1, 180.7], [0, 8, 180.7]])
      assert.equal(lift.isInBoardingRoom(new THREE.Vector3(...p)), false);
  } finally { lift.dispose(); }
});

test('the exposed circuit cabinet has real components and a hinged cover clear of its board, terminals, rail and passenger route', () => {
  const s = setup(); try {
    const bounds = (name: string): THREE.Box3 => {
      const node = s.lift.root.getObjectByName(name); assert.ok(node, `missing ${name}`);
      return new THREE.Box3().setFromObject(node);
    };
    const cover = bounds('lift-open-cabinet-cover');
    for (const name of ['lift-exposed-pcb', 'lift-terminal-carrier', 'lift-car-side-rail-outlet-front', 'lift-car-side-rail-outlet-back'])
      assert.equal(cover.intersectsBox(bounds(name)), false, `the open cover must not pass through ${name}`);
    assert.ok(cover.min.y > .95, 'the cover no longer cuts through the floor');
    assert.ok(cover.min.x > 2.35, 'the cover leaves Volt’s boarding and exit lane clear');
    assert.equal(s.lift.root.getObjectByName('lift-severed-wire'), undefined);
    const traces: THREE.Object3D[] = [], pins: THREE.Object3D[] = [], terminals: THREE.Object3D[] = [];
    s.lift.root.traverse(node => {
      if (node.name.startsWith('lift-pcb-copper-trace-')) traces.push(node);
      if (node.name === 'lift-controller-chip-pin') pins.push(node);
      if (node.name === 'lift-power-terminal') terminals.push(node);
    });
    assert.equal(traces.length, 6); assert.equal(pins.length, 8); assert.equal(terminals.length, 2);
    const hit = new CollisionHit();
    assert.equal(s.world.sweepSphere(new THREE.Vector3(1.8, .87, 180.4), new THREE.Vector3(0, 0, 3), .45, hit), false);
    assert.equal(s.world.sweepSphere(new THREE.Vector3(2, 1.5, 181.25), new THREE.Vector3(2, 0, 0), .45, hit), true);
    assert.equal(hit.object?.name, 'lift-power-cabinet-solid', 'the railing cutout must not let players walk through the cabinet');
  } finally { s.dispose(); }
});

test('all three turn toward the lab as ascent starts, then hold that direction through the silence and final two lines', () => {
  const s = setup(); try {
    const headings = new Map<object, THREE.Vector3>();
    for (const p of Object.values(s.presentations)) {
      const aim = p.setAimDirection.bind(p);
      p.setAimDirection = direction => { if (direction) headings.set(p, new THREE.Vector3(direction.x, direction.y, direction.z)); aim(direction); };
    }
    s.movie.begin(s.camera);
    while (s.movie.seconds < s.movie.boardingSeconds + T.lift - .01) s.movie.update(1 / 60);
    assert.ok(Math.abs(s.presentations.volt.diagnostics.targetYawRadians - Math.PI) > .1, 'Volt is still facing the outlet before the ascent');
    while (s.movie.seconds < s.movie.boardingSeconds + T.lift) s.movie.update(1 / 60);
    for (const presentation of Object.values(s.presentations)) {
      assert.deepEqual(headings.get(presentation)?.toArray(), [0, 0, 1], 'the forward turn starts with the elevator');
    }
    while (s.movie.seconds < s.movie.boardingSeconds + ELEVATOR_DIALOGUE[3].end + 1) {
      s.movie.update(1 / 60);
      if (s.movie.seconds < s.movie.boardingSeconds + T.lift + 1.5) continue;
      for (const presentation of Object.values(s.presentations)) {
        assert.ok(Math.cos(presentation.diagnostics.facingYawRadians) < -.99, 'all three keep looking forward, including while speaking');
      }
    }
  } finally { s.dispose(); }
});

test('the ascent borrows real slimes once, keeps rendering non-authoritative, spatialises dialogue and releases a safe lab landing', () => {
  const s = setup(), parents = Object.values(s.presentations).map(p => p.root.parent), cues: { sound: string; position?: { x: number; y: number; z: number }; volumeScale?: number }[] = [];
  const off = gameplayAudioEvents.on('cue', c => cues.push({ ...c, position: c.position ? { ...c.position } : undefined }));
  try {
    assert.equal(s.movie.begin(s.camera), true); assert.equal(s.movie.begin(s.camera), false);
    const count = s.root.children.length, lights: THREE.Light[] = [];
    s.root.traverse(o => { if (o instanceof THREE.Light) lights.push(o); });
    for (let i = 0; s.movie.active; i++) {
      s.movie.update(1 / 60);
      if (!s.movie.active) break;
      if (i % 12 !== 0) continue;
      const seconds = s.movie.seconds;
      const volt = s.movie.actors[2]!;
      if (volt.intent.lengthSq() > .01) assert.ok(Math.abs(s.presentations.volt.diagnostics.targetYawRadians - Math.atan2(-volt.intent.x, -volt.intent.z)) < 1e-8,
        'Volt must face his actual path, not keep the idle dialogue heading while boarding');
      for (let frame = 0; frame < 3; frame++) { s.camera.position.set(0, 3, 179); s.movie.present(s.camera, frame / 2); }
      assert.equal(s.movie.seconds, seconds); assert.equal(s.root.children.length, count);
      assert.ok(lights.every(l => l.visible), 'never change shader light counts during a passing-light cycle');
      for (const actor of s.movie.actors) assert.ok(actor.presentation.root.getWorldPosition(new THREE.Vector3()).distanceTo(actor.pose.position) < 1e-7);
    }
    assert.equal(s.movie.complete, true); assert.equal(s.host.dataset.cinematic, undefined);
    assert.equal(s.ambient.intensity, .025); assert.equal(s.camera.fov, 48);
    Object.values(s.presentations).forEach((p, i) => assert.equal(p.root.parent, parents[i]));
    for (const id of ['bob', 'goop', 'volt'] as const) {
      assert.ok(s.bodies[id].position.distanceTo(V.landing[id]) < 1e-8); assert.equal(s.bodies[id].grounded, true);
    }
    assert.equal(cues.filter(c => c.sound === 'volt-shoot-01').length, 3);
    assert.equal(cues.filter(c => c.sound === 'blackout-lift-start-01').length, 1);
    assert.equal(cues.filter(c => c.sound === 'blackout-lift-stop-01').length, 1);
    const voices = cues.filter(c => c.sound === 'bob-contact-01' && (c.volumeScale??0) > .3);
    assert.ok(voices.length > 20); assert.ok(voices.every(c => c.position && c.position.z > 180 && c.position.z < 182));
    assert.ok(cues.some(c => c.sound === 'bob-contact-01' && c.volumeScale === .3 && c.position!.z < 180), 'boarding has resolved movement contacts');
    assert.equal(s.movie.begin(s.camera), false);
  } finally { off(); s.dispose(); }
});

test('skip and reset release movie ownership without waiting for the motor, and recovery does not replay a completed ascent', () => {
  const s = setup(); try {
    s.movie.begin(s.camera); assert.equal(s.movie.update(1 / 60, true), true); assert.equal(s.movie.active, false);
    assert.equal(s.lift.frontGate.position.y, 8.4); assert.equal(s.lift.rearGate.position.y, 3.05);
    s.movie.reset(true); assert.equal(s.movie.begin(s.camera), false);
    s.movie.reset(); assert.equal(s.lift.frontGate.position.y, 3.05); assert.equal(s.movie.begin(s.camera), true);
    s.movie.update(1 / 60); s.movie.reset(); assert.equal(s.movie.active, false); assert.equal(s.host.dataset.cinematic, undefined);
    assert.equal(s.camera.fov, 48); assert.equal(s.presentations.bob.root.parent, s.root);
    s.movie.dispose(); s.movie.dispose(); assert.equal(s.movie.begin(s.camera), false);
  } finally { s.dispose(); }
});

test('ascent music follows live boarding and releases once on completion, skip, reset and disposal', () => {
  const s = setup(), started: CinematicMusic[] = [], stopped: CinematicMusic[] = [];
  const offStart = cinematicMusicEvents.on('started', cue => started.push(cue));
  const offStop = cinematicMusicEvents.on('stopped', cue => stopped.push(cue));
  try {
    for (const finish of ['complete', 'skip', 'reset', 'dispose'] as const) {
      s.movie.reset();
      assert.equal(s.movie.begin(s.camera), true);
      const cue = started.at(-1)!;
      assert.equal(cue.track, 'ascent');
      assert.equal(cue.duration, s.movie.boardingSeconds + T.duration);
      assert.equal(cue.seconds, 0);
      s.movie.update(1 / 60);
      assert.equal(cue.seconds, s.movie.seconds);
      if (finish === 'complete') while (s.movie.active) s.movie.update(1 / 60);
      else if (finish === 'skip') s.movie.update(1 / 60, true);
      else if (finish === 'reset') s.movie.reset();
      else s.movie.dispose();
      assert.equal(cue.playing, false);
      assert.equal(stopped.filter(item => item === cue).length, 1);
    }
    assert.equal(started.length, 4);
    assert.deepEqual(stopped, started);
  } finally { offStart(); offStop(); s.dispose(); }
});

test('passing lights fade at the shaft-pool wrap instead of flashing or changing the light layout', () => {
  const lift = new BlackoutAscentLift(); try {
    const lights: THREE.PointLight[] = [];
    lift.root.traverse(node => { if (node instanceof THREE.PointLight && node.name.startsWith('lift-passing-light-')) lights.push(node); });
    assert.equal(lights.length, 3); let previous: number[] | undefined;
    for (let i = 0; i < T.duration * 120; i++) {
      lift.present(elevatorTravel(i / 120), 1, 0, 1, i / 120);
      if (previous) lights.forEach((l, n) => assert.ok(Math.abs(l.intensity - previous![n]!) < .13, `wash flashed at ${i / 120}`));
      previous = lights.map(l => l.intensity);
    }
  } finally { lift.dispose(); }
});
