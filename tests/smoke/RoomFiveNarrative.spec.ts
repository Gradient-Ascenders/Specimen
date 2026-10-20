import { expect, test, type Page, type Route } from '@playwright/test';

async function readNarrative(page: Page) {
  return page.evaluate(() => {
    const rt = (window as any).__roomFiveNarrativeRuntime, r = rt.resources;
    const speech = r.testScene.roomFive.goopSpeech, monitor = r.testScene.roomFiveMonitor;
    const project = (object: any) => object.getWorldPosition(object.position.clone()).project(rt.renderLayer.cameraRig.camera).toArray();
    const pixels = monitor.texture.image.data;
    let red = 0, green = 0;
    for (let y = 80; y < 210; y++) for (let x = 24; x < 480; x++) {
      const i = (y * 512 + x) * 4;
      if (pixels[i] > pixels[i + 1] + 60 && pixels[i] > pixels[i + 2] + 60) red++;
      if (pixels[i + 1] > pixels[i] + 50 && pixels[i + 1] > pixels[i + 2] + 40) green++;
    }
    return {
      speech: { ...speech.dialogue.readModel, showing: speech.isShowing, activated: speech.hasActivated,
        finished: speech.hasFinished, texture: speech.texture.uuid, geometry: speech.mesh.geometry.uuid,
        material: speech.mesh.material.uuid, version: speech.texture.version, clip: project(speech.mesh) },
      monitor: { ...monitor.dialogue.readModel, activated: monitor.hasActivated, red, green,
        texture: monitor.texture.uuid, material: monitor.screen.material.uuid, clip: project(monitor.screen) },
      programs: rt.renderLayer.renderer.info.programs.length,
      glError: rt.renderLayer.renderer.getContext().getError(),
    };
  });
}

