import { expect, test, type Page } from '@playwright/test';

interface CultivationRuntimeProbe {
  readonly events: {
    emit(
      event: 'completed',
      payload: { readonly levelId: string; readonly nextLevelId: string },
    ): void;
  };
  readonly resources?: {
    readonly manager: { unlock(id: 'volt'): boolean };
  };
}

interface BlackoutRuntimeProbe {
  readonly state: string;
  readonly phase: string;
  readonly resources?: {
    readonly bobPresentation: {
      readonly ready: boolean;
      readonly root: { readonly name: string; readonly parent: unknown };
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
        readonly materials?: {
          readonly selfLit: boolean;
          readonly reflectionMapName?: string;
          readonly targetBodyReflectionIntensity: number;
          readonly targetEyeReflectionIntensity: number;
        };
      };
    };
    readonly bobReflectionEnvironment?: {
      readonly diagnostics: { readonly disposed: boolean };
    };
    readonly group: {
      readonly bobBody: {
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
      };
    };
    readonly manager: { readonly activeSlimeId?: string };
    readonly phase: { restore(phase: 'boss-defeated'): void };
    readonly specimenForm: { restore(form: 'specimen'): void };
    readonly visuals: Readonly<Record<'goop' | 'volt', { readonly visible: boolean }>>;
    readonly voltLight: { readonly visible: boolean };
  };
  fixedUpdate(deltaSeconds: number): void;
  beginMerge(): boolean;
  beginSplit(): boolean;
  completeSplit(): boolean;
  stop(): void;
  unload(): void;
  load(): void;
  preparePresentation(): Promise<void>;
}

declare global {
  interface Window {
    __specimenCultivationRuntime?: CultivationRuntimeProbe;
    __specimenBlackoutRuntime?: BlackoutRuntimeProbe;
  }
}

