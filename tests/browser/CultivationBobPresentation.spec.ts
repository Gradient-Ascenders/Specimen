import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

interface CultivationRuntimeProbe {
  readonly resources?: {
    readonly bobPresentation: {
      readonly ready: boolean;
      readonly root: {
        readonly name: string;
        readonly parent: unknown;
        traverse(visitor: (object: { readonly isMesh?: boolean; readonly castShadow?: boolean }) => void): void;
      };
      readonly diagnostics: {
        readonly visible: boolean;
        readonly locomotionStrength: number;
        readonly asset?: {
          readonly bodyTriangles: number;
          readonly eyeTriangles: number;
          readonly drawCalls: number;
          readonly geometries: number;
          readonly materials: number;
          readonly bodyMorphTargets: number;
          readonly eyeMorphTargets: number;
        };
        readonly deathBurst: {
          readonly active: boolean;
          readonly elapsedSeconds: number;
        };
        readonly materials?: {
          readonly selfLit: boolean;
          readonly reflectionMapName?: string;
          readonly targetBodyReflectionIntensity: number;
          readonly targetEyeReflectionIntensity: number;
        };
      };
    };
    readonly bobReflectionEnvironment: {
      readonly diagnostics: { readonly disposed: boolean };
    };
    readonly manager: { readonly activeSlimeId?: string };
    readonly pair: {
      readonly bobBody: {
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
        teleport(position: { readonly x: number; readonly y: number; readonly z: number }): void;
      };
      readonly goopBody: {
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
      };
    };
    readonly goopPresentation: { readonly diagnostics: { readonly visible: boolean } };
    readonly pairPresentation: {
      readonly root: {
        getObjectByName(name: string): { readonly visible: boolean } | undefined;
      };
    };
  };
  readonly state: string;
  load(): void;
  start(): void;
  stop(): void;
  unload(): void;
  restartLevel(): void;
  preparePresentation(): Promise<void>;
}

const exposeCultivationRuntime = async (page: Page): Promise<() => void> => {
  let injectedBundleCount = 0;
  await page.route('**/assets/index-*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const construction = /return new ([A-Za-z_$][\w$]*)\.CultivationLevelRuntime\(/;
    if (!construction.test(body)) {
      await route.fulfill({ response, body });
      return;
    }
    injectedBundleCount += 1;
    await route.fulfill({
      response,
      body: body.replace(
        construction,
        'return globalThis.__specimenCultivationRuntime=new $1.CultivationLevelRuntime(',
      ),
    });
  });

  return () => expect(
    injectedBundleCount,
    'The Cultivation runtime was not exposed exactly once',
  ).toBe(1);
};

const enterCultivation = async (page: Page): Promise<void> => {
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({
    timeout: 120_000,
  });
  await page.locator('[data-action="start"]').click();
  await page.keyboard.press('F2');
  await page.locator('[data-action="complete-level"]').click();
  const enterLevel = page.locator('[data-action="enter-level"]');
  await expect(enterLevel).toBeVisible({ timeout: 180_000 });
  await enterLevel.click();
  await expect(page.locator('.cultivation-test-panel')).toBeAttached();
};

