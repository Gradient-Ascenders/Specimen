import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {read as readKtx} from 'three/addons/libs/ktx-parse.module.js';
import {readRoomOneMaps} from '../../src/render/environment/containment/RoomOneShell.ts';

// Offline KTX2/UASTC -> BC7. Ship the native mip blocks in the same gzip-bank
// convention as the RGBA source, so gameplay needs no transcoder or worker.
const sourceUrl=new URL('../../assets/environments/containment-room-one/room-one-maps.bin',import.meta.url);
const outputUrl=new URL('../../assets/environments/containment-room-one/room-one-maps-bc7.bin',import.meta.url);
const manifestUrl=new URL('../../assets/environments/containment-room-one/room-one-maps-bc7.json',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=await readFile(sourceUrl),sourceSHA256=hash(source);
if(process.argv.includes('--check')){
  const manifest=JSON.parse(await readFile(manifestUrl,'utf8'));
  if(manifest.sourceSHA256!==sourceSHA256||manifest.outputSHA256!==hash(await readFile(outputUrl)))throw new Error('Room 1 compressed maps are stale. Regenerate with KTX-Software 4.4.2.');
  console.log('Room 1 compressed-map provenance verified.');
}else{
  const tool=process.env.SPECIMEN_KTX_BIN;
  if(!tool)throw new Error('Set SPECIMEN_KTX_BIN to the bin directory of KTX-Software 4.4.2.');
  const version=execFileSync(join(tool,'ktx'),['--version'],{encoding:'utf8'}).trim();
  if(!version.includes('4.4.2'))throw new Error('Use KTX-Software 4.4.2.');
  const work=await mkdtemp(join(tmpdir(),'specimen-bc7-'));
  try{
    const decoded=gunzipSync(source),maps=readRoomOneMaps(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength));
    const header=Buffer.alloc(8+maps.length*8);header.write('R1BC7001');
    const chunks=[header],records=[];
    for(let i=0;i<maps.length;i++){
      const {size,pixels}=maps[i],input=join(work,`${i}.pam`),uastc=join(work,`${i}-uastc.ktx2`),bc7=join(work,`${i}-bc7.ktx2`);
      await writeFile(input,Buffer.concat([Buffer.from(`P7\nWIDTH ${size}\nHEIGHT ${size}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`),pixels]));
      execFileSync(join(tool,'toktx'),['--t2','--encode','uastc','--uastc_quality','3','--zcmp','18','--genmipmap','--threads','2','--assign_oetf',i%3===0?'srgb':'linear','--assign_primaries',i%3===0?'bt709':'none','--target_type','RGB',uastc,input],{stdio:'inherit'});
      execFileSync(join(tool,'ktx'),['transcode','--target','bc7',uastc,bc7],{stdio:'inherit'});
      const ktx=readKtx(new Uint8Array(await readFile(bc7)));
      if(ktx.vkFormat!==(i%3===0?146:145)||ktx.supercompressionScheme!==0)throw new Error('Unexpected native BC7 output.');
      header.writeUInt32LE(size,8+i*8);header.writeUInt32LE(ktx.levels.length,12+i*8);
      for(const {levelData} of ktx.levels){const length=Buffer.alloc(4);length.writeUInt32LE(levelData.byteLength);chunks.push(length,Buffer.from(levelData));}
      records.push({size,levels:ktx.levels.length,bytes:ktx.levels.reduce((sum,l)=>sum+l.levelData.byteLength,0)});
    }
    const output=gzipSync(Buffer.concat(chunks),{level:9});await writeFile(outputUrl,output);
    await writeFile(manifestUrl,JSON.stringify({sourceSHA256,outputSHA256:hash(output),encoder:version,encoding:'KTX2 UASTC quality 3, native BC7, complete mip chain, gzip 9',maps:records},null,2)+'\n');
    console.log(`Room 1 BC7: ${output.length} transfer bytes, ${records.reduce((s,m)=>s+m.bytes,0)} mip bytes.`);
  }finally{await rm(work,{recursive:true,force:true});}
}
