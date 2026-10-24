import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { RESEARCH_TIMING as T } from '../../src/cinematics/BlackoutResearchTimeline.ts';

async function advanceTo(page: Page, seconds: number) {
  await page.evaluate(t => {
    const r = (window as any).__researchSession.runtime, movie = r.resources.researchFinale;
    for (let i = 0; i < 12000 && movie.active && movie.seconds < t; i++) r.fixedUpdate(1 / 60);
    const start = performance.now(); r.render(1, { frameDeltaSeconds: 1 / 60 }); (window as any).__researchFirstRenderMs = performance.now() - start;
  }, seconds);
}
async function capture(page: Page, path: string) {
  const result = await page.evaluate(() => {
    const r = (window as any).__researchSession.runtime, l = r.renderLayer;
    const start = performance.now(); r.render(1, { frameDeltaSeconds: 1 / 60 }); const renderMs = performance.now() - start;
    return { png: l.canvas.toDataURL('image/png'), metrics: { ...r.resources.researchFinale.diagnostics,
      camera: l.cameraRig.camera.position.toArray(), fov: l.cameraRig.camera.fov, renderMs, firstRenderMs: (window as any).__researchFirstRenderMs,
      specimen: r.resources.specimenCharacter.diagnostics, boss: r.finalBossReadModel.state,
      monitorVisible: r.resources.researchFinale.wing.monitorDrone.visible, arenaEntryDoorY: r.resources.scene.finalArena.entryDoor.position.y,
      monitorInterfaceColor: r.resources.researchFinale.wing.monitorDrone.getObjectByName('flying-scientist-interface').material.color.getHex(),
      phase: r.phase, checkpoint: r.activeCheckpoint.checkpointId, programs: l.renderer.info.programs.length,
      calls: l.renderer.info.render.calls, triangles: l.renderer.info.render.triangles,
      followCamera: l.cameraRig.getDiagnostics(),
      programKeys: l.renderer.info.programs.map((p: any) => p.cacheKey),
      viewInspection: r.resources.researchFinale.inspectView(l.cameraRig.camera),
      glError: l.renderer.getContext().getError(), subtitle: document.querySelector('.blackout-research .finale-subtitle')?.textContent } };
  });
  await writeFile(path, Buffer.from(result.png.split(',')[1]!, 'base64'));
  await writeFile(path.replace(/\.png$/, '.json'), JSON.stringify(result.metrics, null, 2));
  return result.metrics;
}

