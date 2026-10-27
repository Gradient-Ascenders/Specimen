import {readFile} from 'node:fs/promises';
import {parseRoomThreeShell} from '../../src/render/environment/containment/RoomThreeShell.ts';

export async function loadRoomThreeShellFixture(){
  const bytes=await readFile(new URL('../../assets/environments/containment-room-three/room-three-laboratory.glb',import.meta.url));
  return parseRoomThreeShell(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
}
