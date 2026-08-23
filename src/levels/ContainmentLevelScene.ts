import * as THREE from 'three';

import type {
  SlimeVisualDiagnostics,
  SlimeVisualLaunch,
  SlimeVisualState,
  Vector3State,
} from '../render/slime/SlimeVisual.ts';
import type { SlimeBurstDiagnostics } from '../render/slime/SlimeBurstPresentation.ts';
import { ContainmentTeachingScene } from './ContainmentTeachingScene.ts';
import { RoomFiveGreybox, type RoomFiveHazardFailure } from './RoomFiveGreybox.ts';
import { RoomFourGreybox, type RoomFourHazardFailure } from './RoomFourGreybox.ts';
import { RoomThreeGreybox, type RoomThreeHazardFailure } from './RoomThreeGreybox.ts';

export type ContainmentHazardFailure =
  | RoomThreeHazardFailure
  | RoomFourHazardFailure
  | RoomFiveHazardFailure;

/** Complete Level 1 scene composition while preserving the teaching-scene API. */
export class ContainmentLevelScene {
  readonly root = new THREE.Group();
  readonly teaching = new ContainmentTeachingScene();
  readonly roomThree: RoomThreeGreybox;
  readonly roomFour: RoomFourGreybox;
  readonly roomFive: RoomFiveGreybox;

  constructor(requestHazardFailure: (failure: ContainmentHazardFailure) => void) {
    this.root.name = 'containment-level-greybox';
    this.roomThree = new RoomThreeGreybox(requestHazardFailure);
    this.roomFour = new RoomFourGreybox(requestHazardFailure);
    this.roomFive = new RoomFiveGreybox(requestHazardFailure);
    this.root.add(
      this.teaching.root,
      this.roomThree.root,
      this.roomFour.root,
      this.roomFive.root,
    );
  }

  get collisionMeshes(): readonly THREE.Mesh[] {
    return [
      ...this.teaching.collisionMeshes,
      ...this.roomThree.collisionMeshes,
      ...this.roomFour.collisionMeshes,
      ...this.roomFive.collisionMeshes,
    ];
  }

  /** Authored camera boundaries and opaque camera-only presentation meshes. */
  get cameraObstructionMeshes(): readonly THREE.Mesh[] {
    return [
      ...this.roomThree.builder.cameraObstructionMeshes,
      ...this.roomFour.cameraObstructionMeshes,
      ...this.roomFive.builder.cameraObstructionMeshes,
    ];
  }

  /** Explicitly-authored meshes eligible for Goop's dissolve runtime. */
  get solubleTargetMeshes(): readonly THREE.Mesh[] {
    return [
      ...this.teaching.solubleTargetMeshes,
      this.roomFive.goopWoodenDoor,
    ];
  }

  get slimeDiagnostics(): SlimeVisualDiagnostics {
    return this.teaching.slimeDiagnostics;
  }

  get deathBurstDiagnostics(): SlimeBurstDiagnostics {
    return this.teaching.deathBurstDiagnostics;
  }

  copySpawnPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.teaching.copySpawnPosition(target);
  }

  copyOutOfBoundsTestPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.teaching.copyOutOfBoundsTestPosition(target);
  }

  copyRoomTwoSafeLandingPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.teaching.copyRoomTwoSafeLandingPosition(target);
  }

  setProbePosition(position: Vector3State): void {
    this.teaching.setProbePosition(position);
  }

  setProbeYaw(yawRadians: number): void {
    this.teaching.setProbeYaw(yawRadians);
  }

  setProbeOpacity(opacity: number): void {
    this.teaching.setProbeOpacity(opacity);
  }

  isInsideCameraTightVent(position: Vector3State): boolean {
    return (
      this.teaching.isInsideCameraTightVent(position) ||
      this.roomThree.isInsideCameraTightVent(position)
    );
  }

  presentProbe(): void {
    this.teaching.presentProbe();
  }

  update(deltaSeconds: number, visualState?: SlimeVisualState): void {
    this.teaching.update(deltaSeconds, visualState);
  }

  startDeath(position: Vector3State): boolean {
    return this.teaching.startDeath(position);
  }

  updateDeath(deltaSeconds: number): void {
    this.teaching.updateDeath(deltaSeconds);
  }

  finishDeath(position: Vector3State): void {
    this.teaching.finishDeath(position);
  }

  resetProbe(): void {
    this.teaching.resetProbe();
  }

  onSlimeLanding(
    normalWorld: Vector3State,
    impactSpeedMetresPerSecond: number,
  ): void {
    this.teaching.onSlimeLanding(normalWorld, impactSpeedMetresPerSecond);
  }

  onSlimeLaunch(launch: SlimeVisualLaunch): void {
    this.teaching.onSlimeLaunch(launch);
  }

  dispose(): void {
    this.roomFive.dispose();
    this.roomFour.dispose();
    this.roomThree.dispose();
    this.teaching.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
