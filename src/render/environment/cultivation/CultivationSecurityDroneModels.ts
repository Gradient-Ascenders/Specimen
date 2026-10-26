import * as THREE from 'three';
import type {CultivationAssetSource} from './CultivationBakedAssets.ts';
import type {SecurityDroneConfig} from '../../../hazards/SecurityDrone.ts';
import type {SecurityDroneGeometryRole,SecurityDroneGeometrySource} from '../../hazards/SecurityDronePresentation.ts';

/** Scene-owned immutable Blender buffers. Encounters borrow these across retry;
 * the original actor roots, indicator, aim pivots and physics remain live. */
export class CultivationSecurityDroneModels implements SecurityDroneGeometrySource {
  private readonly parts:Record<string,THREE.BufferGeometry>;
  private readonly empty=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([],3));
  private disposed=false;
  constructor(assets:CultivationAssetSource){
    this.parts=assets.geometries('cultivation-security-drones',()=>{
      throw Error('Cultivation security models must be baked from the Blender export.');
    });
  }
  geometry(config:SecurityDroneConfig,role:SecurityDroneGeometryRole,distant:boolean):THREE.BufferGeometry{
    if(this.disposed)throw Error('Cultivation security models are disposed.');
    const size=config.colliderSize.toArray();
    const kind=config.type==='ceiling'&&size.every((v,i)=>v===[1.2,.7,1.2][i])?'lift':config.type==='ceiling'&&size.every((v,i)=>v===[2,1.3,2][i])?'quarantine':config.type;
    const expected=kind==='quarantine'?[2,1.3,2]:kind==='lift'?[1.2,.7,1.2]:kind==='ceiling'?[2.2,1.35,2.2]:[3.6,1.5,1.7];
    if(size.some((v,i)=>v!==expected[i]))
      throw Error('Unexpected Cultivation security model envelope: '+config.id);
    // The lift's existing flight presentation owns its engine hardware.
    // Empty bracket owners preserve that presentation's normal lifecycle.
    if((kind==='lift'||kind==='quarantine')&&(role==='mount'||role==='linkage'))return this.empty;
    const name=`CV_${kind}_${distant?'distant':'full'}_${role}`,geometry=this.parts[name];
    if(!geometry)throw Error('Missing authored security part: '+name);
    return geometry;
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    for(const geometry of new Set(Object.values(this.parts)))geometry.dispose();
    this.empty.dispose();
  }
}
