export class CultivationTestPanel {
  readonly element: HTMLElement;
  private readonly runtimeStatus: HTMLElement;

  constructor(
    onReset: () => void,
    onAdvanceSupport?: (complete: boolean) => void,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'test-panel cultivation-test-panel';
    this.element.innerHTML = `
      <div class="test-panel-content">
        <p class="eyebrow">Level 2 foundation harness</p>
        <h1>Cultivation runtime</h1>
        <p class="summary">Validate dual-body checkpoints, split room entry, radiation identity policy, and lifecycle cleanup.</p>
        <div class="controls">
          <button type="button" data-action="reset">Reset Level 2 <kbd>R</kbd></button>
          <button type="button" data-action="partial-support">Partially dissolve next support</button>
          <button type="button" data-action="complete-support">Complete next support</button>
        </div>
        <p class="eyebrow diagnostics-heading">Runtime diagnostics</p>
        <pre class="runtime-status" data-runtime-status>Waiting for runtime samples…</pre>
      </div>
    `;
    const button = this.element.querySelector<HTMLButtonElement>('[data-action="reset"]');
    const partialSupportButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="partial-support"]',
    );
    const completeSupportButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="complete-support"]',
    );
    const runtimeStatus = this.element.querySelector<HTMLElement>('[data-runtime-status]');
    if (!button || !partialSupportButton || !completeSupportButton || !runtimeStatus) {
      throw new Error('Missing Cultivation debug controls.');
    }
    this.runtimeStatus = runtimeStatus;
    const advancePartialSupport = () => onAdvanceSupport?.(false);
    const advanceCompleteSupport = () => onAdvanceSupport?.(true);
    button.addEventListener('click', onReset);
    partialSupportButton.addEventListener('click', advancePartialSupport);
    completeSupportButton.addEventListener('click', advanceCompleteSupport);
    this.disposeAction = () => {
      button.removeEventListener('click', onReset);
      partialSupportButton.removeEventListener('click', advancePartialSupport);
      completeSupportButton.removeEventListener('click', advanceCompleteSupport);
    };
  }

  setRuntimeDiagnostics(text: string): void {
    this.runtimeStatus.textContent = text;
  }

  dispose(): void {
    this.disposeAction();
    this.element.remove();
  }

  private readonly disposeAction: () => void;
}
