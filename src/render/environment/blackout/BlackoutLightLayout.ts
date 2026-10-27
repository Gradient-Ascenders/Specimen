import * as THREE from 'three';
import {disposeShadowLight} from '../../ShadowLightResources.ts';

/** Stable signature at every power/room/cinematic state. Shadowed spots occupy
 * the first two of five spot slots; unused sources are tiny zero-radiance pads. */
export const BLACKOUT_LIGHT_SLOTS={points:4,shadowedSpots:2,ordinarySpots:3} as const;
type Light=THREE.PointLight|THREE.SpotLight;
interface Source {light:Light;mask:number;position:THREE.Vector3;score:number;order:number;}

/** Port of Cultivation's bounded render selection. Authored lights retain
 * power, colour, parentage, emitter children, range and gameplay eligibility. */
export class BlackoutLightLayout {
  readonly root=new THREE.Group();
  readonly diagnostics={points:0,shadowedSpots:0,ordinarySpots:0,selected:[] as string[],signature:'4:0:5:2'};
  private readonly points=Array.from({length:BLACKOUT_LIGHT_SLOTS.points},()=>new THREE.PointLight(0,0,.2));
  private readonly shadows=Array.from({length:BLACKOUT_LIGHT_SLOTS.shadowedSpots},()=>new THREE.SpotLight(0,0,.2,.001));
  private readonly spots=Array.from({length:BLACKOUT_LIGHT_SLOTS.ordinarySpots},()=>new THREE.SpotLight(0,0,.2,.001));
  private readonly sources:Source[]=[];
  private readonly previous=new Set<Light>();
  private readonly selected=new Set<Light>();
  private readonly pointCandidates:Source[]=[];
  private readonly shadowCandidates:Source[]=[];
  private readonly spotCandidates:Source[]=[];
  private readonly sphere=new THREE.Sphere();
  private readonly frustum=new THREE.Frustum();
  private readonly projection=new THREE.Matrix4();
  private readonly target=new THREE.Vector3();
  private readonly axis=new THREE.Vector3();
  private readonly ray=new THREE.Vector3();
  private readonly forward=new THREE.Vector3();
  private readonly samples=Array.from({length:5},()=>new THREE.Vector3());
  private active=false;
  private disposed=false;

  constructor(scene:THREE.Scene){
    this.root.name='blackout-bounded-light-slots';this.root.userData.presentationOnly=true;
    for(const [i,light]of [...this.points,...this.shadows,...this.spots].entries()){
      light.name='blackout-empty-light-slot-'+i;light.position.set(100000,100000,100000);
      if(light instanceof THREE.SpotLight){light.target.position.set(100000,99999,100000);this.root.add(light.target);}
      if(this.shadows.includes(light as THREE.SpotLight)){
        light.castShadow=true;(light as THREE.SpotLight).shadow.mapSize.set(1,1);
        (light as THREE.SpotLight).shadow.camera.near=.1;(light as THREE.SpotLight).shadow.camera.far=.2;
        (light as THREE.SpotLight).shadow.autoUpdate=false;(light as THREE.SpotLight).shadow.needsUpdate=true;
      }
      this.root.add(light);
    }
    scene.add(this.root);this.refresh(scene);this.root.visible=false;
  }

  refresh(scene:THREE.Scene):void {
    this.restore();this.sources.length=0;
    scene.traverse(object=>{
      if(object.parent===this.root)return;
      if(object instanceof THREE.PointLight||object instanceof THREE.SpotLight){
        if(object instanceof THREE.PointLight&&object.castShadow)throw Error('Blackout does not budget point-light cube shadows.');
        this.sources.push({light:object,mask:object.layers.mask,position:new THREE.Vector3(),score:0,order:this.sources.length});
      }
    });
  }

