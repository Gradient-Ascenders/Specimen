import * as THREE from 'three';
import type { BlackoutCheckpointDefinition } from './BlackoutCheckpointManager.ts';
import { BLACKOUT_TRANSIT_EXIT_HALLWAY } from './BlackoutTransitRoom.ts';

const ENTRY_Z = BLACKOUT_TRANSIT_EXIT_HALLWAY.endZ;
const CENTRE_Z = ENTRY_Z + 8;
const END_Z = ENTRY_Z + 16;

/** Safe Room 3 shortcut destination until the revised boss arena is authored. */
export const BLACKOUT_BOSS_STAGING_CHECKPOINT: BlackoutCheckpointDefinition = {
  id: 'cp6',
  activeSlimeId: 'bob',
  bodyPositions: {
    bob: new THREE.Vector3(-2, .86, ENTRY_Z + 6),
    goop: new THREE.Vector3(0, .86, ENTRY_Z + 6),
    volt: new THREE.Vector3(2, .86, ENTRY_Z + 6),
  },
  room: {roomId:'room-3', phase:'three-slime', local:{bossStaging:true}},
};

export class BlackoutBossStaging {
  readonly root = new THREE.Group();
  readonly collisionMeshes: THREE.Mesh[] = [];
  private readonly geometry = new THREE.BoxGeometry(1,1,1);
  private readonly collisionGeometries: THREE.BoxGeometry[] = [];
  private readonly steel = new THREE.MeshStandardMaterial({color:0x26302d,roughness:.85,metalness:.25});
  private readonly amber = new THREE.MeshStandardMaterial({color:0xf8be58,emissive:0xffb73d,emissiveIntensity:.7});

  constructor() {
    this.root.name = 'blackout-room-3-boss-staging-not-final-arena';
    this.box('boss-staging-floor',[18,.8,16],[0,0,CENTRE_Z]);
    this.box('boss-staging-west-wall',[.4,7,16],[-9,3.9,CENTRE_Z]);
    this.box('boss-staging-east-wall',[.4,7,16],[9,3.9,CENTRE_Z]);
    const portalWidth = BLACKOUT_TRANSIT_EXIT_HALLWAY.width;
    const flankWidth = (18 - portalWidth) / 2;
    for (const sign of [-1, 1]) {
      this.box(`boss-staging-entry-wall-${sign}`, [flankWidth,7,.4], [sign * (portalWidth + flankWidth) / 2,3.9,ENTRY_Z]);
    }
    const headerHeight = 7.4 - BLACKOUT_TRANSIT_EXIT_HALLWAY.ceilingY;
    this.box('boss-staging-entry-header',[portalWidth,headerHeight,.4],[0,7.4 - headerHeight / 2,ENTRY_Z]);
    this.box('boss-staging-arena-bulkhead',[18,7,.4],[0,3.9,END_Z]);
    this.box('boss-staging-ceiling',[18,.4,16],[0,7.4,CENTRE_Z]);
    const warning = new THREE.Mesh(this.geometry,this.amber);
    warning.name = 'boss-staging-closed-bulkhead-indicator';
    warning.scale.set(5,.12,.05);
    warning.position.set(0,3.5,END_Z - .24);
    this.root.add(warning);
    const light = new THREE.PointLight(0xffca78,16,12,2);
    light.position.set(0,4,CENTRE_Z + 3);
    this.root.add(light);
  }

  dispose(): void {
    this.root.removeFromParent(); this.root.clear();
    this.geometry.dispose(); this.steel.dispose(); this.amber.dispose();
    for (const geometry of this.collisionGeometries) geometry.dispose();
    this.collisionGeometries.length = 0;
  }

  private box(name:string, size:readonly[number,number,number], position:readonly[number,number,number]):void {
    // Bake solid dimensions into the geometry: non-uniform mesh scaling makes
    // conservative sphere sweeps expand thin walls far into the previous room.
    const geometry = new THREE.BoxGeometry(...size);
    this.collisionGeometries.push(geometry);
    const mesh = new THREE.Mesh(geometry,this.steel);
    mesh.name=name; mesh.position.set(...position);
    mesh.userData.surfaceTag='default';
    this.root.add(mesh); this.collisionMeshes.push(mesh);
  }
}
