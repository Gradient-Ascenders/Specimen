import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from './fixtures.ts';
import type { Page } from '@playwright/test';
import type { BlackoutLevelRuntime } from '../../src/levels/BlackoutLevelRuntime.ts';
import type { RenderLayer } from '../../src/render/RenderLayer.ts';
import type { FinalBossEncounter } from '../../src/boss/FinalBossEncounter.ts';
import type { SpecimenCharacterPresentation } from '../../src/render/specimen/SpecimenCharacterPresentation.ts';
import type { LoopStats } from '../../src/core/Loop.ts';
import { FINAL_ARENA } from '../../src/boss/FinalBossConfig.ts';
import { GRAPHICS_PROFILES } from '../../src/render/GraphicsProfiles.ts';

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

test('the industrial lair prepares its art, preserves warning contrast and reuses resources on retry', async ({ page }) => {
  test.setTimeout(420_000); await page.setViewportSize({ width: 800, height: 500 });
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
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 }); await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: 'Level 3 Blackout' }).click();
  const enter = page.locator('[data-action="enter-level"]'); await expect(enter).toBeVisible({ timeout: 120_000 }); await enter.click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => window.__exterminationArt.layer.setAnimationLoop(null));
  await press(page, 'Digit4'); await step(page, 240); await press(page, 'Enter'); await step(page, 60);
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
