import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Loop } from '../src/core/Loop.ts';
import { CollisionLayer, CollisionWorld, type CollisionBoxCandidate } from '../src/physics/CollisionWorld.ts';
import { SphereBoxSweep } from '../src/physics/SphereBoxSweep.ts';
import { DeformableBody } from '../src/experimental/ground/DeformableBody.ts';
import { ACCEPTED_GROUND_CONFIG } from '../src/experimental/ground/MaterialPresets.ts';
import { IDLE } from '../src/experimental/ground/GroundBody.ts';
import { CageValidity } from '../src/experimental/collision/CageValidity.ts';
import { ConvexSweep, hullsSeparated } from '../src/experimental/collision/ConvexSweep.ts';
import { CageWorldContacts } from '../src/experimental/collision/CageWorldContacts.ts';
import { CollisionLabSession } from '../src/experimental/collision/CollisionLabSession.ts';
import { COLLISION_SCENARIOS } from '../src/experimental/collision/CollisionLabScenes.ts';

const forward={x:1,z:0,coast:false},reverse={x:-1,z:0,coast:false};
function cage(session:CollisionLabSession):DeformableBody {
  assert.ok(session.body instanceof DeformableBody);return session.body;
}
function contacts(body:DeformableBody):CageWorldContacts {
  assert.ok(body.collision instanceof CageWorldContacts);return body.collision;
}

test('batched candidates preserve masks, visibility, registration order and transform invalidation',()=>{
  for(const broadphaseEnabled of [true,false]){
    const world=new CollisionWorld({broadphaseEnabled});
    const meshes=Array.from({length:4},()=>new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));
    meshes.forEach((mesh,i)=>world.register(mesh,i===1?CollisionLayer.CameraObstruction:CollisionLayer.Movement,i===3?'dynamic':'static'));
    meshes[2].visible=false;
    const bounds=new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1));
    const output:CollisionBoxCandidate[]=[];
    const diagnostics=world.getLastSweepDiagnostics();
    world.collectBoxCandidates(bounds,output);
    assert.deepEqual(output.map(c=>c.mesh),[meshes[0],meshes[3]]);
    assert.deepEqual(world.getLastSweepDiagnostics(),diagnostics);
    meshes[0].position.x=20;world.invalidateTransform(meshes[0]);
    meshes[3].position.x=20;
    world.collectBoxCandidates(bounds,output);assert.equal(output.length,0);
    world.collectBoxCandidates(bounds,output,CollisionLayer.CameraObstruction);assert.equal(output[0].mesh,meshes[1]);
    world.collectBoxCandidates(bounds,output,CollisionLayer.None);assert.equal(output.length,0);
    for(const mesh of meshes)mesh.geometry.dispose();
  }
});

test('closed swept triangle catches an interior thin obstacle missed by every node trajectory and both endpoints',()=>{
  const box=new THREE.Box3(new THREE.Vector3(-.005,-.005,-.005),new THREE.Vector3(.005,.005,.005));
  const from=[new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,-1,-1),new THREE.Vector3(0,1,-1)];
  const to=from.map(p=>p.clone().add(new THREE.Vector3(0,0,2)));
  const sweep=new ConvexSweep(),sphere=new SphereBoxSweep();
  assert.equal(sweep.box(from,box,.005),false);assert.equal(sweep.box(to,box,.005),false);
  for(let i=0;i<3;i++)assert.equal(sphere.sweep(box,from[i],to[i].clone().sub(from[i]),.05,new THREE.Vector3()),undefined);
  assert.equal(sweep.box([...from,...to],box,.005),true);
  const apart=from.map(p=>p.clone().add(new THREE.Vector3(4,0,0)));
  assert.equal(hullsSeparated(from,apart,1e-4),true,'coplanar disjoint triangles must not freeze');
  assert.equal(hullsSeparated(from,from,1e-4),false);
});

test('local validity protects inversion and bounds without constraining an ordinary translated cage',()=>{
  const body=new DeformableBody(ACCEPTED_GROUND_CONFIG),validity=new CageValidity(body);
  const start=body.positions.slice(),translated=start.map((x,i)=>x+(i%3===0?.01:0));
  assert.equal(validity.valid(start,translated),true);
  const collapsed=start.map((x,i)=>body.centre[i%3]+(x-body.centre[i%3])*.01);
  assert.equal(validity.valid(start,collapsed),false);assert.equal(validity.reason,'local volume barrier');
  const inverted=start.slice();const [a,b]=body.cage.faces[0];
  for(let k=0;k<3;k++){inverted[a*3+k]=start[b*3+k];inverted[b*3+k]=start[a*3+k];}
  assert.equal(validity.valid(start,inverted),false);
});

