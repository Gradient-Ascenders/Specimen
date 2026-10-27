import * as THREE from 'three';

const SIZE = 512;
function hash(x: number, y: number): number {
  let n = Math.imul(x + 31, 374761393) ^ Math.imul(y + 67, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}
function noise(u: number, v: number, cells: number): number {
  const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const at = (a: number, b: number) => hash(((a % cells) + cells) % cells, ((b % cells) + cells) % cells);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), sx),
    THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy);
}

export function createCultivationMembraneTextures() {
  const albedo = new Uint8Array(SIZE * SIZE * 4), roughness = new Uint8Array(albedo.length);
  const normal = new Uint8Array(albedo.length), heights = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE;
    const broad = noise(u, v, 4), fine = noise(u, v, 64);
    const folds = noise(u + .16 + (broad - .5) * .16,
      v + (noise(u + .31, v, 4) - .5) * .16, 24);
    const vein = 1 - THREE.MathUtils.smoothstep(Math.abs(folds - .5), .025, .11);
    const dried = THREE.MathUtils.smoothstep(broad * .8 + fine * .2, .58, .82) * .65;
    const bloom = THREE.MathUtils.smoothstep(folds, .3, .8);
    const i = (y * SIZE + x) * 4;
    albedo[i] = 85 + bloom * 12 + vein * 6 + dried * 17;
    albedo[i + 1] = 160 + bloom * 17 + vein * 9 - dried * 44;
    albedo[i + 2] = 138 + bloom * 12 + vein * 7 - dried * 40;
    for (let c = 0; c < 3; c++) roughness[i + c] = 151 + dried * 75 - vein * 15;
    albedo[i + 3] = roughness[i + 3] = 255;
    heights[y * SIZE + x] = folds * .4 + vein * .05 + fine * .018 - dried * .05;
  }
  const height = (x: number, y: number) => heights[((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (height(x + 1, y) - height(x - 1, y)) * 3;
    const dy = (height(x, y + 1) - height(x, y - 1)) * 3;
    const inverse = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * SIZE + x) * 4;
    normal.set([(-dx * inverse * .5 + .5) * 255, (-dy * inverse * .5 + .5) * 255, (inverse * .5 + .5) * 255, 255], i);
  }
  const texture = (role: string, pixels: Uint8Array, color = false) => {
    const map = new THREE.DataTexture(pixels, SIZE, SIZE);
    map.name = `cultivation-aged-membrane-${role}`;
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
    return map;
  };
  return { albedo: texture('albedo', albedo, true), roughness: texture('roughness', roughness), normal: texture('normal', normal) };
}

/** Cultured biofilm for the nursery/testing rooms. The later rooms retain their
 * existing membrane bank. These are pigment/roughness/normal maps, without light. */
export function createCultivationBiofilmTextures() {
  const albedo=new Uint8Array(SIZE*SIZE*4),roughness=new Uint8Array(albedo.length);
  const normal=new Uint8Array(albedo.length),heights=new Float32Array(SIZE*SIZE);
  const mix=THREE.MathUtils.lerp,smooth=THREE.MathUtils.smoothstep;
  const field=(u:number,v:number,cols:number,rows:number)=>{
    const x=u*cols,y=v*rows,a=Math.floor(x),b=Math.floor(y),fx=x-a,fy=y-b;
    const at=(i:number,j:number)=>hash(((i%cols)+cols)%cols,((j%rows)+rows)%rows);
    return mix(mix(at(a,b),at(a+1,b),fx*fx*(3-2*fx)),
      mix(at(a,b+1),at(a+1,b+1),fx*fx*(3-2*fx)),fy*fy*(3-2*fy));
  };
  const cells=(u:number,v:number,count:number)=>{
    const x=u*count,y=v*count,a=Math.floor(x),b=Math.floor(y);
    let first=Infinity,second=Infinity;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
      const px=a+i,py=b+j,ix=((px%count)+count)%count,iy=((py%count)+count)%count;
      const dx=px+.2+.6*hash(ix,iy)-x,dy=py+.2+.6*hash(ix+83,iy+29)-y;
      const d=dx*dx+dy*dy;
      if(d<first){second=first;first=d;}else if(d<second)second=d;
    }
    return [Math.sqrt(first),Math.sqrt(second)-Math.sqrt(first)];
  };
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const u=x/SIZE,v=y/SIZE,broad=noise(u,v,4),fine=noise(u,v,96);
    const wu=u+(broad-.5)*.15+.055*Math.sin(v*Math.PI*8+noise(u,v,8)*3);
    const wv=v+(noise(u+.37,v+.19,4)-.5)*.12+.045*Math.sin(u*Math.PI*8+noise(u+.2,v,8)*3);
    const body=field(wu,wv,11,6),fold=field(wu,wv,28,8);
    const vein=1-smooth(cells(wu,wv,8)[1],.014,.085);
    const pore=cells(wu+.21,wv-.13,28)[0];
    const bubble=(1-smooth(pore,.08,.22))*smooth(noise(u+.13,v,16),.53,.72);
    const dry=smooth(broad*.78+noise(u+.29,v-.11,12)*.22,.57,.77);
    const crease=1-smooth(Math.abs(fold-.5),.018,.13);
    const k=(y*SIZE+x)*4;
    albedo[k]=76+body*36+vein*25+dry*18-bubble*8;
    albedo[k+1]=115+body*40+vein*24-dry*22-bubble*9;
    albedo[k+2]=90+body*30+vein*10-dry*20-bubble*6;
    for(let c=0;c<3;c++)roughness[k+c]=100+dry*115+body*28-vein*18-bubble*15;
    albedo[k+3]=roughness[k+3]=255;
    heights[y*SIZE+x]=body*.13+crease*.065+vein*.10+bubble*.085+fine*.009-dry*.035;
  }
  const height=(x:number,y:number)=>heights[((y+SIZE)%SIZE)*SIZE+(x+SIZE)%SIZE];
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const dx=(height(x+1,y)-height(x-1,y))*5,dy=(height(x,y+1)-height(x,y-1))*5;
    const inv=1/Math.sqrt(dx*dx+dy*dy+1),k=(y*SIZE+x)*4;
    normal.set([(-dx*inv*.5+.5)*255,(-dy*inv*.5+.5)*255,(inv*.5+.5)*255,255],k);
  }
  const texture=(role:string,pixels:Uint8Array,colour=false)=>{
    const map=new THREE.DataTexture(pixels,SIZE,SIZE);
    map.name=`cultivation-cultured-biofilm-${role}`;map.colorSpace=colour?THREE.SRGBColorSpace:THREE.NoColorSpace;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
    map.generateMipmaps=true;map.anisotropy=4;map.needsUpdate=true;return map;
  };
  return {albedo:texture('albedo',albedo,true),roughness:texture('roughness',roughness),normal:texture('normal',normal)};
}
