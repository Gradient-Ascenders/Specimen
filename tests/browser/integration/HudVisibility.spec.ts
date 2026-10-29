import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { DeathScreen } from '../../../src/ui/DeathScreen.ts';
import type { GameFlowUI } from '../../../src/ui/GameFlowUI.ts';
import type { SlimeDamageSystem } from '../../../src/systems/SlimeDamageSystem.ts';
import type { GameSettings } from '../../../src/ui/GameSettings.ts';
import { test, expect } from '../../helpers/BrowserFixtures.ts';

declare global {
  interface Window {
    __hudTest: { flow: GameFlowUI; death: DeathScreen; damage: SlimeDamageSystem; settings: GameSettings;
      healthState: { slimeId: 'bob' | 'goop' | 'volt'; eligible: boolean } };
  }
}

test('F1 hides guidance but preserves aiming overlays and menu/lifecycle ownership', async ({ page }, testInfo) => {
  // Exercise the actual UI and shared styles without paying for WebGL shader
  // preparation on every keyboard assertion. Only gameplay actions are stubbed.
  const fixtureId = fileURLToPath(new URL('../__hud-visibility-fixture.ts', import.meta.url));
  const result = await build({
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    configFile: false,
    logLevel: 'silent',
    plugins: [{
      name: 'hud-visibility-fixture',
      enforce: 'pre',
      resolveId: id => id === fixtureId ? `\0${fixtureId}` : undefined,
      load: id => id === `\0${fixtureId}` ? `
        export { GameFlowUI } from '/src/ui/GameFlowUI.ts';
        export { GameSettings } from '/src/ui/GameSettings.ts';
        export { DeathScreen } from '/src/ui/DeathScreen.ts';
        export { CleanGameplayMode } from '/src/ui/CleanGameplayMode.ts';
        export { SlimeDamageSystem } from '/src/systems/SlimeDamageSystem.ts';
        export { EMPTY_SLIME_HUD_SNAPSHOT } from '/src/slimes/SlimeHUDState.ts';
        import '/src/style.css';
        import '/src/ui/ui-theme.css';
      ` : undefined,
    }],
    build: { write: false, lib: { entry: fixtureId, formats: ['es'] } },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!bundle || !('output' in bundle)) throw new Error('HUD fixture did not build.');
  const script = bundle.output.find(item => item.type === 'chunk');
  const style = bundle.output.find(item => item.type === 'asset' && item.fileName.endsWith('.css'));
  if (!script || script.type !== 'chunk' || !style || style.type !== 'asset') {
    throw new Error('HUD fixture requires bundled JavaScript and shared CSS.');
  }
  await page.route('**/__hud-fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: script.code }));
  await page.route('**/__hud-fixture.css', route => route.fulfill({
    contentType: 'text/css',
    body: typeof style.source === 'string' ? style.source : Buffer.from(style.source),
  }));
  await page.route('**/__hud-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><link rel="stylesheet" href="./__hud-fixture.css"></head><body><main id="app"><canvas></canvas></main></body></html>',
  }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./__hud-fixture');
  await page.evaluate(async () => {
    const fixtureUrl = new URL('./__hud-fixture.js', location.href).href;
    const { GameFlowUI, GameSettings, DeathScreen, CleanGameplayMode, SlimeDamageSystem, EMPTY_SLIME_HUD_SNAPSHOT } = await import(fixtureUrl);
    let inputEnabled = false;
    const app = document.querySelector<HTMLElement>('#app')!;
    const damage = new SlimeDamageSystem({}, ['bob', 'goop', 'volt']);
    const healthState = { slimeId: 'bob', eligible: true };
    const settings = new GameSettings();
    const flow: GameFlowUI = new GameFlowUI({
      settings,
      creditsMarkdown: '',
      slimeHUD: {
        subscribeSlimeHUD: (listener: (snapshot: unknown) => void) => { listener(EMPTY_SLIME_HUD_SNAPSHOT); return () => {}; },
        getPlayerHealth: () => healthState.eligible ? damage.health.find((health: { slimeId: string }) => health.slimeId === healthState.slimeId) : undefined,
      },
      actions: {
        startGameplay: () => { inputEnabled = true; },
        stopGameplay: () => { inputEnabled = false; },
        setGameplayInputEnabled: (enabled: boolean) => { inputEnabled = enabled; },
        isGameplayInputEnabled: () => inputEnabled,
        isPointerLocked: () => false,
        setDebugInteractionEnabled: () => {},
        requestPointerLock: () => {},
        releasePointerLock: () => {},
        restartLevel: () => {},
        applySettings: () => {},
      },
    });
    flow.subscribe(state => { app.dataset.gameState = state; });
    app.querySelector('canvas')!.dataset.gameplayCanvas = 'true';
    new CleanGameplayMode({ host: app, flow, prepareGameplay: () => {}, present: () => {} });
    flow.setObjective('Test objective');
    app.append(flow.element);
    const death = new DeathScreen({ onRetry: () => {}, backgroundElements: [] });
    app.append(death.element);
    Object.assign(window, { __hudTest: { flow, death, damage, healthState, settings } });
    flow.completeBoot();
  });
  const flow = page.locator('.game-flow');
  const app = page.locator('#app');
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible();
  await expect(app).not.toHaveAttribute('data-clean-gameplay');
  await page.keyboard.press('F1');
  await expect(title).toBeVisible();
  await page.keyboard.press('F1');

  await title.locator('[data-action="start"]').click();
  await expect(flow).toHaveAttribute('data-state', 'playing');
  const hud = page.locator('.game-hud');
  await expect(hud).toBeVisible();
  await expect(page.locator('[data-current-objective]')).toBeVisible();
  await expect(page.locator('.hud-roster')).toBeVisible();
  // Revealing the roster must not filter the continuously changing WebGL
  // canvas for its five-second hold after a character switch.
  const rosterContent = page.locator('.hud-roster-content');
  await expect(rosterContent).toHaveCSS('backdrop-filter', 'none');
  // The isolated fixture has no gameplay input controller to consume native
  // Tab navigation; dispatch the switch event without moving browser focus.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', bubbles: true })));
  await expect(rosterContent).toBeVisible();
  await expect(rosterContent).toHaveCSS('backdrop-filter', 'none');
  await expect(page.locator('.hud-hint')).toBeVisible();
  await page.evaluate(() => {
    const { settings, flow } = window.__hudTest;
    settings.setShowFPS(true);
    flow.updateFrame(1.2);
  });
  await expect(page.locator('[data-fps-counter]')).toHaveText('1 FPS');
  await page.evaluate(() => window.__hudTest.flow.updateFrame(3));
  await expect(page.locator('[data-fps-counter]')).toHaveText('0 FPS');
  await page.evaluate(() => window.__hudTest.settings.setShowFPS(false));
  await page.screenshot({ path: testInfo.outputPath('hud-visible.png') });

  // Normal health comes from the actual damage/regeneration system. UI time
  // advances only through the existing game loop, including the full-health hold.
  const health = page.locator('.player-health-hud');
  await page.evaluate(() => window.__hudTest.flow.updateFrame(0));
  await expect(health).toBeHidden();
  const idleHealthMutations = await page.evaluate(async () => {
    let mutations = 0;
    const observer = new MutationObserver(records => { mutations += records.length; });
    observer.observe(document.querySelector('.player-health-hud')!, {attributes:true,childList:true,subtree:true,characterData:true});
    for(let frame=0;frame<120;frame++)window.__hudTest.flow.updateFrame(1/60);
    await Promise.resolve();observer.disconnect();return mutations;
  });
  expect(idleHealthMutations).toBe(0);
  await page.evaluate(() => { const { damage, flow } = window.__hudTest; damage.applyDamage('bob', 20); flow.updateFrame(0); });
  await expect(health).toBeVisible();
  await expect(health.getByRole('progressbar')).toHaveJSProperty('value', 80);
  const animatedHealing = await page.evaluate(() => {
    const { damage, flow } = window.__hudTest; damage.update(3); flow.updateFrame(.1);
    return document.querySelector('.player-health-fill')!.getAnimations().length > 0;
  });
  expect(animatedHealing).toBe(true);
  await expect(health.locator('.final-boss-player-status')).toHaveText('Healing');
  await expect.poll(() => health.evaluate(el => el.getAnimations().length)).toBe(0);
  const normalPosition = await health.evaluate(el => ({ left: el.getBoundingClientRect().left, bottom: el.getBoundingClientRect().bottom,
    controlsTop: document.querySelector('.hud-hint')!.getBoundingClientRect().top }));
  expect(normalPosition.left).toBeGreaterThanOrEqual(12);
  expect(normalPosition.bottom).toBeLessThan(normalPosition.controlsTop);
  await page.screenshot({ path: testInfo.outputPath('health-healing.png') });
  await page.evaluate(() => { const { damage, flow } = window.__hudTest; damage.update(1); flow.updateFrame(0); flow.updateFrame(.99); });
  await expect(health).toBeVisible();
  await expect(health.locator('.final-boss-player-value')).toHaveText('100');
  await page.keyboard.press('KeyP');
  await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
  await page.evaluate(() => window.__hudTest.flow.updateFrame(5));
  await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
  await expect(health).toBeVisible();
  await page.evaluate(() => window.__hudTest.flow.updateFrame(.02));
  await expect(health).toHaveAttribute('data-state', 'leaving');
  await expect(health).toBeHidden();

  // Damage during the exit must reverse it; a stale completion cannot hide
  // a freshly wounded player. A healthy newly selected slime has no bar.
  await page.evaluate(() => {
    const { damage, flow } = window.__hudTest;
    damage.applyDamage('bob', 10); flow.updateFrame(0); damage.update(5); flow.updateFrame(0); flow.updateFrame(1.01);
    damage.applyDamage('bob', 10); flow.updateFrame(0);
  });
  await expect(health).toHaveAttribute('data-state', 'visible');
  await expect.poll(() => health.evaluate(el => el.getAnimations().length)).toBe(0);
  await expect(health).toBeVisible();
  await expect(health.locator('.final-boss-player-value')).toHaveText('90');
  await page.evaluate(() => { window.__hudTest.healthState.slimeId = 'goop'; window.__hudTest.flow.updateFrame(0); });
  await expect(health).toBeHidden();
  await page.evaluate(() => { window.__hudTest.healthState.slimeId = 'bob'; window.__hudTest.flow.updateFrame(0); });
  await expect(health).toBeVisible();
  await page.evaluate(() => { window.__hudTest.healthState.eligible = false; window.__hudTest.flow.updateFrame(0); });
  await expect(health).toBeHidden();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    const { damage, flow, healthState } = window.__hudTest;
    damage.reset(); healthState.eligible = true; damage.applyDamage('volt', 20); healthState.slimeId = 'volt'; flow.updateFrame(0);
  });
  await expect(health).toBeVisible();
  expect(await health.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.evaluate(() => { const { damage, flow } = window.__hudTest; damage.update(5); flow.updateFrame(0); flow.updateFrame(.99); });
  await expect(health).toBeVisible();
  await page.evaluate(() => window.__hudTest.flow.updateFrame(.02));
  await expect(health).toBeHidden();
  await page.evaluate(() => { window.__hudTest.healthState.eligible = false; window.__hudTest.flow.updateFrame(0); });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.keyboard.press('F1');
  await expect(app).toHaveAttribute('data-clean-gameplay', 'true');
  await expect(hud).toBeHidden();
  await expect(flow).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#app')).toHaveAttribute('data-game-state', 'playing');
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('hud-hidden.png') });

  // A held F1 must neither flicker the HUD nor invoke browser Help.
  expect(await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', {
      code: 'F1', key: 'F1', repeat: true, bubbles: true, cancelable: true,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  await expect(app).toHaveAttribute('data-clean-gameplay', 'true');
  await page.keyboard.press('Shift+F1');
  await expect(app).toHaveAttribute('data-clean-gameplay', 'true');

  // Level-owned overlays are appended later and can update their own display
  // while capture mode is active. Probe those classes without loading a level.
  const overlayClasses = [
    'test-panel', 'performance-recorder', 'security-network-status',
    'elevator-encounter-status', 'maintenance-drone-hud',
  ];
  const aimClasses = [
    'volt-electrical-overlay', 'specimen-combat-overlay', 'goop-aim-crosshair',
  ];
  await page.evaluate(({ overlayClasses, aimClasses }) => {
    for (const className of [...overlayClasses, ...aimClasses]) {
      const overlay = document.createElement('div');
      overlay.className = className;
      if (aimClasses.includes(className)) {
        overlay.dataset.aimProbe = className;
        overlay.dataset.cleanGameplayAiming = 'true';
      }
      else overlay.dataset.hudProbe = className;
      overlay.textContent = 'HUD overlay';
      overlay.style.display = 'block';
      document.querySelector('#app')!.append(overlay);
    }
  }, { overlayClasses, aimClasses });
  const probes = page.locator('[data-hud-probe]');
  const aimProbes = page.locator('[data-aim-probe]');
  await expect(probes).toHaveCount(overlayClasses.length);
  await expect(aimProbes).toHaveCount(aimClasses.length);
  for (const probe of await probes.all()) await expect(probe).toBeHidden();
  for (const probe of await aimProbes.all()) await expect(probe).toBeVisible();

  await page.keyboard.press('KeyP');
  const pause = page.locator('[data-flow-panel="paused"]');
  await expect(pause).toBeVisible();
  await expect(pause.locator('[data-action="resume"]')).toBeVisible();
  await pause.locator('[data-action="resume"]').click();
  await expect(flow).toHaveAttribute('data-state', 'playing');
  await expect(hud).toBeHidden();

  // An overlay hidden by its own runtime must stay hidden after restoring HUD.
  await probes.first().evaluate(overlay => { (overlay as HTMLElement).hidden = true; });
  await aimProbes.first().evaluate(overlay => { (overlay as HTMLElement).hidden = true; });
  await page.keyboard.press('F1');
  await expect(app).not.toHaveAttribute('data-clean-gameplay');
  await expect(hud).toBeVisible();
  await expect(probes.first()).toBeHidden();
  for (const probe of (await probes.all()).slice(1)) await expect(probe).toBeVisible();
  await expect(aimProbes.first()).toBeHidden();
  for (const probe of (await aimProbes.all()).slice(1)) await expect(probe).toBeVisible();
  await probes.evaluateAll(overlays => overlays.forEach(overlay => overlay.remove()));
  await aimProbes.evaluateAll(overlays => overlays.forEach(overlay => overlay.remove()));

  await page.keyboard.press('F1');
  await page.keyboard.press('KeyP');
  await pause.locator('[data-action="restart"]').click();
  await expect(flow).toHaveAttribute('data-state', 'playing');
  await expect(hud).toBeHidden();

  await page.evaluate(() => window.__hudTest.death.show());
  await expect(page.locator('.death-screen')).toBeVisible();
  await page.evaluate(() => window.__hudTest.death.hide());

  await page.evaluate(() => window.__hudTest.flow.beginLevelTransition('Entering next level'));
  await expect(page.locator('[data-flow-panel="transitioning"]')).toBeVisible();
  await expect(app).not.toHaveAttribute('data-clean-gameplay');
  await page.evaluate(() => window.__hudTest.flow.finishLevelTransition());
  await page.locator('[data-action="enter-level"]').click();
  await expect(flow).toHaveAttribute('data-state', 'playing');
  await expect(hud).toBeHidden();
  await page.keyboard.press('F1');
  await expect(hud).toBeVisible();
  expect(errors).toEqual([]);
});