  sync(camera:THREE.Camera,focus:Pick<THREE.Vector3,'x'|'y'|'z'>):void {
    this.restore();if(this.disposed)return;this.active=true;
    this.pointCandidates.length=this.shadowCandidates.length=this.spotCandidates.length=0;this.selected.clear();
    camera.updateWorldMatrix(true,false);this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection,camera.coordinateSystem);camera.getWorldDirection(this.forward);
    this.samples[0].copy(focus);
    for(let i=1;i<this.samples.length;i++)this.samples[i].copy(camera.position).addScaledVector(this.forward,[0,3,8,16,32][i]!);
    for(const source of this.sources){
      const {light}=source;source.mask=light.layers.mask;source.score=0;
      let visible=!!light.parent;
      for(let owner:THREE.Object3D|null=light;owner;owner=owner.parent)if(!owner.visible){visible=false;break;}
      if(!visible||!light.layers.test(camera.layers)||light.intensity<=0)continue;
      light.getWorldPosition(source.position);this.sphere.center.copy(source.position);this.sphere.radius=light.distance;
      if(light.distance>0&&!this.frustum.intersectsSphere(this.sphere))continue;
      // A cinematic can frame another character or a remote platform. Keep a
      // small screen-space fallback so an offscreen active body cannot reject
      // every fixture illuminating the visible shot.
      source.score=light.intensity/(1+camera.position.distanceTo(source.position)**light.decay)*.05;
      if(light instanceof THREE.SpotLight){light.target.getWorldPosition(this.target);this.axis.copy(this.target).sub(source.position).normalize();}
      for(const [i,sample]of this.samples.entries()){
        this.ray.copy(sample).sub(source.position);const distance=this.ray.length();
        if(light.distance>0&&distance>light.distance+2)continue;
        const cutoff=light.distance>0?Math.max(0,1-(distance/light.distance)**4)**2:1;
        const cone=light instanceof THREE.SpotLight&&distance>.001&&this.ray.multiplyScalar(1/distance).dot(this.axis)<Math.cos(light.angle+Math.atan2(2,distance))?.05:1;
        source.score=Math.max(source.score,light.intensity*cutoff*cone/(1+distance**light.decay)*(i===0?1:i===1?.7:.35));
      }
      if(source.score>0){
        if(this.previous.has(light))source.score*=1.2;
        (light instanceof THREE.PointLight?this.pointCandidates:light.castShadow?this.shadowCandidates:this.spotCandidates).push(source);
      }
    }
    const choose=(candidates:Source[],limit:number)=>{
      candidates.sort((a,b)=>b.score-a.score||a.order-b.order);
      for(const source of candidates.slice(0,limit)){this.selected.add(source.light);if(source.light.castShadow&&!this.previous.has(source.light))(source.light as THREE.SpotLight).shadow.needsUpdate=true;}
      return Math.min(limit,candidates.length);
    };
    const d=this.diagnostics;d.points=choose(this.pointCandidates,BLACKOUT_LIGHT_SLOTS.points);
    d.shadowedSpots=choose(this.shadowCandidates,BLACKOUT_LIGHT_SLOTS.shadowedSpots);d.ordinarySpots=choose(this.spotCandidates,BLACKOUT_LIGHT_SLOTS.ordinarySpots);
    d.selected.length=0;
    for(const source of this.sources){if(this.selected.has(source.light))d.selected.push(source.light.name);else source.light.layers.mask=0;}
    this.points.forEach((l,i)=>l.visible=i<BLACKOUT_LIGHT_SLOTS.points-d.points);
    this.shadows.forEach((l,i)=>l.visible=i<BLACKOUT_LIGHT_SLOTS.shadowedSpots-d.shadowedSpots);
    this.spots.forEach((l,i)=>l.visible=i<BLACKOUT_LIGHT_SLOTS.ordinarySpots-d.ordinarySpots);
    this.previous.clear();for(const light of this.selected)this.previous.add(light);this.root.visible=true;
  }

  restore():void {
    if(this.active)for(const source of this.sources)source.light.layers.mask=source.mask;
    this.active=false;this.root.visible=false;
  }
  /** compileAsync submits programs synchronously, before its returned promise
   * settles. Restore masks immediately, matching the shared prewarm contract. */
  withLayout<T>(camera:THREE.Camera,focus:Pick<THREE.Vector3,'x'|'y'|'z'>,action:()=>T):T{
    this.sync(camera,focus);try{return action();}finally{this.restore();}
  }
  dispose():void{
    if(this.disposed)return;this.restore();this.disposed=true;
    for(const light of this.shadows)disposeShadowLight(light);
    this.root.removeFromParent();this.root.clear();this.sources.length=0;this.previous.clear();this.selected.clear();
  }
}
