import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Observe the shipped composition root. No flags or gameplay implementations
// are replaced; staging calls existing controller/reset contracts for coverage.
const observeSession = async (page: Page): Promise<void> => {
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern,
      '$1=globalThis.__paritySession=new $2({initialRuntime:') });
  });
};

const snapshot = (page: Page) => page.evaluate(() => {
  const rt = (window as any).__paritySession.runtime, r = rt.resources;
  const names: string[] = [], textures = new Set<string>();
  let texturedMeshes = 0;
  const graphics = rt.renderLayer.getGraphicsDiagnostics();
  rt.renderLayer.scene.traverse((o: any) => {
    if (o.name) names.push(o.name);
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.map?.image?.width > 0) { texturedMeshes++; textures.add(m.map.uuid); }
    }
  });
  return { debug: rt.debugAvailable, panel: Boolean(r.debugPanel ?? r.testPanel),
    names, texturedMeshes, textures: textures.size,
    rooms: r.authoredPreview ? [1, 2, 3, 4, 5].map(n => Boolean(r.authoredPreview[['roomOne', 'roomTwo', 'roomThree', 'roomFour', 'roomFive'][n - 1]])) : [],
    encounters: r.authoredPreview ? [r.roomThreeEncounter, r.roomFourEncounter, r.roomFiveEncounter].map(Boolean) : [],
    bob: (r.bobPresentation ?? r.testScene?.bob)?.ready,
    goop: (r.goopPresentation ?? r.testScene?.goop)?.ready,
    colliders: r.collisionWorld.colliderCount,
    dpr: rt.renderLayer.getDiagnostics().pixelRatio,
    preset: graphics.graphicsPreset,
    graphics,
    baked: r.authoredPreview ? {
      version: r.authoredPreview.assets.manifest.version,
      expectedRepairs: r.authoredPreview.assets.manifest.repairs.length,
      repairs: r.authoredPreview.surfaceCleanup.repairedMeshes,
    } : undefined,
    acid: Boolean(r.acidProjectileSystem),
    dissolve: Boolean(r.dissolveSystem),
    electrical: Boolean(r.electricalSystem),
    preparation: rt.preparationQueue?.diagnostics,
    glError: rt.renderLayer.renderer.getContext().getError(),
  };
});

