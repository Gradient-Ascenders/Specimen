import { gameplayBindings } from './core/KeyBindings.ts';
import { AudioManager } from './audio/AudioManager.ts';
import { prepareBlackoutArrivalAudio } from './audio/BlackoutArrivalAudio.ts';
import { BackgroundMusic, musicForFlow, type MusicLevel } from './audio/BackgroundMusic.ts';
import { cinematicMusicEvents } from './audio/CinematicMusic.ts';
import { bossMusicEvents } from './audio/BossMusic.ts';
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
import { GraphicsPreparationYield } from './render/GraphicsPreparationYield.ts';
import { GameFlowLifecycleCoordinator } from './ui/GameFlowLifecycleCoordinator.ts';
import { GameFlowUI, gameFlowCinematicCanPause } from './ui/GameFlowUI.ts';
import { GameSettings } from './ui/GameSettings.ts';
import { TitleScreenPresentation } from './ui/TitleScreenPresentation.ts';
import { TitleScreenScene } from './ui/TitleScreenScene.ts';
import { OpeningGameScene } from './cinematics/OpeningGameScene.ts';
import { OpeningGamePresentation } from './cinematics/OpeningGamePresentation.ts';
import { OpeningMoviePresentation } from './cinematics/OpeningMoviePresentation.ts';
import backupOpeningMovieUrl from './assets/cinematics/opening.mp4?url';
import { getOpeningPlaybackMode } from './cinematics/OpeningPlaybackMode.ts';
import { OPENING_GAME_TIMING } from './cinematics/OpeningGameTimeline.ts';
import { CleanGameplayMode } from './ui/CleanGameplayMode.ts';
import { GraphicsPreparationOverlay } from './ui/GraphicsPreparationOverlay.ts';
import { GoopSpeedOverlay } from './ui/GoopSpeedOverlay.ts';
import { graphicsPreparationKey, graphicsTransmissionResourceKey } from './render/GraphicsProfiles.ts';
import '@fontsource/michroma/400.css';
import '@fontsource-variable/space-grotesk';
import './style.css';
import './cinematics/boss-defeat.css';
import './ui/ui-theme.css';
import './ui/liquid-loading.css';
import './ui/interface-polish.css';

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
  let appliedKeyBindings = settings.value.keyBindings;
  let activeLoop: Loop | undefined;
  const audio = new AudioManager(import.meta.env.BASE_URL);
  const music = new BackgroundMusic(import.meta.env.BASE_URL);
  const unsubscribeCinematicStarted = cinematicMusicEvents.on('started', cue => music.beginCinematic(cue));
  const unsubscribeCinematicStopped = cinematicMusicEvents.on('stopped', cue => music.endCinematic(cue));
  const unsubscribeBossStarted = bossMusicEvents.on('started', cue => music.beginBoss(cue));
  const unsubscribeBossDefeated = bossMusicEvents.on('defeated', cue => music.defeatBoss(cue));
  const unsubscribeBossStopped = bossMusicEvents.on('stopped', cue => music.stopBoss(cue));
  void audio.preload(SOUND_BANKS.containment);
  const unlockAudio = (): void => { audio.unlock(); music.unlock(); };
  const focusAudio = (): void => {
    const focused = !settings.value.muteInBackground || (!document.hidden && document.hasFocus());
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
  const input = new Input({ pointerLockElement: renderLayer.canvas, bindings: gameplayBindings(appliedKeyBindings) });
  renderLayer.canvas.dataset.gameplayCanvas = 'true';
  const debugAvailable =
    import.meta.env.DEV ||
    new URLSearchParams(window.location.search).get('debug') === '1';
  const levelOneAssets = new ContainmentAssetPreload();
  const graphicsPreparationYield = new GraphicsPreparationYield(
    (window as Window & {scheduler?: {yield(): Promise<void>}}).scheduler,
  );
  const createLevelOneRuntime = (): GreyboxLevelRuntime => new GreyboxLevelRuntime({
    host: app,
    audio,
    input,
    renderLayer,
    debugAvailable,
    yieldPreparation: () => openingPresentation instanceof OpeningMoviePresentation
      ? openingPresentation.yieldPreparation()
      : openingPresentation instanceof OpeningGamePresentation
      ? openingPresentation.yieldPreparation()
      : graphicsPreparationYield.yield(),
    characterLoaders: levelOneAssets.loaders,
  });
  let levelOneRuntime = createLevelOneRuntime();
  let levelTwoRuntime: import('./levels/CultivationLevelRuntime.ts').CultivationLevelRuntime | undefined;
  let levelThreeRuntime: import('./levels/BlackoutLevelRuntime.ts').BlackoutLevelRuntime | undefined;
  let levelPreviewRequested: 'cultivation-arrival' | 'sentry-clearance' | 'volt-rescue' | 'blackout-arrival' | 'blackout-elevator' | 'blackout-research' | 'boss-defeat' | undefined;
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
      return levelTwoRuntime = new runtimeModule.CultivationLevelRuntime({
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
      // Prioritize the first-frame cue and prepare it alongside the visuals.
      // The rest of the bank stays optional and does not gate the transition.
      const arrivalAudio = prepareBlackoutArrivalAudio(audio);
      void audio.preload(SOUND_BANKS.blackout);
      const [runtimeModule, maintenanceMaps] = await Promise.all([
        import('./levels/BlackoutLevelRuntime.ts'),
        loadBlackoutMaintenanceMapData(new URL('./assets/blackout/maintenance-maps.bin', import.meta.url)),
        arrivalAudio,
      ]);
      levelThreeRuntime = new runtimeModule.BlackoutLevelRuntime({
        host: app,
        creditsMarkdown,
        audio,
        input,
        renderLayer,
        progression,
        authoredRoomOne: true,
        debugAvailable,
        maintenanceMaps,
      });
      return levelThreeRuntime;
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
  let warmedLevelOnePrograms: readonly object[] | undefined;
  let levelOneShaderProgramGuardActive = true;
  let levelOneShaderProgramGuardInvalidation: string | undefined;
  let sampleLevelOneShaderPrograms: (() => void) | undefined;
  let performanceRecorder:
    | import('./debug/PerformanceFlightRecorder.ts').PerformanceFlightRecorder
    | undefined;
  let bootReadyMs: number | undefined;
  let autoDetecting = false;
  let initialGraphicsTask: Promise<void> | undefined;
  let preparedInitialGraphicsKey: string | undefined;
  const initialGraphicsKey = () => `${graphicsPreparationKey(settings.value)}:${graphicsTransmissionResourceKey(settings.value)}`;
  const selectInitialGraphics = async (): Promise<void> => {
    if (!settings.needsGraphicsCalibration) return;
    const revision = settings.graphicsRevision;
    const isCurrent = () => !shuttingDown && settings.needsGraphicsCalibration &&
      settings.graphicsRevision === revision && !document.hidden && document.hasFocus();
    let profile: import('./render/GraphicsProfiles.ts').GraphicsProfileId = 'minimum';
    try {
      if (isCurrent()) profile = (await (levelOneRuntime.state === 'unloaded'
        ? renderLayer.calibrateCurrentView(isCurrent) : levelOneRuntime.calibrateInitialGraphics(isCurrent))).profile;
    } catch {
      // Optional calibration must never prevent normal level preparation.
    }
    if (!shuttingDown) settings.applyAutomaticGraphicsProfile(profile, revision);
  };
  const prepareFirstGraphics = (): Promise<void> => {
    if (initialGraphicsTask) return initialGraphicsTask;
    if (!settings.needsGraphicsCalibration && preparedInitialGraphicsKey === initialGraphicsKey()) return Promise.resolve();
    if (levelOneRuntime.state === 'unloaded') {
      void levelOneAssets.preload('high');
      gameSession.load();
    }
    initialGraphicsTask = gameSession.prepareInitialGraphics(selectInitialGraphics).then(() => {
      preparedInitialGraphicsKey = initialGraphicsKey();
    }).finally(() => { initialGraphicsTask = undefined; levelOneAssets.clear(); });
    return initialGraphicsTask;
  };
  const escapePreviewFromUrl = import.meta.env.DEV && new URLSearchParams(window.location.search).get('cutscene') === 'escape';
  let escapePreviewPending = false;
  let escapePreviewRequested = false;
  const previewEscape = async (): Promise<void> => {
    if (!import.meta.env.DEV || escapePreviewPending) return;
    escapePreviewPending = escapePreviewRequested = true;
    gameFlow.setOpeningFade(1);
    gameFlow.setOpeningStatus('Preparing escape cutscene…', false);
    const skip = app.querySelector<HTMLButtonElement>('[data-action="skip-opening"]');
    if (skip) skip.hidden = true;
    try {
      // Paint the opaque cover before normal world/cinematic preparation.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (shuttingDown) return;
      titlePresentation?.dispose({keepScene:true}); titlePresentation = undefined;
      titleRoom?.dispose(); titleRoom = undefined;
      await prepareFirstGraphics();
      await waitForGpuPreparation(renderLayer.renderer.getContext(),
        () => new Promise(resolve => requestAnimationFrame(() => resolve())), () => !shuttingDown);
      if (shuttingDown) return;
      levelOneRuntime.completeOpening();
      gameFlow.finishOpening(false);
      if (!levelOneRuntime.previewEscapeForDebug()) throw new Error('Escape preview is not ready.');
      escapePreviewRequested = false;
      if (lastFrameStats) gameSession.render(0, lastFrameStats);
    } catch (error) {
      if (!shuttingDown) {
        console.error('Escape cutscene preview failed.', error);
        gameFlow.setOpeningStatus('Could not prepare the escape cutscene. Retry to continue.', true);
      }
    } finally {
      escapePreviewPending = false;
      if (skip) skip.hidden = false;
    }
  };
  const playOpening = (forceIntro = false): void => {
    if (escapePreviewFromUrl && !forceIntro) { void previewEscape(); return; }
    if (!titleRoom) return;
    titlePresentation?.dispose({ keepScene: true });
    titlePresentation = undefined;
    const shared = {
      host: app,
      audio,
      prepareLevel: () => {
        return prepareFirstGraphics().then(async () => {
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
    // Submissions omit the MP4; old backup URLs also use the live opening.
    if (!backupOpeningMovieUrl || getOpeningPlaybackMode(window.location.search) === 'live') {
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
        source: backupOpeningMovieUrl,
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
  };
  const startSelectedLevel = async (levelId: 'level-2' | 'level-3'): Promise<void> => {
    // Finish title-settings preparation before replacing its runtime.
    await initialGraphicsTask;
    await selectInitialGraphics();
    if (shuttingDown) return;
    titlePresentation?.dispose();
    titlePresentation = undefined;
    titleRoom = undefined;
    levelOneAssets.clear();
    gameSession.startSelectedLevel(levelId);
  };
  const gameFlow = new GameFlowUI({
    settings,
    creditsMarkdown,
    slimeHUD: gameSession,
    actions: {
      previewCutscene: import.meta.env.DEV ? (cutscene) => {
        if (cutscene === 'escape') void previewEscape();
        else if (cutscene === 'cultivation-arrival' || cutscene === 'sentry-clearance' || cutscene === 'volt-rescue' || cutscene === 'blackout-arrival' || cutscene === 'blackout-elevator' || cutscene === 'blackout-research' || cutscene === 'boss-defeat') {
          levelPreviewRequested = cutscene;
          const levelId = cutscene === 'blackout-arrival' || cutscene === 'blackout-elevator' || cutscene === 'blackout-research' || cutscene === 'boss-defeat' ? 'level-3' : 'level-2';
          const message = cutscene === 'boss-defeat' ? 'Preparing the final escape…' : cutscene === 'blackout-research' ? 'Preparing the research wing…' : cutscene === 'blackout-elevator' ? 'Preparing the service elevator…' : cutscene === 'blackout-arrival' ? 'Preparing Blackout arrival…'
            : cutscene === 'cultivation-arrival' ? 'Preparing Cultivation arrival…'
            : cutscene === 'volt-rescue' ? 'Preparing Volt rescue cutscene…' : 'Preparing sentry cutscene…';
          gameFlow.beginLevelTransition(message, levelId);
          void startSelectedLevel(levelId).catch(error => {
            levelPreviewRequested = undefined;
            gameFlow.failLevelTransition(error instanceof Error ? error.message : String(error));
          });
        }
        else playOpening(true);
      } : undefined,
      enableMusic: unlockAudio,
      playMenuConfirm: () => { audio.unlock(); audio.playUI(); },
      returnToMenu: async () => {
        await initialGraphicsTask;
        if (shuttingDown) return;
        openingPresentation?.dispose();
        openingPresentation = undefined;
        levelTwoRuntime = undefined;
        levelThreeRuntime = undefined;
        levelPreviewRequested = undefined;
        titlePresentation?.dispose();
        titlePresentation = undefined;
        levelOneAssets.clear();
        levelOneRuntime = createLevelOneRuntime();
        gameSession.reset(levelOneRuntime);
        renderLayer.cameraRig.setViewMode('third-person', true);
        preparedInitialGraphicsKey = undefined;
        musicLevel = 'containment';
        gameCompleted = false;
        warmedLevelOneProgramBaseline = undefined;
        warmedLevelOnePrograms = undefined;
        sampleLevelOneShaderPrograms = undefined;
        levelOneShaderProgramGuardActive = true;
        levelOneShaderProgramGuardInvalidation = undefined;
        performanceRecorder?.completeLevelOneShaderProgramGuard();
        delete app.dataset.levelOnePrewarm;
        titleRoom = new TitleScreenScene();
        titlePresentation = new TitleScreenPresentation({
          renderLayer, host: app, scene: titleRoom,
          reduceMotion: settings.value.reduceMenuMotion,
        });
        await titlePresentation.prepare();
        titlePresentation.render(0);
      },
      startSelectedLevel,
      playOpening: () => playOpening(),
      skipOpening: () => openingPresentation?.skip(),
      retryOpening: () => { if (escapePreviewRequested) void previewEscape(); else openingPresentation?.retry(); },
      startGameplay: () => lifecycleCoordinator.startGameplay(),
      stopGameplay: () => lifecycleCoordinator.stopGameplay(),
      setGameplayInputEnabled: (enabled) => input.setEnabled(enabled),
      setDebugInteractionEnabled: (enabled) =>
        gameSession.setDebugInteractionEnabled(enabled),
      requestPointerLock: () => { if (app.dataset.cinematic !== 'boss-defeat') input.requestPointerLock(); },
      releasePointerLock: () => input.releasePointerLock(),
      isPointerLocked: () => input.pointerLocked,
      isGameplayInputEnabled: () => input.enabled && app.dataset.cinematic !== 'boss-defeat',
      isCinematicPlaying: () => gameFlowCinematicCanPause(app.dataset.cinematic, app.dataset.gameState),
      restartLevel: () => lifecycleCoordinator.restartLevel(),
      restartGame:()=>window.location.reload(),
      recalibrateGraphics: async () => {
        settings.requestGraphicsCalibration();
        autoDetecting = true;
        try {
          if (titlePresentation || levelOneRuntime.state !== 'unloaded') await prepareFirstGraphics();
          else await gameSession.prepareInitialGraphics(selectInitialGraphics);
        } finally { autoDetecting = false; }
      },
      applySettings: (nextSettings) => {
        app.dataset.reducedMenuMotion = String(nextSettings.reduceMenuMotion);
        audio.setVolumes(nextSettings.masterVolume, nextSettings.soundEffectsVolume);
        music.setMasterVolume(nextSettings.masterVolume);
        music.setMusicVolume(nextSettings.musicVolume);
        focusAudio();
        activeLoop?.setFrameRateLimit(nextSettings.frameRateLimit);
        activeLoop?.setPauseWhenUnfocused(nextSettings.pauseInBackground);
        renderLayer.setBrightness(nextSettings.brightness);
        renderLayer.cameraShakeScale = nextSettings.cameraShake;
        renderLayer.keyBindings = nextSettings.keyBindings;
        renderLayer.cameraRig.setFieldOfViewDegrees(nextSettings.fieldOfViewDegrees);
        if (appliedKeyBindings !== nextSettings.keyBindings) {
          appliedKeyBindings = nextSettings.keyBindings;
          input.setBindings(gameplayBindings(appliedKeyBindings));
        }
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
    if (state === 'title' || state === 'restarting' || state === 'transitionFailed') {
      music.cancelCinematic(); music.cancelBoss();
    }
    if (state === 'title' || state === 'paused') menuOrigin = state;
    if (gameCompleted) return;
    const scene = musicForFlow(state, menuOrigin, musicLevel);
    music.setScene(app.dataset.cinematic === 'boss-defeat' ? null : scene.track, scene.play);
  });
  const unsubscribeGameCompleted = gameSession.events.on('gameCompleted', () => {
    if(gameCompleted)return;
    gameCompleted = true;
    music.cancelBoss();
    music.setScene(null, true);
    const returnToTitle = app.dataset.endingCreditsSkipped === 'true'; delete app.dataset.endingCreditsSkipped;
    gameFlow.completeGame(returnToTitle);
  });
  const unsubscribeTitlePresentation = gameFlow.subscribe((state) => {
    if (state !== 'playing' || warmedLevelOneProgramBaseline !== undefined) return;
    titlePresentation?.dispose();
    titlePresentation = undefined;
    // Title-only programs must not inflate the gameplay shader guard baseline.
    warmedLevelOneProgramBaseline = renderLayer.renderer.info.programs?.length ?? 0;
    warmedLevelOnePrograms = [...(renderLayer.renderer.info.programs ?? [])];
    if (levelOneShaderProgramGuardActive && performanceRecorder) {
      performanceRecorder.armLevelOneShaderProgramGuard(warmedLevelOneProgramBaseline, warmedLevelOnePrograms);
      sampleLevelOneShaderPrograms = () => performanceRecorder?.sampleLevelOneShaderPrograms();
    }
  });
  const unsubscribeObjectiveChanged = gameSession.events.on(
    'objectiveChanged',
    ({ objective }) => gameFlow.setObjective(objective),
  );
  const unsubscribeCheckpointReached = gameSession.events.on('checkpointReached',
    (event) => gameFlow.notifyCheckpointReached(event));
  const unsubscribeTransitionStarted = gameSession.events.on(
    'transitionStarted',
    ({ levelId, message }) => {
      music.cancelBoss();
      musicLevel = levelId === 'level-2' ? 'cultivation' : 'blackout';
      levelOneShaderProgramGuardActive = false;
      sampleLevelOneShaderPrograms = undefined;
      warmedLevelOnePrograms = undefined;
      performanceRecorder?.completeLevelOneShaderProgramGuard();
      gameFlow.beginLevelTransition(message, levelId);
    },
  );
  const unsubscribeTransitionCompleted = gameSession.events.on(
    'transitionCompleted',
    ({ levelId }) => {
      if (import.meta.env.DEV && levelPreviewRequested && levelId === (levelPreviewRequested === 'blackout-arrival' || levelPreviewRequested === 'blackout-elevator' || levelPreviewRequested === 'blackout-research' || levelPreviewRequested === 'boss-defeat' ? 'level-3' : 'level-2')) {
        const preview = levelPreviewRequested;
        levelPreviewRequested = undefined;
        try {
          // Normal level entry already stages both real vent arrivals.
          const ready = preview === 'blackout-arrival' || preview === 'cultivation-arrival' || (preview === 'blackout-elevator'
            ? levelThreeRuntime?.previewElevatorForDebug() : preview === 'blackout-research' ? levelThreeRuntime?.previewResearchForDebug() : preview === 'boss-defeat' ? levelThreeRuntime?.previewBossDefeatForDebug() : preview === 'volt-rescue'
              ? levelTwoRuntime?.previewVoltRescueForDebug() : levelTwoRuntime?.previewSentryClearanceForDebug());
          if (!ready) throw new Error('Cutscene preview is not ready.');
          gameFlow.finishLevelTransition(levelId);
          gameFlow.enterPreparedLevel(false);
        } catch (error) {
          gameFlow.failLevelTransition(error instanceof Error ? error.message : String(error));
        }
      } else gameFlow.finishLevelTransition(levelId);
    },
  );
  const unsubscribeTransitionFailed = gameSession.events.on(
    'transitionFailed',
    ({ message }) => { levelPreviewRequested = undefined; gameFlow.failLevelTransition(message); },
  );

  app.replaceChildren(renderLayer.canvas, gameFlow.element);
  const goopSpeedOverlay = new GoopSpeedOverlay(app);
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
      if (gameFlow.state !== 'playing' || titlePresentation || openingPresentation) goopSpeedOverlay.reset();
      else goopSpeedOverlay.update(stats.frameDeltaSeconds, gameSession.getSpeedEffectStrength());
      if (titlePresentation) {
        if (autoDetecting) return;
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

  activeLoop = loop;
  loop.setFrameRateLimit(settings.value.frameRateLimit);
  loop.setPauseWhenUnfocused(settings.value.pauseInBackground);

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
          isPlannedLevelOneProgram: program => levelOneRuntime.isPlannedShaderProgram(program),
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
          recorder.armLevelOneShaderProgramGuard(warmedLevelOneProgramBaseline, warmedLevelOnePrograms);
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
    unsubscribeCheckpointReached();
    unsubscribeGraphicsPreparation(); graphicsPreparationOverlay.dispose();
    goopSpeedOverlay.dispose();
    unsubscribeTransitionStarted();
    unsubscribeTransitionCompleted();
    unsubscribeTransitionFailed();
    unsubscribeTitlePresentation();
    unsubscribeMusic();
    unsubscribeQualificationFlow();
    unsubscribeGameCompleted();
    titlePresentation?.dispose();
    openingPresentation?.dispose();
    graphicsPreparationYield.dispose();
    titleRoom?.dispose();
    levelOneAssets.clear();
    performanceRecorder?.dispose();
    cleanGameplayMode.dispose();
    gameFlow.dispose();
    gameSession.dispose();
    music.dispose();
    unsubscribeCinematicStarted();
    unsubscribeCinematicStopped();
    unsubscribeBossStarted(); unsubscribeBossDefeated(); unsubscribeBossStopped();
    audio.dispose();
    input.dispose();
    renderLayer.dispose();
  };

  if (import.meta.hot) import.meta.hot.dispose(shutdown);
}
