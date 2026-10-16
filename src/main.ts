import { AudioManager } from './audio/AudioManager.ts';
import { loadBlackoutMaintenanceMapData } from './render/environment/blackout/BlackoutMaintenanceMapData.ts';
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
import { TitleScreenPresentation } from './ui/TitleScreenPresentation.ts';
import '@fontsource/michroma/400.css';
import '@fontsource-variable/space-grotesk';
import './style.css';
import './ui/ui-theme.css';

const trailerShot = new URLSearchParams(window.location.search).get('trailer');
if (trailerShot === 'opening' || trailerShot === 'goop') {
  const host = document.querySelector<HTMLElement>('#app');
  if (!host) throw new Error('Missing #app host element.');
  if (trailerShot === 'goop') {
    void import('./trailer/GoopIntroTrailer.ts').then(({ startGoopIntroTrailer }) => {
      startGoopIntroTrailer(host);
    });
  } else {
    void import('./trailer/OpeningTrailer.ts').then(({ startOpeningTrailer }) => {
      startOpeningTrailer(host);
    });
  }
} else {
  startGame();
}

function startGame(): void {
  const app = document.querySelector<HTMLElement>('#app');

  if (!app) {
    throw new Error('Missing #app host element.');
  }

  const settings = new GameSettings();
  const audio = new AudioManager(import.meta.env.BASE_URL);
  void audio.preload();
  const unlockAudio = (): void => audio.unlock();
  const focusAudio = (): void => audio.setFocused(!document.hidden && document.hasFocus());
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('blur', focusAudio);
  window.addEventListener('focus', focusAudio);
  document.addEventListener('visibilitychange', focusAudio);
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
    audio,
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
        audio,
        input,
        renderLayer,
        progression,
        debugAvailable,
        debugSupport: debugModule?.CULTIVATION_LEVEL_DEBUG_SUPPORT,
      });
    },
    createLevelThree: async (progression) => {
      const [runtimeModule, maintenanceMaps] = await Promise.all([
        import('./levels/BlackoutLevelRuntime.ts'),
        loadBlackoutMaintenanceMapData(new URL('./assets/blackout/maintenance-maps.bin', import.meta.url)),
      ]);
      return new runtimeModule.BlackoutLevelRuntime({
        host: app,
        audio,
        input,
        renderLayer,
        progression,
        authoredRoomOne: true,
        maintenanceMaps,
      });
    },
    scheduleTransition: (transition) => {
      requestAnimationFrame(() => transition());
    },
  });
  const lifecycleCoordinator = new GameFlowLifecycleCoordinator(gameSession);
  let titlePresentation: TitleScreenPresentation | undefined;
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
        audio.setVolumes(nextSettings.masterVolume, nextSettings.soundEffectsVolume);
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
  let warmedLevelOneProgramBaseline: number | undefined;
  let levelOneShaderProgramGuardActive = true;
  let sampleLevelOneShaderPrograms: (() => void) | undefined;
  let performanceRecorder:
    | import('./debug/PerformanceFlightRecorder.ts').PerformanceFlightRecorder
    | undefined;
  const unsubscribeTitlePresentation = gameFlow.subscribe((state) => {
    if (state !== 'playing' || warmedLevelOneProgramBaseline !== undefined) return;
    titlePresentation?.dispose();
    titlePresentation = undefined;
    // Title-only programs must not inflate the gameplay shader guard baseline.
    warmedLevelOneProgramBaseline = renderLayer.renderer.info.programs?.length ?? 0;
    if (levelOneShaderProgramGuardActive && performanceRecorder) {
      performanceRecorder.armLevelOneShaderProgramGuard(warmedLevelOneProgramBaseline);
      sampleLevelOneShaderPrograms = () => performanceRecorder?.sampleLevelOneShaderPrograms();
    }
  });
  const unsubscribeObjectiveChanged = gameSession.events.on(
    'objectiveChanged',
    ({ objective }) => gameFlow.setObjective(objective),
  );
  const unsubscribeTransitionStarted = gameSession.events.on(
    'transitionStarted',
    ({ levelId, message }) => {
      levelOneShaderProgramGuardActive = false;
      sampleLevelOneShaderPrograms = undefined;
      performanceRecorder?.completeLevelOneShaderProgramGuard();
      gameFlow.beginLevelTransition(message, levelId);
    },
  );
  const unsubscribeTransitionCompleted = gameSession.events.on(
    'transitionCompleted',
    ({ levelId }) => gameFlow.finishLevelTransition(levelId),
  );
  const unsubscribeTransitionFailed = gameSession.events.on(
    'transitionFailed',
    ({ message }) => gameFlow.failLevelTransition(message),
  );

  app.replaceChildren(renderLayer.canvas, gameFlow.element);
  gameSession.load();
  titlePresentation = new TitleScreenPresentation({ renderLayer, host: app });

  const loop = new Loop({
    fixedUpdate: (deltaSeconds) => {
      if (!titlePresentation) gameSession.fixedUpdate(deltaSeconds);
    },
    render: (interpolationAlpha, stats) => {
      if (titlePresentation) {
        titlePresentation.render(stats.frameDeltaSeconds);
        return;
      }
      gameSession.render(interpolationAlpha, stats);
      sampleLevelOneShaderPrograms?.();
    },
  });

  let bootFrame = 0;
  let shuttingDown = false;
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
        if (
          levelOneShaderProgramGuardActive &&
          warmedLevelOneProgramBaseline !== undefined
        ) {
          recorder.armLevelOneShaderProgramGuard(warmedLevelOneProgramBaseline);
          recorder.sampleLevelOneShaderPrograms();
          sampleLevelOneShaderPrograms = () =>
            recorder.sampleLevelOneShaderPrograms();
        }
      },
      (error: unknown) => {
        if (!shuttingDown) {
          console.error('Performance flight recorder failed to load.', error);
        }
      },
    );
  }
  const startRenderLoop = async (): Promise<void> => {
    try {
      await titlePresentation?.prepare();
    } catch (error: unknown) {
      if (shuttingDown) return;
      console.error('Title room preparation failed; using the gameplay backdrop.', error);
      titlePresentation?.dispose();
      titlePresentation = undefined;
    }
    if (shuttingDown) return;
    renderLayer.setAnimationLoop((timestampMs) => loop.tick(timestampMs));
    // Present the same title room in dev and production before enabling Start.
    bootFrame = requestAnimationFrame(() => {
      bootFrame = requestAnimationFrame(() => {
        gameFlow.completeBoot();
      });
    });
  };

  // Let the loading state paint once, then compile every Level 1 light signature
  // before normal rendering or gameplay can begin.
  bootFrame = requestAnimationFrame(() => {
    void levelOneRuntime.prepareLightingPrograms().then(
      () => {
        if (shuttingDown) return;
        const verification = levelOneRuntime.levelOnePrewarmVerification;
        if (verification) {
          app.dataset.levelOnePrewarm = JSON.stringify(verification);
        }
        void startRenderLoop();
      },
      (error) => {
        if (shuttingDown) return;
        console.error('Containment lighting prewarm failed.', error);
        void startRenderLoop();
      },
    );
  });

  const shutdown = (): void => {
    shuttingDown = true;
    cancelAnimationFrame(bootFrame);
    loop.dispose();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('blur', focusAudio);
    window.removeEventListener('focus', focusAudio);
    document.removeEventListener('visibilitychange', focusAudio);
    unsubscribeObjectiveChanged();
    unsubscribeTransitionStarted();
    unsubscribeTransitionCompleted();
    unsubscribeTransitionFailed();
    unsubscribeTitlePresentation();
    titlePresentation?.dispose();
    performanceRecorder?.dispose();
    gameFlow.dispose();
    gameSession.dispose();
    audio.dispose();
    input.dispose();
    renderLayer.dispose();
  };

  if (import.meta.hot) import.meta.hot.dispose(shutdown);
}
