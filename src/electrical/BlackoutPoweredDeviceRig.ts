import * as THREE from 'three';

import type { ElectricalTargetRegistry } from '../abilities/ElectricalTargetRegistry.ts';
import { LaserHazard } from '../hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../hazards/LaserHazardSystem.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import type { ResettablePuzzleComponent } from '../puzzle/PuzzleRegistry.ts';
import { ElectricalDeviceCollection } from './ElectricalDeviceCollection.ts';
import {
  GeneratorDevice,
  LaserJunctionDevice,
  PoweredDoorDevice,
  PoweredLiftDevice,
  PoweredLightDevice,
  PoweredPlatformDevice,
  RotatingBridgeDevice,
  TerminalDevice,
  type ElectricalDevice,
  type PoweredCarrierBody,
} from './PoweredDevices.ts';

export interface BlackoutPoweredDeviceRigOptions {
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly targetRegistry: ElectricalTargetRegistry;
  readonly requestFailure: () => void;
}

/**
 * Development-only executable composition for Issue #123.
 *
 * Later room authoring reuses the concrete device classes and collection; this
 * rig exists only to exercise all device types against Volt's real tether.
 */
export class BlackoutPoweredDeviceRig implements ResettablePuzzleComponent {
  readonly root = new THREE.Group();
  readonly devices: ElectricalDeviceCollection;

  readonly terminal: TerminalDevice;
  readonly generator: GeneratorDevice;
  readonly light: PoweredLightDevice;
  readonly door: PoweredDoorDevice;
  readonly platform: PoweredPlatformDevice;
  readonly lift: PoweredLiftDevice;
  readonly bridge: RotatingBridgeDevice;
  readonly laserJunction: LaserJunctionDevice;

  readonly controlledLaser: LaserHazard;
  readonly independentLaser: LaserHazard;
  readonly laserSystem: LaserHazardSystem;

  private disposed = false;

