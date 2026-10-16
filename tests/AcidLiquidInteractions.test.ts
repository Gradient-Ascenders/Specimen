import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AcidSurfaceMaterial } from '../src/render/environment/containment/AcidSurfaceMaterial.ts';
import { AcidLiquidInteractions } from '../src/render/environment/containment/AcidLiquidInteractions.ts';

function setup() {
 const material = new AcidSurfaceMaterial();
 const surface = new THREE.Mesh(new THREE.BoxGeometry(12,0.1,12),material);
 surface.position.y=-0.05;
 const contacts = new AcidLiquidInteractions(material,surface);
 const body = {position:new THREE.Vector3(0,2,0),velocity:new THREE.Vector3(0,-8,0),radiusMetres:0.46,lastContactImpactSpeedMetresPerSecond:0};
 const bodies=[body];
 return {material,surface,contacts,body,bodies};
}

test('two-body contact sampler creates local landings and bounded wakes without modifying bodies',()=>{
 const {material,surface,contacts,body,bodies}=setup();
 contacts.update(1/60,bodies);
 body.position.y=0.46;body.velocity.y=0;
 const snapshot=body.position.clone();
 contacts.update(1/60,bodies);
 assert.equal(material.interactionDiagnostics.active,1);
 assert.deepEqual(body.position,snapshot);
 // Capture the exact GPU buffer once, then verify ownership survives repeated events.
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <project_vertex>',fragmentShader:'#include <common>\n#include <map_fragment>'};
 material.onBeforeCompile(shader as never,{} as never);
 const uniforms=shader.uniforms as Record<string,{value:any}>;
 const slots=uniforms.uRipples.value as THREE.Vector4[];
 assert.ok(slots[0].w>1.3,'landing is stronger than the 0.3 movement wake');
 const slotIdentities=[...slots];
 body.velocity.x=2;
 const second={...body,position:new THREE.Vector3(2,0.46,2),velocity:new THREE.Vector3(-2,0,0)};
 bodies.push(second);
 for(let frame=0;frame<180;frame++){
  body.position.x=Math.sin(frame/30);second.position.z=2+Math.sin(frame/20);
  material.update(1/60);contacts.update(1/60,bodies);
 }
 assert.equal(material.interactionDiagnostics.capacity,12);
 assert.ok(material.interactionDiagnostics.emitted>20);
 assert.ok(material.interactionDiagnostics.active<=12);
 slots.forEach((slot,index)=>assert.equal(slot,slotIdentities[index]));
 assert.ok(slots.some(slot=>slot.x===2),'second slime produces its own local events');
 assert.ok(slots.some(slot=>slot.w===0.3));
 material.update(3.3);assert.equal(material.interactionDiagnostics.active,0);
 contacts.reset();assert.equal(material.interactionDiagnostics.active,0);
 surface.geometry.dispose();material.dispose();
});

test('nearby elevated platforms and teleports do not create acid wakes; reset clears contact history',()=>{
 const {material,surface,contacts,body,bodies}=setup();
 body.position.y=1;body.velocity.set(2,0,0);
 for(let i=0;i<20;i++)contacts.update(1/60,bodies);
 assert.equal(material.interactionDiagnostics.emitted,0);
 body.position.set(0,0.46,0);contacts.update(1/60,bodies);
 assert.equal(material.interactionDiagnostics.emitted,1);
 body.position.x=5;contacts.update(1/60,bodies);
 assert.equal(material.interactionDiagnostics.emitted,1);
 contacts.reset();assert.equal(material.interactionDiagnostics.active,0);
 body.position.y=2;contacts.update(1/60,bodies);
 assert.equal(material.interactionDiagnostics.active,0);
 contacts.fallPulse(body);assert.equal(material.interactionDiagnostics.active,1);
 body.position.x=20;contacts.fallPulse(body);
 assert.equal(material.interactionDiagnostics.active,1);
 assert.throws(()=>material.disturb(NaN,0,0,1),/finite/);
 surface.geometry.dispose();material.dispose();
});

test('three stable slots track world-space contact, wakes, takeoff and velocity-scaled landing without reallocating uniforms', () => {
 const {material,surface}=setup();
 const parent=new THREE.Group();parent.position.set(100,5,200);parent.add(surface);
 const contacts=new AcidLiquidInteractions(material,surface,3);
 const bodies=[-2,0,2].map(x=>({position:new THREE.Vector3(100+x,5.46,200+x),velocity:new THREE.Vector3(2,0,0),radiusMetres:.46}));
 const shader={uniforms:{},vertexShader:'',fragmentShader:''};material.onBeforeCompile(shader as never,{} as never);
 const u=shader.uniforms as Record<string,{value:any}>, ripples=u.uRipples.value as THREE.Vector4[];
 const version=material.version,key=material.customProgramCacheKey();
 contacts.update(1/60,bodies);
 assert.equal(material.interactionDiagnostics.emitted,3);
 assert.deepEqual(ripples.slice(0,3).map(v=>[v.x,v.y]),[[98,198],[100,200],[102,202]]);
 assert.ok([...u.uRippleSurfaceY.value].slice(0,3).every(y=>Math.abs(y-5)<1e-6));
 contacts.update(.15,bodies);assert.equal(material.interactionDiagnostics.emitted,6);
 bodies[1].position.y=6;bodies[1].velocity.y=7;contacts.update(1/60,bodies);
 assert.equal(ripples[6].w,.45,'Goop emits a takeoff disturbance at its previous surface contact');
 bodies[1].velocity.y=-10;contacts.update(1/60,bodies);
 bodies[1].position.y=5.46;bodies[1].velocity.y=0;contacts.update(1/60,bodies);
 assert.ok(ripples[7].w>1.5,'landing retains the prior downward velocity');
 bodies[2].position.x+=4;contacts.update(.15,bodies);
 assert.equal(ripples[8].x,98,'only the first body wakes while the third teleports and Goop cools down');
 assert.equal(material.version,version);assert.equal(material.customProgramCacheKey(),key);
 assert.equal(u.uRipples.value,ripples);
 contacts.reset();assert.equal(material.interactionDiagnostics.active,0);
 for(const body of bodies)body.position.y=8;
 contacts.update(.2,bodies);assert.equal(material.interactionDiagnostics.active,0);
 assert.throws(()=>new AcidLiquidInteractions(material,surface,0),/capacity/);
 surface.geometry.dispose();material.dispose();
});

test('projected lethal impacts are bounded and deduplicated against contact and later death steps', () => {
 const {material,surface,body}=setup();
 const contacts=new AcidLiquidInteractions(material,surface,3);
 const bodies=[body];contacts.update(1/60,bodies);
 contacts.fallPulse(body);contacts.fallPulse(body);
 assert.equal(material.interactionDiagnostics.emitted,1);
 body.position.y=.46;contacts.update(.2,bodies);contacts.fallPulse(body);
 assert.equal(material.interactionDiagnostics.emitted,1,'projected lethal contact cannot emit again while dying');
 contacts.reset();contacts.update(1/60,bodies);
 const count=material.interactionDiagnostics.emitted;contacts.fallPulse(body);
 assert.equal(material.interactionDiagnostics.emitted,count,'a direct contact splash already represents the impact');
 contacts.reset();body.position.x=20;contacts.update(.2,bodies);contacts.fallPulse(body);
 assert.equal(material.interactionDiagnostics.active,0);
 surface.geometry.dispose();material.dispose();
});
