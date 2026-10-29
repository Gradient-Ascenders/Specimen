import * as THREE from 'three';
import {CONTAINMENT_PROBE_LAYOUT,CONTAINMENT_PROBE_ATLAS_WIDTH,CONTAINMENT_PROBE_ATLAS_HEIGHT,
  CONTAINMENT_PROBE_ATLAS_DEPTH} from './ContainmentProbeLayout.ts';

let offset=0;
const offsets=CONTAINMENT_PROBE_LAYOUT.map(p=>{const start=offset;offset+=4*(p.grid[2]+2);return start;});
const layoutUniforms={
  cRoomMin:{value:CONTAINMENT_PROBE_LAYOUT.map(p=>new THREE.Vector3(...p.min))},
  cRoomMax:{value:CONTAINMENT_PROBE_LAYOUT.map(p=>new THREE.Vector3(...p.max))},
  cRoomGrid:{value:CONTAINMENT_PROBE_LAYOUT.map(p=>new THREE.Vector3(...p.grid))},
  cRoomCapture:{value:CONTAINMENT_PROBE_LAYOUT.map(p=>new THREE.Vector3(...p.capture))},
  cRoomOffset:{value:offsets},
};

/** A single texture contains five padded L1 irradiance volumes. Hardware
 * trilinear filtering interpolates positions; doorway blends interpolate rooms.
 * L0 alone is used at Low quality. Higher tiers retain directional colour. */
const probeGLSL=/* glsl */`
vec3 cWorldPosition;
uniform highp sampler3D cIrradiance;
uniform float cDirectionalIrradiance;
uniform float cIndirectStrength;
uniform vec3 cRoomMin[5];
uniform vec3 cRoomMax[5];
uniform vec3 cRoomGrid[5];
uniform vec3 cRoomCapture[5];
uniform float cRoomOffset[5];
void containmentRooms(vec3 p,out int a,out int b,out float blend){
  a=4;b=4;blend=0.0;
  ${[27,49,79.5,91.5].map((boundary,i)=>`if(p.z<${(boundary+1.5).toFixed(1)}){a=${i};b=${i+1};blend=smoothstep(${(boundary-1.5).toFixed(1)},${(boundary+1.5).toFixed(1)},p.z);return;}`).join('\n')}
}
vec3 containmentProbeBand(vec3 uv,int room,float band){
  vec3 grid=cRoomGrid[room];
  vec3 pixel=vec3(uv.xy*(grid.xy-1.0)+0.5,
    cRoomOffset[room]+band*(grid.z+2.0)+1.5+uv.z*(grid.z-1.0));
  return texture(cIrradiance,pixel/vec3(${CONTAINMENT_PROBE_ATLAS_WIDTH}.0,${CONTAINMENT_PROBE_ATLAS_HEIGHT}.0,${CONTAINMENT_PROBE_ATLAS_DEPTH}.0)).rgb;
}
vec3 containmentProbe(vec3 p,vec3 n,int room){
  vec3 uv=clamp((p-cRoomMin[room])/(cRoomMax[room]-cRoomMin[room]),0.0,1.0);
  vec3 irradiance=containmentProbeBand(uv,room,0.0);
  if(cDirectionalIrradiance>0.5){
    irradiance+=containmentProbeBand(uv,room,1.0)*n.x;
    irradiance+=containmentProbeBand(uv,room,2.0)*n.y;
    irradiance+=containmentProbeBand(uv,room,3.0)*n.z;
  }
  return max(irradiance,vec3(0.0));
}
vec3 containmentIndirect(vec3 n){
  vec3 p=cWorldPosition+n*0.22;
  int a,b;float blend;containmentRooms(p,a,b,blend);
  // Keep one sampling site for the interior and one for a doorway. Repeating
  // these functions in each return makes ANGLE inline four copies of the SH
  // interpolation into every material/light-layout program.
  if(blend>=1.0)a=b;
  vec3 irradiance=containmentProbe(p,n,a);
  if(blend>0.0&&blend<1.0)irradiance=mix(irradiance,containmentProbe(p,n,b),blend);
  return irradiance*cIndirectStrength;
}
vec3 containmentProjectedDirection(vec3 direction,int room){
  vec3 p=clamp(cWorldPosition,cRoomMin[room]+0.01,cRoomMax[room]-0.01);
  vec3 safeDirection=mix(vec3(-1.0),vec3(1.0),step(vec3(0.0),direction))*max(abs(direction),vec3(0.00001));
  vec3 exitDistance=max((cRoomMin[room]-p)/safeDirection,(cRoomMax[room]-p)/safeDirection);
  float travel=max(0.0,min(exitDistance.x,min(exitDistance.y,exitDistance.z)));
  return p+direction*travel-cRoomCapture[room];
}
`;

