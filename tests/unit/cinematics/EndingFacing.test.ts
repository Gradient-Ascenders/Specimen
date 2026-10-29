import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3, type Object3D } from 'three';
import { GoopCharacterPresentation } from '../../../src/render/goop/GoopCharacterPresentation.ts';
import { VoltCharacterPresentation } from '../../../src/render/volt/VoltCharacterPresentation.ts';
import { SpecimenCharacterPresentation } from '../../../src/render/specimen/SpecimenCharacterPresentation.ts';
import { preserveResearchPresentation } from '../../../src/cinematics/BlackoutResearchPreparation.ts';
import { sampleEndingSlime, ENDING_TIMING as T } from '../../../src/cinematics/BossDefeatTimeline.ts';

for (const kind of ['goop', 'volt', 'specimen'] as const) test(`${kind} retains authored -Z forward after a rehearsal restores a half-turn`, () => {
  const actor = kind === 'goop' ? new GoopCharacterPresentation()
    : kind === 'volt' ? new VoltCharacterPresentation() : new SpecimenCharacterPresentation();
  const facing = kind === 'specimen'
    ? actor.root.getObjectByName('specimen-elastic-motion')!.parent!
    : actor.root.getObjectByName(`player-slime-${kind}-character`)!;
  try {
    actor.setYaw(Math.PI);
    const restore = preserveResearchPresentation(actor.root);
    actor.setYaw(0); restore();
    for (const yaw of [0, Math.PI, -Math.PI / 2, .3]) {
      actor.setYaw(yaw); actor.present(1); actor.root.updateWorldMatrix(true, true);
      const actual = new Vector3(0, 0, -1).transformDirection((facing as Object3D).matrixWorld);
      const expected = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      assert.ok(actual.dot(expected) > .999999, `${kind} faces its requested heading at ${yaw}`);
    }
  } finally { actor.dispose(); }
});

test('the ending group looks at the speaker, then runs toward the exit and looks back toward Goop', () => {
  const positions = { bob: new Vector3(), goop: new Vector3(), volt: new Vector3() };
  for (const [time, speaker] of [[46, 'volt'], [T.sacrifice + 1, 'goop']] as const) {
    for (const id of ['bob', 'goop', 'volt'] as const) sampleEndingSlime(id, time, positions[id]);
    for (const id of ['bob', 'goop', 'volt'] as const) {
      if (id === speaker) continue;
      const { facing } = sampleEndingSlime(id, time, positions[id]);
      const direction = positions[speaker].clone().sub(positions[id]).setY(0).normalize();
      assert.ok(direction.dot(new Vector3(-Math.sin(facing), 0, -Math.cos(facing))) > .999);
    }
  }
  for (const id of ['bob', 'volt'] as const) {
    const { facing } = sampleEndingSlime(id, T.runAgain + 4, positions[id]);
    assert.ok(-Math.cos(facing) < -.99, `${id} runs down the escape passage`);
  }
  const { facing } = sampleEndingSlime('bob', T.lookBack + 2.5, positions.bob);
  assert.ok(-Math.cos(facing) > .99, 'Bob turns back toward the arena');
});
