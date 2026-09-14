import assert from 'node:assert/strict';
import test from 'node:test';
import { Loop } from '../src/core/Loop.ts';
import { DeformableBody } from '../src/experimental/ground/DeformableBody.ts';
import { GROUND_STEP, IDLE, type GroundInput } from '../src/experimental/ground/GroundBody.ts';
import { GroundSession, reversalInputs } from '../src/experimental/ground/GroundSession.ts';
import { KinematicGroundBody } from '../src/experimental/ground/KinematicGroundBody.ts';

const forward={x:1,z:0,coast:false};
const reverse={x:-1,z:0,coast:false};
const run=(body: {step(input:GroundInput):void}, ticks:number, input=IDLE) => {
  for(let i=0;i<ticks;i++) body.step(input);
};

test('ground cage topology is a closed oriented 42-node surface with soft internal links',()=>{
  const body=new DeformableBody();
  assert.equal(body.positions.length,42*3);
  assert.equal(body.cage.faces.length,80);
  assert.equal(body.cage.surfaceEdges,120);
  assert.equal(body.cage.links.length,261);
  const directed=new Map<string,number>();
  for(const face of body.cage.faces) for(let i=0;i<3;i++) {
    const a=face[i],b=face[(i+1)%3],key=`${Math.min(a,b)},${Math.max(a,b)}`;
    directed.set(key,(directed.get(key)??0)+(a<b?1:-1));
  }
  assert.equal(directed.size,120);
  assert.ok([...directed.values()].every(balance=>balance===0));
});

test('propulsion disappears at zero friction on both ground axes',()=>{
  const evidence=[];
  for(const input of [forward,{x:0,z:1,coast:false}]) {
    const grip=new DeformableBody(), ice=new DeformableBody({friction:0});
    for(const body of [grip,ice]) {run(body,120);run(body,480,input);}
    const travel=Math.hypot(grip.centre[0],grip.centre[2]);
    const drift=Math.hypot(ice.centre[0],ice.centre[2]);
    assert.ok(travel>15,`insufficient traction: ${travel}`);
    assert.ok(drift<1e-8,`zero-friction propulsion: ${drift}`);
    evidence.push({axis:input.x?'X':'Z',travel,zeroFrictionDrift:drift});
  }
  console.log('ground traction evidence',JSON.stringify(evidence));
});

test('horizontal momentum change is accounted for by contact impulses, with zero-net motor force',()=>{
  const body=new DeformableBody({drag:0});
  run(body,120);
  let maxError=0,maxMotorImpulse=0,totalContactImpulse=0;
  for(let tick=0;tick<240;tick++) {
    const vx=body.meanVelocity[0]; body.step(forward);
    maxError=Math.max(maxError,Math.abs((body.meanVelocity[0]-vx)*body.config.mass-body.groundImpulse[0]));
    maxMotorImpulse=Math.max(maxMotorImpulse,Math.hypot(...body.motorLinearImpulse));
    totalContactImpulse+=body.groundImpulse[0];
  }
  assert.ok(maxError<1e-8,`unaccounted linear momentum: ${maxError}`);
  assert.ok(maxMotorImpulse<1e-10,`motor directly translates: ${maxMotorImpulse}`);
  assert.ok(totalContactImpulse>1);
});

test('free-space diagnostic motor rotates material without moving the mass centre',()=>{
  const body=new DeformableBody({gravity:0,drag:0,motorInAir:true});
  body.reset([0,5,0]);
  run(body,300,forward);
  assert.ok(Math.abs(body.centre[0])<1e-8 && Math.abs(body.centre[2])<1e-8);
  assert.ok(Math.abs(body.centre[1]-5)<1e-8);
  assert.ok(Math.hypot(...body.angularVelocity)>1);
  assert.equal(body.contactCount,0);
});

test('steady travel keeps material moving and loaded patches grip, release and catch',()=>{
  const body=new DeformableBody();
  run(body,120);run(body,240,forward);
  const acquired=body.acquired,released=body.released;
  const original=body.positions.slice();
  const startCentre=[...body.centre];
  const loaded=new Set<number>(),gripped=new Set<number>();
  const heights:number[]=[],speeds:number[]=[],strains:number[]=[];
  let largestAnchorDrift=0;
  for(let tick=0;tick<240;tick++) {
    const before=body.contacts.map(c=>({...c}));
    body.step(forward);
    const m=body.metrics();heights.push(m.height);speeds.push(m.velocity[0]);strains.push(m.maxStrain);
    body.contacts.forEach((c,i)=>{
      if(c.normalLambda>1e-9) loaded.add(i);
      if(c.normalLambda>1e-9&&!c.sliding) {
        gripped.add(i);
        if(before[i].active&&!before[i].sliding&&before[i].acquisitions===c.acquisitions) {
          largestAnchorDrift=Math.max(largestAnchorDrift,Math.hypot(c.anchorX-before[i].anchorX,c.anchorZ-before[i].anchorZ));
        }
      }
    });
  }
  let materialTravel=0;
  for(let j=0;j<original.length;j++) materialTravel+=(body.positions[j]-body.centre[j%3]-(original[j]-startCentre[j%3]))**2;
  const heightRange=Math.max(...heights)-Math.min(...heights);
  const strainRange=Math.max(...strains)-Math.min(...strains);
  assert.ok(body.acquired-acquired>40&&body.released-released>40);
  assert.ok(loaded.size>12&&gripped.size>8);
  assert.ok(materialTravel>1,'material is frozen relative to its centre');
  assert.ok(heightRange>.005&&strainRange>.005,'steady shape is static');
  assert.ok(Math.min(...speeds)>2&&Math.max(...speeds)<4,'not sustained steady travel');
  // A material node can slide in an intermediate substep then grip again;
  // contact lambda limits, rather than a whole-tick label, define that transition.
  console.log('steady travel evidence',JSON.stringify({loadedNodes:loaded.size,grippingNodes:gripped.size,
    catches:body.acquired-acquired,releases:body.released-released,heightRange,strainRange,largestAnchorDrift}));
});

