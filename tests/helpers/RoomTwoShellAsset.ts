import {readFile} from 'node:fs/promises';
import {parseRoomTwoShell} from '../../src/render/environment/containment/RoomTwoShell.ts';

export async function loadRoomTwoShellFixture(){
  const bytes=await readFile(new URL('../../assets/environments/containment-room-two/room-two-hall.glb',import.meta.url));
  return parseRoomTwoShell(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
}
