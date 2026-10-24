import * as THREE from 'three';
import { ExterminationMaterials } from './ExterminationMaterials.ts';
import { EXTERMINATION_LAIR_COVER } from './ExterminationLairLayout.ts';
import { applyLairMaterials, loadExterminationLairAsset, type ExterminationLairAsset } from './ExterminationLairAsset.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { FINAL_ARENA, FINAL_ARENA_RING, FINAL_ARENA_ORBIT, FINAL_BOSS_TUNING as T, finalArenaZ } from './FinalBossConfig.ts';

type OrbitPlatform={collider:THREE.Mesh;visual:THREE.Group;previous:THREE.Vector3;current:THREE.Vector3};
interface CoverState { readonly mesh:THREE.Mesh;readonly maximumHealth:number;health:number;lastBeamSerial:number|undefined; }

/** Physics stays explicit; the fitted Blender asset owns the visible architecture. */
export class ExterminationArena {
  readonly root=new THREE.Group();
  readonly collisionMeshes:THREE.Mesh[]=[];
  readonly entryDoor:THREE.Mesh;
  readonly exitDoor:THREE.Mesh;
  readonly cover:THREE.Mesh[]=[];
  readonly coverAssemblies:THREE.Group[]=[];
  private readonly coverStates:CoverState[]=[];
  get coverHealth():readonly Readonly<CoverState>[] {return this.coverStates;}
  readonly ringDecks:THREE.Mesh[]=[];
  readonly platforms:OrbitPlatform[]=[];
  readonly sectors:THREE.Mesh<THREE.RingGeometry,THREE.ShaderMaterial>[]=[];
  readonly armourFragments:THREE.Mesh[]=[];
  readonly surfaceMaterials=new ExterminationMaterials();
  private readonly geometries=new Set<THREE.BufferGeometry>();
  private readonly materials=new Set<THREE.Material>();
  private readonly boxGeometries=new Map<string,THREE.BoxGeometry>();
  private readonly colliderMaterial=new THREE.MeshStandardMaterial({color:0xd9e4e5,visible:false});
  private readonly white=this.surfaceMaterials.get('ivory');
  private readonly panel=this.surfaceMaterials.get('coolPanel');
  private readonly steel=this.surfaceMaterials.get('steel');
  private readonly dark=this.surfaceMaterials.get('rubber');
  private readonly cyan=new THREE.MeshBasicMaterial({color:0x76e4d7});
  private readonly amber=this.surfaceMaterials.get('hazard');
  private readonly lights:THREE.PointLight[]=[];
  private readonly emergencyLights:THREE.PointLight[]=[];
  private readonly reactorLights:THREE.PointLight[]=[];
  private readonly artLamps:THREE.MeshStandardMaterial[]=[];
  private readonly hatch=new THREE.Group();
  private readonly placeholder=new THREE.Group();
  private readonly coverLine=new THREE.Line3();
  private readonly coverPoint=new THREE.Vector3();
  private readonly displacement=new THREE.Vector3();
  private readonly abort=new AbortController();
  private orbitTime=0;
  private powered=false;
  private phaseTwo=false;
  private artReady=false;
  private preparation:Promise<void>|undefined;
  private disposed=false;

