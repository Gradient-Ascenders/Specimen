import * as THREE from 'three';

import { BoxTriggerSensor } from '../puzzle/BoxTriggerSensor.ts';
import { PressurePlate } from '../puzzle/PressurePlate.ts';
import { PersistentSlimePair } from '../slimes/PersistentSlimePair.ts';
import { SlimeManager } from '../slimes/SlimeManager.ts';

class FakeBody {
  readonly radiusMetres = 0.45;
  readonly position = new THREE.Vector3();

  constructor(position: THREE.Vector3) {
    this.position.copy(position);
  }

  recoverAt(position: THREE.Vector3): void {
    this.position.copy(position);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Isolated #28 invariant regression; it never mutates the live level pair. */
export function runTwoBodySwitchingRegression(): string {
  const manager = new SlimeManager<FakeBody>();
  const bob = new FakeBody(new THREE.Vector3(0, 0.45, 0));
  const goop = new FakeBody(new THREE.Vector3(4, 0.45, 0));
  const pair = new PersistentSlimePair({
    manager,
    bobBody: bob,
    goopBody: goop,
    bobSpawnPosition: bob.position,
    goopSpawnPosition: goop.position,
  });
  const plate = new PressurePlate({
    id: 'two-body-regression',
    position: new THREE.Vector3(0, 0, 0),
    size: new THREE.Vector3(2, 0.2, 2),
  });
  const sensor = new BoxTriggerSensor(
    new THREE.Vector3(0, 0.45, 0),
    new THREE.Vector3(2, 1, 2),
  );
  const occupants = [
    { id: 'bob', position: bob.position, radiusMetres: bob.radiusMetres },
    { id: 'goop', position: goop.position, radiusMetres: goop.radiusMetres },
  ] as const;

  try {
    const originalBob = manager.getBody('bob');
    const originalGoop = manager.getBody('goop');

    // Pressure occupancy must consider both persistent bodies, not active only.
    sensor.update(plate.trigger, occupants);
    assert(plate.isPressed, 'Bob did not press the test plate.');
    assert(plate.trigger.occupants.has('bob'), 'Bob occupancy ID was missing.');

    pair.switchActive();
    sensor.update(plate.trigger, occupants);
    assert(
      pair.activeSlimeId === 'goop',
      'Control did not transfer to Goop.',
    );
    assert(
      plate.isPressed && plate.trigger.occupants.has('bob'),
      'Inactive Bob stopped occupying the pressure plate.',
    );

    // Rapid switching must never duplicate/remove bodies or produce 2 actives.
    for (let index = 0; index < 100; index += 1) {
      assert(pair.switchActive(), `Rapid switch ${index + 1} was rejected.`);
      const activeCount = manager
        .getRosterState()
        .filter((entry) => entry.active).length;
      assert(activeCount === 1, 'Rapid switching produced multiple active slimes.');
      assert(manager.registeredCount === 2, 'Rapid switching changed body count.');
      assert(manager.getBody('bob') === originalBob, 'Bob body identity changed.');
      assert(manager.getBody('goop') === originalGoop, 'Goop body identity changed.');
    }

    // Airborne/persistent state is not rewritten by switching.
    bob.position.set(2, 5, 1);
    const airborneBefore = bob.position.clone();
    if (pair.activeSlimeId === 'bob') pair.switchActive();
    assert(
      bob.position.equals(airborneBefore),
      'Switching rewrote the inactive airborne Bob position.',
    );

    // Two-body checkpoint/restoration restores both positions and active owner.
    pair.setRecoveryState({
      bobPosition: new THREE.Vector3(1, 0.45, 2),
      goopPosition: new THREE.Vector3(5, 0.45, 2),
      activeSlimeId: 'goop',
    });
    bob.position.set(30, 30, 30);
    goop.position.set(-30, -30, -30);
    if (pair.activeSlimeId !== 'bob') pair.switchActive();
    pair.restoreRecoveryState();

    assert(
      bob.position.equals(new THREE.Vector3(1, 0.45, 2)),
      'Bob recovery position diverged.',
    );
    assert(
      goop.position.equals(new THREE.Vector3(5, 0.45, 2)),
      'Goop recovery position diverged.',
    );
    assert(
      pair.activeSlimeId === 'goop',
      'Recovery did not restore the authored active slime.',
    );
    assert(manager.registeredCount === 2, 'Recovery changed body registrations.');

    return [
      'PASS',
      '101 rapid switches',
      '1 active controller',
      'inactive plate occupancy retained',
      'airborne state retained',
      'two-body recovery matched',
    ].join(' — ');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return `FAIL — ${message}`;
  } finally {
    plate.dispose();
    manager.dispose();
  }
}
