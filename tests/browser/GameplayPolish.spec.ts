import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures.ts';

test.use({ channel: process.env.SPECIMEN_BROWSER_CHANNEL });

// Observe existing runtime contracts without enabling developer gameplay flags.
for (const profile of ['normal', 'performance', 'minimum']) {
  test(`polish evidence ${profile}`, async ({ page }) => {
    test.setTimeout(600_000);
    const phase = process.env.POLISH_BASELINE ? 'before' : 'after';
    const dir = `artifacts/gameplay-polish/${phase}/${profile}`;
    await mkdir(dir, { recursive: true });
    await page.setViewportSize({ width: 960, height: 540 });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.route('**/assets/index-*.js', async route => {
      const response = await route.fetch();
      const body = await response.text();
      const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
      expect(body).toMatch(pattern);
      await route.fulfill({ response, body: body.replace(pattern,
        '$1=globalThis.__polishSession=new $2({initialRuntime:') });
    });
    await page.goto('/');
    await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
    await page.locator('[data-setting="graphics-profile"]').selectOption(profile === 'minimum' ? 'minimum' : 'standard');
    await page.locator('[data-setting="graphics-preset"]').selectOption(profile === 'performance' ? 'performance' : 'normal');
    if (profile === 'performance') await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
    await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
    await page.locator('[data-action="start"]').click();
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
    await page.screenshot({ path: `${dir}/level-1-start.png` });
    if (!process.env.POLISH_BASELINE) {
      const start = await page.evaluate(() => {
        const rt = (window as any).__polishSession.runtime, r = rt.resources;
        return { goop: r.slimeManager.isAvailable('goop'), visible: r.testScene.goop.diagnostics.visible,
          locator: r.slimePairPresentation.root.visible, switched: r.slimePair.switchActive() };
      });
      expect(start).toEqual({ goop: false, visible: false, locator: false, switched: false });
      await page.evaluate(() => {
        const rt = (window as any).__polishSession.runtime;
        rt.resources.containmentLevel.recoverActiveCheckpoint();
      });
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => (window as any).__polishSession.runtime.captureProgressionSnapshot().activeSlimeId)).toBe('bob');
      await page.evaluate(() => (window as any).__polishSession.runtime.restartLevel());
      expect(await page.evaluate(() => (window as any).__polishSession.runtime.resources.slimeManager.isAvailable('goop'))).toBe(false);
    }
    await page.keyboard.press('F1');
    await page.evaluate(() => {
      const rt = (window as any).__polishSession.runtime, r = rt.resources;
      rt.stop();
      r.body.recoverAt(r.body.position.clone().set(0, 75.21, 105));
      r.containmentLevel.setActiveRoom(5);
      rt.renderLayer.cameraRig.reset();
      rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/room-5-contained.png` });
    if (!process.env.POLISH_BASELINE) expect(await page.evaluate(() => {
      const r = (window as any).__polishSession.runtime.resources;
      return { live: r.testScene.goop.diagnostics.visible, contained: r.testScene.roomFive.goopPresentation.diagnostics.visible };
    })).toEqual({ live: false, contained: true });
    // Exercise the authored release timings, then its normal completion event.
    await page.evaluate(() => {
      const rt = (window as any).__polishSession.runtime, r = rt.resources;
      rt.stop();
      r.testScene.roomFive.beginEnding();
      r.containmentLevel.stateValue = 'completing';
      r.containmentLevel.update(1);
      r.containmentLevel.update(1.5);
    });
    await page.locator('[data-action="enter-level"]').click({ timeout: 240_000 });
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
    expect(await page.evaluate(() => (window as any).__polishSession.runtime.resources.manager.isAvailable('goop'))).toBe(true);
    await page.evaluate(() => {
      const rt = (window as any).__polishSession.runtime;
      rt.resources.manager.unlock('volt');
      rt.events.emit('completed', { levelId: 'level-2', nextLevelId: 'level-3' });
    });
    await page.locator('[data-action="enter-level"]').click({ timeout: 240_000 });
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
    const evidence: unknown[] = [];
    for (const [name, position, yaw] of [
      ['maintenance-acid', [0, 0.46, 4], Math.PI],
      ['transit-acid', [6, 0.86, 85], Math.PI],
      ['exit-front', [0, 0.86, 152], Math.PI],
      ['exit-side', [-2, 0.86, 154], Math.PI * 0.7],
      ['exit-rear', [-1, 0.86, 160], 0],
    ] as const) {
      await page.evaluate(({position, yaw}) => {
        const rt = (window as any).__polishSession.runtime, r = rt.resources;
        rt.stop();
        r.manager.activate('bob');
        const p = r.group.bobBody.position.clone().set(...position);
        r.group.bobBody.recoverAt(p);
        // Bring Volt's existing gameplay light along for readable blackout views.
        r.group.voltBody.recoverAt(p.clone().set(p.x + 2, p.y, p.z + 1));
        rt.retargetCamera(r);
        rt.renderLayer.cameraRig.reset();
        rt.renderLayer.cameraRig.setGroundOrbitYawRadians(yaw);
      }, { position, yaw });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${dir}/${name}.png` });
      const result = await page.evaluate(() => {
        const rt = (window as any).__polishSession.runtime;
        const gl = rt.renderLayer.renderer.getContext();
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { graphics: rt.renderLayer.getGraphicsDiagnostics(), render: rt.renderLayer.getDiagnostics(),
          calls: rt.renderLayer.renderer.info.render.calls,
          triangles: rt.renderLayer.renderer.info.render.triangles,
          programs: rt.renderLayer.renderer.info.programs.length,
          renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          glError: gl.getError() };
      });
      expect(result.glError).toBe(0);
      evidence.push(result);
    }
    await writeFile(`${dir}/evidence.json`, JSON.stringify({ errors, evidence }, null, 2));
    expect(errors).toEqual([]);
  });
}
