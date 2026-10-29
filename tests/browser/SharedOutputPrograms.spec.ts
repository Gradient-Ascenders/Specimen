import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {expect,test} from './fixtures.ts';

test('shared output programs preserve screen, linear, transmission, shadows, blending and exposure',async({page},info)=>{
  test.setTimeout(180_000);
  let source:string;
  if(process.env.OUTPUT_PROBE_BUNDLE)source=await readFile(process.env.OUTPUT_PROBE_BUNDLE,'utf8');
  else {
    const {build}=await import('vite');
    const result=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,
      lib:{entry:fileURLToPath(new URL('../helpers/SharedOutputProbe.ts',import.meta.url)),formats:['es']}}});
    const outputs=Array.isArray(result)?result:[result];
    const entry=outputs.flatMap(output=>'output'in output?output.output:[]).find(output=>output.type==='chunk'&&output.isEntry);
    if(!entry||entry.type!=='chunk')throw Error('No output probe bundle');
    source=entry.code;
  }
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/__shared-output-probe',route=>route.fulfill({contentType:'text/html',body:`<script type="module">${source}</script>`}));
  await page.goto('/__shared-output-probe');
  await page.waitForFunction(()=>typeof(window as any).probeSharedOutput==='function');
  const result=await page.evaluate(()=>(window as any).probeSharedOutput());
  await writeFile(info.outputPath('output-comparison.json'),JSON.stringify(result,null,2));
  await info.attach('output-comparison',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  for(const [name,difference]of Object.entries(result.differences)) {
    expect((difference as any).max,name).toBeLessThanOrEqual(1);
    expect((difference as any).mean,name).toBeLessThan(.01);
  }
  expect(result.before.error).toBe(0);expect(result.after.error).toBe(0);
  expect(result.after.afterLinear).toBe(result.after.programs);
  expect(result.after.programs).toBeLessThan(result.before.afterLinear);
  expect(result.after.invalidRejected).toBe(true);
  expect(errors).toEqual([]);
});
