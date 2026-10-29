import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '../../helpers/BrowserFixtures.ts';
import type { Page } from '@playwright/test';
import type { BlackoutLevelRuntime } from '../../../src/levels/BlackoutLevelRuntime.ts';
import type { RenderLayer } from '../../../src/render/RenderLayer.ts';
import type { FinalBossEncounter } from '../../../src/boss/FinalBossEncounter.ts';
import type { SpecimenCharacterPresentation } from '../../../src/render/specimen/SpecimenCharacterPresentation.ts';
import type { LoopStats } from '../../../src/core/Loop.ts';
import { FINAL_ARENA } from '../../../src/boss/FinalBossConfig.ts';
import { GRAPHICS_PROFILES } from '../../../src/render/GraphicsProfiles.ts';

declare global {
  interface Window {
    __exterminationArt: { runtime: BlackoutLevelRuntime; layer: RenderLayer;
      resources: { finalBoss: FinalBossEncounter; specimenCharacter: SpecimenCharacterPresentation } };
  }
}
const evidence = 'artifacts/evidence/extermination-room';
async function press(page: Page, code: string) {
  await page.evaluate(code => {
    for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  }, code);
}
async function step(page: Page, frames: number) {
  await page.evaluate(frames => {
    const { runtime, layer } = window.__exterminationArt; layer.setAnimationLoop(null);
    for (let i = 0; i < frames; i++) { runtime.fixedUpdate(1 / 60); layer.cameraRig.update(1, 1 / 60); }
    const render = layer.render; layer.render = () => {};
    try { runtime.render(1, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>); } finally { layer.render = render; }
  }, frames);
}
async function capture(page: Page, name: string, position?: number[], target?: number[], fov = 65) {
  const png = await page.evaluate(({ position, target, fov }) => {
    const { layer } = window.__exterminationArt, camera = layer.cameraRig.camera;
    if (position && target) {
      camera.position.set(position[0]!, position[1]!, position[2]!); camera.lookAt(target[0]!, target[1]!, target[2]!);
      camera.fov = fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    }
    layer.render();
    return layer.renderer.domElement.toDataURL('image/png').split(',')[1]!;
  }, { position, target, fov });
  await writeFile(`${evidence}/${name}.png`, Buffer.from(png, 'base64'));
}

async function prepareArena(page: Page): Promise<string[]> {
  await page.addInitScript(settings => localStorage.setItem('specimen.graphics-preferences.v1', JSON.stringify({ mode: 'manual', settings })), GRAPHICS_PROFILES.standard.settings);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const body = source.replace(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/,
      'class __ExterminationArtRuntime extends $1{constructor(...args){super({...args[0],playArrival:false});globalThis.__exterminationArt={runtime:this,get resources(){return this.runtime.resources},get layer(){return this.runtime.renderLayer}}}}export{__ExterminationArtRuntime as BlackoutLevelRuntime};');
    await route.fulfill({ response, body });
  });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 }); await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: 'Level 3 Blackout' }).click();
  const enter = page.locator('[data-action="enter-level"]'); await expect(enter).toBeVisible({ timeout: 120_000 }); await enter.click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => window.__exterminationArt.layer.setAnimationLoop(null));
  await press(page, 'Digit4'); await step(page, 240); await press(page, 'Enter'); await step(page, 60);
  return errors;
}

