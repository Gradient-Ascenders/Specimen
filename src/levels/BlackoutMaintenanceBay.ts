import * as THREE from 'three';

export const BLACKOUT_BAY_LAYOUT = Object.freeze({
  chamberWidth: 34,
  rearZ: 54,
  hallwayWidth: 6,
  hallwayHeight: 4.5,
  hallwayLength: 20,
  hallwayEndZ: 74,
  acidStartZ: 7,
  acidEndZ: 48,
});

/** Geometry and spatial markers for Level 3's first maintenance bay. */
export class BlackoutMaintenanceBay {
  readonly root = new THREE.Group();
  readonly collisionMeshes: THREE.Mesh[] = [];

  private readonly acidMaterial: THREE.MeshStandardMaterial;
  private readonly arcPositions = new Float32Array(3 * 8 * 2 * 3);
  private readonly arcGeometry = new THREE.BufferGeometry();
  private readonly arcMaterial = new THREE.LineBasicMaterial({color:0xafffff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false});
  private readonly arcLights: THREE.PointLight[] = [];
  private readonly hallwayLights: THREE.PointLight[] = [];
  private readonly hallwayBulbs: THREE.Mesh[] = [];
  private readonly hallwayFlickerSeeds = [0.3, 1.8, 3.9, 5.2];
  private elapsed = 0;

