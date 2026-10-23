import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from './fixtures.ts';
import type { Page } from '@playwright/test';
import type { LoopStats } from '../../src/core/Loop.ts';
import type { BlackoutLevelRuntime } from '../../src/levels/BlackoutLevelRuntime.ts';
import type { SpecimenCharacterPresentation } from '../../src/render/specimen/SpecimenCharacterPresentation.ts';
import type { KinematicBody } from '../../src/physics/KinematicBody.ts';
import type { FinalBossEncounter } from '../../src/boss/FinalBossEncounter.ts';
import type { RenderLayer } from '../../src/render/RenderLayer.ts';
import type { AudioManager } from '../../src/audio/AudioManager.ts';
import type { SpecimenProjectileSystem } from '../../src/combat/SpecimenProjectileSystem.ts';
import { DEFAULT_KINEMATIC_BODY_CONFIG } from '../../src/physics/KinematicBody.ts';
import type { SpecimenDash } from '../../src/combat/SpecimenDash.ts';
import type { CombatTargetRegistry } from '../../src/combat/CombatTargetRegistry.ts';
import { FINAL_MERGE_ANCHOR } from '../../src/boss/FinalBossConfig.ts';
import { CollisionLayer, type CollisionHit, type CollisionWorld } from '../../src/physics/CollisionWorld.ts';

interface MovementProbe {
  runtime: BlackoutLevelRuntime;
  resources: { specimenCharacter: SpecimenCharacterPresentation; specimenBody: KinematicBody; specimenAttack: SpecimenProjectileSystem;
    specimenDash: SpecimenDash; combatTargets: CombatTargetRegistry; collisionWorld: CollisionWorld; finalBoss: FinalBossEncounter };
  layer: RenderLayer;
  audio: AudioManager;
}
declare global {
  interface Window {
    __specimenMovementProbe: MovementProbe;
    __specimenMovementSounds: { sound: string; played: boolean }[];
    __specimenMovementShots: { charged: boolean; overcharged: boolean; damage: number; direction: { x: number; y: number; z: number } }[];
    __specimenAccuracyCleanup: () => void;
    __specimenDamageAuthority: (amount: number, serial?: number) => boolean;
    __specimenAccuracyImpacts: unknown[];
  }
}
const evidence = 'artifacts/evidence/specimen-movement';

// Match the boss smoke helper: dispatch through the real DOM input listeners
// without waiting for a software-renderer compositor to acknowledge each key.
async function key(page: Page, code: string, down: boolean) {
  await page.evaluate(({ code, down }) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup',
    { code, bubbles: true, cancelable: true })), { code, down });
}
async function press(page: Page, code: string) { await key(page, code, true); await key(page, code, false); }
async function mouse(page: Page, down: boolean) {
  await page.evaluate(held => window.dispatchEvent(new MouseEvent(held ? 'mousedown' : 'mouseup',
    { button: 0, bubbles: true, cancelable: true })), down);
}

async function step(page: Page, frames: number) {
  return page.evaluate(count => {
    const { runtime, resources, layer } = window.__specimenMovementProbe;
    layer.setAnimationLoop(null);
    for (let i = 0; i < count; i++) {
      runtime.fixedUpdate(1 / 60); layer.cameraRig.update(1, 1 / 60);
    }
    const draw = layer.render; layer.render = () => {};
    try { runtime.render(1, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>); } finally { layer.render = draw; }
    return { ...resources.specimenCharacter.diagnostics, grounded: resources.specimenBody.grounded,
      charge: resources.specimenBody.chargeFraction, y: resources.specimenBody.position.y,
      speed: Math.hypot(resources.specimenBody.velocity.x, resources.specimenBody.velocity.z),
      dash: resources.specimenDash.readModel,
      topSpeed: resources.specimenBody.maximumLocomotionSpeedMetresPerSecond };
  }, frames);
}

