export const DEFAULT_FIXED_DELTA_SECONDS = 1 / 60;
export const DEFAULT_MAX_FRAME_DELTA_SECONDS = 0.1;
export const DEFAULT_MAX_STEPS_PER_FRAME = 6;

const STEP_EPSILON_SECONDS = 1e-10;

export interface LoopStats {
  readonly fixedDeltaSeconds: number;
  rawFrameDeltaSeconds: number;
  frameDeltaSeconds: number;
  stepsThisFrame: number;
  interpolationAlpha: number;
  droppedSimulationTimeSeconds: number;
  renderFps: number;
}

export interface LoopOptions {
  fixedUpdate: (deltaSeconds: number) => void;
  render: (interpolationAlpha: number, stats: Readonly<LoopStats>) => void;
  fixedDeltaSeconds?: number;
  maxFrameDeltaSeconds?: number;
  maxStepsPerFrame?: number;
  document?: Document;
  window?: Window;
  profiler?: LoopProfiler;
}

/** Optional debug-only frame boundary used by the performance flight recorder. */
export interface LoopProfiler {
  readonly enabled: boolean;
  beginFrame(timestampMs: number): void;
  beginRender(): void;
  endFrame(
    stats: Readonly<LoopStats>,
    updateCpuDurationMs: number,
    renderCpuDurationMs: number,
  ): void;
}

/**
 * Fixed-step gameplay loop with rendering kept independent from simulation.
 *
 * The browser owns animation-frame scheduling. Call `tick(timestampMs)` once
 * from that callback; this class decides how many fixed gameplay steps run
 * before the frame is rendered.
 */
export class Loop {
  readonly stats: LoopStats;

  private readonly fixedUpdate: (deltaSeconds: number) => void;
  private readonly render: (
    interpolationAlpha: number,
    stats: Readonly<LoopStats>,
  ) => void;
  private readonly maxFrameDeltaSeconds: number;
  private readonly maxStepsPerFrame: number;
  private readonly hostDocument: Document;
  private readonly hostWindow: Window;
  private profiler: LoopProfiler | undefined;

  private accumulatorSeconds = 0;
  private previousTimestampMs: number | undefined;
  private paused = false;
  private disposed = false;

  constructor(options: LoopOptions) {
    const fixedDeltaSeconds =
      options.fixedDeltaSeconds ?? DEFAULT_FIXED_DELTA_SECONDS;
    const maxFrameDeltaSeconds =
      options.maxFrameDeltaSeconds ?? DEFAULT_MAX_FRAME_DELTA_SECONDS;
    const maxStepsPerFrame =
      options.maxStepsPerFrame ?? DEFAULT_MAX_STEPS_PER_FRAME;

    if (!Number.isFinite(fixedDeltaSeconds) || fixedDeltaSeconds <= 0) {
      throw new Error('fixedDeltaSeconds must be a positive finite number.');
    }
    if (!Number.isFinite(maxFrameDeltaSeconds) || maxFrameDeltaSeconds <= 0) {
      throw new Error(
        'maxFrameDeltaSeconds must be a positive finite number.',
      );
    }
    if (!Number.isInteger(maxStepsPerFrame) || maxStepsPerFrame <= 0) {
      throw new Error('maxStepsPerFrame must be a positive integer.');
    }

    this.fixedUpdate = options.fixedUpdate;
    this.render = options.render;
    this.maxFrameDeltaSeconds = maxFrameDeltaSeconds;
    this.maxStepsPerFrame = maxStepsPerFrame;
    this.hostDocument = options.document ?? document;
    this.hostWindow = options.window ?? window;
    this.profiler = options.profiler;

    this.stats = {
      fixedDeltaSeconds,
      rawFrameDeltaSeconds: 0,
      frameDeltaSeconds: 0,
      stepsThisFrame: 0,
      interpolationAlpha: 0,
      droppedSimulationTimeSeconds: 0,
      renderFps: 0,
    };

    this.hostDocument.addEventListener(
      'visibilitychange',
      this.onVisibilityChange,
    );
    this.hostWindow.addEventListener('blur', this.onWindowBlur);
    this.hostWindow.addEventListener('focus', this.onWindowFocus);

    if (this.hostDocument.hidden || !this.hostDocument.hasFocus()) {
      this.paused = true;
    }
  }

