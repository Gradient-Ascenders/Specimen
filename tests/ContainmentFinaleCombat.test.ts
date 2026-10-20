import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { ContainmentFinaleVisuals, ACID_IMPACT_SLOTS, ACID_IMPACT_INSTANCES } from '../src/cinematics/ContainmentFinaleVisuals.ts';
import { FINALE_GOOP_DODGES } from '../src/cinematics/ContainmentFinaleCombat.ts';
import { FINALE_JUMP_GRAVITY, finaleJumpVelocity } from '../src/cinematics/ContainmentFinaleBobMotion.ts';
import { CONTAINMENT_FINALE_TIMING as T, finaleTime as F } from '../src/cinematics/ContainmentFinaleTiming.ts';
import { sampleContainmentFinale } from '../src/cinematics/ContainmentFinaleTimeline.ts';

test('the centred termination warning lasts three times its old .9 seconds before combat starts',()=>{
  assert.ok(Math.abs(T.combat-T.terminate-2.7)<1e-9);
  for(let t=T.terminate;t<T.combat;t+=.01){
    const f=sampleContainmentFinale(t);
    assert.equal(f.scanStage,'terminate');assert.equal(f.scan,'goop');assert.equal(f.pov,true);
    assert.equal(f.shot,'scan-goop');assert.equal(f.goopAirborne,false);
  }
  assert.equal(sampleContainmentFinale(T.combat).shot,'duel-wide');
  assert.equal(sampleContainmentFinale(T.combat).scanStage,'search');
});

test('Goop makes charged ballistic dodges across the floor while the drone strafes broadly without touching room geometry',()=>{
  const world=new ContainmentLevelScene(()=>{});world.root.updateMatrixWorld(true);
  const boxes=world.roomFive.collisionMeshes.map(mesh=>({name:mesh.name,box:new THREE.Box3().setFromObject(mesh)}));
  const goopBounds=new THREE.Box3(),droneBounds=new THREE.Box3();
  const craftBounds=new THREE.Box3(),craftSize=new THREE.Vector3(2.7,1.7,2.5);
  try{
    assert.equal(FINALE_GOOP_DODGES.length,5);
    for(const jump of FINALE_GOOP_DODGES){
      const t=(jump.start+jump.end)/2,h=.001,f=sampleContainmentFinale(t);
      const before=sampleContainmentFinale(t-h).goop,after=sampleContainmentFinale(t+h).goop;
      assert.equal(f.goopAirborne,true);assert.ok(f.goop[1]>jump.from[1]+1.7);
      assert.ok(Math.abs((after[1]-2*f.goop[1]+before[1])/(h*h)+FINALE_JUMP_GRAVITY)<1e-5);
      const velocity=finaleJumpVelocity(jump,t);
      for(const axis of [0,1,2])assert.ok(Math.abs((after[axis]-before[axis])/(2*h)-velocity[axis])<1e-6);
      const windup=sampleContainmentFinale((jump.chargeStart+jump.start)/2);
      assert.equal(windup.goopCharging,true);assert.ok(windup.goopCharge>0);assert.equal(windup.goopAirborne,false);
      for(const edge of [jump.start,jump.end])assert.ok(new THREE.Vector3().fromArray(sampleContainmentFinale(edge-.00001).goop)
        .distanceTo(new THREE.Vector3().fromArray(sampleContainmentFinale(edge+.00001).goop))<.001,jump.id+' is continuous');
    }
    for(let t=T.combat;t<T.latch;t+=.02){
      const f=sampleContainmentFinale(t),goop=new THREE.Vector3().fromArray(f.goop),drone=new THREE.Vector3().fromArray(f.drone);
      goopBounds.expandByPoint(goop);droneBounds.expandByPoint(drone);
      craftBounds.setFromCenterAndSize(drone,craftSize);
      for(const {box,name} of boxes){
        assert.equal(box.intersectsSphere(new THREE.Sphere(goop,.4)),false,`Goop must not cross ${name} at ${t}`);
        assert.equal(box.intersectsBox(craftBounds),false,`Drone including its rotors must not cross ${name} at ${t}`);
      }
    }
    const goopSize=goopBounds.getSize(new THREE.Vector3()),droneSize=droneBounds.getSize(new THREE.Vector3());
    assert.ok(goopSize.x>8&&goopSize.z>11,'The fight travels around the floor instead of wobbling in place.');
    assert.ok(droneSize.x>10&&droneSize.y>10&&droneSize.z>19,'The drone makes substantial evasive passes.');
    for(const edge of [T.combat,F(54.8),T.cleanShot])assert.ok(new THREE.Vector3().fromArray(sampleContainmentFinale(edge-.00001).goop)
      .distanceTo(new THREE.Vector3().fromArray(sampleContainmentFinale(edge+.00001).goop))<.001,'Combat must join the quiet/clean-shot poses without a snap.');
  }finally{world.dispose();}
});

