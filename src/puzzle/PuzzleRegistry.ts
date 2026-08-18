/** A puzzle object whose mutable state can return to its authored state. */
export interface ResettablePuzzleComponent {
  reset(): void;
}

interface RegisteredPuzzleComponent {
  readonly id: string;
  readonly component: ResettablePuzzleComponent;
}

/**
 * Per-level ownership of mutable puzzle state. Components reset in registration
 * order, making authored restoration deterministic without rebuilding level data.
 */
export class PuzzleRegistry {
  private readonly components: RegisteredPuzzleComponent[] = [];
  private readonly componentIds = new Set<string>();

  register(id: string, component: ResettablePuzzleComponent): void {
    if (!id) throw new Error('Puzzle registry IDs cannot be empty.');
    if (this.componentIds.has(id)) {
      throw new Error(`Puzzle component "${id}" is already registered.`);
    }

    this.componentIds.add(id);
    this.components.push({ id, component });
  }

  reset(): void {
    for (const { component } of this.components) component.reset();
  }

  clear(): void {
    this.components.length = 0;
    this.componentIds.clear();
  }
}
