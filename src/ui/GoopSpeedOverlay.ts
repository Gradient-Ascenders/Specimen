interface SpeedSource {
  readonly locomotionSpeedMultiplier: number;
  readonly maximumLocomotionSpeedMetresPerSecond: number;
  readonly velocity: { readonly x: number; readonly z: number };
}

/** Visual strength comes from the real boost and resolved planar speed. */
export function goopSpeedEffectStrength(body: SpeedSource): number {
  const multiplier = body.locomotionSpeedMultiplier;
  if (multiplier <= 1) return 0;
  const maximum = body.maximumLocomotionSpeedMetresPerSecond;
  const ordinarySpeed = maximum / multiplier;
  const speed = Math.hypot(body.velocity.x, body.velocity.z);
  return Math.max(0, Math.min(1, (speed - ordinarySpeed) / (maximum - ordinarySpeed)));
}

// Peripheral lanes point away from the centre; negative delays stagger them
// immediately on reveal without timers, particles or render allocations.
const STREAKS = [
  [6, 34, -160], [10, 15, -140], [35, 6, -105], [65, 6, -75],
  [90, 15, -40], [94, 34, -20], [94, 66, 20], [90, 85, 40],
  [65, 94, 75], [35, 94, 105], [10, 85, 140], [6, 66, 160],
] as const;

/** Browser-session-owned, decorative screen feedback for controlled Goop. */
export class GoopSpeedOverlay {
  readonly element: HTMLElement;
  private strength = 0;
  private renderedOpacity = 0;
  private disposed = false;

  constructor(host: HTMLElement) {
    const document = host.ownerDocument;
    this.element = document.createElement('div');
    this.element.className = 'goop-speed-overlay';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.dataset.cleanGameplayEssential = 'true';
    this.element.style.opacity = '0';
    this.element.hidden = true;
    for (const [index, [x, y, angle]] of STREAKS.entries()) {
      const streak = document.createElement('span');
      streak.className = 'goop-speed-streak';
      streak.style.left = `${x}%`; streak.style.top = `${y}%`;
      streak.style.setProperty('--speed-angle', `${angle}deg`);
      streak.style.animationDelay = `${-(index * .137) % .72}s`;
      this.element.append(streak);
    }
    host.append(this.element);
  }

  update(deltaSeconds: number, targetStrength: number): void {
    if (this.disposed) return;
    const target = Number.isFinite(targetStrength) ? Math.max(0, Math.min(1, targetStrength)) : 0;
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(.1, deltaSeconds)) : 0;
    this.strength += (target - this.strength) * (1 - Math.exp(-(target > this.strength ? 9 : 14) * dt));
    if (target === 0 && this.strength < .01) this.strength = 0;
    const opacity = this.strength * .72;
    if (Math.abs(opacity - this.renderedOpacity) < .001 && this.element.hidden === (opacity === 0)) return;
    this.renderedOpacity = opacity;
    this.element.style.opacity = opacity.toFixed(3);
    this.element.hidden = opacity === 0;
  }

  reset(): void {
    this.strength = 0;
    if (this.disposed || this.element.hidden) return;
    this.renderedOpacity = 0;
    this.element.style.opacity = '0';
    this.element.hidden = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset(); this.element.remove(); this.disposed = true;
  }
}
