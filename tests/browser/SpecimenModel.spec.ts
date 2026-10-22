import { mkdir } from 'node:fs/promises';
import { expect, test } from './fixtures.ts';
import type { BlackoutLevelRuntime } from '../../src/levels/BlackoutLevelRuntime.ts';
import type { SpecimenCharacterPresentation } from '../../src/render/specimen/SpecimenCharacterPresentation.ts';
import type { KinematicBody } from '../../src/physics/KinematicBody.ts';
import type { RenderLayer } from '../../src/render/RenderLayer.ts';
import type { SpecimenProjectileSystem } from '../../src/combat/SpecimenProjectileSystem.ts';
import type { BlackoutCheckpointManager } from '../../src/levels/BlackoutCheckpointManager.ts';
import type * as THREE from 'three';

type RuntimeProbe = BlackoutLevelRuntime & {
  // Runtime-private references are exposed only by this browser test's response adapter.
};
interface Probe {
  runtime: RuntimeProbe;
  resources: {
    specimenCharacter: SpecimenCharacterPresentation;
    specimenBody: KinematicBody;
    specimenAttack: SpecimenProjectileSystem;
    phase: { restore(phase: string): void };
    specimenForm: { restore(form: string): void };
    ventArrival?: { active: boolean; skip(): void };
    bobPresentation: { diagnostics: { visible: boolean } };
    voltPresentation: { diagnostics: { visible: boolean } };
    specimenLight: THREE.PointLight;
    checkpoints: BlackoutCheckpointManager<KinematicBody>;
    group: { bobBody: KinematicBody; goopBody: KinematicBody; voltBody: KinematicBody };
  };
  renderLayer: RenderLayer;
  advance(dt: number): void;
}
declare global { interface Window { __specimenModelProbe: Probe } }

test('authored Specimen replaces the fusion sphere through merge, camera modes, recovery, split and reload', async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 960, height: 640 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/,
      'class __SpecimenModelRuntime extends $1{constructor(...args){super(...args);globalThis.__specimenModelProbe={runtime:this,get resources(){return this.runtime.resources},get renderLayer(){return this.runtime.renderLayer},advance:this.fixedUpdate.bind(this)}}}export{__SpecimenModelRuntime as BlackoutLevelRuntime};');
    await route.fulfill({ response, body });
  });
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 });
  await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: 'Level 3 Blackout' }).click();
  const enter = page.locator('[data-action="enter-level"]');
  await expect(enter).toBeVisible({ timeout: 180_000 });
  await enter.click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await page.waitForFunction(() => window.__specimenModelProbe?.runtime.state === 'running' &&
    !window.__specimenModelProbe.resources.ventArrival?.active, undefined, { timeout: 120_000 });
  expect(await page.evaluate(() => window.__specimenModelProbe.resources.specimenCharacter.diagnostics)).toMatchObject({
    ready: true, visible: false, triangles: 108352, meshCount: 10,
  });

  const merged = await page.evaluate(() => {
    const p = window.__specimenModelProbe;
    if (!p.runtime.beginMerge()) return false;
    for (let i = 0; i < 360; i++) p.advance(1 / 60);
    // Hold simulation for deterministic render/camera evidence; the real runtime
    // renderer and authority remain installed. advance retains the original step.
    p.runtime.fixedUpdate = () => {};
    p.renderLayer.cameraRig.reset();
    p.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI + 0.5);
    return p.runtime.phase === 'specimen';
  });
  expect(merged).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__specimenModelProbe.resources.specimenCharacter.diagnostics.visible)).toBe(true);
  await mkdir('artifacts/evidence/specimen-integration', { recursive: true });
  await page.evaluate(async () => { for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame); });
  await page.screenshot({ path: 'artifacts/evidence/specimen-integration/merged.png' });
  const active = await page.evaluate(() => {
    const p = window.__specimenModelProbe, r = p.resources;
    return { diagnostics: r.specimenCharacter.diagnostics, radius: r.specimenBody.radiusMetres,
      bob: r.bobPresentation.diagnostics.visible, volt: r.voltPresentation.diagnostics.visible,
      oldSphere: !!p.renderLayer.scene.getObjectByName('blackout-specimen-body') };
  });
  expect(active).toMatchObject({ radius: 0.675, bob: false, volt: false, oldSphere: false });

  await page.evaluate(() => {
    const p = window.__specimenModelProbe;
    p.renderLayer.cameraRig.setViewMode('first-person', true);
  });
  await expect.poll(() => page.evaluate(() => {
    const p = window.__specimenModelProbe;
    return p.renderLayer.cameraRig.isFirstPersonForTarget(p.resources.specimenBody);
  })).toBe(true);
  await page.screenshot({ path: 'artifacts/evidence/specimen-integration/first-person.png' });
  await page.evaluate(() => window.__specimenModelProbe.renderLayer.cameraRig.setViewMode('third-person', true));

  // CP8 belongs to the foundation encounter. Register its fusion-form fixture
  // in this authored-room session to exercise the same recovery authority.
  await page.evaluate(() => {
    const p = window.__specimenModelProbe;
    const r = p.resources;
    r.checkpoints.registerCheckpoint({ id: 'cp8', controlledForm: 'specimen',
      specimenPosition: r.specimenBody.position.clone(), activeSlimeId: 'bob',
      bodyPositions: { bob: r.group.bobBody.position, goop: r.group.goopBody.position, volt: r.group.voltBody.position },
      room: { roomId: 'room-4b', phase: 'specimen', local: { merged: true } } });
    p.runtime.activateCheckpoint('cp8'); p.runtime.recoverActiveCheckpoint();
  });
  expect(await page.evaluate(() => window.__specimenModelProbe.resources.specimenCharacter.diagnostics)).toMatchObject({
    visible: true, deathActive: false, weights: { Charge: 0 },
  });
  expect(await page.evaluate(() => window.__specimenModelProbe.runtime.requestFailure())).toBe(true);
  expect(await page.evaluate(() => window.__specimenModelProbe.resources.specimenCharacter.diagnostics.visible)).toBe(false);
  await page.evaluate(() => {
    const p = window.__specimenModelProbe;
    for (let i = 0; i < 90; i++) p.advance(1 / 60);
  });
  await page.locator('.death-retry').click();
  await expect.poll(() => page.evaluate(() => window.__specimenModelProbe.resources.specimenCharacter.diagnostics.visible)).toBe(true);
  const split = await page.evaluate(() => {
    const p = window.__specimenModelProbe;
    p.resources.phase.restore('boss-defeated');
    return p.runtime.beginSplit() && p.runtime.completeSplit();
  });
  expect(split).toBe(true);
  expect(await page.evaluate(() => window.__specimenModelProbe.resources.specimenCharacter.diagnostics.visible)).toBe(false);

  const released = await page.evaluate(async () => {
    const p = window.__specimenModelProbe, previous = p.resources.specimenCharacter;
    p.runtime.stop(); p.runtime.unload();
    const disposed = !previous.ready && !previous.root.parent;
    p.runtime.load(); await p.runtime.preparePresentation();
    return { disposed, fresh: previous !== p.resources.specimenCharacter, ready: p.resources.specimenCharacter.ready };
  });
  expect(released).toEqual({ disposed: true, fresh: true, ready: true });
  expect(errors).toEqual([]);
});
