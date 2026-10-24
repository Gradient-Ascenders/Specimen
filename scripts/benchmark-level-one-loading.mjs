import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {chromium} from '@playwright/test';
import {GRAPHICS_PROFILES} from '../src/render/GraphicsProfiles.ts';

const {values} = parseArgs({options: {
  url: {type: 'string', default: process.env.SPECIMEN_PRODUCTION_URL ?? 'http://127.0.0.1:4173/'},
  output: {type: 'string'}, passes: {type: 'string', default: '3'},
  channel: {type: 'string', default: 'chrome'}, headless: {type: 'boolean', default: false},
  viewport: {type: 'string'},
}});
const url = new URL(values.url), passes = Number(values.passes);
assert.ok(['http:', 'https:'].includes(url.protocol), 'Serve the production build over HTTP(S).');
assert.ok(Number.isInteger(passes) && passes >= 1 && passes <= 10, '--passes must be between 1 and 10.');
let viewport = null;
if (values.viewport) {
  const match = /^(\d+)x(\d+)$/.exec(values.viewport);
  assert.ok(match, '--viewport must have the form 1920x1080.');
  viewport = {width: Number(match[1]), height: Number(match[2])};
  assert.ok(Object.values(viewport).every(n => n >= 320 && n <= 8192), 'Invalid viewport size.');
}
const output = resolve(values.output ?? `artifacts/loading-benchmark/${new Date().toISOString().replaceAll(':', '-')}`);
await mkdir(output, {recursive: true});
const cdp = process.env.SPECIMEN_BROWSER_CDP_URL;
const report = {recordedAt: new Date().toISOString(), url: url.href,
  scope: 'Medium loading only; this is not a full assessment-PC qualification.',
  protocol: 'Unmodified production bundle, normal HTTP caching, no GPU/backend override or CPU throttling. First navigation then same-context reloads. OS/driver caches remain uncontrolled.',
  freshBrowserProcess: !cdp, requestedHeadless: values.headless, runs: []};
let browser, context;
const save = () => writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
const requireHardware = gpu => assert.ok(gpu && !/swiftshader|llvmpipe|lavapipe|softpipe|software|basic render driver|\bwarp\b/i.test(gpu),
  `Hardware rendering required; received ${gpu ?? 'an unverifiable renderer'}.`);
try {
  const manifestUrl = new URL('build-manifest.json', url);
  const response = await fetch(manifestUrl, {signal: AbortSignal.timeout(15000)});
  assert.ok(response.ok, 'A production build-manifest.json is required. Build and serve dist first.');
  report.build = await response.json();
  browser = cdp ? await chromium.connectOverCDP(cdp) : await chromium.launch({
    channel: values.channel, headless: values.headless,
    args: values.headless ? [] : ['--start-maximized'],
  });
  report.browserVersion = browser.version();
  context = await browser.newContext({viewport});
  // This temporary context has its own settings and cache. Preserve the
  // ordinary title, audio, opening and readiness paths; never route the bundle.
  await context.addInitScript(settings => {
    localStorage.setItem('specimen.graphics-preferences.v1', JSON.stringify({mode: 'manual', settings}));
    const marks = window.__specimenLoadingBenchmark = {};
    document.addEventListener('click', event => {
      const action = event.target instanceof Element ? event.target.closest('[data-action]')?.getAttribute('data-action') : null;
      if (action === 'start') marks.startAt = performance.now();
      if (action === 'skip-opening') marks.skipAt = performance.now();
    }, true);
  }, GRAPHICS_PROFILES.standard.settings);
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  let errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.on('response', response => {if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);});
  for (let pass = 0; pass < passes; pass++) {
    errors = [];
    await page.goto(url.href, {waitUntil: 'domcontentloaded'});
    await page.bringToFront();
    const start = page.locator('[data-flow-panel="title"] [data-action="start"]');
    await start.waitFor({state: 'visible'});
    const titleReadyMs = await page.evaluate(() => performance.now());
    requireHardware(await page.evaluate(() => {
      const gl = document.querySelector('canvas[data-gameplay-canvas]').getContext('webgl2');
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
    }));
    await start.click();
    await page.locator('[data-action="skip-opening"]').click();
    await page.waitForFunction(() => document.querySelector('.game-flow')?.getAttribute('data-state') === 'playing' &&
      document.querySelector('#app')?.getAttribute('data-game-state') === 'playing');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const row = await page.evaluate(() => {
      const readyAt = performance.now(), marks = window.__specimenLoadingBenchmark;
      const canvas = document.querySelector('canvas[data-gameplay-canvas]'), gl = canvas.getContext('webgl2');
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return {navigationToControlMs: readyAt, startToControlMs: readyAt - marks.startAt,
        skipToControlMs: readyAt - marks.skipAt, startAt: marks.startAt, skipAt: marks.skipAt,
        gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null, glError: gl.getError(),
        userAgent: navigator.userAgent, logicalProcessors: navigator.hardwareConcurrency,
        focused: document.hasFocus(), visibility: document.visibilityState, dpr: devicePixelRatio,
        viewport: [innerWidth, innerHeight], drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        preferences: JSON.parse(localStorage.getItem('specimen.graphics-preferences.v1')),
        preparation: JSON.parse(document.querySelector('#app').dataset.levelOnePrewarm ?? 'null')};
    });
    report.runs.push({...row, pass: pass + 1, titleReadyMs, errors: [...errors]});
    await save();
    requireHardware(row.gpu);
    assert.ok(row.focused && row.visibility === 'visible', 'Keep the browser visible and focused during measurement.');
    assert.equal(row.glError, 0, 'WebGL error during loading.');
    assert.deepEqual(errors, [], 'Browser or network errors during loading.');
    for (const [key, value] of Object.entries(GRAPHICS_PROFILES.standard.settings))
      assert.equal(row.preferences.settings[key], value, `Medium setting changed: ${key}`);
    assert.equal(row.preparation?.roomStepsCompleted, 9, 'Every room and doorway must be ready.');
    assert.equal(row.preparation.measuredProgramDelta, 0);
    assert.equal(row.preparation.measuredGeometryDelta, 0);
    assert.equal(row.preparation.burstProgramDelta, 0);
    assert.equal(row.preparation.burstGeometryDelta, 0);
    console.log(`Pass ${pass + 1}: Start ${(row.startToControlMs / 1000).toFixed(2)}s; navigation ${(row.navigationToControlMs / 1000).toFixed(2)}s; ${row.gpu}`);
  }
  const finalManifest = await (await fetch(manifestUrl, {signal: AbortSignal.timeout(15000)})).json();
  assert.deepEqual(finalManifest, report.build, 'The served build changed during measurement.');
  console.log(`Loading measurements saved to ${resolve(output, 'results.json')}`);
  if (report.build.dirty) console.log('Build has uncommitted changes; treat these measurements as diagnostic evidence.');
} catch (error) {
  report.failure = String(error.stack ?? error);
  console.error(error.message ?? error);
  process.exitCode = 1;
} finally {
  await save();
  await context?.close();
  await browser?.close();
}
