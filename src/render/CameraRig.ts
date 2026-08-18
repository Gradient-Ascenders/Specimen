import * as THREE from 'three';

export const CAMERA_VERTICAL_FOV_DEGREES = 48;
export const CAMERA_NEAR_PLANE_METRES = 0.1;
export const CAMERA_FAR_PLANE_METRES = 200;

const REFERENCE_ASPECT = 16 / 9;
const TEST_TARGET = new THREE.Vector3(0, 0.5, 1.5);
const TEST_OFFSET = new THREE.Vector3(17, 12.5, 18.5);

/**
 * Owns the game camera and its temporary grey-box framing.
 *
 * This is deliberately not a follow camera. Narrow viewports move the same
 * fixed test view backwards so the collision cases stay visible without
 * changing perspective or stretching the image.
 */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(
    CAMERA_VERTICAL_FOV_DEGREES,
    1,
    CAMERA_NEAR_PLANE_METRES,
    CAMERA_FAR_PLANE_METRES,
  );

  private readonly framedOffset = new THREE.Vector3();

  constructor() {
    this.camera.name = 'game-perspective-camera';
    this.resize(1, 1);
  }

  resize(width: number, height: number): void {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const aspect = safeWidth / safeHeight;
    const narrowViewportScale = Math.max(1, REFERENCE_ASPECT / aspect);

    this.camera.aspect = aspect;
    this.camera.position
      .copy(TEST_TARGET)
      .add(this.framedOffset.copy(TEST_OFFSET).multiplyScalar(narrowViewportScale));
    this.camera.lookAt(TEST_TARGET);
    this.camera.updateProjectionMatrix();
  }
}
