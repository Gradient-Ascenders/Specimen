import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [output,...files]=process.argv.slice(2);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stats=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return sorted.length?{count:sorted.length,min:sorted[0],median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.floor((sorted.length-1)*.95)],max:sorted.at(-1)}:undefined;};
const evidence={schema:1,note:'Milliseconds, bytes, native object counts. Failed D captures are evidence of rejection, not a shippable optimization. Heap inspection/error tracing runs are not timing-qualified.',captures:[]};
for(const file of files){
  const bytes=await readFile(file),capture=JSON.parse(bytes);
  const entry={file,sha256:sha(bytes),build:capture.build,options:capture.options,protocol:capture.protocol,browser:capture.browser,environment:capture.environment,failure:capture.failure,runs:[]};
  for(const row of capture.runs??[]){
    const start=row.marks.request,end=row.marks.ready,filmStart=row.timeline.find(t=>t.at>=start&&t.opening==='playing')?.at,filmEnd=row.marks.cinematicEnd;
    const frames=row.animationFrames.filter(t=>t>=filmStart&&t<=filmEnd),tasks=row.longTasks.filter(t=>t.start>=filmStart&&t.start<filmEnd);
    entry.runs.push({level:row.level,pair:row.pair,pass:row.pass,environment:row.environment,shaderCapabilities:row.shaderCapabilities,focused:row.focused,visibility:row.visibility,drawingBuffer:row.drawingBuffer,titleReadyMs:row.titleReadyAt,readyMs:end-start,
      postFilmMs:filmEnd&&end-filmEnd,controlMs:row.frames.control-start,postFilmControlMs:filmEnd&&row.frames.control-filmEnd,
      film:{durationMs:filmEnd-filmStart,rafGap:stats(frames.slice(1).map((t,i)=>t-frames[i])),longTasks:tasks,
        renderCpu:stats(row.draws.filter(t=>t.start>=filmStart&&t.start<filmEnd).map(t=>t.ms))},
      longestLoadingTaskMs:Math.max(0,...row.longTasks.filter(t=>t.start>=start&&t.start<end).map(t=>t.ms)),
      mainHeapPeak:Math.max(0,...row.heap.map(t=>t.bytes??0)),workerHeap:stats((row.workerHeap??[]).map(t=>t.usedSize)),
      workerBacking:stats((row.workerHeap??[]).map(t=>t.backingStorageSize)),workerHeapErrors:row.workerHeapErrors,
      warmup:row.openingWarmup,programs:row.programs,memory:row.memory,verification:row.verification,
      firstControlResources:row.frames.firstResources,lastControlResources:row.frames.samples.at(-1),
      firstControlFrames:stats(row.frames.samples.map(t=>t.deltaMs)),firstControlRenderCpu:stats(row.frames.samples.map(t=>t.cpuMs)),
      linksAfterControl:row.gl.filter(t=>t.key==='linkProgram'&&t.start>=row.frames.control&&t.start<row.frames.control+10000).length,
      fingerprints:row.programFingerprints,glError:row.glError,nativeErrors:row.nativeGlErrors,errors:row.errors,input:row.inputProbe,
      phases:row.phases.filter(p=>p.start>=start&&p.start<end).map(p=>({name:p.name,start:p.start-start,ms:p.ms}))});
  }
  if(capture.cycles)entry.lifecycle={profile:capture.profile,protocol:capture.protocol,gpu:capture.gpu,errors:capture.errors,
    cycles:capture.cycles.map(row=>{
      const count=sample=>{const live=new Set(sample.live),rows=sample.allocations.filter(a=>live.has(a.id));return {memory:sample.memory,camera:sample.camera,drawingBuffer:sample.drawingBuffer,transmissionScale:sample.transmissionScale,
        nativeTextures:rows.filter(a=>a.kind==='texture').length,nativeRenderbuffers:rows.filter(a=>a.kind==='renderbuffer').length,
        native:Object.fromEntries(['texture','renderbuffer'].map(kind=>[kind,{created:sample.allocations.filter(a=>a.kind===kind).length,deleted:sample.allocations.filter(a=>a.kind===kind&&a.deleted!==undefined).length,live:rows.filter(a=>a.kind===kind).length}])),
        transmission:rows.filter(a=>a.kind==='texture'&&a.type===1016&&sample.targets[a.target]?.samples>=4).map(a=>({id:a.id,width:a.width,height:a.height,phase:a.phase,target:a.target,owner:sample.targets[a.target]})),
        allocated:sample.allocations.length,deleted:sample.allocations.filter(a=>a.deleted!==undefined).length};};
      return {cycle:row.cycle,prepared:row.prepared&&count(row.prepared),gameplay:count(row.gameplay),menu:count(row.menu)};
    })};
  if(entry.lifecycle&&!capture.failure){
    assert.deepEqual(entry.lifecycle.errors,[]);
    const first=entry.lifecycle.cycles[0];
    for(const row of entry.lifecycle.cycles){
      assert.equal(row.gameplay.memory.textures,first.gameplay.memory.textures);
      assert.equal(row.gameplay.memory.programs,first.gameplay.memory.programs);
      assert.deepEqual(row.menu.memory,first.menu.memory);
      for(const key of ['nativeTextures','nativeRenderbuffers'])assert.equal(row.menu[key],first.menu[key]);
      assert.equal(row.prepared.transmission.length,1);assert.equal(row.menu.transmission.length,1);
      assert.deepEqual(row.prepared.transmission.map(t=>t.id),row.gameplay.transmission.map(t=>t.id));
      assert.deepEqual(row.prepared.transmission.map(t=>t.id),row.menu.transmission.map(t=>t.id));
      const target=row.prepared.transmission[0];
      assert.deepEqual([target.width,target.height],row.prepared.drawingBuffer.map(n=>n*row.prepared.transmissionScale));
    }
    entry.lifecycle.plateauAndTargetOwnershipVerified=true;
  }
  evidence.captures.push(entry);
  for(const pass of [1,2]){
    const rows=entry.runs.filter(r=>r.pass===pass&&r.level===1);if(rows.length)console.log(file,pass,JSON.stringify({ready:stats(rows.map(r=>r.readyMs)),post:stats(rows.map(r=>r.postFilmMs)),control:stats(rows.map(r=>r.controlMs)),movie:stats(rows.map(r=>r.film.durationMs)),gap:stats(rows.map(r=>r.film.rafGap?.max)),heap:stats(rows.map(r=>r.mainHeapPeak))}));
  }
}
await writeFile(output,JSON.stringify(evidence,null,2)+'\n');
