interface ProgramBindings {
  getUniforms(): unknown;
  isReady?(): boolean;
}

/** compile() can return before the driver's first-use link/reflection work.
 * Resolve each program's real uniform/attribute cache separately so one hidden
 * room draw does not collect every deferred shader stall into a single task. */
export class ProgramBindingPrewarm {
  private readonly ready = new WeakSet<ProgramBindings>();

  async prepare(
    programs: readonly ProgramBindings[] | null | undefined,
    yieldPreparation: (() => Promise<void>) | undefined,
    isCurrent: () => boolean,
  ): Promise<void> {
    const pending = [...new Set(programs ?? [])].filter(program => !this.ready.has(program));
    // Submit every variant before asking the driver for uniform locations or
    // diagnostics. Those synchronous queries otherwise serialize compilation,
    // including variants compileAsync misses when one material has many states.
    while (isCurrent() && pending.some(program => program.isReady?.() === false)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (!isCurrent()) return;
    for (const program of pending) {
      if (this.ready.has(program)) continue;
      await yieldPreparation?.();
      if (!isCurrent()) return;
      // Three's typed getUniforms() also populates its attribute cache. This
      // performs the same work the first draw would, without drawing/clearing.
      program.getUniforms();
      this.ready.add(program);
    }
  }
}
