import * as THREE from 'three';
import { SharedOutputPrograms } from '../../src/render/SharedOutputPrograms.ts';
import { ProgramCompilation } from '../../src/render/ProgramCompilation.ts';

async function capture(shared: boolean) {
  const renderer = new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:true});
  renderer.setSize(384,256); renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.NeutralToneMapping; renderer.toneMappingExposure=1.2;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
  const output=shared ? new SharedOutputPrograms(renderer) : undefined;
  const clipping=shared ? new ProgramCompilation(renderer) : undefined;
  renderer.localClippingEnabled=true;
  const scene=new THREE.Scene(); scene.background=new THREE.Color(.018,.045,.08);
  const camera=new THREE.PerspectiveCamera(48,384/256,.1,100); camera.position.set(0,1.2,6); camera.lookAt(0,0,0);
  const key=new THREE.SpotLight(0xffe2b2,75,30,.8,.3); key.position.set(2,4,3); key.castShadow=true; key.shadow.mapSize.set(128,128); scene.add(key,key.target);
  scene.add(new THREE.HemisphereLight(0xa2ccff,0x1c1730,1.1));
  const sphere=new THREE.SphereGeometry(.8,32,16), plane=new THREE.PlaneGeometry(12,12);
  const gel=new THREE.MeshPhysicalMaterial({color:0x5bd4d8,roughness:.2,clearcoat:.85,clearcoatRoughness:.14,transmission:.68,thickness:.5});
  const opaque=new THREE.MeshStandardMaterial({color:0xb05824,roughness:.38,metalness:.2});
  opaque.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,1,0),.7)];opaque.clipIntersection=true;opaque.clipShadows=true;
  const unmapped=new THREE.MeshBasicMaterial({color:0x68b4ff,toneMapped:false});
  const translucent=new THREE.MeshStandardMaterial({color:0xf5882c,emissive:0xa52b06,emissiveIntensity:.3,transparent:true,opacity:.45,side:THREE.DoubleSide});
  for(const [i,material]of [gel,opaque,unmapped,translucent].entries()) {
    const mesh=new THREE.Mesh(sphere,material); mesh.position.set((i-1.5)*1.25,i===3?.4:0,i===0?.4:0); mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
  }
  const floor=new THREE.Mesh(plane,opaque);floor.rotation.x=-Math.PI/2;floor.position.y=-.85;floor.receiveShadow=true;scene.add(floor);
  const target=new THREE.WebGLRenderTarget(384,256);
  const read=()=>{
    const pixels=new Uint8Array(384*256*4);
    if(renderer.getRenderTarget())renderer.readRenderTargetPixels(target,0,0,384,256,pixels);
    else renderer.getContext().readPixels(0,0,384,256,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);
    return Array.from(pixels);
  };
  const samples: Record<string,number[]>={};
  try {
    await renderer.compileAsync(scene,camera);
    renderer.render(scene,camera);samples.screen=read();const programs=renderer.info.programs!.length;
    renderer.setRenderTarget(target);renderer.render(scene,camera);samples.linear=read();
    const afterLinear=renderer.info.programs!.length;
    renderer.setRenderTarget(null);renderer.render(scene,camera);samples.restored=read();
    renderer.toneMappingExposure=.73;scene.background.setRGB(.08,.03,.01);
    renderer.render(scene,camera);samples.exposure=read();
    // Same material on consecutive target switches must receive the new mode.
    for(const child of scene.children)if(child instanceof THREE.Mesh)child.visible=child===floor;
    renderer.render(scene,camera);samples.single=read();
    renderer.setRenderTarget(target);renderer.render(scene,camera);samples.singleLinear=read();
    renderer.setRenderTarget(null);renderer.render(scene,camera);samples.singleRestored=read();
    const hook=opaque.onBeforeCompile, cacheKey=opaque.customProgramCacheKey();
    opaque.onBeforeCompile=function(shader,renderer){hook.call(this,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb *= vec3(0.8,1.0,0.7);\n#include <tonemapping_fragment>');};
    opaque.customProgramCacheKey=()=>cacheKey+':late-hook';opaque.needsUpdate=true;
    renderer.render(scene,camera);samples.lateHook=read();
    // Rebuild context-owned caches while retaining the same live materials,
    // hooks, clipping planes and output mode, as recovery does in the game.
    await new Promise<void>(resolve=>{
      renderer.domElement.addEventListener('webglcontextrestored',()=>resolve(),{once:true});
      renderer.domElement.addEventListener('webglcontextlost',event=>{
        event.preventDefault();setTimeout(()=>renderer.forceContextRestore(),50);
      },{once:true});
      renderer.forceContextLoss();
    });
    await renderer.compileAsync(scene,camera);
    renderer.render(scene,camera);samples.contextRestored=read();
    renderer.localClippingEnabled=false;
    await renderer.compileAsync(scene,camera);
    renderer.render(scene,camera);samples.clippingDisabled=read();
    // Three's default cache key tracks hook changes without an explicit key.
    // Preserve that behavior for hooks installed after an earlier render.
    unmapped.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>', 'gl_FragColor.rgb *= vec3(.5,1.0,.8);\n#include <colorspace_fragment>');};
    unmapped.needsUpdate=true;
    for(const child of scene.children)if(child instanceof THREE.Mesh&&child.material===unmapped)child.visible=true;
    renderer.render(scene,camera);samples.defaultHookKey=read();
    let invalidRejected=false;
    if(shared){
      const gl=renderer.getContext(),shader=gl.createShader(gl.VERTEX_SHADER)!,program=gl.createProgram()!;
      gl.shaderSource(shader,'invalid shader syntax');gl.compileShader(shader);gl.attachShader(program,shader);gl.linkProgram(program);
      try{gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);}catch(error){invalidRejected=/Shader preparation failed/.test(String(error));}
      gl.deleteShader(shader);gl.deleteProgram(program);
    }
    return {samples,programs,afterLinear,error:renderer.getContext().getError(),invalidRejected};
  } finally {
    target.dispose(); sphere.dispose();plane.dispose();for(const material of [gel,opaque,unmapped,translucent])material.dispose();
    key.shadow.dispose();clipping?.dispose();output?.dispose();renderer.dispose();renderer.forceContextLoss();
  }
}

(window as Window & {probeSharedOutput?:()=>Promise<unknown>}).probeSharedOutput=async()=>{
  const before=await capture(false),after=await capture(true),differences: Record<string,unknown>={};
  for(const [name,pixels]of Object.entries(before.samples)) {
    let max=0,changed=0,total=0;
    for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-after.samples[name][i]);max=Math.max(max,d);total+=d;if(d)changed++;}
    differences[name]={max,changed,mean:total/pixels.length};
  }
  return {differences,before:{programs:before.programs,afterLinear:before.afterLinear,error:before.error},after:{programs:after.programs,afterLinear:after.afterLinear,error:after.error,invalidRejected:after.invalidRejected}};
};
