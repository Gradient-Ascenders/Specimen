import { expect, test, type Page, type Route } from '@playwright/test';

async function readMonitor(page: Page, room: 1 | 2 | 3) {
  return page.evaluate(room => {
    const runtime = (window as any).__roomMonitorRuntime;
    const monitor = runtime.resources.testScene[({ 1: 'roomOneMonitor', 2: 'roomTwoMonitor', 3: 'roomThreeMonitor' } as const)[room]];
    const pixels = monitor.texture.image.data;
    let red = 0, green = 0;
    for (let y = 80; y < 210; y++) for (let x = 24; x < 480; x++) {
      const i = (y * 512 + x) * 4;
      if (pixels[i] > pixels[i + 1] + 60 && pixels[i] > pixels[i + 2] + 60) red++;
      if (pixels[i + 1] > pixels[i] + 50 && pixels[i + 1] > pixels[i + 2] + 40) green++;
    }
    const geometries: string[] = [];
    monitor.root.traverse((object: any) => { if (object.isMesh) geometries.push(object.geometry.uuid); });
    return { ...monitor.dialogue.readModel, activated: monitor.hasActivated ?? true, red, green,
      texture: monitor.texture.uuid, version: monitor.texture.version, geometries,
      material: monitor.screen.material.uuid, position: monitor.root.position.toArray(),
      programs: runtime.renderLayer.renderer.info.programs.length,
      glError: runtime.renderLayer.renderer.getContext().getError() };
  }, room);
}

