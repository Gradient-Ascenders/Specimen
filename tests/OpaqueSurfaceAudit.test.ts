import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { auditOpaqueSurfaces } from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import { createCoplanarSurfaceRepairs } from '../src/render/geometry/CoplanarSurfaceGeometry.ts';

const opaque = () => new THREE.MeshBasicMaterial();
const plane = (x = 0, z = 0) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), opaque()); mesh.position.set(x, 0, z); return mesh; };

test('audit catches coplanar and nearby positive coverage, excluding edges, hidden surfaces and opposite front faces', () => {
  const root = new THREE.Group(), a = plane(), b = plane(1, .001);
  a.name = 'a'; b.name = 'b'; root.add(a, b);
  let report = auditOpaqueSurfaces(root);
  assert.equal(report.conflicts.length, 1);
  assert.ok(Math.abs(report.conflicts[0].area - 2) < 1e-6);
  b.rotation.y = .00007; assert.equal(auditOpaqueSurfaces(root).conflicts.length, 1, 'nearly parallel faces across normal bins');
  b.rotation.y = 0; b.scale.x = -1; assert.equal(auditOpaqueSurfaces(root).conflicts.length, 1, 'mirrored instance winding');
  b.scale.x = 1;
  b.position.z = .02; assert.equal(auditOpaqueSurfaces(root).conflicts.length, 0);
  b.position.set(2, 0, 0); assert.equal(auditOpaqueSurfaces(root).conflicts.length, 0);
  b.position.set(1, 0, 0); b.rotation.y = Math.PI;
  assert.equal(auditOpaqueSurfaces(root).conflicts.length, 0);
  b.material.side = THREE.DoubleSide; assert.equal(auditOpaqueSurfaces(root).conflicts.length, 1);
  b.material.visible = false; assert.equal(auditOpaqueSurfaces(root).conflicts.length, 0);
  b.material.visible = true; b.material.colorWrite = false; assert.equal(auditOpaqueSurfaces(root).conflicts.length, 0);
  b.material.colorWrite = true; root.visible = false; assert.equal(auditOpaqueSurfaces(root).triangleCount, 0);
});

test('audit inspects material groups, draw ranges, instances and overlaps inside one batch', () => {
  const root = new THREE.Group();
  const a = new THREE.PlaneGeometry(2, 2), b = a.clone().translate(1, 0, 0);
  const mesh = new THREE.Mesh(mergeGeometries([a, b], true)!, [opaque(), opaque()]); root.add(mesh);
  assert.equal(auditOpaqueSurfaces(root).conflicts.length, 1);
  mesh.geometry.setDrawRange(0, 6); assert.equal(auditOpaqueSurfaces(root).conflicts.length, 0);
  mesh.geometry.setDrawRange(0, Infinity); mesh.material[1].transparent = true;
  assert.equal(auditOpaqueSurfaces(root).conflicts.length, 0);
  root.clear();
  const instances = new THREE.InstancedMesh(a, opaque(), 2);
  instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 0)); root.add(instances);
  assert.equal(auditOpaqueSurfaces(root).conflicts.length, 1);
  instances.count = 1; assert.equal(auditOpaqueSurfaces(root).conflicts.length, 0);
});

test('repair preserves union coverage and UV/custom interpolants through transformed cuts', () => {
  const root = new THREE.Group(), a = plane(), b = plane(.75);
  root.position.set(12, -5, 30); root.rotation.set(.2, .7, -.15);
  root.add(a, b);
  for (const mesh of [a, b]) mesh.geometry.setAttribute('custom', mesh.geometry.getAttribute('uv').clone());
  const originals = [a.geometry, b.geometry];
  const repairs = createCoplanarSurfaceRepairs(root, () => root);
  assert.ok(repairs.size > 0);
  for (const [mesh, geometry] of repairs) mesh.geometry = geometry as THREE.PlaneGeometry;
  assert.equal(auditOpaqueSurfaces(root).conflicts.length, 0);
  for (const [mesh, geometry] of repairs) {
    const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), custom = geometry.getAttribute('custom');
    for (let i = 0; i < p.count; i++) {
      assert.ok(Math.abs(uv.getX(i) - (p.getX(i) + 1) / 2) < 1e-5);
      assert.ok(Math.abs(uv.getY(i) - (p.getY(i) + 1) / 2) < 1e-5);
      assert.equal(custom.getX(i), uv.getX(i));
    }
    assert.notEqual(geometry, originals[[a, b].indexOf(mesh as typeof a)]);
  }
  root.updateMatrixWorld(true);
  for (const x of [-.913, -.137, .613, 1.613]) {
    const origin = root.localToWorld(new THREE.Vector3(x, .173, 2));
    const direction = new THREE.Vector3(0, 0, -1).transformDirection(root.matrixWorld);
    assert.equal(new THREE.Raycaster(origin, direction).intersectObjects([a, b]).length, 1, 'exactly one surface across the entire union');
  }
});

test('independently moving or hidden domains are not permanently clipped against each other', () => {
  const root = new THREE.Group(), a = plane(), b = plane(.5); root.add(a, b);
  assert.equal(createCoplanarSurfaceRepairs(root, mesh => mesh).size, 0);
  b.visible = false; assert.equal(createCoplanarSurfaceRepairs(root, () => root).size, 0);
});
