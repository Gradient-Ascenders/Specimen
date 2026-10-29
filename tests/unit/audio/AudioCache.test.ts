import assert from 'node:assert/strict';
import test from 'node:test';
import {AudioManager} from '../../../src/audio/AudioManager.ts';

test('audio aliases share one download/decode while retaining separate sound IDs',async t=>{
  let fetches=0,decodes=0;
  t.mock.method(globalThis,'fetch',async()=>{fetches++;return new Response(new Uint8Array([1,2]));});
  const param=()=>({value:0,setTargetAtTime:()=>{}}),node=()=>({gain:param(),connect:()=>{},disconnect:()=>{}});
  const context={state:'suspended',destination:{},currentTime:0,createGain:node,
    createDynamicsCompressor:()=>({...node(),threshold:param(),ratio:param()}),suspend:async()=>{},close:async()=>{},
    decodeAudioData:async()=>{decodes++;return {duration:1};}} as unknown as AudioContext;
  const audio=new AudioManager('./',()=>context);
  await audio.preload(['boss-beam-sustain-loop-01','ending-beam-collision-loop-01']);
  assert.equal(fetches,1);assert.equal(decodes,1);assert.equal(audio.diagnostics.loaded,2);audio.dispose();
});
