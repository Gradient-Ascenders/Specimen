interface GreyboxTestPanelOptions {
  onReset: () => void;
  onTestRecovery: (onRecovered: () => void) => void;
  onTogglePuzzleTest: () => boolean;
  onRunSensorRegression: () => void;
  onRunResetRegression: () => void;
  onActivateCheckpoint: () => void;
  onRecoverCheckpoint: () => void;
}

/** DOM controls and legend used only by the grey-box development harness. */
export class GreyboxTestPanel {
  readonly element: HTMLElement;

  private readonly status: HTMLElement;
  private readonly runtimeStatus: HTMLElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly fallButton: HTMLButtonElement;
  private readonly puzzleButton: HTMLButtonElement;
  private readonly sensorRegressionButton: HTMLButtonElement;
  private readonly resetRegressionButton: HTMLButtonElement;
  private readonly checkpointButton: HTMLButtonElement;
  private readonly checkpointRecoveryButton: HTMLButtonElement;

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
        <button type="button" data-action="puzzle">Toggle plate test</button>
        <button type="button" data-action="sensor-regression">Run sensor checks</button>
        <button type="button" data-action="reset-regression">Run 10 reset cycles</button>
        <button type="button" data-action="checkpoint">Activate elevated checkpoint</button>
        <button type="button" data-action="checkpoint-recovery">Recover at checkpoint</button>
      </div>
      <p class="eyebrow">Runtime / render diagnostics</p>
      <pre class="runtime-status" data-runtime-status>Waiting for runtime samples…</pre>
    `;

    const status = this.element.querySelector<HTMLElement>('.probe-status');
    const runtimeStatus = this.element.querySelector<HTMLElement>(
      '[data-runtime-status]',
    );
    const resetButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="reset"]',
    );
    const fallButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="fall"]',
    );
    const puzzleButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="puzzle"]',
    );
    const sensorRegressionButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="sensor-regression"]',
    );
    const resetRegressionButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="reset-regression"]',
    );
    const checkpointButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="checkpoint"]',
    );
    const checkpointRecoveryButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="checkpoint-recovery"]',
    );

    if (
      !status ||
      !runtimeStatus ||
      !resetButton ||
      !fallButton ||
      !puzzleButton ||
      !sensorRegressionButton ||
      !resetRegressionButton ||
      !checkpointButton ||
      !checkpointRecoveryButton
    ) {
      throw new Error('Missing collision test controls.');
    }

    this.status = status;
    this.runtimeStatus = runtimeStatus;
    this.resetButton = resetButton;
    this.fallButton = fallButton;
    this.puzzleButton = puzzleButton;
    this.sensorRegressionButton = sensorRegressionButton;
    this.resetRegressionButton = resetRegressionButton;
    this.checkpointButton = checkpointButton;
    this.checkpointRecoveryButton = checkpointRecoveryButton;

    this.resetButton.addEventListener('click', this.resetProbe);
    this.fallButton.addEventListener('click', this.testRecovery);
    this.puzzleButton.addEventListener('click', this.togglePuzzleTest);
    this.sensorRegressionButton.addEventListener('click', this.runSensorRegression);
    this.resetRegressionButton.addEventListener('click', this.runResetRegression);
    this.checkpointButton.addEventListener('click', this.activateCheckpoint);
    this.checkpointRecoveryButton.addEventListener('click', this.recoverCheckpoint);
  }

  dispose(): void {
    this.resetButton.removeEventListener('click', this.resetProbe);
    this.fallButton.removeEventListener('click', this.testRecovery);
    this.puzzleButton.removeEventListener('click', this.togglePuzzleTest);
    this.sensorRegressionButton.removeEventListener(
      'click',
      this.runSensorRegression,
    );
    this.resetRegressionButton.removeEventListener('click', this.runResetRegression);
    this.checkpointButton.removeEventListener('click', this.activateCheckpoint);
    this.checkpointRecoveryButton.removeEventListener(
      'click',
      this.recoverCheckpoint,
    );
  }

  readonly resetProbe = (): void => {
    this.options.onReset();
    this.status.textContent = 'Probe reset to the cyan spawn marker.';
  };

  readonly testRecovery = (): void => {
    this.options.onTestRecovery(() => {
      this.status.textContent = 'Recovery volume returned the probe to spawn.';
    });
    this.status.textContent = 'Probe entered the red recovery volume…';
  };

  private readonly togglePuzzleTest = (): void => {
    const occupied = this.options.onTogglePuzzleTest();
    this.status.textContent = occupied
      ? 'Test slime is on the pressure plate: door and platform are active.'
      : 'Test slime left the pressure plate: door and platform are returning.';
  };

  private readonly runSensorRegression = (): void => {
    this.options.onRunSensorRegression();
    this.status.textContent = 'Sensor checks passed: duplicate, multiple, and exit occupancy are stable.';
  };

  private readonly runResetRegression = (): void => {
    this.options.onRunResetRegression();
    this.status.textContent = 'Reset checks passed: 10 active/returning puzzle cycles restored the authored state.';
  };

  private readonly activateCheckpoint = (): void => {
    this.options.onActivateCheckpoint();
    this.status.textContent = 'Elevated checkpoint activated. Recovery will use its verified clear spawn.';
  };

  private readonly recoverCheckpoint = (): void => {
    this.options.onRecoverCheckpoint();
    this.status.textContent = 'Test slime recovered at the active checkpoint.';
  };

  setRuntimeDiagnostics(text: string): void {
    this.runtimeStatus.textContent = text;
  }
}
