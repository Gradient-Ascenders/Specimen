import * as THREE from 'three';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { FinalBossReadModel } from './FinalBossController.ts';
import { FINAL_ARENA, FINAL_SPECIMEN_RADIUS } from './FinalBossConfig.ts';

/** Shared geometries/materials and fixed pools: no allocations per shot/phase. */
export class FinalBossPresentation {
  readonly root=new THREE.Group();
  readonly machine=new THREE.Group();
  readonly core:THREE.Mesh;
  readonly armour:THREE.Mesh;
  readonly specimen:THREE.Mesh;
  readonly beam:THREE.Mesh;
  readonly shockwave:THREE.Mesh;
  readonly targetMarker:THREE.Mesh;
  readonly finalShot:THREE.Mesh;
  readonly explosion:THREE.Mesh;
  readonly coreWorld=new THREE.Vector3();
  private readonly petals:THREE.Group[]=[];
  private readonly rotors:THREE.Mesh[]=[];
  private readonly wings:THREE.Mesh[]=[];
  private readonly geometry=new Set<THREE.BufferGeometry>();
  private readonly material=new Set<THREE.Material>();
  private readonly steel=this.standard(0x16222e,.65,.7);
  private readonly plate=this.standard(0x344551,.55,.6);
  private readonly glow=new THREE.MeshBasicMaterial({color:0x36e7e4});
  private readonly danger=new THREE.MeshBasicMaterial({color:0xff4256});
  private readonly beamMaterial=new THREE.MeshBasicMaterial({color:0xff3251,transparent:true,opacity:.85,depthWrite:false});
  private readonly blastMaterial=new THREE.MeshBasicMaterial({color:0x93ffe3,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  private readonly coreShader:THREE.ShaderMaterial;
  private readonly slimeShader:THREE.ShaderMaterial;
  private readonly particles:THREE.InstancedMesh;
  private readonly particleSlots=Array.from({length:64},()=>({age:9,life:0,position:new THREE.Vector3(),velocity:new THREE.Vector3(),size:.1}));
  private particleCursor=0;
  private readonly dummy=new THREE.Object3D();
  private readonly direction=new THREE.Vector3();
  private readonly up=new THREE.Vector3(0,1,0);
  private readonly eyes:THREE.Group;
  private heading=Math.PI;
  private lastTime=0;
  private disposed=false;

  constructor() {
    this.root.name='extermination-boss-presentation';this.machine.name='exterminator-mechanical-hierarchy';
    this.material.add(this.glow);this.material.add(this.danger);this.material.add(this.beamMaterial);this.material.add(this.blastMaterial);
    this.root.add(this.machine);this.machine.position.set(0,9,FINAL_ARENA.centreZ);
    this.armour=this.box([6.5,3,4.5],[0,0,0],this.steel,this.machine);
    this.armour.name='exterminator-armoured-hub';
    this.box([7,.5,5],[0,1.65,0],this.plate,this.machine);
    this.coreShader=this.shader(false);this.slimeShader=this.shader(true);
    this.core=new THREE.Mesh(this.geom(new THREE.SphereGeometry(1.35,24,16)),this.coreShader);
    this.core.name='exterminator-weak-point-core';this.core.position.set(0,-.1,-2.9);this.machine.add(this.core);
    const collar=new THREE.Mesh(this.geom(new THREE.TorusGeometry(1.6,.25,8,32)),this.plate);
    collar.position.copy(this.core.position);this.machine.add(collar);
    for(let i=0;i<4;i++) {
      const pivot=new THREE.Group();pivot.position.copy(this.core.position);pivot.rotation.z=i*Math.PI/2;
      this.box([1.8,1.1,.4],[0,.64,-.8],this.plate,pivot);this.petals.push(pivot);this.machine.add(pivot);
    }
    for(const side of [-1,1]) {
      this.wings.push(this.box([1.9,2.3,3.9],[side*4.1,.2,.3],this.plate,this.machine));
      this.box([.25,.6,3],[side*5.08,.2,.3],this.glow,this.machine);
      this.box([1,1,4],[side*3.4,-1.4,-1.3],this.steel,this.machine);
      const muzzle=new THREE.Mesh(this.geom(new THREE.CylinderGeometry(.42,.5,.3,12)),this.danger);
      muzzle.rotation.x=Math.PI/2;muzzle.position.set(side*3.4,-1.4,-3.35);this.machine.add(muzzle);
      const turbine=new THREE.Mesh(this.geom(new THREE.TorusGeometry(.95,.22,6,16)),this.glow);
      turbine.rotation.x=Math.PI/2;turbine.position.set(side*3.3,-1.8,1);this.rotors.push(turbine);this.machine.add(turbine);
      for(let i=0;i<3;i++)this.box([.65,.2,1.1],[side*(2.1+i*.65),1.95,1.1],this.steel,this.machine);
      this.box([1.5,.7,1.4],[side*2,-1.9,2.2],this.steel,this.machine); // deployment bays
    }
    const antenna=new THREE.Mesh(this.geom(new THREE.CylinderGeometry(.05,.12,1.6,6)),this.plate);
    antenna.position.set(0,2.5,1);this.machine.add(antenna);
    this.beam=new THREE.Mesh(this.geom(new THREE.CylinderGeometry(1,1,1,8)),this.beamMaterial);
    this.beam.name='exterminator-authoritative-beam';this.beam.visible=false;this.root.add(this.beam);
    this.shockwave=new THREE.Mesh(this.geom(new THREE.RingGeometry(.96,1,64)),this.danger);
    this.shockwave.rotation.x=-Math.PI/2;this.shockwave.position.set(0,.5,FINAL_ARENA.centreZ);this.shockwave.visible=false;this.root.add(this.shockwave);
    this.targetMarker=new THREE.Mesh(this.geom(new THREE.RingGeometry(1.65,1.9,32)),this.danger);
    this.targetMarker.rotation.x=-Math.PI/2;this.targetMarker.visible=false;this.root.add(this.targetMarker);
    this.finalShot=new THREE.Mesh(this.geom(new THREE.IcosahedronGeometry(1,2)),this.glow);this.finalShot.visible=false;this.root.add(this.finalShot);
    this.explosion=new THREE.Mesh(this.geom(new THREE.SphereGeometry(1,18,12)),this.blastMaterial);this.explosion.visible=false;this.root.add(this.explosion);
    // A readable fused silhouette: Bob's body/antenna, Goop fins, Volt's core.
    const r=FINAL_SPECIMEN_RADIUS;
    const profile=new THREE.SplineCurve([[0,-r],[1.1,-r],[1.58,-1.5],[1.64,-1.15],[1.5,-.6],[1.2,.2],[.75,.95],[.2,1.4],[0,1.45]].map(([x,y])=>new THREE.Vector2(x,y)));
    this.specimen=new THREE.Mesh(this.geom(new THREE.LatheGeometry(profile.getPoints(32),32)),this.slimeShader);
    this.specimen.name='merged-bob-goop-volt';this.specimen.visible=false;
    const top=new THREE.Mesh(this.geom(new THREE.TorusGeometry(.46,.18,8,14,Math.PI*1.4)),this.slimeShader);
    top.position.set(.2,1.6,0);top.rotation.z=-.5;this.specimen.add(top);
    const tip=new THREE.Mesh(this.geom(new THREE.SphereGeometry(.32,12,8)),this.slimeShader);tip.position.set(.58,1.92,0);this.specimen.add(tip);
    for(const side of [-1,1]) {
      const fin=new THREE.Mesh(this.geom(new THREE.ConeGeometry(.32,1.4,7)),this.slimeShader);
      fin.position.set(side*1.25,.5,.3);fin.rotation.z=side*-.5;this.specimen.add(fin);
    }
    const black=this.standard(0x02101b,.15,.2);this.eyes=new THREE.Group();
    for(const x of [-.48,.48]) {
      const eye=new THREE.Mesh(this.geom(new THREE.SphereGeometry(.24,12,10)),black);eye.scale.set(.78,1.4,.4);eye.position.set(x,.2,-1.43);this.eyes.add(eye);
    }
    this.specimen.add(this.eyes);
    this.particles=new THREE.InstancedMesh(this.geom(new THREE.IcosahedronGeometry(1,0)),this.glow,64);
    this.particles.frustumCulled=false;this.particles.count=0;this.root.add(this.particles);
  }
  update(model:FinalBossReadModel,time:number,body:KinematicBody):void {
    const dt=Math.min(.1,Math.max(0,time-this.lastTime));this.lastTime=time;
    this.root.visible=model.state!=='idle';
    this.machine.visible=true;this.finalShot.visible=false;this.explosion.visible=false;
    this.machine.position.set(Math.sin(time*.3)*1.7,9+Math.sin(time*1.4)*.35,FINAL_ARENA.centreZ+Math.cos(time*.3)*1.3);
    this.machine.rotation.set(0,Math.atan2(this.machine.position.x-body.position.x,this.machine.position.z-body.position.z),Math.sin(time)*.025);
    if(model.state==='intro')this.machine.position.y=THREE.MathUtils.lerp(23,9,THREE.MathUtils.smoothstep(model.progress,.2,.8));
    if(model.state==='defeated'||model.state==='escape'||model.state==='complete') {
      const p=model.state==='defeated'?THREE.MathUtils.smoothstep(model.progress,.25,.85):1;
      this.machine.position.set(0,THREE.MathUtils.lerp(9,2,p),FINAL_ARENA.centreZ+4*p);
      this.machine.rotation.set(p*.8,0,p*.5);
      this.machine.visible=model.state==='defeated'&&model.progress<.68;
    }
    const opening=model.weakPointOpen?1:0;
    for(let i=0;i<4;i++)this.petals[i]!.children[0]!.position.y=THREE.MathUtils.damp(this.petals[i]!.children[0]!.position.y,.64+opening*1.8,12,dt||1/60);
    for(const rotor of this.rotors)rotor.rotation.z=time*5;
    this.coreShader.uniforms.uTime!.value=time;this.coreShader.uniforms.uOpen!.value=opening;
    this.coreShader.uniforms.uHit!.value=Math.max(model.hitFlash*4,model.rejectedFlash*3);
    this.slimeShader.uniforms.uTime!.value=time;this.slimeShader.uniforms.uHit!.value=model.invulnerability>0?.4:0;
    this.glow.color.setHex(model.phase===2?0xff8d37:0x36e7e4);
    const transformation=model.state==='transition'?THREE.MathUtils.smoothstep(model.progress,0,1):model.phase===2?1:0;
    this.wings.forEach((wing,i)=>{const side=i===0?-1:1;wing.position.x=side*(4.1+transformation*.8);wing.rotation.z=side*transformation*.3;});
    const speed=Math.hypot(body.velocity.x,body.velocity.z);
    if(speed>.5) {
      const target=Math.atan2(-body.velocity.x,-body.velocity.z);
      this.heading+=Math.atan2(Math.sin(target-this.heading),Math.cos(target-this.heading))*(1-Math.exp(-12*dt));
    }
    this.specimen.rotation.y=this.heading;
    const squash=body.grounded?1-Math.min(.12,body.chargeFraction*.12):1.1;
    this.specimen.scale.set(1/Math.sqrt(squash),squash,1/Math.sqrt(squash));
    this.specimen.userData.floorOffset=body.grounded?FINAL_SPECIMEN_RADIUS*(squash-1):0;
    this.machine.updateMatrixWorld(true);this.core.getWorldPosition(this.coreWorld);
    if(model.state==='defeated') {
      const p=model.progress;
      if(p>.25&&p<.55) {
        this.finalShot.visible=true;this.finalShot.position.copy(body.position).add(this.direction.set(0,.6,0));
        this.finalShot.scale.setScalar(.2+THREE.MathUtils.smoothstep(p,.25,.45)*1.2);
        this.finalShot.position.lerp(this.coreWorld,THREE.MathUtils.smoothstep(p,.45,.55));
      }
      if(p>=.55) {
        this.explosion.visible=true;this.explosion.position.copy(this.coreWorld);
        const blast=THREE.MathUtils.smoothstep(p,.55,.9);this.explosion.scale.setScalar(1+blast*18);this.blastMaterial.opacity=(1-blast)*.8;
      }
    }
    let count=0;
    for(const slot of this.particleSlots) {
      slot.age+=dt;if(slot.age>=slot.life)continue;
      slot.velocity.y-=dt*4;slot.position.addScaledVector(slot.velocity,dt);
      this.dummy.position.copy(slot.position);this.dummy.scale.setScalar(slot.size*(1-slot.age/slot.life));this.dummy.updateMatrix();this.particles.setMatrixAt(count++,this.dummy.matrix);
    }
    this.particles.count=count;if(count)this.particles.instanceMatrix.needsUpdate=true;
  }
  showBeam(start:THREE.Vector3,end:THREE.Vector3,radius:number,warning:boolean):void {
    this.direction.subVectors(end,start);const length=this.direction.length();
    this.beam.visible=true;this.beam.position.copy(start).addScaledVector(this.direction,.5);
    this.beam.scale.set(radius,length,radius);this.beam.quaternion.setFromUnitVectors(this.up,this.direction.normalize());
    this.beamMaterial.color.setHex(warning?0xffbe53:0xff2548);this.beamMaterial.opacity=warning?.35:.9;
  }
  burst(position:THREE.Vector3,count=12):void {
    for(let i=0;i<count;i++) {
      const slot=this.particleSlots[this.particleCursor++%64]!;slot.age=0;slot.life=.6+i%3*.1;slot.size=.1+i%4*.035;
      slot.position.copy(position);slot.velocity.set(Math.sin(i*2.4)*4,1+i%4,Math.cos(i*2.4)*4);
    }
  }
  reset():void {
    this.heading=Math.PI;this.lastTime=0;this.root.visible=false;
    this.beam.visible=false;this.shockwave.visible=false;this.targetMarker.visible=false;this.finalShot.visible=false;this.explosion.visible=false;
    for(const p of this.particleSlots)p.life=0;this.particles.count=0;
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;
    this.particles.dispose();
    this.root.removeFromParent();this.specimen.removeFromParent();this.root.clear();
    for(const g of this.geometry)g.dispose();for(const m of this.material)m.dispose();
  }
  private geom<T extends THREE.BufferGeometry>(g:T):T {this.geometry.add(g);return g;}
  private standard(color:number,roughness:number,metalness:number):THREE.MeshStandardMaterial {
    const m=new THREE.MeshStandardMaterial({color,roughness,metalness});this.material.add(m);return m;
  }
  private box(size:[number,number,number],position:[number,number,number],material:THREE.Material,parent:THREE.Object3D):THREE.Mesh {
    const mesh=new THREE.Mesh(this.geom(new THREE.BoxGeometry(...size)),material);mesh.position.set(...position);parent.add(mesh);return mesh;
  }
  private shader(slime:boolean):THREE.ShaderMaterial {
    const m=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uOpen:{value:0},uHit:{value:0}},
      vertexShader:'varying vec3 vN; varying vec3 vP; void main(){vN=normalize(normalMatrix*normal);vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 vN,vP;uniform float uTime,uOpen,uHit;
        void main(){float rim=pow(1.-abs(vN.z),2.);float vein=pow(abs(sin(vP.y*5.+vP.x*9.+sin(vP.z*7.)+uTime*3.)),44.);
        vec3 col=${slime?'mix(vec3(.015,.28,.31),vec3(.16,.63,.18),rim*.8)':'mix(vec3(.12,.035,.025),vec3(.2,.95,.8),uOpen)'};
        col+=vec3(.25,.8,.45)*vein*.23+rim*vec3(.08,.32,.34)+uHit*vec3(.8,.7,.6);
        gl_FragColor=vec4(col,1.);}`});this.material.add(m);return m;
  }
}
