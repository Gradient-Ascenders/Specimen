import creditsMarkdown from '../CREDITS.md?raw';

import { Input } from './core/Input.ts';
import { Loop } from './core/Loop.ts';
import { GreyboxLevelRuntime } from './levels/GreyboxLevelRuntime.ts';
import { DEFAULT_CAMERA_RIG_CONFIG } from './render/CameraRig.ts';
import { RenderLayer } from './render/RenderLayer.ts';
import { GameFlowLifecycleCoordinator } from './ui/GameFlowLifecycleCoordinator.ts';
import { GameFlowUI } from './ui/GameFlowUI.ts';
import { GameSettings } from './ui/GameSettings.ts';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app host element.');
}

const renderLayer = new RenderLayer({ host: app });
const input = new Input({ pointerLockElement: renderLayer.canvas });
const levelRuntime = new GreyboxLevelRuntime({
  host: app,
  input,
  renderLayer,
  debugAvailable:
    import.meta.env.DEV ||
    new URLSearchParams(window.location.search).get('debug') === '1',
});
const settings = new GameSettings();
const lifecycleCoordinator = new GameFlowLifecycleCoordinator(levelRuntime);
const gameFlow = new GameFlowUI({
  settings,
  creditsMarkdown,
  slimeHUD: levelRuntime,
  actions: {
    startGameplay: () => lifecycleCoordinator.startGameplay(),
    stopGameplay: () => lifecycleCoordinator.stopGameplay(),
    setGameplayInputEnabled: (enabled) => input.setEnabled(enabled),
    setDebugInteractionEnabled: (enabled) =>
      levelRuntime.setDebugInteractionEnabled(enabled),
    requestPointerLock: () => input.requestPointerLock(),
    releasePointerLock: () => input.releasePointerLock(),
    isPointerLocked: () => input.pointerLocked,
    isGameplayInputEnabled: () => input.enabled,
    restartLevel: () => lifecycleCoordinator.restartLevel(),
    applySettings: (nextSettings) => {
      renderLayer.cameraRig.setLookSettings({
        horizontalSensitivityRadiansPerPixel:
          DEFAULT_CAMERA_RIG_CONFIG.horizontalSensitivityRadiansPerPixel *
          nextSettings.mouseSensitivity,
        verticalSensitivityRadiansPerPixel:
          DEFAULT_CAMERA_RIG_CONFIG.verticalSensitivityRadiansPerPixel *
          nextSettings.mouseSensitivity,
        invertVertical: nextSettings.invertVerticalLook,
      });
      renderLayer.cameraRig.setFollowDistanceMetres(
        nextSettings.cameraDistanceMetres,
      );
    },
  },
});
const unsubscribeObjectiveChanged = levelRuntime.events.on(
  'objectiveChanged',
  ({ objective }) => gameFlow.setObjective(objective),
);

app.replaceChildren(renderLayer.canvas, gameFlow.element);
levelRuntime.load();

const loop = new Loop({
  fixedUpdate: (deltaSeconds) => levelRuntime.fixedUpdate(deltaSeconds),
  render: (interpolationAlpha, stats) =>
    levelRuntime.render(interpolationAlpha, stats),
});

let bootFrame = 0;
let shuttingDown = false;
const startRenderLoop = (): void => {
  if (shuttingDown) return;
  renderLayer.setAnimationLoop((timestampMs) => loop.tick(timestampMs));
  // Present authoritative Room 1 frames before the loading UI yields control.
  bootFrame = requestAnimationFrame(() => {
    bootFrame = requestAnimationFrame(() => gameFlow.completeBoot());
  });
};

// Let the loading state paint once, then compile every Level 1 light signature
// before normal rendering or gameplay can begin.
bootFrame = requestAnimationFrame(() => {
  void levelRuntime.prepareLightingPrograms().then(startRenderLoop, (error) => {
    if (shuttingDown) return;
    console.error('Containment lighting prewarm failed.', error);
    startRenderLoop();
  });
});

const shutdown = (): void => {
  shuttingDown = true;
  cancelAnimationFrame(bootFrame);
  loop.dispose();
  unsubscribeObjectiveChanged();
  gameFlow.dispose();
  levelRuntime.dispose();
  input.dispose();
  renderLayer.dispose();
};

if (import.meta.hot) import.meta.hot.dispose(shutdown);
