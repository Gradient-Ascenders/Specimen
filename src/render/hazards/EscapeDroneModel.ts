import * as THREE from 'three';
import model from '../../../assets/characters/escape-drone/escape-drone.geometry.json' with {type:'json'};
import type {SecurityDroneConfig} from '../../hazards/SecurityDrone.ts';
import type {CinematicPreparationJob} from '../../cinematics/IdleCinematicPreparation.ts';
import type {SecurityDroneGeometryRole,SecurityDroneGeometrySource} from './SecurityDronePresentation.ts';

const arrayTypes={Float32Array,Uint16Array,Uint8Array,Uint32Array,Int16Array,Int8Array};

/** One cinematic owns eight immutable Blender buffers; four craft borrow them. */
export class EscapeDroneModel implements SecurityDroneGeometrySource {
  private readonly parts=new Map<string,THREE.BufferGeometry>();
  private readonly empty=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([],3));
  private disposed=false;

  *preparationJobs():Generator<CinematicPreparationJob>{
    if(model.version!==1)throw Error('Unsupported escape drone asset.');
    for(const [name,data] of Object.entries(model.parts))yield {label:'finale Blender buffer '+name,run:()=>{
      if(this.disposed)return;
      const geometry=new THREE.BufferGeometry();
      for(const [key,attribute] of Object.entries(data.attributes)){
        const ArrayType=arrayTypes[attribute.type as keyof typeof arrayTypes];
        if(!ArrayType)throw Error('Unsupported escape drone attribute: '+attribute.type);
        geometry.setAttribute(key,new THREE.BufferAttribute(new ArrayType(attribute.values),attribute.itemSize,attribute.normalized));
      }
      if(data.index)geometry.setIndex(data.index);
      geometry.computeBoundingBox();geometry.computeBoundingSphere();this.parts.set(name,geometry);
    }};
  }
  geometry(config:SecurityDroneConfig,role:SecurityDroneGeometryRole,_distant:boolean):THREE.BufferGeometry{
    if(config.type!=='ceiling'||config.colliderSize.toArray().some((v,i)=>v!==[1.6,.8,1.4][i]))
      throw Error('Unexpected escape drone scale.');
    // Free flight has no ceiling bracket. The existing presentation removes
    // these two empty owners before rendering, without preparing retired art.
    return role==='mount'||role==='linkage'?this.empty:this.part('ED_Head_'+role);
  }
  part(name:string):THREE.BufferGeometry{
    if(this.disposed)throw Error('Escape drone model was disposed.');
    const geometry=this.parts.get(name);if(!geometry)throw Error('Escape drone buffer is not prepared: '+name);
    return geometry;
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    for(const geometry of this.parts.values())geometry.dispose();
    this.parts.clear();this.empty.dispose();
  }
}
