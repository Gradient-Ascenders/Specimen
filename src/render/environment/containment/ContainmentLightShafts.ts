import * as THREE from 'three';
import {ShadowedDroneBeam} from '../../hazards/ShadowedDroneBeam.ts';
import type {GraphicsSettings} from '../../GraphicsProfiles.ts';

/** Restrained, shadow-masked scattering shells. Existing cached light depth
 * cuts holes through the shafts; there is no full-screen fog/depth pass. */
const SHAFTS:Readonly<Record<string,{range:number;angle:number;opacity:number;reference:number}>>={
  'room-1-pedestal-soft-key':{range:6.2,angle:.43,opacity:.012,reference:78},
  'room-2-drop-zone-light':{range:16,angle:.48,opacity:.009,reference:300},
  'room-3-clinical-entry-received-light':{range:23,angle:.42,opacity:.010,reference:305},
  'room-4-lower-amber-received-light':{range:12,angle:.46,opacity:.017,reference:50},
  'room-4-middle-escalation-received-light':{range:21,angle:.38,opacity:.018,reference:70},
  'room-4-upper-arrival-received-light':{range:12,angle:.42,opacity:.014,reference:50},
  'room-5-containment-state-light':{range:9,angle:.65,opacity:.013,reference:65},
};

export class ContainmentLightShafts {
  private readonly entries:{light:THREE.SpotLight;beam:ShadowedDroneBeam;opacity:number;reference:number}[]=[];
  private density=.5;
  private disposed=false;

  constructor(root:THREE.Object3D){
    const lights:THREE.SpotLight[]=[];
    root.traverse(object=>{if(object instanceof THREE.SpotLight&&SHAFTS[object.name])lights.push(object);});
    const axis=new THREE.Vector3(0,-1,0);
    for(const light of lights){
      const spec=SHAFTS[light.name];
      const beam=new ShadowedDroneBeam(light,spec.range,spec.angle,{colour:light.color,opacity:spec.opacity,soft:true});
      beam.mesh.name=`${light.name}-atmospheric-shaft`;
      beam.mesh.userData.visualOnly=true;beam.mesh.userData.presentationOnly=true;
      beam.mesh.userData.lightingOnly=true;beam.mesh.userData.staticBatchExcluded=true;
      beam.mesh.quaternion.setFromUnitVectors(axis,light.target.position.clone().sub(light.position).normalize());
      light.add(beam.mesh);
      this.entries.push({light,beam,opacity:spec.opacity,reference:spec.reference});
    }
    this.update();
  }

  setQuality(settings:GraphicsSettings,type:THREE.ShadowMapType):void{
    this.density=settings.effectsDensity;
    for(const {beam} of this.entries){
      const material=beam.mesh.material,compare=type===THREE.PCFShadowMap;
      if(Boolean(material.defines.SHADOW_COMPARE)!==compare){
        material.defines=compare?{SHADOW_COMPARE:1}:{};material.needsUpdate=true;
      }
      // Low retains one shell, higher settings use the same prepared geometry.
      const count=beam.mesh.geometry.index!.count;
      beam.mesh.geometry.setDrawRange(0,settings.effectsDensity<=.5?count/3:count);
    }
    this.update();
  }

  update():void{
    if(this.disposed)return;
    for(const {light,beam,opacity,reference} of this.entries){
      beam.mesh.material.uniforms.beamColor.value.copy(light.color);
      beam.mesh.material.uniforms.beamOpacity.value=opacity*this.density*Math.min(1.4,light.intensity/reference);
      beam.mesh.visible=light.intensity>.001;
    }
  }

  get renderMeshes():readonly THREE.Mesh[]{return this.entries.map(e=>e.beam.mesh);}
  get diagnostics(){return {shafts:this.entries.length,visible:this.entries.filter(e=>e.beam.mesh.visible&&isVisible(e.light)).length,
    extraShadowMaps:0,fullScreenPasses:0};}
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    for(const {beam} of this.entries){beam.mesh.removeFromParent();beam.mesh.geometry.dispose();beam.mesh.material.dispose();}
    this.entries.length=0;
  }
}
function isVisible(object:THREE.Object3D):boolean{for(let p:THREE.Object3D|null=object;p;p=p.parent)if(!p.visible)return false;return true;}
