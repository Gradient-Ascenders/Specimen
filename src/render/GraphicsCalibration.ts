import type { GraphicsProfileId } from './GraphicsProfiles.ts';

export const GRAPHICS_CALIBRATION_BUDGET_MS = 1000;
// Shared sampling allowance across tiers and views. Cold preparation has a
// separate shared allowance so it cannot consume the time needed to measure.
export const GRAPHICS_CALIBRATION_TOTAL_SAMPLE_BUDGET_MS = 3000;
export const GRAPHICS_CALIBRATION_PREPARATION_BUDGET_MS = 5000;
// Reserve part of a 60 Hz frame for simulation and other browser work.
export const GRAPHICS_CALIBRATION_FRAME_BUDGET_MS = (1000 / 60) * 0.9;
const BATCH_SIZE = 4;
const SAMPLES_PER_VIEW = 8;

export type CalibrationStatus = 'complete' | 'interrupted' | 'timed-out' | 'unavailable';
export type CalibrationProfile = 'standard' | 'high' | 'ultra';
export type CalibrationProgress = (phase: 'preparing' | 'measuring', profile: CalibrationProfile) => void;
export interface GraphicsCalibrationMeasurement {
  readonly status: CalibrationStatus;
  readonly sampleCount: number;
  readonly frameMs: number;
  readonly cpuMs: number;
  readonly gpuMs?: number;
  readonly method: 'gpu-timer' | 'completion';
}
export interface GraphicsCalibrationResult {
  readonly status: CalibrationStatus;
  readonly profile?: GraphicsProfileId;
  readonly measurements: Partial<Record<CalibrationProfile, GraphicsCalibrationMeasurement>>;
}
export interface CalibrationView {
  /** Cold compilation, uploads and their completion are never frame samples.
   * Return false if preparation stopped before the warm-up draw. */
  warm(preparationDeadline: number): Promise<void | false>;
  draw(): void;
}
interface TimerExtension { readonly TIME_ELAPSED_EXT: number; readonly GPU_DISJOINT_EXT: number }

const upperFrame = (samples: readonly number[]): number => {
  const ordered = [...samples].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * 0.8) - 1] ?? 0;
};
export const incompleteGraphicsMeasurement = (status: Exclude<CalibrationStatus, 'complete'>): GraphicsCalibrationMeasurement =>
  ({ status, sampleCount: 0, frameMs: 0, cpuMs: 0, method: 'completion' });

/** One clock for the entire check. Pause sampling time during cold preparation;
 * preparation still has a shared limit, rather than restarting for every view. */
export class GraphicsCalibrationTiming {
  measurementDeadline: number;
  private preparationRemainingMs: number;
  private readonly now: () => number;

  constructor(now: () => number, samplingMs = GRAPHICS_CALIBRATION_TOTAL_SAMPLE_BUDGET_MS,
    preparationMs = GRAPHICS_CALIBRATION_PREPARATION_BUDGET_MS) {
    this.now = now;
    this.measurementDeadline = now() + samplingMs;
    this.preparationRemainingMs = preparationMs;
  }

  async prepare(action: (deadline: number) => Promise<CalibrationStatus>): Promise<CalibrationStatus> {
    if (this.preparationRemainingMs <= 0 || this.now() >= this.measurementDeadline) return 'timed-out';
    const started = this.now();
    try { return await action(started + this.preparationRemainingMs); }
    finally {
      const elapsed = Math.max(0, this.now() - started);
      this.preparationRemainingMs -= elapsed;
      this.measurementDeadline += elapsed;
    }
  }
}