  constructor(options:{orbitingPlatforms?:boolean}={}) {
    this.root.name='level-3-room-4-extermination-chamber';
    this.materials.add(this.colliderMaterial);this.materials.add(this.cyan);
    const {centreZ:z,ceilingY:roof}=FINAL_ARENA;
    const {innerRadius:inner,outerRadius:outer,segments,thickness}=FINAL_ARENA_RING;
    const step=Math.PI*2/segments,width=2*outer*Math.tan(step/2)+.04;
    for(let i=0;i<segments;i++) {
      const a=i*step,deck=this.worldBox(`annular-deck-${i}`,[width,thickness,outer-inner],[Math.cos(a)*(inner+outer)/2,FINAL_ARENA.floorY-thickness/2,z+Math.sin(a)*(inner+outer)/2],this.steel,true);
      deck.rotation.y=-a+Math.PI/2;deck.userData.annularDeck=true;this.ringDecks.push(deck);
    }
    for(let i=0;i<64;i++) {
      const a=i*Math.PI/32,x=Math.cos(a)*101,zz=z+Math.sin(a)*101;
      if(Math.abs(x)<11&&Math.abs(zz-z)>95)continue;
      const wall=this.worldBox(`lab-wall-${i}`,[10.1,roof,2],[x,roof/2,zz],this.white,true);wall.rotation.y=-a+Math.PI/2;
    }
    this.entryDoor=this.worldBox('arena-entry-blast-door',[13,8,.65],[0,12,190],this.white,true);
    this.worldBox('arena-entry-header',[13,roof-8.4,1],[0,(roof+8.4)/2,190],this.white,true);
    this.worldBox('arena-entry-hallway-soffit-seal',[13,1,.5],[0,7.9,190.25],this.white,true);
    // A stepped, rising soffit closes the frame without lowering the flight
    // clearance over the ring. Each visible step has the same solid envelope.
    const entrySteps=[[15,190.5,193],[22,193,195.5],[28,195.5,199]] as const;
    for(const [i,[bottom,front,back]] of entrySteps.entries())
      this.worldBox(`arena-entry-soffit-${i}`,[13,roof-bottom,back-front],[0,(roof+bottom)/2,(front+back)/2],this.white,true);
    for(const side of [-1,1])this.worldBox(`arena-entry-jamb-${side}`,[17,roof,12],[side*15,roof/2,193],this.white,true);
    this.exitDoor=this.worldBox('arena-escape-blast-door',[14,10,.8],[0,5.4,finalArenaZ(242)],this.white,true);
    this.worldBox('arena-exit-header',[24,roof-10.4,4.5],[0,(roof+10.4)/2,finalArenaZ(242)+.75],this.white,true);
    for(const side of [-1,1])this.worldBox(`arena-exit-jamb-${side}`,[17,roof,4.5],[side*15.5,roof/2,finalArenaZ(242)+.75],this.white,true);
    this.worldBox('arena-escape-floor',[24,.8,65],[0,0,finalArenaZ(249)],this.white,true);
    for(const side of [-1,1])this.worldBox(`escape-corridor-${side}`,[1,roof,65],[side*12,roof/2,finalArenaZ(249)],this.white,true);
    this.worldBox('arena-ceiling',[204,1,204],[0,roof+.5,z],this.white,true);
    this.hatch.name='lair-deployment-hatch-rig';this.hatch.position.set(0,95.2,z);this.root.add(this.hatch);
    for(const [i,definition] of EXTERMINATION_LAIR_COVER.entries()) {
      const assembly=new THREE.Group();assembly.name=`destructible-lab-cover-${i}`;this.coverAssemblies.push(assembly);this.root.add(assembly);
      const block=this.worldBox(`arena-cover-${i}`,[...definition.size],[Math.cos(definition.angle)*definition.radius,FINAL_ARENA.floorY+definition.size[1]/2,z+Math.sin(definition.angle)*definition.radius],this.white,true);
      block.rotation.y=definition.yaw;block.userData.ramClearRadius=Math.hypot(definition.size[0],definition.size[2])/2;
      assembly.add(block);this.cover.push(block);
      const maximumHealth=T.playerHealth*T.coverHealthMultiplier;
      this.coverStates.push({mesh:block,maximumHealth,health:maximumHealth,lastBeamSerial:undefined});
    }
    if(options.orbitingPlatforms??FINAL_ARENA_ORBIT.enabled)this.buildOrbiters();
    this.buildSectors();
    for(const x of [-52,52])for(const dz of [-52,52]) {
      const light=new THREE.PointLight(0xe0e9e5,0,185,2);light.position.set(x,30,z+dz);light.castShadow=false;this.lights.push(light);this.root.add(light);
    }
    for(const x of [-60,60]) {
      const light=new THREE.PointLight(0xff5037,0,85,2);light.position.set(x,26,z+52);light.castShadow=false;this.emergencyLights.push(light);this.root.add(light);
    }
    for(const [x,y,dz] of [[-82,30,0],[0,80,0]] as const) {
      const light=new THREE.PointLight(0xff321b,0,110,2);light.position.set(x,y,z+dz);light.castShadow=false;this.reactorLights.push(light);this.root.add(light);
    }
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4,fragment=this.worldBox(`authored-armour-fragment-${i}`,[2.5,.25,3],[Math.cos(a)*82,.6,z+Math.sin(a)*82],this.steel);
      fragment.visible=false;fragment.rotation.set(0,i*.7,.1);this.armourFragments.push(fragment);
    }
    // Minimal synchronous preview for physics-only tools; preparation replaces it.
    this.placeholder.name='lair-unprepared-preview';
    const floor=new THREE.Mesh(this.geometry(new THREE.RingGeometry(inner,outer,192)),this.surfaceMaterials.get('floor'));
    floor.name='continuous-lab-walkway';floor.rotation.x=-Math.PI/2;floor.position.set(0,FINAL_ARENA.floorY,z);this.placeholder.add(floor);this.root.add(this.placeholder);
    this.root.updateMatrixWorld(true);
  }

  prepare():Promise<void> {
    if(this.preparation)return this.preparation;
    if(typeof window==='undefined'||new URL(import.meta.url).protocol==='file:')return Promise.resolve();
    return this.preparation=Promise.allSettled([this.surfaceMaterials.ready,loadExterminationLairAsset(this.abort.signal)]).then(([maps,art])=>{
      if(art.status==='rejected')throw art.reason;
      if(maps.status==='rejected'||this.disposed) {
        this.disposeUnadoptedAsset(art.value);
        if(maps.status==='rejected')throw maps.reason;
        return;
      }
      this.adoptArt(art.value);
    });
  }
  adoptArt(asset:ExterminationLairAsset):void {
    if(this.artReady||this.disposed)throw new Error('Lair art can only be adopted once by a live arena.');
    asset.root.traverse(o=>{if(o instanceof THREE.Mesh)this.geometries.add(o.geometry);});
    for(const material of applyLairMaterials(asset,this.surfaceMaterials)) {
      this.materials.add(material);
      if(material instanceof THREE.MeshStandardMaterial)this.artLamps.push(material);
    }
    const attach=(object:THREE.Object3D,parent:THREE.Object3D)=>{object.removeFromParent();object.position.set(0,0,0);parent.add(object);};
    attach(asset.staticRoot,this.root);asset.staticRoot.position.z=FINAL_ARENA.centreZ;
    attach(asset.entryDoor,this.entryDoor);attach(asset.exitDoor,this.exitDoor);attach(asset.hatch,this.hatch);
    for(const [i,definition] of EXTERMINATION_LAIR_COVER.entries()) {
      const art=asset.coverTemplates[definition.template]!.clone(true);art.name=`lair-cover-art-${i}`;art.position.set(0,0,0);
      art.scale.set(definition.size[0]/7,definition.size[1]/4.2,definition.size[2]/3.2);this.cover[i]!.add(art);
    }
    asset.root.clear();this.placeholder.removeFromParent();this.artReady=true;this.setPowered(this.powered,this.phaseTwo);
    this.root.updateMatrixWorld(true);
  }
  get artDiagnostics(){return {...this.surfaceMaterials.diagnostics,ready:this.artReady,coverCount:this.cover.length};}
  private disposeUnadoptedAsset(asset:ExterminationLairAsset):void {
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    asset.root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of [o.material].flat())materials.add(m);}});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();asset.root.clear();
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
    this.powered=powered;this.phaseTwo=phaseTwo;
    for(const light of this.lights){light.intensity=powered?(phaseTwo?5400:6000):0;light.color.setHex(phaseTwo?0xd2dce0:0xe0e9e5);}
    for(const light of this.emergencyLights)light.intensity=powered&&phaseTwo?1600:0;
    for(const light of this.reactorLights)light.intensity=powered?1800:0;
    for(const m of this.artLamps) {
      m.emissiveIntensity=m.name.includes('EmergencyLight')?(powered&&phaseTwo?2:0):m.name.includes('ReactorLight')?(powered?(phaseTwo?1.9:1.4):.05):m.name.includes('GuideLight')?(powered?2:.03):m.name.includes('KeyLight')?(powered?2.2:.03):m.emissiveIntensity;
    }
    for(const sector of this.sectors)sector.material.uniforms.uTime!.value=time;
  }
  setSector(index:number,state:'inactive'|'warning'|'active'):void {
    this.sectors[index]!.visible=state!=='inactive';const u=this.sectors[index]!.material.uniforms;
    u.uWarning!.value=state==='warning'?1:0;u.uActive!.value=state==='active'?1:0;
  }
  setDoors(closed:boolean,exitOpen=false):void {
    this.entryDoor.position.y=closed?4.4:12;this.exitDoor.position.y=exitOpen?18:5.4;
    this.entryDoor.updateMatrixWorld(true);this.exitDoor.updateMatrixWorld(true);
  }
  deployment(progress:number):void {
    // Lift through the aperture before sliding above the roof/cradle.
    this.hatch.position.y=95.2+THREE.MathUtils.smoothstep(progress,0,.2)*5.2;
    this.hatch.position.x=THREE.MathUtils.smoothstep(progress,.2,1)*58;
  }
  setDamaged(damaged:boolean):void {for(const fragment of this.armourFragments)fragment.visible=damaged;}
  damageCover(collider:THREE.Object3D|null,amount:number,onBreak?:(at:THREE.Vector3)=>void,beamSerial?:number):boolean {
    if(!collider||!Number.isFinite(amount)||amount<=0)return false;
    const index=this.cover.findIndex(mesh=>mesh===collider),state=this.coverStates[index];
    if(!state||state.health<=0||!state.mesh.visible||beamSerial!==undefined&&state.lastBeamSerial===beamSerial)return false;
    if(beamSerial!==undefined)state.lastBeamSerial=beamSerial;
    state.health=Math.max(0,state.health-amount);
    if(state.health===0)this.destroyCover(index,onBreak);
    return true;
  }
  private destroyCover(index:number,onBreak?:(at:THREE.Vector3)=>void):void {
    const state=this.coverStates[index]!;state.health=0;state.mesh.visible=false;this.coverAssemblies[index]!.visible=false;onBreak?.(state.mesh.position);
  }
  breakCoverAlong(start:THREE.Vector3,end:THREE.Vector3,radius:number,onBreak?:(at:THREE.Vector3)=>void):number {
    this.coverLine.set(start,end);let count=0;
    this.cover.forEach((mesh,i)=>{
      if(!mesh.visible)return;this.coverLine.closestPointToPoint(mesh.position,true,this.coverPoint);
      if(this.coverPoint.distanceToSquared(mesh.position)>(radius+Number(mesh.userData.ramClearRadius??4))**2)return;
      this.destroyCover(i,onBreak);count++;
    });return count;
  }
  reset():void {
    this.setDoors(false);this.deployment(0);this.setDamaged(false);this.setPowered(false);this.resetPlatforms();
    for(let i=0;i<6;i++)this.setSector(i,'inactive');this.cover.forEach((mesh,i)=>{mesh.visible=true;this.coverAssemblies[i]!.visible=true;const state=this.coverStates[i]!;state.health=state.maximumHealth;state.lastBeamSerial=undefined;});
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;this.abort.abort();
    this.root.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});this.root.removeFromParent();this.root.clear();
    for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();this.surfaceMaterials.dispose();
  }
  private geometry<T extends THREE.BufferGeometry>(g:T):T {this.geometries.add(g);return g;}
  private boxGeometry(size:[number,number,number]):THREE.BoxGeometry {
    const key=size.join('/');let g=this.boxGeometries.get(key);if(!g){g=this.geometry(new THREE.BoxGeometry(...size));this.boxGeometries.set(key,g);}return g;
  }
  private worldBox(name:string,size:[number,number,number],pos:[number,number,number],material:THREE.Material,solid=false):THREE.Mesh {
    const mesh=new THREE.Mesh(this.boxGeometry(size),solid?this.colliderMaterial:material);mesh.name=name;mesh.position.set(...pos);mesh.userData.surfaceTag='default';
    this.root.add(mesh);if(solid){mesh.layers.set(31);this.collisionMeshes.push(mesh);}return mesh;
  }
  private batchStaticBoxes(parent:THREE.Object3D=this.root):void {
    const groups=new Map<THREE.Material,THREE.Mesh<THREE.BoxGeometry>[]>();
    for(const object of parent.children) {
      if(!(object instanceof THREE.Mesh)||!(object.geometry instanceof THREE.BoxGeometry)||Array.isArray(object.material))continue;
      if(object===this.entryDoor||object===this.exitDoor||this.armourFragments.includes(object)||object.userData.annularDeck||object.userData.orbitPlatform!==undefined)continue;
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
}
