import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';

export interface CultivationRoomThreeOccupant {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly radiusMetres: number;
}

export interface CultivationRoomThreeCompletionReadModel {
  readonly bobAtExit: boolean;
  readonly goopAtExit: boolean;
  readonly groundDronesDisabled: number;
  readonly complete: boolean;
}

interface MutableCompletionReadModel {
  bobAtExit: boolean;
  goopAtExit: boolean;
  groundDronesDisabled: number;
  complete: boolean;
}

export interface CultivationRoomThreeControllerEvents {
  progressChanged: CultivationRoomThreeCompletionReadModel;
  completed: { readonly groundDronesDisabled: 4 };
  reset: Record<string, never>;
}

const BOB_EXIT_CENTRE = new THREE.Vector3(-1.5, 3, 73.5);
const GOOP_EXIT_CENTRE = new THREE.Vector3(1.5, 3, 73.5);
const EXIT_HALF_SIZE = new THREE.Vector3(1.5, 3, 1.5);

/** Identity-aware completion authority for the authored Room 3 exit. */
export class CultivationRoomThreeController {
  readonly events = new EventBus<CultivationRoomThreeControllerEvents>();
  readonly readModel: CultivationRoomThreeCompletionReadModel;

  private readonly roomRoot: THREE.Object3D;
  private readonly getGroundDisabledCount: () => number;
  private readonly bobLocal = new THREE.Vector3();
  private readonly goopLocal = new THREE.Vector3();
  private readonly model: MutableCompletionReadModel = {
    bobAtExit: false,
    goopAtExit: false,
    groundDronesDisabled: 0,
    complete: false,
  };
  private disposed = false;

  constructor(roomRoot: THREE.Object3D, getGroundDisabledCount: () => number) {
    this.roomRoot = roomRoot;
    this.getGroundDisabledCount = getGroundDisabledCount;
    this.readModel = this.model;
  }

  update(
    bob: CultivationRoomThreeOccupant,
    goop: CultivationRoomThreeOccupant,
  ): void {
    if (this.disposed || this.model.complete) return;
    this.roomRoot.updateWorldMatrix(true, false);
    this.bobLocal.set(bob.position.x, bob.position.y, bob.position.z);
    this.goopLocal.set(goop.position.x, goop.position.y, goop.position.z);
    this.roomRoot.worldToLocal(this.bobLocal);
    this.roomRoot.worldToLocal(this.goopLocal);

    const bobAtExit = sphereIntersectsBox(this.bobLocal, bob.radiusMetres, BOB_EXIT_CENTRE);
    const goopAtExit = sphereIntersectsBox(this.goopLocal, goop.radiusMetres, GOOP_EXIT_CENTRE);
    const groundDronesDisabled = this.getGroundDisabledCount();
    const changed =
      bobAtExit !== this.model.bobAtExit ||
      goopAtExit !== this.model.goopAtExit ||
      groundDronesDisabled !== this.model.groundDronesDisabled;

    this.model.bobAtExit = bobAtExit;
    this.model.goopAtExit = goopAtExit;
    this.model.groundDronesDisabled = groundDronesDisabled;
    this.model.complete = bobAtExit && goopAtExit && groundDronesDisabled === 4;
    if (changed || this.model.complete) {
      this.events.emit('progressChanged', {
        bobAtExit: this.model.bobAtExit,
        goopAtExit: this.model.goopAtExit,
        groundDronesDisabled: this.model.groundDronesDisabled,
        complete: this.model.complete,
      });
    }
    if (this.model.complete) this.events.emit('completed', { groundDronesDisabled: 4 });
  }

  reset(): void {
    if (this.disposed) return;
    this.model.bobAtExit = false;
    this.model.goopAtExit = false;
    this.model.groundDronesDisabled = 0;
    this.model.complete = false;
    this.events.emit('reset', {});
  }

  dispose(): void {
    if (this.disposed) return;
    this.events.clear();
    this.disposed = true;
  }
}

function sphereIntersectsBox(
  position: THREE.Vector3,
  radiusMetres: number,
  centre: THREE.Vector3,
): boolean {
  if (!Number.isFinite(radiusMetres) || radiusMetres <= 0) return false;
  const dx = Math.max(Math.abs(position.x - centre.x) - EXIT_HALF_SIZE.x, 0);
  const dy = Math.max(Math.abs(position.y - centre.y) - EXIT_HALF_SIZE.y, 0);
  const dz = Math.max(Math.abs(position.z - centre.z) - EXIT_HALF_SIZE.z, 0);
  return dx * dx + dy * dy + dz * dz <= radiusMetres * radiusMetres;
}