/** Every required view must finish; a cheap room cannot stand in for a missing one. */
export function combineGraphicsMeasurements(views: readonly GraphicsCalibrationMeasurement[]): GraphicsCalibrationMeasurement {
  if (!views.length) return incompleteGraphicsMeasurement('unavailable');
  const failed = views.find(view => view.status !== 'complete');
  return { status: failed?.status ?? 'complete', sampleCount: views.reduce((n, view) => n + view.sampleCount, 0),
    frameMs: Math.max(...views.map(view => view.frameMs)), cpuMs: Math.max(...views.map(view => view.cpuMs)),
    ...(views.every(view => view.gpuMs !== undefined) ? { gpuMs: Math.max(...views.map(view => view.gpuMs!)) } : {}),
    method: views.every(view => view.method === 'gpu-timer') ? 'gpu-timer' : 'completion' };
}

/** Probe the middle tier first: at most two workloads distinguish all four
 * presets. Every recommended tier passes its own workload; timeouts never mean Low. */
export async function calibrateGraphicsProfiles(options: {
  measure(profile: CalibrationProfile, timing: GraphicsCalibrationTiming): Promise<GraphicsCalibrationMeasurement>;
  isCurrent(): boolean;
  now?: () => number;
}): Promise<GraphicsCalibrationResult> {
  const now = options.now ?? (() => performance.now());
  const timing = new GraphicsCalibrationTiming(now);
  const measurements: GraphicsCalibrationResult['measurements'] = {};
  const finish = (status: CalibrationStatus, profile?: GraphicsProfileId): GraphicsCalibrationResult => ({ status, profile, measurements });
  const fits = (sample: GraphicsCalibrationMeasurement) => sample.status === 'complete' &&
    sample.frameMs <= GRAPHICS_CALIBRATION_FRAME_BUDGET_MS;
  const measure = async (profile: CalibrationProfile) => {
    if (!options.isCurrent()) return incompleteGraphicsMeasurement('interrupted');
    if (now() >= timing.measurementDeadline) return incompleteGraphicsMeasurement('timed-out');
    const sample = await options.measure(profile, timing);
    const status = !options.isCurrent() ? 'interrupted' :
      sample.status === 'complete' && (sample.sampleCount < BATCH_SIZE ||
        !Number.isFinite(sample.frameMs) || sample.frameMs <= 0) ? 'unavailable' : sample.status;
    return measurements[profile] = { ...sample, status };
  };
  const high = await measure('high');
  if (high.status === 'interrupted' || high.status === 'unavailable') return finish(high.status);
  if (fits(high)) {
    const ultra = await measure('ultra');
    if (ultra.status === 'interrupted' || ultra.status === 'unavailable') return finish(ultra.status);
    // Keep verified High if Ultra is too slow or cannot finish within the budget.
    return finish('complete', fits(ultra) ? 'ultra' : 'high');
  }
  const medium = await measure('standard');
  if (medium.status !== 'complete') return finish(medium.status);
  return finish('complete', fits(medium) ? 'standard' : 'minimum');
}

/** GPU queries separate execution time from polling delay. Without the optional
 * extension, time small batches through a fence, amortizing scheduling overhead.
 * Neither path waits for vsync nor includes shader preparation in frame cost. */
