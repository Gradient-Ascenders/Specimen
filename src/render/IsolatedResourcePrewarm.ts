import * as THREE from 'three';

const ISOLATED_RESOURCE_PREWARM_LAYER = 31;

/** Keep original parents/transforms, deduplicate overlapping owners, and bound
 * each upload submission by renderable objects rather than arbitrary groups. */
export function createPrewarmResourceBatches(
  roots: readonly THREE.Object3D[],
  limit = 8,
): THREE.Object3D[][] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Prewarm batch limit must be a positive integer.');
  const seen = new Set<THREE.Object3D>(), objects: THREE.Object3D[] = [];
  for (const root of roots) root.traverse(object => {
    if (seen.has(object) || !(object instanceof THREE.Mesh || object instanceof THREE.Line ||
      object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
    seen.add(object); objects.push(object);
  });
  const batches: THREE.Object3D[][] = [];
  for (let index = 0; index < objects.length; index += limit) batches.push(objects.slice(index, index + limit));
  return batches;
}

/** Restore synchronously, even when action returns a pending compilation. */
export function withIsolatedPrewarmState<T>(
  renderer: THREE.WebGLRenderer,
  action: () => T,
  target?: THREE.WebGLRenderTarget,
): T {
  const viewport = renderer.getViewport(new THREE.Vector4());
  const scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest();
  const previousTarget = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const mip = renderer.getActiveMipmapLevel();
  const transmissionResolutionScale = renderer.transmissionResolutionScale;
  // setRenderTarget restores the viewport with floor(), unlike setViewport's
  // round(). Keep at least one physical pixel after either path at low DPR.
  const span = Math.max(1, Math.ceil(1 / (renderer.getPixelRatio?.() ?? 1)));
  const origin = target ? 0 : -2 * span;
  // frame is an internal upload-generation key; it must remain monotonic.
  const { calls, triangles, points, lines } = renderer.info.render;
  try {
    // Primers use a one-pixel viewport. Fractional transmission scale would
    // round the internal transmission framebuffer down to zero pixels.
    renderer.transmissionResolutionScale = 1;
    if (target) renderer.setRenderTarget(target);
    renderer.setViewport(origin, origin, span, span);
    renderer.setScissor(origin, origin, span, span);
    renderer.setScissorTest(true);
    return action();
  } finally {
    renderer.transmissionResolutionScale = transmissionResolutionScale;
    renderer.setRenderTarget(previousTarget, face, mip);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    Object.assign(renderer.info.render, { calls, triangles, points, lines });
  }
}

/** Render only explicit resources with the camera's current visible lights. */
export function renderIsolatedPrewarmResources(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  resourceRoots: readonly THREE.Object3D[],
  options: { readonly includeHidden?: boolean; readonly includeDescendants?: boolean } = {},
): void {
  const previousCameraLayers = camera.layers.mask;
  const previousResourceLayers = new Map<THREE.Object3D, number>();
  const previousResourceFrustumCulling = new Map<THREE.Object3D, boolean>();
  const previousLightLayers = new Map<THREE.Light, number>();
  const previousVisibility = new Map<THREE.Object3D, boolean>();
  const visibleLights = new Set<THREE.Light>();

  // Snapshot the layout before exposing dormant resources. Revealing a room
  // ancestor must not accidentally enable another room's lighting signature.
  scene.traverseVisible(object => {
    if (object instanceof THREE.Light && object.layers.test(camera.layers)) visibleLights.add(object);
  });
  scene.traverse(object => {
    if (!(object instanceof THREE.Light)) return;
    previousLightLayers.set(object, object.layers.mask);
    object.layers.disable(ISOLATED_RESOURCE_PREWARM_LAYER);
    if (visibleLights.has(object)) object.layers.enable(ISOLATED_RESOURCE_PREWARM_LAYER);
  });

  const expose = (object: THREE.Object3D): void => {
    if (!previousVisibility.has(object)) previousVisibility.set(object, object.visible);
    object.visible = true;
  };

  for (const resourceRoot of resourceRoots) {
    const select = (object: THREE.Object3D): void => {
      if (object instanceof THREE.Light || previousResourceLayers.has(object)) return;
      previousResourceLayers.set(object, object.layers.mask);
      previousResourceFrustumCulling.set(object, object.frustumCulled);
      object.layers.set(ISOLATED_RESOURCE_PREWARM_LAYER);
      object.frustumCulled = false;
      if (options.includeHidden) expose(object);
    };
    if (options.includeDescendants === false) select(resourceRoot);
    else resourceRoot.traverse(select);
    if (options.includeHidden) {
      for (let ancestor = resourceRoot.parent; ancestor && ancestor !== scene; ancestor = ancestor.parent) expose(ancestor);
    }
  }
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
    for (const [object, visible] of previousVisibility) object.visible = visible;
  }
}
