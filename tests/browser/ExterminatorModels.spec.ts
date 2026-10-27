import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { GRAPHICS_PROFILES } from '../../src/render/GraphicsProfiles.ts';
import { FINAL_ARENA } from '../../src/boss/FinalBossConfig.ts';
import type { BlackoutLevelRuntime } from '../../src/levels/BlackoutLevelRuntime.ts';
import type { RenderLayer } from '../../src/render/RenderLayer.ts';
import type { FinalBossEncounter } from '../../src/boss/FinalBossEncounter.ts';
import type { SpecimenCharacterPresentation } from '../../src/render/specimen/SpecimenCharacterPresentation.ts';
import type { LoopStats } from '../../src/core/Loop.ts';

declare global { interface Window { __droneArt: { runtime: BlackoutLevelRuntime; layer: RenderLayer; resources: { finalBoss: FinalBossEncounter; specimenCharacter: SpecimenCharacterPresentation } }; } }
const evidence = 'artifacts/evidence/exterminator-models';
async function key(page: Page, code: string) {
  await page.evaluate(code => { for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true })); }, code);
}
async function step(page: Page, frames: number) {
  await page.evaluate(frames => {
    const { runtime, layer } = window.__droneArt; layer.setAnimationLoop(null);
    for (let i = 0; i < frames; i++) { runtime.fixedUpdate(1 / 60); layer.cameraRig.update(1, 1 / 60); }
    const render = layer.render; layer.render = () => {};
    try { runtime.render(1, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>); } finally { layer.render = render; }
  }, frames);
}
async function capture(page: Page, name: string, position?: number[], target?: number[], fov = 52) {
  const png = await page.evaluate(({ position, target, fov }) => {
    const { layer } = window.__droneArt, camera = layer.cameraRig.camera;
    if (position && target) { camera.position.fromArray(position); camera.lookAt(target[0]!, target[1]!, target[2]!); camera.fov = fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); }
    layer.render(); return layer.renderer.domElement.toDataURL('image/png').split(',')[1]!;
  }, { position, target, fov });
  await writeFile(`${evidence}/${name}.png`, Buffer.from(png, 'base64'));
}
test('the production fight prepares the authored family, animates both roles and reuses it on retry at Medium and High', async ({ page }) => {
  test.setTimeout(420_000); await page.setViewportSize({ width: 1000, height: 700 });
  await page.addInitScript(settings => localStorage.setItem('specimen.graphics-preferences.v1', JSON.stringify({ mode: 'manual', settings })), GRAPHICS_PROFILES.standard.settings);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const body = source.replace(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/,
      'class __DroneArtRuntime extends $1{constructor(...args){super({...args[0],playArrival:false});globalThis.__droneArt={runtime:this,get resources(){return this.runtime.resources},get layer(){return this.runtime.renderLayer}}}}export{__DroneArtRuntime as BlackoutLevelRuntime};');
    await route.fulfill({ response, body });
  });
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]'); await expect(title).toBeVisible({ timeout: 120_000 });
  await title.getByRole('button', { name: 'Select level' }).click(); await page.getByRole('button', { name: 'Level 3 Blackout' }).click();
  const enter = page.locator('[data-action="enter-level"]'); await expect(enter).toBeVisible({ timeout: 120_000 }); await enter.click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => window.__droneArt.layer.setAnimationLoop(null));
  await key(page, 'Digit4'); await step(page, 240); await key(page, 'Enter'); await step(page, 45);
  const initial = await page.evaluate(() => {
    const boss = window.__droneArt.resources.finalBoss; boss.controller.damagePlayer = () => false;
    return { ...boss.modelDiagnostics, state: boss.controller.readModel.state, width: boss.presentation.ramHull.widthMetres };
  });
  expect(initial.ready).toBe(true); expect(initial.state).toBe('combat'); expect(initial.width).toBeGreaterThan(45);
  await mkdir(evidence, { recursive: true }); await capture(page, 'gameplay-medium');
  await page.evaluate(() => { window.__droneArt.resources.specimenCharacter.placement.visible = false; });
  const z = FINAL_ARENA.centreZ;
  await capture(page, 'boss-medium', [-29, 26, z - 39], [0, 18, z], 55);
  await page.evaluate(() => {
    const boss = window.__droneArt.resources.finalBoss;
    boss.controller.applyImpact({ projectileId: 1, targetId: 'extermination-core', kind: 'direct', chargeAmount: 1, fullyCharged: true, damageUnits: boss.controller.readModel.maximumHealth * .2, point: boss.presentation.coreWorld, direction: boss.beamStart });
  });
  await step(page, 230);
  const roles = await page.evaluate(() => {
    const boss = window.__droneArt.resources.finalBoss;
    return [boss.squad.root.children[0]!, boss.squad.root.children[8]!].map(o => ({ position: o.position.toArray(), scale: o.children[1]!.scale.x, visible: o.visible }));
  });
  expect(roles.every(r => r.visible && Math.abs(r.scale - 1.15) < .001)).toBe(true);
  for (const [i, role] of roles.entries()) { const p = role.position; await capture(page, i ? 'pursuer' : 'guardian', [p[0]! + 2.5, p[1]! + 1.5, p[2]! - 3.5], p, 48); }
  await page.evaluate(() => {
    const boss = window.__droneArt.resources.finalBoss; boss.reset(); boss.controller.startPhaseTwo(boss['options'].body.position); boss.update(1 / 60);
    boss.controller.applyImpact({ projectileId: 2, targetId: 'extermination-core', kind: 'direct', chargeAmount: 1, fullyCharged: true, damageUnits: boss.controller.readModel.maximumHealth * .2, point: boss.presentation.coreWorld, direction: boss.beamStart });
  });
  await step(page, 100);
  await page.evaluate(settings => window.__droneArt.layer.setGraphicsSettings(settings), GRAPHICS_PROFILES.high.settings);
  await page.evaluate(() => { window.__droneArt.resources.specimenCharacter.placement.visible = false; });
  await capture(page, 'phase-two-high', [-32, 29, z - 42], [0, 19, z], 55);
  await capture(page, 'phase-two-damage', [25, 36, z + 37], [0, 19, z + 5], 55);
  const advanced = await page.evaluate(() => {
    const boss = window.__droneArt.resources.finalBoss, wing = boss.reinforcements.wings[0]!, root = wing.squad.root.children[0]!;
    return { active: boss.reinforcements.activeCount, position: root.position.toArray(), scale: wing.visuals[0]!.root.scale.x };
  });
  expect(advanced.active).toBe(8); expect(advanced.scale).toBeCloseTo(2.07);
  await capture(page, 'advanced', [advanced.position[0]! + 4, advanced.position[1]! + 2.5, advanced.position[2]! - 5.5], advanced.position, 48);
  const after = await page.evaluate(() => {
    const boss = window.__droneArt.resources.finalBoss;
    for (let i = 0; i < 3; i++) { boss.reset(); boss.start(true); boss.update(1 / 60); }
    return { ...boss.modelDiagnostics, damagedVisible: boss.presentation.machine.getObjectByName('EX_Damaged_L')!.visible };
  });
  expect(after.geometries).toBe(initial.geometries); expect(after.materials).toBe(initial.materials); expect(after.damagedVisible).toBe(false);
  await writeFile(`${evidence}/observations.json`, JSON.stringify({ initial, roles, advanced, after, errors }, null, 2)); expect(errors).toEqual([]);
});
