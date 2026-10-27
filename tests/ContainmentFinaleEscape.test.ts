import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {ROOM_FIVE_ESCAPE as L} from '../src/levels/RoomFiveEscapeLayout.ts';
import {CollisionWorld,ColliderTransformMode,CollisionHit} from '../src/physics/CollisionWorld.ts';
import {SurfaceRegistry} from '../src/physics/SurfaceRegistry.ts';
import {KinematicBody} from '../src/physics/KinematicBody.ts';
import {sampleContainmentFinale,CONTAINMENT_FINALE_TIMING as T} from '../src/cinematics/ContainmentFinaleTimeline.ts';
import {ContainmentFinaleVisuals,reinforcementPosition} from '../src/cinematics/ContainmentFinaleVisuals.ts';
import { finaleTime as F } from '../src/cinematics/ContainmentFinaleTiming.ts';
import { reinforcementRevealTime } from '../src/cinematics/ContainmentFinalePursuit.ts';

test('the wall approach and climb have unobstructed camera-to-Bob sightlines past the real platform',()=>{
  const world=new ContainmentLevelScene(()=>{}),origin=new THREE.Vector3(),target=new THREE.Vector3(),direction=new THREE.Vector3();
  const ray=new THREE.Raycaster();world.root.updateMatrixWorld(true);
  try{
    for(let t=F(38);t<F(47);t+=.025){
      const f=sampleContainmentFinale(t);origin.fromArray(f.cameraPosition);target.fromArray(f.bob).y+=.12;
      direction.copy(target).sub(origin);const distance=direction.length();ray.set(origin,direction.normalize());ray.far=distance-.5;
      const hits=ray.intersectObjects(world.roomFive.collisionMeshes,false);
      assert.equal(hits.length,0,`Camera blocked at ${t.toFixed(3)} by ${hits[0]?.object.name}`);
    }
  }finally{world.dispose();}
});

test('Bob does not obstruct the close-up of Goop spotting the vent',()=>{
  const bob=new THREE.Vector3(),goop=new THREE.Vector3(),origin=new THREE.Vector3(),closest=new THREE.Vector3();
  for(let t=T.goopSpotsVent;t<F(68.9);t+=.025){
    const f=sampleContainmentFinale(t);bob.fromArray(f.bob);goop.fromArray(f.goop);origin.fromArray(f.cameraPosition);
    new THREE.Line3(origin,goop).closestPointToPoint(bob,true,closest);
    assert.ok(closest.distanceTo(bob)>.85,'Goop’s decision shot must show his face rather than Bob in the foreground.');
  }
});

for(const includeDevelopmentHelpers of [false,true])test(`the Room 5 wooden vent box is solid, jumpable and matches its visual top (dev ${includeDevelopmentHelpers})`,()=>{
  const scene=new ContainmentLevelScene(()=>{},{includeDevelopmentHelpers}),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  scene.root.updateMatrixWorld(true);world.registerAll(scene.collisionMeshes,undefined,ColliderTransformMode.Static);surfaces.registerAll(scene.collisionMeshes);
  try{
    const box=scene.roomFive.goopVentCover,top=L.coverPosition[1]+L.coverSize[1]/2;
    assert.equal(box.material.visible,true);assert.equal(box.userData.presentationRole,'solid-wooden-vent-cover');
    const bounds=new THREE.Box3().setFromObject(box);assert.ok(Math.abs(bounds.max.y-top)<1e-6);
    const body=new KinematicBody({world,surfaces,initialPosition:new THREE.Vector3(0,75.21,122)}),zero=new THREE.Vector3(),forward=new THREE.Vector3(0,0,1);
    for(let i=0;i<15;i++)body.update(1/60,zero);
    for(let i=0;i<45;i++)body.update(1/60,zero,{pressed:i===0,held:true,released:false});
    body.update(1/60,forward,{pressed:false,held:false,released:true});
    for(let i=0;i<180;i++)body.update(1/60,body.position.z<124.65?forward:zero);
    const sleeve=scene.roomFive.collisionMeshes.find(mesh=>mesh.name==='room-5-prop-escape-sleeve-top')!;
    assert.ok(sleeve,'the solid frame belongs to the visible vent cover assembly');
    assert.equal(body.grounded,true);assert.ok(body.isSupportedBy(box)||body.isSupportedBy(sleeve),'The charged jump lands on the cover or its flush solid frame.');
    assert.ok(Math.abs(body.position.y-body.radiusMetres-top)<.025);
    const hit=new CollisionHit();assert.equal(world.sweepSphere(new THREE.Vector3(0,75.5,123),new THREE.Vector3(0,0,2),.2,hit),true);
    assert.equal(hit.object,box,'The wooden box must also block the front, not only provide an invisible top.');
  }finally{world.clear();surfaces.clear();scene.dispose();}
});

