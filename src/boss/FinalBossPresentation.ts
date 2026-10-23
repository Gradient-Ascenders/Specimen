import * as THREE from 'three';
import type { SpecimenCharacterPresentation } from '../render/specimen/SpecimenCharacterPresentation.ts';
import { ExterminatorWarDrone } from './ExterminatorWarDrone.ts';
import { ExterminatorRamHull } from './ExterminatorRamHull.ts';
import { initialBeamDirection } from './ExterminatorBeamSweep.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { FinalBossReadModel } from './FinalBossController.ts';
import { FINAL_ARENA, FINAL_ARENA_RING, FINAL_BOSS_TUNING, FINAL_SPECIMEN_RADIUS } from './FinalBossConfig.ts';

/** Shared geometries/materials and fixed pools: no allocations per shot/phase. */
export class FinalBossPresentation {
  readonly root=new THREE.Group();
  readonly machine=new THREE.Group();
  readonly rollRig=new THREE.Group();
  readonly core:THREE.Mesh;
  readonly armour:THREE.Mesh;
  readonly specimen:THREE.Object3D;
  private readonly authoredSpecimen:SpecimenCharacterPresentation|undefined;
  readonly beam:THREE.Mesh;
  readonly beamCore:THREE.Mesh;
  readonly beamImpact:THREE.Mesh;
  readonly shield:THREE.Mesh<THREE.SphereGeometry,THREE.ShaderMaterial>;
  readonly eyeCharge:THREE.Mesh;
  readonly eyeMuzzle=new THREE.Vector3();
  readonly finalShot:THREE.Mesh;
  readonly explosion:THREE.Mesh;
  readonly coreWorld=new THREE.Vector3();
  readonly ramWarning:THREE.Mesh;
  readonly beamWarning:THREE.InstancedMesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
  ramHull:ExterminatorRamHull;
  readonly ramImpact:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
  readonly smoke:THREE.InstancedMesh;
  readonly evasionOffset=new THREE.Vector3();
  evasionRoll=0;
  private readonly warDrone=new ExterminatorWarDrone();
  private readonly geometry=new Set<THREE.BufferGeometry>();
  private readonly material=new Set<THREE.Material>();
  private readonly machineGlow=new THREE.MeshBasicMaterial({color:0xff3044});
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
  private heading=Math.PI;
  private lastTime=0;
  private beamSerial=-1;
  private beamYaw=0;
  private eyeFlash=0;
  private disposed=false;
  private ramSerial=-1;
  private ramStage='';
  private readonly ramStart=new THREE.Vector3();
  private readonly ramEnd=new THREE.Vector3();
  private readonly warningEnd=new THREE.Vector3();
  private ramYaw=0;
  private readonly smokeSlots=Array.from({length:48},()=>({age:9,life:0,position:new THREE.Vector3(),velocity:new THREE.Vector3()}));
  private smokeCursor=0;
  private smokeClock=0;
  private readonly appliedEvasion=new THREE.Vector3();
  private readonly previousBase=new THREE.Vector3();
  private ramImpactAge=1;
  private readonly impactForward=new THREE.Vector3(0,0,1);

