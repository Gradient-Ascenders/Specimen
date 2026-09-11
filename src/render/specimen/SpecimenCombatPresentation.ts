import * as THREE from 'three';

import type {
  SpecimenAttackReadModel,
  SpecimenProjectileReadState,
} from '../../combat/SpecimenProjectileSystem.ts';

export interface SpecimenCombatPresentationSource {
  readonly readModel: SpecimenAttackReadModel;
  readonly projectileStates: readonly SpecimenProjectileReadState[];
}

/**
 * Minimal bounded verification presentation for #127.
 *
 * Gameplay truth remains in SpecimenProjectileSystem. One InstancedMesh and one
 * DOM overlay are allocated for the loaded level and reused for all shots.
 */
export class SpecimenCombatPresentation {
  readonly root = new THREE.Group();
  readonly element: HTMLElement;

  private readonly source: SpecimenCombatPresentationSource;
  private readonly projectileGeometry: THREE.SphereGeometry;
  private readonly projectileMaterial: THREE.MeshStandardMaterial;
  private readonly projectiles: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly crosshair: HTMLElement;
  private readonly label: HTMLElement;
  private readonly charge: HTMLProgressElement;
  private disposed = false;

  constructor(options: {
    readonly scene: THREE.Scene;
    readonly host: HTMLElement;
    readonly source: SpecimenCombatPresentationSource;
    readonly document?: Document;
  }) {
    this.source = options.source;
    this.root.name = 'specimen-combat-presentation';

    this.projectileGeometry = new THREE.SphereGeometry(1, 10, 7);
    this.projectileMaterial = new THREE.MeshStandardMaterial({
      color: 0xd6ff4a,
      emissive: 0xff4d2f,
      emissiveIntensity: 1.5,
      roughness: 0.3,
      metalness: 0.15,
    });
    this.projectiles = new THREE.InstancedMesh(
      this.projectileGeometry,
      this.projectileMaterial,
      this.source.projectileStates.length,
    );
    this.projectiles.name = 'specimen-electric-acid-projectiles';
    this.projectiles.frustumCulled = false;
    this.projectiles.count = 0;
    this.root.add(this.projectiles);

    const hostDocument = options.document ?? document;
    const element = hostDocument.createElement('div');
    element.className = 'specimen-combat-overlay';
    element.setAttribute('aria-live', 'polite');

    this.crosshair = hostDocument.createElement('span');
    this.crosshair.className = 'specimen-combat-crosshair';
    this.crosshair.textContent = '+';
    this.crosshair.hidden = true;

    this.label = hostDocument.createElement('span');
    this.label.className = 'specimen-combat-label';
    this.label.textContent = 'SPECIMEN';
    this.label.hidden = true;

    this.charge = hostDocument.createElement('progress');
    this.charge.className = 'specimen-combat-charge';
    this.charge.max = 1;
    this.charge.value = 0;
    this.charge.hidden = true;

    element.append(this.crosshair, this.label, this.charge);
    this.element = element;

    try {
      options.scene.add(this.root);
      options.host.append(this.element);
    } catch (error) {
      this.root.removeFromParent();
      this.element.remove();
      this.projectileGeometry.dispose();
      this.projectileMaterial.dispose();
      throw error;
    }
  }

  update(activeForm: boolean): void {
    if (this.disposed) return;
    const model = this.source.readModel;
    this.label.hidden = !activeForm;
    this.crosshair.hidden = !activeForm || !model.aimActive;
    this.charge.hidden = !activeForm || !model.aimActive;
    this.charge.value = model.chargeAmount;
    this.charge.dataset.state = model.fullyCharged
      ? 'full'
      : model.charging
        ? 'charging'
        : 'ready';

    let count = 0;
    for (const state of this.source.projectileStates) {
      if (!state.active) continue;
      this.dummy.position.set(
        state.position.x,
        state.position.y,
        state.position.z,
      );
      this.dummy.scale.setScalar(state.radiusMetres);
      this.dummy.updateMatrix();
      this.projectiles.setMatrixAt(count, this.dummy.matrix);
      count += 1;
    }
    this.projectiles.count = count;
    if (count > 0) this.projectiles.instanceMatrix.needsUpdate = true;
  }

  suspend(): void {
    if (this.disposed) return;
    this.crosshair.hidden = true;
    this.charge.hidden = true;
  }

  getDiagnostics(): {
    readonly activeProjectileCount: number;
    readonly capacity: number;
    readonly overlayAttached: boolean;
  } {
    return {
      activeProjectileCount: this.projectiles.count,
      capacity: this.source.projectileStates.length,
      overlayAttached: this.element.isConnected,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.element.remove();
    this.projectileGeometry.dispose();
    this.projectileMaterial.dispose();
  }
}
