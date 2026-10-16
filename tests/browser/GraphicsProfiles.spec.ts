import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const directory = resolve('artifacts/evidence/issue-190');
const errors: string[] = [];
const hashes: Record<string, string> = {};

async function observe(page: Page): Promise<void> {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
  });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => errors.push(request.url()));
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    hashes[route.request().url()] = createHash('sha256').update(source).digest('hex');
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    if (/\/index-[^/]+\.js$/.test(route.request().url())) expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern, '$1=globalThis.__graphicsSession=new $2({initialRuntime:') });
  });
}

async function boot(page: Page, url = '/?debug=1'): Promise<void> {
  await observe(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 240_000 });
  await page.evaluate(() => (window as any).__graphicsSession.runtime.renderLayer.setAnimationLoop(null));
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
}

async function draw(page: Page): Promise<any> {
  return page.evaluate(() => {
    const rt = (window as any).__graphicsSession.runtime, layer = rt.renderLayer;
    rt.render(1, { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 0, frameDeltaSeconds: 0,
      stepsThisFrame: 0, interpolationAlpha: 1, droppedSimulationTimeSeconds: 0, renderFps: 60 });
    const diagnostics = layer.getDiagnostics(), gl = layer.renderer.getContext();
    const snapshot = {};
    layer.writePerformanceSnapshot(snapshot, { set(x: number, y: number) { Object.assign(this, { x, y }); return this; },
      floor() { return this; } });
    const shadowSizes: number[][] = [], effectCounts: number[] = [], transmission: number[] = [];
    const maps: Map<any, number> = (window as any).__graphicsMaps ??= new Map();
    layer.scene.traverse((object: any) => {
      if (object.isLight && object.castShadow) {
        shadowSizes.push(object.shadow.mapSize.toArray());
        for (const map of [object.shadow.map, object.shadow.mapPass]) if (map && !maps.has(map)) {
          maps.set(map, 0); map.addEventListener('dispose', () => maps.set(map, maps.get(map)! + 1));
        }
      }
      if (object.isPoints && object.geometry.userData.graphicsDecorativeEffect) effectCounts.push(
        Math.min(object.geometry.drawRange.count, object.geometry.getAttribute('position').count));
      for (const m of object.material ? Array.isArray(object.material) ? object.material : [object.material] : []) {
        if (m.isMeshPhysicalMaterial && /^(Bob|Goop|Volt)-(Gel|Golden)/.test(m.name)) transmission.push(m.transmission);
      }
    });
    const probe = document.createElement('canvas'); probe.width = 64; probe.height = 36;
    const ctx = probe.getContext('2d')!; ctx.drawImage(layer.canvas, 0, 0, 64, 36);
    const rgba = ctx.getImageData(0, 0, 64, 36).data, colors = new Set();
    for (let i = 0; i < rgba.length; i += 4) colors.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
    return { diagnostics, snapshot, shadowSizes, effectCounts, transmission, glError: gl.getError(),
      distinctColors: colors.size, mapDisposals: [...maps.values()],
      canvas: [layer.canvas.width, layer.canvas.height],
      css: [layer.canvas.clientWidth, layer.canvas.clientHeight],
      aspect: layer.cameraRig.camera.aspect, level: rt.resources?.authoredPreview ? 'authored-cultivation' : rt.constructor.name };
  });
}

async function settings(page: Page): Promise<void> {
  await page.keyboard.press('KeyP');
  await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
  await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
}

async function resume(page: Page): Promise<void> {
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
}

async function capture(page: Page, name: string): Promise<void> {
  // With simulation deliberately frozen, keep submitting identical render-only
  // frames until the compositor takes the screenshot (the buffer is not preserved).
  await page.evaluate(() => {
    const render = () => {
      const rt = (window as any).__graphicsSession.runtime;
      rt.render(1, { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 0, frameDeltaSeconds: 0,
        stepsThisFrame: 0, interpolationAlpha: 1, droppedSimulationTimeSeconds: 0, renderFps: 60 });
      (window as any).__graphicsCaptureFrame = requestAnimationFrame(render);
    };
    render();
  });
  try { await page.screenshot({ path: resolve(directory, name) }); }
  finally { await page.evaluate(() => cancelAnimationFrame((window as any).__graphicsCaptureFrame)); }
}

function assertBudget(row: any): void {
  const d = row.diagnostics;
  expect(row.glError, JSON.stringify({ level: row.level, errors: errors.slice(0, 12) })).toBe(0);
  expect(row.canvas).toEqual([d.drawingBufferWidth, d.drawingBufferHeight]);
  expect(row.canvas[0] * row.canvas[1]).toBeLessThanOrEqual(d.pixelBudget);
  expect(row.canvas[0]).toBeGreaterThan(0); expect(row.canvas[1]).toBeGreaterThan(0);
  expect(row.css).toEqual([d.viewportWidth, d.viewportHeight]);
  expect(row.aspect).toBeCloseTo(d.viewportWidth / d.viewportHeight, 6);
  expect(row.snapshot.graphicsProfile).toBe(d.graphicsProfile);
  expect(row.snapshot.pixelBudget).toBe(d.pixelBudget);
  expect(row.shadowSizes.every((size: number[]) => size.every(value => value <= d.shadowMapSizeCap))).toBe(true);
  expect(d.antialias).toBe(false);
  expect(row.distinctColors).toBeGreaterThan(32);
  expect(row.mapDisposals.every((count: number) => count <= 1)).toBe(true);
  if (d.gelRenderingMode === 'minimum') expect(row.transmission.every((value: number) => value === 0)).toBe(true);
}

