import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { build } from 'vite';
import { expect, test } from './fixtures.ts';
import type { FinalBossHud } from '../../src/boss/FinalBossHud.ts';
import type { FinalBossController } from '../../src/boss/FinalBossController.ts';
import type { SpecimenCombatPresentation } from '../../src/render/specimen/SpecimenCombatPresentation.ts';
import type { HudPanelPresentation } from '../../src/ui/HudPanelPresentation.ts';
import type { HudFooterLayout } from '../../src/ui/HudFooterLayout.ts';

declare global {
  interface Window {
    __bossHudUi: { hud: FinalBossHud; controller: FinalBossController; combat: SpecimenCombatPresentation;
      controls: HudPanelPresentation;
      footer: HudFooterLayout;
      model: { fireEnabled: boolean; charging: boolean; fullyCharged: boolean; chargeAmount: number; overchargeProgress: number; overchargeReady: boolean };
      sync: () => void };
  }
}

test('boss HUD presents controller states, readable compact layouts and bounded motion', async ({ page }) => {
  // Use the actual UI, controller, styles and Motion without recompiling the
  // whole level's physical WebGL materials on every viewport resize.
  const fixtureId = fileURLToPath(new URL('./__boss-hud-fixture.ts', import.meta.url));
  const result = await build({
    root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'true' },
    plugins: [{ name: 'boss-hud-fixture', enforce: 'pre',
      resolveId: id => id === fixtureId ? `\0${fixtureId}` : undefined,
      load: id => id === `\0${fixtureId}` ? `
        export { FinalBossHud } from '/src/boss/FinalBossHud.ts';
        export { FinalBossController } from '/src/boss/FinalBossController.ts';
        export { SpecimenCombatPresentation } from '/src/render/specimen/SpecimenCombatPresentation.ts';
        export { SpecimenDash } from '/src/combat/SpecimenDash.ts';
        export { HudPanelPresentation } from '/src/ui/HudPanelPresentation.ts';
        export { HudFooterLayout } from '/src/ui/HudFooterLayout.ts';
        export { Scene } from 'three';
        import '@fontsource/michroma/400.css';
        import '@fontsource-variable/space-grotesk';
        import '/src/style.css';
        import '/src/ui/ui-theme.css';
        import '/src/debug/performance-recorder.css';
      ` : undefined }],
    build: { write: false, lib: { entry: fixtureId, formats: ['es'] } },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!bundle || !('output' in bundle)) throw new Error('HUD fixture did not build');
  const script = bundle.output.find(item => item.type === 'chunk');
  const style = bundle.output.find(item => item.type === 'asset' && item.fileName.endsWith('.css'));
  if (!script || script.type !== 'chunk' || !style || style.type !== 'asset') throw new Error('HUD fixture requires JS and CSS');
  await page.route('**/__boss-hud.js', route => route.fulfill({ contentType: 'text/javascript', body: script.code }));
  await page.route('**/__boss-hud.css', route => route.fulfill({ contentType: 'text/css', body: typeof style.source === 'string' ? style.source : Buffer.from(style.source) }));
  await page.route('**/__boss-hud', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><link rel="stylesheet" href="./__boss-hud.css"></head><body>
    <main id="app" data-boss-encounter="true"><div class="game-flow" data-state="playing"><aside class="game-hud">
      <div class="hud-controls" data-collapsed="false"><p class="hud-hint">
        <span><kbd data-control-hint="movement">WASD</kbd> Move</span><span><kbd>Space</kbd> Jump</span>
        <span><kbd data-control-hint="switchSlime">Tab</kbd> Switch</span><span><kbd>V</kbd> View</span><span><kbd>P</kbd> Pause</span>
      </p><div class="hud-controls-summary">Controls <kbd>H</kbd></div></div></aside></div>
      <div class="performance-recorder"><details class="recorder-panel"><summary>Performance</summary></details></div>
    </main></body></html>` }));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/__boss-hud');
  await page.evaluate(async () => {
    const { FinalBossHud, FinalBossController, SpecimenCombatPresentation, SpecimenDash, HudPanelPresentation, HudFooterLayout, Scene } = await import(new URL('./__boss-hud.js', location.href).href);
    const app = document.querySelector<HTMLElement>('#app')!;
    const controller = new FinalBossController({ random: () => .7 });
    const hud = new FinalBossHud(document, { host: app,
      onSkip: () => { controller.skipCinematic({ x: 0, y: 0, z: 0 }); sync(); },
      onToggleInvincibility: () => { controller.toggleDevInvincibility(); sync(); },
    });
    app.append(hud.element);
    const model = { fireEnabled: true, charging: true, chargeAmount: .5, fullyCharged: false, overchargeProgress: .5, overchargeReady: false };
    const combat = new SpecimenCombatPresentation({ scene: new Scene(), host: app, source: { readModel: model, projectileStates: [] }, dash: new SpecimenDash() });
    const controls = new HudPanelPresentation(app.querySelector('.hud-controls')!, app.querySelector('.hud-hint')!, app.querySelector('.hud-controls-summary')!, window, 'Y');
    const footer = new HudFooterLayout(app, app.querySelector('.hud-controls')!);
    const sync = () => { hud.update(controller.readModel, 0, controller.devInvincible); combat.update(controller.readModel.state === 'combat'); };
    Object.assign(window, { __bossHudUi: { hud, controller, model, combat, controls, footer, sync } });
    controller.start(true); sync();
    await document.fonts.ready;
  });
  const hud = page.locator('.final-boss-hud');
  const danger = hud.locator('.final-boss-danger');
  const evidence = 'artifacts/evidence/boss-hud'; await mkdir(evidence, { recursive: true });
  await expect(hud.getByRole('progressbar', { name: 'Exterminator health', exact: true })).toHaveJSProperty('value', 200);
  await expect(hud.locator('.final-boss-phase')).toHaveText('Phase 1');
  await expect(page.locator('.specimen-charge-display')).toBeVisible();
  await expect(page.locator('.specimen-dash-label')).toContainText('Ready');
  await expect(page.locator('.hud-hint > span:has([data-control-hint="switchSlime"])')).toBeHidden();
  await expect.poll(() => hud.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.evaluate(() => { for (let i = 0; i < 30; i++) window.__bossHudUi.sync(); });
  expect(await hud.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);

  expect(await danger.evaluate(el => Number(getComputedStyle(el, '::before').opacity))).toBe(0);
  expect(await danger.evaluate(el => Number(getComputedStyle(el, '::after').opacity))).toBe(0);
  await page.evaluate(() => {
    const { controller, sync } = window.__bossHudUi;
    controller.damagePlayer(5, -901); sync();
  });
  await expect(danger).toHaveAttribute('data-low', 'false');
  expect(await danger.evaluate(el => Number(getComputedStyle(el, '::after').opacity))).toBeGreaterThan(0);
  await page.screenshot({ path: `${evidence}/damage-ui.png` });
  const blockedDuringGrace = await page.evaluate(() => {
    const { controller, sync } = window.__bossHudUi;
    controller.update(.35, { x: 0, y: 0, z: 0 }); sync();
    const blocked = !controller.damagePlayer(5, -902); sync();
    return blocked && controller.readModel.invulnerability > 0;
  });
  expect(blockedDuringGrace).toBe(true);
  expect(await danger.evaluate(el => Number(getComputedStyle(el, '::after').opacity))).toBe(0);
  await page.evaluate(() => {
    const { controller, sync } = window.__bossHudUi;
    controller.update(.2, { x: 0, y: 0, z: 0 }); controller.healPlayer(1); sync();
  });

  const devToggle = page.locator('.hud-controls').getByRole('button', { name: 'Dev invincibility' });
  const badge = hud.locator('.final-boss-invincible');
  await expect(badge).toBeHidden();
  await devToggle.click();
  await expect(devToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(badge).toBeVisible();
  expect(await page.evaluate(() => {
    const { controller, sync } = window.__bossHudUi;
    const accepted = controller.damagePlayer(5, -903); sync(); return accepted;
  })).toBe(false);
  expect(await danger.evaluate(el => Number(getComputedStyle(el, '::after').opacity))).toBe(0);
  await page.evaluate(() => window.__bossHudUi.controls.setVisibilityMode('minimal'));
  await expect(devToggle).toBeHidden();
  await expect(badge).toBeVisible();
  await page.evaluate(() => window.__bossHudUi.controls.reveal());
  await expect(devToggle).toBeVisible();
  await devToggle.click();
  await expect(devToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(badge).toBeHidden();

  await page.evaluate(() => {
    const { controller, sync, model } = window.__bossHudUi;
    controller.damagePlayer(75, 1);
    controller.applyImpact({ projectileId: 1, targetId: 'core', kind: 'direct', chargeAmount: 1, fullyCharged: true, damageUnits: 40, point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } });
    controller.update(1.35, { x: 0, y: 0, z: 0 });
    model.overchargeReady = true; model.overchargeProgress = 1; sync();
  });
  await expect(hud).toHaveAttribute('data-shield', 'true');
  await expect(hud.locator('.final-boss-attack-title')).toHaveText('Shielded');
  await expect(hud.locator('.final-boss-attack-detail')).toContainText('left');
  await expect(hud.locator('.final-boss-player-status')).toHaveText('Low');
  await expect(page.locator('.specimen-overcharge-label')).toContainText('Ready');
  await expect(danger).toHaveAttribute('data-low', 'true');
  expect(await danger.evaluate(el => Number(getComputedStyle(el, '::before').opacity))).toBeGreaterThan(0);
  await devToggle.click();
  await expect(badge).toBeVisible();
  await page.screenshot({ path: `${evidence}/shield-ui.png` });

  for (const viewport of [{ width: 1280, height: 800 }, { width: 640, height: 360 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    // Allow ResizeObserver to apply the footer's actual wrapped height.
    await expect.poll(() => page.evaluate(() => {
      const controls = document.querySelector<HTMLElement>('.hud-hint')!;
      return document.querySelector<HTMLElement>('#app')!.style.getPropertyValue('--boss-controls-height') === `${controls.offsetHeight}px`;
    })).toBe(true);
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
      return { panels: ['.final-boss-status', '.final-boss-message', '.final-boss-player', '.specimen-abilities'].map(rect),
        player: rect('.final-boss-player'), abilities: rect('.specimen-abilities'), controls: rect('.hud-hint'), performance: rect('.performance-recorder'), badge: rect('.final-boss-invincible'),
        reticle: rect('.specimen-combat-crosshair'), charge: rect('.specimen-charge-display'), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    await page.screenshot({ path: `${evidence}/${viewport.width}.png` });
    expect(layout.overflow).toBe(false);
    for (const r of layout.panels) { expect(r.left).toBeGreaterThanOrEqual(0); expect(r.right).toBeLessThanOrEqual(viewport.width); expect(r.bottom).toBeLessThanOrEqual(viewport.height); }
    expect(layout.player.right).toBeLessThan(layout.abilities.left);
    expect(Math.abs(layout.player.left - layout.performance.left)).toBeLessThan(1);
    expect(Math.abs(layout.abilities.right - layout.controls.right), `right edge at ${viewport.width}px`).toBeLessThan(1);
    expect(Math.abs(layout.player.bottom - layout.abilities.bottom)).toBeLessThan(1);
    expect(layout.player.bottom).toBeLessThan(layout.controls.top);
    expect(layout.badge.bottom).toBeLessThan(layout.player.top);
    if (viewport.width > 800) expect(Math.abs(layout.performance.bottom - layout.controls.bottom)).toBeLessThan(1);
    else expect(layout.controls.bottom).toBeLessThan(layout.performance.top);
    for (const aim of [layout.reticle, layout.charge]) for (const panel of layout.panels) {
      expect(aim.right <= panel.left || aim.left >= panel.right || aim.bottom <= panel.top || aim.top >= panel.bottom).toBe(true);
    }
  }
  await page.evaluate(() => { const { controller, sync } = window.__bossHudUi; controller.healPlayer(1); sync(); });
  await expect(danger).toHaveAttribute('data-low', 'false');
  await expect.poll(() => danger.evaluate(el => Number(getComputedStyle(el, '::before').opacity))).toBe(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    const { controller, sync } = window.__bossHudUi;
    controller.reset(); controller.startPhaseTwo({ x: 0, y: 0, z: 0 }); sync();
  });
  await expect(hud.locator('.final-boss-phase')).toHaveText('Phase 2');
  expect(await hud.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.evaluate(() => { const { controller, sync } = window.__bossHudUi; controller.damagePlayer(75, -904); sync(); });
  await expect(danger).toHaveAttribute('data-low', 'true');
  expect(await danger.evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('none');
  expect(await danger.evaluate(el => Number(getComputedStyle(el, '::before').opacity))).toBeGreaterThan(0);
  await page.evaluate(() => { const { controller, sync } = window.__bossHudUi; controller.healPlayer(1); sync(); });
  expect(await danger.evaluate(el => Number(getComputedStyle(el, '::before').opacity))).toBe(0);
  await page.screenshot({ path: `${evidence}/phase-two-ui.png` });
  await page.locator('#app').evaluate(el => { (el as HTMLElement).dataset.cleanGameplay = 'true'; });
  await expect(hud).toBeHidden(); await expect(page.locator('.specimen-abilities')).toBeHidden();
  await expect(page.locator('.specimen-combat-crosshair')).toBeVisible();
  await page.locator('#app').evaluate(el => { delete (el as HTMLElement).dataset.cleanGameplay; });
  await page.evaluate(() => { const { controller, sync } = window.__bossHudUi; controller.reset(); controller.start(); sync(); });
  await expect(hud.locator('.final-boss-cinematic')).toBeVisible();
  await expect(hud.locator('.final-boss-status')).toBeHidden();
  await expect(hud.locator('.final-boss-player')).toBeHidden();
  await expect(danger).toBeHidden();
  await expect(page.locator('.specimen-combat-overlay')).toBeHidden();
  await page.screenshot({ path: `${evidence}/cinematic-ui.png` });
  await hud.getByRole('button', { name: 'Skip cinematic' }).click();
  await expect(hud).toHaveAttribute('data-state', 'combat');
  await page.evaluate(() => { const { controller, sync } = window.__bossHudUi; controller.suspend(); sync(); });
  await expect(hud).toBeHidden();
  await expect(devToggle).toBeHidden();
  expect(await hud.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.evaluate(() => { window.__bossHudUi.hud.dispose(); window.__bossHudUi.combat.dispose(); window.__bossHudUi.controls.dispose(); window.__bossHudUi.footer.dispose(); });
  await expect(hud).toHaveCount(0);
  await expect(page.locator('.final-boss-dev-invincibility')).toHaveCount(0);
  expect(await page.locator('#app').evaluate(el => (el as HTMLElement).style.getPropertyValue('--boss-controls-height'))).toBe('');
  expect(errors).toEqual([]);
});
