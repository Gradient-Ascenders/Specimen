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

test('all submitted variants finish linking before any synchronous first-use inspection', async () => {
  const warm = new ProgramBindingPrewarm();
  let linked = false, inspections = 0;
  const first = { isReady: () => true, getUniforms: () => { inspections++; } };
  const last = { isReady: () => linked, getUniforms: () => { inspections++; } };
  const preparation = warm.prepare([first, last], undefined, () => true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(inspections, 0, 'Do not block the driver on an earlier variant while others are linking.');
  linked = true;
  await preparation;
  assert.equal(inspections, 2);
});

test('cancellation during parallel linking prevents inspection and permits a later retry', async () => {
  const warm = new ProgramBindingPrewarm();
  let active = true, linked = false, inspections = 0;
  const program = { isReady: () => {
    assert.ok(active || linked, 'Do not query a retired GL program after cancellation.');
    return linked;
  }, getUniforms: () => { inspections++; } };
  const preparation = warm.prepare([program], undefined, () => active);
  active = false;
  await preparation;
  assert.equal(inspections, 0);
  linked = true;
  await warm.prepare([program], undefined, () => true);
  assert.equal(inspections, 1);
});
