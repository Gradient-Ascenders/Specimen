import assert from 'node:assert/strict';
import test from 'node:test';
import { ProgramBindingPrewarm } from '../src/render/ProgramBindingPrewarm.ts';

test('deferred shader binding setup yields between programs and runs only once per real program', async () => {
  const warm = new ProgramBindingPrewarm(), order: string[] = [];
  const first = { getUniforms: () => order.push('first') }, second = { getUniforms: () => order.push('second') };
  const yieldJob = async () => { order.push('yield'); };
  await warm.prepare([first, second, first], yieldJob, () => true);
  assert.deepEqual(order, ['yield', 'first', 'yield', 'second']);
  await warm.prepare([first, second], yieldJob, () => true);
  assert.equal(order.length, 4);
  const replacement = { getUniforms: () => order.push('replacement') };
  await warm.prepare([replacement], yieldJob, () => true);
  assert.deepEqual(order.slice(-2), ['yield', 'replacement']);
});

test('cancellation at a yield leaves that program untouched and a later attempt can prepare it', async () => {
  const warm = new ProgramBindingPrewarm(); let calls = 0, active = true;
  const program = { getUniforms: () => { calls++; } };
  await warm.prepare([program], async () => { active = false; }, () => active);
  assert.equal(calls, 0);
  await warm.prepare([program], undefined, () => true);
  assert.equal(calls, 1);
  await warm.prepare(undefined, undefined, () => true);
});
