export type EventHandler<Payload> = (payload: Payload) => void;

/**
 * Minimal typed pub/sub for discrete cross-system events.
 *
 * Continuous state such as movement input should be queried directly instead
 * of being broadcast every fixed update.
 */
export class EventBus<Events extends object> {
  private readonly listeners = new Map<
    keyof Events,
    Set<(payload: unknown) => void>
  >();

  on<EventName extends keyof Events>(
    eventName: EventName,
    handler: EventHandler<Events[EventName]>,
  ): () => void {
    let handlers = this.listeners.get(eventName);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(eventName, handlers);
    }

    const storedHandler = handler as (payload: unknown) => void;
    handlers.add(storedHandler);

    return () => this.off(eventName, handler);
  }

  off<EventName extends keyof Events>(
    eventName: EventName,
    handler: EventHandler<Events[EventName]>,
  ): void {
    const handlers = this.listeners.get(eventName);
    if (!handlers) return;

    handlers.delete(handler as (payload: unknown) => void);
    if (handlers.size === 0) this.listeners.delete(eventName);
  }

  emit<EventName extends keyof Events>(
    eventName: EventName,
    payload: Events[EventName],
  ): void {
    const handlers = this.listeners.get(eventName);
    if (!handlers) return;

    for (const handler of handlers) handler(payload);
  }

  clear(eventName?: keyof Events): void {
    if (eventName === undefined) {
      this.listeners.clear();
    } else {
      this.listeners.delete(eventName);
    }
  }
}
