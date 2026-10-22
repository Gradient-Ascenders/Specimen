import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { isExpectedMusicCancellation } from '../helpers/ExpectedMusicCancellation.ts';

const evidence = 'artifacts/evidence/batch-3-drone-refinement';
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
    // Staged body updates must also reach the normal character presentation.
    // Survey from Bob's perspective so ability aiming does not fade Goop out
    // of the evidence; restore ownership before the next combat step.
    const active = rt.resources.group ? rt.resources.manager.activeSlimeId : undefined;
    if (active) { rt.resources.manager.activate('bob'); rt.syncVisuals(rt.resources); }
    rt.render(.5, { frameDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60 });
    layer.cameraRig.camera.up.set(0, 1, 0);
    layer.cameraRig.camera.position.set(...camera); layer.cameraRig.camera.lookAt(...look);
    rt.resources.transit?.updatePresentation(.12, layer.cameraRig.camera);
    layer.render();
    const png = layer.canvas.toDataURL('image/png').split(',')[1];
    if (active) rt.resources.manager.activate(active);
    return png;
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
      const dormant = await page.evaluate(() => {
        const r = (window as any).__sewerSession.runtime.resources, c = r.transit;
        r.group.bobBody.teleport(r.group.bobBody.position.clone().set(6, .86, 84));
        r.group.voltBody.teleport(r.group.voltBody.position.clone().set(-16, 2.96, 90));
        r.group.goopBody.teleport(r.group.goopBody.position.clone().set(8, .86, 84));
        const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
        for (const receiver of c.lights) receiver.target.setConnectionState(true);
        for (let i = 0; i < 90; i++) c.update(1 / 60, bodies);
        for (const receiver of c.lights) receiver.target.setConnectionState(false);
        const rods: string[] = [];
        c.root.traverse((o: any) => { if (o.name.startsWith('transit-light-bank-hanger-')) rods.push(o.name); });
        return { rods, horizontalRods: c.room.collisionMeshes.filter((m: any) => m.name.startsWith('transit-east-service-conduit-')).map((m: any) => m.name),
          lights: c.lights.length, drones: c.emergingDrones.map((d: any) => ({
          state: d.state.state, y: d.shell.body.position.y, visible: d.shell.body.visible,
          armed: d.weapon.readModel.enabled, lamp: d.light.intensity,
        })) };
      });
      expect(dormant.rods).toEqual([]); expect(dormant.lights).toBe(3);
      expect(dormant.horizontalRods).toEqual(['transit-east-service-conduit-136']);
      for (const drone of dormant.drones) expect(drone).toEqual({ state: 'dormant', y: -.98, visible: true, armed: false, lamp: 0 });
      await capture(page, 'bob-drone-1-dormant', [15, 1.4, 96], [18, -.7, 100]);
      await capture(page, 'bob-drone-2-dormant', [15, 1.4, 120], [18, -.7, 124]);
      await capture(page, 'volt-drone-dormant', [-8, 1.4, 128], [-11.5, -.7, 132]);
      await capture(page, 'overhead-lights-cleaned', [-5, 13, 88], [14, 12, 111]);
      for (const [index, z] of [85, 109].entries()) {
        const stage = await page.evaluate(z => {
          const r = (window as any).__sewerSession.runtime.resources, c = r.transit;
          const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
          bodies.goop.teleport(bodies.goop.position.clone().set(18, -.52, z));
          let maxStep = 0;
          const enemy = c.emergingDrones[z === 85 ? 0 : 1];
          for (let i = 0; i < 120; i++) {
            const y = enemy.shell.body.position.y; c.update(1 / 60, bodies);
            maxStep = Math.max(maxStep, Math.abs(enemy.shell.body.position.y - y));
          }
          return { phases: c.emergingDrones.map((d: any) => d.state.state), maxStep, shots: c.projectiles.liveCount };
        }, z);
        expect(stage.phases).toEqual(index === 0 ? ['active', 'dormant', 'dormant'] : ['active', 'active', 'dormant']);
        expect(stage.maxStep).toBeLessThan(.09); expect(stage.shots).toBe(0);
        await capture(page, `bob-drone-${index + 1}-guarding-route`, [8, 7, z + 8], [15, 2.8, z + 15]);
      }
      const voltStage = await page.evaluate(() => {
        const r = (window as any).__sewerSession.runtime.resources, c = r.transit;
        const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
        bodies.goop.teleport(bodies.goop.position.clone().set(10, -.52, 139));
        bodies.bob.teleport(bodies.bob.position.clone().set(10, 8.06, 142.5));
        c.update(1 / 60, bodies);
        const before = c.emergingDrones[2].state.state;
        bodies.volt.teleport(bodies.volt.position.clone().set(-16, 2.96, 117.5));
        for (let i = 0; i < 120; i++) c.update(1 / 60, bodies);
        return { before, after: c.emergingDrones[2].state.state, shots: c.projectiles.liveCount,
          angles: c.emergingDrones.map((d: any) => d.light.angle) };
      });
      expect(voltStage.before).toBe('dormant'); expect(voltStage.after).toBe('active');
      expect(voltStage.shots).toBe(0); expect(voltStage.angles).toEqual([.275, .275, .275]);
      await capture(page, 'volt-drone-guarding-catwalk', [-6, 6, 123], [-13, 3, 132]);
      await writeFile(`${evidence}/dormant-and-emergence.json`, JSON.stringify({ dormant, voltStage }, null, 2));
      const guardCombat = await page.evaluate(() => {
        const r = (window as any).__sewerSession.runtime.resources, c = r.transit;
        const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
        const saved = c.capture(), poses = Object.values(bodies).map((b: any) => b.position.clone());
        const direction = bodies.volt.position.clone().set(0, 0, 0), results: any[] = [];
        try {
          for (const scenario of [
            { x: -16, z: 130, moving: false }, { x: -16, z: 132, moving: false },
            { x: -16, z: 134, moving: false }, { x: -15.28, z: 132, moving: false },
            { x: -16, z: 117.5, moving: true }, { x: -15.28, z: 117.5, moving: true },
            { x: -16, z: 90, moving: true }, { x: -15.28, z: 90, moving: true },
          ]) {
            c.reset(); c.setActive(true); r.manager.activate('volt');
            bodies.bob.teleport(bodies.bob.position.clone().set(6, .86, 84));
            bodies.goop.teleport(bodies.goop.position.clone().set(8, .86, 84));
            bodies.volt.teleport(bodies.volt.position.clone().set(scenario.x, 2.96, scenario.z));
            let acquired = 0, impacts = 0, minimumHealth = 100;
            const enemy = c.emergingDrones[2];
            const offAcquired = enemy.weapon.events.on('acquired', (event: any) => { if (event.slimeId === 'volt') acquired++; });
            const offImpact = c.projectiles.events.on('slimeImpact', (event: any) => {
              if (event.ownerDroneId === enemy.id && event.slimeId === 'volt') impacts++;
            });
            try {
              direction.set(0, 0, scenario.moving ? 1 : 0);
              for (let i = 0; i < (scenario.moving ? 600 : 2400); i++) {
                if (scenario.moving ? bodies.volt.position.z >= 136 : impacts > 0) break;
                bodies.volt.update(1 / 60, direction); c.update(1 / 60, bodies);
                minimumHealth = Math.min(minimumHealth, c.damage.health.find((h: any) => h.slimeId === 'volt').health);
              }
              results.push({ ...scenario, acquired, impacts, minimumHealth, grounded: bodies.volt.grounded,
                z: bodies.volt.position.z, speed: bodies.volt.velocity.z });
            } finally { offAcquired(); offImpact(); }
          }
        } finally {
          c.restore(saved);
          Object.values(bodies).forEach((body: any, i) => body.teleport(poses[i]));
        }
        return results;
      });
      for (const result of guardCombat) {
        expect(result.acquired).toBeGreaterThan(0); expect(result.impacts).toBeGreaterThan(0);
        expect(result.minimumHealth).toBeLessThanOrEqual(70); expect(result.grounded).toBe(true);
        if (result.moving) { expect(result.z).toBeGreaterThanOrEqual(136); expect(result.speed).toBeGreaterThan(5.49); }
      }
      await writeFile(`${evidence}/volt-guard-live-combat.json`, JSON.stringify(guardCombat, null, 2));
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
        if (level === 3) goop.teleport(goop.position.clone().setY(-.52));
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

