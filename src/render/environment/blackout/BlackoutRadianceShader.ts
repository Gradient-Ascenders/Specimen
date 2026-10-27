import * as THREE from 'three';
import {BLACKOUT_RADIANCE_LAYOUT as ZONES,BLACKOUT_ATLAS_WIDTH as WIDTH,BLACKOUT_ATLAS_HEIGHT as HEIGHT,
  BLACKOUT_ATLAS_DEPTH as DEPTH,BLACKOUT_BAND_HEIGHT as BAND,BLACKOUT_ZONE_DEPTH as STATE_DEPTH,
  BLACKOUT_REFLECTION_COLUMNS as COLUMNS} from './BlackoutLightingLayout.ts';

let offset=0;
const offsets=ZONES.map(z=>{const start=offset;offset+=z.grid[2]+2;return start;});
const layout={bkMin:{value:ZONES.map(z=>new THREE.Vector3(...z.min))},bkMax:{value:ZONES.map(z=>new THREE.Vector3(...z.max))},
  bkGrid:{value:ZONES.map(z=>new THREE.Vector3(...z.grid))},bkCapture:{value:ZONES.map(z=>new THREE.Vector3(...z.capture))},bkOffset:{value:offsets}};
export interface BlackoutRadianceUniforms {
  bkVolume:THREE.IUniform<THREE.Data3DTexture>;
  bkPower:THREE.IUniform<number[]>;
  bkDirectional:THREE.IUniform<number>;
  bkLiquid:THREE.IUniform<number>;
  bkTime:THREE.IUniform<number>;
}

const probes=/*glsl*/`
vec3 bkWorld;
uniform highp sampler3D bkVolume;
uniform float bkPower[${ZONES.length}],bkDirectional,bkLiquid,bkTime;
uniform vec3 bkMin[${ZONES.length}],bkMax[${ZONES.length}],bkGrid[${ZONES.length}],bkCapture[${ZONES.length}];
uniform float bkOffset[${ZONES.length}];
void blackoutZones(vec3 p,out int a,out int b,out float f){
  a=9;b=9;f=0.0;
  if(p.z<55.0){a=0;b=p.x<0.0?2:1;f=smoothstep(53.0,55.0,p.z);return;}
  if(p.z<81.0){a=p.x<0.0?2:1;b=3;f=smoothstep(79.0,81.0,p.z);return;}
  if(p.z<150.0){
    a=3;b=4;f=smoothstep(106.0,108.0,p.z);
    if(p.z>=108.0){a=4;b=5;f=smoothstep(127.0,129.0,p.z);}
    if(p.z>=129.0){a=5;b=6;
      f=smoothstep(4.5,6.5,p.x)*smoothstep(4.5,6.5,p.y)*smoothstep(133.0,136.0,p.z)*(1.0-smoothstep(146.0,149.0,p.z));}
    return;
  }
  if(p.z<152.0){a=5;b=7;f=smoothstep(150.0,152.0,p.z);return;}
  if(p.z<177.0){a=7;b=8;f=smoothstep(176.0,177.0,p.z);return;}
  if(p.z<185.3){a=8;b=9;f=smoothstep(184.5,185.3,p.z);}
}
vec4 blackoutBand(vec3 uv,int zone,float band,float state){
  vec3 grid=bkGrid[zone];
  vec3 pixel=vec3(uv.x*(grid.x-1.0)+.5,band*${BAND}.0+uv.y*(grid.y-1.0)+.5,
    state*${STATE_DEPTH}.0+bkOffset[zone]+1.5+uv.z*(grid.z-1.0));
  return texture(bkVolume,pixel/vec3(${WIDTH}.0,${HEIGHT}.0,${DEPTH}.0));
}
vec3 blackoutState(vec3 uv,vec3 n,int zone,float state){
  vec4 base=blackoutBand(uv,zone,0.0,state);vec3 energy=base.rgb;
  if(bkDirectional>.5){
    energy+=blackoutBand(uv,zone,1.0,state).rgb*n.x;
    energy+=blackoutBand(uv,zone,2.0,state).rgb*n.y;
    energy+=blackoutBand(uv,zone,3.0,state).rgb*n.z;
  }
  return max(vec3(0.0),energy/max(base.a,.025));
}
vec3 blackoutZoneIndirect(vec3 p,vec3 n,int zone){
  vec3 uv=clamp((p-bkMin[zone])/(bkMax[zone]-bkMin[zone]),0.0,1.0);
  float power=clamp(bkPower[zone],0.0,1.0);
  // Unpowered is the common case. Avoid a second lookup until power changes.
  vec3 energy=blackoutState(uv,n,zone,1.0);
  if(power>.001)energy=mix(energy,blackoutState(uv,n,zone,0.0),power);
  return energy;
}
vec3 blackoutIndirect(vec3 n){
  vec3 p=bkWorld+n*.16;int a,b;float f;blackoutZones(p,a,b,f);if(f>=1.0)a=b;
  vec3 energy=blackoutZoneIndirect(p,n,a);
  if(f>0.0&&f<1.0)energy=mix(energy,blackoutZoneIndirect(p,n,b),f);
  return energy;
}
vec3 blackoutAcidBounce(vec3 n){
  float bay=step(7.0,bkWorld.z)*(1.0-step(48.0,bkWorld.z))*step(abs(bkWorld.x),16.8);
  float hall=step(88.0,bkWorld.z)*(1.0-step(145.0,bkWorld.z))*step(abs(bkWorld.x),17.8);
  float height=bkWorld.y+.8;
  float proximity=step(.02,height)*(1.0-smoothstep(.4,3.0,height));
  float wave=sin(bkWorld.x*.65+bkTime*.28)*sin(bkWorld.z*.71-bkTime*.22);
  return vec3(.25,1.0,.10)*(.004*bay+.014*hall)*proximity*(.2+.8*max(0.0,-n.y))*(.55+.45*pow(.5+.5*wave,4.0))*bkLiquid;
}
vec3 blackoutProjected(vec3 direction,int zone){
  vec3 p=clamp(bkWorld,bkMin[zone]+.01,bkMax[zone]-.01);
  vec3 safe=mix(vec3(-1.0),vec3(1.0),step(vec3(0.0),direction))*max(abs(direction),vec3(.00001));
  vec3 distances=max((bkMin[zone]-p)/safe,(bkMax[zone]-p)/safe);
  return p+direction*max(0.0,min(distances.x,min(distances.y,distances.z)))-bkCapture[zone];
}
`;

