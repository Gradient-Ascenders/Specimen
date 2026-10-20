import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {CultivationLabMaterials} from '../render/environment/cultivation/CultivationLabMaterials.ts';
import {VOLT_FINALE as T,VOLT_FINALE_PROJECTILES,voltFinaleGrateAngle,sampleVoltFinaleDrone} from './CultivationFinaleTimeline.ts';
import {VOLT_FINALE_VENT as V} from './CultivationFinaleLayout.ts';
import {buildCultivationFinaleDuct,type FinaleDuctFinish} from './CultivationFinaleDuct.ts';
const abandonedPosition=new THREE.Vector3();sampleVoltFinaleDrone(1,T.rideAcidHit,abandonedPosition);
const SPLASHES=[{time:T.acidHit,x:1.85,z:41},{time:T.rideAcidHit,x:abandonedPosition.x,z:abandonedPosition.z}] as const;

/** Baked, level-owned vent scenery and fixed-capacity effects. Collected by the
 * existing Room 5 preparation pass, including while initially hidden. */
export class CultivationFinaleSet {
  readonly mouth=new THREE.Group();
  readonly annex=new THREE.Group();
  readonly effects=new THREE.Group();
  readonly bolts:THREE.InstancedMesh;
  readonly fragments:THREE.InstancedMesh;
  readonly rings:THREE.InstancedMesh;
  readonly ductGrates=[new THREE.Group(),new THREE.Group()] as const;
  private readonly materials:THREE.Material[]=[];
  private readonly meshes:THREE.Mesh[]=[];
  private readonly instances:THREE.InstancedMesh[]=[];
  private readonly matrix=new THREE.Matrix4();
  private readonly position=new THREE.Vector3();
  private readonly scale=new THREE.Vector3();
  private readonly orientation=new THREE.Quaternion();
  private readonly direction=new THREE.Vector3();
  private readonly end=new THREE.Vector3();
  private readonly up=new THREE.Vector3(0,1,0);
  private readonly side=new THREE.Vector3(1,0,0);
  private readonly color=new THREE.Color();
  private disposed=false;

