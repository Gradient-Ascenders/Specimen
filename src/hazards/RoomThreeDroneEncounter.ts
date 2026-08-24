import * as THREE from 'three';

import type { DissolveTarget } from '../abilities/DissolveTarget.ts';
import { EventBus } from '../core/EventBus.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import type { PlayableSlimeId } from '../levels/LevelProgression.ts';
import { SlimeDamageSystem, type SlimeHealthReadModel } from '../systems/SlimeDamageSystem.ts';
import {
  CeilingSecurityDrone,
  type CeilingSecurityDroneConfig,
  type CeilingSecurityDroneReadModel,
} from './CeilingSecurityDrone.ts';
import {
  DroneProjectileSystem,
  type DroneProjectileReadState,
} from './DroneProjectileSystem.ts';
import {
  GroundSecurityDrone,
  type GroundSecurityDroneConfig,
  type GroundSecurityDroneReadModel,
} from './GroundSecurityDrone.ts';
import type { RadiationContactTarget } from './RadioactiveHazardSystem.ts';
import type { SecurityDroneTarget } from './SecurityDrone.ts';

export interface RoomThreeDroneEncounterConfig {
  readonly ceilingDrones: readonly CeilingSecurityDroneConfig[];
  readonly groundDrones: readonly GroundSecurityDroneConfig[];
}

export interface RoomThreeDroneEncounterOptions {
  readonly config: RoomThreeDroneEncounterConfig;
  readonly supportsById: ReadonlyMap<string, DissolveTarget>;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly bobBody: KinematicBody;
  readonly goopBody: KinematicBody;
  readonly requestDeath: (slimeId: PlayableSlimeId) => boolean;
  readonly radiationSurface?: {
    intersectsWorldSphere(
      position: { readonly x: number; readonly y: number; readonly z: number },
      radiusMetres: number,
    ): boolean;
  };
}

export interface RoomThreeDroneEncounterReadModel {
  readonly ceilingDrones: readonly CeilingSecurityDroneReadModel[];
  readonly groundDrones: readonly GroundSecurityDroneReadModel[];
  readonly projectiles: readonly DroneProjectileReadState[];
  readonly health: readonly SlimeHealthReadModel[];
  readonly groundDisabledCount: number;
  readonly allGroundDronesDisabled: boolean;
}

interface MutableEncounterReadModel {
  readonly ceilingDrones: readonly CeilingSecurityDroneReadModel[];
  readonly groundDrones: readonly GroundSecurityDroneReadModel[];
  readonly projectiles: readonly DroneProjectileReadState[];
  readonly health: readonly SlimeHealthReadModel[];
  groundDisabledCount: number;
  allGroundDronesDisabled: boolean;
}

export interface RoomThreeDroneEncounterEvents {
  groundDisableCountChanged: { readonly disabledCount: number; readonly total: number };
  allGroundDronesDisabled: Record<string, never>;
  reset: Record<string, never>;
}

/** Owns the bounded shared combat services and all seven Room 3 drone instances. */
export class RoomThreeDroneEncounter {
  readonly root = new THREE.Group();
  readonly events = new EventBus<RoomThreeDroneEncounterEvents>();
  readonly damage: SlimeDamageSystem;
  readonly projectiles: DroneProjectileSystem;
  readonly ceilingDrones: readonly CeilingSecurityDrone[];
  readonly groundDrones: readonly GroundSecurityDrone[];
  readonly radiationTargets: readonly RadiationContactTarget[];
  readonly readModel: RoomThreeDroneEncounterReadModel;

  private readonly bobBody: KinematicBody;
  private readonly radiationSurface: RoomThreeDroneEncounterOptions['radiationSurface'];
  private readonly targets: readonly SecurityDroneTarget[];
  private readonly projectileTargets: readonly [
    {
      readonly slimeId: 'bob';
      readonly position: KinematicBody['position'];
      readonly previousPosition: KinematicBody['previousPosition'];
      readonly radiusMetres: number;
    },
    {
      readonly slimeId: 'goop';
      readonly position: KinematicBody['position'];
      readonly previousPosition: KinematicBody['previousPosition'];
      readonly radiusMetres: number;
    },
  ];
  private readonly model: MutableEncounterReadModel;
  private readonly droneById = new Map<string, CeilingSecurityDrone | GroundSecurityDrone>();
  private readonly unsubscribeDamageDeath: () => void;
  private disabledCount = 0;
  private disposed = false;

