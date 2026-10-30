/** Strict manual native probe, including the original-main forced-loss limitation. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { captureBlackoutRehearsalRecovery } from '../../tests/helpers/BlackoutRehearsalRecovery.ts';
const output=resolve(process.argv[2]),url=process.argv[3]??'http://127.0.0.1:4173/';
await mkdir(output,{recursive:true});
const report={build:await(await fetch(new URL('build-manifest.json',url))).json(),runs:[]};
for(const profile of ['standard','high']){
  const browser=await chromium.launch({channel:'chrome',headless:false});
  try{const page=await browser.newPage({baseURL:url,viewport:{width:640,height:360}});page.setDefaultTimeout(300_000);
    const row=await captureBlackoutRehearsalRecovery(page,profile,true);report.runs.push({profile,...row});
    console.log(profile,JSON.stringify(row.result));
  }catch(error){report.runs.push({profile,failure:String(error.stack??error)});}
  finally{await browser.close();await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));}
}
for(const row of report.runs){assert(!row.failure);assert(!/swiftshader|llvmpipe|software|warp/i.test(row.result.gpu));assert.deepEqual(row.errors,[]);
  assert(Object.values(row.result.glErrors).every(error=>error===0),'Forced context recovery produced GL errors: '+JSON.stringify(row.result.glErrors));
  assert(row.result.lost&&row.result.restored&&row.result.restoredCamera&&row.result.cancellationCameraRestored);assert.equal(row.result.callbacks,1);assert.equal(row.result.state,'unloaded');}