function reflections(width:number,height:number):string {
  const rows=Math.ceil(ZONES.length*2/COLUMNS),chunk=THREE.ShaderChunk.cube_uv_reflection_fragment;
  const start=chunk.indexOf('\tvec3 bilinearCubeUV('),end=chunk.indexOf('\n\t#define cubeUV_r0',start);
  if(start<0||end<0)throw Error('Unsupported CubeUV shader.');
  const bilinear=chunk.slice(start,end)
    .replace('bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt )','blackoutBilinear( sampler2D envMap, vec3 direction, float mipInt, float tile )')
    .replace('uv.x *= CUBEUV_TEXEL_WIDTH;',`uv.x=(uv.x+mod(tile,${COLUMNS}.0)*${width}.0)/${width*COLUMNS}.0;`)
    .replace('uv.y *= CUBEUV_TEXEL_HEIGHT;',`uv.y=(uv.y+floor(tile/${COLUMNS}.0)*${height}.0)/${height*rows}.0;`);
  return `
  #if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
  ${bilinear}
  vec3 blackoutReflectionTile(vec3 direction,float roughness,int zone,float state){
    vec3 projected=blackoutProjected(direction,zone);
    float mip=clamp(roughnessToMip(max(.001,roughness)),cubeUV_m0,CUBEUV_MAX_MIP),level=floor(mip);
    float tile=float(zone)+state*${ZONES.length}.0;
    return mix(blackoutBilinear(envMap,projected,level,tile),blackoutBilinear(envMap,projected,min(level+1.0,CUBEUV_MAX_MIP),tile),fract(mip));
  }
  vec3 blackoutReflectionZone(vec3 direction,float roughness,int zone){
    float power=clamp(bkPower[zone],0.0,1.0);
    vec3 value=blackoutReflectionTile(direction,roughness,zone,1.0);
    if(power>.001)value=mix(value,blackoutReflectionTile(direction,roughness,zone,0.0),power);
    return value;
  }
  vec4 blackoutReflection(vec3 direction,float roughness){
    int a,b;float f;blackoutZones(bkWorld,a,b,f);if(f>=1.0)a=b;
    vec3 value=blackoutReflectionZone(direction,roughness,a);
    if(f>0.0&&f<1.0)value=mix(value,blackoutReflectionZone(direction,roughness,b),f);
    return vec4(value,1.0);
  }
  #endif
  `;
}

export function installBlackoutRadianceShader(material:THREE.MeshStandardMaterial,uniforms:BlackoutRadianceUniforms,width:number,height:number):void {
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    if(shader.uniforms.bkVolume===uniforms.bkVolume)return;
    Object.assign(shader.uniforms,layout,uniforms);
    // Static bounce changes slowly across the authored surfaces. Evaluate its
    // SH volume per vertex, retaining live world transforms for moving decks,
    // instances and deformed characters. Pixel normals still shape direct
    // light, shadows, wet reflections and the faint acid bounce.
    shader.vertexShader=probes+'\nvarying vec3 vBkIndirect;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      bkWorld=cameraPosition+transpose(mat3(viewMatrix))*mvPosition.xyz;
      vBkIndirect=blackoutIndirect(normalize(transpose(mat3(viewMatrix))*transformedNormal));`);
    shader.fragmentShader=probes+'\nvarying vec3 vBkIndirect;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nbkWorld=cameraPosition-transpose(mat3(viewMatrix))*vViewPosition;')
      .replace('#include <cube_uv_reflection_fragment>',`#undef CUBEUV_MAX_MIP\n#define CUBEUV_MAX_MIP ${Math.log2(height/4).toFixed(1)}\n#undef CUBEUV_TEXEL_WIDTH\n#define CUBEUV_TEXEL_WIDTH ${(1/width).toPrecision(12)}\n#include <cube_uv_reflection_fragment>`)
      .replace('#include <envmap_common_pars_fragment>',`#include <envmap_common_pars_fragment>\n${reflections(width,height)}`)
      .replace('#include <envmap_physical_pars_fragment>',THREE.ShaderChunk.envmap_physical_pars_fragment
        .replace('return PI * envMapColor.rgb * envMapIntensity;','return vec3(0.0);')
        .replace('textureCubeUV( envMap, envMapRotation * reflectVec, roughness )','blackoutReflection( envMapRotation * reflectVec, roughness )'))
      .replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
        #if defined(RE_IndirectDiffuse)
        vec3 bkNormal=transformNormalByInverseViewMatrix(geometryNormal,viewMatrix);
        irradiance+=vBkIndirect+blackoutAcidBounce(bkNormal);
        #endif`);
  };
  material.customProgramCacheKey=()=>`${key}:blackout-radiance-v2`;material.needsUpdate=true;
}
