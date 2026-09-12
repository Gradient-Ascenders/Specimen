import { visitLevelTwoSurfaceStates } from './lib/level-two-surface-states.ts';
import { writeFileSync } from 'node:fs';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { auditOpaqueSurfaces } from '../src/render/geometry/OpaqueSurfaceAudit.ts';
const scene = new LevelTwoPreviewScene(() => {});
const reports: Record<string, ReturnType<typeof auditOpaqueSurfaces>> = {};
visitLevelTwoSurfaceStates(scene, name => {
  const report = auditOpaqueSurfaces(scene.root, Number(process.env.SURFACE_TOLERANCE ?? .002));
  reports[name] = report;
  console.log(`${name}: ${report.triangleCount} triangles; ${report.conflicts.length} overlapping surface pairs`);
  for (const c of report.conflicts.slice(0, 25)) console.log(c.area.toFixed(3), c.separation.toFixed(6), c.normal, c.first, '<=>', c.second);
});
writeFileSync(process.argv[2] ?? '/tmp/level-two-surfaces.json', JSON.stringify(reports, null, 2));
scene.dispose();
if (Object.values(reports).some(report => report.conflicts.length)) process.exitCode = 1;
