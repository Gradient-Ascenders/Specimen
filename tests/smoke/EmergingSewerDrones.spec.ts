import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { isExpectedMusicCancellation } from '../helpers/ExpectedMusicCancellation.ts';

const evidence = 'artifacts/evidence/batch-3-sewer-drones';
async function openLevel(page: Page, level: number, name: string) {
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern, '$1=globalThis.__sewerSession=new $2({initialRuntime:') });
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 180_000 });
  await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: `Level ${level} ${name}`, exact: true }).click();
  await page.getByRole('button', { name: `Enter Level ${level}`, exact: true }).click({ timeout: 180_000 });
  await page.waitForFunction(() => {
    const rt = (window as any).__sewerSession.runtime;
    return rt.input.enabled && !rt.ventArrival?.active && !rt.resources.ventArrival?.active && !rt.preparationQueue?.diagnostics.pending;
  }, null, { timeout: 180_000 });
  await page.locator('canvas[data-gameplay-canvas]').click();
  await page.evaluate(() => (window as any).__sewerSession.runtime.renderLayer.setAnimationLoop(null));
  await mkdir(evidence, { recursive: true });
}

// Inspect authored rooms from a reproducible survey camera. Gameplay still uses
// the shipped controller, collision world, acid projectiles and dissolve system.
async function capture(page: Page, name: string, camera: number[], look: number[]) {
  const png = await page.evaluate(({ camera, look }) => {
    const rt = (window as any).__sewerSession.runtime, layer = rt.renderLayer;
    rt.render(.5, { frameDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60 });
    layer.cameraRig.camera.position.set(...camera); layer.cameraRig.camera.lookAt(...look);
    rt.resources.transit?.updatePresentation(.12, layer.cameraRig.camera);
    layer.render();
    return layer.canvas.toDataURL('image/png').split(',')[1];
  }, { camera, look });
  await writeFile(`${evidence}/${name}.png`, Buffer.from(png, 'base64'));
}

