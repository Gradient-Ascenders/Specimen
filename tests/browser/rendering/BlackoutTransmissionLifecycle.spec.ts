import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { exposeGame } from '../../helpers/GameRuntime.ts';
import { finishLevelArrival } from '../../helpers/LevelArrival.ts';
import { GRAPHICS_PROFILES } from '../../../src/render/GraphicsProfiles.ts';
import { installTextureOwnershipTrace } from '../../../scripts/diagnostics/trace-texture-ownership.mjs';
import { captureBlackoutRehearsalRecovery } from '../../helpers/BlackoutRehearsalRecovery.ts';

test('Blackout rehearsal transmission resources stabilize across level re-entry', async ({ page }, info) => {
  test.setTimeout(900_000);
  const errors: string[] = [], samples: any[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  await page.addInitScript(installTextureOwnershipTrace);
  await page.addInitScript(settings => localStorage.setItem('specimen.graphics-preferences.v1', JSON.stringify({ mode: 'manual', settings })), GRAPHICS_PROFILES.standard.settings);
  await exposeGame(page, { session: '__transmissionLifecycle' });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-flow-panel="title"]').waitFor({ timeout: 180_000 });
  await page.evaluate(() => {
    const renderer = (window as any).__transmissionLifecycle.runtime.renderLayer.renderer;
    (window as any).__textureOwnership.attach(renderer);
  });
  const transmission = () => page.evaluate(() => {
    const layer = (window as any).__transmissionLifecycle.runtime.renderLayer, renderer = layer.renderer;
    const trace = (window as any).__textureOwnership.snapshot(), live = new Set(trace.live);
    const allocations = trace.allocations.filter((a: any) => live.has(a.id) && a.kind === 'texture' &&
      trace.targets[a.target]?.samples >= 4 && trace.targets[a.target].context.some((c: any) => c.camera === layer.cameraRig.camera.uuid));
    return { allocations: allocations.map((a: any) => ({ id: a.id, width: a.width, height: a.height })),
      expected: [renderer.domElement.width * renderer.transmissionResolutionScale, renderer.domElement.height * renderer.transmissionResolutionScale] };
  });
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.locator('[data-flow-panel="title"] [data-action="level-select"]').click();
    await page.getByRole('button', { name: 'Level 3 Blackout', exact: true }).click();
    await page.locator('[data-action="enter-level"]').waitFor({ state: 'visible', timeout: 240_000 });
    const prepared = await transmission();
    expect(prepared.allocations).toHaveLength(1);
    expect([prepared.allocations[0].width, prepared.allocations[0].height]).toEqual(prepared.expected);
    await page.locator('[data-action="enter-level"]').click();
    await finishLevelArrival(page, '__transmissionLifecycle');
    await page.waitForTimeout(1000);
    const gameplay = await page.evaluate(() => ({ ...(window as any).__transmissionLifecycle.runtime.renderLayer.renderer.info.memory }));
    expect((await transmission()).allocations).toEqual(prepared.allocations);
    await page.keyboard.press('KeyP');
    await page.locator('[data-flow-panel="paused"]').getByRole('button', { name: 'Return to menu', exact: true }).click();
    await page.locator('[data-flow-panel="title"]').waitFor();
    await page.waitForTimeout(1000);
    const menu = await page.evaluate(() => {
      const trace = (window as any).__textureOwnership.snapshot(), live = new Set(trace.live);
      return { memory: { ...(window as any).__transmissionLifecycle.runtime.renderLayer.renderer.info.memory },
        liveTextures: trace.allocations.filter((a: any) => live.has(a.id) && a.kind === 'texture').length,
        liveRenderbuffers: trace.allocations.filter((a: any) => live.has(a.id) && a.kind === 'renderbuffer').length };
    });
    samples.push({ gameplay, menu });
  }
  await writeFile(info.outputPath('transmission-lifecycle.json'), JSON.stringify({ samples, errors }, null, 2));
  expect(errors).toEqual([]);
  expect(samples.map(sample => sample.gameplay.textures)).toEqual(Array(3).fill(samples[0].gameplay.textures));
  expect(samples.map(sample => sample.menu.memory.textures)).toEqual(Array(3).fill(samples[0].menu.memory.textures));
  expect(samples.map(sample => sample.menu.liveTextures)).toEqual(Array(3).fill(samples[0].menu.liveTextures));
  expect(samples.map(sample => sample.menu.liveRenderbuffers)).toEqual(Array(3).fill(samples[0].menu.liveRenderbuffers));
});

for (const profile of ['standard', 'high'] as const) test(`Blackout ${profile} rehearsal restores camera state on cancellation`, async ({ page }, info) => {
  test.setTimeout(900_000);
  // Forced loss is covered by the strict manual context diagnostic: main has
  // an independently reproduced GL error there. Keep valid-context cancellation
  // as a permanent regression without relaxing that diagnostic's assertions.
  const capture = await captureBlackoutRehearsalRecovery(page, profile, false), { result, errors } = capture;
  await writeFile(info.outputPath('transmission-cancellation.json'), JSON.stringify(capture, null, 2));
  expect(result.restoredCamera).toBe(true);
  for (const error of Object.values(result.glErrors)) expect(error).toBe(0);
  expect(result.callbacks).toBe(1); expect(result.cancellationCameraRestored).toBe(true);
  expect(result.state).toBe('unloaded'); expect(result.visibility).not.toBe('hidden'); expect(errors).toEqual([]);
});
