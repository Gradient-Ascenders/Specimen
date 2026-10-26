import * as THREE from 'three';
import type { SecurityDroneConfig } from '../hazards/SecurityDrone.ts';
import { SecurityDronePresentation, SecurityDronePresentationResources } from '../render/hazards/SecurityDronePresentation.ts';
import {EscapeDroneModel} from '../render/hazards/EscapeDroneModel.ts';
import type { CinematicPreparationJob } from './IdleCinematicPreparation.ts';
import { FINALE_VENT, finaleEase, finaleMix, sampleContainmentFinale, type ContainmentFinaleFrame, type FinalePoint } from './ContainmentFinaleTimeline.ts';
import { FINALE_DRONE_HOVER } from './ContainmentFinaleBobMotion.ts';
import { ROOM_FIVE_ESCAPE } from '../levels/RoomFiveEscapeLayout.ts';
import { reinforcementPosition,createFinalePursuitShot,createFinaleDuctShot } from './ContainmentFinalePursuit.ts';
import { CONTAINMENT_FINALE_TIMING as T, finaleTime as F } from './ContainmentFinaleTiming.ts';
import { createFinaleCombatShot, createFinaleEvasionShot } from './ContainmentFinaleImpacts.ts';
export { reinforcementPosition } from './ContainmentFinalePursuit.ts';

const DRONE_CONFIG: SecurityDroneConfig = {
  id: 'finale-drone', type: 'ceiling', initialPosition: new THREE.Vector3(),
  colliderSize: new THREE.Vector3(1.6, .8, 1.4), forward: new THREE.Vector3(0, 0, -1),
  scanAxis: new THREE.Vector3(0, 1, 0), scanHalfAngleRadians: .3, scanSpeedRadiansPerSecond: .6,
  detectionHalfAngleRadians: .3, detectionRangeMetres: 40, warningSeconds: .3,
  fireIntervalSeconds: 1, targetLossGraceSeconds: .2, cooldownSeconds: .5,
  muzzleAnchor: new THREE.Vector3(0, 0, -.8), targetPolicy: 'bob-only', initialScanPhase: 0,
};
interface Craft { root: THREE.Group; head: SecurityDronePresentation; rotors: THREE.InstancedMesh }
export interface FinaleShot { readonly t: number; readonly duration: number; readonly green: boolean; readonly from: FinalePoint; readonly to: FinalePoint;
  readonly pursuer?:number;readonly nearMiss?:'bob'|'goop';
  readonly ductNearMiss?:boolean;
  readonly impact?: {readonly normal:FinalePoint;readonly objectName:string}; }
export const ACID_IMPACT_SLOTS=3, ACID_IMPACT_INSTANCES=13, ACID_IMPACT_SECONDS=2.5;

/** Fixed-size effects; no spawns, physics cooking, raycasts, or geometry allocations in playback. */
export class ContainmentFinaleVisuals {
  readonly root = new THREE.Group();
  readonly annex = new THREE.Group();
  readonly drones: Craft[] = [];
  readonly shots: FinaleShot[] = [];
  private readonly model=new EscapeDroneModel();
  private readonly resources = new SecurityDronePresentationResources(undefined, true, false, this.model);
  private readonly ownedGeometry: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly instances: THREE.InstancedMesh[] = [];
  private box!: THREE.BoxGeometry;
  private sphere!: THREE.SphereGeometry;
  private red!: THREE.InstancedMesh;
  private green!: THREE.InstancedMesh;
  private acidImpacts!: THREE.InstancedMesh;
  private debris!: THREE.InstancedMesh;
  private flash!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly aim = new THREE.Vector3();
  private readonly shotOrigin = new THREE.Vector3();
  private readonly inverseCraftRotation = new THREE.Quaternion();
  private readonly impactNormal = new THREE.Vector3();
  private readonly impactU = new THREE.Vector3();
  private readonly impactV = new THREE.Vector3();
  private readonly impactTargets: readonly THREE.Object3D[];
  private disposed = false;

