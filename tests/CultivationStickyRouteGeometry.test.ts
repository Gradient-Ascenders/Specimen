import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createCultivationStickyRouteGeometry } from '../src/render/environment/cultivation/CultivationStickyRouteGeometry.ts';

// A stepped overlap and a contained panel exercise both exposed corners and
// interior edges. Both front and back must have exactly one surface everywhere.
test('sticky route union removes duplicate faces and borders only its perimeter', () => {
  const panels = [[0, 0, 4, 4], [2, 2, 4, 4], [1, 1, 1, 1]].map(([z, y, depth, height]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.18, height, depth));
    mesh.position.set(-18.72, y, z);
    return mesh;
  });
  const geometry = createCultivationStickyRouteGeometry(panels);
  const mesh = new THREE.Mesh(geometry);
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const rim = geometry.getAttribute('membranePanel');
  let frontArea = 0, backArea = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
    const area = b.sub(a).cross(c.sub(a)).length() / 2;
    if (normals.getX(i) > .5) frontArea += area;
    if (normals.getX(i) < -.5) backArea += area;
  }
  assert.ok(Math.abs(frontArea - 28) < 1e-4, 'front area is the union, not the sum of overlapping boxes');
  assert.ok(Math.abs(backArea - 28) < 1e-4);
  for (const side of [-1, 1]) for (const [u, v, expected] of [[1.123, 1.234, 1], [-1.123, -1.234, 1],
    [3.123, 3.234, 1], [-1.123, 3.234, 0], [3.123, -1.234, 0]]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(-18.72 + side * 2, v, u), new THREE.Vector3(-side, 0, 0));
    assert.equal(ray.intersectObject(mesh).length, expected, 'no duplicate surface or filled-in concave corner');
  }
  for (let i = 0; i < positions.count; i++) {
    if (Math.abs(normals.getX(i)) < .5) continue;
    const u = positions.getZ(i), v = positions.getY(i);
    if (Math.abs(u) < 1e-5 && v > .5 && v < 1.5) assert.ok(rim.getX(i) >= .5, 'buried panel edge has no border');
    if (Math.abs(u + 2) < 1e-5) assert.equal(rim.getX(i), 0, 'exterior edge receives the border');
  }
  geometry.dispose(); mesh.material.dispose();
  for (const panel of panels) { panel.geometry.dispose(); (panel.material as THREE.Material).dispose(); }
});