async function capture(page: Page, name: string) {
  // A consistent inspection camera shows the full deformed model. Controls,
  // collisions, jump events and movement audio still use the production runtime.
  const png = await page.evaluate(mask => {
    const { resources, layer } = window.__specimenMovementProbe;
    const body = resources.specimenBody.position, camera = layer.cameraRig.camera;
    resources.specimenCharacter.setOpacity(1);
    const focus = camera.position.clone().copy(body); focus.y += 0.8;
    const displacement = focus.clone(), best = focus.clone(); let bestDistance = -1;
    const hit = (resources.specimenAttack as unknown as { aimHit: CollisionHit }).aimHit;
    for (const offset of [[10, 3, 14], [-10, 3, 14], [10, 3, -14], [-10, 3, -14], [0, 10, 12]]) {
      displacement.set(offset[0]!, offset[1]!, offset[2]!);
      const blocked = resources.collisionWorld.sweepSphere(focus, displacement, 0.15, hit, mask);
      const fraction = blocked ? Math.max(0.05, hit.fraction - 0.025) : 1;
      const distance = displacement.length() * fraction;
      if (distance > bestDistance) { bestDistance = distance; best.copy(focus).addScaledVector(displacement, fraction); }
      if (!blocked) break;
    }
    camera.position.copy(best);
    camera.fov = 45; camera.lookAt(body.x, body.y + 0.8, body.z);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); layer.render();
    return layer.renderer.domElement.toDataURL('image/png').split(',')[1]!;
  }, CollisionLayer.CameraObstruction);
  await writeFile(`${evidence}/${name}.png`, Buffer.from(png, 'base64'));
}

