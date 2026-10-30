import * as THREE from 'three';
import type {BlackoutLevelScene} from '../../../levels/BlackoutLevelScene.ts';
import type {BlackoutTransitController} from '../../../levels/BlackoutTransitController.ts';
import type {GraphicsSettings} from '../../GraphicsProfiles.ts';
import {SpatialShadowCache,type ShadowParticipantPosition} from '../../SpatialShadowCache.ts';
import {CameraShadowCulling} from '../../CameraShadowCulling.ts';
import {ShadowedDroneBeam} from '../../hazards/ShadowedDroneBeam.ts';
import {BlackoutRadiance} from './BlackoutRadiance.ts';
import {blackoutLightingZone} from './BlackoutLightingLayout.ts';
import {BlackoutLightLayout} from './BlackoutLightLayout.ts';

const AMBIENCE=[
  {sky:0x34404a,ground:0x080a0b,intensity:.025},
  {sky:0x6d7378,ground:0x211b15,intensity:.035},
  {sky:0x34484d,ground:0x080d0f,intensity:.025},
  {sky:0x34464a,ground:0x080e0b,intensity:.025},
  {sky:0x34464a,ground:0x080e0b,intensity:.025},
  {sky:0x34464a,ground:0x080e0b,intensity:.025},
  {sky:0x34464a,ground:0x080e0b,intensity:.025},
  {sky:0x686e73,ground:0x211b15,intensity:.035},
  {sky:0x657782,ground:0x182024,intensity:.045},
  {sky:0xd4e6e9,ground:0x425452,intensity:.162},
] as const;

export interface BlackoutLightingState {
  readonly position:ShadowParticipantPosition;
  readonly participants:readonly ShadowParticipantPosition[];
  readonly running:boolean;
  readonly cinematic:boolean;
}

/** State-driven lighting only: all electrical eligibility, charge, hazards and
 * moving owners remain authoritative. Uniforms change; programs stay warmed. */
export class BlackoutLightingPass {
  readonly radiance=new BlackoutRadiance();
  lightLayout:BlackoutLightLayout|undefined;
  private readonly scene:BlackoutLevelScene;
  private readonly transit:BlackoutTransitController;
  private readonly ambient:THREE.HemisphereLight;
  private readonly oldAmbient:{sky:THREE.Color;ground:THREE.Color;intensity:number};
  private readonly shadows:SpatialShadowCache;
  private readonly shadowLights:readonly THREE.SpotLight[];
  private readonly cameraShadows:CameraShadowCulling;
  private readonly burns;
  private readonly shafts:{light:THREE.SpotLight;beam:ShadowedDroneBeam;reference:number}[]=[];
  private readonly sky=new THREE.Color();
  private readonly ground=new THREE.Color();
  private readonly materialReflections=new Map<THREE.MeshStandardMaterial,number>();
  private quality='';
  private density=.5;
  private elapsed=0;
  private seeded=false;
  private disposed=false;
  private zone=0;

