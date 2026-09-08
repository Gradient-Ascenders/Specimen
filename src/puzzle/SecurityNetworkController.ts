export type SecurityNetwork = 'red' | 'blue' | 'green';

/** Single authority for the mutually exclusive maintenance bypass. */
export class SecurityNetworkController {
  private selected: SecurityNetwork | undefined;
  private shutdownValue = false;
  get disabledNetwork(): SecurityNetwork | undefined { return this.selected; }
  get shutdown(): boolean { return this.shutdownValue; }
  select(network: SecurityNetwork): void {
    if (!this.shutdownValue) this.selected = network;
  }
  toggle(network: SecurityNetwork): void {
    if (!this.shutdownValue) this.selected = this.selected === network ? undefined : network;
  }
  isEnabled(network: SecurityNetwork): boolean {
    return !this.shutdownValue && network !== this.selected;
  }
  release(): void { this.shutdownValue = true; }
  reset(): void { this.selected = undefined; this.shutdownValue = false; }
}
