import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {prepareTogether} from '../../../src/render/PreparationTasks.ts';
import {ContainmentLevelScene} from '../../../src/levels/ContainmentLevelScene.ts';

test('independent loading joins all owners before failure can trigger unload',async()=>{
  let finish!:()=>void,settled=false;
  const slow=new Promise<void>(resolve=>{finish=resolve;});
  const joined=prepareTogether([Promise.reject(Error('failed asset')),slow]);
  const rejection=assert.rejects(joined,/failed asset/).then(()=>{settled=true;});
  await Promise.resolve();await Promise.resolve();assert.equal(settled,false);
  finish();await rejection;assert.equal(settled,true);
});

test('Containment overlaps independent rooms and waits for the shared emitter',async()=>{
  const started:string[]=[],resolvers=new Map<string,()=>void>();
  const task=(name:string)=>()=>{started.push(name);return new Promise<void>(resolve=>resolvers.set(name,resolve));};
  const fixture={disposed:false,teaching:{ventArt:{prepare:async()=>{}},roomOneArt:{prepare:async()=>{},shell:{borrowFinish:()=>new THREE.Material()}},roomTwoArt:{prepare:task('two')}},
    surveillanceCameras:{prepare:task('cameras')},roomThree:{prepareArt:task('three'),art:{shell:{borrowLaserEmitter:()=>({})}}},
    roomFour:{prepareArt:task('four')},roomFive:{prepareArt:task('five')},root:new THREE.Group(),
    lightingArt:{prepare:()=>{},movingOwners:[]},lighting:{trackShadowOwner:()=>{}}};
  const ready=ContainmentLevelScene.prototype.prepareEnvironmentArt.call(fixture as unknown as ContainmentLevelScene);
  await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(started,['two','cameras','three']);
  resolvers.get('two')!();resolvers.get('cameras')!();await Promise.resolve();assert.equal(started.length,3);
  resolvers.get('three')!();for(let i=0;i<5;i++)await Promise.resolve();
  assert.deepEqual(started,['two','cameras','three','four','five']);
  resolvers.get('four')!();resolvers.get('five')!();await ready;
});
