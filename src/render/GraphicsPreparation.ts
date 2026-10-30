interface ResourcePreparation { key: string; prepare(): Promise<void> }
interface Request { key: string; apply(): void; prepare(): Promise<void>; resources?: ResourcePreparation }

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
  private resourceKey: string | undefined;
  private appliedResourceKey: string | undefined;
  private readonly notify: (pending: boolean, error?: unknown) => void;
  settled: Promise<void> = Promise.resolve();

  constructor(notify: (pending: boolean, error?: unknown) => void) { this.notify = notify; }
  get pending(): boolean { return this.blocked; }

  /** Temporary preset probes may release storage even if the final choice is unchanged. */
  invalidatePrepared(): void { this.key = this.resourceKey = undefined; }

  update(key: string, apply: () => void, prepare: () => Promise<void>, resources?: ResourcePreparation): void {
    if (!this.blocked && (this.firstUpdate || (this.key === key && this.resourceKey === resources?.key))) {
      apply(); this.firstUpdate = false; this.appliedKey = this.key = key;
      this.appliedResourceKey = this.resourceKey = resources?.key; return;
    }
    this.queued = {key, apply, prepare, resources};
    if (this.blocked) return;
    this.blocked = true; this.notify(true);
    this.settled = this.run(++this.generation);
  }

  cancel(): void {
    ++this.generation; this.queued = undefined; this.failure = undefined;
    this.key = undefined; this.resourceKey = undefined;
    if (this.blocked) { this.blocked = false; this.notify(false); }
  }

  /** Initial loading owns the full warm-up after an optional preset selection. */
  stageInitial(key: string, apply: () => void, resourceKey?: string): void {
    if (this.blocked) throw new Error('Cannot stage settings during graphics preparation.');
    apply();
    this.firstUpdate = false;
    this.appliedKey = key;
    this.appliedResourceKey = resourceKey;
    this.key = this.resourceKey = undefined;
  }

  /** A new runtime's normal loading path has prepared the applied features. */
  adoptPrepared(): void { this.key = this.appliedKey; this.resourceKey = this.appliedResourceKey; }

  private async run(generation: number): Promise<void> {
    try {
      while (this.queued && generation === this.generation) {
        const request = this.queued; this.queued = undefined;
        request.apply();
        this.appliedKey = request.key;
        this.appliedResourceKey = request.resources?.key;
        if (request.key !== this.key) await request.prepare();
        else if (request.resources && request.resources.key !== this.resourceKey) await request.resources.prepare();
        if (generation !== this.generation) return;
        this.key = request.key;
        this.resourceKey = request.resources?.key;
      }
      if (generation === this.generation) { this.blocked = false; this.notify(false); }
    } catch (error) {
      if (generation !== this.generation) return;
      this.failure = error;
      this.notify(true, this.failure);
    }
  }
}
