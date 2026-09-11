import assert from 'node:assert/strict';
import test from 'node:test';

import { SpecimenFormController } from '../src/specimen/SpecimenFormController.ts';

test('Specimen merge progresses deterministically, completes once, and rejects duplicate starts', () => {
  const controller = new SpecimenFormController({
    mergeDurationSeconds: 6,
  });
  const completions: number[] = [];
  let fullProgressEvents = 0;
  controller.events.on('mergeCompleted', () => {
    completions.push(1);
  });
  controller.events.on('mergeProgressChanged', ({ progress }) => {
    if (progress === 1) fullProgressEvents += 1;
  });

  assert.equal(controller.beginMerge(), true);
  assert.equal(controller.beginMerge(), false);
  assert.equal(controller.readModel.controlledForm, 'group');
  assert.equal(controller.readModel.mergeActive, true);

  for (let index = 0; index < 359; index += 1) {
    assert.equal(controller.updateMerge(1 / 60), false);
  }
  assert.ok(controller.readModel.mergeProgress < 1);
  assert.equal(controller.updateMerge(1 / 60), true);
  assert.equal(controller.readModel.mergeProgress, 1);
  assert.equal(controller.readModel.mergeActive, false);
  assert.equal(controller.readModel.controlledForm, 'specimen');
  assert.deepEqual(completions, [1]);
  assert.equal(fullProgressEvents, 1);
  assert.equal(controller.updateMerge(1 / 60), false);

  controller.dispose();
});

test('Specimen split requires merged ownership and completes only through the explicit hook', () => {
  const controller = new SpecimenFormController({
    mergeDurationSeconds: 0.1,
  });

  assert.equal(controller.beginSplit(), false);
  assert.equal(controller.beginMerge(), true);
  assert.equal(controller.updateMerge(0.1), true);
  assert.equal(controller.beginSplit(), true);
  assert.equal(controller.beginSplit(), false);
  assert.equal(controller.readModel.controlledForm, 'specimen');
  assert.equal(controller.readModel.splitActive, true);

  assert.equal(controller.completeSplit(), true);
  assert.equal(controller.completeSplit(), false);
  assert.equal(controller.readModel.controlledForm, 'group');
  assert.equal(controller.readModel.splitActive, false);

  controller.dispose();
});

test('Specimen form restore cancels interrupted transitions without replaying handoffs', () => {
  const controller = new SpecimenFormController({
    mergeDurationSeconds: 6,
  });

  assert.equal(controller.beginMerge(), true);
  controller.updateMerge(2);
  assert.ok(controller.readModel.mergeProgress > 0);

  controller.restore('group');
  assert.equal(controller.readModel.controlledForm, 'group');
  assert.equal(controller.readModel.mergeActive, false);
  assert.equal(controller.readModel.mergeProgress, 0);

  controller.restore('specimen');
  assert.equal(controller.readModel.controlledForm, 'specimen');
  assert.equal(controller.readModel.mergeActive, false);
  assert.equal(controller.readModel.mergeProgress, 1);
  assert.equal(controller.beginSplit(), true);
  controller.restore('specimen');
  assert.equal(controller.readModel.splitActive, false);

  controller.dispose();
});