test('room monitors retain green Room 1 text and proximity-started coloured Room 2 and 3 dialogue through restart', async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
  });
  // Expose the existing runtime only in this test's served entry, in either
  // minified production or transformed development JS. No runtime debug hook.
  const expose = async (route: Route) => {
    const response = await route.fetch(), source = await response.text();
    const initialRuntime = /(\binitialRuntime:\s*)([\w$]+)/;
    expect(source).toMatch(initialRuntime);
    await route.fulfill({ response, body: source.replace(initialRuntime, '$1globalThis.__roomMonitorRuntime=$2') });
  };
  await page.route('**/assets/index-*.js', expose);
  await page.route('**/src/main.ts*', expose);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-action="start"]').click();
  await page.locator('[data-action="skip-opening"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  await page.waitForFunction(() => (window as any).__roomMonitorRuntime.resources.testScene.roomOneMonitor.dialogue.readModel.text === 'INTERESTING...',
    null, { timeout: 90_000 });
  const roomOne = await readMonitor(page, 1);
  expect(roomOne.green).toBeGreaterThan(0); expect(roomOne.red).toBe(0);
  for (const room of [2, 3] as const) {
    const dormant = await readMonitor(page, room);
    expect(dormant.activated).toBe(false); expect(dormant.text).toBe('');
  }

  for (const setup of [
    { room: 2, monitor: 'roomTwoMonitor', near: { x: 4.2, y: 4.56, z: 31.0999 },
      far: { x: 4.2, y: .46, z: 31.0999 }, yaw: -Math.PI / 2 - .54, pitch: -.11,
      sections: [
        ['SUBJECT EXHIBITS REMARKABLE ELASTIC RESILIENCE.', 'red'],
        ['COULD THE SPECIMEN BE IMPERVIOUS TO LASER RADIATION?', 'green'], ['WE WILL OBSERVE', 'red'],
      ] },
    { room: 3, monitor: 'roomThreeMonitor', near: { x: 11.2583, y: 12.1429, z: 59 },
      far: { x: 0, y: 10.86, z: 51.4 }, yaw: -Math.PI / 2 + .24, pitch: -.03,
      sections: [
        ['ANOTHER ACID LEAK?', 'green'], ['DUE TO GOOP’S POOR BEHAVIOR', 'red'],
        ['HIS TERMINATION MAY BE CONSIDERED', 'red'],
      ] },
  ] as const) {
    const dormant = await readMonitor(page, setup.room);
    await page.evaluate(setup => {
      const rt = (window as any).__roomMonitorRuntime, r = rt.resources;
      r.containmentLevel.teleportToRoomForDebug(setup.room);
      r.body.teleport(setup.far);
      // A large dormant-time step must not consume any proximity dialogue.
      r.testScene[setup.monitor].update(120, r.body.position);
      rt.renderLayer.cameraRig.reset(); rt.retargetCameraToActiveSlime(r);
      rt.renderLayer.cameraRig.setGroundOrbitYawRadians(setup.yaw);
      rt.renderLayer.cameraRig.queueLookInput(0, (setup.pitch - Math.PI / 10) / .002);
      rt.start();
    }, setup);
    await page.waitForFunction(() => (window as any).__roomMonitorRuntime.resources.body.grounded);
    const outside = await readMonitor(page, setup.room);
    expect(outside.activated).toBe(false); expect(outside.text).toBe(''); expect(outside.version).toBe(dormant.version);
    if (setup.room === 3) {
      const panelEnd = await page.evaluate(() => {
        const panel = (window as any).__roomMonitorRuntime.resources.testScene.teaching.roomTwoArt.root
          .getObjectByName('room-2-panel-east-upper-north');
        panel.geometry.computeBoundingBox();
        return panel.geometry.boundingBox.clone().applyMatrix4(panel.matrixWorld).max.z;
      });
      expect(panelEnd).toBeLessThan(49); // No floating Room 2 cladding beside this monitor.
    }
    await page.evaluate(near => (window as any).__roomMonitorRuntime.resources.body.teleport(near), setup.near);

    for (let section = 0; section < setup.sections.length; section++) {
      const [text, colour] = setup.sections[section];
      await page.waitForFunction(({ monitor, index }) => {
        const m = (window as any).__roomMonitorRuntime.resources.testScene[monitor].dialogue.readModel;
        return m.sectionIndex === index && m.text.length > 0 && !m.typing;
      }, { monitor: setup.monitor, index: section }, { timeout: 60_000 });
      // Freeze gameplay, not rendering, so screenshots cannot miss a section or
      // hide a late reset while the software renderer captures a frame.
      await page.evaluate(() => (window as any).__roomMonitorRuntime.stop());
      const sample = await readMonitor(page, setup.room);
      expect(sample.text.replace(/\s+/g, ' ')).toBe(text);
      expect(sample[colour]).toBeGreaterThan(0);
      expect(sample[colour === 'red' ? 'green' : 'red']).toBe(0);
      expect(sample.texture).toBe(dormant.texture); expect(sample.material).toBe(dormant.material);
      expect(sample.geometries).toEqual(dormant.geometries);
      expect(sample.programs).toBe(outside.programs); expect(sample.glError).toBe(0);
      if (section === 1) {
        // Section 2 completed out of range; return only for the screenshot.
        await page.evaluate(near => (window as any).__roomMonitorRuntime.resources.body.teleport(near), setup.near);
      }
      await page.evaluate(async () => {
        for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
      });
      await page.screenshot({ path: info.outputPath(`room-${setup.room}-section-${section + 1}-${colour}.png`) });
      if (section < 2) {
        // Leaving and re-entering must not pause or restart either monitor.
        await page.evaluate(position => {
          const rt = (window as any).__roomMonitorRuntime;
          rt.resources.body.teleport(position); rt.start();
        }, section === 0 ? setup.far : setup.near);
      }
    }
  }
  await page.evaluate(() => (window as any).__roomMonitorRuntime.start());
  await page.keyboard.press('KeyP');
  await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
  await page.locator('[data-action="restart"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  for (const room of [2, 3] as const) {
    const restarted = await readMonitor(page, room);
    expect(restarted.activated).toBe(false); expect(restarted.text).toBe('');
  }
  expect(errors).toEqual([]);
});