test('the industrial lair prepares its art, preserves warning contrast and reuses resources on retry', async ({ page }) => {
  test.setTimeout(420_000); await page.setViewportSize({ width: 800, height: 500 });
  const errors = await prepareArena(page);
  const initial = await page.evaluate(async () => {
    const { resources } = window.__exterminationArt, boss = resources.finalBoss;
    await boss['options'].arena.prepare();
    const arena = boss['options'].arena;
    boss.controller.damagePlayer = () => false;
    return { state: boss.controller.readModel.state, ...arena.artDiagnostics,
      colliderCount: arena.collisionMeshes.length };
  });
  expect(initial.state).toBe('combat'); expect(initial.ready).toBe(true); expect(initial.textures).toBe(15);
  await mkdir(evidence, { recursive: true });
  const z = FINAL_ARENA.centreZ;
  await capture(page, 'gameplay');
  // Inspection cameras frame architecture without a foreground gel capture.
  // The next real presentation update restores the controlled character.
  await page.evaluate(() => { window.__exterminationArt.resources.specimenCharacter.placement.visible = false; });
  await capture(page, 'overview', [-65, 72, z - 65], [8, 22, z + 20], 85);
  await capture(page, 'cover-detail', [54, 7, z - 64], [44.5, 3, z - 77], 55);
  await capture(page, 'entry-sign', [23, 10.8, z - 82], [15, 10.4, z - 91], 55);
  await capture(page, 'exit-sign', [-6, 13, z + 85], [0, 13.8, z + 98.5], 55);
  await capture(page, 'entry-portal', [12, 9, z - 77], [0, 10, z - 96], 65);
  await page.evaluate(() => {
    const boss = window.__exterminationArt.resources.finalBoss, arena = boss['options'].arena;
    boss.reset(); const authority = boss.controller as unknown as { random: () => number }, original = authority.random;
    authority.random = () => .99;
    try { boss.controller.startPhaseTwo(boss['options'].body.position); } finally { authority.random = original; }
    arena.setDoors(true);
  });
  await step(page, 40);
  expect(await page.evaluate(() => window.__exterminationArt.resources.finalBoss.presentation.ramWarning.visible)).toBe(true);
  await capture(page, 'ram-warning', [8, 7, z - 85], [0, .4, z - 77], 62);
  await page.evaluate(settings => window.__exterminationArt.layer.setGraphicsSettings(settings), GRAPHICS_PROFILES.high.settings);
  await capture(page, 'high-quality', [-65, 42, z - 65], [5, 30, z + 24], 80);
  const after = await page.evaluate(() => {
    const boss = window.__exterminationArt.resources.finalBoss, arena = boss['options'].arena;
    for (let i = 0; i < 3; i++) { boss.reset(); boss.start(true); boss.update(1 / 60); }
    return { ...arena.surfaceMaterials.diagnostics, colliderCount: arena.collisionMeshes.length };
  });
  expect(after.materials).toBe(initial.materials); expect(after.textures).toBe(initial.textures); expect(after.colliderCount).toBe(initial.colliderCount);
  await writeFile(`${evidence}/observations.json`, JSON.stringify({ initial, after, errors }, null, 2));
  expect(errors).toEqual([]);
});

