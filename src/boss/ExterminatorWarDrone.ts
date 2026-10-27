import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FinalBossReadModel } from './FinalBossController.ts';
import { ExterminatorBossRig } from './ExterminatorBossRig.ts';

/** Encounter-owned industrial hero asset. Static detail is merged by material;
 * only four fans, two gun drums and the core shutters remain articulated. */
export class ExterminatorWarDrone {
  readonly root=new THREE.Group();
  readonly coreMount=new THREE.Vector3(0,-.1,-4.65);
  private authored:ExterminatorBossRig|undefined;
  private readonly geometries=new Set<THREE.BufferGeometry>();
  private readonly materials=new Set<THREE.Material>();
  private readonly rotors:THREE.Group[]=[];
  private readonly shutters:THREE.Mesh[]=[];
  private readonly drums:THREE.Group[]=[];
  private readonly pods:THREE.Group[]=[];
  private readonly muzzles:THREE.Group[]=[];
  private readonly flashes:THREE.Mesh[]=[];
  private readonly recoil=[0,0];
  private readonly flashTime=[0,0];
  private readonly localTarget=new THREE.Vector3();
  private readonly eyeMuzzle=new THREE.Group();
  private readonly hitStrength={value:0};
  private readonly hitTime={value:0};
  private hitRemaining=0;
  private readonly flashMaterial=new THREE.MeshBasicMaterial({color:0xffd88c,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending});
  private readonly yellow=this.armour(0xb39b38,.62,.62);
  private readonly yellowLight=this.armour(0xd0b852,.59,.6);
  private readonly yellowShadow=this.armour(0x79682f,.69,.62);
  private readonly gunmetal=this.armour(0x283038,.48,.85);
  private readonly black=this.armour(0x0b1219,.56,.7);
  private readonly edge=this.armour(0x59636b,.4,.9);
  private readonly red=this.basic(0xff2134);
  private readonly hot=this.basic(0xff6470);
  private readonly white=this.basic(0xbfddff);
  private readonly lens=this.armour(0x260b12,.18,.75);
  private readonly unitBox=this.geom(new THREE.BoxGeometry(1,1,1));
  private readonly bolt=this.geom(new THREE.CylinderGeometry(.075,.075,.065,6));

