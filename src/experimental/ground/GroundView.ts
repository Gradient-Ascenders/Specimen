import * as THREE from 'three';
import { DeformableBody } from './DeformableBody.ts';
import { type GroundBody } from './GroundBody.ts';

/** Debug geometry only: nodes/links/anchors read the actual solved cage. */
export class GroundView {
  readonly renderer = new THREE.WebGLRenderer({antialias:true});
  readonly camera = new THREE.PerspectiveCamera(42,1,.05,250);
  readonly scene = new THREE.Scene();
  view: 'oblique' | 'side' | 'top' = 'oblique';
  showInternals = false;
  showContacts = true;
  trackedNode = 0;
  followHeight = false;
  cameraDistance = 1;
  showFloorGrid = true;
  private readonly grid = this.floorGrid();
  private readonly links = this.lines(261);
  private readonly reactions = this.lines(42*3);
  private readonly trail = this.lines(179);
  private readonly history: number[][] = [];
  private lastTick=-1;
  private lastBody: GroundBody | undefined;
  private readonly nodes = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial(),42,
  );
  private readonly baseline = new THREE.Mesh(
    new THREE.SphereGeometry(.45,16,12),new THREE.MeshBasicMaterial({color:0xb5c7df,wireframe:true}),
  );
  private readonly marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(.085),new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,depthTest:false}),
  );
  private readonly transform = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly observer = new ResizeObserver(()=>this.resize());
  private readonly host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host=host;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.setClearColor(0x10171e);
    host.append(this.renderer.domElement);
    this.renderer.domElement.tabIndex=0;
    this.renderer.domElement.setAttribute('aria-label','Ground locomotion room. WASD or arrows move; Shift coasts; R resets; P pauses.');
    this.grid.position.y=-.001;
    this.nodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.nodes.frustumCulled=false;
    this.marker.renderOrder=2;
    this.scene.add(this.grid,this.nodes,this.links,this.reactions,this.trail,this.baseline,this.marker);
    this.observer.observe(host);
    this.resize();
  }

  private lines(count: number): THREE.LineSegments {
    const geometry=new THREE.BufferGeometry();
    for (const name of ['position','color']) geometry.setAttribute(name,
      new THREE.Float32BufferAttribute(new Float32Array(count*6),3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0,0);
    const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true}));
    lines.frustumCulled=false;
    return lines;
  }
  private floorGrid(): THREE.LineSegments {
    // Short segments keep the close floor reference legible even on software
    // WebGL implementations with poor clipping of long near-plane crossings.
    const points: number[]=[];
    for (let x=-12; x<12; x++) for (let z=-12; z<12; z++) {
      points.push(x,0,z,x+1,0,z,x,0,z,x,0,z+1);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    return new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x52687d}));
  }
  private segment(lines: THREE.LineSegments, index: number, a: readonly number[], b: readonly number[], color: THREE.Color): void {
    const p=lines.geometry.getAttribute('position'), c=lines.geometry.getAttribute('color');
    p.setXYZ(index*2,a[0],a[1],a[2]); p.setXYZ(index*2+1,b[0],b[1],b[2]);
    c.setXYZ(index*2,color.r,color.g,color.b); c.setXYZ(index*2+1,color.r,color.g,color.b);
  }
  private finishLines(lines: THREE.LineSegments, count: number): void {
    lines.geometry.setDrawRange(0,count*2);
    lines.geometry.getAttribute('position').needsUpdate=true;
    lines.geometry.getAttribute('color').needsUpdate=true;
  }
  private resize(): void {
    const {width,height}=this.host.getBoundingClientRect();
    this.renderer.setSize(width,height);
    this.camera.aspect=width/Math.max(height,1); this.camera.updateProjectionMatrix();
  }
  resetTrail(): void { this.history.length=0; this.lastTick=-1; }

  render(body: GroundBody, alpha: number): void {
    const centre=body.metrics().centre;
    const x=centre[0], z=centre[2];
    const y=this.followHeight?centre[1]-.38:0;
    // Observer only: camera pose never feeds the input frame or body state.
    const distance=this.cameraDistance;
    if (this.view==='side') this.camera.position.set(x,.35+1.1*distance+y,z+4.4*distance);
    else if (this.view==='top') this.camera.position.set(x,.35+6.65*distance+y,z+.001);
    else this.camera.position.set(x+2.2*distance,.35+1.75*distance+y,z+3.8*distance);
    this.camera.lookAt(x,.35+y,z);
    this.grid.visible=this.showFloorGrid;
    this.grid.position.x=Math.round(x); this.grid.position.z=Math.round(z);
    const cage=body instanceof DeformableBody ? body : undefined;
    this.nodes.visible=this.links.visible=this.marker.visible=Boolean(cage);
    this.reactions.visible=Boolean(cage)&&this.showContacts;
    this.trail.visible=Boolean(cage);
    this.baseline.visible=!cage;
    this.baseline.position.set(x,centre[1],z);
    if (cage) {
      if (this.lastBody!==body || cage.tick<this.lastTick) this.resetTrail();
      this.lastBody=body;
      const points: number[][]=[];
      const h=(1/60)/cage.config.substeps;
      let reactionCount=0;
      for (let i=0; i<42; i++) {
        const j=i*3, c=cage.contacts[i];
        const point=[0,1,2].map((k)=>THREE.MathUtils.lerp(cage.previous[j+k],cage.positions[j+k],alpha));
        points.push(point);
        const load=c.normalLambda/(h*h);
        const caught=c.active&&c.age<.09;
        const released=!c.active&&cage.tick-c.lastReleaseTick<12;
        this.color.setHex(caught ? 0xffffff : released ? 0xf27cb9 : load>1e-5 ? (c.sliding ? 0xffad53 : 0x69efb5) : 0x668399);
        this.transform.position.fromArray(point);
        this.transform.scale.setScalar(cage.config.nodeRadius*(load>1e-5 ? 1.2 : .75));
        this.transform.updateMatrix(); this.nodes.setMatrixAt(i,this.transform.matrix); this.nodes.setColorAt(i,this.color);
        if (c.active) {
          const anchor=[c.anchorX,.012,c.anchorZ];
          // Cross = persistent static/sliding anchor; height = measured load.
          this.segment(this.reactions,reactionCount++,[anchor[0]-.04,.012,anchor[2]],[anchor[0]+.04,.012,anchor[2]],this.color);
          this.segment(this.reactions,reactionCount++,[anchor[0],.012,anchor[2]-.04],[anchor[0],.012,anchor[2]+.04],this.color);
          this.segment(this.reactions,reactionCount++,anchor,[anchor[0]+c.tangentX/(h*h)*.05,.012+load*.05,anchor[2]+c.tangentZ/(h*h)*.05],this.color);
        }
      }
      this.nodes.instanceMatrix.needsUpdate=true;
      if (this.nodes.instanceColor) this.nodes.instanceColor.needsUpdate=true;
      let count=0;
      for (const link of cage.cage.links) {
        if (link.kind!==0 && !this.showInternals) continue;
        const a=points[link.a], b=points[link.b];
        const strain=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])/link.length-1;
        if (link.kind!==0) this.color.setHex(0x39495e);
        else this.color.set(0x98acba).lerp(new THREE.Color(strain>0 ? 0xff9f62 : 0x7d93fc),Math.min(1,Math.abs(strain)*4));
        this.segment(this.links,count++,a,b,this.color);
      }
      this.finishLines(this.links,count); this.finishLines(this.reactions,reactionCount);
      const tracked=points[this.trackedNode]; this.marker.position.fromArray(tracked);
      if (this.lastTick!==cage.tick) {
        // Trail samples physical ticks; never supplies a motion/deformation phase.
        this.history.push(Array.from(cage.positions.slice(this.trackedNode*3,this.trackedNode*3+3)));
        if (this.history.length>180) this.history.shift();
        this.lastTick=cage.tick;
      }
      this.color.setHex(0xc9d5e2);
      for (let i=1; i<this.history.length; i++) this.segment(this.trail,i-1,this.history[i-1],this.history[i],this.color);
      this.finishLines(this.trail,Math.max(0,this.history.length-1));
    }
    this.renderer.render(this.scene,this.camera);
  }
  dispose(): void {
    this.observer.disconnect();
    for (const object of [this.grid,this.nodes,this.links,this.reactions,this.trail,this.baseline,this.marker]) {
      object.geometry.dispose();
      const materials=Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
    this.nodes.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
