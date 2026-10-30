import {fileURLToPath} from 'node:url';
import {expect,test} from '../../helpers/BrowserFixtures.ts';
for(const parallel of [true,false])test('clipping seeds restore rendering after context loss (parallel '+parallel+')',async({page})=>{
  test.setTimeout(180_000);
  const {build}=await import('vite');
  const result=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:fileURLToPath(new URL('../../helpers/ClippingRestorationProbe.ts',import.meta.url)),formats:['es']}}});
  const outputs=Array.isArray(result)?result:[result];
  const entry=outputs.flatMap(o=>'output'in o?o.output:[]).find(o=>o.type==='chunk'&&o.isEntry);
  if(!entry||entry.type!=='chunk')throw Error('No probe bundle');
  if(!parallel)await page.addInitScript(()=>{
    const original=WebGL2RenderingContext.prototype.getExtension as (name:string)=>unknown;
    WebGL2RenderingContext.prototype.getExtension=function(this:WebGL2RenderingContext,name:string){return name==='KHR_parallel_shader_compile'?null:original.call(this,name);} as WebGL2RenderingContext['getExtension'];
  });
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__readiness-probe',route=>route.fulfill({contentType:'text/html',body:'<script type="module">'+entry.code+'</script>'}));
  await page.goto('./__readiness-probe');
  await page.waitForFunction(()=>typeof(window as any).probeClippingRestoration==='function');
  const r=await page.evaluate(()=>(window as any).probeClippingRestoration());
  expect(r.gpu).toBeTruthy();expect(r.gpu).not.toMatch(/swiftshader|llvmpipe|software|warp/i);expect(r.lostContext).toBe(true);expect(r.restoredContext).toBe(true);
  expect(r.newIdentity).toBe(true);expect(r.after).toEqual(r.before);
  expect(r.before.some((v:number,i:number)=>i%4!==3&&v>0)).toBe(true);expect(r.error).toBe(0);expect(errors).toEqual([]);
});
