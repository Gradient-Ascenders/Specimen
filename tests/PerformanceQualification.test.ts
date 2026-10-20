import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fixture} from './helpers/PerformanceQualificationFixture.ts';
import {analyzeRecording,evaluateQualification,distribution} from '../scripts/lib/performance-qualification.mjs';
import {buildManifestPlugin} from '../scripts/lib/build-provenance.mjs';

const setColumn=(f:any,key:string,value:any)=>{const index=f.frameColumns.indexOf(key);for(const row of f.retainedFrames)row[index]=value;};
test('approved synthetic fixtures pass; proposed budgets and missing evidence never qualify',()=>{
  const f=fixture();assert.equal(evaluateQualification(f.intake,f.budgets,f.captures).status,'pass');
  f.budgets.approval.status='proposed';assert.equal(evaluateQualification(f.intake,f.budgets,f.captures).status,'unqualified');
  f.budgets.approval.status='approved';f.captures.pop();
  assert.equal(evaluateQualification(f.intake,f.budgets,f.captures).status,'unqualified');
});
test('missing GPU/memory are null, not zero; supported GPU coverage and budgets are enforced',()=>{
  const f=fixture(),flight=f.captures[0]!.flight;
  let report=analyzeRecording(flight);assert.equal(report.valid,true);assert.equal(report.gpu,null);assert.equal(report.memory,null);
  f.budgets.requireGpuTiming=true;assert.equal(evaluateQualification(f.intake,f.budgets,f.captures).status,'unqualified');
  flight.webgl.gpuTimerQuerySupported=true;assert.equal(analyzeRecording(flight).valid,false);
  setColumn(flight,'gpuStatus','valid');setColumn(flight,'gpuMs',2);
  report=analyzeRecording(flight);assert.equal(report.valid,true);assert.equal(report.gpu.mean,2);
});
for(const [name,mutate] of Object.entries({
  stationary:(f:any)=>{setColumn(f,'activeX',0);},
  camera:(f:any)=>{setColumn(f,'cameraX',0);},
  disabled:(f:any)=>setColumn(f,'inputEnabled',false),
  noInput:(f:any)=>setColumn(f,'inputActive',false),
  unlocked:(f:any)=>setColumn(f,'pointerLocked',false),
  hidden:(f:any)=>setColumn(f,'visible',false),
  blurred:(f:any)=>setColumn(f,'focused',false),
  missingDraw:(f:any)=>setColumn(f,'drawn',false),
  death:(f:any)=>setColumn(f,'gameplayState','bursting'),
  cutscene:(f:any)=>setColumn(f,'cutsceneState','volt-release'),
  boundary:(f:any)=>setColumn(f,'simulationState','boundary'),
  incomplete:(f:any)=>f.retainedFrames.pop(),
  duplicate:(f:any)=>f.retainedFrames[1][0]=1,
  fabricatedGpu:(f:any)=>setColumn(f,'gpuMs',0),
  nonFinite:(f:any)=>setColumn(f,'updateCpuMs',NaN),
  focusGap:(f:any)=>f.summary.simulationTime.unobservedGapMs=1000,
  dirtyBuild:(f:any)=>f.build.dirty=true,
  activeExport:(f:any)=>f.session.recordingActive=true,
  glError:(f:any)=>f.qualification.glError=1280,
  browserError:(f:any)=>f.qualification.errors.push('404 asset'),
  inconsistentClock:(f:any)=>setColumn(f,'fixedSteps',0),
  viewportChange:(f:any)=>f.retainedFrames[3][f.frameColumns.indexOf('effectiveDpr')]=1,
  exportGraphicsMismatch:(f:any)=>{f.viewport.drawingBufferWidth=1280;},
  missingStart:(f:any)=>{f.session.startedAt=null;},
})) test(`invalid capture is rejected: ${name}`,()=>{
  const f=fixture();mutate(f.captures[0]!.flight);
  assert.equal(analyzeRecording(f.captures[0]!.flight).valid,false);
  assert.equal(evaluateQualification(f.intake,f.budgets,f.captures).status,'unqualified');
});
test('a numerically slow valid capture fails approved budgets; all samples are checked',()=>{
  const f=fixture(),flight=f.captures[0]!.flight;
  setColumn(flight,'deltaMs',50);setColumn(flight,'fixedSteps',3);flight.session.durationMs=6000;
  assert.equal(analyzeRecording(flight).valid,true);
  assert.equal(evaluateQualification(f.intake,f.budgets,f.captures).status,'fail');
});
for(const [name,mutate] of Object.entries({
  software:(f:any)=>{f.captures[0].flight.webgl.unmaskedRenderer='ANGLE SwiftShader';},
  unreviewed:(f:any)=>{f.intake.targetReview.status='pending';},
  development:(f:any)=>{f.intake.machine.purpose='development';},
  missingHardware:(f:any)=>{f.intake.machine.driver='';},
  badManifest:(f:any)=>{f.intake.buildManifest.assetHashes={};},
  wrongRoute:(f:any)=>{f.captures[0].scenarioId='l3-platform';},
  duplicateEvidence:(f:any)=>{f.captures[1].sha256=f.captures[0].sha256;},
  duplicateSession:(f:any)=>{f.captures[1].flight.session.startedAt=f.captures[0].flight.session.startedAt;},
  unstabilizedResources:(f:any)=>{for(const c of f.captures)c.flight.qualification.lifecycle[1].resourceSample.stableForMs=1;},
  missingCold:(f:any)=>{for(const c of f.captures)c.cache='browser-warm';},
  missingLoading:(f:any)=>{for(const c of f.captures)c.flight.qualification.lifecycle=[];},
  incompletePage:(f:any)=>{
    const c=structuredClone(f.captures[0]);c.cache='browser-warm';c.file='partial.json';c.sha256='8'.repeat(64);
    c.flight.qualification.pageId='partial';c.flight.qualification.lifecycle=c.flight.qualification.lifecycle.slice(0,1);
    f.captures.push(c);
  },
  incompleteControl:(f:any)=>{for(const c of f.captures)c.flight.qualification.lifecycle[0].controlAtMs=null;},
  missingResource:(f:any)=>{for(const c of f.captures)for(const e of c.flight.qualification.lifecycle)e.resourceSample=null;},
  missingBehaviour:(f:any)=>{f.intake.behaviour.electrical=null;},
})) test(`incomplete qualification remains unqualified: ${name}`,()=>{
  const f=fixture();mutate(f);assert.equal(evaluateQualification(f.intake,f.budgets,f.captures).status,'unqualified');
});
test('stabilized resource increases and loading overruns fail rather than using cold allocation peaks',()=>{
  const f=fixture();
  for(const c of f.captures) {
    c.flight.qualification.lifecycle[3].resourceSample.programs=5;
    c.flight.qualification.lifecycle[0].controlAtMs=2100;
    c.flight.qualification.lifecycle[0].resourceSample.timestampMs=4200;
  }
  const result=evaluateQualification(f.intake,f.budgets,f.captures);
  assert.equal(result.status,'fail');assert.ok(result.checks.some(c=>c.name.endsWith('programsGrowth')&&!c.passed));
});
test('initial loading budgets include navigation and title boot before the Start request',()=>{
  const f=fixture();
  for(const capture of f.captures) {
    const event=capture.flight.qualification.lifecycle.find(e=>e.kind==='initial')!;
    event.requestedAtMs=2000;event.readyAtMs=2010;event.controlAtMs=2020;
    event.resourceSample!.timestampMs=4100;
  }
  const result=evaluateQualification(f.intake,f.budgets,f.captures);
  assert.equal(result.status,'fail');
  assert.ok(result.checks.some(c=>c.name.includes('/initial/') && c.value===2020 && !c.passed));
});
test('quantiles, strict hitches and 1% low ignore unavailable data',()=>{
  assert.equal(distribution([null,undefined,NaN]),null);
  const d=distribution([10,20,30,40]);assert.equal(d.p95,40);assert.equal(d.fps,40);assert.equal(d.onePercentLow,25);
});
test('CLI intake hashes evidence, fails closed on missing files, and manifest hashes nested output',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'specimen-qualification-'));
  try {
    await mkdir(path.join(root,'assets'));await writeFile(path.join(root,'index.html'),'fixture');
    await writeFile(path.join(root,'assets','game.js'),'fixture code');
    const f=fixture();await buildManifestPlugin(f.intake.buildManifest).writeBundle({dir:root});
    const manifest=JSON.parse(await readFile(path.join(root,'build-manifest.json'),'utf8'));
    assert.equal(manifest.assetHashes['assets/game.js'],createHash('sha256').update('fixture code').digest('hex'));
    assert.ok(manifest.assetHashes['index.html']);assert.equal(manifest.assetHashes['build-manifest.json'],undefined);
    const intake={...f.intake,buildManifestFile:'build-manifest.json',captures:[]};
    for(const c of f.captures){await writeFile(path.join(root,c.file),JSON.stringify(c.flight));intake.captures.push({scenarioId:c.scenarioId,cache:c.cache,file:c.file,actionsVerified:true,evidenceFiles:['review.txt']});}
    await writeFile(path.join(root,'review.txt'),'synthetic fixture only');
    await writeFile(path.join(root,'intake.json'),JSON.stringify(intake));await writeFile(path.join(root,'budgets.json'),JSON.stringify(f.budgets));
    const run=()=>spawnSync(process.execPath,['scripts/qualify-performance.mjs',path.join(root,'intake.json'),path.join(root,'budgets.json'),path.join(root,'result.json')],{encoding:'utf8'});
    const first=run();assert.equal(first.status,0,first.stdout+first.stderr);let result=JSON.parse(await readFile(path.join(root,'result.json'),'utf8'));
    assert.equal(result.status,'pass');assert.equal(Object.keys(result.captureHashes).length,7);
    intake.captures[0].file='missing.json';await writeFile(path.join(root,'intake.json'),JSON.stringify(intake));
    assert.equal(run().status,2);result=JSON.parse(await readFile(path.join(root,'result.json'),'utf8'));assert.equal(result.status,'unqualified');
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(tmpdir(),'specimen-qualification-')));
    await rm(root,{recursive:true,force:true});
  }
});
