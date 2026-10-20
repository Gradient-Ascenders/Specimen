import { AudioManager } from './audio/AudioManager.ts';
import { BackgroundMusic, musicForFlow, type MusicLevel } from './audio/BackgroundMusic.ts';
import { SOUND_BANKS } from './audio/SoundCatalog.ts';
import { loadBlackoutMaintenanceMapData } from './render/environment/blackout/BlackoutMaintenanceMapData.ts';
import { loadCultivationBakedAssets } from './render/environment/cultivation/CultivationBakedAssets.ts';
import creditsMarkdown from '../CREDITS.md?raw';

import { Input } from './core/Input.ts';
import { Loop, type LoopStats } from './core/Loop.ts';
import { GameSessionCoordinator } from './levels/GameSessionCoordinator.ts';
import { GreyboxLevelRuntime } from './levels/GreyboxLevelRuntime.ts';
import { ContainmentAssetPreload } from './levels/ContainmentAssetPreload.ts';
import { DEFAULT_CAMERA_RIG_CONFIG } from './render/CameraRig.ts';
import { RenderLayer } from './render/RenderLayer.ts';
import { waitForGpuPreparation } from './render/WaitForGpuPreparation.ts';
import { GameFlowLifecycleCoordinator } from './ui/GameFlowLifecycleCoordinator.ts';
import { GameFlowUI, gameFlowCinematicCanPause } from './ui/GameFlowUI.ts';
import { GameSettings } from './ui/GameSettings.ts';
import { TitleScreenPresentation } from './ui/TitleScreenPresentation.ts';
import { TitleScreenScene } from './ui/TitleScreenScene.ts';
import { OpeningGameScene } from './cinematics/OpeningGameScene.ts';
import { OpeningGamePresentation } from './cinematics/OpeningGamePresentation.ts';
import { OpeningMoviePresentation } from './cinematics/OpeningMoviePresentation.ts';
import { getOpeningPlaybackMode } from './cinematics/OpeningPlaybackMode.ts';
import { OPENING_GAME_TIMING } from './cinematics/OpeningGameTimeline.ts';
import { CleanGameplayMode } from './ui/CleanGameplayMode.ts';
import { GraphicsPreparationOverlay } from './ui/GraphicsPreparationOverlay.ts';
import { graphicsPreparationKey, graphicsTransmissionResourceKey } from './render/GraphicsProfiles.ts';
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
  const music = new BackgroundMusic(import.meta.env.BASE_URL);
  void audio.preload(SOUND_BANKS.containment);
  const unlockAudio = (): void => { audio.unlock(); music.unlock(); };
  const focusAudio = (): void => {
    const focused = !document.hidden && document.hasFocus();
    audio.setFocused(focused);
    music.setFocused(focused);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('blur', focusAudio);
  window.addEventListener('focus', focusAudio);
  document.addEventListener('visibilitychange', focusAudio);
  // Initialize once: a page may boot already hidden or unfocused, with no event yet.
  focusAudio();
  const renderLayer = new RenderLayer({
    host: app,
    graphics: settings.value,
  });
  const input = new Input({ pointerLockElement: renderLayer.canvas });
  renderLayer.canvas.dataset.gameplayCanvas = 'true';
  const debugAvailable =
    import.meta.env.DEV ||
    new URLSearchParams(window.location.search).get('debug') === '1';
  const levelOneAssets = new ContainmentAssetPreload();
  const levelOneRuntime = new GreyboxLevelRuntime({
    host: app,
    audio,
    input,
    renderLayer,
    debugAvailable,
    yieldPreparation: () => openingPresentation instanceof OpeningMoviePresentation
      ? openingPresentation.yieldPreparation()
      : new Promise(resolve => requestAnimationFrame(() => resolve())),
    characterLoaders: levelOneAssets.loaders,
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
  let openingPresentation: OpeningGamePresentation | OpeningMoviePresentation | undefined;
  let lastFrameStats: Readonly<LoopStats> | undefined;
  let titleRoom: TitleScreenScene | undefined = new TitleScreenScene();
  let warmedLevelOneProgramBaseline: number | undefined;
  let levelOneShaderProgramGuardActive = true;
  let levelOneShaderProgramGuardInvalidation: string | undefined;
  let sampleLevelOneShaderPrograms: (() => void) | undefined;
  let performanceRecorder:
    | import('./debug/PerformanceFlightRecorder.ts').PerformanceFlightRecorder
    | undefined;
  let bootReadyMs: number | undefined;
  const gameFlow = new GameFlowUI({
    settings,
    creditsMarkdown,
    slimeHUD: gameSession,
    actions: {
      enableMusic: unlockAudio,
      playOpening: () => {
        if (!titleRoom) return;
        titlePresentation?.dispose({ keepScene: true });
        titlePresentation = undefined;
        const shared = {
          host: app,
          prepareLevel: () => {
            // Early Skip/retry may have no speculative bank. Start missing
            // transfers at high priority, but retain any existing downloads.
            void levelOneAssets.preload('high');
            gameSession.load();
            return gameSession.prepareInitialGraphics().finally(() => levelOneAssets.clear()).then(async () => {
              // Submission finishing is not GPU completion. Drain the hidden
              // warm-up queue before marking gameplay ready for the handoff.
              await waitForGpuPreparation(renderLayer.renderer.getContext(),
                () => new Promise(resolve => requestAnimationFrame(() => resolve())),
                () => !shuttingDown);
              if (shuttingDown) return;
              const verification = levelOneRuntime.levelOnePrewarmVerification;
              if (verification) app.dataset.levelOnePrewarm = JSON.stringify(verification);
            });
          },
          onComplete: (userGesture: boolean) => {
            levelOneRuntime.completeOpening();
            openingPresentation?.dispose();
            openingPresentation = undefined;
            gameFlow.finishOpening(userGesture);
            // Paint the warmed gameplay frame in the same task that removes
            // the black cinematic fade; never flash the final intro camera.
            if (lastFrameStats) gameSession.render(0, lastFrameStats);
          },
          onStatus: (message: string, failed: boolean) => gameFlow.setOpeningStatus(message, failed),
          onFade: (opacity: number) => gameFlow.setOpeningFade(opacity),
        };
        // Ordinary Start uses live 3D with low-priority downloads/idle data prep.
        // Preserve the existing MP4 player/export as an explicit backup.
        if (getOpeningPlaybackMode(window.location.search) === 'live') {
          const scene = new OpeningGameScene(titleRoom, renderLayer, { deferConstruction: true });
          titleRoom = undefined;
          openingPresentation = new OpeningGamePresentation({
            ...shared, scene, renderLayer,
            reducedMotion: settings.value.reduceMenuMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            preloadLevel: () => levelOneAssets.prepareLight(),
          });
        } else {
          const videoHost = app.querySelector<HTMLElement>('[data-flow-panel="opening"]');
          if (!videoHost) throw new Error('Missing opening video panel.');
          openingPresentation = new OpeningMoviePresentation({
            ...shared, videoHost,
            source: new URL('./assets/cinematics/opening.mp4', import.meta.url).href,
            sourceStartSeconds: OPENING_GAME_TIMING.blackoutEnd,
            onBlackout: () => {
              // No live cinematic scene, duplicate WebGL context or video
              // texture. Release menu GPU resources behind the painted fade.
              titleRoom?.dispose();
              titleRoom = undefined;
              renderLayer.setPresentationResolution(undefined);
            },
          });
        }
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
      isCinematicPlaying: () => gameFlowCinematicCanPause(app.dataset.cinematic, app.dataset.gameState),
      restartLevel: () => lifecycleCoordinator.restartLevel(),
      applySettings: (nextSettings) => {
        audio.setVolumes(nextSettings.masterVolume, nextSettings.soundEffectsVolume);
        music.setMasterVolume(nextSettings.masterVolume);
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
        gameSession.applyGraphicsSettings(graphicsPreparationKey(nextSettings), () => renderLayer.setGraphicsSettings(nextSettings),
          graphicsTransmissionResourceKey(nextSettings));
        titlePresentation?.setReducedMotion(nextSettings.reduceMenuMotion);
      },
      getGraphicsDiagnostics: () => renderLayer.getGraphicsDiagnostics(),
      subscribeGraphicsDiagnostics: listener => renderLayer.subscribeGraphicsDiagnostics(listener),
    },
  });
  music.setAutoplayBlockedListener(blocked => gameFlow.setMusicUnlockRequired(blocked));
  const unsubscribeQualificationFlow=gameFlow.subscribe(state=>performanceRecorder?.recordFlowState(state));
  const cleanGameplayMode = new CleanGameplayMode({
    host: app,
    flow: gameFlow,
    prepareGameplay: () => gameSession.prepareCleanGameplay(),
    present: (clean) => renderLayer.setCleanGameplayMode(clean),
  });
  let musicLevel: MusicLevel = 'containment';
  let menuOrigin: 'title' | 'paused' = 'title';
  let gameCompleted = false;
  const unsubscribeMusic = gameFlow.subscribe((state) => {
    if (state === 'title' || state === 'paused') menuOrigin = state;
    if (gameCompleted) return;
    const scene = musicForFlow(state, menuOrigin, musicLevel);
    music.setScene(scene.track, scene.play);
  });
  const unsubscribeGameCompleted = gameSession.events.on('gameCompleted', () => {
    gameCompleted = true;
    music.setScene(null, true);
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
      musicLevel = levelId === 'level-2' ? 'cultivation' : 'blackout';
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
      performanceRecorder?.observeQualificationFrame();
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
          benchmarkMode:new URLSearchParams(window.location.search).get('benchmark')==='1',
          getBootReadyMs:()=>bootReadyMs,
        });
        performanceRecorder = recorder;
        recorder.recordFlowState(gameFlow.state);
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
        bootReadyMs=performance.now();
        gameFlow.completeBoot();
      });
    });
  };

  // Only the observation chamber blocks the title. Default live playback
  // streams bytes only; world construction/GPU work waits for the final fade.
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
    unsubscribeMusic();
    unsubscribeQualificationFlow();
    unsubscribeGameCompleted();
    titlePresentation?.dispose();
    openingPresentation?.dispose();
    titleRoom?.dispose();
    levelOneAssets.clear();
    performanceRecorder?.dispose();
    cleanGameplayMode.dispose();
    gameFlow.dispose();
    gameSession.dispose();
    music.dispose();
    audio.dispose();
    input.dispose();
    renderLayer.dispose();
  };

  if (import.meta.hot) import.meta.hot.dispose(shutdown);
}
