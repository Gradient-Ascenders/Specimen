import * as THREE from 'three';

import type { LoopProfiler, LoopStats } from '../core/Loop.ts';
import type {
  PerformanceGameplaySnapshot,
  PerformanceRenderSnapshot,
} from '../core/PerformanceSnapshot.ts';
import type { GameSessionCoordinator } from '../levels/GameSessionCoordinator.ts';
import type { RenderLayer } from '../render/RenderLayer.ts';

export const PERFORMANCE_RECORDER_KEYS = {
  toggle: 'KeyP',
  marker: 'KeyM',
  export: 'KeyE',
} as const;

export const PERFORMANCE_RECORDER_SHORTCUT_LABELS = {
  toggle: 'Shift+P',
  marker: 'Shift+M',
  export: 'Shift+E',
} as const;

export interface PerformanceRecorderConfig {
  readonly historyDurationMs: number;
  readonly postHitchDurationMs: number;
  readonly maximumWindowDurationMs: number;
  readonly absoluteHitchThresholdMs: number;
  readonly relativeHitchFactor: number;
  readonly relativeHitchIncreaseMs: number;
  readonly minimumRelativeHitchMs: number;
  readonly baselineAlpha: number;
  readonly automaticCooldownMs: number;
  readonly historyCapacityFrames: number;
  readonly maximumWindowFrames: number;
  readonly maximumHitchWindows: number;
  readonly maximumManualMarkers: number;
  readonly maximumPerformanceEntries: number;
  readonly maximumMemorySamples: number;
  readonly memorySampleIntervalMs: number;
  readonly maximumPendingGpuQueries: number;
}

export const DEFAULT_PERFORMANCE_RECORDER_CONFIG: PerformanceRecorderConfig = {
  historyDurationMs: 5_000,
  postHitchDurationMs: 3_000,
  maximumWindowDurationMs: 15_000,
  absoluteHitchThresholdMs: 32,
  relativeHitchFactor: 1.65,
  relativeHitchIncreaseMs: 8,
  minimumRelativeHitchMs: 22,
  baselineAlpha: 0.05,
  automaticCooldownMs: 1_500,
  historyCapacityFrames: 2_048,
  maximumWindowFrames: 3_000,
  maximumHitchWindows: 16,
  maximumManualMarkers: 128,
  maximumPerformanceEntries: 256,
  maximumMemorySamples: 256,
  memorySampleIntervalMs: 5_000,
  maximumPendingGpuQueries: 12,
};

type GpuStatus =
  | 'unsupported'
  | 'pending'
  | 'valid'
  | 'disjoint'
  | 'query-capacity'
  | 'error';

interface RecordedFrame {
  sequence: number;
  timestampMs: number;
  deltaMs: number;
  baselineMs: number;
  updateCpuMs: number;
  renderCpuMs: number;
  recorderOverheadMs: number;
  gpuMs: number | null;
  gpuStatus: GpuStatus;
  fixedSteps: number;
  droppedSimulationMs: number;
  readonly render: PerformanceRenderSnapshot;
  readonly gameplay: PerformanceGameplaySnapshot;
}

interface HitchWindow {
  readonly id: number;
  readonly sources: Set<'automatic' | 'manual'>;
  readonly triggerTimestampsMs: number[];
  readonly frames: RecordedFrame[];
  firstTimestampMs: number;
  lastTimestampMs: number;
  lastTriggerTimestampMs: number;
  automaticSpikeCount: number;
  truncated: boolean;
}

interface ManualMarker {
  readonly id: number;
  readonly timestampMs: number;
  readonly nearestFrameSequence: number | null;
  readonly label: string;
}

interface BrowserPerformanceRecord {
  readonly id: number;
  readonly entryType: string;
  readonly name: string;
  readonly startTimeMs: number;
  readonly durationMs: number;
  readonly blockingDurationMs?: number;
  readonly scripts?: readonly BrowserScriptRecord[];
  readonly attribution?: readonly BrowserAttributionRecord[];
}

interface BrowserScriptRecord {
  readonly sourceUrl: string;
  readonly functionName: string;
  readonly invoker: string;
  readonly executionStartMs: number;
  readonly durationMs: number;
}

interface BrowserAttributionRecord {
  readonly name: string;
  readonly containerType: string;
  readonly containerName: string;
  readonly containerSrc: string;
}

interface MemorySample {
  readonly timestampMs: number;
  readonly usedJsHeapBytes: number;
  readonly totalJsHeapBytes: number;
  readonly jsHeapLimitBytes: number;
}

export interface ShaderProgramGrowthEvent {
  readonly timestampMs: number;
  readonly baselineProgramCount: number;
  readonly previousHighestProgramCount: number;
  readonly newProgramCount: number;
  readonly gameplay: PerformanceGameplaySnapshot;
}

export interface ShaderProgramGuardSnapshot {
  readonly armed: boolean;
  readonly baselineProgramCount: number | null;
  readonly highestProgramCount: number | null;
  readonly growthEventCount: number;
}

interface DisjointTimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

interface ChromePerformanceMemory {
  readonly usedJSHeapSize: number;
  readonly totalJSHeapSize: number;
  readonly jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  readonly memory?: ChromePerformanceMemory;
}

interface LongAnimationFrameEntry extends PerformanceEntry {
  readonly blockingDuration?: number;
  readonly scripts?: readonly {
    readonly sourceURL?: string;
    readonly functionName?: string;
    readonly invoker?: string;
    readonly invokerType?: string;
    readonly executionStart?: number;
    readonly duration?: number;
  }[];
}

interface LongTaskEntry extends PerformanceEntry {
  readonly attribution?: readonly {
    readonly name?: string;
    readonly containerType?: string;
    readonly containerName?: string;
    readonly containerSrc?: string;
  }[];
}

export interface HitchDetectionSample {
  readonly baselineMs: number;
  readonly detected: boolean;
  readonly absoluteTrigger: boolean;
  readonly relativeTrigger: boolean;
}

/** Allocation-free EWMA detector shared by the runtime and unit tests. */
export class HitchDetector {
  private readonly config: PerformanceRecorderConfig;
  private readonly result = {
    baselineMs: 0,
    detected: false,
    absoluteTrigger: false,
    relativeTrigger: false,
  };
  private baselineMsValue = 0;

  constructor(config: PerformanceRecorderConfig) {
    this.config = config;
  }

