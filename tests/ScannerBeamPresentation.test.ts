import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CollisionWorld, CollisionLayer, ColliderTransformMode } from '../src/physics/CollisionWorld.ts';
import { ScannerBeamPresentation, SCANNER_BEAMS_PER_FRAME } from '../src/render/hazards/ScannerBeamPresentation.ts';

function fixture(count = 1) {
  const world = new CollisionWorld(), root = new THREE.Group(), blockerParent = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 30, .4));
  wall.position.z = 5; blockerParent.add(wall); world.register(wall, CollisionLayer.LineOfSight);
  const ignored = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1));
  const camera = new THREE.PerspectiveCamera(100, 1, .1, 100);
  camera.position.set(0, 0, -10); camera.lookAt(0, 0, 10);
  const beams = Array.from({ length: count }, () => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(4, 10, 24, 1, true).translate(0, -5, 0),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: .1 }));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1));
    root.add(mesh); return { mesh, enabled: true };
  });
  const presentation = new ScannerBeamPresentation(world, beams.map(b => ({
    mesh: b.mesh, ignoredCollider: ignored, enabled: () => b.enabled,
  })));
  let sweeps = 0, snapshots = 0;
  const sweep = world.sweepSphere.bind(world), revision = world.getLineOfSightRevision.bind(world);
  world.sweepSphere = (...args) => { sweeps++; return sweep(...args); };
  world.getLineOfSightRevision = () => { snapshots++; return revision(); };
  return { world, root, wall, blockerParent, camera, beams, presentation,
    update(dt = .1) { sweeps = snapshots = 0; presentation.update(dt, camera); return { sweeps, snapshots }; },
    dispose() { world.clear(); wall.geometry.dispose(); ignored.geometry.dispose();
      for (const { mesh } of beams) { mesh.geometry.dispose(); mesh.material.dispose(); } },
  };
}
const furthestZ = (mesh: THREE.Mesh) => {
  mesh.updateWorldMatrix(true, false);
  const p = mesh.geometry.getAttribute('position'), v = new THREE.Vector3();
  let max = -Infinity;
  for (let i = 0; i < p.count; i++) max = Math.max(max, v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).z);
  return max;
};

test('clips partial cover with 24 unique edges, caches unchanged poses, and respects cadence', () => {
  const f = fixture();
  try {
    assert.deepEqual(f.update(), { sweeps: 24, snapshots: 1 });
    assert.ok(furthestZ(f.beams[0].mesh) < 5);
    assert.equal(f.update(1).sweeps, 0, 'unchanged beam/blocker stays cached');
    f.blockerParent.position.z = 2;
    assert.equal(f.update(.01).sweeps, 24, 'moved parent invalidates after elapsed cadence');
    assert.ok(furthestZ(f.beams[0].mesh) > 6);
    f.blockerParent.position.z = 1;
    assert.equal(f.update(.05).sweeps, 0);
    assert.equal(f.update(.05).sweeps, 24);
    f.wall.visible = false;
    assert.equal(f.update().sweeps, 24);
    assert.ok(furthestZ(f.beams[0].mesh) > 9.9);
    f.wall.visible = true; f.world.setLayerMask(f.wall, CollisionLayer.Movement);
    f.update(); assert.ok(furthestZ(f.beams[0].mesh) > 9.9);
    f.world.setLayerMask(f.wall, CollisionLayer.LineOfSight);
    f.update(); assert.ok(furthestZ(f.beams[0].mesh) < 6);
    f.world.unregister(f.wall); f.update(); assert.ok(furthestZ(f.beams[0].mesh) > 9.9);
    f.world.register(f.wall, CollisionLayer.LineOfSight, ColliderTransformMode.Static);
    f.update(); assert.ok(furthestZ(f.beams[0].mesh) < 6);
    f.wall.position.z = 3; f.world.invalidateTransform(f.wall);
    f.update(); assert.ok(furthestZ(f.beams[0].mesh) < 4);
  } finally { f.dispose(); }
});

test('off-scope, disabled, transparent, camera-layer and off-frustum beams perform no collision work', () => {
  const f = fixture();
  try {
    f.update();
    for (const [hide, show] of [
      [() => { f.root.visible = false; }, () => { f.root.visible = true; }],
      [() => { f.beams[0].enabled = false; }, () => { f.beams[0].enabled = true; }],
      [() => { f.beams[0].mesh.material.opacity = 0; }, () => { f.beams[0].mesh.material.opacity = .1; }],
      [() => { f.camera.layers.set(1); }, () => { f.camera.layers.set(0); }],
      [() => { f.camera.lookAt(0, 0, -50); }, () => { f.camera.lookAt(0, 0, 10); }],
    ]) {
      hide(); assert.deepEqual(f.update(), { sweeps: 0, snapshots: 0 });
      assert.equal(f.beams[0].mesh.visible, false);
      f.wall.position.z = 4;
      show(); assert.equal(f.update(0).sweeps, 24, 'entry bypasses cadence and refreshes before drawing');
      assert.ok(furthestZ(f.beams[0].mesh) < 4);
    }
    f.presentation.reset(); assert.equal(f.beams[0].mesh.visible, false);
    assert.equal(f.update(0).sweeps, 24, 'reset cannot expose cached geometry');
  } finally { f.dispose(); }
});

test('one draw has a strict two-cone budget even with long deltas, with fair recovery of nine new beams', () => {
  const f = fixture(9);
  try {
    for (let i = 0; i < 5; i++) {
      assert.ok(f.update(.1).sweeps <= SCANNER_BEAMS_PER_FRAME * 24);
      assert.equal(f.beams.filter(b => b.mesh.visible).length, Math.min(9, (i + 1) * 2));
    }
    f.presentation.reset();
    assert.equal(f.update(10).sweeps, 48, 'no catch-up loop for missed visual samples');
    assert.equal(f.beams.filter(b => b.mesh.visible).length, 2);
  } finally { f.dispose(); }
});

test('unclipped bounds allow re-entry and full world transforms preserve clipping under a transformed room', () => {
  const f = fixture();
  try {
    f.root.position.z = 2; f.root.rotation.z = .5; f.root.scale.set(1.2, .8, 1.5);
    assert.equal(f.update().sweeps, 24);
    assert.ok(furthestZ(f.beams[0].mesh) < 5);
    // A close blocker makes the cached cone tiny; visibility still uses its full original volume.
    f.wall.position.z = 2.5; f.update();
    f.camera.position.set(6, 0, 8); f.camera.lookAt(0, 0, 12);
    f.wall.visible = false;
    assert.equal(f.update().sweeps, 24);
    assert.ok(furthestZ(f.beams[0].mesh) > 10);
  } finally { f.dispose(); }
});