test('the production research escape shows the lab, scientists, blackout, fusion, glass breach and direct boss handoff', async ({ page }, info) => {
  test.setTimeout(900_000);
  const failures: string[] = [];
  page.on('pageerror', e => failures.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text())) failures.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()}: ${r.url()}`); });
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), body = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(body).toMatch(pattern);
    await route.fulfill({ response, body: body.replace(pattern, '$1=globalThis.__researchSession=new $2({initialRuntime:') });
  });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]'); await expect(title).toBeVisible({ timeout: 180_000 });
  await title.getByRole('button', { name: 'Settings', exact: true }).click();
  const graphics = process.env.SPECIMEN_RESEARCH_PRESET ?? 'performance';
  if (graphics !== 'performance') await page.locator('[data-setting="graphics-profile"]').selectOption(graphics);
  await page.locator('[data-setting="graphics-preset"]').selectOption(graphics === 'performance' ? 'performance' : 'normal');
  await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  await page.locator('[data-flow-panel="settings"]').getByRole('button', { name: 'Back', exact: true }).click();
  await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: 'Level 3 Blackout', exact: true }).click();
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-gameplay-canvas]')!;
    const result = (window as any).__researchLoadingMask = { seen: false, duringTransition: false, clearPixel: null as number[] | null };
    const observer = new MutationObserver(() => {
      if (canvas.style.visibility === 'hidden') {
        result.seen = true; result.duringTransition ||= document.querySelector('.game-flow')?.getAttribute('data-state') === 'transitioning';
      } else if (result.seen && result.clearPixel === null) {
        const probe = document.createElement('canvas'); probe.width = probe.height = 1;
        const ctx = probe.getContext('2d')!; ctx.drawImage(canvas, 0, 0, 1, 1);
        result.clearPixel = [...ctx.getImageData(0, 0, 1, 1).data]; observer.disconnect();
      }
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
  });
  await page.getByRole('button', { name: 'Enter Level 3', exact: true }).click({ timeout: 240_000 });
  await page.waitForFunction(() => (window as any).__researchLoadingMask.clearPixel !== null, null, { timeout: 240_000 });
  const loadingMask = await page.evaluate(() => (window as any).__researchLoadingMask);
  expect(loadingMask.seen).toBe(true); expect(loadingMask.duringTransition).toBe(true);
  expect(Math.max(...loadingMask.clearPixel.slice(0, 3))).toBeLessThanOrEqual(2);
  await writeFile(info.outputPath('loading-mask.json'), JSON.stringify(loadingMask));
  await page.evaluate(() => {
    const r = (window as any).__researchSession.runtime; r.renderLayer.setAnimationLoop(null);
    for (let i = 0; i < 600; i++) r.fixedUpdate(1 / 60);
    r.activateCheckpoint('cp6'); r.recoverActiveCheckpoint();
    r.resources.group.activeBody.teleport(r.resources.group.activeBody.position.clone().setZ(188.15));
    r.renderLayer.renderer.setDrawingBufferSize(960, 540, 1); r.renderLayer.cameraRig.camera.aspect = 16 / 9;
    r.fixedUpdate(1 / 60); r.render(1, { frameDeltaSeconds: 1 / 60 });
  });
  expect(await page.locator('#app').getAttribute('data-cinematic')).toBe('blackout-research');
  const evidence: unknown[] = [];
  const quick = process.env.SPECIMEN_RESEARCH_QUICK === '1';
  const revealOnly = process.env.SPECIMEN_RESEARCH_QUICK === 'reveal';
  const combatOnly = process.env.SPECIMEN_RESEARCH_QUICK === 'combat';
  const barrageOnly = process.env.SPECIMEN_RESEARCH_QUICK === 'barrage';
  for (const [t, name] of ([[3, '01-research-gallery'], [15, '02-goop-teasing'], [22, '03-bob-reaction'],
    [27, '04-side-research'], [39, '05-catastrophic-screen'], [52, '06-volt-warning'], [61, '07-goop-warning'],
    [71, '08-alarm-and-sentries'], [85, '09a-monitor-approach'], [96, '09-monitor-drone-director']] as const).filter(([t]) => !(quick || revealOnly || combatOnly || barrageOnly) || t === 3 || t === 96)) {
    await advanceTo(page, t); evidence.push(await capture(page, info.outputPath(`${name}.png`)));
    if (t === 15) {
      await expect(page.locator('.blackout-research .finale-subtitle')).toBeVisible();
      const subtitle = await page.locator('.blackout-research .finale-subtitle').boundingBox();
      const skip = await page.locator('.blackout-research .finale-skip').boundingBox();
      expect(subtitle!.y + subtitle!.height).toBeLessThan(skip!.y);
      await page.screenshot({ path: info.outputPath('02-subtitles-and-letterbox.png') });
    }
    if (t === 96) await expect(page.locator('.blackout-research .finale-subtitle')).toBeHidden();
  }
  await page.keyboard.press('p'); await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'paused');
  const frozen = await page.evaluate(() => (window as any).__researchSession.runtime.resources.researchFinale.seconds);
  await advanceTo(page, 97); expect(await page.evaluate(() => (window as any).__researchSession.runtime.resources.researchFinale.seconds)).toBe(frozen);
  await page.locator('[data-action="resume"]').click();
  for (const [t, name] of ([[110.3, '10-capture-order'], [118.5, '11a-volt-sustained-overload'], [121.6, '11b-lamp-cascade'], [124.2, '11c-complete-blackout'], [128.5, '12-empty-search'], [T.findThem + 1, '11d-find-them'],
    [T.chase + .03, '13a-hallway-first-frame'], [147.2, '13-chase-closed-shutters'], [160, '14a-no-early-pursuers'], [161.2, '14-chase-reverse'],
    [166, '15a-stop-at-the-door'], [168.68, '15-bob-door-impact'], [169.6, '15c-bob-landing'], [175, '16-drones-closing'],
    [171.2, '15d-launch-after-impact'], [178.5, '16b-looking-at-volt'], [185.5, '16c-still-advancing'], [190.05, '16d-just-do-it-arrival'], [200, '17-crossfire'], [204, '18-energy-overload'], [208.25, '18a-explosion-cover'], [209.2, '18b-fusion-smoke'], [212.5, '18c-smoke-clearing'], [215, '19-specimen-reveal'], [217.2, '19b-absorbing-the-barrage'], [220.5, '20-fully-charged'],
    [222.6, '21-drones-destroyed'], [227.3, '22-door-breach'], [230.03, '22b-room-entry-first-frame'], [237, '23a-arena-overlook'],
    [T.ambush + .15, '23b-pursuers-enter-the-door'], [T.ram + .1, '23-drone-ambush'], [T.glass + .05, '24-glass-break'], [T.fall + .2, '24b-glass-exit'],
    [T.fall + 1.8, '25-falling-to-the-arena'], [T.landing + .05, '26-arena-landing'], [T.landing + 1.2, '26c-eating-pursuer-shots'], [T.landing + 2.1, '26b-facing-the-pit'], [T.turnPursuers + .9, '27a-turn-to-pursuers'],
    [T.clearPursuers + .12, '27b-first-bullet'], [T.clearPursuers + 1.52, '27c-third-bullet'], [T.clearPursuers + 3.2, '27-pursuers-destroyed'],
    [T.pitUnlock + .4, '27d-pit-unlocking'], [T.pitOpen + 1, '27e-pit-opening'], [T.pitOpen + 3, '27f-specimen-turns-to-opening'], [T.pitClear + .3, '27g-pit-clear-before-boss'],
    [T.boss + 3, '28-boss-emerges'], [T.boss + 6, '29a-boss-rising'], [T.handback - 2, '29-boss-towers-over-specimen'], [T.duration + .1, '30-boss-control']] as const)
    .filter(([t]) => barrageOnly ? [128.5, T.findThem + 1, 217.2, 220.5, 222.6, T.landing + 1.2, T.clearPursuers + .12, T.clearPursuers + 1.52, T.duration + .1].includes(t) : combatOnly ? t === T.duration + .1 : revealOnly ? [209.2, 212.5, 215, T.duration + .1].includes(t) : !quick || [128.5, T.findThem + 1, T.chase + .03, 147.2, 171.2, 190.05, 237, T.ambush + .15, T.glass + .05, T.clearPursuers + .12, T.pitUnlock + .4, T.pitOpen + 1, T.pitOpen + 3, T.pitClear + .3, T.boss + 3, T.duration + .1].includes(t))
    .sort((a, b) => a[0] - b[0])) {
    await advanceTo(page, t); const frame = await capture(page, info.outputPath(`${name}.png`)); evidence.push(frame);
    if (t === 124.2) await page.screenshot({ path: info.outputPath('11c-blackout-composited.png') });
    if (t === 128.5) { expect(frame.scientistText).not.toBe('Find them'); expect(frame.monitorInterfaceColor).toBe(0xffffff); }
    if ([217.2, T.landing + 1.2].includes(t)) {
      expect(frame.effects.incomingProjectiles).toBeGreaterThan(0); expect(frame.effects.absorbedShots).toBeGreaterThan(0);
    }
    if (t === T.findThem + 1) { expect(frame.monitorVisible).toBe(true); expect(frame.scientistText).toBe('Find them'); await expect(page.locator('.blackout-research .finale-subtitle')).toBeHidden(); }
    if ([160, 168.68, 169.6].includes(t)) expect(frame.visibleDrones).toBe(0);
    if (t === 237) { expect(frame.pitCoverVisible).toBe(true); expect(frame.arenaEntryDoorY).toBe(4.4); }
    if (t === T.pitClear + .3) { expect(frame.pitCoverVisible).toBe(false); expect(frame.pitOpenProgress).toBe(1); }
  }
  const follow = await page.evaluate(() => (window as any).__researchSession.runtime.renderLayer.cameraRig.getDiagnostics());
  expect(follow.profileId).toBe('extermination-specimen');
  expect(follow.profileBlend).toBeGreaterThan(.99);
  expect(follow.currentDistanceMetres).toBeGreaterThan(9);
  const combat = await page.evaluate(() => {
    const r = (window as any).__researchSession.runtime, resources = r.resources, w = resources.specimenAttack, boss = resources.finalBoss;
    const input = { active: true, aimHeld: false, fireHeld: true, firePressed: true, fireReleased: false, gameplayInputEnabled: true, pointerLocked: true };
    let damage = 0; const off = w.events.on('projectileFired', (e: any) => { damage = e.damageUnits; });
    w.reset(); w.update(.375, input); const half = w.readModel.chargeAmount;
    w.update(.001, { ...input, fireHeld: false, firePressed: false, fireReleased: true }); const partialDamage = damage;
    w.reset(); w.update(.75, input); const full = w.readModel.fullyCharged;
    w.update(.001, { ...input, fireHeld: false, firePressed: false, fireReleased: true }); const fullDamage = damage;
    w.reset(); w.update(.001, { ...input, fireHeld: false, fireReleased: true }); const tapDamage = damage; w.reset(); off();
    const core = resources.combatTargets.getRegistrationForMesh(boss.presentation.core).target;
    const accepted = core.applyImpact({ projectileId: 99901, targetId: core.id, kind: 'direct', chargeAmount: 1, fullyCharged: true,
      damageUnits: 18, point: boss.presentation.coreWorld.clone(), direction: boss.presentation.coreWorld.clone().set(0, 0, 1) }).accepted;
    const clock = boss.controller.time, elapsed = boss.controller.readModel.elapsed;
    for (let i = 0; i < 15; i++) boss.update(1 / 60);
    const remaining = boss.controller.readModel.stunRemaining, frozen = boss.controller.time === clock && boss.controller.readModel.elapsed === elapsed;
    for (let i = 0; i < 16; i++) boss.update(1 / 60);
    return { half, partialDamage, full, fullDamage, tapDamage, accepted, remaining, frozen, resumed: boss.controller.time > clock };
  });
  expect(combat.half).toBeCloseTo(.5); expect(combat.partialDamage).toBe(1); expect(combat.full).toBe(true); expect(combat.fullDamage).toBe(18); expect(combat.tapDamage).toBe(1);
  expect(combat.accepted).toBe(true); expect(combat.remaining).toBeCloseTo(.25); expect(combat.frozen).toBe(true); expect(combat.resumed).toBe(true);
  await writeFile(info.outputPath('combat-charge-and-stun.json'), JSON.stringify(combat));
  if (!await page.evaluate(() => (window as any).__researchSession.runtime.input.pointerLocked)) await page.mouse.click(400, 260);
  await page.waitForFunction(() => (window as any).__researchSession.runtime.input.pointerLocked);
  const orbit = await page.evaluate(() => {
    const r = (window as any).__researchSession.runtime, layer = r.renderLayer, rig = layer.cameraRig;
    const boss = r.resources.finalBoss, body = r.resources.specimenBody, cover = r.resources.scene.finalArena.cover[0];
    const savedBody = body.position.clone(), savedUpdate = boss.update, draw = layer.render;
    const near = cover.position.clone().set(0, 0, cover.geometry.parameters.depth / 2 + body.radiusMetres + .07)
      .applyQuaternion(cover.quaternion).add(cover.position).setY(savedBody.y);
    let maximumStep = 0, maximumAngle = 0, maximumYawError = 0, radians = 0, accumulator = 0;
    try {
      boss.update = () => {}; layer.render = () => {};
      body.recoverAt(near); rig.setGroundOrbitYawRadians(0); rig.setGroundOrbitPitchRadians(-.26);
      for (let i = 0; i < 60; i++) { r.fixedUpdate(1 / 60); r.render(1, { frameDeltaSeconds: 1 / 60 }); }
      const forward = body.position.clone(), previous = rig.camera.position.clone(), quaternion = rig.camera.quaternion.clone();
      rig.camera.getWorldDirection(forward); const start = Math.atan2(forward.x, forward.z);
      for (let i = 0; i < 720; i++) {
        const dt = i % 7 === 0 ? 1 / 30 : 1 / 144, pixels = Math.round(dt * 800);
        window.dispatchEvent(new MouseEvent('mousemove', { movementX: pixels, movementY: 0, bubbles: true }));
        radians -= pixels * .0022; accumulator += dt;
        while (accumulator >= 1 / 60) { r.fixedUpdate(1 / 60); accumulator -= 1 / 60; }
        r.render(accumulator * 60, { frameDeltaSeconds: dt }); rig.camera.getWorldDirection(forward);
        const yaw = Math.atan2(forward.x, forward.z);
        maximumYawError = Math.max(maximumYawError, Math.abs(Math.atan2(Math.sin(yaw - start - radians), Math.cos(yaw - start - radians))));
        maximumStep = Math.max(maximumStep, rig.camera.position.distanceTo(previous));
        maximumAngle = Math.max(maximumAngle, quaternion.angleTo(rig.camera.quaternion));
        previous.copy(rig.camera.position); quaternion.copy(rig.camera.quaternion);
      }
    } finally { boss.update = savedUpdate; layer.render = draw; body.recoverAt(savedBody); rig.setGroundOrbitYawRadians(Math.PI); }
    return { maximumStep, maximumAngle, maximumYawError, radians };
  });
  await writeFile(info.outputPath('near-cover-mouse-orbit.json'), JSON.stringify(orbit));
  expect(orbit.maximumStep).toBeLessThan(1.8); expect(orbit.maximumAngle).toBeLessThan(.061);
  expect(orbit.maximumYawError).toBeLessThan(1e-6); expect(Math.abs(orbit.radians)).toBeGreaterThan(Math.PI * 4);
  const cover = await page.evaluate(() => {
    const r = (window as any).__researchSession.runtime, arena = r.resources.scene.finalArena, boss = r.resources.finalBoss;
    const mesh = arena.cover[0], state = arena.coverHealth[0], before = state.health;
    const normal = mesh.position.clone().set(0, 0, 1).applyQuaternion(mesh.quaternion);
    const origin = mesh.position.clone().addScaledVector(normal, 8);
    boss.projectiles.clear(); boss.projectiles.fireOrb(origin, mesh.position); boss.projectiles.update(.2, r.resources.specimenBody);
    return { maximum: state.maximumHealth, playerMaximum: boss.controller.readModel.maximumPlayerHealth, before, after: state.health,
      offset: boss.presentation.evasionOffset.length(), roll: boss.presentation.evasionRoll };
  });
  expect(cover.maximum).toBe(cover.playerMaximum * 5); expect(cover.before - cover.after).toBe(20);
  expect(cover.offset).toBe(0); expect(cover.roll).toBe(0);
  await writeFile(info.outputPath('cover-health-and-no-evasion.json'), JSON.stringify(cover));
  const result = await page.evaluate(() => {
    const r = (window as any).__researchSession.runtime;
    const before = { phase: r.phase, boss: r.finalBossReadModel.state, checkpoint: r.activeCheckpoint.checkpointId,
      form: r.specimenFormReadModel.controlledForm, movie: r.resources.researchFinale.active, complete: r.resources.researchFinale.complete };
    r.recoverActiveCheckpoint(); return { before, replaying: r.resources.researchFinale.active, complete: r.resources.researchFinale.complete };
  });
  expect(result.before).toMatchObject({ phase: 'boss', boss: 'combat', checkpoint: 'cp8', form: 'specimen', movie: false, complete: true });
  expect(result.replaying).toBe(false); expect(result.complete).toBe(true);
  expect((evidence as { glError: number }[]).every(e => e.glError === 0)).toBe(true);
  const frames = evidence as { programs: number; seconds: number; preparation: { complete: boolean; frames: number } }[];
  expect(frames[0]!.preparation.complete).toBe(true);
  const growth = frames.filter(f => f.seconds < T.handback && f.programs > frames[0]!.programs).map(f => ({ at: f.seconds, programs: f.programs }));
  await writeFile(info.outputPath('research-evidence.json'), JSON.stringify({ evidence, result, failures }, null, 2));
  expect(growth, 'cinematic transitions must not compile first-use shader programs').toEqual([]);
  expect(failures).toEqual([]);
});
