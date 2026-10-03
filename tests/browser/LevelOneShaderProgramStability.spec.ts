import type { Page } from '@playwright/test';
import type * as THREE from 'three';
import { expect, test } from './fixtures.ts';

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

interface ProductionTraversalRuntime {
  readonly resources?: {
    readonly body: {
      readonly grounded: boolean;
      readonly position: unknown;
      teleport(position: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      }): void;
    };
    readonly bobReflectionEnvironment: {
      readonly diagnostics: {
        readonly textureName: string;
        readonly disposed: boolean;
      };
    };
    readonly slimePair: {
      readonly activeBody: unknown;
      switchActive(): boolean;
    };
    readonly containmentLevel: {
      setActiveBody(body: unknown): void;
      teleportToRoomForDebug(roomId: number): void;
      recoverActiveCheckpoint(): void;
      requestHazardFailure(failure: {
        readonly roomId: 'room-3';
        readonly hazardId: string;
      }): boolean;
    };
    readonly testScene: {
      readonly lightingDiagnostics: {
        readonly bobReflectionZone: 'room' | 'duct';
        readonly bobBodyReflectionTarget: number;
        readonly bobEyeReflectionTarget: number;
      };
      readonly bob: {
        readonly diagnostics: {
          readonly facingYawRadians: number;
          readonly locomotionStrength: number;
          readonly reversing: boolean;
          readonly speed: number;
          readonly deathBurst: {
            readonly elapsedSeconds: number;
          };
          readonly materials?: {
            readonly reflectionMapName?: string;
            readonly bodyReflectionIntensity: number;
            readonly eyeReflectionIntensity: number;
          };
        };
        reset(): void;
        setPosition(position: unknown): void;
        onDamage(strength: number): void;
        updateDeath(deltaSeconds: number): void;
      };
    };
    readonly acidProjectileSystem: {
      getDiagnostics(): {
        readonly solubleImpactCount: number;
        readonly worldImpactCount: number;
      };
    };
    readonly goopAcidPresentation: {
      getDiagnostics(): { readonly dropletMatrixUploadCount: number };
    };
  };
  load(): void;
  start(): void;
  stop(): void;
  restartLevel(): void;
  unload(): void;
  prepareLightingPrograms(): Promise<void>;
  syncContextualCamera(resources: unknown): void;
}

type AssertProgramsStable = (label: string) => Promise<void>;

const parseLightingPrewarmProfile = (text: string): LightingPrewarmProfile => {
  const match = text.match(/lighting prewarm profile: (\{[^\n]+\})/);
  expect(match, 'Missing lighting prewarm profile').not.toBeNull();
  return JSON.parse(match?.[1] ?? '{}') as LightingPrewarmProfile;
};