const exposeLevelRuntimes = async (page: Page): Promise<() => void> => {
  let cultivationCount = 0;
  let blackoutCount = 0;
  await page.route('**/assets/*.js', async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    const cultivation = /return new ([A-Za-z_$][\w$]*)\.CultivationLevelRuntime\(/;
    const blackoutExport =
      /export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/;
    if (cultivation.test(body)) {
      cultivationCount += 1;
      body = body.replace(
        cultivation,
        'return globalThis.__specimenCultivationRuntime=new $1.CultivationLevelRuntime(',
      );
    }
    const blackoutMatch = body.match(blackoutExport);
    if (blackoutMatch) {
      blackoutCount += 1;
      body = body.replace(
        blackoutExport,
        `class __SpecimenExposedBlackoutRuntime extends ${blackoutMatch[1]}{constructor(...args){super(...args);globalThis.__specimenBlackoutRuntime=this}}export{__SpecimenExposedBlackoutRuntime as BlackoutLevelRuntime};`,
      );
    }
    await route.fulfill({ response, body });
  });

  return () => {
    expect(cultivationCount, 'Cultivation runtime exposure count').toBe(1);
    expect(blackoutCount, 'Blackout runtime exposure count').toBe(1);
  };
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

test('Blackout uses prepared shared Bob through movement, switching, merge, split, lighting, and unload', async ({
  page,
}) => {
  // This traverses two production transitions and compiles Bob's PMREM/GLB
  // under software Chromium before exercising Blackout.
  // This crosses both earlier levels, then performs two Blackout preparation
  // cycles; software WebGL needs a wider budget for the lifecycle assertion.
  test.setTimeout(720_000);
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push(request.url()));

  const assertRuntimesExposed = await exposeLevelRuntimes(page);
  await enterCultivation(page);
  await page.evaluate(() => {
    const runtime = window.__specimenCultivationRuntime;
    if (!runtime?.resources) throw new Error('Missing Cultivation runtime');
    runtime.resources.manager.unlock('volt');
    runtime.events.emit('completed', {
      levelId: 'level-2',
      nextLevelId: 'level-3',
    });
  });

  const enterLevel = page.locator('[data-action="enter-level"]');
  await expect(enterLevel).toBeVisible({ timeout: 180_000 });
  await enterLevel.click();
  await page.waitForFunction(
    () =>
      window.__specimenBlackoutRuntime?.resources?.bobPresentation.ready ===
      true,
    undefined,
    { timeout: 120_000 },
  );
  assertRuntimesExposed();

  const initial = await page.evaluate(() => {
    const resources = window.__specimenBlackoutRuntime?.resources;
    if (!resources) throw new Error('Missing Blackout resources');
    return {
      rootName: resources.bobPresentation.root.name,
      bobPosition: { ...resources.group.bobBody.position },
      activeSlimeId: resources.manager.activeSlimeId,
      asset: resources.bobPresentation.diagnostics.asset,
      materials: resources.bobPresentation.diagnostics.materials,
      goopVisible: resources.visuals.goop.visible,
      voltVisible: resources.visuals.volt.visible,
      voltLightVisible: resources.voltLight.visible,
    };
  });
  expect(initial).toMatchObject({
    rootName: 'player-slime-bob-presentation',
    activeSlimeId: 'bob',
    asset: {
      bodyTriangles: 3_264,
      eyeTriangles: 504,
      drawCalls: 3,
      geometries: 3,
      materials: 2,
      bodyMorphTargets: 7,
      eyeMorphTargets: 11,
    },
    materials: {
      selfLit: false,
      reflectionMapName: 'bob-laboratory-pmrem',
      targetBodyReflectionIntensity: 0.12,
      targetEyeReflectionIntensity: 0.28,
    },
    goopVisible: true,
    voltVisible: true,
    voltLightVisible: true,
  });

  await page.keyboard.down('w');
  await page.evaluate(() => {
    const runtime = window.__specimenBlackoutRuntime;
    if (!runtime) throw new Error('Missing Blackout runtime');
    for (let step = 0; step < 20; step += 1) runtime.fixedUpdate(1 / 60);
  });
  await page.keyboard.up('w');
  const moved = await page.evaluate(() => {
    const resources = window.__specimenBlackoutRuntime?.resources;
    if (!resources) throw new Error('Missing Blackout resources');
    return {
      locomotionStrength:
        resources.bobPresentation.diagnostics.locomotionStrength,
      bobPosition: { ...resources.group.bobBody.position },
    };
  });
  expect(moved.locomotionStrength).toBeGreaterThan(0.05);
  expect(Math.hypot(
    moved.bobPosition.x - initial.bobPosition.x,
    moved.bobPosition.y - initial.bobPosition.y,
    moved.bobPosition.z - initial.bobPosition.z,
  )).toBeGreaterThan(0.01);

  const switchSlime = async (): Promise<string | undefined> => {
    await page.keyboard.down('Tab');
    const activeSlimeId = await page.evaluate(() => {
      const runtime = window.__specimenBlackoutRuntime;
      if (!runtime) throw new Error('Missing Blackout runtime');
      runtime.fixedUpdate(1 / 60);
      return runtime.resources?.manager.activeSlimeId;
    });
    await page.keyboard.up('Tab');
    return activeSlimeId;
  };
  expect(await switchSlime()).toBe('goop');
  expect(await switchSlime()).toBe('volt');

  expect(await page.evaluate(() => {
    const runtime = window.__specimenBlackoutRuntime;
    if (!runtime) throw new Error('Missing Blackout runtime');
    if (!runtime.beginMerge()) return false;
    for (let step = 0; step < 360 && runtime.phase === 'merging'; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    return runtime.phase === 'specimen';
  })).toBe(true);
  const merged = await page.evaluate(() => {
    const resources = window.__specimenBlackoutRuntime?.resources;
    if (!resources) throw new Error('Missing Blackout resources');
    return {
      bobVisible: resources.bobPresentation.diagnostics.visible,
      voltLightVisible: resources.voltLight.visible,
    };
  });
  expect(merged).toEqual({ bobVisible: false, voltLightVisible: false });

  const split = await page.evaluate(() => {
    const runtime = window.__specimenBlackoutRuntime;
    const resources = runtime?.resources;
    if (!runtime || !resources) throw new Error('Missing Blackout runtime');
    resources.phase.restore('boss-defeated');
    resources.specimenForm.restore('specimen');
    return {
      began: runtime.beginSplit(),
      completed: runtime.completeSplit(),
      bobVisible: resources.bobPresentation.diagnostics.visible,
      bobPosition: { ...resources.group.bobBody.position },
      voltLightVisible: resources.voltLight.visible,
    };
  });
  expect(split).toEqual({
    began: true,
    completed: true,
    bobVisible: true,
    bobPosition: { x: -2, y: 0.46, z: 78 },
    voltLightVisible: true,
  });

  const disposal = await page.evaluate(async () => {
    const runtime = window.__specimenBlackoutRuntime;
    if (!runtime?.resources) throw new Error('Missing Blackout runtime');
    const firstBob = runtime.resources.bobPresentation;
    const firstEnvironment = runtime.resources.bobReflectionEnvironment;
    runtime.stop();
    runtime.unload();
    const first = {
      ready: firstBob.ready,
      detached: firstBob.root.parent === null,
      environmentDisposed: firstEnvironment?.diagnostics.disposed,
      state: runtime.state,
    };
    runtime.load();
    await runtime.preparePresentation();
    const secondBob = runtime.resources!.bobPresentation;
    const secondEnvironment = runtime.resources!.bobReflectionEnvironment;
    runtime.unload();
    return {
      first,
      second: {
        ready: secondBob.ready,
        detached: secondBob.root.parent === null,
        environmentDisposed: secondEnvironment?.diagnostics.disposed,
        state: runtime.state,
      },
    };
  });
  expect(disposal).toEqual({
    first: {
      ready: false,
      detached: true,
      environmentDisposed: true,
      state: 'unloaded',
    },
    second: {
      ready: false,
      detached: true,
      environmentDisposed: true,
      state: 'unloaded',
    },
  });
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
