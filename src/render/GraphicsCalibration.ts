import type { GraphicsProfileId } from './GraphicsProfiles.ts';

export const GRAPHICS_CALIBRATION_BUDGET_MS = 600;
const SAMPLES_PER_VIEW = 10;
export interface GraphicsCalibrationResult {
  readonly profile: GraphicsProfileId;
  readonly sampleCount: number;
  readonly frameMs: number;
  readonly timedOut: boolean;
}
export interface CalibrationView {
  /** Shared with normal preparation; cold shader/upload time is not a sample. */
  warm(): Promise<void>;
  draw(): void;
}

/** Conservative headroom for busier rooms and High's larger capture/shadow budgets. */
export function chooseAutomaticGraphicsProfile(samples: readonly number[]): GraphicsProfileId {
  if (samples.length < 4 || samples.some(ms => !Number.isFinite(ms) || ms <= 0)) return 'minimum';
  const sorted = [...samples].sort((a, b) => a - b);
  const upper = sorted[Math.ceil(sorted.length * 0.8) - 1]!;
  return upper <= 4 ? 'high' : upper <= 14 ? 'standard' : 'minimum';
}

/** Bounded, asynchronous GPU completion timing; independent of FPS caps/vsync.
 * Compilation is ordinary shared preparation, never repeated for every preset. */
export async function calibrateGraphics(options: {
  context: WebGL2RenderingContext;
  views: readonly CalibrationView[];
  now(): number;
  yieldTask(): Promise<void>;
  isCurrent(): boolean;
  budgetMs?: number;
}): Promise<GraphicsCalibrationResult> {
  const { context: gl } = options;
  const samples: number[] = [];
  let remainingMs = Math.min(GRAPHICS_CALIBRATION_BUDGET_MS, options.budgetMs ?? GRAPHICS_CALIBRATION_BUDGET_MS);
  let timedOut = false;
  const wait = async (deadline: number): Promise<boolean> => {
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!fence) return false;
    try {
      gl.flush();
      while (options.isCurrent() && !gl.isContextLost() && options.now() < deadline) {
        const status = gl.clientWaitSync(fence, 0, 0);
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return true;
        if (status === gl.WAIT_FAILED) return false;
        await options.yieldTask();
      }
      return false;
    } finally { gl.deleteSync(fence); }
  };
  for (const view of options.views) {
    if (!options.isCurrent() || remainingMs <= 0) { timedOut = true; break; }
    await view.warm();
    // Drain cold uploads first. A slow warm-up does not masquerade as frame cost.
    let started = options.now();
    if (!await wait(started + remainingMs)) { timedOut = true; break; }
    remainingMs -= options.now() - started;
    for (let index = 0; index < SAMPLES_PER_VIEW; index++) {
      if (!options.isCurrent() || remainingMs <= 0) { timedOut = true; break; }
      started = options.now();
      view.draw();
      if (!await wait(started + remainingMs)) { timedOut = true; break; }
      const elapsed = Math.max(0.01, options.now() - started);
      samples.push(elapsed);
      remainingMs -= elapsed;
    }
    if (timedOut) break;
  }
  const ordered = [...samples].sort((a, b) => a - b);
  return { profile: timedOut ? 'minimum' : chooseAutomaticGraphicsProfile(samples), sampleCount: samples.length,
    frameMs: ordered[Math.ceil(ordered.length * 0.8) - 1] ?? 0, timedOut };
}
