import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ExterminatorRamHull } from '../../../src/boss/ExterminatorRamHull.ts';
import { FinalBossPresentation } from '../../../src/boss/FinalBossPresentation.ts';
import { FINAL_BOSS_TUNING as T, FINAL_SPECIMEN_MOVEMENT, FINAL_SPECIMEN_RADIUS } from '../../../src/boss/FinalBossConfig.ts';
import { CollisionWorld } from '../../../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../../../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../../../src/physics/KinematicBody.ts';

const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function fixture(root:THREE.Group) {
  const hull=new ExterminatorRamHull(root);
  return {hull,dispose:()=>{root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});root.clear();}};
}

test('solid triangle contacts use the actual face, edges and vertices, not its bounding rectangle',()=>{
  const root=new THREE.Group(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,4,0,0,0,4,0],3));root.add(new THREE.Mesh(geometry));
  const f=fixture(root);try {
    assert.equal(f.hull.intersectsPlayer(v(1,1,-2),v(1,1,2),.25),true,'continuous face crossing');
    assert.equal(f.hull.intersectsPlayer(v(3.8,3.8,-2),v(3.8,3.8,2),.25),false,'empty corner of the mesh bounding box');
    assert.equal(f.hull.intersectsPlayer(v(1,1,.25),v(1,1,.25),.25),true,'tangent face contact');
    assert.equal(f.hull.intersectsPlayer(v(1,1,.251),v(1,1,.251),.25),false,'a real air gap');
    assert.equal(f.hull.intersectsPlayer(v(2.1,2.1,1),v(2.1,2.1,1),1),false,'outside a diagonal edge');
    assert.equal(f.hull.intersectsPlayer(v(2.1,2.1,1),v(2.1,2.1,1),1.02),true,'grazing a diagonal edge');
  }finally{f.dispose();}
});

test('model holes and space between components stay open, while closed-hull penetration is detected',()=>{
  const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.TorusGeometry(3,.4,12,32)));const f=fixture(root);
  try {
    assert.equal(f.hull.intersectsPlayer(v(0,0,-4),v(0,0,4),.5),false,'the ring hole is not solid');
    assert.equal(f.hull.intersectsPlayer(v(3,0,-4),v(3,0,4),.5),true,'the actual ring is solid');
  }finally{f.dispose();}
  const pair=new THREE.Group();for(const x of [-3,3]){const box=new THREE.Mesh(new THREE.BoxGeometry(2,2,2));box.position.x=x;pair.add(box);}const g=fixture(pair);
  try {
    assert.equal(g.hull.intersectsPlayer(v(0,0,-4),v(0,0,4),.4),false,'do not bridge disconnected components');
    assert.equal(g.hull.intersectsPlayer(v(3,0,0),v(3,0,0),.1),true,'inside solid geometry without touching a surface triangle');
  }finally{g.dispose();}
});

test('fast moving model parts and fast players cannot tunnel between fixed steps',()=>{
  const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));root.position.z=-10;const f=fixture(root);
  try {
    f.hull.capturePreviousPose();root.position.z=10;assert.equal(f.hull.intersectsPlayer(v(),v(),.25),true);
    root.position.z=0;f.hull.reset();f.hull.capturePreviousPose();assert.equal(f.hull.intersectsPlayer(v(0,0,-10),v(0,0,10),.25),true);
    assert.equal(f.hull.intersectsPlayer(v(2,0,-10),v(2,0,10),.25),false);
  }finally{f.dispose();}
});

test('articulated parts sweep their curved rotation rather than just testing two poses or the straight chord',()=>{
  const root=new THREE.Group(),tip=new THREE.Mesh(new THREE.BoxGeometry(1,.2,.2).translate(4,0,0));tip.rotation.z=-Math.PI/4;root.add(tip);const f=fixture(root);
  try {
    f.hull.capturePreviousPose();tip.rotation.z=Math.PI/4;
    assert.equal(f.hull.intersectsPlayer(v(4,0,0),v(4,0,0),.2),true,'the moving tip crosses the player only midway through its arc');
    assert.equal(f.hull.intersectsPlayer(v(5,0,0),v(5,0,0),.2),false,'rotation tolerance must not inflate a clear near miss');
  }finally{f.dispose();}
});

test('hidden proxies, hidden branches and tagged effects never count as solid model contact',()=>{
  const root=new THREE.Group(),proxy=new THREE.Mesh(new THREE.BoxGeometry(20,20,20),new THREE.MeshBasicMaterial({visible:false})),flash=new THREE.Mesh(new THREE.BoxGeometry(20,20,20));flash.userData.contactSolid=false;
  const branch=new THREE.Group(),solid=new THREE.Mesh(new THREE.BoxGeometry(2,2,2));branch.visible=false;branch.add(solid);root.add(proxy,flash,branch);const f=fixture(root);
  try {
    assert.equal(f.hull.intersectsPlayer(v(),v(),.2),false);branch.visible=true;assert.equal(f.hull.intersectsPlayer(v(),v(),.2),true);
    branch.visible=false;assert.equal(f.hull.intersectsPlayer(v(),v(),.2),false);
  }finally{f.dispose();}
});

