import * as THREE from 'three';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { FINAL_ARENA, FINAL_ARENA_RING, FINAL_ARENA_ORBIT, finalArenaZ } from './FinalBossConfig.ts';

type OrbitPlatform = { collider:THREE.Mesh; visual:THREE.Group; previous:THREE.Vector3; current:THREE.Vector3 };

/** A continuous laboratory annulus around an actually empty, 520 m shaft. */
export class ExterminationArena {
  readonly root=new THREE.Group();
  readonly collisionMeshes:THREE.Mesh[]=[];
  readonly entryDoor:THREE.Mesh;
  readonly exitDoor:THREE.Mesh;
  readonly cover:THREE.Mesh[]=[];
  readonly coverAssemblies:THREE.Group[]=[];
  private readonly coverLine=new THREE.Line3();
  private readonly coverPoint=new THREE.Vector3();
  readonly ringDecks:THREE.Mesh[]=[];
  readonly platforms:OrbitPlatform[]=[];
  readonly sectors:THREE.Mesh<THREE.RingGeometry,THREE.ShaderMaterial>[]=[];
  readonly armourFragments:THREE.Mesh[]=[];
  private readonly geometries=new Set<THREE.BufferGeometry>();
  private readonly materials=new Set<THREE.Material>();
  private readonly textures=new Set<THREE.Texture>();
  private readonly boxGeometries=new Map<string,THREE.BoxGeometry>();
  private readonly lights:THREE.PointLight[]=[];
  private readonly white=this.material(0xd9e4e5,.62,.22,0x11191d,.35);
  private readonly panel=this.material(0xb3c6cb,.62,.35,0x0d151b,.25);
  private readonly steel=this.material(0x273b48,.46,.75);
  private readonly dark=this.material(0x091923,.65,.45);
  private readonly cyan=this.material(0x71e7d9,.35,.3,0x39cbbd,1.3);
  private readonly lamp=this.basic(0xc4eafa);
  private readonly amber=this.material(0xffc050,.5,.25,0xba731a,.4);
  private readonly hatch:THREE.Mesh;
  private orbitTime=0;
  private readonly displacement=new THREE.Vector3();

