import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BlackoutMaintenanceBay, BLACKOUT_BAY_LAYOUT } from '../src/levels/BlackoutMaintenanceBay.ts';
import { BlackoutMaintenanceBayController } from '../src/levels/BlackoutMaintenanceBayController.ts';
import { CollisionWorld, CollisionHit } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';

function setup() {
  const bay=new BlackoutMaintenanceBay(),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  world.registerAll(bay.collisionMeshes);surfaces.registerAll(bay.collisionMeshes);
  const registry=new ElectricalTargetRegistry(world);
  const room=new BlackoutMaintenanceBayController(bay,world,surfaces,registry);
  const body=(x:number)=>new KinematicBody({world,surfaces,initialPosition:new THREE.Vector3(x,.46,2),config:{reboundEnabled:false}});
  const bodies={bob:body(-2),goop:body(0),volt:body(2)};
  return {bay,world,surfaces,registry,room,bodies,dispose(){room.dispose();registry.dispose();bay.dispose();world.clear();surfaces.clear();}};
}

test('maintenance bay acid is safe only for Goop, and electric vent is safe only for Volt',()=>{
  const s=setup();try {
    s.bodies.goop.teleport(new THREE.Vector3(8,-.49,18));
    assert.equal(s.room.update(1/60,s.bodies),undefined);
    s.bodies.bob.teleport(new THREE.Vector3(8,-.49,18));
    assert.equal(s.room.update(1/60,s.bodies),'bob');
    s.bodies.bob.teleport(new THREE.Vector3(-2,.46,2));
    s.bodies.volt.teleport(new THREE.Vector3(8,-.49,18));
    assert.equal(s.room.update(1/60,s.bodies),'volt');
    s.bodies.volt.teleport(new THREE.Vector3(-6,.46,54));
    assert.equal(s.room.update(1/60,s.bodies),undefined);
    s.bodies.goop.teleport(new THREE.Vector3(-6,.46,54));
    assert.equal(s.room.update(1/60,s.bodies),'goop');
  } finally{s.dispose();}
});

test('door requires sustained power and safely holds when a slime occupies its closing path',()=>{
  const s=setup();try{
    s.room.target.setConnectionState(true);
    for(let i=0;i<120;i++)s.room.update(1/60,s.bodies);
    assert.equal(s.room.door.state,'open');
    s.bodies.volt.teleport(new THREE.Vector3(-6,.46,54));
    s.room.update(1/60,s.bodies);
    s.bodies.bob.teleport(new THREE.Vector3(6,.46,54));
    s.room.target.setConnectionState(false);
    for(let i=0;i<120;i++)s.room.update(1/60,s.bodies);
    assert.ok(s.room.door.progress>0,'door must not crush Bob');
    s.bodies.volt.teleport(new THREE.Vector3(6,.46,54));
    s.room.update(1/60,s.bodies);
    s.bodies.bob.teleport(new THREE.Vector3(6,.46,57));
    s.bodies.volt.teleport(new THREE.Vector3(6,.46,62));
    for(let i=0;i<120;i++)s.room.update(1/60,s.bodies);
    assert.equal(s.room.door.state,'closed');
    assert.equal(s.room.complete,false);
    s.bodies.goop.teleport(new THREE.Vector3(7,.46,57));s.room.update(1/60,s.bodies);
    assert.equal(s.room.complete,false,'Bob and Goop alone cannot complete the room');
    s.bodies.volt.teleport(new THREE.Vector3(6,.46,62));s.room.update(1/60,s.bodies);
    assert.equal(s.room.complete,false,'Volt must take his vent route before regrouping');
    s.bodies.volt.teleport(new THREE.Vector3(-6,.46,54));s.room.update(1/60,s.bodies);
    s.bodies.volt.teleport(new THREE.Vector3(6,.46,62));s.room.update(1/60,s.bodies);
    assert.equal(s.room.complete,false,'touching the vent then taking the main door cannot complete');
    s.bodies.volt.teleport(new THREE.Vector3(-6,.46,59.75));s.room.update(1/60,s.bodies);
    s.bodies.volt.teleport(new THREE.Vector3(6,.46,62));s.room.update(1/60,s.bodies);
    assert.equal(s.room.complete,false,'entering the far end from the hall cannot count as traversal');
  }finally{s.dispose();}
});