const toggleDebugPanel = async (page: Page): Promise<void> => {
  const diagnostics = page.locator(RUNTIME_DIAGNOSTICS_SELECTOR);
  const wasVisible = await diagnostics.isVisible();
  await page.keyboard.press('F2');
  if (wasVisible) await expect(diagnostics).toBeHidden();
  else {
    await expect(diagnostics).toBeVisible();
    await page.waitForFunction(() => document.pointerLockElement === null);
  }
  // Native pointer-lock change is asynchronous. Let release settle before
  // closing diagnostics can restore gameplay input and reacquire the pointer.
  await waitForRenderedFrames(page, 2);
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

const exposeProductionTraversalRuntime = async (
  page: Page,
): Promise<() => void> => {
  // Plain production intentionally has no debug panel. Expose the already
  // constructed runtime only in the served test bundle so the shared traversal
  // can use its normal checkpoint recovery without enabling debug helpers.
  let injectedBundleCount = 0;
  await page.route('**/assets/index-*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const prewarmCall =
      /([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/;
    const match = body.match(prewarmCall);
    if (!match?.[1]) {
      await route.fulfill({ response, body });
      return;
    }

    const runtimeIdentifier = match[1];
    const instrumentedBody = body.replace(
      prewarmCall,
      `(globalThis.__specimenProductionTraversalRuntime=${runtimeIdentifier},${runtimeIdentifier}.prepareLightingPrograms()).then(`,
    );
    injectedBundleCount += 1;
    await route.fulfill({ response, body: instrumentedBody });
  });

  return () => {
    expect(
      injectedBundleCount,
      'The plain-production traversal runtime was not exposed exactly once',
    ).toBe(1);
  };
};

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
  const debugTeleport = page.locator(
    `[data-action="room-teleport"][data-room-id="${room}"]`,
  );
  if ((await debugTeleport.count()) > 0) {
    await debugTeleport.evaluate((button: HTMLButtonElement) => button.click());
  } else {
    await page.evaluate((roomId) => {
      const runtime = (
        window as Window & {
          __specimenProductionTraversalRuntime?: ProductionTraversalRuntime;
        }
      ).__specimenProductionTraversalRuntime;
      const resources = runtime?.resources;
      if (!runtime || !resources) {
        throw new Error('Missing plain-production traversal runtime');
      }
      resources.containmentLevel.setActiveBody(resources.slimePair.activeBody);
      resources.containmentLevel.teleportToRoomForDebug(roomId);
      resources.testScene.bob.reset();
      resources.testScene.bob.setPosition(resources.body.position);
      runtime.syncContextualCamera(resources);
    }, room);
  }
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
    await page.waitForFunction(() => document.pointerLockElement?.tagName === 'CANVAS');
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
  if ((await page.locator(RUNTIME_DIAGNOSTICS_SELECTOR).count()) === 0) {
    return page.evaluate(() => {
      const runtime = (
        window as Window & {
          __specimenProductionTraversalRuntime?: ProductionTraversalRuntime;
        }
      ).__specimenProductionTraversalRuntime;
      const resources = runtime?.resources;
      if (!resources) throw new Error('Missing plain-production acid diagnostics');
      const acid = resources.acidProjectileSystem.getDiagnostics();
      const presentation = resources.goopAcidPresentation.getDiagnostics();
      return {
        totalImpacts: acid.solubleImpactCount + acid.worldImpactCount,
        dropletUploads: presentation.dropletMatrixUploadCount,
      };
    });
  }

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
  if ((await page.locator(RUNTIME_DIAGNOSTICS_SELECTOR).count()) === 0) {
    let sample: AcidPresentationSample = before;
    await expect.poll(
      async () => {
        sample = await readAcidPresentationSample(page);
        return (
          sample.totalImpacts > before.totalImpacts &&
          sample.dropletUploads > before.dropletUploads
        );
      },
      {
        timeout: 60_000,
        message: 'Waiting for a production acid impact and droplet upload',
      },
    ).toBe(true);
    return sample;
  }

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

const traverseRepresentativeLevelOnePaths = async (
  page: Page,
  assertProgramsStable: AssertProgramsStable,
): Promise<void> => {
  await visitRoom(page, 1);
  await sweepCamera(page);
  await page.keyboard.down('w');
  await page.keyboard.down('Space');
  await waitForRenderedFrames(page);
  await page.keyboard.up('w');
  await page.keyboard.up('Space');
  await waitForRenderedFrames(page);
  await assertProgramsStable('Room 1 traversal and jump');

  await visitRoom(page, 2);
  await sweepCamera(page);
  await assertProgramsStable('Room 2 camera sweep');
  await page.keyboard.press('Tab');
  await waitForRenderedFrames(page);
  await assertProgramsStable('Room 2 Goop switch');
  const acidBefore = await readAcidPresentationSample(page);
  await sweepCamera(page);
  await page.mouse.down({ button: 'right' });
  await waitForRenderedFrames(page, 3);
  await assertProgramsStable('Room 2 acid aim');
  await page.mouse.down({ button: 'left' });
  await waitForRenderedFrames(page, 3);
  await page.mouse.up({ button: 'left' });
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
  await assertProgramsStable('Room 2 acid impact presentation');

  await visitRoom(page, 3);
  await sweepCamera(page);
  await page.keyboard.down('a');
  await waitForRenderedFrames(page);
  await page.keyboard.up('a');
  await waitForRenderedFrames(page);
  await assertProgramsStable('Room 3 traversal and camera sweep');

  await visitRoom(page, 4);
  await sweepCamera(page);
  await page.keyboard.down('w');
  await waitForRenderedFrames(page);
  await page.keyboard.up('w');
  await page.keyboard.press('Space');
  await waitForRenderedFrames(page);
  await assertProgramsStable('Room 4 lift approach');

  await visitRoom(page, 5);
  await sweepCamera(page);
  await page.keyboard.down('d');
  await waitForRenderedFrames(page);
  await page.keyboard.up('d');
  await waitForRenderedFrames(page);
  await assertProgramsStable('Room 5 traversal and camera sweep');
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
    'The measured upload guard allocated geometry after room shadow preparation',
  ).toBe(0);
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

  await traverseRepresentativeLevelOnePaths(page, async (label) => {
    await readStableGuard(page, label, baseline);
  });

  await expect(page.locator(GUARD_SELECTOR)).toHaveText(
    `Shader programs stable · baseline ${baseline} · highest ${baseline}`,
  );
});

