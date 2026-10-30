import { test, expect } from '../../helpers/MenuFixtures.ts';

// This checks renderer ownership and the two timing paths under software WebGL;
// it deliberately makes no claim about a device's recommended preset or FPS.
test('cold preparation over three seconds completes and restores renderer state on both timing paths', async ({menuPage:page}) => {
  const result = await page.evaluate(async () => {
    const threeModule = '/node_modules/.vite/deps/three.js';
    const THREE = await import(threeModule);
    const { RenderLayer } = await import('../../../src/render/RenderLayer.ts');
    const { GRAPHICS_PROFILES } = await import('../../../src/render/GraphicsProfiles.ts');
    const host = document.createElement('div');
    Object.assign(host.style,{width:'320px',height:'180px',position:'fixed',left:'0',top:'0'});
    document.body.append(host);
    const layer = new RenderLayer({host,graphics:GRAPHICS_PROFILES.standard.settings});
    const geometry = new THREE.SphereGeometry(.6,16,12);
    const material = new THREE.MeshPhysicalMaterial({color:0x55aa88,roughness:.2,transmission:.8,thickness:.5});
    const mesh = new THREE.Mesh(geometry,material);layer.scene.add(mesh);
    layer.gelRendering.register(material);
    layer.scene.add(new THREE.HemisphereLight(0xffffff,0x223344,3));
    const camera = layer.cameraRig.camera;camera.position.set(0,0,3);camera.lookAt(0,0,0);
    const renderer = layer.renderer, gl = renderer.getContext() as WebGL2RenderingContext;
    renderer.setViewport(0,0,320,180);renderer.setScissor(10,10,200,100);renderer.setScissorTest(true);
    const before = {graphics:layer.graphicsConfiguration,viewport:renderer.getViewport(new THREE.Vector4()).toArray(),
      scissor:renderer.getScissor(new THREE.Vector4()).toArray(),scale:renderer.transmissionResolutionScale};
    const extension = gl.getExtension.bind(gl);
    const compile = renderer.compileAsync.bind(renderer);
    let delayed = false;
    renderer.compileAsync = async (...args: Parameters<typeof compile>) => {
      if (!delayed) {
        delayed = true;
        // Reproduce a slow cold shader/asset preparation without changing frame
        // performance. The old whole-check deadline expired before any samples.
        await new Promise(resolve => setTimeout(resolve, 3200));
      }
      return compile(...args);
    };
    const runs:unknown[]=[];
    try {
      for (const fallback of [false,true]) {
        if (fallback) gl.getExtension = ((name:string) => name==='EXT_disjoint_timer_query_webgl2'?null:extension(name)) as typeof gl.getExtension;
        const phases:string[]=[];
        const result = await layer.calibrateCurrentView(()=>true,(phase,profile)=>phases.push(`${phase}:${profile}`),()=>{},()=>layer.render());
        runs.push({fallback,result,phases,error:gl.getError(),graphics:layer.graphicsConfiguration,
          viewport:renderer.getViewport(new THREE.Vector4()).toArray(),scissor:renderer.getScissor(new THREE.Vector4()).toArray(),
          scissorTest:renderer.getScissorTest(),target:renderer.getRenderTarget(),scale:renderer.transmissionResolutionScale});
      }
      const empty = await layer.calibrateCurrentView(()=>true,()=>{},()=>{},()=>{});
      return {before,runs,empty};
    } finally { renderer.compileAsync = compile;gl.getExtension = extension;geometry.dispose();material.dispose();layer.dispose();host.remove(); }
  });
  for (const run of result.runs as any[]) {
    expect(run.result.status).toBe('complete');
    expect(run.result.measurements.high.sampleCount).toBeGreaterThanOrEqual(4);
    if (run.fallback) expect(run.result.measurements.high.method).toBe('completion');
    expect(run.phases).toContain('preparing:high');expect(run.phases).toContain('measuring:high');
    expect(run.error).toBe(0);expect(run.graphics).toEqual(result.before.graphics);
    expect(run.viewport).toEqual(result.before.viewport);expect(run.scissor).toEqual(result.before.scissor);
    expect(run.scissorTest).toBe(true);expect(run.target).toBeNull();expect(run.scale).toBe(result.before.scale);
  }
  expect(result.empty.status).toBe('unavailable');expect(result.empty.profile).toBeUndefined();
});

test('High and Ultra replace shadow sampler storage and restore refraction safely', async ({menuPage:page}) => {
  const runs = await page.evaluate(async () => {
    const threeModule = '/node_modules/.vite/deps/three.js';
    const THREE = await import(threeModule);
    const { RenderLayer } = await import('../../../src/render/RenderLayer.ts');
    const { GRAPHICS_PROFILES } = await import('../../../src/render/GraphicsProfiles.ts');
    const host = document.createElement('div');
    Object.assign(host.style, { width: '320px', height: '180px' });document.body.append(host);
    const layer = new RenderLayer({ host, graphics: GRAPHICS_PROFILES.high.settings });
    const shadows = layer.requestShadowConfiguration('tier-test', { enabled: true, contactHardening: true });
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.castShadow = true;light.position.set(2, 3, 4);light.shadow.mapSize.set(2048, 2048);
    const geometry = new THREE.SphereGeometry(0.6, 12, 8);
    const material = new THREE.MeshPhysicalMaterial({ transmission: 0.8, thickness: 0.5 });
    const mesh = new THREE.Mesh(geometry, material);mesh.castShadow = true;mesh.receiveShadow = true;
    layer.gelRendering.register(material);layer.scene.add(mesh, light);
    layer.cameraRig.camera.position.set(0, 0, 3);layer.cameraRig.camera.lookAt(0, 0, 0);
    const samples = [];
    try {
      for (const profile of ['high', 'ultra', 'high', 'ultra'] as const) {
        const oldMap = light.shadow.map;let disposed = false;
        oldMap?.addEventListener('dispose', () => { disposed = true; });
        layer.setGraphicsSettings(GRAPHICS_PROFILES[profile].settings);
        layer.render();
        samples.push({ profile, type: layer.renderer.shadowMap.type, scale: layer.renderer.transmissionResolutionScale,
          error: layer.renderer.getContext().getError(), hadMap: !!oldMap, disposed,
          newMap: oldMap !== light.shadow.map, mapWidth: light.shadow.map!.width });
      }
      return samples;
    } finally { shadows.dispose();light.shadow.dispose();geometry.dispose();material.dispose();layer.dispose();host.remove(); }
  });
  for (const run of runs) {
    expect(run.error).toBe(0);expect(run.mapWidth).toBe(2048);
    expect(run.type).toBe(run.profile === 'ultra' ? 0 : 1);
    expect(run.scale).toBe(run.profile === 'ultra' ? 1 : 0.75);
    if (run.hadMap) { expect(run.disposed).toBe(true);expect(run.newMap).toBe(true); }
  }
});
