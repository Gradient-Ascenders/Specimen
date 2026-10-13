import { readFile } from 'node:fs/promises';
import { readBlackoutMaintenanceMapData } from '../../src/render/environment/blackout/BlackoutMaintenanceMapData.ts';
const compressed = await readFile(new URL('../../src/assets/blackout/maintenance-maps.bin', import.meta.url));
const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
export const maintenanceMaps = readBlackoutMaintenanceMapData(await new Response(stream).arrayBuffer());
