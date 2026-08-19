import * as THREE from 'three';

const BEAM_EPSILON_SQ = 1e-12;
const TIMELINE_EPSILON_SECONDS = 1e-9;
const PROXY_BEAM_COLOUR = 0xff2038;
const PROXY_EMITTER_COLOUR = 0x8f1728;

export interface ReadonlyLaserVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface LaserContactTarget {
  readonly position: ReadonlyLaserVector3;
  readonly radiusMetres: number;
}

export type LaserSequenceState = 'static' | 'running' | 'complete';

export interface LaserTimelineHoldStep {
  readonly kind: 'hold';
  readonly durationSeconds: number;
  readonly enabled: boolean;
  /** Rotation from the authored beam direction around the timeline axis. */
  readonly angleRadians: number;
}

export interface LaserTimelineSweepStep {
  readonly kind: 'sweep';
  readonly durationSeconds: number;
  readonly enabled: boolean;
  readonly fromAngleRadians: number;
  readonly toAngleRadians: number;
}

export type LaserTimelineStep =
  | LaserTimelineHoldStep
  | LaserTimelineSweepStep;

export interface LaserTimelineDefinition {
  /** World-space axis through the beam start point. */
  readonly axisWorld: ReadonlyLaserVector3;
  readonly repeat?: boolean;
  readonly steps: readonly LaserTimelineStep[];
}

export interface LaserHazardOptions {
  readonly id: string;
  readonly start: ReadonlyLaserVector3;
  readonly end: ReadonlyLaserVector3;
  readonly enabled?: boolean;
  /** Radius of the authored beam cylinder in metres. */
  readonly beamRadiusMetres?: number;
  /**
   * Optional authored fixed-step timeline. When present, each step owns the
   * current enabled state and rotation angle.
   */
  readonly timeline?: LaserTimelineDefinition;
}

/**
 * Reusable lethal laser runtime with a development-readable proxy.
 *
 * The runtime owns endpoints, enabled state, deterministic pattern timing and
 * collision. Final graphics may read the state below, but must not own timing
 * or failure logic.
 */
export class LaserHazard {
  readonly root = new THREE.Group();
  readonly id: string;
  readonly beamRadiusMetres: number;

  private readonly authoredStart = new THREE.Vector3();
  private readonly authoredEnd = new THREE.Vector3();
  private readonly startValue = new THREE.Vector3();
  private readonly endValue = new THREE.Vector3();
  private readonly authoredDirection = new THREE.Vector3();
  private readonly sweepAxis = new THREE.Vector3(0, 1, 0);

