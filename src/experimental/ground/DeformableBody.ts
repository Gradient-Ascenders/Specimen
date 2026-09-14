import { createCage } from './CageGeometry.ts';
import type { BodyCollision } from './BodyCollision.ts';
import { GROUND_STEP, type GroundBody, type GroundInput, type GroundMetrics, type Vec3 } from './GroundBody.ts';

export interface CageConfig {
  radius: number;
  nodeRadius: number;
  mass: number;
  substeps: number;
  iterations: number;
  gravity: number;
  edgeCompliance: number;
  bendCompliance: number;
  diameterCompliance: number;
  volumeCompliance: number;
  friction: number;
  dynamicFriction: number;
  angularSpeed: number;
  motorGain: number;
  maxAngularAcceleration: number;
  drag: number;
  bondDamping: number;
  /** Diagnostic free-space ablation only. No translational air control. */
  motorInAir: boolean;
}
export const DEFAULT_CAGE_CONFIG: Readonly<CageConfig> = Object.freeze({
  radius: .4, nodeRadius: .05, mass: 1, substeps: 4, iterations: 8,
  gravity: 18, edgeCompliance: .0015, bendCompliance: .015,
  diameterCompliance: .06, volumeCompliance: .000002,
  friction: .9, dynamicFriction: .65, angularSpeed: 3.5 / .45,
  motorGain: 14, maxAngularAcceleration: 85, drag: .08, bondDamping: 3,
  motorInAir: false,
});
export interface MaterialContact {
  active: boolean;
  anchorX: number;
  anchorZ: number;
  normalLambda: number;
  tangentX: number;
  tangentZ: number;
  sliding: boolean;
  age: number;
  acquisitions: number;
  lastReleaseTick: number;
}

/**
 * Material solver adapted from the original approved research lab.
 * Equal particle masses; XPBD edge/opposite-face/diameter and signed-volume
 * constraints. In the original plane mode, horizontal reaction is floor friction.
 * No centre collider, translation motor, pose target or decorative deformation.
 * Default point contacts against y=0 preserve the accepted ground A/B path.
 * The optional collision adapter replaces those contacts, never cage authority.
 */
export class DeformableBody implements GroundBody {
  readonly kind = 'deformable' as const;
  readonly config: Readonly<CageConfig>;
  readonly cage;
  readonly positions: Float64Array;
  readonly previous: Float64Array;
  readonly velocities: Float64Array;
  readonly contacts: MaterialContact[];
  readonly centre = new Float64Array(3);
  readonly meanVelocity = new Float64Array(3);
  readonly angularVelocity = new Float64Array(3);
  /** Sum over this outer tick, kg m/s. Exposes the motor/contact causal chain. */
  readonly motorLinearImpulse = new Float64Array(3);
  readonly groundImpulse = new Float64Array(3);
  tick = 0;
  acquired = 0;
  released = 0;
  contactCount = 0;
  private readonly old: Float64Array;
  private readonly gradient: Float64Array;
  private readonly lambdas: Float64Array;
  private volumeLambda = 0;
  private restVolume = 0;
  private readonly count: number;
  private readonly inverseMass: number;
  readonly collision: BodyCollision | undefined;

