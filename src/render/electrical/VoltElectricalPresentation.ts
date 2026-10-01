import * as THREE from 'three';

import type { VoltElectricalReadModel } from '../../abilities/VoltElectricalSystem.ts';

export interface VoltElectricalPresentationOptions {
  readonly scene: THREE.Scene;
  readonly host: HTMLElement;
  readonly document?: Document;
}

/** Visual-only electrical arcs and aim UI. Gameplay authority stays in the
 * electrical system; every render buffer is allocated once and reused. */
export class VoltElectricalPresentation {
  readonly root = new THREE.Group();
  readonly element: HTMLElement;

  private readonly beamGeometry: THREE.BufferGeometry;
  private readonly beamMaterial: THREE.LineBasicMaterial;
  private readonly beam: THREE.Line;
  private readonly positions: Float32Array;
  private readonly branchGeometry: THREE.BufferGeometry;
  private readonly branchMaterial: THREE.LineBasicMaterial;
  private readonly branches: THREE.LineSegments;
  private readonly branchPositions: Float32Array;
  private readonly sparkGeometry: THREE.BufferGeometry;
  private readonly sparkMaterial: THREE.PointsMaterial;
  private readonly sparks: THREE.Points;
  private readonly sparkPositions: Float32Array;
  private phase = 0;
  private readonly crosshair: HTMLElement;
  private readonly status: HTMLElement;
  private disposed = false;

