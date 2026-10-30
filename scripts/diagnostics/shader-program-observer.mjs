/** Browser-only observer, serialized by Playwright. Never issues readiness queries
 * or changes shaders, cache keys, compile order, draw order, or readiness gates. */
export function installShaderProgramObserver() {
  const clock = () => performance.now();
  const handles = new WeakMap(), shaderHandles = new WeakMap();
  const programs = [], shaders = [], calls = [], sources = [];
  const sourceIds = new Map();
  let currentCall;
  const proto = WebGL2RenderingContext.prototype;
  const wrap = (name, observe) => {
    const original = proto[name];
    proto[name] = function (...args) {
      const start = clock(), result = original.apply(this, args), end = clock();
      observe(args, result, start, end);
      return result;
    };
  };
  const aggregate = (row, key, start, end) => {
    const stat = row[key] ??= {count:0, ms:0, maxMs:0, first:start};
    stat.count++; stat.ms += end-start; stat.maxMs = Math.max(stat.maxMs,end-start); stat.last=end;
    return stat;
  };
  wrap('createProgram', (_, handle, start, end) => {
    const row={id:programs.length,created:start,createMs:end-start,call:currentCall,shaders:[],bindings:[]};
    programs.push(row); handles.set(handle,row);
  });
  wrap('createShader', ([type], handle, start) => {
    const row={id:shaders.length,type,created:start}; shaders.push(row); shaderHandles.set(handle,row);
  });
  wrap('shaderSource', ([handle,source]) => {
    if(!sourceIds.has(source)){sourceIds.set(source,sources.length);sources.push(source);}
    shaderHandles.get(handle).source=sourceIds.get(source);
  });
  wrap('compileShader', ([handle], _, start, end) => aggregate(shaderHandles.get(handle),'compile',start,end));
  wrap('attachShader', ([program,shader]) => handles.get(program).shaders.push(shaderHandles.get(shader).id));
  wrap('bindAttribLocation', ([program,index,name]) => handles.get(program).bindings.push({index,name}));
  wrap('transformFeedbackVaryings', ([program,varyings,mode]) => {handles.get(program).feedback={varyings,mode};});
  wrap('linkProgram', ([handle], _, start, end) => aggregate(handles.get(handle),'link',start,end));
  wrap('getProgramParameter', ([handle,parameter], result, start, end) => {
    const row=handles.get(handle); if(!row)return;
    const stat=aggregate(row,`query${parameter}`,start,end);
    if(parameter===0x91b1){if(result)stat.firstTrue??=end;else stat.lastFalse=end;}
    if(parameter===0x8b82)stat.result=!!result;
  });
  for(const name of ['getActiveUniform','getUniformLocation','getActiveAttrib','getAttribLocation','getUniformBlockIndex','useProgram'])
    wrap(name, ([handle], _, start, end) => {const row=handles.get(handle);if(row)aggregate(row,name,start,end);});
  wrap('deleteProgram', ([handle], _, start) => {const row=handles.get(handle);if(row)row.deleted=start;});
  const remember = (program, material, object, call) => {
    const row=handles.get(program?.program); if(!row)return;
    row.key=program.cacheKey;row.name=program.name;row.type=program.type;
    row.materials??={};
    const key=material.uuid+':'+object.type;
    row.materials[key]??={name:material.name,type:material.type,object:object.name,objectType:object.type,
      side:material.side,transparent:material.transparent,clipping:material.clippingPlanes?.length??0,
      transmission:material.transmission??0,first:clock(),call};
  };
  window.__shaderTrace={
    attach(renderer) {
      if(renderer.__shaderObserved)return;renderer.__shaderObserved=true;
      const compile=renderer.compile;
      renderer.compile=function(scene,camera,targetScene){
        const parent=currentCall, call={id:calls.length,start:clock(),name:scene.name,target:!!this.getRenderTarget(),objects:0,materials:0};
        calls.push(call);currentCall=call.id;
        const before=programs.length;
        try{return compile.call(this,scene,camera,targetScene);}
        finally{
          call.end=clock();call.created=programs.length-before;currentCall=parent;
          const seen=new Set();
          scene.traverse(object=>{if(!object.material)return;call.objects++;
            for(const material of [object.material].flat()){
              seen.add(material);
              for(const program of this.properties.get(material).programs?.values()??[])remember(program,material,object,call.id);
            }
          });call.materials=seen.size;
        }
      };
      const direct=renderer.renderBufferDirect;
      renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
        const result=direct.call(this,camera,scene,geometry,material,object,group);
        const program=this.properties.get(material).currentProgram, row=handles.get(program?.program);
        if(row){row.draws=(row.draws??0)+1;row.firstDraw??=clock();row.lastDraw=clock();
          remember(program,material,object,currentCall);
        }
        return result;
      };
    },
    async snapshot(){
      const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
      const sourceHashes=await Promise.all(sources.map(hash));
      return {programs:structuredClone(programs),shaders:structuredClone(shaders),calls:structuredClone(calls),
        sources:Object.fromEntries(sources.map((source,i)=>[sourceHashes[i],source])),sourceHashes};
    },
  };
}
