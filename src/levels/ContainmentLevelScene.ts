import * as THREE from 'three';

import type {
  SlimeVisualDiagnostics,
  SlimeVisualLaunch,
  SlimeVisualState,
  Vector3State,
} from '../render/slime/SlimeVisual.ts';
import type { SlimeBurstDiagnostics } from '../render/slime/SlimeBurstPresentation.ts';
import { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import {
  ContainmentLightingRig,
  type ContainmentCutsceneLighting,
  type ContainmentLightingDiagnostics,
} from '../render/environment/containment/ContainmentLightingRig.ts';
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
  readonly artResources = new ContainmentArtResources();
  readonly teaching: ContainmentTeachingScene;
  readonly roomThree: RoomThreeGreybox;
  readonly roomFour: RoomFourGreybox;
  readonly roomFive: RoomFiveGreybox;
  readonly lighting: ContainmentLightingRig;

  constructor(
    requestHazardFailure: (failure: ContainmentHazardFailure) => void,
    options: { readonly includeDevelopmentHelpers?: boolean } = {},
  ) {
    // Retain the validated hierarchy name because it is part of the frozen
    // collision parent path; production art is layered beneath it.
    this.root.name = 'containment-level-greybox';
    this.teaching = new ContainmentTeachingScene(this.artResources, options);
    this.roomThree = new RoomThreeGreybox(requestHazardFailure, this.artResources);
    this.roomFour = new RoomFourGreybox(requestHazardFailure, this.artResources);
    this.roomFive = new RoomFiveGreybox(requestHazardFailure, this.artResources);
    this.root.add(
      this.teaching.root,
      this.roomThree.root,
      this.roomFour.root,
      this.roomFive.root,
    );
    this.lighting = new ContainmentLightingRig({
      levelRoot: this.root,
      roomOneArt: this.teaching.roomOneArt,
      roomFour: this.roomFour,
      roomFive: this.roomFive,
    });
    this.root.add(this.lighting.root);
  }

  /** Small #38-facing API; callers never need individual fixture objects. */
  get cutsceneLighting(): ContainmentCutsceneLighting {
    return this.lighting.cutsceneLighting;
  }

  get lightingDiagnostics(): ContainmentLightingDiagnostics {
    return this.lighting.diagnostics;
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
    this.roomThree.updatePresentation(deltaSeconds);
    this.lighting.update(deltaSeconds);
  }

  resetPresentation(): void {
    this.lighting.reset();
  }

  reconcilePresentationAfterRecovery(): void {
    this.lighting.reconcileAuthoritativeState(true);
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
    this.lighting.dispose();
    this.roomFive.dispose();
    this.roomFour.dispose();
    this.roomThree.dispose();
    this.teaching.dispose();
    this.artResources.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
