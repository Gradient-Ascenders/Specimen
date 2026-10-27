import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {BlackoutMaintenanceBay} from '../src/levels/BlackoutMaintenanceBay.ts';
import {BlackoutMaintenanceBayController} from '../src/levels/BlackoutMaintenanceBayController.ts';
import {parseBlackoutMaintenanceArt} from '../src/render/environment/blackout/BlackoutMaintenanceArt.ts';
import {readBlackoutMaintenanceMapData} from '../src/render/environment/blackout/BlackoutMaintenanceMapData.ts';
import {CollisionWorld} from '../src/physics/CollisionWorld.ts';
import {SurfaceRegistry} from '../src/physics/SurfaceRegistry.ts';
import {ElectricalTargetRegistry} from '../src/abilities/ElectricalTargetRegistry.ts';
import {auditOpaqueSurfaces} from '../src/render/geometry/OpaqueSurfaceAudit.ts';

const raw=gunzipSync(await readFile(new URL('../src/assets/blackout/maintenance-maps.bin',import.meta.url)));
const maps=readBlackoutMaintenanceMapData(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const bay=new BlackoutMaintenanceBay(maps),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
world.registerAll(bay.collisionMeshes);surfaces.registerAll(bay.collisionMeshes);
const registry=new ElectricalTargetRegistry(world),controller=new BlackoutMaintenanceBayController(bay,world,surfaces,registry);
const tolerance=Number(process.env.SURFACE_TOLERANCE??'.0001');
if(!(tolerance>0&&tolerance<=.05))throw Error('Invalid surface tolerance.');
const reports=[];
try{
 const bytes=await readFile(new URL('../assets/environments/blackout-maintenance/maintenance-bay.glb',import.meta.url));
 await bay.prepareArt(controller.door.collisionMesh,()=>parseBlackoutMaintenanceArt(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
 for(const [state,progress]of [['closed',0],['opening',.5],['open',1],['fan-turned',1],['reset',0]] as const){
  controller.door.restoreState({progress,desiredOpen:progress>0});
  if(state==='fan-turned')bay.art.update(1.4,true);
  if(state==='reset')bay.resetConnector();
  const result=auditOpaqueSurfaces(bay.root,tolerance);
  const authored=result.conflicts.filter(c=>c.first.includes('B3_R1_')||c.second.includes('B3_R1_'));
  reports.push({state,tolerance,...result,authored});
  console.log(`${state}: ${result.triangleCount} triangles, ${authored.length} conflicts involving new art; ${result.conflicts.length} total`);
 }
 await writeFile(process.argv[2]??'/tmp/blackout-maintenance-surfaces.json',JSON.stringify(reports,null,2)+'\n');
 if(reports.some(r=>r.authored.length))process.exitCode=1;
}finally{controller.dispose();registry.dispose();bay.dispose();world.clear();surfaces.clear();}