test('plain production completes prewarm before Level 1 traversal', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const assertTraversalRuntimeExposed =
    await exposeProductionTraversalRuntime(page);
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
  assertTraversalRuntimeExposed();
  const app = page.locator('#app[data-level-one-prewarm]');
  await expect(app).toBeVisible({ timeout: 120_000 });
  const verification = JSON.parse(
    (await app.getAttribute('data-level-one-prewarm')) ?? '{}',
  ) as LevelOnePrewarmVerification;
  expect(verification).toEqual({
    roomStepsCompleted: 9,
    measuredResourceCount: 23,
    measuredGeometryDelta: 0,
    measuredProgramDelta: 0,
    // Whole-room upload priming now reaches the burst buffers earlier too.
    burstGeometryDelta: 0,
    burstProgramDelta: 0,
  });
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  await waitForRenderedFrames(page, 2);
  const warmedProgramCount = await readCreatedProgramCount(page);
  expect(warmedProgramCount).toBeGreaterThan(0);

  await page.locator('[data-action="start"]').click();
  await waitForRenderedFrames(page, 2);
  await traverseRepresentativeLevelOnePaths(page, async (label) => {
    expect(
      await readCreatedProgramCount(page),
      `${label}: plain-production WebGL program count changed`,
    ).toBe(warmedProgramCount);
  });

  expect(await readCreatedProgramCount(page)).toBe(warmedProgramCount);
  expect(
    consoleErrors.some((message) =>
      message.includes('Containment lighting prewarm failed')),
  ).toBe(false);
});

