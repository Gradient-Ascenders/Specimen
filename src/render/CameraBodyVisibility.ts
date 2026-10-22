import * as THREE from 'three';
import type { CameraRig, CameraFollowTarget } from './CameraRig.ts';

/** Suppress only colour/depth writes in the player's camera pass. Shadow
 * passes use separate hooks/materials, so the controlled body keeps its shadow.
 * Bind once when an actor's asset loads; effects and other actors are untouched. */
export class CameraBodyVisibility {
  private rig: CameraRig | undefined;
  private target: CameraFollowTarget | undefined;
  private readonly cleanups: (() => void)[] = [];
  configure(rig: CameraRig, target: CameraFollowTarget): void { this.rig = rig; this.target = target; }
  bind(mesh: THREE.Mesh): void {
    const before = mesh.onBeforeRender, after = mesh.onAfterRender;
    let suppressed = false, colorWrite = true, depthWrite = true;
    const rig = this;
    mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
      before.call(this, renderer, scene, camera, geometry, material, group);
      suppressed = camera === rig.rig?.camera && !!rig.target && rig.rig.isFirstPersonForTarget(rig.target);
      if (suppressed) {
        colorWrite = material.colorWrite; depthWrite = material.depthWrite;
        material.colorWrite = false; material.depthWrite = false;
      }
    };
    mesh.onAfterRender = function (renderer, scene, camera, geometry, material, group) {
      if (suppressed) { material.colorWrite = colorWrite; material.depthWrite = depthWrite; suppressed = false; }
      after.call(this, renderer, scene, camera, geometry, material, group);
    };
    this.cleanups.push(() => { mesh.onBeforeRender = before; mesh.onAfterRender = after; });
  }
  dispose(): void { for (const cleanup of this.cleanups) cleanup(); this.cleanups.length = 0; this.rig = undefined; this.target = undefined; }
}
