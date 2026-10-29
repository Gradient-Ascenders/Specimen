import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { diagnosticOptions } from '../../../scripts/lib/diagnostics.mjs';

test('diagnostics share nested-base defaults and CLI overrides without losing tool defaults', () => {
  const defaults = { output: 'artifacts/test', channel: 'chrome', headed: true };
  const env = { SPECIMEN_DIAGNOSTIC_URL: 'https://example.test/game/', SPECIMEN_DIAGNOSTIC_OUTPUT: 'artifacts/env', SPECIMEN_CDP_URL: 'http://localhost:9222' };
  const configured = diagnosticOptions({ url: 'https://example.test/review/', output: 'artifacts/cli' }, defaults, env);
  assert.equal(configured.url, 'https://example.test/review/');
  assert.equal(configured.output, resolve('artifacts/cli'));
  assert.equal(configured.channel, 'chrome');
  assert.equal(configured.cdp, env.SPECIMEN_CDP_URL);
  assert.equal(configured.headed, true);
  assert.equal(diagnosticOptions({}, {}, {}).url, 'http://127.0.0.1:4173/group-folder/');
  assert.equal(diagnosticOptions({}, defaults, env).output, resolve('artifacts/env'));
});

test('diagnostics reject invalid serving URLs and attempts to change an external browser backend', () => {
  assert.throws(() => diagnosticOptions({ url: 'file:///tmp/game' }, {}, {}), /HTTP/);
  assert.throws(() => diagnosticOptions({ software: true, cdp: 'http://localhost:9222' }, {}, {}), /externally owned/);
});
