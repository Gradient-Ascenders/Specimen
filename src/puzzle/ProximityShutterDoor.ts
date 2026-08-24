import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import {
  BoxTriggerSensor,
  type SphereTriggerOccupant,
} from './BoxTriggerSensor.ts';
import { Trigger } from './Trigger.ts';

export type ProximityShutterDoorState =
  | 'closed'
  | 'opening'
  | 'open'
  | 'closing';

export interface ProximityShutterDoorEvents {
  stateChanged: {
    readonly door: ProximityShutterDoor;
    readonly state: ProximityShutterDoorState;
  };
  lockChanged: {
    readonly door: ProximityShutterDoor;
    readonly locked: boolean;
  };
}

export interface ProximityShutterDoorOptions {
  readonly id: string;
  readonly widthMetres: number;
  readonly heightMetres: number;
  readonly depthMetres?: number;
  readonly openDurationSeconds?: number;
  readonly proximityDepthMetres?: number;
  readonly initiallyLocked?: boolean;
}

/**
 * Collision-backed vertical security shutter.
 *
 * An unlocked door retracts upward while either persistent slime is near it,
 * then lowers after the final occupant leaves the proximity volume. A locked
 * door remains closed and changes its adjacent indicator from green to red.
 */
export class ProximityShutterDoor {
  readonly root = new THREE.Group();
  readonly events = new EventBus<ProximityShutterDoorEvents>();
  readonly proximityTrigger: Trigger;
  readonly collisionMesh: THREE.Mesh<
    THREE.BoxGeometry,
    THREE.MeshStandardMaterial
  >;
  readonly statusLight: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshStandardMaterial
  >;

  private readonly heightMetres: number;
  private readonly openDurationSeconds: number;
  private readonly initiallyLocked: boolean;
  private readonly proximitySensor: BoxTriggerSensor;
  private readonly proximityCentreWorld = new THREE.Vector3();
  private readonly closedPanelY: number;
  private readonly openPanelY: number;
  private readonly unsubscribeOccupancy: () => void;

  private stateValue: ProximityShutterDoorState = 'closed';
  private lockedValue: boolean;
  private targetOpen = false;
  private openProgressValue = 0;

