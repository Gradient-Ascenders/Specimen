'use strict';
const {Blob}=require('./softbody.js');
const {performance}=require('node:perf_hooks');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const results={runtime:process.version,platform:process.platform,generatedAt:new Date().toISOString(),scope:'Isolated original particle-cage/plane-contact solver; NOT the Specimen collision world or a Gish port.',tests:{},explorations:{},timings:[]};
const snapshot=b=>crypto.createHash('sha256').update(Buffer.from(b.p.buffer)).update(Buffer.from(b.v.buffer)).update(JSON.stringify(b.contacts)).digest('hex');
function run(b,steps,input=()=>({})){let maxVolumeError=0,maxPenetration=0,minHeight=Infinity,maxStrain=0;for(let i=0;i<steps;i++){b.step(input(i));const m=b.metrics();maxVolumeError=Math.max(maxVolumeError,Math.abs(m.volumeRatio-1));maxPenetration=Math.max(maxPenetration,m.penetration);minHeight=Math.min(minHeight,m.height);maxStrain=Math.max(maxStrain,m.maxEdgeStrain);}return {final:b.metrics(),maxVolumeError,maxPenetration,minHeight,maxStrain};}
const traction=new Blob(),frictionless=new Blob({friction:0});
const input=i=>({x:i>60?1:0});
results.tests.traction=run(traction,600,input);results.tests.zeroFriction=run(frictionless,600,input);
assert(traction.centre[0]>15);assert(Math.hypot(frictionless.centre[0],frictionless.centre[2])<1e-7);
const drop=new Blob();drop.reset([0,2,0]);results.tests.drop=run(drop,300);assert(results.tests.drop.maxVolumeError<.02);assert(results.tests.drop.maxPenetration<1e-8);
const noVolume=new Blob();noVolume.reset([0,2,0]);results.explorations.noVolume=run(noVolume,300,()=>({volumeOff:true}));
const reversal=new Blob();run(reversal,240,i=>({x:i>60?1:0}));const startX=reversal.centre[0],startV=reversal.meanV[0];let crossing=null,maxX=startX,firstStepV;
for(let i=0;i<120;i++){reversal.step({x:-1});if(i===0)firstStepV=reversal.meanV[0];maxX=Math.max(maxX,reversal.centre[0]);if(crossing===null&&reversal.meanV[0]<0)crossing=(i+1)/60;}
results.tests.reversal={startVelocity:startV,firstStepVelocity:firstStepV,secondsToReverse:crossing,overshootMetres:maxX-startX,final:reversal.metrics()};assert(firstStepV>0);assert(reversal.meanV[0]<0);
const airborne=new Blob({drag:0,gravity:0});airborne.reset([0,10,0]);results.tests.zeroNetForce=run(airborne,180,()=>({x:1,forceAirMotor:true}));assert(Math.hypot(airborne.centre[0],airborne.centre[1]-10,airborne.centre[2])<1e-7);
const jump=new Blob();run(jump,120);const baseline=jump.centre[1];run(jump,60,()=>({charge:true}));let peak=0;for(let i=0;i<120;i++){jump.step({});peak=Math.max(peak,jump.centre[1]);}results.explorations.compressionRelease={baselineCentreHeight:baseline,peakCentreHeight:peak,peakRise:peak-baseline,note:'Internal compression followed by cross-body stiffening; NOT a calibrated Specimen charged jump.'};
const platform=new Blob({platformSpeed:1});results.tests.movingPlane=run(platform,300);assert(platform.centre[0]>3);
const slope=new Blob({mode:'slope'});results.tests.slope15=run(slope,300,i=>({x:i>60?1:0}));assert(slope.centre[0]>5);
const wall=new Blob({mode:'wall',adhesion:true});run(wall,60);const yStart=wall.centre[1];results.tests.wallWithSurfaceGravity=run(wall,300,()=>({y:1}));results.tests.wallWithSurfaceGravity.climbed=wall.centre[1]-yStart;assert(wall.centre[1]-yStart>5);
const locked=new Blob({mode:'wall',adhesion:true,adhesionBreakForce:1e9});run(locked,60);const ly=locked.centre[1];results.explorations.unbreakableAnchors=run(locked,300,()=>({y:1}));results.explorations.unbreakableAnchors.climbed=locked.centre[1]-ly;
const worldGravityWall=new Blob({mode:'wall',adhesion:true,surfaceGravity:false});results.explorations.worldGravityWall=run(worldGravityWall,360,i=>({y:i>60?1:0}));results.explorations.worldGravityWall.note='This tuning fails to sustain Gish-like wall climbing under world gravity. Successful wall run retains an explicit Specimen-like surface-gravity policy.';
const tape=i=>({x:i<60?0:i<210?1:i<330?-1:0,z:i>=330&&i<450?1:0,charge:i>=450&&i<510});const reset=new Blob();run(reset,600,tape);const hash1=snapshot(reset);reset.reset();run(reset,600,tape);const hash2=snapshot(reset);assert.equal(hash1,hash2);results.tests.reset={exactRepeat:true,stateSha256:hash1};
function cadence(fps){const b=new Blob();let acc=0,ticks=0;for(let f=0;f<6*fps;f++){acc+=1/fps;while(acc+1e-10>=1/60){b.step(tape(ticks++));acc-=1/60;}}return {fps,ticks,hash:snapshot(b)};}
results.tests.renderCadence=[30,60,144].map(cadence);assert(results.tests.renderCadence.every(x=>x.ticks===360&&x.hash===results.tests.renderCadence[0].hash));
for(const [substeps,iterations] of [[1,8],[2,8],[4,8],[8,4]]){const b=new Blob({substeps,iterations});b.reset([0,2,0]);const m=run(b,180);results.explorations[`budget${substeps}x${iterations}`]={substeps,iterations,maxVolumeError:m.maxVolumeError,minHeight:m.minHeight,maxStrain:m.maxStrain,penetration:m.maxPenetration};}
for(const level of [0,1,2]){const b=new Blob({level});for(let i=0;i<120;i++)b.step({x:1});const samples=[];for(let i=0;i<360;i++){const t=performance.now();b.step({x:1});samples.push(performance.now()-t);}samples.sort((a,b)=>a-b);results.timings.push({nodes:b.n,constraints:b.links.length+1,substeps:b.config.substeps,iterations:b.config.iterations,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p50Ms:samples[180],p95Ms:samples[Math.floor(samples.length*.95)],p99Ms:samples[Math.floor(samples.length*.99)],note:'Node wall-clock, shared container, one body, plane-only collision; not a browser or full-game budget.'});}
results.assertionsPassed=true;
fs.writeFileSync(__dirname+'/results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({passed:true,tractionX:results.tests.traction.final.centre[0],frictionlessX:results.tests.zeroFriction.final.centre[0],drop:results.tests.drop,reversal:results.tests.reversal,jump:results.explorations.compressionRelease,wall:results.tests.wallWithSurfaceGravity.climbed,lockedWall:results.explorations.unbreakableAnchors.climbed,timings:results.timings,budgets:Object.keys(results.explorations).filter(x=>x.startsWith('budget')).map(x=>results.explorations[x])},null,2));