const scenarios = [
  { profile: 'minimum', preset: 'normal', expectedDpr: 0.75 },
  { profile: 'standard', preset: 'normal', expectedDpr: 1 },
  { profile: 'standard', preset: 'performance', expectedDpr: 0.75 },
] as const;
for (const { profile, preset, expectedDpr } of scenarios) {
  test(`no-query ${profile} ${preset} production contains authored gameplay across all levels`, async ({ page, baseURL }, info) => {
    test.setTimeout(600_000);
    const failures: string[] = [], requests: string[] = [];
    page.on('pageerror', e => failures.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text())) failures.push(m.text()); });
    page.on('requestfailed', r => failures.push(`${r.failure()?.errorText}: ${r.url()}`));
    page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()}: ${r.url()}`); });
    page.on('request', r => {
      const u = new URL(r.url());
      if (['data:', 'blob:'].includes(u.protocol)) return;
      requests.push(u.pathname);
      if (!u.href.startsWith(baseURL!)) failures.push(`Escaped nested path: ${u.href}`);
    });
    await observeSession(page);
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 180_000 });
    expect(new URL(page.url()).search).toBe('');
    await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
    await expect(page.locator('[data-setting="graphics-profile"]')).toHaveValue('minimum');
    await expect(page.locator('[data-setting="graphics-preset"]')).toHaveValue('normal');
    await page.locator('[data-setting="graphics-profile"]').selectOption(profile);
    if (preset === 'performance') {
      await page.locator('[data-setting="graphics-preset"]').selectOption(preset);
      await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
    }
    await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
    await page.locator('[data-action="start"]').click();
    const evidence: unknown[] = [];
    for (const level of [1, 2, 3]) {
      await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
      const s = await snapshot(page); evidence.push({ level, ...s });
      expect(s.debug).toBe(false); expect(s.panel).toBe(false);
      expect(s.bob).toBe(true); expect(s.goop).toBe(true);
      expect(s.colliders).toBeGreaterThan(20);
      expect(s.texturedMeshes).toBeGreaterThanOrEqual(20); expect(s.textures).toBeGreaterThanOrEqual(level === 1 ? 2 : 4);
      expect(s.glError).toBe(0);
      expect(s.preset).toBe(preset);
      expect(s.acid).toBe(true); expect(s.dissolve).toBe(true);
      expect(s.dpr).toBe(expectedDpr);
      expect(s.graphics.graphicsProfileBase).toBe(profile);
      expect(s.graphics.gelRenderingMode).toBe(profile === 'minimum' ? 'minimum' : 'reduced-transmission');
      expect(s.graphics.shadowMapSizeCap).toBe(profile === 'minimum' ? 512 : 1024);
      expect(s.graphics.drawingBufferWidth * s.graphics.drawingBufferHeight).toBeLessThanOrEqual(s.graphics.pixelBudget);
      if (level === 1) expect(s.names).toContain('room-1-production-art');
      if (level === 2) {
        expect(s.names).toContain('cultivation-level-2-authored-preview');
        expect(s.rooms).toEqual([true, true, true, true, true]);
        expect(s.encounters).toEqual([true, true, true]);
        expect(s.preparation).toBeTruthy();
        expect(s.baked).toEqual({ version: 1, repairs: 137, expectedRepairs: 137 });
      }
      if (level === 3) {
        expect(s.electrical).toBe(true);
        expect(s.names).toContain('level-3-room-1-blackout-maintenance-bay');
        expect(s.names).toContain('level-3-room-2-powered-transit-gauntlet');
        expect(s.names).toContain('blackout-room-3-boss-staging-not-final-arena');
      }
      await page.waitForFunction(() => (window as any).__paritySession.runtime.input.enabled);
      const roster = level === 3 ? ['bob', 'goop', 'volt'] : level === 2 ? ['goop', 'bob'] : [];
      for (const active of roster) {
        await page.keyboard.press('Tab', { delay: 80 });
        await page.waitForFunction(active =>
          (window as any).__paritySession.runtime.captureProgressionSnapshot().activeSlimeId === active, active);
      }
      await page.keyboard.press('KeyD', { delay: 120 });
      await page.keyboard.press('Space', { delay: 120 });
      // Release input must ignore all developer shortcuts.
      const originalRoom = await page.evaluate(() => {
        const rt = (window as any).__paritySession.runtime;
        return rt.authoredPreviewRoomId ?? rt.roomState?.roomId ?? rt.resources.containmentLevel.activeRoomId;
      });
      for (const key of ['Digit0', 'Minus', 'Digit2']) await page.keyboard.press(key, { delay: 60 });
      expect(await page.evaluate(() => {
        const rt = (window as any).__paritySession.runtime;
        return rt.authoredPreviewRoomId ?? rt.roomState?.roomId ?? rt.resources.containmentLevel.activeRoomId;
      })).toBe(originalRoom);
      await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
      await page.keyboard.press('F2');
      await expect(page.locator('.test-panel, .performance-recorder')).toHaveCount(0);
      await page.keyboard.press('F1');
      await expect(page.locator('#app')).toHaveAttribute('data-clean-gameplay', 'true');
      await page.keyboard.press('F1');
      await expect(page.locator('#app')).not.toHaveAttribute('data-clean-gameplay');
      await page.screenshot({ path: info.outputPath(`level-${level}.png`), timeout: 120_000 });
      if (level === 2) {
        // Inspect each authored room with simulation stopped, using the same
        // entry/recovery contract as normal progression. Rendering/preparation
        // continue normally; no shaders, geometry or collisions are replaced.
        for (const room of [1, 2, 3, 4, 5]) {
          await page.evaluate(room => {
            const rt = (window as any).__paritySession.runtime;
            rt.stop(); rt.teleportToAuthoredPreviewRoom(room);
            rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
          }, room);
          await page.waitForFunction(room => {
            const rt = (window as any).__paritySession.runtime;
            const p = rt.resources.authoredPreview;
            return !rt.preparationQueue.diagnostics.pending &&
              p[['roomOne', 'roomTwo', 'roomThree', 'roomFour', 'roomFive'][room - 1]].root.visible;
          }, room, { timeout: 180_000 });
          await page.screenshot({ path: info.outputPath(`level-2-room-${room}.png`), timeout: 120_000 });
          expect((await snapshot(page)).glError).toBe(0);
        }
        await page.evaluate(() => {
          const rt = (window as any).__paritySession.runtime;
          rt.teleportToAuthoredPreviewRoom(1); rt.start();
        });
      }
      await page.keyboard.press('KeyP');
      await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();
      await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
      expect((await snapshot(page)).texturedMeshes).toBeGreaterThanOrEqual(20);
      if (level === 1) {
        // Stage the existing completion boundary; do not enable debug UI/input.
        await page.evaluate(() => (window as any).__paritySession.runtime.resources.containmentLevel.completeForDebug());
      } else if (level === 2) {
        // Exercise actual final-lever release, Volt registration and handoff.
        await page.evaluate(() => {
          const rt = (window as any).__paritySession.runtime;
          rt.teleportToAuthoredPreviewRoom(5);
          const r = rt.resources, c = r.authoredPreview.roomFive.controller;
          c.reset('controls'); c.update(1.5, false, false, false, true);
          c.update(4, false, false, false, false);
          rt.updateRoomFive(1 / 60, r);
        });
      }
      if (level < 3) {
        const start = Date.now();
        const enter = page.locator('[data-action="enter-level"]');
        await expect(enter).toBeVisible({ timeout: 240_000 });
        evidence.push({ entering: level + 1, transitionMs: Date.now() - start });
        await enter.click();
      }
    }
    expect(requests.some(p => /\/volt-[^/]+\.glb$/.test(p))).toBe(true);
    expect(requests.some(p => /\/maintenance-maps-[^/]+\.bin$/.test(p))).toBe(true);
    expect(requests.some(p => /\/authored-assets-[^/]+\.bin$/.test(p))).toBe(true);
    expect(requests.some(p => /CultivationLevelDebug|PerformanceFlightRecorder/.test(p))).toBe(false);
    expect(failures).toEqual([]);
    const evidencePath = info.outputPath('content-evidence.json');
    await writeFile(evidencePath, JSON.stringify({ evidence, requests, failures }, null, 2));
    await info.attach('production-content-evidence', { path: evidencePath, contentType: 'application/json' });
  });
}


