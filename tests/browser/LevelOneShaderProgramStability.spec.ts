import { expect, test, type Page } from '@playwright/test';

const GUARD_SELECTOR = '[data-shader-program-guard]';
const RUNTIME_DIAGNOSTICS_SELECTOR = '[data-runtime-status]';

interface AcidPresentationSample {
  readonly totalImpacts: number;
  readonly dropletUploads: number;
}

interface LightingPrewarmProfile {
  readonly measuredFirstUseResourcePrimeDurationMs: number;
  readonly measuredFirstUseResourcePrimeCount: number;
  readonly measuredFirstUseResourcePrimeGeometriesBefore: number;
  readonly measuredFirstUseResourcePrimeGeometriesAfter: number;
  readonly measuredFirstUseResourcePrimeProgramsBefore: number;
  readonly measuredFirstUseResourcePrimeProgramsAfter: number;
}

interface LevelOnePrewarmVerification {
  readonly roomStepsCompleted: number;
  readonly measuredResourceCount: number;
  readonly measuredGeometryDelta: number;
  readonly measuredProgramDelta: number;
  readonly burstGeometryDelta: number;
  readonly burstProgramDelta: number;
}

const parseLightingPrewarmProfile = (text: string): LightingPrewarmProfile => {
  const match = text.match(/lighting prewarm profile: (\{[^\n]+\})/);
  expect(match, 'Missing lighting prewarm profile').not.toBeNull();
  return JSON.parse(match?.[1] ?? '{}') as LightingPrewarmProfile;
};

const toggleDebugPanel = async (page: Page): Promise<void> => {
  await page.keyboard.press('F2');
};

const parseAcidPresentationSample = (text: string): AcidPresentationSample => {
  const impacts = text.match(/acid impacts soluble \/ world: (\d+) \/ (\d+)/);
  const work = text.match(
    /acid presentation work uniforms \/ projectile slots \/ droplet uploads: \d+ \/ \d+ \/ (\d+)/,
  );
  expect(impacts, 'Missing acid impact diagnostics').not.toBeNull();
  expect(work, 'Missing acid droplet-upload diagnostics').not.toBeNull();
  return {
    totalImpacts: Number(impacts?.[1]) + Number(impacts?.[2]),
    dropletUploads: Number(work?.[1]),
  };
};

