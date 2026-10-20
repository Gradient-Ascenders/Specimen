import * as THREE from 'three';
import {BLACKOUT_ENTRY_VENT as V,blackoutEntryVentFloor} from '../../../cinematics/BlackoutVentArrivalLayout.ts';
import type {BlackoutMaintenanceMaterials} from './BlackoutMaintenanceMaterials.ts';
import {mapBlackoutBoxUVs} from './BlackoutMaintenanceUVs.ts';

/** Open, solid wall chute. Uses the bay's existing texture kit and static
 * batches; no runtime asset loads, extra lights or procedural textures. */
export function buildBlackoutEntryVent(root:THREE.Group,colliders:THREE.Mesh[],kit:BlackoutMaintenanceMaterials):THREE.Mesh[]{
  const details:THREE.Mesh[]=[],steel=kit.get('ductSteel'),trim=kit.get('machineryMetal');
  const add=(name:string,size:readonly[number,number,number],at:readonly[number,number,number],material:THREE.Material,solid=false,pitch=0,coveredSides=false)=>{
    const geometry=new THREE.BoxGeometry(...size);
    if(coveredSides){
      // X caps sit wholly inside the side walls. Removing those covered faces
      // avoids overlapping mitre caps between the rounded floor/roof panels;
      // the collider's original box bounds and vertices remain unchanged.
      const index=geometry.index!,indices:number[]=[];
      for(const group of geometry.groups)if((group.materialIndex??0)>=2)
        for(let i=group.start;i<group.start+group.count;i++)indices.push(index.getX(i));
      geometry.setIndex(indices);geometry.clearGroups();
    }
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`blackout-entry-${name}`;
    mesh.position.set(...at);mesh.rotation.x=pitch;mesh.updateMatrix();
    mesh.userData.surfaceTag='default';mesh.userData.authoringRole=solid?'blackout-entry-vent-collision':'blackout-entry-vent-detail';
    if(material instanceof THREE.MeshStandardMaterial)mapBlackoutBoxUVs(mesh.geometry,mesh.matrix,material.userData.tileSizeMetres??[1.5,1.5]);
    mesh.renderOrder=-1;root.add(mesh);(solid?colliders:details).push(mesh);return mesh;
  };
  // Box colliders retain the shared sphere-sweep contract. Short transition
  // panels match the smooth centreline without a vertical lip at the outlet.
  const sections=[V.startZ,-5,-4.5,-4.25,-4,-3.75,-3.5,V.mouthZ];
  for(let i=1;i<sections.length;i++){
    const a=sections[i-1],b=sections[i],ya=blackoutEntryVentFloor(a),yb=blackoutEntryVentFloor(b);
    const pitch=Math.atan2(ya-yb,b-a),length=Math.hypot(b-a,ya-yb),y=(ya+yb)/2,z=(a+b)/2;
    add(`chute-floor-${i}`,[V.halfWidth*2,.16,length],[0,y-.08/Math.cos(pitch),z],steel,true,pitch,true);
    add(`chute-roof-${i}`,[V.halfWidth*2,.16,length],[0,y+V.height+.08/Math.cos(pitch),z],steel,true,pitch,true);
    for(const side of [-1,1])add(`chute-side-${i}-${side}`,[.16,V.height+Math.abs(ya-yb),b-a],
      [side*(V.halfWidth+.08),y+V.height/2,z],steel,true);
  }
  // Recessed flanges and repeated service ribs stay outside the walking bore.
  for(let z=-26;z<V.mouthZ;z+=3){
    const y=blackoutEntryVentFloor(z);
    for(const side of [-1,1])add(`rib-side-${z}-${side}`,[.065,V.height-.12,.09],[side*(V.halfWidth-.025),y+V.height/2,z],trim);
    add(`rib-top-${z}`,[V.halfWidth*2-.115,.065,.09],[0,y+V.height-.025,z],trim);
  }
  for(const side of [-1,1])add(`mouth-jamb-${side}`,[.2,V.height+.4,.24],[side*(V.halfWidth+.13),V.floorY+V.height/2,-1.66],trim,true);
  for(const y of [V.floorY-.13,V.floorY+V.height+.13])add(`mouth-crossbar-${y}`,[V.halfWidth*2+.06,.2,.24],[0,y,-1.66],trim,true);
  const marker=new THREE.MeshBasicMaterial({name:'blackout-entry-vent-work-strips',color:0x536d73});
  for(const z of [-25,-20,-15,-10,-5])add(`work-strip-${z}`,[1.1,.025,.12],[0,blackoutEntryVentFloor(z)+V.height-.09,z],marker);
  return details;
}
