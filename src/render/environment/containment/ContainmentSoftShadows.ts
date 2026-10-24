import * as THREE from 'three';

/** One hero source per room. Negative radius encodes the finite far plane in
 * the raw-depth shader; all selected perspective cameras share near=.35m.
 * Other sources keep bounded PCF. No companion maps or extra shadow passes. */
export const CONTAINMENT_PCSS_SOURCES=new Set([
  'room-1-pedestal-soft-key','room-2-lower-route-light',
  'room-3-industrial-route-received-light','room-4-middle-escalation-received-light',
  'room-5-safe-entry-received-light',
]);

const rawShadowGLSL=/* glsl */`
  #else // SHADOWMAP_TYPE_BASIC: Containment High raw-depth PCF / PCSS
    vec2 cShadowDisk(int index,int count,float phase){
      float radius=sqrt((float(index)+0.5)/float(count));
      float theta=float(index)*2.39996323+phase;
      return radius*vec2(cos(theta),sin(theta));
    }
    float cShadowCompare(sampler2D map,vec2 uv,float depth,vec2 size){
      // Bilinear depth comparisons preserve the existing smooth PCF on lamps
      // that are not selected for contact hardening.
      vec2 pixel=uv*size-0.5;
      vec2 f=fract(pixel),base=(floor(pixel)+0.5)/size,texel=1.0/size;
      float a=step(depth,texture2D(map,base).r);
      float b=step(depth,texture2D(map,base+vec2(texel.x,0.0)).r);
      float c=step(depth,texture2D(map,base+vec2(0.0,texel.y)).r);
      float d=step(depth,texture2D(map,base+texel).r);
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
    }
    float cShadowLinearDepth(float depth,float farPlane){
      return 0.35*farPlane/max(farPlane-depth*(farPlane-0.35),0.00001);
    }
    float getShadow(sampler2D map,vec2 size,float intensity,float bias,float radius,vec4 projected){
      vec3 coord=projected.xyz/projected.w;
      coord.z+=bias;
      if(any(lessThan(coord,vec3(0.0)))||any(greaterThan(coord,vec3(1.0))))return 1.0;
      float phase=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))))*6.2831853;
      float visibility=0.0;
      if(radius>=0.0){
        // Four weighted comparisons for small/non-hero lamps. Reserve the
        // blocker search and wider filtering budget for the room's key light.
        return mix(1.0,cShadowCompare(map,coord.xy,coord.z,size),intensity);
      }
      float receiver=cShadowLinearDepth(coord.z,-radius);
      float blockers=0.0,blockerDepth=0.0;
      vec2 searchRadius=min(vec2(0.035),12.0/size);
      // Bounded blocker search followed by a receiver/blocker separation
      // estimate. Perspective depth must be linearised before this ratio.
      for(int sampleIndex=0;sampleIndex<8;sampleIndex++){
        float depth=texture2D(map,coord.xy+cShadowDisk(sampleIndex,8,phase)*searchRadius).r;
        if(depth<coord.z){blockerDepth+=cShadowLinearDepth(depth,-radius);blockers+=1.0;}
      }
      if(blockers<0.5)return 1.0;
      float blocker=blockerDepth/blockers;
      float penumbra=0.035*max(0.0,receiver-blocker)/max(blocker,0.35);
      vec2 filterRadius=clamp(vec2(penumbra),0.65/size,10.0/size);
      for(int sampleIndex=0;sampleIndex<12;sampleIndex++){
        vec2 uv=coord.xy+cShadowDisk(sampleIndex,12,phase)*filterRadius;
        visibility+=step(coord.z,texture2D(map,uv).r);
      }
      return mix(1.0,visibility/12.0,intensity);
    }
`;

const shadowChunk=THREE.ShaderChunk.shadowmap_pars_fragment;
const start=shadowChunk.search(/\n\t#else[^\n]*\n\s*float getShadow\( sampler2D shadowMap/);
const pointStart=shadowChunk.indexOf('\n\t#if NUM_POINT_LIGHT_SHADOWS',start);
const end=shadowChunk.lastIndexOf('\n\t#endif',pointStart);
if(start<0||end<0)throw new Error('Unsupported Three.js shadow shader.');
const softShadowChunk=shadowChunk.slice(0,start)+rawShadowGLSL+shadowChunk.slice(end);
const installed=new WeakSet<THREE.Material>();

export function installContainmentSoftShadows(material:THREE.Material):void{
  if(installed.has(material))return;installed.add(material);
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',softShadowChunk);
  };
  material.customProgramCacheKey=()=>`${key}:containment-pcss-v1`;
  material.needsUpdate=true;
}

export function setContainmentSoftShadowQuality(root:THREE.Object3D,enabled:boolean):void{
  root.traverse(object=>{
    if(!(object instanceof THREE.SpotLight)||!CONTAINMENT_PCSS_SOURCES.has(object.name))return;
    if(object.shadow.camera.near!==.35){object.shadow.camera.near=.35;object.shadow.camera.updateProjectionMatrix();object.shadow.needsUpdate=true;}
    object.shadow.radius=enabled?-object.distance:1.5;
  });
}
