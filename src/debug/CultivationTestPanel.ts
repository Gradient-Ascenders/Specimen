export type CultivationDebugRoomId = 1 | 2 | 3;

export class CultivationTestPanel {
  readonly element: HTMLElement;
  private readonly runtimeStatus: HTMLElement;
  private readonly roomButtons: readonly HTMLButtonElement[];

  constructor(
    onReset: () => void,
    onAdvanceSupport?: (complete: boolean) => void,
    onTeleportRoom?: (roomId: CultivationDebugRoomId) => void,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'test-panel cultivation-test-panel';
    this.element.innerHTML = `
      <div class="test-panel-content">
        <p class="eyebrow">Level 2 foundation harness</p>
        <h1>Cultivation runtime</h1>
        <p class="summary">Validate the Level 2 backend foundation or jump directly into the authored Rooms 1–3 grey-box.</p>
        <div class="controls">
          <button type="button" data-action="reset">Reset Level 2 <kbd>R</kbd></button>
          <button type="button" data-action="partial-support">Partially dissolve next support</button>
          <button type="button" data-action="complete-support">Complete next support</button>
          <button type="button" data-action="room-teleport" data-room-id="1">Authored Room 1 <kbd>1</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="2">Authored Room 2 <kbd>2</kbd></button>
          <button type="button" data-action="room-teleport" data-room-id="3">Authored Room 3 <kbd>3</kbd></button>
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
    const roomButtons = Array.from(
      this.element.querySelectorAll<HTMLButtonElement>(
        '[data-action="room-teleport"]',
      ),
    );
    const runtimeStatus = this.element.querySelector<HTMLElement>('[data-runtime-status]');
    if (
      !button ||
      !partialSupportButton ||
      !completeSupportButton ||
      roomButtons.length !== 3 ||
      !runtimeStatus
    ) {
      throw new Error('Missing Cultivation debug controls.');
    }
    this.runtimeStatus = runtimeStatus;
    this.roomButtons = roomButtons;
    const advancePartialSupport = () => onAdvanceSupport?.(false);
    const advanceCompleteSupport = () => onAdvanceSupport?.(true);
    const teleportRoom = (event: Event): void => {
      const roomId = Number.parseInt(
        (event.currentTarget as HTMLButtonElement).dataset.roomId ?? '',
        10,
      );
      if (roomId === 1 || roomId === 2 || roomId === 3) {
        onTeleportRoom?.(roomId);
      }
    };
    button.addEventListener('click', onReset);
    partialSupportButton.addEventListener('click', advancePartialSupport);
    completeSupportButton.addEventListener('click', advanceCompleteSupport);
    for (const roomButton of this.roomButtons) {
      roomButton.addEventListener('click', teleportRoom);
    }
    this.disposeAction = () => {
      button.removeEventListener('click', onReset);
      partialSupportButton.removeEventListener('click', advancePartialSupport);
      completeSupportButton.removeEventListener('click', advanceCompleteSupport);
      for (const roomButton of this.roomButtons) {
        roomButton.removeEventListener('click', teleportRoom);
      }
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