test('arena lighting renders cover shadows with one bounded map, scales profiles and reuses storage on retry', async ({ page }) => {
  test.setTimeout(420_000); await page.setViewportSize({ width: 800, height: 500 });
  const errors = await prepareArena(page); await mkdir(evidence, { recursive: true });
  await page.evaluate(() => { window.__exterminationArt.resources.finalBoss.controller.damagePlayer = () => false; });
  await capture(page, 'lighting-gameplay');
  const z = FINAL_ARENA.centreZ;
  await page.evaluate(() => { window.__exterminationArt.resources.specimenCharacter.placement.visible = false; });
  await capture(page, 'lighting-boss', [-29, 26, z - 39], [0, 18, z], 55);
  const lighting = await page.evaluate(() => {
    const { layer, resources } = window.__exterminationArt;
    const arena = resources.finalBoss['options'].arena, rig = arena.lighting, camera = layer.cameraRig.camera;
    const p = arena.cover[0]!.position;
    rig.prepareFrame(p);
    camera.position.set(p.x + 12, 18, p.z + 18); camera.lookAt(p.x, .4, p.z);
    camera.fov = 58; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const canvas = document.createElement('canvas'); canvas.width = layer.canvas.width; canvas.height = layer.canvas.height;
    const context = canvas.getContext('2d')!;
    const pixels = () => { layer.render(); context.drawImage(layer.canvas, 0, 0); return context.getImageData(0, 0, canvas.width, canvas.height).data; };
    const shaded = pixels(), withUpdates = layer.renderer.info.render.calls;
    rig.key.shadow.autoUpdate = false; rig.key.shadow.needsUpdate = false;
    pixels(); const cached = layer.renderer.info.render.calls;
    rig.key.shadow.intensity = 0; const unshaded = pixels(); rig.key.shadow.intensity = 1;
    let shadowPixels = 0;
    for (let i = 0; i < shaded.length; i += 4) {
      if (unshaded[i]! + unshaded[i + 1]! + unshaded[i + 2]! - shaded[i]! - shaded[i + 1]! - shaded[i + 2]! > 12) shadowPixels++;
    }
    rig.key.shadow.autoUpdate = true;
    return { ...rig.diagnostics, allocated: rig.key.shadow.map !== null, shadowPixels,
      shadowDrawCalls: withUpdates - cached, glError: layer.renderer.getContext().getError() };
  });
  expect(lighting.shadowMaps).toBe(1); expect(lighting.pointShadowMaps).toBe(0);
  expect(lighting.allocated).toBe(true); expect(lighting.mapSize).toBe(1024);
  expect(lighting.shadowPixels).toBeGreaterThan(200);
  expect(lighting.shadowDrawCalls).toBeGreaterThan(0); expect(lighting.shadowDrawCalls).toBeLessThan(128);
  expect(lighting.glError).toBe(0); await capture(page, 'lighting-cover-shadow');
  for (const [profile, size] of [['minimum', 512], ['high', 1024]] as const) {
    await page.evaluate(settings => window.__exterminationArt.layer.setGraphicsSettings(settings), GRAPHICS_PROFILES[profile].settings);
    await capture(page, `lighting-${profile}`);
    expect(await page.evaluate(() => window.__exterminationArt.resources.finalBoss['options'].arena.lighting.key.shadow.mapSize.x)).toBe(size);
  }
  const lifecycle = await page.evaluate(() => {
    const { layer, resources } = window.__exterminationArt, boss = resources.finalBoss, arena = boss['options'].arena;
    const map = arena.lighting.key.shadow.map;
    boss.reset(); const dark = arena.lighting.key.intensity === 0 && !arena.lighting.key.shadow.autoUpdate;
    boss.startPhaseTwo(); arena.lighting.prepareFrame(boss['options'].body.position);
    layer.render();
    return { reused: map === arena.lighting.key.shadow.map, dark, phaseTwo: boss.controller.readModel.phase,
      glError: layer.renderer.getContext().getError() };
  });
  expect(lifecycle.reused).toBe(true); expect(lifecycle.dark).toBe(true); expect(lifecycle.phaseTwo).toBe(2); expect(lifecycle.glError).toBe(0);
  await capture(page, 'moonlight', [-58, 24, z - 82], [0, 40, z - 42], 72);
  const moonlight = await page.evaluate(() => {
    const { layer, resources } = window.__exterminationArt;
    const rig = resources.finalBoss['options'].arena.lighting, moon = rig.moonlight;
    const automatic = rig.key.shadow.autoUpdate;
    rig.key.shadow.autoUpdate = false; rig.key.shadow.needsUpdate = false;
    layer.render(); const withShaft = layer.renderer.info.render.calls;
    const visible = moon.shaft.visible;
    moon.shaft.visible = false; layer.render(); const withoutShaft = layer.renderer.info.render.calls;
    moon.shaft.visible = visible; rig.key.shadow.autoUpdate = automatic;
    return { visible, lit: moon.light.intensity > 0, shadowMap: moon.light.shadow.map !== null,
      addedDrawCalls: withShaft - withoutShaft, glError: layer.renderer.getContext().getError() };
  });
  expect(moonlight.visible).toBe(true); expect(moonlight.lit).toBe(true); expect(moonlight.shadowMap).toBe(false);
  expect(moonlight.addedDrawCalls).toBe(1); expect(moonlight.glError).toBe(0);
  await writeFile(`${evidence}/lighting-observations.json`, JSON.stringify({ lighting, lifecycle, moonlight, errors }, null, 2));
  expect(errors).toEqual([]);
});