  private readonly segment = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly closestPoint = new THREE.Vector3();
  private readonly targetPosition = new THREE.Vector3();
  private readonly midpoint = new THREE.Vector3();
  private readonly beamDirection = new THREE.Vector3();
  private readonly beamQuaternion = new THREE.Quaternion();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);

  private readonly beamGeometry: THREE.CylinderGeometry;
  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly emitterGeometry: THREE.CylinderGeometry;
  private readonly emitterMaterial: THREE.MeshBasicMaterial;
  private readonly beamMesh: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly startEmitter: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly endEmitter: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;

  private readonly initialEnabled: boolean;
  private readonly timeline: LaserTimelineDefinition | undefined;
  private enabledValue: boolean;
  private sequenceStateValue: LaserSequenceState = 'static';
  private stepIndexValue = 0;
  private stepElapsedSeconds = 0;
  private sequenceElapsedSecondsValue = 0;

  constructor(options: LaserHazardOptions) {
    if (!options.id) throw new Error('Laser hazard IDs cannot be empty.');

    this.id = options.id;
    this.root.name = `${this.id}-laser-runtime`;
    this.root.userData.runtimeProxy = true;

    this.authoredStart.set(
      options.start.x,
      options.start.y,
      options.start.z,
    );
    this.authoredEnd.set(options.end.x, options.end.y, options.end.z);
    this.authoredDirection.subVectors(
      this.authoredEnd,
      this.authoredStart,
    );

    if (this.authoredDirection.lengthSq() <= BEAM_EPSILON_SQ) {
      throw new Error(`Laser "${this.id}" start and end must differ.`);
    }

    const beamRadiusMetres = options.beamRadiusMetres ?? 0.055;
    if (
      !Number.isFinite(beamRadiusMetres) ||
      beamRadiusMetres <= 0
    ) {
      throw new Error('Laser beam radius must be positive and finite.');
    }
    this.beamRadiusMetres = beamRadiusMetres;

    this.initialEnabled = options.enabled ?? true;
    this.enabledValue = this.initialEnabled;
    this.timeline = options.timeline;
    this.validateTimeline(this.timeline);

    if (this.timeline) {
      this.sweepAxis
        .set(
          this.timeline.axisWorld.x,
          this.timeline.axisWorld.y,
          this.timeline.axisWorld.z,
        )
        .normalize();
    }

    this.beamGeometry = new THREE.CylinderGeometry(
      this.beamRadiusMetres,
      this.beamRadiusMetres,
      1,
      10,
      1,
      false,
    );
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: PROXY_BEAM_COLOUR,
      toneMapped: false,
    });
    this.beamMesh = new THREE.Mesh(
      this.beamGeometry,
      this.beamMaterial,
    );
    this.beamMesh.name = `${this.id}-beam-proxy`;
    this.beamMesh.userData.laserHazardId = this.id;
    this.beamMesh.userData.runtimeProxy = true;

    const emitterRadius = Math.max(
      this.beamRadiusMetres * 2.4,
      0.12,
    );
    this.emitterGeometry = new THREE.CylinderGeometry(
      emitterRadius,
      emitterRadius,
      0.28,
      12,
      1,
      false,
    );
    this.emitterMaterial = new THREE.MeshBasicMaterial({
      color: PROXY_EMITTER_COLOUR,
      toneMapped: false,
    });

    this.startEmitter = new THREE.Mesh(
      this.emitterGeometry,
      this.emitterMaterial,
    );
    this.startEmitter.name = `${this.id}-emitter-start-proxy`;
    this.startEmitter.userData.laserHazardId = this.id;
    this.startEmitter.userData.runtimeProxy = true;

    this.endEmitter = new THREE.Mesh(
      this.emitterGeometry,
      this.emitterMaterial,
    );
    this.endEmitter.name = `${this.id}-emitter-end-proxy`;
    this.endEmitter.userData.laserHazardId = this.id;
    this.endEmitter.userData.runtimeProxy = true;

    this.root.add(
      this.beamMesh,
      this.startEmitter,
      this.endEmitter,
    );

    this.reset();
  }

  get start(): ReadonlyLaserVector3 {
    return this.startValue;
  }

  get end(): ReadonlyLaserVector3 {
    return this.endValue;
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  get sequenceState(): LaserSequenceState {
    return this.sequenceStateValue;
  }

  get sequenceStepIndex(): number {
    return this.stepIndexValue;
  }

  get sequenceElapsedSeconds(): number {
    return this.sequenceElapsedSecondsValue;
  }

  /** Progress of the current timeline step in [0, 1]. */
  get phaseProgress(): number {
    const step = this.timeline?.steps[this.stepIndexValue];
    if (!step) return this.sequenceStateValue === 'complete' ? 1 : 0;
    return THREE.MathUtils.clamp(
      this.stepElapsedSeconds / step.durationSeconds,
      0,
      1,
    );
  }

  copyStart(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.startValue);
  }

  copyEnd(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.endValue);
  }

  /**
   * Manual enabled control for static hazards. Patterned hazards will restore
   * their authored step state on the next fixed update.
   */
  setEnabled(enabled: boolean): void {
    this.enabledValue = enabled;
    this.updateProxyVisibility();
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        'Laser hazard deltaSeconds must be positive and finite.',
      );
    }

    if (!this.timeline || this.sequenceStateValue === 'complete') {
      return;
    }

    let remainingSeconds = deltaSeconds;
    this.sequenceElapsedSecondsValue += deltaSeconds;

    while (
      remainingSeconds > TIMELINE_EPSILON_SECONDS &&
      this.sequenceStateValue === 'running'
    ) {
      const step = this.timeline.steps[this.stepIndexValue];
      if (!step) {
        this.finishTimeline();
        break;
      }

      const availableSeconds =
        step.durationSeconds - this.stepElapsedSeconds;
      const consumedSeconds = Math.min(
        remainingSeconds,
        availableSeconds,
      );

      this.stepElapsedSeconds += consumedSeconds;
      remainingSeconds -= consumedSeconds;
      this.applyTimelineStep(
        step,
        this.stepElapsedSeconds / step.durationSeconds,
      );

      if (
        this.stepElapsedSeconds + TIMELINE_EPSILON_SECONDS <
        step.durationSeconds
      ) {
        continue;
      }

      this.advanceTimelineStep();
    }
  }

  /**
   * Sphere-vs-beam contact query.
   *
   * Expanding the finite beam segment by the player's sphere radius gives a
   * capsule test that closely matches the visible cylinder and its end caps.
   */
  intersects(target: LaserContactTarget): boolean {
    if (!this.enabledValue) return false;

    if (
      !Number.isFinite(target.radiusMetres) ||
      target.radiusMetres <= 0
    ) {
      throw new Error(
        'Laser contact target radius must be positive and finite.',
      );
    }

    this.segment.subVectors(this.endValue, this.startValue);
    const segmentLengthSquared = this.segment.lengthSq();
    if (segmentLengthSquared <= BEAM_EPSILON_SQ) return false;

    this.targetPosition.set(
      target.position.x,
      target.position.y,
      target.position.z,
    );
    this.toTarget.subVectors(
      this.targetPosition,
      this.startValue,
    );

    const fraction = THREE.MathUtils.clamp(
      this.toTarget.dot(this.segment) / segmentLengthSquared,
      0,
      1,
    );

    this.closestPoint
      .copy(this.startValue)
      .addScaledVector(this.segment, fraction);

    const combinedRadius =
      this.beamRadiusMetres + target.radiusMetres;
    return (
      this.closestPoint.distanceToSquared(this.targetPosition) <=
      combinedRadius * combinedRadius
    );
  }

  /** Restore authored pose, enabled state and sequence timer. */
  reset(): void {
    this.startValue.copy(this.authoredStart);
    this.endValue.copy(this.authoredEnd);
    this.enabledValue = this.initialEnabled;
    this.stepIndexValue = 0;
    this.stepElapsedSeconds = 0;
    this.sequenceElapsedSecondsValue = 0;

    if (this.timeline) {
      this.sequenceStateValue = 'running';
      this.applyTimelineStep(this.timeline.steps[0], 0);
    } else {
      this.sequenceStateValue = 'static';
      this.updateProxyPose();
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.clear();
    this.beamGeometry.dispose();
    this.beamMaterial.dispose();
    this.emitterGeometry.dispose();
    this.emitterMaterial.dispose();
  }

  private validateTimeline(
    timeline: LaserTimelineDefinition | undefined,
  ): void {
    if (!timeline) return;
    if (timeline.steps.length === 0) {
      throw new Error(
        `Laser "${this.id}" timeline must contain at least one step.`,
      );
    }

    this.sweepAxis.set(
      timeline.axisWorld.x,
      timeline.axisWorld.y,
      timeline.axisWorld.z,
    );
    if (this.sweepAxis.lengthSq() <= BEAM_EPSILON_SQ) {
      throw new Error(
        `Laser "${this.id}" timeline axis cannot be zero.`,
      );
    }

    for (const step of timeline.steps) {
      if (
        !Number.isFinite(step.durationSeconds) ||
        step.durationSeconds <= 0
      ) {
        throw new Error(
          `Laser "${this.id}" timeline step duration must be positive.`,
        );
      }

      if (
        step.kind === 'hold' &&
        !Number.isFinite(step.angleRadians)
      ) {
        throw new Error(
          `Laser "${this.id}" hold angle must be finite.`,
        );
      }

      if (
        step.kind === 'sweep' &&
        (!Number.isFinite(step.fromAngleRadians) ||
          !Number.isFinite(step.toAngleRadians))
      ) {
        throw new Error(
          `Laser "${this.id}" sweep angles must be finite.`,
        );
      }
    }
  }

  private applyTimelineStep(
    step: LaserTimelineStep,
    progress: number,
  ): void {
    this.enabledValue = step.enabled;

    const safeProgress = THREE.MathUtils.clamp(progress, 0, 1);
    const angleRadians =
      step.kind === 'hold'
        ? step.angleRadians
        : THREE.MathUtils.lerp(
            step.fromAngleRadians,
            step.toAngleRadians,
            safeProgress,
          );

    this.startValue.copy(this.authoredStart);
    this.beamDirection
      .copy(this.authoredDirection)
      .applyAxisAngle(this.sweepAxis, angleRadians);
    this.endValue
      .copy(this.startValue)
      .add(this.beamDirection);

    this.updateProxyPose();
  }

  private advanceTimelineStep(): void {
    if (!this.timeline) return;

    this.stepElapsedSeconds = 0;
    const nextIndex = this.stepIndexValue + 1;

    if (nextIndex < this.timeline.steps.length) {
      this.stepIndexValue = nextIndex;
      this.applyTimelineStep(
        this.timeline.steps[this.stepIndexValue],
        0,
      );
      return;
    }

    if (this.timeline.repeat) {
      this.stepIndexValue = 0;
      this.applyTimelineStep(this.timeline.steps[0], 0);
      return;
    }

    this.finishTimeline();
  }

  private finishTimeline(): void {
    this.sequenceStateValue = 'complete';
    this.stepElapsedSeconds = 0;
  }

  private updateProxyPose(): void {
    this.beamDirection.subVectors(
      this.endValue,
      this.startValue,
    );
    const beamLength = this.beamDirection.length();

    if (beamLength <= Math.sqrt(BEAM_EPSILON_SQ)) {
      this.beamMesh.visible = false;
      return;
    }

    this.beamDirection.multiplyScalar(1 / beamLength);
    this.midpoint
      .copy(this.startValue)
      .add(this.endValue)
      .multiplyScalar(0.5);

    this.beamQuaternion.setFromUnitVectors(
      this.upAxis,
      this.beamDirection,
    );

    this.beamMesh.position.copy(this.midpoint);
    this.beamMesh.quaternion.copy(this.beamQuaternion);
    this.beamMesh.scale.set(1, beamLength, 1);

    this.startEmitter.position.copy(this.startValue);
    this.startEmitter.quaternion.copy(this.beamQuaternion);
    this.endEmitter.position.copy(this.endValue);
    this.endEmitter.quaternion.copy(this.beamQuaternion);

    this.updateProxyVisibility();
  }

  private updateProxyVisibility(): void {
    // Emitter hardware remains visible when the beam is disabled so the player
    // can read where a hazard can originate. Final presentation belongs to #67.
    this.beamMesh.visible = this.enabledValue;
    this.startEmitter.visible = true;
    this.endEmitter.visible = true;
  }
}
