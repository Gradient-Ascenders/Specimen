/** Capture Bob's production ownership, render cost and lifecycle across all levels. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDirectory = path.join(root, 'docs/evidence/issue-160');
const evidencePath = path.join(evidenceDirectory, 'measurements.json');
const url = 'http://127.0.0.1:4177/?debug=1';
const approvedAsset = {
  bodyTriangles: 3_264,
  eyeTriangles: 504,
  drawCalls: 3,
  geometries: 3,
  materials: 2,
  bodyMorphTargets: 7,
  eyeMorphTargets: 11,
};
const server = spawn(
  'npm',
  ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4177', '--strictPort'],
  { cwd: root, stdio: 'ignore' },
);

const percentile = (values, fraction) =>
  values[Math.min(values.length - 1, Math.floor(values.length * fraction))];

let browser;
try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url)).ok) break;
    } catch { /* Preview is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 99) throw new Error('Preview server did not start');
  }

  browser = await chromium.launch({
    args: [
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.setDefaultNavigationTimeout(180_000);
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });

  const exposures = { levelOne: 0, cultivation: 0, blackout: 0 };
  await page.route('**/assets/*.js', async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    const levelOne = /([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/;
    const cultivation = /return new ([A-Za-z_$][\w$]*)\.CultivationLevelRuntime\(/;
    const blackout = /export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/;
    const levelOneMatch = body.match(levelOne);
    if (levelOneMatch?.[1]) {
      exposures.levelOne += 1;
      body = body.replace(
        levelOne,
        `(globalThis.__bobLevelOne=${levelOneMatch[1]},${levelOneMatch[1]}.prepareLightingPrograms()).then(`,
      );
    }
    if (cultivation.test(body)) {
      exposures.cultivation += 1;
      body = body.replace(
        cultivation,
        'return globalThis.__bobCultivation=new $1.CultivationLevelRuntime(',
      );
    }
    const blackoutMatch = body.match(blackout);
    if (blackoutMatch?.[1]) {
      exposures.blackout += 1;
      body = body.replace(
        blackout,
        `class __BobMeasuredBlackout extends ${blackoutMatch[1]}{constructor(...args){super(...args);globalThis.__bobBlackout=this}}export{__BobMeasuredBlackout as BlackoutLevelRuntime};`,
      );
    }
    await route.fulfill({ response, body });
  });

  const sampleFrameTimes = async () => {
    const values = await page.evaluate(async () => {
      const samples = [];
      let previous = await new Promise(requestAnimationFrame);
      for (let frame = 0; frame < 12; frame += 1) {
        const current = await new Promise(requestAnimationFrame);
        samples.push(current - previous);
        previous = current;
      }
      return samples;
    });
    values.sort((a, b) => a - b);
    return {
      samples: values.length,
      p50Milliseconds: percentile(values, 0.5),
      p95Milliseconds: percentile(values, 0.95),
      maximumMilliseconds: values.at(-1),
    };
  };

  const sampleRuntime = async (runtimeName, bobPath) => {
    const snapshot = await page.evaluate(({ name, path }) => {
      const runtime = globalThis[name];
      if (!runtime?.resources) throw new Error(`Missing ${name} resources`);
      const bob = path.reduce((value, key) => value[key], runtime.resources);
      const render = runtime.renderLayer.getDiagnostics();
      return {
        asset: bob.diagnostics.asset,
        render: {
          drawCalls: render.drawCalls,
          triangles: render.triangles,
          programs: render.programs,
          geometries: render.geometries,
          textures: render.textures,
        },
      };
    }, { name: runtimeName, path: bobPath });
    snapshot.frameTime = await sampleFrameTimes();
    return snapshot;
  };

  const waitForRenderedFrames = async (count = 2) => {
    await page.evaluate(async (frameCount) => {
      for (let frame = 0; frame < frameCount; frame += 1) {
        await new Promise(requestAnimationFrame);
      }
    }, count);
  };

  const sampleLevelOneResources = async (operation, iteration) =>
    page.evaluate(({ operationName, operationIteration }) => {
      const runtime = globalThis.__bobLevelOne;
      const render = runtime.renderLayer.getDiagnostics();
      return {
        operation: operationName,
        iteration: operationIteration,
        restartCount: runtime.restartCount,
        asset: runtime.resources.testScene.bob.diagnostics.asset,
        rendererResources: {
          programs: render.programs,
          geometries: render.geometries,
          textures: render.textures,
        },
      };
    }, { operationName: operation, operationIteration: iteration });

  const exerciseLevelOneLifecycle = async () => {
    await waitForRenderedFrames();
    const initial = await sampleLevelOneResources('initial', 0);
    const retries = [];
    const restarts = [];

    for (let iteration = 1; iteration <= 3; iteration += 1) {
      const accepted = await page.evaluate((cycle) =>
        globalThis.__bobLevelOne.resources.containmentLevel.requestHazardFailure({
          roomId: 'room-3',
          hazardId: `issue-160-resource-retry-${cycle}`,
        }), iteration);
      if (!accepted) throw new Error(`Level 1 rejected retry cycle ${iteration}`);
      const retry = page.locator('.death-retry');
      await retry.waitFor({ state: 'visible', timeout: 10_000 });
      await retry.click();
      await retry.waitFor({ state: 'hidden', timeout: 10_000 });
      await page.waitForFunction(
        () => globalThis.__bobLevelOne.resources.testScene.bob.diagnostics.visible,
      );
      await waitForRenderedFrames();
      retries.push(await sampleLevelOneResources('retry', iteration));
    }

    for (let iteration = 1; iteration <= 3; iteration += 1) {
      const restartBefore = await page.evaluate(
        () => globalThis.__bobLevelOne.restartCount,
      );
      await page.evaluate(() => globalThis.__bobLevelOne.restartLevel());
      await page.waitForFunction(
        (before) => globalThis.__bobLevelOne.restartCount === before + 1,
        restartBefore,
      );
      await waitForRenderedFrames();
      restarts.push(await sampleLevelOneResources('restart', iteration));
    }

    const steadyState = retries[0];
    const steadyResourceCounts = JSON.stringify(steadyState.rendererResources);
    const stable = [initial, ...retries, ...restarts].every(
      (sample) =>
        JSON.stringify(sample.rendererResources) === steadyResourceCounts &&
        JSON.stringify(sample.asset) === JSON.stringify(approvedAsset),
    );
    return { initial, steadyState, retries, restarts, stable };
  };

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(
    () => Boolean(globalThis.__bobLevelOne?.resources?.testScene?.bob?.ready),
    null,
    { timeout: 180_000 },
  );
  console.log('Level 1 ready');
  const levelOne = await sampleRuntime('__bobLevelOne', ['testScene', 'bob']);
  console.log('sampled Level 1');
  await page.evaluate(() => {
    globalThis.__bobOwners = {
      levelOne: globalThis.__bobLevelOne.resources.testScene.bob,
    };
  });

  await page.keyboard.press('F2');
  await page.locator('[data-action="complete-level"]').click();
  let enterLevel = page.locator('[data-action="enter-level"]');
  await enterLevel.waitFor({ state: 'visible', timeout: 180_000 });
  await enterLevel.click();
  await page.waitForFunction(
    () => Boolean(globalThis.__bobCultivation?.resources?.bobPresentation?.ready),
    null,
    { timeout: 180_000 },
  );
  console.log('Level 2 ready');
  const cultivation = await sampleRuntime(
    '__bobCultivation',
    ['bobPresentation'],
  );
  console.log('sampled Level 2');
  await page.evaluate(() => {
    globalThis.__bobOwners.cultivation =
      globalThis.__bobCultivation.resources.bobPresentation;
    globalThis.__bobCultivation.resources.manager.unlock('volt');
    globalThis.__bobCultivation.events.emit('completed', {
      levelId: 'level-2',
      nextLevelId: 'level-3',
    });
  });

  enterLevel = page.locator('[data-action="enter-level"]');
  await enterLevel.waitFor({ state: 'visible', timeout: 180_000 });
  await enterLevel.click();
  await page.waitForFunction(
    () => Boolean(globalThis.__bobBlackout?.resources?.bobPresentation?.ready),
    null,
    { timeout: 180_000 },
  );
  console.log('Level 3 ready');
  const blackout = await sampleRuntime('__bobBlackout', ['bobPresentation']);
  console.log('sampled Level 3');
  const lifecycle = await page.evaluate(() => {
    const runtime = globalThis.__bobBlackout;
    const bob = runtime.resources.bobPresentation;
    const environment = runtime.resources.bobReflectionEnvironment;
    const assetBeforeRestart = bob.diagnostics.asset;
    runtime.restartLevel();
    const restartReusedPresentation = runtime.resources.bobPresentation === bob;
    const assetAfterRestart = bob.diagnostics.asset;
    globalThis.__bobOwners.blackout = bob;
    runtime.stop();
    runtime.unload();
    return {
      transitions: {
        levelOneDisposed:
          globalThis.__bobOwners.levelOne.ready === false &&
          globalThis.__bobOwners.levelOne.root.parent === null,
        cultivationDisposed:
          globalThis.__bobOwners.cultivation.ready === false &&
          globalThis.__bobOwners.cultivation.root.parent === null,
      },
      restart: {
        reusedPresentation: restartReusedPresentation,
        assetStable:
          JSON.stringify(assetBeforeRestart) === JSON.stringify(assetAfterRestart),
      },
      unload: {
        bobReady: bob.ready,
        rootDetached: bob.root.parent === null,
        environmentDisposed: environment?.diagnostics.disposed,
        runtimeState: runtime.state,
      },
    };
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(
    () => Boolean(globalThis.__bobLevelOne?.resources?.testScene?.bob?.ready),
    null,
    { timeout: 180_000 },
  );
  const repeatedLevelOneLifecycle = await exerciseLevelOneLifecycle();
  const repeatedLevelOneUnload = await page.evaluate(() => {
    const runtime = globalThis.__bobLevelOne;
    const bob = runtime.resources.testScene.bob;
    runtime.stop();
    runtime.unload();
    runtime.unload();
    return {
      bobReady: bob.ready,
      rootDetached: bob.root.parent === null,
      runtimeState: runtime.state,
    };
  });
  lifecycle.repeatedLevelOne = {
    ...repeatedLevelOneLifecycle,
    unload: repeatedLevelOneUnload,
  };
  console.log('exercised repeated Level 1 retry, restart and unload lifecycle');

  if (
    exposures.levelOne !== 2 ||
    exposures.cultivation !== 2 ||
    exposures.blackout !== 1
  ) {
    throw new Error(`Unexpected runtime exposure counts: ${JSON.stringify(exposures)}`);
  }
  for (const [level, sample] of Object.entries({
    levelOne,
    cultivation,
    blackout,
  })) {
    if (JSON.stringify(sample.asset) !== JSON.stringify(approvedAsset)) {
      throw new Error(
        `${level} did not use the approved Bob asset: ${JSON.stringify(sample.asset)}`,
      );
    }
  }
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(JSON.stringify({ consoleErrors, failedRequests }));
  }
  if (
    !lifecycle.transitions.levelOneDisposed ||
    !lifecycle.transitions.cultivationDisposed ||
    !lifecycle.restart.reusedPresentation ||
    !lifecycle.restart.assetStable ||
    !lifecycle.repeatedLevelOne.stable ||
    lifecycle.repeatedLevelOne.unload.bobReady ||
    !lifecycle.repeatedLevelOne.unload.rootDetached ||
    lifecycle.repeatedLevelOne.unload.runtimeState !== 'unloaded' ||
    lifecycle.unload.bobReady ||
    !lifecycle.unload.rootDetached ||
    !lifecycle.unload.environmentDisposed ||
    lifecycle.unload.runtimeState !== 'unloaded'
  ) {
    throw new Error(`Bob lifecycle contract failed: ${JSON.stringify(lifecycle)}`);
  }

  const evidence = {
    capturedAt: new Date().toISOString(),
    environment: {
      browser: 'Playwright Chromium',
      viewportCssPixels: [960, 600],
      renderer: 'software WebGL in the Codex workspace',
      representativeHardwareProfiled: false,
    },
    levels: { levelOne, cultivation, blackout },
    lifecycle,
    consoleErrors,
    failedRequests,
  };
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, evidencePath)}`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