test('Cultivation mounts the prepared shared Bob character presentation', async ({
  page,
}) => {
  // Two full Cultivation constructions can exceed five minutes under the
  // repository's software-WebGL browser while PMREM/program work is cold.
  test.setTimeout(600_000);
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  const assertRuntimeExposed = await exposeCultivationRuntime(page);
  await enterCultivation(page);
  assertRuntimeExposed();

  const entryLayoutPrepared = await page.evaluate(() => {
    const runtime = (window as any).__specimenCultivationRuntime;
    const queue = runtime.preparationQueue;
    const entry = queue.configurations.find((configuration: any) => configuration.z === 0);
    return entry.ready && entry.lightingKey === queue.lightingKey(runtime.renderLayer.scene);
  });
  expect(entryLayoutPrepared, 'live startup priming must use the prepared entry light signature').toBe(true);

  const presentation = await page.evaluate(() => {
    const runtime = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime;
    const bob = runtime?.resources?.bobPresentation;
    return bob
      ? { ready: bob.ready, rootName: bob.root.name, asset: bob.diagnostics.asset }
      : undefined;
  });

  expect(presentation).toEqual({
    ready: true,
    rootName: 'player-slime-bob-presentation',
    asset: {
      bodyTriangles: 3_264,
      eyeTriangles: 504,
      drawCalls: 3,
      geometries: 3,
      materials: 2,
      bodyMorphTargets: 7,
      eyeMorphTargets: 11,
    },
  });
  const initialBobPosition = await page.evaluate(() => {
    const position = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime?.resources?.pair.bobBody.position;
    if (!position) throw new Error('Missing Cultivation Bob body');
    return { x: position.x, y: position.y, z: position.z };
  });
  await page.keyboard.down('w');
  await page.waitForFunction(() => {
    const runtime = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime;
    return (runtime?.resources?.bobPresentation.diagnostics.locomotionStrength ?? 0) > 0.05;
  });
  await page.keyboard.up('w');
  const movingBob = await page.evaluate(() => {
    const resources = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime?.resources;
    if (!resources) throw new Error('Missing Cultivation resources');
    return {
      activeSlimeId: resources.manager.activeSlimeId,
      locomotionStrength: resources.bobPresentation.diagnostics.locomotionStrength,
      bobPosition: { ...resources.pair.bobBody.position },
      goopPosition: { ...resources.pair.goopBody.position },
    };
  });
  expect(movingBob.activeSlimeId).toBe('bob');
  expect(movingBob.locomotionStrength).toBeGreaterThan(0.05);
  expect(Math.hypot(
    movingBob.bobPosition.x - initialBobPosition.x,
    movingBob.bobPosition.y - initialBobPosition.y,
    movingBob.bobPosition.z - initialBobPosition.z,
  )).toBeGreaterThan(0.01);

  await page.keyboard.press('Tab');
  await page.waitForFunction(() => (
    window as Window & { __specimenCultivationRuntime?: CultivationRuntimeProbe }
  ).__specimenCultivationRuntime?.resources?.manager.activeSlimeId === 'goop');
  const switched = await page.evaluate(() => {
    const resources = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime?.resources;
    if (!resources) throw new Error('Missing Cultivation resources');
    return {
      activeSlimeId: resources.manager.activeSlimeId,
      bobVisible: resources.bobPresentation.diagnostics.visible,
      goopVisible:
        resources.goopPresentation.diagnostics.visible,
    };
  });
  expect(switched).toEqual({
    activeSlimeId: 'goop',
    bobVisible: true,
    goopVisible: true,
  });
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => (
    window as Window & { __specimenCultivationRuntime?: CultivationRuntimeProbe }
  ).__specimenCultivationRuntime?.resources?.manager.activeSlimeId === 'bob');

  await page.evaluate(() => {
    const body = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime?.resources?.pair.bobBody;
    if (!body) throw new Error('Missing Cultivation Bob body');
    body.teleport({ x: body.position.x, y: -30, z: body.position.z });
  });
  await expect(page.locator('.death-screen')).toBeVisible({ timeout: 10_000 });
  const death = await page.evaluate(() => {
    const bob = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime?.resources?.bobPresentation;
    if (!bob) throw new Error('Missing Cultivation Bob presentation');
    return bob.diagnostics;
  });
  expect(death.visible).toBe(false);
  expect(death.deathBurst.elapsedSeconds).toBeGreaterThan(0);
  await page.locator('.death-retry').click();
  await expect(page.locator('.death-screen')).toBeHidden();
  const retried = await page.evaluate(() => {
    const resources = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime?.resources;
    if (!resources) throw new Error('Missing Cultivation resources');
    return {
      activeSlimeId: resources.manager.activeSlimeId,
      visible: resources.bobPresentation.diagnostics.visible,
      deathBurstActive:
        resources.bobPresentation.diagnostics.deathBurst.active,
    };
  });
  expect(retried).toEqual({
    activeSlimeId: 'bob',
    visible: true,
    deathBurstActive: false,
  });

  await page.keyboard.press('5');
  await page.waitForFunction(() => {
    const materials = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime?.resources?.bobPresentation.diagnostics.materials;
    return (materials?.targetBodyReflectionIntensity ?? 0.38) < 0.38;
  });
  const darkLighting = await page.evaluate(() => {
    const bob = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime?.resources?.bobPresentation;
    if (!bob) throw new Error('Missing Cultivation Bob presentation');
    let meshCount = 0;
    let shadowCasterCount = 0;
    bob.root.traverse((object) => {
      if (!object.isMesh) return;
      meshCount += 1;
      if (object.castShadow) shadowCasterCount += 1;
    });
    return {
      materials: bob.diagnostics.materials,
      meshCount,
      shadowCasterCount,
    };
  });
  expect(darkLighting.materials).toMatchObject({
    selfLit: false,
    reflectionMapName: 'bob-laboratory-pmrem',
  });
  expect(darkLighting.materials?.targetBodyReflectionIntensity)
    .toBeGreaterThanOrEqual(0.12);
  expect(darkLighting.materials?.targetBodyReflectionIntensity)
    .toBeLessThan(0.38);
  expect(darkLighting.materials?.targetEyeReflectionIntensity)
    .toBeGreaterThanOrEqual(0.28);
  expect(darkLighting.materials?.targetEyeReflectionIntensity)
    .toBeLessThan(0.74);
  expect(darkLighting.meshCount).toBeGreaterThan(0);
  expect(darkLighting.shadowCasterCount).toBe(3); // Body and two authored eye lenses.
  expect(darkLighting.shadowCasterCount).toBeLessThan(darkLighting.meshCount); // No rupture-particle shadows.
  const disposal = await page.evaluate(() => {
    const runtime = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime;
    if (!runtime?.resources) throw new Error('Missing Cultivation runtime');
    const firstBob = runtime.resources.bobPresentation;
    const firstEnvironment = runtime.resources.bobReflectionEnvironment;
    runtime.stop();
    runtime.unload();
    const first = {
      bobReady: firstBob.ready,
      rootDetached: firstBob.root.parent === null,
      environmentDisposed: firstEnvironment.diagnostics.disposed,
      state: runtime.state,
    };
    runtime.load();
    const secondBob = runtime.resources!.bobPresentation;
    const secondEnvironment = runtime.resources!.bobReflectionEnvironment;
    runtime.unload();
    return {
      first,
      second: {
        bobReady: secondBob.ready,
        rootDetached: secondBob.root.parent === null,
        environmentDisposed: secondEnvironment.diagnostics.disposed,
        state: runtime.state,
      },
    };
  });
  expect(disposal).toEqual({
    first: {
      bobReady: false,
      rootDetached: true,
      environmentDisposed: true,
      state: 'unloaded',
    },
    second: {
      bobReady: false,
      rootDetached: true,
      environmentDisposed: true,
      state: 'unloaded',
    },
  });
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('Cultivation draws Room 5 immediately after load and teleport with valid live PCF maps', async ({ page }) => {
  test.setTimeout(600_000);
  const assertExposed = await exposeCultivationRuntime(page);
  await enterCultivation(page); assertExposed();
  await page.waitForFunction(() => (window as any).__specimenCultivationRuntime?.state === 'running', undefined, { timeout: 240_000 });
  const consoleErrors: string[] = [];
  const samplerWarnings: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (/GL_INVALID_OPERATION|sampler.*(?:mismatch|texture)|texture.*(?:mismatch|sampler)/i.test(message.text())) {
      samplerWarnings.push(message.text());
    }
  });
  const draws = await page.evaluate(() => {
    const r = (window as any).__specimenCultivationRuntime;
    const renderer = r.renderLayer.renderer, gl = renderer.getContext();
    r.stop(); r.unload();
    const stats = {
      fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 0, frameDeltaSeconds: 0,
      stepsThisFrame: 0, interpolationAlpha: 0, droppedSimulationTimeSeconds: 0, renderFps: 60,
    };
    const draws = [];
    // Repeat on a fresh resource generation, with no preparation or encounter
    // update between load, the debug teleport and the first actual WebGL draw.
    for (let generation = 0; generation < 2; generation++) {
      r.load();
      if (!r.teleportToAuthoredPreviewRoom(5)) throw new Error('Room 5 teleport failed');
      const room = r.resources.authoredPreview.roomFive;
      const lights: any[] = [];
      room.root.traverse((o: any) => {
        if (o.isSpotLight && o.name.endsWith('-search-light')) lights.push(o);
      });
      const before = lights.map(light => ({ map: light.shadow.map === null, intensity: light.intensity }));
      // Clear prior-context errors so the assertions measure this first draw.
      for (let i = 0; i < 100 && gl.getError() !== gl.NO_ERROR; i++) { /* drain */ }
      r.render(0, stats);
      const firstDraw = {
        visible: room.root.visible, before, error: gl.getError(),
        allocated: lights.filter(light => light.shadow.map?.depthTexture?.isDepthTexture).length,
        pending: lights.filter(light => light.shadow.needsUpdate).length,
      };
      r.resources.roomFiveEncounter.reset();
      const resetMaps = lights.map(light => light.shadow.map);
      const resetPending = lights.filter(light => light.shadow.needsUpdate || light.shadow.autoUpdate).length;
      r.render(0, stats);
      draws.push({ ...firstDraw, resetPending, resetError: gl.getError(),
        reused: lights.every((light, i) => light.shadow.map === resetMaps[i]) });
      r.unload();
    }
    return draws;
  });
  expect(draws).toEqual(Array.from({ length: 2 }, () => ({
    visible: true,
    before: Array.from({ length: 9 }, () => ({ map: true, intensity: 0 })),
    error: 0, allocated: 9, pending: 0, resetPending: 0, resetError: 0, reused: true,
  })));
  expect(consoleErrors).toEqual([]);
  expect(samplerWarnings).toEqual([]);
});

