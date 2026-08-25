import creditsMarkdown from '../CREDITS.md?raw';

import { Input } from './core/Input.ts';
import { Loop } from './core/Loop.ts';
import { GameSessionCoordinator } from './levels/GameSessionCoordinator.ts';
import { GreyboxLevelRuntime } from './levels/GreyboxLevelRuntime.ts';
import { DEFAULT_CAMERA_RIG_CONFIG } from './render/CameraRig.ts';
import { RenderLayer } from './render/RenderLayer.ts';
import { GameFlowLifecycleCoordinator } from './ui/GameFlowLifecycleCoordinator.ts';
import { GameFlowUI } from './ui/GameFlowUI.ts';
import { GameSettings } from './ui/GameSettings.ts';
import '@fontsource/michroma/400.css';
import '@fontsource-variable/space-grotesk';
import './style.css';
import './ui/ui-theme.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app host element.');
}

const settings = new GameSettings();
const renderLayer = new RenderLayer({
  host: app,
  pixelRatioCap: settings.value.renderPixelRatioCap,
});
const input = new Input({ pointerLockElement: renderLayer.canvas });
const debugAvailable =
  import.meta.env.DEV ||
  new URLSearchParams(window.location.search).get('debug') === '1';
const levelOneRuntime = new GreyboxLevelRuntime({
  host: app,
  input,
  renderLayer,
  debugAvailable,
});
const gameSession = new GameSessionCoordinator({
  initialRuntime: levelOneRuntime,
  createLevelTwo: async (progression) => {
    const [runtimeModule, debugModule] = await Promise.all([
      import('./levels/CultivationLevelRuntime.ts'),
      debugAvailable
        ? import('./debug/CultivationLevelDebug.ts')
        : Promise.resolve(undefined),
    ]);
    return new runtimeModule.CultivationLevelRuntime({
      host: app,
      input,
      renderLayer,
      progression,
      debugAvailable,
      debugSupport: debugModule?.CULTIVATION_LEVEL_DEBUG_SUPPORT,
    });
  },
  scheduleTransition: (transition) => {
    requestAnimationFrame(() => transition());
  },
});
const lifecycleCoordinator = new GameFlowLifecycleCoordinator(gameSession);
const gameFlow = new GameFlowUI({
  settings,
  creditsMarkdown,
  slimeHUD: gameSession,
  actions: {
    startGameplay: () => lifecycleCoordinator.startGameplay(),
    stopGameplay: () => lifecycleCoordinator.stopGameplay(),
    setGameplayInputEnabled: (enabled) => input.setEnabled(enabled),
    setDebugInteractionEnabled: (enabled) =>
      gameSession.setDebugInteractionEnabled(enabled),
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
      renderLayer.setPixelRatioCap(nextSettings.renderPixelRatioCap);
    },
  },
});
const unsubscribeObjectiveChanged = gameSession.events.on(
  'objectiveChanged',
  ({ objective }) => gameFlow.setObjective(objective),
);
const unsubscribeTransitionStarted = gameSession.events.on(
  'transitionStarted',
  ({ message }) => gameFlow.beginLevelTransition(message),
);
const unsubscribeTransitionCompleted = gameSession.events.on(
  'transitionCompleted',
  () => gameFlow.finishLevelTransition(),
);
const unsubscribeTransitionFailed = gameSession.events.on(
  'transitionFailed',
  ({ message }) => gameFlow.failLevelTransition(message),
);

app.replaceChildren(renderLayer.canvas, gameFlow.element);
gameSession.load();

const loop = new Loop({
  fixedUpdate: (deltaSeconds) => gameSession.fixedUpdate(deltaSeconds),
  render: (interpolationAlpha, stats) =>
    gameSession.render(interpolationAlpha, stats),
});

let bootFrame = 0;
let shuttingDown = false;
let performanceRecorder:
  | import('./debug/PerformanceFlightRecorder.ts').PerformanceFlightRecorder
  | undefined;
if (debugAvailable) {
  void Promise.all([
    import('./debug/PerformanceFlightRecorder.ts'),
    import('./debug/performance-recorder.css'),
  ]).then(
    ([{ PerformanceFlightRecorder }]) => {
      if (shuttingDown) return;
      const recorder = new PerformanceFlightRecorder({
        host: app,
        renderLayer,
        gameSession,
      });
      performanceRecorder = recorder;
      loop.setProfiler(recorder);
    },
    (error: unknown) => {
      if (!shuttingDown) {
        console.error('Performance flight recorder failed to load.', error);
      }
    },
  );
}
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
  void levelOneRuntime.prepareLightingPrograms().then(startRenderLoop, (error) => {
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
  unsubscribeTransitionStarted();
  unsubscribeTransitionCompleted();
  unsubscribeTransitionFailed();
  performanceRecorder?.dispose();
  gameFlow.dispose();
  gameSession.dispose();
  input.dispose();
  renderLayer.dispose();
};

if (import.meta.hot) import.meta.hot.dispose(shutdown);
