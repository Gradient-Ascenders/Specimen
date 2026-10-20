import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { ContainmentFinaleVisuals, ACID_IMPACT_SLOTS, ACID_IMPACT_INSTANCES } from '../src/cinematics/ContainmentFinaleVisuals.ts';
import { sampleContainmentFinale } from '../src/cinematics/ContainmentFinaleTimeline.ts';
import { CONTAINMENT_FINALE_TIMING as T, FINALE_DUCT_TIME_SCALE, finaleTime as F } from '../src/cinematics/ContainmentFinaleTiming.ts';
import { reinforcementPosition, reinforcementRevealTime } from '../src/cinematics/ContainmentFinalePursuit.ts';
import { CollisionWorld, ColliderTransformMode } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';

test('underside impacts are connected rounded wet splats with hanging gravity drips, not thin floating discs', async () => {
  const visuals = new ContainmentFinaleVisuals();
  try {
    for (const job of visuals.preparationJobs()) await job.run();
    visuals.shots.splice(0, visuals.shots.length, {
      t: 30, duration: .5, green: true, from: [0,75,0], to: [0,82,0],
      impact: {normal:[0,-1,0],objectName:'platform-underside'},
    });
    const pool = visuals.root.getObjectByName('finale-pooled-acid-wall-impacts') as THREE.InstancedMesh;
    const material = pool.material as THREE.MeshStandardMaterial;
    assert.equal(material.isMeshStandardMaterial, true);
    assert.ok(material.roughness < .35, 'The contact mass catches existing lighting as wet rounded slime.');
    const geometry = pool.geometry, matrix = new THREE.Matrix4();
    const bounds = () => Array.from({length:pool.count}, (_,i) => {
      pool.getMatrixAt(i,matrix);
      return new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1)).applyMatrix4(matrix);
    });
    visuals.update(sampleContainmentFinale(31.2));
    assert.equal(pool.count, 10, 'One rounded core, five joined lobes and two connected stem/bead pairs.');
    const parts = bounds();
    assert.ok(parts[0].getSize(new THREE.Vector3()).y > .1, 'A curved contact volume replaces the paper-thin strip.');
    for (let i=1;i<parts.length;i++) assert.ok(parts.some((box,j)=>i!==j&&box.intersectsBox(parts[i])), 'Every attached lobe and drip joins the splat.');
    assert.ok(parts.slice(6).some(box=>box.min.y<81.6), 'Underside beads sag under gravity.');
    for (let t=30.5;t<33;t+=.025) {
      visuals.update(sampleContainmentFinale(t));
      assert.equal(pool.geometry,geometry);assert.ok(pool.count<=ACID_IMPACT_SLOTS*ACID_IMPACT_INSTANCES);
    }
    visuals.update(sampleContainmentFinale(33.1));assert.equal(pool.count,0);
  } finally { visuals.dispose(); }
});

test('reinforcements start behind Room 4 and visibly pass through its doorway before splitting', async () => {
  const world = new ContainmentLevelScene(()=>{}), visuals = new ContainmentFinaleVisuals();
  const origin = new THREE.Vector3(), target = new THREE.Vector3(), direction = new THREE.Vector3(), ray = new THREE.Raycaster();
  try {
    for (const job of visuals.preparationJobs()) await job.run();
    world.root.updateMatrixWorld(true);
    for(let index=0;index<3;index++) {
      const reveal=reinforcementRevealTime(index);
      assert.ok(reinforcementPosition(reveal,index)[2]<90,'Visibility begins in the previous room, not inside Room 5.');
      visuals.update(sampleContainmentFinale(reveal-.001));assert.equal(visuals.drones[index+1].root.visible,false);
      let crossed=false;
      for(let t=reveal;t<reveal+2;t+=.02) {
        const p=reinforcementPosition(t,index);visuals.update(sampleContainmentFinale(t));
        if(p[2]<90.9||p[2]>92.1)continue;
        crossed=true;
        const box=new THREE.Box3().setFromObject(visuals.drones[index+1].root);
        assert.ok(box.min.x>7.7&&box.max.x<10.3,'Side-on rotors fit the narrow Room 4 exit.');
        assert.ok(box.min.y>74.75&&box.max.y<78.75,'The craft enters below the doorway header, not through the wall.');
      }
      assert.equal(crossed,true);
    }
    for(let t=T.reinforcements;t<F(67.5);t+=.02) {
      const frame=sampleContainmentFinale(t);origin.fromArray(frame.cameraPosition);target.set(9,76.8,91.5);
      direction.copy(target).sub(origin);ray.set(origin,direction.normalize());ray.far=origin.distanceTo(target)-.1;
      assert.equal(ray.intersectObjects(world.roomFive.collisionMeshes,false).length,0,'The cell/platforms must not obscure the doorway reveal.');
    }
  } finally { visuals.dispose();world.dispose(); }
});

