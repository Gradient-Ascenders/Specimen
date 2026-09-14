/* Original research sandbox, not a port of Gish and not production Specimen code.
 * Physics: world-space particle cage, XPBD distance/volume constraints, plane
 * contacts with persistent Coulomb friction anchors, optional breakable adhesion.
 * No centre collider, centre-velocity setter, mesh pose target, or dependencies.
 */
(function(root) {
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function cageGeometry(level=1, radius=.4) {
  const t=(1+Math.sqrt(5))/2;
  let p=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
  const unit=v=>{const s=radius/Math.hypot(...v);return v.map(x=>x*s);}; p=p.map(unit);
  let f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let l=0;l<level;l++) {
    const cache=new Map(), out=[];
    const mid=(a,b)=>{const k=[Math.min(a,b),Math.max(a,b)].join(',');if(cache.has(k))return cache.get(k);const i=p.length;p.push(unit(p[a].map((x,c)=>(x+p[b][c])/2)));cache.set(k,i);return i;};
    for(const [a,b,c] of f){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);out.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);} f=out;
  }
  const edgeMap=new Map();
  for(const face of f) for(let k=0;k<3;k++) {const a=face[k],b=face[(k+1)%3],other=face[(k+2)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');if(!edgeMap.has(key))edgeMap.set(key,{a:Math.min(a,b),b:Math.max(a,b),other:[]});edgeMap.get(key).other.push(other);}
  const links=[], seen=new Set();
  const add=(a,b,kind)=>{const key=[Math.min(a,b),Math.max(a,b)].join(',');if(a===b||seen.has(key))return;seen.add(key);links.push({a,b,kind,length:Math.hypot(...p[a].map((v,k)=>v-p[b][k]))});};
  for(const e of edgeMap.values()) add(e.a,e.b,0);
  const surfaceEdges=links.length;
  for(const e of edgeMap.values()) if(e.other.length===2)add(e.other[0],e.other[1],1);
  for(let a=0;a<p.length;a++){let best=-1,dist=Infinity;for(let b=0;b<p.length;b++){const d=p[a].reduce((s,x,k)=>s+(x+p[b][k])**2,0);if(d<dist){dist=d;best=b;}}add(a,best,2);}
  return {rest:Float64Array.from(p.flat()),faces:f,links,surfaceEdges};
}
class Blob {
  constructor(options={}) {
    this.config={level:1,radius:.4,nodeRadius:.05,mass:1,substeps:4,iterations:8,gravity:18,edgeCompliance:1.5e-3,bendCompliance:1.5e-2,diameterCompliance:6e-2,volumeCompliance:2e-6,friction:.9,dynamicFriction:.65,motorMax:85,motorGain:14,targetSpeed:3.5,drag:.08,bondDamping:3,mode:'floor',slopeDegrees:15,adhesion:false,surfaceGravity:true,adhesionCompliance:3e-4,adhesionBreakDistance:.19,adhesionBreakForce:16,adhesionCooldown:.10,platformSpeed:0,...options};
    for(const name of ['substeps','iterations']) if(!Number.isInteger(this.config[name])||this.config[name]<1||this.config[name]>64)throw new Error('Invalid '+name);
    if(![0,1,2].includes(this.config.level))throw new Error('level must be 0, 1 or 2');
    const g=cageGeometry(this.config.level,this.config.radius);Object.assign(this,g);
    this.n=this.rest.length/3;this.w=this.n/this.config.mass;
    this.p=new Float64Array(this.rest.length);this.old=new Float64Array(this.p.length);this.previous=new Float64Array(this.p.length);this.v=new Float64Array(this.p.length);this.grad=new Float64Array(this.p.length);this.lambda=new Float64Array(this.links.length);
    // One contact record per node per plane. All storage is preallocated.
    this.planes=this.config.mode==='wall'?[{n:[0,1,0],d:0,sticky:false},{n:[1,0,0],d:0,sticky:true}]:[{n:this.config.mode==='slope'?[-Math.sin(this.config.slopeDegrees*Math.PI/180),Math.cos(this.config.slopeDegrees*Math.PI/180),0]:[0,1,0],d:0,sticky:false}];
    this.contacts=this.planes.map(()=>Array.from({length:this.n},()=>({active:false,sticky:false,a:new Float64Array(3),ln:0,lt:new Float64Array(3),la:new Float64Array(3),slip:false,age:0,cooldown:0})));
    this.up=[0,1,0];this.centre=new Float64Array(3);this.meanV=new Float64Array(3);this.lastAxis=new Float64Array([0,0,-1]);
    this.reset();
  }
  reset(position) {
    const spawn=position||(this.config.mode==='wall'?[.44,2,0]:[0,.51,0]);
    for(let i=0;i<this.n;i++)for(let k=0;k<3;k++)this.p[3*i+k]=this.rest[3*i+k]+spawn[k];
    this.v.fill(0);this.old.set(this.p);this.previous.set(this.p);this.lambda.fill(0);
    for(const cs of this.contacts)for(const c of cs){c.active=c.sticky=c.slip=false;c.ln=c.age=c.cooldown=0;c.lt.fill(0);c.la.fill(0);c.a.fill(0);}
    this.time=0;this.stepNumber=0;this.releaseTime=0;this.charging=false;this.contactCount=0;this.anchorCount=0;this.up=[0,1,0];this.lastAxis.set([0,0,-1]);this.moments();this.restVolume=this.volume(false);this.volumeLambda=0;this.maxPenetration=0;this.acquireCount=0;this.releaseCount=0;
  }
  moments() {
    this.centre.fill(0);this.meanV.fill(0);
    for(let i=0;i<this.n;i++)for(let k=0;k<3;k++){this.centre[k]+=this.p[3*i+k]/this.n;this.meanV[k]+=this.v[3*i+k]/this.n;}
  }
  volume(withGradient) {
    const p=this.p,c=this.centre,g=this.grad;if(withGradient)g.fill(0);let vol=0;
    for(const [ia,ib,ic] of this.faces){const a=ia*3,b=ib*3,d=ic*3,ax=p[a]-c[0],ay=p[a+1]-c[1],az=p[a+2]-c[2],bx=p[b]-c[0],by=p[b+1]-c[1],bz=p[b+2]-c[2],cx=p[d]-c[0],cy=p[d+1]-c[1],cz=p[d+2]-c[2];
      const gx=(by*cz-bz*cy)/6,gy=(bz*cx-bx*cz)/6,gz=(bx*cy-by*cx)/6;vol+=ax*gx+ay*gy+az*gz;
      if(withGradient){g[a]+=gx;g[a+1]+=gy;g[a+2]+=gz;g[b]+=(cy*az-cz*ay)/6;g[b+1]+=(cz*ax-cx*az)/6;g[b+2]+=(cx*ay-cy*ax)/6;g[d]+=(ay*bz-az*by)/6;g[d+1]+=(az*bx-ax*bz)/6;g[d+2]+=(ax*by-ay*bx)/6;}
    }return vol;
  }
  step(input={},dt=1/60) {
    if(!Number.isFinite(dt)||dt<=0)throw new Error('Invalid dt');
    this.previous.set(this.p);this.stepNumber++;
    if(this.charging&&!input.charge)this.releaseTime=.16;
    this.charging=!!input.charge;
    for(let sub=0;sub<this.config.substeps;sub++)this.substep(input,dt/this.config.substeps);
  }
  substep(input,h) {
    const cfg=this.config,p=this.p,v=this.v,w=this.w;
    this.time+=h;this.releaseTime=Math.max(0,this.releaseTime-h);this.moments();
    this.up=this.anchorCount>0&&cfg.mode==='wall'?[1,0,0]:this.planes[0].n;
    const up=this.up;
    const gravityUp=cfg.surfaceGravity&&this.anchorCount>0&&cfg.mode==='wall'?up:[0,1,0];
    // Input direction projected into the current support tangent plane.
    let dx=input.x||0,dy=input.y||0,dz=input.z||0,du=dx*up[0]+dy*up[1]+dz*up[2];dx-=du*up[0];dy-=du*up[1];dz-=du*up[2];const len=Math.hypot(dx,dy,dz),mag=Math.min(1,len);
    let ax=this.lastAxis[0],ay=this.lastAxis[1],az=this.lastAxis[2];
    if(len>1e-9){dx/=len;dy/=len;dz/=len;ax=up[1]*dz-up[2]*dy;ay=up[2]*dx-up[0]*dz;az=up[0]*dy-up[1]*dx;this.lastAxis.set([ax,ay,az]);}
    let lx=0,ly=0,lz=0,ixx=0,iyy=0,izz=0,ixy=0,ixz=0,iyz=0;
    for(let i=0;i<this.n;i++){
      const j=3*i,rx=p[j]-this.centre[0],ry=p[j+1]-this.centre[1],rz=p[j+2]-this.centre[2],vx=v[j]-this.meanV[0],vy=v[j+1]-this.meanV[1],vz=v[j+2]-this.meanV[2];
      lx+=ry*vz-rz*vy;ly+=rz*vx-rx*vz;lz+=rx*vy-ry*vx;
      ixx+=ry*ry+rz*rz;iyy+=rx*rx+rz*rz;izz+=rx*rx+ry*ry;ixy-=rx*ry;ixz-=rx*rz;iyz-=ry*rz;
    }
    const aa=iyy*izz-iyz*iyz,bb=ixz*iyz-ixy*izz,cc=ixy*iyz-ixz*iyy,dd=ixx*izz-ixz*ixz,ee=ixy*ixz-ixx*iyz,ff=ixx*iyy-ixy*ixy;
    const det=Math.max(1e-14,ixx*aa+ixy*bb+ixz*cc),ox=(aa*lx+bb*ly+cc*lz)/det,oy=(bb*lx+dd*ly+ee*lz)/det,oz=(cc*lx+ee*ly+ff*lz)/det;
    this.omega=ox*ax+oy*ay+oz*az;
    const motorEnabled=this.contactCount>0||this.anchorCount>0||input.forceAirMotor;
    const target=cfg.targetSpeed/(cfg.radius+cfg.nodeRadius)*mag;
    let alx=cfg.motorGain*(target*ax-ox),aly=cfg.motorGain*(target*ay-oy),alz=cfg.motorGain*(target*az-oz),alLength=Math.hypot(alx,aly,alz);
    const motorScale=motorEnabled&&!input.motorOff?Math.min(1,cfg.motorMax/Math.max(1e-12,alLength)):0;alx*=motorScale;aly*=motorScale;alz*=motorScale;
    for(let i=0;i<this.n;i++){
      const j=3*i,rx=p[j]-this.centre[0],ry=p[j+1]-this.centre[1],rz=p[j+2]-this.centre[2],rUp=rx*up[0]+ry*up[1]+rz*up[2],squeeze=this.charging?-280*rUp:0;
      v[j]+=(aly*rz-alz*ry+squeeze*up[0]-cfg.gravity*gravityUp[0])*h;
      v[j+1]+=(alz*rx-alx*rz+squeeze*up[1]-cfg.gravity*gravityUp[1])*h;
      v[j+2]+=(alx*ry-aly*rx+squeeze*up[2]-cfg.gravity*gravityUp[2])*h;
    }
    // Pairwise axial damping preserves linear momentum and rigid rotation.
    const damping=1-Math.exp(-cfg.bondDamping*h);
    for(const l of this.links){if(l.kind===1)continue;const a=3*l.a,b=3*l.b,rx=p[a]-p[b],ry=p[a+1]-p[b+1],rz=p[a+2]-p[b+2],rr=rx*rx+ry*ry+rz*rz;if(rr<1e-16)continue;const dv=((v[a]-v[b])*rx+(v[a+1]-v[b+1])*ry+(v[a+2]-v[b+2])*rz)/rr*damping*.5;
      v[a]-=dv*rx;v[a+1]-=dv*ry;v[a+2]-=dv*rz;v[b]+=dv*rx;v[b+1]+=dv*ry;v[b+2]+=dv*rz;}
    this.old.set(p);const drag=Math.exp(-cfg.drag*h);
    for(let j=0;j<p.length;j++){v[j]*=drag;p[j]+=v[j]*h;}
    this.lambda.fill(0);this.volumeLambda=0;
    for(let pi=0;pi<this.planes.length;pi++){
      const plane=this.planes[pi],n=plane.n;
      for(let i=0;i<this.n;i++){
        const c=this.contacts[pi][i],j=3*i,dist=p[j]*n[0]+p[j+1]*n[1]+p[j+2]*n[2]-plane.d-cfg.nodeRadius;const oldForce=Math.hypot(...c.la)/(h*h);c.cooldown=Math.max(0,c.cooldown-h);c.ln=0;c.lt.fill(0);c.la.fill(0);c.slip=false;
        if(c.active&&cfg.platformSpeed&&pi===0)c.a[0]+=cfg.platformSpeed*h;
        if(c.sticky){const stretch=Math.hypot(p[j]-c.a[0],p[j+1]-c.a[1],p[j+2]-c.a[2]);if(!cfg.adhesion||stretch>cfg.adhesionBreakDistance||(oldForce>cfg.adhesionBreakForce&&c.age>.04)){c.sticky=c.active=false;c.cooldown=cfg.adhesionCooldown;this.releaseCount++;}}
        if(c.active&&!c.sticky&&dist>.018){c.active=false;this.releaseCount++;}
        if(!c.active&&dist<.003){c.active=true;c.age=0;this.acquireCount++;for(let k=0;k<3;k++)c.a[k]=p[j+k]-dist*n[k];c.sticky=cfg.adhesion&&plane.sticky&&c.cooldown===0;}
        if(c.active&&!c.sticky&&cfg.adhesion&&plane.sticky&&c.cooldown===0&&dist<.003){c.sticky=true;c.age=0;for(let k=0;k<3;k++)c.a[k]=p[j+k]-dist*n[k];this.acquireCount++;}
        if(c.active)c.age+=h;
      }
    }
    const h2=h*h;
    for(let it=0;it<cfg.iterations;it++){
      // Alternating deterministic traversal reduces a fixed-order directional bias.
      for(let z=0;z<this.links.length;z++){
        const index=it%2?this.links.length-1-z:z,l=this.links[index],a=3*l.a,b=3*l.b;
        const x=p[a]-p[b],y=p[a+1]-p[b+1],zz=p[a+2]-p[b+2],length=Math.hypot(x,y,zz);if(length<1e-12)continue;
        let compliance=l.kind===0?cfg.edgeCompliance:l.kind===1?cfg.bendCompliance:cfg.diameterCompliance;
        if(l.kind===2&&this.releaseTime>0)compliance=Math.min(compliance,2e-5);
        const al=compliance/h2,dl=(-(length-l.length)-al*this.lambda[index])/(2*w+al);this.lambda[index]+=dl;
        const s=w*dl/length;p[a]+=x*s;p[a+1]+=y*s;p[a+2]+=zz*s;p[b]-=x*s;p[b+1]-=y*s;p[b+2]-=zz*s;
      }
      if(!input.volumeOff){const volume=this.volume(true);let denom=0;for(const q of this.grad)denom+=w*q*q;const al=cfg.volumeCompliance/h2,dl=(-(volume-this.restVolume)-al*this.volumeLambda)/(denom+al);this.volumeLambda+=dl;for(let j=0;j<p.length;j++)p[j]+=w*this.grad[j]*dl;}
      for(let pi=0;pi<this.planes.length;pi++){
        const plane=this.planes[pi],n=plane.n;
        for(let i=0;i<this.n;i++){
          const c=this.contacts[pi][i],j=3*i;let dist=p[j]*n[0]+p[j+1]*n[1]+p[j+2]*n[2]-plane.d-cfg.nodeRadius;
          if(dist<0&&!c.active){c.active=true;c.age=0;this.acquireCount++;for(let k=0;k<3;k++)c.a[k]=p[j+k]-dist*n[k];c.sticky=cfg.adhesion&&plane.sticky&&c.cooldown===0;}
          const next=Math.max(0,c.ln-dist/w),dl=next-c.ln;c.ln=next;for(let k=0;k<3;k++)p[j+k]+=w*dl*n[k];
          if(!c.active)continue;
          if(c.sticky){const al=cfg.adhesionCompliance/h2;for(let k=0;k<3;k++){const dl=(-(p[j+k]-c.a[k])-al*c.la[k])/(w+al);c.la[k]+=dl;p[j+k]+=w*dl;}continue;}
          let ex=p[j]-c.a[0],ey=p[j+1]-c.a[1],ez=p[j+2]-c.a[2],en=ex*n[0]+ey*n[1]+ez*n[2];ex-=en*n[0];ey-=en*n[1];ez-=en*n[2];
          let tx=c.lt[0]-ex/w,ty=c.lt[1]-ey/w,tz=c.lt[2]-ez/w,tl=Math.hypot(tx,ty,tz);
          if(tl>cfg.friction*c.ln){const s=tl>0?Math.min(cfg.dynamicFriction,cfg.friction)*c.ln/tl:0;tx*=s;ty*=s;tz*=s;c.slip=true;}
          p[j]+=w*(tx-c.lt[0]);p[j+1]+=w*(ty-c.lt[1]);p[j+2]+=w*(tz-c.lt[2]);c.lt[0]=tx;c.lt[1]=ty;c.lt[2]=tz;
        }
      }
    }
    this.contactCount=0;this.anchorCount=0;
    for(let pi=0;pi<this.planes.length;pi++)for(let i=0;i<this.n;i++){
      const c=this.contacts[pi][i],n=this.planes[pi].n,j=3*i;
      if(c.ln>1e-9)this.contactCount++;
      if(c.sticky)this.anchorCount++;
      if(c.active&&c.slip&&!c.sticky){const d=p[j]*n[0]+p[j+1]*n[1]+p[j+2]*n[2]-this.planes[pi].d-cfg.nodeRadius;for(let k=0;k<3;k++)c.a[k]=p[j+k]-d*n[k];}
    }
    for(let j=0;j<p.length;j++){v[j]=(p[j]-this.old[j])/h;if(!Number.isFinite(p[j])||Math.abs(p[j])>1e6)throw new Error('Unstable simulation; reset required');}
    this.moments();
  }
  metrics(){this.moments();let minY=Infinity,maxY=-Infinity,maxStrain=0;for(let i=0;i<this.n;i++){minY=Math.min(minY,this.p[3*i+1]);maxY=Math.max(maxY,this.p[3*i+1]);}for(const l of this.links){if(l.kind!==0)continue;const a=l.a*3,b=l.b*3,d=Math.hypot(this.p[a]-this.p[b],this.p[a+1]-this.p[b+1],this.p[a+2]-this.p[b+2]);maxStrain=Math.max(maxStrain,Math.abs(d/l.length-1));}
    let penetration=0;for(const plane of this.planes)for(let i=0;i<this.n;i++)penetration=Math.max(penetration,this.config.nodeRadius+plane.d-this.p[3*i]*plane.n[0]-this.p[3*i+1]*plane.n[1]-this.p[3*i+2]*plane.n[2]);
    return {nodes:this.n,constraints:this.links.length+1,surfaceEdges:this.surfaceEdges,faces:this.faces.length,centre:Array.from(this.centre),velocity:Array.from(this.meanV),volumeRatio:this.volume(false)/this.restVolume,height:maxY-minY+2*this.config.nodeRadius,maxEdgeStrain:maxStrain,penetration,contacts:this.contactCount,anchors:this.anchorCount,acquired:this.acquireCount,released:this.releaseCount};}
}
const api={Blob,cageGeometry};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SoftBodyLab=api;
})(typeof globalThis!=='undefined'?globalThis:this);
