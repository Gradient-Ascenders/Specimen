import { finishOpening } from '../helpers/OpeningHandoff.ts';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './fixtures.ts';

// Read-only production instrumentation; no globals are added to shipped code.
// Frozen camera controls establish pass attribution, not interactive FPS.
test.use({ actionTimeout: 60_000, viewport: { width: Number(process.env.GEL_CAPTURE_WIDTH ?? 640),
  height: Number(process.env.GEL_CAPTURE_HEIGHT ?? 360) },
  deviceScaleFactor: Number(process.env.GEL_CAPTURE_DPR ?? 1) });

test('gel modes bound transmission work and resources at identical production poses', async ({ page, browser }) => {
  test.setTimeout(600_000);
  const out = resolve('artifacts/evidence/issue-188');
  await mkdir(out, { recursive: true });
  const errors: string[] = [];
  const sourceAssetHashes: Record<string, string> = {};
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/i.test(e.text())) errors.push(e.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', r => errors.push(r.url()));
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    sourceAssetHashes[new URL(route.request().url()).pathname] = createHash('sha256').update(source).digest('hex');
    const body = source.replace(/([A-Za-z_$][\w$]*)\.gelRendering\.setMode\(/g,
      '(globalThis.__gelLayer=$1).gelRendering.setMode(');
    await route.fulfill({ response, body });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 240_000 });
  console.info('Production startup ready');
  await page.locator('[data-action="start"]').click();
  await finishOpening(page);
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await page.keyboard.press('KeyP');
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'paused');
  await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
  await page.locator('[data-setting="gel-rendering"]').selectOption('minimum');
  expect(await page.evaluate(() => (window as any).__gelLayer.gelRendering.value)).toBe('minimum');
  await page.locator('[data-setting="gel-rendering"]').selectOption('physical');
  await page.evaluate(() => (window as any).__gelLayer.setAnimationLoop(null));
  await page.addStyleTag({ content: '.game-flow { visibility: hidden !important; }' });
  console.info('Camera and simulation frozen; comparing gel modes');

  const rows: any[] = [];
  // Return to the same physical baseline to expose drift and resource growth.
  for (const mode of ['physical', 'reduced-transmission', 'minimum', 'physical', 'minimum'] as const) {
    const row = await page.evaluate(async mode => {
      const layer = (window as any).__gelLayer, renderer = layer.renderer;
      const gl = renderer.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      layer.gelRendering.setMode(mode);
      // Warm the selected surface variant and resolve any prior GPU work.
      for (let i = 0; i < 3; i++) layer.render();
      gl.finish();
      const renderDirect = renderer.renderBufferDirect;
      const blit = gl.blitFramebuffer, mipmap = gl.generateMipmap;
      const counts: Record<string, number> = {};
      const operations = { resolves: 0, mipmaps: 0 };
      const targets = new Map<any, { width: number; height: number; samples: number }>();
      const queries: { scope: string; query: WebGLQuery }[] = [];
      let active: string | undefined;
      let recording = false;
      const end = () => { if (active && ext) gl.endQuery(ext.TIME_ELAPSED_EXT); active = undefined; };
      const scope = (name: string) => {
        if (!recording || active === name) return;
        end(); active = name;
        if (ext) {
          const query = gl.createQuery()!;
          queries.push({ scope: name, query });
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        }
      };
      renderer.renderBufferDirect = function(...args: any[]) {
        const material = args[3], target = renderer.getRenderTarget();
        const transmission = target?.samples >= 4 && target.texture.generateMipmaps;
        if (transmission) targets.set(target, { width: target.width, height: target.height, samples: target.samples });
        const character = /^(Bob|Goop|Volt)-/.test(material.name);
        const name = material.isMeshDepthMaterial || material.isMeshDistanceMaterial ? 'shadows'
          : `${transmission ? 'transmission' : 'screen'}-${character ? 'character' : 'environment'}`;
        if (recording) counts[name] = (counts[name] ?? 0) + 1;
        scope(name);
        return renderDirect.apply(this, args);
      };
      gl.blitFramebuffer = function(...args: any[]) {
        if (recording) operations.resolves++;
        scope('resolve-mipmap'); return blit.apply(this, args);
      };
      gl.generateMipmap = function(...args: any[]) {
        if (recording) operations.mipmaps++;
        scope('resolve-mipmap'); return mipmap.apply(this, args);
      };
      try {
        // Independently time full frames; pass queries are sequential, never nested.
        for (let i = 0; i < 6; i++) {
          if (ext) {
            const query = gl.createQuery()!; queries.push({ scope: 'full-frame', query });
            gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          }
          layer.render();
          if (ext) gl.endQuery(ext.TIME_ELAPSED_EXT);
        }
        recording = true;
        layer.render(); end(); recording = false;
        const deadline = performance.now() + 30_000;
        while (queries.some(({ query }) => !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))) {
          if (performance.now() > deadline) throw new Error('GPU timer query timeout');
          await new Promise(requestAnimationFrame);
        }
        const disjoint = ext ? Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT)) : false;
        const timings: Record<string, number[]> = {};
        if (!disjoint) for (const { scope, query } of queries) {
          (timings[scope] ??= []).push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
        }
        const bodies: { name: string; transmission: number; color: number }[] = [];
        const seen = new Set();
        layer.scene.traverse((o: any) => {
          for (const m of o.material ? Array.isArray(o.material) ? o.material : [o.material] : []) {
            if (m.isMeshPhysicalMaterial && /^(Bob|Goop|Volt)-(Gel|Golden)/.test(m.name) && !seen.has(m)) {
              seen.add(m); bodies.push({ name: m.name, transmission: m.transmission, color: m.color.getHex() });
            }
          }
        });
        // A canvas read also rejects blank captures. Render immediately before readback.
        layer.render();
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(renderer.domElement, 0, 0, 64, 36);
        const rgba = ctx.getImageData(0, 0, 64, 36).data;
        const colors = new Set(); for (let i = 0; i < rgba.length; i += 4) colors.add(`${rgba[i]},${rgba[i+1]},${rgba[i+2]}`);
        return { mode, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          timerSupported: Boolean(ext), disjoint, timings, counts, operations, targets: [...targets.values()],
          diagnostics: layer.getDiagnostics(), bodies, registrations: layer.gelRendering.materialCount,
          camera: { position: layer.cameraRig.camera.position.toArray(), quaternion: layer.cameraRig.camera.quaternion.toArray() },
          glError: gl.getError(), distinctColors: colors.size };
      } finally {
        end(); for (const { query } of queries) gl.deleteQuery(query);
        renderer.renderBufferDirect = renderDirect; gl.blitFramebuffer = blit; gl.generateMipmap = mipmap;
      }
    }, mode);
    rows.push(row);
    await writeFile(resolve(out, 'comparison.json'), JSON.stringify({
      scope: 'Frozen production Level 1, identical camera/actors/buffer. Software rendering is correctness evidence only. Pass timings are one frame and full-frame timings are six independent queries; sum pass segments by scope.',
      browserVersion: browser.version(), sourceAssetHashes, rows, errors }, null, 2));
    console.info(`${mode}: ${row.counts['transmission-environment'] ?? 0} transmission environment draws`);
    await page.screenshot({ path: resolve(out, `${rows.length}-${mode}.png`) });
    expect(row.glError).toBe(0);
    expect(row.distinctColors).toBeGreaterThan(32);
    expect(row.bodies.length).toBeGreaterThan(0);
    if (mode === 'minimum') {
      expect(row.bodies.every((body: any) => body.transmission === 0)).toBe(true);
      expect(row.counts['transmission-environment'] ?? 0).toBe(0);
      expect(row.targets).toHaveLength(0);
      expect(row.operations).toEqual({ resolves: 0, mipmaps: 0 });
    } else {
      expect(row.counts['transmission-environment']).toBeGreaterThan(0);
      expect(row.targets.length).toBeGreaterThan(0);
    }
  }
  const [physical, reduced, minimum, physicalAgain, minimumAgain] = rows;
  expect(reduced.targets[0].width).toBe(Math.floor(physical.targets[0].width / 2));
  expect(reduced.targets[0].height).toBe(Math.floor(physical.targets[0].height / 2));
  for (const row of rows) {
    expect(row.camera).toEqual(physical.camera);
    expect([row.diagnostics.drawingBufferWidth, row.diagnostics.drawingBufferHeight])
      .toEqual([physical.diagnostics.drawingBufferWidth, physical.diagnostics.drawingBufferHeight]);
    expect(row.registrations).toBe(physical.registrations);
    expect(row.counts['screen-environment']).toBe(physical.counts['screen-environment']);
  }
  expect(physicalAgain.diagnostics.textures).toBe(physical.diagnostics.textures);
  expect(minimumAgain.diagnostics.textures).toBe(minimum.diagnostics.textures);
  expect(physicalAgain.diagnostics.programs).toBe(minimumAgain.diagnostics.programs);
  expect(errors).toEqual([]);
});