test('face-interior collision caused by a constraint correction is resolved through material nodes',()=>{
  const reference=new DeformableBody(ACCEPTED_GROUND_CONFIG);reference.reset([0,2,0]);
  const vertices=reference.cage.faces[0].map(n=>new THREE.Vector3().fromArray(reference.positions,n*3));
  const tri=new THREE.Triangle(...vertices as [THREE.Vector3,THREE.Vector3,THREE.Vector3]);
  const normal=tri.getNormal(new THREE.Vector3()),middle=tri.getMidpoint(new THREE.Vector3());
  const world=new CollisionWorld(),mesh=new THREE.Mesh(new THREE.BoxGeometry(.008,.008,.008));
  mesh.position.copy(middle).addScaledVector(normal,.15);mesh.userData.preciseMovementCorners=true;
  world.register(mesh,CollisionLayer.Movement,'static');
  const collision=new CageWorldContacts(world),body=new DeformableBody(ACCEPTED_GROUND_CONFIG,collision,[0,2,0]);
  const start=body.positions.slice(),delta=normal.clone().multiplyScalar(.3);
  const candidates:CollisionBoxCandidate[]=[];world.collectBoxCandidates(new THREE.Box3().setFromCenterAndSize(mesh.position,new THREE.Vector3(2,2,2)),candidates);
  const box=candidates[0],sphere=new SphereBoxSweep();
  for(let j=0;j<start.length;j+=3)assert.equal(sphere.sweep(box.localBounds,new THREE.Vector3().fromArray(start,j).applyMatrix4(box.inverseWorld),delta,.05,new THREE.Vector3()),undefined);
  collision.beginSubstep(body,1/240,start);collision.project(body,1/240);
  // Simulate an XPBD proposed correction, not a player translation motor.
  for(let j=0;j<body.positions.length;j++)body.positions[j]+=delta.getComponent(j%3);
  collision.project(body,1/240);
  assert.ok(collision.diagnostics.sweptFaceHits>0);assert.ok(collision.diagnostics.correctionHits>0);
  assert.ok([...collision.contacts.values()].some(c=>c.face&&c.weights.filter(w=>w>0).length>1));
  assert.equal(collision.audit(body).surfaceIntersections,0);
  assert.ok(new CageValidity(body).valid(start,body.positions));mesh.geometry.dispose();
});

test('finite flat contact preserves accepted locomotion and zero-friction propulsion proof',()=>{
  const finite=new CollisionLabSession(),plane=new CollisionLabSession(),ice=new CollisionLabSession();
  plane.configure('flat','plane-reference');ice.configure('flat','finite-cage',0);
  try {
    for(let tick=0;tick<180;tick++){
      const input=tick<60?IDLE:forward;
      for(const session of [finite,plane,ice])session.step(input);
      assert.equal(contacts(cage(finite)).diagnostics.limitedUpdates,0,'bounds changed flat-ground motion');
      assert.equal(contacts(cage(finite)).diagnostics.patchLimits,0,'contact fallback changed flat-ground motion');
      assert.ok(Math.hypot(...cage(finite).motorLinearImpulse)<1e-10);
    }
    assert.ok(Math.abs(cage(finite).centre[0]-cage(plane).centre[0])<.04);
    assert.ok(Math.abs(cage(finite).meanVelocity[0]-cage(plane).meanVelocity[0])<.05);
    assert.ok(Math.hypot(cage(ice).centre[0]+4,cage(ice).centre[2])<1e-8);
    assert.deepEqual(cage(finite).config,ACCEPTED_GROUND_CONFIG);
  } finally {finite.dispose();plane.dispose();ice.dispose();}
});

