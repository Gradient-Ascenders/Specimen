import '@fontsource/michroma/400.css';
import '@fontsource-variable/space-grotesk';
import '../../src/style.css';
import '../../src/ui/ui-theme.css';
import '../../src/ui/liquid-loading.css';
import '../../src/ui/interface-polish.css';
import creditsMarkdown from '../../CREDITS.md?raw';
import { GameFlowUI } from '../../src/ui/GameFlowUI.ts';
import { GameSettings } from '../../src/ui/GameSettings.ts';

// Exercise the real menu/settings owners without constructing a scene or renderer.
let inputEnabled = false;
const settings = new GameSettings();
const ui = new GameFlowUI({
  settings, creditsMarkdown,
  actions: {
    startGameplay() {}, stopGameplay() {}, restartLevel() {}, applySettings() {},
    setGameplayInputEnabled(enabled) { inputEnabled = enabled; },
    setDebugInteractionEnabled() {}, requestPointerLock() {}, releasePointerLock() {},
    isPointerLocked: () => false, isGameplayInputEnabled: () => inputEnabled,
  },
});
document.querySelector('#app')!.append(ui.element);
ui.completeBoot();
let frame = 0, previous = performance.now();
const tick = (now: number) => {
  ui.updateFrame(Math.min((now - previous) / 1000, .1));
  previous = now;
  frame = requestAnimationFrame(tick);
};
frame = requestAnimationFrame(tick);
(window as any).__menuFixture = { ui, settings, dispose() { cancelAnimationFrame(frame); ui.dispose(); } };
