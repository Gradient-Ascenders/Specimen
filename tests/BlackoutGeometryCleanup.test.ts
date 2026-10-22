import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { maintenanceMaps } from './helpers/BlackoutMaintenanceMapData.ts';
import { BlackoutLevelScene } from '../src/levels/BlackoutLevelScene.ts';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';
import { BlackoutTransitController } from '../src/levels/BlackoutTransitController.ts';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { auditOpaqueSurfaces, collectOpaqueTriangles } from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import { repairStaticBoxSurfaces } from '../src/render/geometry/CoplanarSurfaceGeometry.ts';

test('coplanar box cleanup removes duplicate pixels while preserving authored collision bounds', () => {
  const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4, .5, 4), material);
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(1, .025, 4), material);
  inlay.position.y = .2375; root.add(floor, inlay);
  floor.geometry.computeBoundingBox(); inlay.geometry.computeBoundingBox();
  const before = [floor.geometry.boundingBox!.clone(), inlay.geometry.boundingBox!.clone()];
  let disposed = 0; floor.geometry.addEventListener('dispose', () => disposed++);
  try {
    assert.ok(auditOpaqueSurfaces(root).conflicts.length > 0);
    repairStaticBoxSurfaces(root, () => true);
    assert.equal(auditOpaqueSurfaces(root, .00001).conflicts.length, 0);
    assert.equal(disposed, 1, 'replaced authoring buffer is released immediately');
    assert.ok(floor.geometry.boundingBox!.equals(before[0]!));
    assert.ok(inlay.geometry.boundingBox!.equals(before[1]!));
    assert.ok([...floor.geometry.attributes.uv.array].every(Number.isFinite));
  } finally { floor.geometry.dispose(); inlay.geometry.dispose(); material.dispose(); }
});

