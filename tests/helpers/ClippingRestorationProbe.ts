import * as THREE from 'three';
import {SharedOutputPrograms} from '../../src/render/SharedOutputPrograms.ts';
import {ProgramCompilation} from '../../src/render/ProgramCompilation.ts';

(window as any).probeClippingRestoration=async()=>{
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
  renderer.setSize(32,32);renderer.localClippingEnabled=true;
  const output=new SharedOutputPrograms(renderer),compilation=new ProgramCompilation(renderer);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,10);camera.position.z=3;
  const geometry=new THREE.PlaneGeometry(1,1),plain=new THREE.MeshBasicMaterial({color:0xff0000});
  const clipped=new THREE.MeshBasicMaterial({color:0x00ff00,clippingPlanes:Array.from({length:6},()=>new THREE.Plane(new THREE.Vector3(1,0,0),-.7)),clipIntersection:true});
  const a=new THREE.Mesh(geometry,plain),b=new THREE.Mesh(geometry,clipped);a.position.x=-.7;b.position.x=.7;scene.add(a,b);
  const gl=renderer.getContext() as WebGL2RenderingContext;
  const extension=gl.getExtension('WEBGL_lose_context');if(!extension)throw Error('Context-loss probe extension unavailable');
  const pixels=()=>{const data=new Uint8Array(32*32*4);gl.readPixels(0,0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,data);return Array.from(data);};
  const program=()=>(renderer.properties.get(clipped) as {currentProgram:{program:WebGLProgram}}).currentProgram.program;
  try{
    await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
    const before=pixels(),old=program();
    const lost=new Promise<void>(resolve=>renderer.domElement.addEventListener('webglcontextlost',()=>resolve(),{once:true}));
    extension.loseContext();await lost;const lostContext=gl.isContextLost();
    const restored=new Promise<void>(resolve=>renderer.domElement.addEventListener('webglcontextrestored',()=>resolve(),{once:true}));
    await new Promise(resolve=>setTimeout(resolve,100));extension.restoreContext();await restored;
    const restoredContext=!gl.isContextLost();
    await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
    const debug=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:debug&&gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),lostContext,restoredContext,newIdentity:program()!==old,before,after:pixels(),error:gl.getError()};
  }finally{compilation.dispose();output.dispose();geometry.dispose();plain.dispose();clipped.dispose();renderer.dispose();}
};