test('the escape uses a small vent, a straight duct and separated, supported slimes before two real dives',()=>{
  let bobCross=0,goopCross=0;
  for(let t=F(70);t<F(81);t+=.01){
    const f=sampleContainmentFinale(t);
    for(const [name,p] of [['bob',f.bob],['goop',f.goop]] as const){
      if(p[2]>125.25&&p[2]<128){
        assert.ok(Math.abs(p[0])+(name==='goop'?.76:.6)<L.ventWidth/2+.01,name+' fits through the vent single-file');
        assert.ok(p[1]+.85<L.floorY+L.ventHeight);
        if(name==='bob'&&!bobCross)bobCross=t;if(name==='goop'&&!goopCross)goopCross=t;
      }
      if(p[2]>128&&t<(name==='bob'?T.bobDive:T.goopDive)){
        assert.ok(Math.abs(p[0])<.1,'The escape continues straight down an airduct.');assert.ok(Math.abs(p[1]-75.21)<1e-8);
      }
    }
    assert.ok(new THREE.Vector3().fromArray(f.bob).distanceTo(new THREE.Vector3().fromArray(f.goop))>1.25,'Heroes must not overlap in the narrow duct.');
  }
  assert.ok(goopCross>T.doorOpen&&bobCross>goopCross+.5);
  assert.equal(sampleContainmentFinale(T.goopSpotsVent).shot,'goop-spots-vent');assert.ok(T.doorShot-T.goopSpotsVent>=1.4);
  assert.ok(sampleContainmentFinale(F(79.3)).goop[1]<L.floorY);assert.ok(sampleContainmentFinale(F(80.5)).bob[1]<L.floorY);
});

test('pursuers split smoothly, avoid each other, and cannot fly into the vent',()=>{
  const h=.001;
  for(let t=F(66.6);t<F(82);t+=.025){
    const positions=[0,1,2].map(i=>reinforcementPosition(t,i));
    for(let i=0;i<3;i++){
      if(t<reinforcementRevealTime(i))continue;
      const p=positions[i],a=reinforcementPosition(t-h,i),b=reinforcementPosition(t+h,i);
      assert.ok(p[2]<124,'No drone crosses the rear wall into the escape duct.');
      assert.ok(Math.hypot(...p.map((v,axis)=>(b[axis]-a[axis])/(2*h)))<11,'No sudden movement surge.');
      for(let j=i+1;j<3;j++)if(t>=reinforcementRevealTime(j))assert.ok(new THREE.Vector3().fromArray(p).distanceTo(new THREE.Vector3().fromArray(positions[j]))>3,'Rotor envelopes must not overlap.');
    }
  }
  assert.ok(2*(.95+.37)>L.ventWidth,'The flying drone rotor span physically exceeds the vent opening.');
});

test('pursuit fire makes visible close calls but never hits either moving slime or continues through the rear wall',async()=>{
  const visuals=new ContainmentFinaleVisuals();
  try{
    for(const job of visuals.preparationJobs())await job.run();
    const closeCalls=visuals.shots.filter(s=>s.nearMiss);
    assert.ok(closeCalls.length>=6);
    for(const shot of visuals.shots.filter(s=>s.pursuer!==undefined)){
      assert.ok(shot.ductNearMiss ? shot.to[2]===L.ductEndZ : shot.to[2]<=125.15);
      const distance=new THREE.Vector3().fromArray(shot.from).distanceTo(new THREE.Vector3().fromArray(reinforcementPosition(shot.t,shot.pursuer!)));
      assert.ok(distance<.001,'Fire follows the moving drone, not its previous/static location.');
      let nearest=Infinity;
      for(let u=0;u<=1;u+=.02){
        const p=new THREE.Vector3().fromArray(shot.from).lerp(new THREE.Vector3().fromArray(shot.to),u),f=sampleContainmentFinale(shot.t+u*shot.duration);
        for(const name of ['bob','goop'] as const){
          const d=p.distanceTo(new THREE.Vector3().fromArray(f[name]));
          assert.ok(d>(name==='goop'?.75:.55),`Pursuit fire at ${shot.t} must not pass through ${name}.`);
          if(name===shot.nearMiss)nearest=Math.min(nearest,d);
        }
      }
      if(shot.nearMiss)assert.ok(nearest<1.5,'Close calls must visibly pass near the running slimes.');
    }
  }finally{visuals.dispose();}
});
