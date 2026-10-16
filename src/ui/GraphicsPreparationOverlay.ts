/** Session-owned status while settings require new first-use GPU work. */
export class GraphicsPreparationOverlay {
  readonly element: HTMLDivElement;
  constructor(host: HTMLElement) {
    this.element = document.createElement('div');
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('data-clean-gameplay-essential', '');
    this.element.setAttribute('data-graphics-preparation', '');
    Object.assign(this.element.style, {position:'absolute', inset:'0', zIndex:'100',
      background:'#07110f', color:'#dbe9e4', placeItems:'center', fontFamily:'sans-serif'});
    this.update(false); host.append(this.element);
  }
  update(pending: boolean, failed = false): void {
    this.element.hidden = !pending; this.element.style.display = pending ? 'grid' : 'none';
    this.element.textContent = failed ? 'Graphics preparation failed. Reload to retry.' : 'Preparing graphics…';
  }
  dispose(): void { this.element.remove(); }
}
