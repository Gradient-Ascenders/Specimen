/** Observes existing allocation/disposal only; no GL queries or retained GL/Three owners. */
export function installTextureOwnershipTrace(){
  const rows=[],handles=new WeakMap(),targets=new WeakMap();let context=[];
  const proto=WebGL2RenderingContext.prototype;
  for(const [create,remove,kind]of [['createTexture','deleteTexture','texture'],['createRenderbuffer','deleteRenderbuffer','renderbuffer']]){
    const original=proto[create],del=proto[remove];
    proto[create]=function(...args){const handle=original.apply(this,args);if(handle){const row={id:rows.length,kind,phase:window.__textureOwnership?.phase,created:performance.now(),context:structuredClone(context),stack:new Error().stack};handles.set(handle,row);rows.push(row);}return handle;};
    proto[remove]=function(handle){const row=handle&&handles.get(handle);if(row)row.deleted=performance.now();return del.call(this,handle);};
  }
  const trace=window.__textureOwnership={rows,targetRows:[],tagRuntime(runtime){for(const name of ['researchFinale','defeatFinale']){const owner=runtime.resources?.[name];if(!owner||owner.__tagged)continue;owner.__tagged=true;const original=owner.primePresentationFrames;owner.primePresentationFrames=async function(...args){const previous=trace.phase;trace.phase=name;try{return await original.apply(this,args);}finally{trace.phase=previous;}};}},attach(renderer){
    if(renderer.__textureObserved)return;renderer.__textureObserved=true;
    const original=renderer.setRenderTarget,render=renderer.render;
    renderer.render=function(scene,camera){const prior=context;context=[...context,{scene:scene.name||scene.uuid,camera:camera.uuid}];try{return render.call(this,scene,camera);}finally{context=prior;}};
    renderer.setRenderTarget=function(target,...args){
      let id;if(target){id=targets.get(target);if(id===undefined){id=trace.targetRows.length;targets.set(target,id);trace.targetRows.push({id,phase:trace.phase,created:performance.now(),context:structuredClone(context),name:target.texture?.name,width:target.width,height:target.height,samples:target.samples});target.addEventListener('dispose',()=>{trace.targetRows[id].disposed=performance.now();});}}
      const prior=context;context=[...context,{target:id}];
      try{return original.call(this,target,...args);}finally{
        if(target)for(const texture of [...(target.textures??[target.texture]),target.depthTexture].filter(Boolean)){
          const properties=this.properties.get(texture),row=handles.get(properties?.__webglTexture);
          if(row){row.target=id;row.textureName=texture.name;row.width=target.width;row.height=target.height;row.type=texture.type;row.format=texture.format;}
        }
        context=prior;
      }
    };
  },snapshot(){return {at:performance.now(),live:rows.filter(r=>!r.deleted).map(r=>r.id),targets:structuredClone(trace.targetRows),allocations:structuredClone(rows)};}};
}
