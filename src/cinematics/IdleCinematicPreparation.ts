export interface CinematicPreparationJob {
  readonly label: string;
  readonly gpu?: boolean;
  readonly run: () => void | Promise<unknown>;
}
interface IdleHost {
  requestIdleCallback?: (callback: IdleRequestCallback) => number;
  cancelIdleCallback?: (id: number) => void;
}

/** Best-effort idle work: one bounded job, no deadline/timeout forcing a busy browser. */
export class IdleCinematicPreparation {
  readonly diagnostics = { completed: 0, pending: false, failed: false, lastJob: '', maxSubmissionMs: 0 };
  private iterator: Iterator<CinematicPreparationJob>;
  private next: IteratorResult<CinematicPreparationJob> | undefined;
  private handle: number | undefined;
  private busy = false;
  private disposed = false;
  private complete = false;
  constructor(jobs: Iterable<CinematicPreparationJob>, privateHost: IdleHost,
    canRun: (gpu: boolean) => boolean, now: () => number = () => performance.now()) {
    this.iterator = jobs[Symbol.iterator](); this.host = privateHost; this.canRun = canRun; this.now = now;
  }
  private readonly host: IdleHost;
  private readonly canRun: (gpu: boolean) => boolean;
  private readonly now: () => number;
  get ready(): boolean { return this.complete; }
  schedule(): void {
    if (this.disposed || this.complete || this.busy || this.diagnostics.failed || this.handle !== undefined || !this.host.requestIdleCallback) return;
    this.handle = this.host.requestIdleCallback(deadline => {
      this.handle = undefined;
      if (!deadline.didTimeout && deadline.timeRemaining() >= 8) this.step(false);
      // The render loop requests the next idle slot. Do not spin idle callbacks
      // while a GPU job is waiting for Room 5 or the player has paused.
    });
  }
  /** Called only behind the cinematic's opaque preparation screen. */
  finishOneJobUnderBlack(): void { this.step(true); }
  private step(underBlack: boolean): void {
    if (this.disposed || this.complete || this.busy || this.diagnostics.failed) return;
    const start = this.now();
    try {
      this.next ??= this.iterator.next();
      if (this.next.done) { this.complete = true; this.diagnostics.pending = false; return; }
      if (!underBlack && !this.canRun(!!this.next.value.gpu)) return;
      const job = this.next.value;
      this.next = undefined; this.busy = true; this.diagnostics.pending = true;
      this.diagnostics.lastJob = job.label;
      const pending = job.run();
      this.diagnostics.maxSubmissionMs = Math.max(this.diagnostics.maxSubmissionMs,this.now()-start);
      void Promise.resolve(pending).then(() => {
        if (this.disposed) return;
        this.diagnostics.completed++; this.busy = false;
      }, () => { if (!this.disposed) { this.busy = false; this.diagnostics.failed = true; this.diagnostics.pending = false; } });
    } catch { this.busy = false; this.diagnostics.failed = true; this.diagnostics.pending = false; }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.diagnostics.pending = false;
    if (this.handle !== undefined) this.host.cancelIdleCallback?.(this.handle);
    this.handle = undefined; this.iterator.return?.();
  }
}
