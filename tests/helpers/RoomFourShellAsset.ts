import {readFile} from 'node:fs/promises';
import {parseRoomFourShell} from '../../src/render/environment/containment/RoomFourShell.ts';
export async function loadRoomFourShellFixture(){
  const bytes=await readFile(new URL('../../assets/environments/containment-room-four/room-four-lift.glb',import.meta.url));
  return parseRoomFourShell(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
}