test('Room 1 sticky-wall approach and climb reuse prepared GPU bindings', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 320, height: 180 });
  const assertExposed = await exposeProductionTraversalRuntime(page);
  await page.addInitScript(() => {
    const counts = { programs: 0, bindings: 0, uploads: 0, owners: [] as string[] };
    const prototype = WebGL2RenderingContext.prototype;
    const program = prototype.createProgram, binding = prototype.createVertexArray;
    const upload = prototype.bufferData;
    prototype.createProgram = function () { counts.programs++; return program.call(this); };
    prototype.createVertexArray = function () {
      counts.bindings++;
      const owner = (window as Window & { __roomOneGpuOwner?: string }).__roomOneGpuOwner;
      if (owner) counts.owners.push(owner);
      return binding.call(this);
    };
    prototype.bufferData = function (...args: Parameters<typeof upload>) {
      counts.uploads++;
      return upload.apply(this, args);
    };
    Object.assign(window, { __roomOneGpuCounts: counts });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  assertExposed();
  await page.locator('[data-action="start"]').click();
  await waitForRenderedFrames(page, 2);
  await page.evaluate(() => {
    const host = window as Window & {
      __specimenProductionTraversalRuntime: { renderLayer: { scene: THREE.Scene } };
      __roomOneGpuOwner?: string;
    };
    host.__specimenProductionTraversalRuntime.renderLayer.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const beforeRender = mesh.onBeforeRender, beforeShadow = mesh.onBeforeShadow;
      mesh.onBeforeRender = function (...args) {
        host.__roomOneGpuOwner = `${mesh.name}:visible`;
        beforeRender.apply(this, args);
      };
      mesh.onBeforeShadow = function (...args) {
        host.__roomOneGpuOwner = `${mesh.name}:shadow`;
        beforeShadow.apply(this, args);
      };
    });
  });
  const readCounts = () => page.evaluate(() => ({
    ...(window as Window & { __roomOneGpuCounts: {
      programs: number; bindings: number; uploads: number; owners: string[];
    } }).__roomOneGpuCounts,
  }));
  const prepared = await readCounts();
  const samples = await page.evaluate(() => {
    const host = window as Window & {
      __roomOneGpuCounts: { programs: number; bindings: number; uploads: number; owners: string[] };
      __specimenProductionTraversalRuntime: ProductionTraversalRuntime & {
        input: { isDown(action: string): boolean };
        fixedUpdate(deltaSeconds: number): void;
        resources: {
          body: { attached: boolean; position: { x: number; y: number; z: number } };
          testScene: {
            withRoomOneOcclusion<T>(body: THREE.Vector3Like, camera: THREE.Vector3Like, draw: () => T): T;
          };
        };
        renderLayer: {
          cameraRig: { camera: THREE.Camera; setGroundOrbitYawRadians(yaw: number): void };
          renderer: THREE.WebGLRenderer;
          render(): void;
        };
        render(alpha: number, stats: {
          fixedDeltaSeconds: number; rawFrameDeltaSeconds: number; frameDeltaSeconds: number;
          stepsThisFrame: number; interpolationAlpha: number; droppedSimulationTimeSeconds: number;
          renderFps: number;
        }): void;
      };
    };
    const runtime = host.__specimenProductionTraversalRuntime;
    const stats = { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60,
      frameDeltaSeconds: 1 / 60, stepsThisFrame: 1, interpolationAlpha: 1,
      droppedSimulationTimeSeconds: 0, renderFps: 60 };
    const samples = [];
    for (const z of [-2, 0, 2, 4.5]) {
      const resources = runtime.resources!;
      resources.body.teleport({ x: -4.8, y: .66, z });
      runtime.syncContextualCamera(resources);
      runtime.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
      runtime.render(1, stats);
      runtime.renderLayer.renderer.getContext().finish();
      samples.push({ z, counts: { ...host.__roomOneGpuCounts, owners: [...host.__roomOneGpuCounts.owners] } });
    }
    const input = runtime.input;
    const isDown = input.isDown;
    const climbSamples = [];
    try {
      // Walk into the bottom of the wall, then keep holding forward as the
      // surface camera and Bob's pose turn. Teleporting up skips this transition.
      input.isDown = action => action === 'moveForward';
      for (let step = 0; step < 105; step++) {
        runtime.fixedUpdate(1 / 60);
        if (step % 15 !== 0 && step !== 104) continue;
        runtime.render(1, stats);
        runtime.renderLayer.renderer.getContext().finish();
        const body = runtime.resources!.body;
        climbSamples.push({ step, attached: body.attached, position: { ...body.position },
          counts: { ...host.__roomOneGpuCounts, owners: [...host.__roomOneGpuCounts.owners] } });
      }
    } finally {
      input.isDown = isDown;
    }
    // Compare the identical final camera pose with and without the occlusion
    // gate, after recording the first-use counters. No animation advances here.
    const layer = runtime.renderLayer;
    const gl = layer.renderer.getContext();
    const readPixels = () => {
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    runtime.resources!.testScene.withRoomOneOcclusion(runtime.resources!.body.position,
      layer.cameraRig.camera.position, () => layer.render());
    const culledPixels = readPixels();
    const culledImage = layer.renderer.domElement.toDataURL();
    const culledCalls = layer.renderer.info.render.calls;
    layer.render();
    const unculledPixels = readPixels();
    const unculledImage = layer.renderer.domElement.toDataURL();
    const unculledCalls = layer.renderer.info.render.calls;
    let changedChannels = 0;
    let maxDelta = 0;
    const differences = [];
    for (let i = 0; i < culledPixels.length; i++) {
      if (culledPixels[i] !== unculledPixels[i]) {
        changedChannels++;
        maxDelta = Math.max(maxDelta, Math.abs(culledPixels[i] - unculledPixels[i]));
        if (differences.length < 20) differences.push({ index: i, culled: culledPixels[i], unculled: unculledPixels[i] });
      }
    }
    return { approach: samples, climb: climbSamples,
      images: { culled: culledImage, unculled: unculledImage },
      visual: { changedChannels, channelCount: culledPixels.length, maxDelta, differences,
        culledCalls, unculledCalls } };
  });
  await test.info().attach('room-one-wall-gpu-samples', {
    body: JSON.stringify({ prepared, samples: { ...samples, images: undefined } }, null, 2), contentType: 'application/json',
  });
  for (const [name, data] of Object.entries(samples.images)) {
    await test.info().attach(`climb-${name}`, { body: Buffer.from(data.split(',')[1], 'base64'), contentType: 'image/png' });
  }
  expect(samples.climb.some(sample => sample.attached && sample.position.y > 1.5),
    'Bob actually attaches and climbs from the floor').toBe(true);
  // Counts are monotonic, so the last sample covers both approach and climbing.
  expect(samples.climb.at(-1)?.counts, 'Room 1 first sticky-wall climb').toEqual(prepared);
  // The MSAA/transmission image has tiny edge differences when distant
  // geometry is omitted. Bound both their extent and magnitude: missing
  // scenery or changed lighting must not pass as an occlusion optimization.
  expect(samples.visual.changedChannels / samples.visual.channelCount).toBeLessThan(0.001);
  expect(samples.visual.maxDelta).toBeLessThanOrEqual(20);
  expect(samples.visual.culledCalls).toBeLessThan(samples.visual.unculledCalls);
});

