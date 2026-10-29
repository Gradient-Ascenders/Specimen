import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';
import { exposeGame } from '../../helpers/GameRuntime.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { isExpectedMusicCancellation } from '../../helpers/ExpectedMusicCancellation.ts';

const evidence = 'artifacts/evidence/geometry-cleanup';
test.use({ viewport: { width: 960, height: 640 } });

test('Blackout tunnel, flush floor markings and deployed bridge have clean joins', async ({ page, baseURL }) => {
  test.setTimeout(600_000);
  const errors = watchBrowserErrors(page, { webgl: true });


  page.on('requestfailed', request => { if (!isExpectedMusicCancellation(request, baseURL!)) errors.push(`${request.failure()?.errorText}: ${request.url()}`); });
  await exposeGame(page, { session: '__geometrySession' });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 180_000 });
  await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: 'Level 3 Blackout', exact: true }).click();
  await page.getByRole('button', { name: 'Enter Level 3', exact: true }).click({ timeout: 180_000 });
  await page.waitForFunction(() => {
    const rt = (window as any).__geometrySession.runtime;
    return rt.input.enabled && !rt.resources.ventArrival?.active && !rt.preparationQueue?.diagnostics.pending;
  }, null, { timeout: 180_000 });
  await page.locator('canvas[data-gameplay-canvas]').click();
  await page.evaluate(() => (window as any).__geometrySession.runtime.renderLayer.setAnimationLoop(null));
  await mkdir(evidence, { recursive: true });
  async function room(id: number) {
    await page.evaluate(id => {
      const rt = (window as any).__geometrySession.runtime;
      rt.teleportToAuthoredRoom(id);
      rt.render(.5, { frameDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60 });
    }, id);
    await page.waitForFunction(() => !(window as any).__geometrySession.runtime.preparationQueue?.diagnostics.pending,
      null, { timeout: 180_000, polling: 250 });
  }
  // Reproducible first-person survey views use Volt's existing navigation light.
  // No temporary lights, exposure changes or production debug code are added.
  async function capture(name: string, position: number[], look: number[]) {
    const png = await page.evaluate(({ position, look }) => {
      const rt = (window as any).__geometrySession.runtime, r = rt.resources, layer = rt.renderLayer;
      r.manager.activate('volt'); r.group.voltBody.teleport(r.group.voltBody.position.clone().set(position[0], position[1] - .5, position[2]));
      rt.retargetCamera(r); layer.cameraRig.setViewMode('first-person', true); rt.syncVisuals(r);
      rt.render(.5, { frameDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60 });
      layer.cameraRig.camera.position.set(...position); layer.cameraRig.camera.lookAt(...look);
      layer.render(); return layer.canvas.toDataURL('image/png').split(',')[1];
    }, { position, look });
    await writeFile(`${evidence}/${name}.png`, Buffer.from(png, 'base64'));
  }
  await room(1);
  const tunnelWalk = await page.evaluate(() => {
    const rt = (window as any).__geometrySession.runtime, r = rt.resources, body = r.group.voltBody;
    r.manager.activate('volt'); body.teleport(body.position.clone().set(-6, .46, 52));
    const direction = body.position.clone();
    const visits: any[] = [];
    for (const [x, z] of [[-6, 58.8], [-15.75, 61.5], [-16, 69.5], [-16, 83], [-16, 87]]) {
      for (let i = 0; i < 360; i++) {
        if (Math.hypot(body.position.x - x, body.position.z - z) < .18 && body.grounded) break;
        direction.set(x - body.position.x, 0, z - body.position.z).normalize(); body.update(1 / 60, direction);
      }
      visits.push({ target: [x, z], position: body.position.toArray(), grounded: body.grounded,
        distance: Math.hypot(body.position.x - x, body.position.z - z), support: body.supportColliderName });
    }
    return visits;
  });
  for (const visit of tunnelWalk) { expect(visit.grounded).toBe(true); expect(visit.distance).toBeLessThan(.85); }
  await capture('tunnel-entrance', [-6, 1.15, 53], [-6, 1.1, 59.5]);
  await capture('tunnel-corner', [-6, 1.15, 61], [-12, 1.1, 61.5]);
  await capture('tunnel-turn-look-back', [-13.5, 1.15, 61.5], [-5.8, 1.1, 60]);
  await capture('tunnel-second-turn-look-back', [-16, 1.3, 64.5], [-15, 1.1, 61.5]);
  await capture('tunnel-wall-junction-front', [-13.5, 1.2, 61.2], [-15.25, .9, 63.1]);
  await capture('tunnel-wall-junction-low', [-14.2, .65, 61.8], [-15.25, .35, 63.1]);
  await capture('tunnel-wall-junction-reverse', [-16, 1.2, 64.5], [-15.15, .9, 63.05]);
  await capture('tunnel-rising-section', [-16, 1.3, 63.4], [-16, 2.6, 72]);
  await capture('tunnel-outlet', [-16, 3.7, 78.4], [-16, 3.6, 84]);
  await capture('room-1-flush-floor-strip', [0, 1.2, 51.5], [0, 0, 52.8]);
  await capture('room-1-flush-apron-lip', [-12, 1.2, 5.5], [-12, 0, 7]);
  await room(2);
  await page.evaluate(() => {
    const r = (window as any).__geometrySession.runtime.resources;
    for (const enemy of r.transit.emergingDrones) enemy.state.destroy();
  });
  await capture('catwalk-end-clean', [-16, 3.65, 134], [-15.5, 2.5, 136.4]);
  const bridge = await page.evaluate(() => {
    const rt = (window as any).__geometrySession.runtime, r = rt.resources, c = r.transit;
    const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
    bodies.bob.teleport(c.room.switchBodyPosition);
    bodies.volt.teleport(bodies.volt.position.clone().set(-16, 2.96, 136));
    for (let i = 0; i < 100; i++) {
      bodies.bob.update(1 / 60, bodies.bob.position.clone().set(-1, 0, 0)); c.update(1 / 60, bodies);
    }
    const deployed = c.bridgeDeployed, direction = bodies.volt.position.clone();
    const visits: any[] = [];
    for (const [x, z] of [[-10, 139], [0, 146.5], [0, 151]]) {
      for (let i = 0; i < 360; i++) {
        const body = bodies.volt;
        if (Math.hypot(body.position.x - x, body.position.z - z) < .18 && body.grounded) break;
        direction.set(x - body.position.x, 0, z - body.position.z).normalize(); body.update(1 / 60, direction); c.update(1 / 60, bodies);
      }
      visits.push({ distance: Math.hypot(bodies.volt.position.x - x, bodies.volt.position.z - z), grounded: bodies.volt.grounded,
        position: bodies.volt.position.toArray(), support: bodies.volt.supportColliderName });
    }
    return { deployed, visits, glError: rt.renderLayer.renderer.getContext().getError() };
  });
  expect(bridge.deployed).toBe(true);
  for (const visit of bridge.visits) { expect(visit.grounded).toBe(true); expect(visit.distance).toBeLessThan(.85); }
  expect(bridge.glError).toBe(0);
  await capture('bridge-catwalk-flush-join', [-16, 3.65, 135], [-14.3, 2.3, 136.9]);
  await capture('bridge-join-looking-back', [-13.7, 3.4, 137.2], [-15.3, 2.5, 136.3]);
  await capture('bridge-full-alignment', [-10, 6, 134], [-9, 1.5, 140]);
  await writeFile(`${evidence}/browser-results.json`, JSON.stringify({ tunnelWalk, bridge, errors }, null, 2));
  expect(errors).toEqual([]);
});
