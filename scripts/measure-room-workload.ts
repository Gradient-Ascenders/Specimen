/** CPU/structural evidence only; this does not measure GPU time or shader programs. */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { cpus } from 'node:os';
import { readCultivationBakedAssets } from '../src/render/environment/cultivation/CultivationBakedAssets.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';

const bytes = gunzipSync(readFileSync(new URL('../src/assets/cultivation/authored-assets.bin', import.meta.url)));
const assets = readCultivationBakedAssets(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const scene = new LevelTwoPreviewScene(() => {}, assets);
const report = { environment: { node: process.version, cpu: cpus()[0].model, logicalProcessors: cpus().length },
  protocol: 'Authored production geometry; no encounters, WebGL, shader compilation or GPU timing. 100 warmups, 1000 samples; milliseconds per call.',
  views: [] as object[] };
try {
  for (const [name, cameraPosition, bodyZ, target] of [
    ['room-1', [64, 4, 4], 8, [64, 3, 35]],
    ['doorway-1-2', [64, 3, 60], 65, [64, 3, 85]],
    ['doorway-2-3', [64, 3, 135], 140, [64, 3, 165]],
    ['room-3', [64, 8, 170], 175, [64, 8, 205]],
    ['room-5', [64, 6, 275], 280, [64, 15, 300]],
  ] as const) {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 200);
    camera.position.set(...cameraPosition); camera.lookAt(new THREE.Vector3(...target)); camera.updateMatrixWorld();
    scene.updatePresentationVisibility(camera.position, { z: bodyZ });
    const update = () => scene.update(1 / 60, scene.resolveRoomId({ x: 64, y: 2, z: bodyZ }), []);
    const measure = (action: () => void) => {
      for (let i = 0; i < 100; i++) action();
      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) { const start = performance.now(); action(); samples.push(performance.now() - start); }
      samples.sort((a, b) => a - b);
      return { medianMs: samples[500], p95Ms: samples[950] };
    };
    const simulation = measure(update), hierarchy = measure(() => scene.root.updateMatrixWorld());
    let localMatrixUpdates = 0;
    const original = THREE.Object3D.prototype.updateMatrix;
    THREE.Object3D.prototype.updateMatrix = function () { localMatrixUpdates++; original.call(this); };
    try { scene.root.updateMatrixWorld(); } finally { THREE.Object3D.prototype.updateMatrix = original; }
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let objects = 0, automaticMatrices = 0, visibleDraws = 0, visibleTriangles = 0, casterDraws = 0, casterTriangles = 0, batches = 0;
    const materials = new Set<THREE.Material>();
    scene.root.traverse(o => { objects++; if (o.matrixAutoUpdate) automaticMatrices++; });
    scene.root.traverseVisible(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) if (m.visible) materials.add(m);
      if (!list.some(m => m.visible)) return;
      if (o.userData.staticBatchSourceNames || o.userData.staticBatchCell) batches++;
      const triangles = (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o instanceof THREE.InstancedMesh ? o.count : 1);
      // All potential casters in the render scope, independent of camera culling.
      if (o.castShadow) { casterDraws++; casterTriangles += triangles; }
      if (o.frustumCulled && !frustum.intersectsObject(o)) return;
      visibleDraws++; visibleTriangles += triangles;
    });
    let shadowDraws = 0, shadowTriangles = 0;
    const casters: THREE.Mesh[] = [];
    scene.root.traverseVisible(o => {
      if (o instanceof THREE.Mesh && o.castShadow && (Array.isArray(o.material) ? o.material : [o.material]).some(m => m.visible)) casters.push(o);
    });
    scene.root.traverseVisible(o => {
      if (!(o instanceof THREE.SpotLight || o instanceof THREE.PointLight || o instanceof THREE.DirectionalLight) || !o.castShadow) return;
      for (let face = 0; face < (o instanceof THREE.PointLight ? 6 : 1); face++) {
        if (o instanceof THREE.PointLight) {
          const camera = o.shadow.camera;
          const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
          const ups = [[0, -1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, -1, 0]];
          camera.far = o.distance || camera.far; camera.updateProjectionMatrix();
          camera.position.setFromMatrixPosition(o.matrixWorld); camera.up.fromArray(ups[face]);
          camera.lookAt(camera.position.clone().add(new THREE.Vector3().fromArray(directions[face]))); camera.updateMatrixWorld();
          o.shadow.getFrustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        } else o.shadow.updateMatrices(o);
        for (const mesh of casters) {
          if (mesh.frustumCulled && !o.shadow.getFrustum().intersectsObject(mesh)) continue;
          shadowDraws++;
          shadowTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * (mesh instanceof THREE.InstancedMesh ? mesh.count : 1);
        }
      }
    });
    report.views.push({ name, camera: cameraPosition, bodyZ, target, simulation, hierarchy, objects, automaticMatrices,
      localMatrixUpdates, visibleDraws, visibleTriangles, casterDraws, casterTriangles, shadowDraws, shadowTriangles, materials: materials.size, batches,
      workload: 'getWorkloadDiagnostics' in scene ? (scene as any).getWorkloadDiagnostics() : undefined });
  }
  console.log(JSON.stringify(report, null, 2));
} finally { scene.dispose(); }