  reset(): void {
    this.baselineMsValue = 0;
  }

  sample(deltaMs: number): HitchDetectionSample {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      this.result.baselineMs = this.baselineMsValue;
      this.result.detected = false;
      this.result.absoluteTrigger = false;
      this.result.relativeTrigger = false;
      return this.result;
    }

    if (this.baselineMsValue <= 0) this.baselineMsValue = deltaMs;
    const baselineMs = this.baselineMsValue;
    const absoluteTrigger = deltaMs >= this.config.absoluteHitchThresholdMs;
    const relativeTrigger =
      deltaMs >= this.config.minimumRelativeHitchMs &&
      deltaMs >= baselineMs * this.config.relativeHitchFactor &&
      deltaMs - baselineMs >= this.config.relativeHitchIncreaseMs;
    const baselineInput = Math.min(deltaMs, baselineMs * 1.25);
    this.baselineMsValue +=
      (baselineInput - this.baselineMsValue) * this.config.baselineAlpha;

    this.result.baselineMs = baselineMs;
    this.result.detected = absoluteTrigger || relativeTrigger;
    this.result.absoluteTrigger = absoluteTrigger;
    this.result.relativeTrigger = relativeTrigger;
    return this.result;
  }
}

const FRAME_COLUMNS = [
  'sequence', 'timestampMs', 'deltaMs', 'baselineMs', 'updateCpuMs',
  'renderCpuMs', 'recorderOverheadMs', 'gpuMs', 'gpuStatus', 'fixedSteps',
  'droppedSimulationMs', 'drawCalls', 'triangles', 'programs', 'geometries',
  'textures', 'resolutionTier', 'effectiveDpr', 'viewportWidth',
  'viewportHeight', 'drawingBufferWidth', 'drawingBufferHeight', 'level',
  'room', 'gameplayState', 'cutsceneState', 'activeSlime', 'cameraX',
  'cameraY', 'cameraZ', 'bobX', 'bobY', 'bobZ', 'goopX', 'goopY', 'goopZ',
  'collisionRegistered', 'collisionEligible', 'collisionCandidates',
  'collisionNarrowChecks',
] as const;

const FRAME_TIME_HISTOGRAM_UPPER_BOUNDS_MS = [
  8, 12, 16.7, 20, 25, 32, 40, 50, 75, 100, 150, 250,
] as const;

const createRenderSnapshot = (): PerformanceRenderSnapshot => ({
  viewportWidth: 0,
  viewportHeight: 0,
  drawingBufferWidth: 0,
  drawingBufferHeight: 0,
  effectiveDpr: 1,
  resolutionTier: 1,
  drawCalls: 0,
  triangles: 0,
  programs: 0,
  geometries: 0,
  textures: 0,
});

export const createPerformanceGameplaySnapshot = (): PerformanceGameplaySnapshot => ({
  level: 'unavailable',
  room: 'unavailable',
  gameplayState: 'unavailable',
  cutsceneState: 'none',
  activeSlime: 'none',
  cameraPosition: [0, 0, 0],
  bobPosition: [0, 0, 0],
  goopPosition: [0, 0, 0],
  collisionRegistered: 0,
  collisionEligible: 0,
  collisionCandidates: 0,
  collisionNarrowChecks: 0,
});

const createRecordedFrame = (): RecordedFrame => ({
  sequence: 0,
  timestampMs: 0,
  deltaMs: 0,
  baselineMs: 0,
  updateCpuMs: 0,
  renderCpuMs: 0,
  recorderOverheadMs: 0,
  gpuMs: null,
  gpuStatus: 'unsupported',
  fixedSteps: 0,
  droppedSimulationMs: 0,
  render: createRenderSnapshot(),
  gameplay: createPerformanceGameplaySnapshot(),
});

const copyTuple = (
  target: [number, number, number],
  source: readonly [number, number, number],
): void => {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
};

const copyFrame = (source: RecordedFrame): RecordedFrame => {
  const target = createRecordedFrame();
  target.sequence = source.sequence;
  target.timestampMs = source.timestampMs;
  target.deltaMs = source.deltaMs;
  target.baselineMs = source.baselineMs;
  target.updateCpuMs = source.updateCpuMs;
  target.renderCpuMs = source.renderCpuMs;
  target.recorderOverheadMs = source.recorderOverheadMs;
  target.gpuMs = source.gpuMs;
  target.gpuStatus = source.gpuStatus;
  target.fixedSteps = source.fixedSteps;
  target.droppedSimulationMs = source.droppedSimulationMs;
  Object.assign(target.render, source.render);
  target.gameplay.level = source.gameplay.level;
  target.gameplay.room = source.gameplay.room;
  target.gameplay.gameplayState = source.gameplay.gameplayState;
  target.gameplay.cutsceneState = source.gameplay.cutsceneState;
  target.gameplay.activeSlime = source.gameplay.activeSlime;
  copyTuple(target.gameplay.cameraPosition, source.gameplay.cameraPosition);
  copyTuple(target.gameplay.bobPosition, source.gameplay.bobPosition);
  copyTuple(target.gameplay.goopPosition, source.gameplay.goopPosition);
  target.gameplay.collisionRegistered = source.gameplay.collisionRegistered;
  target.gameplay.collisionEligible = source.gameplay.collisionEligible;
  target.gameplay.collisionCandidates = source.gameplay.collisionCandidates;
  target.gameplay.collisionNarrowChecks = source.gameplay.collisionNarrowChecks;
  return target;
};

export class PerformanceFlightRecorder implements LoopProfiler {
  readonly element: HTMLElement;

  private readonly renderLayer: RenderLayer;
  private readonly gameSession: GameSessionCoordinator;
  private readonly hostWindow: Window;
  private readonly hostDocument: Document;
  private readonly config: PerformanceRecorderConfig;
  private readonly detector: HitchDetector;
  private readonly history: RecordedFrame[];
  private readonly frameTimeHistogram = new Array<number>(
    FRAME_TIME_HISTOGRAM_UPPER_BOUNDS_MS.length + 1,
  ).fill(0);
  private readonly performanceEntries: BrowserPerformanceRecord[] = [];
  private readonly memorySamples: MemorySample[] = [];
  private readonly shaderProgramGrowthEvents: ShaderProgramGrowthEvent[] = [];
  private readonly hitchWindows: HitchWindow[] = [];
  private readonly manualMarkers: ManualMarker[] = [];
  private readonly observers: PerformanceObserver[] = [];
  private readonly pendingGpuQueries: WebGLQuery[] = [];
  private readonly pendingGpuSequences: number[] = [];
  private readonly drawingBufferSize: THREE.Vector2;
  private readonly status: HTMLElement;
  private readonly shaderProgramGuardStatus: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly markerButton: HTMLButtonElement;
  private readonly exportButton: HTMLButtonElement;

