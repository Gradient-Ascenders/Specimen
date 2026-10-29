import * as THREE from 'three';
import { CULTIVATION_RADIANCE_LAYOUT as ZONES, CULTIVATION_ATLAS_WIDTH as WIDTH,
  CULTIVATION_ATLAS_HEIGHT as HEIGHT, CULTIVATION_ATLAS_DEPTH as DEPTH,
  CULTIVATION_ZONE_DEPTH, CULTIVATION_REFLECTION_COLUMNS as COLUMNS } from './CultivationRadianceLayout.ts';

let offset = 0;
const offsets = ZONES.map(zone => { const first = offset; offset += zone.grid[2] + 2; return first; });
// Immutable layout vectors already match WebGL storage; avoid flattening
// Vector3 arrays again for every material draw.
const layout = {
  cvMin: { value: new Float32Array(ZONES.flatMap(p => p.min)) },
  cvMax: { value: new Float32Array(ZONES.flatMap(p => p.max)) },
  cvGrid: { value: new Float32Array(ZONES.flatMap(p => p.grid)) },
  cvCapture: { value: new Float32Array(ZONES.flatMap(p => p.capture)) }, cvOffset: { value: offsets },
};
export interface CultivationRadianceUniforms {
  cvVolume: THREE.IUniform<THREE.Data3DTexture>;
  cvOrigin: THREE.IUniform<THREE.Vector3>;
  cvPower: THREE.IUniform<number[]>;
  cvDirectional: THREE.IUniform<number>;
  cvTime: THREE.IUniform<number>;
  cvLift: THREE.IUniform<number>;
  cvLiquidStrength: THREE.IUniform<number>;
  cvAtmosphere: THREE.IUniform<number>;
}

