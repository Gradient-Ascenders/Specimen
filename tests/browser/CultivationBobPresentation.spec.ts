import { expect, test, type Page } from '@playwright/test';

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
}, testInfo) => {
  test.setTimeout(300_000);
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  const assertRuntimeExposed = await exposeCultivationRuntime(page);
  await enterCultivation(page);
  assertRuntimeExposed();

  const presentation = await page.evaluate(() => {
    const runtime = (
      window as Window & {
        __specimenCultivationRuntime?: CultivationRuntimeProbe;
      }
    ).__specimenCultivationRuntime;
    const bob = runtime?.resources?.bobPresentation;
    return bob
      ? { ready: bob.ready, rootName: bob.root.name }
      : undefined;
  });

  expect(presentation).toEqual({
    ready: true,
    rootName: 'player-slime-bob-presentation',
  });
  await page.screenshot({
    path: testInfo.outputPath('cultivation-room-1-shared-bob.png'),
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

  await page.keyboard.press('Tab');
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
        resources.pairPresentation.root.getObjectByName('goop-development-body')
          ?.visible,
    };
  });
  expect(switched).toEqual({
    activeSlimeId: 'goop',
    bobVisible: true,
    goopVisible: true,
  });
  await page.keyboard.press('Tab');

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
  expect(death.deathBurst.active).toBe(false);
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
    return materials?.targetBodyReflectionIntensity === 0.12;
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
    targetBodyReflectionIntensity: 0.12,
    targetEyeReflectionIntensity: 0.28,
  });
  expect(darkLighting.meshCount).toBeGreaterThan(0);
  expect(darkLighting.shadowCasterCount).toBe(darkLighting.meshCount);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  await page.screenshot({
    path: testInfo.outputPath('cultivation-room-5-shared-bob.png'),
  });

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