test('each final static contact stays at its anchor and tangential load obeys Coulomb limits',()=>{
  const body=new DeformableBody(); run(body,120);
  let staticSamples=0,slidingSamples=0;
  for(let tick=0;tick<360;tick++) {
    body.step(forward);
    body.contacts.forEach((c,i)=>{
      assert.ok(Math.hypot(c.tangentX,c.tangentZ)<=body.config.friction*c.normalLambda+1e-12);
      if(c.normalLambda>1e-9&&!c.sliding) {
        staticSamples++;
        assert.ok(Math.hypot(body.positions[3*i]-c.anchorX,body.positions[3*i+2]-c.anchorZ)<1e-8);
      }
      if(c.normalLambda>1e-9&&c.sliding) slidingSamples++;
    });
  }
  assert.ok(staticSamples>50&&slidingSamples>50);
});

test('reversal retains body momentum then changes direction; release brakes through contact',()=>{
  const body=new DeformableBody();run(body,120);run(body,240,forward);
  const startX=body.centre[0],speed=body.meanVelocity[0];
  body.step(reverse);
  const firstReverseSpeed=body.meanVelocity[0];
  assert.ok(firstReverseSpeed>speed*.7);
  assert.ok([...body.velocities].filter((_,i)=>i%3===0).some(v=>v>speed),'all material momentum erased');
  let ticks=1;
  while(body.meanVelocity[0]>0&&ticks<120){body.step(reverse);ticks++;}
  const overshoot=body.centre[0]-startX;
  assert.ok(ticks>3&&ticks<90);assert.ok(overshoot>.05);
  run(body,360,IDLE);
  assert.ok(Math.hypot(...body.meanVelocity)<.001);
  console.log('reversal evidence',JSON.stringify({speed,firstReverseSpeed,reversalSeconds:ticks*GROUND_STEP,overshoot}));
});

test('idle settles, ground projection remains valid, and drop deforms without losing volume',()=>{
  const body=new DeformableBody();run(body,1200);
  const settled=[...body.positions];run(body,600);
  assert.ok(Math.max(...body.positions.map((x,i)=>Math.abs(x-settled[i])))<1e-7);
  assert.ok(Math.hypot(...body.meanVelocity)<1e-7);
  body.reset([0,2,0]);let minHeight=Infinity,maxVolumeError=0;
  for(let tick=0;tick<240;tick++) {
    body.step(IDLE); const m=body.metrics();
    assert.ok(m.penetration<1e-8);minHeight=Math.min(minHeight,m.height);
    maxVolumeError=Math.max(maxVolumeError,Math.abs(1-m.volumeRatio));
  }
  assert.ok(minHeight<.8&&minHeight>.5);assert.ok(maxVolumeError<.02);
});

test('zero-friction braking cannot remove horizontal momentum when drag is disabled',()=>{
  const body=new DeformableBody({friction:0,drag:0});run(body,120);
  // Deliberately injected momentum is a test setup, never a gameplay control.
  for(let j=0;j<body.velocities.length;j+=3) body.velocities[j]=2;
  run(body,240,IDLE);
  assert.ok(Math.abs(body.meanVelocity[0]-2)<1e-8);
});

test('reset clears complete solver state and reproduces the same input tape exactly',()=>{
  const body=new DeformableBody();const initial=body.snapshot();
  const tape=reversalInputs();for(const input of tape) body.step(input);
  const result=body.snapshot();body.reset();assert.deepEqual(body.snapshot(),initial);
  for(const input of tape) body.step(input);
  assert.deepEqual(body.snapshot(),result);
});

test('session recording restores controller/config and compares complete cage state',()=>{
  const session=new GroundSession();session.config.friction=.4;session.configure('deformable',session.config);
  session.startRecording();for(const input of reversalInputs())session.step(input);session.stopRecording();
  const tape=session.savedTape!;
  session.configure('kinematic',{...session.config,friction:0});
  session.play(tape);run(session,tape.inputs.length);
  assert.equal(session.kind,'deformable');assert.equal(session.config.friction,.4);
  assert.match(session.replayResult,/EXACT replay match/);
  const final=session.body.snapshot();session.step(forward);assert.deepEqual(session.body.snapshot(),final);
  session.body.dispose();
});

test('actual KinematicBody remains selectable and repeatable on the same flat-floor tape',()=>{
  const body=new KinematicGroundBody();body.reset();
  for(const input of reversalInputs())body.step(input);
  const first=body.snapshot();body.reset();
  for(const input of reversalInputs())body.step(input);
  assert.deepEqual(body.snapshot(),first);
  assert.ok(body.body.grounded);body.dispose();
});

test('30/60/144 Hz render schedules produce identical fixed-tick state',()=>{
  const states=[];
  for(const hz of [30,60,144]) {
    const body=new DeformableBody();const tape=reversalInputs();let tick=0;
    const hostDocument=Object.assign(new EventTarget(),{hidden:false,hasFocus:()=>true});
    const loop=new Loop({document:hostDocument as unknown as Document,window:new EventTarget() as Window,
      fixedUpdate:()=>body.step(tape[tick++]),render:()=>{},
    });
    for(let frame=0;frame<=hz*10;frame++)loop.tick(frame*1000/hz);
    assert.equal(tick,600);states.push(body.snapshot());loop.dispose();
  }
  assert.deepEqual(states[0],states[1]);assert.deepEqual(states[1],states[2]);
});
