import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphicsPreparation } from '../src/render/GraphicsPreparation.ts';
import { graphicsShaderKey, graphicsTransmissionResourceKey, GRAPHICS_PROFILES } from '../src/render/GraphicsProfiles.ts';

test('resolution, shadow size and capture scale do not change shader features; transmission does', () => {
  const minimum = GRAPHICS_PROFILES.minimum.settings, standard = GRAPHICS_PROFILES.standard.settings;
  assert.equal(graphicsShaderKey(minimum), graphicsShaderKey({...minimum, renderScale:0.5,graphicsPreset:'performance'}));
  assert.equal(graphicsShaderKey(standard), graphicsShaderKey({...standard,gelRenderingMode:'physical'}));
  assert.notEqual(graphicsShaderKey(minimum), graphicsShaderKey(standard));
  assert.notEqual(graphicsTransmissionResourceKey(standard), graphicsTransmissionResourceKey({...standard,gelRenderingMode:'physical'}));
  assert.equal(graphicsTransmissionResourceKey({...standard,graphicsPreset:'performance'}),
    graphicsTransmissionResourceKey({...standard,graphicsPreset:'performance',gelRenderingMode:'physical'}));
  assert.equal(graphicsTransmissionResourceKey(minimum),graphicsTransmissionResourceKey({...minimum,renderScale:.5}));
  assert.notEqual(graphicsTransmissionResourceKey(standard),graphicsTransmissionResourceKey({...standard,renderScale:.5}));
});

test('resource-only changes serialize and reuse shaders without marking an unapplied target ready', async () => {
  const states:boolean[]=[], applied:string[]=[], prepared:string[]=[];
  const gate=new GraphicsPreparation(p=>states.push(p));
  const shader=async()=>{throw Error('scale-only changes must not rebuild shaders');};
  gate.update('transmission',()=>{},shader,{key:'half',prepare:async()=>{throw Error('startup owns initial resources');}});
  let finish!:()=>void;
  gate.update('transmission',()=>applied.push('full'),shader,{key:'full',prepare:()=>new Promise<void>(r=>{prepared.push('full');finish=r;})});
  gate.update('transmission',()=>applied.push('obsolete'),shader,{key:'half',prepare:async()=>{prepared.push('obsolete');}});
  gate.update('transmission',()=>applied.push('latest'),shader,{key:'half',prepare:async()=>{prepared.push('half');}});
  assert.deepEqual(applied,['full']);assert.equal(gate.pending,true);
  finish();await gate.settled;
  assert.deepEqual(applied,['full','latest']);assert.deepEqual(prepared,['full','half']);assert.deepEqual(states,[true,false]);
  gate.update('transmission',()=>applied.push('same'),shader,{key:'half',prepare:async()=>{throw Error('already ready');}});
  assert.equal(gate.pending,false);
});

for(const reject of [false,true]) test(`resource cancellation cannot commit stale readiness (${reject})`,async()=>{
  const gate=new GraphicsPreparation(()=>{});let shaders=0,resources=0,finish!:()=>void,fail!:(e:Error)=>void;
  gate.update('transmission',()=>{},async()=>{},{key:'half',prepare:async()=>{}});
  gate.update('transmission',()=>{},async()=>{shaders++;},{key:'full',prepare:()=>new Promise<void>((r,j)=>{finish=r;fail=j;})});
  const old=gate.settled;gate.cancel();
  if(reject)fail(Error('late resource failure'));else finish();await old;
  gate.update('transmission',()=>{},async()=>{shaders++;},{key:'half',prepare:async()=>{resources++;}});
  await gate.settled;assert.equal(shaders,1,'cancel invalidates feature and resource readiness');assert.equal(resources,0);
  gate.update('transmission',()=>{},async()=>{shaders++;},{key:'full',prepare:async()=>{resources++;}});
  await gate.settled;assert.equal(resources,1);assert.equal(shaders,1);
});

test('a failed resource primer keeps the graphics gate blocked until cancellation',async()=>{
  const failures:unknown[]=[],gate=new GraphicsPreparation((_p,e)=>{if(e)failures.push(e);});
  gate.update('transmission',()=>{},async()=>{},{key:'half',prepare:async()=>{}});
  gate.update('transmission',()=>{},async()=>{throw Error('unexpected shader rebuild');},{key:'full',prepare:async()=>{throw Error('storage failed');}});
  await gate.settled;assert.equal(gate.pending,true);assert.equal(failures.length,1);gate.cancel();assert.equal(gate.pending,false);
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
