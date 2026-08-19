export interface DeathScreenOptions {
  readonly onRetry: () => void;
  readonly backgroundElements: readonly HTMLElement[];
}

function setBackgroundInert(
  elements: readonly HTMLElement[],
  inert: boolean,
): void {
  for (const element of elements) element.inert = inert;
}

/** Focused DOM surface for the authoritative `gameOver` state. */
export class DeathScreen {
  readonly element: HTMLElement;

  private readonly options: DeathScreenOptions;
  private readonly retryButton: HTMLButtonElement;
  private disposed = false;

  constructor(options: DeathScreenOptions) {
    this.options = options;
    this.element = document.createElement('section');
    this.element.className = 'death-screen';
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('aria-labelledby', 'death-screen-title');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('role', 'dialog');
    this.element.innerHTML = `
      <div class="death-screen-vignette" aria-hidden="true"></div>
      <div class="death-card">
        <div class="death-mark" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <p class="death-eyebrow">Specimen signal lost</p>
        <h1 id="death-screen-title">You died</h1>
        <p class="death-message">
          Reconstitute the specimen at the last stable checkpoint.
        </p>
        <button class="death-retry" type="button">
          Retry <span aria-hidden="true">↻</span>
        </button>
      </div>
    `;

    const retryButton = this.element.querySelector<HTMLButtonElement>(
      '.death-retry',
    );
    if (!retryButton) throw new Error('Missing death-screen Retry button.');

    this.retryButton = retryButton;
    this.retryButton.addEventListener('click', this.retry);
  }

  show(): void {
    if (this.disposed || !this.element.hidden) return;

    this.element.hidden = false;
    this.element.setAttribute('aria-hidden', 'false');
    this.element.classList.remove('is-visible');
    // Re-running this cosmetic entrance never owns game-state timing.
    void this.element.offsetWidth;
    this.element.classList.add('is-visible');
    setBackgroundInert(this.options.backgroundElements, true);
    this.retryButton.focus({ preventScroll: true });
  }

  hide(): void {
    if (this.disposed) return;

    this.element.classList.remove('is-visible');
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    setBackgroundInert(this.options.backgroundElements, false);
  }

  dispose(): void {
    if (this.disposed) return;
    setBackgroundInert(this.options.backgroundElements, false);
    this.disposed = true;
    this.retryButton.removeEventListener('click', this.retry);
    this.element.remove();
  }

  private readonly retry = (): void => {
    this.options.onRetry();
  };
}
