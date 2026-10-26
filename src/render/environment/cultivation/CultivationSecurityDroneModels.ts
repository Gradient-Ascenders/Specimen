import * as THREE from 'three';
import type {CultivationAssetSource} from './CultivationBakedAssets.ts';
import type {SecurityDroneConfig} from '../../../hazards/SecurityDrone.ts';
import type {SecurityDroneGeometryRole,SecurityDroneGeometrySource} from '../../hazards/SecurityDronePresentation.ts';

/** Scene-owned immutable Blender buffers. Encounters borrow these across retry;
 * the original actor roots, indicator, aim pivots and physics remain live. */
export class CultivationSecurityDroneModels implements SecurityDroneGeometrySource {
  private readonly parts:Record<string,THREE.BufferGeometry>;
  private disposed=false;
  constructor(assets:CultivationAssetSource){
    this.parts=assets.geometries('cultivation-security-drones',()=>{
      throw Error('Cultivation security models must be baked from the Blender export.');
    });
  }
  geometry(config:SecurityDroneConfig,role:SecurityDroneGeometryRole,distant:boolean):THREE.BufferGeometry{
    if(this.disposed)throw Error('Cultivation security models are disposed.');
    const expected=config.type==='ceiling'?[2.2,1.35,2.2]:[3.6,1.5,1.7];
    if(config.colliderSize.toArray().some((v,i)=>v!==expected[i]))
      throw Error('Unexpected Cultivation security model envelope: '+config.id);
    const name=`CV_${config.type}_${distant?'distant':'full'}_${role}`,geometry=this.parts[name];
    if(!geometry)throw Error('Missing authored security part: '+name);
    return geometry;
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    for(const geometry of new Set(Object.values(this.parts)))geometry.dispose();
  }
}
