import * as THREE from 'three';
import type {BlackoutMaintenanceMaterials} from '../render/environment/blackout/BlackoutMaintenanceMaterials.ts';
import {BlackoutAscentArt,type BlackoutAscentArtLoader} from '../render/environment/blackout/BlackoutAscentArt.ts';
import {consolidateStaticRoomVisuals} from '../render/StaticRoomVisuals.ts';
import type {ContainmentStaticBatchResult} from '../render/environment/containment/ContainmentStaticBatching.ts';

const REPLACED_CABINET=new Set(['lift-damaged-power-cabinet','lift-power-cabinet-rim','lift-power-cabinet-side','lift-broken-cabinet-door']);

export const BLACKOUT_ASCENT_LIFT = Object.freeze({
  centreZ: 180.7, floorY: .4, rearZ: 176.4, frontZ: 184.8,
  boardingRoom: { minX: -5.8, maxX: 5.8, minY: .4, maxY: 5.8, minZ: 174, maxZ: 184.8 },
  outlet: new THREE.Vector3(3.30, 1.72, 181.25),
  standing: {
    bob: new THREE.Vector3(-1.65, .86, 181.65),
    goop: new THREE.Vector3(0, .86, 180.25),
    volt: new THREE.Vector3(1.65, .86, 181.2),
  },
  landing: {
    bob: new THREE.Vector3(-1.8, .86, 187),
    goop: new THREE.Vector3(0, .86, 186.3),
    volt: new THREE.Vector3(1.8, .86, 187),
  },
});

/** The car stays in the physics frame; repeating shaft scenery passes it.
 * This is the same scrolling-shaft technique as the cultivation elevator. */
export class BlackoutAscentLift {
  readonly root = new THREE.Group();
  readonly collisionMeshes: THREE.Mesh[] = [];
  readonly dynamicColliders: THREE.Mesh[] = [];
  readonly floor: THREE.Mesh;
  readonly rearGate: THREE.Mesh;
  readonly frontGate: THREE.Mesh;
  readonly labDoor: THREE.Mesh;
  readonly outlet = new THREE.Object3D();
  readonly art?:BlackoutAscentArt;
  private readonly retainedCabinet=new Set<THREE.Mesh>();
  private cabinetVisuals?:ContainmentStaticBatchResult;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly unit = this.geometry(new THREE.BoxGeometry(1, 1, 1));
  private readonly dark = this.material(0x172128, .72, .55);
  private readonly frame = this.material(0x34454b, .54, .7);
  private readonly worn = this.material(0x6a7066, .87, .33);
  private readonly white = this.material(0xbac9c9, .53, .15);
  private readonly seam = this.material(0x3d525a, .58, .6);
  private readonly amber = this.material(0xe1a551, .55, .3, 0xd27f22, .25);
  private readonly status = this.material(0x947042, .45, .3, 0xffaa44, .35);
  private readonly strip = this.material(0x9bd9df, .4, .15, 0x83cdd9, 1.1);
  private readonly shaft: THREE.Group[] = [];
  private readonly washes: THREE.PointLight[] = [];
  private readonly labLight = new THREE.PointLight(0xdaefff, 0, 17, 2);
  private readonly socketLight = new THREE.PointLight(0xf5d27c, 0, 5, 2);
  private readonly sparks: THREE.Line;
  private readonly sparkPoints = new Float32Array(9 * 3);
  private readonly sparkGeometry: THREE.BufferGeometry;
  private readonly arcSegments: THREE.Mesh[] = [];
  private readonly arcFrom = new THREE.Vector3();
  private readonly arcTo = new THREE.Vector3();
  private readonly arcDirection = new THREE.Vector3();
  private readonly arcUp = new THREE.Vector3(0, 1, 0);
  private disposed = false;

