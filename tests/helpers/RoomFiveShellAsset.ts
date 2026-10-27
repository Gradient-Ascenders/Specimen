import {readFile} from 'node:fs/promises';
import {parseRoomFiveShell} from '../../src/render/environment/containment/RoomFiveShell.ts';
export async function loadRoomFiveShellFixture(){
  const bytes=await readFile(new URL('../../assets/environments/containment-room-five/room-five-atrium.glb',import.meta.url));
  return parseRoomFiveShell(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
}