  constructor(options: Partial<CageConfig> = {}, collision?: BodyCollision, initialPosition?: Vec3) {
    this.collision=collision;
    this.config = Object.freeze({ ...DEFAULT_CAGE_CONFIG, ...options });
    for (const [key, value] of Object.entries(this.config)) {
      if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
        throw new Error(`Invalid cage setting: ${key}`);
      }
    }
    for (const key of ['substeps', 'iterations'] as const) {
      if (!Number.isInteger(this.config[key]) || this.config[key] < 1 || this.config[key] > 16) {
        throw new Error(`Invalid cage setting: ${key}`);
      }
    }
    if (this.config.mass <= 0 || this.config.radius <= 0 || this.config.nodeRadius <= 0) {
      throw new Error('Cage mass and radii must be positive.');
    }
    this.cage = createCage(this.config.radius);
    this.positions = new Float64Array(this.cage.rest.length);
    this.previous = new Float64Array(this.positions.length);
    this.old = new Float64Array(this.positions.length);
    this.velocities = new Float64Array(this.positions.length);
    this.gradient = new Float64Array(this.positions.length);
    this.lambdas = new Float64Array(this.cage.links.length);
    this.count = this.positions.length / 3;
    this.inverseMass = this.count / this.config.mass;
    this.contacts = Array.from({ length: this.count }, () => ({
      active: false, anchorX: 0, anchorZ: 0, normalLambda: 0,
      tangentX: 0, tangentZ: 0, sliding: false, age: 0,
      acquisitions: 0, lastReleaseTick: -1000,
    }));
    this.reset(initialPosition);
  }

  reset(position: Vec3 = [0, .51, 0]): void {
    for (let i = 0; i < this.positions.length; i++) {
      this.positions[i] = this.cage.rest[i] + position[i%3];
    }
    this.old.set(this.positions);
    this.previous.set(this.positions);
    this.velocities.fill(0);
    this.gradient.fill(0);
    this.lambdas.fill(0);
    this.angularVelocity.fill(0);
    this.motorLinearImpulse.fill(0);
    this.groundImpulse.fill(0);
    this.tick = this.acquired = this.released = this.contactCount = this.volumeLambda = 0;
    for (const c of this.contacts) Object.assign(c, {
      active: false, anchorX: 0, anchorZ: 0, normalLambda: 0,
      tangentX: 0, tangentZ: 0, sliding: false, age: 0,
      acquisitions: 0, lastReleaseTick: -1000,
    });
    this.moments();
    this.restVolume = this.volume(false);
    if (this.collision) {
      this.collision.reset(this);
      this.old.set(this.positions); this.previous.set(this.positions); this.moments();
    }
  }

  private moments(): void {
    this.centre.fill(0);
    this.meanVelocity.fill(0);
    for (let i = 0; i < this.positions.length; i++) {
      this.centre[i%3] += this.positions[i] / this.count;
      this.meanVelocity[i%3] += this.velocities[i] / this.count;
    }
  }

  private volume(withGradient: boolean): number {
    const p = this.positions, c = this.centre, g = this.gradient;
    if (withGradient) g.fill(0);
    let volume = 0;
    for (const [ia,ib,ic] of this.cage.faces) {
      const a=ia*3, b=ib*3, d=ic*3;
      const ax=p[a]-c[0], ay=p[a+1]-c[1], az=p[a+2]-c[2];
      const bx=p[b]-c[0], by=p[b+1]-c[1], bz=p[b+2]-c[2];
      const cx=p[d]-c[0], cy=p[d+1]-c[1], cz=p[d+2]-c[2];
      const gx=(by*cz-bz*cy)/6, gy=(bz*cx-bx*cz)/6, gz=(bx*cy-by*cx)/6;
      volume += ax*gx + ay*gy + az*gz;
      if (withGradient) {
        g[a]+=gx; g[a+1]+=gy; g[a+2]+=gz;
        g[b]+=(cy*az-cz*ay)/6; g[b+1]+=(cz*ax-cx*az)/6; g[b+2]+=(cx*ay-cy*ax)/6;
        g[d]+=(ay*bz-az*by)/6; g[d+1]+=(az*bx-ax*bz)/6; g[d+2]+=(ax*by-ay*bx)/6;
      }
    }
    return volume;
  }

  step(input: GroundInput): void {
    if (!Number.isFinite(input.x) || !Number.isFinite(input.z)) throw new Error('Invalid ground input.');
    this.previous.set(this.positions);
    this.tick++;
    this.collision?.beginTick();
    this.motorLinearImpulse.fill(0);
    this.groundImpulse.fill(0);
    for (let i = 0; i < this.config.substeps; i++) this.substep(input, GROUND_STEP / this.config.substeps);
  }

  private motor(input: GroundInput, h: number): void {
    const p=this.positions, v=this.velocities, c=this.centre, cfg=this.config;
    // Full inertia tensor and angular momentum; no target centre velocity.
    let lx=0, ly=0, lz=0, ixx=0, iyy=0, izz=0, ixy=0, ixz=0, iyz=0;
    for (let j=0; j<p.length; j+=3) {
      const x=p[j]-c[0], y=p[j+1]-c[1], z=p[j+2]-c[2];
      const vx=v[j]-this.meanVelocity[0], vy=v[j+1]-this.meanVelocity[1], vz=v[j+2]-this.meanVelocity[2];
      lx+=y*vz-z*vy; ly+=z*vx-x*vz; lz+=x*vy-y*vx;
      ixx+=y*y+z*z; iyy+=x*x+z*z; izz+=x*x+y*y; ixy-=x*y; ixz-=x*z; iyz-=y*z;
    }
    const aa=iyy*izz-iyz*iyz, bb=ixz*iyz-ixy*izz, cc=ixy*iyz-ixz*iyy;
    const dd=ixx*izz-ixz*ixz, ee=ixy*ixz-ixx*iyz, ff=ixx*iyy-ixy*ixy;
    const determinant=Math.max(1e-14, ixx*aa+ixy*bb+ixz*cc);
    const ox=(aa*lx+bb*ly+cc*lz)/determinant;
    const oy=(bb*lx+dd*ly+ee*lz)/determinant;
    const oz=(cc*lx+ee*ly+ff*lz)/determinant;
    this.angularVelocity.set([ox,oy,oz]);
    if (input.coast || (!this.contactCount && !cfg.motorInAir)) return;
    const scale = cfg.angularSpeed / Math.max(1, Math.hypot(input.x,input.z));
    // worldUp cross input = [z, 0, -x]. Idle commands a bounded angular brake.
    let ax=cfg.motorGain*(input.z*scale-ox), ay=-cfg.motorGain*oy;
    let az=cfg.motorGain*(-input.x*scale-oz);
    const limit=Math.min(1, cfg.maxAngularAcceleration / Math.max(1e-12,Math.hypot(ax,ay,az)));
    ax*=limit; ay*=limit; az*=limit;
    for (let j=0; j<p.length; j+=3) {
      const x=p[j]-c[0], y=p[j+1]-c[1], z=p[j+2]-c[2];
      const dx=(ay*z-az*y)*h, dy=(az*x-ax*z)*h, dz=(ax*y-ay*x)*h;
      v[j]+=dx; v[j+1]+=dy; v[j+2]+=dz;
      this.motorLinearImpulse[0]+=dx/this.inverseMass;
      this.motorLinearImpulse[1]+=dy/this.inverseMass;
      this.motorLinearImpulse[2]+=dz/this.inverseMass;
    }
  }

  private acquire(c: MaterialContact, j: number): void {
    c.active=true; c.age=0; c.acquisitions++; this.acquired++;
    c.anchorX=this.positions[j]; c.anchorZ=this.positions[j+2];
  }

  private substep(input: GroundInput, h: number): void {
    const cfg=this.config, p=this.positions, v=this.velocities, w=this.inverseMass;
    this.moments();
    this.motor(input,h);
    for (let j=1; j<v.length; j+=3) v[j]-=cfg.gravity*h;
    // Pairwise axial damping preserves bulk momentum and rigid rotation.
    const damping=1-Math.exp(-cfg.bondDamping*h);
    for (const link of this.cage.links) {
      if (link.kind===1) continue;
      const a=3*link.a, b=3*link.b, x=p[a]-p[b], y=p[a+1]-p[b+1], z=p[a+2]-p[b+2];
      const lengthSquared=x*x+y*y+z*z;
      if (lengthSquared<1e-16) continue;
      const delta=((v[a]-v[b])*x+(v[a+1]-v[b+1])*y+(v[a+2]-v[b+2])*z)/lengthSquared*damping*.5;
      v[a]-=delta*x; v[a+1]-=delta*y; v[a+2]-=delta*z;
      v[b]+=delta*x; v[b+1]+=delta*y; v[b+2]+=delta*z;
    }
    this.old.set(p);
    const drag=Math.exp(-cfg.drag*h);
    for (let j=0; j<p.length; j++) { v[j]*=drag; p[j]+=v[j]*h; }
    this.lambdas.fill(0); this.volumeLambda=0;
    if (this.collision) {
      this.collision.beginSubstep(this,h,this.old);
      this.collision.project(this,h);
    }
    for (let i=0; !this.collision && i<this.count; i++) {
      const c=this.contacts[i], distance=p[3*i+1]-cfg.nodeRadius;
      c.normalLambda=c.tangentX=c.tangentZ=0; c.sliding=false;
      if (c.active && distance>.018) {
        c.active=false; c.lastReleaseTick=this.tick; this.released++;
      }
      if (!c.active && distance<.003) this.acquire(c,3*i);
      if (c.active) c.age+=h;
    }
    for (let iteration=0; iteration<cfg.iterations; iteration++) {
      for (let k=0; k<this.cage.links.length; k++) {
        const index=iteration%2 ? this.cage.links.length-1-k : k;
        const link=this.cage.links[index], a=link.a*3, b=link.b*3;
        const x=p[a]-p[b], y=p[a+1]-p[b+1], z=p[a+2]-p[b+2], length=Math.hypot(x,y,z);
        if (length<1e-12) continue;
        const compliance=link.kind===0 ? cfg.edgeCompliance : link.kind===1 ? cfg.bendCompliance : cfg.diameterCompliance;
        const alpha=compliance/(h*h);
        const delta=(-(length-link.length)-alpha*this.lambdas[index])/(2*w+alpha);
        this.lambdas[index]+=delta;
        const s=w*delta/length;
        p[a]+=x*s; p[a+1]+=y*s; p[a+2]+=z*s;
        p[b]-=x*s; p[b+1]-=y*s; p[b+2]-=z*s;
      }
      const volume=this.volume(true), alpha=cfg.volumeCompliance/(h*h);
      let denominator=0;
      for (const g of this.gradient) denominator+=w*g*g;
      const delta=(-(volume-this.restVolume)-alpha*this.volumeLambda)/(denominator+alpha);
      this.volumeLambda+=delta;
      for (let j=0; j<p.length; j++) p[j]+=w*this.gradient[j]*delta;
      // Contact runs LAST on every pass, including corrections made by volume.
      if (this.collision) this.collision.project(this,h);
      for (let i=0; !this.collision && i<this.count; i++) {
        const c=this.contacts[i], j=3*i, distance=p[j+1]-cfg.nodeRadius;
        if (distance<0 && !c.active) this.acquire(c,j);
        const normal=Math.max(0,c.normalLambda-distance/w);
        p[j+1]+=w*(normal-c.normalLambda); c.normalLambda=normal;
        if (!c.active) continue;
        let tx=c.tangentX-(p[j]-c.anchorX)/w, tz=c.tangentZ-(p[j+2]-c.anchorZ)/w;
        const length=Math.hypot(tx,tz);
        if (length>cfg.friction*normal) {
          const s=length>0 ? Math.min(cfg.dynamicFriction,cfg.friction)*normal/length : 0;
          tx*=s; tz*=s; c.sliding=true;
        }
        p[j]+=w*(tx-c.tangentX); p[j+2]+=w*(tz-c.tangentZ);
        c.tangentX=tx; c.tangentZ=tz;
      }
    }
    this.contactCount=0;
    if (this.collision) this.collision.finishSubstep(this,h);
    for (let i=0; !this.collision && i<this.count; i++) {
      const c=this.contacts[i];
      if (c.normalLambda>1e-9) this.contactCount++;
      this.groundImpulse[0]+=c.tangentX/h;
      this.groundImpulse[1]+=c.normalLambda/h;
      this.groundImpulse[2]+=c.tangentZ/h;
      if (c.active && c.sliding) { c.anchorX=p[3*i]; c.anchorZ=p[3*i+2]; }
    }
    for (let j=0; j<p.length; j++) {
      v[j]=(p[j]-this.old[j])/h;
      if (!Number.isFinite(p[j]) || Math.abs(p[j])>1e6) throw new Error('Solver left its bounded lab range. Reset required.');
    }
    this.moments();
  }

  metrics(): GroundMetrics {
    let minY=Infinity, maxY=-Infinity, maxStrain=0;
    for (let j=1; j<this.positions.length; j+=3) {
      minY=Math.min(minY,this.positions[j]); maxY=Math.max(maxY,this.positions[j]);
    }
    for (const link of this.cage.links) {
      if (link.kind!==0) continue;
      const a=3*link.a, b=3*link.b, p=this.positions;
      maxStrain=Math.max(maxStrain,Math.abs(Math.hypot(p[a]-p[b],p[a+1]-p[b+1],p[a+2]-p[b+2])/link.length-1));
    }
    return {
      centre: [this.centre[0],this.centre[1],this.centre[2]],
      velocity: [this.meanVelocity[0],this.meanVelocity[1],this.meanVelocity[2]],
      contacts: this.contactCount, acquired: this.acquired, released: this.released,
      volumeRatio: this.volume(false)/this.restVolume, maxStrain,
      penetration: this.collision?.penetration ?? Math.max(0,this.config.nodeRadius-minY), height: maxY-minY+2*this.config.nodeRadius,
    };
  }

  snapshot(): unknown {
    return {
      config: this.config, tick: this.tick, positions: [...this.positions], previous: [...this.previous],
      old: [...this.old], velocities: [...this.velocities], gradient: [...this.gradient],
      lambdas: [...this.lambdas], volumeLambda: this.volumeLambda, restVolume: this.restVolume,
      contacts: this.contacts.map((c) => ({...c})), centre: [...this.centre], velocity: [...this.meanVelocity],
      angularVelocity: [...this.angularVelocity], acquired: this.acquired, released: this.released,
      contactCount: this.contactCount, motorImpulse: [...this.motorLinearImpulse], groundImpulse: [...this.groundImpulse],
      collision: this.collision?.snapshot(),
    };
  }
  dispose(): void { /* No external resources. */ }
}
