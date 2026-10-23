/** Keep lower HUD panels above the real expanded or compact controls height. */
export class HudFooterLayout {
  private readonly resize?: ResizeObserver;
  private readonly mutation?: MutationObserver;

  constructor(host: HTMLElement, controls: HTMLElement) {
    this.host = host;
    this.controls = controls;
    const view = controls.ownerDocument.defaultView;
    if (view?.ResizeObserver) {
      this.resize = new view.ResizeObserver(() => this.measure());
      for (const panel of controls.querySelectorAll<HTMLElement>('.hud-hint, .hud-controls-summary')) this.resize.observe(panel);
    }
    if (view?.MutationObserver) {
      this.mutation = new view.MutationObserver(() => this.measure());
      this.mutation.observe(controls, { attributes: true, attributeFilter: ['data-collapsed'] });
    }
    this.measure();
  }

  private readonly host: HTMLElement;
  private readonly controls: HTMLElement;

  private measure(): void {
    const panel = this.controls.querySelector<HTMLElement>(this.controls.dataset.collapsed === 'true'
      ? '.hud-controls-summary' : '.hud-hint');
    const height = `${panel?.offsetHeight || 44}px`;
    if (this.host.style.getPropertyValue('--boss-controls-height') !== height) this.host.style.setProperty('--boss-controls-height', height);
  }

  dispose(): void {
    this.resize?.disconnect();
    this.mutation?.disconnect();
    this.host.style.removeProperty('--boss-controls-height');
  }
}