test('the wider fight stays inside the letterbox and the Goop dodge close-up is not obstructed',()=>{
  const world=new ContainmentLevelScene(()=>{}),camera=new THREE.PerspectiveCamera(74,16/9,.08,90);
  world.root.updateMatrixWorld(true);
  const origin=new THREE.Vector3(),target=new THREE.Vector3(),direction=new THREE.Vector3(),projected=new THREE.Vector3(),ray=new THREE.Raycaster();
  try{
    for(let t=T.combat;t<F(34.2);t+=.025){
      const f=sampleContainmentFinale(t);origin.fromArray(f.cameraPosition);
      camera.position.copy(origin);camera.fov=f.cameraFov;camera.updateProjectionMatrix();camera.lookAt(target.fromArray(f.cameraTarget));camera.updateMatrixWorld(true);
      const actors=f.shot==='duel-wide'?['goop','drone'] as const:['goop'] as const;
      for(const actor of actors){
        projected.fromArray(f[actor]).project(camera);
        assert.ok(Math.abs(projected.x)<.8&&Math.abs(projected.y)<.7,'Both combatants stay clear of the black bars in the wide shot.');
        target.fromArray(f[actor]);direction.copy(target).sub(origin);ray.set(origin,direction.normalize());ray.far=origin.distanceTo(target)-.5;
        assert.equal(ray.intersectObjects(world.roomFive.collisionMeshes,false).length,0,`No obstruction of ${actor} at ${t}.`);
      }
    }
  }finally{world.dispose();}
});

test('acid misses continue to real room surfaces, draw bounded splashes and leave the clean hit intact',async()=>{
  const world=new ContainmentLevelScene(()=>{}),targets=[world.roomFive.art.root,...world.roomFive.collisionMeshes];
  const visuals=new ContainmentFinaleVisuals(targets);
  try{
    for(const job of visuals.preparationJobs())await job.run();
    const misses=visuals.shots.filter(shot=>shot.impact);
    assert.ok(misses.length>=18);
    assert.ok(misses.filter(shot=>Math.abs(shot.impact!.normal[1])<.3).length>=6,'Goop’s misses visibly hit walls, not just the ceiling.');
    const ray=new THREE.Raycaster(),from=new THREE.Vector3(),surface=new THREE.Vector3(),direction=new THREE.Vector3();
    for(const shot of misses){
      assert.ok(shot.duration>.1&&shot.duration<2);
      from.fromArray(shot.from);surface.fromArray(shot.to).addScaledVector(new THREE.Vector3().fromArray(shot.impact!.normal),-.035);
      direction.copy(surface).sub(from);ray.set(from,direction.normalize());ray.near=.12;ray.far=90;
      const hit=ray.intersectObjects(targets,true)[0];assert.ok(hit);
      assert.ok(hit.point.distanceTo(surface)<.001,'A shot must stop at the first actual surface, not behind a platform or through the wall.');
      visuals.update(sampleContainmentFinale(shot.t+shot.duration+.08));
      const pool=visuals.root.getObjectByName('finale-pooled-acid-wall-impacts') as THREE.InstancedMesh;
      assert.ok(pool.count>=7&&pool.count<=ACID_IMPACT_SLOTS*ACID_IMPACT_INSTANCES,'Each hit has a rounded wet splash and gravity drips in one fixed pool.');
    }
    const clean=visuals.shots.find(shot=>shot.t===T.cleanShot)!;
    assert.equal(clean.impact,undefined);assert.ok(Math.abs(clean.t+clean.duration-T.droneHit)<1e-9);
    for(const shot of visuals.shots.filter(shot=>!shot.green&&shot.t<T.latch))for(let u=0;u<=1;u+=.01){
      const p=new THREE.Vector3().fromArray(shot.from).lerp(new THREE.Vector3().fromArray(shot.to),u),frame=sampleContainmentFinale(shot.t+shot.duration*u);
      assert.ok(p.distanceTo(new THREE.Vector3().fromArray(frame.goop))>.9,'The dodges must actually evade the incoming fire, not take visible hits.');
    }
  }finally{visuals.dispose();world.dispose();}
});

test('the open drop uses non-overlapping rim and shaft faces, with no hidden cap in the hole',async()=>{
  const visuals=new ContainmentFinaleVisuals();
  try{
    for(const job of visuals.preparationJobs())await job.run();
    const shell=visuals.annex.getObjectByName('finale-escape-annex-shell') as THREE.InstancedMesh;
    const boxes:THREE.Box3[]=[],matrix=new THREE.Matrix4();
    for(let i=0;i<shell.count;i++){
      shell.getMatrixAt(i,matrix);
      const box=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5)).applyMatrix4(matrix);
      if(box.min.y<75&&box.max.z>137&&box.min.z<140&&Math.abs((box.min.x+box.max.x)/2)<1.5)boxes.push(box);
    }
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)for(const axis of ['x','y','z'] as const){
      const a=boxes[i],b=boxes[j],others=(['x','y','z'] as const).filter(k=>k!==axis);
      const overlap=others.every(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])>.0001);
      if(overlap)for(const face of ['min','max'] as const)assert.ok(Math.abs(a[face][axis]-b[face][axis])>.0001,
        `No duplicate ${face}-${axis} faces around the drop opening.`);
    }
    visuals.root.visible=true;visuals.root.updateMatrixWorld(true);
    for(const x of [-.8,0,.8]){
      const ray=new THREE.Raycaster(new THREE.Vector3(x,75,138.5),new THREE.Vector3(0,-1,0),0,10);
      const hit=ray.intersectObject(visuals.annex,true)[0];assert.ok(hit&&hit.point.y<=68.01,'The shaft stays physically open.');
    }
  }finally{visuals.dispose();}
});
