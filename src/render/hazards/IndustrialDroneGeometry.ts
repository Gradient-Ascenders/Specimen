import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SecurityDroneConfig } from '../../hazards/SecurityDrone.ts';

type Role = 'armour' | 'armourShadow' | 'mechanism' | 'barrel' | 'mount' | 'linkage';
type Triple = [number, number, number];

/** Room 3 sentry parts, merged by finish and shared by drones of the same size. */
export function createIndustrialDroneGeometry(config: SecurityDroneConfig, role: Role): THREE.BufferGeometry {
  const { x: w, y: h, z: d } = config.colliderSize;
  const s = Math.min(w, h, d), parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, at: Triple, rotate: Triple = [0, 0, 0]) => {
    geometry.rotateX(rotate[0]); geometry.rotateY(rotate[1]); geometry.rotateZ(rotate[2]);
    geometry.translate(...at);
    if (geometry.index) { parts.push(geometry.toNonIndexed()); geometry.dispose(); }
    else parts.push(geometry);
  };
  const box = (size: Triple, at: Triple, radius = s * .035, rotate?: Triple) =>
    add(new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map(v => v / 3))), at, rotate);
  const cylinder = (radius: number, length: number, at: Triple, axis: 'x' | 'y' | 'z' = 'y', open = false) =>
    add(new THREE.CylinderGeometry(radius, radius, length, 12, 1, open), at,
      axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]);
  const ring = (radius: number, thickness: number, at: Triple, axis: 'x' | 'z' = 'z') =>
    add(new THREE.TorusGeometry(radius, thickness, 5, 16), at, axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0]);

  switch (role) {
    case 'armour':
      // Chamfered main casing, divided brow and separate lower cheek plates.
      box([w * .61, h * .61, d * .55], [0, h * .035, d * .07], s * .12);
      for (const side of [-1, 1]) {
        box([w * .31, h * .12, d * .57], [side * w * .166, h * .30, -d * .015], s * .04, [0, 0, side * -.075]);
        box([w * .18, h * .13, d * .25], [side * w * .20, -h * .26, -d * .12], s * .04);
      }
      break;
    case 'armourShadow':
      for (const side of [-1, 1]) {
        // Armored receivers, exposed pivot caps and a slim rear exhaust collar.
        box([w * .19, h * .34, d * .43], [side * w * .385, -h * .025, -d * .08], s * .065);
        cylinder(s * .14, w * .05, [side * w * .49, 0, -d * .03], 'x');
        box([w * .065, h * .17, d * .28], [side * w * .26, -h * .04, d * .34]);
      }
      // Protective bezel is metal; the state-controlled light remains separate.
      ring(s * .145, s * .027, [0, 0, -d * .495]);
      box([w * .49, h * .08, d * .065], [0, h * .17, -d * .345]);
      break;
    case 'mechanism':
      box([w * .51, h * .37, d * .16], [0, 0, -d * .245], s * .075);
      cylinder(s * .18, d * .17, [0, 0, -d * .40], 'z');
      for (const side of [-1, 1]) {
        cylinder(s * .12, w * .15, [side * w * .29, 0, -.03 * d], 'x');
        for (let n = 0; n < 4; n++) {
          box([w * .14, h * .018, d * .025], [side * w * .19, h * (.02 + n * .055), d * .354], s * .004);
          box([w * .022, h * .02, d * .19], [side * w * (.34 + n * .025), h * .151, -d * .07], s * .003);
        }
        for (const y of [-.17, .18]) cylinder(s * .024, d * .025, [side * w * .22, y * h, -d * .335], 'z');
      }
      break;
    case 'barrel':
      for (const side of [-1, 1]) {
        const x = side * w * .36;
        cylinder(s * .076, d * .34, [x, 0, -d * .41], 'z', true);
        cylinder(s * .10, d * .09, [x, 0, -d * .30], 'z');
        ring(s * .077, s * .017, [x, 0, -d * .58]);
        // Recessed bore, with a short internal wall rather than a flat muzzle cap.
        cylinder(s * .055, d * .07, [x, 0, -d * .55], 'z', true);
        cylinder(s * .054, d * .008, [x, 0, -d * .49], 'z');
        for (const z of [-.36, -.43]) ring(s * .078, s * .011, [x, 0, z * d]);
      }
      break;
    case 'mount':
      if (config.type === 'ground') {
        cylinder(w * .135, h * .12, [0, -h * .33, d * .07]);
        for (const [x, z] of [[-.30, .25], [.30, .25], [0, -.29]]) {
          box([w * .16, h * .10, d * .24], [x * w, -h * .45, z * d], s * .035);
          box([w * .10, h * .055, d * .18], [x * w, -h * .395, z * d]);
        }
      } else {
        box([w * .40, h * .14, d * .35], [0, h * .61, d * .07]);
        for (const side of [-1, 1]) box([w * .075, h * .27, d * .26], [side * w * .19, h * .44, d * .07]);
      }
      break;
    case 'linkage': {
      const ground = config.type === 'ground', direction = ground ? -1 : 1;
      cylinder(s * .105, h * .20, [0, direction * h * (ground ? .27 : .36), d * .07]);
      for (let n = 0; n < 3; n++) cylinder(s * .12, h * .035, [0, direction * h * ((ground ? .21 : .28) + n * .045), d * .07]);
      if (ground) {
        for (const [x, z] of [[-.30, .25], [.30, .25], [0, -.29]]) {
          const start = new THREE.Vector3(0, -h * .33, d * .07);
          const end = new THREE.Vector3(x * w, -h * .42, z * d);
          const delta = end.clone().sub(start);
          const rod = new THREE.CylinderGeometry(s * .045, s * .055, delta.length(), 8);
          rod.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
          add(rod, start.add(end).multiplyScalar(.5).toArray() as Triple);
        }
      } else {
        cylinder(s * .13, w * .42, [0, h * .34, d * .07], 'x');
        for (const side of [-1, 1]) ring(s * .11, s * .02, [side * w * .23, h * .34, d * .07], 'x');
      }
      break;
    }
  }
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (!geometry) throw new Error(`Unable to build industrial drone ${role}`);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
