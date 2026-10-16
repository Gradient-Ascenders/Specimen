import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';

test('exit landing surfaces share a 0.4 m top with butt joints instead of overlapping tops', () => {
  const room = new BlackoutTransitRoom();
  try {
    const bounds = (name: string) => new THREE.Box3().setFromObject(room.root.getObjectByName(name)!);
    const anchor = bounds('transit-bridge-end-anchor');
    const deck = bounds('transit-room-3-exit-deck');
    const apron = bounds('transit-exit-left-apron');
    const hall = bounds('transit-exit-hallway-floor');
    for (const box of [anchor, deck, apron, hall]) assert.ok(Math.abs(box.max.y - .4) < 1e-6);
    assert.equal(anchor.max.z, deck.min.z);
    assert.equal(deck.max.z, hall.min.z);
    assert.equal(deck.max.x, apron.min.x);
    const ramp = room.root.getObjectByName('goop-acid-exit-ramp') as THREE.Mesh;
    ramp.updateWorldMatrix(true, false);
    const vertices = ramp.geometry.getAttribute('position');
    const top = Array.from({ length: vertices.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(vertices, i))
      .filter(v => Math.abs(v.y) < 1e-6).map(v => v.applyMatrix4(ramp.matrixWorld));
    assert.ok(top.some(v => Math.abs(v.z - 150) < 1e-5 && Math.abs(v.y - .4) < 1e-5));
    assert.ok(top.some(v => Math.abs(v.z - 140) < 1e-5 && Math.abs(v.y + .98) < 1e-5));
  } finally { room.dispose(); }
});

test('crate straps stand clear of wood faces and each other; frame guides clear the jambs', () => {
  const room = new BlackoutTransitRoom();
  try {
    const bounds = (name: string) => new THREE.Box3().setFromObject(room.root.getObjectByName(name)!);
    const crate = bounds('transit-exit-door-prop-crate');
    const door = bounds('transit-exit-half-raised-door');
    assert.ok(Math.abs(crate.max.y - door.min.y) < 1e-6, 'wood still physically props up the shutter');
    const details: THREE.Box3[] = [];
    room.root.traverse(o => {
      if (/^transit-exit-crate-(band|corner|diagonal|shipping)/.test(o.name)) {
        const b = new THREE.Box3().setFromObject(o);
        assert.ok(b.max.z < crate.min.z || b.min.z > crate.max.z, o.name);
        details.push(b);
      }
    });
    for (let i = 0; i < details.length; i++) for (let j = i + 1; j < details.length; j++) {
      const intersection = details[i]!.clone().intersect(details[j]!);
      if (!intersection.isEmpty()) {
        const size = intersection.getSize(new THREE.Vector3());
        assert.ok(size.x * size.y * size.z < 1e-9, 'crate details must not intersect');
      }
    }
    for (const sign of [-1, 1]) {
      const jamb = bounds(`transit-exit-door-jamb-${sign}`);
      const guide = bounds(`transit-exit-door-guide-${sign}`);
      assert.ok(guide.max.z < jamb.min.z);
      const wall = bounds(`transit-exit-hallway-wall-${sign}`);
      assert.ok(wall.min.z >= jamb.max.z - 1e-6);
    }
    const lintel = bounds('transit-exit-door-lintel');
    const header = bounds('transit-exit-wall-header');
    const ceiling = bounds('transit-exit-hallway-ceiling');
    assert.ok(header.min.y >= lintel.max.y - 1e-6);
    assert.ok(ceiling.min.z >= lintel.max.z - 1e-6);
  } finally { room.dispose(); }
});

