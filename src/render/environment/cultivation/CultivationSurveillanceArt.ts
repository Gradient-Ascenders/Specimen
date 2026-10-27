import * as THREE from 'three';
import type {LevelTwoPreviewScene} from '../../../levels/LevelTwoPreviewScene.ts';
import {ContainmentSurveillanceModel} from '../containment/ContainmentSurveillanceModel.ts';

/** The same authored camera as Level 1, decoded once in the existing asset bank.
 * Original pan/tilt owners, tracking, placements and wall mounts stay live. */
export class CultivationSurveillanceArt {
  private readonly model=new ContainmentSurveillanceModel();
  private disposed=false;
  private readonly screen=new THREE.MeshBasicMaterial({
    name:'cultivation-surveillance-optics',color:0x112e34,toneMapped:false,
  });
  constructor(scene:LevelTwoPreviewScene){
    const source=new THREE.Group(),prefab=new THREE.Group();prefab.name='OI_Camera';
    prefab.userData.asset='opening-surveillance-v1';source.add(prefab);
    const placeholder=new THREE.MeshBasicMaterial();
    const geometry=scene.assets.geometries('surveillance-camera',()=>{throw Error('Camera must come from the offline Level 1 export');});
    for(const [name,buffer]of Object.entries(geometry)){
      const mesh=new THREE.Mesh(buffer,placeholder);mesh.name=name;prefab.add(mesh);
    }
    this.model.adoptSource(source,name=>{
      switch(name){
        case 'Ivory':return scene.contaminationArt.finishes.wall;
        case 'Graphite':return scene.labArt.metal;
        case 'Alloy':return scene.labArt.duct;
        case 'Screen':return this.screen;
        default:throw Error('Unknown shared camera finish: '+name);
      }
    });
    for(const observation of [scene.roomOneObservation,scene.roomTwoObservation,scene.roomThreeObservation])
      for(const camera of observation.cameras.cameras)this.model.attachCamera(camera.tilt);
  }
  get diagnostics(){return this.model.diagnostics;}
  dispose():void{if(this.disposed)return;this.disposed=true;this.model.dispose();this.screen.dispose();}
}