  constructor(room:THREE.Object3D,lab:CultivationLabMaterials){
    this.mouth.name='cultivation-volt-finale-high-escape-vent-mouth';
    this.mouth.position.set(.03,V.y,0);
    this.annex.name='cultivation-volt-finale-basement-airduct';
    this.annex.position.set(.03,V.y,0);
    this.effects.name='cultivation-volt-finale-pooled-effects';
    this.annex.visible=this.effects.visible=false;
    const finish=(name:string,color:number,shaded=true)=>{
      const material=new THREE.MeshBasicMaterial({name:`volt-finale-${name}`,color,vertexColors:shaded});this.materials.push(material);return material;
    };
    const shell=finish('duct-lining',0x293b40),edge=finish('duct-seams',0x0b141a),trim=finish('vent-flanges',0x60777b);
    const panels=finish('duct-galvanised-panels',0x465760),floor=finish('duct-pressed-floor',0x34444c);
    const pipe=finish('duct-copper-services',0x8a6a4d),warm=finish('duct-work-lights',0xacc5c6,false),hazard=finish('duct-safety-yellow',0xc0a25a);
    const lettering=finish('facility-lettering',0xe4dfc5,false),exit=finish('exit-route-lettering',0x7cdac0,false);
    const labWall=finish('junction-lab-ceramic',0xa7b6b4),labFloor=finish('junction-lab-floor',0x687e81);
    const labGlass=finish('junction-lab-observation-glass',0x193e48);
    const build=(name:string,parent:THREE.Object3D,material:THREE.Material,draw:(add:(g:THREE.BufferGeometry)=>void)=>void)=>{
      const geometry=lab.assets.geometry(`volt-finale-${name}`,()=>{
        const pieces:THREE.BufferGeometry[]=[];
        draw(source=>{
          const g=source.index?source.toNonIndexed():source;if(g!==source)source.dispose();
          if(material instanceof THREE.MeshBasicMaterial&&material.vertexColors){
            // Bake subtle directional form and metre-scale staining into the
            // fixed scenery. Curved pipes/fasteners read as metal without any
            // extra live lights, texture upload or fragment-shader noise.
            const p=g.getAttribute('position'),n=g.getAttribute('normal'),colours=new Float32Array(p.count*3);
            for(let i=0;i<p.count;i++){
              const stain=Math.max(0,Math.sin(p.getX(i)*1.7+p.getZ(i)*.7))*.1;
              const value=THREE.MathUtils.clamp(.76+n.getY(i)*.16+n.getZ(i)*.12-n.getX(i)*.09-stain,.38,1);
              colours[i*3]=value;colours[i*3+1]=value;colours[i*3+2]=value;
            }
            g.setAttribute('color',new THREE.BufferAttribute(colours,3));
          }
          pieces.push(g);
        });
        const merged=mergeGeometries(pieces)!;pieces.forEach(g=>g.dispose());return merged;
      });
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`volt-finale-${name}`;mesh.userData.presentationOnly=true;
      mesh.userData.shadowProxyReceiver=true;parent.add(mesh);this.meshes.push(mesh);
    };
    const box=(size:readonly[number,number,number],at:readonly[number,number,number])=>new THREE.BoxGeometry(...size).translate(...at);
    build('high-escape-vent-frame',this.mouth,trim,add=>{
      for(const z of [59.9,63.1])add(box([.22,2.8,.18],[20.11,1.4,z]));
      for(const y of [.06,2.8])add(box([.22,.18,3.35],[20.11,y,61.5]));
      for(const z of [60.15,62.85])for(const y of [.35,2.45])add(box([.1,.13,.13],[19.95,y,z]));
    });
    build('high-vent-indicator',this.mouth,warm,add=>{
      add(box([.035,.065,2.45],[19.96,2.65,V.z]));
    });
    this.ductGrates.forEach((root,i)=>{
      root.name=`volt-finale-breakaway-floor-hinge-${i}`;root.position.set(V.dropX+(i===0?-1.4:1.4),0,V.z);
      root.userData.presentationOnly=true;this.annex.add(root);
    });
    const ductFinishes:Record<FinaleDuctFinish,THREE.Material>={shell,edge,trim,panels,floor,pipe,warm,hazard,lettering,exit,labWall,labFloor,labGlass};
    buildCultivationFinaleDuct((name,finish,draw,moving)=>build(name,moving===undefined?this.annex:this.ductGrates[moving],ductFinishes[finish],draw));
    const basic=finish('pooled-shot-colour',0xffffff,false);
    const instance=(name:string,key:string,generate:()=>THREE.BufferGeometry,capacity:number)=>{
      const mesh=new THREE.InstancedMesh(lab.assets.geometry(key,generate),basic,capacity);
      mesh.name=name;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;
      mesh.userData.presentationOnly=true;mesh.userData.prewarmInstanceCount=1;
      this.matrix.makeScale(.001,.001,.001);
      for(let i=0;i<capacity;i++){mesh.setMatrixAt(i,this.matrix);mesh.setColorAt(i,this.color.setHex(0xffffff));}
      mesh.count=0;this.effects.add(mesh);this.instances.push(mesh);return mesh;
    };
    this.bolts=instance('volt-finale-recycled-projectiles','volt-finale-unit-bolt',()=>new THREE.CylinderGeometry(1,1,1,6),16);
    this.fragments=instance('volt-finale-recycled-impact-fragments','volt-finale-unit-fragment',()=>new THREE.IcosahedronGeometry(1,0),192);
    this.rings=instance('volt-finale-recycled-splash-rings','volt-finale-unit-ring',()=>new THREE.TorusGeometry(1,.035,5,28),8);
    for(const root of [this.mouth,this.annex,this.effects]){root.userData.presentationOnly=true;room.add(root);}
  }