test('Room 5 shows Goop’s anchored pleas and paginated observer messages at their separate proximity triggers', async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
  });
  const expose = async (route: Route) => {
    const response = await route.fetch(), source = await response.text();
    const initialRuntime = /(\binitialRuntime:\s*)([\w$]+)/;
    expect(source).toMatch(initialRuntime);
    await route.fulfill({ response, body: source.replace(initialRuntime, '$1globalThis.__roomFiveNarrativeRuntime=$2') });
  };
  await page.route('**/assets/index-*.js', expose);
  await page.route('**/src/main.ts*', expose);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-action="start"]').click();
  await page.locator('[data-action="skip-opening"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  await page.evaluate(() => {
    const rt = (window as any).__roomFiveNarrativeRuntime, r = rt.resources;
    r.containmentLevel.teleportToRoomForDebug(5);
    r.body.teleport({ x: 9, y: 75.21, z: 93.5 });
    rt.renderLayer.cameraRig.reset(); rt.retargetCameraToActiveSlime(r);
    rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
    rt.renderLayer.cameraRig.queueLookInput(0, (-.08 - Math.PI / 10) / .002);
  });
  await page.waitForFunction(() => (window as any).__roomFiveNarrativeRuntime.resources.body.grounded);
  const dormant = await readNarrative(page);
  expect(dormant.speech.activated).toBe(false); expect(dormant.speech.showing).toBe(false);
  expect(dormant.monitor.activated).toBe(false); expect(dormant.monitor.text).toBe('');
  await page.evaluate(() => (window as any).__roomFiveNarrativeRuntime.resources.body.teleport({ x: .084, y: 77.397, z: 102.793 }));

  for (const [section, text] of [
    [0, 'HEY! YOU!'], [1, 'GET ME OUTTA HERE!'], [2, 'THEY WILL KILL YOU TOO'], [3, 'THE SWITCH IS AT THE TOP'],
  ] as const) {
    await page.waitForFunction(section => {
      const m = (window as any).__roomFiveNarrativeRuntime.resources.testScene.roomFive.goopSpeech.dialogue.readModel;
      return m.sectionIndex === section && m.text.length > 0 && !m.typing;
    }, section, { timeout: 60_000 });
    await page.evaluate(() => (window as any).__roomFiveNarrativeRuntime.stop());
    await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
    const sample = await readNarrative(page);
    expect(sample.speech.text.replace(/\s+/g, ' ')).toBe(text); expect(sample.speech.showing).toBe(true);
    expect(sample.speech.texture).toBe(dormant.speech.texture);
    expect(sample.speech.geometry).toBe(dormant.speech.geometry);
    expect(sample.speech.material).toBe(dormant.speech.material);
    expect(Math.abs(sample.speech.clip[0])).toBeLessThan(.85);
    expect(Math.abs(sample.speech.clip[1])).toBeLessThan(.85);
    expect(sample.speech.clip[2]).toBeGreaterThan(-1); expect(sample.speech.clip[2]).toBeLessThan(1);
    expect(sample.programs).toBe(dormant.programs); expect(sample.glError).toBe(0);
    expect(sample.monitor.activated).toBe(false);
    await page.screenshot({ path: info.outputPath(`goop-plea-${section + 1}.png`) });
    if (section === 0) {
      await page.evaluate(() => {
        const speech = (window as any).__roomFiveNarrativeRuntime.resources.testScene.roomFive.goopSpeech;
        speech.update(120, { x: 9, y: 75.21, z: 93.5 });
      });
      const away = await readNarrative(page);
      expect(away.speech.showing).toBe(false); expect(away.speech.text).toBe(sample.speech.text);
      expect(away.speech.version).toBe(sample.speech.version);
    }
    if (section < 3) await page.evaluate(() => (window as any).__roomFiveNarrativeRuntime.start());
  }

  await page.evaluate(() => {
    const rt = (window as any).__roomFiveNarrativeRuntime, r = rt.resources;
    r.body.teleport({ x: -.68, y: 81.542, z: 115.652 });
    rt.renderLayer.cameraRig.reset(); rt.retargetCameraToActiveSlime(r);
    rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
    rt.renderLayer.cameraRig.queueLookInput(0, (-.08 - Math.PI / 10) / .002);
    rt.start();
  });
  for (const [index, text, colour] of [
    [0, 'WE MUST INTERVENE BEFORE HE GOES FURTHER', 'red'],
    [1, 'NO, WE MUST FIRST DETERMINE THE FULL EXTENT OF BOB’S', 'green'],
    [2, 'CAPABILITIES.', 'green'], [3, 'I’LL DEPLOY A DRONE AS A PRECAUTION.', 'red'],
  ] as const) {
    await page.waitForFunction(index => {
      const m = (window as any).__roomFiveNarrativeRuntime.resources.testScene.roomFiveMonitor.dialogue.readModel;
      return m.pageIndex === index && m.text.length > 0 && !m.typing;
    }, index, { timeout: 60_000 });
    await page.evaluate(() => (window as any).__roomFiveNarrativeRuntime.stop());
    const sample = await readNarrative(page);
    expect(sample.monitor.text.replace(/\s+/g, ' ')).toBe(text);
    expect(sample.monitor[colour]).toBeGreaterThan(0);
    expect(sample.monitor[colour === 'red' ? 'green' : 'red']).toBe(0);
    expect(sample.monitor.texture).toBe(dormant.monitor.texture); expect(sample.monitor.material).toBe(dormant.monitor.material);
    expect(Math.abs(sample.monitor.clip[0])).toBeLessThan(.85);
    expect(Math.abs(sample.monitor.clip[1])).toBeLessThan(.85);
    expect(sample.monitor.clip[2]).toBeGreaterThan(-1); expect(sample.monitor.clip[2]).toBeLessThan(1);
    expect(sample.programs).toBe(dormant.programs); expect(sample.glError).toBe(0);
    await page.screenshot({ path: info.outputPath(`room-5-monitor-page-${index + 1}-${colour}.png`) });
    if (index < 3) await page.evaluate(() => (window as any).__roomFiveNarrativeRuntime.start());
  }
  const final = await readNarrative(page);
  expect(final.speech.finished).toBe(true); expect(final.speech.showing).toBe(false);
  await page.evaluate(() => (window as any).__roomFiveNarrativeRuntime.start());
  await page.keyboard.press('KeyP');
  await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
  await page.locator('[data-action="restart"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  const restarted = await readNarrative(page);
  expect(restarted.speech.activated).toBe(false); expect(restarted.speech.showing).toBe(false);
  expect(restarted.monitor.activated).toBe(false); expect(restarted.monitor.text).toBe('');
  expect(errors).toEqual([]);
});