  constructor(options: RoomThreeDroneEncounterOptions) {
    if (options.config.ceilingDrones.length !== 3) {
      throw new Error('Cultivation Room 3 requires exactly three ceiling drones.');
    }
    if (options.config.groundDrones.length !== 4) {
      throw new Error('Cultivation Room 3 requires exactly four ground drones.');
    }
    const droneIds = new Set<string>();
    for (const config of [
      ...options.config.ceilingDrones.map((entry) => entry.drone),
      ...options.config.groundDrones.map((entry) => entry.drone),
    ]) {
      if (!config.id || droneIds.has(config.id)) {
        throw new Error('Room 3 drone IDs must be unique and non-empty.');
      }
      droneIds.add(config.id);
    }
    for (const config of options.config.ceilingDrones) {
      if (!options.supportsById.has(config.supportTargetId)) {
        throw new Error(`Ceiling drone "${config.drone.id}" has no registered support target.`);
      }
    }
    this.root.name = 'cultivation-room-3-drone-encounter';
    this.bobBody = options.bobBody;
    this.radiationSurface = options.radiationSurface;
    this.damage = new SlimeDamageSystem();
    this.projectiles = new DroneProjectileSystem(options.collisionWorld, this.damage);
    this.targets = [
      { slimeId: 'bob', position: options.bobBody.position },
      { slimeId: 'goop', position: options.goopBody.position },
    ];
    this.projectileTargets = [
      {
        slimeId: 'bob',
        position: options.bobBody.position,
        previousPosition: options.bobBody.previousPosition,
        radiusMetres: options.bobBody.radiusMetres,
      },
      {
        slimeId: 'goop',
        position: options.goopBody.position,
        previousPosition: options.goopBody.previousPosition,
        radiusMetres: options.goopBody.radiusMetres,
      },
    ];

    this.ceilingDrones = options.config.ceilingDrones.map((config) => {
      const support = options.supportsById.get(config.supportTargetId)!;
      const lifecycle = new CeilingSecurityDrone(
        config,
        support,
        options.collisionWorld,
        options.surfaceRegistry,
        this.projectiles,
      );
      this.registerDrone(lifecycle.drone.id, lifecycle);
      this.root.add(lifecycle.root);
      return lifecycle;
    });
    this.groundDrones = options.config.groundDrones.map((config) => {
      const lifecycle = new GroundSecurityDrone(
        config,
        options.collisionWorld,
        options.surfaceRegistry,
        this.projectiles,
      );
      this.registerDrone(lifecycle.drone.id, lifecycle);
      this.root.add(lifecycle.drone.root);
      return lifecycle;
    });
    this.radiationTargets = [
      ...this.ceilingDrones.map((drone) => drone.radiationTarget),
      ...this.groundDrones.map((drone) => drone.radiationTarget),
    ];
    this.model = {
      ceilingDrones: this.ceilingDrones.map((drone) => drone.readModel),
      groundDrones: this.groundDrones.map((drone) => drone.readModel),
      projectiles: this.projectiles.states,
      health: this.damage.health,
      groundDisabledCount: 0,
      allGroundDronesDisabled: false,
    };
    this.readModel = this.model;
    this.unsubscribeDamageDeath = this.damage.events.on('died', ({ slimeId }) => {
      options.requestDeath(slimeId);
    });
  }

  update(
    deltaSeconds: number,
    activeSlimeId: 'bob' | 'goop',
    bobMovementIntent: { readonly x: number; readonly y: number; readonly z: number },
  ): void {
    this.assertActive();
    this.damage.update(deltaSeconds);
    for (const drone of this.ceilingDrones) {
      drone.update(deltaSeconds, this.targets);
      this.signalRadiationContact(drone);
    }
    for (const drone of this.groundDrones) {
      drone.update(deltaSeconds, this.targets, this.bobBody, activeSlimeId, bobMovementIntent);
      this.signalRadiationContact(drone);
    }
    this.projectiles.update(deltaSeconds, this.projectileTargets);
    this.syncDisabledCount();
  }

  handleRadiationContact(targetId: string): void {
    if (this.disposed) return;
    this.droneById.get(targetId)?.signalRadiationContact();
  }

  cancelTransientState(): void {
    if (this.disposed) return;
    this.projectiles.reset();
    for (const drone of this.ceilingDrones) drone.cancelTransientState();
    for (const drone of this.groundDrones) drone.cancelTransientState();
  }

  reset(): void {
    if (this.disposed) return;
    this.projectiles.reset();
    this.damage.reset();
    for (const drone of this.ceilingDrones) drone.reset();
    for (const drone of this.groundDrones) drone.reset();
    this.disabledCount = 0;
    this.model.groundDisabledCount = 0;
    this.model.allGroundDronesDisabled = false;
    this.events.emit('reset', {});
  }

  dispose(): void {
    if (this.disposed) return;
    this.unsubscribeDamageDeath();
    for (const drone of this.ceilingDrones) drone.dispose();
    for (const drone of this.groundDrones) drone.dispose();
    this.projectiles.dispose();
    this.damage.dispose();
    this.droneById.clear();
    this.events.clear();
    this.root.removeFromParent();
    this.root.clear();
    this.disposed = true;
  }

  private registerDrone(id: string, drone: CeilingSecurityDrone | GroundSecurityDrone): void {
    if (this.droneById.has(id)) throw new Error(`Duplicate Room 3 drone ID "${id}".`);
    this.droneById.set(id, drone);
  }

  private syncDisabledCount(): void {
    let next = 0;
    for (const drone of this.groundDrones) {
      next += Number(drone.readModel.state === 'permanentlyDisabled');
    }
    if (next === this.disabledCount) return;
    const wasComplete = this.disabledCount === this.groundDrones.length;
    this.disabledCount = next;
    this.model.groundDisabledCount = next;
    this.model.allGroundDronesDisabled = next === this.groundDrones.length;
    this.events.emit('groundDisableCountChanged', {
      disabledCount: next,
      total: this.groundDrones.length,
    });
    if (!wasComplete && this.model.allGroundDronesDisabled) {
      this.events.emit('allGroundDronesDisabled', {});
    }
  }

  private signalRadiationContact(
    drone: CeilingSecurityDrone | GroundSecurityDrone,
  ): void {
    const surface = this.radiationSurface;
    if (!surface) return;
    if (drone instanceof CeilingSecurityDrone) {
      if (drone.readModel.state !== 'released' && drone.readModel.state !== 'falling') return;
    } else if (drone.readModel.state !== 'tipping') {
      return;
    }
    const target = drone.radiationTarget;
    if (surface.intersectsWorldSphere(target.position, target.radiusMetres)) {
      drone.signalRadiationContact();
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Cannot update a disposed Room 3 drone encounter.');
  }
}
