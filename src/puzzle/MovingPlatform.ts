import * as THREE from 'three';

import { EventBus } from '../core/EventBus';

export type MovingPlatformState = 'atStart' | 'movingToEnd' | 'atEnd' | 'movingToStart';

export interface MovingPlatformEvents {
  stateChanged: {
    readonly platform: MovingPlatform;
    readonly state: MovingPlatformState;
  };
}

export interface MovingPlatformOptions {
  readonly id: string;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly size?: THREE.Vector3;
  readonly travelDurationSeconds?: number;
}

/**
 * An authored linear platform route. Its pose and displacement are read by the
 * movement system; it does not push or parent a player body itself.
 */
export class MovingPlatform {
  readonly root = new THREE.Group();
  readonly events = new EventBus<MovingPlatformEvents>();
  readonly displacement = new THREE.Vector3();

  private readonly start: THREE.Vector3;
  private readonly end: THREE.Vector3;
  private readonly travelDurationSeconds: number;
  private readonly previousPosition = new THREE.Vector3();
  private progress = 0;
  private targetEnd = false;
  private state: MovingPlatformState = 'atStart';

  constructor(options: MovingPlatformOptions) {
    this.root.name = `${options.id}-moving-platform`;
    this.start = options.start.clone();
    this.end = options.end.clone();
    this.travelDurationSeconds = options.travelDurationSeconds ?? 2.5;
    if (!Number.isFinite(this.travelDurationSeconds) || this.travelDurationSeconds <= 0) {
      throw new Error('Platform travel duration must be positive.');
    }

    const size = options.size?.clone() ?? new THREE.Vector3(2.5, 0.3, 2.5);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({
        color: 0x62bf83,
        emissive: 0x0a3018,
        emissiveIntensity: 0.2,
        roughness: 0.55,
      }),
    );
    mesh.name = `${options.id}-moving-platform-surface`;
    this.root.add(mesh);
    this.root.position.copy(this.start);
  }

  get platformState(): MovingPlatformState {
    return this.state;
  }

  get isAtEnd(): boolean {
    return this.progress >= 1;
  }

  setActive(active: boolean): void {
    if (this.targetEnd === active) return;
    this.targetEnd = active;
    this.setState(active ? 'movingToEnd' : 'movingToStart');
  }

  update(deltaSeconds: number): void {
    this.displacement.set(0, 0, 0);
    this.previousPosition.copy(this.root.position);
    const progressStep = deltaSeconds / this.travelDurationSeconds;

    if (this.targetEnd) {
      this.progress = Math.min(1, this.progress + progressStep);
      if (this.progress === 1) this.setState('atEnd');
    } else {
      this.progress = Math.max(0, this.progress - progressStep);
      if (this.progress === 0) this.setState('atStart');
    }

    this.root.position.lerpVectors(this.start, this.end, this.progress);
    this.displacement.subVectors(this.root.position, this.previousPosition);
  }

  reset(): void {
    this.targetEnd = false;
    this.progress = 0;
    this.root.position.copy(this.start);
    this.displacement.set(0, 0, 0);
    this.setState('atStart');
  }

  dispose(): void {
    this.events.clear();
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      object.material.dispose();
    });
    this.root.clear();
  }

  private setState(state: MovingPlatformState): void {
    if (this.state === state) return;
    this.state = state;
    this.events.emit('stateChanged', { platform: this, state });
  }
}
