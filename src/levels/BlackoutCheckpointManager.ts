import * as THREE from 'three';

import type { PersistentSlimeBody } from '../slimes/PersistentSlimePair.ts';
import type { PersistentSlimeGroup } from '../slimes/PersistentSlimeGroup.ts';
import type {
  BlackoutCheckpointId,
  BlackoutRoomState,
  BlackoutRuntimeSnapshot,
  BlackoutSlimeId,
  SerializableValue,
} from './BlackoutRuntimeState.ts';

export interface BlackoutCheckpointDefinition {
  readonly id: BlackoutCheckpointId;
  readonly bodyPositions: Readonly<Record<BlackoutSlimeId, THREE.Vector3>>;
  readonly activeSlimeId: BlackoutSlimeId;
  readonly room: BlackoutRoomState;
  readonly clearanceRadius?: number;
}

export interface BlackoutCheckpointParticipant {
  readonly id: string;
  capture(): SerializableValue;
  restore(state: SerializableValue): void;
  resetTransient?(): void;
}

type SpawnSafetyCheck = (position: THREE.Vector3, clearanceRadius: number) => boolean;

interface RegisteredCheckpoint {
  readonly id: BlackoutCheckpointId;
  readonly bodyPositions: Readonly<Record<BlackoutSlimeId, THREE.Vector3>>;
  readonly activeSlimeId: BlackoutSlimeId;
  readonly room: BlackoutRoomState;
  readonly clearanceRadius: number;
}

/**
 * Level 3 checkpoint authority.
 *
 * Checkpoints contain plain serializable state. Live Volt arcs/projectiles are
 * never serialized; participants clear those transient resources before their
 * authored checkpoint state is restored.
 */
export class BlackoutCheckpointManager<Body extends PersistentSlimeBody> {
  private readonly checkpoints = new Map<BlackoutCheckpointId, RegisteredCheckpoint>();
  private readonly participants = new Map<string, BlackoutCheckpointParticipant>();
  private readonly isSpawnSafe: SpawnSafetyCheck;
  private readonly initialCheckpointId: BlackoutCheckpointId;
  private activeSnapshot: BlackoutRuntimeSnapshot;

  constructor(
    initialCheckpoint: BlackoutCheckpointDefinition,
    isSpawnSafe: SpawnSafetyCheck,
  ) {
    this.initialCheckpointId = initialCheckpoint.id;
    this.isSpawnSafe = isSpawnSafe;
    this.registerCheckpoint(initialCheckpoint);
    this.activeSnapshot = this.createSnapshot(this.getCheckpoint(initialCheckpoint.id));
  }

  get activeCheckpoint(): BlackoutRuntimeSnapshot {
    return cloneSnapshot(this.activeSnapshot);
  }

  registerParticipant(participant: BlackoutCheckpointParticipant): () => void {
    if (!participant.id || this.participants.has(participant.id)) {
      throw new Error('Blackout checkpoint participant IDs must be unique and non-empty.');
    }
    this.participants.set(participant.id, participant);
    return () => this.participants.delete(participant.id);
  }

