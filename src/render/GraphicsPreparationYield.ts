interface TaskScheduler { yield(): Promise<void> }

/** Return control between covered loading jobs without waiting for a display
 * frame. Message tasks also avoid nested-timer delays in Firefox. */
export class GraphicsPreparationYield {
  private channel: MessageChannel | undefined;
  private readonly pending: (() => void)[] = [];
  private disposed = false;
  private readonly scheduler: TaskScheduler | undefined;
  private readonly createChannel: () => MessageChannel;

  constructor(
    scheduler?: TaskScheduler,
    createChannel = () => new MessageChannel(),
  ) {
    this.scheduler = scheduler;
    this.createChannel = createChannel;
  }

  yield(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.scheduler?.yield) return this.scheduler.yield();
    if (!this.channel) {
      this.channel = this.createChannel();
      this.channel.port1.onmessage = () => this.pending.shift()?.();
    }
    return new Promise(resolve => {
      this.pending.push(resolve);
      this.channel!.port2.postMessage(null);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.channel?.port1.close();
    this.channel?.port2.close();
    for (const resolve of this.pending.splice(0)) resolve();
  }
}