test('profiles bound high-DPI/resize work, retain native HUD and survive all level handoffs/restarts', async ({ page, context }) => {
  test.setTimeout(600_000);
  errors.length = 0;
  await mkdir(directory, { recursive: true });
  await boot(page);
  const rows: any[] = [];
  const initial = await draw(page); rows.push({ phase: 'default', ...initial }); assertBudget(initial);
  expect(initial.diagnostics.graphicsProfile).toBe('minimum');
  await settings(page);
  await expect(page.locator('[data-setting="graphics-profile"]')).toHaveValue('minimum');
  for (const profile of ['standard', 'minimum']) {
    await page.locator('[data-setting="graphics-profile"]').selectOption(profile);
    for (const viewport of [{ width: 3840, height: 2160 }, { width: 320, height: 900 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      const row = await draw(page); rows.push({ phase: `${profile}-resize`, ...row }); assertBudget(row);
      expect(row.diagnostics.graphicsProfile).toBe(profile);
      await expect(page.locator('[data-graphics-diagnostics]')).toContainText(`${row.canvas[0]} × ${row.canvas[1]} px`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  // Browser zoom / moving between DPI displays without changing CSS dimensions.
  const cdp = await context.newCDPSession(page);
  for (const deviceScaleFactor of [2, 1.25, 1]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor, mobile: false });
    await page.waitForFunction(dpr => window.devicePixelRatio === dpr, deviceScaleFactor);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const row = await draw(page); rows.push({ phase: 'dpi-change', ...row }); assertBudget(row);
    expect(row.diagnostics.devicePixelRatio).toBe(deviceScaleFactor);
    await expect(page.locator('[data-graphics-diagnostics]')).toContainText(`display DPR ${deviceScaleFactor.toFixed(2)}`);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride'); await cdp.detach();
  await page.locator('[data-setting="graphics-profile"]').selectOption('standard');
  await page.locator('[data-setting="gel-rendering"]').selectOption('physical');
  await page.locator('[data-setting="graphics-preset"]').selectOption('performance');
  const capped = await draw(page); assertBudget(capped);
  expect(capped.diagnostics.graphicsPreset).toBe('performance');
  expect(capped.diagnostics.pixelRatioCap).toBe(1);
  expect(capped.diagnostics.requestedPixelRatioCap).toBe(1.5);
  expect(capped.diagnostics.transmissionResolutionScale).toBe(.5);
  await page.locator('[data-setting="graphics-preset"]').selectOption('normal');
  const restored = await draw(page); assertBudget(restored);
  expect(restored.diagnostics.requestedPixelRatioCap).toBe(1.5);
  expect(restored.diagnostics.transmissionResolutionScale).toBe(1);
  await page.locator('[data-setting="graphics-profile"]').selectOption('minimum');
  await page.locator('[data-setting="render-resolution"]').selectOption('2');
  await page.locator('[data-setting="render-scale"]').selectOption('0.5');
  const custom = await draw(page); assertBudget(custom);
  expect(custom.diagnostics.graphicsProfile).toBe('custom');
  await expect(page.locator('[data-setting="graphics-profile"]')).toHaveValue('custom');
  expect(custom.diagnostics.pixelBudget).toBe(921600);
  await page.locator('[data-setting="graphics-profile"]').selectOption('standard');
  await resume(page);
  for (const level of [1, 2, 3]) {
    if (level > 1) {
      await page.keyboard.press('Digit0');
      // Level 1 consumes debugCompleteLevel in fixedUpdate; the test freezes
      // the animation loop, so process the real input explicitly once.
      if (level === 2) await page.evaluate(() => (window as any).__graphicsSession.runtime.fixedUpdate(1 / 60));
      await expect(page.locator('[data-action="enter-level"]')).toBeVisible({ timeout: 240_000 });
      await page.locator('[data-action="enter-level"]').click();
      await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 240_000 });
    }
    const before = await draw(page); assertBudget(before);
    expect(before.diagnostics.graphicsProfile).toBe(level === 1 ? 'standard' : 'custom');
    if (level > 1) expect(before.diagnostics.renderScale).toBe(.5);
    rows.push({ phase: `level-${level}-entry`, ...before });
    await settings(page);
    for (const profile of ['minimum', 'standard', 'minimum', 'standard']) {
      await page.locator('[data-setting="graphics-profile"]').selectOption(profile);
      const row = await draw(page); assertBudget(row); rows.push({ phase: `level-${level}-${profile}`, ...row });
    }
    await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
    await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 240_000 });
    const after = await draw(page); assertBudget(after);
    expect(after.diagnostics.graphicsProfile).toBe('standard');
    rows.push({ phase: `level-${level}-restart`, ...after });
    // Select the conservative preset for a readability capture, then restore.
    await settings(page);
    await page.locator('[data-setting="graphics-profile"]').selectOption('minimum');
    await resume(page); await draw(page);
    await capture(page, `level-${level}-minimum.png`);
    await settings(page); await page.locator('[data-setting="graphics-profile"]').selectOption('standard'); await resume(page);
    if (level < 3) {
      await settings(page); await page.locator('[data-setting="render-scale"]').selectOption('0.5'); await resume(page);
    }
  }
  await settings(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.screenshot({ path: resolve(directory, 'settings-narrow.png') });
  const unloaded = await page.evaluate(() => {
    (window as any).__graphicsSession.unload();
    return [...((window as any).__graphicsMaps as Map<any, number>).values()];
  });
  expect(unloaded.length).toBeGreaterThan(0); expect(unloaded.every(count => count === 1)).toBe(true);
  await writeFile(resolve(directory, 'lifecycle.json'), JSON.stringify({ hashes, rows, unloaded, errors }, null, 2));
  expect(errors).toEqual([]);
});

test('report real buffer/profile differences separately from shader performance', async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  errors.length = 0;
  await mkdir(directory, { recursive: true });
  const rows: any[] = [];
  const baseline = process.env.SPECIMEN_GRAPHICS_BASELINE_URL;
  for (const build of [...baseline ? [{ name: 'baseline-main', url: baseline }] : [], { name: 'candidate', url: baseURL! }]) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    try {
      await boot(page, new URL('?debug=1', build.url).href);
      for (const profile of build.name === 'candidate' ? ['minimum', 'standard', 'minimum', 'standard'] : ['legacy-default']) {
        if (profile !== 'legacy-default') {
          await settings(page); await page.locator('[data-setting="graphics-profile"]').selectOption(profile); await resume(page);
        }
        const result = await page.evaluate(async ({ build, profile }) => {
          const rt = (window as any).__graphicsSession.runtime, layer = rt.renderLayer, renderer = layer.renderer;
          const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
          const debug = gl.getExtension('WEBGL_debug_renderer_info');
          const stats = { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 0, frameDeltaSeconds: 0,
            stepsThisFrame: 0, interpolationAlpha: 1, droppedSimulationTimeSeconds: 0, renderFps: 60 };
          const draw = () => rt.render(1, stats);
          for (let i = 0; i < 5; i++) draw(); gl.finish();
          const queries: WebGLQuery[] = [], rawGpuMs: number[] = [];
          const original = renderer.render;
          renderer.render = function(...args: any[]) {
            const query = ext ? gl.createQuery() : null;
            if (query) { queries.push(query); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); }
            try { return original.apply(this, args); } finally { if (query) gl.endQuery(ext.TIME_ELAPSED_EXT); }
          };
          let disjoint = false;
          try {
            for (let i = 0; i < 24; i++) { draw(); gl.flush(); await new Promise(resolve => setTimeout(resolve, 0)); }
            const deadline = performance.now() + 30_000;
            while (queries.some(query => !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))) {
              if (performance.now() > deadline) throw new Error('Incomplete graphics-profile GPU query');
              await new Promise(resolve => setTimeout(resolve, 0));
            }
            disjoint = ext ? Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT)) : false;
            if (!disjoint) for (const query of queries) rawGpuMs.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
          } finally { renderer.render = original; queries.forEach(query => gl.deleteQuery(query)); }
          draw();
          return { build, profile, diagnostics: layer.getDiagnostics(), rawGpuMs, disjoint,
            devicePixelRatio: window.devicePixelRatio, antialias: gl.getContextAttributes().antialias,
            userAgent: navigator.userAgent, renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
            camera: layer.cameraRig.camera.position.toArray(), quaternion: layer.cameraRig.camera.quaternion.toArray(),
            bob: rt.resources.body.position.toArray(), glError: gl.getError() };
        }, { build: build.name, profile });
        expect(result.glError).toBe(0); expect(result.disjoint).toBe(false);
        if (result.rawGpuMs.length) expect(result.rawGpuMs).toHaveLength(24);
        rows.push(result);
        await capture(page, `${build.name}-${profile}.png`);
      }
    } finally { await context.close(); }
  }
  for (const row of rows) {
    expect(row.camera).toEqual(rows[0].camera); expect(row.quaternion).toEqual(rows[0].quaternion); expect(row.bob).toEqual(rows[0].bob);
  }
  await writeFile(resolve(directory, 'comparison.json'), JSON.stringify({
    scope: 'Frozen production Level 1; same CSS viewport/camera/actor, DIFFERENT drawing buffers and visual quality. Not gameplay FPS or same-quality shader evidence. Warmup excluded; 24 full WebGL render queries per row.',
    hashes, rows, errors }, null, 2));
  expect(errors).toEqual([]);
});
