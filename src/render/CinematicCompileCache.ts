import * as THREE from 'three';
import { clonePrewarmDrawable } from './ShadowPrewarmMaterial.ts';

interface PreparedDrawable { context:string; geometry:string; materials:readonly string[]; }
/** Preparation-local cache. Every shot still draws/initializes its resources;
 * only unchanged compiler submissions are skipped. Discard on settings/reload. */
export class CinematicCompileCache {
  private readonly prepared=new WeakMap<THREE.Object3D,PreparedDrawable>();
  readonly diagnostics={submitted:0,reused:0};
  async compile(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera):Promise<void>{
    const lights:Record<string,number>={};
    scene.traverseVisible(object=>{
      if(object instanceof THREE.Light&&object.layers.test(camera.layers)){
        const key=object.type+':'+object.castShadow;
        lights[key]=(lights[key]??0)+1;
      }
    });
    const context=JSON.stringify([lights,scene.fog?.constructor.name,scene.environment?.uuid,
      scene.environment?.mapping,scene.overrideMaterial?.uuid,renderer.outputColorSpace,renderer.toneMapping,
      renderer.shadowMap.enabled,renderer.shadowMap.type,renderer.localClippingEnabled,renderer.clippingPlanes.length,
      camera instanceof THREE.PerspectiveCamera]);
    const group=new THREE.Group(),disposers:(()=>void)[]=[],pending:{object:THREE.Object3D;key:PreparedDrawable}[]=[];
    // Most props borrow a small shared finish bank. Fingerprint each finish
    // once per shot instead of serializing it again for every mesh that uses it.
    const materialKeys=new Map<THREE.Material,string>();
    const materialKey=(value:THREE.Material):string=>{
      const cached=materialKeys.get(value);if(cached!==undefined)return cached;
      // Primitive properties include feature toggles, shader source, version
      // and precision. Uniform values/colours do not select programs.
      const fields=Object.entries(value).filter(([,v])=>v===null||['string','number','boolean'].includes(typeof v)||v instanceof THREE.Texture)
        .map(([k,v])=>[k,v instanceof THREE.Texture?[v.uuid,v.mapping,v.channel,v.colorSpace]:v]);
      const key=JSON.stringify([fields,value.customProgramCacheKey(),(value as THREE.ShaderMaterial).defines,value.clippingPlanes?.length]);
      materialKeys.set(value,key);return key;
    };
    // A cinematic primer owns a concrete shot. Hidden rooms/actors are warmed
    // by their level preparation, and must not be recompiled under this shot's
    // fog/environment overrides. Later visible shots acquire their own entry.
    scene.traverseVisible(object=>{
      if(!(object instanceof THREE.Mesh||object instanceof THREE.Line||object instanceof THREE.Points||object instanceof THREE.Sprite))return;
      if(!object.layers.test(camera.layers)||[object.material].flat().every(material=>!material.visible))return;
      const material=[object.material].flat().map(materialKey);
      const geometry:THREE.BufferGeometry|undefined='geometry'in object?object.geometry:undefined;
      const geometryKey=JSON.stringify([object.type,object.receiveShadow,geometry?.uuid,
        geometry&&Object.entries(geometry.attributes).map(([name,a])=>[name,a.itemSize,a.normalized]),
        geometry&&Object.entries(geometry.morphAttributes).map(([name,a])=>[name,a.length]),
        object instanceof THREE.InstancedMesh&&!!object.instanceColor,
        object instanceof THREE.InstancedMesh&&!!object.morphTexture]);
      const previous=this.prepared.get(object);
      if(previous?.context===context&&previous.geometry===geometryKey&&previous.materials.length===material.length&&
        material.every((value,i)=>value===previous.materials[i])){this.diagnostics.reused++;return;}
      const key={context,geometry:geometryKey,materials:material};
      group.add(clonePrewarmDrawable(object,disposers));pending.push({object,key});
    });
    try{
      if(pending.length){
        await renderer.compileAsync(group,camera,scene);
        for(const {object,key}of pending)this.prepared.set(object,key);
        this.diagnostics.submitted+=pending.length;
      }
    }finally{group.clear();for(const dispose of disposers)dispose();}
  }
}
