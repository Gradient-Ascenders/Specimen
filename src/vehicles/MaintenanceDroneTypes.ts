import type { EventBus } from '../core/EventBus.ts';
import type { ReadonlyVector3State } from '../physics/KinematicBody.ts';

export type MaintenanceDroneState =
  | 'damaged-idle'
  | 'starting'
  | 'mounted'
  | 'parked-hover'
  | 'unpowered-falling'
  | 'grounded-idle'
  | 'shorted'
  | 'recovering'
  | 'disposed';

export type MaintenanceDroneRecoveryReason =
  | 'acid'
  | 'shorted'
  | 'out-of-bounds'
  | 'inaccessible'
  | 'death'
  | 'checkpoint'
  | 'restart';

export type MaintenanceDroneMountRejectReason =
  | 'not-volt'
  | 'out-of-range'
  | 'unavailable'
  | 'unsafe-rider';

export type MaintenanceDroneDismountRejectReason =
  | 'not-mounted'
  | 'unsafe-rider';

export interface MaintenanceDroneReadModel {
  readonly state: MaintenanceDroneState;
  readonly mountAvailable: boolean;
  readonly mounted: boolean;
  readonly parked: boolean;
  readonly powered: boolean;
  readonly startupProgress: number;
  readonly startupCompleted: boolean;
  readonly tutorialCompleted: boolean;
  readonly firstMountTutorialAvailable: boolean;
  readonly supported: boolean;
  readonly lightEnabled: boolean;
  readonly position: ReadonlyVector3State;
  readonly previousPosition: ReadonlyVector3State;
  readonly velocity: ReadonlyVector3State;
  readonly horizontalSpeed: number;
  readonly verticalSpeed: number;
  readonly recoveryReason?: MaintenanceDroneRecoveryReason;
}

export interface MaintenanceDroneEvents {
  startupStarted: Record<string, never>;
  startupCompleted: Record<string, never>;
  firstMountTutorialRequested: Record<string, never>;
  mounted: Record<string, never>;
  parked: Record<string, never>;
  controlResumed: Record<string, never>;
  dismounted: Record<string, never>;
  landed: Record<string, never>;
  shorted: { readonly reason: MaintenanceDroneRecoveryReason };
  recoveryStarted: { readonly reason: MaintenanceDroneRecoveryReason };
  recoveryCompleted: { readonly reason: MaintenanceDroneRecoveryReason };
  mountRejected: { readonly reason: MaintenanceDroneMountRejectReason };
  dismountRejected: { readonly reason: MaintenanceDroneDismountRejectReason };
}

export interface MaintenanceDroneFlightConfig {
  readonly maximumHorizontalSpeedMetresPerSecond: number;
  readonly maximumVerticalSpeedMetresPerSecond: number;
  readonly horizontalAccelerationMetresPerSecondSquared: number;
  readonly verticalAccelerationMetresPerSecondSquared: number;
  readonly brakingMetresPerSecondSquared: number;
  readonly fallingGravityMetresPerSecondSquared: number;
  readonly maximumFallSpeedMetresPerSecond: number;
  readonly collisionSkinMetres: number;
  readonly maximumCollisionIterations: number;
}

export const DEFAULT_MAINTENANCE_DRONE_FLIGHT_CONFIG:
Readonly<MaintenanceDroneFlightConfig> = {
  maximumHorizontalSpeedMetresPerSecond: 5.5,
  maximumVerticalSpeedMetresPerSecond: 4,
  horizontalAccelerationMetresPerSecondSquared: 14,
  verticalAccelerationMetresPerSecondSquared: 12,
  brakingMetresPerSecondSquared: 18,
  fallingGravityMetresPerSecondSquared: 18,
  maximumFallSpeedMetresPerSecond: 16,
  collisionSkinMetres: 0.01,
  maximumCollisionIterations: 4,
};

export interface MaintenanceDroneConfig {
  readonly interactionRangeMetres: number;
  readonly startupSeconds: number;
  readonly startupRiseMetres: number;
  readonly shortedSeconds: number;
  readonly recoverySeconds: number;
}

export const DEFAULT_MAINTENANCE_DRONE_CONFIG:
Readonly<MaintenanceDroneConfig> = {
  interactionRangeMetres: 1.8,
  startupSeconds: 1.5,
  startupRiseMetres: 0.75,
  shortedSeconds: 0.8,
  recoverySeconds: 0.2,
};

export type MaintenanceDroneEventSource = Pick<
  EventBus<MaintenanceDroneEvents>,
  'on'
>;
