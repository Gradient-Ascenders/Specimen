import * as THREE from 'three';

import {
  resolveWallJumpBasis,
  resolveWallJumpTangent,
} from '../physics/WallJumpBasis';

const EPSILON = 1e-8;

interface RegressionCase {
  readonly name: string;
  readonly normal: THREE.Vector3;
}

const REPRESENTATIVE_WALLS: readonly RegressionCase[] = [
  { name: '+X', normal: new THREE.Vector3(1, 0, 0) },
  { name: '-X', normal: new THREE.Vector3(-1, 0, 0) },
  { name: '+Z', normal: new THREE.Vector3(0, 0, 1) },
  { name: '-Z', normal: new THREE.Vector3(0, 0, -1) },
  {
    name: 'tilted +X/+Z',
    normal: new THREE.Vector3(1, 0.2, 1).normalize(),
  },
  {
    name: 'tilted -X/+Z',
    normal: new THREE.Vector3(-1, -0.15, 1).normalize(),
  },
];

// These headings document the camera orientations the invariant is expected to
// survive. The resolver intentionally receives none of them: cardinal wall
// jump intent must not depend on camera heading at all.
const REPRESENTATIVE_CAMERA_HEADINGS_RADIANS = [
  0,
  Math.PI * 0.5,
  Math.PI,
  Math.PI * 1.5,
] as const;

const wallUp = new THREE.Vector3();
const wallRight = new THREE.Vector3();
const tangent = new THREE.Vector3();
const firstTangent = new THREE.Vector3();

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function vectorsApproximatelyEqual(
  a: THREE.Vector3,
  b: THREE.Vector3,
): boolean {
  return (
    approximatelyEqual(a.x, b.x) &&
    approximatelyEqual(a.y, b.y) &&
    approximatelyEqual(a.z, b.z)
  );
}

/**
 * Dependency-free development regression for the directional wall-jump basis.
 *
 * This lives in the existing browser harness instead of importing `node:test`,
 * because the project does not currently include Node test typings.
 */
export function runWallJumpBasisRegression(): string {
  try {
    for (const wall of REPRESENTATIVE_WALLS) {
      assert(
        resolveWallJumpBasis(
          wall.normal,
          wallUp,
          wallRight,
        ),
        `${wall.name}: could not resolve wall basis`,
      );

      // W must always point wall-up and remain tangent to the wall.
      assert(
        resolveWallJumpTangent(
          wall.normal,
          { lateral: 0, vertical: 1 },
          tangent,
          wallUp,
          wallRight,
        ),
        `${wall.name}: W did not resolve`,
      );
      assert(
        tangent.y > 0,
        `${wall.name}: W did not point upward`,
      );
      assert(
        Math.abs(tangent.dot(wall.normal)) <= EPSILON,
        `${wall.name}: W was not tangent to wall`,
      );
      firstTangent.copy(tangent);

      // S must be exactly the opposite wall tangent.
      assert(
        resolveWallJumpTangent(
          wall.normal,
          { lateral: 0, vertical: -1 },
          tangent,
          wallUp,
          wallRight,
        ),
        `${wall.name}: S did not resolve`,
      );
      assert(
        vectorsApproximatelyEqual(
          tangent,
          firstTangent.clone().multiplyScalar(-1),
        ),
        `${wall.name}: S was not opposite W`,
      );

      // D/A must be opposite lateral wall tangents.
      assert(
        resolveWallJumpBasis(
          wall.normal,
          wallUp,
          wallRight,
        ),
        `${wall.name}: could not rebuild wall basis`,
      );
      firstTangent.copy(wallRight);

      assert(
        resolveWallJumpTangent(
          wall.normal,
          { lateral: 1, vertical: 0 },
          tangent,
          wallUp,
          wallRight,
        ),
        `${wall.name}: D did not resolve`,
      );
      assert(
        vectorsApproximatelyEqual(tangent, firstTangent),
        `${wall.name}: D was not wall-lateral`,
      );

      assert(
        resolveWallJumpTangent(
          wall.normal,
          { lateral: -1, vertical: 0 },
          tangent,
          wallUp,
          wallRight,
        ),
        `${wall.name}: A did not resolve`,
      );
      assert(
        vectorsApproximatelyEqual(
          tangent,
          firstTangent.clone().multiplyScalar(-1),
        ),
        `${wall.name}: A was not opposite D`,
      );

      // Cardinal output must be identical for representative camera headings.
      // The heading is intentionally not supplied to the resolver; this loop
      // protects that contract if the implementation is later refactored.
      let reference = new THREE.Vector3();
      let haveReference = false;

      for (const _cameraHeading of REPRESENTATIVE_CAMERA_HEADINGS_RADIANS) {
        assert(
          resolveWallJumpTangent(
            wall.normal,
            { lateral: 0, vertical: 1 },
            tangent,
            wallUp,
            wallRight,
          ),
          `${wall.name}: W failed under camera-heading invariant check`,
        );

        if (!haveReference) {
          reference.copy(tangent);
          haveReference = true;
        } else {
          assert(
            vectorsApproximatelyEqual(tangent, reference),
            `${wall.name}: W changed with camera heading`,
          );
        }
      }
    }

    return [
      'PASS',
      `${REPRESENTATIVE_WALLS.length} wall normals`,
      `${REPRESENTATIVE_CAMERA_HEADINGS_RADIANS.length} camera headings`,
      'W/S vertical, A/D lateral',
    ].join(' — ');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return `FAIL — ${message}`;
  }
}
