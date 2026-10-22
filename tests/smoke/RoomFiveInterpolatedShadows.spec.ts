import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { finishOpening } from '../helpers/OpeningHandoff.ts';

test('Room 5 presented shadows match fresh maps between fixed updates without global redraws', async ({ page }, info) => {
  test.setTimeout(600_000);
  const baseline = process.env.SPECIMEN_SHADOW_BASELINE === '1', errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern, '$1=globalThis.__shadowSession=new $2({initialRuntime:') });
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ timeout: 120_000 });
  await finishOpening(page);
  const evidence = await page.evaluate(() => {
    const rt = (window as any).__shadowSession.runtime, r = rt.resources, layer = rt.renderLayer;
    layer.setAnimationLoop(null); rt.stop(); r.containmentLevel.teleportToRoomForDebug(5);
    const scene = r.testScene, room = scene.roomFive;
    const platforms = [room.movingPlatformOne, room.movingPlatformTwo];
    const sources = scene.lighting.shadowLights;
    const visible = (object: any): boolean => !object || (object.visible && visible(object.parent));
    scene.lighting.setTraversalPosition({ x: 9, y: 83, z: 110 });
    const gl = layer.renderer.getContext(), camera = layer.cameraRig.camera;
    layer.setPresentationResolution(undefined);
    const read = () => {
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const render = () => { layer.render(); gl.finish(); return layer.renderer.info.render.calls; };
    const refresh = () => { for (const light of sources) light.shadow.needsUpdate = true; render(); };
    const signature = () => sources.map((light: any) => ({ name: light.name, castShadow: light.castShadow,
      size: light.shadow.mapSize.toArray(), map: light.shadow.map?.texture.uuid ?? null,
      mapPass: light.shadow.mapPass?.texture.uuid ?? null }));
    const cases = [];
    for (let index = 0; index < 2; index++) {
      room.reset();
      const platform = platforms[index], visual = platform.root.getObjectByName(`room-5-moving-platform-${index + 1}-production-dressing`);
      room.art.presentMovingPlatforms(1);
      camera.position.set(platform.position.x - 4, 89, platform.position.z + 8);
      camera.lookAt(platform.position.x, 76, platform.position.z + 1.5); camera.updateMatrixWorld(true);
      scene.lighting.prepareShadowFrame([]); refresh();
      const beforeResources = signature();
      platform.setActive(true); platform.update(1 / 60);
      const authority = platform.root.position.clone(), frames = [];
      let previous = visual.getWorldPosition(visual.position.clone());
      for (const alpha of [.2, .5, .8]) {
        room.art.presentMovingPlatforms(alpha); scene.lighting.prepareShadowFrame([]);
        const presented = visual.getWorldPosition(visual.position.clone());
        const dirty = sources.filter((light: any) => visible(light) && light.shadow.needsUpdate).map((light: any) => light.name);
        const updatePasses = scene.lightingDiagnostics.shadowUpdatePassCount;
        const began = performance.now(), calls = render(), frameMs = performance.now() - began;
        const actual = read(), png = layer.canvas.toDataURL('image/png');
        refresh(); const reference = read(), freshPng = layer.canvas.toDataURL('image/png');
        let changedPixels = 0, maxDifference = 0;
        for (let p = 0; p < actual.length; p += 4) {
          let delta = 0;
          for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs(actual[p + c] - reference[p + c]));
          maxDifference = Math.max(maxDifference, delta); if (delta > 1) changedPixels++;
        }
        room.art.presentMovingPlatforms(alpha); scene.lighting.prepareShadowFrame([]);
        const repeatedPasses = scene.lightingDiagnostics.shadowUpdatePassCount;
        const cachedBegan = performance.now(), cachedCalls = render(), cachedMs = performance.now() - cachedBegan;
        frames.push({ alpha, dirty, updatePasses, repeatedPasses, calls, cachedCalls, frameMs, cachedMs,
          authorityError: platform.root.position.distanceTo(authority), movement: presented.distanceTo(previous),
          changedPixels, maxDifference, png, freshPng });
        previous = presented;
      }
      const transitions = [];
      for (const [name, apply] of [
        ['reversal', () => { platform.setActive(false); platform.update(1 / 60); }],
        ['reset', () => room.reset()],
        ['checkpoint-pose', () => { platform.restoreState({ progress: .8, target: 'start' }); room.art.reset(); }],
        ['hidden', () => { platform.root.visible = false; }],
        ['visible', () => { platform.root.visible = true; }],
      ] as const) {
        apply(); room.art.presentMovingPlatforms(.5); scene.lighting.prepareShadowFrame([]);
        const passes = scene.lightingDiagnostics.shadowUpdatePassCount;
        render(); const actual = read(), png = layer.canvas.toDataURL('image/png');
        refresh(); const reference = read();
        let maxDifference = 0;
        for (let p = 0; p < actual.length; p++) maxDifference = Math.max(maxDifference, Math.abs(actual[p] - reference[p]));
        scene.lighting.prepareShadowFrame([]);
        transitions.push({ name, passes, maxDifference, repeatedPasses: scene.lightingDiagnostics.shadowUpdatePassCount, png });
      }
      cases.push({ platform: index + 1, beforeResources, afterResources: signature(), frames, transitions });
    }
    // A stationary unrelated room must keep reusing its prepared maps.
    scene.lighting.setActiveRoom(2); scene.lighting.setTraversalPosition({ x: 0, y: 5, z: 38 });
    scene.lighting.prepareShadowFrame([]); refresh(); scene.lighting.prepareShadowFrame([]);
    const otherRoomPasses = scene.lightingDiagnostics.shadowUpdatePassCount;
    return { cases, otherRoomPasses, activeShadowSources: sources.filter(visible).length,
      totalShadowSources: sources.length, glError: gl.getError(), profile: layer.graphicsConfiguration };
  });
  for (const item of evidence.cases) for (const frame of item.frames) {
    await writeFile(info.outputPath(`platform-${item.platform}-alpha-${frame.alpha}.png`), Buffer.from(frame.png.split(',')[1], 'base64'));
    await writeFile(info.outputPath(`platform-${item.platform}-alpha-${frame.alpha}-fresh.png`), Buffer.from(frame.freshPng.split(',')[1], 'base64'));
    expect(frame.authorityError).toBe(0); expect(frame.movement).toBeGreaterThan(0);
    expect(frame.repeatedPasses).toBe(0);
    if (!baseline) {
      expect(frame.dirty.sort()).toEqual(['room-5-safe-entry-received-light', 'room-5-upper-traversal-received-light']);
      expect(frame.updatePasses).toBe(2); expect(frame.changedPixels).toBe(0); expect(frame.maxDifference).toBe(0);
    }
    expect(item.afterResources).toEqual(item.beforeResources);
  }
  for (const item of evidence.cases) for (const change of item.transitions) {
    await writeFile(info.outputPath(`platform-${item.platform}-${change.name}.png`), Buffer.from(change.png.split(',')[1], 'base64'));
    if (!baseline) { expect(change.maxDifference).toBe(0); expect(change.passes).toBe(2); }
    expect(change.repeatedPasses).toBe(0);
  }
  await writeFile(info.outputPath('shadow-proof.json'), JSON.stringify({ ...evidence,
    cases: evidence.cases.map(item => ({ ...item, frames: item.frames.map(({ png, freshPng, ...frame }) => frame),
      transitions: item.transitions.map(({ png, ...change }) => change) })), errors }, null, 2));
  expect(evidence.otherRoomPasses).toBe(0); expect(evidence.glError).toBe(0); expect(errors).toEqual([]);
  if (baseline) {
    expect(evidence.cases.every(item => item.frames.slice(1).every(frame => frame.updatePasses === 0))).toBe(true);
    // Sub-texel offsets can quantize identically at the Low preset's 512 px.
    // Require a visible mismatch in at least one view, plus stale maps on both.
    expect(evidence.cases.some(item => item.frames.some(frame => frame.changedPixels > 0))).toBe(true);
  }
});
