import * as THREE from 'three';

import type { VoltElectricalReadModel } from '../../abilities/VoltElectricalSystem.ts';

export interface VoltElectricalPresentationOptions {
  readonly scene: THREE.Scene;
  readonly host: HTMLElement;
  readonly document?: Document;
}

/**
 * Minimal executable presentation for #122.
 *
 * Later graphics/HUD issues may replace this adapter; gameplay authority stays
 * entirely in VoltElectricalSystem. One line buffer and one DOM overlay are
 * reused for the lifetime of the loaded level.
 */
export class VoltElectricalPresentation {
  readonly root = new THREE.Group();
  readonly element: HTMLElement;

  private readonly beamGeometry: THREE.BufferGeometry;
  private readonly beamMaterial: THREE.LineBasicMaterial;
  private readonly beam: THREE.Line;
  private readonly positions: Float32Array;
  private readonly crosshair: HTMLElement;
  private readonly status: HTMLElement;
  private disposed = false;

  constructor(options: VoltElectricalPresentationOptions) {
    const hostDocument = options.document ?? document;
    this.root.name = 'volt-electrical-presentation';

    this.positions = new Float32Array(6);
    this.beamGeometry = new THREE.BufferGeometry();
    this.beamGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.beamMaterial = new THREE.LineBasicMaterial({
      color: 0xffdf45,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.beam = new THREE.Line(this.beamGeometry, this.beamMaterial);
    this.beam.name = 'volt-electrical-beam';
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    this.root.add(this.beam);

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
      throw error;
    }
  }

  update(readModel: VoltElectricalReadModel): void {
    if (this.disposed) return;

    this.crosshair.hidden = !readModel.aimActive;
    this.crosshair.dataset.state =
      readModel.selectedTargetValid ? 'valid' : 'neutral';

    if (readModel.connectedTargetName) {
      this.status.hidden = false;
      this.status.textContent = readModel.connectionUnstable
        ? `CONNECTED · ${readModel.connectedTargetName} · CONNECTION UNSTABLE`
        : `CONNECTED · ${readModel.connectedTargetName}`;
      this.status.dataset.state =
        readModel.connectionUnstable ? 'unstable' : 'connected';
    } else {
      this.status.hidden = true;
      this.status.textContent = '';
      delete this.status.dataset.state;
    }

    if (readModel.beamMode === 'none') {
      this.beam.visible = false;
      return;
    }

    this.beam.visible = true;
    this.positions[0] = readModel.beamStart.x;
    this.positions[1] = readModel.beamStart.y;
    this.positions[2] = readModel.beamStart.z;
    this.positions[3] = readModel.beamEnd.x;
    this.positions[4] = readModel.beamEnd.y;
    this.positions[5] = readModel.beamEnd.z;
    const attribute = this.beamGeometry.getAttribute('position');
    attribute.needsUpdate = true;
    this.beamGeometry.computeBoundingSphere();
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
