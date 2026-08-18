import * as THREE from 'three';

import { EventBus } from '../core/EventBus';

export type DoorState = 'closed' | 'opening' | 'open' | 'closing';

export interface DoorEvents {
  stateChanged: {
    readonly door: Door;
    readonly state: DoorState;
  };
}

export interface DoorOptions {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly width?: number;
  readonly height?: number;
  readonly depth?: number;
  readonly openDurationSeconds?: number;
  readonly openAngleRadians?: number;
}

/** A hinge-door puzzle object with deterministic, authored opening motion. */
export class Door {
  readonly root = new THREE.Group();
  readonly events = new EventBus<DoorEvents>();

  private readonly hinge = new THREE.Group();
  private readonly openDurationSeconds: number;
  private readonly openAngleRadians: number;
  private openAmount = 0;
  private targetOpen = false;
  private state: DoorState = 'closed';

  constructor(options: DoorOptions) {
    this.root.name = `${options.id}-door`;
    this.root.position.copy(options.position);
    this.openDurationSeconds = options.openDurationSeconds ?? 0.7;
    this.openAngleRadians = options.openAngleRadians ?? Math.PI * 0.5;
    if (!Number.isFinite(this.openDurationSeconds) || this.openDurationSeconds <= 0) {
      throw new Error('Door opening duration must be positive.');
    }

    const width = options.width ?? 1.8;
    const height = options.height ?? 2.8;
    const depth = options.depth ?? 0.18;
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x38444d,
      roughness: 0.65,
      metalness: 0.25,
    });
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x91a7ad,
      roughness: 0.45,
      metalness: 0.2,
    });

    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.22, 0.18, depth + 0.12),
      frameMaterial,
    );
    frameTop.position.y = height + 0.09;
    const frameLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, height, depth + 0.12),
      frameMaterial,
    );
    frameLeft.position.set(-width * 0.5 - 0.02, height * 0.5, 0);
    const frameRight = frameLeft.clone();
    frameRight.position.x *= -1;
    this.root.add(frameTop, frameLeft, frameRight);

    this.hinge.name = `${options.id}-door-hinge`;
    this.hinge.position.set(-width * 0.5, 0, 0);
    this.root.add(this.hinge);

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      panelMaterial,
    );
    panel.name = `${options.id}-door-panel`;
    panel.position.set(width * 0.5, height * 0.5, 0);
    this.hinge.add(panel);
  }

  get doorState(): DoorState {
    return this.state;
  }

  get isOpen(): boolean {
    return this.openAmount >= 1;
  }

  get openProgress(): number {
    return this.openAmount;
  }

  setOpen(open: boolean): void {
    if (this.targetOpen === open) return;
    this.targetOpen = open;
    this.setState(open ? 'opening' : 'closing');
  }

  update(deltaSeconds: number): void {
    const step = deltaSeconds / this.openDurationSeconds;
    if (this.targetOpen) {
      this.openAmount = Math.min(1, this.openAmount + step);
      if (this.openAmount === 1) this.setState('open');
    } else {
      this.openAmount = Math.max(0, this.openAmount - step);
      if (this.openAmount === 0) this.setState('closed');
    }

    this.hinge.rotation.y = -this.openAngleRadians * this.openAmount;
  }

  reset(): void {
    this.targetOpen = false;
    this.openAmount = 0;
    this.hinge.rotation.y = 0;
    this.setState('closed');
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

  private setState(state: DoorState): void {
    if (this.state === state) return;
    this.state = state;
    this.events.emit('stateChanged', { door: this, state });
  }
}
