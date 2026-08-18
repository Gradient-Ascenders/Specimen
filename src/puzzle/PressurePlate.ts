import * as THREE from 'three';

import { EventBus } from '../core/EventBus';
import { Trigger } from './Trigger';

export interface PressurePlateEvents {
  changed: {
    readonly plate: PressurePlate;
    readonly pressed: boolean;
  };
}

export interface PressurePlateOptions {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly size?: THREE.Vector3;
  readonly requiredOccupants?: number;
}

/** A visible, authorable plate driven by a physics-agnostic Trigger. */
export class PressurePlate {
  readonly root = new THREE.Group();
  readonly trigger: Trigger;
  readonly events = new EventBus<PressurePlateEvents>();

  private readonly top: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private readonly topRestY: number;
  private readonly requiredOccupants: number;
  private readonly unsubscribe: () => void;
  private pressed = false;

  constructor(options: PressurePlateOptions) {
    this.root.name = `${options.id}-pressure-plate`;
    this.root.position.copy(options.position);
    this.requiredOccupants = options.requiredOccupants ?? 1;
    if (!Number.isInteger(this.requiredOccupants) || this.requiredOccupants < 1) {
      throw new Error('Pressure plate requires at least one occupant.');
    }

    const size = options.size?.clone() ?? new THREE.Vector3(1.6, 0.18, 1.6);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y * 0.55, size.z),
      new THREE.MeshStandardMaterial({ color: 0x28333a, roughness: 0.75 }),
    );
    base.name = `${options.id}-pressure-plate-base`;
    base.position.y = size.y * 0.275;
    this.root.add(base);

    this.top = new THREE.Mesh(
      new THREE.BoxGeometry(size.x * 0.88, size.y * 0.35, size.z * 0.88),
      new THREE.MeshStandardMaterial({
        color: 0xd8b34a,
        emissive: 0x4a3003,
        emissiveIntensity: 0.25,
        roughness: 0.5,
      }),
    );
    this.top.name = `${options.id}-pressure-plate-top`;
    this.topRestY = size.y * 0.7;
    this.top.position.y = this.topRestY;
    this.root.add(this.top);

    this.trigger = new Trigger(`${options.id}-sensor`);
    this.unsubscribe = this.trigger.events.on('occupancyChanged', ({ occupants }) => {
      this.setPressed(occupants.size >= this.requiredOccupants);
    });
  }

  get isPressed(): boolean {
    return this.pressed;
  }

  setOccupants(occupantIds: Iterable<string>): void {
    this.trigger.setOccupants(occupantIds);
  }

  reset(): void {
    this.trigger.clear();
  }

  dispose(): void {
    this.unsubscribe();
    this.trigger.dispose();
    this.events.clear();
    this.disposeRoot();
  }

  private setPressed(pressed: boolean): void {
    if (this.pressed === pressed) return;

    this.pressed = pressed;
    this.top.position.y = this.topRestY - (pressed ? 0.09 : 0);
    this.top.material.color.setHex(pressed ? 0x88e6a1 : 0xd8b34a);
    this.top.material.emissive.setHex(pressed ? 0x12552a : 0x4a3003);
    this.events.emit('changed', { plate: this, pressed });
  }

  private disposeRoot(): void {
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      object.material.dispose();
    });
    this.root.clear();
  }
}