  constructor(authoredSpecimen?:SpecimenCharacterPresentation) {
    this.authoredSpecimen=authoredSpecimen;
    this.root.name='extermination-boss-presentation';this.machine.name='exterminator-mechanical-hierarchy';
    this.material.add(this.glow);this.material.add(this.machineGlow);this.material.add(this.danger);this.material.add(this.beamMaterial);this.material.add(this.blastMaterial);
    this.root.add(this.machine);this.machine.position.set(0,FINAL_BOSS_TUNING.hoverY,FINAL_ARENA.centreZ);this.machine.scale.setScalar(FINAL_BOSS_TUNING.scale);
    this.rollRig.name='exterminator-dodge-roll-rig';this.machine.add(this.rollRig);this.rollRig.add(this.warDrone.root);
    // Invisible gameplay proxies are separate from the detailed animated asset.
    const proxy=new THREE.MeshBasicMaterial({visible:false});this.material.add(proxy);
    this.armour=this.box([6.4,3.4,8.7],[0,0,.1],proxy,this.rollRig);
    this.armour.name='exterminator-armour-hit-proxy';
    this.coreShader=this.shader(false);this.slimeShader=this.shader(true);
    const coreGeometry=this.geom(new THREE.SphereGeometry(1.35,32,20));coreGeometry.scale(1,1,.32);
    this.core=new THREE.Mesh(coreGeometry,this.coreShader);
    this.core.name='exterminator-weak-point-core';this.core.position.copy(this.warDrone.coreMount);this.rollRig.add(this.core);
    this.beam=new THREE.Mesh(this.geom(new THREE.CylinderGeometry(1,1,1,8)),this.beamMaterial);
    this.beam.name='exterminator-authoritative-beam';this.beam.visible=false;this.root.add(this.beam);
    this.beamCore=new THREE.Mesh(this.beam.geometry,new THREE.MeshBasicMaterial({color:0xffe3e6,transparent:true,opacity:.95,depthWrite:false}));
    this.material.add(this.beamCore.material as THREE.Material);this.beamCore.visible=false;this.root.add(this.beamCore);
    this.beamImpact=new THREE.Mesh(this.geom(new THREE.SphereGeometry(1,12,8)),this.danger);this.beamImpact.visible=false;this.root.add(this.beamImpact);
    const shieldMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{uTime:{value:0},uHit:{value:0},uHeal:{value:0}},
      vertexShader:'varying vec3 vN,vP;void main(){vN=normalize(normalMatrix*normal);vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 vN,vP;uniform float uTime,uHit,uHeal;void main(){
        float rim=pow(1.-abs(vN.z),2.5);float grid=step(.965,abs(sin(vP.y*42.)))*.65+step(.975,abs(sin(atan(vP.x,vP.z)*27.)))*.35;
        float scan=pow(.5+.5*sin(vP.y*14.-uTime*2.8),16.);
        vec3 col=mix(vec3(.12,.42,1.),vec3(.13,1.,.64),uHeal*.5)+uHit*vec3(.6,.8,1.);
        gl_FragColor=vec4(col,.045+rim*.38+grid*.15+scan*.09+uHit*.18);
      }`});
    this.material.add(shieldMaterial);
    this.shield=new THREE.Mesh(this.geom(new THREE.SphereGeometry(1,40,24)),shieldMaterial);
    this.shield.name='exterminator-defensive-shield';this.shield.scale.setScalar(FINAL_BOSS_TUNING.shieldRadius);this.shield.visible=false;this.root.add(this.shield);
    this.shield.userData.collisionSphereRadius=1;
    this.eyeCharge=new THREE.Mesh(this.geom(new THREE.IcosahedronGeometry(1,2)),this.blastMaterial);this.eyeCharge.visible=false;this.root.add(this.eyeCharge);
    this.finalShot=new THREE.Mesh(this.geom(new THREE.IcosahedronGeometry(1,2)),this.glow);this.finalShot.visible=false;this.root.add(this.finalShot);
    this.explosion=new THREE.Mesh(this.geom(new THREE.SphereGeometry(1,18,12)),this.blastMaterial);this.explosion.visible=false;this.root.add(this.explosion);
    // The level owns the authored gel and its resources. Standalone encounter
    // fixtures retain their procedural fallback.
    if(authoredSpecimen) this.specimen=authoredSpecimen.placement;
    else {
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
    const black=this.standard(0x02101b,.15,.2),eyes=new THREE.Group();
    for(const x of [-.48,.48]) {
      const eye=new THREE.Mesh(this.geom(new THREE.SphereGeometry(.24,12,10)),black);eye.scale.set(.78,1.4,.4);eye.position.set(x,.2,-1.43);eyes.add(eye);
    }
    this.specimen.add(eyes);
    }
    this.particles=new THREE.InstancedMesh(this.geom(new THREE.IcosahedronGeometry(1,0)),this.glow,64);
    this.particles.frustumCulled=false;this.particles.count=0;this.root.add(this.particles);
    const warning=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uCharge:{value:0},uLength:{value:1},
      uCentreZ:{value:FINAL_ARENA.centreZ},uInnerRadius:{value:FINAL_ARENA_RING.innerRadius},uOuterRadius:{value:FINAL_ARENA_RING.outerRadius}},
      vertexShader:'varying vec3 vP;varying vec2 vFloorXZ;void main(){vP=position;vFloorXZ=(modelMatrix*vec4(position,1.)).xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 vP;varying vec2 vFloorXZ;uniform float uTime,uCharge,uLength,uCentreZ,uInnerRadius,uOuterRadius;void main(){
        float floorRadius=distance(vFloorXZ,vec2(0.,uCentreZ));
        if(floorRadius<uInnerRadius||floorRadius>uOuterRadius)discard;
        float chevron=step(.58,fract(vP.z*uLength*.12+abs(vP.x)*1.5-uTime*(1.+uCharge*2.)));
        float edge=step(.46,abs(vP.x));float cap=step(.48,abs(vP.z));
        float pulse=.88+.12*sin(uTime*(5.+uCharge*9.));
        gl_FragColor=vec4(mix(vec3(1.,.22,.025),vec3(1.,.88,.4),max(chevron,max(edge,cap))),(.2+chevron*.26+max(edge,cap)*.45)*pulse);
      }`});this.material.add(warning);
    this.ramWarning=new THREE.Mesh(this.geom(new THREE.BoxGeometry(1,.035,1)),warning);this.ramWarning.name='ram-trajectory-warning';this.ramWarning.visible=false;this.root.add(this.ramWarning);
    const arrow=this.geom(new THREE.BufferGeometry());
    arrow.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-2,-2,0,1.5,0,0,.4,0,0,-2,0,0,.4,2,0,1.5],3));arrow.computeVertexNormals();
    const arrowMaterial=new THREE.MeshBasicMaterial({color:0xffd074,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide});this.material.add(arrowMaterial);
    this.beamWarning=new THREE.InstancedMesh(arrow,arrowMaterial,5);this.beamWarning.name='laser-sweep-direction-warning';this.beamWarning.frustumCulled=false;this.beamWarning.visible=false;this.root.add(this.beamWarning);
    const impactMaterial=new THREE.MeshBasicMaterial({color:0xffd28e,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});this.material.add(impactMaterial);
    this.ramImpact=new THREE.Mesh(this.geom(new THREE.RingGeometry(.78,1,48)),impactMaterial);this.ramImpact.name='ram-wall-shockwave';this.ramImpact.visible=false;this.root.add(this.ramImpact);
    const smokeMaterial=new THREE.MeshBasicMaterial({color:0x26313a,transparent:true,opacity:.27,depthWrite:false});this.material.add(smokeMaterial);
    this.smoke=new THREE.InstancedMesh(this.geom(new THREE.IcosahedronGeometry(1,1)),smokeMaterial,48);this.smoke.name='damaged-boss-engine-smoke';this.smoke.frustumCulled=false;this.smoke.count=0;this.root.add(this.smoke);
    this.ramHull=new ExterminatorRamHull(this.rollRig);
  }
  update(model:FinalBossReadModel,time:number,body:KinematicBody):void {
    const dt=Math.min(.1,Math.max(0,time-this.lastTime));this.lastTime=time;
    this.machine.position.sub(this.appliedEvasion);this.previousBase.copy(this.machine.position);
    this.root.visible=model.state!=='idle';
    this.machine.visible=true;this.finalShot.visible=false;this.explosion.visible=false;
    const speedScale=model.phase===2?1.35:1,beamMove=model.state==='combat'&&model.attack==='laser-beam',ramMove=model.state==='combat'&&model.attack==='ram';
    const defence=model.state==='combat'&&model.shieldActive;
    let targetX=defence||beamMove?0:Math.sin(time*.35*speedScale)*5;
    let targetZ=FINAL_ARENA.centreZ+(defence||beamMove?0:Math.cos(time*.28*speedScale)*3);
    let targetY=defence?FINAL_BOSS_TUNING.defenseHoverY:FINAL_BOSS_TUNING.hoverY+Math.sin(time*1.4)*.5;
    if(beamMove) {
      if(this.beamSerial!==model.attackSerial){this.beamSerial=model.attackSerial;this.beamYaw=Math.atan2(-model.lockedTarget.x,FINAL_ARENA.centreZ-model.lockedTarget.z);}
      const down=model.stage==='telegraph'?THREE.MathUtils.smoothstep(model.progress,0,.82):model.stage==='active'?1:1-THREE.MathUtils.smoothstep(model.progress,0,1);
      targetY=THREE.MathUtils.lerp(FINAL_BOSS_TUNING.hoverY,FINAL_BOSS_TUNING.beamHeight-this.warDrone.coreMount.y*FINAL_BOSS_TUNING.scale,down);
    }
    this.machine.position.x=THREE.MathUtils.damp(this.machine.position.x,targetX,5,dt||1/60);
    this.machine.position.z=THREE.MathUtils.damp(this.machine.position.z,targetZ,5,dt||1/60);
    this.machine.position.y=beamMove?targetY:THREE.MathUtils.damp(this.machine.position.y,targetY,5,dt||1/60);
    const wantedYaw=beamMove?this.beamYaw:Math.atan2(this.machine.position.x-body.position.x,this.machine.position.z-body.position.z);
    this.machine.rotation.y+=Math.atan2(Math.sin(wantedYaw-this.machine.rotation.y),Math.cos(wantedYaw-this.machine.rotation.y))*(1-Math.exp(-7*(dt||1/60)));
    if(beamMove&&model.stage==='active')this.machine.rotation.y=this.beamYaw+model.beamRotationRadians;
    this.machine.rotation.x=beamMove?0:Math.sin(time*.6)*.02;
    this.machine.rotation.z=beamMove?0:Math.sin(time*.75)*.035;
    this.ramWarning.visible=false;
    if(ramMove)this.updateRam(model,body);
    // Apply the evasion offset after the stable base motion, never accumulate
    // it in the damped hover target. The core proxy moves with the real hull.
    this.machine.position.add(this.evasionOffset);this.rollRig.rotation.z=this.evasionRoll;
    this.appliedEvasion.copy(this.evasionOffset);
    if(model.state==='intro')this.machine.position.y=THREE.MathUtils.lerp(FINAL_ARENA.ceilingY-9,FINAL_BOSS_TUNING.hoverY,THREE.MathUtils.smoothstep(model.progress,.2,.8));
    if(model.state==='defeated'||model.state==='escape'||model.state==='complete') {
      const p=model.state==='defeated'?THREE.MathUtils.smoothstep(model.progress,.25,.85):1;
      this.machine.position.set(0,THREE.MathUtils.lerp(FINAL_BOSS_TUNING.hoverY,5,p),FINAL_ARENA.centreZ+8*p);
      this.machine.rotation.set(p*.8,0,p*.5);
      this.machine.visible=model.state==='defeated'&&model.progress<.68;
    }
    const opening=model.weakPointOpen?1:0;
    this.machine.updateMatrixWorld(true);this.warDrone.update(time,model.weakPointOpen,model.phase,dt,model,body.position);
    this.coreShader.uniforms.uTime!.value=time;this.coreShader.uniforms.uOpen!.value=opening;
    this.coreShader.uniforms.uHit!.value=Math.max(model.hitFlash*4,model.rejectedFlash*3);
    this.slimeShader.uniforms.uTime!.value=time;this.slimeShader.uniforms.uHit!.value=model.invulnerability>0?.4:0;
    this.machineGlow.color.setHex(model.phase===2?0xff5b18:0xff3044);
    const speed=Math.hypot(body.velocity.x,body.velocity.z);
    if(speed>.5) {
      const target=Math.atan2(-body.velocity.x,-body.velocity.z);
      this.heading+=Math.atan2(Math.sin(target-this.heading),Math.cos(target-this.heading))*(1-Math.exp(-12*dt));
    }
    if(!this.authoredSpecimen) {
    this.specimen.rotation.y=this.heading;
    const squash=body.grounded?1-Math.min(.12,body.chargeFraction*.12):1.1;
    this.specimen.scale.set(1/Math.sqrt(squash),squash,1/Math.sqrt(squash));
    this.specimen.userData.floorOffset=body.grounded?FINAL_SPECIMEN_RADIUS*(squash-1):0;
    }
    this.machine.updateMatrixWorld(true);this.core.getWorldPosition(this.coreWorld);this.warDrone.copyEyeMuzzle(this.eyeMuzzle);
    this.updateBeamWarning(model,body);
    this.shield.visible=defence;this.shield.position.copy(this.machine.position);this.shield.updateMatrixWorld(true);
    this.shield.material.uniforms.uTime!.value=time;this.shield.material.uniforms.uHit!.value=model.rejectedFlash*3;this.shield.material.uniforms.uHeal!.value=model.regenerating?1:0;
    this.eyeFlash=Math.max(0,this.eyeFlash-dt);
    const orbMove=model.state==='combat'&&model.attack==='laser-shots'&&model.stage!=='recovery';
    const charge=orbMove?(model.stage==='telegraph'?model.progress:(model.elapsed%FINAL_BOSS_TUNING.orbIntervalSeconds)/FINAL_BOSS_TUNING.orbIntervalSeconds):
      (beamMove||ramMove)&&model.stage==='telegraph'?model.progress:0;
    this.eyeCharge.visible=charge>0||this.eyeFlash>0;this.eyeCharge.position.copy(this.eyeMuzzle);this.eyeCharge.scale.setScalar(.2+charge*1.45+this.eyeFlash*5);
    if(model.state!=='defeated')this.blastMaterial.opacity=.25+charge*.55;
    if(model.state==='defeated') {
      const p=model.progress;
      if(p>.25&&p<.55) {
        this.finalShot.visible=true;this.finalShot.position.copy(body.position).add(this.direction.set(0,.6,0));
        this.finalShot.scale.setScalar(.2+THREE.MathUtils.smoothstep(p,.25,.45)*1.2);
        this.finalShot.position.lerp(this.coreWorld,THREE.MathUtils.smoothstep(p,.45,.55));
      }
      if(p>=.55) {
        this.explosion.visible=true;this.explosion.position.copy(this.coreWorld);
        const blast=THREE.MathUtils.smoothstep(p,.55,.9);this.explosion.scale.setScalar(1+blast*36);this.blastMaterial.opacity=(1-blast)*.8;
      }
    }
    let count=0;
    for(const slot of this.particleSlots) {
      slot.age+=dt;if(slot.age>=slot.life)continue;
      slot.velocity.y-=dt*4;slot.position.addScaledVector(slot.velocity,dt);
      this.dummy.position.copy(slot.position);this.dummy.scale.setScalar(slot.size*(1-slot.age/slot.life));this.dummy.updateMatrix();this.particles.setMatrixAt(count++,this.dummy.matrix);
    }
    this.particles.count=count;if(count)this.particles.instanceMatrix.needsUpdate=true;
    this.updateSmoke(model,time,dt);
    this.ramImpactAge=Math.min(1,this.ramImpactAge+dt);
    this.ramImpact.visible=this.ramImpactAge<1;this.ramImpact.scale.setScalar(3+this.ramImpactAge*24);
    this.ramImpact.material.opacity=(1-this.ramImpactAge)**2*.9;
  }
  private updateRam(model:FinalBossReadModel,body:KinematicBody):void {
    if(this.ramSerial!==model.attackSerial||this.ramStage!==model.stage) {
      this.ramSerial=model.attackSerial;this.ramStage=model.stage;this.ramStart.copy(this.previousBase);
      if(model.stage==='telegraph') {
        this.direction.subVectors(body.position,this.ramStart).setY(0).normalize();
        this.ramEnd.copy(this.ramStart).addScaledVector(this.direction,-12).setY(FINAL_BOSS_TUNING.ramHeight);
      }
      else if(model.stage==='active') {
        this.direction.subVectors(model.lockedTarget,this.ramStart).setY(0).normalize();
        this.ramYaw=Math.atan2(-this.direction.x,-this.direction.z);
        this.copyRamDestination(this.ramStart,model.lockedTarget,this.ramEnd);
      } else this.ramEnd.set(0,FINAL_BOSS_TUNING.hoverY,FINAL_ARENA.centreZ);
    }
    const progress=model.progress;
    this.machine.position.lerpVectors(this.ramStart,this.ramEnd,model.stage==='active'?progress*progress:THREE.MathUtils.smoothstep(progress,0,1));
    this.machine.rotation.x=0;this.machine.rotation.z=0;
    if(model.stage==='active')this.machine.rotation.y=this.ramYaw;
    if(model.stage==='recovery') {
      // Brief recoil away from the wall, followed by a heavy climb back to the
      // hover position. Start from the actual swept collision pose.
      this.machine.position.x+=Math.sin(this.ramYaw)*Math.sin(progress*Math.PI)*7;
      this.machine.position.z+=Math.cos(this.ramYaw)*Math.sin(progress*Math.PI)*7;
      this.machine.rotation.x=Math.sin(progress*Math.PI)*.14;
    }
    if(model.stage==='telegraph') {
      this.machine.rotation.x=Math.sin(progress*Math.PI)*.12;
      this.machine.rotation.z=Math.sin(progress*Math.PI*4)*.025*progress;
    }
    if(model.stage!=='recovery') {
      const start=model.stage==='active'?this.ramStart:this.machine.position;
      if(model.stage==='active')this.warningEnd.copy(this.ramEnd);else this.copyRamDestination(start,body.position,this.warningEnd);
      this.direction.subVectors(this.warningEnd,start).setY(0);const length=this.direction.length();this.direction.normalize();
      this.ramWarning.visible=true;this.ramWarning.position.copy(start).addScaledVector(this.direction,length/2).setY(FINAL_ARENA.floorY+.1);
      this.ramWarning.rotation.y=Math.atan2(this.direction.x,this.direction.z);this.ramWarning.scale.set(this.ramHull.widthMetres+2*FINAL_SPECIMEN_RADIUS,1,length);
      const warning=this.ramWarning.material as THREE.ShaderMaterial;warning.uniforms.uTime!.value=this.lastTime;warning.uniforms.uCharge!.value=model.stage==='active'?1:progress;warning.uniforms.uLength!.value=length;
    }
  }
  private copyRamDestination(start:THREE.Vector3,target:THREE.Vector3Like,out:THREE.Vector3):void {
    this.direction.subVectors(target,start).setY(0).normalize();out.copy(target).addScaledVector(this.direction,18).setY(FINAL_BOSS_TUNING.ramHeight);
    const radius=Math.hypot(out.x,out.z-FINAL_ARENA.centreZ),limit=FINAL_ARENA.radius-8;
    if(radius>limit){out.x*=limit/radius;out.z=FINAL_ARENA.centreZ+(out.z-FINAL_ARENA.centreZ)*limit/radius;}
  }
  private updateBeamWarning(model:FinalBossReadModel,body:KinematicBody):void {
    this.beamWarning.visible=model.state==='combat'&&model.attack==='laser-beam'&&model.stage!=='recovery';
    if(!this.beamWarning.visible)return;
    const direction=model.stage==='telegraph'?initialBeamDirection(model.beamTargetYaw,body.position):model.beamDirection;
    this.beamWarning.userData.direction=direction;
    this.beamWarning.material.color.setHex(model.stage==='telegraph'||model.beamTurning?0xffd074:0xff6c70);
    for(let i=0;i<5;i++) {
      const yaw=this.machine.rotation.y+direction*(.06+i*.09),radius=FINAL_ARENA_RING.radius;
      this.dummy.position.set(this.machine.position.x-Math.sin(yaw)*radius,FINAL_ARENA.floorY+.12,this.machine.position.z-Math.cos(yaw)*radius);
      this.dummy.rotation.set(0,yaw+direction*Math.PI/2,0);this.dummy.scale.setScalar(1.7);this.dummy.updateMatrix();this.beamWarning.setMatrixAt(i,this.dummy.matrix);
    }
    this.beamWarning.instanceMatrix.needsUpdate=true;
  }
  reactToChargedHit(position:THREE.Vector3):void {this.warDrone.reactToChargedHit();this.burst(position,28);}
  get hitReactionStrength():number {return this.warDrone.hitReactionStrength;}
  clearAttackWarnings():void {this.ramWarning.visible=false;this.beamWarning.visible=false;}
  showRamImpact(point:THREE.Vector3,normal:THREE.Vector3):void {
    this.ramImpactAge=0;this.ramImpact.visible=true;this.ramImpact.position.copy(point).addScaledVector(normal,.12);
    this.ramImpact.quaternion.setFromUnitVectors(this.impactForward,normal);this.ramImpact.scale.setScalar(3);this.ramImpact.material.opacity=.9;this.burst(point,32);
  }
  clearRamImpact():void {this.ramImpactAge=1;this.ramImpact.visible=false;this.ramImpact.material.opacity=0;}
  refreshWorldAnchors():void {this.machine.updateMatrixWorld(true);this.core.getWorldPosition(this.coreWorld);this.warDrone.copyEyeMuzzle(this.eyeMuzzle);}
  private updateSmoke(model:FinalBossReadModel,time:number,dt:number):void {
    if(model.phase===2&&(model.state==='combat'||model.state==='transition')) {
      this.smokeClock+=dt;
      while(this.smokeClock>=.07) {
        this.smokeClock-=.07;const index=this.smokeCursor++,s=this.smokeSlots[index%48]!;s.age=0;s.life=2.7;
        s.position.set((index%3-1)*4.5,1.3,2.7).applyMatrix4(this.rollRig.matrixWorld);
        s.velocity.set(Math.sin(index*2.4)*1.1,3+index%3*.5,Math.cos(index*2.4)*1.1);
      }
    }
    let count=0;
    for(const s of this.smokeSlots) {
      s.age+=dt;if(s.age>=s.life)continue;s.position.addScaledVector(s.velocity,dt);
      const f=s.age/s.life;this.dummy.position.copy(s.position);this.dummy.scale.setScalar((.7+f*2.8)*(1-THREE.MathUtils.smoothstep(f,.75,1)));
      this.dummy.rotation.set(s.age*.3,time*.05,0);this.dummy.updateMatrix();this.smoke.setMatrixAt(count++,this.dummy.matrix);
    }this.smoke.count=count;if(count)this.smoke.instanceMatrix.needsUpdate=true;
  }
  showBeam(start:THREE.Vector3,end:THREE.Vector3,radius:number,warning:boolean):void {
    this.direction.subVectors(end,start);const length=this.direction.length();this.direction.normalize();
    for(const [mesh,r] of [[this.beam,radius],[this.beamCore,radius*.3]] as const) {
      mesh.visible=true;mesh.position.copy(start).addScaledVector(this.direction,length*.5);mesh.scale.set(r,length,r);
      mesh.quaternion.setFromUnitVectors(this.up,this.direction);
    }
    this.beamMaterial.color.setHex(warning?0xffbe53:0xff2548);this.beamMaterial.opacity=warning?.3:.65;
  }
  faceSpecimen(yaw:number):void {
    if(this.authoredSpecimen)this.authoredSpecimen.setYaw(yaw);
    else this.specimen.rotation.y=yaw;
  }
  kickGuns():void {this.warDrone.kickGuns();}
  kickEye():void {this.eyeFlash=.12;}
  copyGunMuzzle(index:number,out:THREE.Vector3):THREE.Vector3 {return this.warDrone.copyGunMuzzle(index,out);}
  adoptDroneModel(root:THREE.Object3D):void {
    this.warDrone.adoptModel(root);
    // The RAM envelope follows the actual prepared rigid parts, including its
    // gimbals and shutters. Projectile proxies retain their existing identity.
    this.machine.updateWorldMatrix(true,true);this.ramHull=new ExterminatorRamHull(this.rollRig);this.refreshWorldAnchors();
  }
  copyBeamDirection(out:THREE.Vector3):THREE.Vector3 {return out.set(0,0,-1).applyQuaternion(this.machine.quaternion);}
  burst(position:THREE.Vector3,count=12):void {
    for(let i=0;i<count;i++) {
      const slot=this.particleSlots[this.particleCursor++%64]!;slot.age=0;slot.life=.6+i%3*.1;slot.size=.1+i%4*.035;
      slot.position.copy(position);slot.velocity.set(Math.sin(i*2.4)*4,1+i%4,Math.cos(i*2.4)*4);
    }
  }
  reset():void {
    this.heading=Math.PI;this.lastTime=0;this.root.visible=false;this.warDrone.reset();
    this.clearAttackWarnings();
    this.beam.visible=false;this.beamCore.visible=false;this.beamImpact.visible=false;this.shield.visible=false;this.eyeCharge.visible=false;
    this.finalShot.visible=false;this.explosion.visible=false;this.beamSerial=-1;this.eyeFlash=0;
    this.ramSerial=-1;this.ramStage='';this.ramWarning.visible=false;this.evasionOffset.set(0,0,0);this.evasionRoll=0;
    this.ramHull.reset();
    this.clearRamImpact();
    this.rollRig.rotation.set(0,0,0);
    this.appliedEvasion.set(0,0,0);this.machine.position.set(0,FINAL_BOSS_TUNING.hoverY,FINAL_ARENA.centreZ);this.machine.rotation.set(0,0,0);this.refreshWorldAnchors();
    for(const s of this.smokeSlots)s.life=0;this.smoke.count=0;this.smokeClock=0;this.smokeCursor=0;
    for(const p of this.particleSlots)p.life=0;this.particles.count=0;
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;
    this.particles.dispose();this.smoke.dispose();this.beamWarning.dispose();this.warDrone.dispose();
    this.root.removeFromParent();if(!this.authoredSpecimen)this.specimen.removeFromParent();this.root.clear();
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
        vec3 col=${slime?'mix(vec3(.015,.28,.31),vec3(.16,.63,.18),rim*.8)':'mix(vec3(.22,.004,.012),vec3(1.,.32,.025),uOpen)'};
        ${slime?'':`float r=length(vP.xy);float rings=pow(.5+.5*cos(r*32.),10.);
          float pupil=1.-smoothstep(.16,.36,r);float sweep=pow(max(0.,cos(atan(vP.y,vP.x)-uTime*.7)),26.);
          float iris=smoothstep(.25,.42,r)*(1.-smoothstep(1.08,1.3,r));
          col*=.12+iris*(.4+rings*.75);
          col+=mix(vec3(1.,.06,.035),vec3(1.,.78,.32),uOpen)*(pupil*.8+rings*iris*.2+sweep*.1);
          float reflection=pow(max(0.,dot(normalize(vN),normalize(vec3(-.45,.65,1.)))),48.);
          col+=vec3(.7,.83,.92)*reflection*.75;`}
        col+=vec3(.8,.35,.25)*vein*.23+rim*vec3(.15,.1,.13)+uHit*vec3(.8,.7,.6);
        gl_FragColor=vec4(col,1.);}`});this.material.add(m);return m;
  }
}