test('Cultivation draws prepared room and fade shadow variants without creating programs', async ({page}) => {
  test.setTimeout(600_000);
  const assertExposed = await exposeCultivationRuntime(page);
  await enterCultivation(page); assertExposed();
  await page.evaluate(() => {
    const r = (window as any).__specimenCultivationRuntime;
    r.stop();
    r.__coldDraws = [];
    const layer = r.renderLayer, draw = layer.render.bind(layer);
    layer.render = () => {
      const before = layer.renderer.info.programs.length;
      draw();
      const after = layer.renderer.info.programs.length;
      if (after > before) r.__coldDraws.push({
        before, after, room: r.__probeRoom, opacity: r.__probeOpacity,
        programs: layer.renderer.info.programs.slice(before).map((p: any) => ({name: p.name, key: p.cacheKey})),
      });
      r.__lastDraw = performance.now();
    };
  });
  for (const room of [1,2,3,4,5,1]) {
    const before = await page.evaluate(roomId => {
      const r = (window as any).__specimenCultivationRuntime;
      r.__lastDraw = 0; r.__probeRoom = roomId; r.__probeOpacity = 1; r.teleportToAuthoredPreviewRoom(roomId); return performance.now();
    }, room);
    await page.waitForFunction(start => (window as any).__specimenCultivationRuntime.__lastDraw > start, before, {timeout:120_000});
    await page.evaluate(() => {
      const r = (window as any).__specimenCultivationRuntime, bob = r.resources.bobPresentation;
      for (const opacity of [0.5,0,1]) {
        r.__probeOpacity = opacity;bob.setOpacity(opacity);
        r.renderLayer.renderer.compile(r.preparationLightState,r.renderLayer.cameraRig.camera,r.renderLayer.scene);
        r.renderLayer.render();
      }
    });
  }
  // Return to the already prepared maintenance sector. With no isolated work,
  // steady frames must not repeatedly traverse the scene to rebuild light state.
  await page.evaluate(() => {
    const r = (window as any).__specimenCultivationRuntime;
    r.teleportToAuthoredPreviewRoom(5);
    r.__restoreLightStateCalls = 0;
    r.__compileBeforeProbe = r.renderLayer.renderer.compile;
    r.renderLayer.renderer.compile = function(...args: any[]) {
      if (args[0] === r.preparationLightState) r.__restoreLightStateCalls++;
      return r.__compileBeforeProbe.apply(this, args);
    };
    r.__drawBeforeProbe = r.__lastDraw;
  });
  await page.waitForTimeout(500);
  const maintenance = await page.evaluate(() => {
    const r = (window as any).__specimenCultivationRuntime;
    r.renderLayer.renderer.compile = r.__compileBeforeProbe;
    return {calls:r.__restoreLightStateCalls, drawn:r.__lastDraw > r.__drawBeforeProbe};
  });
  expect(maintenance.drawn).toBe(true);
  expect(maintenance.calls).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => (window as any).__specimenCultivationRuntime.__coldDraws)).toEqual([]);
});