  constructor() {
    this.root.name='EX-04-heavy-quad-duct-exterminator';
    this.materials.add(this.flashMaterial);this.eyeMuzzle.name='exterminator-eye-muzzle';
    this.eyeMuzzle.position.copy(this.coreMount).add(new THREE.Vector3(0,0,-.55));this.root.add(this.eyeMuzzle);
    // Tapered, bevelled plates create the layered tank-like fuselage, with
    // negative space between outriggers rather than one enlarged cuboid.
    this.plate([5.8,2.5,9.1],[0,0,.25],this.black);
    this.plate([4.6,.65,8.6],[0,1.5,.2],this.yellow);
    this.plate([2.9,.3,7.7],[0,1.98,.4],this.gunmetal);
    this.plate([3.5,.6,2.3],[0,1.65,-3.5],this.yellowLight);
    this.plate([3.6,.55,2.2],[0,1.7,3.2],this.yellowShadow);
    for(let i=0;i<10;i++) {
      this.box([2.25,.11,.34],[0,2.16,-2.9+i*.64],this.black);
      this.box([1.72,.05,.065],[0,2.23,-2.9+i*.64],this.red);
    }
    for(const side of [-1,1]) {
      const rail=this.plate([.6,.8,8],[side*2.55,1.12,.1],this.yellow);rail.rotation.z=side*-.17;
      this.box([.12,.18,7.2],[side*2.23,1.65,.15],this.black);
      for(let i=0;i<4;i++) {
        this.plate([1.4,.45,1.45],[side*3.02,.6,-2.9+i*2.05],i%2?this.yellowShadow:this.yellow);
        this.box([.08,.14,.64],[side*3.75,.71,-2.9+i*2.05],i%2?this.white:this.red);
        this.cylinder(.095,.095,.7,[side*3.1,1.2,-2.9+i*2.05],this.edge);
      }
      // Hydraulic braces connect the separated fan cages to the main chassis.
      for(const end of [-1,1]) {
        const arm=this.plate([3.1,.62,1.35],[side*3.92,.05,end*3.2],this.gunmetal);arm.rotation.z=side*.08;
        this.box([2.7,.14,.35],[side*3.9,.43,end*3.2],this.yellowShadow);
        this.tube(new THREE.Vector3(side*2.4,-.8,end*2.5),new THREE.Vector3(side*5.1,-.3,end*3.3),.12,this.edge);
        this.fan(side,end);
      }
      this.gunPod(side);
      // Angular cheeks and split lower jaw protect the recessed red iris.
      const cheek=this.plate([1.35,2.75,1.2],[side*2.02,-.05,-4.15],this.yellow);cheek.rotation.z=side*-.2;
      this.plate([.52,1.85,.75],[side*1.9,-1.6,-4.45],this.gunmetal).rotation.z=side*-.19;
      this.box([.12,.85,.08],[side*2.55,-.15,-4.84],this.red).rotation.z=side*-.2;
      this.box([.82,.13,.09],[side*1.7,1.13,-4.85],this.red).rotation.z=side*.16;
      // Small, recessed service panels; bolts are actual geometry, not decals.
      this.plate([.18,.95,1.45],[side*2.94,-.2,1.35],this.yellowShadow);
      for(let n=0;n<5;n++)this.box([.08,.055,1],[side*3.05,-.52+n*.15,1.35],this.black);
    }
    this.coreCollar();
    for(let i=0;i<4;i++) {
      const g=new THREE.Group();g.position.copy(this.coreMount);g.rotation.z=i*Math.PI/2;this.root.add(g);
      // Four disjoint annular quadrants, not coplanar overlapping rectangles.
      // Leave real seams and a small central aperture even while armoured.
      const shape=new THREE.Shape(),inner=.48,outer=1.31,start=Math.PI/4+.085,end=3*Math.PI/4-.085;
      shape.absarc(0,0,outer,start,end,false);
      shape.lineTo(Math.cos(end)*inner,Math.sin(end)*inner);
      shape.absarc(0,0,inner,end,start,true);shape.closePath();
      const geometry=this.geom(new THREE.ExtrudeGeometry(shape,{depth:.2,steps:1,bevelEnabled:true,bevelSize:.018,bevelThickness:.018,bevelSegments:1,curveSegments:20}));
      geometry.translate(0,0,-.73);
      const shutter=new THREE.Mesh(geometry,i%2?this.gunmetal:this.black);
      shutter.name=`exterminator-iris-shutter-${i}`;g.add(shutter);
      this.shutters.push(shutter);
      const inset=new THREE.Mesh(this.geom(new THREE.TorusGeometry(1.04,.028,5,24,end-start)),this.edge);
      inset.rotation.z=start;inset.position.z=-.785;shutter.add(inset);
      this.box([.24,.055,.035],[0,.95,-.79],this.white,shutter);
      this.batch(shutter);
    }
    for(let i=0;i<6;i++) {
      this.box([3.7,.12,.12],[0,-.9+i*.32,4.87],this.black);
      this.box([2.7,.055,.04],[0,-.9+i*.32,4.95],this.red);
    }
    for(const x of [-2,2]) {
      this.cylinder(.055,.09,1.5,[x,2.54,2.6],this.gunmetal);
      this.cylinder(.09,.09,.16,[x,3.34,2.6],this.red);
    }
    this.batch(this.root);this.root.updateMatrixWorld(true);
  }
  private fan(side:number,end:number):void {
    const group=new THREE.Group();group.name='armoured-ducted-fan';group.position.set(side*5.3,-.1,end*3.3);this.root.add(group);
    const profile=[[2.02,-.65],[2.5,-.65],[2.65,-.45],[2.65,.32],[2.48,.63],[2.03,.63],[2.03,.35],[2.02,-.65]].map(([r,y])=>new THREE.Vector2(r,y));
    const cage=new THREE.Mesh(this.geom(new THREE.LatheGeometry(profile,48)),this.yellow);group.add(cage);
    for(const y of [-.5,.52]) {
      const rim=new THREE.Mesh(this.geom(new THREE.TorusGeometry(2.28,.13,5,48)),y>0?this.yellowLight:this.black);rim.rotation.x=Math.PI/2;rim.position.y=y;group.add(rim);
    }
    const darkRim=new THREE.Mesh(this.geom(new THREE.TorusGeometry(2.06,.08,5,48)),this.red);darkRim.rotation.x=Math.PI/2;darkRim.position.y=-.28;group.add(darkRim);
    const rotor=new THREE.Group();rotor.name='spinning-turbine-blades';group.add(rotor);this.rotors.push(rotor);
    for(let i=0;i<10;i++) {
      const a=i*Math.PI/5;
      const blade=this.box([1.68,.1,.47],[Math.cos(a)*1.15,0,Math.sin(a)*1.15],i%2?this.gunmetal:this.black,rotor);
      blade.rotation.set(.11,-a,.09);
      this.box([.3,.035,.3],[Math.cos(a)*1.93,-.07,Math.sin(a)*1.93],this.red,rotor).rotation.y=-a;
    }
    this.cylinder(.62,.72,.4,[0,.15,0],this.yellowShadow,rotor);
    this.cylinder(.44,.54,.22,[0,.47,0],this.yellowLight,rotor);
    this.cylinder(.3,.3,.055,[0,.61,0],this.black,rotor);
    this.batch(rotor);
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4;
      const pad=this.plate([.9,.19,.6],[Math.cos(a)*2.4,.67,Math.sin(a)*2.4],i%2?this.black:this.yellowShadow,group);pad.rotation.y=-a;
      const b=new THREE.Mesh(this.bolt,this.edge);b.position.set(Math.cos(a)*2.4,.81,Math.sin(a)*2.4);group.add(b);
      const slit=this.box([.32,.08,.055],[Math.cos(a)*2.66,-.24,Math.sin(a)*2.66],this.red,group);slit.rotation.y=-a+Math.PI/2;
    }
    for(const axis of [0,Math.PI/2]) {
      const guard=this.box([4.7,.12,.16],[0,.37,0],this.gunmetal,group);guard.rotation.y=axis;
    }
    this.box([.1,.65,.23],[side*2.66,.04,0],this.white,group);
    this.batch(group);
  }
  private gunPod(side:number):void {
    const pod=new THREE.Group();pod.name='articulated-rotary-cannon';pod.position.set(side*3.55,-1.45,-2.4);this.root.add(pod);this.pods.push(pod);
    this.plate([1.5,1.4,3.65],[0,0,.3],this.gunmetal,pod);
    this.plate([1.6,.45,2.7],[0,.88,.15],this.yellow,pod);
    this.box([.1,.65,2.5],[side*.84,-.05,.3],this.red,pod);
    this.box([.15,.55,2.65],[-side*.8,-.07,.3],this.yellowShadow,pod);
    const base=this.cylinder(.78,.78,.35,[0,-.1,-1.65],this.edge,pod);base.rotation.x=Math.PI/2;
    const drum=new THREE.Group();drum.position.set(0,-.1,-1.75);pod.add(drum);this.drums.push(drum);
    const muzzle=new THREE.Group();muzzle.name='exterminator-cannon-muzzle';muzzle.position.set(0,0,-2.12);drum.add(muzzle);this.muzzles.push(muzzle);
    for(let n=0;n<6;n++) {
      const a=n*Math.PI/3,x=Math.cos(a)*.43,y=Math.sin(a)*.43;
      const barrel=this.cylinder(.165,.19,2,[x,y,-.85],this.black,drum);barrel.rotation.x=Math.PI/2;
      const muzzle=this.cylinder(.2,.2,.26,[x,y,-1.91],this.edge,drum);muzzle.rotation.x=Math.PI/2;
      const hole=this.cylinder(.12,.12,.018,[x,y,-2.05],this.lens,drum);hole.rotation.x=Math.PI/2;
      const glow=this.cylinder(.062,.062,.02,[x,y,-2.07],this.red,drum);glow.rotation.x=Math.PI/2;
    }
    const collar=new THREE.Mesh(this.geom(new THREE.TorusGeometry(.58,.09,5,24)),this.gunmetal);collar.position.z=-1.5;drum.add(collar);
    this.batch(drum);this.batch(pod);
    const flash=new THREE.Mesh(this.geom(new THREE.ConeGeometry(.48,1.5,8)),this.flashMaterial);
    flash.name='exterminator-cannon-flash';flash.userData.contactSolid=false;flash.rotation.x=-Math.PI/2;flash.position.set(0,-.1,-4.62);flash.visible=false;pod.add(flash);this.flashes.push(flash);
    this.tube(new THREE.Vector3(side*2.7,-.65,-1),new THREE.Vector3(side*3.55,-1.1,-1.5),.12,this.edge);
  }
  private coreCollar():void {
    for(const [radius,tube,z,material] of [[1.68,.24,-4.7,this.gunmetal],[1.48,.1,-4.89,this.red],[1.34,.065,-5.01,this.hot],[1.84,.1,-4.6,this.yellowShadow]] as const) {
      const ring=new THREE.Mesh(this.geom(new THREE.TorusGeometry(radius,tube,8,48)),material);ring.position.set(0,-.1,z);this.root.add(ring);
    }
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6;
      const segment=this.box([.19,.49,.17],[Math.sin(a)*1.9,-.1+Math.cos(a)*1.9,-4.71],i%3?this.gunmetal:this.red);segment.rotation.z=-a;
    }
    const visor=this.plate([3.3,.37,.9],[0,1.75,-4.4],this.gunmetal);visor.rotation.x=-.1;
  }
  update(time:number,open:boolean,phase:1|2,dt:number,model?:Readonly<FinalBossReadModel>,target?:THREE.Vector3Like):void {
    this.hitRemaining=Math.max(0,this.hitRemaining-dt);this.hitTime.value+=dt;
    this.hitStrength.value=(this.hitRemaining/.3)**2;
    if(this.authored){this.authored.update(time,open,phase,dt,model,target);return;}
    const gun=model?.state==='combat'&&model.attack==='gun-blast',defend=model?.shieldActive===true;
    const spin=gun?(model.stage==='telegraph'?4+model.progress*31:35):model?.attack==='ram'?
      model.stage==='telegraph'?15+model.progress*50:model.stage==='active'?65:25:defend?22:phase===2?25:17;
    for(const [i,rotor] of this.rotors.entries())rotor.rotation.y+=dt*spin*(i%2?1:-1);
    for(const shutter of this.shutters)shutter.position.y=THREE.MathUtils.damp(shutter.position.y,open?1.8:0,12,dt||1/60);
    if(target){this.localTarget.copy(target);this.root.worldToLocal(this.localTarget);}
    for(const [i,drum] of this.drums.entries())drum.rotation.z+=dt*(gun?spin*2:1.2)*(i?1:-1);
    for(const [i,pod] of this.pods.entries()) {
      this.recoil[i]=THREE.MathUtils.damp(this.recoil[i]!,0,22,dt);this.flashTime[i]=Math.max(0,this.flashTime[i]!-dt);
      pod.position.z=-2.4+this.recoil[i]!;
      const pitch=gun&&target?Math.atan2(this.localTarget.y-pod.position.y,Math.hypot(this.localTarget.x-pod.position.x,this.localTarget.z-pod.position.z)):defend?.28:Math.sin(time*.75+i)*.025;
      pod.rotation.x=THREE.MathUtils.damp(pod.rotation.x,THREE.MathUtils.clamp(pitch,-.65,.5),10,dt);
      this.flashes[i]!.visible=gun&&this.flashTime[i]!>0;this.flashes[i]!.scale.setScalar(.8+.35*Math.sin(time*170+i));
    }
    this.red.color.setHex(gun?0xff7337:phase===2?0xff182f:0xff3041);
  }
  adoptModel(root:THREE.Object3D):void {
    if(this.authored)throw new Error('Exterminator model already prepared.');
    const rig=new ExterminatorBossRig(root);
    this.root.clear();this.root.add(root);this.authored=rig;
    for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();
    this.geometries.clear();this.materials.clear();
    root.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      for(const material of Array.isArray(o.material)?o.material:[o.material]) {
        if(!(material instanceof THREE.MeshStandardMaterial)||/_(Red|Amber|White)$/.test(material.name))continue;
        material.onBeforeCompile=shader=>{
          shader.uniforms.uBossHit=this.hitStrength;shader.uniforms.uBossHitTime=this.hitTime;
          shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uBossHit,uBossHitTime;')
            .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=uBossHit*vec3(sin(uBossHitTime*135.)*.07,sin(uBossHitTime*111.)*.045,cos(uBossHitTime*127.)*.055);');
        };
        material.customProgramCacheKey=()=> 'exterminator-authored-hit-v1';material.needsUpdate=true;
      }
    });
  }
  kickGuns():void {if(this.authored){this.authored.kickGuns();return;}for(let i=0;i<2;i++){this.recoil[i]=.24;this.flashTime[i]=.065;this.flashes[i]!.visible=true;}}
  reactToChargedHit():void {this.hitRemaining=.3;this.hitTime.value=0;this.hitStrength.value=1;}
  get hitReactionStrength():number {return this.hitStrength.value;}
  copyGunMuzzle(index:number,out:THREE.Vector3):THREE.Vector3 {return this.authored?this.authored.copyGunMuzzle(index,out):this.muzzles[index]!.getWorldPosition(out);}
  copyEyeMuzzle(out:THREE.Vector3):THREE.Vector3 {return this.authored?this.authored.copyEyeMuzzle(out):this.eyeMuzzle.getWorldPosition(out);}
  reset():void {
    this.hitRemaining=0;this.hitStrength.value=0;this.hitTime.value=0;
    if(this.authored){this.authored.reset();return;}
    for(const shutter of this.shutters)shutter.position.y=0;
    for(const rotor of this.rotors)rotor.rotation.y=0;
    for(const drum of this.drums)drum.rotation.z=0;
    for(const pod of this.pods)pod.rotation.x=0;
    for(let i=0;i<2;i++){this.recoil[i]=0;this.flashTime[i]=0;this.pods[i]!.position.z=-2.4;this.flashes[i]!.visible=false;}
  }
  dispose():void {this.authored?.dispose();this.root.removeFromParent();this.root.clear();for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();}
  private geom<T extends THREE.BufferGeometry>(g:T):T {this.geometries.add(g);return g;}
  private basic(color:number):THREE.MeshBasicMaterial {const m=new THREE.MeshBasicMaterial({color});this.materials.add(m);return m;}
  private armour(color:number,roughness:number,metalness:number):THREE.MeshStandardMaterial {
    const m=new THREE.MeshStandardMaterial({color,roughness,metalness,emissive:color,emissiveIntensity:.085});
    // Deterministic triplanar wear works on merged parts without bitmap assets.
    m.onBeforeCompile=shader=>{
      shader.uniforms.uBossHit=this.hitStrength;shader.uniforms.uBossHitTime=this.hitTime;
      // Vertex-only shudder leaves muzzle anchors, projectile proxies and the
      // swept RAM hull at their authoritative poses.
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 machineP;uniform float uBossHit,uBossHitTime;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nmachineP=position;transformed+=uBossHit*vec3(sin(uBossHitTime*135.)*.1,sin(uBossHitTime*111.)*.065,cos(uBossHitTime*127.)*.08);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 machineP;float wearHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.16)))*43758.5453);}')
        .replace('#include <color_fragment>','#include <color_fragment>\nfloat grain=wearHash(floor(machineP*48.));float chip=step(.978,wearHash(floor(machineP*13.)));diffuseColor.rgb*=.89+grain*.18;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.055,.066,.073),chip*.7);');
    };this.materials.add(m);return m;
  }
  private box(size:[number,number,number],pos:[number,number,number],material:THREE.Material,parent:THREE.Object3D=this.root):THREE.Mesh {
    const m=new THREE.Mesh(this.unitBox,material);m.scale.set(...size);m.position.set(...pos);parent.add(m);return m;
  }
  private plate(size:[number,number,number],pos:[number,number,number],material:THREE.Material,parent:THREE.Object3D=this.root):THREE.Mesh {
    const [w,h,d]=size,b=Math.min(.19,w*.14,h*.2,d*.16),shape=new THREE.Shape();
    const x=w/2-b,y=h/2-b,c=Math.min(.28,x*.35,y*.4);
    shape.moveTo(-x+c,-y);shape.lineTo(x-c,-y);shape.lineTo(x,-y+c);shape.lineTo(x,y-c);shape.lineTo(x-c,y);shape.lineTo(-x+c,y);shape.lineTo(-x,y-c);shape.lineTo(-x,-y+c);shape.closePath();
    const g=this.geom(new THREE.ExtrudeGeometry(shape,{depth:d-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:1,steps:1,curveSegments:1}));g.translate(0,0,-d/2+b);
    const mesh=new THREE.Mesh(g,material);mesh.position.set(...pos);parent.add(mesh);return mesh;
  }
  private cylinder(top:number,bottom:number,height:number,pos:[number,number,number],material:THREE.Material,parent:THREE.Object3D=this.root):THREE.Mesh {
    const mesh=new THREE.Mesh(this.geom(new THREE.CylinderGeometry(top,bottom,height,12)),material);mesh.position.set(...pos);parent.add(mesh);return mesh;
  }
  private tube(a:THREE.Vector3,b:THREE.Vector3,radius:number,material:THREE.Material):void {
    const direction=b.clone().sub(a),m=this.cylinder(radius,radius,direction.length(),[0,0,0],material);
    m.position.copy(a).addScaledVector(direction,.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  }
  private batch(parent:THREE.Object3D):void {
    const groups=new Map<THREE.Material,THREE.Mesh[]>();
    for(const child of [...parent.children]) {
      if(!(child instanceof THREE.Mesh)||child.children.length||Array.isArray(child.material))continue;
      const group=groups.get(child.material)??[];group.push(child);groups.set(child.material,group);
    }
    for(const [material,parts] of groups) {
      const geometry=parts.map(part=>{part.updateMatrix();const g=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();g.applyMatrix4(part.matrix);return g;});
      const merged=mergeGeometries(geometry,false);for(const g of geometry)g.dispose();
      if(!merged)throw new Error('Exterminator static geometry batch failed.');
      this.geom(merged);const mesh=new THREE.Mesh(merged,material);mesh.name='exterminator-batched-machinery';parent.add(mesh);
      for(const part of parts)part.removeFromParent();
    }
  }
}