test('the duct run is accelerated without a waiting beat and the final shot barely misses Bob through the real opening', async () => {
  assert.equal(FINALE_DUCT_TIME_SCALE,.6);assert.ok(T.end<83);
  const world=new ContainmentLevelScene(()=>{}),visuals=new ContainmentFinaleVisuals();
  try {
    for (const job of visuals.preparationJobs()) await job.run();
    for(let t=F(75);t<F(79);t+=.01) {
      const a=sampleContainmentFinale(t-.001).bob,b=sampleContainmentFinale(t+.001).bob;
      assert.ok((b[2]-a[2])/.002>1,'Bob keeps running instead of waiting in the duct.');
    }
    const shot=visuals.shots.find(shot=>shot.ductNearMiss)!;assert.ok(shot);
    assert.equal(shot.nearMiss,'bob');assert.ok(Math.abs(shot.t-T.bobDive)<.2);
    let nearest=Infinity;
    for(let i=0;i<=200;i++) {
      const u=i/200,p=new THREE.Vector3().fromArray(shot.from).lerp(new THREE.Vector3().fromArray(shot.to),u);
      const f=sampleContainmentFinale(shot.t+shot.duration*u);
      nearest=Math.min(nearest,p.distanceTo(new THREE.Vector3().fromArray(f.bob)));
      if(p.z>125.2&&p.z<128){assert.ok(Math.abs(p.x)<.8);assert.ok(p.y>74.8&&p.y<76.3);}
      assert.ok(p.distanceTo(new THREE.Vector3().fromArray(f.goop))>1.05);
    }
    assert.ok(nearest>.89&&nearest<1.3,'The round passes just above the diving Bob without clipping him.');
    visuals.root.visible=true;world.root.updateMatrixWorld(true);visuals.root.updateMatrixWorld(true);
    const origin=new THREE.Vector3().fromArray(shot.from),end=new THREE.Vector3().fromArray(shot.to),direction=end.clone().sub(origin);
    const ray=new THREE.Raycaster(origin,direction.normalize(),.1,origin.distanceTo(end)-.02);
    const targets=[...world.roomFive.collisionMeshes.filter(mesh=>mesh!==world.roomFive.goopVentCover),visuals.annex];
    assert.equal(ray.intersectObjects(targets,true).length,0,'The last round threads the open vent and shaft, never a wall or floor.');
    const f=sampleContainmentFinale(shot.t+shot.duration*.77),camera=new THREE.PerspectiveCamera(f.cameraFov,16/9,.08,90);
    camera.position.fromArray(f.cameraPosition);camera.lookAt(new THREE.Vector3().fromArray(f.cameraTarget));camera.updateMatrixWorld(true);
    const projected=origin.lerp(end,.77).project(camera);
    assert.ok(Math.abs(projected.x)<.9&&Math.abs(projected.y)<.75,'The near miss is visible in the dive shot, clear of the black bars.');
  } finally { visuals.dispose();world.dispose(); }
});

for (const includeDevelopmentHelpers of [false,true]) test(`the release is a solid contact button reachable without adhesion, with static collision (dev ${includeDevelopmentHelpers})`,()=>{
  const scene=new ContainmentLevelScene(()=>{},{includeDevelopmentHelpers}),room=scene.roomFive,world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  try {
    scene.root.updateMatrixWorld(true);world.registerAll(scene.collisionMeshes,undefined,ColliderTransformMode.Static);surfaces.registerAll(scene.collisionMeshes);
    assert.equal(room.releaseButton.userData.surfaceTag,'default');assert.equal(room.releaseButton.userData.interactionRole,'goop-release-button');
    assert.equal(scene.root.getObjectByName('room-5-observation-sticky-lever-handle'),undefined);
    const body=new KinematicBody({world,surfaces,initialPosition:new THREE.Vector3(-10,97.95,128.8)}),zero=new THREE.Vector3(),forward=new THREE.Vector3(0,0,1);
    for(let i=0;i<10;i++)body.update(1/60,zero);
    assert.equal(room.isReleaseButtonPressed(body),false);
    let pressed=false;
    for(let i=0;i<120&&!pressed;i++){body.update(1/60,forward);pressed=room.isReleaseButtonPressed(body);}
    assert.equal(pressed,true);assert.equal(body.attached,false);assert.equal(body.grounded,true);
    const matrix=room.releaseButton.matrixWorld.clone(),cap=scene.root.getObjectByName('room-5-observation-release-button-cap')!;
    const rest=cap.position.z;
    room.beginEnding();room.updateEnding(.5);scene.root.updateMatrixWorld(true);
    assert.ok(cap.position.z>rest+.08);assert.ok(room.releaseButton.matrixWorld.equals(matrix));
    assert.equal(room.endingState,'buttonPress');room.finishEnding();room.reset();assert.equal(cap.position.z,rest);
  } finally {world.clear();surfaces.clear();scene.dispose();}
});
