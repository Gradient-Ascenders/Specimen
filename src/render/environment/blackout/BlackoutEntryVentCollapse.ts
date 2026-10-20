import * as THREE from 'three';
import {BLACKOUT_ENTRY_VENT as V} from '../../../cinematics/BlackoutVentArrivalLayout.ts';
import {consolidateStaticRoomVisuals} from '../../StaticRoomVisuals.ts';
import type {ContainmentStaticBatchResult} from '../containment/ContainmentStaticBatching.ts';
import type {BlackoutMaintenanceMaterials} from './BlackoutMaintenanceMaterials.ts';
import {mapBlackoutBoxUVs} from './BlackoutMaintenanceUVs.ts';

/** A buckled duct panel drops behind the arriving slimes, closing the return
 * route. The moving visual is separate from one fixed, full-bore collider:
 * no moving broadphase entries or per-frame collision rebuilds are needed. */
export class BlackoutEntryVentCollapse {
  readonly root=new THREE.Group();
  readonly collisionMesh:THREE.Mesh;
  private readonly batches:ContainmentStaticBatchResult;

  constructor(parent:THREE.Group,kit:BlackoutMaintenanceMaterials){
    this.root.name='blackout-entry-collapsed-panel';parent.add(this.root);
    const details:THREE.Mesh[]=[];
    const add=(name:string,size:readonly[number,number,number],position:readonly[number,number,number],family:'ductSteel'|'machineryMetal',roll=0)=>{
      const material=kit.get(family),geometry=new THREE.BoxGeometry(...size);
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`blackout-entry-collapse-${name}`;
      mesh.position.set(...position);mesh.rotation.z=roll;mesh.updateMatrix();
      mesh.castShadow=mesh.receiveShadow=true;mesh.renderOrder=-1;
      mesh.userData.authoringRole='blackout-entry-collapse-detail';
      mapBlackoutBoxUVs(geometry,mesh.matrix,material.userData.tileSizeMetres,'object');
      this.root.add(mesh);details.push(mesh);return mesh;
    };
    // Slightly overlapping the jambs makes the collapsed panel read as wedged
    // into the duct, not as a floating door or a decorative grille to fly through.
    const panel=add('sheet',[V.halfWidth*2+.06,V.height+.06,.2],[0,0,0],'ductSteel');
    const geometry=new THREE.BoxGeometry(V.halfWidth*2+.06,V.height+.06,.2,6,4);
    panel.geometry.dispose();panel.geometry=geometry;
    const vertices=geometry.getAttribute('position');
    for(let i=0;i<vertices.count;i++){
      const x=vertices.getX(i),y=vertices.getY(i);
      vertices.setZ(i,vertices.getZ(i)+.09*Math.sin(x*3.1)*Math.cos(y*1.6));
    }
    geometry.computeVertexNormals();
    mapBlackoutBoxUVs(geometry,panel.matrix,kit.get('ductSteel').userData.tileSizeMetres,'object');
    for(const [index,y] of [-1.15,0,1.15].entries())
      add(`crushed-rib-${index}`,[V.halfWidth*2+.08,.12,.16],[0,y,.23],'machineryMetal',(index-1)*.035);
    add('fallen-brace',[.15,4.1,.16],[.1,0,.4],'machineryMetal',-.83);
    for(const [index,x] of [-1.6,1.55].entries())
      add(`torn-flange-${index}`,[.32,.55,.16],[x,1.2,.37],'ductSteel',index?-.22:.18);
    this.batches=consolidateStaticRoomVisuals(this.root,details);

    this.collisionMesh=new THREE.Mesh(new THREE.BoxGeometry(V.halfWidth*2+.08,V.height+.08,.8),
      new THREE.MeshBasicMaterial({visible:false}));
    this.collisionMesh.name='blackout-entry-collapse-blocker';
    this.collisionMesh.position.set(0,V.floorY+V.height/2,V.blockageZ+.16);
    this.collisionMesh.userData.surfaceTag='default';
    this.collisionMesh.userData.authoringRole='blackout-entry-collapse-collision';
    parent.add(this.collisionMesh);this.seal();
  }
  get sealed():boolean{return this.collisionMesh.visible;}

  /** Only the first arrival opens it; checkpoint recovery never does. */
  openForArrival():void{this.collisionMesh.visible=false;this.present(0);}

  update(seconds:number):void{
    this.present(seconds);
    if(seconds>=V.collapseEnd)this.collisionMesh.visible=true;
  }
  /** Interpolated visuals never change whether the route is solid. */
  present(seconds:number):void{
    const fall=THREE.MathUtils.clamp((seconds-V.collapseStart)/(V.collapseImpact-V.collapseStart),0,1);
    const settle=THREE.MathUtils.clamp((seconds-V.collapseImpact)/(V.collapseEnd-V.collapseImpact),0,1);
    const bounce=.08*Math.sin(Math.PI*settle)*(1-settle);
    this.root.position.set(0,V.floorY+V.height/2+(V.height+.5)*(1-fall*fall)+bounce,V.blockageZ);
    this.root.rotation.z=-.09*(1-fall)+.025*Math.sin(settle*Math.PI*3)*(1-settle);
  }
  seal():void{this.present(V.collapseEnd);this.collisionMesh.visible=true;}
  /** Geometry/material ownership remains with the containing maintenance bay. */
  dispose():void{this.batches.dispose();}
}
