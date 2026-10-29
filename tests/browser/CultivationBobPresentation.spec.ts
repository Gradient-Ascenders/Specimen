import { graphicsPreparationKey, GRAPHICS_PROFILES } from '../../src/render/GraphicsProfiles.ts';
import { writeFile } from 'node:fs/promises';
import { finishOpening } from '../helpers/OpeningHandoff.ts';
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
      ).replace(/([\w$]+)=new ([\w$]+)\(\{initialRuntime:/,
        '$1=globalThis.__specimenSession=new $2({initialRuntime:'),
    });
  });

  return () => expect(
    injectedBundleCount,
    'The Cultivation runtime was not exposed exactly once',
  ).toBe(1);
};

const prepareGraphics = (page: Page, preset: 'normal' | 'performance') => page.evaluate(async ({preset,key}) => {
  const r=(window as any).__specimenCultivationRuntime, session=(window as any).__specimenSession;
  session.applyGraphicsSettings(key,()=>r.renderLayer.setGraphicsSettings({
    graphicsProfile:'standard',customGraphicsProfile:true,pixelBudget:2073600,shadowMapSizeCap:1024,effectsDensity:1,graphicsPreset:preset,renderPixelRatioCap:preset==='performance'?0.75:2,
    renderScale:1,gelRenderingMode:'physical',
  }));
  await session.graphicsPreparation.settled;
  if (session.graphicsPreparation.pending) throw session.graphicsPreparation.failure ?? new Error('Graphics preparation did not finish');
},{preset,key:graphicsPreparationKey({...GRAPHICS_PROFILES.standard.settings,gelRenderingMode:'physical'})});

const enterCultivation = async (page: Page): Promise<void> => {
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({
    timeout: 120_000,
  });
  await page.locator('[data-action="start"]').click();
  await finishOpening(page);
  await page.keyboard.press('F2');
  await page.locator('[data-action="complete-level"]').click();
  const enterLevel = page.locator('[data-action="enter-level"]');
  await expect(enterLevel).toBeVisible({ timeout: 180_000 });
  await enterLevel.click();
  await expect(page.locator('.cultivation-test-panel')).toBeAttached();
};

test('changing gel features through Settings prepares before the next live Cultivation draw', async ({page}) => {
  test.setTimeout(600_000);
  await exposeCultivationRuntime(page); await enterCultivation(page);
  await page.evaluate(() => {
    const rt=(window as any).__specimenCultivationRuntime, layer=rt.renderLayer;
    rt.__graphicsColdDraws=[]; rt.__graphicsColdInspections=[];
    const gl=layer.renderer.getContext(), inspect=gl.getProgramInfoLog.bind(gl);let live=false;
    gl.getProgramInfoLog=(program:any)=>{if(live) rt.__graphicsColdInspections.push(layer.renderer.info.programs.find((p:any)=>p.program===program)?.cacheKey);return inspect(program);};
    const render=layer.render.bind(layer);
    layer.render=()=>{const before=layer.renderer.info.programs.length;live=true;try{render();}finally{live=false;}
      if(layer.renderer.info.programs.length>before) rt.__graphicsColdDraws.push(layer.renderer.info.programs.slice(before).map((p:any)=>p.cacheKey));};
  });
  await page.keyboard.press('KeyP');
  await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
  await page.locator('[data-setting="graphics-profile"]').selectOption('standard');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
  await page.waitForFunction(()=>!(window as any).__specimenCultivationRuntime.preparationQueue.diagnostics.pending);
  await page.waitForTimeout(500);
  expect(await page.evaluate(()=>(window as any).__specimenCultivationRuntime.__graphicsColdDraws)).toEqual([]);
  expect(await page.evaluate(()=>(window as any).__specimenCultivationRuntime.__graphicsColdInspections)).toEqual([]);
});

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
    return runtime.lightLayout.withLayout(runtime.renderLayer.scene, runtime.renderLayer.cameraRig.camera,
      runtime.resources.pair.activeBody.position,
      () => entry.ready && entry.lightingKey === queue.lightingKey(runtime.renderLayer.scene));
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

