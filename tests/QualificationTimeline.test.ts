import assert from 'node:assert/strict';
import test from 'node:test';
import {QualificationTimeline} from '../src/debug/QualificationTimeline.ts';

test('ready, actual control and stable resources are distinct; pauses and allocations restart stabilization',()=>{
  const timeline=new QualificationTimeline();timeline.request('initial','initial','pending',10);
  timeline.observe(50,'level',true,1,2,3,null);assert.equal(timeline.events[0].controlAtMs,null);
  timeline.ready(100);timeline.observe(200,'level',true,1,2,3,null);
  timeline.observe(2100,'level',true,1,2,4,null);assert.equal(timeline.events[0].resourceSample,null);
  timeline.observe(4000,'level',false,1,2,4,null);timeline.observe(5000,'level',true,1,2,4,null);
  assert.equal(timeline.events[0].resourceSample,null);timeline.observe(6000,'level',true,1,2,4,null);
  assert.equal(timeline.events[0].controlAtMs,200);assert.equal(timeline.events[0].readyAtMs,100);
  assert.equal(timeline.events[0].resourceSample.textures,4);assert.equal(timeline.needsFrame,false);
});
test('new lifecycle request preserves incomplete prior evidence and bounds retained events',()=>{
  const timeline=new QualificationTimeline();timeline.request('transition','level-2','level',0);timeline.ready(10);
  timeline.request('restart','restart','level',20);assert.equal(timeline.events[0].controlAtMs,null);
  for(let i=0;i<100;i++)timeline.request('restart','restart','level',i);
  assert.equal(timeline.events.length,32);
});
