import * as THREE from 'three';
import type { ElectricalTargetRegistry, ElectricalConnectionTarget } from '../abilities/ElectricalTargetRegistry.ts';
import { CollisionHit, CollisionLayer, type CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import { VerticalBlastDoor } from '../puzzle/VerticalBlastDoor.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { BLACKOUT_BAY_LAYOUT, type BlackoutMaintenanceBay } from './BlackoutMaintenanceBay.ts';

type SlimeId = 'bob' | 'goop' | 'volt';

/** Room-local circuit and completion state; runtime checkpoints own group recovery. */
export class BlackoutMaintenanceBayController {
  readonly bay: BlackoutMaintenanceBay;
  readonly door: VerticalBlastDoor;
  readonly receiver: THREE.Mesh;
  readonly target: ElectricalConnectionTarget;
  powered = false;
  complete = false;
  private readonly unregister: () => void;
  private charge = 0;
  private voltTraversedVent = false;
  private readonly world: CollisionWorld;
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly rayHit = new CollisionHit();
  private readonly indicatorMaterial = new THREE.MeshStandardMaterial({color:0xff2720,emissive:0xff160b,emissiveIntensity:1.5,roughness:.35});
  private readonly indicatorLight = new THREE.PointLight(0xff2716, .7, 2, 2);

  constructor(bay: BlackoutMaintenanceBay, world: CollisionWorld, surfaces: SurfaceRegistry, registry: ElectricalTargetRegistry) {
    this.bay=bay;
    this.world=world;
    this.door = new VerticalBlastDoor({id:'maintenance-bay-exit', collisionWorld:world, surfaceRegistry:surfaces,
      closedPosition:new THREE.Vector3(6,1.5,BLACKOUT_BAY_LAYOUT.rearZ),panelSize:new THREE.Vector3(3,3,.4),
      travelAxis:new THREE.Vector3(0,1,0),travelDistance:3.3,openingDurationSeconds:1,closingDurationSeconds:.45,
      obstructionCentre:new THREE.Vector3(6,1.5,BLACKOUT_BAY_LAYOUT.rearZ),obstructionSize:new THREE.Vector3(3.8,3.4,1.6)});
    bay.root.add(this.door.root);
    this.receiver = new THREE.Mesh(new THREE.BoxGeometry(1.3,1.65,.12),new THREE.MeshStandardMaterial({color:0x194d32,roughness:.72,metalness:.15}));
    this.receiver.name='maintenance-bay-door-receiver'; this.receiver.position.set(-9,3,BLACKOUT_BAY_LAYOUT.rearZ-.4); bay.root.add(this.receiver);
    const backing = new THREE.Mesh(new THREE.BoxGeometry(1.55,1.9,.22),new THREE.MeshStandardMaterial({color:0x353d40,metalness:.65,roughness:.65}));
    backing.position.z=.07; this.receiver.add(backing);
    const copper = new THREE.MeshStandardMaterial({color:0xb39442,metalness:.75,roughness:.4});
    const chipMaterial = new THREE.MeshStandardMaterial({color:0x080d0c,roughness:.8});
    for(let i=0;i<4;i++) {
      const trace=new THREE.Mesh(new THREE.BoxGeometry(.65,.025,.015),copper);
      trace.position.set(-.05,-.55+i*.25,-.07);this.receiver.add(trace);
      const branch=new THREE.Mesh(new THREE.BoxGeometry(.025,.22,.015),copper);
      branch.position.set(i%2?.26:-.36,-.45+i*.25,-.07);this.receiver.add(branch);
      const chip=new THREE.Mesh(new THREE.BoxGeometry(.24,.15,.07),chipMaterial);
      chip.position.set(i%2?-.28:.25,-.54+i*.26,-.1);this.receiver.add(chip);
    }
    for(const x of [-.66,.66]) for(const y of [-.82,.82]) {
      const screw=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.03,8),copper);
      screw.rotation.x=Math.PI/2;screw.position.set(x,y,-.055);this.receiver.add(screw);
    }
    const indicator=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.07,20),this.indicatorMaterial);
    indicator.name='circuit-connection-indicator';indicator.rotation.x=Math.PI/2;indicator.position.set(0,.55,-.12);this.receiver.add(indicator);
    this.indicatorLight.position.set(0,.55,-.35);this.receiver.add(this.indicatorLight);
    this.target={id:'maintenance-bay-circuit',displayName:'Exit door circuit',hitMeshes:[this.receiver],
      // The socket sits on the exposed face, not inside the conduit collider.
      copySocketWorldPosition:p=>this.receiver.localToWorld(p.set(0,.55,-.2)),isAvailable:()=>true,
      setConnectionState:connected=>{this.powered=connected; if(!connected)this.charge=0;this.updateIndicator();}};
    this.unregister=registry.register(this.target);
  }

  connectionClear(position:{readonly x:number;readonly y:number;readonly z:number},ignored?:THREE.Mesh):boolean {
    this.rayOrigin.copy(position);
    this.target.copySocketWorldPosition(this.rayDirection).sub(this.rayOrigin);
    const distance=this.rayDirection.length();
    return distance<.001 || !this.world.raycast(this.rayOrigin,this.rayDirection.normalize(),Math.max(.001,distance-.4),this.rayHit,CollisionLayer.LineOfSight,ignored);
  }

  update(dt:number,bodies:Record<SlimeId,KinematicBody>):SlimeId|undefined {
    this.charge=this.powered?Math.min(1,this.charge+dt*1.5):0;
    this.door.setOpen(this.charge>=1);
    this.door.update(dt,Object.entries(bodies).map(([id,body])=>({id,position:body.position,radiusMetres:body.radiusMetres})));
    this.bay.update(dt,this.charge>=1);
    for(const id of ['bob','goop','volt'] as const){
      const p=bodies[id].position;
      if(p.y < -5 || (id!=='goop' && this.bay.acidAt(p)) || (id!=='volt' && this.bay.ventAt(p))) return id;
    }
    if(this.bay.ventAt(bodies.volt.position)) this.voltTraversedVent=true;
    this.complete=this.voltTraversedVent&&this.bay.vestibuleAt(bodies.bob.position)&&this.bay.vestibuleAt(bodies.goop.position)&&this.bay.voltExitAt(bodies.volt.position);
    return undefined;
  }
  private updateIndicator():void {
    const color=this.powered?0x36ff74:0xff2716;
    this.indicatorMaterial.color.setHex(color);this.indicatorMaterial.emissive.setHex(color);this.indicatorLight.color.setHex(color);
  }
  reset():void {this.complete=false;this.powered=false;this.charge=0;this.voltTraversedVent=false;this.door.reset();this.updateIndicator();}
  dispose():void {
    this.unregister();this.door.dispose();this.receiver.removeFromParent();
    const materials=new Set<THREE.Material>();
    this.receiver.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
    for(const material of materials)material.dispose();this.receiver.clear();
  }
}
