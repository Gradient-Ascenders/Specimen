import { EventBus } from '../core/EventBus.ts';
import {
  SLIME_DEFINITIONS,
  type SlimeAbility,
  type SlimeDefinition,
  type SlimeId,
} from './SlimeRoster.ts';

export interface SlimeManagerEvents {
  unlocked: { readonly slimeId: SlimeId };
  registered: { readonly slimeId: SlimeId };
  unregistered: { readonly slimeId: SlimeId };
  activeChanged: {
    readonly previousSlimeId: SlimeId | undefined;
    readonly slimeId: SlimeId | undefined;
  };
}

export interface SlimeRosterState {
  readonly id: SlimeId;
  readonly displayName: string;
  readonly betaPlayable: boolean;
  readonly unlocked: boolean;
  readonly registered: boolean;
  readonly active: boolean;
}

export interface SlimeManagerDiagnostics {
  readonly activeSlimeId: SlimeId | undefined;
  readonly registeredCount: number;
  readonly unlockedCount: number;
  readonly availableCount: number;
}

/**
 * Level-owned runtime boundary for the multi-slime roster.
 *
 * The manager owns identity, unlock state, active/inactive selection, runtime
 * body registration, and ability gating. It does not construct, move, render,
 * recover, or dispose gameplay bodies; those remain responsibilities of the
 * concrete level/runtime systems that own them.
 */
export class SlimeManager<Body extends object> {
  readonly events = new EventBus<SlimeManagerEvents>();

  private readonly definitions = new Map<SlimeId, SlimeDefinition>();
  private readonly unlockedIds = new Set<SlimeId>();
  private readonly bodies = new Map<SlimeId, Body>();
  private activeSlimeIdValue: SlimeId | undefined;
  private disposed = false;

  constructor(
    definitions: readonly SlimeDefinition[] = SLIME_DEFINITIONS,
    private readonly preferredDefaultSlimeId: SlimeId = 'bob',
  ) {
    if (definitions.length === 0) {
      throw new Error('SlimeManager requires at least one slime definition.');
    }

    for (const definition of definitions) {
      if (this.definitions.has(definition.id)) {
        throw new Error(`Duplicate slime definition "${definition.id}".`);
      }
      this.definitions.set(definition.id, definition);
      if (
        definition.betaAvailability === 'playable' &&
        definition.initiallyUnlocked
      ) {
        this.unlockedIds.add(definition.id);
      }
    }

    if (!this.definitions.has(this.preferredDefaultSlimeId)) {
      throw new Error(
        `Default slime "${this.preferredDefaultSlimeId}" is not configured.`,
      );
    }
  }

  get activeSlimeId(): SlimeId | undefined {
    return this.activeSlimeIdValue;
  }

  get activeDefinition(): SlimeDefinition | undefined {
    return this.activeSlimeIdValue
      ? this.getDefinition(this.activeSlimeIdValue)
      : undefined;
  }

  get activeBody(): Body | undefined {
    return this.activeSlimeIdValue
      ? this.bodies.get(this.activeSlimeIdValue)
      : undefined;
  }

  get registeredCount(): number {
    return this.bodies.size;
  }

  getDefinition(id: SlimeId): SlimeDefinition {
    this.assertNotDisposed('read slime configuration');
    const definition = this.definitions.get(id);
    if (!definition) {
      throw new Error(`Slime "${id}" is not configured for this manager.`);
    }
    return definition;
  }

  isUnlocked(id: SlimeId): boolean {
    this.assertNotDisposed('query slime unlock state');
    return this.unlockedIds.has(id);
  }

  isRegistered(id: SlimeId): boolean {
    this.assertNotDisposed('query slime registration');
    return this.bodies.has(id);
  }

  /** Runtime availability requires Beta scope + unlock + registered body. */
  isAvailable(id: SlimeId): boolean {
    this.assertNotDisposed('query slime availability');
    const definition = this.getDefinition(id);
    return (
      definition.betaAvailability === 'playable' &&
      this.unlockedIds.has(id) &&
      this.bodies.has(id)
    );
  }

  /** Locked scope such as Volt cannot be unlocked through the Beta manager. */
  unlock(id: SlimeId): boolean {
    this.assertNotDisposed('unlock a slime');
    const definition = this.getDefinition(id);
    if (definition.betaAvailability !== 'playable') return false;
    if (this.unlockedIds.has(id)) return false;

    this.unlockedIds.add(id);
    this.events.emit('unlocked', { slimeId: id });
    this.ensureValidActiveSelection();
    return true;
  }

  registerBody(id: SlimeId, body: Body): void {
    this.assertNotDisposed('register a slime body');
    const definition = this.getDefinition(id);
    if (definition.betaAvailability !== 'playable') {
      throw new Error(
        `${definition.displayName} is locked for the current Beta scope and cannot register a playable body.`,
      );
    }
    if (this.bodies.has(id)) {
      throw new Error(
        `A runtime body is already registered for ${definition.displayName}.`,
      );
    }

    this.bodies.set(id, body);
    this.events.emit('registered', { slimeId: id });
    this.ensureValidActiveSelection();
  }

