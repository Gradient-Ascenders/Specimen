import {readFile} from 'node:fs/promises';
import type {TestContext} from 'node:test';
import {OpeningLaboratoryAsset,parseOpeningLaboratory} from '../../src/cinematics/OpeningLaboratoryAsset.ts';
import {RoomOneShell} from '../../src/render/environment/containment/RoomOneShell.ts';
import {loadRoomOneShellFixture} from './RoomOneShellAsset.ts';

export async function loadOpeningLaboratoryFixture(){
  const bytes=await readFile(new URL('../../assets/environments/opening-laboratory/opening-laboratory.glb',import.meta.url));
  return parseOpeningLaboratory(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
}

/** Use the production parsers/adoption paths without Node attempting file:// fetch. */
export function useOpeningAssetFixtures(context:TestContext):void {
  const roomPrepare=RoomOneShell.prototype.prepare,wingPrepare=OpeningLaboratoryAsset.prototype.prepare;
  context.mock.method(RoomOneShell.prototype,'prepare',function(this:RoomOneShell){return roomPrepare.call(this,loadRoomOneShellFixture);});
  context.mock.method(OpeningLaboratoryAsset.prototype,'prepare',function(this:OpeningLaboratoryAsset,finish:Parameters<typeof wingPrepare>[0]){
    return wingPrepare.call(this,finish,loadOpeningLaboratoryFixture);
  });
}