const probes = /* glsl */`
vec3 cvWorld;
uniform highp sampler3D cvVolume;
uniform vec3 cvOrigin;
uniform float cvPower[${ZONES.length}];
uniform float cvDirectional, cvTime, cvLift, cvLiquidStrength, cvAtmosphere;
uniform vec3 cvMin[${ZONES.length}], cvMax[${ZONES.length}], cvGrid[${ZONES.length}], cvCapture[${ZONES.length}];
uniform float cvOffset[${ZONES.length}];
void cultivationSewerZones(vec3 p,out int a,out int b,out float f){
  if(p.z<302.0){a=11;b=13;f=smoothstep(294.0,302.0,p.z);}
  else{a=13;b=14;f=smoothstep(336.0,344.0,p.z);}
}
void cultivationZones(inout vec3 p,out int a,out int b,out float f){
  a=10;b=10;f=0.0;
  if(p.z<51.0){a=0;b=1;f=smoothstep(49.0,51.0,p.z);return;}
  if(p.z<79.0){a=1;b=2;f=smoothstep(77.0,79.0,p.z);return;}
  if(p.z<124.0){a=2;b=p.y>12.0&&p.x>5.0?4:3;f=smoothstep(122.0,124.0,p.z);return;}
  if(p.z<152.0){a=p.y>12.0&&p.x>5.0?4:3;b=5;f=smoothstep(150.0,152.0,p.z);return;}
  if(p.z<227.5){a=5;b=6;f=smoothstep(226.5,227.5,p.z);return;}
  if(p.z<241.5){
    // The game keeps its deck stationary and scrolls the shaft. Query the
    // corresponding virtual descent height, without moving gameplay bodies.
    p.y+=cvLift*24.0;a=6;b=7;f=smoothstep(12.0,20.0,p.y);return;
  }
  // The return ramp spans x=23..27. Its old x=24 region boundary cut
  // through both the walkway and characters. Give the whole passage its
  // own volume, blending only across the doorway into the sewer.
  if(p.z>303.0&&p.z<370.0&&p.x>22.0&&p.x<30.5&&p.y<7.0){
    a=12;b=p.z<340.0?13:14;f=smoothstep(28.5,30.5,p.x);return;
  }
  if(p.x>29.5&&p.y<-.5){cultivationSewerZones(p,a,b,f);return;}
  // Service Junction: blend the lift-exit duct into the fork over the
  // physical entrance. A hard z=250.5 cutoff sliced floors and characters.
  // Fade sideways too, so the entrance lighting stays near its doorway.
  if(p.z<252.0){
    a=8;b=9;
    f=1.0-(1.0-smoothstep(249.0,252.0,p.z))*(1.0-smoothstep(1.0,2.5,abs(p.x)));
    return;
  }
  if(p.y<3.0&&(p.z<258.0||p.x>22.0||p.x< -10.0)){a=9;b=9;return;}
  a=10;b=10;
}
vec4 cultivationBand(vec3 uv,int zone,float band,float state){
  vec3 grid=cvGrid[zone];
  vec3 pixel=vec3(uv.x*(grid.x-1.0)+.5,band*9.0+uv.y*(grid.y-1.0)+.5,
    state*${CULTIVATION_ZONE_DEPTH}.0+cvOffset[zone]+1.5+uv.z*(grid.z-1.0));
  return texture(cvVolume,pixel/vec3(${WIDTH}.0,${HEIGHT}.0,${DEPTH}.0));
}
vec3 cultivationStateIrradiance(vec3 uv,vec3 n,int zone,float state){
  vec4 base=cultivationBand(uv,zone,0.0,state);
  // The bake premultiplies radiance by visibility validity. Trilinear
  // interpolation then excludes probes inside walls and machinery.
  vec3 energy=base.rgb;
  if(cvDirectional>.5){
    energy+=cultivationBand(uv,zone,1.0,state).rgb*n.x;
    energy+=cultivationBand(uv,zone,2.0,state).rgb*n.y;
    energy+=cultivationBand(uv,zone,3.0,state).rgb*n.z;
  }
  return max(energy/max(base.a,.025),vec3(0.0));
}
vec3 cultivationIndirect(vec3 n){
  vec3 p=cvWorld+n*.17;int a,b;float f;cultivationZones(p,a,b,f);
  if(f>=1.0)a=b;
  int zoneCount=f>0.0&&f<1.0?2:1;
  vec3 energy=vec3(0.0);
  for(int zoneIndex=0;zoneIndex<zoneCount;zoneIndex++){
    int zone=zoneIndex==0?a:b;
    vec3 uv=clamp((p-cvMin[zone])/(cvMax[zone]-cvMin[zone]),0.0,1.0);
    float power=clamp(cvPower[zone],0.0,1.0);
    int stateCount=power<.999?2:1;
    vec3 result=vec3(0.0);
    for(int stateIndex=0;stateIndex<stateCount;stateIndex++){
      vec3 sampleValue=cultivationStateIrradiance(uv,n,zone,float(stateIndex));
      result=stateIndex==0?sampleValue:mix(sampleValue,result,power);
    }
    energy=zoneIndex==0?result:mix(energy,result,f);
  }
  return energy;
}
vec3 cultivationLiquidBounce(vec3 n){
  if(cvLiquidStrength<=0.0)return vec3(0.0);
  float surface=0.2, strength=0.0;
  if(cvWorld.z>8.0&&cvWorld.z<50.0&&abs(cvWorld.x)<18.2)strength=.022;
  if(cvWorld.z>86.0&&cvWorld.z<123.0&&abs(cvWorld.x)<19.2)strength=.019;
  if(cvWorld.z>151.0&&cvWorld.z<223.0&&abs(cvWorld.x)<24.2)strength=.025;
  if(cvWorld.z>258.0&&cvWorld.z<322.0&&abs(cvWorld.x)<20.2)strength=.042;
  if(cvWorld.x>29.0&&cvWorld.x<51.0&&cvWorld.z>258.0&&cvWorld.z<382.0){surface=-12.5;strength=.032;}
  float height=cvWorld.y-surface;
  float proximity=step(0.02,height)*(1.0-smoothstep(.3,4.0,height));
  float facing=.2+.8*max(0.0,-n.y);
  vec2 q=cvWorld.xz*.75;
  float wave=sin(q.x+cvTime*.38+sin(q.y*.8-cvTime*.22))*sin(q.y*.9-cvTime*.3);
  float pattern=pow(.5+.5*wave,5.0);
  return vec3(.35,1.0,.09)*strength*proximity*facing*(.3+.7*pattern)*cvLiquidStrength;
}
vec3 cultivationProjected(vec3 direction,int zone,vec3 p){
  p=clamp(p,cvMin[zone]+.01,cvMax[zone]-.01);
  vec3 safe=mix(vec3(-1.0),vec3(1.0),step(vec3(0.0),direction))*max(abs(direction),vec3(.00001));
  vec3 distances=max((cvMin[zone]-p)/safe,(cvMax[zone]-p)/safe);
  float travel=max(0.0,min(distances.x,min(distances.y,distances.z)));
  return p+direction*travel-cvCapture[zone];
}
float cultivationMistLength(vec3 eye,vec3 p,vec3 lo,vec3 hi){
  vec3 delta=p-eye;float distance=length(delta);
  vec3 direction=delta/max(distance,.0001);
  vec3 inverse=mix(vec3(-1.0),vec3(1.0),step(vec3(0.0),direction))/max(abs(direction),vec3(.00001));
  vec3 first=(lo-eye)*inverse,last=(hi-eye)*inverse;
  vec3 entry=min(first,last),exit=max(first,last);
  float near=max(0.0,max(entry.x,max(entry.y,entry.z)));
  float far=min(distance,min(exit.x,min(exit.y,exit.z)));
  return max(0.0,far-near);
}
vec3 cultivationAtmosphere(vec3 colour){
  if(cvAtmosphere<=0.0)return colour;
  vec3 eye=cameraPosition-cvOrigin;
  float sewer=cultivationMistLength(eye,cvWorld,vec3(30.0,-12.0,258.0),vec3(50.0,-1.5,382.0));
  float chamber=cultivationMistLength(eye,cvWorld,vec3(-20.0,0.0,260.0),vec3(20.0,38.0,322.0));
  float sewerFog=1.0-exp(-sewer*.008*cvAtmosphere);
  float chamberFog=1.0-exp(-chamber*.004*cvAtmosphere);
  colour=mix(colour,vec3(.011,.009,.005),sewerFog);
  return mix(colour,vec3(.008,.012,.015)*(.65+.35*cvPower[10]),chamberFog);
}
`;

