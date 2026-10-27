/** Authoring-only PNG of the existing runtime atlas; never loaded by the game. */
import {writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {createContainmentSecurityAtlas} from '../../../src/render/environment/containment/ContainmentProceduralTextures.ts';

const texture=createContainmentSecurityAtlas('Goop');
try{
  const {width,height,data}=texture.image;
  const rows=Buffer.alloc(height*(width*4+1));
  for(let y=0;y<height;y++)rows.set(data.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
  const chunk=(name:string,payload:Buffer)=>{
    const type=Buffer.from(name),content=Buffer.concat([type,payload]);let crc=0xffffffff;
    for(const byte of content){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    const size=Buffer.alloc(4),checksum=Buffer.alloc(4);
    size.writeUInt32BE(payload.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
    return Buffer.concat([size,content,checksum]);
  };
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  await writeFile(new URL('./security-preview.png',import.meta.url),Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0)),
  ]));
}finally{texture.dispose();}
