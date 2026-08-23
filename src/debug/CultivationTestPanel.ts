export class CultivationTestPanel {
  readonly element: HTMLElement;
  private readonly runtimeStatus: HTMLElement;

  constructor(onReset: () => void) {
    this.element = document.createElement('section');
    this.element.className = 'test-panel cultivation-test-panel';
    this.element.innerHTML = `
      <div class="test-panel-content">
        <p class="eyebrow">Level 2 foundation harness</p>
        <h1>Cultivation runtime</h1>
        <p class="summary">Validate dual-body checkpoints, split room entry, radiation identity policy, and lifecycle cleanup.</p>
        <div class="controls"><button type="button" data-action="reset">Reset Level 2 <kbd>R</kbd></button></div>
        <p class="eyebrow diagnostics-heading">Runtime diagnostics</p>
        <pre class="runtime-status" data-runtime-status>Waiting for runtime samples…</pre>
      </div>
    `;
    const button = this.element.querySelector<HTMLButtonElement>('[data-action="reset"]');
    const runtimeStatus = this.element.querySelector<HTMLElement>('[data-runtime-status]');
    if (!button || !runtimeStatus) throw new Error('Missing Cultivation debug controls.');
    this.runtimeStatus = runtimeStatus;
    button.addEventListener('click', onReset);
    this.disposeAction = () => button.removeEventListener('click', onReset);
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