  constructor(impactTargets: readonly THREE.Object3D[] = []) {
    this.impactTargets=impactTargets;
    this.root.name = 'containment-finale-pooled-visuals'; this.root.visible = false;
    this.annex.name = 'containment-finale-escape-annex'; this.root.add(this.annex);
  }

  *preparationJobs(): Generator<CinematicPreparationJob> {
    yield { label: 'finale shared primitives', run: () => {
      this.box = new THREE.BoxGeometry(1, 1, 1); this.sphere = new THREE.SphereGeometry(1, 10, 7);
      this.ownedGeometry.push(this.box, this.sphere);
    } };
    yield* this.model.preparationJobs();
    for (let i = 0; i < 4; i++) yield { label: `finale pooled drone ${i + 1}`, run: () => this.createCraft(i) };
    yield { label: 'finale straight escape airduct', run: () => this.buildAnnex() };
    yield { label: 'finale pooled projectiles and wreck', run: () => this.buildEffects() };
    yield { label: 'finale authored crossfire', run: () => this.buildShots() };
    for(let t=T.combat+.5,i=0;t<T.latch;t+=.85,i++){
      const time=t,index=i;
      yield {label:`finale jumping dodge close call ${i+1}`,run:()=>{this.shots.push(createFinaleEvasionShot(time,index));}};
    }
    yield {label:'finale room impact transforms',run:()=>{for(const target of this.impactTargets)target.updateWorldMatrix(true,true);}};
    for(let t=T.combat+2,i=0;t<F(54);t+=1.35,i++){
      const time=t,index=i;
      yield {label:`finale wall impact ${i+1}`,run:()=>{this.shots.push(createFinaleCombatShot(time,index,this.impactTargets));}};
    }
    for(let t=F(68.8),i=0;t<F(76.5);t+=.38,i++){
      const time=t,index=i;
      yield {label:`finale close call ${i+1}`,run:()=>{this.shots.push(createFinalePursuitShot(time,index));}};
    }
    yield {label:'finale last shot through the duct',run:()=>{this.shots.push(createFinaleDuctShot());}};
    yield {label:'finale chronological shot order',run:()=>{this.shots.sort((a,b)=>a.t-b.t);}};
  }

