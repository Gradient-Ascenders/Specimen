import { EXTERMINATION_SURFACES, type ExterminationSurface } from '../../src/boss/ExterminationSurfaceMaps.ts';

const clamp=(x:number)=>Math.max(0,Math.min(1,x));
function hash(x:number,y:number,seed:number):number {
  let n=Math.imul(x+seed,374761393)^Math.imul(y+seed*7,668265263);n=Math.imul(n^n>>>13,1274126177);
  return ((n^n>>>16)>>>0)/4294967295;
}
/** Fine original surface finishes. Architecture and joints are actual authored geometry. */
export function generateExterminationSurface(family:ExterminationSurface) {
  const f=EXTERMINATION_SURFACES[family],size=f.size;
  const color=new Uint8Array(size*size*4),roughness=new Uint8Array(color.length),normal=new Uint8Array(color.length);
  const heights=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const p=(y*size+x)*4,fine=hash(x,y,f.seed),grain=hash(Math.floor(x/5),Math.floor(y/3),f.seed+17);
    let value=.985+(fine-.5)*.018+(grain-.5)*.012,relief=(fine-.5)*.000045,rough=f.roughness+(grain-.5)*.06;
    if(family==='floor') {const speck=hash(x,y,f.seed+5);value+=(speck-.5)*.025;relief+=(speck-.5)*.00012;rough+=(speck-.5)*.045;}
    if(family==='steel') {const brush=hash(Math.floor(x/100),y,f.seed+11);value+=(brush-.5)*.035;relief+=(brush-.5)*.00012;rough+=(brush-.5)*.1;}
    if(family==='grate') {
      const u=x/size*8,v=y/size*2,slot=u%1>.2&&u%1<.8&&v%1>.14&&v%1<.86;
      if(slot){value*=.22;relief-=.005;rough+=.11;}
    }
    if(family==='shaft') {
      const rib=Math.abs(Math.sin(x/size*Math.PI*12));value*=.82+rib*.15;relief-=Math.max(0,.08-rib)*.05;
      rough+=(grain-.5)*.08;
    }
    for(let c=0;c<3;c++){color[p+c]=Math.round(Math.max(0,Math.min(255,f.color[c]!*value)));roughness[p+c]=Math.round(clamp(rough)*255);}
    color[p+3]=roughness[p+3]=255;heights[y*size+x]=relief;
  }
  const sample=(x:number,y:number)=>heights[((y+size)%size)*size+(x+size)%size]!;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const dx=(sample(x+1,y)-sample(x-1,y))*size/(2*f.tile[0]),dy=(sample(x,y+1)-sample(x,y-1))*size/(2*f.tile[1]);
    const length=Math.hypot(dx,dy,1),p=(y*size+x)*4;
    normal[p]=Math.round((.5-dx/length*.5)*255);normal[p+1]=Math.round((.5-dy/length*.5)*255);
    normal[p+2]=Math.round((.5+1/length*.5)*255);normal[p+3]=255;
  }
  return [color,roughness,normal] as const;
}