function reflections(tileWidth: number, tileHeight: number): string {
  const rows = Math.ceil(ZONES.length * 2 / COLUMNS), source = THREE.ShaderChunk.cube_uv_reflection_fragment;
  const start = source.indexOf('\tvec3 bilinearCubeUV('), end = source.indexOf('\n\t#define cubeUV_r0', start);
  if (start < 0 || end < 0) throw Error('Unsupported CubeUV shader.');
  const bilinear = source.slice(start, end)
    .replace('bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt )', 'cultivationBilinear( sampler2D envMap, vec3 direction, float mipInt, float tile )')
    .replace('uv.x *= CUBEUV_TEXEL_WIDTH;', `uv.x=(uv.x+mod(tile,${COLUMNS}.0)*${tileWidth}.0)/${tileWidth * COLUMNS}.0;`)
    .replace('uv.y *= CUBEUV_TEXEL_HEIGHT;', `uv.y=(uv.y+floor(tile/${COLUMNS}.0)*${tileHeight}.0)/${tileHeight * rows}.0;`);
  return /* glsl */`
  #if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
  ${bilinear}
  vec3 cultivationReflectionSample(vec3 projected,float roughness,float tile){
    float mip=clamp(roughnessToMip(max(.001,roughness)),cubeUV_m0,CUBEUV_MAX_MIP), level=floor(mip);
    return mix(cultivationBilinear(envMap,projected,level,tile),
      cultivationBilinear(envMap,projected,min(level+1.0,CUBEUV_MAX_MIP),tile),fract(mip));
  }
  vec4 cultivationRoomRadiance(vec3 direction,float roughness){
    vec3 p=cvWorld;int a,b;float f;cultivationZones(p,a,b,f);if(f>=1.0)a=b;
    // Runtime bounds keep one sampling body instead of inlining it once for
    // every zone/power combination. Preserve the original mix order.
    int zoneCount=f>0.0&&f<1.0?2:1;
    vec3 energy=vec3(0.0);
    for(int zoneIndex=0;zoneIndex<zoneCount;zoneIndex++){
      int zone=zoneIndex==0?a:b;
      vec3 projected=cultivationProjected(direction,zone,p);
      float power=clamp(cvPower[zone],0.0,1.0);
      int stateCount=power<.999?2:1;
      vec3 result=vec3(0.0);
      for(int stateIndex=0;stateIndex<stateCount;stateIndex++){
        vec3 sampleValue=cultivationReflectionSample(projected,roughness,float(zone+stateIndex*${ZONES.length}));
        result=stateIndex==0?sampleValue:mix(sampleValue,result,power);
      }
      energy=zoneIndex==0?result:mix(energy,result,f);
    }
    return vec4(energy,1.0);
  }
  #endif
  `;
}

export function installCultivationRadianceShader(material: THREE.MeshStandardMaterial,
  uniforms: CultivationRadianceUniforms, tileWidth: number, tileHeight: number): void {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    // Local-wear variants can delegate to another live material's hook. That
    // source may already have supplied this exact lighting owner to the shader.
    if (shader.uniforms.cvVolume === uniforms.cvVolume) return;
    Object.assign(shader.uniforms, layout, uniforms);
    shader.fragmentShader = probes + '\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\ncvWorld=cameraPosition-transpose(mat3(viewMatrix))*vViewPosition-cvOrigin;')
      .replace('#include <cube_uv_reflection_fragment>', `#undef CUBEUV_MAX_MIP\n#define CUBEUV_MAX_MIP ${Math.log2(tileHeight / 4).toFixed(1)}\n#undef CUBEUV_TEXEL_WIDTH\n#define CUBEUV_TEXEL_WIDTH ${(1 / tileWidth).toPrecision(12)}\n#include <cube_uv_reflection_fragment>`)
      .replace('#include <envmap_common_pars_fragment>', `#include <envmap_common_pars_fragment>\n${reflections(tileWidth, tileHeight)}`)
      .replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment
        .replace('return PI * envMapColor.rgb * envMapIntensity;', 'return vec3(0.0);')
        .replace('textureCubeUV( envMap, envMapRotation * reflectVec, roughness )', 'cultivationRoomRadiance( envMapRotation * reflectVec, roughness )'))
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        #if defined(RE_IndirectDiffuse)
        vec3 cvNormal=transformNormalByInverseViewMatrix(geometryNormal,viewMatrix);
        irradiance+=cultivationIndirect(cvNormal)+cultivationLiquidBounce(cvNormal);
        #endif`)
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb=cultivationAtmosphere(gl_FragColor.rgb);\n#include <tonemapping_fragment>');
  };
  material.customProgramCacheKey = () => `${key}:cultivation-radiance-v5`;
  material.needsUpdate = true;
}