  constructor(kit?:BlackoutMaintenanceMaterials) {
    const V = BLACKOUT_ASCENT_LIFT;
    this.root.name = 'blackout-damaged-service-lift-and-lab-landing';
    this.solid('lift-entry-apron', [8.8, .8, 2.5], [0, 0, 175.25], this.worn);
    this.floor = this.solid('lift-car-floor', [8, .8, 8.4], [0, 0, V.centreZ], this.worn);
    this.solid('lift-lab-landing', [12.8, .8, 5.1], [0, 0, 187.45], this.white);
    for (const sign of [-1, 1]) {
      this.solid(`lift-shaft-wall-${sign}`, [.4, 52, 10.3], [sign * 6, 3, 179.65], this.dark);
      this.solid(`lift-entry-shoulder-${sign}`, [1.6, 5.4, 2.5], [sign * 4.9, 3.1, 175.25], this.dark);
      if (sign < 0) this.solid(`lift-car-side-rail-${sign}`, [.16, .15, 7.6], [sign * 3.8, 1.65, V.centreZ], this.frame);
      else {
        this.solid('lift-car-side-rail-outlet-front', [.16, .15, 3.5], [3.8, 1.65, 178.65], this.frame);
        this.solid('lift-car-side-rail-outlet-back', [.16, .15, 2.3], [3.8, 1.65, 183.35], this.frame);
      }
      for (const z of sign < 0 ? [177.1, 180.7, 184.3] : [177.1, 180.4, 182.2, 184.3]) {
        this.solid(`lift-rail-post-${sign}-${z}`, [.15, 1.175, .15], [sign * 3.8, .9875, z], this.frame);
        this.box('lift-rail-foot', [.35, .08, .35], [sign * 3.8, .46, z], this.dark);
      }
      this.box('lift-car-sill', [.16, .2, 8.3], [sign * 3.87, .44, V.centreZ], this.dark);
      this.box('lift-guide-rail', [.16, 54, .3], [sign * 4.9, 3, V.centreZ], this.frame);
      this.box('lift-suspension-cable', [.045, 49, .045], [sign * 3.4, 22, 183.8], this.frame);
      this.box('lift-car-overhead-column', [.19, 4.6, .22], [sign * 3.8, 2.9, 184.3], this.frame);
      this.box('lift-side-caution', [.2, .025, 7.4], [sign * 3.35, .415, V.centreZ], this.amber);
    }
    this.box('lift-car-overhead-crossmember', [8, .26, .3], [0, 5.1, 184.3], this.frame);
    this.box('lift-car-underframe', [8.3, .3, 8.65], [0, -.52, V.centreZ], this.dark);
    for (let i = 0; i < 8; i++) this.box('lift-floor-panel-seam', [6.4, .012, .018], [0, .407, 177.3 + i], this.dark);
    for (const x of [-2.6, 2.6]) for (const z of [177.25, 184.1]) {
      for (let i = 0; i < 5; i++) {
        const stripe = this.box('lift-caution-stripe', [.17, .018, .38], [x + i * .22 - .44, .42, z], i % 2 ? this.dark : this.amber);
        stripe.rotation.y = -.35;
      }
    }
    this.rearGate = this.solid('lift-rear-safety-shutter', [8.1, 5.3, .18], [0, 8.4, V.rearZ], this.dark);
    this.frontGate = this.solid('lift-front-landing-shutter', [8.1, 5.3, .18], [0, 3.05, V.frontZ], this.white);
    this.dynamicColliders.push(this.rearGate, this.frontGate);
    this.labDoor = this.solid('lift-lab-sector-door', [8.5, 6.3, .24], [0, 3.55, 190], this.white);
    this.dynamicColliders.push(this.labDoor);
    for (const side of [-1, 1]) {
      this.box('lift-lab-door-panel', [3.95, 5.8, .04], [side * 2.08, 0, -.145], this.white, this.labDoor);
      this.box('lift-lab-door-centre-seal', [.045, 6.2, .03], [side * .08, 0, -.21], this.frame, this.labDoor);
      this.box('lift-lab-door-window', [1.6, .16, .05], [side * 2.1, 1, -.18], this.strip, this.labDoor);
    }
    for (const gate of [this.rearGate, this.frontGate]) {
      for (let i = 0; i < 8; i++) this.box('lift-shutter-rib', [7.9, .05, .03], [0, -2.3 + i * .63, -.105], this.frame, gate);
      this.box('lift-shutter-status-strip', [2.5, .055, .03], [0, -2.4, -.12], this.status, gate);
    }
    this.buildOutlet();
    for (let i = 0; i < 6; i++) this.buildShaftModule(i);
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0x9ccddd, 0, 12, 2);
      light.name = `lift-passing-light-${i}`; this.root.add(light); this.washes.push(light);
    }
    this.labLight.name = 'lift-white-lab-light'; this.labLight.position.set(0, 5, 187.4); this.root.add(this.labLight);
    this.socketLight.name = 'lift-outlet-discharge-light'; this.socketLight.position.copy(V.outlet); this.root.add(this.socketLight);
    this.outlet.position.copy(V.outlet); this.root.add(this.outlet);
    this.sparkGeometry = this.geometry(new THREE.BufferGeometry());
    this.sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPoints, 3));
    const electric = new THREE.LineBasicMaterial({ color: 0xffed9b, transparent: true, opacity: .9, depthWrite: false });
    this.materials.add(electric); this.sparks = new THREE.Line(this.sparkGeometry, electric);
    this.sparks.name = 'lift-volt-to-outlet-discharge'; this.sparks.frustumCulled = false; this.sparks.visible = false; this.root.add(this.sparks);
    const arcGeometry = this.geometry(new THREE.CylinderGeometry(.018, .018, 1, 5));
    const arcMaterial = new THREE.MeshBasicMaterial({ color: 0xffefb5 }); this.materials.add(arcMaterial);
    for (let i = 0; i < 8; i++) {
      const arc = new THREE.Mesh(arcGeometry, arcMaterial); arc.name = `lift-electric-burst-${i}`; arc.visible = false;
      this.arcSegments.push(arc); this.root.add(arc);
    }
    this.buildLab();
    this.root.getObjectByName('lift-power-cabinet')!.traverse(object=>{
      if(object instanceof THREE.Mesh&&!REPLACED_CABINET.has(object.name))this.retainedCabinet.add(object);
    });
    this.art=kit?new BlackoutAscentArt(kit,this.status,this.strip):undefined;
    this.present(0, 0, 0, 0, 0);
  }

  prepareArt(loader?:BlackoutAscentArtLoader):Promise<void>{
    if(!this.art||this.disposed)return Promise.resolve();
    const owners=new Map<string,THREE.Object3D>([['RearGate',this.rearGate],['FrontGate',this.frontGate],['LabDoor',this.labDoor],
      ['Cover',this.root.getObjectByName('lift-open-cabinet-cover')!]]);
    return this.art.prepare(this.root,{owners,shaft:this.shaft,retainedCabinet:this.retainedCabinet},loader).then(()=>{
      if(!this.disposed&&!this.cabinetVisuals&&this.art?.diagnostics.ready){
        this.cabinetVisuals=consolidateStaticRoomVisuals(this.root,[...this.retainedCabinet]);
      }
    });
  }

  canBoard(body: { isSupportedBy(collider: THREE.Mesh): boolean }): boolean {
    return body.isSupportedBy(this.floor);
  }

  isInBoardingRoom(position: Readonly<Pick<THREE.Vector3, 'x' | 'y' | 'z'>>): boolean {
    const b = BLACKOUT_ASCENT_LIFT.boardingRoom;
    return position.x >= b.minX && position.x <= b.maxX && position.y >= b.minY && position.y <= b.maxY &&
      position.z >= b.minZ && position.z <= b.maxZ;
  }

  present(distance: number, rearClosed: number, frontOpen: number, charge: number, seconds: number, source?: THREE.Vector3): void {
    this.art?.update(charge);
    this.rearGate.position.y = THREE.MathUtils.lerp(8.4, 3.05, rearClosed);
    this.frontGate.position.y = THREE.MathUtils.lerp(3.05, 8.4, frontOpen);
    this.status.color.setHex(charge > .8 ? 0x80cdb6 : 0x947042);
    this.status.emissive.setHex(charge > .8 ? 0x5dc7af : 0xffaa44);
    this.status.emissiveIntensity = charge > .8 ? .8 : .25;
    for (let i = 0; i < this.shaft.length; i++) {
      const y = THREE.MathUtils.euclideanModulo(i * 8 - distance + 16, 48) - 16;
      this.shaft[i]!.position.y = y;
      // Only the shaft span seen by the authored shots is submitted. Higher
      // copies would pass through the arena's overhang in this shared frame.
      this.shaft[i]!.visible=y>-12&&y<10;
    }
    for (let i = 0; i < this.washes.length; i++) {
      const y = THREE.MathUtils.euclideanModulo(4 + i * 8 - distance + 12, 24) - 12;
      const light = this.washes[i]!;
      light.position.set(i % 2 ? 4.4 : -4.4, y, 180.1);
      const fade = 1 - THREE.MathUtils.smoothstep(Math.abs(y - 2), 7, 10);
      light.intensity = (1 - frontOpen) * (2 + charge * 13) * Math.exp(-(((y - 2) / 3.6) ** 2)) * fade;
    }
    this.labLight.intensity = 95 * frontOpen;
    this.sparks.visible = !!source && charge > 0 && charge < 1;
    this.socketLight.intensity = this.sparks.visible ? 5 + 2 * Math.sin(seconds * 29) : .4 * charge;
    if (this.sparks.visible && source) {
      for (let i = 0; i < 9; i++) {
        const u = i / 8, jitter = Math.sin(u * Math.PI) * .09;
        this.sparkPoints[i * 3] = THREE.MathUtils.lerp(source.x, this.outlet.position.x, u);
        this.sparkPoints[i * 3 + 1] = THREE.MathUtils.lerp(source.y, this.outlet.position.y, u) + Math.sin(i * 7 + seconds * 38) * jitter;
        this.sparkPoints[i * 3 + 2] = THREE.MathUtils.lerp(source.z, this.outlet.position.z, u) + Math.cos(i * 5 + seconds * 32) * jitter;
      }
      this.sparkGeometry.attributes.position!.needsUpdate = true;
    }
    for (const [i, arc] of this.arcSegments.entries()) {
      arc.visible = this.sparks.visible;
      if (!arc.visible) continue;
      this.arcFrom.fromArray(this.sparkPoints, i * 3); this.arcTo.fromArray(this.sparkPoints, (i + 1) * 3);
      arc.position.lerpVectors(this.arcFrom, this.arcTo, .5); arc.scale.y = this.arcDirection.subVectors(this.arcTo, this.arcFrom).length();
      arc.quaternion.setFromUnitVectors(this.arcUp, this.arcDirection.normalize());
    }
    this.root.updateMatrixWorld(true);
  }

  setArrived(arrived: boolean): void { this.present(0, arrived ? 1 : 0, arrived ? 1 : 0, arrived ? 1 : 0, 0); this.setArenaAccessOpen(false); }
  setArenaAccessOpen(open: boolean): void { this.labDoor.position.y = open ? 10 : 3.55; this.labDoor.updateMatrixWorld(true); }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.cabinetVisuals?.dispose();this.art?.dispose();
    this.root.removeFromParent(); this.root.clear();
    this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose());
  }

  private buildOutlet(): void {
    const cabinet = new THREE.Group(); cabinet.name = 'lift-power-cabinet'; this.root.add(cabinet);
    const pcb = this.material(0x15483d, .75, .2);
    const copper = this.material(0xc39952, .4, .78);
    const solder = this.material(0xb5c8c5, .36, .75);
    const chip = this.material(0x101b20, .7, .25);
    const diagram = this.material(0x75938b, .85, .1);
    const box = (name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material): THREE.Mesh =>
      this.box(name, size, position, material, cabinet);
    const studGeometry = this.geometry(new THREE.CylinderGeometry(.047, .047, .15, 10));
    const screwGeometry = this.geometry(new THREE.CylinderGeometry(.025, .025, .035, 8));
    const padGeometry = this.geometry(new THREE.CylinderGeometry(.022, .022, .012, 8));
    const cylinder = (name: string, geometry: THREE.BufferGeometry, position: readonly [number, number, number], material: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.rotation.z = Math.PI / 2;
      mesh.position.set(...position); cabinet.add(mesh); return mesh;
    };
    box('lift-damaged-power-cabinet', [.1, 1.61, 1.22], [3.71, 1.75, 181.25], this.dark);
    for (const y of [.9, 2.6]) box('lift-power-cabinet-rim', [.4, .09, 1.38], [3.56, y, 181.25], this.frame);
    for (const z of [180.59, 181.91]) box('lift-power-cabinet-side', [.4, 1.61, .085], [3.56, 1.75, z], this.frame);
    box('lift-exposed-pcb', [.055, 1.39, 1.06], [3.59, 1.75, 181.25], pcb);
    for (const y of [1.12, 2.38]) for (const z of [180.79, 181.71]) {
      cylinder('lift-pcb-mounting-screw', screwGeometry, [3.54, y, z], solder);
    }

    const routes: readonly (readonly [number, number][])[] = [
      [[2.13, 181.02], [2.13, 180.86], [1.72, 180.86], [1.72, 181.02]],
      [[2.13, 181.48], [2.13, 181.67], [1.45, 181.67], [1.45, 181.45], [1.28, 181.45]],
      [[2.31, 181.22], [2.4, 181.22], [2.4, 181.62], [2.26, 181.62]],
      [[1.5, 181], [1.4, 181], [1.4, 180.86], [1.2, 180.86], [1.2, 181.16]],
      [[1.23, 181.2], [1.085, 181.2], [1.085, 181.6], [1.24, 181.6]],
      [[2.31, 180.91], [2.36, 180.91], [2.36, 180.8], [1.38, 180.8], [1.38, 180.99]],
    ];
    for (const [i, points] of routes.entries()) {
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let n = 1; n < points.length; n++) {
        const a = points[n - 1]!, b = points[n]!;
        path.add(new THREE.LineCurve3(new THREE.Vector3(3.55, a[0], a[1]), new THREE.Vector3(3.55, b[0], b[1])));
      }
      const trace = new THREE.Mesh(this.geometry(new THREE.TubeGeometry(path, points.length * 4, .009, 4, false)), copper);
      trace.name = `lift-pcb-copper-trace-${i}`; cabinet.add(trace);
      for (const p of [points[0]!, points.at(-1)!]) cylinder('lift-pcb-solder-pad', padGeometry, [3.534, p[0], p[1]], solder);
    }
    box('lift-controller-chip', [.08, .26, .38], [3.515, 2.18, 181.25], chip);
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      box('lift-controller-chip-pin', [.055, .024, .055], [3.545, 2.105 + i * .05, 181.25 + side * .22], solder);
    }
    for (const z of [180.99, 181.19]) {
      cylinder('lift-pcb-capacitor', studGeometry, [3.515, 1.23, z], this.dark);
      cylinder('lift-pcb-capacitor-cap', padGeometry, [3.433, 1.23, z], solder);
    }
    const winding = this.geometry(new THREE.TorusGeometry(.06, .014, 5, 12));
    for (let i = 0; i < 5; i++) {
      const coil = new THREE.Mesh(winding, copper); coil.name = 'lift-pcb-inductor-winding';
      coil.rotation.y = Math.PI / 2; coil.position.set(3.45 + i * .022, 1.24, 181.52); cabinet.add(coil);
    }
    for (const [y, z] of [[2.28, 180.95], [1.39, 181.15], [1.39, 181.38]]) box('lift-pcb-resistor', [.06, .055, .105], [3.53, y!, z!], chip);
    box('lift-pcb-live-indicator', [.04, .045, .09], [3.505, 2.28, 181.62], this.status);
    box('lift-terminal-carrier', [.2, .45, .64], [3.49, 1.72, 181.25], this.white);
    for (const z of [181.05, 181.45]) {
      cylinder('lift-power-terminal', studGeometry, [3.365, 1.72, z], copper);
      cylinder('lift-terminal-contact-screw', screwGeometry, [3.272, 1.72, z], solder);
    }
    box('lift-power-status-recess', [.07, .13, .38], [3.37, 2.6, 181.25], this.dark);
    box('lift-power-status', [.025, .06, .24], [3.32, 2.6, 181.25], this.status);
    for (const y of [.9, 2.6]) for (const z of [180.7, 181.8]) cylinder('lift-cabinet-frame-screw', screwGeometry, [3.335, y, z], solder);

    const hinge = new THREE.Group(); hinge.name = 'lift-open-cabinet-cover'; hinge.position.set(3.6, 1.75, 181.99);
    hinge.rotation.y = 1.9; cabinet.add(hinge);
    const cover = this.box('lift-broken-cabinet-door', [.075, 1.49, 1.22], [-.02, 0, -.66], this.worn, hinge);
    this.box('lift-cover-inner-service-diagram', [.012, .7, .72], [.025, .08, -.67], diagram, hinge);
    for (const z of [-.92, -.44]) this.box('lift-cover-diagram-trace', [.004, .386, .014], [.045, .06, z], copper, hinge);
    for (const y of [-.14, .26]) this.box('lift-cover-diagram-trace', [.004, .014, .47], [.045, y, -.68], copper, hinge);
    for (const z of [-.8, -.58]) this.box('lift-cover-diagram-component', [.008, .08, .12], [.041, .06, z], chip, hinge);
    this.box('lift-cover-warning-inlay', [.009, .05, .7], [-.065, .57, -.66], this.amber, hinge);
    const hingeGeometry = this.geometry(new THREE.CylinderGeometry(.04, .04, .16, 10));
    for (const y of [1.18, 2.32]) {
      const pin = new THREE.Mesh(hingeGeometry, solder); pin.name = 'lift-cover-hinge'; pin.position.set(3.6, y, 181.99); cabinet.add(pin);
    }
    const hidden = new THREE.MeshBasicMaterial({ visible: false }); this.materials.add(hidden);
    this.solid('lift-power-cabinet-solid', [.5, 1.79, 1.52], [3.5, 1.755, 181.25], hidden);
    hinge.updateWorldMatrix(true, true);
    const centre = cover.getWorldPosition(new THREE.Vector3());
    const doorSolid = this.solid('lift-open-cover-solid', [.075, 1.49, 1.22], [centre.x, centre.y, centre.z], hidden);
    doorSolid.rotation.y = hinge.rotation.y;
    this.box('lift-conduit-to-motor', [.10, 1.5, .10], [3.7, 3.4, 181.25], this.frame);
    for (const y of [2.68, 4.16]) this.box('lift-conduit-coupling', [.18, .12, .18], [3.7, y, 181.25], this.dark);
    this.box('lift-motor-housing', [.7, .75, 1.1], [3.45, 4.55, 181.25], this.worn);
    for (let i = 0; i < 5; i++) this.box('lift-motor-cooling-fin', [.74, .035, 1.15], [3.45, 4.28 + i * .12, 181.25], this.dark);
  }

  private buildShaftModule(index: number): void {
    const module = new THREE.Group(); module.name = `lift-scrolling-shaft-${index}`; this.root.add(module); this.shaft.push(module);
    for (const sign of [-1, 1]) {
      this.box('lift-shaft-horizontal-brace', [.16, .18, 9.6], [sign * 5.7, 0, 180.2], this.frame, module);
      this.box('lift-shaft-lamp-housing', [.28, .45, 2.2], [sign * 5.6, 4, 180.1], this.dark, module);
      this.box('lift-shaft-dim-light', [.04, .21, 1.7], [sign * 5.43, 4, 180.1], this.strip, module);
      const brace = this.box('lift-shaft-diagonal', [.11, 7.7, .11], [sign * 5.72, 4, 178.1], this.seam, module);
      brace.rotation.x = sign * .36;
      for (const z of [177.3, 183.3]) this.box('lift-shaft-bolt', [.14, .22, .22], [sign * 5.55, .05, z], this.worn, module);
    }
  }

  private buildLab(): void {
    for (const sign of [-1, 1]) {
      this.solid('lift-lab-outer-wall', [.4, 6.8, 5.2], [sign * 6.4, 3.8, 187.4], this.white);
      this.solid('lift-lab-front-shoulder', [1.97, 6.8, .3], [sign * 5.215, 3.8, 185], this.white);
      for (let i = 0; i < 3; i++) {
        this.box('lift-lab-wall-joint', [.03, .61, .025], [sign * 6.18, .935, 185.3 + i * 1.9], this.seam);
        this.box('lift-lab-wall-joint', [.03, 5.39, .025], [sign * 6.18, 4.055, 185.3 + i * 1.9], this.seam);
      }
      this.box('lift-lab-teal-inlay', [.035, .12, 5], [sign * 6.17, 1.3, 187.4], this.strip);
      this.box('lift-lab-skirt', [.07, .18, 3.9], [sign * 6.16, .5, 187.25], this.frame);
      this.box('lift-lab-door-jamb', [.16, 5.3, .3], [sign * 4.15, 3.05, 185], this.frame);
      this.solid('lift-lab-rear-wall', [1.95, 6.8, .3], [sign * 5.225, 3.8, 189.4], this.white);
      this.box('lift-lab-rear-inlay', [1.7, .08, .04], [sign * 5.3, 1.3, 189.22], this.strip);
      this.box('lift-lab-rear-panel-seam', [.025, .79, .04], [sign * 5.4, .845, 189.22], this.seam);
      this.box('lift-lab-rear-panel-seam', [.025, 5.39, .04], [sign * 5.4, 4.055, 189.22], this.seam);
    }
    this.solid('lift-lab-ceiling', [12.8, .3, 5.2], [0, 7.35, 187.4], this.white);
    this.solid('lift-lab-door-header', [8.46, 1.5, .3], [0, 6.45, 185], this.white);
    this.solid('lift-lab-rear-header', [8.5, .6, .3], [0, 7.05, 189.4], this.white);
    for (const x of [-5, 0, 5]) {
      this.box('lift-lab-ceiling-fixture', [2.5, .12, .8], [x, 7.1, 187.5], this.frame);
      this.box('lift-lab-ceiling-diffuser', [2.2, .04, .6], [x, 7.015, 187.5], this.strip);
      this.box('lift-lab-floor-expansion-seam', [.018, .012, 3.9], [x, .407, 187.25], this.seam);
    }
    this.box('lift-lab-arrival-indicator', [2.5, .12, .05], [0, 5.82, 184.8], this.strip);
    for (const x of [-3.8, 3.8]) this.box('lift-lab-floor-guide', [.08, .02, 4], [x, .42, 187.5], this.strip);
  }

  private material(color: number, roughness: number, metalness: number, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity }); this.materials.add(m); return m;
  }
  private geometry<T extends THREE.BufferGeometry>(g: T): T { this.geometries.add(g); return g; }
  private box(name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material, parent: THREE.Object3D = this.root): THREE.Mesh {
    const mesh = new THREE.Mesh(this.unit, material); mesh.name = name; mesh.scale.set(...size); mesh.position.set(...position); parent.add(mesh); return mesh;
  }
  private solid(name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(new THREE.BoxGeometry(...size)), material); mesh.name = name; mesh.position.set(...position);
    mesh.userData.surfaceTag = 'default'; this.root.add(mesh); this.collisionMeshes.push(mesh); return mesh;
  }
}