test('uniform model scale, yaw and reset preserve exact contacts without ghost motion from an earlier encounter',()=>{
  const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(2,2,2)));root.scale.setScalar(3);root.rotation.y=.7;const f=fixture(root);
  try {
    assert.equal(f.hull.intersectsPlayer(v(),v(),.1),true);f.hull.capturePreviousPose();root.position.x=100;f.hull.reset();
    assert.equal(f.hull.intersectsPlayer(v(),v(),.2),false);assert.equal(f.hull.intersectsPlayer(v(100,0,0),v(100,0,0),.2),true);
  }finally{f.dispose();}
});

for(const name of ['armoured-ducted-fan','articulated-rotary-cannon','exterminator-weak-point-core'])test(`the real ${name} surface counts, even away from the old nose sphere`,()=>{
  const p=new FinalBossPresentation();try {
    p.root.visible=true;p.machine.position.set(0,T.ramHeight,0);p.refreshWorldAnchors();
    const group=p.machine.getObjectByName(name)!;let solid:THREE.Mesh|undefined;
    group.traverse(o=>{if(!solid&&o instanceof THREE.Mesh&&o.userData.contactSolid!==false&& !Array.isArray(o.material)&&o.material.visible)solid=o;});
    assert.ok(solid);const geometry=solid.geometry,attribute=geometry.getAttribute('position'),index=geometry.index;
    const a=v().fromBufferAttribute(attribute,index?index.getX(0):0),b=v().fromBufferAttribute(attribute,index?index.getX(1):1),c=v().fromBufferAttribute(attribute,index?index.getX(2):2);
    const point=a.add(b).add(c).multiplyScalar(1/3).applyMatrix4(solid.matrixWorld);
    p.ramHull.capturePreviousPose();assert.equal(p.ramHull.intersectsPlayer(point,point,.2),true);
    assert.ok(p.ramHull.widthMetres>48,'warning includes the side turbines rather than just the nose');
  }finally{p.dispose();}
});

for(const side of [-1,1])test(`a real full-charge jump clears the ${side<0?'left':'right'} outer turbine path, while a lower jump actually clips it`,()=>{
  const p=new FinalBossPresentation(),world=new CollisionWorld(),surfaces=new SurfaceRegistry(),floor=new THREE.Mesh(new THREE.BoxGeometry(300,.8,300));
  world.register(floor);surfaces.register(floor);p.root.visible=true;
  const body=new KinematicBody({world,surfaces,initialPosition:v(side*22,2.07,0),config:FINAL_SPECIMEN_MOVEMENT}),zero=v();
  const simulate=(charged:boolean)=>{
    body.recoverAt(v(side*22,2.07,0));for(let i=0;i<5;i++)body.update(1/60,zero);
    const held=charged?22:12;for(let i=0;i<held;i++)body.update(1/60,zero,{pressed:i===0,held:true,released:false,cancelled:false});
    body.update(1/60,zero,{pressed:false,held:false,released:true,cancelled:false});
    const timing=body.lastJumpSpeedMetresPerSecond/FINAL_SPECIMEN_MOVEMENT.gravityMetresPerSecondSquared-1/60;
    p.machine.rotation.set(0,0,0);p.machine.position.set(0,T.ramHeight,-150*timing);p.refreshWorldAnchors();p.ramHull.reset();
    let contact=false,peak=body.position.y;
    // Same geometry/scale and a late-RAM speed. Pass the whole model across
    // the real body near its jump apex, without any airborne immunity flag.
    for(let i=1;i<=108;i++) {
      p.ramHull.capturePreviousPose();body.update(1/60,zero);peak=Math.max(peak,body.position.y);
      p.machine.position.z=150*(i/60-timing);p.refreshWorldAnchors();
      contact ||= p.ramHull.intersectsPlayer(body.previousPosition,body.position,FINAL_SPECIMEN_RADIUS);
    }return {contact,peak};
  };
  try {
    const low=simulate(false),high=simulate(true);assert.equal(low.contact,true,'the model must hurt an airborne player who clips the fan');
    assert.equal(high.contact,false,'genuine air clearance above the model must stay safe');assert.ok(high.peak>13&&high.peak<14);
    p.machine.position.z=0;p.refreshWorldAnchors();p.ramHull.capturePreviousPose();
    assert.equal(p.ramHull.intersectsPlayer(v(0,high.peak,0),v(0,high.peak,0),FINAL_SPECIMEN_RADIUS),true,'jumping into the taller central hull is not airborne immunity');
  }finally{p.dispose();world.clear();surfaces.clear();floor.geometry.dispose();(floor.material as THREE.Material).dispose();}
});
