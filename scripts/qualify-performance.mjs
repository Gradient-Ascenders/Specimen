import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {evaluateQualification} from './lib/performance-qualification.mjs';

const [input,budgetFile='docs/evidence/198/proposed-budgets.json',output='artifacts/qualification-results.json']=process.argv.slice(2);
if (!input) throw new Error('Usage: node scripts/qualify-performance.mjs intake.json [budgets.json] [output.json]');
let result;
try {
  const root=path.dirname(path.resolve(input));
  const resolve=name=>{
    if (typeof name!=='string' || !name) throw new Error('Missing evidence filename.');
    const file=path.resolve(root,name);
    if (!file.startsWith(root+path.sep)) throw new Error('Evidence must stay inside the intake folder.');
    return file;
  };
  const json=async file=>{
    const bytes=await readFile(file);
    if (bytes.length>64*1024*1024) throw new Error('Evidence file exceeds 64 MiB.');
    return JSON.parse(file.endsWith('.gz') ? gunzipSync(bytes,{maxOutputLength:64*1024*1024}).toString() : bytes.toString());
  };
  const hash=async file=>{const h=createHash('sha256');for await (const chunk of createReadStream(file)) h.update(chunk);return h.digest('hex');};
  const intake=await json(path.resolve(input)),budgets=await json(path.resolve(budgetFile));
  intake.buildManifest=await json(resolve(intake.buildManifestFile));
  const captures=[];
  for (const capture of intake.captures ?? []) {
    const file=resolve(capture.file);
    captures.push({...capture,flight:await json(file),sha256:await hash(file)});
  }
  const attachmentHashes={};
  for (const name of intake.attachments ?? []) attachmentHashes[name]=await hash(resolve(name));
  result={...evaluateQualification(intake,budgets,captures),
    intakeSha256:await hash(path.resolve(input)),budgetSha256:await hash(path.resolve(budgetFile)),
    captureHashes:Object.fromEntries(captures.map(c=>[c.file,c.sha256])),attachmentHashes};
} catch(error) {
  result={schema:'specimen-performance-qualification',schemaVersion:1,status:'unqualified',reasons:[error.message]};
}
await mkdir(path.dirname(path.resolve(output)),{recursive:true});
await writeFile(output,JSON.stringify(result,null,2));
console.log(`${result.status}: ${output}`);
for (const reason of result.reasons) console.log(`- ${reason}`);
process.exitCode=result.status==='pass'?0:result.status==='fail'?1:2;
