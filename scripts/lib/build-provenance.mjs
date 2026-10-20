import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export function createBuildMetadata() {
  return {sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    dirty:execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim()!=='',
    builtAt:new Date().toISOString()};
}
export function buildManifestPlugin(build) {
  return {name:'qualification-build-manifest', async writeBundle(options) {
    const root=path.resolve(options.dir ?? 'dist'),assetHashes={};
    const visit=async directory=>{
      for (const entry of await readdir(directory,{withFileTypes:true})) {
        const file=path.join(directory,entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (entry.name!=='build-manifest.json')
          assetHashes[path.relative(root,file).replaceAll('\\','/')]=createHash('sha256').update(await readFile(file)).digest('hex');
      }
    };
    await visit(root);
    await writeFile(path.join(root,'build-manifest.json'),JSON.stringify({...build,assetHashes},null,2));
  }};
}
