import {writeFile} from 'node:fs/promises';
import {createAscentArtFixture,ASCENT_ART_POSES} from './lib/blackout-ascent-art-states.ts';
import {auditOpaqueSurfaces} from '../src/render/geometry/OpaqueSurfaceAudit.ts';

const fixture=createAscentArtFixture(),reports=[];
const baseline=process.argv.includes('--baseline'),tolerance=Number(process.env.SURFACE_TOLERANCE??'.0001');
if(!(tolerance>0&&tolerance<=.05))throw Error('Invalid audit tolerance.');
try{
  await fixture.prepare(!baseline);
  for(const pose of ASCENT_ART_POSES){
    fixture.pose(pose.distance,pose.rear,pose.front,pose.charge,'labOpen'in pose&&pose.labOpen);
    const report=auditOpaqueSurfaces(fixture.scene.root,tolerance);
    const authored=report.conflicts.filter(c=>c.first.includes('B3_ASC_')||c.second.includes('B3_ASC_'));
    reports.push({state:pose.name,tolerance,...report,authored});
    console.log(`${pose.name}: ${report.triangleCount} triangles, ${authored.length} ascent art conflicts; ${report.conflicts.length} total`);
  }
  await writeFile(process.argv.find(a=>a.endsWith('.json'))??'/tmp/blackout-ascent-surfaces.json',JSON.stringify(reports,null,2)+'\n');
  if(reports.some(r=>r.authored.length))process.exitCode=1;
}finally{fixture.dispose();}
