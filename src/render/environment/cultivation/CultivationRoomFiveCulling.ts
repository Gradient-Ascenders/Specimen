import * as THREE from 'three';

const inSewer=(p:THREE.Vector3)=>p.x>32&&p.x<48&&p.y< -3&&p.z>20&&p.z<136;
const inChamber=(p:THREE.Vector3)=>p.x> -19&&p.x<19&&p.y>2&&p.z>18&&p.z<78;

/** The opaque wall between the chamber and lower sewer is a visibility portal.
 * Mask static batches and explicitly registered presentation branches while both camera and player
 * are well inside the same sector. Physics, lights and mechanism owners stay
 * intact; the synchronous render scope always restores original visibility. */
export class CultivationRoomFiveCulling {
  private readonly chamber:THREE.Object3D[]=[];
  private readonly sewer:THREE.Object3D[]=[];
  private readonly hidden:THREE.Object3D[]=[];
  private readonly inverse=new THREE.Matrix4();
  private readonly eye=new THREE.Vector3();
  private readonly focus=new THREE.Vector3();
  private readonly root:THREE.Group;
  readonly diagnostics={chamberObjects:0,sewerObjects:0,culled:0,sector:'transition' as 'transition'|'chamber'|'sewer'};

  constructor(root:THREE.Group){
    this.root=root;
    // Direct, frozen authored batches cannot be moved by a mechanism. Bounds
    // are in Room 5 coordinates; keep anything spanning a portal in both views.
    for(const child of root.children){
      if(!(child instanceof THREE.Mesh)||!child.userData.blenderBatch||child.matrixAutoUpdate||child.children.length)continue;
      if(!child.geometry.boundingBox)child.geometry.computeBoundingBox();
      const box=child.geometry.boundingBox!.clone().applyMatrix4(child.matrix);
      if(box.max.x<23&&box.min.y>=-.6&&box.min.z>=16)this.chamber.push(child);
      else if(box.min.x>=29&&box.max.y<-.5&&box.min.z>=16)this.sewer.push(child);
    }
    this.diagnostics.chamberObjects=this.chamber.length;this.diagnostics.sewerObjects=this.sewer.length;
  }
  /** Encounter skins/effects stay in the chamber even as they move. Refuse
   * branches containing lights: shader slots and shadow allocation stay live. */
  registerChamber(...roots:readonly THREE.Object3D[]):void{
    for(const root of roots){
      let containsLight=false;root.traverse(object=>{if(object instanceof THREE.Light)containsLight=true;});
      if(containsLight)throw Error('Cultivation render culling cannot hide light owners.');
      if(!this.chamber.includes(root))this.chamber.push(root);
    }
    this.diagnostics.chamberObjects=this.chamber.length;
  }
  prepare(camera:THREE.Camera,activePosition:Pick<THREE.Vector3,'x'|'y'|'z'>,enabled=true):void{
    this.restore();this.diagnostics.sector='transition';this.diagnostics.culled=0;
    if(!enabled||!this.root.visible)return;
    this.root.updateWorldMatrix(true,false);this.inverse.copy(this.root.matrixWorld).invert();
    camera.getWorldPosition(this.eye).applyMatrix4(this.inverse);
    this.focus.copy(activePosition).applyMatrix4(this.inverse);
    let candidates:readonly THREE.Object3D[]|undefined;
    if(inSewer(this.eye)&&inSewer(this.focus)){this.diagnostics.sector='sewer';candidates=this.chamber;}
    else if(inChamber(this.eye)&&inChamber(this.focus)){this.diagnostics.sector='chamber';candidates=this.sewer;}
    if(candidates)for(const mesh of candidates)if(mesh.visible){mesh.visible=false;this.hidden.push(mesh);}
    this.diagnostics.culled=this.hidden.length;
  }
  restore():void{
    for(const mesh of this.hidden)mesh.visible=true;
    this.hidden.length=0;
  }
}
