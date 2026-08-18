import * as THREE from 'three';

import {
  CheckpointManager,
  type CheckpointRecoveryTarget,
} from './Checkpoints';
import { Door } from './Door';
import { MovingPlatform } from './MovingPlatform';
import { PressurePlate } from './PressurePlate';
import { PuzzleRegistry } from './PuzzleRegistry';

const TEST_OCCUPANT_ID = 'greybox-test-slime';
const INITIAL_SPAWN = new THREE.Vector3(-4, 0.55, -5);
const ELEVATED_SPAWN = new THREE.Vector3(3, 1.15, -5);

/** A compact, interactive composition of the reusable Sprint 1 puzzle objects. */
export class PuzzleTestRig implements CheckpointRecoveryTarget {
  readonly root = new THREE.Group();

  private readonly pressurePlate: PressurePlate;
  private readonly door: Door;
  private readonly platform: MovingPlatform;
  private readonly testSlime: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshStandardMaterial
  >;
  private readonly puzzleRegistry = new PuzzleRegistry();
  private readonly checkpoints: CheckpointManager;
  private readonly unsubscribePlate: () => void;
  private testSlimeOnPlate = false;

  constructor() {
    this.root.name = 'puzzle-component-test-rig';

    this.pressurePlate = new PressurePlate({
      id: 'test-rig',
      position: new THREE.Vector3(-4, 0, -5),
    });
    this.door = new Door({
      id: 'test-rig',
      position: new THREE.Vector3(-0.8, 0, -5),
    });
    this.platform = new MovingPlatform({
      id: 'test-rig',
      start: new THREE.Vector3(3, 0.5, -5),
      end: new THREE.Vector3(7, 0.5, -5),
      travelDurationSeconds: 2.2,
    });
    this.root.add(this.pressurePlate.root, this.door.root, this.platform.root);
    this.puzzleRegistry.register('test-rig-pressure-plate', this.pressurePlate);
    this.puzzleRegistry.register('test-rig-door', this.door);
    this.puzzleRegistry.register('test-rig-moving-platform', this.platform);

    const rigLight = new THREE.PointLight(0xe7fff1, 11, 12);
    rigLight.name = 'test-rig-puzzle-light';
    rigLight.position.set(-0.5, 4, -4.5);
    this.root.add(rigLight);

    const slimeGeometry = new THREE.SphereGeometry(0.32, 20, 12);
    const slimeMaterial = new THREE.MeshStandardMaterial({
      color: 0x5bc8ff,
      emissive: 0x063b63,
      emissiveIntensity: 0.55,
      roughness: 0.3,
    });
    this.testSlime = new THREE.Mesh(slimeGeometry, slimeMaterial);
    this.testSlime.name = 'test-rig-simulated-slime';
    this.testSlime.position.copy(INITIAL_SPAWN);
    this.testSlime.visible = false;
    this.root.add(this.testSlime);

    this.checkpoints = new CheckpointManager(
      { id: 'test-rig-initial', spawnPosition: INITIAL_SPAWN },
      this.isSpawnSafe,
    );
    this.checkpoints.register({
      id: 'test-rig-elevated',
      spawnPosition: ELEVATED_SPAWN,
    });

    this.unsubscribePlate = this.pressurePlate.events.on('changed', ({ pressed }) => {
      this.door.setOpen(pressed);
      this.platform.setActive(pressed);
    });
  }

  get platePressed(): boolean {
    return this.pressurePlate.isPressed;
  }

  get doorState(): string {
    return this.door.doorState;
  }

  get platformState(): string {
    return this.platform.platformState;
  }

  get activeCheckpointId(): string {
    return this.checkpoints.activeCheckpointId;
  }

  toggleTestSlime(): boolean {
    this.testSlimeOnPlate = !this.testSlimeOnPlate;
    this.pressurePlate.setOccupants(
      this.testSlimeOnPlate ? [TEST_OCCUPANT_ID] : [],
    );
    this.testSlime.visible = this.testSlimeOnPlate;
    return this.testSlimeOnPlate;
  }

  /** Exercises duplicate, multiple, and rapid enter/exit occupancy snapshots. */
  runTriggerRegression(): void {
    this.reset();
    this.pressurePlate.setOccupants(['slime-a', 'slime-a', 'slime-b']);
    if (
      Number(this.pressurePlate.trigger.occupants.size) !== 2 ||
      !this.platePressed
    ) {
      throw new Error('Trigger did not deduplicate multiple occupants.');
    }

    this.pressurePlate.setOccupants(['slime-b']);
    if (
      Number(this.pressurePlate.trigger.occupants.size) !== 1 ||
      !this.platePressed
    ) {
      throw new Error('Trigger released a plate while another occupant remained.');
    }

    this.pressurePlate.setOccupants([]);
    if (this.pressurePlate.trigger.occupied || this.platePressed) {
      throw new Error('Trigger did not release after the final occupant exited.');
    }
  }

  /** Verifies reset from active and returning puzzle states over ten cycles. */
  runResetRegression(): void {
    for (let cycle = 0; cycle < 10; cycle += 1) {
      this.pressurePlate.setOccupants([TEST_OCCUPANT_ID]);
      this.update(0.4);
      this.pressurePlate.setOccupants([]);
      this.update(0.1);
      this.checkpoints.activate('test-rig-elevated');
      this.testSlime.position.set(6.5, -2.2, 2);
      this.checkpoints.recover(this);

      this.reset();
      if (
        this.platePressed ||
        this.doorState !== 'closed' ||
        this.platformState !== 'atStart' ||
        this.activeCheckpointId !== 'test-rig-initial' ||
        !this.testSlime.position.equals(INITIAL_SPAWN)
      ) {
        throw new Error(`Puzzle reset was not deterministic on cycle ${cycle + 1}.`);
      }
    }
  }

  activateElevatedCheckpoint(): void {
    this.checkpoints.activate('test-rig-elevated');
  }

  recoverTestSlime(): void {
    this.testSlime.visible = true;
    this.checkpoints.recover(this);
  }

  recoverAt(position: THREE.Vector3): void {
    this.testSlime.position.copy(position);
  }

  reset(): void {
    this.testSlimeOnPlate = false;
    this.testSlime.visible = false;
    this.puzzleRegistry.reset();
    this.checkpoints.reset();
    this.checkpoints.recover(this);
  }

  update(deltaSeconds: number): void {
    this.door.update(deltaSeconds);
    this.platform.update(deltaSeconds);
  }

  dispose(): void {
    this.unsubscribePlate();
    this.pressurePlate.dispose();
    this.door.dispose();
    this.platform.dispose();
    this.puzzleRegistry.clear();
    this.testSlime.geometry.dispose();
    this.testSlime.material.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }

  private readonly isSpawnSafe = (
    position: THREE.Vector3,
    clearanceRadius: number,
  ): boolean => {
    if (clearanceRadius < 0.32) return false;
    return position.equals(INITIAL_SPAWN) || position.equals(ELEVATED_SPAWN);
  };
}
