import { menuIconMarkup as icon } from '../../ui/MenuIcons.ts';
import * as THREE from 'three';

import type { VoltElectricalReadModel } from '../../abilities/VoltElectricalSystem.ts';
import type { ElectricalTargetRegistry } from '../../abilities/ElectricalTargetRegistry.ts';
import { ElectricalTargetHighlights } from './ElectricalTargetHighlights.ts';
import { VoltElectricalEffects } from './VoltElectricalEffects.ts';

export interface VoltElectricalPresentationOptions {
  readonly scene: THREE.Scene;
  readonly host: HTMLElement;
  readonly document?: Document;
  readonly targetRegistry?: ElectricalTargetRegistry;
  readonly isVoltSelected: () => boolean;
}

/** Visual-only electrical arcs and aim UI. Gameplay authority stays in the
 * electrical system; every render buffer is allocated once and reused. */
export class VoltElectricalPresentation {
  readonly root = new THREE.Group();
  readonly element: HTMLElement;

  private readonly effects = new VoltElectricalEffects();
  private readonly crosshair: HTMLElement;
  private readonly status: HTMLElement;
  private disposed = false;
  private readonly highlights?: ElectricalTargetHighlights;
  private readonly isVoltSelected: () => boolean;

  constructor(options: VoltElectricalPresentationOptions) {
    const hostDocument = options.document ?? document;
    this.isVoltSelected = options.isVoltSelected;
    this.root.name = 'volt-electrical-presentation';
    this.root.add(this.effects.root);

    const element = hostDocument.createElement('div');
    element.className = 'volt-electrical-overlay';
    element.setAttribute('data-clean-gameplay-aiming', '');
    element.setAttribute('aria-live', 'polite');

    const crosshair = hostDocument.createElement('span');
    crosshair.className = 'volt-electrical-crosshair';
    crosshair.setAttribute('aria-hidden', 'true');
    crosshair.innerHTML = icon('Crosshair');
    crosshair.hidden = true;

    const status = hostDocument.createElement('p');
    status.className = 'volt-electrical-status';
    status.hidden = true;

    element.append(crosshair, status);
    this.element = element;
    this.crosshair = crosshair;
    this.status = status;

    try {
      if (options.targetRegistry) {
        this.highlights = new ElectricalTargetHighlights(options.targetRegistry);
        this.root.add(this.highlights.root);
      }
      // Arm cleanup before each attachment: observers/test doubles may mutate
      // ownership and then throw from add/append.
      options.scene.add(this.root);
      options.host.append(this.element);
    } catch (error) {
      this.highlights?.dispose();
      this.root.removeFromParent();
      this.element.remove();
      this.effects.dispose();
      throw error;
    }
  }

  update(readModel: VoltElectricalReadModel, deltaSeconds = 0, aimAllowed = true): void {
    if (this.disposed) return;
    this.highlights?.update(readModel, aimAllowed);

    const crosshairHidden = !(aimAllowed && readModel.aimActive);
    if (this.crosshair.hidden !== crosshairHidden) this.crosshair.hidden = crosshairHidden;
    const crosshairState = readModel.selectedTargetValid ? 'valid' : 'neutral';
    if (this.crosshair.dataset.state !== crosshairState) this.crosshair.dataset.state = crosshairState;

    if (this.isVoltSelected() && readModel.connectedTargetName) {
      if (this.status.hidden) this.status.hidden = false;
      const text = readModel.connectionUnstable
        ? `${readModel.connectedTargetName} · Connection unstable`
        : `${readModel.connectedTargetName} · Hold still`;
      if (this.status.textContent !== text) this.status.textContent = text;
      const state = readModel.connectionUnstable ? 'unstable' : 'connected';
      if (this.status.dataset.state !== state) this.status.dataset.state = state;
    } else {
      if (!this.status.hidden) this.status.hidden = true;
      if (this.status.textContent) this.status.textContent = '';
      if (this.status.dataset.state !== undefined) delete this.status.dataset.state;
    }

    this.effects.update(readModel, deltaSeconds);
  }

  suspendAim(): void {
    if (this.disposed) return;
    this.crosshair.hidden = true;
    if (this.highlights) this.highlights.root.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.highlights?.dispose();
    this.root.removeFromParent();
    this.element.remove();
    this.effects.dispose();
  }

  getDiagnostics(): {
    readonly beamVisible: boolean;
    readonly crosshairCount: number;
    readonly overlayAttached: boolean;
  } {
    return {
      beamVisible: this.effects.root.visible,
      crosshairCount: 1,
      overlayAttached: this.element.isConnected,
    };
  }
}