/** PMREM's five equal-sized CubeUV tiles share one atlas and one sampler.
 * Keep Three's pinned roughness convolution and face convention; adjust only
 * the lookup's vertical tile offset and the per-tile maximum mip level. */
function reflectionGLSL(tileHeight:number):string{
  const source=THREE.ShaderChunk.cube_uv_reflection_fragment;
  const start=source.indexOf('\tvec3 bilinearCubeUV(');
  const end=source.indexOf('\n\t#define cubeUV_r0',start);
  if(start<0||end<0)throw new Error('Unsupported Three.js CubeUV shader.');
  const bilinear=source.slice(start,end)
    .replace('bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt )','containmentBilinear( sampler2D envMap, vec3 direction, float mipInt, float room )')
    .replace('uv.y *= CUBEUV_TEXEL_HEIGHT;',`uv.y = uv.y / ${tileHeight*5}.0 + room / 5.0;`);
  return /* glsl */`
  #if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
  ${bilinear}
  vec3 containmentReflectionTile(vec3 direction,float roughness,int room){
    float mip=clamp(roughnessToMip(max(0.001,roughness)),cubeUV_m0,CUBEUV_MAX_MIP);
    float level=floor(mip);
    vec3 projected=containmentProjectedDirection(direction,room);
    vec3 a=containmentBilinear(envMap,projected,level,float(room));
    return mix(a,containmentBilinear(envMap,projected,min(level+1.0,CUBEUV_MAX_MIP),float(room)),fract(mip));
  }
  vec4 containmentRoomRadiance(vec3 direction,float roughness){
    int a,b;float blend;containmentRooms(cWorldPosition,a,b,blend);
    if(blend>=1.0)a=b;
    // One sampling site keeps ANGLE from expanding the CubeUV path twice.
    // Doorways still sample both rooms and blend in the original order.
    int roomCount=blend>0.0&&blend<1.0?2:1;
    vec3 radiance=vec3(0.0);
    for(int roomIndex=0;roomIndex<roomCount;roomIndex++){
      int room=roomIndex==0?a:b;
      vec3 sampleValue=containmentReflectionTile(direction,roughness,room);
      radiance=roomIndex==0?sampleValue:mix(radiance,sampleValue,blend);
    }
    return vec4(radiance,1.0);
  }
  #endif
  `;
}

export interface ContainmentRadianceUniforms {
  cIrradiance:THREE.IUniform<THREE.Data3DTexture>;
  cDirectionalIrradiance:THREE.IUniform<number>;
  cIndirectStrength:THREE.IUniform<number>;
}

export function installContainmentRadianceShader(material:THREE.MeshStandardMaterial,
  uniforms:ContainmentRadianceUniforms,tileHeight:number):void{
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  const maxMip=Math.log2(tileHeight/4);
  const tileWidth=3*Math.max(tileHeight/4,7*16);
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    Object.assign(shader.uniforms,layoutUniforms,uniforms);
    shader.fragmentShader=probeGLSL+'\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader
      // Reuse the physical shader's current view position, including morphs,
      // gel motion and instances. No extra varying or vertex program is needed.
      .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\ncWorldPosition=cameraPosition-transpose(mat3(viewMatrix))*vViewPosition;')
      .replace('#include <cube_uv_reflection_fragment>',`#undef CUBEUV_MAX_MIP\n#define CUBEUV_MAX_MIP ${maxMip.toFixed(1)}\n#undef CUBEUV_TEXEL_WIDTH\n#define CUBEUV_TEXEL_WIDTH ${(1/tileWidth).toPrecision(12)}\n#include <cube_uv_reflection_fragment>`)
      .replace('#include <envmap_common_pars_fragment>',`#include <envmap_common_pars_fragment>\n${reflectionGLSL(tileHeight)}`)
      .replace('#include <envmap_physical_pars_fragment>',THREE.ShaderChunk.envmap_physical_pars_fragment
        .replace('return PI * envMapColor.rgb * envMapIntensity;','return vec3( 0.0 );')
        .replace('textureCubeUV( envMap, envMapRotation * reflectVec, roughness )','containmentRoomRadiance( envMapRotation * reflectVec, roughness )'))
      .replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>\n#if defined(RE_IndirectDiffuse)\nirradiance+=containmentIndirect(transformNormalByInverseViewMatrix(geometryNormal,viewMatrix));\n#endif`);
  };
  material.customProgramCacheKey=()=>`${key}:containment-radiance-l1-v3`;
  material.needsUpdate=true;
}