test('Volt tunnel joins and entrance ribs are flush; floor details no longer stand above the decks', () => {
  const scene = new BlackoutLevelScene(true, maintenanceMaps), bay = scene.maintenanceBay!;
  const bounds = (name: string) => new THREE.Box3().setFromObject(bay.root.getObjectByName(name)!);
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} must meet ${b}`);
  try {
    close(bounds('vent-turn-east-wall').min.x, bounds('vent-duct-east-wall').min.x);
    close(bounds('vent-turn-west-wall').max.x, -16.75);
    close(bounds('vent-turn-south-west').max.z, 60);
    close(bounds('vent-turn-north-east').min.z, 63);
    for (const z of [53.75, 55.5, 57.5, 59.5]) {
      close(bounds(`vent-frame-side--6.77-${z}`).max.x, -6.75);
      close(bounds(`vent-frame-side--5.23-${z}`).min.x, -5.25);
    }
    close(bounds('vent-frame-header-53.75').min.z, 53.775);
    for (const name of ['entry-warning--1.5', 'entry-warning-6.3', 'exit-warning-48.4', 'exit-warning-52.8',
      'entry-apron-riser-west', 'entry-apron-riser-east']) close(bounds(name).max.y, 0);
    const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
    world.registerAll(bay.collisionMeshes); surfaces.registerAll(bay.collisionMeshes);
    for (const x of [-12, 12]) {
      const body = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(x, .46, 5.5) });
      for (let i = 0; i < 120 && body.position.z < 8.2; i++) body.update(1 / 60, new THREE.Vector3(0, 0, 1));
      assert.ok(body.position.z >= 8.2 && body.grounded, 'both raised apron lips are now crossed without a jump');
      assert.equal(body.lastJumpChargeFraction, 0); assert.ok(body.position.y < .461);
    }
    world.clear(); surfaces.clear();
    const conflicts = auditOpaqueSurfaces(bay.root, .00001).conflicts.filter(c =>
      c.centre[0]! < -4 && c.centre[0]! > -17.1 && c.centre[2]! >= 53 && c.centre[2]! <= 81 &&
      c.centre[1]! >= 0 && c.centre[1]! < 5.1);
    assert.deepEqual(conflicts, [], 'the submitted tunnel skin has no duplicate opaque surfaces');
    const portal = auditOpaqueSurfaces(scene.root, .00001).conflicts.filter(c =>
      c.centre[0]! < -14 && c.centre[0]! > -18 && c.centre[2]! > 79 && c.centre[2]! < 81 && c.centre[1]! > 2.1);
    assert.deepEqual(portal, [], 'the Room 1/Room 2 outlet must be audited with both room shells present');
    for (const name of ['volt-rising-duct-floor', 'volt-rising-duct-ceiling', 'volt-rising-duct-side--16.85', 'volt-rising-duct-side--15.15']) {
      const mesh = bay.root.getObjectByName(name) as THREE.Mesh;
      const vertices = mesh.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const point = mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(vertices, i));
        assert.ok(point.z >= 63 - 1e-5 && point.z <= (name.endsWith('floor') ? 80 : 79.75) + 1e-5, `${name} protrudes through its joining plane`);
      }
    }
  } finally { scene.dispose(); }
});

test('rising tunnel side walls cover the entire lower connector corner without changing collider bounds', () => {
  const scene = new BlackoutLevelScene(true, maintenanceMaps), bay = scene.maintenanceBay!;
  const authored = new THREE.BoxGeometry(.2, 2.2, Math.hypot(17, 2.58));
  authored.computeBoundingBox();
  try {
    const triangles = collectOpaqueTriangles(scene.root);
    for (const [name, wallX, direction] of [
      ['volt-rising-duct-side--16.85', -16.75, -1],
      ['volt-rising-duct-side--15.15', -15.25, 1],
    ] as const) {
      const wall = bay.root.getObjectByName(name) as THREE.Mesh;
      assert.ok(wall.geometry.boundingBox!.equals(authored.boundingBox!), 'the collision box must remain identical');
      const faces = triangles.filter(t => t.points.every(p => Math.abs(p.x - wallX) < 1e-5));
      for (const z of [63.001, 63.03, 63.08, 63.15, 63.25]) {
        const floorY = (z - 63) * 2.58 / 17;
        for (const height of [.02, .1, .35, .75, 1.05, 1.5, 2]) {
          const ray = new THREE.Ray(new THREE.Vector3(-16, floorY + height, z), new THREE.Vector3(direction, 0, 0));
          assert.ok(faces.some(t => ray.intersectTriangle(t.points[0]!, t.points[1]!, t.points[2]!, true, new THREE.Vector3())),
            `${name} has an uncovered wall corner at y=${floorY + height}, z=${z}`);
        }
      }
    }
  } finally { authored.dispose(); scene.dispose(); }
});

test('bridge starts flush across the approach deck edge and the catwalk has one rendered top', () => {
  const room = new BlackoutTransitRoom(), world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  world.registerAll(room.collisionMeshes); surfaces.registerAll(room.collisionMeshes);
  const targets = new ElectricalTargetRegistry(world);
  const controller = new BlackoutTransitController({ room, world, surfaces, electricalTargets: targets });
  try {
    for (const enemy of controller.emergingDrones) enemy.state.destroy();
    const saved = controller.capture() as any; saved.bridgeProgress = 1; saved.bridgeDeployed = true;
    controller.restore(saved); room.root.updateMatrixWorld(true);
    const anchor = room.root.getObjectByName('transit-bridge-start-anchor') as THREE.Mesh;
    const bridge = controller.root.getObjectByName('transit-deployable-bridge-deck') as THREE.Mesh<THREE.BoxGeometry>;
    const { width, height, depth } = bridge.geometry.parameters;
    for (const side of [-1, 1]) {
      const corner = anchor.worldToLocal(bridge.localToWorld(new THREE.Vector3(-width / 2, height / 2, side * depth / 2)));
      assert.ok(Math.abs(corner.x - anchor.geometry.boundingBox!.max.x) < 1e-7, 'ramp begins at the deck edge, not under its centre');
      assert.ok(Math.abs(corner.y - anchor.geometry.boundingBox!.max.y) < 1e-7);
      assert.ok(Math.abs(corner.z) < anchor.geometry.boundingBox!.max.z);
    }
    const overlaps = auditOpaqueSurfaces(room.root, .00001).conflicts.filter(c =>
      c.centre[0]! < -12 && c.centre[2]! > 130 && c.centre[2]! < 140);
    assert.deepEqual(overlaps, []);
    const savedLock = controller.capture() as any;
    savedLock.bridgeLocked = true; controller.restore(savedLock);
    const body = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(-16, 2.96, 136) });
    const direction = new THREE.Vector3();
    for (const [x, z] of [[-10, 139], [0, 146.5], [0, 151]]) {
      for (let i = 0; i < 360; i++) {
        if (Math.hypot(body.position.x - x, body.position.z - z) < .18 && body.grounded) break;
        direction.set(x - body.position.x, 0, z - body.position.z).normalize(); body.update(1 / 60, direction);
      }
      assert.ok(body.grounded && Math.hypot(body.position.x - x, body.position.z - z) < .2,
        'the deployed join must be walkable through to the exit without a jump');
    }
  } finally { controller.dispose(); targets.dispose(); world.clear(); surfaces.clear(); room.dispose(); }
});