test('Bob reflections snap across restart and recreate across level reload', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });
  const assertTraversalRuntimeExposed =
    await exposeProductionTraversalRuntime(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  assertTraversalRuntimeExposed();
  await expect(page.locator('[data-action="start"]')).toBeVisible({
    timeout: 120_000,
  });
  await page.locator('[data-action="start"]').click();
  await waitForRenderedFrames(page, 2);

  const readReflectionState = async () => page.evaluate(() => {
    const runtime = (
      window as Window & {
        __specimenProductionTraversalRuntime?: ProductionTraversalRuntime;
      }
    ).__specimenProductionTraversalRuntime;
    const resources = runtime?.resources;
    if (!resources) throw new Error('Missing plain-production Bob resources');
    const materials = resources.testScene.bob.diagnostics.materials;
    if (!materials) throw new Error('Bob reflection materials are not ready');
    return {
      mapName: materials.reflectionMapName,
      body: materials.bodyReflectionIntensity,
      eyes: materials.eyeReflectionIntensity,
      zone: resources.testScene.lightingDiagnostics.bobReflectionZone,
      bodyTarget:
        resources.testScene.lightingDiagnostics.bobBodyReflectionTarget,
      eyeTarget:
        resources.testScene.lightingDiagnostics.bobEyeReflectionTarget,
      environmentName:
        resources.bobReflectionEnvironment.diagnostics.textureName,
    };
  });

  expect(await readReflectionState()).toEqual({
    mapName: 'bob-laboratory-pmrem',
    body: 0.42,
    eyes: 1.12,
    zone: 'room',
    bodyTarget: 0.42,
    eyeTarget: 1.12,
    environmentName: 'bob-laboratory-pmrem',
  });

  await page.evaluate(() => {
    const runtime = (
      window as Window & {
        __specimenProductionTraversalRuntime?: ProductionTraversalRuntime;
      }
    ).__specimenProductionTraversalRuntime;
    const resources = runtime?.resources;
    if (!resources) throw new Error('Missing plain-production Bob resources');
    resources.body.teleport({ x: -4.8, y: 6, z: 8 });
  });
  await expect.poll(
    async () => (await readReflectionState()).zone,
    { timeout: 5_000, message: 'Waiting for Bob to enter the dark duct profile' },
  ).toBe('duct');
  await expect.poll(
    async () => (await readReflectionState()).body,
    { timeout: 5_000, message: 'Waiting for the duct reflection fade' },
  ).toBeLessThan(0.15);

  const recoveredGoop = await page.evaluate(() => {
    const runtime = (
      window as Window & {
        __specimenProductionTraversalRuntime?: ProductionTraversalRuntime;
      }
    ).__specimenProductionTraversalRuntime;
    const resources = runtime?.resources;
    if (!resources) throw new Error('Missing plain-production Bob resources');
    if (!resources.slimePair.switchActive()) {
      throw new Error('Could not switch control from Bob to Goop');
    }
    resources.containmentLevel.setActiveBody(resources.slimePair.activeBody);
    resources.containmentLevel.recoverActiveCheckpoint();
    const materials = resources.testScene.bob.diagnostics.materials;
    if (!materials) throw new Error('Bob reflection materials are not ready');
    return {
      body: materials.bodyReflectionIntensity,
      eyes: materials.eyeReflectionIntensity,
      zone: resources.testScene.lightingDiagnostics.bobReflectionZone,
      bodyTarget:
        resources.testScene.lightingDiagnostics.bobBodyReflectionTarget,
      eyeTarget:
        resources.testScene.lightingDiagnostics.bobEyeReflectionTarget,
    };
  });
  expect(recoveredGoop).toEqual({
    body: 0.1,
    eyes: 0.24,
    zone: 'duct',
    bodyTarget: 0.1,
    eyeTarget: 0.24,
  });

  const restarted = await page.evaluate(() => {
    const runtime = (
      window as Window & {
        __specimenProductionTraversalRuntime?: ProductionTraversalRuntime;
      }
    ).__specimenProductionTraversalRuntime;
    if (!runtime) throw new Error('Missing plain-production traversal runtime');
    runtime.restartLevel();
    const resources = runtime.resources;
    const materials = resources?.testScene.bob.diagnostics.materials;
    if (!resources || !materials) {
      throw new Error('Missing restarted Bob resources');
    }
    return {
      body: materials.bodyReflectionIntensity,
      eyes: materials.eyeReflectionIntensity,
      zone: resources.testScene.lightingDiagnostics.bobReflectionZone,
    };
  });
  expect(restarted).toEqual({ body: 0.42, eyes: 1.12, zone: 'room' });

  const reloaded = await page.evaluate(async () => {
    const runtime = (
      window as Window & {
        __specimenProductionTraversalRuntime?: ProductionTraversalRuntime;
      }
    ).__specimenProductionTraversalRuntime;
    if (!runtime?.resources) {
      throw new Error('Missing plain-production traversal runtime');
    }
    const oldEnvironment = runtime.resources.bobReflectionEnvironment;
    runtime.stop();
    runtime.unload();
    const oldEnvironmentDisposed = oldEnvironment.diagnostics.disposed;
    runtime.load();
    await runtime.prepareLightingPrograms();
    runtime.start();
    const resources = runtime.resources;
    const materials = resources?.testScene.bob.diagnostics.materials;
    if (!resources || !materials) {
      throw new Error('Missing reloaded Bob resources');
    }
    return {
      oldEnvironmentDisposed,
      newEnvironmentDisposed:
        resources.bobReflectionEnvironment.diagnostics.disposed,
      mapName: materials.reflectionMapName,
      environmentName:
        resources.bobReflectionEnvironment.diagnostics.textureName,
      body: materials.bodyReflectionIntensity,
      eyes: materials.eyeReflectionIntensity,
    };
  });
  expect(reloaded).toEqual({
    oldEnvironmentDisposed: true,
    newEnvironmentDisposed: false,
    mapName: 'bob-laboratory-pmrem',
    environmentName: 'bob-laboratory-pmrem',
    body: 0.42,
    eyes: 1.12,
  });
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('real Level 1 controls drive Bob ground locomotion, stopping, and reversal', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });
  const assertTraversalRuntimeExposed =
    await exposeProductionTraversalRuntime(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  assertTraversalRuntimeExposed();
  await expect(page.locator('[data-action="start"]')).toBeVisible({
    timeout: 120_000,
  });
  await page.locator('[data-action="start"]').click();
  await waitForRenderedFrames(page, 2);

  const readBob = async () => page.evaluate(() => {
    const runtime = (
      window as Window & {
        __specimenProductionTraversalRuntime?: ProductionTraversalRuntime;
      }
    ).__specimenProductionTraversalRuntime;
    const resources = runtime?.resources;
    if (!resources) throw new Error('Missing plain-production Bob diagnostics');
    const diagnostics = resources.testScene.bob.diagnostics;
    const position = resources.body.position as {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    return {
      position: { x: position.x, y: position.y, z: position.z },
      facingYawRadians: diagnostics.facingYawRadians,
      grounded: resources.body.grounded,
      locomotionStrength: diagnostics.locomotionStrength,
      reversing: diagnostics.reversing,
      speed: diagnostics.speed,
    };
  });

  const idle = await readBob();
  await expect.poll(
    async () => (await readBob()).grounded,
    { timeout: 3_000, message: 'Waiting for Bob to settle on the floor' },
  ).toBe(true);
  await page.keyboard.down('a');
  await expect.poll(
    async () => (await readBob()).locomotionStrength > 0,
    { timeout: 3_000, message: 'Waiting for Bob ground locomotion' },
  ).toBe(true);
  await page.waitForTimeout(400);
  const moving = await readBob();
  await page.keyboard.up('a');
  await expect.poll(
    async () => (await readBob()).speed,
    { timeout: 3_000, message: 'Waiting for Bob to stop' },
  ).toBe(0);
  const stopped = await readBob();
  if (stopped.locomotionStrength > 0) {
    await expect.poll(
      async () => (await readBob()).locomotionStrength,
      { timeout: 3_000, message: 'Waiting for Bob to settle toward Neutral' },
    ).toBeLessThan(stopped.locomotionStrength);
  }
  const settled = await readBob();

  expect(moving.position).not.toEqual(idle.position);
  expect(moving.locomotionStrength).toBeGreaterThan(0);
  expect(settled.locomotionStrength).toBeLessThan(moving.locomotionStrength);
  expect(settled.locomotionStrength).toBeLessThanOrEqual(
    stopped.locomotionStrength,
  );

  await page.keyboard.down('d');
  await expect.poll(
    async () => (await readBob()).reversing,
    { timeout: 3_000, message: 'Waiting for Bob reversal collection' },
  ).toBe(true);
  const collecting = await readBob();
  expect(collecting.locomotionStrength).toBeLessThan(
    moving.locomotionStrength,
  );
  await expect.poll(
    async () => (await readBob()).reversing,
    { timeout: 3_000, message: 'Waiting for Bob bounded reversal turn' },
  ).toBe(false);
  await expect.poll(
    async () => (await readBob()).locomotionStrength,
    { timeout: 3_000, message: 'Waiting for Bob sustained lean after turning' },
  ).toBeGreaterThan(0.05);
  const reversed = await readBob();
  await page.keyboard.up('d');
  const reversalAngle = Math.abs(Math.atan2(
    Math.sin(reversed.facingYawRadians - settled.facingYawRadians),
    Math.cos(reversed.facingYawRadians - settled.facingYawRadians),
  ));
  expect(reversalAngle).toBeGreaterThan(170 * Math.PI / 180);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('Level 1 damage holds the burst at frame zero through Stress anticipation', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const assertTraversalRuntimeExposed =
    await exposeProductionTraversalRuntime(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  assertTraversalRuntimeExposed();
  await expect(page.locator('[data-action="start"]')).toBeVisible({
    timeout: 120_000,
  });
  await page.locator('[data-action="start"]').click();

  const observation = await page.evaluate(() => {
    const runtime = (
      window as Window & {
        __specimenProductionTraversalRuntime?: ProductionTraversalRuntime;
      }
    ).__specimenProductionTraversalRuntime;
    const resources = runtime?.resources;
    if (!resources) throw new Error('Missing plain-production traversal runtime');

    const bob = resources.testScene.bob;
    let damageCallCount = 0;
    const onDamage = bob.onDamage.bind(bob);
    bob.onDamage = (strength: number) => {
      damageCallCount += 1;
      onDamage(strength);
    };

    const accepted = resources.containmentLevel.requestHazardFailure({
      roomId: 'room-3',
      hazardId: 'browser-damage-regression',
    });
    const elapsedAtStart = bob.diagnostics.deathBurst.elapsedSeconds;
    bob.updateDeath(0.05);
    const elapsedDuringStress = bob.diagnostics.deathBurst.elapsedSeconds;
    bob.updateDeath(0.025);
    const elapsedAtHandoff = bob.diagnostics.deathBurst.elapsedSeconds;
    bob.updateDeath(0.01);
    const elapsedAfterHandoff = bob.diagnostics.deathBurst.elapsedSeconds;

    return {
      accepted,
      damageCallCount,
      elapsedAtStart,
      elapsedDuringStress,
      elapsedAtHandoff,
      elapsedAfterHandoff,
    };
  });

  expect(observation).toMatchObject({
    accepted: true,
    damageCallCount: 1,
    elapsedAtStart: 0,
    elapsedDuringStress: 0,
    elapsedAtHandoff: 0,
  });
  expect(observation.elapsedAfterHandoff).toBeCloseTo(0.01, 12);
});
