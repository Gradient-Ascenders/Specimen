import { createLiquidLoaderMarkup } from './Branding.ts';

/** Session-owned status while settings require new first-use GPU work. */
export class GraphicsPreparationOverlay {
  readonly element: HTMLDivElement;
  private readonly message: HTMLElement;

  constructor(host: HTMLElement) {
    this.element = host.ownerDocument.createElement('div');
    this.element.className = 'graphics-preparation liquid-loading-screen';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('data-clean-gameplay-essential', '');
    this.element.setAttribute('data-graphics-preparation', '');
    this.element.innerHTML = `<div class="liquid-loading-state">${createLiquidLoaderMarkup()}<p class="liquid-loading-label" data-preparation-message></p></div>`;
    this.message = this.element.querySelector<HTMLElement>('[data-preparation-message]')!;
    this.update(false);
    host.append(this.element);
  }

  update(pending: boolean, failed = false): void {
    this.element.hidden = !pending;
    this.element.dataset.state = failed ? 'failed' : 'preparing';
    this.element.dataset.loadingState = failed ? 'failed' : 'loading';
    this.message.textContent = failed ? 'Graphics preparation failed. Reload to retry.' : 'Preparing graphics…';
  }

  dispose(): void { this.element.remove(); }
}
