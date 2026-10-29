import { exposeGame } from '../../helpers/GameRuntime.ts';
import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

async function advanceTo(page: Page, movieTime: number) {
  await page.evaluate(t => {
    const r = (window as any).__elevatorSession.runtime, movie = r.resources.elevatorAscent;
    for (let i = 0; i < 12000 && movie.active && movie.seconds < movie.boardingSeconds + t; i++) r.fixedUpdate(1 / 60);
    r.render(1, { frameDeltaSeconds: 1 / 60 });
  }, movieTime);
}
async function capture(page: Page, path: string) {
  const result = await page.evaluate(() => {
    const r = (window as any).__elevatorSession.runtime, l = r.renderLayer, lift = r.resources.scene.bossStaging.ascentLift;
    r.render(1, { frameDeltaSeconds: 1 / 60 });
    const png = l.canvas.toDataURL('image/png');
    return { png, metrics: { seconds: r.resources.elevatorAscent.seconds, boarding: r.resources.elevatorAscent.boardingSeconds,
      active: r.resources.elevatorAscent.active, complete: r.resources.elevatorAscent.complete, room: r.roomState,
      checkpoint: r.activeCheckpoint.checkpointId, positions: r.getSlimePositions(),
      camera: l.cameraRig.camera.position.toArray(), fov: l.cameraRig.camera.fov,
      rearGateY: lift.rearGate.position.y, frontGateY: lift.frontGate.position.y,
      programs: l.renderer.info.programs.length, geometries: l.renderer.info.memory.geometries,
      calls: l.renderer.info.render.calls, triangles: l.renderer.info.render.triangles,
      subtitle: document.querySelector('.blackout-elevator .finale-subtitle')?.textContent,
      glError: l.renderer.getContext().getError() } };
  });
  await writeFile(path, Buffer.from(result.png.split(',')[1]!, 'base64'));
  await writeFile(path.replace(/\.png$/, '.json'), JSON.stringify(result.metrics, null, 2));
  return result.metrics;
}

test('the production elevator boards persistent slimes, powers the outlet, passes real lights, pauses and lands in the lab', async ({ page }, info) => {
  test.setTimeout(420_000);
  const failures: string[] = [];
  page.on('pageerror', e => failures.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text())) failures.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()}: ${r.url()}`); });
  await exposeGame(page, { session: '__elevatorSession' });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]'); await expect(title).toBeVisible({ timeout: 180_000 });
  await title.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('[data-setting="graphics-preset"]').selectOption('performance');
  await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  await page.locator('[data-flow-panel="settings"]').getByRole('button', { name: 'Back', exact: true }).click();
  await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: 'Level 3 Blackout', exact: true }).click();
  await page.getByRole('button', { name: 'Enter Level 3', exact: true }).click({ timeout: 180_000 });
  await page.evaluate(() => {
    const r = (window as any).__elevatorSession.runtime; r.renderLayer.setAnimationLoop(null);
    for (let i = 0; i < 600; i++) r.fixedUpdate(1 / 60);
    r.activateCheckpoint('cp3'); r.recoverActiveCheckpoint();
    const { group, transit } = r.resources;
    if (transit.bridgeLocked) throw new Error('The reproduction must start with the bridge still unlocked');
    const v = group.voltBody.currentPosition.clone();
    group.bobBody.teleport(v.set(-1.5, .86, 151)); group.goopBody.teleport(v.set(1.5, .86, 151));
    group.voltBody.teleport(v.set(0, .86, 180.7));
    r.fixedUpdate(1 / 60);
    if (r.resources.elevatorAscent.active) throw new Error('One rider must wait until both companions are in the elevator room');
    group.bobBody.teleport(v.set(-1.5, .86, 175.2)); r.fixedUpdate(1 / 60);
    if (r.resources.elevatorAscent.active) throw new Error('Do not start with the third slime still outside');
    group.goopBody.teleport(v.set(1.5, .86, 175.2));
    r.renderLayer.renderer.setDrawingBufferSize(1280, 720, 1); r.renderLayer.cameraRig.camera.aspect = 16 / 9;
    r.fixedUpdate(1 / 60); r.render(1, { frameDeltaSeconds: 1 / 60 });
  });
  expect(await page.locator('#app').getAttribute('data-cinematic')).toBe('blackout-elevator');
  const evidence: unknown[] = [];
  evidence.push(await capture(page, info.outputPath('01-boarding.png')));
  for (const [t, name] of [[3, '02-goop-power-request'], [7, '03-volt-reply'], [10, '04-outlet-discharge'], [17, '05-ascent-wide'], [25.5, '06-goop-quiet-line']] as const) {
    await advanceTo(page, t); evidence.push(await capture(page, info.outputPath(`${name}.png`)));
  }
  await page.keyboard.press('p'); await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'paused');
  const frozen = await page.evaluate(() => (window as any).__elevatorSession.runtime.resources.elevatorAscent.seconds);
  await advanceTo(page, 27);
  expect(await page.evaluate(() => (window as any).__elevatorSession.runtime.resources.elevatorAscent.seconds)).toBe(frozen);
  await page.locator('[data-action="resume"]').click();
  for (const [t, name] of [[29.5, '07-volt-quiet-reply'], [34, '08-shaft-shadow'], [36.5, '09-passing-light'], [43, '10-arrival-braking'], [47.5, '11-lab-reveal'], [51, '12-walk-off'], [55, '13-lab-handoff']] as const) {
    await advanceTo(page, t); evidence.push(await capture(page, info.outputPath(`${name}.png`)));
  }
  const result = await page.evaluate(() => {
    const r = (window as any).__elevatorSession.runtime;
    r.recoverActiveCheckpoint(); for (let i = 0; i < 3; i++) r.fixedUpdate(1 / 60);
    return { checkpoint: r.activeCheckpoint.checkpointId, room: r.roomState, phase: r.phase, active: r.resources.elevatorAscent.active,
      identity: r.getSlimeHUDSnapshot().activeSlimeId, gate: r.resources.scene.bossStaging.ascentLift.frontGate.position.y };
  });
  expect(result).toMatchObject({ checkpoint: 'cp6', phase: 'three-slime', active: false, identity: 'volt', gate: 8.4 });
  expect(result.room.local.elevatorComplete).toBe(true);
  expect((evidence as { glError: number }[]).every(e => e.glError === 0)).toBe(true);
  await writeFile(info.outputPath('elevator-evidence.json'), JSON.stringify({ evidence, result, failures }, null, 2));
  expect(failures).toEqual([]);
});