  constructor(options: ProximityShutterDoorOptions) {
    if (!options.id) throw new Error('Proximity shutter IDs cannot be empty.');
    for (const dimension of [options.widthMetres, options.heightMetres]) {
      if (!Number.isFinite(dimension) || dimension <= 0) {
        throw new Error('Proximity shutter dimensions must be positive.');
      }
    }

    const depthMetres = options.depthMetres ?? 0.3;
    const proximityDepthMetres = options.proximityDepthMetres ?? 6;
    this.openDurationSeconds = options.openDurationSeconds ?? 0.72;
    if (
      !Number.isFinite(depthMetres) ||
      depthMetres <= 0 ||
      !Number.isFinite(proximityDepthMetres) ||
      proximityDepthMetres <= 0 ||
      !Number.isFinite(this.openDurationSeconds) ||
      this.openDurationSeconds <= 0
    ) {
      throw new Error('Proximity shutter timing and depth must be positive.');
    }

    this.root.name = `${options.id}-proximity-shutter`;
    Object.assign(this.root.userData, {
      doorId: options.id,
      doorMotion: 'vertical-fnaf-style',
    });
    this.heightMetres = options.heightMetres;
    this.initiallyLocked = options.initiallyLocked ?? false;
    this.lockedValue = this.initiallyLocked;
    this.closedPanelY = options.heightMetres * 0.5;
    this.openPanelY =
      this.closedPanelY + options.heightMetres + 0.28;

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x303b42,
      roughness: 0.62,
      metalness: 0.42,
    });
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x87969e,
      roughness: 0.48,
      metalness: 0.52,
    });
    const indicatorHousingMaterial = new THREE.MeshStandardMaterial({
      color: 0x202a30,
      roughness: 0.68,
      metalness: 0.3,
    });
    const indicatorMaterial = new THREE.MeshStandardMaterial({
      color: 0x35e874,
      emissive: 0x16c951,
      emissiveIntensity: 2.8,
      roughness: 0.28,
      metalness: 0.05,
      toneMapped: false,
    });

    const frameDepth = depthMetres + 0.18;
    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(options.widthMetres + 0.45, 0.34, frameDepth),
      frameMaterial,
    );
    frameTop.name = `${options.id}-frame-top`;
    frameTop.position.y = options.heightMetres + 0.17;

    const sideGeometry = new THREE.BoxGeometry(
      0.28,
      options.heightMetres,
      frameDepth,
    );
    const frameLeft = new THREE.Mesh(sideGeometry, frameMaterial);
    frameLeft.name = `${options.id}-frame-left`;
    frameLeft.position.set(
      -options.widthMetres * 0.5 - 0.14,
      this.closedPanelY,
      0,
    );
    const frameRight = new THREE.Mesh(sideGeometry, frameMaterial);
    frameRight.name = `${options.id}-frame-right`;
    frameRight.position.set(
      options.widthMetres * 0.5 + 0.14,
      this.closedPanelY,
      0,
    );

    this.collisionMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        options.widthMetres,
        options.heightMetres,
        depthMetres,
      ),
      panelMaterial,
    );
    this.collisionMesh.name = `${options.id}-shutter-panel`;
    this.collisionMesh.position.y = this.closedPanelY;
    Object.assign(this.collisionMesh.userData, {
      doorId: options.id,
      surfaceTag: 'default',
      movementFaceMode: 'all',
      sizeMetres: [
        options.widthMetres,
        options.heightMetres,
        depthMetres,
      ],
    });

    const indicatorHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.7, 0.28),
      indicatorHousingMaterial,
    );
    indicatorHousing.name = `${options.id}-status-housing`;
    indicatorHousing.position.set(
      options.widthMetres * 0.5 + 0.62,
      options.heightMetres * 0.62,
      -frameDepth * 0.65,
    );

    this.statusLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 14, 10),
      indicatorMaterial,
    );
    this.statusLight.name = `${options.id}-status-light`;
    this.statusLight.position.copy(indicatorHousing.position);
    this.statusLight.position.z -= 0.18;
    this.statusLight.userData.doorId = options.id;

    this.root.add(
      frameTop,
      frameLeft,
      frameRight,
      this.collisionMesh,
      indicatorHousing,
      this.statusLight,
    );

    this.proximityTrigger = new Trigger(`${options.id}-proximity`);
    this.proximitySensor = new BoxTriggerSensor(
      new THREE.Vector3(),
      new THREE.Vector3(
        options.widthMetres + 4,
        options.heightMetres + 1.4,
        proximityDepthMetres,
      ),
    );
    this.unsubscribeOccupancy = this.proximityTrigger.events.on(
      'occupancyChanged',
      () => this.syncTargetOpen(),
    );
    this.applyIndicator();
    this.applyPanelPose();
  }

  get state(): ProximityShutterDoorState {
    return this.stateValue;
  }

  get locked(): boolean {
    return this.lockedValue;
  }

  get openProgress(): number {
    return this.openProgressValue;
  }

  setLocked(locked: boolean): void {
    if (this.lockedValue === locked) return;
    this.lockedValue = locked;
    this.applyIndicator();
    this.syncTargetOpen();
    this.events.emit('lockChanged', { door: this, locked });
  }

  update(
    deltaSeconds: number,
    occupants: Iterable<SphereTriggerOccupant>,
  ): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('Proximity shutter delta must be positive and finite.');
    }

    this.proximityCentreWorld.set(0, this.heightMetres * 0.5, 0);
    this.root.localToWorld(this.proximityCentreWorld);
    this.proximitySensor.setCentre(this.proximityCentreWorld);
    this.proximitySensor.update(this.proximityTrigger, occupants);

    const previousProgress = this.openProgressValue;
    const progressStep = deltaSeconds / this.openDurationSeconds;
    this.openProgressValue = THREE.MathUtils.clamp(
      this.openProgressValue + (this.targetOpen ? progressStep : -progressStep),
      0,
      1,
    );
    if (this.openProgressValue !== previousProgress) this.applyPanelPose();

    if (this.openProgressValue >= 1) {
      this.setState('open');
    } else if (this.openProgressValue <= 0) {
      this.setState('closed');
    }
  }

  reset(): void {
    this.lockedValue = this.initiallyLocked;
    this.targetOpen = false;
    this.openProgressValue = 0;
    this.proximityTrigger.clear();
    this.applyIndicator();
    this.applyPanelPose();
    this.setState('closed');
  }

  dispose(): void {
    this.unsubscribeOccupancy();
    this.proximityTrigger.dispose();
    this.events.clear();
    this.root.removeFromParent();

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of objectMaterials) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.root.clear();
  }

  private syncTargetOpen(): void {
    const shouldOpen = !this.lockedValue && this.proximityTrigger.occupied;
    if (this.targetOpen === shouldOpen) return;
    this.targetOpen = shouldOpen;
    this.setState(shouldOpen ? 'opening' : 'closing');
  }

  private applyPanelPose(): void {
    const easedProgress =
      this.openProgressValue *
      this.openProgressValue *
      (3 - 2 * this.openProgressValue);
    this.collisionMesh.position.y = THREE.MathUtils.lerp(
      this.closedPanelY,
      this.openPanelY,
      easedProgress,
    );
    this.collisionMesh.userData.openProgress = this.openProgressValue;
  }

  private applyIndicator(): void {
    const material = this.statusLight.material;
    material.color.setHex(this.lockedValue ? 0xff334d : 0x35e874);
    material.emissive.setHex(this.lockedValue ? 0xe31532 : 0x16c951);
    this.statusLight.userData.lockState = this.lockedValue
      ? 'locked-red'
      : 'unlocked-green';
  }

  private setState(state: ProximityShutterDoorState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    this.events.emit('stateChanged', { door: this, state });
  }
}
