import * as THREE from 'three';

/** Borrow an unparented retained camera for a synchronous rehearsal draw.
 * Identity/children stay owned by the camera rig; no borrowed pose survives an await. */
export function withRetainedCameraView<T>(
  camera: THREE.PerspectiveCamera,
  view: THREE.PerspectiveCamera,
  action: (camera: THREE.PerspectiveCamera) => T,
): T {
  const saved = new THREE.PerspectiveCamera().copy(camera, false);
  // Three.copy covers transforms, matrices, projection, layers and update flags,
  // but not viewport. Preserve the rig's metadata/reference ownership as well.
  const { viewport, userData, animations, pivot, view: viewOffset } = camera;
  try {
    camera.copy(view, false);
    camera.viewport = view.viewport?.clone();
    return action(camera);
  } finally {
    camera.copy(saved, false);
    Object.assign(camera, { viewport, userData, animations, pivot, view: viewOffset });
  }
}
