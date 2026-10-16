import * as THREE from 'three';
import type { ElectricalTargetRegistration, ElectricalTargetRegistry } from '../../abilities/ElectricalTargetRegistry.ts';
import type { VoltElectricalReadModel } from '../../abilities/VoltElectricalSystem.ts';

/** Depth-tested conducting outlines, visible only while Volt is aiming.
 * Helpers never enter the collision world and never mutate device materials. */
export class ElectricalTargetHighlights {
  readonly root = new THREE.Group();
  private readonly entries = new Map<ElectricalTargetRegistration, THREE.BoxHelper[]>();
  private readonly unsubscribe: (() => void)[];
  private readonly socketPosition = new THREE.Vector3();

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
    const wasVisible = this.root.visible;
    this.root.visible = visible;
    // The hidden parent suppresses all helpers. Do not query targets or rebuild
    // their bounds when Volt is not aiming; refresh them on the next aim frame.
    if (!visible) {
      if (wasVisible) for (const child of this.root.children) child.visible = false;
      return;
    }
    for (const [registration, helpers] of this.entries) {
      const target = registration.target;
      const targeted = state.selectedTargetId === target.id;
      const selected = state.selectedTargetValid && targeted;
      const connected = state.connectedTargetId === target.id;
      target.copySocketWorldPosition(this.socketPosition);
      const dx = this.socketPosition.x - state.beamStart.x;
      const dy = this.socketPosition.y - state.beamStart.y;
      const dz = this.socketPosition.z - state.beamStart.z;
      const nearby = dx * dx + dy * dy + dz * dz <= state.acquisitionRangeMetres ** 2;
      for (let i = 0; i < helpers.length; i++) {
        const helper = helpers[i]!;
        // A live tether can outlive acquisition range; unrelated distant
        // machines never enter electrical vision. Occlusion stays depth-tested.
        helper.visible = target.isAvailable() && (nearby || connected) && target.hitMeshes[i]!.visible;
        if (!helper.visible) continue;
        helper.update();
        helper.material.color.setHex(connected ? (state.connectionUnstable ? 0xff9e25 : 0xffe774)
          : selected ? 0xffffb0 : targeted ? 0xffab45 : 0xffd45c);
        helper.material.opacity = connected || selected ? 1 : targeted ? 0.9 : 0.5;
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
