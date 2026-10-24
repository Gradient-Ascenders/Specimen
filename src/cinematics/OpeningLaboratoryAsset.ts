import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const OPENING_LABORATORY_URL = new URL('../../assets/environments/opening-laboratory/opening-laboratory.glb',import.meta.url).href;

export async function parseOpeningLaboratory(bytes: ArrayBuffer): Promise<THREE.Group> {
  const {scene}=await new GLTFLoader().parseAsync(bytes,'');
  if (scene.getObjectByName('OI_Architecture')?.userData.asset !== 'opening-laboratory-v1' ||
      scene.getObjectByName('OI_Camera')?.userData.asset !== 'opening-surveillance-v1') {
    disposeGeometry(scene,true);
    throw new Error('Unexpected opening laboratory asset.');
  }
  return scene;
}

async function loadAsset(signal: AbortSignal): Promise<THREE.Group> {
  const response=await fetch(OPENING_LABORATORY_URL,{signal});
  if (!response.ok) throw new Error('Could not load the opening laboratory.');
  return parseOpeningLaboratory(await response.arrayBuffer());
}

/** Geometry-only set and one reusable camera prefab. Finishes and their maps
 * belong to the opening's Room 1 shell, never a second texture allocation. */
export class OpeningLaboratoryAsset {
  readonly root=new THREE.Group();
  private readonly abort=new AbortController();
  private preparation: Promise<void> | undefined;
  private source: THREE.Group | undefined;
  private prefab: THREE.Object3D | undefined;
  private readonly cameras: THREE.Object3D[]=[];
  private disposed=false;

  constructor() {this.root.name='opening-blender-laboratory';this.root.userData.visualOnly=true;}

  prepare(borrowFinish:(name:string)=>THREE.Material,
    loader:(signal:AbortSignal)=>Promise<THREE.Group>=loadAsset):Promise<void> {
    if(this.disposed)return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(source=>{
      if(this.disposed){disposeGeometry(source,true);return;}
      const replacements=new Map<THREE.Mesh,THREE.Material>(),originals=new Set<THREE.Material>();
      try {
        source.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          for(const material of Array.isArray(object.material)?object.material:[object.material])originals.add(material);
          replacements.set(object,borrowFinish(object.name.replace(/^OI_(Shell|Camera)_/,'')));
        });
      } catch(error){disposeGeometry(source,true);throw error;}
      for(const [object,material] of replacements){
        object.material=material;object.castShadow=false;object.receiveShadow=true;
        object.userData.visualOnly=true;
      }
      for(const material of originals)material.dispose();
      this.source=source;
      this.prefab=source.getObjectByName('OI_Camera')!;
      this.root.add(source.getObjectByName('OI_Architecture')!);
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }

  attachCamera(parent:THREE.Object3D):void {
    if(!this.prefab||this.disposed)throw new Error('Opening camera is not prepared.');
    const camera=this.prefab.clone(true);
    camera.name='opening-authored-surveillance-camera';
    // The gimbal moves, but these small meshes never enter the shadow pass.
    camera.traverse(object=>{if(object instanceof THREE.Mesh)object.receiveShadow=false;});
    this.cameras.push(camera);parent.add(camera);
  }

  get diagnostics(){
    let meshes=0,triangles=0,cameraMeshes=0;
    const count=(object:THREE.Object3D)=>{if(object instanceof THREE.Mesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}};
    this.root.traverse(count);
    this.prefab?.traverse(object=>{if(object instanceof THREE.Mesh)cameraMeshes++;});
    return {ready:!!this.source,meshes,triangles,cameraMeshes,cameras:this.cameras.length,textureCount:0};
  }

  dispose():void {
    if(this.disposed)return;
    this.disposed=true;this.abort.abort();
    for(const camera of this.cameras){camera.removeFromParent();camera.clear();}
    this.cameras.length=0;
    // Architecture was reparented from the source during adoption.
    if(this.source){this.source.add(...this.root.children);disposeGeometry(this.source,false);}
    this.source=undefined;this.prefab=undefined;
    this.root.removeFromParent();this.root.clear();
  }
}

function disposeGeometry(root:THREE.Object3D,materials:boolean):void {
  const geometry=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){geometry.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])owned.add(material);}});
  for(const value of geometry)value.dispose();
  if(materials)for(const value of owned)value.dispose();
  root.removeFromParent();root.clear();
}
