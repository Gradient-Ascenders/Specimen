interface GreyboxTestPanelOptions {
  onReset: () => void;
  onTestRecovery: (onRecovered: () => void) => void;
  onTogglePuzzleTest: () => boolean;
  onRunSensorRegression: () => void;
  onRunResetRegression: () => void;
  onActivateCheckpoint: () => void;
  onRecoverCheckpoint: () => void;
  onRunSlopeIdleRegression: () => string;
  onToggleStaticLaser: () => boolean;
  onResetLaserSequences: () => void;
  onRunLaserDeterminismRegression: () => string;
  onEnterElevatorTest: () => void;
  onRecoverElevatorCheckpoint: () => void;
  onRunElevatorCarrierRegression: () => string;
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
  private readonly collapseButton: HTMLButtonElement;
  private readonly resetRegressionButton: HTMLButtonElement;
  private readonly checkpointButton: HTMLButtonElement;
  private readonly checkpointRecoveryButton: HTMLButtonElement;
  private readonly slopeRegressionButton: HTMLButtonElement;
  private readonly laserToggleButton: HTMLButtonElement;
  private readonly laserResetButton: HTMLButtonElement;
  private readonly laserRegressionButton: HTMLButtonElement;
  private readonly elevatorEnterButton: HTMLButtonElement;
  private readonly elevatorRecoveryButton: HTMLButtonElement;
  private readonly elevatorRegressionButton: HTMLButtonElement;

  constructor(private readonly options: GreyboxTestPanelOptions) {
    this.element = document.createElement('section');
    this.element.className = 'test-panel';
    this.element.innerHTML = `
      <button
        type="button"
        class="panel-collapse"
        data-action="collapse-panel"
        aria-expanded="true"
        aria-label="Collapse debug panel"
        title="Collapse debug panel"
      >−</button>

      <div class="test-panel-content">
        <p class="eyebrow">Sprint 0 test harness</p>
        <h1>Collision grey-box</h1>
        <p class="summary">One grid square equals one metre. Click the game to capture the pointer, look with the mouse, and move relative to the camera with <kbd>WASD</kbd> on the ground and on sticky walls. Hold <kbd>Space</kbd> to charge and release to jump.</p>

        <ul class="case-list" aria-label="Collision test case legend">
          <li style="--case-colour: #81909b">Floor</li>
          <li style="--case-colour: #568bd8">Wall</li>
          <li style="--case-colour: #e3994b">Ledge</li>
          <li style="--case-colour: #d6c650">Slope</li>
          <li style="--case-colour: #d95f8d">Gap</li>
          <li style="--case-colour: #62bf83">Platform</li>
          <li style="--case-colour: #e06f5f">Non-stick</li>
        </ul>

        <p class="surface-key">
          <span class="sticky-key">Sticky wall</span>
          <span class="bouncy-key">Bounce pad</span>
        </p>

        <p class="probe-status" role="status">Probe is at spawn.</p>

        <div class="controls">
          <button type="button" data-action="reset">Reset probe <kbd>R</kbd></button>
          <button type="button" data-action="fall">Test recovery <kbd>F</kbd></button>
          <button type="button" data-action="slope-regression">Run idle slope check</button>
          <button type="button" data-action="puzzle">Toggle plate test</button>
          <button type="button" data-action="sensor-regression">Run sensor checks</button>
          <button type="button" data-action="reset-regression">Run 10 reset cycles</button>
          <button type="button" data-action="checkpoint">Activate elevated checkpoint</button>
          <button type="button" data-action="checkpoint-recovery">Recover at checkpoint</button>
          <button type="button" data-action="laser-toggle">Toggle static laser</button>
          <button type="button" data-action="laser-reset">Reset laser timelines</button>
          <button type="button" data-action="laser-regression">Run laser determinism checks</button>
          <button type="button" data-action="elevator-enter">Enter elevator test</button>
          <button type="button" data-action="elevator-recovery">Recover elevator checkpoint</button>
          <button type="button" data-action="elevator-regression">Run elevator carrier checks</button>
        </div>

        <p class="eyebrow diagnostics-heading">Runtime / movement diagnostics</p>
        <pre class="runtime-status" data-runtime-status>Waiting for runtime samples…</pre>
      </div>
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
    const collapseButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="collapse-panel"]',
    );
    const resetRegressionButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="reset-regression"]',
    );
    const checkpointButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="checkpoint"]',
    );
    const checkpointRecoveryButton =
      this.element.querySelector<HTMLButtonElement>(
        '[data-action="checkpoint-recovery"]',
      );
    const slopeRegressionButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="slope-regression"]',
    );
    const laserToggleButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="laser-toggle"]',
    );
    const laserResetButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="laser-reset"]',
    );
    const laserRegressionButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="laser-regression"]',
    );
    const elevatorEnterButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="elevator-enter"]',
    );
    const elevatorRecoveryButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="elevator-recovery"]',
    );
    const elevatorRegressionButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="elevator-regression"]',
    );

    if (
      !status ||
      !runtimeStatus ||
      !resetButton ||
      !fallButton ||
      !puzzleButton ||
      !sensorRegressionButton ||
      !collapseButton ||
      !resetRegressionButton ||
      !checkpointButton ||
      !checkpointRecoveryButton ||
      !slopeRegressionButton ||
      !laserToggleButton ||
      !laserResetButton ||
      !laserRegressionButton ||
      !elevatorEnterButton ||
      !elevatorRecoveryButton ||
      !elevatorRegressionButton
    ) {
      throw new Error('Missing collision test controls.');
    }

    this.status = status;
    this.runtimeStatus = runtimeStatus;
    this.resetButton = resetButton;
    this.fallButton = fallButton;
    this.puzzleButton = puzzleButton;
    this.sensorRegressionButton = sensorRegressionButton;
    this.collapseButton = collapseButton;
    this.resetRegressionButton = resetRegressionButton;
    this.checkpointButton = checkpointButton;
    this.checkpointRecoveryButton = checkpointRecoveryButton;
    this.slopeRegressionButton = slopeRegressionButton;
    this.laserToggleButton = laserToggleButton;
    this.laserResetButton = laserResetButton;
    this.laserRegressionButton = laserRegressionButton;
    this.elevatorEnterButton = elevatorEnterButton;
    this.elevatorRecoveryButton = elevatorRecoveryButton;
    this.elevatorRegressionButton = elevatorRegressionButton;

    this.resetButton.addEventListener('click', this.resetProbe);
    this.fallButton.addEventListener('click', this.testRecovery);
    this.puzzleButton.addEventListener('click', this.togglePuzzleTest);
    this.sensorRegressionButton.addEventListener(
      'click',
      this.runSensorRegression,
    );
    this.collapseButton.addEventListener('click', this.toggleCollapsed);
    this.resetRegressionButton.addEventListener(
      'click',
      this.runResetRegression,
    );
    this.checkpointButton.addEventListener('click', this.activateCheckpoint);
    this.checkpointRecoveryButton.addEventListener(
      'click',
      this.recoverCheckpoint,
    );
    this.slopeRegressionButton.addEventListener(
      'click',
      this.runSlopeIdleRegression,
    );
    this.laserToggleButton.addEventListener(
      'click',
      this.toggleStaticLaser,
    );
    this.laserResetButton.addEventListener(
      'click',
      this.resetLaserSequences,
    );
    this.laserRegressionButton.addEventListener(
      'click',
      this.runLaserDeterminismRegression,
    );
    this.elevatorEnterButton.addEventListener(
      'click',
      this.enterElevatorTest,
    );
    this.elevatorRecoveryButton.addEventListener(
      'click',
      this.recoverElevatorCheckpoint,
    );
    this.elevatorRegressionButton.addEventListener(
      'click',
      this.runElevatorCarrierRegression,
    );
  }

  dispose(): void {
    this.resetButton.removeEventListener('click', this.resetProbe);
    this.fallButton.removeEventListener('click', this.testRecovery);
    this.puzzleButton.removeEventListener('click', this.togglePuzzleTest);
    this.sensorRegressionButton.removeEventListener(
      'click',
      this.runSensorRegression,
    );
    this.collapseButton.removeEventListener('click', this.toggleCollapsed);
    this.resetRegressionButton.removeEventListener(
      'click',
      this.runResetRegression,
    );
    this.checkpointButton.removeEventListener('click', this.activateCheckpoint);
    this.checkpointRecoveryButton.removeEventListener(
      'click',
      this.recoverCheckpoint,
    );
    this.slopeRegressionButton.removeEventListener(
      'click',
      this.runSlopeIdleRegression,
    );
    this.laserToggleButton.removeEventListener(
      'click',
      this.toggleStaticLaser,
    );
    this.laserResetButton.removeEventListener(
      'click',
      this.resetLaserSequences,
    );
    this.laserRegressionButton.removeEventListener(
      'click',
      this.runLaserDeterminismRegression,
    );
    this.elevatorEnterButton.removeEventListener(
      'click',
      this.enterElevatorTest,
    );
    this.elevatorRecoveryButton.removeEventListener(
      'click',
      this.recoverElevatorCheckpoint,
    );
    this.elevatorRegressionButton.removeEventListener(
      'click',
      this.runElevatorCarrierRegression,
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
    this.status.textContent =
      'Sensor checks passed: duplicate, multiple, and exit occupancy are stable.';
  };

  private readonly toggleCollapsed = (): void => {
    const collapsed = this.element.classList.toggle('is-collapsed');
    this.collapseButton.textContent = collapsed ? '+' : '−';
    this.collapseButton.setAttribute('aria-expanded', String(!collapsed));
    this.collapseButton.setAttribute(
      'aria-label',
      collapsed ? 'Expand debug panel' : 'Collapse debug panel',
    );
    this.collapseButton.title = collapsed
      ? 'Expand debug panel'
      : 'Collapse debug panel';
  };

  private readonly runResetRegression = (): void => {
    this.options.onRunResetRegression();
    this.status.textContent =
      'Reset checks passed: 10 active/returning puzzle cycles restored the authored state.';
  };

  private readonly activateCheckpoint = (): void => {
    this.options.onActivateCheckpoint();
    this.status.textContent =
      'Elevated checkpoint activated. Recovery will use its verified clear spawn.';
  };

  private readonly recoverCheckpoint = (): void => {
    this.options.onRecoverCheckpoint();
    this.status.textContent = 'Test slime recovered at the active checkpoint.';
  };

  private readonly runSlopeIdleRegression = (): void => {
    const result = this.options.onRunSlopeIdleRegression();
    this.status.textContent = `Idle slope regression: ${result}`;
  };

  private readonly toggleStaticLaser = (): void => {
    const enabled = this.options.onToggleStaticLaser();
    this.status.textContent = enabled
      ? 'Static Room 3 laser enabled.'
      : 'Static Room 3 laser disabled; emitters remain visible.';
  };

  private readonly resetLaserSequences = (): void => {
    this.options.onResetLaserSequences();
    this.status.textContent =
      'Laser poses, enabled states, sequence steps, and timers reset.';
  };

  private readonly runLaserDeterminismRegression = (): void => {
    const result = this.options.onRunLaserDeterminismRegression();
    this.status.textContent = `Laser determinism: ${result}`;
  };

  private readonly enterElevatorTest = (): void => {
    this.options.onEnterElevatorTest();
    this.status.textContent =
      'Player recovered onto the Room 4 elevator roof; warning/ascent starts automatically.';
  };

  private readonly recoverElevatorCheckpoint = (): void => {
    this.options.onRecoverElevatorCheckpoint();
    this.status.textContent =
      'Room 4 checkpoint group reset elevator, hazards, timers, and player state.';
  };

  private readonly runElevatorCarrierRegression = (): void => {
    try {
      const result = this.options.onRunElevatorCarrierRegression();
      this.status.textContent = `Elevator carrier: ${result}`;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.status.textContent = `Elevator carrier: FAIL — ${message}`;
      console.error('Elevator carrier regression failed.', error);
    }
  };

  setRuntimeDiagnostics(text: string): void {
    this.runtimeStatus.textContent = text;
  }
}
