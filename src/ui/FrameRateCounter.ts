/** Half-second render-frame average; no extra animation loop or profiler. */
export class FrameRateCounter {
  private seconds = 0;
  private frames = 0;

  sample(deltaSeconds: number): number | undefined {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return undefined;
    // The application loop resets its clock on pause/focus changes. A long
    // rendered frame is still a valid sample, including on software renderers.
    this.seconds += deltaSeconds;
    this.frames++;
    if (this.seconds + 1e-9 < 0.5) return undefined;
    const fps = Math.round(this.frames / this.seconds);
    this.reset();
    return fps;
  }

  reset(): void {
    this.seconds = 0;
    this.frames = 0;
  }
}
