import * as THREE from 'three';

import type { DissolveTarget } from '../abilities/DissolveTarget.ts';
import { EventBus } from '../core/EventBus.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import {
  SecurityDrone,
  type SecurityDroneConfig,
  type SecurityDroneReadModel,
  type SecurityDroneTarget,
} from './SecurityDrone.ts';
import type { DroneProjectileSystem } from './DroneProjectileSystem.ts';

const EPSILON = 1e-9;

export type CeilingSecurityDroneState =
  | 'active'
  | 'supportDissolving'
  | 'released'
  | 'falling'
  | 'disabled'
  | 'replacementWarning'
  | 'reinstalling';

export interface CeilingSecurityDroneConfig {
  readonly drone: SecurityDroneConfig;
  readonly supportTargetId: string;
  readonly radioactiveImpactPosition: THREE.Vector3;
  readonly radioactiveImpactRotation: THREE.Euler;
  readonly hatchPosition: THREE.Vector3;
  readonly fallDurationSeconds: number;
  readonly disabledDurationSeconds: number;
  readonly replacementWarningSeconds: number;
  readonly reinstallDurationSeconds: number;
}

export interface CeilingSecurityDroneReadModel {
  readonly id: string;
  readonly supportTargetId: string;
  readonly state: CeilingSecurityDroneState;
  readonly stateElapsedSeconds: number;
  readonly replacementCableVisible: boolean;
  readonly hatchOpen: boolean;
  readonly drone: SecurityDroneReadModel;
}

interface MutableCeilingReadModel {
  readonly id: string;
  readonly supportTargetId: string;
  state: CeilingSecurityDroneState;
  stateElapsedSeconds: number;
  replacementCableVisible: boolean;
  hatchOpen: boolean;
  readonly drone: SecurityDroneReadModel;
}

export interface CeilingSecurityDroneEvents {
  stateChanged: {
    readonly droneId: string;
    readonly previousState: CeilingSecurityDroneState;
    readonly state: CeilingSecurityDroneState;
  };
  released: { readonly droneId: string; readonly supportTargetId: string };
  impacted: { readonly droneId: string };
  disabled: { readonly droneId: string };
  replacementWarning: { readonly droneId: string };
  hatchChanged: { readonly droneId: string; readonly open: boolean };
  installed: { readonly droneId: string };
  poweredOn: { readonly droneId: string };
  reset: { readonly droneId: string };
}

/** Deterministic soluble-support and replacement lifecycle for one roof drone. */
export class CeilingSecurityDrone {
  readonly root = new THREE.Group();
  readonly events = new EventBus<CeilingSecurityDroneEvents>();
  readonly drone: SecurityDrone;
  readonly readModel: CeilingSecurityDroneReadModel;
  readonly radiationTarget: {
    readonly id: string;
    readonly kind: 'drone';
    readonly position: THREE.Vector3;
    readonly radiusMetres: number;
    readonly response: 'signal';
  };

  private readonly config: CeilingSecurityDroneConfig;
  private readonly support: DissolveTarget;
  private readonly world: CollisionWorld;
  private readonly surfaces: SurfaceRegistry;
  private readonly mount: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private readonly cable: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private readonly initialPosition: THREE.Vector3;
  private readonly impactPosition: THREE.Vector3;
  private readonly initialQuaternion = new THREE.Quaternion();
  private readonly impactQuaternion = new THREE.Quaternion();
  private readonly radiationPosition = new THREE.Vector3();
  private readonly model: MutableCeilingReadModel;
  private readonly unsubscribeSupport: () => void;
  private state: CeilingSecurityDroneState = 'active';
  private stateElapsed = 0;
  private radiationContactPending = false;
  private replacementInstalled = false;
  private cableCollisionEnabled = false;
  private disposed = false;

