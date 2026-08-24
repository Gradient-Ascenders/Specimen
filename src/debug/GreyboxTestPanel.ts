export type DebugRoomId = 1 | 2 | 3 | 4 | 5;

interface GreyboxTestPanelOptions {
  onReset: () => void;
  onTestRecovery: () => void;
  onToggleLevel: () => 1 | 2;
  onTeleportRoom: (roomId: DebugRoomId) => boolean;
  onRunSlopeIdleRegression: () => string;
  onRunSlimeRosterRegression: () => string;
  onRunTwoBodySwitchingRegression: () => string;
  onRunDissolveRegression: () => string;
  onToggleCollisionOverlay: () => boolean;
}

/** DOM controls and legend used only by the grey-box development harness. */
export class GreyboxTestPanel {
  readonly element: HTMLElement;

  private readonly status: HTMLElement;
  private readonly runtimeStatus: HTMLElement;
  private readonly levelLabel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly fallButton: HTMLButtonElement;
  private readonly levelButton: HTMLButtonElement;
  private readonly roomButtons: readonly HTMLButtonElement[];
  private readonly collapseButton: HTMLButtonElement;
  private readonly slopeRegressionButton: HTMLButtonElement;
  private readonly slimeRosterRegressionButton: HTMLButtonElement;
  private readonly twoBodySwitchingRegressionButton: HTMLButtonElement;
  private readonly dissolveRegressionButton: HTMLButtonElement;
  private readonly collisionOverlayButton: HTMLButtonElement;

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
        <p class="eyebrow" data-level-label>Level 1 containment diagnostics</p>
        <h1 data-level-title>Containment: climb + bounce</h1>
        <p class="summary" data-level-summary>Room 1 teaches yellow-green wall adhesion; Room 2 teaches bounce height, gap distance, and bounce-to-wall catches. Move with <kbd>WASD</kbd>; hold then release <kbd>Space</kbd> to charge a jump. As Goop, hold right mouse to aim and press left mouse to fire acid.</p>

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
          <button type="button" data-action="toggle-level">Switch to Level 2 <kbd>0</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="1">Room 1 <kbd>1</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="2">Room 2 <kbd>2</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="3">Room 3 <kbd>3</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="4">Room 4 <kbd>4</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="5">Room 5 <kbd>5</kbd></button>
          <button type="button" data-action="slope-regression">Check Room 1/2 surfaces</button>
          <button type="button" data-action="slime-roster-regression">Check slime roster</button>
          <button type="button" data-action="two-body-switching-regression">Check two-body switching</button>
          <button type="button" data-action="dissolve-regression">Check Goop dissolve</button>
          <button type="button" data-action="collision-overlay" aria-pressed="false">Show collision overlay</button>
        </div>