  registerCheckpoint(definition: BlackoutCheckpointDefinition): void {
    if (this.checkpoints.has(definition.id)) {
      throw new Error(`Duplicate Blackout checkpoint "${definition.id}".`);
    }
    const clearanceRadius = definition.clearanceRadius ?? 0.45;
    if (!Number.isFinite(clearanceRadius) || clearanceRadius <= 0) {
      throw new Error('Blackout checkpoint clearance radius must be positive and finite.');
    }
    const checkpoint: RegisteredCheckpoint = {
      id: definition.id,
      bodyPositions: {
        bob: definition.bodyPositions.bob.clone(),
        goop: definition.bodyPositions.goop.clone(),
        volt: definition.bodyPositions.volt.clone(),
      },
      activeSlimeId: definition.activeSlimeId,
      room: cloneRoomState(definition.room),
      clearanceRadius,
    };
    this.assertSafe(checkpoint);
    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  activate(checkpointId: BlackoutCheckpointId, activeSlimeId?: BlackoutSlimeId): void {
    const checkpoint = this.getCheckpoint(checkpointId);
    this.assertSafe(checkpoint);
    this.activeSnapshot = this.createSnapshot(checkpoint, activeSlimeId);
  }

  captureCurrent(
    checkpointId: BlackoutCheckpointId,
    group: PersistentSlimeGroup<Body>,
    room: BlackoutRoomState,
  ): void {
    const checkpoint = this.getCheckpoint(checkpointId);
    const participantState = this.captureParticipants();
    this.activeSnapshot = {
      checkpointId,
      bodyPositions: {
        bob: toTuple(group.bobBody.position),
        goop: toTuple(group.goopBody.position),
        volt: toTuple(group.voltBody.position),
      },
      activeSlimeId: group.activeSlimeId,
      room: cloneRoomState(room),
      connections: { voltTargetId: null },
      participantState,
    };
    // Captured body state still has to respect the authored checkpoint's
    // clearance policy so a checkpoint cannot save an unrecoverable pose.
    for (const id of ['bob', 'goop', 'volt'] as const) {
      const position = tupleToVector(this.activeSnapshot.bodyPositions[id]);
      if (!this.isSpawnSafe(position, checkpoint.clearanceRadius)) {
        throw new Error(`Checkpoint "${checkpointId}" captured an unsafe ${id} position.`);
      }
    }
  }

  recover(group: PersistentSlimeGroup<Body>): BlackoutRuntimeSnapshot {
    // Transients are cleared first. Participant restore then returns doors,
    // hazards, powered devices and room-local systems to deterministic state.
    for (const participant of this.participants.values()) participant.resetTransient?.();

    const snapshot = cloneSnapshot(this.activeSnapshot);
    const checkpoint = this.getCheckpoint(snapshot.checkpointId);
    this.assertSafeSnapshot(snapshot, checkpoint.clearanceRadius);

    for (const [id, participant] of this.participants) {
      const state = snapshot.participantState[id];
      if (state !== undefined) participant.restore(cloneSerializable(state));
    }

    group.setRecoveryState({
      positions: {
        bob: tupleToVector(snapshot.bodyPositions.bob),
        goop: tupleToVector(snapshot.bodyPositions.goop),
        volt: tupleToVector(snapshot.bodyPositions.volt),
      },
      activeSlimeId: snapshot.activeSlimeId,
    });
    group.restoreRecoveryState();
    return snapshot;
  }

  resetToInitial(): void {
    this.activeSnapshot = this.createSnapshot(this.getCheckpoint(this.initialCheckpointId));
  }

  private createSnapshot(
    checkpoint: RegisteredCheckpoint,
    activeSlimeId = checkpoint.activeSlimeId,
  ): BlackoutRuntimeSnapshot {
    return {
      checkpointId: checkpoint.id,
      bodyPositions: {
        bob: toTuple(checkpoint.bodyPositions.bob),
        goop: toTuple(checkpoint.bodyPositions.goop),
        volt: toTuple(checkpoint.bodyPositions.volt),
      },
      activeSlimeId,
      room: cloneRoomState(checkpoint.room),
      connections: { voltTargetId: null },
      participantState: this.captureParticipants(),
    };
  }

  private captureParticipants(): Readonly<Record<string, SerializableValue>> {
    const state: Record<string, SerializableValue> = {};
    for (const [id, participant] of this.participants) {
      state[id] = cloneSerializable(participant.capture());
    }
    return state;
  }

  private getCheckpoint(id: BlackoutCheckpointId): RegisteredCheckpoint {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint) throw new Error(`Unknown Blackout checkpoint "${id}".`);
    return checkpoint;
  }

  private assertSafe(checkpoint: RegisteredCheckpoint): void {
    for (const id of ['bob', 'goop', 'volt'] as const) {
      if (!this.isSpawnSafe(checkpoint.bodyPositions[id], checkpoint.clearanceRadius)) {
        throw new Error(`Checkpoint "${checkpoint.id}" has an unsafe ${id} spawn.`);
      }
    }
  }

  private assertSafeSnapshot(snapshot: BlackoutRuntimeSnapshot, clearanceRadius: number): void {
    for (const id of ['bob', 'goop', 'volt'] as const) {
      if (!this.isSpawnSafe(tupleToVector(snapshot.bodyPositions[id]), clearanceRadius)) {
        throw new Error(`Checkpoint "${snapshot.checkpointId}" has an unsafe restored ${id} spawn.`);
      }
    }
  }
}

function toTuple(position: { readonly x: number; readonly y: number; readonly z: number }): readonly [number, number, number] {
  return [position.x, position.y, position.z] as const;
}

function tupleToVector(position: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(position[0], position[1], position[2]);
}

function cloneRoomState(room: BlackoutRoomState): BlackoutRoomState {
  return {
    roomId: room.roomId,
    phase: room.phase,
    local: cloneSerializable(room.local) as Readonly<Record<string, SerializableValue>>,
  };
}

function cloneSnapshot(snapshot: BlackoutRuntimeSnapshot): BlackoutRuntimeSnapshot {
  return {
    checkpointId: snapshot.checkpointId,
    bodyPositions: {
      bob: [...snapshot.bodyPositions.bob] as [number, number, number],
      goop: [...snapshot.bodyPositions.goop] as [number, number, number],
      volt: [...snapshot.bodyPositions.volt] as [number, number, number],
    },
    activeSlimeId: snapshot.activeSlimeId,
    room: cloneRoomState(snapshot.room),
    connections: { ...snapshot.connections },
    participantState: cloneSerializable(snapshot.participantState) as Readonly<Record<string, SerializableValue>>,
  };
}

function cloneSerializable(value: SerializableValue): SerializableValue {
  if (Array.isArray(value)) return value.map(cloneSerializable);
  if (value !== null && typeof value === 'object') {
    const clone: Record<string, SerializableValue> = {};
    for (const [key, child] of Object.entries(value)) {
      clone[key] = cloneSerializable(child as SerializableValue);
    }
    return clone;
  }
  return value;
}
