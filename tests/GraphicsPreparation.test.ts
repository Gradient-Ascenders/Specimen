import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphicsPreparation } from '../src/render/GraphicsPreparation.ts';
import { graphicsShaderKey, GRAPHICS_PROFILES } from '../src/render/GraphicsProfiles.ts';

test('resolution, shadow size and capture scale do not change shader features; transmission does', () => {
  const minimum = GRAPHICS_PROFILES.minimum.settings, standard = GRAPHICS_PROFILES.standard.settings;
  assert.equal(graphicsShaderKey(minimum), graphicsShaderKey({...minimum, renderScale:0.5,graphicsPreset:'performance'}));
  assert.equal(graphicsShaderKey(standard), graphicsShaderKey({...standard,gelRenderingMode:'physical'}));
  assert.notEqual(graphicsShaderKey(minimum), graphicsShaderKey(standard));
});

test('feature changes block rendering until ready and serialize rapid material changes', async () => {
  const changes:string[] = [], states:boolean[] = [];
  const gate = new GraphicsPreparation(pending => states.push(pending));
  gate.update('opaque',()=>changes.push('initial'),async()=>{throw Error('initial preparation belongs to startup');});
  let finish!:()=>void;
  gate.update('transmission',()=>changes.push('transmission'),()=>new Promise<void>(resolve=>{finish=resolve;}));
  assert.equal(gate.pending,true);
  gate.update('opaque',()=>changes.push('obsolete'),async()=>{changes.push('obsolete-prepare');});
  gate.update('transmission',()=>changes.push('latest'),async()=>{changes.push('extra-prepare');});
  assert.deepEqual(changes,['initial','transmission'],'pending compile keeps the material generation stable');
  finish(); await gate.settled;
  assert.deepEqual(changes,['initial','transmission','latest']);
  assert.deepEqual(states,[true,false]); assert.equal(gate.pending,false);
});

for (const reject of [false,true]) test(`cancelled preparation cannot apply queued settings or notify a new owner (${reject})`, async () => {
  const changes:string[]=[], states:boolean[]=[];
  const gate=new GraphicsPreparation(pending=>states.push(pending));
  gate.update('opaque',()=>{},async()=>{});
  let resolve!:()=>void, fail!:(e:Error)=>void;
  gate.update('transmission',()=>{},()=>new Promise<void>((yes,no)=>{resolve=yes;fail=no;}));
  const pending=gate.settled;
  gate.update('opaque',()=>changes.push('stale'),async()=>{});
  gate.cancel();
  if(reject) fail(Error('late rejection')); else resolve();
  await pending;
  assert.deepEqual(changes,[]);assert.deepEqual(states,[true,false]);assert.equal(gate.pending,false);
});

test('failure remains blocked with an explicit error until cancellation', async () => {
  const errors:unknown[]=[];
  const gate=new GraphicsPreparation((_pending,error)=>{if(error) errors.push(error);});
  gate.update('opaque',()=>{},async()=>{});
  gate.update('transmission',()=>{},async()=>{throw Error('driver failure');});
  await gate.settled;
  assert.equal(gate.pending,true);assert.equal(errors.length,1);
  gate.cancel();assert.equal(gate.pending,false);
});

test('cancellation invalidates readiness even when switching back to the old key', async () => {
  const gate=new GraphicsPreparation(()=>{}); let prepared=0;
  gate.update('opaque',()=>{},async()=>{});
  let finish!:()=>void;
  gate.update('transmission',()=>{},()=>new Promise<void>(resolve=>{finish=resolve;}));
  const old=gate.settled; gate.cancel();finish();await old;
  gate.update('opaque',()=>{},async()=>{prepared++;});await gate.settled;
  assert.equal(prepared,1);
});
