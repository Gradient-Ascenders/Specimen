import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM_FIVE_ESCAPE } from '../../../levels/RoomFiveEscapeLayout.ts';

/** One owned mesh and one dissolve target, with a genuinely solid core/top. */
export function createWoodenVentCoverGeometry(): THREE.BufferGeometry {
  const [w,h,d]=ROOM_FIVE_ESCAPE.coverSize, pieces:THREE.BufferGeometry[]=[];
  const box=(size:readonly number[],at:readonly number[],roll=0)=>{
    const geometry=new THREE.BoxGeometry(size[0],size[1],size[2]);
    geometry.rotateZ(roll);geometry.translate(at[0],at[1],at[2]);pieces.push(geometry);
  };
  box([w-.12,h-.12,d-.16],[0,0,0]);
  for(const side of [-1,1]){
    for(let i=0;i<6;i++)box([w,h/6-.016,.07],[0,-h/2+h/12+i*h/6,side*(d/2-.085)]);
    box([2.2,.13,.09],[0,0,side*(d/2-.045)],.59);
    box([.13,h-.16,.09],[-w/2+.13,0,side*(d/2-.045)]);
    box([.13,h-.16,.09],[w/2-.13,0,side*(d/2-.045)]);
    box([w,.09,d],[0,side*(h/2-.045),0]);
    box([.09,h-.18,d],[side*(w/2-.045),0,0]);
  }
  const merged=mergeGeometries(pieces,false)!;
  pieces.forEach(piece=>piece.dispose());merged.computeBoundingBox();merged.computeBoundingSphere();
  return merged;
}
