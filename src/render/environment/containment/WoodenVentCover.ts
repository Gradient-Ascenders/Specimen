import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM_FIVE_ESCAPE } from '../../../levels/RoomFiveEscapeLayout.ts';

/** One owned slatted face and one dissolve target inside the fixed metal sleeve. */
export function createWoodenVentCoverGeometry(): THREE.BufferGeometry {
  const [w,h,d]=ROOM_FIVE_ESCAPE.coverSize, pieces:THREE.BufferGeometry[]=[];
  const box=(size:readonly number[],at:readonly number[],roll=0)=>{
    const geometry=new THREE.BoxGeometry(size[0],size[1],size[2]);
    geometry.rotateZ(roll);geometry.translate(at[0],at[1],at[2]);pieces.push(geometry);
  };
  // A thin slatted face and its front frame sit in the fixed metal sleeve.
  // Hidden rear retaining battens preserve the original solid collider bounds
  // and the same single dissolve target through the complete wall thickness.
  box([w-.12,h-.12,.12],[0,0,-d/2+.13]);
  for(let i=0;i<6;i++)box([w-.20,h/6-.016,.055],[0,-h/2+h/12+i*h/6,-d/2+.0425]);
  box([2.0,.11,.055],[0,0,-d/2+.0275],.59);
  for(const side of [-1,1]){
    box([.09,h-.20,.055],[side*(w/2-.14),0,-d/2+.0275]);
    box([w,.09,.10],[0,side*(h/2-.045),-d/2+.05]);
    box([.09,h-.18,.10],[side*(w/2-.045),0,-d/2+.05]);
    box([.08,h-.24,.10],[side*(w/2-.14),0,d/2-.05]);
  }
  const merged=mergeGeometries(pieces,false)!;
  pieces.forEach(piece=>piece.dispose());merged.computeBoundingBox();merged.computeBoundingSphere();
  return merged;
}
