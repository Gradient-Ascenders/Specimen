interface GreyboxTestPanelOptions {
  onReset: () => void;
  onTestRecovery: (onRecovered: () => void) => void;
}

/** DOM controls and legend used only by the grey-box development harness. */
export class GreyboxTestPanel {
  readonly element: HTMLElement;

  private readonly status: HTMLElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly fallButton: HTMLButtonElement;

  constructor(private readonly options: GreyboxTestPanelOptions) {
    this.element = document.createElement('section');
    this.element.className = 'test-panel';
    this.element.innerHTML = `
      <p class="eyebrow">Sprint 0 test harness</p>
      <h1>Collision grey-box</h1>
      <p class="summary">One grid square equals one metre. Geometry is named and colour-coded for repeatable collision checks.</p>
      <ul class="case-list" aria-label="Collision test case legend">
        <li style="--case-colour: #81909b">Floor</li>
        <li style="--case-colour: #568bd8">Wall</li>
        <li style="--case-colour: #e3994b">Ledge</li>
        <li style="--case-colour: #d6c650">Slope</li>
        <li style="--case-colour: #d95f8d">Gap</li>
        <li style="--case-colour: #62bf83">Platform</li>
      </ul>
      <p class="surface-key"><span class="sticky-key">Sticky wall</span><span class="bouncy-key">Bounce pad</span></p>
      <p class="probe-status" role="status">Probe is at spawn.</p>
      <div class="controls">
        <button type="button" data-action="reset">Reset probe <kbd>R</kbd></button>
        <button type="button" data-action="fall">Test recovery <kbd>F</kbd></button>
      </div>
    `;

    const status = this.element.querySelector<HTMLElement>('.probe-status');
    const resetButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="reset"]',
    );
    const fallButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="fall"]',
    );

    if (!status || !resetButton || !fallButton) {
      throw new Error('Missing collision test controls.');
    }

    this.status = status;
    this.resetButton = resetButton;
    this.fallButton = fallButton;

    this.resetButton.addEventListener('click', this.resetProbe);
    this.fallButton.addEventListener('click', this.testRecovery);
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    this.resetButton.removeEventListener('click', this.resetProbe);
    this.fallButton.removeEventListener('click', this.testRecovery);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private readonly resetProbe = (): void => {
    this.options.onReset();
    this.status.textContent = 'Probe reset to the cyan spawn marker.';
  };

  private readonly testRecovery = (): void => {
    this.options.onTestRecovery(() => {
      this.status.textContent = 'Recovery volume returned the probe to spawn.';
    });
    this.status.textContent = 'Probe entered the red recovery volume…';
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;

    if (event.code === 'KeyR') this.resetProbe();
    if (event.code === 'KeyF') this.testRecovery();
  };
}