  private enabledValue = false;
  private disposed = false;
  private historyWriteIndex = 0;
  private historyCount = 0;
  private sequence = 0;
  private currentTimestampMs = 0;
  private currentOverheadMs = 0;
  private activeWindow: HitchWindow | undefined;
  private nextWindowId = 1;
  private nextMarkerId = 1;
  private nextPerformanceEntryId = 1;
  private lastAutomaticWindowEndMs = Number.NEGATIVE_INFINITY;
  private nextMemorySampleMs = 0;
  private sessionStartedAtMs = 0;
  private sessionStartedAtIso = '';
  private totalFrames = 0;
  private totalDeltaMs = 0;
  private maximumDeltaMs = 0;
  private totalUpdateCpuMs = 0;
  private maximumUpdateCpuMs = 0;
  private totalRenderCpuMs = 0;
  private maximumRenderCpuMs = 0;
  private totalRecorderOverheadMs = 0;
  private maximumRecorderOverheadMs = 0;
  private validGpuFrames = 0;
  private totalGpuMs = 0;
  private maximumGpuMs = 0;
  private gpuDisjointCount = 0;
  private droppedGpuQueryCount = 0;
  private observerCallbackOverheadMs = 0;
  private gpuQueryForCurrentFrame: WebGLQuery | null = null;
  private gpuStatusForCurrentFrame: GpuStatus = 'unsupported';
  private gpuExtension: DisjointTimerQueryExtension | null = null;
  private gpuContext: WebGL2RenderingContext | null = null;
  private gpuSupportReason = 'recording has not started';
  private shaderProgramGuardArmed = false;
  private shaderProgramBaseline: number | null = null;
  private highestShaderProgramCount: number | null = null;

