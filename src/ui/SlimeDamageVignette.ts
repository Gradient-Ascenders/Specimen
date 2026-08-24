import * as THREE from 'three';

import type { SlimeDamageSystem } from '../systems/SlimeDamageSystem.ts';

export interface SlimeDamageVignetteOptions {
  readonly damage: SlimeDamageSystem;
  readonly document?: Document;
}

const SLIME_DAMAGE_COLOUR = {
  bob: '114 234 208',
  goop: '145 207 75',
} as const;

const HIT_PULSE_FADE_PER_SECOND = 2.4;
const EPSILON = 1e-4;

/** Screen-edge damage feedback derived from the authoritative slime health. */
export class SlimeDamageVignette {
  readonly element: HTMLElement;

  private readonly damage: SlimeDamageSystem;
  private readonly hitPulse = { bob: 0, goop: 0 };
  private readonly unsubscribeDamaged: () => void;
  private readonly unsubscribeReset: () => void;
  private activeSlimeId: 'bob' | 'goop' | undefined;
  private renderedOpacity = -1;
  private disposed = false;

  constructor(options: SlimeDamageVignetteOptions) {
    this.damage = options.damage;
    const hostDocument = options.document ?? document;
    this.element = hostDocument.createElement('div');
    this.element.className = 'slime-damage-vignette';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.style.opacity = '0';

    this.unsubscribeDamaged = this.damage.events.on(
      'damaged',
      ({ slimeId }) => {
        this.hitPulse[slimeId] = 1;
      },
    );
    this.unsubscribeReset = this.damage.events.on('reset', () => this.reset());
  }

  update(
    deltaSeconds: number,
    activeSlimeId: 'bob' | 'goop',
    visible = true,
  ): void {
    if (this.disposed) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error('Damage-vignette deltaSeconds must be finite and non-negative.');
    }

    this.hitPulse.bob = Math.max(
      0,
      this.hitPulse.bob - HIT_PULSE_FADE_PER_SECOND * deltaSeconds,
    );
    this.hitPulse.goop = Math.max(
      0,
      this.hitPulse.goop - HIT_PULSE_FADE_PER_SECOND * deltaSeconds,
    );

    if (activeSlimeId !== this.activeSlimeId) {
      this.activeSlimeId = activeSlimeId;
      this.element.dataset.slimeId = activeSlimeId;
      this.element.style.setProperty(
        '--damage-colour-rgb',
        SLIME_DAMAGE_COLOUR[activeSlimeId],
      );
    }

    const health = this.damage.health[activeSlimeId === 'bob' ? 0 : 1]!;
    const missingHealth = THREE.MathUtils.clamp(
      1 - health.normalizedHealth,
      0,
      1,
    );
    const sustainedOpacity = Math.pow(missingHealth, 0.72) * 0.82;
    const impactOpacity = this.hitPulse[activeSlimeId] * 0.48;
    const opacity = visible
      ? THREE.MathUtils.clamp(Math.max(sustainedOpacity, impactOpacity), 0, 0.9)
      : 0;
    if (Math.abs(opacity - this.renderedOpacity) <= EPSILON) return;
    this.renderedOpacity = opacity;
    this.element.style.opacity = opacity.toFixed(3);
  }

  reset(): void {
    if (this.disposed) return;
    this.hitPulse.bob = 0;
    this.hitPulse.goop = 0;
    this.renderedOpacity = 0;
    this.element.style.opacity = '0';
  }

  dispose(): void {
    if (this.disposed) return;
    this.unsubscribeDamaged();
    this.unsubscribeReset();
    this.element.remove();
    this.disposed = true;
  }
}
