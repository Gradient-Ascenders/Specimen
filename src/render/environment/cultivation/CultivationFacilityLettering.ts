import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The same narrow painted facility lettering on both Cultivation passages. */
export function createCultivationFacilityLettering(
  text: string, height: number, at: readonly [number, number, number], yaw: number,
): THREE.BufferGeometry {
  const transform = new THREE.Matrix4().makeRotationY(yaw).setPosition(...at);
  const strokes: THREE.BufferGeometry[] = [];
  for (const [i, letter] of [...text].entries()) for (const [ax, ay, bx, by] of GLYPHS[letter] ?? []) {
    const a = new THREE.Vector2((i * .76 + ax * .6) * height, ay * height);
    const b = new THREE.Vector2((i * .76 + bx * .6) * height, by * height);
    const geometry = new THREE.PlaneGeometry(a.distanceTo(b), height * .065);
    geometry.rotateZ(Math.atan2(b.y - a.y, b.x - a.x)).translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0).applyMatrix4(transform);
    strokes.push(geometry);
  }
  const result = mergeGeometries(strokes, false);
  for (const stroke of strokes) stroke.dispose();
  if (!result) throw new Error('Cannot create Cultivation facility lettering.');
  return result;
}

const GLYPHS: Readonly<Record<string, readonly (readonly [number, number, number, number])[]>> = {
  '0': [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]],
  '2': [[0, 1, 1, 1], [1, 1, 1, .6], [1, .6, 0, 0], [0, 0, 1, 0]],
  '3': [[0, 1, 1, 1], [1, 1, 1, 0], [1, 0, 0, 0], [.25, .5, 1, .5]],
  A: [[0, 0, .5, 1], [.5, 1, 1, 0], [.23, .42, .77, .42]],
  C: [[1, 1, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0]],
  D: [[0, 0, 0, 1], [0, 1, .7, 1], [.7, 1, 1, .75], [1, .75, 1, .25], [1, .25, .7, 0], [.7, 0, 0, 0]],
  E: [[1, 1, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0], [0, .5, .8, .5]],
  F: [[0, 0, 0, 1], [0, 1, 1, 1], [0, .5, .8, .5]],
  I: [[.5, 0, .5, 1]],
  L: [[0, 1, 0, 0], [0, 0, 1, 0]],
  N: [[0, 0, 0, 1], [0, 1, 1, 0], [1, 0, 1, 1]],
  O: [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]],
  R: [[0, 0, 0, 1], [0, 1, 1, 1], [1, 1, 1, .55], [1, .55, 0, .55], [.4, .55, 1, 0]],
  S: [[1, 1, 0, 1], [0, 1, 0, .5], [0, .5, 1, .5], [1, .5, 1, 0], [1, 0, 0, 0]],
  T: [[0, 1, 1, 1], [.5, 1, .5, 0]],
  U: [[0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 1, 1]],
  V: [[0, 1, .5, 0], [.5, 0, 1, 1]],
};
