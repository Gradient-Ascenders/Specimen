interface Request { key: string; apply(): void; prepare(): Promise<void> }

/** Serialize material mutations with pending compiler polls. A frame budget
 * cannot interrupt a driver call; required first use stays behind the gate. */
export class GraphicsPreparation {
  private key: string | undefined;
  private queued: Request | undefined;
  private generation = 0;
  private blocked = false;
  private failure: unknown;
  private firstUpdate = true;
  private appliedKey: string | undefined;
  private readonly notify: (pending: boolean, error?: unknown) => void;
  settled: Promise<void> = Promise.resolve();

  constructor(notify: (pending: boolean, error?: unknown) => void) { this.notify = notify; }
  get pending(): boolean { return this.blocked; }

  update(key: string, apply: () => void, prepare: () => Promise<void>): void {
    if (!this.blocked && (this.firstUpdate || this.key === key)) {
      apply(); this.firstUpdate = false; this.appliedKey = this.key = key; return;
    }
    this.queued = {key, apply, prepare};
    if (this.blocked) return;
    this.blocked = true; this.notify(true);
    this.settled = this.run(++this.generation);
  }

  cancel(): void {
    ++this.generation; this.queued = undefined; this.failure = undefined;
    this.key = undefined;
    if (this.blocked) { this.blocked = false; this.notify(false); }
  }

  /** A new runtime's normal loading path has prepared the applied features. */
  adoptPrepared(): void { this.key = this.appliedKey; }

  private async run(generation: number): Promise<void> {
    try {
      while (this.queued && generation === this.generation) {
        const request = this.queued; this.queued = undefined;
        request.apply();
        this.appliedKey = request.key;
        if (request.key !== this.key) await request.prepare();
        if (generation !== this.generation) return;
        this.key = request.key;
      }
      if (generation === this.generation) { this.blocked = false; this.notify(false); }
    } catch (error) {
      if (generation !== this.generation) return;
      this.failure = error;
      this.notify(true, this.failure);
    }
  }
}