  constructor(options: {
    readonly host: HTMLElement;
    readonly renderLayer: RenderLayer;
    readonly gameSession: GameSessionCoordinator;
    readonly window?: Window;
    readonly document?: Document;
    readonly config?: Partial<PerformanceRecorderConfig>;
  }) {
    this.renderLayer = options.renderLayer;
    this.gameSession = options.gameSession;
    this.hostWindow = options.window ?? window;
    this.hostDocument = options.document ?? document;
    this.config = { ...DEFAULT_PERFORMANCE_RECORDER_CONFIG, ...options.config };
    this.detector = new HitchDetector(this.config);
    this.history = Array.from(
      { length: this.config.historyCapacityFrames },
      createRecordedFrame,
    );
    this.drawingBufferSize = new THREE.Vector2();

    this.element = this.hostDocument.createElement('aside');
    this.element.className = 'performance-recorder';
    this.element.innerHTML = `
      <span data-recorder-status>Flight recorder idle</span>
      <span data-shader-program-guard>Shader guard awaiting Level 1 warm-up</span>
      <button type="button" data-recorder-action="toggle">Record <kbd>${PERFORMANCE_RECORDER_SHORTCUT_LABELS.toggle}</kbd></button>
      <button type="button" data-recorder-action="marker" disabled>Mark <kbd>${PERFORMANCE_RECORDER_SHORTCUT_LABELS.marker}</kbd></button>
      <button type="button" data-recorder-action="export" disabled>Export <kbd>${PERFORMANCE_RECORDER_SHORTCUT_LABELS.export}</kbd></button>
    `;
    const status = this.element.querySelector<HTMLElement>('[data-recorder-status]');
    const shaderProgramGuardStatus = this.element.querySelector<HTMLElement>(
      '[data-shader-program-guard]',
    );
    const toggleButton = this.element.querySelector<HTMLButtonElement>('[data-recorder-action="toggle"]');
    const markerButton = this.element.querySelector<HTMLButtonElement>('[data-recorder-action="marker"]');
    const exportButton = this.element.querySelector<HTMLButtonElement>('[data-recorder-action="export"]');
    if (
      !status || !shaderProgramGuardStatus || !toggleButton || !markerButton ||
      !exportButton
    ) {
      throw new Error('Missing performance recorder controls.');
    }
    this.status = status;
    this.shaderProgramGuardStatus = shaderProgramGuardStatus;
    this.toggleButton = toggleButton;
    this.markerButton = markerButton;
    this.exportButton = exportButton;
    this.toggleButton.addEventListener('click', this.toggle);
    this.markerButton.addEventListener('click', this.markManualHitch);
    this.exportButton.addEventListener('click', this.downloadExport);
    this.hostWindow.addEventListener('keydown', this.onKeyDown);
    options.host.append(this.element);
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  /** Arm after prewarm and the hidden boot renders establish Level 1's baseline. */
  armLevelOneShaderProgramGuard(baselineProgramCount: number): void {
    if (this.disposed || this.shaderProgramBaseline !== null) return;
    this.shaderProgramGuardArmed = true;
    this.shaderProgramBaseline = baselineProgramCount;
    this.highestShaderProgramCount = baselineProgramCount;
    this.updateShaderProgramGuardStatus();
  }

  /**
   * Cheap debug-only sample. Gameplay context is captured only when a new high
   * proves that a program was compiled after Level 1's warm boundary.
   */
  sampleLevelOneShaderPrograms(): void {
    const previousHighest = this.highestShaderProgramCount;
    if (
      this.disposed || !this.shaderProgramGuardArmed ||
      previousHighest === null
    ) return;
    const currentProgramCount =
      this.renderLayer.renderer.info.programs?.length ?? 0;
    if (currentProgramCount <= previousHighest) return;

    this.highestShaderProgramCount = currentProgramCount;
    const gameplay = createPerformanceGameplaySnapshot();
    this.gameSession.writePerformanceSnapshot(gameplay);
    const event: ShaderProgramGrowthEvent = {
      timestampMs: this.hostWindow.performance.now(),
      baselineProgramCount: this.shaderProgramBaseline ?? previousHighest,
      previousHighestProgramCount: previousHighest,
      newProgramCount: currentProgramCount,
      gameplay,
    };
    pushBounded(this.shaderProgramGrowthEvents, event, 32);
    this.updateShaderProgramGuardStatus(event);
    (this.hostWindow as Window & { readonly console?: Console }).console?.error(
      'Cold shader program regression after Level 1 warm-up.',
      event,
    );
  }

  getShaderProgramGuardSnapshot(): ShaderProgramGuardSnapshot {
    return {
      armed: this.shaderProgramGuardArmed,
      baselineProgramCount: this.shaderProgramBaseline,
      highestProgramCount: this.highestShaderProgramCount,
      growthEventCount: this.shaderProgramGrowthEvents.length,
    };
  }

  completeLevelOneShaderProgramGuard(): void {
    if (!this.shaderProgramGuardArmed) return;
    this.shaderProgramGuardArmed = false;
    this.shaderProgramGuardStatus.textContent =
      `Level 1 shader guard complete · baseline ${this.shaderProgramBaseline} · highest ${this.highestShaderProgramCount}`;
  }

  start(): void {
    if (this.disposed || this.enabledValue) return;
    this.resetSession();
    this.enabledValue = true;
    this.sessionStartedAtMs = this.hostWindow.performance.now();
    this.sessionStartedAtIso = new Date().toISOString();
    this.nextMemorySampleMs = this.sessionStartedAtMs;
    this.setupGpuTiming();
    this.setupPerformanceObservers();
    this.toggleButton.textContent =
      `Stop ${PERFORMANCE_RECORDER_SHORTCUT_LABELS.toggle}`;
    this.markerButton.disabled = false;
    this.exportButton.disabled = false;
    this.updateStatus('recording');
  }

  stop(): void {
    if (!this.enabledValue) return;
    this.enabledValue = false;
    this.finalizeActiveWindow();
    this.disconnectPerformanceObservers();
    this.clearGpuQueries();
    this.toggleButton.innerHTML =
      `Record <kbd>${PERFORMANCE_RECORDER_SHORTCUT_LABELS.toggle}</kbd>`;
    this.markerButton.disabled = true;
    this.exportButton.disabled = this.totalFrames === 0;
    this.updateStatus('stopped');
  }

  beginFrame(timestampMs: number): void {
    const startedMs = this.hostWindow.performance.now();
    this.sequence += 1;
    this.currentTimestampMs = timestampMs;
    this.currentOverheadMs = 0;
    this.pollGpuQueries();
    this.currentOverheadMs += this.hostWindow.performance.now() - startedMs;
  }

  beginRender(): void {
    const startedMs = this.hostWindow.performance.now();
    this.gpuQueryForCurrentFrame = null;
    this.gpuStatusForCurrentFrame = this.gpuExtension ? 'pending' : 'unsupported';
    if (
      this.gpuContext && this.gpuExtension &&
      this.pendingGpuQueries.length < this.config.maximumPendingGpuQueries
    ) {
      try {
        const query = this.gpuContext.createQuery();
        if (query) {
          this.gpuContext.beginQuery(this.gpuExtension.TIME_ELAPSED_EXT, query);
          this.gpuQueryForCurrentFrame = query;
        } else {
          this.gpuStatusForCurrentFrame = 'error';
        }
      } catch {
        this.gpuStatusForCurrentFrame = 'error';
      }
    } else if (this.gpuExtension) {
      this.gpuStatusForCurrentFrame = 'query-capacity';
      this.droppedGpuQueryCount += 1;
    }
    this.currentOverheadMs += this.hostWindow.performance.now() - startedMs;
  }

  endFrame(
    stats: Readonly<LoopStats>,
    updateCpuDurationMs: number,
    renderCpuDurationMs: number,
  ): void {
    const startedMs = this.hostWindow.performance.now();
    if (this.gpuQueryForCurrentFrame && this.gpuContext && this.gpuExtension) {
      try {
        this.gpuContext.endQuery(this.gpuExtension.TIME_ELAPSED_EXT);
        this.pendingGpuQueries.push(this.gpuQueryForCurrentFrame);
        this.pendingGpuSequences.push(this.sequence);
      } catch {
        this.gpuContext.deleteQuery(this.gpuQueryForCurrentFrame);
        this.gpuStatusForCurrentFrame = 'error';
      }
    }
    this.gpuQueryForCurrentFrame = null;

    const deltaMs = stats.rawFrameDeltaSeconds * 1_000;
    const detection = this.detector.sample(deltaMs);
    const frame = this.writeHistoryFrame(
      stats,
      deltaMs,
      detection.baselineMs,
      updateCpuDurationMs,
      renderCpuDurationMs,
    );
    this.updateSummary(frame);
    this.sampleMemoryIfDue();

    let openedWindow = false;
    if (
      detection.detected &&
      (!this.activeWindow &&
        this.currentTimestampMs - this.lastAutomaticWindowEndMs >=
          this.config.automaticCooldownMs)
    ) {
      this.openWindow('automatic', this.currentTimestampMs);
      openedWindow = true;
    } else if (detection.detected && this.activeWindow) {
      this.activeWindow.sources.add('automatic');
      this.activeWindow.lastTriggerTimestampMs = this.currentTimestampMs;
      this.activeWindow.triggerTimestampsMs.push(this.currentTimestampMs);
      this.activeWindow.automaticSpikeCount += 1;
    }

    if (this.activeWindow && !openedWindow) this.appendFrameToActiveWindow(frame);
    if (
      this.activeWindow &&
      (this.currentTimestampMs - this.activeWindow.lastTriggerTimestampMs >=
        this.config.postHitchDurationMs ||
        this.currentTimestampMs - this.activeWindow.firstTimestampMs >=
          this.config.maximumWindowDurationMs)
    ) {
      this.finalizeActiveWindow();
    }

    this.currentOverheadMs += this.hostWindow.performance.now() - startedMs;
    frame.recorderOverheadMs = this.currentOverheadMs;
    const activeCapturedFrame = this.activeWindow
      ? findWindowFrame(this.activeWindow, frame.sequence)
      : undefined;
    if (activeCapturedFrame) {
      activeCapturedFrame.recorderOverheadMs = this.currentOverheadMs;
    }
    const finalizedCapturedFrame = this.hitchWindows.length > 0
      ? findWindowFrame(this.hitchWindows.at(-1)!, frame.sequence)
      : undefined;
    if (finalizedCapturedFrame) {
      finalizedCapturedFrame.recorderOverheadMs = this.currentOverheadMs;
    }
    this.totalRecorderOverheadMs += this.currentOverheadMs;
    this.maximumRecorderOverheadMs = Math.max(
      this.maximumRecorderOverheadMs,
      this.currentOverheadMs,
    );
  }

  readonly markManualHitch = (): void => {
    if (!this.enabledValue) return;
    const timestampMs = this.hostWindow.performance.now();
    const marker: ManualMarker = {
      id: this.nextMarkerId++,
      timestampMs,
      nearestFrameSequence: this.sequence > 0 ? this.sequence : null,
      label: 'felt hitch',
    };
    pushBounded(this.manualMarkers, marker, this.config.maximumManualMarkers);
    if (this.activeWindow) {
      this.activeWindow.sources.add('manual');
      this.activeWindow.lastTriggerTimestampMs = timestampMs;
      this.activeWindow.triggerTimestampsMs.push(timestampMs);
    } else {
      this.openWindow('manual', timestampMs);
    }
    this.updateStatus(`marker ${marker.id}`);
  };

  buildExport(): Record<string, unknown> {
    this.pollGpuQueries();
    const windows = [...this.hitchWindows];
    if (this.activeWindow) windows.push(this.activeWindow);
    const exportTimestampMs = this.hostWindow.performance.now();
    const renderSnapshot = createRenderSnapshot();
    this.renderLayer.writePerformanceSnapshot(renderSnapshot, this.drawingBufferSize);

    return {
      schema: 'specimen-performance-flight-recorder',
      schemaVersion: 1,
      session: {
        startedAt: this.sessionStartedAtIso,
        exportedAt: new Date().toISOString(),
        durationMs: Math.max(0, exportTimestampMs - this.sessionStartedAtMs),
        recordingActive: this.enabledValue,
        userAgent: this.hostWindow.navigator.userAgent,
        platform: this.hostWindow.navigator.platform,
        hardwareConcurrency: this.hostWindow.navigator.hardwareConcurrency,
        deviceMemoryGiB: readDeviceMemory(this.hostWindow.navigator),
        crossOriginIsolated: this.hostWindow.crossOriginIsolated,
        page: this.hostWindow.location.href,
      },
      webgl: this.captureWebGlMetadata(),
      viewport: renderSnapshot,
      configuration: this.config,
      frameColumns: FRAME_COLUMNS,
      hitchWindows: windows.map((window) => this.serializeWindow(window)),
      manualMarkers: this.manualMarkers,
      browserPerformance: {
        supportedEntryTypes: [...(PerformanceObserver.supportedEntryTypes ?? [])],
        entries: this.performanceEntries,
      },
      memorySamples: this.memorySamples,
      shaderProgramGuard: {
        ...this.getShaderProgramGuardSnapshot(),
        growthEvents: this.shaderProgramGrowthEvents,
      },
      summary: this.buildSummary(windows),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.toggleButton.removeEventListener('click', this.toggle);
    this.markerButton.removeEventListener('click', this.markManualHitch);
    this.exportButton.removeEventListener('click', this.downloadExport);
    this.hostWindow.removeEventListener('keydown', this.onKeyDown);
    this.element.remove();
  }

  private resetSession(): void {
    this.disconnectPerformanceObservers();
    this.clearGpuQueries();
    this.detector.reset();
    this.historyWriteIndex = 0;
    this.historyCount = 0;
    this.sequence = 0;
    this.activeWindow = undefined;
    this.hitchWindows.length = 0;
    this.manualMarkers.length = 0;
    this.performanceEntries.length = 0;
    this.memorySamples.length = 0;
    this.frameTimeHistogram.fill(0);
    this.nextWindowId = 1;
    this.nextMarkerId = 1;
    this.nextPerformanceEntryId = 1;
    this.lastAutomaticWindowEndMs = Number.NEGATIVE_INFINITY;
    this.totalFrames = 0;
    this.totalDeltaMs = 0;
    this.maximumDeltaMs = 0;
    this.totalUpdateCpuMs = 0;
    this.maximumUpdateCpuMs = 0;
    this.totalRenderCpuMs = 0;
    this.maximumRenderCpuMs = 0;
    this.totalRecorderOverheadMs = 0;
    this.maximumRecorderOverheadMs = 0;
    this.validGpuFrames = 0;
    this.totalGpuMs = 0;
    this.maximumGpuMs = 0;
    this.gpuDisjointCount = 0;
    this.droppedGpuQueryCount = 0;
    this.observerCallbackOverheadMs = 0;
  }

  private writeHistoryFrame(
    stats: Readonly<LoopStats>,
    deltaMs: number,
    baselineMs: number,
    updateCpuMs: number,
    renderCpuMs: number,
  ): RecordedFrame {
    const frame = this.history[this.historyWriteIndex]!;
    frame.sequence = this.sequence;
    frame.timestampMs = this.currentTimestampMs;
    frame.deltaMs = deltaMs;
    frame.baselineMs = baselineMs;
    frame.updateCpuMs = updateCpuMs;
    frame.renderCpuMs = renderCpuMs;
    frame.recorderOverheadMs = 0;
    frame.gpuMs = null;
    frame.gpuStatus = this.gpuStatusForCurrentFrame;
    frame.fixedSteps = stats.stepsThisFrame;
    frame.droppedSimulationMs = stats.droppedSimulationTimeSeconds * 1_000;
    this.renderLayer.writePerformanceSnapshot(frame.render, this.drawingBufferSize);
    this.gameSession.writePerformanceSnapshot(frame.gameplay);
    this.historyWriteIndex = (this.historyWriteIndex + 1) % this.history.length;
    this.historyCount = Math.min(this.historyCount + 1, this.history.length);
    return frame;
  }

  private openWindow(source: 'automatic' | 'manual', triggerTimestampMs: number): void {
    const window: HitchWindow = {
      id: this.nextWindowId++,
      sources: new Set([source]),
      triggerTimestampsMs: [triggerTimestampMs],
      frames: [],
      firstTimestampMs: triggerTimestampMs,
      lastTimestampMs: triggerTimestampMs,
      lastTriggerTimestampMs: triggerTimestampMs,
      automaticSpikeCount: source === 'automatic' ? 1 : 0,
      truncated: false,
    };
    const cutoffMs = triggerTimestampMs - this.config.historyDurationMs;
    this.forEachHistoryFrame((frame) => {
      if (frame.timestampMs >= cutoffMs) this.appendFrame(window, frame);
    });
    this.activeWindow = window;
    this.updateStatus(`${source} hitch ${window.id}`);
  }

  private appendFrameToActiveWindow(frame: RecordedFrame): void {
    if (this.activeWindow) this.appendFrame(this.activeWindow, frame);
  }

  private appendFrame(window: HitchWindow, frame: RecordedFrame): void {
    const previous = window.frames.at(-1);
    if (previous?.sequence === frame.sequence) return;
    if (window.frames.length >= this.config.maximumWindowFrames) {
      window.truncated = true;
      return;
    }
    const copied = copyFrame(frame);
    window.frames.push(copied);
    window.firstTimestampMs = window.frames[0]?.timestampMs ?? frame.timestampMs;
    window.lastTimestampMs = frame.timestampMs;
  }

  private finalizeActiveWindow(): void {
    const window = this.activeWindow;
    if (!window) return;
    this.activeWindow = undefined;
    pushBounded(this.hitchWindows, window, this.config.maximumHitchWindows);
    this.lastAutomaticWindowEndMs = window.lastTimestampMs;
  }

  private forEachHistoryFrame(callback: (frame: RecordedFrame) => void): void {
    const oldestIndex =
      (this.historyWriteIndex - this.historyCount + this.history.length) %
      this.history.length;
    for (let offset = 0; offset < this.historyCount; offset += 1) {
      callback(this.history[(oldestIndex + offset) % this.history.length]!);
    }
  }

  private updateSummary(frame: RecordedFrame): void {
    this.totalFrames += 1;
    this.totalDeltaMs += frame.deltaMs;
    this.maximumDeltaMs = Math.max(this.maximumDeltaMs, frame.deltaMs);
    this.totalUpdateCpuMs += frame.updateCpuMs;
    this.maximumUpdateCpuMs = Math.max(this.maximumUpdateCpuMs, frame.updateCpuMs);
    this.totalRenderCpuMs += frame.renderCpuMs;
    this.maximumRenderCpuMs = Math.max(this.maximumRenderCpuMs, frame.renderCpuMs);
    let bucket = this.frameTimeHistogram.length - 1;
    for (
      let index = 0;
      index < FRAME_TIME_HISTOGRAM_UPPER_BOUNDS_MS.length;
      index += 1
    ) {
      if (frame.deltaMs <= FRAME_TIME_HISTOGRAM_UPPER_BOUNDS_MS[index]!) {
        bucket = index;
        break;
      }
    }
    this.frameTimeHistogram[bucket < 0 ? this.frameTimeHistogram.length - 1 : bucket]! += 1;
  }

  private setupPerformanceObservers(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    const supported = PerformanceObserver.supportedEntryTypes ?? [];
    for (const entryType of ['long-animation-frame', 'longtask']) {
      if (!supported.includes(entryType)) continue;
      try {
        const observer = new PerformanceObserver((list) => {
          const startedMs = this.hostWindow.performance.now();
          for (const entry of list.getEntries()) this.capturePerformanceEntry(entry);
          this.observerCallbackOverheadMs +=
            this.hostWindow.performance.now() - startedMs;
        });
        observer.observe({ type: entryType, buffered: true });
        this.observers.push(observer);
      } catch {
        // Entry types are opportunistic and can be blocked by browser policy.
      }
    }
  }

  private disconnectPerformanceObservers(): void {
    for (const observer of this.observers) observer.disconnect();
    this.observers.length = 0;
  }

  private capturePerformanceEntry(entry: PerformanceEntry): void {
    const loaf = entry as LongAnimationFrameEntry;
    const task = entry as LongTaskEntry;
    const record: BrowserPerformanceRecord = {
      id: this.nextPerformanceEntryId++,
      entryType: entry.entryType,
      name: entry.name,
      startTimeMs: entry.startTime,
      durationMs: entry.duration,
      ...(typeof loaf.blockingDuration === 'number'
        ? { blockingDurationMs: loaf.blockingDuration }
        : {}),
      ...(loaf.scripts?.length
        ? {
          scripts: loaf.scripts.slice(0, 8).map((script) => ({
            sourceUrl: script.sourceURL ?? '',
            functionName: script.functionName ?? '',
            invoker: script.invoker ?? script.invokerType ?? '',
            executionStartMs: script.executionStart ?? 0,
            durationMs: script.duration ?? 0,
          })),
        }
        : {}),
      ...(task.attribution?.length
        ? {
          attribution: task.attribution.slice(0, 8).map((item) => ({
            name: item.name ?? '',
            containerType: item.containerType ?? '',
            containerName: item.containerName ?? '',
            containerSrc: item.containerSrc ?? '',
          })),
        }
        : {}),
    };
    pushBounded(
      this.performanceEntries,
      record,
      this.config.maximumPerformanceEntries,
    );
  }

  private sampleMemoryIfDue(): void {
    if (this.currentTimestampMs < this.nextMemorySampleMs) return;
    this.nextMemorySampleMs =
      this.currentTimestampMs + this.config.memorySampleIntervalMs;
    const memory = (this.hostWindow.performance as PerformanceWithMemory).memory;
    if (!memory) return;
    pushBounded(
      this.memorySamples,
      {
        timestampMs: this.currentTimestampMs,
        usedJsHeapBytes: memory.usedJSHeapSize,
        totalJsHeapBytes: memory.totalJSHeapSize,
        jsHeapLimitBytes: memory.jsHeapSizeLimit,
      },
      this.config.maximumMemorySamples,
    );
  }

  private setupGpuTiming(): void {
    this.gpuExtension = null;
    this.gpuContext = null;
    this.gpuSupportReason = 'EXT_disjoint_timer_query_webgl2 unavailable';
    const context = this.renderLayer.renderer.getContext();
    if (
      typeof WebGL2RenderingContext === 'undefined' ||
      !(context instanceof WebGL2RenderingContext)
    ) {
      this.gpuSupportReason = 'renderer is not using WebGL2';
      return;
    }
    const extension = context.getExtension('EXT_disjoint_timer_query_webgl2') as
      | DisjointTimerQueryExtension
      | null;
    if (!extension) return;
    this.gpuContext = context;
    this.gpuExtension = extension;
    this.gpuSupportReason = 'supported';
  }

  private pollGpuQueries(): void {
    const context = this.gpuContext;
    const extension = this.gpuExtension;
    if (!context || !extension || this.pendingGpuQueries.length === 0) return;
    let disjoint = false;
    try {
      disjoint = Boolean(context.getParameter(extension.GPU_DISJOINT_EXT));
    } catch {
      disjoint = true;
    }
    if (disjoint) {
      this.gpuDisjointCount += 1;
      for (let index = 0; index < this.pendingGpuQueries.length; index += 1) {
        this.applyGpuResult(this.pendingGpuSequences[index]!, null, 'disjoint');
        context.deleteQuery(this.pendingGpuQueries[index]!);
      }
      this.pendingGpuQueries.length = 0;
      this.pendingGpuSequences.length = 0;
      return;
    }

    for (let index = 0; index < this.pendingGpuQueries.length;) {
      const query = this.pendingGpuQueries[index]!;
      const sequence = this.pendingGpuSequences[index]!;
      let available = false;
      try {
        available = Boolean(
          context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE),
        );
      } catch {
        this.applyGpuResult(sequence, null, 'error');
        context.deleteQuery(query);
        this.pendingGpuQueries.splice(index, 1);
        this.pendingGpuSequences.splice(index, 1);
        continue;
      }
      if (!available) {
        index += 1;
        continue;
      }
      const nanoseconds = Number(
        context.getQueryParameter(query, context.QUERY_RESULT),
      );
      const gpuMs = Number.isFinite(nanoseconds) ? nanoseconds / 1_000_000 : null;
      this.applyGpuResult(sequence, gpuMs, gpuMs === null ? 'error' : 'valid');
      context.deleteQuery(query);
      this.pendingGpuQueries.splice(index, 1);
      this.pendingGpuSequences.splice(index, 1);
    }
  }

  private applyGpuResult(
    sequence: number,
    gpuMs: number | null,
    status: GpuStatus,
  ): void {
    const historyCandidate = this.history[(sequence - 1) % this.history.length];
    const historyFrame = historyCandidate?.sequence === sequence
      ? historyCandidate
      : undefined;
    if (historyFrame) {
      historyFrame.gpuMs = gpuMs;
      historyFrame.gpuStatus = status;
    }
    for (const window of this.hitchWindows) {
      const frame = findWindowFrame(window, sequence);
      if (frame) {
        frame.gpuMs = gpuMs;
        frame.gpuStatus = status;
      }
    }
    const activeFrame = this.activeWindow
      ? findWindowFrame(this.activeWindow, sequence)
      : undefined;
    if (activeFrame) {
      activeFrame.gpuMs = gpuMs;
      activeFrame.gpuStatus = status;
    }
    if (gpuMs !== null && status === 'valid') {
      this.validGpuFrames += 1;
      this.totalGpuMs += gpuMs;
      this.maximumGpuMs = Math.max(this.maximumGpuMs, gpuMs);
    }
  }

  private clearGpuQueries(): void {
    if (this.gpuContext) {
      if (this.gpuQueryForCurrentFrame) {
        this.gpuContext.deleteQuery(this.gpuQueryForCurrentFrame);
      }
      for (const query of this.pendingGpuQueries) {
        this.gpuContext.deleteQuery(query);
      }
    }
    this.gpuQueryForCurrentFrame = null;
    this.pendingGpuQueries.length = 0;
    this.pendingGpuSequences.length = 0;
  }

  private serializeWindow(window: HitchWindow): Record<string, unknown> {
    const resourceChanges: Record<string, number> = {};
    for (let index = 1; index < window.frames.length; index += 1) {
      const previous = window.frames[index - 1]!.render;
      const current = window.frames[index]!.render;
      for (const field of ['programs', 'geometries', 'textures'] as const) {
        if (current[field] !== previous[field]) {
          resourceChanges[field] = (resourceChanges[field] ?? 0) + 1;
        }
      }
    }
    const entryIds = this.performanceEntries
      .filter((entry) => rangesOverlap(
        window.firstTimestampMs,
        window.lastTimestampMs,
        entry.startTimeMs,
        entry.startTimeMs + entry.durationMs,
      ))
      .map((entry) => entry.id);
    return {
      id: window.id,
      sources: [...window.sources],
      firstTimestampMs: window.firstTimestampMs,
      lastTimestampMs: window.lastTimestampMs,
      triggerTimestampsMs: window.triggerTimestampsMs,
      automaticSpikeCount: window.automaticSpikeCount,
      truncated: window.truncated,
      resourceCountChangeFrames: resourceChanges,
      performanceEntryIds: entryIds,
      frames: window.frames.map(frameToRow),
    };
  }

  private buildSummary(windows: readonly HitchWindow[]): Record<string, unknown> {
    return {
      totalFrames: this.totalFrames,
      capturedHitchWindows: windows.length,
      manualMarkers: this.manualMarkers.length,
      averageFrameMs: safeAverage(this.totalDeltaMs, this.totalFrames),
      maximumFrameMs: this.maximumDeltaMs,
      approximateFramePercentilesMs: {
        p50: histogramPercentile(this.frameTimeHistogram, 0.5),
        p95: histogramPercentile(this.frameTimeHistogram, 0.95),
        p99: histogramPercentile(this.frameTimeHistogram, 0.99),
      },
      averageUpdateCpuMs: safeAverage(this.totalUpdateCpuMs, this.totalFrames),
      maximumUpdateCpuMs: this.maximumUpdateCpuMs,
      averageRenderCpuMs: safeAverage(this.totalRenderCpuMs, this.totalFrames),
      maximumRenderCpuMs: this.maximumRenderCpuMs,
      validGpuFrames: this.validGpuFrames,
      averageGpuMs: safeAverage(this.totalGpuMs, this.validGpuFrames),
      maximumGpuMs: this.maximumGpuMs,
      gpuDisjointCount: this.gpuDisjointCount,
      droppedGpuQueryCount: this.droppedGpuQueryCount,
      averageRecorderOverheadMs: safeAverage(
        this.totalRecorderOverheadMs,
        this.totalFrames,
      ),
      maximumRecorderOverheadMs: this.maximumRecorderOverheadMs,
      observerCallbackOverheadMs: this.observerCallbackOverheadMs,
      retainedPerformanceEntries: this.performanceEntries.length,
      retainedMemorySamples: this.memorySamples.length,
    };
  }

  private captureWebGlMetadata(): Record<string, unknown> {
    const context = this.renderLayer.renderer.getContext();
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    const rendererParameter = debugInfo?.UNMASKED_RENDERER_WEBGL;
    const vendorParameter = debugInfo?.UNMASKED_VENDOR_WEBGL;
    return {
      version: context.getParameter(context.VERSION),
      shadingLanguageVersion: context.getParameter(context.SHADING_LANGUAGE_VERSION),
      vendor: context.getParameter(context.VENDOR),
      renderer: context.getParameter(context.RENDERER),
      unmaskedVendor: vendorParameter
        ? context.getParameter(vendorParameter)
        : 'unavailable',
      unmaskedRenderer: rendererParameter
        ? context.getParameter(rendererParameter)
        : 'unavailable',
      gpuTimerQuerySupported: this.gpuExtension !== null,
      gpuTimerQueryStatus: this.gpuSupportReason,
      gpuDisjointCount: this.gpuDisjointCount,
    };
  }

  private readonly toggle = (): void => {
    if (this.enabledValue) this.stop();
    else this.start();
  };

  private readonly downloadExport = (): void => {
    if (this.totalFrames === 0) return;
    const json = JSON.stringify(this.buildExport());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = this.hostDocument.createElement('a');
    anchor.href = url;
    anchor.download = `specimen-performance-${new Date().toISOString().replaceAll(':', '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.updateStatus(`exported ${(json.length / 1_024).toFixed(0)} KiB`);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.repeat || !event.shiftKey || event.altKey || event.ctrlKey ||
      event.metaKey
    ) return;
    if (
      event.code !== PERFORMANCE_RECORDER_KEYS.toggle &&
      event.code !== PERFORMANCE_RECORDER_KEYS.marker &&
      event.code !== PERFORMANCE_RECORDER_KEYS.export
    ) return;
    event.preventDefault();
    if (event.code === PERFORMANCE_RECORDER_KEYS.toggle) this.toggle();
    else if (event.code === PERFORMANCE_RECORDER_KEYS.marker) this.markManualHitch();
    else this.downloadExport();
  };

  private updateStatus(message: string): void {
    this.status.textContent = [
      `Flight recorder ${message}`,
      `${this.totalFrames} frames`,
      `${this.hitchWindows.length + (this.activeWindow ? 1 : 0)} windows`,
      this.gpuExtension ? 'GPU timing on' : 'GPU timing unavailable',
    ].join(' · ');
  }

  private updateShaderProgramGuardStatus(
    growth?: ShaderProgramGrowthEvent,
  ): void {
    if (growth) {
      const { gameplay } = growth;
      this.shaderProgramGuardStatus.textContent = [
        'Cold shader regression',
        `${growth.previousHighestProgramCount} → ${growth.newProgramCount}`,
        `level ${gameplay.level}`,
        `room ${gameplay.room}`,
        `${growth.timestampMs.toFixed(1)} ms`,
        `state ${gameplay.gameplayState}`,
        `slime ${gameplay.activeSlime}`,
        `camera ${gameplay.cameraPosition.map((value) => value.toFixed(2)).join(', ')}`,
      ].join(' · ');
      return;
    }
    this.shaderProgramGuardStatus.textContent =
      `Shader programs stable · baseline ${this.shaderProgramBaseline} · highest ${this.highestShaderProgramCount}`;
  }
}

const frameToRow = (frame: RecordedFrame): readonly unknown[] => [
  frame.sequence,
  round(frame.timestampMs),
  round(frame.deltaMs),
  round(frame.baselineMs),
  round(frame.updateCpuMs),
  round(frame.renderCpuMs),
  round(frame.recorderOverheadMs),
  frame.gpuMs === null ? null : round(frame.gpuMs),
  frame.gpuStatus,
  frame.fixedSteps,
  round(frame.droppedSimulationMs),
  frame.render.drawCalls,
  frame.render.triangles,
  frame.render.programs,
  frame.render.geometries,
  frame.render.textures,
  frame.render.resolutionTier,
  frame.render.effectiveDpr,
  frame.render.viewportWidth,
  frame.render.viewportHeight,
  frame.render.drawingBufferWidth,
  frame.render.drawingBufferHeight,
  frame.gameplay.level,
  frame.gameplay.room,
  frame.gameplay.gameplayState,
  frame.gameplay.cutsceneState,
  frame.gameplay.activeSlime,
  ...frame.gameplay.cameraPosition.map(round),
  ...frame.gameplay.bobPosition.map(round),
  ...frame.gameplay.goopPosition.map(round),
  frame.gameplay.collisionRegistered,
  frame.gameplay.collisionEligible,
  frame.gameplay.collisionCandidates,
  frame.gameplay.collisionNarrowChecks,
];

const pushBounded = <Value>(
  values: Value[],
  value: Value,
  capacity: number,
): void => {
  if (values.length >= capacity) values.shift();
  values.push(value);
};

const rangesOverlap = (
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean => startA <= endB && startB <= endA;

const findWindowFrame = (
  window: HitchWindow,
  sequence: number,
): RecordedFrame | undefined => {
  const firstSequence = window.frames[0]?.sequence;
  if (firstSequence === undefined) return undefined;
  const candidate = window.frames[sequence - firstSequence];
  return candidate?.sequence === sequence ? candidate : undefined;
};

const round = (value: number): number => Math.round(value * 1_000) / 1_000;

const safeAverage = (total: number, count: number): number =>
  count > 0 ? total / count : 0;

const histogramPercentile = (
  histogram: readonly number[],
  percentile: number,
): number | string => {
  const total = histogram.reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;
  const target = Math.ceil(total * percentile);
  let seen = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    seen += histogram[index] ?? 0;
    if (seen >= target) {
      return FRAME_TIME_HISTOGRAM_UPPER_BOUNDS_MS[index] ?? '>250';
    }
  }
  return '>250';
};

const readDeviceMemory = (navigator: Navigator): number | 'unavailable' => {
  const value = (navigator as Navigator & { readonly deviceMemory?: number })
    .deviceMemory;
  return typeof value === 'number' ? value : 'unavailable';
};
