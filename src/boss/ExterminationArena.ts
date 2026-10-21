import * as THREE from 'three';
import { FINAL_ARENA } from './FinalBossConfig.ts';

/** Authored, resettable scenery. Solid sizes are baked for sphere sweeps. */
export class ExterminationArena {
  readonly root = new THREE.Group();
  readonly collisionMeshes: THREE.Mesh[] = [];
  readonly entryDoor: THREE.Mesh;
  readonly exitDoor: THREE.Mesh;
  readonly cover: THREE.Mesh[] = [];
  readonly sectors: THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial>[] = [];
  readonly armourFragments: THREE.Mesh[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly lights: THREE.PointLight[] = [];
  private readonly steel = this.material(0x182830, .65, .65);
  private readonly dark = this.material(0x090f16, .8, .5);
  private readonly concrete = this.material(0x26383d, .88, .15);
  private readonly cyan = this.material(0x45e9da, .4, .25, 0x22c9b8);
  private readonly amber = this.material(0xffbd47, .5, .3, 0xff7e16);
  private readonly hatch: THREE.Mesh;
  private readonly signs: THREE.MeshBasicMaterial[] = [];

  constructor() {
    this.root.name = 'level-3-room-4-extermination-chamber';
    const z = FINAL_ARENA.centreZ;
    this.box('arena-foundation', [53,.8,53], [0,0,z], this.concrete, true);
    // The entrance and exit have genuine openings, not overlapping wall faces.
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2;
      const x = Math.cos(angle) * 26, dz = Math.sin(angle) * 26;
      if (Math.abs(x) > 7 || Math.abs(dz) < 23) {
        const wall = this.box(`arena-wall-${i}`, [5.25,25,.7], [x,12.5,z+dz], i%2?this.dark:this.steel, true);
        wall.rotation.y = -angle + Math.PI / 2;
        const rib = this.box(`arena-rib-${i}`, [.3,24,1.1], [x,12,z+dz], this.steel);
        rib.rotation.y = wall.rotation.y;
      }
      // A generous 7 m-wide perimeter; two gaps face the entry and escape.
      if ((Math.abs(x) > 7 || Math.abs(dz) < 19) && ![0,1,15,16,17,31].includes(i)) {
        const deck = this.box(`perimeter-deck-${i}`, [5, .55, 7], [Math.cos(angle)*21.8,3.125,z+Math.sin(angle)*21.8], this.steel, true);
        deck.rotation.y = -angle + Math.PI/2;
        const strip = this.box(`perimeter-guide-${i}`, [4.6,.05,.12], [Math.cos(angle)*24.6,3.43,z+Math.sin(angle)*24.6], this.cyan);
        strip.rotation.y = deck.rotation.y;
      }
    }
    for (const sign of [-1, 1]) {
      const ramp = this.box(`perimeter-access-ramp-${sign}`, [16,.45,5], [sign*13.5,1.7,z], this.concrete, true);
      ramp.rotation.z = sign*Math.atan(3/16);
      for(const end of [-1,1])this.box(`ramp-deck-connection-${sign}-${end}`,[6,.55,5],[sign*22,3.125,z+end*4.5],this.steel,true);
      for (let n=0;n<6;n++) this.box(`ramp-guide-${sign}-${n}`,[.7,.08,.12],[sign*(6+n*2),.55+n*.46,z+2.3],this.amber);
    }
    for (const [i,x,dz] of [[0,-11,-4],[1,11,-4],[2,0,9]]) {
      const block = this.box(`arena-cover-${i}`, [6,4.6,2.4], [x!,2.7,z+dz!], this.steel, true);
      this.cover.push(block);
      this.box(`cover-cap-${i}`, [6.3,.3,2.7], [x!,5.15,z+dz!], this.concrete);
      this.box(`cover-warning-${i}`, [5.4,.13,.06], [x!,4.6,z+dz!-1.23], this.amber);
      for(let n=0;n<3;n++) this.box(`cover-vent-${i}-${n}`, [1.2,.06,.08], [x!-1.7+n*1.7,3.8,z+dz!-1.25],this.dark);
    }
    this.entryDoor = this.box('arena-entry-blast-door', [13,8,.65], [0,12,190], this.steel, true);
    this.exitDoor = this.box('arena-escape-blast-door', [13,10,.8], [0,5.4,242], this.steel, true);
    this.box('arena-escape-floor',[14,.8,16],[0,0,249],this.concrete,true);
    for(const side of [-1,1]) this.box(`escape-corridor-${side}`,[.6,12,16],[side*7,6,249],this.steel,true);
    this.box('arena-ceiling',[53,.6,53],[0,25.4,z],this.dark,true);
    this.hatch = this.box('overhead-deployment-hatch',[13,.5,13],[0,24.9,z+2],this.steel);
    for(const side of [-1,1]) {
      this.box(`hatch-rail-${side}`,[.65,1.2,22],[side*7,24,z+2],this.amber);
      this.box(`overhead-support-${side}`,[52,1,1],[0,23,z+side*16],this.steel);
    }
    // Observation deck: bright silhouettes behind an inaccessible window.
    this.box('observation-deck',[18,.8,5],[0,13.6,238],this.steel);
    this.box('observation-window',[17,5,.1],[0,16.5,235.4],this.material(0x22494d,.2,.55));
    this.box('observation-window-glow',[16,.13,.2],[0,18.8,235.2],this.cyan);
    for (const x of [-3, 3]) {
      this.box(`observer-${x}`,[.7,1.7,.6],[x,15.8,235.15],this.dark);
      const head = new THREE.Mesh(this.geometry(new THREE.SphereGeometry(.3,8,6)),this.dark);
      head.position.set(x,16.9,235.15);this.root.add(head);
    }
    this.sign('EXTERMINATION / 04', [0,9,190.3], 0, [11,1.5]);
    this.sign('OBSERVATION CONTROL', [0,19.6,235.1], Math.PI, [12,1]);
    this.sign('EMERGENCY EGRESS', [0,11.2,241.5], Math.PI, [10,1.1]);
    for (let i=0;i<6;i++) {
      const floor = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, side:THREE.DoubleSide,
        uniforms:{uTime:{value:0},uWarning:{value:0},uActive:{value:0}},
        vertexShader:'varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`varying vec3 vP; uniform float uTime,uWarning,uActive;
          void main(){float grid=step(.9,fract(length(vP.xy)*.55));
          float pulse=.6+.4*sin(uTime*9.); vec3 col=mix(vec3(.08,.35,.38),vec3(1.,.47,.08),uWarning);
          col=mix(col,vec3(1.,.07,.12),uActive); gl_FragColor=vec4(col,(.035+grid*.15+uWarning*.28*pulse+uActive*.6));}`,
      });
      this.materials.add(floor);
      const mesh = new THREE.Mesh(this.geometry(new THREE.RingGeometry(2,25.4,12,1,i*Math.PI/3+.015,Math.PI/3-.03)),floor);
      mesh.rotation.x=-Math.PI/2;mesh.position.set(0,.415,z);mesh.name=`electrified-sector-${i}`;
      this.sectors.push(mesh);this.root.add(mesh);
    }
    for (const x of [-13,13]) for (const dz of [-12,12]) {
      const light=new THREE.PointLight(0x99e7ed,0,38,2);light.position.set(x,13,z+dz);
      light.castShadow=false;this.lights.push(light);this.root.add(light);
      this.box(`arena-lamp-${x}-${dz}`,[3,.14,1],[x,14,z+dz],this.cyan);
    }
    for(let i=0;i<8;i++) {
      const debris=this.box(`authored-armour-fragment-${i}`,[1.3,.2,1.5],[Math.cos(i)*9,.6,z+Math.sin(i)*9],this.steel);
      debris.visible=false;debris.rotation.set(i,.3*i,i*.1);this.armourFragments.push(debris);
    }
    this.batchStaticBoxes();
    this.root.updateMatrixWorld(true);
  }

  setPowered(powered:boolean, phaseTwo=false, time=0):void {
    for(const light of this.lights) {
      light.intensity=powered ? (phaseTwo?200+30*Math.sin(time*3):260):0;
      light.color.setHex(phaseTwo?0xff6659:0x99e7ed);
    }
    for(const sector of this.sectors) sector.material.uniforms.uTime!.value=time;
  }
  setSector(index:number, state:'inactive'|'warning'|'active'):void {
    const u=this.sectors[index]!.material.uniforms;u.uWarning!.value=state==='warning'?1:0;u.uActive!.value=state==='active'?1:0;
  }
  setDoors(closed:boolean, exitOpen=false):void {
    this.entryDoor.position.y=closed?4.4:12;
    this.exitDoor.position.y=exitOpen?16:5.4;
    this.entryDoor.updateMatrixWorld(true);this.exitDoor.updateMatrixWorld(true);
  }
  deployment(progress:number):void { this.hatch.position.x=THREE.MathUtils.smoothstep(progress,0,1)*14; }
  setDamaged(damaged:boolean):void { for(const fragment of this.armourFragments)fragment.visible=damaged; }
  reset():void {
    this.setDoors(false);this.deployment(0);this.setDamaged(false);this.setPowered(false);
    for(let i=0;i<6;i++)this.setSector(i,'inactive');
  }
  dispose():void {
    for(const child of this.root.children)if(child instanceof THREE.InstancedMesh)child.dispose();
    this.root.removeFromParent();this.root.clear();
    for(const geometry of this.geometries)geometry.dispose();
    for(const material of this.materials)material.dispose();
    for(const material of this.signs)material.map?.dispose();
  }
  private geometry<T extends THREE.BufferGeometry>(g:T):T { this.geometries.add(g);return g; }
  /** Keep visible=true for physics; isolate source draw layers from the camera. */
  private batchStaticBoxes():void {
    const groups=new Map<THREE.Material,THREE.Mesh<THREE.BoxGeometry>[]>();
    for(const object of this.root.children) {
      if(!(object instanceof THREE.Mesh)||!(object.geometry instanceof THREE.BoxGeometry)||Array.isArray(object.material))continue;
      if(object===this.entryDoor||object===this.exitDoor||object===this.hatch||this.armourFragments.includes(object))continue;
      const group=groups.get(object.material)??[];group.push(object);groups.set(object.material,group);
    }
    const geometry=this.geometry(new THREE.BoxGeometry(1,1,1)),matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
    for(const [material,sources] of groups) {
      const batch=new THREE.InstancedMesh(geometry,material,sources.length);batch.name=`arena-static-${material.uuid}`;
      sources.forEach((source,index)=>{
        const size=source.geometry.parameters;scale.set(size.width,size.height,size.depth);
        matrix.compose(source.position,source.quaternion,scale);batch.setMatrixAt(index,matrix);
        source.layers.set(31);
      });
      batch.computeBoundingSphere();this.root.add(batch);
    }
  }
  private material(color:number,roughness:number,metalness:number,emissive=0):THREE.MeshStandardMaterial {
    const m=new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity:1.5});this.materials.add(m);return m;
  }
  private box(name:string,size:[number,number,number],position:[number,number,number],material:THREE.Material,solid=false):THREE.Mesh {
    const mesh=new THREE.Mesh(this.geometry(new THREE.BoxGeometry(...size)),material);
    mesh.name=name;mesh.position.set(...position);mesh.userData.surfaceTag='default';mesh.receiveShadow=false;
    this.root.add(mesh);if(solid)this.collisionMeshes.push(mesh);return mesh;
  }
  private sign(text:string,position:[number,number,number],rotation:number,size:[number,number]):void {
    // Headless geometry tests do not need a DOM/canvas implementation.
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=192;
    const ctx=canvas.getContext?.('2d');if(!ctx)return;
    ctx.fillStyle='#0a171d';ctx.fillRect(0,0,1536,192);ctx.strokeStyle='#51d6c4';ctx.lineWidth=6;ctx.strokeRect(8,8,1520,176);
    ctx.fillStyle='#cceee7';ctx.font='54px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,768,96);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture});this.materials.add(material);this.signs.push(material);
    const mesh=new THREE.Mesh(this.geometry(new THREE.PlaneGeometry(...size)),material);mesh.position.set(...position);mesh.rotation.y=rotation;this.root.add(mesh);
  }
}
