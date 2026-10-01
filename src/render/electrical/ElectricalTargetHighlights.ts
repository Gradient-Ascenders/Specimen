import * as THREE from 'three';
import type { ElectricalTargetRegistration, ElectricalTargetRegistry } from '../../abilities/ElectricalTargetRegistry.ts';
import type { VoltElectricalReadModel } from '../../abilities/VoltElectricalSystem.ts';

/** Depth-tested conducting outlines, visible only while Volt is aiming.
 * Helpers never enter the collision world and never mutate device materials. */
export class ElectricalTargetHighlights {
  readonly root = new THREE.Group();
  private readonly entries = new Map<ElectricalTargetRegistration, THREE.BoxHelper[]>();
  private readonly unsubscribe: (() => void)[];

  constructor(registry: ElectricalTargetRegistry) {
    this.root.name = 'volt-conducting-target-highlights';
    this.root.visible = false;
    for (const registration of registry.getRegistrations()) this.add(registration);
    this.unsubscribe = [
      registry.events.on('registered', ({ registration }) => this.add(registration)),
      registry.events.on('unregistered', ({ registration }) => this.remove(registration)),
    ];
  }

  update(state: VoltElectricalReadModel, aimAllowed = true): void {
    const visible = aimAllowed && state.aimActive;
    this.root.visible = visible;
    for (const [registration, helpers] of this.entries) {
      const target = registration.target;
      const selected = state.selectedTargetValid && state.selectedTargetId === target.id;
      const connected = state.connectedTargetId === target.id;
      for (let i = 0; i < helpers.length; i++) {
        const helper = helpers[i]!;
        helper.visible = visible && target.isAvailable() && target.hitMeshes[i]!.visible;
        if (!helper.visible) continue;
        helper.update();
        helper.material.color.setHex(selected || connected ? 0x6dffac : 0xffd45c);
        helper.material.opacity = selected || connected ? 1 : 0.72;
      }
    }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    for (const registration of this.entries.keys()) this.remove(registration);
    this.root.removeFromParent();
  }

  private add(registration: ElectricalTargetRegistration): void {
    const helpers = registration.target.hitMeshes.map(mesh => {
      const helper = new THREE.BoxHelper(mesh, 0xffd45c);
      helper.name = `${registration.target.id}-conducting-outline`;
      helper.material.transparent = true;
      helper.material.depthTest = true;
      helper.material.depthWrite = false;
      helper.material.toneMapped = false;
      helper.visible = false;
      this.root.add(helper);
      return helper;
    });
    this.entries.set(registration, helpers);
  }

  private remove(registration: ElectricalTargetRegistration): void {
    for (const helper of this.entries.get(registration) ?? []) {
      helper.removeFromParent(); helper.dispose();
    }
    this.entries.delete(registration);
  }
}