test('finite scenario matrix stays closed and locally valid, including high-speed and XPBD-driven impacts',()=>{
  for(const scenario of COLLISION_SCENARIOS.filter(s=>s.id!=='flat')){
    const session=new CollisionLabSession();session.configure(scenario.id);
    try {
      const body=cage(session),collision=contacts(body),validity=new CageValidity(body);
      let faceHits=0,correctionHits=0,volumeError=0;
      if(['overlap','enclosed'].includes(scenario.id))assert.ok(collision.diagnostics.recoveryDistance>0);
      for(let tick=0;tick<180;tick++){
        session.step(['fast-drop','fast-wall','correction','overlap','enclosed'].includes(scenario.id)?IDLE:forward);
        const audit=collision.audit(body);
        assert.equal(audit.surfaceIntersections,0,`${scenario.id} tick ${tick}: shell crossing`);
        assert.ok(audit.penetration<5e-5,`${scenario.id} tick ${tick}: ${audit.penetration} m penetration`);
        assert.ok(validity.valid(body.positions,body.positions),`${scenario.id}: ${validity.reason}`);
        assert.ok([...body.positions,...body.velocities].every(Number.isFinite));
        faceHits+=collision.diagnostics.sweptFaceHits;correctionHits+=collision.diagnostics.correctionHits;
        volumeError=Math.max(volumeError,Math.abs(body.metrics().volumeRatio-1));
      }
      if(scenario.id==='thin')assert.ok(faceHits>0,'only node collision was exercised');
      if(scenario.id==='correction')assert.ok(correctionHits>0);
      if(scenario.id==='fast-wall')assert.ok(Math.max(...body.positions.filter((_,i)=>i%3===0))<1);
      if(scenario.id==='fast-drop')assert.ok(body.centre[1]>.1&&body.centre[1]<.5);
      assert.ok(volumeError<.08,`${scenario.id}: excessive volume loss ${volumeError}`);
    } finally {session.dispose();}
  }
});

test('finite platform lip releases into a fall and a narrow-gap encounter can be reversed',()=>{
  const session=new CollisionLabSession();
  try {
    session.configure('platforms');for(let tick=0;tick<240;tick++)session.step(forward);
    assert.ok(cage(session).centre[1]<.3,'body pinned to platform lip instead of falling');
    for(const scenario of ['gap','blocked-gap','thin']){
      session.configure(scenario);for(let tick=0;tick<180;tick++)session.step(forward);
      const atWall=cage(session).centre[0];for(let tick=0;tick<120;tick++)session.step(reverse);
      assert.ok(cage(session).centre[0]<atWall-.5,`${scenario}: unable to release and reverse`);
    }
  }finally{session.dispose();}
});

test('collision reset and recorded replay restore geometry, mode, friction and exact material/contact state',()=>{
  const session=new CollisionLabSession();
  try {
    session.configure('thin');session.record();for(let i=0;i<100;i++)session.step(forward);session.stop();
    const tape=session.saved!,expected=JSON.stringify(session.body.snapshot());
    session.configure('flat','plane-reference',0);session.play(tape);
    for(let i=0;i<tape.inputs.length;i++)session.step();
    assert.match(session.result,/EXACT replay match/);assert.equal(JSON.stringify(session.body.snapshot()),expected);
    session.configure('enclosed');const reset=JSON.stringify(session.body.snapshot());
    for(let i=0;i<30;i++)session.step(forward);session.reset();assert.equal(JSON.stringify(session.body.snapshot()),reset);
  }finally{session.dispose();}
});

test('authored side-only panel has no fictitious supporting cap but its broad side remains solid',()=>{
  const world=new CollisionWorld(),mesh=new THREE.Mesh(new THREE.BoxGeometry(.02,1,4));
  mesh.position.y=.5;mesh.userData.movementFaceMode='vertical-sides';mesh.userData.preciseMovementCorners=true;
  world.register(mesh,CollisionLayer.Movement,'static');
  const falling=new DeformableBody(ACCEPTED_GROUND_CONFIG,new CageWorldContacts(world),[0,2,0]);
  for(let i=0;i<90;i++)falling.step(IDLE);
  assert.ok(falling.centre[1]<-2,'side-only panel acquired a supporting cap');
  const side=new DeformableBody({...ACCEPTED_GROUND_CONFIG,gravity:0},new CageWorldContacts(world),[-1,.5,0]);
  for(let j=0;j<side.velocities.length;j+=3)side.velocities[j]=10;
  for(let i=0;i<30;i++)side.step(IDLE);
  assert.ok(Math.max(...side.positions.filter((_,i)=>i%3===0))<0,'broad side was omitted');
  mesh.geometry.dispose();
});

test('finite collision is independent of 30/60/144 Hz rendering schedules',()=>{
  const states=[];
  for(const hz of [30,60,144]){
    const session=new CollisionLabSession();session.configure('fast-wall');
    const host=Object.assign(new EventTarget(),{hidden:false,hasFocus:()=>true});
    const loop=new Loop({document:host as unknown as Document,window:new EventTarget() as Window,
      fixedUpdate:()=>session.step(IDLE),render:()=>{}});
    for(let frame=0;frame<=hz;frame++)loop.tick(frame*1000/hz);
    assert.equal(session.tick,60);states.push(session.body.snapshot());loop.dispose();session.dispose();
  }
  assert.deepEqual(states[0],states[1]);assert.deepEqual(states[1],states[2]);
});