  present(t:number):void{
    this.ductGrates.forEach((root,i)=>{root.rotation.z=voltFinaleGrateAngle(i as 0|1,t);});
    let bolts=0,fragments=0;
    for(const shot of VOLT_FINALE_PROJECTILES){
      const u=(t-shot.time)/shot.duration;
      if(u>=0&&u<1){
        this.position.fromArray(shot.from).lerp(this.end.fromArray(shot.to),u);
        this.direction.fromArray(shot.to).sub(this.end.fromArray(shot.from)).normalize();
        this.orientation.setFromUnitVectors(this.up,this.direction);this.scale.set(shot.kind==='acid'?.13:.045,shot.kind==='acid'?.65:1.9,shot.kind==='acid'?.13:.045);
        this.matrix.compose(this.position,this.orientation,this.scale);this.bolts.setMatrixAt(bolts,this.matrix);
        this.bolts.setColorAt(bolts++,this.color.setHex(shot.kind==='acid'?0x8fe33f:shot.kind==='hijacked'?0xffe6a0:0xff4859));
      }
      const age=t-shot.time-shot.duration,life=shot.kill!==undefined?1.7:.5;
      if(age<0||age>life)continue;
      const count=shot.kill!==undefined?24:5;
      for(let i=0;i<count&&fragments<192;i++){
        const theta=i*2.39996,spread=age*(shot.kill!==undefined?3.2:1.4),vertical=Math.sin(i*7.1);
        this.position.fromArray(shot.to);this.position.x+=Math.cos(theta)*spread;this.position.z+=Math.sin(theta)*spread;
        this.position.y+=vertical*spread-age*age*2;
        this.scale.setScalar(Math.max(.001,(shot.kill!==undefined?.22:.07)*(1-age/life)));
        this.orientation.setFromAxisAngle(this.up,i+age*7);this.matrix.compose(this.position,this.orientation,this.scale);
        this.fragments.setMatrixAt(fragments,this.matrix);this.fragments.setColorAt(fragments++,this.color.setHex(
          shot.kind==='acid'?(i%2?0x8fde3d:0xd2fb84):(i%3?0xf3ad46:0xfff1c5)));
      }
    }
    for(const splash of SPLASHES){
      const splashAge=t-splash.time;
      if(splashAge>=0&&splashAge<2.2)for(let i=0;i<32;i++){
        const u=splashAge/2.2,theta=i*2.39996;
        this.position.set(splash.x+Math.cos(theta)*u*3,Math.max(-.12,Math.sin(u*Math.PI)*(1+(i%4)*.3)),splash.z+Math.sin(theta)*u*3);
        this.scale.setScalar(.1*(1-u));this.orientation.identity();this.matrix.compose(this.position,this.orientation,this.scale);
        this.fragments.setMatrixAt(fragments,this.matrix);this.fragments.setColorAt(fragments++,this.color.setHex(0x8aaf3e));
      }
    }
    const coverAge=t-T.coverImpact;
    if(coverAge>=0&&coverAge<.6)for(let i=0;i<18;i++){
      const angle=i*2.39996;
      this.position.set(.65+Math.cos(angle)*coverAge*3.5,27.81+.7+coverAge*(i%3)-coverAge*coverAge*5,
        40.1+Math.sin(angle)*coverAge*3.5);
      this.scale.setScalar(.035*(1-coverAge/.6));this.orientation.setFromAxisAngle(this.side,i+coverAge*5);
      this.matrix.compose(this.position,this.orientation,this.scale);this.fragments.setMatrixAt(fragments,this.matrix);
      this.fragments.setColorAt(fragments++,this.color.setHex(i%3?0xb2b9b4:0xf4ca80));
    }
    if(t>=T.ductShake&&t<T.grateBreak+.6)for(let i=0;i<14;i++){
      const age=(t-T.ductShake+i*.13)%1.4;
      this.position.set(V.dropX-1+Math.sin(i*4.3)*2,V.y+2.6-age*age*1.7,V.z+Math.sin(i*2.4)*1.1);
      this.scale.set(.018,.012,.025);this.orientation.setFromAxisAngle(this.side,i+age*2);
      this.matrix.compose(this.position,this.orientation,this.scale);this.fragments.setMatrixAt(fragments,this.matrix);
      this.fragments.setColorAt(fragments++,this.color.setHex(i%2?0x7d8177:0x716150));
    }
    const fractureAge=t-T.grateBreak;
    if(fractureAge>=0&&fractureAge<1.5)for(let i=0;i<12;i++){
      this.position.set(V.dropX+Math.sin(i*2.4)*fractureAge*.7,V.y-.04-fractureAge*fractureAge*5,
        V.z+(i/11-.5)*2.5);
      this.scale.set(.035,.025,.045);this.orientation.setFromAxisAngle(this.side,i+fractureAge*3);
      this.matrix.compose(this.position,this.orientation,this.scale);this.fragments.setMatrixAt(fragments,this.matrix);
      this.fragments.setColorAt(fragments++,this.color.setHex(i%2?0x716150:0x899699));
    }
    this.bolts.count=bolts;this.fragments.count=fragments;
    for(const mesh of [this.bolts,this.fragments]){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor!.needsUpdate=true;}
    let rings=0;
    for(const splash of SPLASHES){
      const splashAge=t-splash.time;if(splashAge<0||splashAge>=3)continue;
      for(let i=0;i<2;i++){
        this.position.set(splash.x,.01+i*.02,splash.z);this.orientation.setFromAxisAngle(this.side,Math.PI/2);
        this.scale.setScalar(.3+splashAge*1.3+i*.4);this.matrix.compose(this.position,this.orientation,this.scale);
        this.rings.setMatrixAt(rings,this.matrix);this.rings.setColorAt(rings++,this.color.setHex(0x6b8c35));
      }
    }
    this.rings.count=rings;
    if(rings){this.rings.instanceMatrix.needsUpdate=true;this.rings.instanceColor!.needsUpdate=true;}
  }
  get dynamicTransformRoots():readonly THREE.Object3D[]{return this.ductGrates;}
  reset():void{
    this.annex.visible=this.effects.visible=false;this.bolts.count=this.fragments.count=this.rings.count=0;
    this.ductGrates.forEach(root=>{root.rotation.z=0;});
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    for(const root of [this.mouth,this.annex,this.effects])root.removeFromParent();
    for(const mesh of this.meshes)mesh.geometry.dispose();
    for(const mesh of this.instances){mesh.geometry.dispose();mesh.dispose();}
    this.materials.forEach(material=>material.dispose());
  }
}