for (const preset of ['normal', 'performance'] as const) {
test(`Cultivation draws prepared room and fade shadow variants without creating programs (${preset})`, async ({page}) => {
  test.setTimeout(600_000);
  const assertExposed = await exposeCultivationRuntime(page);
  await enterCultivation(page); assertExposed();
  await prepareGraphics(page,preset);
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
        // Manual fade draws must use the same bounded layout as runtime.render;
        // authored layer masks are deliberately restored between real frames.
        r.lightLayout.withLayout(r.renderLayer.scene,r.renderLayer.cameraRig.camera,r.resources.pair.activeBody.position,()=>{
          r.renderLayer.renderer.compile(r.preparationLightState,r.renderLayer.cameraRig.camera,r.renderLayer.scene);
          r.renderLayer.render();
        });
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
}

test('Cultivation bounds actual render lights across rooms, characters, power cycles and teardown', async ({page}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const assertExposed = await exposeCultivationRuntime(page);
  await enterCultivation(page); assertExposed();
  const result = await page.evaluate(async () => {
    const r = (window as any).__specimenCultivationRuntime, resources = r.resources;
    const layer = r.renderLayer, renderer = layer.renderer, scene = layer.scene, camera = layer.cameraRig.camera;
    renderer.setAnimationLoop(null); r.stop();
    const stats = {fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:0,frameDeltaSeconds:0,
      stepsThisFrame:0,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
    const rows: {points:number;spots:number;pointShadows:number;spotShadows:number;zeroAuthored:number}[] = [];
    const original = layer.render;
    layer.render = function() {
      const row = {points:0,spots:0,pointShadows:0,spotShadows:0,zeroAuthored:0};
      scene.traverseVisible((light:any) => {
        if (!light.isLight || !light.layers.test(camera.layers)) return;
        if (light.isPointLight) {row.points++; if(light.castShadow) row.pointShadows++;}
        if (light.isSpotLight) {row.spots++; if(light.castShadow) row.spotShadows++;}
        if ((light.isPointLight || light.isSpotLight) && light.intensity === 0 &&
            light.parent !== r.lightLayout.root) row.zeroAuthored++;
      });
      rows.push(row); return original.call(this);
    };
    const drawReady = async () => {
      r.render(1,stats);
      const requested = r.preparationQueue.priority;
      if (requested && !requested.ready) {await r.preparationQueue.prepareConfiguration(requested);r.render(1,stats);}
    };
    try {
      for (const room of [1,2,3,4,5]) {
        r.teleportToAuthoredPreviewRoom(room);
        for (const character of room === 5 ? ['bob','goop','volt'] : ['bob','goop']) {
          if (character === 'volt') r.registerRescuedVolt(resources);
          if (!resources.manager.activate(character) || resources.manager.activeSlimeId !== character) throw new Error('Requested actor was not activated');
          r.retargetCamera(resources);
          resources.roomFiveEncounter.update(1/60);
          await drawReady();
        }
      }
      r.teleportToAuthoredPreviewRoom(5);
      const masks: {light:any;mask:number}[] = [];
      scene.traverse((light:any) => {if(light.isLight)masks.push({light,mask:light.layers.mask});});
      const programs = [];
      for (let round=0;round<3;round++) {
        for (const state of ['red','blue','green','released','reset']) {
          const security = resources.authoredPreview.roomFive.controller.security;
          if (state === 'released') security.release(); else if (state === 'reset') security.reset(); else security.select(state);
          resources.roomFiveEncounter.update(1/60); await drawReady();
        }
        programs.push(renderer.info.programs.length);
      }
      const masksRestored = masks.every(({light,mask})=>light.layers.mask===mask);
      const restarts = [];
      for(let i=0;i<3;i++){r.restartLevel();await drawReady();restarts.push(renderer.info.programs.length);}
      const maps: {light:any;map:any;freed:number}[] = [];
      scene.traverse((light:any)=>{if(light.isLight&&light.shadow?.map)maps.push({light,map:light.shadow.map,freed:0});});
      for(const entry of maps) entry.map.addEventListener('dispose',()=>entry.freed++);
      const glError = renderer.getContext().getError();
      r.unload();
      return {rows,programs,restarts,masksRestored,glError,maps:maps.length,
        mapsReleased:maps.every(entry=>entry.freed===1&&entry.light.shadow.map===null)};
    } finally {layer.render=original;}
  });
  expect(result.rows.length).toBeGreaterThan(20);
  for (const row of result.rows) {
    expect(row.points).toBeLessThanOrEqual(4); expect(row.spots).toBeLessThanOrEqual(3);
    expect(row.pointShadows).toBeLessThanOrEqual(1); expect(row.spotShadows).toBeLessThanOrEqual(3);
    expect(row.zeroAuthored).toBe(0);
  }
  expect(result.programs[2]).toBe(result.programs[1]);
  expect(result.restarts[2]).toBe(result.restarts[1]);
  expect(result.masksRestored).toBe(true); expect(result.maps).toBeGreaterThan(0);
  expect(result.mapsReleased).toBe(true); expect(result.glError).toBe(0);
  expect(errors).toEqual([]);
});

for (const preset of ['normal', 'performance'] as const) {
test(`Cultivation background compilation and primers preserve active lighting and shadows (${preset})`, async ({page}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  const assertExposed = await exposeCultivationRuntime(page);
  await enterCultivation(page); assertExposed();
  await prepareGraphics(page,preset);
  const result = await page.evaluate(async preset => {
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
    const shadowState = () => [renderer.transmissionResolutionScale, renderer.shadowMap.enabled,renderer.shadowMap.type,
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
    // Exercise the retained-camera primer even when entry already covered the
    // characters under this same bounded lighting signature.
    queue.preparedVisibleFeatures.clear();
    const iterator = queue.steps(config);
    let compiles=0, primers=0, transmissivePrimer=false, maxPixelDifference=difference(baseline,repeat);
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
        if(step.value.label === 'transmissive-screen-prime') transmissivePrimer=true;
        if(primers>=2 && transmissivePrimer) break;
      }
    } finally {
      iterator.return();
      try {
        maxPixelDifference=Math.max(maxPixelDifference,difference(baseline,draw()));
        if (lights() !== beforeLights) stateChanges.push('live lights/maps after cleanup');
        const error=gl.getError(); if(error!==gl.NO_ERROR) glErrors.push(error);
      } finally { queue.tick=tick; r.renderLayer.render=liveDraw; }
    }
    return {compiles,primers,transmissivePrimer,maxPixelDifference,livePrograms,stateChanges,glErrors};
  }, preset);
  console.log("preparation isolation", result);
  expect(result.compiles).toBeGreaterThan(0);
  expect(result.primers).toBeGreaterThan(2);
  expect(result.transmissivePrimer).toBe(true);
  expect(result.stateChanges).toEqual([]);
  expect(result.glErrors).toEqual([]);
  expect(result.livePrograms).toBe(0);
  expect(result.maxPixelDifference).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
}


test('Cultivation retained shaders match early-zero controls for Bob and Goop room pixels', async ({page}) => {
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
            if (m.customProgramCacheKey().includes(':finite-light-branch-v5')) throw new Error('Level 2 unexpectedly enabled early-zero guards');
            else if (m.customProgramCacheKey().includes(':finite-light-branch-v3')) materials.add(m);
        });
        let guarded = 0;
        const saved = [...materials].map(m => [m,m.onBeforeCompile,m.customProgramCacheKey]);
        try {
          for (const [m,hook,key] of saved) {
            m.onBeforeCompile = function(shader: any, renderer: any) {
              hook.call(this,shader,renderer);
              for (const [kind,v] of [['Point','pointLight'],['Spot','spotLight']]) {
                const call = 'get'+kind+'LightInfo( '+v+', geometryPosition, directLight );';
                const block = 'if ( any( notEqual( '+v+'.color, vec3( 0.0 ) ) ) ) {\n      '+call+'\n    } else {\n      directLight.color = vec3( 0.0 );\n      directLight.direction = vec3( 0.0 );\n      directLight.visible = false;\n    }';
                guarded += shader.fragmentShader.split(call).length-1;
                shader.fragmentShader = shader.fragmentShader.replaceAll(call,block);
              }
            };
            const controlKey = key.call(m)+':early-zero-pixel-control';
            m.customProgramCacheKey=()=>controlKey; m.needsUpdate=true;
          }
          await renderer.compileAsync(group,camera,layer.scene); draw();
          const control = read(); let difference = 0;
          for (let i=0;i<baseline.length;i++) difference=Math.max(difference,Math.abs(baseline[i]-control[i]));
          results.push({room,slime,lit,guarded,difference,error:gl.getError()});
        } finally {
          for (const [m,hook,key] of saved) {m.onBeforeCompile=hook;m.customProgramCacheKey=key;m.needsUpdate=true;}
          group.clear();
        }
      }
    } finally {queue.tick=tick;}
    return results;
  });
  console.log('retained versus early-zero pixel controls',results);
  expect(results).toHaveLength(2);
  for (const result of results) {
    expect(result.guarded).toBeGreaterThan(0);
    expect(result.difference).toBeLessThanOrEqual(1);
    expect(result.error).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('dark-room graphics preparation awaits the pending configuration when bright is ready', async ({page},info) => {
  test.setTimeout(600_000);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text()))errors.push(message.text());});
  await exposeCultivationRuntime(page); await enterCultivation(page); await prepareGraphics(page,'normal');
  await page.evaluate(async(key)=>{
    const rt=(window as any).__specimenCultivationRuntime,session=(window as any).__specimenSession,queue=rt.preparationQueue;
    const layer=rt.renderLayer,renderer=layer.renderer,gl=renderer.getContext();
    rt.stop(); rt.teleportToAuthoredPreviewRoom(5);
    const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:0,frameDeltaSeconds:0,stepsThisFrame:0,
      interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
    while(queue.busy)await new Promise(requestAnimationFrame);
    rt.render(1,stats);
    while(queue.busy)await new Promise(requestAnimationFrame);
    const visible=queue.roots.map((root:any)=>root.visible);
    const matches=(config:any)=>config.visible.every((value:boolean,i:number)=>value===visible[i]);
    const dark=queue.configurations.find((config:any)=>matches(config)&&config.dark);
    if(!dark?.ready||!rt.resources.scene.root.userData.darkRoomLighting)throw Error('Expected prepared actual Room 5 dark gameplay');
    queue.requireCurrent(false);
    const bright=queue.configurations.find((config:any)=>matches(config)&&!config.dark);
    // Simulate an earlier bright configuration with a different prepared light
    // signature. GPU programs stay intact; only readiness metadata is invalidated.
    // This prevents legitimate subset reuse from masking the selection bug.
    for(const config of queue.configurations)if(config.ready)config.lightingKey='review-earlier-light-layout';
    bright.ready=true;dark.ready=false;
    const evidence=rt.__darkPreparation={arguments:[],resourceRenders:0,timerTurns:0,live:[],gates:[],queueRetained:false};
    const prototype=Object.getPrototypeOf(queue),prepareCurrent=prototype.prepareCurrent;
    prototype.prepareCurrent=function(dark:boolean){evidence.arguments.push(dark);return prepareCurrent.call(this,dark);};
    const compile=renderer.compileAsync;
    renderer.compileAsync=async function(...args:any[]){
      const pending=compile.apply(this,args);
      await new Promise<void>(resolve=>setTimeout(()=>{evidence.timerTurns++;resolve();},0));
      return pending;
    };
    const render=rt.render;
    rt.render=function(...args:any[]){
      if(this.preparingRenderResources&&++evidence.resourceRenders>3)throw Error('Dark demand retried without awaiting preparation');
      return render.apply(this,args);
    };
    const draw=layer.render,originals=new Map<string,any>();let current:any;
    for(const method of ['getProgramInfoLog','getShaderInfoLog','texImage2D','texStorage2D','renderbufferStorage','renderbufferStorageMultisample']){
      const original=gl[method];originals.set(method,original);
      gl[method]=function(...args:any[]){if(current)current.calls.push(method);return original.apply(this,args);};
    }
    layer.render=function(...args:any[]){
      const row=rt.state==='running'?{at:performance.now(),calls:[],newPrograms:0,error:0}:undefined;
      const before=renderer.info.programs.length;current=row;
      try{return draw.apply(this,args);}finally{current=undefined;if(row){row.newPrograms=renderer.info.programs.length-before;row.error=gl.getError();evidence.live.push(row);}}
    };
    const unsubscribe=session.events.on('graphicsPreparationChanged',(state:any)=>evidence.gates.push({...state}));
    rt.__finishDarkPreparation=()=>{
      prototype.prepareCurrent=prepareCurrent;renderer.compileAsync=compile;rt.render=render;layer.render=draw;unsubscribe();
      for(const [method,original]of originals)gl[method]=original;
    };
    rt.start();
    session.applyGraphicsSettings(key,()=>layer.setGraphicsSettings({...layer.graphicsSettings,gelRenderingMode:'reduced-transmission'}),'review-dark-half');
    await session.graphicsPreparation.settled;
    if(session.graphicsPreparation.pending)throw session.graphicsPreparation.failure??Error('Preparation remained pending');
    evidence.queueRetained=rt.preparationQueue===queue;
    evidence.darkReady=dark.ready;evidence.brightReady=bright.ready;evidence.pending=queue.diagnostics.pending;
  },graphicsPreparationKey({...GRAPHICS_PROFILES.standard.settings,gelRenderingMode:'physical'}));
  await page.waitForFunction(()=>(window as any).__specimenCultivationRuntime.__darkPreparation.live.length>=12);
  for(const mode of ['minimum','physical'] as const){
    const key=graphicsPreparationKey({...GRAPHICS_PROFILES.standard.settings,gelRenderingMode:mode});
    const before=await page.evaluate(async({key,mode})=>{
      const rt=(window as any).__specimenCultivationRuntime,session=(window as any).__specimenSession,layer=rt.renderLayer;
      const before=rt.__darkPreparation.live.length;
      session.applyGraphicsSettings(key,()=>layer.setGraphicsSettings({...layer.graphicsSettings,gelRenderingMode:mode}),mode==='minimum'?'no-transmission':'review-dark-full');
      await session.graphicsPreparation.settled;
      if(session.graphicsPreparation.pending)throw session.graphicsPreparation.failure??Error('Shader preparation remained pending');
      return before;
    },{key,mode});
    await page.waitForFunction(before=>(window as any).__specimenCultivationRuntime.__darkPreparation.live.length>=before+12,before);
  }
  const evidence=await page.evaluate(()=>{const rt=(window as any).__specimenCultivationRuntime;rt.__finishDarkPreparation();return rt.__darkPreparation;});
  const evidencePath=info.outputPath('dark-room-preparation.json');
  await writeFile(evidencePath,JSON.stringify({evidence,errors},null,2));
  await info.attach('dark-room-preparation',{path:evidencePath,contentType:'application/json'});
  expect(evidence.brightReady).toBe(true);expect(evidence.darkReady).toBe(true);expect(evidence.pending).toBe(false);
  expect(evidence.arguments.length).toBeGreaterThanOrEqual(3);
  expect(evidence.arguments.every((dark:boolean)=>dark===true)).toBe(true);
  expect(evidence.resourceRenders).toBeLessThanOrEqual(3);expect(evidence.timerTurns).toBeGreaterThan(0);
  expect(evidence.queueRetained).toBe(true);
  expect(evidence.gates.map((gate:any)=>gate.pending)).toEqual([true,false,true,false,true,false]);
  for(const frame of evidence.live){expect(frame.newPrograms).toBe(0);expect(frame.calls).toEqual([]);expect(frame.error).toBe(0);}
  expect(errors).toEqual([]);
});