test('Cultivation background compilation and primers preserve active lighting and shadows', async ({page}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  const assertExposed = await exposeCultivationRuntime(page);
  await enterCultivation(page); assertExposed();
  const result = await page.evaluate(async () => {
    const r = (window as any).__specimenCultivationRuntime;
    r.stop();
    const renderer = r.renderLayer.renderer;
    renderer.setAnimationLoop(null);
    const queue = r.preparationQueue;
    const config = queue.configurations.find((c: any) => !c.ready && c.visible[5] && !c.visible[7]);
    if (!config) throw new Error('Missing a distinct unprepared background layout');
    const stats = {fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:0,frameDeltaSeconds:0,
      stepsThisFrame:0,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
    // Freeze simulation and presentation time. The live draw must stay byte-identical
    // while preparation uses other lights, materials, render targets and samplers.
    const gl = renderer.getContext();
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const read = () => { const pixels = new Uint8Array(width*height*4);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels); return pixels; };
    const draw = () => { r.render(1,stats); return read(); };
    const tick = queue.tick;
    queue.tick = () => {};
    // Finish an already submitted batch, then drive preparation explicitly.
    // runtime.render's ordinary tail tick must not be counted as a live draw.
    while (queue.busy) await new Promise(resolve => setTimeout(resolve, 16));
    const baseline = draw(), repeat = draw();
    let litPixels = 0, minChannel = 255, maxChannel = 0;
    for (let i = 0; i < baseline.length; i += 4) {
      const brightness = Math.max(baseline[i], baseline[i + 1], baseline[i + 2]);
      if (brightness > 8) litPixels++;
      minChannel = Math.min(minChannel, brightness);
      maxChannel = Math.max(maxChannel, brightness);
    }
    // Reject black/blank captures before comparing preparation against them.
    if (litPixels < width * height * 0.01 || maxChannel - minChannel < 16) {
      throw new Error(`Empty baseline framebuffer: ${litPixels} lit pixels, range ${minChannel}–${maxChannel}`);
    }
    let livePrograms = 0;
    const liveDraw = r.renderLayer.render;
    r.renderLayer.render = function(...args: any[]) {
      const before = renderer.info.programs.length;
      const result = liveDraw.apply(this,args);
      livePrograms += renderer.info.programs.length - before;
      return result;
    };
    const difference = (a: Uint8Array,b: Uint8Array) => {
      let maximum=0; for(let i=0;i<a.length;i++) maximum=Math.max(maximum,Math.abs(a[i]!-b[i]!)); return maximum;
    };
    const shadowState = () => [renderer.shadowMap.enabled,renderer.shadowMap.type,
      renderer.shadowMap.autoUpdate,renderer.shadowMap.needsUpdate];
    const beforeState = JSON.stringify(shadowState());
    const lights = () => {
      const entries: unknown[] = [];
      r.renderLayer.scene.traverseVisible((object: any) => {
        if (object.isLight) entries.push([object.uuid,object.intensity,object.color.toArray(),
          object.castShadow,object.shadow?.map?.uuid]);
      });
      return JSON.stringify(entries);
    };
    const beforeLights = lights();
    const iterator = queue.steps(config);
    let compiles=0, primers=0, maxPixelDifference=difference(baseline,repeat);
    const stateChanges: string[] = [], glErrors: number[] = [];
    try {
      for(let count=0;count<5000;count++) {
        const step=iterator.next(); if(step.done) break;
        const promise=step.value.run();
        const isolated = /compile|prime/.test(step.value.label ?? '');
        if(isolated) {
          if(JSON.stringify(shadowState())!==beforeState) stateChanges.push(step.value.label);
          maxPixelDifference=Math.max(maxPixelDifference,difference(baseline,draw()));
          const error=gl.getError(); if(error!==gl.NO_ERROR) glErrors.push(error);
        }
        await promise;
        if(isolated) {
          maxPixelDifference=Math.max(maxPixelDifference,difference(baseline,draw()));
        }
        if((step.value.label ?? '').includes('compile')) compiles++;
        if((step.value.label ?? '').includes('prime')) primers++;
        if(primers>=2) break;
      }
    } finally {
      iterator.return();
      try {
        maxPixelDifference=Math.max(maxPixelDifference,difference(baseline,draw()));
        if (lights() !== beforeLights) stateChanges.push('live lights/maps after cleanup');
        const error=gl.getError(); if(error!==gl.NO_ERROR) glErrors.push(error);
      } finally { queue.tick=tick; r.renderLayer.render=liveDraw; }
    }
    return {compiles,primers,maxPixelDifference,livePrograms,stateChanges,glErrors};
  });
  console.log("preparation isolation", result);
  expect(result.compiles).toBeGreaterThan(0);
  expect(result.primers).toBe(2);
  expect(result.stateChanges).toEqual([]);
  expect(result.glErrors).toEqual([]);
  expect(result.livePrograms).toBe(0);
  expect(result.maxPixelDifference).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});