  /** Advance the runtime using the timestamp supplied by requestAnimationFrame. */
  tick(timestampMs: number): void {
    if (this.disposed || this.paused) return;

    if (!Number.isFinite(timestampMs)) {
      throw new Error('Loop tick timestamp must be finite.');
    }

    const profiling = this.profiler?.enabled === true;
    if (profiling) this.profiler!.beginFrame(timestampMs);

    if (this.previousTimestampMs === undefined) {
      this.previousTimestampMs = timestampMs;
      this.resetPerFrameStats();
      if (profiling) this.profiler!.beginRender();
      const renderStartedMs = profiling ? this.hostWindow.performance.now() : 0;
      this.render(0, this.stats);
      if (profiling) {
        this.profiler!.endFrame(
          this.stats,
          0,
          this.hostWindow.performance.now() - renderStartedMs,
        );
      }
      return;
    }

    const rawFrameDeltaSeconds = Math.max(
      0,
      (timestampMs - this.previousTimestampMs) / 1000,
    );
    this.previousTimestampMs = timestampMs;

    const frameDeltaSeconds = Math.min(
      rawFrameDeltaSeconds,
      this.maxFrameDeltaSeconds,
    );

    this.accumulatorSeconds += frameDeltaSeconds;

    const updateStartedMs = profiling ? this.hostWindow.performance.now() : 0;
    let stepsThisFrame = 0;
    while (
      this.accumulatorSeconds + STEP_EPSILON_SECONDS >=
        this.stats.fixedDeltaSeconds &&
      stepsThisFrame < this.maxStepsPerFrame
    ) {
      this.fixedUpdate(this.stats.fixedDeltaSeconds);
      this.accumulatorSeconds -= this.stats.fixedDeltaSeconds;
      if (
        this.accumulatorSeconds < 0 &&
        this.accumulatorSeconds > -STEP_EPSILON_SECONDS
      ) {
        this.accumulatorSeconds = 0;
      }
      stepsThisFrame += 1;
    }

    // If a custom configuration ever allows more accumulated work than the
    // hard step cap can consume, keep only the interpolation remainder. This
    // prevents a backlog from carrying a spiral-of-death into later frames.
    let droppedSimulationTimeSeconds = 0;
    if (this.accumulatorSeconds >= this.stats.fixedDeltaSeconds) {
      const remainder =
        this.accumulatorSeconds % this.stats.fixedDeltaSeconds;
      droppedSimulationTimeSeconds = this.accumulatorSeconds - remainder;
      this.accumulatorSeconds = remainder;
    }

    const interpolationAlpha = Math.min(
      this.accumulatorSeconds / this.stats.fixedDeltaSeconds,
      1,
    );

    this.stats.rawFrameDeltaSeconds = rawFrameDeltaSeconds;
    this.stats.frameDeltaSeconds = frameDeltaSeconds;
    this.stats.stepsThisFrame = stepsThisFrame;
    this.stats.interpolationAlpha = interpolationAlpha;
    this.stats.droppedSimulationTimeSeconds =
      droppedSimulationTimeSeconds;
    this.stats.renderFps =
      rawFrameDeltaSeconds > 0 ? 1 / rawFrameDeltaSeconds : 0;

    const updateCpuDurationMs = profiling
      ? this.hostWindow.performance.now() - updateStartedMs
      : 0;
    if (profiling) this.profiler!.beginRender();
    const renderStartedMs = profiling ? this.hostWindow.performance.now() : 0;
    this.render(interpolationAlpha, this.stats);
    if (profiling) {
      this.profiler!.endFrame(
        this.stats,
        updateCpuDurationMs,
        this.hostWindow.performance.now() - renderStartedMs,
      );
    }
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.resetClock();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.resetClock();
  }

  /** Attach or detach the optional debug profiler after a lazy module load. */
  setProfiler(profiler: LoopProfiler | undefined): void {
    if (this.disposed) return;
    this.profiler = profiler;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hostDocument.removeEventListener(
      'visibilitychange',
      this.onVisibilityChange,
    );
    this.hostWindow.removeEventListener('blur', this.onWindowBlur);
    this.hostWindow.removeEventListener('focus', this.onWindowFocus);
    this.profiler = undefined;
    this.resetClock();
  }

  private resetClock(): void {
    this.accumulatorSeconds = 0;
    this.previousTimestampMs = undefined;
    this.resetPerFrameStats();
  }

  private resetPerFrameStats(): void {
    this.stats.rawFrameDeltaSeconds = 0;
    this.stats.frameDeltaSeconds = 0;
    this.stats.stepsThisFrame = 0;
    this.stats.interpolationAlpha = 0;
    this.stats.droppedSimulationTimeSeconds = 0;
    this.stats.renderFps = 0;
  }

  private readonly onVisibilityChange = (): void => {
    if (this.hostDocument.hidden) {
      this.pause();
    } else if (this.hostDocument.hasFocus()) {
      this.resume();
    }
  };

  private readonly onWindowBlur = (): void => {
    this.pause();
  };

  private readonly onWindowFocus = (): void => {
    if (!this.hostDocument.hidden) this.resume();
  };
}
