import * as THREE from 'three';
import { paneOutline } from '../../src/render/environment/cultivation/CultivationPaneOutline.ts';
type Finish = 'wall' | 'floor' | 'ceiling' | 'metal';

export function generateWeather(source: THREE.DataTexture, finish: Finish) {
    const size = 256, albedo = new Uint8Array(size*size*4), rough = new Uint8Array(size*size*4);
    const original = source;
    const data = original.image.data as Uint8Array, sourceSize = original.image.width;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u=x/size, v=y/size, edge=Math.min(u,1-u,v,1-v);
      const grain=((Math.imul(x+17,73856093)^Math.imul(y+3,19349663))>>>0)%997/997;
      const cloud=.5+.25*Math.sin(u*19+Math.sin(v*13))+.25*Math.cos(v*23+Math.sin(u*17));
      const seam=Math.exp(-edge*30);
      // Floor deposits are placed across the room below, rather than stamped
      // into each two-metre panel. Retain only a faint joint residue here.
      const rust = seam * (finish === 'floor' ? .045 : .14 + cloud * .26) + grain * .018;
      const i=(y*size+x)*4, j=(Math.floor(y*sourceSize/size)*sourceSize+Math.floor(x*sourceSize/size))*4;
      const tint=finish==='metal' ? [137,90,51] : [139,125,93];
      for(let c=0;c<3;c++) {
        albedo[i+c]=data[j+c]*(1-rust)+tint[c]*rust+(grain-.5)*7;
        rough[i+c]=235;
      }
      albedo[i+3]=rough[i+3]=255;
    }
  return { albedo: texture(`${finish}-albedo`,albedo,size,true), roughness: texture(`${finish}-roughness`,rough,size) };
}

export function generateGlass() {
    const size=512, tile=256, pixels=new Uint8Array(size*size*4);
    const hash=(x:number,y:number)=>((Math.imul(x+17,73856093)^Math.imul(y+3,19349663))>>>0)%997/997;
    for(let variant=0;variant<4;variant++) {
      const outline=paneOutline(variant);
      const tip=outline[7];
      // Short angular branches originate at a real broken edge, not a painted
      // curved line. Coordinates match the mesh and vary between atlas cells.
      const lines: [number,number,number,number][]=[];
      let [px,py]=tip;
      for(let n=0;n<5;n++) {
        const nx=px+(hash(n,variant)-.53)*.18, ny=py-.055-hash(n+9,variant)*.10;
        lines.push([px,py,nx,ny]);
        if(n%2===0) lines.push([nx,ny,nx+(hash(n+21,variant)-.5)*.22,ny-.08]);
        px=nx; py=ny;
      }
      for(let y=0;y<tile;y++) for(let x=0;x<tile;x++) {
        const u=(x/(tile-1)-.008)/.984, v=(y/(tile-1)-.008)/.984;
        const edge=Math.min(u,1-u,v,1-v), noise=hash(x+variant*73,y);
        const cloud=.5+.25*Math.sin(u*18+Math.sin(v*11))+.25*Math.sin(v*25+u*9);
        const tracks=Math.pow(.5+.5*Math.sin(u*187+Math.sin(u*63)*1.4),22);
        const grime=Math.min(1,Math.exp(-Math.max(edge,0)*30)*(.3+cloud*.5)+tracks*.18*cloud);
        const dx=(x+variant*7)%23-11, dy=(y+Math.floor(x/23)*17)%31-15;
        const drop=Math.exp(-(dx*dx/1.1+dy*dy/3.5))*smooth(.25,.75,cloud);
        let fracture=0;
        for(const [ax,ay,bx,by] of lines) {
          const vx=bx-ax,vy=by-ay,t=THREE.MathUtils.clamp(((u-ax)*vx+(v-ay)*vy)/(vx*vx+vy*vy),0,1);
          const d=Math.hypot(u-ax-t*vx,v-ay-t*vy);
          fracture=Math.max(fracture,(1-smooth(.0005,.0027,d))*.64);
        }
        const haze=grime*.6+drop*.18;
        const i=((y+Math.floor(variant/2)*tile)*size+x+(variant%2)*tile)*4;
        pixels.set([157-haze*58+fracture*69,170-haze*68+fracture*60,169-haze*77+fracture*63,
          20+grime*102+cloud*12+drop*30+fracture*116+(noise-.5)*6],i);
      }
    }
  return { albedo: texture('glass-atlas',pixels,size,true) };
}

function texture(name: string, pixels: Uint8Array, size: number, colour = false): THREE.DataTexture {
    const map=new THREE.DataTexture(pixels,size,size);
    map.name=`cultivation-contamination-${name}`;
    map.colorSpace=colour?THREE.SRGBColorSpace:THREE.NoColorSpace;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.magFilter=THREE.LinearFilter; map.minFilter=THREE.LinearMipmapLinearFilter;
    map.generateMipmaps=true; map.anisotropy=4; map.needsUpdate=true;
    return map;
  }

function smooth(min: number, max: number, value: number): number { return THREE.MathUtils.smoothstep(value, min, max); }
