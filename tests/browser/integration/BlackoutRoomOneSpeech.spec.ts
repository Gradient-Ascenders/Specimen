import { expect, test } from '@playwright/test';
import { exposeGame } from '../../helpers/GameRuntime.ts';

test('Room 1 arrival hands back to Volt’s and Goop’s dialogue; pause and F1 hide it correctly', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await exposeGame(page, { session: '__roomOneSpeechSession' });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 180_000 });
  await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: 'Level 3 Blackout', exact: true }).click();
  await page.getByRole('button', { name: 'Enter Level 3', exact: true }).click({ timeout: 180_000 });
  await page.waitForFunction(() => {
    const rt = (window as any).__roomOneSpeechSession.runtime;
    return rt.resources?.ventArrival?.active;
  }, null, { timeout: 180_000 });
  expect(await page.evaluate(() => (window as any).__roomOneSpeechSession.runtime.resources.roomOneSpeech.root.visible)).toBe(false);
  await page.waitForFunction(() => {
    const rt = (window as any).__roomOneSpeechSession.runtime;
    return rt.input.enabled && rt.resources.roomOneSpeech.readModel.text === 'BEEN A WHILE, GOOP';
  }, null, { timeout: 180_000 });
  await page.evaluate(() => (window as any).__roomOneSpeechSession.runtime.renderLayer.setAnimationLoop(null));

  const render = (wide = false) => page.evaluate(wide => {
    const rt = (window as any).__roomOneSpeechSession.runtime;
    rt.render(1, { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60, frameDeltaSeconds: 1 / 60,
      stepsThisFrame: 1, interpolationAlpha: 1, droppedSimulationTimeSeconds: 0, renderFps: 60 });
    const speech = rt.resources.roomOneSpeech;
    const group = rt.resources.group;
    const focus = group.voltBody.position.clone().add(group.goopBody.position).multiplyScalar(.5);
    const camera = rt.renderLayer.cameraRig.camera;
    if (wide) {
      camera.position.copy(focus).add(focus.clone().set(3, 3, 9));
      focus.y += 1.4;
      camera.lookAt(focus);
      camera.updateMatrixWorld(true);
    }
    rt.renderLayer.render();
    const body = speech.readModel.speaker === 'volt' ? rt.resources.group.voltBody : rt.resources.group.goopBody;
    return { ...speech.readModel, visible: speech.root.visible,
      clip: speech.mesh.getWorldPosition(speech.root.position.clone()).project(rt.renderLayer.cameraRig.camera).toArray(),
      anchor: speech.root.getWorldPosition(speech.root.position.clone()).toArray(), body: body.position.toArray(),
      active: group.activeSlimeId,
      local: speech.mesh.position.toArray(), depthTest: speech.mesh.material.depthTest,
      glError: rt.renderLayer.renderer.getContext().getError() };
  }, wide);

  let sample = await render();
  expect(sample.speaker).toBe('volt');
  expect(sample.visible).toBe(true);
  expect(sample.anchor[0]).toBeCloseTo(sample.body[0], 4);
  expect(sample.anchor[1]).toBeCloseTo(sample.body[1] + 2.75, 4);
  expect(sample.anchor[2]).toBeCloseTo(sample.body[2], 4);
  expect(sample.active).toBe('volt');
  expect(sample.local).not.toEqual([0, 0, 0]);
  expect(sample.depthTest).toBe(false);
  expect(sample.clip[0]).toBeCloseTo(-.6, 4);
  expect(Math.abs(sample.clip[0])).toBeLessThan(.9);
  expect(Math.abs(sample.clip[1])).toBeLessThan(.9);
  expect(sample.glError).toBe(0);
  await page.screenshot({ path: info.outputPath('volt-dialogue-640.png') });

  await page.keyboard.press('F1');
  await expect(page.locator('#app')).toHaveAttribute('data-clean-gameplay', 'true');
  expect(await page.evaluate(() => {
    const rt = (window as any).__roomOneSpeechSession.runtime, speech = rt.resources.roomOneSpeech;
    const before = speech.readModel.text;
    rt.fixedUpdate(1 / 60);
    return { visible: speech.root.visible, unchanged: speech.readModel.text === before };
  })).toEqual({ visible: false, unchanged: true });
  await page.keyboard.press('F1');
  await page.evaluate(() => {
    const rt = (window as any).__roomOneSpeechSession.runtime;
    for (let i = 0; i < 240; i++) rt.fixedUpdate(1 / 60);
  });
  sample = await render(true);
  expect(sample.speaker).toBe('goop');
  expect(sample.sectionIndex).toBe(1);
  expect(sample.visible).toBe(true);
  expect(sample.local).toEqual([0, 0, 0]);
  expect(sample.depthTest).toBe(true);
  expect(sample.anchor[0]).toBeCloseTo(sample.body[0], 4);
  expect(sample.anchor[1]).toBeCloseTo(sample.body[1] + 2.75, 4);
  expect(sample.anchor[2]).toBeCloseTo(sample.body[2], 4);
  expect(Math.abs(sample.clip[0])).toBeLessThan(.9);
  expect(Math.abs(sample.clip[1])).toBeLessThan(.9);
  await page.screenshot({ path: info.outputPath('goop-dialogue-640.png') });
  for (let i = 0; i < 2; i++) {
    await page.keyboard.down('Tab');
    await page.evaluate(() => (window as any).__roomOneSpeechSession.runtime.fixedUpdate(1 / 60));
    await page.keyboard.up('Tab');
  }
  sample = await render();
  expect(sample.active).toBe('goop');
  expect(sample.speaker).toBe('goop');
  expect(sample.depthTest).toBe(false);
  expect(sample.clip[0]).toBeCloseTo(-.6, 4);
  expect(Math.abs(sample.clip[1])).toBeLessThan(.9);
  await page.screenshot({ path: info.outputPath('controlled-goop-dialogue-640.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await render();
  await page.screenshot({ path: info.outputPath('goop-dialogue-1280.png') });

  expect(await page.evaluate(() => {
    const rt = (window as any).__roomOneSpeechSession.runtime, speech = rt.resources.roomOneSpeech;
    rt.stop();
    const before = speech.readModel;
    rt.fixedUpdate(10);
    const paused = !speech.root.visible && speech.readModel.text === before.text;
    rt.start();
    rt.fixedUpdate(1 / 60);
    return { paused, visibleAfterResume: speech.root.visible };
  })).toEqual({ paused: true, visibleAfterResume: true });
  expect(errors).toEqual([]);
});