test('vent traversal cancels on backing out and cannot be completed backwards or across reset',()=>{
  const s=setup();try{
    s.bodies.bob.teleport(new THREE.Vector3(6,.46,57));
    s.bodies.goop.teleport(new THREE.Vector3(7,.46,57));
    const moveVolt=(x:number,z:number)=>{
      s.bodies.volt.teleport(new THREE.Vector3(x,.46,z));
      s.room.update(1/60,s.bodies);
    };
    moveVolt(-6,53);
    moveVolt(-6,54); // Start at the bay entrance.
    moveVolt(-6,53); // Cancel by backing out.
    moveVolt(6,57); // Main door bypass.
    moveVolt(6,62);
    moveVolt(-6,62); // Approach duct from connector.
    moveVolt(-6,59.75);
    moveVolt(-6,61); // Turning around at the outlet still does not count.
    moveVolt(6,62);
    assert.equal(s.room.complete,false);

    moveVolt(-6,62);
    for(let z=60;z>=53;z-=.5)moveVolt(-6,z);
    moveVolt(6,62);
    assert.equal(s.room.complete,false,'walking the duct backwards does not count');

    moveVolt(-6,53);moveVolt(-6,54);
    s.room.reset();
    for(let z=54;z<=61;z+=.5)moveVolt(-6,z);
    moveVolt(6,62);
    assert.equal(s.room.complete,false,'reset clears an in-progress traversal');

    moveVolt(-6,53);
    for(let z=53.5;z<=61;z+=.5)moveVolt(-6,z);
    moveVolt(6,62);
    assert.equal(s.room.complete,true,'a fresh forward traversal succeeds after cancellation/reset');
  }finally{s.dispose();}
});

test('basin is widened and Bob can charge-jump each Room 2 Room 1-sized route gap',()=>{
  const s=setup();try{
    const acid=s.bay.root.getObjectByName('animated-acid-surface') as THREE.Mesh;
    const entry=s.bay.root.getObjectByName('entry-safe-platform') as THREE.Mesh;
    const riser=s.bay.root.getObjectByName('entry-apron-riser-west') as THREE.Mesh;
    assert.ok(acid.geometry.boundingBox);
    acid.geometry.computeBoundingBox();
    const size=acid.geometry.boundingBox!.getSize(new THREE.Vector3());
    assert.ok(size.x>32 && size.z>40,'substantially wider and longer acid pit');
    assert.equal(riser.position.z,7,'the exposed entry apron corners are closed down to the basin base');
    assert.equal(s.bay.root.getObjectByName('entry-apron-riser-east')?.position.z,7);

    const pads=s.bay.collisionMeshes.filter(mesh=>mesh.name.startsWith('bob-route-platform-'));
    assert.equal(pads.length,3,'route uses three generous stepping platforms');
    const centres=pads.map(mesh=>mesh.position.z).sort((a,b)=>a-b);
    assert.deepEqual(centres,[17,28.5,40]);
    assert.ok(centres[1]!-centres[0]!>=11 && centres[2]!-centres[1]!>=11);
    assert.ok(pads[2]!.position.z+pads[2]!.geometry.parameters.depth/2<=44,
      'the third stepping pad ends before the raised exit bank');

    const bob=s.bodies.bob;
    const jumpGap=(startX:number,startY:number,startZ:number,endX:number,endZ:number)=>{
      bob.teleport(new THREE.Vector3(startX,startY,startZ));
      for(let i=0;i<8;i++)bob.update(1/60,new THREE.Vector3());
      assert.equal(bob.grounded,true,'Bob starts each jump on a safe surface');
      const forward=new THREE.Vector3(endX-startX,0,endZ-startZ).normalize();
      for(let i=0;i<42;i++)bob.update(1/60,new THREE.Vector3(),{pressed:i===0,held:true,released:false});
      bob.update(1/60,forward,{pressed:false,held:false,released:true});
      assert.equal(bob.jumpState,'airborne',`charged jump should launch: ${JSON.stringify(bob.velocity)}`);
      let airborne=false;
      for(let i=0;i<90;i++){
        bob.update(1/60,forward);
        if(!bob.grounded)airborne=true;
        else if(airborne)break;
      }
      for(let i=0;i<20;i++)bob.update(1/60,new THREE.Vector3());
      assert.ok(bob.grounded,`Bob should land after jumping ${startZ} to ${endZ}; at ${bob.position.toArray()}`);
      assert.ok(Math.abs(bob.position.x-endX)<2.5 && Math.abs(bob.position.z-endZ)<2.5,
        `Bob should land on the next pad; at ${bob.position.toArray()}, hit=${bob.lastCollisionName}, velocity=${JSON.stringify(bob.velocity)}`);
    };
    jumpGap(-3,.46,8.8,-3,14);
    jumpGap(-.8,.61,20.3,-.6,25.4);
    jumpGap(-.6,.91,31.8,-.5,37);
    jumpGap(-2.5,.61,43.3,-2.5,48.5);
  }finally{s.dispose();}
});

test('Goop can walk out of the basin along the exit ramp without jumping',()=>{
  const s=setup();try{
    const b=s.bodies.goop;b.teleport(new THREE.Vector3(12.4,-.49,41));
    for(let i=0;i<220;i++)b.update(1/60,new THREE.Vector3(0,0,1));
    assert.ok(b.position.z>49,`Goop should reach the far bank along the ramp, stuck at ${b.position.z}`);
    assert.ok(b.position.y>.4);
  }finally{s.dispose();}
});