  constructor(options: VoltElectricalPresentationOptions) {
    const hostDocument = options.document ?? document;
    this.root.name = 'volt-electrical-presentation';

    const mainSegments = 13;
    this.positions = new Float32Array((mainSegments + 1) * 3);
    this.beamGeometry = new THREE.BufferGeometry();
    this.beamGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.beamMaterial = new THREE.LineBasicMaterial({
      color: 0xffffb0,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.beam = new THREE.Line(this.beamGeometry, this.beamMaterial);
    this.beam.name = 'volt-electrical-arc-core';
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    this.root.add(this.beam);

    // Four branching forks, with fixed segment counts and no update-time object
    // creation. Additive color keeps the arcs legible in the blackout rooms.
    const branchCount = 4;
    const branchSegments = 4;
    this.branchPositions = new Float32Array(branchCount * branchSegments * 2 * 3);
    this.branchGeometry = new THREE.BufferGeometry();
    this.branchGeometry.setAttribute('position', new THREE.BufferAttribute(this.branchPositions, 3));
    this.branchMaterial = new THREE.LineBasicMaterial({
      color: 0xffc928,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.branches = new THREE.LineSegments(this.branchGeometry, this.branchMaterial);
    this.branches.name = 'volt-electrical-branch-arcs';
    this.branches.frustumCulled = false;
    this.branches.visible = false;
    this.root.add(this.branches);

    const sparkCount = 7;
    this.sparkPositions = new Float32Array(sparkCount * 3);
    this.sparkGeometry = new THREE.BufferGeometry();
    this.sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparkMaterial = new THREE.PointsMaterial({
      color: 0xffffdc,
      size: 0.075,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.sparkMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float sparkRadius = length(gl_PointCoord - vec2(0.5));
        diffuseColor.a *= 1.0 - smoothstep(0.18, 0.5, sparkRadius);`,
      );
    };
    this.sparkMaterial.customProgramCacheKey = () => 'volt-soft-circular-sparks-v1';
    this.sparks = new THREE.Points(this.sparkGeometry, this.sparkMaterial);
    this.sparks.name = 'volt-electrical-travelling-sparks';
    this.sparks.frustumCulled = false;
    this.sparks.visible = false;
    this.root.add(this.sparks);

    const element = hostDocument.createElement('div');
    element.className = 'volt-electrical-overlay';
    element.setAttribute('aria-live', 'polite');

    const crosshair = hostDocument.createElement('span');
    crosshair.className = 'volt-electrical-crosshair';
    crosshair.setAttribute('aria-hidden', 'true');
    crosshair.textContent = '+';
    crosshair.hidden = true;

    const status = hostDocument.createElement('p');
    status.className = 'volt-electrical-status';
    status.hidden = true;

    element.append(crosshair, status);
    this.element = element;
    this.crosshair = crosshair;
    this.status = status;

    try {
      // Arm cleanup before each attachment: observers/test doubles may mutate
      // ownership and then throw from add/append.
      options.scene.add(this.root);
      options.host.append(this.element);
    } catch (error) {
      this.root.removeFromParent();
      this.element.remove();
      this.beamGeometry.dispose();
      this.beamMaterial.dispose();
      this.branchGeometry.dispose();
      this.branchMaterial.dispose();
      this.sparkGeometry.dispose();
      this.sparkMaterial.dispose();
      throw error;
    }
  }

  update(readModel: VoltElectricalReadModel, deltaSeconds = 0): void {
    if (this.disposed) return;

    this.crosshair.hidden = !readModel.aimActive;
    this.crosshair.dataset.state =
      readModel.selectedTargetValid ? 'valid' : 'neutral';

    if (readModel.connectedTargetName) {
      this.status.hidden = false;
      this.status.textContent = readModel.connectionUnstable
        ? `CONNECTED · ${readModel.connectedTargetName} · CONNECTION UNSTABLE`
        : `CONNECTED · ${readModel.connectedTargetName} · HOLD STILL`;
      this.status.dataset.state =
        readModel.connectionUnstable ? 'unstable' : 'connected';
    } else {
      this.status.hidden = true;
      this.status.textContent = '';
      delete this.status.dataset.state;
    }

    if (readModel.beamMode === 'none') {
      this.beam.visible = false;
      this.branches.visible = false;
      this.sparks.visible = false;
      return;
    }

    this.beam.visible = true;
    this.branches.visible = true;
    this.sparks.visible = true;
    // State reconciliation does not advance animation; only the render clock does.
    this.phase += Math.max(0, deltaSeconds) * (readModel.beamMode === 'search' ? 25.2 : 7.2);

    const sx = readModel.beamStart.x;
    const sy = readModel.beamStart.y;
    const sz = readModel.beamStart.z;
    const dx = readModel.beamEnd.x - sx;
    const dy = readModel.beamEnd.y - sy;
    const dz = readModel.beamEnd.z - sz;
    const horizontal = Math.hypot(dx, dz);
    const px = horizontal > 0.0001 ? -dz / horizontal : 1;
    const pz = horizontal > 0.0001 ? dx / horizontal : 0;
    const mainSegments = 13;

    for (let node = 0; node <= mainSegments; node += 1) {
      const t = node / mainSegments;
      const envelope = Math.sin(Math.PI * t);
      const jitter = envelope * (
        Math.sin(node * 8.17 + this.phase) * 0.16 +
        Math.sin(node * 3.71 - this.phase * 1.37) * 0.08
      );
      const offset = node * 3;
      this.positions[offset] = sx + dx * t + px * jitter;
      this.positions[offset + 1] = sy + dy * t + Math.sin(node * 5.3 + this.phase) * envelope * 0.045;
      this.positions[offset + 2] = sz + dz * t + pz * jitter;
    }
    const mainAttribute = this.beamGeometry.getAttribute('position');
    mainAttribute.needsUpdate = true;

    const branchSegments = 4;
    for (let branch = 0; branch < 4; branch += 1) {
      const originT = 0.24 + branch * 0.16;
      const sourceOffset = Math.min(mainSegments, Math.floor(originT * mainSegments)) * 3;
      const side = branch % 2 === 0 ? 1 : -1;
      const targetT = Math.min(0.92, originT + 0.11);
      const targetX = sx + dx * targetT + px * side * (0.22 + branch * 0.035);
      const targetY = sy + dy * targetT + Math.sin(this.phase + branch * 2.1) * 0.12;
      const targetZ = sz + dz * targetT + pz * side * (0.22 + branch * 0.035);
      const originX = this.positions[sourceOffset];
      const originY = this.positions[sourceOffset + 1];
      const originZ = this.positions[sourceOffset + 2];

      for (let segment = 0; segment < branchSegments; segment += 1) {
        const t0 = segment / branchSegments;
        const t1 = (segment + 1) / branchSegments;
        const bend0 = Math.sin(t0 * Math.PI) * side * 0.1;
        const bend1 = Math.sin(t1 * Math.PI) * side * 0.1;
        const ax = originX + (targetX - originX) * t0 + px * bend0;
        const ay = originY + (targetY - originY) * t0 + Math.sin(this.phase + branch + segment) * 0.035;
        const az = originZ + (targetZ - originZ) * t0 + pz * bend0;
        const bx = originX + (targetX - originX) * t1 + px * bend1;
        const by = originY + (targetY - originY) * t1 + Math.sin(this.phase + branch + segment + 1) * 0.035;
        const bz = originZ + (targetZ - originZ) * t1 + pz * bend1;
        const writeOffset = (branch * branchSegments + segment) * 6;
        this.branchPositions[writeOffset] = ax;
        this.branchPositions[writeOffset + 1] = ay;
        this.branchPositions[writeOffset + 2] = az;
        this.branchPositions[writeOffset + 3] = bx;
        this.branchPositions[writeOffset + 4] = by;
        this.branchPositions[writeOffset + 5] = bz;
      }
    }
    this.branchGeometry.getAttribute('position').needsUpdate = true;

    const sparkCount = this.sparkPositions.length / 3;
    for (let spark = 0; spark < sparkCount; spark += 1) {
      const t = (spark / sparkCount + this.phase * 0.11) % 1;
      const node = t * mainSegments;
      const base = Math.floor(node);
      const fraction = node - base;
      const first = base * 3;
      const second = Math.min(mainSegments, base + 1) * 3;
      const offset = spark * 3;
      this.sparkPositions[offset] = this.positions[first] + (this.positions[second] - this.positions[first]) * fraction;
      this.sparkPositions[offset + 1] = this.positions[first + 1] + (this.positions[second + 1] - this.positions[first + 1]) * fraction;
      this.sparkPositions[offset + 2] = this.positions[first + 2] + (this.positions[second + 2] - this.positions[first + 2]) * fraction;
    }
    this.sparkGeometry.getAttribute('position').needsUpdate = true;
  }

  suspendAim(): void {
    if (this.disposed) return;
    this.crosshair.hidden = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.element.remove();
    this.beamGeometry.dispose();
    this.beamMaterial.dispose();
    this.branchGeometry.dispose();
    this.branchMaterial.dispose();
    this.sparkGeometry.dispose();
    this.sparkMaterial.dispose();
  }

  getDiagnostics(): {
    readonly beamVisible: boolean;
    readonly crosshairCount: number;
    readonly overlayAttached: boolean;
  } {
    return {
      beamVisible: this.beam.visible,
      crosshairCount: 1,
      overlayAttached: this.element.isConnected,
    };
  }
}