  constructor(options:{orbitingPlatforms?:boolean}={}) {
    this.root.name='level-3-room-4-extermination-chamber';
    const {centreZ:z,ceilingY:roof,pitFloorY:bottom}=FINAL_ARENA;
    this.buildRing();this.buildShaft();this.buildLaboratory();
    // Retain the authored lift system behind one opt-in instead of leaving
    // hidden supports/colliders in the current empty arena shaft.
    if(options.orbitingPlatforms??FINAL_ARENA_ORBIT.enabled)this.buildOrbiters();
    this.entryDoor=this.worldBox('arena-entry-blast-door',[13,8,.65],[0,12,190],this.panel,true);
    this.worldBox('arena-entry-header',[13,roof-8.4,1],[0,(roof+8.4)/2,190],this.white,true);
    for(const side of [-1,1])this.worldBox(`arena-entry-jamb-${side}`,[17,roof,12],[side*15,roof/2,193],this.white,true);
    this.exitDoor=this.worldBox('arena-escape-blast-door',[14,10,.8],[0,5.4,finalArenaZ(242)],this.panel,true);
    this.worldBox('arena-exit-header',[24,roof-10.4,2],[0,(roof+10.4)/2,finalArenaZ(242)],this.white,true);
    this.worldBox('arena-escape-floor',[24,.8,65],[0,0,finalArenaZ(249)],this.panel,true);
    for(const side of [-1,1])this.worldBox(`escape-corridor-${side}`,[1,roof,65],[side*12,roof/2,finalArenaZ(249)],this.white,true);
    this.worldBox('arena-ceiling',[204,1,204],[0,roof+.5,z],this.dark,true);
    this.hatch=this.worldBox('overhead-deployment-hatch',[54,1.4,54],[0,roof-.8,z],this.panel);
    for(const side of [-1,1]) {
      this.worldBox(`hatch-rail-${side}`,[2,2,114],[side*29,roof-2,z],this.steel);
      for(let i=0;i<6;i++)this.worldBox(`hatch-status-${side}-${i}`,[.2,.12,5],[side*29,roof-3.05,z-24+i*9],this.cyan);
    }
    // Physical cover is on the annulus, never laid across the abyss.
    for(let i=0;i<6;i++) {
      const assembly=new THREE.Group();assembly.name=`destructible-lab-cover-${i}`;this.coverAssemblies.push(assembly);this.root.add(assembly);
      const a=-Math.PI/2+(i+.5)*Math.PI/3,r=88;
      const x=Math.cos(a)*r,zz=z+Math.sin(a)*r;
      const block=this.worldBox(`arena-cover-${i}`,[7,4.2,3.2],[x,2.5,zz],this.white,true);
      block.rotation.y=-a;this.cover.push(block);
      assembly.add(block);
      const cap=this.worldBox(`cover-cap-${i}`,[7.3,.3,3.5],[x,4.75,zz],this.panel);cap.rotation.y=-a;
      assembly.add(cap);
      for(let n=0;n<5;n++) {
        const vent=this.worldBox(`cover-vent-${i}-${n}`,[.13,2.4,.12],[x-2+n,2.8,zz-1.68],this.steel);vent.rotation.y=-a;
        assembly.add(vent);
      }
      this.batchStaticBoxes(assembly);
    }
    this.sign('EXTERMINATION  /  04',[0,10,190.6],0,[11,1.3]);
    this.sign('EMERGENCY EGRESS',[0,12,finalArenaZ(242)-.6],Math.PI,[13,1.5]);
    this.sign('OBSERVATION  /  CONTAINMENT CONTROL',[0,35,z+98.1],Math.PI,[31,2]);
    this.buildSectors();
    for(const x of [-52,52])for(const dz of [-52,52]) {
      const light=new THREE.PointLight(0xd6edf5,0,185,2);light.position.set(x,30,z+dz);
      light.castShadow=false;this.lights.push(light);this.root.add(light);
      this.worldBox(`arena-lamp-${x}-${dz}`,[12,.4,3],[x,31,z+dz],this.lamp);
      for(const side of [-1,1])this.worldBox(`arena-lamp-cable-${x}-${dz}-${side}`,[.16,roof-32,.16],[x+side*4.8,(roof+32)/2,z+dz],this.steel);
    }
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4,r=82;
      const fragment=this.worldBox(`authored-armour-fragment-${i}`,[2.5,.25,3],[Math.cos(a)*r,.6,z+Math.sin(a)*r],this.steel);
      fragment.visible=false;fragment.rotation.set(0,i*.7,.1);this.armourFragments.push(fragment);
    }
    const floor=new THREE.Mesh(this.geometry(new THREE.CircleGeometry(61.8,96)),this.basic(0x02060a));
    floor.name='distant-shaft-bottom';floor.rotation.x=-Math.PI/2;floor.position.set(0,bottom,z);this.root.add(floor);
    this.batchStaticBoxes();this.root.updateMatrixWorld(true);
  }

  private buildRing():void {
    const {innerRadius:inner,outerRadius:outer,radius,segments,thickness}=FINAL_ARENA_RING,z=FINAL_ARENA.centreZ;
    const step=Math.PI*2/segments,width=2*outer*Math.tan(step/2)+.04;
    // Collision sources retain visible=true and unit scale for sphere sweeps.
    // The exact visual annulus hides tangent seams without adding a pit floor.
    for(let i=0;i<segments;i++) {
      const a=i*step;
      const deck=this.worldBox(`annular-deck-${i}`,[width,thickness,outer-inner],[Math.cos(a)*(inner+outer)/2,FINAL_ARENA.floorY-thickness/2,z+Math.sin(a)*(inner+outer)/2],this.panel,true);
      deck.rotation.y=-a+Math.PI/2;deck.userData.annularDeck=true;deck.layers.set(31);this.ringDecks.push(deck);
    }
    const floorMaterial=this.material(0xd4e0e1,.71,.18,0x15252e,.2);
    const map=this.floorTexture();if(map){floorMaterial.map=map;map.repeat.set(26,26);}
    this.ring('continuous-lab-walkway',inner,outer,FINAL_ARENA.floorY,floorMaterial);
    this.ring('walkway-inner-metal-lip',inner-.12,inner+.4,.425,this.steel);
    this.ring('walkway-inner-hazard-band',inner+.55,inner+1.35,.43,this.amber);
    this.ring('walkway-inner-guide',inner+1.5,inner+1.62,.44,this.cyan);
    this.ring('walkway-outer-guide',outer-2.4,outer-2.25,.44,this.cyan);
    for(let i=0;i<64;i++) {
      const a=i*Math.PI/32;
      const seam=this.worldBox(`ring-expansion-joint-${i}`,[.09,.015,outer-inner-3],[Math.cos(a)*radius,.415,z+Math.sin(a)*radius],this.steel);
      seam.rotation.y=-a+Math.PI/2;
      if(i%4===0) {
        const dash=this.worldBox(`inner-warning-dash-${i}`,[1.6,.02,.85],[Math.cos(a)*(inner+.95),.45,z+Math.sin(a)*(inner+.95)],this.dark);
        dash.rotation.y=-a+Math.PI/4;
      }
    }
  }
  private buildShaft():void {
    const z=FINAL_ARENA.centreZ,inner=FINAL_ARENA_RING.innerRadius;
    const shaftMaterial=new THREE.MeshBasicMaterial({color:0x263e4b,side:THREE.BackSide});
    shaftMaterial.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float shaftDepth;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nshaftDepth=(modelMatrix*vec4(position,1.)).y;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float shaftDepth;')
        .replace('#include <opaque_fragment>','diffuseColor.rgb*=mix(.018,.85,exp(min(shaftDepth,0.)*.017));\n#include <opaque_fragment>');
    };
    this.materials.add(shaftMaterial);
    const wall=new THREE.Mesh(this.geometry(new THREE.CylinderGeometry(inner,inner,520,96,1,true)),shaftMaterial);
    wall.name='abyss-vertical-liner';wall.position.set(0,-260,z);this.root.add(wall);
    for(const [level,y] of [-7,-24,-51,-87,-139,-210,-305,-420,-509].entries()) {
      const shade=Math.max(.006,.24*Math.exp(y*.014));
      const mat=this.basic(new THREE.Color().setRGB(shade*.55,shade*.8,shade).getHex());
      this.ring(`shaft-service-ring-${level}`,inner-.6,inner+.1,y,mat);
      for(let i=0;i<16;i++) {
        const a=i*Math.PI/8;
        const stripe=this.worldBox(`shaft-depth-marker-${level}-${i}`,[.45,3,.15],[Math.cos(a)*(inner-.1),y+2,z+Math.sin(a)*(inner-.1)],mat);
        stripe.rotation.y=-a+Math.PI/2;
      }
    }
    // Local fog only: never wash out Level 3's earlier darkness puzzles.
    for(const [i,y] of [-65,-130,-225,-345,-455].entries()) {
      const mat=new THREE.MeshBasicMaterial({color:0x02080d,transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide});
      this.materials.add(mat);
      const fog=new THREE.Mesh(this.geometry(new THREE.CircleGeometry(inner-.2,96)),mat);
      fog.name=`shaft-depth-haze-${i}`;fog.rotation.x=-Math.PI/2;fog.position.set(0,y,z);this.root.add(fog);
    }
  }
  private buildLaboratory():void {
    const {centreZ:z,ceilingY:roof}=FINAL_ARENA;
    for(let i=0;i<64;i++) {
      const a=i*Math.PI/32,x=Math.cos(a)*101,zz=z+Math.sin(a)*101;
      if(Math.abs(x)<11&&Math.abs(zz-z)>95)continue;
      const wall=this.worldBox(`lab-wall-${i}`,[10.1,roof,2],[x,roof/2,zz],this.white,true);wall.rotation.y=-a+Math.PI/2;
      const rib=this.worldBox(`lab-wall-seam-${i}`,[.18,roof,2.3],[x,roof/2,zz],this.steel);rib.rotation.copy(wall.rotation);
      for(const y of [13,37,65,88]) {
        const panel=this.worldBox(`lab-panel-${i}-${y}`,[8.6,11,.16],[Math.cos(a)*99.88,y,z+Math.sin(a)*99.88],i%3===0?this.panel:this.white);panel.rotation.copy(wall.rotation);
        const light=this.worldBox(`lab-recessed-light-${i}-${y}`,[.28,7,.25],[Math.cos(a)*99.65,y,z+Math.sin(a)*99.65],this.lamp);light.rotation.copy(wall.rotation);
      }
      if(i%4===0) {
        const plinth=this.worldBox(`lab-utility-panel-${i}`,[6,4,.28],[Math.cos(a)*99.45,3.3,z+Math.sin(a)*99.45],this.panel);plinth.rotation.copy(wall.rotation);
        const stripe=this.worldBox(`lab-teal-band-${i}`,[6,.3,.3],[Math.cos(a)*99.25,5.2,z+Math.sin(a)*99.25],this.cyan);stripe.rotation.copy(wall.rotation);
      }
    }
    this.worldBox('observation-window-frame',[39,13,2],[0,27,z+100],this.steel);
    this.worldBox('observation-window',[36,10,.3],[0,27,z+98.8],this.material(0x133c48,.18,.55,0x082533,.4));
    for(const x of [-12,0,12])this.worldBox(`observation-mullion-${x}`,[.3,10,.4],[x,27,z+98.5],this.panel);
    this.worldBox('observation-light-strip',[35,.12,.3],[0,31.7,z+98.3],this.lamp);
  }
  private buildOrbiters():void {
    const {size,thickness,count}=FINAL_ARENA_ORBIT;
    for(let i=0;i<count;i++) {
      const collider=this.worldBox(`orbit-platform-collider-${i}`,[size,thickness,size],[0,0,0],this.steel,true);
      collider.layers.set(31);collider.userData.orbitPlatform=i;collider.userData.preciseSweepCorners=true;
      const visual=new THREE.Group();visual.name=`orbiting-square-platform-${i}`;this.root.add(visual);
      const add=(name:string,s:[number,number,number],p:[number,number,number],m:THREE.Material)=>{
        const mesh=new THREE.Mesh(this.boxGeometry(s),m);mesh.name=name;mesh.position.set(...p);visual.add(mesh);return mesh;
      };
      add('lift-underside',[size,thickness,size],[0,0,0],this.steel);
      add('lift-white-deck',[size-.3,.13,size-.3],[0,thickness/2+.03,0],this.white);
      add('lift-deck-inlay',[size-1.5,.025,size-1.5],[0,thickness/2+.11,0],this.panel);
      for(const side of [-1,1]) {
        add('lift-cyan-edge',[size,.13,.14],[0,.03,side*(size/2+.03)],this.cyan);
        add('lift-cyan-edge',[.14,.13,size],[side*(size/2+.03),.03,0],this.cyan);
        for(const end of [-1,1]) {
          add('lift-corner-bumper',[.7,.3,.7],[side*(size/2-.4),.32,end*(size/2-.4)],this.amber);
          add('lift-mag-drive',[1.4,.5,1.4],[side*2.8,-.65,end*2.8],this.dark);
          add('lift-mag-glow',[1,.08,1],[side*2.8,-.92,end*2.8],this.cyan);
        }
      }
      this.batchStaticBoxes(visual);
      this.platforms.push({collider,visual,previous:new THREE.Vector3(),current:new THREE.Vector3()});
    }
    this.resetPlatforms();
  }
  /** Called after locomotion, once per unpaused combat fixed step. */
  advancePlatforms(dt:number,body:KinematicBody):void {
    this.orbitTime+=dt;
    for(let i=0;i<this.platforms.length;i++) {
      const p=this.platforms[i]!,supported=body.isSupportedBy(p.collider);
      p.previous.copy(p.current);this.platformPose(i,this.orbitTime,p.current);
      p.collider.position.copy(p.current);p.collider.updateMatrixWorld(true);
      if(supported)body.applyCarrierDisplacement(this.displacement.subVectors(p.current,p.previous),p.collider);
    }
    this.presentPlatforms(1);
  }
  presentPlatforms(alpha:number):void {
    for(const p of this.platforms)p.visual.position.lerpVectors(p.previous,p.current,THREE.MathUtils.clamp(alpha,0,1));
  }
  /** Predict only the authored carrier, not the player's future input. */
  copyPredictedPlatformPosition(collider:THREE.Mesh,seconds:number,out:THREE.Vector3):boolean {
    const index=this.platforms.findIndex(p=>p.collider===collider);if(index<0)return false;
    this.platformPose(index,this.orbitTime+Math.max(0,seconds),out);return true;
  }
  private platformPose(index:number,time:number,out:THREE.Vector3):void {
    const o=FINAL_ARENA_ORBIT,a=-Math.PI/2+index*Math.PI/2+time*o.angularSpeed;
    const y=o.lowY+(o.highY-o.lowY)*(1-Math.cos(time*Math.PI*2/o.liftPeriodSeconds))/2;
    out.set(Math.cos(a)*o.radius,y-o.thickness/2,FINAL_ARENA.centreZ+Math.sin(a)*o.radius);
  }
  private resetPlatforms():void {
    this.orbitTime=0;
    for(let i=0;i<this.platforms.length;i++) {
      const p=this.platforms[i]!;this.platformPose(i,0,p.current);p.previous.copy(p.current);
      p.collider.position.copy(p.current);p.collider.updateMatrixWorld(true);p.visual.position.copy(p.current);
    }
  }
  private buildSectors():void {
    for(let i=0;i<6;i++) {
      const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
        uniforms:{uTime:{value:0},uWarning:{value:0},uActive:{value:0}},
        vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`varying vec3 vP;uniform float uTime,uWarning,uActive;void main(){
          float pulse=.65+.35*sin(uTime*8.);float grid=step(.94,fract(length(vP.xy)*.4));
          vec3 col=mix(vec3(1.,.5,.1),vec3(1.,.06,.14),uActive);
          gl_FragColor=vec4(col,uWarning*(.22+grid*.35)*pulse+uActive*.65);}`});
      this.materials.add(mat);
      const mesh=new THREE.Mesh(this.geometry(new THREE.RingGeometry(FINAL_ARENA_RING.innerRadius+.1,FINAL_ARENA_RING.outerRadius,32,1,i*Math.PI/3+.006,Math.PI/3-.012)),mat);
      mesh.name=`electrified-sector-${i}`;mesh.visible=false;mesh.rotation.x=-Math.PI/2;mesh.position.set(0,.46,FINAL_ARENA.centreZ);this.sectors.push(mesh);this.root.add(mesh);
    }
  }
  setPowered(powered:boolean,phaseTwo=false,time=0):void {
    for(const light of this.lights){light.intensity=powered?(phaseTwo?4300:5600):0;light.color.setHex(phaseTwo?0xffb8b1:0xd6edf5);}
    for(const sector of this.sectors)sector.material.uniforms.uTime!.value=time;
  }
  setSector(index:number,state:'inactive'|'warning'|'active'):void {
    this.sectors[index]!.visible=state!=='inactive';
    const u=this.sectors[index]!.material.uniforms;u.uWarning!.value=state==='warning'?1:0;u.uActive!.value=state==='active'?1:0;
  }
  setDoors(closed:boolean,exitOpen=false):void {
    this.entryDoor.position.y=closed?4.4:12;this.exitDoor.position.y=exitOpen?18:5.4;
    this.entryDoor.updateMatrixWorld(true);this.exitDoor.updateMatrixWorld(true);
  }
  deployment(progress:number):void {this.hatch.position.x=THREE.MathUtils.smoothstep(progress,0,1)*58;}
  setDamaged(damaged:boolean):void {for(const fragment of this.armourFragments)fragment.visible=damaged;}
  breakCoverAlong(start:THREE.Vector3,end:THREE.Vector3,radius:number,onBreak?:(at:THREE.Vector3)=>void):number {
    this.coverLine.set(start,end);let count=0;
    this.cover.forEach((mesh,i)=>{
      if(!mesh.visible)return;
      this.coverLine.closestPointToPoint(mesh.position,true,this.coverPoint);
      if(this.coverPoint.distanceToSquared(mesh.position)>(radius+4)**2)return;
      mesh.visible=false;this.coverAssemblies[i]!.visible=false;count++;onBreak?.(mesh.position);
    });return count;
  }
  reset():void {
    this.setDoors(false);this.deployment(0);this.setDamaged(false);this.setPowered(false);this.resetPlatforms();
    for(let i=0;i<6;i++)this.setSector(i,'inactive');
    this.cover.forEach((mesh,i)=>{mesh.visible=true;this.coverAssemblies[i]!.visible=true;});
  }
  dispose():void {
    this.root.traverse(child=>{if(child instanceof THREE.InstancedMesh)child.dispose();});
    this.root.removeFromParent();this.root.clear();for(const g of this.geometries)g.dispose();
    for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();
  }
  private geometry<T extends THREE.BufferGeometry>(g:T):T {this.geometries.add(g);return g;}
  private boxGeometry(size:[number,number,number]):THREE.BoxGeometry {
    const key=size.join('/');let g=this.boxGeometries.get(key);
    if(!g){g=this.geometry(new THREE.BoxGeometry(...size));this.boxGeometries.set(key,g);}return g;
  }
  private worldBox(name:string,size:[number,number,number],pos:[number,number,number],material:THREE.Material,solid=false):THREE.Mesh {
    const mesh=new THREE.Mesh(this.boxGeometry(size),material);mesh.name=name;mesh.position.set(...pos);mesh.userData.surfaceTag='default';
    this.root.add(mesh);if(solid)this.collisionMeshes.push(mesh);return mesh;
  }
  private ring(name:string,inner:number,outer:number,y:number,material:THREE.Material):THREE.Mesh {
    const mesh=new THREE.Mesh(this.geometry(new THREE.RingGeometry(inner,outer,192)),material);
    mesh.name=name;mesh.rotation.x=-Math.PI/2;mesh.position.set(0,y,FINAL_ARENA.centreZ);this.root.add(mesh);return mesh;
  }
  private material(color:number,roughness:number,metalness:number,emissive=0,emissiveIntensity=1):THREE.MeshStandardMaterial {
    const m=new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity});this.materials.add(m);return m;
  }
  private basic(color:number):THREE.MeshBasicMaterial {const m=new THREE.MeshBasicMaterial({color});this.materials.add(m);return m;}
  private batchStaticBoxes(parent:THREE.Object3D=this.root):void {
    const groups=new Map<THREE.Material,THREE.Mesh<THREE.BoxGeometry>[]>();
    for(const object of parent.children) {
      if(!(object instanceof THREE.Mesh)||!(object.geometry instanceof THREE.BoxGeometry)||Array.isArray(object.material))continue;
      if(object===this.entryDoor||object===this.exitDoor||object===this.hatch||this.armourFragments.includes(object)||object.userData.annularDeck||object.userData.orbitPlatform!==undefined)continue;
      const group=groups.get(object.material)??[];group.push(object);groups.set(object.material,group);
    }
    const geometry=this.boxGeometry([1,1,1]),matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
    for(const [material,sources] of groups) {
      const batch=new THREE.InstancedMesh(geometry,material,sources.length);batch.name='lab-static-batch';
      sources.forEach((source,index)=>{
        const size=source.geometry.parameters;scale.set(size.width,size.height,size.depth);matrix.compose(source.position,source.quaternion,scale);batch.setMatrixAt(index,matrix);
        if(parent===this.root||this.cover.includes(source))source.layers.set(31);else source.removeFromParent();
      });batch.computeBoundingSphere();parent.add(batch);
    }
  }
  private floorTexture():THREE.CanvasTexture|undefined {
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const c=canvas.getContext?.('2d');if(!c)return;
    c.fillStyle='#d9e3e5';c.fillRect(0,0,256,256);c.strokeStyle='#9faeb5';c.lineWidth=2;c.strokeRect(0,0,256,256);
    c.strokeStyle='#e6edef';c.lineWidth=2;c.strokeRect(5,5,246,246);
    for(const x of [10,246])for(const y of [10,246]){c.fillStyle='#87969d';c.fillRect(x-1,y-1,3,3);}
    for(let i=0;i<75;i++){c.fillStyle=`rgba(54,79,91,${.025+i%3*.008})`;c.fillRect((i*73)%250,(i*139)%250,3+i%11,1);}
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;this.textures.add(t);return t;
  }
  private sign(text:string,pos:[number,number,number],rotation:number,size:[number,number]):void {
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=192;const c=canvas.getContext?.('2d');if(!c)return;
    c.fillStyle='#172c38';c.fillRect(0,0,1536,192);c.fillStyle='#75d8cb';c.fillRect(0,0,16,192);
    c.fillStyle='#dce9eb';c.font='50px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(text,775,96,1480);
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;this.textures.add(t);
    const m=new THREE.MeshBasicMaterial({map:t});this.materials.add(m);const mesh=new THREE.Mesh(this.geometry(new THREE.PlaneGeometry(...size)),m);
    mesh.position.set(...pos);mesh.rotation.y=rotation;this.root.add(mesh);
  }
}
