import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { finishOpening } from '../helpers/OpeningHandoff.ts';

test('the pictured ascending lift has four matching corner spills throughout its travel', async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /(\binitialRuntime:\s*)([\w$]+)/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern, '$1globalThis.__cornerRuntime=$2') });
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ timeout: 120_000 });
  await finishOpening(page, false);
  await page.evaluate(() => {
    const rt = (window as any).__cornerRuntime;
    rt.renderLayer.setAnimationLoop(null);
    rt.resources.containmentLevel.teleportToRoomForDebug(4);
    rt.stop();
  });
  const evidence: unknown[] = [];
  for (const view of [
    { name: 'early-overhead', elapsed: 1, x: 0, z: -4.5 },
    { name: 'midway-opposite', elapsed: 21.5, x: 0, z: 4.5 },
    { name: 'upper-oblique', elapsed: 13.5, x: 4, z: -4.5 },
  ]) {
    const result = await page.evaluate(view => {
      const rt = (window as any).__cornerRuntime, r = rt.resources;
      const room = r.testScene.roomFour, layer = rt.renderLayer, renderer = layer.renderer;
      const gl = renderer.getContext();
      room.elevator.begin();
      // Advance the actual sequence and its existing presentation sync. The
      // source lights remain children of the real moving platform throughout.
      room.updateActive(view.elapsed + (view.name === 'early-overhead' ? room.elevator.startDelaySeconds : 0), r.body, []);
      r.testScene.lighting.setActiveRoom(4);
      r.testScene.lighting.setTraversalPosition(room.elevatorPlatform.root.position);
      r.testScene.lighting.reconcileAuthoritativeState(true);
      rt.lightLayout?.sync();
      const center = room.elevatorPlatform.root.getWorldPosition(room.root.position.clone());
      const camera = layer.cameraRig.camera;
      camera.position.set(center.x + view.x, center.y + 13, center.z + view.z);
      camera.lookAt(center); camera.updateMatrixWorld(true);
      const lights: any[] = [];
      room.elevatorPlatform.root.traverse((object: any) => {
        if (object.isPointLight && object.name.endsWith('-warning-point-light')) lights.push(object);
      });
      if (lights.length !== 4) throw new Error(`Expected four corner lights; found ${lights.length}`);
      const draw = () => r.testScene.withEnclosedRoomOcclusion(r.body.position, camera.position, () => layer.render());
      const readDeck = () => lights.map(light => {
        const p = light.getWorldPosition(center.clone());
        p.x += Math.sign(center.x - p.x) * .55;
        p.z += Math.sign(center.z - p.z) * .55;
        p.y = center.y + .27;
        p.project(camera);
        const pixel = new Uint8Array(4 * 5 * 5);
        gl.readPixels(Math.round((p.x + 1) * .5 * gl.drawingBufferWidth) - 2,
          Math.round((p.y + 1) * .5 * gl.drawingBufferHeight) - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return [0, 1, 2].map(channel => {
          let total = 0;
          for (let i = channel; i < pixel.length; i += 4) total += pixel[i];
          return total / 25;
        });
      });
      draw(); // Initialize existing shadow maps before comparing steady draws.
      draw();
      const all = readDeck();
      const png = layer.canvas.toDataURL('image/png');
      const calls = renderer.info.render.calls;
      const intensity = lights[2].intensity;
      lights[2].intensity = lights[3].intensity = 0;
      draw();
      const missingFarPair = readDeck();
      const baselineCalls = renderer.info.render.calls;
      lights[2].intensity = lights[3].intensity = intensity;
      let timing: { beforeMs: number; afterMs: number } | undefined;
      if (view.name === 'early-overhead') {
        const select = (enabled: boolean) => {
          lights[2].visible = lights[3].visible = enabled;
          rt.lightLayout?.sync();
        };
        // Warm both shader variants, then alternate order to reduce clock and
        // first-use bias. These are local headless samples, not a frame budget.
        for (const enabled of [false, true]) { select(enabled); draw(); gl.finish(); }
        const before: number[] = [], after: number[] = [];
        for (let pair = 0; pair < 8; pair++) {
          for (const enabled of pair % 2 ? [true, false] : [false, true]) {
            select(enabled);
            const start = performance.now(); draw(); gl.finish();
            (enabled ? after : before).push(performance.now() - start);
          }
        }
        const median = (times: number[]) => { times.sort((a, b) => a - b); return (times[3] + times[4]) / 2; };
        timing = { beforeMs: median(before), afterMs: median(after) };
        select(true);
      }
      return { png, all, missingFarPair, calls, baselineCalls,
        timing,
        state: room.elevator.state, progress: room.elevator.ascentProgress,
        positions: lights.map(light => light.position.toArray()),
        settings: lights.map(light => ({ colour: light.color.getHex(), intensity: light.intensity,
          distance: light.distance, decay: light.decay, castShadow: light.castShadow })),
        glError: gl.getError() };
    }, view);
    const { png: _, ...measurements } = result;
    await writeFile(info.outputPath(`${view.name}.png`), Buffer.from(result.png.split(',')[1], 'base64'));
    await writeFile(info.outputPath(`${view.name}.json`), JSON.stringify(measurements, null, 2));
    expect(result.state).toBe('ascending');
    expect(result.settings.every(setting => setting.colour === 0xff9e1b && setting.intensity === 1.8 &&
      setting.distance === 3.6 && setting.decay === 2 && !setting.castShadow)).toBe(true);
    expect(result.calls).toBe(result.baselineCalls);
    expect(result.glError).toBe(0);
    for (const index of [2, 3]) {
      expect(result.all[index][0] - result.missingFarPair[index][0]).toBeGreaterThan(15);
      expect(result.all[index][0] - result.all[index][2]).toBeGreaterThan(15);
    }
    for (const index of [0, 1]) {
      expect(result.all[index]).toEqual(result.missingFarPair[index]);
    }
    evidence.push(measurements);
  }
  await writeFile(info.outputPath('corner-lighting.json'), JSON.stringify(evidence, null, 2));
  expect(errors).toEqual([]);
});