  unregisterBody(id: SlimeId): boolean {
    this.assertNotDisposed('unregister a slime body');
    if (!this.bodies.delete(id)) return false;

    const wasActive = this.activeSlimeIdValue === id;
    this.events.emit('unregistered', { slimeId: id });
    if (wasActive) {
      const previous = this.activeSlimeIdValue;
      this.activeSlimeIdValue = undefined;
      this.ensureValidActiveSelection(previous);
    }
    return true;
  }

  getBody(id: SlimeId): Body | undefined {
    this.assertNotDisposed('read a slime body');
    return this.bodies.get(id);
  }

  /** Defines the state transition; actual switch input/UI belongs to #28. */
  activate(id: SlimeId): boolean {
    this.assertNotDisposed('activate a slime');
    if (!this.isAvailable(id)) return false;
    if (this.activeSlimeIdValue === id) return true;

    const previous = this.activeSlimeIdValue;
    this.activeSlimeIdValue = id;
    this.events.emit('activeChanged', {
      previousSlimeId: previous,
      slimeId: id,
    });
    return true;
  }

  canUseAbility(id: SlimeId, ability: SlimeAbility): boolean {
    this.assertNotDisposed('query an ability');
    if (!this.isAvailable(id)) return false;
    return this.getDefinition(id).abilities[ability];
  }

  canActiveUseAbility(ability: SlimeAbility): boolean {
    this.assertNotDisposed('query the active slime ability');
    return (
      this.activeSlimeIdValue !== undefined &&
      this.canUseAbility(this.activeSlimeIdValue, ability)
    );
  }

  /** Callback never executes when active slime/capability is unavailable. */
  invokeActiveAbility(
    ability: SlimeAbility,
    action: (body: Body, definition: SlimeDefinition) => void,
  ): boolean {
    this.assertNotDisposed('invoke an ability');
    const id = this.activeSlimeIdValue;
    if (!id || !this.canUseAbility(id, ability)) return false;

    const body = this.bodies.get(id);
    if (!body) return false;
    action(body, this.getDefinition(id));
    return true;
  }

  /** Restarts preserve unlocks, registrations, and a valid active selection. */
  resetForLevelRestart(): void {
    this.assertNotDisposed('reset slime state for a level restart');
    this.ensureValidActiveSelection();
  }

  /** Clear level-owned body references without changing progression unlocks. */
  clearLevelRegistrations(): void {
    this.assertNotDisposed('clear level slime registrations');

    const registeredIds = [...this.bodies.keys()];
    const previous = this.activeSlimeIdValue;
    this.bodies.clear();
    this.activeSlimeIdValue = undefined;

    for (const slimeId of registeredIds) {
      this.events.emit('unregistered', { slimeId });
    }
    if (previous !== undefined) {
      this.events.emit('activeChanged', {
        previousSlimeId: previous,
        slimeId: undefined,
      });
    }
  }

  getRosterState(): readonly SlimeRosterState[] {
    this.assertNotDisposed('read slime roster state');
    return [...this.definitions.values()].map((definition) => ({
      id: definition.id,
      displayName: definition.displayName,
      betaPlayable: definition.betaAvailability === 'playable',
      unlocked: this.unlockedIds.has(definition.id),
      registered: this.bodies.has(definition.id),
      active: this.activeSlimeIdValue === definition.id,
    }));
  }

  getDiagnostics(): SlimeManagerDiagnostics {
    this.assertNotDisposed('read slime diagnostics');
    let availableCount = 0;
    for (const id of this.definitions.keys()) {
      if (this.isAvailable(id)) availableCount += 1;
    }

    return {
      activeSlimeId: this.activeSlimeIdValue,
      registeredCount: this.bodies.size,
      unlockedCount: this.unlockedIds.size,
      availableCount,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.bodies.clear();
    this.unlockedIds.clear();
    this.activeSlimeIdValue = undefined;
    this.events.clear();
    this.disposed = true;
  }

  private ensureValidActiveSelection(previousOverride?: SlimeId): void {
    if (
      this.activeSlimeIdValue &&
      this.isAvailable(this.activeSlimeIdValue)
    ) {
      return;
    }

    const previous = previousOverride ?? this.activeSlimeIdValue;
    let next: SlimeId | undefined;

    if (this.isAvailable(this.preferredDefaultSlimeId)) {
      next = this.preferredDefaultSlimeId;
    } else {
      for (const id of this.definitions.keys()) {
        if (this.isAvailable(id)) {
          next = id;
          break;
        }
      }
    }

    if (previous === next && this.activeSlimeIdValue === next) return;
    this.activeSlimeIdValue = next;
    if (previous !== next) {
      this.events.emit('activeChanged', {
        previousSlimeId: previous,
        slimeId: next,
      });
    }
  }

  private assertNotDisposed(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} after SlimeManager disposal.`);
    }
  }
}
