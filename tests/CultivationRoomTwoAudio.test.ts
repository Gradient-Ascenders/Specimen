import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';
import { LevelTwoRoomTwoGreybox } from '../src/levels/LevelTwoRoomTwoGreybox.ts';
import { ProximityShutterDoor } from '../src/puzzle/ProximityShutterDoor.ts';

test('Cultivation Room 2 button sounds each press/release once at the pad, with silent reset', () => {
  const door = new ProximityShutterDoor({ id: 'button-audio', widthMetres: 4, heightMetres: 4 });
  const room = new LevelTwoRoomTwoGreybox(() => {}, door);
  const cues: string[] = [], positions: THREE.Vector3[] = [];
  const off = gameplayAudioEvents.on('cue', cue => {
    if (cue.sound !== 'world-button-press-01' && cue.sound !== 'world-button-release-01') return;
    cues.push(cue.sound); positions.push(new THREE.Vector3().copy(cue.position!));
  });
  try {
    room.root.position.set(64, 0, 80);
    const pad = room.root.getObjectByName('cultivation-room-2-wall-button-pad')!;
    const expected = pad.getWorldPosition(new THREE.Vector3());
    const bob = { id: 'bob' as const, position: room.wallButton.getWorldPosition(new THREE.Vector3()),
      radiusMetres: .45, attached: true, supportCollider: room.wallButton };
    room.update(.1, []); assert.deepEqual(cues, []);
    room.update(.1, [bob]); room.update(.1, [bob]);
    assert.deepEqual(cues, ['world-button-press-01']);
    assert.ok(positions[0].distanceTo(expected) < 1e-6, 'the sound uses the pad world position');
    assert.equal(door.locked, false);
    room.update(.1, []); room.update(.1, []);
    assert.deepEqual(cues, ['world-button-press-01', 'world-button-release-01']);
    assert.equal(door.locked, true);
    room.update(.1, [bob]); room.reset(); room.update(.1, []);
    assert.equal(cues.length, 3, 'restoring a held button does not emit a release');
  } finally { off(); room.dispose(); door.dispose(); }
});