        <p class="eyebrow diagnostics-heading">Runtime / movement diagnostics</p>
        <pre class="runtime-status" data-runtime-status>Waiting for runtime samples…</pre>
      </div>
    `;

    const status = this.element.querySelector<HTMLElement>('.probe-status');
    const runtimeStatus = this.element.querySelector<HTMLElement>(
      '[data-runtime-status]',
    );
    const levelLabel = this.element.querySelector<HTMLElement>(
      '[data-level-label]',
    );
    const title = this.element.querySelector<HTMLElement>('[data-level-title]');
    const summary = this.element.querySelector<HTMLElement>(
      '[data-level-summary]',
    );
    const resetButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="reset"]',
    );
    const fallButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="fall"]',
    );
    const levelButton = this.element.querySelector<HTMLButtonElement>(
      '[data-action="toggle-level"]',
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
    const slimeRosterRegressionButton =
      this.element.querySelector<HTMLButtonElement>(
        '[data-action="slime-roster-regression"]',
      );
    const twoBodySwitchingRegressionButton =
      this.element.querySelector<HTMLButtonElement>(
        '[data-action="two-body-switching-regression"]',
      );
    const dissolveRegressionButton =
      this.element.querySelector<HTMLButtonElement>(
        '[data-action="dissolve-regression"]',
      );
    const collisionOverlayButton =
      this.element.querySelector<HTMLButtonElement>(
        '[data-action="collision-overlay"]',
      );

    if (
      !status ||
      !runtimeStatus ||
      !levelLabel ||
      !title ||
      !summary ||
      !resetButton ||
      !fallButton ||
      !levelButton ||
      roomButtons.length !== 5 ||
      !collapseButton ||
      !slopeRegressionButton ||
      !slimeRosterRegressionButton ||
      !twoBodySwitchingRegressionButton ||
      !dissolveRegressionButton ||
      !collisionOverlayButton
    ) {
      throw new Error('Missing collision test controls.');
    }

    this.status = status;
    this.runtimeStatus = runtimeStatus;
    this.levelLabel = levelLabel;
    this.title = title;
    this.summary = summary;
    this.resetButton = resetButton;
    this.fallButton = fallButton;
    this.levelButton = levelButton;
    this.roomButtons = roomButtons;
    this.collapseButton = collapseButton;
    this.slopeRegressionButton = slopeRegressionButton;
    this.slimeRosterRegressionButton = slimeRosterRegressionButton;
    this.twoBodySwitchingRegressionButton =
      twoBodySwitchingRegressionButton;
    this.dissolveRegressionButton = dissolveRegressionButton;
    this.collisionOverlayButton = collisionOverlayButton;

    this.resetButton.addEventListener('click', this.resetProbe);
    this.fallButton.addEventListener('click', this.testRecovery);
    this.levelButton.addEventListener('click', this.toggleLevel);
    for (const button of this.roomButtons) {
      button.addEventListener('click', this.teleportRoomFromButton);
    }
    this.collapseButton.addEventListener('click', this.toggleCollapsed);
    this.slopeRegressionButton.addEventListener(
      'click',
      this.runSlopeIdleRegression,
    );
    this.slimeRosterRegressionButton.addEventListener(
      'click',
      this.runSlimeRosterRegression,
    );
    this.twoBodySwitchingRegressionButton.addEventListener(
      'click',
      this.runTwoBodySwitchingRegression,
    );
    this.dissolveRegressionButton.addEventListener(
      'click',
      this.runDissolveRegression,
    );
    this.collisionOverlayButton.addEventListener(
      'click',
      this.toggleCollisionOverlay,
    );
  }

  dispose(): void {
    this.resetButton.removeEventListener('click', this.resetProbe);
    this.fallButton.removeEventListener('click', this.testRecovery);
    this.levelButton.removeEventListener('click', this.toggleLevel);
    for (const button of this.roomButtons) {
      button.removeEventListener('click', this.teleportRoomFromButton);
    }
    this.collapseButton.removeEventListener('click', this.toggleCollapsed);
    this.slopeRegressionButton.removeEventListener(
      'click',
      this.runSlopeIdleRegression,
    );
    this.slimeRosterRegressionButton.removeEventListener(
      'click',
      this.runSlimeRosterRegression,
    );
    this.twoBodySwitchingRegressionButton.removeEventListener(
      'click',
      this.runTwoBodySwitchingRegression,
    );
    this.dissolveRegressionButton.removeEventListener(
      'click',
      this.runDissolveRegression,
    );
    this.collisionOverlayButton.removeEventListener(
      'click',
      this.toggleCollisionOverlay,
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
    const teleported = this.options.onTeleportRoom(roomId);
    this.status.textContent = teleported
      ? `Both slimes teleported to the current level's Room ${roomId} entry.`
      : `Room ${roomId} is not authored for the current level yet.`;
  };

  readonly toggleLevel = (): void => {
    const levelId = this.options.onToggleLevel();
    this.setActiveLevel(levelId);
    this.status.textContent = `Development preview switched to Level ${levelId}, Room 1.`;
  };

  setActiveLevel(levelId: 1 | 2): void {
    const isLevelTwo = levelId === 2;
    this.levelLabel.textContent = isLevelTwo
      ? 'Level 2 cultivation authoring preview'
      : 'Level 1 containment diagnostics';
    this.title.textContent = isLevelTwo
      ? 'Cultivation: two-slime cooperation'
      : 'Containment: climb + bounce';
    this.summary.innerHTML = isLevelTwo
      ? 'Rooms 1–3 preview Goop-created routes, split exits, and the upper/lower security-room flow. Press <kbd>0</kbd> to return to Level 1; <kbd>1</kbd>–<kbd>3</kbd> select authored rooms. Rooms 4–5 are not authored yet.'
      : 'Room 1 teaches yellow-green wall adhesion; Room 2 teaches bounce height, gap distance, and bounce-to-wall catches. Press <kbd>0</kbd> for the Level 2 preview. Move with <kbd>WASD</kbd>; hold then release <kbd>Space</kbd> to charge a jump.';
    this.levelButton.innerHTML = isLevelTwo
      ? 'Switch to Level 1 <kbd>0</kbd>'
      : 'Switch to Level 2 <kbd>0</kbd>';
    this.roomButtons.forEach((button, index) => {
      const unavailable = isLevelTwo && index >= 3;
      button.disabled = unavailable;
      button.title = unavailable
        ? `Level 2 Room ${index + 1} is not authored yet`
        : '';
    });
  }

  markProbeAtSpawn(): void {
    this.status.textContent = 'Probe is at spawn.';
  }

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

  private readonly runSlimeRosterRegression = (): void => {
    const result = this.options.onRunSlimeRosterRegression();
    this.status.textContent = `Slime roster: ${result}`;
  };

  private readonly runTwoBodySwitchingRegression = (): void => {
    const result = this.options.onRunTwoBodySwitchingRegression();
    this.status.textContent = `Two-body switching: ${result}`;
  };

  private readonly runDissolveRegression = (): void => {
    const result = this.options.onRunDissolveRegression();
    this.status.textContent = `Goop dissolve: ${result}`;
  };

  private readonly toggleCollisionOverlay = (): void => {
    const visible = this.options.onToggleCollisionOverlay();
    this.collisionOverlayButton.textContent = visible
      ? 'Hide collision overlay'
      : 'Show collision overlay';
    this.collisionOverlayButton.setAttribute('aria-pressed', String(visible));
    this.status.textContent = visible
      ? 'Collision overlay enabled: cyan default, magenta sticky, amber soluble.'
      : 'Collision overlay hidden.';
  };

  setRuntimeDiagnostics(text: string): void {
    this.runtimeStatus.textContent = text;
  }
}