  constructor(scene:BlackoutLevelScene,transit:BlackoutTransitController){
    this.scene=scene;this.transit=transit;
    this.ambient=scene.root.getObjectByName('blackout-emergency-ambience') as THREE.HemisphereLight;
    this.oldAmbient={sky:this.ambient.color.clone(),ground:this.ambient.groundColor.clone(),intensity:this.ambient.intensity};
    this.shadowLights=transit.lightBanks.filter(light=>light.castShadow);
    this.cameraShadows=new CameraShadowCulling(this.shadowLights);
    this.burns=[...transit.dissolveTargets,...transit.emergingDrones.map(d=>d.target)].map(target=>({target,progress:target.progress}));
    const bridge=transit.root.getObjectByName('transit-deployable-bridge-deck');
    this.shadows=new SpatialShadowCache(this.shadowLights,[
      ...transit.lifts.map(l=>({root:l.platform.collisionMesh,radiusMetres:4})),
      ...(bridge?[{root:bridge,radiusMetres:10}]:[]),
      ...transit.dissolveTargets.map(t=>({root:t.mesh,radiusMetres:4})),
      ...transit.emergingDrones.map(d=>({root:d.shell.body,radiusMetres:2})),
    ]);
    // These shells borrow the selected lights' existing depth maps. They add
    // no full-screen pass and no companion shadow target.
    for(const light of [...scene.maintenanceBay!.hallwayShadowLights.filter((_,i)=>i===1),...this.shadowLights]){
      const reference=light.name.startsWith('transit')?110:8,range=Math.min(light.distance,reference===110?10:5);
      const beam=new ShadowedDroneBeam(light,range,Math.min(.44,light.angle*.5),{colour:light.color,opacity:.012,soft:true});
      beam.mesh.name=light.name+'-restrained-light-shaft';
      Object.assign(beam.mesh.userData,{presentationOnly:true,lightingOnly:true,staticBatchExcluded:true});
      light.updateWorldMatrix(true,false);light.target.updateWorldMatrix(true,false);
      const axis=light.target.getWorldPosition(new THREE.Vector3());light.worldToLocal(axis).normalize();
      beam.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),axis);
      light.add(beam.mesh);this.shafts.push({light,beam,reference});
    }
  }

  async prepare(renderer:THREE.WebGLRenderer,roots:readonly THREE.Object3D[],settings:GraphicsSettings):Promise<void>{
    if(this.disposed)return;this.setQuality(settings,renderer.shadowMap.type);
    await this.radiance.prepare(renderer,roots);
    if(this.disposed)return;
    // Materials are shared across regions: leave their base intensity intact.
    // The atlas itself selects the nearby region and that region's live power.
    for(const root of roots)root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||object.userData.lightingOnly)return;
      for(const material of [object.material].flat())if(material instanceof THREE.MeshStandardMaterial&&material.envMap===this.radiance.texture&&!this.materialReflections.has(material)){
        this.materialReflections.set(material,material.envMapIntensity);
        if(!(material instanceof THREE.MeshPhysicalMaterial))material.envMapIntensity=Math.min(.55,material.envMapIntensity);
      }
    });
    this.shadows.invalidate();
  }

  attachLights(scene:THREE.Scene):void{this.lightLayout??=new BlackoutLightLayout(scene);}

  setQuality(settings:GraphicsSettings,type:THREE.ShadowMapType):void{
    const key=`${settings.shadowMapSizeCap}:${settings.effectsDensity}:${type}`;if(this.quality===key)return;
    this.quality=key;this.density=settings.effectsDensity;this.radiance.setQuality(settings);
    for(const light of this.shadowLights){
      // Standard filtering keeps bounded PCF; soft filtering opts these fixtures into PCSS.
      light.shadow.radius=type===THREE.BasicShadowMap?-light.distance:1.5;
      light.shadow.needsUpdate=true;
    }
    for(const {beam}of this.shafts){beam.setShadowType(type);const count=beam.mesh.geometry.index!.count;
      beam.mesh.geometry.setDrawRange(0,this.density<=.5?count/3:count);
    }
  }

  update(dt:number,state:BlackoutLightingState):void{
    if(this.disposed)return;
    const step=state.running&&Number.isFinite(dt)?THREE.MathUtils.clamp(dt,0,.1):0;
    this.elapsed=(this.elapsed+step)%4096;
    const powers=this.radiance.uniforms.bkPower.value;
    for(let i=0;i<4;i++){
      const desired=THREE.MathUtils.clamp(this.transit.lightBanks[i]!.intensity/110,0,1);
      powers[i+3]=this.seeded?THREE.MathUtils.damp(powers[i+3]!,desired,6,step):desired;
    }
    const lift=this.scene.bossStaging!.ascentLift!;
    powers[8]=lift.lightingState.charge;powers[9]=lift.lightingState.arrival;
    this.radiance.uniforms.bkTime.value=this.elapsed;
    this.zone=blackoutLightingZone(state.position);
    if(!state.cinematic){
      const spec=state.position.z>=190?{sky:0x34404a,ground:0x080a0b,intensity:.025}:AMBIENCE[this.zone]!,blend=this.seeded?1-Math.exp(-step*3):1;
      this.ambient.color.lerp(this.sky.setHex(spec.sky),blend);this.ambient.groundColor.lerp(this.ground.setHex(spec.ground),blend);
      this.ambient.intensity=THREE.MathUtils.lerp(this.ambient.intensity,spec.intensity,blend);
    }
    this.seeded=true;
    for(const burn of this.burns)if(burn.progress!==burn.target.progress){burn.progress=burn.target.progress;this.shadows.invalidate();}
    this.shadows.prepareFrame(state.participants);
    for(const light of this.shadowLights){
      light.shadow.autoUpdate&&=state.running&&light.intensity>.001;
      if(light.intensity<=.001&&light.shadow.map)light.shadow.needsUpdate=false;
    }
    for(const {light,beam,reference}of this.shafts){
      beam.mesh.material.uniforms.beamColor.value.copy(light.color);
      beam.mesh.material.uniforms.beamOpacity.value=.010*this.density*Math.min(1.1,light.intensity/reference);
      beam.mesh.visible=light.intensity>.001;
    }
  }

  reset():void{this.seeded=false;this.elapsed=0;this.radiance.uniforms.bkPower.value.fill(0);this.shadows.invalidate();}
  prepareCamera(camera:THREE.Camera,focus:ShadowParticipantPosition):void{this.lightLayout?.sync(camera,focus);this.cameraShadows.prepare(camera);}
  restoreCamera():void{this.cameraShadows.restore();this.lightLayout?.restore();}
  get diagnostics(){return {...this.radiance.diagnostics,zone:this.zone,powers:[...this.radiance.uniforms.bkPower.value],shafts:this.shafts.length,
    additionalLights:0,additionalPointShadows:0,bankShadowMaps:this.shadowLights.length,ambient:this.ambient.intensity,lightLayout:this.lightLayout?.diagnostics};}

  dispose():void{
    if(this.disposed)return;this.disposed=true;this.radiance.dispose();this.lightLayout?.dispose();
    for(const [material,intensity]of this.materialReflections)material.envMapIntensity=intensity;
    this.materialReflections.clear();
    this.ambient.color.copy(this.oldAmbient.sky);this.ambient.groundColor.copy(this.oldAmbient.ground);this.ambient.intensity=this.oldAmbient.intensity;
    for(const {beam}of this.shafts){beam.mesh.removeFromParent();beam.mesh.geometry.dispose();beam.mesh.material.dispose();}
  }
}
