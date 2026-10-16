import { AudioManager } from './audio/AudioManager.ts';
import { SOUND_BANKS } from './audio/SoundCatalog.ts';
import { loadBlackoutMaintenanceMapData } from './render/environment/blackout/BlackoutMaintenanceMapData.ts';
import { loadCultivationBakedAssets } from './render/environment/cultivation/CultivationBakedAssets.ts';
import creditsMarkdown from '../CREDITS.md?raw';

import { Input } from './core/Input.ts';
import { Loop, type LoopStats } from './core/Loop.ts';
import { GameSessionCoordinator } from './levels/GameSessionCoordinator.ts';
import { GreyboxLevelRuntime } from './levels/GreyboxLevelRuntime.ts';
import { DEFAULT_CAMERA_RIG_CONFIG } from './render/CameraRig.ts';
import { RenderLayer } from './render/RenderLayer.ts';
import { GameFlowLifecycleCoordinator } from './ui/GameFlowLifecycleCoordinator.ts';
import { GameFlowUI } from './ui/GameFlowUI.ts';
import { GameSettings } from './ui/GameSettings.ts';
import { TitleScreenPresentation } from './ui/TitleScreenPresentation.ts';
import { TitleScreenScene } from './ui/TitleScreenScene.ts';
import { OpeningGameScene } from './cinematics/OpeningGameScene.ts';
import { OpeningGamePresentation } from './cinematics/OpeningGamePresentation.ts';
import { CleanGameplayMode } from './ui/CleanGameplayMode.ts';
import { GraphicsPreparationOverlay } from './ui/GraphicsPreparationOverlay.ts';
import { graphicsShaderKey, graphicsTransmissionResourceKey } from './render/GraphicsProfiles.ts';
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
  void audio.preload(SOUND_BANKS.containment);
  const unlockAudio = (): void => audio.unlock();
  const focusAudio = (): void => audio.setFocused(!document.hidden && document.hasFocus());
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('blur', focusAudio);
  window.addEventListener('focus', focusAudio);
  document.addEventListener('visibilitychange', focusAudio);
  const renderLayer = new RenderLayer({
    host: app,
    graphics: settings.value,
  });
  const input = new Input({ pointerLockElement: renderLayer.canvas });
  renderLayer.canvas.dataset.gameplayCanvas = 'true';
  const debugAvailable =
    import.meta.env.DEV ||
    new URLSearchParams(window.location.search).get('debug') === '1';
  const levelOneRuntime = new GreyboxLevelRuntime({
    host: app,
    audio,
    input,
    renderLayer,
    debugAvailable,
    yieldPreparation: () => new Promise(resolve => requestAnimationFrame(() => resolve())),
  });
  const gameSession = new GameSessionCoordinator({
    initialRuntime: levelOneRuntime,
    createLevelTwo: async (progression) => {
      // Optional audio must not delay module or authored-asset preparation.
      void audio.preload(SOUND_BANKS.cultivation);
      const [runtimeModule, debugModule, authoredAssets] = await Promise.all([
        import('./levels/CultivationLevelRuntime.ts'),
        debugAvailable
          ? import('./debug/CultivationLevelDebug.ts')
          : Promise.resolve(undefined),
        loadCultivationBakedAssets(new URL('./assets/cultivation/authored-assets.bin', import.meta.url)),
      ]);
      return new runtimeModule.CultivationLevelRuntime({
        host: app,
        audio,
        input,
        renderLayer,
        progression,
        debugAvailable,
        debugSupport: debugModule?.CULTIVATION_LEVEL_DEBUG_SUPPORT,
        authoredAssets,
      });
    },
    createLevelThree: async (progression) => {
      void audio.preload(SOUND_BANKS.blackout);
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
        debugAvailable,
        maintenanceMaps,
      });
    },
    scheduleTransition: (transition) => {
      requestAnimationFrame(() => transition());
    },
  });
  const lifecycleCoordinator = new GameFlowLifecycleCoordinator(gameSession);
  let titlePresentation: TitleScreenPresentation | undefined;
  let openingPresentation: OpeningGamePresentation | undefined;
  let lastFrameStats: Readonly<LoopStats> | undefined;
  let titleRoom: TitleScreenScene | undefined = new TitleScreenScene();
  let warmedLevelOneProgramBaseline: number | undefined;
  let levelOneShaderProgramGuardActive = true;
  let levelOneShaderProgramGuardInvalidation: string | undefined;
  let sampleLevelOneShaderPrograms: (() => void) | undefined;
  let performanceRecorder:
    | import('./debug/PerformanceFlightRecorder.ts').PerformanceFlightRecorder
    | undefined;
  const gameFlow = new GameFlowUI({
    settings,
    creditsMarkdown,
    slimeHUD: gameSession,
    actions: {
      playOpening: () => {
        if (!titleRoom) return;
        titlePresentation?.dispose({ keepScene: true });
        titlePresentation = undefined;
        const scene = new OpeningGameScene(titleRoom, renderLayer, { deferConstruction: true });
        titleRoom = undefined; // The opening now owns all room CPU/GPU resources.
        openingPresentation = new OpeningGamePresentation({
          scene, renderLayer, host: app,
          reducedMotion: settings.value.reduceMenuMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          prepareLevel: () => {
            gameSession.load();
            return gameSession.prepareInitialGraphics().then(() => {
              if (shuttingDown) return;
              const verification = levelOneRuntime.levelOnePrewarmVerification;
              if (verification) app.dataset.levelOnePrewarm = JSON.stringify(verification);
            });
          },
          onComplete: (userGesture) => {
            levelOneRuntime.completeOpening();
            openingPresentation?.dispose();
            openingPresentation = undefined;
            gameFlow.finishOpening(userGesture);
            // Paint the warmed gameplay frame in the same task that removes
            // the black cinematic fade; never flash the final intro camera.
            if (lastFrameStats) gameSession.render(0, lastFrameStats);
          },
          onStatus: (message, failed) => gameFlow.setOpeningStatus(message, failed),
          onFade: opacity => gameFlow.setOpeningFade(opacity),
        });
        openingPresentation.start();
      },
      skipOpening: () => openingPresentation?.skip(),
      retryOpening: () => openingPresentation?.retry(),
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
        if (renderLayer.gelRendering.value !== nextSettings.gelRenderingMode) {
          levelOneShaderProgramGuardActive = false;
          sampleLevelOneShaderPrograms = undefined;
          levelOneShaderProgramGuardInvalidation = 'Character gel quality changed';
          performanceRecorder?.invalidateLevelOneShaderProgramGuard(levelOneShaderProgramGuardInvalidation);
        }
        gameSession.applyGraphicsSettings(graphicsShaderKey(nextSettings), () => renderLayer.setGraphicsSettings(nextSettings),
          graphicsTransmissionResourceKey(nextSettings));
        titlePresentation?.setReducedMotion(nextSettings.reduceMenuMotion);
      },
      getGraphicsDiagnostics: () => renderLayer.getGraphicsDiagnostics(),
      subscribeGraphicsDiagnostics: listener => renderLayer.subscribeGraphicsDiagnostics(listener),
    },
  });
  const cleanGameplayMode = new CleanGameplayMode({
    host: app,
    flow: gameFlow,
    prepareGameplay: () => gameSession.prepareCleanGameplay(),
    present: (clean) => renderLayer.setCleanGameplayMode(clean),
  });
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
  const graphicsPreparationOverlay = new GraphicsPreparationOverlay(app);
  const unsubscribeGraphicsPreparation = gameSession.events.on('graphicsPreparationChanged',
    ({pending, failed}) => graphicsPreparationOverlay.update(pending, failed));
  titlePresentation = new TitleScreenPresentation({ renderLayer, host: app,
    scene: titleRoom, reduceMotion: settings.value.reduceMenuMotion });

  const loop = new Loop({
    fixedUpdate: (deltaSeconds) => {
      if (!titlePresentation && !openingPresentation) gameSession.fixedUpdate(deltaSeconds);
    },
    render: (interpolationAlpha, stats) => {
      lastFrameStats = stats;
      gameFlow.updateFrame(stats.rawFrameDeltaSeconds);
      if (titlePresentation) {
        titlePresentation.render(stats.frameDeltaSeconds);
        return;
      }
      if (openingPresentation) {
        openingPresentation.render(stats.frameDeltaSeconds);
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
        if (levelOneShaderProgramGuardInvalidation) {
          recorder.invalidateLevelOneShaderProgramGuard(levelOneShaderProgramGuardInvalidation);
        }
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
      console.error('Title room preparation failed.', error);
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

  // Only the small observation chamber blocks the title. Level 1 construction,
  // asset preparation and shader priming overlap the opening after Start.
  bootFrame = requestAnimationFrame(() => {
    void startRenderLoop();
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
    unsubscribeGraphicsPreparation(); graphicsPreparationOverlay.dispose();
    unsubscribeTransitionStarted();
    unsubscribeTransitionCompleted();
    unsubscribeTransitionFailed();
    unsubscribeTitlePresentation();
    titlePresentation?.dispose();
    openingPresentation?.dispose();
    performanceRecorder?.dispose();
    cleanGameplayMode.dispose();
    gameFlow.dispose();
    gameSession.dispose();
    audio.dispose();
    input.dispose();
    renderLayer.dispose();
  };

  if (import.meta.hot) import.meta.hot.dispose(shutdown);
}
