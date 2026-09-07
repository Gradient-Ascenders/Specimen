import * as THREE from 'three';

const ISOLATED_RESOURCE_PREWARM_LAYER = 31;

/** Render only explicit resources with the camera's current visible lights. */
export function renderIsolatedPrewarmResources(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  resourceRoots: readonly THREE.Object3D[],
): void {
  const previousCameraLayers = camera.layers.mask;
  const previousResourceLayers = new Map<THREE.Object3D, number>();
  const previousResourceFrustumCulling = new Map<THREE.Object3D, boolean>();
  const previousLightLayers = new Map<THREE.Light, number>();

  for (const resourceRoot of resourceRoots) {
    resourceRoot.traverse((object) => {
      previousResourceLayers.set(object, object.layers.mask);
      previousResourceFrustumCulling.set(object, object.frustumCulled);
      object.layers.set(ISOLATED_RESOURCE_PREWARM_LAYER);
      object.frustumCulled = false;
    });
  }
  scene.traverseVisible((object) => {
    if (!(object instanceof THREE.Light) || !object.layers.test(camera.layers)) {
      return;
    }
    previousLightLayers.set(object, object.layers.mask);
    object.layers.enable(ISOLATED_RESOURCE_PREWARM_LAYER);
  });
  camera.layers.set(ISOLATED_RESOURCE_PREWARM_LAYER);

  try {
    renderer.render(scene, camera);
  } finally {
    camera.layers.mask = previousCameraLayers;
    for (const [object, layers] of previousResourceLayers) {
      object.layers.mask = layers;
    }
    for (const [object, frustumCulled] of previousResourceFrustumCulling) {
      object.frustumCulled = frustumCulled;
    }
    for (const [light, layers] of previousLightLayers) {
      light.layers.mask = layers;
    }
  }
}