test('Cultivation zero-radiance guards preserve Bob and Goop room pixels', async ({page}) => {
  test.setTimeout(600_000);
  const assertExposed = await exposeCultivationRuntime(page);
  await enterCultivation(page); assertExposed();
  await page.waitForFunction(() => (window as any).__specimenCultivationRuntime?.state === 'running', undefined, {timeout:240_000});
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const results = await page.evaluate(async () => {
    const r = (window as any).__specimenCultivationRuntime, layer = r.renderLayer;
    const renderer = layer.renderer, camera = layer.cameraRig.camera, gl = renderer.getContext();
    layer.setAnimationLoop(null);
    const queue = r.preparationQueue, tick = queue.tick; queue.tick = () => {};
    while (queue.busy) await new Promise(resolve => setTimeout(resolve, 16));
    const stats = {fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:0,frameDeltaSeconds:0,
      stepsThisFrame:0,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
    const draw = () => {
      r.cameraShadowCulling.prepare(camera);
      try { renderer.render(layer.scene,camera); } finally { r.cameraShadowCulling.restore(); }
    };
    const read = () => {
      const pixels = new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
      gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return pixels;
    };
    const results = [];
    try {
      for (const [room,slime] of [[1,'bob'],[5,'goop']] as const) {
        r.resources.manager.activate(slime); r.teleportToAuthoredPreviewRoom(room); r.render(1,stats);
        if (queue.diagnostics.pending) {
          queue.tick=tick;
          const deadline=performance.now()+240_000;
          try {
            while (queue.diagnostics.pending) {
              if (performance.now()>deadline) throw new Error('Pixel control preparation timed out');
              await new Promise(resolve=>setTimeout(resolve,16)); r.render(1,stats);
            }
          } finally {queue.tick=()=>{};}
          while (queue.busy) await new Promise(resolve=>setTimeout(resolve,16));
          r.render(1,stats);
        }
        draw(); const baseline = read();
        let lit = 0, min = 255, max = 0;
        for (let i=0;i<baseline.length;i+=4) {
          const value = Math.max(baseline[i],baseline[i+1],baseline[i+2]);
          if (value>8) lit++; min=Math.min(min,value); max=Math.max(max,value);
        }
        if (lit<baseline.length/4*.01 || max-min<16) throw new Error('Blank lighting control baseline');
        const materials = new Set<any>(), group = layer.scene.clone(false);
        layer.scene.traverseVisible((o: any) => {
          if (!o.isMesh) return; group.add(o.clone(false));
          for (const m of Array.isArray(o.material)?o.material:[o.material])
            if (m.customProgramCacheKey().includes(':finite-light-branch-v4')) materials.add(m);
        });
        let removed = 0;
        const saved = [...materials].map(m => [m,m.onBeforeCompile,m.customProgramCacheKey]);
        try {
          for (const [m,hook,key] of saved) {
            m.onBeforeCompile = function(shader: any, renderer: any) {
              hook.call(this,shader,renderer);
              for (const [kind,v] of [['Point','pointLight'],['Spot','spotLight']]) {
                const call = 'get'+kind+'LightInfo( '+v+', geometryPosition, directLight );';
                const block = 'if ( any( notEqual( '+v+'.color, vec3( 0.0 ) ) ) ) {\n      '+call+'\n    } else {\n      directLight.color = vec3( 0.0 );\n      directLight.direction = vec3( 0.0 );\n      directLight.visible = false;\n    }';
                removed += shader.fragmentShader.split(block).length-1;
                shader.fragmentShader = shader.fragmentShader.replaceAll(block,call);
              }
            };
            const controlKey = key.call(m)+':unguarded-pixel-control';
            m.customProgramCacheKey=()=>controlKey; m.needsUpdate=true;
          }
          await renderer.compileAsync(group,camera,layer.scene); draw();
          const control = read(); let difference = 0;
          for (let i=0;i<baseline.length;i++) difference=Math.max(difference,Math.abs(baseline[i]-control[i]));
          results.push({room,slime,lit,removed,difference,error:gl.getError()});
        } finally {
          for (const [m,hook,key] of saved) {m.onBeforeCompile=hook;m.customProgramCacheKey=key;m.needsUpdate=true;}
          group.clear();
        }
      }
    } finally {queue.tick=tick;}
    return results;
  });
  console.log('zero-radiance pixel controls',results);
  expect(results).toHaveLength(2);
  for (const result of results) {
    expect(result.removed).toBeGreaterThan(0);
    expect(result.difference).toBeLessThanOrEqual(1);
    expect(result.error).toBe(0);
  }
  expect(errors).toEqual([]);
});
