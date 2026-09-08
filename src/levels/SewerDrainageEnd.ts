import * as THREE from 'three';
import type { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';

/** Recessed circular culvert: an actual opening, bars, and a dark tunnel behind it. */
export function addSewerDrainageEnd(b: GreyboxRoomBuilder, z: number, outward: number): void {
  const radius = 3.7, centreY = -8.3;
  const stone = new THREE.MeshStandardMaterial({ color: 0x323632, roughness: 1 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x65422d, roughness: .94, metalness: .45 });
  const collisionOnly = new THREE.MeshBasicMaterial({ visible: false });
  const shape = new THREE.Shape();
  shape.moveTo(-10, -4); shape.lineTo(10, -4); shape.lineTo(10, 7); shape.lineTo(-10, 7); shape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, radius, 0, Math.PI * 2, true); shape.holes.push(hole);
  const face = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .8, bevelEnabled: false, curveSegments: 48 }), stone);
  face.position.set(40, centreY, z - (outward < 0 ? .8 : 0)); face.name = `room-5-drainage-wall-${z}`; b.root.add(face);
  // Custom collision uses boxes, so surround the hole instead of registering its bounding box.
  for (const x of [33.15, 46.85]) b.addCollider({ name: `room-5-drainage-shoulder-${z}-${x}`,
    size: [6.3, 11, .8], position: [x, -6.5, z], material: collisionOnly });
  b.addCollider({ name: `room-5-drainage-header-${z}`, size: [7.4, 3.6, .8], position: [40, -2.8, z], material: collisionOnly });
  // Recess the grate rather than sticking bars onto a flat wall.
  const grateZ = z + outward * 1.2;
  // A closed grate is not a traversable tunnel. The continuous blocker also
  // covers the curved rim and gaps below the shortened outer bars.
  b.addCollider({ name: `room-5-drainage-solid-grate-${z}`, size: [7.8, 8, .6],
    position: [40, centreY, z + outward * .05], material: collisionOnly });
  for (let i = -4; i <= 4; i++) {
    const x = i * .72, height = 2 * Math.sqrt(radius * radius - x * x);
    const bar = b.addCollider({ name: `room-5-drainage-bar-${z}-${i}`, size: [.24, height, .25],
      position: [40 + x, centreY, grateZ], material: iron });
    bar.userData.textureRole = 'rusted-iron-grate';
  }
  b.addCollider({ name: `room-5-drainage-crossbar-${z}`, size: [7.1, .18, .28], position: [40, -9.8, grateZ], material: iron });
  for (const depth of [.05, 1.2, 4, 8, 12]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, .18, 8, 48), iron);
    rim.position.set(40, centreY, z + outward * depth); rim.name = `room-5-drainage-rim-${z}-${depth}`; b.root.add(rim);
  }
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 15, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x202821, roughness: 1, side: THREE.BackSide }));
  tunnel.rotation.x = Math.PI / 2; tunnel.position.set(40, centreY, z + outward * 7.5); b.root.add(tunnel);
  const darkness = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color: 0x010403, side: THREE.DoubleSide }));
  darkness.position.set(40, centreY, z + outward * 15); b.root.add(darkness);
  b.addCollider({ name: `room-5-drainage-water-${z}`, size: [7.4, .5, 15], position: [40, -12.25, z + outward * 7.5], material: b.materials.acid });
  for (const x of [36.1, 43.9]) b.addCollider({ name: `room-5-drainage-side-${z}-${x}`, size: [.4, 8, 15], position: [x, -8, z + outward * 7.5], material: collisionOnly });
  b.addCollider({ name: `room-5-drainage-end-stop-${z}`, size: [8, 8, .4], position: [40, -8, z + outward * 15], material: collisionOnly });
  b.addLight(`room-5-drainage-depth-light-${z}`, [40, -7, z + outward * 6], 0x5b795c, 8, 10);
}
