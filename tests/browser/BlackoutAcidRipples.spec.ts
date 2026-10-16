import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures.ts';

test.use({ channel: process.env.SPECIMEN_BROWSER_CHANNEL });

for (const profile of ['normal', 'performance', 'minimum']) {
  test(`Blackout acid ripples ${profile}`, async ({ page, baseURL }) => {
    test.setTimeout(600_000);
    const mode = new URL(baseURL!).port === '5173' ? 'development' : 'production';
    const directory = `artifacts/blackout-ripples/${mode}/${profile}`;
    await mkdir(directory, { recursive: true });
    const errors: string[] = [], evidence: unknown[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /Multiple instances of Three/.test(m.text())) errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.route('**/assets/index-*.js', async route => {
      const response = await route.fetch(), body = await response.text();
      const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
      expect(body).toMatch(pattern);
      await route.fulfill({ response, body: body.replace(pattern, '$1=globalThis.__rippleSession=new $2({initialRuntime:') });
    });
    await page.route('**/src/main.ts', async route => {
      const response = await route.fetch(), body = await response.text();
      const pattern = 'const gameSession = new GameSessionCoordinator(';
      expect(body).toContain(pattern);
      await route.fulfill({ response, body: body.replace(pattern, 'const gameSession = globalThis.__rippleSession = new GameSessionCoordinator(') });
    });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
    await page.locator('[data-setting="graphics-profile"]').selectOption(profile === 'minimum' ? 'minimum' : 'standard');
    await page.locator('[data-setting="graphics-preset"]').selectOption(profile === 'performance' ? 'performance' : 'normal');
    if (profile === 'performance') await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
    await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
    await page.locator('[data-action="start"]').click();
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
    await page.evaluate(() => (window as any).__rippleSession.runtime.resources.containmentLevel.completeForDebug());
    await page.locator('[data-action="enter-level"]').click({ timeout: 240_000 });
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
    await page.evaluate(() => {
      const rt = (window as any).__rippleSession.runtime;
      rt.resources.manager.unlock('volt'); rt.events.emit('completed', {levelId: 'level-2', nextLevelId: 'level-3'});
    });
    await page.locator('[data-action="enter-level"]').click({ timeout: 240_000 });
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
    await page.keyboard.press('F1');

    const sample = () => page.evaluate(() => {
      const rt = (window as any).__rippleSession.runtime, r = rt.resources;
      const mesh = r.scene.root.getObjectByName((window as any).__rippleRoom === 1 ? 'animated-acid-surface' : 'transit-acid-surface');
      const m = mesh.material, gl = rt.renderLayer.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { ...m.interactionDiagnostics, time: m.diagnostics.timeSeconds, version: m.version, key: m.customProgramCacheKey(),
        ripples: m.acidUniforms.uRipples.value.map((v: any, i: number) => [v.x, v.y, m.acidUniforms.uRippleSurfaceY.value[i], v.w]),
        death: r.deathSequence.isPlaying, position: {...r.group.activeBody.position}, grounded: r.group.activeBody.grounded,
        graphics: rt.renderLayer.getGraphicsDiagnostics(), calls: rt.renderLayer.renderer.info.render.calls,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), glError: gl.getError() };
    });
    const stage = async (room: number, slime: string) => page.evaluate(({room, slime}) => {
      const rt = (window as any).__rippleSession.runtime;
      rt.stop(); rt.teleportToAuthoredRoom(room);
      const r = rt.resources, body = slime === 'goop' ? r.group.goopBody : slime === 'bob' ? r.group.bobBody : r.group.voltBody;
      (window as any).__rippleRoom = room;
      r.manager.activate(slime);
      // Both start above open acid and fall normally; teleport itself emits nothing.
      body.teleport(body.position.clone().set(room === 1 ? -1 : 9, 1, room === 1 ? 10 : 90));
      if (slime !== 'volt') r.group.voltBody.teleport(body.position.clone().set(room === 1 ? 2 : 8, room === 1 ? .46 : .86, room === 1 ? 6 : 87));
      rt.retargetCamera(r); rt.renderLayer.cameraRig.reset();
      // Look across the open basin, avoiding the entry deck behind the player.
      rt.renderLayer.cameraRig.setGroundOrbitYawRadians(-Math.PI / 2);
      rt.renderLayer.cameraRig.queueLookInput(0, 140);
      rt.start();
    }, { room, slime });

    for (const room of [1, 2]) {
      await stage(room, 'goop');
      const initial = await sample();
      await page.waitForFunction(before => {
        const rt = (window as any).__rippleSession.runtime, r = rt.resources;
        const owner = (window as any).__rippleRoom === 1 ? r.scene.maintenanceBay : r.scene.transitRoom;
        return owner.acidMaterial.interactionDiagnostics.emitted > before && r.group.goopBody.grounded;
      }, initial.emitted);
      const landed = await sample();
      await page.keyboard.down('KeyW'); await page.waitForTimeout(350); await page.keyboard.up('KeyW');
      const walking = await sample();
      expect(walking.emitted).toBeGreaterThan(landed.emitted);
      expect(walking.death).toBe(true);
      await page.screenshot({ path: `${directory}/room-${room}-goop-wake.png` });
      await page.keyboard.press('Space');
      await page.waitForFunction(() => !(window as any).__rippleSession.runtime.resources.group.goopBody.grounded);
      await page.waitForFunction(() => (window as any).__rippleSession.runtime.resources.group.goopBody.grounded);
      const jumping = await sample();
      expect(jumping.emitted).toBeGreaterThan(walking.emitted + 1);
      expect(jumping.version).toBe(initial.version); expect(jumping.key).toBe(initial.key);
      expect(jumping.glError).toBe(0);
      evidence.push({ room, slime: 'goop', initial, walking, jumping });
      await page.screenshot({ path: `${directory}/room-${room}-goop-landing.png` });
      for (const slime of ['bob', 'volt']) {
        await stage(room, slime); const before = await sample();
        await page.waitForFunction(() => !(window as any).__rippleSession.runtime.resources.deathSequence.isPlaying);
        await page.waitForTimeout(120);
        const impact = await sample();
        expect(impact.emitted).toBe(before.emitted + 1);
        expect(impact.active).toBe(1);
        if (slime === 'bob') await page.screenshot({ path: `${directory}/room-${room}-bob-impact.png` });
        await page.waitForTimeout(300);
        const dying = await sample();
        expect(dying.emitted).toBe(impact.emitted);
        expect(dying.time).toBeGreaterThan(impact.time);
        expect(dying.version).toBe(before.version); expect(dying.glError).toBe(0);
        evidence.push({ room, slime, before, impact, dying });
        await page.evaluate(() => (window as any).__rippleSession.runtime.recoverActiveCheckpoint());
        expect((await sample()).active).toBe(0);
      }
    }
    await writeFile(`${directory}/evidence.json`, JSON.stringify({ errors, evidence }, null, 2));
    expect(errors).toEqual([]);
  });
}