  update(frame: ContainmentFinaleFrame): void {
    const t = frame.seconds;
    for (let i = 0; i < this.drones.length; i++) {
      const craft = this.drones[i];
      craft.root.visible = i === 0 ? frame.droneVisible && !frame.pov : i <= frame.reinforcementCount;
      const p = i === 0 ? frame.drone : reinforcementPosition(t, i - 1);
      craft.root.position.fromArray(p);
      if(i>0||(t>=T.combat&&t<T.latch)){
        const before=i?reinforcementPosition(t-.03,i-1):sampleContainmentFinale(t-.03).drone;
        const older=i?reinforcementPosition(t-.06,i-1):sampleContainmentFinale(t-.06).drone;
        const vz=(p[2]-before[2])/.03,ax=(p[0]-2*before[0]+older[0])/.0009;
        craft.root.rotation.set(THREE.MathUtils.clamp(-vz*.025,-.2,.08),0,THREE.MathUtils.clamp(-ax*.035,-.16,.16));
        // Thread the narrow previous-room exit side-on, then bank into pursuit.
        if(i>0)craft.root.rotation.y=(1-finaleEase(93.3,96.4,p[2]))*Math.PI/2;
      }else craft.root.rotation.set(0,0,0);
      const target = i===0 ? t<21?frame.bob:frame.goop
        : t<F(73.8)?(i%2?frame.goop:frame.bob):[0,75.65,125.35] as const;
      this.aim.fromArray(target).sub(craft.root.position);
      this.aim.applyQuaternion(this.inverseCraftRotation.copy(craft.root.quaternion).invert());
      if (i === 0 && frame.latched) this.aim.set(Math.sin(t * 7), -.6, Math.cos(t * 9));
      craft.head.setAimDirection(this.aim);
      craft.head.setState(t >= T.combat ? 'firing' : t >= 22.5 ? 'warning' : 'scanning', true);
      for (let j = 0; j < 4; j++) {
        this.position.set(j % 2 ? .95 : -.95, .38, j < 2 ? -.65 : .65);
        this.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t * 42 * (j % 2 ? 1 : -1));
        this.scale.set(1,1,1);
        this.matrix.compose(this.position, this.quaternion, this.scale); craft.rotors.setMatrixAt(j, this.matrix);
      }
      craft.rotors.instanceMatrix.needsUpdate = true;
    }
    this.updateProjectiles(t);
    this.updateAcidImpacts(t);
    this.updateWreck(t);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.drones.forEach(craft => craft.head.dispose());
    this.instances.forEach(mesh => mesh.dispose());
    this.resources.dispose();
    this.model.dispose();
    this.ownedGeometry.forEach(geometry => geometry.dispose());
    this.ownedMaterials.forEach(material => material.dispose());
    this.root.clear();
  }

  private createCraft(index: number): void {
    const head = new SecurityDronePresentation({ ...DRONE_CONFIG, id: `finale-drone-${index}` }, this.resources);
    for (const child of [...head.root.children]) if (child !== head.aimHead) child.removeFromParent();
    const root = new THREE.Group(); root.name = `finale-flying-drone-${index}`; root.visible = false; root.add(head.root);
    for(const role of ['armour','armourShadow','mechanism'] as const){
      const airframe=new THREE.Mesh(this.model.part('ED_Airframe_'+role),this.resources.material(role));
      airframe.name=`finale-drone-${index}-airframe-${role}`;root.add(airframe);
    }
    const rotors = this.instance(this.model.part('ED_Rotor_barrel'), this.resources.material('barrel'), 4);
    rotors.name=`finale-drone-${index}-lift-rotors`;
    root.add(rotors); this.root.add(root); this.drones.push({ root, head, rotors });
    root.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = false; });
  }

  private buildAnnex(): void {
    // One instanced shell and one instanced emissive trim, not additional lights.
    const parts: { at: FinalePoint; size: FinalePoint; color: number }[] = [];
    const add = (at: FinalePoint, size: FinalePoint, color = 0x283c42) => parts.push({ at, size, color });
    const y=FINALE_VENT.y;
    // A short, shadowed continuation of Room 4's exit. It shares this existing
    // shell draw, so the entrance has depth without rendering the whole lift.
    for(const x of [7.4,10.6])add([x,76.65,88.55],[.2,4,5.7],0x25383c);
    add([9,74.65,88.55],[3,.2,5.7],0x34484e);
    add([9,78.65,88.55],[3,.2,5.7],0x213238);
    add([9,76.65,85.6],[3.4,4.2,.2],0x030809);
    // RoomFiveArt owns the narrow neck (125.5..128). The straight duct starts
    // at its real back edge and ends at an open drop, not another large room.
    add([-1.45,y-.1,135],[.3,.2,14],0x43545a);
    add([1.45,y-.1,135],[.3,.2,14],0x43545a);
    add([0,y-.1,132.6],[2.6,.2,9.2],0x526369);
    add([0,y-.1,140.9],[2.6,.2,2.2],0x526369);
    for(const x of [-1.69,1.69])add([x,75.9,135],[.18,2.5,14],0x3d5057);
    add([0,77.14,135],[3.56,.18,14],0x33474e);
    add([0,75.9,142.1],[3.56,2.5,.2],0x34484f);
    for(const x of [-1.3,1.3])add([x,75.9,128.06],[.8,2.5,.12],0x25383f);
    add([0,76.75,128.06],[1.8,.7,.12],0x25383f);
    for(let z=129;z<142;z+=2){
      for(const x of [-1.57,1.57])add([x,75.9,z],[.08,2.28,.08],0x152a31);
      add([0,77,z],[3.14,.08,.08],0x152a31);
      if(z<137)add([0,74.77,z],[3.1,.015,.035],0x293b41);
      for(const x of [-1.585,1.585])add([x,75.9,z+.55],[.025,.22,.65],0x263b43);
    }
    // Butt-jointed shaft walls finish below the floor top. Neither their top
    // faces nor the four rim corners overlap a coplanar neighbour.
    for(const x of [-1.39,1.39])add([x,71.295,138.5],[.18,6.5,2.6],0x172a31);
    for(const z of [137.11,139.89])add([0,71.295,z],[2.96,6.5,.18],0x172a31);
    add([0,67.9,138.5],[2.96,.2,2.96],0x020609);
    for(const x of [-1.39,1.39])add([x,y+.035,138.5],[.18,.07,2.6],0x71898d);
    for(const z of [137.11,139.89])add([0,y+.035,z],[2.96,.07,.18],0x71898d);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff }); this.ownedMaterials.push(material);
    const shell = this.instance(this.box, material, parts.length); shell.name = 'finale-escape-annex-shell';
    parts.forEach((part, i) => { this.place(shell, i, part.at, part.size); shell.setColorAt(i, new THREE.Color(part.color)); });
    this.annex.add(shell);
    const trimMaterial = new THREE.MeshBasicMaterial({ color: 0x8fd8c2 }); this.ownedMaterials.push(trimMaterial);
    const trim = this.instance(this.box, trimMaterial, 16);
    let index = 0;
    for(let z=129;z<142;z+=2){
      for(const x of [-1.585,1.585])this.place(trim,index++,[x,76.45,z],[.02,.05,.32]);
    }
    for(const x of [-1.37,1.37])this.place(trim,index++,[x,y+.09,138.5],[.05,.03,2.5]);
    this.annex.add(trim);
  }

  private buildEffects(): void {
    const red = new THREE.MeshBasicMaterial({ color: 0xff294e, toneMapped: false });
    const green = new THREE.MeshBasicMaterial({ color: 0xa4ff3b, toneMapped: false });
    const wetSlime = new THREE.MeshStandardMaterial({name:'finale-wet-acid-contact',
      color:0x8bcf38,emissive:0x305c0a,emissiveIntensity:.4,roughness:.23,metalness:.02});
    const metal = new THREE.MeshStandardMaterial({ color: 0x59625d, roughness: .75, metalness: .35 });
    const flash = new THREE.MeshBasicMaterial({ color: 0xd5ff92, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.ownedMaterials.push(red, green, wetSlime, metal, flash);
    this.red = this.instance(this.sphere, red, 8); this.green = this.instance(this.sphere, green, 4);
    this.acidImpacts=this.instance(this.sphere,wetSlime,ACID_IMPACT_SLOTS*ACID_IMPACT_INSTANCES);
    this.acidImpacts.name='finale-pooled-acid-wall-impacts';
    this.debris = this.instance(this.box, metal, 10);
    this.red.name = 'finale-red-shot-pool'; this.green.name = 'finale-acid-shot-pool'; this.debris.name = 'finale-settling-drone-wreck';
    this.flash = new THREE.Mesh(this.sphere, flash);
    this.root.add(this.red, this.green, this.acidImpacts, this.debris, this.flash);
  }

  private buildShots(): void {
    for (let t = F(48.3), i = 0; t < F(56.7); t += .26, i++) {
      const start = sampleContainmentFinale(t);
      this.shots.push({ t, duration: .48, green: false, from: start.drone,
        to: [Math.sin(i * 2.4) * 18, i % 3 === 0 ? 99 : 75, 109 + Math.cos(i * 1.7) * 14] });
    }
    const clean = sampleContainmentFinale(T.cleanShot);
    this.shots.push({ t: T.cleanShot, duration: T.droneHit-T.cleanShot, green: true, from: [clean.goop[0], clean.goop[1] + .3, clean.goop[2]], to: sampleContainmentFinale(T.droneHit).drone });
    const door = sampleContainmentFinale(T.doorShot);
    this.shots.push({t:T.doorShot,duration:T.doorHit-T.doorShot,green:true,from:[door.goop[0],door.goop[1]+.3,door.goop[2]],to:ROOM_FIVE_ESCAPE.coverPosition});
  }

  private updateAcidImpacts(t:number):void{
    let slot=0,index=0;
    for(const shot of this.shots){
      const age=t-shot.t-shot.duration;
      if(!shot.impact||age<0||age>=ACID_IMPACT_SECONDS||slot++>=ACID_IMPACT_SLOTS)continue;
      this.impactNormal.fromArray(shot.impact.normal);
      this.impactU.set(1,0,0);
      if(Math.abs(this.impactNormal.x)>.8)this.impactU.set(0,0,1);
      this.impactU.addScaledVector(this.impactNormal,-this.impactU.dot(this.impactNormal)).normalize();
      this.impactV.crossVectors(this.impactNormal,this.impactU);
      this.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP,this.impactNormal);
      const fade=1-finaleEase(1.8,ACID_IMPACT_SECONDS,age),radius=(.18+.3*finaleEase(0,.2,age))*fade;
      // Rounded, shaded wet mass seated in the actual surface, not a luminous
      // paper-thin disc. Overlapping lobes make a connected irregular outline.
      this.position.fromArray(shot.to).addScaledVector(this.impactNormal,.015*fade);
      this.scale.set(radius,.065*fade,radius*.82);index=this.writeAcidImpact(index);
      for(let i=0;i<5;i++){
        const angle=i*2.399+shot.t*.7,spread=radius*(.62+(i%2)*.16);
        this.position.fromArray(shot.to).addScaledVector(this.impactU,Math.cos(angle)*spread)
          .addScaledVector(this.impactV,Math.sin(angle)*spread*.85).addScaledVector(this.impactNormal,.006*fade);
        this.scale.set(radius*(.44+(i%2)*.08),(.045+(i%3)*.012)*fade,radius*.36);index=this.writeAcidImpact(index);
      }
      if(this.impactNormal.y<.45){
        // Gravity produces short connected runs on walls and hanging beads on
        // undersides; no particles hover motionlessly beneath a platform.
        this.aim.set(0,-1,0);
        if(this.impactNormal.y>-.5)this.aim.addScaledVector(this.impactNormal,this.impactNormal.y).normalize();
        this.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP,this.aim);
        for(let i=0;i<2;i++){
          const length=(.04+(.3+i*.13)*finaleEase(.12,1.1,age))*fade;
          this.shotOrigin.fromArray(shot.to).addScaledVector(this.impactU,(i?.16:-.14)*fade)
            .addScaledVector(this.impactV,(i?.04:-.07)*fade).addScaledVector(this.impactNormal,.04*fade);
          this.position.copy(this.shotOrigin).addScaledVector(this.aim,length*.5);
          this.scale.set(.035*fade,length*.5+.025*fade,.035*fade);index=this.writeAcidImpact(index);
          this.position.copy(this.shotOrigin).addScaledVector(this.aim,length);
          this.scale.set(.067*fade,.09*fade,.067*fade);index=this.writeAcidImpact(index);
        }
      }
      if(age<.42)for(let i=0;i<3;i++){
        const angle=i*2.399+.3,speed=1.4+i*.45;
        this.position.fromArray(shot.to).addScaledVector(this.impactU,Math.cos(angle)*speed*age)
          .addScaledVector(this.impactV,Math.sin(angle)*speed*age).addScaledVector(this.impactNormal,.15+age*.2);
        this.position.y-=4.9*age*age;
        this.scale.setScalar(.065*(1-age/.42));index=this.writeAcidImpact(index);
      }
    }
    this.acidImpacts.count=index;this.acidImpacts.instanceMatrix.needsUpdate=true;
  }

  private writeAcidImpact(index:number):number{
    this.matrix.compose(this.position,this.quaternion,this.scale);
    this.acidImpacts.setMatrixAt(index,this.matrix);return index+1;
  }

  private updateProjectiles(t: number): void {
    let r = 0, g = 0;
    for (const shot of this.shots) {
      const u = (t - shot.t) / shot.duration;
      if (u < 0 || u > 1) continue;
      const mesh = shot.green ? this.green : this.red, i = shot.green ? g++ : r++;
      if (i >= (shot.green ? 4 : 8)) continue;
      const p = finaleMix(shot.from, shot.to, u);
      this.position.fromArray(p);
      this.aim.fromArray(shot.to).sub(this.shotOrigin.fromArray(shot.from)).normalize();
      this.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this.aim);
      this.scale.set(shot.green ? .15 : .055, shot.green ? .28 : .52, shot.green ? .15 : .055);
      this.matrix.compose(this.position, this.quaternion, this.scale); mesh.setMatrixAt(i, this.matrix);
    }
    this.red.count = Math.min(r, 8); this.green.count = Math.min(g, 4);
    this.red.instanceMatrix.needsUpdate = this.green.instanceMatrix.needsUpdate = true;
  }

  private updateWreck(t: number): void {
    const [originX,originY,originZ]=FINALE_DRONE_HOVER;
    const age = t - T.droneHit;
    this.debris.visible = age >= 0; this.flash.visible = age >= 0 && age < .55;
    if (age < 0) return;
    this.flash.position.fromArray(FINALE_DRONE_HOVER);
    this.flash.scale.setScalar(.3 + Math.min(age, .6) * 4);
    this.flash.material.opacity = Math.max(0, 1 - age / .55) * .8;
    for (let i = 0; i < 10; i++) {
      const angle = i * 2.399, vx = Math.cos(angle) * (1.2 + i % 3), vz = Math.sin(angle) * (1.1 + i % 2);
      const width = i % 2 ? .45 : .65, height = .08, depth = i % 3 ? .24 : .5;
      const platformHit = Math.sqrt((originY - 81.082 - height * .5) / 9);
      const platformX = originX + vx * platformHit, platformZ = originZ + vz * platformHit;
      const plane = platformX > -3.18 && platformX < 1.82 && platformZ > 113.402 && platformZ < 117.902 ? 81.082 : 74.75;
      const hit = Math.sqrt((originY - plane - height * .5) / 9);
      const travel = Math.min(age, hit) + (age > hit ? .06 * (1 - Math.exp(-(age - hit) * 10)) : 0);
      let x = originX + vx * travel, z = originZ + vz * travel;
      if (plane > 75 && age >= hit) {
        x = THREE.MathUtils.clamp(x, -3.16, 1.80);
        z = THREE.MathUtils.clamp(z, 113.422, 117.882);
      }
      // A single gravity arc, one damped bounce, then actual flat support.
      const settle = finaleEase(hit, hit + .35, age);
      this.euler.set(age * (i % 2 ? 3 : -2) * (1 - settle), angle * (1 - settle), age * 2 * (1 - settle));
      this.quaternion.setFromEuler(this.euler);
      this.matrix.makeRotationFromQuaternion(this.quaternion);
      const e = this.matrix.elements;
      const support = (Math.abs(e[1]) * width + Math.abs(e[5]) * height + Math.abs(e[9]) * depth) * .5;
      const bounce = age >= hit && age < hit + .35 ? Math.sin((age - hit) / .35 * Math.PI) * .24 : 0;
      this.position.set(x, Math.max(plane + support, originY - 9 * age * age) + bounce, z);
      this.scale.set(width, height, depth); this.matrix.compose(this.position, this.quaternion, this.scale); this.debris.setMatrixAt(i, this.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
  }

  private instance(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.instances.push(mesh); return mesh;
  }
  private place(mesh: THREE.InstancedMesh, i: number, at: FinalePoint, size: FinalePoint): void {
    this.position.fromArray(at); this.scale.fromArray(size); this.quaternion.identity();
    this.matrix.compose(this.position, this.quaternion, this.scale); mesh.setMatrixAt(i, this.matrix);
  }
}
