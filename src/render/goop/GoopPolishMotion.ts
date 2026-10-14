import * as THREE from 'three';
import type { Vector3State } from '../slime/SlimePresentationContract.ts';
import type { GoopMaterialSet } from './GoopMaterials.ts';

export const GOOP_CREST_LAG_METRES = 0.02;
export const GOOP_LANDING_RIPPLE_METRES = 0.003;
export const GOOP_LANDING_RIPPLE_SECONDS = 0.65;
const RECOIL_SECONDS = 0.22;
const BLINK_SECONDS = 0.18;
const CREST_LANDING_SECONDS = 0.3;

/** Small, event-driven gestures beneath the character's existing body motion. */
export class GoopPolishMotion {
  private readonly crest = new THREE.Vector2();
  private readonly previousCrest = new THREE.Vector2();
  private readonly renderedCrest = new THREE.Vector2();
  private readonly recoilDirection = new THREE.Vector3();
  private readonly recoil = new THREE.Vector3();
  private readonly previousRecoil = new THREE.Vector3();
  private previousRecoilStrength = 0;
  private recoilStrength = 0;
  private recoilRemaining = 0;
  private previousEyeClosure = 0;
  private eyeClosure = 0;
  private blinkRemaining = 0;
  private nextBlinkSeconds = 3.2;
  private blinkIndex = 0;
  private squintRemaining = 0;
  private squintStrength = 0;
  private crestLandingRemaining = 0;
  private crestLandingStrength = 0;
  private previousRippleAge = GOOP_LANDING_RIPPLE_SECONDS;
  private rippleAge = GOOP_LANDING_RIPPLE_SECONDS;
  private rippleStrength = 0;

  get diagnostics() {
    return { crestLagMetres: this.crest.length(), eyeClosure: this.eyeClosure,
      acidRecoil: this.recoilStrength, landingRippleStrength: this.rippleStrength,
      landingRippleAgeSeconds: this.rippleAge };
  }

  update(dt: number, yawChange: number, grounded: boolean, visible: boolean): void {
    this.previousCrest.copy(this.crest); this.previousRecoil.copy(this.recoil);
    this.previousRecoilStrength = this.recoilStrength; this.previousEyeClosure = this.eyeClosure;
    this.previousRippleAge = this.rippleAge;
    this.recoilRemaining = Math.max(0, this.recoilRemaining - dt);
    const recoilAge = RECOIL_SECONDS - this.recoilRemaining;
    this.recoilStrength = this.recoilRemaining > 0
      ? THREE.MathUtils.smoothstep(recoilAge, 0, 0.03) * (1 - THREE.MathUtils.smoothstep(recoilAge, 0.04, RECOIL_SECONDS)) : 0;
    this.recoil.copy(this.recoilDirection).multiplyScalar(0.025 * this.recoilStrength);
    this.crestLandingRemaining = Math.max(0, this.crestLandingRemaining - dt);
    const turn = dt > 0 ? THREE.MathUtils.clamp(-yawChange / (dt * Math.PI * 3), -1, 1) : 0;
    const landing = this.crestLandingStrength * this.crestLandingRemaining / CREST_LANDING_SECONDS;
    const response = 1 - Math.exp(-9 * dt);
    this.crest.x += (GOOP_CREST_LAG_METRES * turn - this.crest.x) * response;
    this.crest.y += (0.014 * landing - this.crest.y) * response;
    this.crest.clampLength(0, GOOP_CREST_LAG_METRES);
    if (this.crest.lengthSq() < 1e-12) this.crest.set(0, 0);

    this.blinkRemaining = Math.max(0, this.blinkRemaining - dt);
    if (visible && grounded && this.recoilRemaining === 0) {
      this.nextBlinkSeconds -= dt;
      if (this.nextBlinkSeconds <= 0) {
        this.blinkRemaining = Math.max(0, BLINK_SECONDS + this.nextBlinkSeconds);
        this.blinkIndex++;
        this.nextBlinkSeconds = 3.2 + (this.blinkIndex % 3) * 1.05;
      }
    }
    const blinkAge = BLINK_SECONDS - this.blinkRemaining;
    const blink = this.blinkRemaining > 0 ? THREE.MathUtils.smoothstep(blinkAge, 0, 0.055) *
      (1 - THREE.MathUtils.smoothstep(blinkAge, 0.075, BLINK_SECONDS)) : 0;
    this.squintRemaining = Math.max(0, this.squintRemaining - dt);
    const squint = this.squintStrength * this.squintRemaining / 0.22;
    this.eyeClosure = Math.max(blink, squint, 0.18 * this.recoilStrength);
    this.rippleAge = Math.min(GOOP_LANDING_RIPPLE_SECONDS, this.rippleAge + dt);
    if (!grounded || this.rippleAge === GOOP_LANDING_RIPPLE_SECONDS) this.rippleStrength = 0;
  }

  onLanding(impactSpeed: number): void {
    this.crestLandingStrength = THREE.MathUtils.clamp((impactSpeed - 1.5) / 7, 0, 1);
    this.crestLandingRemaining = CREST_LANDING_SECONDS;
    this.rippleStrength = THREE.MathUtils.clamp((impactSpeed - 4.5) / 4, 0, 1);
    this.rippleAge = this.previousRippleAge = 0;
  }

  onAcidFired(direction: Vector3State): void {
    this.recoilDirection.set(-direction.x, 0, -direction.z).clampLength(0, 1);
    this.recoilRemaining = RECOIL_SECONDS;
  }

  onDamage(strength: number): void {
    this.squintRemaining = 0.22;
    this.squintStrength = 0.28 * THREE.MathUtils.clamp(strength, 0, 1);
  }

  copyRecoil(alpha: number, target: THREE.Vector3): THREE.Vector3 {
    return target.lerpVectors(this.previousRecoil, this.recoil, alpha);
  }

  recoilCompression(alpha: number): number {
    return 0.025 * THREE.MathUtils.lerp(this.previousRecoilStrength, this.recoilStrength, alpha);
  }

  present(materials: GoopMaterialSet, alpha: number): void {
    materials.setPolish(this.renderedCrest.lerpVectors(this.previousCrest, this.crest, alpha),
      THREE.MathUtils.lerp(this.previousEyeClosure, this.eyeClosure, alpha), this.rippleStrength,
      THREE.MathUtils.lerp(this.previousRippleAge, this.rippleAge, alpha));
  }

  reset(): void {
    this.crest.set(0, 0); this.previousCrest.set(0, 0);
    this.recoil.set(0, 0, 0); this.previousRecoil.set(0, 0, 0); this.recoilDirection.set(0, 0, 0);
    this.recoilStrength = this.previousRecoilStrength = this.recoilRemaining = 0;
    this.eyeClosure = this.previousEyeClosure = this.blinkRemaining = this.blinkIndex = 0;
    this.nextBlinkSeconds = 3.2;
    this.squintRemaining = this.squintStrength = this.crestLandingRemaining = this.crestLandingStrength = 0;
    this.rippleStrength = 0; this.rippleAge = this.previousRippleAge = GOOP_LANDING_RIPPLE_SECONDS;
  }
}
