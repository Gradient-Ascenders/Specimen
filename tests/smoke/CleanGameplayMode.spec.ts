import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('F1 preserves gameplay across three levels and captures normal, clean and restored views', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 960, height: 600 });
  const directory = resolve('artifacts/evidence/f1-clean-gameplay');
  await mkdir(directory, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (request) =>
    errors.push(
      `Failed request: ${request.failure()?.errorText} ${request.url()}`,
    ),
  );
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  // Observe the real runtime; no gameplay or rendering implementation is replaced.
  await page.route('**/assets/index-*.js', async (route) => {
    const response = await route.fetch(),
      source = await response.text();
    const pattern =
      /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({
      response,
      body: source.replace(
        pattern,
        '$1=globalThis.__cleanSession=new $2({initialRuntime:',
      ),
    });
  });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const app = page.locator('#app'),
    hud = page.locator('.game-hud');
  await expect(page.locator('[data-action="start"]')).toBeVisible({
    timeout: 180_000,
  });
  await page.keyboard.press('F1');
  await expect(app).not.toHaveAttribute('data-clean-gameplay');
  await page.locator('[data-action="start"]').click();
  await page.locator('canvas').click();
  await page.waitForFunction(
    () => (window as any).__cleanSession.runtime.input.pointerLocked,
  );
  await page.evaluate(() =>
    (window as any).__cleanSession.runtime.renderLayer.setAnimationLoop(null),
  );
  const draw = () =>
    page.evaluate(() => {
      const rt = (window as any).__cleanSession.runtime;
      rt.input.endPointerUpdate();
      rt.render(1, {
        fixedDeltaSeconds: 1 / 60,
        rawFrameDeltaSeconds: 0,
        frameDeltaSeconds: 0,
        stepsThisFrame: 0,
        interpolationAlpha: 1,
        droppedSimulationTimeSeconds: 0,
        renderFps: 60,
      });
    });
  const step = (count: number) =>
    page.evaluate((count) => {
      const rt = (window as any).__cleanSession.runtime;
      for (let i = 0; i < count; i++) rt.fixedUpdate(1 / 60);
      const manager = rt.resources?.manager ?? rt.resources?.slimeManager;
      return {
        position: manager?.activeBody
          ? { ...manager.activeBody.position }
          : undefined,
        active: manager?.activeSlimeId,
        input: rt.input.enabled,
        audio: { ...rt.audio.diagnostics },
        camera: rt.renderLayer.cameraRig.camera.position.toArray(),
      };
    }, count);
  const assertCleanHud = async () => {
    await expect(hud).toBeHidden();
    await expect(page.locator('[data-current-objective]')).toBeHidden();
    await expect(page.locator('[data-slime-roster]')).toBeHidden();
    await expect(page.locator('.hud-hint')).toBeHidden();
    await expect(page.locator('[data-gameplay-canvas]')).toBeVisible();
    const visible = await page.evaluate(() =>
      [...document.querySelector('#app')!.children]
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            !element.hasAttribute('data-clean-gameplay-aiming') &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) !== 0 &&
            element.getBoundingClientRect().width > 0
          );
        })
        .map((element) => element.tagName),
    );
    expect(visible).toEqual(['CANVAS']);
  };
  await expect(
    page.locator('[data-clean-gameplay-aiming][data-clean-gameplay-essential]'),
  ).toHaveCount(0);
  const capture = async (level: number, name: string) => {
    await draw();
    await page.screenshot({
      path: resolve(directory, `level-${level}-${name}.png`),
      timeout: 120_000,
    });
  };
  for (const level of [1, 2, 3]) {
    await expect(page.locator('.game-flow')).toHaveAttribute(
      'data-state',
      'playing',
    );
    expect(
      await page.evaluate(() => {
        const resources = (window as any).__cleanSession.runtime.resources;
        return {
          bob: (resources.bobPresentation ?? resources.testScene.bob).ready,
          goop: (resources.goopPresentation ?? resources.testScene.goop).ready,
        };
      }),
    ).toEqual({ bob: true, goop: true });
    if (level > 1) {
      await expect(app).toHaveAttribute('data-clean-gameplay', 'true');
      await assertCleanHud();
      await page.keyboard.press('F1');
    }
    await expect(hud).toBeVisible();
    await draw();
    await capture(level, 'normal');
    const before = await step(0);
    await page.keyboard.press('F1');
    await expect(app).toHaveAttribute('data-clean-gameplay', 'true');
    await assertCleanHud();
    await capture(level, 'clean');
    // Check actual WebGL UI filtering in levels that own locator sprites.
    const renderState = await page.evaluate(() => {
      const rt = (window as any).__cleanSession.runtime,
        layer = rt.renderLayer,
        seen: { locator: boolean[]; aiming: boolean[] } = {
          locator: [],
          aiming: [],
        };
      const render = layer.renderer.render.bind(layer.renderer);
      layer.renderer.render = (scene: any, camera: any) => {
        scene.traverse((object: any) => {
          if (object.name.endsWith('-inactive-body-locator'))
            seen.locator.push(camera.layers.test(object.layers));
          if (object.name.endsWith('-conducting-outline'))
            seen.aiming.push(camera.layers.test(object.layers));
        });
        return render(scene, camera);
      };
      try {
        layer.render();
      } finally {
        layer.renderer.render = render;
      }
      return seen;
    });
    if (level < 3) expect(renderState.locator.length).toBeGreaterThan(0);
    expect(renderState.locator.every((value: boolean) => value === false)).toBe(
      true,
    );
    if (level === 3) expect(renderState.aiming.length).toBeGreaterThan(0);
    expect(renderState.aiming.every((value: boolean) => value === true)).toBe(
      true,
    );

    const after = await step(0);
    expect(after.position).toEqual(before.position);
    expect(after.camera).toEqual(before.camera);
    expect(after.input).toBe(before.input);
    expect(after.audio.paused).toBe(before.audio.paused);
    expect(after.audio.contextState).toBe(before.audio.contextState);
    await page.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'F1',
          repeat: true,
          cancelable: true,
        }),
      ),
    );
    await expect(app).toHaveAttribute('data-clean-gameplay', 'true');
    await page.keyboard.press('F1');
    await expect(hud).toBeVisible();
    await capture(level, 'restored');

    if (level === 1) {
      await page.keyboard.press('F2');
      await expect(page.locator('.test-panel')).toBeVisible();
      expect((await step(0)).input).toBe(false);
      await page.keyboard.press('F1');
      await assertCleanHud();
      await page.waitForFunction(
        () => (window as any).__cleanSession.runtime.input.pointerLocked,
      );
      expect((await step(0)).input).toBe(true);
      await page.keyboard.press('F1');
    }

    // A focused editable field is excluded, even if the event is retargeted.
    const prevented = await page.evaluate(() => {
      const input = document.createElement('textarea');
      document.querySelector('#app')!.append(input);
      input.focus();
      const event = new KeyboardEvent('keydown', {
        code: 'F1',
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
      input.remove();
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(app).not.toHaveAttribute('data-clean-gameplay');
    const editing = await page.evaluate(() => {
      const editor = document.createElement('div');
      editor.contentEditable = 'true';
      document.querySelector('#app')!.append(editor);
      editor.focus();
      const event = new KeyboardEvent('keydown', {
        code: 'F1',
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(event);
      editor.remove();
      return event.defaultPrevented;
    });
    expect(editing).toBe(false);
    await expect(app).not.toHaveAttribute('data-clean-gameplay');
    await page.locator('canvas').click();
    await page.keyboard.press('F1');
    const start = await step(0);
    await page.keyboard.down('KeyW');
    const moved = await step(5);
    await page.keyboard.up('KeyW');
    await step(1);
    expect(moved.position).not.toEqual(start.position);
    expect(moved.input).toBe(true);
    const active = (await step(0)).active;
    await page.keyboard.press('Tab');
    const switched = await step(1);
    expect(switched.active).not.toBe(active);
    await draw();
    await assertCleanHud();
    await page.keyboard.press('F2');
    await step(1);
    expect((await step(0)).input).toBe(true);

    // Aiming remains visible while the rest of the HUD stays hidden.
    for (let i = 0; i < 3 && (await step(0)).active !== 'goop'; i++) {
      await page.keyboard.press('Tab');
      await step(1);
    }
    expect((await step(0)).active).toBe('goop');
    await page.mouse.down({ button: 'right' });
    await step(1);
    await draw();
    const shots = await page.evaluate(
      () =>
        (
          window as any
        ).__cleanSession.runtime.resources.acidProjectileSystem.getDiagnostics()
          .firedCount,
    );
    await page.mouse.down({ button: 'left' });
    await step(1);
    await draw();
    await page.mouse.up({ button: 'left' });
    expect(
      await page.evaluate(
        () =>
          (
            window as any
          ).__cleanSession.runtime.resources.acidProjectileSystem.getDiagnostics()
            .firedCount,
      ),
    ).toBe(shots + 1);
    await assertCleanHud();
    await page.keyboard.press('F1');
    await expect(hud).toBeVisible();
    await expect(app).not.toHaveAttribute('data-clean-gameplay');
    await expect(page.locator('.goop-aim-crosshair')).toBeVisible();
    await page.keyboard.press('F1');
    await expect(app).toHaveAttribute('data-clean-gameplay', 'true');
    await expect(page.locator('.goop-aim-crosshair')).toBeVisible();
    await assertCleanHud();
    if (level === 1) await capture(level, 'goop-aim-clean');
    await page.mouse.up({ button: 'right' });
    await step(1);
    await draw();
    await expect(page.locator('.goop-aim-crosshair')).toBeHidden();

    if (level === 3) {
      for (let i = 0; i < 3 && (await step(0)).active !== 'volt'; i++) {
        await page.keyboard.press('Tab');
        await step(1);
      }
      expect((await step(0)).active).toBe('volt');
      await page.mouse.down({ button: 'right' });
      await step(1);
      await draw();
      expect(
        await page.evaluate(
          () =>
            (window as any).__cleanSession.runtime.voltElectricalReadModel
              .aimActive,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () =>
            (
              window as any
            ).__cleanSession.runtime.renderLayer.scene.getObjectByName(
              'volt-conducting-target-highlights',
            ).visible,
        ),
      ).toBe(true);
      await assertCleanHud();
      await page.keyboard.press('F1');
      await expect(hud).toBeVisible();
      await expect(app).not.toHaveAttribute('data-clean-gameplay');
      await expect(page.locator('.volt-electrical-crosshair')).toBeVisible();
      await page.keyboard.press('F1');
      await expect(app).toHaveAttribute('data-clean-gameplay', 'true');
      await expect(page.locator('.volt-electrical-crosshair')).toBeVisible();
      await assertCleanHud();
      await capture(level, 'volt-aim-clean');
      await page.mouse.up({ button: 'right' });
      await step(1);
      await draw();
      await expect(page.locator('.volt-electrical-crosshair')).toBeHidden();
      expect(
        await page.evaluate(
          () =>
            (
              window as any
            ).__cleanSession.runtime.renderLayer.scene.getObjectByName(
              'volt-conducting-target-highlights',
            ).visible,
        ),
      ).toBe(false);

      // Exercise the real merged-form controller and charge overlay as well.
      expect(
        await page.evaluate(() =>
          (window as any).__cleanSession.runtime.beginMerge(),
        ),
      ).toBe(true);
      await step(360);
      expect(
        await page.evaluate(
          () =>
            (window as any).__cleanSession.runtime.specimenFormReadModel
              .controlledForm,
        ),
      ).toBe('specimen');
      await page.mouse.down({ button: 'right' });
      await page.mouse.down({ button: 'left' });
      await step(1);
      await draw();
      await expect(page.locator('.specimen-combat-crosshair')).toBeVisible();
      await expect(page.locator('.specimen-combat-charge')).toBeVisible();
      await assertCleanHud();
      await page.keyboard.press('F1');
      await expect(hud).toBeVisible();
      await expect(page.locator('.specimen-combat-crosshair')).toBeVisible();
      await page.keyboard.press('F1');
      await expect(app).toHaveAttribute('data-clean-gameplay', 'true');
      await expect(page.locator('.specimen-combat-crosshair')).toBeVisible();
      await expect(page.locator('.specimen-combat-charge')).toBeVisible();
      await assertCleanHud();
      await capture(level, 'specimen-aim-clean');
      await page.mouse.up({ button: 'left' });
      await page.mouse.up({ button: 'right' });
      await step(1);
      await draw();
      await expect(page.locator('.specimen-combat-crosshair')).toBeHidden();
      await expect(page.locator('.specimen-combat-charge')).toBeHidden();
    }

    // Dynamic overlays, inline damage effects and objective changes stay hidden.
    await page.evaluate(() => {
      const root = document.createElement('aside');
      root.id = 'clean-dynamic-probe';
      root.style.cssText =
        'display:grid;position:absolute;inset:0;background:red';
      root.textContent = 'Checkpoint / tutorial';
      document.querySelector('#app')!.append(root);
      (window as any).__cleanSession.events.emit('objectiveChanged', {
        roomId: 'test',
        objective: 'Current objective changed while clean',
      });
    });
    await assertCleanHud();
    await page.evaluate(() =>
      document.querySelector('#clean-dynamic-probe')!.remove(),
    );
    await page.keyboard.press('F1');
    await expect(page.locator('[data-current-objective]')).toHaveText(
      'Current objective changed while clean',
    );
    await page.keyboard.press('F1');
    await page.keyboard.press('KeyP');
    await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
    await expect(app).not.toHaveAttribute('data-clean-gameplay');
    await page
      .locator('[data-flow-panel="paused"] [data-action="resume"]')
      .click();
    await expect(app).toHaveAttribute('data-clean-gameplay', 'true');
    await draw();
    await assertCleanHud();
    await page.keyboard.press('KeyP');
    await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
    await page
      .locator('[data-flow-panel="paused"] [data-action="restart"]')
      .click();
    await expect(app).toHaveAttribute('data-clean-gameplay', 'true');
    await draw();
    await assertCleanHud();
    await page.keyboard.press('F1');
    await expect(hud).toBeVisible();
    await page.keyboard.press('F1');
    if (level < 3) {
      await page.keyboard.press('Digit0');
      await step(1);
      const enter = page.locator('[data-action="enter-level"]');
      await expect(enter).toBeVisible({ timeout: 180_000 });
      await expect(enter).toContainText(`Enter Level ${level + 1}`);
      await enter.click();
      await page.locator('canvas').click();
    }
  }
  expect(errors).toEqual([]);
});