  constructor(options: BlackoutPoweredDeviceRigOptions) {
    this.root.name = 'blackout-powered-device-development-rig';

    const createdDevices: ElectricalDevice[] = [];
    let controlledLaser: LaserHazard | undefined;
    let independentLaser: LaserHazard | undefined;
    let laserSystem: LaserHazardSystem | undefined;
    let collection: ElectricalDeviceCollection | undefined;

    try {
      controlledLaser = new LaserHazard({
        id: 'fixture-controlled-laser',
        start: { x: -6, y: 1.1, z: 36 },
        end: { x: 6, y: 1.1, z: 36 },
        enabled: true,
        timeline: {
          axisWorld: { x: 0, y: 1, z: 0 },
          repeat: true,
          steps: [
            {
              kind: 'hold',
              durationSeconds: 0.8,
              enabled: true,
              angleRadians: 0,
            },
            {
              kind: 'hold',
              durationSeconds: 0.45,
              enabled: false,
              angleRadians: 0,
            },
          ],
        },
      });
      this.controlledLaser = controlledLaser;

      independentLaser = new LaserHazard({
        id: 'fixture-independent-laser',
        start: { x: -6, y: 1.8, z: 39 },
        end: { x: 6, y: 1.8, z: 39 },
        enabled: true,
      });
      this.independentLaser = independentLaser;

      laserSystem = new LaserHazardSystem({
        id: 'blackout-powered-device-lasers',
        hazards: [controlledLaser, independentLaser],
        requestRecovery: () => {
          options.requestFailure();
        },
      });
      this.laserSystem = laserSystem;
      this.root.add(laserSystem.root);

      this.terminal = new TerminalDevice({
        id: 'fixture-terminal',
        displayName: 'Development Terminal',
        position: new THREE.Vector3(0, 1.1, 8),
        powerMode: 'sustained',
      });
      createdDevices.push(this.terminal);

      this.generator = new GeneratorDevice({
        id: 'fixture-generator',
        displayName: 'Development Generator',
        position: new THREE.Vector3(-4, 1.1, 10.5),
        powerMode: 'sustained',
      });
      createdDevices.push(this.generator);

      this.light = new PoweredLightDevice({
        id: 'fixture-light',
        displayName: 'Powered Development Light',
        position: new THREE.Vector3(-6, 1.1, 14),
        powerMode: 'sustained',
      });
      createdDevices.push(this.light);

      this.door = new PoweredDoorDevice({
        id: 'fixture-door',
        displayName: 'Powered Development Door',
        collisionWorld: options.collisionWorld,
        surfaceRegistry: options.surfaceRegistry,
        closedPosition: new THREE.Vector3(0, 1.5, 18),
        panelSize: new THREE.Vector3(4, 3, 0.4),
        travelAxis: new THREE.Vector3(0, 1, 0),
        travelDistance: 3.6,
        openingDurationSeconds: 1,
        closingDurationSeconds: 0.8,
        powerMode: 'sustained',
      });
      createdDevices.push(this.door);

      this.platform = new PoweredPlatformDevice({
        id: 'fixture-platform',
        displayName: 'Powered Development Platform',
        collisionWorld: options.collisionWorld,
        surfaceRegistry: options.surfaceRegistry,
        start: new THREE.Vector3(4, 0.35, 17),
        end: new THREE.Vector3(4, 0.35, 23),
        size: new THREE.Vector3(2.4, 0.3, 2.4),
        travelDurationSeconds: 2.5,
        routePolicy: 'shuttle',
        powerMode: 'sustained',
      });
      createdDevices.push(this.platform);

      this.lift = new PoweredLiftDevice({
        id: 'fixture-lift',
        displayName: 'Powered Development Lift',
        collisionWorld: options.collisionWorld,
        surfaceRegistry: options.surfaceRegistry,
        start: new THREE.Vector3(-4, 0.35, 22),
        end: new THREE.Vector3(-4, 4.35, 22),
        size: new THREE.Vector3(2.5, 0.3, 2.5),
        travelDurationSeconds: 2.8,
        routePolicy: 'shuttle',
        powerMode: 'sustained',
      });
      createdDevices.push(this.lift);

      this.bridge = new RotatingBridgeDevice({
        id: 'fixture-bridge',
        displayName: 'Latched Development Bridge',
        collisionWorld: options.collisionWorld,
        surfaceRegistry: options.surfaceRegistry,
        position: new THREE.Vector3(0, 0.35, 28),
        size: new THREE.Vector3(6, 0.35, 1.6),
        endAngleRadians: Math.PI * 0.5,
        rotationDurationSeconds: 2.25,
        powerMode: 'latched',
      });
      createdDevices.push(this.bridge);

      this.laserJunction = new LaserJunctionDevice({
        id: 'fixture-laser-junction',
        displayName: 'Development Laser Junction',
        position: new THREE.Vector3(5.5, 1.1, 33),
        hazards: [controlledLaser],
        mode: 'suppress-when-powered',
        powerMode: 'sustained',
      });
      createdDevices.push(this.laserJunction);

      collection = new ElectricalDeviceCollection(options.targetRegistry);
      this.devices = collection;

      for (const device of createdDevices) {
        this.root.add(device.root);
        collection.addDevice(device);
      }

      // Explicit authored circuits: no room-global power fan-out.
      collection.addSupplyLink(this.generator.id, this.light.id);
      collection.addSupplyLink(this.generator.id, this.platform.id);
      collection.addSupplyLink(this.generator.id, this.lift.id);
      collection.addSupplyLink(this.terminal.id, this.door.id);
      collection.recomputePower();
    } catch (error) {
      collection?.dispose();
      for (let index = createdDevices.length - 1; index >= 0; index -= 1) {
        try {
          createdDevices[index]?.dispose();
        } catch {
          // Preserve the original construction failure.
        }
      }
      if (laserSystem) {
        try {
          laserSystem.dispose();
        } catch {
          // Preserve the original construction failure.
        }
      } else {
        try {
          controlledLaser?.dispose();
        } catch {
          // Preserve the original construction failure.
        }
        try {
          independentLaser?.dispose();
        } catch {
          // Preserve the original construction failure.
        }
      }
      this.root.removeFromParent();
      this.root.clear();
      throw error;
    }
  }

  recomputePower(): void {
    this.devices.recomputePower();
  }

  updateMechanics(
    deltaSeconds: number,
    bodies: readonly PoweredCarrierBody[],
  ): void {
    this.devices.updateMechanics(deltaSeconds, bodies);
  }

  updateHazards(
    deltaSeconds: number,
    bodies: readonly PoweredCarrierBody[],
  ): void {
    this.laserSystem.updateTargets(deltaSeconds, bodies);
  }

  reset(): void {
    if (this.disposed) return;
    // Laser authored timelines/gates reset first. Device recomputation then
    // reapplies the junction's circuit gate deterministically.
    this.laserSystem.reset();
    this.devices.reset();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.devices.dispose();
    this.laserSystem.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
