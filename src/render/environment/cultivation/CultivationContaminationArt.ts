import type { CultivationAssetSource } from './CultivationBakedAssets.ts';
import { paneOutline } from './CultivationPaneOutline.ts';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GreyboxRoomBuilder } from '../../../levels/GreyboxRoomBuilder.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import { optimizeFiniteLightEvaluation } from './FiniteLightEvaluation.ts';

type Finish = 'wall' | 'floor' | 'ceiling' | 'metal';

/** Rooms 1–3 only. Borrows the lab's relief maps; owns weather maps and static dressing. */
export class CultivationContaminationArt {
  readonly textures: THREE.Texture[] = [];
  readonly finishes: Record<Finish, THREE.MeshStandardMaterial>;
  readonly glass: THREE.MeshStandardMaterial;
  readonly roots: THREE.Group[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly dark = new THREE.MeshStandardMaterial({ name: 'cultivation-service-recess', color: 0x242b2b, roughness: .86 });
  private readonly growth = new THREE.MeshStandardMaterial({ name: 'cultivation-dry-root-growth', color: 0x535a3c, roughness: .96, side: THREE.DoubleSide });
  private readonly mineral = new THREE.MeshStandardMaterial({ name: 'cultivation-mineral-deposit', color: 0xaca596, roughness: .65, metalness: .16 });
  private readonly amber = new THREE.MeshStandardMaterial({ name: 'cultivation-service-amber', color: 0xb98948, emissive: 0xffad59, emissiveIntensity: .5, roughness: .7 });
  private disposed = false;
  private readonly assets: CultivationAssetSource;

  constructor(lab: CultivationLabMaterials) {
    this.assets = lab.assets;
    this.finishes = {
      wall: this.weather(lab.wall, 'wall'), floor: this.weather(lab.floor, 'floor'),
      ceiling: this.weather(lab.ceiling, 'ceiling'), metal: this.weather(lab.metal, 'metal'),
    };
    // Four damage patterns share one atlas. The fractures are fine branching
    // segments, with dirt/condensation in the same pass as the glass itself.
    this.glass = new THREE.MeshStandardMaterial({ name: 'cultivation-broken-condensation-glass',
      map: this.glassAtlas(), transparent: true, opacity: .76,
      side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false, depthTest: true,
      roughness: .24, metalness: .08 });
    for (const material of [this.dark, this.growth, this.mineral, this.glass, this.amber]) optimizeFiniteLightEvaluation(material);
  }

  overrides(builder: GreyboxRoomBuilder): ReadonlyMap<string, THREE.MeshStandardMaterial> {
    const result = new Map<string, THREE.MeshStandardMaterial>();
    builder.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const source = builder.materials;
      if (object.material === source.wall && !/above-bob-vent|bob-vent-.*-jamb/.test(object.name)) {
        result.set(object.name, this.finishes[object.name.includes('ceiling') ? 'ceiling' : 'wall']);
      } else if (object.material === source.floor) result.set(object.name, this.finishes.floor);
      else if (object.material === source.support) result.set(object.name, this.finishes.metal);
    });
    return result;
  }

  addRoom(root: THREE.Group, room: 1 | 2 | 3, warning: THREE.MeshStandardMaterial, options: {authoredReplacement?: boolean} = {}): void {
    const width = room === 1 ? 36 : room === 2 ? 38 : 48;
    const group = new THREE.Group();
    group.name = `cultivation-room-${room}-contamination`;
    group.userData.presentationOnly = true;
    if (options.authoredReplacement) {
      root.add(group); this.roots.push(group); this.lightRoom(root, room); return;
    }
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const add = (material: THREE.Material, geometry: THREE.BufferGeometry) => {
      const list = parts.get(material) ?? []; list.push(geometry); parts.set(material, list);
    };
    const box = (material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      add(material, new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));
    };
    // Shallow service windows sit directly on the authoritative side walls.
    // No free-standing tanks/rails that could imply extra landings or cover.
    const bays: readonly [number, number][] = room === 1 ? [[-1, 16], [1, 27], [-1, 36]] :
      room === 2 ? [[1, 15], [1, 32]] : [[1, 17], [-1, 32], [1, 49], [-1, 58]];
    for (const [index, [side, z]] of bays.entries()) {
      const face = side * (width / 2 - .2);
      const x = face - side * .045;
      box(this.dark, x, 5.5, z, .045, 5.8, 4.8);
      // Stepped steel surround, inset rubber gasket, drain sill and fasteners.
      // All surfaces remain a shallow relief against the solid room wall.
      for (const dz of [-2.5, 2.5]) {
        box(this.finishes.metal, face-side*.075, 5.5, z+dz, .12, 6, .22);
        box(this.mineral, face-side*.142, 5.5, z+dz-side*.055, .008, 5.7, .025);
        box(this.dark, face-side*.10, 5.5, z+dz*.94, .06, 5.75, .07);
        for (const y of [2.7, 5.5, 8.3]) {
          const bolt = new THREE.CylinderGeometry(.052, .052, .018, 8);
          bolt.rotateZ(Math.PI/2).translate(face-side*.144, y, z+dz);
          add(this.mineral, bolt);
        }
      }
      for (const y of [2.5, 8.5]) box(this.finishes.metal, face-side*.085, y, z, .14, .22, 5.1);
      box(this.dark, face-side*.155, 2.67, z, .012, .05, 4.65);
      for (let n=0;n<14;n++) box(this.dark, face-side*.16, 2.48, z-2.15+n*.33, .012, .06, .16);
      // Cartridge sleeves, dark seams and restraining bands suggest a sealed
      // cultivation rack rather than three featureless bars behind a pane.
      for (const [n, dz] of [-1.48, 0, 1.48].entries()) {
        const height = 3.5 + ((index+n)%3)*.28;
        const tank = new THREE.CylinderGeometry(.48, .48, height, 20);
        // Compress the relief positions while retaining the cartridge's round
        // shading normals, so a shallow wall unit still reads as rolled steel.
        const positions=tank.getAttribute('position');
        for(let i=0;i<positions.count;i++) positions.setX(i,positions.getX(i)*.12);
        tank.translate(face-side*.048, 5.25, z+dz);
        add(this.mineral, tank);
        for (const y of [5.25-height/2, 5.25+height/2]) {
          box(this.finishes.metal, face-side*.075, y, z+dz, .08, .17, .98);
        }
        box(this.dark, face-side*.111, 5.15, z+dz, .01, height-.5, .09);
        for (let k=0;k<5;k++) box(this.finishes.metal, face-side*.118, 4.2+k*.32, z+dz+.12, .008, .025, k%2?.08:.14);
        box(this.finishes.metal, face-side*.04, 7.65, z+dz, .05, .55, .085);
      }
      box(this.dark, face-side*.10, 8.21, z, .04, .25, 4.5);
      box(this.amber, face-side*.135, 8.21, z-1.85, .025, .075, .42);
      for (let n=0;n<=index;n++) box(this.mineral, face-side*.135, 8.21, z+.9+n*.18, .012, .11, .05);
      // Pipe-like rolled seams follow the wall vertically; never cross a route.
      for (const dz of [-2.85, 2.85]) {
        const pipe = new THREE.CylinderGeometry(.09, .09, 11.5, 8);
        pipe.scale(.5, 1, 1).translate(face - side * .025, 6, z + dz);
        add(this.finishes.metal, pipe);
        for (const y of [1, 4.3, 8.9, 11.4]) box(this.mineral, face - side * .08, y, z + dz, .012, .1, .2);
      }
      // Sparse trailing growth with curved stems and folded, pointed leaves.
      // Alternate the sides/lengths of the tendrils; leave machinery visible.
      for (let n=0;n<2+(index%2);n++) {
        const zz=z+(n===0?-2.2:1.9-n*.35), top=8.65+(index%3)*.18;
        const length=1.7+((index*3+n*7)%5)*.43;
        const points: THREE.Vector3[]=[];
        for(let k=0;k<=8;k++) points.push(new THREE.Vector3(face-side*.15,
          top-length*k/8, zz+Math.sin(k*.65+n)*.16+k*k*.003*(n%2?1:-1)));
        const stem=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.016,4,false);
        add(this.growth,stem);
        for(let k=1;k<8;k++) {
          if((k+index+n)%4===0) continue;
          const start=points[k], direction=(k+n)%2?1:-1;
          const length=.23+((k*3+n+index)%5)*.055, breadth=length*.24;
          const yy=start.y, zz=start.z, xx=face-side*.17;
          const leaf=new THREE.BufferGeometry();
          // Raised midrib and two curved margins make a folded leaf silhouette.
          leaf.setAttribute('position',new THREE.Float32BufferAttribute([
            xx,yy,zz, xx-side*.018,yy-.08,zz+direction*length*.48,
            xx,yy-.18,zz+direction*length,
            xx+side*.006,yy-.08+breadth,zz+direction*length*.43,
            xx+side*.012,yy-.08-breadth,zz+direction*length*.50,
          ],3));
          leaf.setIndex([0,3,1,3,2,1,0,1,4,1,2,4]);
          leaf.computeVertexNormals(); add(this.growth,leaf);
        }
      }
      // Each bay selects a different chipped opening and matching atlas cell.
      // Only the pane is transparent; its silhouette is actual missing geometry.
      const variant=(index+room-1)%4;
      const outline=paneOutline(variant);
      const shape=new THREE.Shape(outline.map(([u,v])=>new THREE.Vector2((u-.5)*4.4,(v-.5)*5.3)));
      const geometry = new THREE.ShapeGeometry(shape);
      const uv = geometry.getAttribute('uv');
      for (let i=0;i<uv.count;i++) uv.setXY(i,
        ((uv.getX(i)+2.2)/4.4*.984+.008+variant%2)/2,
        ((uv.getY(i)+2.65)/5.3*.984+.008+Math.floor(variant/2))/2);
      const pane = new THREE.Mesh(geometry, this.glass);
      pane.name = `cultivation-room-${room}-broken-glass-${index}`;
      pane.rotation.y = -side * Math.PI / 2;
      pane.position.set(face - side * .13, 5.5, z);
      pane.userData.presentationOnly = true;
      group.add(pane);
    }
    // Opaque warning paint sits on existing safe floors, never over the liquid.
    if (room !== 3) {
      const z = room === 1 ? 8.76 : 7.76;
      const stripe = new THREE.BoxGeometry(width - .6, .012, .32);
      const uv = stripe.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (width - .6));
      add(warning, stripe.translate(0, .207, z));
    }
    if (room === 2) {
      // Only the lower door needs illuminated mechanical jambs. Leave the
      // upper duct aperture clear instead of floating guide bars across it.
      for (const x of [-2.3, 2.3]) box(this.amber, x, 2.5, 44.74, .13, 3.6, .04);
    }
    if (room === 3) {
      for (const x of [-2.7, 2.7]) box(this.amber, x, 5.3, 71.74, .16, 1.2, .04);
    }
    for (const [material, geometries] of parts) {
      // Shapes and boxes both have normals; add UVs for the untextured leaves.
      for (const g of geometries) if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      const geometry = mergeGeometries(geometries);
      geometries.forEach(g => g.dispose());
      if (!geometry) throw new Error('Cannot merge cultivation service dressing');
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `cultivation-room-${room}-${material.name}-batch`;
      mesh.userData.presentationOnly = true;
      group.add(mesh);
    }
    // Later surface cleanup may replace geometry or attach its own proxies.
    // Retain allocation ownership independently of the live scene graph.
    group.traverse(object => { if (object instanceof THREE.Mesh) this.geometries.add(object.geometry); });
    root.add(group); this.roots.push(group);
    this.lightRoom(root, room);
  }

  private lightRoom(root: THREE.Group, room: 1 | 2 | 3): void {
    const fills: THREE.PointLight[] = [];
    root.traverse(object => {
      if (!(object instanceof THREE.PointLight)) return;
      if (object.name.endsWith('-neutral-fill')) fills.push(object);
      if (object.name.includes('radiation-light')) {
        object.color.setHex(0xc5ce8e); object.intensity=room===3?10:7;
      }
      if (object.name.endsWith('exit-light')) { object.color.setHex(0xc5d5cc); object.intensity=10; }
      if (room === 2 && object.name.endsWith('radiation-light-far')) {
        object.name = 'cultivation-room-2-warm-door-light';
        object.position.set(0, 4, 42); object.color.setHex(0xe0c6a6); object.intensity = 85; object.distance = 22;
      }
      if (room === 3 && object.name.endsWith('-security-light')) {
        object.color.setHex(0xd7ba99); object.intensity = 65;
      }
    });
    fills.forEach((light, i) => {
      light.intensity = room === 3 ? 245 : 285;
      if (room === 3) light.color.setHex(0xc8cdcd);
      if (room === 2 && i === 1) {
        light.position.set(8, 19, 41); light.color.setHex(0xc9d5e0); light.intensity = 235;
      }
    });
  }

  private weather(source: THREE.MeshStandardMaterial, finish: Finish): THREE.MeshStandardMaterial {
    const { albedo, roughness } = this.assets.textures(`weather-${finish}`);
    this.textures.push(albedo, roughness);
    const material=source.clone();
    material.name=`cultivation-weathered-${finish}`;
    material.map=albedo;
    material.roughnessMap=roughness;
    material.color.setHex(finish==='wall'?0xc0bfba:finish==='ceiling'?0xa4a8a5:finish==='floor'?0xaaafa9:0x727970);
    material.userData.tileSizeMetres=finish==='wall'?[4,3]:[2,2];
    if (finish === 'wall') this.addRunoff(material);
    if (finish === 'floor') this.addFloorWear(material);
    optimizeFiniteLightEvaluation(material);
    return material;
  }

  /** Metre-scaled wear crosses panel boundaries and leaves broad clean areas. */
  private addFloorWear(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vCultivationFloorPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nvCultivationFloorPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = `varying vec3 vCultivationFloorPosition;
        float floorWearHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float floorWearNoise(vec2 p) {
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(floorWearHash(i),floorWearHash(i+vec2(1,0)),f.x),
            mix(floorWearHash(i+vec2(0,1)),floorWearHash(i+vec2(1,1)),f.x),f.y);
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 floorP=vCultivationFloorPosition.xz+vCultivationFloorPosition.y*vec2(0.73,1.19);
        float broad=floorWearNoise(floorP*0.19+vec2(8.3,2.7));
        float broken=floorWearNoise(floorP*0.71+vec2(21.4,5.1));
        float grain=floorWearNoise(floorP*3.1);
        float deposits=smoothstep(0.48,0.73,broad*0.72+broken*0.28);
        float dust=deposits*(0.65+grain*0.35);
        // Irregular smaller wet cores sit within a few of the larger deposits.
        float damp=deposits*smoothstep(0.58,0.82,broken*0.8+grain*0.2);
        vec2 panel=fract(vMapUv);
        float edge=min(min(panel.x,1.0-panel.x),min(panel.y,1.0-panel.y));
        float joint=exp(-edge*38.0)*smoothstep(0.35,0.75,broad)*(0.35+broken*0.65);
        diffuseColor.rgb*=mix(vec3(1.0),vec3(0.65,0.59,0.46),dust*0.58+joint*0.24);
        diffuseColor.rgb*=1.0-damp*0.12;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.48,damp*0.7);');
    };
    material.customProgramCacheKey = () => 'cultivation-irregular-floor-wear-v1';
  }

  /** Sparse, non-tile-repeating leaks with distinct sources and gravity tails. */
  private addRunoff(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vCultivationPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nvCultivationPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = `varying vec3 vCultivationPosition;
        float cultivationHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float cultivationNoise(vec2 p) {
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(cultivationHash(i),cultivationHash(i+vec2(1,0)),f.x),
            mix(cultivationHash(i+vec2(0,1)),cultivationHash(i+vec2(1,1)),f.x),f.y);
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 wallP=vec2(vCultivationPosition.x+vCultivationPosition.z,vCultivationPosition.y);
        vec2 cell=floor(wallP/vec2(7.0,6.0));
        vec2 local=fract(wallP/vec2(7.0,6.0));
        float seed=cultivationHash(cell);
        float sourceX=0.25+0.5*cultivationHash(cell+13.0);
        float sourceY=cultivationHash(cell+29.0)>0.5?0.99:0.50;
        float noise=cultivationNoise(wallP*3.5);
        float distanceX=abs(local.x-sourceX+(noise-0.5)*0.024);
        float fall=sourceY-local.y;
        float wet=step(0.78,seed)*smoothstep(-0.008,0.018,fall)*(1.0-smoothstep(0.16,0.25+seed*.30,fall));
        float width=mix(0.07+seed*.09,0.02,smoothstep(0.0,0.48,fall));
        float leakPatch=(1.0-smoothstep(width*.3,width,distanceX))*wet;
        float channels=cultivationNoise(vec2(wallP.x*5.0,cell.y*9.0));
        float drip=leakPatch*(0.55+0.45*channels);
        float bloom=cultivationNoise(wallP*0.42+7.0);
        float tide=(1.0-smoothstep(0.25,1.1+bloom*1.6,wallP.y))*smoothstep(0.43,0.72,bloom);
        float crust=leakPatch*smoothstep(0.6,0.85,noise)*0.25;
        float wear=step(0.80,seed)*smoothstep(0.62,0.83,bloom)*smoothstep(0.4,0.72,noise)*0.17;
        diffuseColor.rgb*=mix(vec3(1.0),vec3(0.43,0.36,0.28),drip*0.65+tide*0.42+wear);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.34,0.31,0.25),crust);
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.57,leakPatch*0.45+tide*0.35);');
    };
    material.customProgramCacheKey = () => 'cultivation-sparse-runoff-v2';
  }


  private glassAtlas(): THREE.Texture {
    const map = this.assets.textures('glass').albedo;
    this.textures.push(map);
    return map;

  }


  dispose(): void {
    if(this.disposed)return;
    this.disposed=true;
    for(const root of this.roots) {
      root.removeFromParent();
      root.clear();
    }
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.clear();
    for(const material of [...Object.values(this.finishes),this.glass,this.dark,this.growth,this.mineral,this.amber]) material.dispose();
    for(const texture of this.textures)texture.dispose();
  }
}
