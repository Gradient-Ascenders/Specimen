import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {parseRoomOneShell,readRoomOneMaps} from '../../src/render/environment/containment/RoomOneShell.ts';

export async function loadRoomOneShellFixture() {
  const rootUrl=new URL('../../assets/environments/containment-room-one/',import.meta.url);
  const [geometry,packed]=await Promise.all([readFile(new URL('room-one-shell.glb',rootUrl)),readFile(new URL('room-one-maps.bin',rootUrl))]);
  const data=gunzipSync(packed);
  return {root:await parseRoomOneShell(geometry.buffer.slice(geometry.byteOffset,geometry.byteOffset+geometry.byteLength)),
    maps:readRoomOneMaps(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength))};
}
