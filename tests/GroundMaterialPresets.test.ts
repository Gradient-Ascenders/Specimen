import assert from 'node:assert/strict';
import test from 'node:test';
import { DeformableBody } from '../src/experimental/ground/DeformableBody.ts';
import { IDLE } from '../src/experimental/ground/GroundBody.ts';
import { GroundSession, reversalInputs } from '../src/experimental/ground/GroundSession.ts';
import { ACCEPTED_GROUND_REFERENCE_ID, MATERIAL_PRESETS, PREFERRED_MATERIAL_CONFIG, matchingMaterialPreset } from '../src/experimental/ground/MaterialPresets.ts';

/** Same settle/forward/reverse/turn/brake path for every material. */
function materialProbe(body: DeformableBody) {
  let minHeight=Infinity, maxHeight=0, maxWidth=0, maxStrain=0, maxVolumeError=0, maxPenetration=0;
  for (let tick=0; tick<1800; tick++) {
    body.step({x:tick<120?0:tick<600?1:tick<780?-1:0,z:tick>=780&&tick<960?1:0,coast:false});
    const m=body.metrics();
    maxPenetration=Math.max(maxPenetration,m.penetration);
    maxVolumeError=Math.max(maxVolumeError,Math.abs(m.volumeRatio-1));
    if (tick>=120 && tick<960) {
      minHeight=Math.min(minHeight,m.height); maxHeight=Math.max(maxHeight,m.height);
      maxStrain=Math.max(maxStrain,m.maxStrain);
      let minX=Infinity, maxX=-Infinity;
      for (let j=0; j<body.positions.length; j+=3) { minX=Math.min(minX,body.positions[j]); maxX=Math.max(maxX,body.positions[j]); }
      maxWidth=Math.max(maxWidth,maxX-minX+2*body.config.nodeRadius);
    }
  }
  const settled=body.positions.slice();
  for (let i=0; i<120; i++) body.step(IDLE);
  const settledDrift=Math.max(...body.positions.map((x,i)=>Math.abs(x-settled[i])));
  const result={minHeight,maxHeight,maxWidth,maxStrain,maxVolumeError,maxPenetration,settledDrift};
  assert.ok(maxPenetration<1e-8);
  assert.ok(maxVolumeError<.005,`volume drift: ${maxVolumeError}`);
  assert.ok(minHeight>.5 && maxWidth<1.3,`lost cohesion: ${JSON.stringify(result)}`);
  assert.ok(settledDrift<1e-7 && Math.hypot(...body.meanVelocity)<1e-7,'does not settle');
  return result;
}

test('accepted ground reference exactly preserves the human-selected winner and is the initial lab configuration',()=>{
  const reference=PREFERRED_MATERIAL_CONFIG;
  assert.equal(reference.angularSpeed,7.78);
  assert.equal(reference.maxAngularAcceleration,85);
  assert.equal(reference.bondDamping,13);
  assert.equal(reference.edgeCompliance,.0015*13);
  assert.equal(reference.bendCompliance,.015*25.25);
  assert.equal(reference.diameterCompliance,.06*16);
  assert.equal(reference.friction,.9);
  assert.equal(reference.volumeCompliance,.000002);
  const session=new GroundSession();
  assert.deepEqual(session.config,reference);
  assert.equal(matchingMaterialPreset(session.config)?.id,ACCEPTED_GROUND_REFERENCE_ID);
  session.config.edgeCompliance*=2;
  assert.equal(matchingMaterialPreset(session.config),undefined);
  assert.equal(reference.edgeCompliance,.0015*13,'reference mutated through live tuning');
  session.body.dispose();
  for (const preset of MATERIAL_PRESETS) {
    assert.equal(preset.config.angularSpeed,7.78);
    assert.equal(preset.config.maxAngularAcceleration,85);
    assert.equal(preset.config.volumeCompliance,.000002);
    assert.equal(preset.config.friction,.9);
    assert.ok(Object.isFrozen(preset.config));
  }
});

test('material comparisons are retired after human acceptance',()=>{
  assert.equal(MATERIAL_PRESETS.length,1);
  assert.equal(MATERIAL_PRESETS[0].id,ACCEPTED_GROUND_REFERENCE_ID);
  assert.match(MATERIAL_PRESETS[0].name,/Accepted/);
});

test('accepted material stays cohesive, settles, retains traction ablation and replays exactly',()=>{
  for (const preset of MATERIAL_PRESETS) {
    const body=new DeformableBody(preset.config);
    const result=materialProbe(body);
    const state=body.snapshot();body.reset();materialProbe(body);
    assert.deepEqual(body.snapshot(),state,`${preset.id}: reset/replay mismatch`);
    const ice=new DeformableBody({...preset.config,friction:0});
    for (let tick=0; tick<600; tick++) ice.step({x:tick<120?0:1,z:0,coast:false});
    assert.ok(Math.hypot(ice.centre[0],ice.centre[2])<1e-8,`${preset.id}: zero-friction propulsion`);
    console.log('material comparison',JSON.stringify({preset:preset.id,...result}));
  }
});

test('replay restores the accepted material after a friction diagnostic',()=>{
  const session=new GroundSession();
  session.startRecording();
  for (const input of reversalInputs()) session.step(input);
  session.stopRecording();const tape=session.savedTape!;
  session.configure('deformable',{...PREFERRED_MATERIAL_CONFIG,friction:0});
  session.play(tape);
  for (let i=0; i<tape.inputs.length; i++) session.step();
  assert.match(session.replayResult,/EXACT replay match/);
  assert.equal(matchingMaterialPreset(session.config)?.id,ACCEPTED_GROUND_REFERENCE_ID);
  session.body.dispose();
});