  constructor() {
    this.root.name = 'level-3-room-1-blackout-maintenance-bay';
    const steel = new THREE.MeshStandardMaterial({ color: 0x20272b, roughness: 0.93, metalness: 0.48 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x11171b, roughness: 0.96, metalness: 0.3 });
    const platform = new THREE.MeshStandardMaterial({ color: 0x343a36, roughness: 0.9, metalness: 0.3 });
    const submergedSteel = new THREE.MeshStandardMaterial({color:0x30391c,roughness:.55,metalness:.18});
    const warning = new THREE.MeshStandardMaterial({ color: 0x8b6b21, roughness: 0.85, metalness: 0.18 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x515956, roughness: 0.72, metalness: 0.58 });
    this.acidMaterial = new THREE.MeshStandardMaterial({
      color: 0x30391c, emissive: 0x101606, emissiveIntensity: 0.055,
      roughness: 0.52, metalness: 0.02,
    });

    const { chamberWidth, rearZ, hallwayWidth, hallwayLength, hallwayEndZ, acidStartZ, acidEndZ } = BLACKOUT_BAY_LAYOUT;
    const halfWidth = chamberWidth / 2;
    const hallwayEndCenter = rearZ + hallwayLength / 2;
    const hallwayCenterX = 6;
    const hallwayHeight = BLACKOUT_BAY_LAYOUT.hallwayHeight;
    // Main chamber bounds: x +/-17, z -2..54, y 0..12. The broad basin is
    // sealed beneath the entrance apron as well as under the stepping route.
    this.box('entry-safe-platform', [chamberWidth, 1.05, 11], [0, -0.525, 3.5], platform);
    this.box('front-perimeter-wall', [chamberWidth, 12, 0.45], [0, 6, -2], darkSteel);
    this.box('acid-basin-bed', [chamberWidth - 0.8, 0.5, acidEndZ - acidStartZ], [0, -1.25, (acidEndZ + acidStartZ) / 2], darkSteel);
    const acid = this.box('animated-acid-surface', [chamberWidth - 1, 0.08, acidEndZ - acidStartZ - 0.2], [0, -0.99, (acidEndZ + acidStartZ) / 2], this.acidMaterial);
    acid.userData.textureRole = 'acid-floor';
    // Close the exposed under-apron corners, but leave a clear 5 m doorway
    // aligned to Bob's first step so this seal does not become a jump wall.
    this.box('entry-apron-riser-west', [8.2, 1.05, 0.25], [-12.6, -0.475, acidStartZ], darkSteel);
    this.box('entry-apron-riser-east', [18, 1.05, 0.25], [5.5, -0.475, acidStartZ], darkSteel);

    // Three broad, staggered steps borrow Level 2 Room 1's alternating layout,
    // but extend the centre spacing to 11.5 m for this wider acid basin.
    const steps: readonly [number, number, number, number, number][] = [
      [-3, 0.15, 17, 5, 7],
      [1.5, 0.45, 28.5, 5, 7],
      [-2.5, 0.15, 40, 5, 7],
    ];
    for (const [x, y, z, width, depth] of steps) {
      this.box(`bob-route-platform-${z}`, [width, 0.32, depth], [x, y - 0.16, z], submergedSteel);
    }

    // The exit bank begins after the last long jump. A wide side ramp lets Goop
    // walk out of the expanded basin without jumping.
    this.box('exit-safe-platform', [chamberWidth, 1.05, 6], [0, -0.525, 51], platform).userData.preciseMovementCorners = true;
    const rampLength = Math.hypot(5.5, 1);
    const ramp = this.box('acid-exit-ramp', [7, 0.18, rampLength], [12.4, -0.59, 45.25], platform);
    ramp.rotation.x = -Math.atan2(1, 5.5);
    ramp.userData.preciseMovementCorners = true;

    // Main chamber walls and ceiling silhouette. The rear wall has a door gap at x=6
    // and a floor-level service duct at x=-6; both are intentionally unobstructed.
    this.box('west-perimeter-wall', [0.4, 14, rearZ + 2], [-halfWidth + 0.2, 5, (rearZ - 2) / 2], darkSteel);
    this.box('east-perimeter-wall', [0.4, 14, rearZ + 2], [halfWidth - 0.2, 5, (rearZ - 2) / 2], darkSteel);
    // Leave only the service vent at x=-6 and powered doorway at x=6 in the
    // rear wall; these two continuations lead directly into one enclosed hall.
    this.box('rear-wall-west', [9.85, 12, 0.45], [-11.875, 6, rearZ], darkSteel);
    this.box('rear-wall-between-openings', [9.55, 12, 0.45], [-0.275, 6, rearZ], darkSteel);
    this.box('rear-wall-east', [9.3, 12, 0.45], [12.15, 6, rearZ], darkSteel);
    this.box('door-header', [3, 9, 0.45], [6, 7.5, rearZ], darkSteel);
    // Taller service duct with a flush landing. Its 1.5 m clear width admits
    // Volt comfortably but still excludes the 1.65 m maintenance drone.
    this.box('vent-mouth-left-jamb', [0.2, 12, 0.45], [-6.85, 6, rearZ], steel);
    this.box('vent-mouth-right-jamb', [0.2, 12, 0.45], [-5.15, 6, rearZ], steel);
    this.box('vent-mouth-upper-wall', [1.5, 9.8, 0.45], [-6, 7.1, rearZ], darkSteel);
    this.box('main-ceiling', [chamberWidth, 0.35, rearZ + 2], [0, 12.15, (rearZ - 2) / 2], darkSteel);

    // Enclosed continuation hall after Room 1, sealed at its far end until
    // Room 2 is authored. Both the powered door and the vent drop reach it.
    this.box('hallway-floor', [hallwayWidth, 0.4, hallwayLength], [hallwayCenterX, -0.2, hallwayEndCenter], platform);
    this.box('hallway-west-wall-before-connector', [0.35, hallwayHeight, 6], [hallwayCenterX - hallwayWidth / 2, hallwayHeight / 2, rearZ + 3], darkSteel);
    this.box('hallway-west-wall-after-connector', [0.35, hallwayHeight, hallwayLength - 10], [hallwayCenterX - hallwayWidth / 2, hallwayHeight / 2, rearZ + 15], darkSteel);
    this.box('hallway-east-wall', [0.35, hallwayHeight, hallwayLength], [hallwayCenterX + hallwayWidth / 2, hallwayHeight / 2, hallwayEndCenter], darkSteel);
    this.box('hallway-roof', [hallwayWidth, 0.35, hallwayLength], [hallwayCenterX, hallwayHeight + 0.15, hallwayEndCenter], darkSteel);
    this.box('hallway-end-wall', [hallwayWidth, hallwayHeight, 0.45], [hallwayCenterX, hallwayHeight / 2, hallwayEndZ], darkSteel);
    // Level duct from the bay floor, through the rear wall, then into the
    // lateral connector. The matching opening in the connector's south wall
    // lines up with this 1.5 m bore; the adjoining floors meet at y=0.
    this.box('vent-hall-connector-floor', [10, 0.2, 4], [-2, -0.1, rearZ + 8], platform);
    this.box('vent-hall-connector-roof', [10, 0.35, 4], [-2, hallwayHeight + 0.15, rearZ + 8], darkSteel);
    this.box('vent-hall-connector-south-wall-west', [0.35, hallwayHeight, 0.3], [-6.825, hallwayHeight / 2, rearZ + 6], darkSteel);
    this.box('vent-hall-connector-south-wall-east', [8.35, hallwayHeight, 0.3], [-1.175, hallwayHeight / 2, rearZ + 6], darkSteel);
    // The connector is taller than the duct; close the space above its outlet.
    this.box('vent-outlet-header', [1.5, hallwayHeight-2.2, .3], [-6, (hallwayHeight+2.2)/2, rearZ+6], steel);
    this.box('vent-hall-connector-north-wall', [10, hallwayHeight, 0.3], [-2, hallwayHeight / 2, rearZ + 10], darkSteel);
    this.box('vent-hall-connector-west-wall', [0.3, hallwayHeight, 4], [-7, hallwayHeight / 2, rearZ + 8], darkSteel);

    this.box('vent-interior-floor', [1.5, 0.2, 6], [-6, -0.1, rearZ + 3], steel).userData.preciseMovementCorners = true;
    this.box('vent-duct-west-wall', [0.2, 2.2, 6], [-6.85, 1.1, rearZ + 3], steel);
    this.box('vent-duct-east-wall', [0.2, 2.2, 6], [-5.15, 1.1, rearZ + 3], steel);
    this.box('vent-duct-ceiling', [1.5, 0.2, 6], [-6, 2.3, rearZ + 3], steel);
    // A sealed outer jacket covers the duct joins and prevents sightlines out
    // of the map at either corner, while preserving the continuous clear bore.
    this.box('vent-duct-junction-west-seal', [0.45, 2.2, 0.35], [-7.175, 1.1, rearZ + 5.825], darkSteel);
    this.box('vent-duct-junction-east-seal', [0.45, 2.2, 0.35], [-4.825, 1.1, rearZ + 5.825], darkSteel);
    // Recessed industrial rim and repeated duct seams, outside the walking bore.
    for (const z of [rearZ - 0.25, rearZ + 1.5, rearZ + 3.5, rearZ + 5.5]) {
      for (const x of [-6.77, -5.23]) this.box(`vent-frame-side-${x}-${z}`, [0.08, 2.3, 0.08], [x, 1.1, z], trim);
      this.box(`vent-frame-header-${z}`, [1.62, 0.08, 0.08], [-6, 2.28, z], trim);
    }

    // Visible but non-emissive hazard markings, conduit, and the ceiling entry grille.
    for (const z of [-1.5, acidStartZ - 0.7]) this.warningStrip(`entry-warning-${z}`, chamberWidth - 2, [0, 0.012, z], warning);
    for (const z of [acidEndZ + 0.4, rearZ - 1.2]) this.warningStrip(`exit-warning-${z}`, chamberWidth - 2, [0, 0.012, z], warning);
    this.box('ceiling-entry-vent-frame', [3.2, 0.18, 2.4], [-2, 11.9, 2], trim);
    this.box('ceiling-entry-vent-grille', [2.5, 0.06, 1.8], [-2, 11.78, 2], darkSteel);

    this.arcGeometry.setAttribute('position',new THREE.BufferAttribute(this.arcPositions,3));
    const arcs=new THREE.LineSegments(this.arcGeometry,this.arcMaterial);
    arcs.name='vent-live-electrical-arcs';arcs.frustumCulled=false;this.root.add(arcs);
    const sparks=new THREE.Points(this.arcGeometry,new THREE.PointsMaterial({color:0xe5ffff,size:.035,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false}));
    sparks.name='vent-electrical-sparks';sparks.frustumCulled=false;this.root.add(sparks);
    const arcLight=new THREE.PointLight(0x76eaff,.5,3);
    arcLight.position.set(-6,1.1,rearZ-.4);this.root.add(arcLight);this.arcLights.push(arcLight);

    for (const [index, z] of [rearZ + 2.5, rearZ + 7.5, rearZ + 12.5, rearZ + 17.5].entries()) {
      const bulbMaterial = new THREE.MeshStandardMaterial({ color: 0x886d38, emissive: 0xf2be58, emissiveIntensity: 0.22 });
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.1, 1.1), bulbMaterial);
      bulb.name = `hallway-flicker-bulb-${index + 1}`;
      bulb.position.set(hallwayCenterX, hallwayHeight - 0.3, z);
      this.root.add(bulb);
      this.hallwayBulbs.push(bulb);
      const light = new THREE.PointLight(0xffcf70, 8, 10, 2);
      light.name = `hallway-flicker-light-${index + 1}`;
      light.position.set(hallwayCenterX, hallwayHeight - 0.8, z);
      this.root.add(light);
      this.hallwayLights.push(light);
    }
  }

  acidAt(position: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>): boolean {
    return position.x >= -16.6 && position.x <= 16.6 && position.z >= BLACKOUT_BAY_LAYOUT.acidStartZ && position.z <= BLACKOUT_BAY_LAYOUT.acidEndZ && position.y <= -0.35;
  }

  ventAt(position: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>): boolean {
    return Math.abs(position.x + 6) <= 0.75 && position.z >= BLACKOUT_BAY_LAYOUT.rearZ - 0.5 && position.z <= BLACKOUT_BAY_LAYOUT.rearZ + 6 && position.y >= 0 && position.y <= 2.2;
  }

  vestibuleAt(position: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>): boolean {
    return position.x >= 3.4 && position.x <= 8.6 && position.z >= BLACKOUT_BAY_LAYOUT.rearZ + 1 && position.z <= BLACKOUT_BAY_LAYOUT.hallwayEndZ - 0.5 && position.y >= 0 && position.y <= BLACKOUT_BAY_LAYOUT.hallwayHeight;
  }

  voltExitAt(position: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>): boolean {
    // Keep the exit trigger over the shared reunion hall, not only the narrow
    // shaft mouth, so Volt retains completion after walking out of the vent.
    return this.vestibuleAt(position) && position.y < 3;
  }

  update(dt: number, powered: boolean): void {
    this.elapsed += Math.max(0, dt);
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3.7);
    this.acidMaterial.emissiveIntensity = 0.035 + pulse * 0.02;
    // Fixed buffers: three jagged discharges bridge the vent's grounded edges.
    // Endpoints stay attached to its metal rim while interior nodes crackle.
    const phase=Math.floor(this.elapsed*24);
    for(let strand=0;strand<3;strand++) for(let segment=0;segment<8;segment++) for(let end=0;end<2;end++) {
      const node=segment+end,t=node/8;
      const jitter=Math.sin(node*17.1+phase*4.7+strand*2.3)*Math.sin(Math.PI*t)*.14;
      const offset=(strand*16+segment*2+end)*3;
      this.arcPositions[offset]=-6-.73+t*1.46;
      this.arcPositions[offset+1]=.45+strand*.65+jitter;
      this.arcPositions[offset+2]=BLACKOUT_BAY_LAYOUT.rearZ-.28+Math.sin(node*9.3+phase)*Math.sin(Math.PI*t)*.035;
    }
    this.arcGeometry.attributes.position!.needsUpdate=true;
    this.arcMaterial.opacity=.2+.7*Math.abs(Math.sin(this.elapsed*19));
    this.arcLights.forEach((light, index) => {
      light.intensity = (powered ? .35 : .2) + this.arcMaterial.opacity * (index === 0 ? 1.4 : .5);
    });
    this.hallwayLights.forEach((light, index) => {
      const seed = this.hallwayFlickerSeeds[index] ?? index;
      const fastFlicker = 0.5 + 0.5 * Math.sin(this.elapsed * (9 + index * 0.7) + seed);
      const slowFlicker = 0.5 + 0.5 * Math.sin(this.elapsed * (1.7 + index * 0.19) + seed * 3);
      const dropout = Math.sin(this.elapsed * 0.63 + seed) > 0.9 ? 0.08 : 1;
      light.intensity = dropout * (2 + fastFlicker * 12 + slowFlicker * 8);
      const material = this.hallwayBulbs[index]?.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveIntensity = dropout * (0.4 + fastFlicker * 0.8 + slowFlicker * 0.6);
      }
    });
  }

  dispose(): void {
    this.root.removeFromParent();
    const geometries=new Set<THREE.BufferGeometry>();
    const materials=new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
    this.root.clear();
  }

  private box(name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.userData.surfaceTag = 'default';
    mesh.userData.authoringRole = 'blackout-maintenance-bay-collision';
    this.root.add(mesh);
    this.collisionMeshes.push(mesh);
    return mesh;
  }

  private warningStrip(name: string, width: number, position: readonly [number, number, number], material: THREE.Material): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, 0.18), material);
    mesh.name = name;
    mesh.position.set(...position);
    this.root.add(mesh);
  }
}
