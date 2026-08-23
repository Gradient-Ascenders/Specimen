import * as THREE from 'three';

export interface ContainmentPointEffectOptions {
  readonly name: string;
  readonly colour: number;
  readonly count: number;
  readonly sizeMetres: number;
  readonly lifetimeSeconds: number;
  readonly horizontalSpeedMetresPerSecond: number;
  readonly upwardSpeedMetresPerSecond: number;
  readonly gravityMetresPerSecondSquared: number;
  readonly seed: number;
}

/**
 * One fixed-size, reusable point burst for Containment's restrained effects.
 *
 * The geometry and material are allocated once. State changes only rewrite the
 * existing position buffer, and reset/unload never leave callbacks or timers.
 */
export class ContainmentPointEffect {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly options: ContainmentPointEffectOptions;
  private elapsedSeconds = 0;
  private active = false;
  private disposed = false;

  constructor(options: ContainmentPointEffectOptions) {
    this.options = options;
    this.positions = new Float32Array(options.count * 3);
    this.velocities = new Float32Array(options.count * 3);
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);

    const geometry = new THREE.BufferGeometry();
    geometry.name = `${options.name}-geometry`;
    geometry.setAttribute('position', this.positionAttribute);

    const material = new THREE.PointsMaterial({
      name: `${options.name}-material`,
      color: options.colour,
      size: options.sizeMetres,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.name = options.name;
    this.points.userData.presentationOnly = true;
    this.points.userData.pooledEffect = true;
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  get activeParticleCount(): number {
    return this.active ? this.options.count : 0;
  }

  start(origin: THREE.Vector3 | readonly [number, number, number]): void {
    if (this.disposed) return;
    if (origin instanceof THREE.Vector3) this.points.position.copy(origin);
    else this.points.position.set(origin[0], origin[1], origin[2]);

    for (let index = 0; index < this.options.count; index += 1) {
      const offset = index * 3;
      const angle = sample(index, 0, this.options.seed) * Math.PI * 2;
      const radius = Math.sqrt(sample(index, 1, this.options.seed)) * 0.18;
      const horizontalSpeed =
        this.options.horizontalSpeedMetresPerSecond *
        (0.45 + sample(index, 2, this.options.seed) * 0.55);

      this.positions[offset] = Math.cos(angle) * radius;
      this.positions[offset + 1] = sample(index, 3, this.options.seed) * 0.12;
      this.positions[offset + 2] = Math.sin(angle) * radius;
      this.velocities[offset] = Math.cos(angle) * horizontalSpeed;
      this.velocities[offset + 1] =
        this.options.upwardSpeedMetresPerSecond *
        (0.55 + sample(index, 4, this.options.seed) * 0.7);
      this.velocities[offset + 2] = Math.sin(angle) * horizontalSpeed;
    }

    this.positionAttribute.needsUpdate = true;
    this.elapsedSeconds = 0;
    this.active = true;
    this.points.visible = true;
    this.points.material.opacity = 0.72;
  }

  update(deltaSeconds: number): void {
    if (!this.active || this.disposed) return;
    this.elapsedSeconds += deltaSeconds;
    const progress = THREE.MathUtils.clamp(
      this.elapsedSeconds / this.options.lifetimeSeconds,
      0,
      1,
    );

    if (progress >= 1) {
      this.reset();
      return;
    }

    const gravityDelta =
      this.options.gravityMetresPerSecondSquared * deltaSeconds;
    for (let offset = 0; offset < this.positions.length; offset += 3) {
      this.velocities[offset + 1] -= gravityDelta;
      this.positions[offset] += this.velocities[offset] * deltaSeconds;
      this.positions[offset + 1] += this.velocities[offset + 1] * deltaSeconds;
      this.positions[offset + 2] += this.velocities[offset + 2] * deltaSeconds;
    }
    this.positionAttribute.needsUpdate = true;
    this.points.material.opacity = (1 - progress) * 0.72;
  }

  reset(): void {
    this.active = false;
    this.elapsedSeconds = 0;
    this.points.visible = false;
    this.points.material.opacity = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

function sample(index: number, channel: number, seed: number): number {
  const value = Math.sin(
    (index + 1) * 12.9898 + (channel + 1) * 78.233 + seed * 37.719,
  ) * 43758.5453;
  return value - Math.floor(value);
}
