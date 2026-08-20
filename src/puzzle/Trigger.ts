import { EventBus } from '../core/EventBus.ts';

const EMPTY_OCCUPANTS: readonly string[] = [];

export interface TriggerOccupancyEvent {
  readonly trigger: Trigger;
  readonly occupantId: string;
}

export interface TriggerEvents {
  entered: TriggerOccupancyEvent;
  exited: TriggerOccupancyEvent;
  occupancyChanged: {
    readonly trigger: Trigger;
    readonly occupants: ReadonlySet<string>;
  };
}

/**
 * Tracks the unique bodies currently inside an authored sensor volume.
 * Collision code supplies stable body IDs; the trigger deliberately does not
 * depend on a specific physics implementation.
 */
export class Trigger {
  readonly events = new EventBus<TriggerEvents>();
  readonly id: string;

  private readonly occupantIds = new Set<string>();
  private readonly scratchOccupantIds = new Set<string>();

  constructor(id: string) {
    this.id = id;
  }

  get occupants(): ReadonlySet<string> {
    return this.occupantIds;
  }

  get occupied(): boolean {
    return this.occupantIds.size > 0;
  }

  /**
   * Reconciles the full occupancy snapshot for this fixed update. Duplicate
   * IDs are ignored, so a body can never activate the trigger twice.
   */
  setOccupants(occupantIds: Iterable<string>): void {
    const nextOccupants = this.scratchOccupantIds;
    nextOccupants.clear();
    for (const occupantId of occupantIds) {
      if (occupantId) nextOccupants.add(occupantId);
    }

    let changed = false;
    for (const occupantId of nextOccupants) {
      if (this.occupantIds.has(occupantId)) continue;
      this.occupantIds.add(occupantId);
      this.events.emit('entered', { trigger: this, occupantId });
      changed = true;
    }

    for (const occupantId of this.occupantIds) {
      if (nextOccupants.has(occupantId)) continue;
      this.occupantIds.delete(occupantId);
      this.events.emit('exited', { trigger: this, occupantId });
      changed = true;
    }

    if (changed) {
      this.events.emit('occupancyChanged', {
        trigger: this,
        occupants: this.occupantIds,
      });
    }
  }

  clear(): void {
    this.setOccupants(EMPTY_OCCUPANTS);
  }

  dispose(): void {
    this.clear();
    this.events.clear();
  }
}
