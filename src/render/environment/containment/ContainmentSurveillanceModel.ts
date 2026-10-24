import * as THREE from 'three';
import {loadOpeningLaboratory} from '../../../cinematics/OpeningLaboratoryAsset.ts';

export type ContainmentSurveillanceModelLoader=(signal:AbortSignal)=>Promise<THREE.Group>;

/** Reuses the exact intro camera. The temporary corridor geometry never enters
 * the gameplay scene or GPU; only the four camera batches and one LED remain. */
export class ContainmentSurveillanceModel {
  private readonly abort=new AbortController();
  private preparation:Promise<void>|undefined;
  private prefab:THREE.Object3D|undefined;
  private ledMaterial:THREE.MeshBasicMaterial|undefined;
  private readonly attachments=new Map<THREE.Object3D,{model:THREE.Object3D;previous:readonly {object:THREE.Object3D;visible:boolean}[]}>();
  private disposed=false;

  prepare(borrowFinish:(name:string)=>THREE.Material,
    loader:ContainmentSurveillanceModelLoader=loadOpeningLaboratory):Promise<void>{
    if(this.disposed)return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(source=>{
      if(this.disposed){disposeGeometry(source,true);return;}
      const prefab=source.getObjectByName('OI_Camera');
      if(prefab?.userData.asset!=='opening-surveillance-v1'){
        disposeGeometry(source,true);throw new Error('Unexpected cutscene camera model.');
      }
      const replacements=new Map<THREE.Mesh,THREE.Material>();
      const originals=new Set<THREE.Material>();
      source.traverse(object=>{if(object instanceof THREE.Mesh)
        for(const material of Array.isArray(object.material)?object.material:[object.material])originals.add(material);});
      try{
        prefab.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          const match=/^OI_Camera_(\w+)$/.exec(object.name);
          if(!match)throw new Error(`Unexpected cutscene camera finish: ${object.name}.`);
          replacements.set(object,borrowFinish(match[1]));
        });
      }catch(error){disposeGeometry(source,true);throw error;}
      prefab.removeFromParent();
      for(const [mesh,material] of replacements){
        mesh.material=material;mesh.castShadow=false;mesh.receiveShadow=false;
        mesh.userData.visualOnly=true;mesh.userData.resourceOwnership='borrowed-containment-surveillance-model';
        mesh.updateMatrix();mesh.matrixAutoUpdate=false;
      }
      // Discard the opening set before allocating any gameplay render buffers.
      disposeGeometry(source,false);
      for(const material of originals)material.dispose();
      this.ledMaterial=new THREE.MeshBasicMaterial({name:'containment-camera-recording-led',color:0xff4557,toneMapped:false});
      const led=new THREE.Mesh(new THREE.BoxGeometry(.025,.025,.012),this.ledMaterial);
      led.name='containment-camera-recording-led';led.position.set(.15,.055,.375);
      led.userData.visualOnly=true;led.userData.resourceOwnership='borrowed-containment-surveillance-model';
      led.updateMatrix();led.matrixAutoUpdate=false;prefab.add(led);
      this.prefab=prefab;
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }

  attachCamera(tilt:THREE.Object3D):void{
    if(!this.prefab||this.disposed||this.attachments.has(tilt))return;
    const previous=tilt.children.map(object=>({object,visible:object.visible}));
    for(const {object} of previous)object.visible=false;
    const model=this.prefab.clone(true);model.name='containment-authored-surveillance-camera';
    tilt.add(model);this.attachments.set(tilt,{model,previous});
  }

  /** The actual first fixture represents the shared buffers of all six. */
  get renderMeshes():readonly THREE.Mesh[]{
    const meshes:THREE.Mesh[]=[];
    this.attachments.values().next().value?.model.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
    return meshes;
  }
  get diagnostics(){return {ready:!!this.prefab,cameras:this.attachments.size,meshes:this.renderMeshes.length,textureCount:0};}

  dispose():void{
    if(this.disposed)return;this.disposed=true;this.abort.abort();
    for(const {model,previous} of this.attachments.values()){
      model.removeFromParent();model.clear();for(const {object,visible} of previous)object.visible=visible;
    }
    this.attachments.clear();
    if(this.prefab)disposeGeometry(this.prefab,false);
    this.prefab=undefined;this.ledMaterial?.dispose();this.ledMaterial=undefined;
  }
}

function disposeGeometry(root:THREE.Object3D,materials:boolean):void{
  const geometries=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material])owned.add(material);}});
  for(const geometry of geometries)geometry.dispose();
  if(materials)for(const material of owned)material.dispose();
  root.removeFromParent();root.clear();
}