const waitForRenderedFrames = async (page: Page, count = 1): Promise<void> => {
  await page.evaluate(async (frameCount) => {
    for (let frame = 0; frame < frameCount; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
};

const readCreatedProgramCount = async (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (
        window as Window & {
          __specimenCreatedWebGlProgramCount?: number;
        }
      ).__specimenCreatedWebGlProgramCount ?? 0,
  );

const readStableGuard = async (
  page: Page,
  label: string,
  baseline: number,
): Promise<number> => {
  const status = (await page.locator(GUARD_SELECTOR).textContent())?.trim() ?? '';
  expect(status, `${label}: shader guard reported a regression`).not.toContain(
    'Cold shader regression',
  );
  const counts = status.match(/baseline (\d+) · highest (\d+)/);
  expect(counts, `${label}: unreadable shader guard: ${status}`).not.toBeNull();
  const observedBaseline = Number(counts?.[1]);
  const highest = Number(counts?.[2]);
  expect(observedBaseline, `${label}: warm baseline changed`).toBe(baseline);
  expect(highest, `${label}: renderer program count exceeded baseline`).toBeLessThanOrEqual(
    baseline,
  );
  return highest;
};

const visitRoom = async (page: Page, room: number): Promise<void> => {
  await page.evaluate((roomId) => {
    const button = document.querySelector<HTMLButtonElement>(
      `[data-action="room-teleport"][data-room-id="${roomId}"]`,
    );
    if (!button) throw new Error(`Missing Room ${roomId} debug teleport`);
    button.click();
  }, room);
  await waitForRenderedFrames(page);
};

const sweepCamera = async (page: Page): Promise<void> => {
  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  expect(bounds, 'The WebGL canvas has no rendered bounds').not.toBeNull();
  if (!bounds) return;
  const pointerLocked = await canvas.evaluate(
    (element) => document.pointerLockElement === element,
  );
  if (!pointerLocked) {
    await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  }
  await page.evaluate(() => {
    for (const [movementX, movementY] of [[180, -80], [-360, 160], [180, -80]]) {
      const event = new MouseEvent('mousemove', { bubbles: true });
      Object.defineProperties(event, {
        movementX: { value: movementX },
        movementY: { value: movementY },
      });
      window.dispatchEvent(event);
    }
  });
  await waitForRenderedFrames(page);
};

const readAcidPresentationSample = async (
  page: Page,
): Promise<AcidPresentationSample> => {
  await toggleDebugPanel(page);
  const diagnostics = page.locator(RUNTIME_DIAGNOSTICS_SELECTOR);
  await expect(diagnostics).toBeVisible();
  await expect.poll(
    async () => (await diagnostics.textContent()) ?? '',
    { message: 'Waiting for acid presentation diagnostics' },
  ).toContain('acid presentation work uniforms');
  const text = (await diagnostics.textContent()) ?? '';
  const sample = parseAcidPresentationSample(text);
  await toggleDebugPanel(page);
  return sample;
};

const waitForAcidImpactPresentation = async (
  page: Page,
  before: AcidPresentationSample,
): Promise<AcidPresentationSample> => {
  await toggleDebugPanel(page);
  const diagnostics = page.locator(RUNTIME_DIAGNOSTICS_SELECTOR);
  await expect(diagnostics).toBeVisible();
  await expect.poll(
    async () => (await diagnostics.textContent()) ?? '',
    { message: 'Waiting for acid presentation diagnostics' },
  ).toContain('acid presentation work uniforms');
  await expect.poll(
    async () => {
      const sample = parseAcidPresentationSample(
        (await diagnostics.textContent()) ?? '',
      );
      return (
        sample.totalImpacts > before.totalImpacts &&
        sample.dropletUploads > before.dropletUploads
      );
    },
    {
      timeout: 60_000,
      message: 'Waiting for an acid impact and its droplet presentation upload',
    },
  ).toBe(true);
  const sample = parseAcidPresentationSample(
    (await diagnostics.textContent()) ?? '',
  );
  await toggleDebugPanel(page);
  return sample;
};

test('Level 1 traversal creates no programs after hidden-boot warm-up', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(GUARD_SELECTOR)).toBeVisible({ timeout: 120_000 });
  await expect.poll(
    async () => (await page.locator(GUARD_SELECTOR).textContent()) ?? '',
    { timeout: 120_000, message: 'Waiting for Level 1 hidden-boot warm-up' },
  ).toContain('Shader programs stable');

  const initialStatus =
    (await page.locator(GUARD_SELECTOR).textContent())?.trim() ?? '';
  const baselineMatch = initialStatus.match(/baseline (\d+) · highest (\d+)/);
  expect(
    baselineMatch,
    `Unable to read hidden-boot program baseline: ${initialStatus}`,
  ).not.toBeNull();
  const baseline = Number(baselineMatch?.[1]);
  expect(Number(baselineMatch?.[2]), 'Programs grew before traversal began').toBe(
    baseline,
  );

  await page.locator('[data-action="start"]').click();
  await waitForRenderedFrames(page);
  await readStableGuard(page, 'gameplay start', baseline);

  await toggleDebugPanel(page);
  const diagnostics = page.locator(RUNTIME_DIAGNOSTICS_SELECTOR);
  await expect(diagnostics).toBeVisible();
  await expect.poll(
    async () => (await diagnostics.textContent()) ?? '',
    { message: 'Waiting for measured resource prewarm diagnostics' },
  ).toContain('measured first-use geometries / primes: primed 23 / 1');
  const prewarmProfile = parseLightingPrewarmProfile(
    (await diagnostics.textContent()) ?? '',
  );
  expect(prewarmProfile.measuredFirstUseResourcePrimeCount).toBe(23);
  expect(
    prewarmProfile.measuredFirstUseResourcePrimeGeometriesAfter -
      prewarmProfile.measuredFirstUseResourcePrimeGeometriesBefore,
    'The hidden prewarm did not make all 23 measured geometries resident',
  ).toBe(23);
  expect(prewarmProfile.measuredFirstUseResourcePrimeProgramsAfter).toBe(
    prewarmProfile.measuredFirstUseResourcePrimeProgramsBefore,
  );
  expect(
    prewarmProfile.measuredFirstUseResourcePrimeDurationMs,
  ).toBeGreaterThanOrEqual(0);
  await expect.poll(
    async () => (await diagnostics.textContent()) ?? '',
    { message: 'Waiting for burst resource prewarm diagnostics' },
  ).toContain('death burst resources / primes: primed / 1');
  await toggleDebugPanel(page);

  await visitRoom(page, 1);
  await sweepCamera(page);
  await page.keyboard.down('w');
  await page.keyboard.down('Space');
  await waitForRenderedFrames(page);
  await page.keyboard.up('w');
  await page.keyboard.up('Space');
  await waitForRenderedFrames(page);
  await readStableGuard(page, 'Room 1 traversal and jump', baseline);

  await visitRoom(page, 2);
  await sweepCamera(page);
  await readStableGuard(page, 'Room 2 camera sweep', baseline);
  await page.keyboard.press('Tab');
  await waitForRenderedFrames(page);
  await readStableGuard(page, 'Room 2 Goop switch', baseline);
  const acidBefore = await readAcidPresentationSample(page);
  await sweepCamera(page);
  await page.mouse.down({ button: 'right' });
  await waitForRenderedFrames(page);
  await readStableGuard(page, 'Room 2 acid aim', baseline);
  await page.mouse.click(400, 300, { button: 'left' });
  await page.mouse.up({ button: 'right' });
  await waitForRenderedFrames(page);
  const acidAfter = await waitForAcidImpactPresentation(page, acidBefore);
  expect(
    acidAfter.totalImpacts,
    'The acid checkpoint did not produce an authoritative impact',
  ).toBeGreaterThan(acidBefore.totalImpacts);
  expect(
    acidAfter.dropletUploads,
    'The acid impact did not upload its droplet presentation',
  ).toBeGreaterThan(acidBefore.dropletUploads);
  await readStableGuard(page, 'Room 2 acid impact presentation', baseline);

  await visitRoom(page, 3);
  await sweepCamera(page);
  await page.keyboard.down('a');
  await waitForRenderedFrames(page);
  await page.keyboard.up('a');
  await waitForRenderedFrames(page);
  await readStableGuard(page, 'Room 3 traversal and camera sweep', baseline);

  await visitRoom(page, 4);
  await sweepCamera(page);
  await page.keyboard.down('w');
  await waitForRenderedFrames(page);
  await page.keyboard.up('w');
  await page.keyboard.press('Space');
  await waitForRenderedFrames(page);
  await readStableGuard(page, 'Room 4 lift approach', baseline);

  await visitRoom(page, 5);
  await sweepCamera(page);
  await page.keyboard.down('d');
  await waitForRenderedFrames(page);
  await page.keyboard.up('d');
  await waitForRenderedFrames(page);
  await readStableGuard(page, 'Room 5 traversal and camera sweep', baseline);

  await expect(page.locator(GUARD_SELECTOR)).toHaveText(
    `Shader programs stable · baseline ${baseline} · highest ${baseline}`,
  );
});

test('plain production completes prewarm before Level 1 traversal', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    let createdPrograms = 0;
    const originalCreateProgram = WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram = function () {
      createdPrograms += 1;
      return originalCreateProgram.call(this);
    };
    Object.defineProperty(window, '__specimenCreatedWebGlProgramCount', {
      configurable: true,
      get: () => createdPrograms,
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const app = page.locator('#app[data-level-one-prewarm]');
  await expect(app).toBeVisible({ timeout: 120_000 });
  const verification = JSON.parse(
    (await app.getAttribute('data-level-one-prewarm')) ?? '{}',
  ) as LevelOnePrewarmVerification;
  expect(verification).toEqual({
    roomStepsCompleted: 5,
    measuredResourceCount: 23,
    measuredGeometryDelta: 23,
    measuredProgramDelta: 0,
    burstGeometryDelta: 2,
    burstProgramDelta: 0,
  });
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  await waitForRenderedFrames(page, 2);
  const warmedProgramCount = await readCreatedProgramCount(page);
  expect(warmedProgramCount).toBeGreaterThan(0);

  await page.locator('[data-action="start"]').click();
  await waitForRenderedFrames(page, 2);
  await sweepCamera(page);
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  await page.keyboard.press('Space');
  await waitForRenderedFrames(page, 4);

  expect(await readCreatedProgramCount(page)).toBe(warmedProgramCount);
  expect(
    consoleErrors.some((message) =>
      message.includes('Containment lighting prewarm failed')),
  ).toBe(false);
});
