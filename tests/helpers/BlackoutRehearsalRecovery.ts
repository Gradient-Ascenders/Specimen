import type { Page } from '@playwright/test';
import { exposeGame } from './GameRuntime.ts';
import { finishLevelArrival } from './LevelArrival.ts';
import { GRAPHICS_PROFILES } from '../../src/render/GraphicsProfiles.ts';

/** Observe the real preparation/cancellation owners; optional forced-loss probe
 * also records every GL-error boundary, without accepting or discarding errors. */
export async function captureBlackoutRehearsalRecovery(page: Page, profile: 'standard' | 'high', loseContext: boolean) {
  const errors: string[] = [], warnings: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.addInitScript(settings => localStorage.setItem('specimen.graphics-preferences.v1', JSON.stringify({ mode: 'manual', settings })), GRAPHICS_PROFILES[profile].settings);
  await exposeGame(page, { session: '__transmissionRecovery' });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-flow-panel="title"] [data-action="level-select"]').click({ timeout: 180_000 });
  await page.getByRole('button', { name: 'Level 3 Blackout', exact: true }).click();
  await page.locator('[data-action="enter-level"]').click({ timeout: 240_000 });
  await finishLevelArrival(page, '__transmissionRecovery');
  const result = await page.evaluate(async loseContext => {
    const session = (window as any).__transmissionRecovery, runtime = session.runtime, layer = runtime.renderLayer, renderer = layer.renderer;
    layer.setAnimationLoop(null); runtime.stop();
    const camera = layer.cameraRig.camera, gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    const snapshot = () => JSON.stringify({ id: camera.id, position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
      scale: camera.scale.toArray(), up: camera.up.toArray(), projection: camera.projectionMatrix.toArray(), inverse: camera.projectionMatrixInverse.toArray(),
      world: camera.matrixWorld.toArray(), view: camera.matrixWorldInverse.toArray(), layers: camera.layers.mask,
      fov: camera.fov, near: camera.near, far: camera.far, aspect: camera.aspect, zoom: camera.zoom });
    let lost = false, restored = false;
    const glErrors = { before: gl.getError(), afterRestore: 0, afterPreparation: 0, afterDraw: 0, afterCancellation: 0 };
    if (loseContext) await new Promise<void>(resolve => {
      renderer.domElement.addEventListener('webglcontextrestored', () => { restored = true; resolve(); }, { once: true });
      renderer.domElement.addEventListener('webglcontextlost', (event: Event) => {
        event.preventDefault(); lost = true; setTimeout(() => renderer.forceContextRestore(), 100);
      }, { once: true });
      renderer.forceContextLoss();
    });
    glErrors.afterRestore = gl.getError();
    const before = snapshot(); await runtime.prepareGraphics();
    const restoredCamera = before === snapshot(); glErrors.afterPreparation = gl.getError();
    runtime.render(1, { frameDeltaSeconds: 1 / 60 }); glErrors.afterDraw = gl.getError();
    const movie = runtime.resources.researchFinale, original = movie.primePresentationFrames;
    let callbacks = 0, cancellationCameraRestored = false;
    movie.primePresentationFrames = function (scene: any, render: any, current: any) {
      return original.call(this, scene, async (view: any) => {
        const before = snapshot(); await render(view);
        cancellationCameraRestored = before === snapshot(); callbacks++;
        session.unload();
      }, current);
    };
    await runtime.prepareGraphics(); glErrors.afterCancellation = gl.getError();
    return { gpu, lost, restored, restoredCamera, glErrors, callbacks, cancellationCameraRestored,
      state: runtime.state, visibility: layer.canvas.style.visibility };
  }, loseContext);
  return { result, errors, warnings };
}
