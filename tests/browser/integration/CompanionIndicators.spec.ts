import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { test, expect } from '../../helpers/BrowserFixtures.ts';

test('companion activity stays readable after collapse, explains waits and respects motion/lifecycle settings', async ({page}, info) => {
  const entry = fileURLToPath(new URL('../__companion-ui-fixture.ts', import.meta.url));
  const result = await build({
    root: fileURLToPath(new URL('../../../', import.meta.url)), configFile: false, logLevel: 'silent',
    plugins: [{ name: 'companion-ui-fixture', enforce: 'pre',
      resolveId: id => id === entry ? `\0${entry}` : undefined,
      load: id => id === `\0${entry}` ? `
        export { GameFlowUI } from '/src/ui/GameFlowUI.ts';
        export { GameSettings } from '/src/ui/GameSettings.ts';
        export { CompanionIndicators } from '/src/ui/CompanionIndicators.ts';
        export { PerspectiveCamera, Vector3 } from 'three';
        import '/src/style.css'; import '/src/ui/ui-theme.css';
      ` : undefined }],
    build: {write: false, lib: {entry, formats: ['es']}},
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!bundle || !('output' in bundle)) throw new Error('Companion UI fixture did not build.');
  const script = bundle.output.find(item => item.type === 'chunk');
  const style = bundle.output.find(item => item.type === 'asset' && item.fileName.endsWith('.css'));
  if (!script || script.type !== 'chunk' || !style || style.type !== 'asset') throw new Error('Companion fixture assets missing.');
  await page.route('**/__companion-ui.js', route => route.fulfill({contentType: 'text/javascript', body: script.code}));
  await page.route('**/__companion-ui.css', route => route.fulfill({contentType: 'text/css',
    body: typeof style.source === 'string' ? style.source : Buffer.from(style.source)}));
  await page.route('**/__companion-ui', route => route.fulfill({contentType: 'text/html', body:
    '<!doctype html><html><head><link rel="stylesheet" href="./__companion-ui.css"></head><body><main id="app" style="background:linear-gradient(160deg,#203b45,#0b1420)"></main></body></html>'}));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto('./__companion-ui');
  await page.evaluate(async () => {
    const fixtureUrl = new URL('./__companion-ui.js', location.href).href;
    const {GameFlowUI, GameSettings, CompanionIndicators, PerspectiveCamera, Vector3} = await import(fixtureUrl);
    const app = document.querySelector<HTMLElement>('#app')!;
    const settings = new GameSettings();
    let input = false;
    let listener: (snapshot: any) => void = () => {};
    const snapshot = { roster: ['bob', 'goop', 'volt'].map(id => ({id, displayName: id[0].toUpperCase() + id.slice(1),
      betaPlayable: true, unlocked: true, registered: true, active: id === 'bob'})),
      activeSlimeId: 'bob', passiveInteractions: [], playerSwitchFeedback: undefined, resetSwitchFeedback: false };
    const flow = new GameFlowUI({settings, creditsMarkdown: '',
      slimeHUD: { subscribeSlimeHUD: (next: typeof listener) => {listener = next; next(snapshot); return () => {}; } },
      actions: { startGameplay: () => {input = true;}, stopGameplay: () => {input = false;},
        setGameplayInputEnabled: (enabled: boolean) => {input = enabled;}, isGameplayInputEnabled: () => input,
        isPointerLocked: () => false, setDebugInteractionEnabled: () => {}, requestPointerLock: () => {},
        releasePointerLock: () => {}, restartLevel: () => {}, applySettings: () => {} } });
    app.append(flow.element);
    flow.subscribe((state: string) => {app.dataset.gameState = state;});
    const markers = new CompanionIndicators(app);
    const camera = new PerspectiveCamera(60, innerWidth / innerHeight, .1, 200);
    camera.position.set(0, 2, 6); camera.lookAt(0, .6, 0); camera.updateMatrixWorld();
    const positions = {goop: new Vector3(-2, .5, -6), volt: new Vector3(25, .5, -6)};
    const present = () => {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      markers.update(camera, snapshot.passiveInteractions, flow.state === 'playing');
      markers.place('goop', positions.goop, camera); markers.place('volt', positions.volt, camera);
    };
    const publish = (entries: any[], active = snapshot.activeSlimeId) => {
      snapshot.activeSlimeId = active;
      for (const entry of snapshot.roster) entry.active = entry.id === active;
      snapshot.passiveInteractions = entries as never[]; listener({...snapshot}); present();
    };
    Object.assign(window, {__companionUI: {flow, settings, publish, markers, camera, positions, present}});
    flow.setObjective('Regroup at the exit'); flow.completeBoot();
  });
  await page.locator('[data-flow-panel="title"] [data-action="start"]').click();
  await page.evaluate(() => (window as any).__companionUI.publish([
    {slimeId: 'goop', kind: 'companion', state: 'catching-up', label: 'Catching up'},
    {slimeId: 'volt', kind: 'companion', state: 'waiting', reason: 'door', label: 'Waiting for door'},
  ]));
  const roster = page.locator('.hud-roster');
  await expect(roster.locator('[data-slime-id="goop"] .hud-slime-state')).toHaveText('Catching up');
  await expect(roster.locator('[data-slime-id="volt"] .hud-slime-control')).toContainText('Waiting for door');
  await expect(page.locator('.companion-marker[data-slime-id="goop"]')).toHaveAttribute('data-offscreen', 'false');
  await expect(page.locator('.companion-marker[data-slime-id="volt"]')).toHaveAttribute('data-offscreen', 'true');
  await expect(page.locator('.companion-indicators')).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('.companion-marker-name, .companion-marker-status')).toHaveCount(0);
  await expect(page.locator('.companion-marker[data-slime-id="goop"] .companion-locator-ring')).toHaveText('G');
  await expect(page.locator('.companion-marker[data-slime-id="volt"] .companion-locator-state [data-ui-icon="Pause"]')).toHaveCount(1);
  expect(await page.evaluate(() => {
    const panel = document.querySelector('.hud-roster-content')!.getBoundingClientRect();
    return Array.from(document.querySelectorAll('.companion-marker:not([hidden])')).some(element => {
      const r = element.getBoundingClientRect(); return r.right > panel.left && r.left < panel.right && r.bottom > panel.top && r.top < panel.bottom;
    });
  }), 'projected labels must not cover the expanded roster').toBe(false);
  await page.screenshot({path: info.outputPath('companions-expanded-1280.png')});
  await page.evaluate(() => {const {flow} = (window as any).__companionUI; for (let i = 0; i < 330; i++) flow.updateFrame(1/60);});
  await expect(roster).toHaveAttribute('data-collapsed', 'true');
  await expect(roster.locator('.hud-roster-content')).toBeHidden();
  await expect(roster.locator('.hud-companion-chip')).toHaveCount(2);
  await expect(roster.locator('.hud-companion-chip[data-slime-id="goop"]')).toBeVisible();
  await expect(roster.locator('.hud-companion-chip[data-slime-id="volt"]')).toContainText('Door closed');
  await expect(roster.locator('.hud-companion-chip[data-slime-id="volt"]')).toHaveAttribute('aria-label', 'Volt: Waiting for door');
  await expect(roster.locator('.companion-announcement')).toHaveText('Goop: Catching up. Volt: Waiting for door.');
  await expect(roster.locator('.hud-companion-chip').first()).toHaveCSS('backdrop-filter', 'none');
  await page.screenshot({path: info.outputPath('companions-compact-1280.png')});
  await page.setViewportSize({width: 640, height: 360});
  await page.evaluate(() => (window as any).__companionUI.present());
  await expect.poll(() => page.locator('.hud-companion-statuses').evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThan(340);
  await page.screenshot({path: info.outputPath('companions-compact-640.png')});
  expect(await page.evaluate(() => {
    const panel = document.querySelector('.hud-companion-statuses')!.getBoundingClientRect();
    return Array.from(document.querySelectorAll('.companion-marker:not([hidden])')).some(element => {
      const r = element.getBoundingClientRect(); return r.right > panel.left && r.left < panel.right && r.bottom > panel.top && r.top < panel.bottom;
    });
  }), 'compact badges and world markers need separate space at 640×360').toBe(false);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(roster.locator('.hud-companion-chip[data-slime-id="goop"] .companion-chip-icon')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.evaluate(() => (window as any).__companionUI.settings.setReduceMenuMotion(true));
  await expect(roster.locator('.hud-companion-chip[data-slime-id="goop"] .companion-chip-icon')).toHaveCSS('animation-name', 'none');
  await page.evaluate(() => {
    const ui = (window as any).__companionUI;
    ui.positions.volt.set(0, 1, 12); ui.present();
  });
  const behind = await page.locator('.companion-marker[data-slime-id="volt"]').evaluate(element => {
    const r = element.getBoundingClientRect(); return {x: r.x, y: r.y, right: r.right, bottom: r.bottom};
  });
  expect(behind.x).toBeGreaterThanOrEqual(0); expect(behind.right).toBeLessThanOrEqual(640);
  expect(behind.y).toBeGreaterThanOrEqual(0); expect(behind.bottom).toBeLessThanOrEqual(360);
  await page.evaluate(() => {
    const ui = (window as any).__companionUI;
    ui.publish([{slimeId: 'volt', kind: 'companion', state: 'holding', reason: 'power', label: 'Powering a connection'}], 'goop');
    for (let frame = 0; frame < 330; frame++) ui.flow.updateFrame(1/60);
  });
  const powering = roster.locator('.hud-companion-chip[data-slime-id="volt"]');
  await expect(powering).toBeVisible();
  await expect(powering).toHaveText('Powering');
  await expect(powering).toHaveAttribute('aria-label', 'Volt: Powering a connection');
  const chipBounds = await powering.boundingBox();
  expect(chipBounds!.width).toBeLessThan(135);
  expect(chipBounds!.height).toBeLessThanOrEqual(36);
  await page.screenshot({path: info.outputPath('compact-powering-640.png')});
  await page.keyboard.press('KeyP');
  await page.evaluate(() => (window as any).__companionUI.present());
  await expect(page.locator('.companion-indicators')).toBeHidden();
  await page.evaluate(() => (window as any).__companionUI.publish([]));
  await expect(roster.locator('.hud-companion-statuses')).toBeHidden();
  await page.evaluate(() => {const ui = (window as any).__companionUI; ui.markers.dispose(); ui.flow.dispose();});
  await expect(page.locator('.companion-indicators')).toHaveCount(0);
  expect(errors).toEqual([]);
});
