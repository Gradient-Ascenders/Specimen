import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ContainmentMonitorResources } from '../containment/ContainmentMonitor.ts';

/** Armoured hold control; all collision, press travel and colour authority stay in Room 2. */
export class CultivationRoomTwoButtonArt {
  readonly root=new THREE.Group();
  private readonly pad:THREE.Mesh;
  private readonly originalGeometry:THREE.BufferGeometry;
  private readonly rounded=new RoundedBoxGeometry(.26,1.4,1.4,1,.055);
  private readonly geometries:THREE.BufferGeometry[]=[this.rounded];
  private disposed=false;

  constructor(pad:THREE.Mesh,resources:ContainmentMonitorResources){
    this.pad=pad;this.originalGeometry=pad.geometry;pad.geometry=this.rounded;
    this.root.name='cultivation-room-2-armoured-button';this.root.position.copy(pad.position);
    this.root.userData.presentationOwnedBy=this.root.name;
    const hardware=(name:string,material:THREE.Material,parts:readonly {size:readonly[number,number,number];at:readonly[number,number,number]}[])=>{
      const pieces=parts.map(p=>new RoundedBoxGeometry(...p.size,1,Math.min(.035,...p.size.map(v=>v*.2))).translate(...p.at));
      const geometry=mergeGeometries(pieces)!;for(const part of pieces)part.dispose();this.geometries.push(geometry);
      const mesh=new THREE.Mesh(geometry,material);mesh.name=name;this.root.add(mesh);
    };
    hardware('cultivation-room-2-wall-button-armoured-housing',resources.materials.graphite,[
      {size:[.24,1.9,1.9],at:[-.18,0,0]},
      ...[-1,1].flatMap(side=>[
        {size:[.27,.18,2.1] as const,at:[-.02,side*.96,0] as const},
        {size:[.27,1.74,.18] as const,at:[-.02,0,side*.96] as const},
      ]),
    ]);
    hardware('cultivation-room-2-wall-button-captive-fasteners',resources.materials.serviceMetal,
      [-1,1].flatMap(y=>[-1,1].map(z=>({size:[.05,.07,.07] as const,at:[.13,y*.96,z*.96] as const}))));
    hardware('cultivation-room-2-wall-button-status-bars',pad.material as THREE.Material,
      [-1,1].map(side=>({size:[.025,1.25,.055] as const,at:[.1,0,side*1.145] as const})));
    this.root.traverse(node=>{node.userData.visualOnly=true;node.updateMatrix();node.matrixAutoUpdate=false;});
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    this.pad.geometry=this.originalGeometry;this.root.removeFromParent();this.root.clear();
    this.geometries.forEach(g=>g.dispose());
  }
}