  constructor(
    config: CeilingSecurityDroneConfig,
    support: DissolveTarget,
    world: CollisionWorld,
    surfaces: SurfaceRegistry,
    projectiles: DroneProjectileSystem,
  ) {
    validateConfig(config, support);
    this.config = config;
    this.support = support;
    this.world = world;
    this.surfaces = surfaces;
    this.initialPosition = config.drone.initialPosition.clone();
    this.impactPosition = config.radioactiveImpactPosition.clone();
    this.initialQuaternion.setFromEuler(config.drone.initialRotation ?? new THREE.Euler());
    this.impactQuaternion.setFromEuler(config.radioactiveImpactRotation);

    this.root.name = `${config.drone.id}-ceiling-lifecycle`;
    this.drone = new SecurityDrone(config.drone, world, surfaces, projectiles);
    this.root.add(this.drone.root);

    this.mount = createProxy(
      `${config.drone.id}-replacement-hatch`,
      new THREE.Vector3(1.4, 0.24, 1.4),
      config.hatchPosition,
      0x37434a,
      'drone-replacement-hatch',
    );
    this.cable = createProxy(
      `${config.drone.id}-replacement-cable`,
      new THREE.Vector3(0.12, 1, 0.12),
      config.hatchPosition,
      0x7f8b91,
      'non-soluble-replacement-cable',
    );
    this.cable.visible = false;
    this.root.add(this.mount, this.cable);
    world.register(this.mount);
    surfaces.register(this.mount);

    this.radiationTarget = {
      id: config.drone.id,
      kind: 'drone',
      position: this.radiationPosition,
      radiusMetres: Math.min(config.drone.colliderSize.x, config.drone.colliderSize.z) * 0.5,
      response: 'signal',
    };
    this.model = {
      id: config.drone.id,
      supportTargetId: config.supportTargetId,
      state: 'active',
      stateElapsedSeconds: 0,
      replacementCableVisible: false,
      hatchOpen: false,
      drone: this.drone.readModel,
    };
    this.readModel = this.model;
    this.unsubscribeSupport = support.events.on('completed', () => this.release());
    this.syncCable();
    this.syncRadiationPosition();
  }

  update(deltaSeconds: number, targets: readonly SecurityDroneTarget[]): void {
    this.assertActive();
    validateDelta(deltaSeconds);
    this.stateElapsed += deltaSeconds;

    if (
      this.state === 'active' &&
      !this.replacementInstalled &&
      this.support.progress > 0
    ) {
      this.transition('supportDissolving');
    } else if (this.state === 'supportDissolving' && this.support.progress <= 0) {
      this.transition('active');
    }

    if (this.state === 'active' || this.state === 'supportDissolving') {
      this.drone.update(deltaSeconds, targets);
    } else {
      if (this.state === 'released') {
        this.transition('falling');
      }
      if (this.state === 'falling') {
        const t = Math.min(1, this.stateElapsed / this.config.fallDurationSeconds);
        this.drone.root.position.lerpVectors(this.initialPosition, this.impactPosition, t);
        this.drone.root.quaternion.slerpQuaternions(this.initialQuaternion, this.impactQuaternion, t);
        if (this.radiationContactPending && t >= 1 - EPSILON) this.disableFromImpact();
      } else if (this.state === 'disabled') {
        const warningStart = this.config.disabledDurationSeconds - this.config.replacementWarningSeconds;
        if (this.stateElapsed + EPSILON >= warningStart) {
          this.transition('replacementWarning');
          this.setHatchOpen(true);
          this.setCableVisible(true);
          this.events.emit('replacementWarning', { droneId: this.drone.id });
        }
      } else if (this.state === 'replacementWarning') {
        if (this.stateElapsed + EPSILON >= this.config.replacementWarningSeconds) {
          this.transition('reinstalling');
        }
      } else if (this.state === 'reinstalling') {
        const t = Math.min(1, this.stateElapsed / this.config.reinstallDurationSeconds);
        this.drone.root.position.lerpVectors(this.impactPosition, this.initialPosition, t);
        this.drone.root.quaternion.slerpQuaternions(this.impactQuaternion, this.initialQuaternion, t);
        if (t >= 1 - EPSILON) {
          this.transition('active');
          this.setHatchOpen(false);
          this.replacementInstalled = true;
          this.drone.setEnabled(true);
          this.events.emit('installed', { droneId: this.drone.id });
          this.events.emit('poweredOn', { droneId: this.drone.id });
        }
      }
    }
    this.syncCable();
    this.syncRadiationPosition();
    this.syncReadModel();
  }

  signalRadiationContact(): void {
    if (this.disposed || (this.state !== 'released' && this.state !== 'falling')) return;
    this.radiationContactPending = true;
    if (
      this.state === 'falling' &&
      this.drone.root.position.distanceToSquared(this.impactPosition) <= EPSILON
    ) this.disableFromImpact();
  }

  cancelTransientState(): void {
    if (this.disposed) return;
    this.drone.cancelTransientState();
  }

  reset(): void {
    if (this.disposed) return;
    this.state = 'active';
    this.stateElapsed = 0;
    this.radiationContactPending = false;
    this.replacementInstalled = false;
    this.drone.reset();
    this.setCableVisible(false);
    this.setHatchOpen(false);
    this.syncCable();
    this.syncRadiationPosition();
    this.syncReadModel();
    this.events.emit('reset', { droneId: this.drone.id });
  }

