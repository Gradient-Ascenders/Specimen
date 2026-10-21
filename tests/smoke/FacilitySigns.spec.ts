import { expect, test } from '@playwright/test';
import { finishOpening } from '../helpers/OpeningHandoff.ts';

test('shared facility signs render across all five rooms at front and oblique angles', async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  // Observe the shipped composition root; keep test-only camera staging out of
  // production code and leave the actual sign meshes, lighting and materials.
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /(\binitialRuntime:\s*)([\w$]+)/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern, '$1globalThis.__signRuntime=$2') });
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ timeout: 120_000 });
  await finishOpening(page, false);
  const diagnostics = await page.evaluate(() => {
    const rt = (window as any).__signRuntime;
    rt.stop(); rt.render = () => {};
    document.querySelector<HTMLElement>('.game-flow')!.style.display = 'none';
    const atlas = rt.resources.testScene.artResources.textures.signageAtlas;
    const removedSignParts: string[] = [];
    rt.resources.testScene.root.traverse((object: any) => {
      if (object.name.startsWith('room-5-pressure-array-sign')) removedSignParts.push(object.name);
    });
    const remainingRoomFiveSigns = ['entry-primary-containment', 'observation-control', 'soluble-access']
      .filter(name => rt.resources.testScene.root.getObjectByName(`room-5-${name}-sign-mounted-assembly`));
    return { width: atlas.image.width, height: atlas.image.height, anisotropy: atlas.anisotropy,
      removedSignParts, remainingRoomFiveSigns };
  });
  expect(diagnostics).toEqual({ width: 1024, height: 2560, anisotropy: 8,
    removedSignParts: [], remainingRoomFiveSigns: ['entry-primary-containment', 'observation-control', 'soluble-access'] });
  const views = [
    { name: 'room-1-bay', target: [-1.65, 6.58, 5.61], camera: [-1.65, 6.58, 1.2] },
    { name: 'room-2-chamber', target: [-4.35, 14.65, 48.665], camera: [-4.35, 14.65, 43.5] },
    { name: 'room-3-sector', target: [4.5, 15.8, 49.24], camera: [4.5, 15.8, 56] },
    { name: 'room-3-oblique', target: [4.5, 15.8, 49.24], camera: [9.5, 15.8, 54] },
    { name: 'room-4-core', target: [9, 34.65, 79.965], camera: [9, 34.65, 86] },
    { name: 'room-5-pressure-array-cleared-wall', target: [-19.62, 84, 110], camera: [-14.5, 84, 110] },
    { name: 'room-5-observation-control', target: [-10, 103.15, 125.10], camera: [-10, 103.15, 129.5] },
  ];
  for (const view of views) {
    const glError = await page.evaluate(view => {
      const rt = (window as any).__signRuntime, layer = rt.renderLayer;
      const room = Number(view.name.charAt(5));
      rt.resources.testScene.lighting.setActiveRoom(room);
      rt.resources.testScene.lighting.setTraversalPosition({ x: view.camera[0], y: view.camera[1], z: view.camera[2] });
      rt.resources.testScene.lighting.reconcileAuthoritativeState(true);
      rt.lightLayout?.sync();
      const camera = layer.cameraRig.camera;
      camera.position.set(...view.camera); camera.lookAt(...view.target);
      camera.updateMatrixWorld(true);
      layer.renderer.render(layer.scene, camera);
      return layer.renderer.getContext().getError();
    }, view);
    expect(glError).toBe(0);
    await page.screenshot({ path: info.outputPath(`${view.name}.png`) });
  }
  expect(errors).toEqual([]);
});
