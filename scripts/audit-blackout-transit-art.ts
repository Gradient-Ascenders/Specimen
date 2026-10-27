import {writeFile} from 'node:fs/promises';
import {createTransitArtFixture,TRANSIT_ART_POSES} from './lib/blackout-transit-art-states.ts';
import {auditOpaqueSurfaces} from '../src/render/geometry/OpaqueSurfaceAudit.ts';

const tolerance=Number(process.env.SURFACE_TOLERANCE??'.0001');
if(!(tolerance>0&&tolerance<=.05))throw Error('Invalid surface tolerance.');
const baseline=process.argv.includes('--baseline'),fixture=createTransitArtFixture(),reports=[];
try{
  if(baseline)await fixture.prepareNeighbours();else await fixture.prepare();
  for(const pose of TRANSIT_ART_POSES){
    fixture.pose(pose.bridge,pose.lift,pose.powered);
    const report=auditOpaqueSurfaces(fixture.scene.root,tolerance);
    const authored=report.conflicts.filter(c=>c.first.includes('B3_R2_')||c.second.includes('B3_R2_'));
    reports.push({state:pose.name,tolerance,...report,authored});
    console.log(`${pose.name}: ${report.triangleCount} triangles, ${authored.length} transit art conflicts; ${report.conflicts.length} total`);
  }
  const target=process.argv.find(v=>v.endsWith('.json'))??'/tmp/blackout-transit-surfaces.json';
  await writeFile(target,JSON.stringify(reports,null,2)+'\n');
  if(reports.some(r=>r.authored.length))process.exitCode=1;
}finally{fixture.dispose();}