test('real Specimen controls drive fast movement, aura, normal gravity, shot facing and rapid follow-up fire', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 960, height: 640 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.replace(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/,
      'class __SpecimenMovementRuntime extends $1{constructor(...args){super({...args[0],playArrival:false});globalThis.__specimenMovementProbe={runtime:this,get resources(){return this.runtime.resources},get layer(){return this.runtime.renderLayer},get audio(){return this.runtime.audio}}}}export{__SpecimenMovementRuntime as BlackoutLevelRuntime};');
    await route.fulfill({ response, body });
  });
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 });
  await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: 'Level 3 Blackout' }).click();
  const enter = page.locator('[data-action="enter-level"]');
  await expect(enter).toBeVisible({ timeout: 120_000 }); await enter.click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => window.__specimenMovementProbe.layer.setAnimationLoop(null));
  await press(page, 'Digit4'); await step(page, 240);
  await press(page, 'Enter'); await step(page, 60);
  expect(await page.evaluate(() => window.__specimenMovementProbe.runtime.finalBossReadModel?.state)).toBe('combat');
  await page.evaluate(() => {
    const { resources, layer, audio } = window.__specimenMovementProbe;
    // Production intentionally disables the development invincibility toggle.
    // Isolate presentation checks from random hostile damage, then restore the
    // real authority explicitly for the enemy-orb damage check below.
    window.__specimenDamageAuthority = resources.finalBoss.controller.damagePlayer;
    resources.finalBoss.controller.damagePlayer = () => false;
    layer.cameraRig.setGroundOrbitYawRadians(-Math.PI / 2);
    window.__specimenMovementSounds = [];
    const play = audio.play;
    audio.play = function (...args) {
      const before = this.diagnostics.played;
      play.apply(this, args);
      window.__specimenMovementSounds.push({ sound: args[0], played: this.diagnostics.played > before });
    };
  });
  await mkdir(evidence, { recursive: true });
  await capture(page, 'idle');
  await key(page, 'KeyW', true); const running = await step(page, 60);
  expect(running.grounded).toBe(true); expect(running.signedLean).toBeGreaterThan(0.7);
  expect(running.topSpeed).toBe(DEFAULT_KINEMATIC_BODY_CONFIG.maxSpeedMetresPerSecond * 3);
  expect(running.trail.activeParticles).toBe(0);
  expect(running.trail.visible).toBe(false);
  await capture(page, 'running');
  await press(page, 'ShiftLeft'); const dash = await step(page, 3);
  expect(dash.dashing).toBe(true); expect(dash.speed).toBeGreaterThan(dash.topSpeed * 1.5);
  expect(dash.effects.afterimages).toBeGreaterThan(0); expect(dash.trail.visible).toBe(false);
  await capture(page, 'dash'); await step(page, 12);
  await key(page, 'KeyW', false); await key(page, 'KeyD', true);
  const turning = await step(page, 12); expect(Math.abs(turning.turnBank)).toBeGreaterThan(0.03);
  await capture(page, 'turning');
  await key(page, 'KeyD', false); await step(page, 45);
  await key(page, 'Space', true); const compressed = await step(page, 26);
  expect(compressed.grounded).toBe(true); expect(compressed.charge).toBe(1);
  expect(compressed.bodyHeightScale).toBeLessThan(0.69); await capture(page, 'charged');
  await key(page, 'Space', false); const launch = await step(page, 4);
  expect(launch.grounded).toBe(false); expect(launch.bodyHeightScale).toBeGreaterThan(1.15);
  await capture(page, 'launch');
  const landing = await page.evaluate(() => {
    const { runtime, resources, layer } = window.__specimenMovementProbe;
    let apex = resources.specimenBody.position.y, landed = false;
    for (let i = 0; i < 180; i++) {
      runtime.fixedUpdate(1 / 60); layer.cameraRig.update(1, 1 / 60);
      apex = Math.max(apex, resources.specimenBody.position.y);
      if (resources.specimenBody.landedThisStep) { landed = true; break; }
    }
    return { apex, landed };
  });
  expect(landing.landed).toBe(true);
  expect(landing.apex - compressed.y).toBeGreaterThan(10.5);
  expect(landing.apex - compressed.y).toBeLessThan(11.5);
  const impact = await step(page, 5); expect(impact.bodyHeightScale).toBeLessThan(0.85);
  expect(impact.effects.landingActive).toBe(true);
  await capture(page, 'landing');
  const settled = await step(page, 45); expect(Math.abs(settled.bodyHeightScale - 1)).toBeLessThan(0.005);
  expect(settled.trail.activeParticles).toBe(0);
  await page.evaluate(() => {
    const { resources, layer } = window.__specimenMovementProbe;
    layer.cameraRig.setGroundOrbitYawRadians(Math.PI / 2);
    window.__specimenMovementShots = [];
    resources.specimenAttack.events.on('projectileFired', event => {
      window.__specimenMovementShots.push({ charged: event.fullyCharged, overcharged: event.overcharged,
        damage: event.damageUnits, direction: { ...event.direction } });
    });
  });
  await step(page, 15);
  await mouse(page, true); const chargeShot = await step(page, 92);
  expect(chargeShot.weights.Charge).toBe(1); await capture(page, 'shot-charge');
  expect(await page.evaluate(() => window.__specimenMovementProbe.resources.specimenCharacter.diagnostics.effects.chargeArcsVisible)).toBe(true);
  await mouse(page, false); const recoil = await step(page, 1); expect(recoil.recoil).toBeGreaterThan(0);
  const shotFacing = await page.evaluate(() => {
    const { resources } = window.__specimenMovementProbe;
    const shot = window.__specimenMovementShots[0]!, yaw = resources.specimenCharacter.diagnostics.yaw;
    const directionLength = Math.hypot(shot.direction.x, shot.direction.z);
    return { dot: (-Math.sin(yaw) * shot.direction.x - Math.cos(yaw) * shot.direction.z) / directionLength,
      aimActive: resources.specimenAttack.readModel.aimActive };
  });
  expect(shotFacing.aimActive).toBe(false); expect(shotFacing.dot).toBeGreaterThan(0.999);
  await mouse(page, true); await mouse(page, false); await step(page, 1); await step(page, 12);
  const followUp = await page.evaluate(() => window.__specimenMovementShots);
  expect(followUp.map(shot => shot.charged)).toEqual([true, false]);
  for (let i = 0; i < 8; i++) { await mouse(page, true); await mouse(page, false); await step(page, 8); }
  const shots = await page.evaluate(() => window.__specimenMovementShots);
  expect(shots).toHaveLength(10);
  await capture(page, 'firing');
  // A temporary vulnerable target verifies real ray/sweep/registry impacts,
  // independent of the moving boss's shield schedule and cover.
  await page.evaluate(anchor => {
    const { resources, layer } = window.__specimenMovementProbe;
    resources.specimenBody.recoverAt(anchor); resources.specimenCharacter.reset(); resources.specimenDash.reset();
    resources.specimenAttack.reset();
    const center = layer.cameraRig.camera.position.clone().copy(resources.specimenBody.position); center.y += 12;
    const core = resources.finalBoss.presentation.core;
    const mesh = Reflect.construct(core.constructor, [core.geometry, core.material]) as typeof core;
    mesh.name = 'specimen-accuracy-browser-target';
    mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = true;
    mesh.position.copy(center); mesh.quaternion.identity(); mesh.scale.setScalar(0.5); mesh.visible = true;
    layer.scene.add(mesh); mesh.updateMatrix(); mesh.updateMatrixWorld(true);
    if (mesh.getWorldPosition(center.clone()).distanceTo(center) > 1e-6) throw new Error('Accuracy target transform did not update');
    // Authored boss targets register in the live world explicitly; the
    // development registry's automatic colliders belong to a separate world.
    resources.collisionWorld.register(mesh, anchor.mask);
    const unregister = resources.combatTargets.register({ id: 'specimen-accuracy-browser-target', hitMeshes: [mesh],
      isCombatActive: () => true, copySplashWorldPosition: out => out.copy(center), applyImpact: () => ({ accepted: true, destroyed: false }) });
    const original = layer.cameraRig.copyAimRay;
    window.__specimenAccuracyImpacts = [];
    const offHit = resources.specimenAttack.events.on('targetImpact', event => window.__specimenAccuracyImpacts.push(event));
    const offWorld = resources.specimenAttack.events.on('impact', event => window.__specimenAccuracyImpacts.push(event));
    layer.cameraRig.copyAimRay = (origin, direction) => { origin.copy(resources.specimenBody.position); origin.y += 0.75; direction.set(0, 1, 0); };
    window.__specimenAccuracyCleanup = () => { layer.cameraRig.copyAimRay = original; unregister();
      resources.collisionWorld.unregister(mesh); mesh.removeFromParent(); offHit(); offWorld(); };
  }, { x: FINAL_MERGE_ANCHOR.x, y: FINAL_MERGE_ANCHOR.y, z: FINAL_MERGE_ANCHOR.z, mask: CollisionLayer.Projectile });
  let overcharge;
  try {
    for (let i = 0; i < 4; i++) { await mouse(page, true); await mouse(page, false); await step(page, 24); }
    overcharge = await page.evaluate(() => ({ ...window.__specimenMovementProbe.resources.specimenAttack.readModel }));
    await writeFile(`${evidence}/accuracy.json`, JSON.stringify(await page.evaluate(() => ({
      model: window.__specimenMovementProbe.resources.specimenAttack.readModel,
      position: window.__specimenMovementProbe.resources.specimenBody.position,
      impacts: window.__specimenAccuracyImpacts,
    })), null, 2));
    expect(overcharge.overchargeReady).toBe(true); expect(overcharge.overchargeProgress).toBe(1);
    await expect(page.locator('.specimen-abilities')).toHaveAttribute('data-overcharged', 'true');
    await capture(page, 'overcharge');
    await mouse(page, true); await mouse(page, false); await step(page, 24);
    expect(await page.evaluate(() => window.__specimenMovementShots.at(-1)!.overcharged)).toBe(true);
    expect(await page.evaluate(() => window.__specimenMovementProbe.resources.specimenAttack.readModel.overchargeReady)).toBe(false);
  } finally { await page.evaluate(() => window.__specimenAccuracyCleanup()); }
  // An actual enemy orb goes through hit authority and the new damage callback.
  await page.evaluate(() => {
    const { resources, layer } = window.__specimenMovementProbe;
    resources.finalBoss.controller.damagePlayer = window.__specimenDamageAuthority;
    const target = layer.cameraRig.camera.position.clone().copy(resources.specimenBody.position), origin = target.clone(); origin.y += 6;
    resources.finalBoss.projectiles.fireOrb(origin, target);
  });
  const damaged = await step(page, 5);
  await page.evaluate(() => { window.__specimenMovementProbe.resources.finalBoss.controller.damagePlayer = () => false; });
  expect(damaged.damageRipple).toBeGreaterThan(0); await capture(page, 'damage-ripple');
  const sounds = await page.evaluate(() => window.__specimenMovementSounds);
  for (const sound of ['bob-contact-01', 'bob-charged-jump-01', 'bob-land-hard-01', 'world-platform-land-01', 'volt-circuit-connect-01'])
    expect(sounds.some(cue => cue.sound === sound && cue.played), `${sound} created an actual audio voice`).toBe(true);
  await writeFile(`${evidence}/observations.json`, JSON.stringify({ running, dash, turning, compressed, launch, landing, impact, settled,
    chargeShot, recoil, shotFacing, shots, overcharge, damaged, sounds }, null, 2));
  expect(errors).toEqual([]);
});