test('floor-level vent is enclosed, traversable for Volt, and too narrow for the maintenance drone',()=>{
  const s=setup();try{
    const hit=new CollisionHit();
    assert.equal(s.world.sweepSphere(new THREE.Vector3(-6,3.3,62),new THREE.Vector3(0,0,-4),.25,hit),true,
      'the taller connector must not expose the outside above the duct roof');
    assert.equal(s.world.sweepSphere(new THREE.Vector3(-6,5.5,53),new THREE.Vector3(0,0,2),.25,hit),true,
      'the old elevated vent opening is closed');
    assert.equal(s.world.sweepSphere(new THREE.Vector3(-6,1.1,53),new THREE.Vector3(0,0,6),.45,hit),false,
      'the low duct must be a continuous walkable route into the cross hall');
    assert.equal(s.world.sweepSphere(new THREE.Vector3(-6,1.1,53),new THREE.Vector3(0,0,6),.825,hit),true,
      'the narrow duct must continue excluding the maintenance drone');
    assert.equal(s.world.sweepSphere(new THREE.Vector3(-6,1.1,57),new THREE.Vector3(0,2,0),.45,hit),true,
      'the duct ceiling must seal the overhead rather than expose the map');
    assert.equal(s.world.sweepSphere(new THREE.Vector3(-6,1.1,57),new THREE.Vector3(-2,0,0),.45,hit),true,
      'the duct side walls must seal both sides');
    assert.equal(s.world.sweepSphere(new THREE.Vector3(-6,1.1,57),new THREE.Vector3(0,-2,0),.45,hit),true,
      'the duct floor must seal the underside');
    // Walk from the basin through the flush wall opening, duct, and cross hall.
    s.bodies.volt.teleport(new THREE.Vector3(-6,.46,52));
    s.bodies.bob.teleport(new THREE.Vector3(6,.46,57));
    s.bodies.goop.teleport(new THREE.Vector3(7,.46,57));
    for(let i=0;i<240 && s.bodies.volt.position.z<62;i++) {
      s.bodies.volt.update(1/60,new THREE.Vector3(0,0,1));
      s.room.update(1/60,s.bodies);
    }
    assert.ok(s.bodies.volt.position.z>61.5,'Volt can walk from the bay into the cross hall without jumping');
    for(let i=0;i<200 && s.bodies.volt.position.x<6;i++) {
      s.bodies.volt.update(1/60,new THREE.Vector3(1,0,0));
      s.room.update(1/60,s.bodies);
    }
    assert.ok(s.bay.voltExitAt(s.bodies.volt.position));
    assert.equal(s.room.complete,true,'walking the full duct and connector completes the route');
    s.room.reset();s.room.update(1/60,s.bodies);
    assert.equal(s.room.complete,false,'reset clears vent traversal evidence');
  }finally{s.dispose();}
});

test('the powered circuit has clear access from the bay but cannot pass through its walls',()=>{
  const s=setup();try{
    assert.equal(s.room.connectionClear(new THREE.Vector3(-6,3,48)),true);
    assert.equal(s.room.connectionClear(new THREE.Vector3(-18,3,49)),false);
    assert.ok(s.room.receiver.position.distanceTo(new THREE.Vector3(6,.46,BLACKOUT_BAY_LAYOUT.rearZ))>13,
      'the main exit must remain beyond Volt connection break range');
  }finally{s.dispose();}
});

test('hallway fixtures flicker independently and illuminate the enclosed corridor',()=>{
  const s=setup();try{
    const lamps:THREE.PointLight[]=[];
    s.bay.root.traverse(object=>{if(object instanceof THREE.PointLight && object.name.startsWith('hallway-flicker-light')) lamps.push(object);});
    assert.equal(lamps.length,4);
    const observed=new Set<string>();
    let brightest=0;
    for(let i=0;i<180;i++){
      s.bay.update(1/60,false);
      observed.add(lamps.map(lamp=>lamp.intensity.toFixed(2)).join(','));
      brightest=Math.max(brightest,...lamps.map(lamp=>lamp.intensity));
    }
    assert.ok(observed.size>30 && brightest>10);
    const hit=new CollisionHit();
    assert.equal(s.world.sweepSphere(new THREE.Vector3(-6,.5,62),new THREE.Vector3(-3,0,0),.45,hit),true,'connector west end is sealed');
    assert.equal(s.world.sweepSphere(new THREE.Vector3(6,.5,72),new THREE.Vector3(0,0,4),.45,hit),true,'future Room 2 end is sealed');
  }finally{s.dispose();}
});
