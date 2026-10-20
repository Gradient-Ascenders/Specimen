import * as THREE from 'three';
import type { SecurityDrone } from '../../hazards/SecurityDrone.ts';
import type { ReadonlyVector3State } from '../../abilities/AcidProjectileSystem.ts';

const DURATION=.75;

/** Room 3 only: seven reusable impact slots, three bounded instanced draws.
 * The existing acid-resistant body collider remains the impact authority.
 */
export class RoomThreeDroneShields {
  readonly root=new THREE.Group();
  readonly shells:THREE.InstancedMesh;
  readonly lattice:THREE.InstancedMesh;
  readonly rings:THREE.InstancedMesh;
  private readonly shellGeometry=new THREE.IcosahedronGeometry(1,2);
  private readonly ringGeometry=new THREE.TorusGeometry(1,.055,4,24);
  private readonly fill=new THREE.MeshBasicMaterial({color:0x238bff,transparent:true,opacity:.13,depthWrite:false,toneMapped:false});
  private readonly wire=new THREE.MeshBasicMaterial({color:0x69d5ff,wireframe:true,transparent:true,opacity:.7,depthWrite:false,toneMapped:false});
  private readonly rim=new THREE.MeshBasicMaterial({color:0xb5f7ff,transparent:true,opacity:.85,depthWrite:false,toneMapped:false});
  private readonly slots;
  private readonly centre=new THREE.Vector3();
  private readonly point=new THREE.Vector3();
  private readonly normal=new THREE.Vector3();
  private readonly scale=new THREE.Vector3();
  private readonly rotation=new THREE.Quaternion();
  private readonly inverse=new THREE.Quaternion();
  private readonly matrix=new THREE.Matrix4();
  private readonly forward=new THREE.Vector3(0,0,1);
  private disposed=false;

  constructor(drones:readonly SecurityDrone[]){
    this.root.name='cultivation-room-3-acid-shields';this.root.userData.presentationOnly=true;
    this.slots=drones.map(drone=>({drone,age:Infinity,hit:new THREE.Vector3()}));
    this.shells=new THREE.InstancedMesh(this.shellGeometry,this.fill,drones.length);
    this.lattice=new THREE.InstancedMesh(this.shellGeometry,this.wire,drones.length);
    this.rings=new THREE.InstancedMesh(this.ringGeometry,this.rim,drones.length);
    for(const [i,mesh] of [this.shells,this.lattice,this.rings].entries()){
      mesh.name=`room-three-shield-${['field','lattice','impact-ring'][i]}`;
      mesh.userData.prewarmInstanceCount=1;mesh.userData.visualOnly=true;
      mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setMatrixAt(0,this.matrix.makeScale(.001,.001,.001));mesh.count=0;mesh.renderOrder=12+i;
      this.root.add(mesh);
    }
  }
  get activeCount():number{return this.slots.filter(slot=>slot.age<DURATION).length;}
  impact(objectName:string,point:ReadonlyVector3State):boolean{
    if(this.disposed)return false;
    const slot=this.slots.find(slot=>slot.drone.collider.name===objectName&&slot.drone.readModel.state!=='disabled');
    if(!slot)return false;
    slot.age=0;slot.hit.copy(point);this.present();return true;
  }
  update(dt:number):void{
    if(this.disposed)return;
    if(!Number.isFinite(dt)||dt<0)throw new RangeError('Invalid shield timestep.');
    for(const slot of this.slots)slot.age+=dt;
    this.present();
  }
  reset():void{for(const slot of this.slots)slot.age=Infinity;this.shells.count=this.lattice.count=this.rings.count=0;}
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.root.removeFromParent();this.root.clear();
    for(const mesh of [this.shells,this.lattice,this.rings])mesh.dispose();
    this.shellGeometry.dispose();this.ringGeometry.dispose();this.fill.dispose();this.wire.dispose();this.rim.dispose();
  }
  private present():void{
    let count=0,minAge=DURATION;
    for(const slot of this.slots){
      if(slot.age>=DURATION||slot.drone.readModel.state==='disabled')continue;
      minAge=Math.min(minAge,slot.age);
      slot.drone.root.getWorldPosition(this.centre);this.root.worldToLocal(this.centre);
      const size=slot.drone.collider.geometry.parameters;
      this.scale.set(size.width/2+.25,size.height/2+.3,size.depth/2+.25).multiplyScalar(1+.045*Math.sin(slot.age*22));
      slot.drone.root.getWorldQuaternion(this.rotation);
      this.root.getWorldQuaternion(this.inverse).invert();this.rotation.premultiply(this.inverse);
      this.matrix.compose(this.centre,this.rotation,this.scale);
      this.shells.setMatrixAt(count,this.matrix);this.lattice.setMatrixAt(count,this.matrix);
      this.root.worldToLocal(this.point.copy(slot.hit));this.point.sub(this.centre).normalize();
      if(this.point.lengthSq()<1e-8)this.point.set(0,0,-1);
      this.inverse.copy(this.rotation).invert();this.normal.copy(this.point).applyQuaternion(this.inverse);
      const surfaceRadius=1/Math.sqrt((this.normal.x/this.scale.x)**2+(this.normal.y/this.scale.y)**2+(this.normal.z/this.scale.z)**2);
      this.rotation.setFromUnitVectors(this.forward,this.point);
      this.point.multiplyScalar(surfaceRadius+.008).add(this.centre);
      const radius=.12+slot.age*1.8;
      this.scale.set(radius,radius,radius);
      this.matrix.compose(this.point,this.rotation,this.scale);this.rings.setMatrixAt(count++,this.matrix);
    }
    const fade=Math.max(0,1-minAge/DURATION);
    this.fill.opacity=.16*fade;this.wire.opacity=.75*fade;this.rim.opacity=.9*fade;
    for(const mesh of [this.shells,this.lattice,this.rings]){mesh.count=count;if(count)mesh.instanceMatrix.needsUpdate=true;}
  }
}
