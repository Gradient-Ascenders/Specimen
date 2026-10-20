import * as THREE from 'three';
import {createCultivationFacilityLettering as letters} from '../render/environment/cultivation/CultivationFacilityLettering.ts';
import {VOLT_FINALE_VENT as V} from './CultivationFinaleLayout.ts';

export type FinaleDuctFinish='shell'|'edge'|'trim'|'panels'|'floor'|'pipe'|'warm'|'hazard'|'lettering'|'exit'|'labWall'|'labFloor'|'labGlass';
type Add=(geometry:THREE.BufferGeometry)=>void;
export type FinaleDuctBuilder=(name:string,finish:FinaleDuctFinish,draw:(add:Add)=>void,moving?:0|1)=>void;
const box=(size:readonly[number,number,number],at:readonly[number,number,number])=>new THREE.BoxGeometry(...size).translate(...at);

/** Offline-baked escape airway. Direction signs belong to the glimpsed service
 * room, not the duct. Its other side branch is Goop's unlabelled approach. */
export function buildCultivationFinaleDuct(build:FinaleDuctBuilder):void{
  const end=V.endX,holeLeft=V.dropX-1.4,holeRight=V.dropX+1.4;
  const left=V.inspectionX-1.4,right=V.inspectionX+1.4;
  const segment=(add:Add,a:number,b:number,y:number,z:number,height=2.8,depth=.18)=>
    add(box([b-a,height,depth],[(a+b)/2,y,z]));
  build('escape-duct-shell','shell',add=>{
    add(box([holeLeft-20,.18,2.8],[(holeLeft+20)/2,-.12,V.z]));
    add(box([end-holeRight,.18,2.8],[(end+holeRight)/2,-.12,V.z]));
    add(box([end-20,.18,3.2],[(end+20)/2,2.82,V.z]));
    segment(add,20,left,1.35,59.99);segment(add,right,end,1.35,59.99);
    segment(add,left,right,.2,59.99,.48);segment(add,left,right,2.57,59.99,.46);
    segment(add,20,V.branchX-1.5,1.35,63.01);
    segment(add,V.branchX+1.5,end,1.35,63.01);
    // Goop's route comes from the damp side tunnel, not from the new sign room.
    for(const x of [V.branchX-1.49,V.branchX+1.49])add(box([.18,2.8,9],[x,1.35,67.5]));
    add(box([2.8,.18,9],[V.branchX,-.12,67.5]));add(box([3.2,.18,9],[V.branchX,2.82,67.5]));
    add(box([3.2,3,.18],[V.branchX,1.35,72.09]));
    for(const x of [V.dropX-1.49,V.dropX+1.49])add(box([.18,70,3.2],[x,-35,V.z]));
    for(const z of [59.99,63.01])add(box([2.8,70,.18],[V.dropX,-35,z]));
    add(box([.18,2.8,3.2],[end+.09,1.35,V.z]));
  });
  build('duct-reinforcing-ribs','edge',add=>{
    for(let x=22;x<end;x+=3){
      for(const z of [60.12,62.88]){
        if(z<61&&x>left-.2&&x<right+.2||z>62&&Math.abs(x-V.branchX)<1.6)continue;
        add(box([.1,2.65,.1],[x,1.3,z]));
      }
      add(box([.1,.1,2.8],[x,2.66,V.z]));
    }
    for(let y=-2;y>=-68;y-=3){
      for(const x of [V.dropX-1.34,V.dropX+1.34])add(box([.1,.1,2.8],[x,y,V.z]));
      for(const z of [60.15,62.85])add(box([2.8,.1,.1],[V.dropX,y,z]));
    }
  });
  build('duct-service-panels','panels',add=>{
    for(let x=21.5;x<end-1;x+=2.5){
      if(x+1.08<left||x-1.08>right)add(box([2.15,2.17,.035],[x,1.38,60.12]));
      if(Math.abs(x-V.branchX)>2.6)add(box([2.15,2.17,.035],[x,1.38,62.88]));
      add(box([2.15,.035,2.3],[x,2.68,V.z]));
    }
    for(let y=-3;y>=-66;y-=3){
      for(const x of [V.dropX-1.34,V.dropX+1.34])add(box([.035,2.6,2.3],[x,y-1.5,V.z]));
      for(const z of [60.15,62.85])add(box([2.3,2.6,.035],[V.dropX,y-1.5,z]));
    }
  });
  build('duct-floor-trays','floor',add=>{
    for(const [a,b] of [[21.2,holeLeft-.6],[holeRight+.7,end-.6]])for(let x=a;x<b;x+=1.25){
        add(box([1.13,.025,2.3],[x,.005,V.z]));
        for(const z of [60.55,61,61.5,62,62.45])add(box([.86,.018,.035],[x,.04,z]));
      }
    for(const x of [holeLeft-.04,holeRight+.04])add(box([.1,.045,2.8],[x,.02,V.z]));
  });
  // Ordinary pressed sheet-metal flooring, not a visible trapdoor/grating.
  // Its weak underside joint is only revealed when the duct starts to fail.
  for(const side of [0,1] as const){
    const sign=side===0?1:-1;
    build(`breakaway-grate-${side}-frame`,'floor',add=>{
      add(box([1.34,.055,2.62],[sign*.69,-.02,0]));
      for(const x of [.22,.58,.94,1.22])add(box([.035,.015,2.3],[sign*x,.02,0]));
      for(const z of [-1.1,1.1])add(box([1.2,.05,.08],[sign*.69,-.085,z]));
    },side);
    build(`breakaway-grate-${side}-rust`,'pipe',add=>{
      for(const z of [-1.2,1.2])for(const x of [.1,1.28])
        add(new THREE.CylinderGeometry(.025,.025,.018,8).translate(sign*x,.017,z));
      for(const z of [-.8,.8])add(box([.07,.018,.1],[sign*1.3,-.07,z]));
    },side);
  }
  build('duct-conduits-and-fasteners','trim',add=>{
    for(const z of [60.22,62.78])add(box([holeLeft-20.4,.1,.1],[(holeLeft+20.4)/2,2.43,z]));
    for(let x=22;x<end;x+=3)for(const z of [60.18,62.82])for(const y of [.35,2.3]){
      if(z<61&&Math.abs(x-V.inspectionX)<1.6||z>62&&Math.abs(x-V.branchX)<1.6)continue;
      add(new THREE.CylinderGeometry(.045,.045,.05,6).rotateX(Math.PI/2).translate(x,y,z));
    }
    for(const x of [V.branchX-1.36,V.branchX+1.36])for(const z of [64.2,66.7,69,71.5]){
      add(box([.075,2.55,.1],[x,1.3,z]));add(box([2.8,.075,.1],[V.branchX,2.64,z]));
    }
    for(const x of [left-.09,right+.09])add(box([.12,1.95,.16],[x,1.4,60.1]));
    for(const y of [.46,2.36])add(box([3.12,.12,.2],[V.inspectionX,y,60.1]));
  });
  build('duct-service-copper','pipe',add=>{
    for(const [a,b] of [[20.3,left-.2],[right+.2,end-.3]])for(const y of [.48,.72]){
      add(new THREE.CylinderGeometry(.042,.042,b-a,8).rotateZ(Math.PI/2).translate((a+b)/2,y,60.23));
    }
    for(let x=22;x<holeLeft-1;x+=3){
      if(Math.abs(x-V.inspectionX)<1.7)continue;
      add(box([.12,.48,.07],[x,.6,60.24]));
    }
  });
  build('duct-practical-strips','warm',add=>{
    for(let x=21.8;x<end-1;x+=5)for(const z of [60.3,62.7])add(box([1.15,.025,.06],[x,2.57,z]));
    for(let y=-3;y>=-66;y-=6)for(const x of [V.dropX-1.2,V.dropX+1.2])add(box([.045,.48,.065],[x,y,60.22]));
  });
  build('loose-inspection-grille','trim',add=>{
    const loose=(size:readonly[number,number,number],at:readonly[number,number,number])=>
      box(size,at).rotateX(.52).translate(V.inspectionX,2.25,60.06);
    for(const x of [-1.3,1.3])add(loose([.1,1.7,.085],[x,-.85,0]));
    for(const y of [-.05,-1.65])add(loose([2.48,.1,.085],[0,y,0]));
    for(let y=-.26;y>-1.6;y-=.24)add(loose([2.48,.075,.05],[0,y,0]));
    // Hinged at the top, leaving a real narrow opening under the lower edge.
    for(const x of [-.95,.95])add(box([.18,.14,.18],[V.inspectionX+x,2.31,60.04]));
  });
  // A clean service laboratory contrasts with the old corroded duct. Realistic
  // wayfinding is a small wall plaque, not oversized words across the room.
  build('inspection-room-shell','labWall',add=>{
    add(box([16,.2,8],[V.inspectionX,-.65,56]));add(box([16,.18,8],[V.inspectionX,4.1,56]));
    add(box([16,4.7,.18],[V.inspectionX,1.7,V.roomBackZ-.1]));
    for(const x of [V.inspectionX-8,V.inspectionX+8]){
      add(box([.18,4.7,2.4],[x,1.7,53.6]));add(box([.18,4.7,2],[x,1.7,59]));
      add(box([.18,1.15,3.2],[x,3.47,56.4]));
    }
    add(box([6,.2,3.2],[V.inspectionX+11,-.65,56.4]));
    for(let i=0;i<6;i++)add(box([1,.26,3.2],[V.inspectionX-8.5-i,-.65-i*.45,56.4]));
  });
  build('inspection-room-hardware','edge',add=>{
    for(const x of [V.inspectionX-6,V.inspectionX-2,V.inspectionX+2,V.inspectionX+6])add(box([.045,4.4,.065],[x,1.7,V.roomBackZ+.03]));
    for(const y of [-.4,1.1,3.6])add(box([15.7,.035,.065],[V.inspectionX,y,V.roomBackZ+.03]));
    add(box([3.25,.92,.12],[V.inspectionX,2.75,V.roomBackZ+.18]));
    for(const x of [V.inspectionX-8,V.inspectionX+8])for(const z of [54.78,58.02])add(box([.16,3.5,.16],[x,1.2,z]));
    for(const x of [V.inspectionX-5,V.inspectionX+5]){
      add(box([3.3,.9,1.05],[x,-.02,53.32]));
      add(box([3.4,.1,1.15],[x,.47,53.32]));
      add(box([3.32,1.6,.12],[x,2.16,V.roomBackZ+.2]));
    }
  });
  build('inspection-room-floor','labFloor',add=>{
    for(let x=V.inspectionX-7.5;x<V.inspectionX+8;x+=1.5)for(let z=52.75;z<60;z+=1.5)
      add(box([1.48,.025,1.48],[x,-.535,z]));
    add(box([15.8,.14,.1],[V.inspectionX,-.3,V.roomBackZ+.13]));
    for(const x of [V.inspectionX-7.85,V.inspectionX+7.85])add(box([.12,.12,7.3],[x,-.3,56.15]));
  });
  build('inspection-room-lab-furniture','labWall',add=>{
    for(const x of [V.inspectionX-5,V.inspectionX+5]){
      for(const side of [-1,1]){
        add(box([1.54,.69,.045],[x+side*.81,-.02,53.87]));
        add(box([.37,.045,.06],[x+side*.81,.16,53.915]));
      }
      add(box([1,.1,.6],[x,.57,53.36]));
      for(const dx of [-.3,.3])add(new THREE.CylinderGeometry(.06,.1,.3,10).translate(x+dx,.77,53.36));
    }
    for(const x of [V.inspectionX-7,V.inspectionX+7])add(box([.6,.9,.12],[x,2.9,V.roomBackZ+.2]));
  });
  build('inspection-room-observation-glass','labGlass',add=>{
    for(const x of [V.inspectionX-5,V.inspectionX+5]){
      add(box([3.02,1.34,.025],[x,2.16,V.roomBackZ+.275]));
      for(const dx of [-.78,.78])add(box([.025,1.3,.02],[x+dx,2.16,V.roomBackZ+.3]));
    }
  });
  build('inspection-room-equipment','trim',add=>{
    for(const x of [V.inspectionX-5,V.inspectionX+5]){
      add(box([.9,.62,.12],[x,1.03,53.15]));
      add(box([.13,.22,.13],[x,.66,53.15]));
    }
    for(const x of [V.inspectionX-7,V.inspectionX+7])for(let y=2.58;y<3.3;y+=.1)
      add(box([.42,.025,.04],[x,y,V.roomBackZ+.275]));
  });
  build('inspection-room-lights','warm',add=>{
    for(const x of [V.inspectionX-5,V.inspectionX,V.inspectionX+5])add(box([2.1,.035,.5],[x,3.95,56]));
    for(const x of [V.inspectionX-7.9,V.inspectionX+7.9])add(box([.08,.1,2.8],[x,2.83,56.4]));
    for(const x of [V.inspectionX-5,V.inspectionX+5])add(box([.73,.43,.015],[x,1.03,53.22]));
  });
  const arrow=(add:Add,x:number,y:number,angle:number)=>{
    const length=.32,z=V.roomBackZ+.26;
    add(new THREE.PlaneGeometry(length,.024).rotateZ(angle).translate(x,y,z));
    const tipX=x+Math.cos(angle)*length/2,tipY=y+Math.sin(angle)*length/2;
    for(const sign of [-1,1]){
      const wing=angle+sign*Math.PI/4;
      add(new THREE.PlaneGeometry(.14,.024).rotateZ(wing)
        .translate(tipX-Math.cos(wing)*.07,tipY-Math.sin(wing)*.07,z));
    }
  };
  build('inspection-room-exit-direction','exit',add=>{
    add(letters('EXIT',.18,[V.inspectionX-.35,2.87,V.roomBackZ+.26],0));
    arrow(add,V.inspectionX+1.07,2.96,0);
  });
  build('inspection-room-basement-direction','lettering',add=>{
    add(letters('BASEMENT',.24,[V.inspectionX-.57,2.46,V.roomBackZ+.26],0));
    arrow(add,V.inspectionX-1.13,2.59,-3*Math.PI/4);
  });
}