test('Level 3 mandatory drone destruction, real Goop retaliation and physical route interlocks', async ({ page, baseURL }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text())) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`); });
  page.on('requestfailed', r => { if (!isExpectedMusicCancellation(r, baseURL!)) errors.push(`${r.failure()?.errorText}: ${r.url()}`); });
  await openLevel(page, 3, 'Blackout');
  await page.setViewportSize({ width: 960, height: 540 });
  await page.evaluate(() => (window as any).__sewerSession.runtime.teleportToAuthoredRoom(2));
  await page.waitForFunction(() => !(window as any).__sewerSession.runtime.preparationQueue?.diagnostics.pending, null, { timeout: 180_000 });
  const locked = await page.evaluate(() => {
    const rt = (window as any).__sewerSession.runtime, r = rt.resources, c = r.transit;
    c.reset(); c.setActive(true);
    const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
    bodies.bob.teleport(bodies.bob.position.clone().set(6, .86, 84));
    bodies.goop.teleport(bodies.goop.position.clone().set(8, .86, 84));
    bodies.volt.teleport(bodies.volt.position.clone().set(-16, 2.96, 90));
    for (const light of c.lights) light.target.setConnectionState(true);
    for (let i = 0; i < 91; i++) c.update(1 / 60, bodies);
    const dormant = c.emergingDrones.map((d: any) => ({ phase: d.state.state, y: d.shell.body.position.y }));
    // Actual switch attachment cannot override the encounter interlock.
    bodies.bob.teleport(c.room.switchBodyPosition);
    for (let i = 0; i < 100; i++) { bodies.bob.update(1 / 60, bodies.bob.position.clone().set(-1, 0, 0)); c.update(1 / 60, bodies); }
    const switchBlocked = !c.switchHeld && !c.bridgeDeployed;
    bodies.bob.teleport(bodies.bob.position.clone().set(10, 1.91, 110));
    for (const lift of c.lifts) lift.core.setConnectionState(true);
    for (let i = 0; i < 150; i++) { bodies.bob.update(1 / 60, bodies.bob.position.clone().set(0, 0, 0)); c.update(1 / 60, bodies); }
    const lifts = c.lifts.map((l: any) => ({ available: l.core.readModel.available, powered: l.core.readModel.powered, y: l.root.position.y }));
    // A normal uninterrupted Volt run reaches the bridge approach, but cannot
    // make a crossing: the authoritative bridge never extends for live guards.
    bodies.volt.teleport(bodies.volt.position.clone().set(-16, 2.96, 117.5));
    let voltFailed = false;
    for (let i = 0; i < 360; i++) {
      bodies.volt.update(1 / 60, bodies.volt.position.clone().set(0, 0, 1));
      if (c.update(1 / 60, bodies) === 'volt') { voltFailed = true; break; }
    }
    // Also exercise the complete physical hallway barrier with real bodies,
    // including a jumping attempt at its inner edge.
    c.resetTransient();
    const attempts = [];
    for (const [id, x, jump] of [['bob', -3, true], ['volt', 3, false], ['bob', 0, false]] as const) {
      const body = bodies[id]; body.teleport(body.position.clone().set(x, .86, 158));
      let maxY = body.position.y;
      for (let i = 0; i < 90; i++) {
        body.update(1 / 60, body.position.clone().set(0, 0, 1), { pressed: jump && i === 2, held: jump && i >= 2 && i < 44, released: jump && i === 44 });
        maxY = Math.max(maxY, body.position.y); c.update(1 / 60, bodies);
      }
      attempts.push({ id, jump, z: body.position.z, maxY });
    }
    (window as any).__mandatoryLockedState = c.capture();
    bodies.bob.teleport(bodies.bob.position.clone().set(10, 1.91, 110));
    bodies.volt.teleport(bodies.volt.position.clone().set(-16, 2.96, 132));
    return { dormant, switchBlocked, lifts, voltFailed, bridgeDeployed: c.bridgeDeployed, attempts, complete: c.complete };
  });
  expect(locked.dormant).toEqual(Array.from({ length: 3 }, () => ({ phase: 'dormant', y: -.98 })));
  expect(locked.switchBlocked).toBe(true); expect(locked.bridgeDeployed).toBe(false); expect(locked.complete).toBe(false);
  expect(locked.lifts.every((l: any) => !l.available && !l.powered)).toBe(true);
  expect(locked.voltFailed).toBe(true);
  expect(locked.attempts.every((a: any) => a.z < 159)).toBe(true);
  expect(locked.attempts[0].maxY).toBeGreaterThan(2);
  await capture(page, 'mandatory-bob-lift-locked', [16, 6, 106], [10, 2.4, 111]);
  await capture(page, 'mandatory-volt-bridge-locked', [-10, 7, 128], [-15, 2.5, 139]);
  await capture(page, 'mandatory-exit-shutter-closed', [-2, 2.5, 157], [0, 2.5, 159]);

  await page.evaluate(() => {
    const r = (window as any).__sewerSession.runtime.resources, c = r.transit;
    c.emergingDrones[0].reset();
    r.group.goopBody.teleport(r.group.goopBody.position.clone().set(18, -.52, 85));
    r.group.bobBody.teleport(r.group.bobBody.position.clone().set(6, .86, 84));
    const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
    for (let i = 0; i < 45; i++) c.update(1 / 60, bodies);
  });
  await capture(page, 'mandatory-guard-emerging', [21, 2, 94], [18, .2, 100]);

  const combats: any[] = [];
  for (const index of [0, 1, 2]) {
    const response = await page.evaluate(index => {
      const rt = (window as any).__sewerSession.runtime, r = rt.resources, c = r.transit;
      const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody }, enemy = c.emergingDrones[index];
      c.resetTransient(); r.acidProjectileSystem.reset();
      bodies.bob.teleport(bodies.bob.position.clone().set(6, .86, 84));
      bodies.volt.teleport(bodies.volt.position.clone().set(-16, 2.96, 86));
      const z = [100, 124, 132][index];
      bodies.goop.teleport(bodies.goop.position.clone().set(index === 2 ? -8 : 18, -.52, z - 7));
      r.manager.activate('goop');
      for (let i = 0; i < 180; i++) c.update(1 / 60, bodies);
      const camera = rt.renderLayer.cameraRig.camera;
      camera.position.copy(bodies.goop.position); camera.position.y += .7;
      camera.lookAt(enemy.shell.body.getWorldPosition(bodies.goop.position.clone()));
      let hit = false, fired = false, damaged = false;
      const offHit = r.acidProjectileSystem.events.on('solubleImpact', (e: any) => { if (e.targetId === enemy.id && e.burnStarted) hit = true; });
      const offFire = enemy.weapon.events.on('fired', (e: any) => { if (e.slimeId === 'goop') fired = true; });
      const offDamage = c.projectiles.events.on('slimeImpact', (e: any) => { if (e.ownerDroneId === enemy.id && e.slimeId === 'goop') damaged = true; });
      r.acidProjectileSystem.update(1 / 60, { aimHeld: true, firePressed: true, gameplayInputEnabled: true, pointerLocked: true });
      for (let i = 0; i < 150 && !fired; i++) {
        r.acidProjectileSystem.update(1 / 60, { aimHeld: true, firePressed: false, gameplayInputEnabled: true, pointerLocked: true });
        r.dissolveSystem.update(1 / 60); c.update(1 / 60, bodies);
      }
      offHit(); offFire(); offDamage();
      return { index, hit, fired, damaged, liveShots: c.projectiles.liveCount, hits: enemy.state.hits, target: enemy.weapon.readModel.targetSlimeId,
        angle: enemy.light.angle, lightRange: enemy.light.distance, state: enemy.state.state };
    }, index);
    combats.push(response);
    expect(response).toMatchObject({ hit: true, fired: true, hits: 1, target: 'goop', angle: .275, lightRange: 30 });
    expect(response.liveShots).toBeGreaterThan(0);
    await capture(page, `mandatory-guard-${index + 1}-retaliating`, index === 2 ? [-3, 4, 123] : [12, 4, 90 + index * 24],
      index === 2 ? [-10, 1, 129] : [18, 1, 96 + index * 24]);
    const damage = await page.evaluate(() => {
      const r = (window as any).__sewerSession.runtime.resources, c = r.transit;
      const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
      for (let i = 0; i < 10; i++) c.update(1 / 60, bodies);
      return c.damage.health.find((h: any) => h.slimeId === 'goop').health;
    });
    expect(damage).toBeLessThan(100); response.damaged = true;
    if (index === 0) {
      const cover = await page.evaluate(() => {
        const r = (window as any).__sewerSession.runtime.resources, c = r.transit, enemy = c.emergingDrones[0];
        const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
        bodies.goop.teleport(bodies.goop.position.clone().set(9.5, -.52, 102));
        const before = c.damage.health.find((h: any) => h.slimeId === 'goop').health;
        let impacts = 0;
        const off = c.projectiles.events.on('slimeImpact', (e: any) => { if (e.slimeId === 'goop') impacts++; });
        for (let i = 0; i < 60; i++) c.update(1 / 60, bodies);
        const searching = enemy.retaliating, target = enemy.weapon.readModel.targetSlimeId;
        for (let i = 0; i < 360; i++) c.update(1 / 60, bodies);
        const after = c.damage.health.find((h: any) => h.slimeId === 'goop').health;
        off();
        bodies.goop.teleport(bodies.goop.position.clone().set(18, -.52, 93));
        return { before, after, impacts, searching, target, returned: !enemy.retaliating, alertSeconds: enemy.capture().alertSeconds };
      });
      expect(cover.impacts).toBe(0); expect(cover.after).toBeGreaterThanOrEqual(cover.before); expect(cover.searching).toBe(true);
      expect(cover.target).toBeUndefined(); expect(cover.returned).toBe(true);
      combats.push({ actualLandingCover: cover });
    }
    const destroyed = await page.evaluate(index => {
      const rt = (window as any).__sewerSession.runtime, r = rt.resources, c = r.transit;
      const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody }, enemy = c.emergingDrones[index];
      for (let hit = 0; hit < 2; hit++) {
        const camera = rt.renderLayer.cameraRig.camera;
        camera.position.copy(bodies.goop.position); camera.position.y += .7;
        camera.lookAt(enemy.shell.body.getWorldPosition(bodies.goop.position.clone()));
        for (let i = 0; i < 60; i++) {
          r.acidProjectileSystem.update(1 / 60, { aimHeld: true, firePressed: i === 0, gameplayInputEnabled: true, pointerLocked: true });
          r.dissolveSystem.update(1 / 60); c.update(1 / 60, bodies);
        }
      }
      return { phase: enemy.state.state, completed: enemy.target.completed, hits: enemy.state.hits,
        lifts: c.lifts.map((l: any) => l.core.readModel.available), cleared: c.encounterCleared };
    }, index);
    expect(destroyed).toMatchObject({ phase: 'destroyed', completed: true, hits: 3 });
    expect(destroyed.lifts).toEqual(index === 0 ? [true, false] : [true, true]);
    expect(destroyed.cleared).toBe(index === 2);
  }
  const released = await page.evaluate(() => {
    const rt = (window as any).__sewerSession.runtime, r = rt.resources, c = r.transit;
    const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
    c.resetTransient();
    const passes = [];
    for (const id of ['bob', 'volt'] as const) {
      const body = bodies[id]; body.teleport(body.position.clone().set(-2, .86, 158));
      for (let i = 0; i < 60; i++) { body.update(1 / 60, body.position.clone().set(0, 0, 1)); c.update(1 / 60, bodies); }
      passes.push({ id, z: body.position.z, grounded: body.grounded });
    }
    bodies.bob.teleport(c.room.switchBodyPosition);
    for (let i = 0; i < 95; i++) { bodies.bob.update(1 / 60, bodies.bob.position.clone().set(-1, 0, 0)); c.update(1 / 60, bodies); }
    const bridge = c.bridgeDeployed;
    const cleared = c.capture(); c.restore((window as any).__mandatoryLockedState);
    const recoveredLocked = !c.encounterCleared && !c.bridgeDeployed && c.root.getObjectByName('transit-drone-interlock-shutter').visible;
    c.restore(cleared);
    const info = rt.renderLayer.renderer.info;
    return { passes, bridge, recoveredLocked, recoveredOpen: c.encounterCleared && !c.root.getObjectByName('transit-drone-interlock-shutter').visible,
      glError: rt.renderLayer.renderer.getContext().getError(), memory: { ...info.memory }, lights: c.emergingDrones.length,
      shadowMaps: c.emergingDrones.filter((d: any) => d.light.castShadow || d.light.shadow.map).length };
  });
  expect(released.passes.every((p: any) => p.z > 161 && p.grounded)).toBe(true);
  expect(released.bridge).toBe(true); expect(released.recoveredLocked).toBe(true); expect(released.recoveredOpen).toBe(true);
  expect(released.glError).toBe(0); expect(released.shadowMaps).toBe(0);
  await capture(page, 'mandatory-bob-bridge-released', [15, 10, 136], [7, 7, 143]);
  await capture(page, 'mandatory-volt-bridge-released', [-10, 7, 128], [-15, 2.5, 139]);
  await capture(page, 'mandatory-exit-shutter-open', [-2, 2.5, 157], [0, 2.5, 159]);
  await writeFile(`${evidence}/mandatory-encounter-results.json`, JSON.stringify({ locked, combats, released, errors }, null, 2));
  expect(errors).toEqual([]);
});