export async function calibrateGraphics(options: {
  context: WebGL2RenderingContext;
  views: readonly CalibrationView[];
  now(): number;
  yieldTask(): Promise<void>;
  isCurrent(): boolean;
  budgetMs?: number;
  timing?: GraphicsCalibrationTiming;
  onMeasuring?(): void;
}): Promise<GraphicsCalibrationMeasurement> {
  const { context: gl } = options;
  const timing = options.timing ?? new GraphicsCalibrationTiming(options.now);
  const views: GraphicsCalibrationMeasurement[] = [];
  const budget = Math.min(GRAPHICS_CALIBRATION_BUDGET_MS, options.budgetMs ?? GRAPHICS_CALIBRATION_BUDGET_MS);
  let extension: TimerExtension | null;
  const validity = (): Exclude<CalibrationStatus, 'complete'> | undefined =>
    !options.isCurrent() ? 'interrupted' : gl.isContextLost() ? 'unavailable' : undefined;
  const wait = async (deadline: number): Promise<CalibrationStatus> => {
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!fence) return 'unavailable';
    try {
      gl.flush();
      for (;;) {
        const invalid = validity();
        if (invalid) return invalid;
        const status = gl.clientWaitSync(fence, 0, 0);
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return 'complete';
        if (status === gl.WAIT_FAILED) return 'unavailable';
        if (options.now() >= deadline) return 'timed-out';
        await options.yieldTask();
      }
    } finally { gl.deleteSync(fence); }
  };
  try {
    extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
    for (const view of options.views) {
      const invalid = validity();
      if (invalid) return incompleteGraphicsMeasurement(invalid);
      const drained = await timing.prepare(async preparationDeadline => {
        if (await view.warm(preparationDeadline) === false) return validity() ?? 'timed-out';
        // A completed warm-up is valid even if a synchronous driver call or
        // delayed poll crossed the deadline. Only pending work times out.
        return wait(preparationDeadline);
      });
      if (drained !== 'complete') return incompleteGraphicsMeasurement(drained);
      options.onMeasuring?.();
      const deadline = Math.min(timing.measurementDeadline, options.now() + budget / options.views.length);
      const cpuSamples: number[] = [], frameSamples: number[] = [], gpuSamples: number[] = [];
      let status: CalibrationStatus = 'complete';
      while (frameSamples.length < SAMPLES_PER_VIEW) {
        const invalid = validity();
        if (invalid) { status = invalid; break; }
        if (options.now() >= deadline) { status = 'timed-out'; break; }
        const queries: WebGLQuery[] = [];
        const batchCpu: number[] = [], batchGpu: number[] = [];
        const started = options.now();
        try {
          if (extension && gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
            status = 'unavailable'; break;
          }
          for (let index = 0; index < BATCH_SIZE; index++) {
            if (extension) {
              const query = gl.createQuery();
              if (!query) { status = 'unavailable'; break; }
              queries.push(query);
              gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
            }
            const cpuStarted = options.now();
            try { view.draw(); }
            finally { if (extension) gl.endQuery(extension.TIME_ELAPSED_EXT); }
            batchCpu.push(Math.max(0.01, options.now() - cpuStarted));
          }
          if (status !== 'complete') break;
          if (extension) {
            gl.flush();
            for (;;) {
              const invalid = validity();
              if (invalid) { status = invalid; break; }
              if (gl.getParameter(extension.GPU_DISJOINT_EXT)) { status = 'unavailable'; break; }
              if (queries.every(query => gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))) {
                for (const query of queries) batchGpu.push(Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6);
                if (batchGpu.some(ms => !Number.isFinite(ms) || ms <= 0)) status = 'unavailable';
                break;
              }
              if (options.now() >= deadline) { status = 'timed-out'; break; }
              await options.yieldTask();
            }
          } else status = await wait(deadline);
          if (status !== 'complete') break;
          cpuSamples.push(...batchCpu);
          gpuSamples.push(...batchGpu);
          if (extension) frameSamples.push(...batchGpu.map((gpu, index) => Math.max(gpu, batchCpu[index]!)));
          else frameSamples.push(...Array<number>(BATCH_SIZE).fill(Math.max(0.01, (options.now() - started) / BATCH_SIZE)));
        } finally { for (const query of queries) gl.deleteQuery(query); }
      }
      // A completed batch is enough evidence for this view. An interruption or
      // invalid GPU query always invalidates the run, however many samples exist.
      if (status === 'timed-out' && frameSamples.length >= BATCH_SIZE) status = 'complete';
      views.push({ status, sampleCount: frameSamples.length, frameMs: upperFrame(frameSamples),
        cpuMs: upperFrame(cpuSamples), ...(extension ? { gpuMs: upperFrame(gpuSamples) } : {}),
        method: extension ? 'gpu-timer' : 'completion' });
      if (status !== 'complete') break;
    }
    return combineGraphicsMeasurements(views);
  } catch {
    return incompleteGraphicsMeasurement(options.isCurrent() ? 'unavailable' : 'interrupted');
  }
}
