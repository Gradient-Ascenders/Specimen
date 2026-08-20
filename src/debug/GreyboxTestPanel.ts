export type DebugRoomId = 1 | 2 | 3 | 4 | 5;

interface GreyboxTestPanelOptions {
  onReset: () => void;
  onTestRecovery: () => void;
  onTeleportRoom: (roomId: DebugRoomId) => void;
  onRunSlopeIdleRegression: () => string;
}

/** DOM controls and legend used only by the grey-box development harness. */
export class GreyboxTestPanel {
  readonly element: HTMLElement;

  private readonly status: HTMLElement;
  private readonly runtimeStatus: HTMLElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly fallButton: HTMLButtonElement;
  private readonly roomButtons: readonly HTMLButtonElement[];
  private readonly collapseButton: HTMLButtonElement;
  private readonly slopeRegressionButton: HTMLButtonElement;

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
        <p class="eyebrow">Level 1 teaching grey-box</p>
        <h1>Containment: climb + bounce</h1>
        <p class="summary">Room 1 teaches yellow-green wall adhesion; Room 2 teaches bounce height, gap distance, and bounce-to-wall catches. Move with <kbd>WASD</kbd>; hold then release <kbd>Space</kbd> to charge a jump.</p>

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
          <button type="button" data-action="fall">Test death <kbd>F</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="1">Room 1 <kbd>1</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="2">Room 2 <kbd>2</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="3">Room 3 <kbd>3</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="4">Room 4 <kbd>4</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="5">Room 5 <kbd>5</kbd></button>
          <button type="button" data-action="slope-regression">Check Room 1/2 surfaces</button>
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
    const roomButtons = Array.from(
      this.element.querySelectorAll<HTMLButtonElement>(
        '[data-action="room-teleport"]',
      ),
    );
    const collapseButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="collapse-panel"]',
    );
    const slopeRegressionButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="slope-regression"]',
    );

    if (
      !status ||
      !runtimeStatus ||
      !resetButton ||
      !fallButton ||
      roomButtons.length !== 5 ||
      !collapseButton ||
      !slopeRegressionButton
    ) {
      throw new Error('Missing collision test controls.');
    }

    this.status = status;
    this.runtimeStatus = runtimeStatus;
    this.resetButton = resetButton;
    this.fallButton = fallButton;
    this.roomButtons = roomButtons;
    this.collapseButton = collapseButton;
    this.slopeRegressionButton = slopeRegressionButton;

    this.resetButton.addEventListener('click', this.resetProbe);
    this.fallButton.addEventListener('click', this.testRecovery);
    for (const button of this.roomButtons) {
      button.addEventListener('click', this.teleportRoomFromButton);
    }
    this.collapseButton.addEventListener('click', this.toggleCollapsed);
    this.slopeRegressionButton.addEventListener(
      'click',
      this.runSlopeIdleRegression,
    );
  }

  dispose(): void {
    this.resetButton.removeEventListener('click', this.resetProbe);
    this.fallButton.removeEventListener('click', this.testRecovery);
    for (const button of this.roomButtons) {
      button.removeEventListener('click', this.teleportRoomFromButton);
    }
    this.collapseButton.removeEventListener('click', this.toggleCollapsed);
    this.slopeRegressionButton.removeEventListener(
      'click',
      this.runSlopeIdleRegression,
    );
  }

  readonly resetProbe = (): void => {
    this.options.onReset();
    this.status.textContent = 'Probe reset to the cyan spawn marker.';
  };

  readonly testRecovery = (): void => {
    this.options.onTestRecovery();
    this.status.textContent =
      'Probe entered the recovery volume. Retry from the death screen.';
  };

  readonly teleportRoom = (roomId: DebugRoomId): void => {
    this.options.onTeleportRoom(roomId);
    this.status.textContent =
      `Probe teleported to the Room ${roomId} entry checkpoint.`;
  };

  private readonly teleportRoomFromButton = (event: Event): void => {
    const roomId = Number(
      (event.currentTarget as HTMLButtonElement).dataset.roomId,
    );
    if (!Number.isInteger(roomId) || roomId < 1 || roomId > 5) return;
    this.teleportRoom(roomId as DebugRoomId);
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

  private readonly runSlopeIdleRegression = (): void => {
    const result = this.options.onRunSlopeIdleRegression();
    this.status.textContent = `Teaching surface check: ${result}`;
  };

  setRuntimeDiagnostics(text: string): void {
    this.runtimeStatus.textContent = text;
  }
}