for (const [level, name] of [[2, 'Cultivation'], [3, 'Blackout']] as const) {
  test(`Level ${level} sewer drone comparison and real acid interactions`, async ({ page, baseURL }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
    });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
    page.on('requestfailed', request => {
      if (!isExpectedMusicCancellation(request, baseURL!)) errors.push(`${request.failure()?.errorText}: ${request.url()}`);
    });
    await openLevel(page, level, name);
    await page.evaluate(level => {
      const rt = (window as any).__sewerSession.runtime;
      if (level === 2) rt.teleportToAuthoredPreviewRoom(5);
      else rt.teleportToAuthoredRoom(2);
      rt.render(.5, { frameDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60 });
    }, level);
    await page.waitForFunction(() => !(window as any).__sewerSession.runtime.preparationQueue?.diagnostics.pending,
      null, { timeout: 180_000, polling: 250 });

    if (level === 3) {
      const stages = await page.evaluate(() => {
        const rt = (window as any).__sewerSession.runtime, r = rt.resources, c = r.transit;
        r.group.bobBody.teleport(r.group.bobBody.position.clone().set(6, .86, 84));
        r.group.voltBody.teleport(r.group.voltBody.position.clone().set(-16, 2.96, 90));
        r.group.goopBody.teleport(r.group.goopBody.position.clone().set(8, .86, 84));
        const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
        const stages: any[] = [c.emergingDrones.map((d: any) => d.state.state)];
        for (const z of [85, 109, 131]) {
          bodies.goop.teleport(bodies.goop.position.clone().set(18, -.52, z));
          for (let i = 0; i < 120; i++) c.update(1 / 60, bodies);
          stages.push(c.emergingDrones.map((d: any) => d.state.state));
          if (c.projectiles.liveCount) throw new Error('Drone fired inside the safe emergence annulus');
        }
        return stages;
      });
      expect(stages).toEqual([['dormant', 'dormant', 'dormant'], ['active', 'dormant', 'dormant'],
        ['active', 'active', 'dormant'], ['active', 'active', 'active']]);
      await page.evaluate(() => {
        const r = (window as any).__sewerSession.runtime.resources, c = r.transit;
        const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
        for (const receiver of c.lights) receiver.target.setConnectionState(true);
        for (let i = 0; i < 90; i++) c.update(1 / 60, bodies);
        for (const receiver of c.lights) receiver.target.setConnectionState(false);
      });
      await capture(page, 'level-3-room-2-emerged', [0, 16, 86], [15, 2, 119]);
      for (const [index, z] of [100, 124, 146].entries()) {
        await capture(page, `level-3-drone-${index + 1}`, [11, 5, z - 6], [18, 3.3, z]);
      }
    } else {
      const state = await page.evaluate(() => {
        const rt = (window as any).__sewerSession.runtime, r = rt.resources;
        const room = r.authoredPreview.roomFive, goop = r.pair.goopBody;
        goop.teleport(room.root.localToWorld(goop.position.clone().set(40, -11.5, 63)));
        r.manager.activate('goop');
        for (let i = 0; i < 120; i++) {
          room.update(1 / 60, [{ id: 'goop', position: goop.position }]);
          r.roomFiveEncounter.update(1 / 60);
        }
        return { phase: room.controller.brokenDroneState, hits: room.controller.brokenDroneHits,
          position: room.brokenCore.getWorldPosition(goop.position.clone()).toArray() };
      });
      expect(state.phase).toBe('active'); expect(state.hits).toBe(0);
      const p = state.position;
      await capture(page, 'level-2-room-5-reference', [p[0] - 4, p[1] + 2, p[2] - 9], p);
    }

    const interactions = await page.evaluate(level => {
      const rt = (window as any).__sewerSession.runtime, r = rt.resources;
      const acid = r.acidProjectileSystem, dissolve = r.dissolveSystem;
      const goop = level === 3 ? r.group.goopBody : r.pair.goopBody;
      r.manager.activate('goop');
      const enemies = level === 3 ? r.transit.emergingDrones : [{
        target: dissolve.registeredTargets.find((t: any) => t.mesh === r.authoredPreview.roomFive.brokenCore),
        shell: { body: r.authoredPreview.roomFive.brokenCore }, state: r.authoredPreview.roomFive.controller.sewerDrone,
      }];
      const results: any[] = [];
      for (const enemy of enemies) {
        const aim = enemy.shell.body.getWorldPosition(goop.position.clone());
        // Use a real camera ray from Goop's reachable basin location, then run
        // cooldown-paced projectiles and burn completion, with no direct hits.
        goop.teleport(aim.clone().add(aim.clone().set(-3, -3.5, -4)));
        const camera = rt.renderLayer.cameraRig.camera;
        camera.position.copy(goop.position); camera.position.y += .7; camera.lookAt(aim);
        const hits: number[] = [];
        for (let hit = 0; hit < 3; hit++) {
          acid.update(1 / 60, { aimHeld: true, firePressed: true, gameplayInputEnabled: true, pointerLocked: true });
          if (!acid.aimReadModel.visibleSolubleIds.includes(enemy.target.id)) throw new Error(`Missing highlight ${enemy.target.id}`);
          for (let i = 0; i < 60; i++) {
            acid.update(1 / 60, { aimHeld: true, firePressed: false, gameplayInputEnabled: true, pointerLocked: true });
            dissolve.update(1 / 60);
          }
          hits.push(enemy.state.hits);
        }
        results.push({ id: enemy.target.id, hits, destroyed: enemy.target.completed });
      }
      if (level === 3) {
        const bodies = { bob: r.group.bobBody, goop, volt: r.group.voltBody };
        r.transit.update(1 / 60, bodies);
      } else r.roomFiveEncounter.update(1 / 60);
      const info = rt.renderLayer.renderer.info;
      return { results, glError: rt.renderLayer.renderer.getContext().getError(), memory: { ...info.memory }, calls: info.render.calls };
    }, level);
    expect(interactions.results).toHaveLength(level === 3 ? 3 : 1);
    for (const result of interactions.results) {
      expect(result.hits).toEqual([1, 2, 3]); expect(result.destroyed).toBe(true);
    }
    expect(interactions.glError).toBe(0);
    let progression;
    if (level === 3) {
      progression = await page.evaluate(() => {
        const rt = (window as any).__sewerSession.runtime, r = rt.resources, c = r.transit;
        const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
        bodies.bob.teleport(c.room.switchBodyPosition);
        bodies.volt.teleport(bodies.volt.position.clone().set(0, 1.26, 145));
        bodies.goop.teleport(bodies.goop.position.clone().set(4, -.52, 140));
        for (let i = 0; i < 90; i++) {
          bodies.bob.update(1 / 60, bodies.bob.position.clone().set(-1, 0, 0));
          c.update(1 / 60, bodies);
        }
        const deployed = c.bridgeDeployed;
        r.manager.activate('volt');
        const aim = bodies.volt.position.clone(); c.lockReceiver.target.copySocketWorldPosition(aim);
        const camera = rt.renderLayer.cameraRig.camera;
        camera.position.copy(bodies.volt.position); camera.lookAt(aim);
        for (let i = 0; i < 95; i++) {
          r.electricalSystem.update(1 / 60, { aimHeld: true, fireHeld: true, firePressed: i === 0,
            gameplayInputEnabled: true, pointerLocked: true });
          c.update(1 / 60, bodies);
        }
        const locked = c.bridgeLocked;
        const start = performance.now();
        for (let i = 0; i < 600; i++) c.update(1 / 60, bodies);
        const updateMilliseconds = performance.now() - start;
        return { deployed, locked, updateMilliseconds,
          lights: c.emergingDrones.map((d: any) => ({ castsShadow: d.light.castShadow, shadowMap: d.light.shadow.map !== null })),
          projectileCapacity: c.projectiles.states.length };
      });
      expect(progression.deployed).toBe(true); expect(progression.locked).toBe(true);
      expect(progression.lights.every((l: any) => !l.castsShadow && !l.shadowMap)).toBe(true);
      expect(progression.projectileCapacity).toBe(48);
    }
    await writeFile(`${evidence}/level-${level}-results.json`, JSON.stringify({ interactions, progression, errors }, null, 2));
    expect(errors).toEqual([]);
  });
}
