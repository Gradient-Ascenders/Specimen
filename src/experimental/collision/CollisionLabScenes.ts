import * as THREE from 'three';
import { CollisionWorld } from '../../physics/CollisionWorld.ts';
import type { Vec3 } from '../ground/GroundBody.ts';

export interface LabBox {
  name: string; size: Vec3; position: Vec3; rotationZ?: number;
  sideOnly?: boolean;
}
export interface CollisionScenario {
  id: string; name: string; description: string; spawn: Vec3; boxes: readonly LabBox[];
  initialVelocity?: Vec3;
  initialScale?: Vec3;
}
const floor: LabBox={name:'finite-floor',size:[16,.5,8],position:[0,-.25,0]};
const wall: LabBox={name:'thin-solid-wall',size:[.02,2,4],position:[1,1,0]};
export const COLLISION_SCENARIOS: readonly CollisionScenario[] = [
  {id:'flat',name:'Flat reference / A–B',description:'Finite 100 m floor. Compare the accepted plane solver with finite collision, without changing material.',spawn:[-4,.51,0],
    boxes:[{name:'reference-floor',size:[100,1,100],position:[0,-.5,0]}]},
  {id:'obstacles',name:'Solid walls, edges and corners',description:'Drive into and around the solid boxes. Walls have no adhesion; move around them on X/Z.',spawn:[-4,.51,0],
    boxes:[floor,{name:'corner-block',size:[1,1.5,2],position:[0,.75,-.5]}, {name:'low-step',size:[1,.15,1.4],position:[-2,.075,2]},wall]},
  {id:'platforms',name:'Finite platforms / falling edge',description:'Drive off the starting platform onto the lower landing. The empty space is genuinely empty; R resets a fall.',spawn:[-3,1.01,0],
    boxes:[{name:'start-platform',size:[6,.5,4],position:[-2,.25,0]}, {name:'lower-landing',size:[5,.25,5],position:[3.5,-.925,0]}]},
  {id:'slope',name:'15° slope and bank join',description:'D climbs the ramp from the flat bank. Try reversing and traversing sideways. Gravity remains world-down.',spawn:[-5,.51,0],
    boxes:[{name:'lower-bank',size:[4,.5,4],position:[-5,-.25,0]}, {name:'15-degree-ramp',size:[6,.5,4],position:[0,.55,0],rotationZ:Math.PI/12},
      {name:'upper-bank',size:[4,.5,4],position:[4.85,1.353,0]}]},
  {id:'steep',name:'45° non-sticky obstacle slope',description:'A steep finite surface to push against, slide on or approach sideways. There is no wall attachment or gravity reorientation.',spawn:[-4,.51,0],
    boxes:[floor,{name:'steep-ramp',size:[4,.3,4],position:[0,1.2,0],rotationZ:Math.PI/4}]},
  {id:'thin',name:'Thin plate / narrow post',description:'A 12 mm post and 20 mm plate challenge the gaps between cage nodes. Contacts can act on triangle interiors and edges.',spawn:[-4,.51,0],
    boxes:[floor,{name:'12mm-post',size:[.012,1.4,.012],position:[-1,.7,0]},wall]},
  {id:'gap',name:'0.70 m squeeze passage',description:'Enter the passage with D. The cage may redistribute mass, but collision must keep the skin out of both sides.',spawn:[-4,.51,0],
    boxes:[floor,{name:'gap-north',size:[5,1.5,.3],position:[0,.75,-.5]},{name:'gap-south',size:[5,1.5,.3],position:[0,.75,.5]}]},
  {id:'blocked-gap',name:'0.30 m blocked-gap stress',description:'A deliberately severe restriction. Blocking is acceptable; local inversion, tunnelling and a rigid substitute are not.',spawn:[-4,.51,0],
    boxes:[floor,{name:'tight-north',size:[5,1.5,.3],position:[0,.75,-.3]},{name:'tight-south',size:[5,1.5,.3],position:[0,.75,.3]}]},
  {id:'overlap',name:'Initial floor overlap recovery',description:'Spawn intersects the finite floor. Recovery uses actual cage extents and clears velocity; it is separate from ordinary contact response.',spawn:[0,.15,0],boxes:[floor]},
  {id:'enclosed',name:'Obstacle initially inside cage',description:'A tiny solid starts wholly inside the body, between every surface node. Reset must detect and recover this overlap too.',spawn:[0,.51,0],
    boxes:[floor,{name:'enclosed-solid',size:[.04,.04,.04],position:[0,.51,0]}]},
  {id:'fast-drop',name:'60 m/s impact / 20 mm floor',description:'Diagnostic initial velocity only: a high-speed fall onto a thin finite slab. There is no jump control.',spawn:[0,4,0],initialVelocity:[0,-60,0],
    boxes:[{name:'20mm-landing',size:[8,.02,6],position:[0,-.01,0]}]},
  {id:'fast-wall',name:'80 m/s impact / 20 mm wall',description:'Diagnostic initial velocity drives the cage into a thin wall. Inspect local deformation, contact and validity limits.',spawn:[-3,.51,0],initialVelocity:[80,0,0],boxes:[floor,wall]},
  {id:'correction',name:'Constraint-driven contact',description:'The initial cage is compressed horizontally next to a thin plate. Accepted rest constraints expand it into contact without an input impulse.',spawn:[0,.51,0],initialScale:[.55,1,1],
    boxes:[floor,{name:'projection-plate',size:[.02,1.6,4],position:[.34,.8,0]}]},
];

export class CollisionLabScene {
  readonly world=new CollisionWorld();
  readonly root=new THREE.Group();
  readonly meshes: THREE.Mesh[]=[];
  readonly definition: CollisionScenario;
  constructor(definition: CollisionScenario) {
    this.definition=definition;
    for(const [i,box] of definition.boxes.entries()) {
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(...box.size),new THREE.MeshBasicMaterial({color:i===0?0x283b49:0x516171}));
      mesh.name=box.name;mesh.position.fromArray(box.position);mesh.rotation.z=box.rotationZ??0;
      mesh.userData.preciseMovementCorners=true;
      if(box.sideOnly)mesh.userData.movementFaceMode='vertical-sides';
      mesh.updateWorldMatrix(true,false);this.world.register(mesh,undefined,'static');this.meshes.push(mesh);
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x8fa0ae}));
      mesh.add(edges);this.root.add(mesh);
      // Metre marks are clipped to each finite top face: no visual or physical
      // infinite floor underneath gaps. Ramp marks follow the authored box.
      if(box.size[1]<Math.min(box.size[0],box.size[2])){
        const points:number[]=[],x=box.size[0]/2,z=box.size[2]/2,y=box.size[1]/2+.001;
        for(let i=Math.ceil(-x);i<x;i++)points.push(i,y,-z,i,y,z);
        for(let i=Math.ceil(-z);i<z;i++)points.push(-x,y,i,x,y,i);
        const grid=new THREE.BufferGeometry();grid.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
        mesh.add(new THREE.LineSegments(grid,new THREE.LineBasicMaterial({color:0x415565})));
      }
    }
  }
  dispose(): void {
    this.root.removeFromParent();this.world.clear();
    this.root.traverse(object=>{
      if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){
        object.geometry.dispose();
        const materials=Array.isArray(object.material)?object.material:[object.material];
        for(const material of materials)material.dispose();
      }
    });
  }
}
