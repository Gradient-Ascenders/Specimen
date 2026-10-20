import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { prepareCinematicProgram } from '../src/cinematics/CinematicProgramPreparation.ts';

test('parallel cinematic shader waits are nonblocking and cancel before disposed program handles are queried', async () => {
  let poll: FrameRequestCallback | undefined, ready = false, queried = 0, cancelled = 0;
  const programs: { program: object }[] = [];
  const renderer = { info: { programs }, compile() { programs.push({ program: {} }); },
    getContext: () => ({ getExtension: () => ({ COMPLETION_STATUS_KHR: 1 }), isContextLost: () => false,
      getProgramParameter: () => { queried++; return ready; } }) } as unknown as THREE.WebGLRenderer;
  const host = { requestAnimationFrame(fn: FrameRequestCallback) { poll = fn; return 1; }, cancelAnimationFrame() { cancelled++; poll = undefined; } };
  const abort = new AbortController();
  const pending = prepareCinematicProgram(renderer, new THREE.Group(), new THREE.PerspectiveCamera(), new THREE.Scene(), host, abort.signal);
  assert.equal(queried, 1); assert.ok(poll); abort.abort(); await pending;
  assert.equal(cancelled, 1); assert.equal(poll, undefined); assert.equal(queried, 1);
  const second = prepareCinematicProgram(renderer, new THREE.Group(), new THREE.PerspectiveCamera(), new THREE.Scene(), host, new AbortController().signal);
  assert.ok(poll); ready = true; poll!(0); await second; assert.equal(queried, 3);
});

test('already-cancelled preparation never submits compilation', async () => {
  const abort = new AbortController(); abort.abort();
  const renderer = { compile() { assert.fail('No work after unload'); } } as unknown as THREE.WebGLRenderer;
  await prepareCinematicProgram(renderer, new THREE.Group(), new THREE.Camera(), new THREE.Scene(), {} as Window, abort.signal);
});