  dispose(): void {
    if (this.disposed) return;
    this.unsubscribeSupport();
    this.drone.dispose();
    this.world.unregister(this.mount);
    this.world.unregister(this.cable);
    this.surfaces.unregister(this.mount);
    this.surfaces.unregister(this.cable);
    this.mount.geometry.dispose();
    this.mount.material.dispose();
    this.cable.geometry.dispose();
    this.cable.material.dispose();
    this.root.removeFromParent();
    this.root.clear();
    this.events.clear();
    this.disposed = true;
  }

  private release(): void {
    if (this.disposed || (this.state !== 'active' && this.state !== 'supportDissolving')) return;
    this.drone.setEnabled(false);
    this.transition('released');
    this.events.emit('released', {
      droneId: this.drone.id,
      supportTargetId: this.support.id,
    });
  }

  private disableFromImpact(): void {
    if (this.state !== 'falling' && this.state !== 'released') return;
    this.drone.root.position.copy(this.impactPosition);
    this.drone.root.quaternion.copy(this.impactQuaternion);
    this.radiationContactPending = false;
    this.transition('disabled');
    this.events.emit('impacted', { droneId: this.drone.id });
    this.events.emit('disabled', { droneId: this.drone.id });
  }

  private transition(state: CeilingSecurityDroneState): void {
    if (this.state === state) return;
    const previousState = this.state;
    this.state = state;
    this.stateElapsed = 0;
    this.model.state = state;
    this.model.stateElapsedSeconds = 0;
    this.events.emit('stateChanged', { droneId: this.drone.id, previousState, state });
  }

  private setHatchOpen(open: boolean): void {
    const wasOpen = this.model.hatchOpen;
    this.mount.rotation.z = open ? Math.PI * 0.42 : 0;
    this.model.hatchOpen = open;
    if (wasOpen !== open) this.events.emit('hatchChanged', { droneId: this.drone.id, open });
  }

  private syncCable(): void {
    const hatch = this.config.hatchPosition;
    const drone = this.drone.root.position;
    const length = Math.max(0.01, hatch.distanceTo(drone));
    this.cable.position.lerpVectors(hatch, drone, 0.5);
    this.cable.scale.set(1, length, 1);
  }

  private syncReadModel(): void {
    this.model.state = this.state;
    this.model.stateElapsedSeconds = this.stateElapsed;
    this.model.replacementCableVisible = this.cable.visible;
  }

  private setCableVisible(visible: boolean): void {
    this.cable.visible = visible;
    if (visible === this.cableCollisionEnabled) return;
    this.cableCollisionEnabled = visible;
    if (visible) {
      this.world.register(this.cable);
      this.surfaces.register(this.cable);
    } else {
      this.world.unregister(this.cable);
      this.surfaces.unregister(this.cable);
    }
  }

  private syncRadiationPosition(): void {
    this.drone.root.getWorldPosition(this.radiationPosition);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Cannot update a disposed ceiling drone.');
  }
}

function createProxy(
  name: string,
  size: THREE.Vector3,
  position: THREE.Vector3,
  colour: number,
  authoringRole: string,
): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55, metalness: 0.65 }),
  );
  mesh.name = name;
  mesh.position.copy(position);
  mesh.userData.surfaceTag = 'default';
  mesh.userData.soluble = false;
  mesh.userData.authoringRole = authoringRole;
  return mesh;
}

function validateDelta(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    throw new Error('Ceiling drone deltaSeconds must be positive and finite.');
  }
}

function validateConfig(config: CeilingSecurityDroneConfig, support: DissolveTarget): void {
  if (config.drone.type !== 'ceiling') throw new Error('Ceiling lifecycle requires a ceiling drone.');
  if (support.id !== config.supportTargetId) {
    throw new Error(`Ceiling drone "${config.drone.id}" references the wrong support target.`);
  }
  for (const [label, value] of [
    ['fallDurationSeconds', config.fallDurationSeconds],
    ['disabledDurationSeconds', config.disabledDurationSeconds],
    ['replacementWarningSeconds', config.replacementWarningSeconds],
    ['reinstallDurationSeconds', config.reinstallDurationSeconds],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive and finite.`);
  }
  if (config.replacementWarningSeconds >= config.disabledDurationSeconds) {
    throw new Error('Replacement warning must be shorter than the disabled interval.');
  }
}
