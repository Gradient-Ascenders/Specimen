/** Development-only asset review; no production gameplay ownership or wiring. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BlackoutLevelScene } from '../levels/BlackoutLevelScene.ts';
import { loadBlackoutMaintenanceMapData } from '../render/environment/blackout/BlackoutMaintenanceMapData.ts';
import { CAMERA_VERTICAL_FOV_DEGREES, CAMERA_NEAR_PLANE_METRES, CAMERA_FAR_PLANE_METRES, DEFAULT_CAMERA_RIG_CONFIG } from '../render/CameraRig.ts';
import { RENDER_EXPOSURE } from '../render/RenderLayer.ts';
import '@fontsource/michroma/400.css';
import '@fontsource-variable/space-grotesk';
import '../ui/ui-theme.css';
import './volt-model-preview.css';

const morphNames = ['Squash','Stretch','Blink','CrestFlexLeft','CrestFlexRight'] as const;
type MorphName = typeof morphNames[number];
type Lighting = 'studio' | 'blackout' | 'blackout-powered';
type View = 'front' | 'side' | 'back' | 'three-quarter';
const weights: Record<MorphName,number> = { Squash:0, Stretch:0, Blink:0, CrestFlexLeft:0, CrestFlexRight:0 };
const host = document.querySelector<HTMLElement>('#viewport')!;
const status = document.querySelector<HTMLElement>('#status')!;
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = RENDER_EXPOSURE;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.domElement.setAttribute('aria-label','Volt model viewport');
host.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(CAMERA_VERTICAL_FOV_DEGREES,1,CAMERA_NEAR_PLANE_METRES,CAMERA_FAR_PLANE_METRES);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 3.5;
controls.maxDistance = 7;
const studio = new THREE.Group();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshStandardMaterial({ color:0x202832,roughness:0.32 }));
floor.rotation.x = -Math.PI/2;
studio.add(floor,new THREE.HemisphereLight(0xdce9ff,0x1a1420,1.5));
for (const [position,colour,intensity] of [
  [new THREE.Vector3(-3,5,-4),0xffefd3,3],
  [new THREE.Vector3(4,3,-1),0xd6e5ff,1.5],
  [new THREE.Vector3(1,4,3),0xffdf94,2],
] as const) { const light = new THREE.DirectionalLight(colour,intensity); light.position.copy(position); studio.add(light); }
scene.add(studio);
const voltLight = new THREE.PointLight(0xffdf75,16,8,2);
const actor = new THREE.Group();
// Open entry-apron position keeps every 3.5–7 m review orbit inside the room.
actor.position.set(2,0.46,5);
actor.add(voltLight);
scene.add(actor);
const pivot = actor.position.clone().add(new THREE.Vector3(0,DEFAULT_CAMERA_RIG_CONFIG.targetHeightMetres,0));
controls.target.copy(pivot);
const pmrem = new THREE.PMREMGenerator(renderer);
const environmentScene = new RoomEnvironment();
const environment = pmrem.fromScene(environmentScene,0.04);
environmentScene.dispose();
pmrem.dispose();
let blackout: BlackoutLevelScene;
let meshes: THREE.Mesh[] = [];
let lighting: Lighting = 'studio';
let distance = DEFAULT_CAMERA_RIG_CONFIG.followDistanceMetres;
let view: View = 'three-quarter';
let playing = false;
let ready = false;
let disposed = false;
let elapsed = 0;
let lastFrame = performance.now();
const sliders = new Map<MorphName,HTMLInputElement>();
const outputs = new Map<MorphName,HTMLOutputElement>();

function setCamera(nextView: View = view, nextDistance = distance): void {
  view = nextView; distance = Math.max(3.5,Math.min(7,nextDistance));
  const yaw = { front:0, side:Math.PI/2, back:Math.PI, 'three-quarter':Math.PI/8 }[view];
  const pitch = DEFAULT_CAMERA_RIG_CONFIG.initialPitchRadians;
  camera.position.set(pivot.x+Math.sin(yaw)*Math.cos(pitch)*distance,
    pivot.y+Math.sin(pitch)*distance,pivot.z-Math.cos(yaw)*Math.cos(pitch)*distance);
  controls.target.copy(pivot);
  controls.update();
  document.querySelector<HTMLInputElement>('#distance')!.value = String(distance);
  document.querySelector<HTMLOutputElement>('#distance-value')!.value = `${distance.toFixed(1)} m`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.setAttribute('aria-pressed',String(button.dataset.view === view));
  if (ready) refreshStatus();
}
function refreshStatus(): void {
  status.textContent = `${lighting === 'studio' ? 'Studio' : lighting === 'blackout' ? 'Blackout · unpowered' : 'Blackout · powered'} · ${distance.toFixed(1)} m`;
}
function applyWeights(): void {
  for (const mesh of meshes) {
    mesh.morphTargetInfluences!.fill(0);
    for (const name of morphNames) mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]!] = weights[name];
  }
  for (const name of morphNames) {
    sliders.get(name)!.value = String(weights[name]);
    outputs.get(name)!.value = weights[name].toFixed(2);
    sliders.get(name)!.style.setProperty('--range-progress',`${weights[name]*100}%`);
  }
}
function setMorph(name: MorphName, value: number): void {
  playing = false;
  weights[name] = Math.max(0,Math.min(1,value));
  const opposing: Partial<Record<MorphName,MorphName>> = { Squash:'Stretch',Stretch:'Squash',CrestFlexLeft:'CrestFlexRight',CrestFlexRight:'CrestFlexLeft' };
  if (opposing[name] && weights[name]>0) weights[opposing[name]!] = 0;
  document.querySelector<HTMLButtonElement>('#animate')!.setAttribute('aria-pressed','false');
  document.querySelector<HTMLButtonElement>('#animate')!.textContent = 'Play motion';
  applyWeights();
}
function reset(): void {
  playing = false;
  for (const name of morphNames) weights[name] = 0;
  setMorph('Squash',0);
}
function setLighting(next: Lighting): void {
  lighting = next;
  studio.visible = next === 'studio';
  blackout.root.visible = next !== 'studio';
  blackout.maintenanceBay?.update(0,next === 'blackout-powered');
  scene.background = new THREE.Color(next === 'studio' ? 0x151b24 : 0x07110f);
  scene.environment = next === 'studio' ? environment.texture : null;
  voltLight.intensity = next === 'studio' ? 0 : 16;
  document.querySelector<HTMLSelectElement>('#lighting')!.value = next;
  refreshStatus();
}
for (const [name,label] of [['Squash','Squash'],['Stretch','Stretch'],['Blink','Blink'],['CrestFlexLeft','Crest left'],['CrestFlexRight','Crest right']] as const) {
  const row = document.createElement('label'); row.className = 'setting-row'; row.textContent = label;
  const output = document.createElement('output'); output.value = '0.00';
  const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.01'; input.value = '0'; input.setAttribute('aria-label',`${label} morph weight`);
  input.addEventListener('input',() => setMorph(name,Number(input.value)));
  row.append(output,input); document.querySelector('#morph-controls')!.append(row);
  sliders.set(name,input); outputs.set(name,output);
}
document.querySelector<HTMLInputElement>('#distance')!.addEventListener('input',event => { setCamera(view,Number((event.target as HTMLInputElement).value)); setLighting(lighting); });
document.querySelector<HTMLSelectElement>('#lighting')!.addEventListener('change',event => setLighting((event.target as HTMLSelectElement).value as Lighting));
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.addEventListener('click',() => setCamera(button.dataset.view as View));
document.querySelector('#reset')!.addEventListener('click',reset);
document.querySelector<HTMLButtonElement>('#animate')!.addEventListener('click',event => {
  playing = !playing; elapsed = 0;
  (event.target as HTMLButtonElement).setAttribute('aria-pressed',String(playing));
  (event.target as HTMLButtonElement).textContent = playing ? 'Pause motion' : 'Play motion';
});
const resize = new ResizeObserver(() => { renderer.setSize(host.clientWidth,host.clientHeight); camera.aspect = host.clientWidth/host.clientHeight; camera.updateProjectionMatrix(); });
resize.observe(host);
setCamera();

const load = Promise.all([
  new GLTFLoader().loadAsync(new URL('../../assets/characters/volt/volt.glb',import.meta.url).href),
  loadBlackoutMaintenanceMapData(new URL('../assets/blackout/maintenance-maps.bin',import.meta.url)),
]).then(([gltf,maps]) => {
  if (disposed) { disposeTree(gltf.scene); return; }
  gltf.scene.traverse(object => { if (object instanceof THREE.Mesh) {
    if (!morphNames.every(name => object.morphTargetDictionary?.[name] !== undefined)) throw new Error(`Missing morph controls on ${object.name}`);
    meshes.push(object);
    object.castShadow = true; object.receiveShadow = true;
  }});
  if (meshes.length !== 3 || meshes.some(mesh => Array.isArray(mesh.material))) throw new Error('Expected three single-material meshes');
  actor.add(gltf.scene);
  blackout = new BlackoutLevelScene(true,maps); scene.add(blackout.root);
  applyWeights(); setLighting('studio'); ready = true;
}).catch(error => { status.textContent = error instanceof Error ? error.message : String(error); console.error(error); });

function posedBounds(mesh: THREE.Mesh): number[] {
  mesh.updateWorldMatrix(true,false);
  const box = new THREE.Box3(), point = new THREE.Vector3();
  for (let index=0;index<mesh.geometry.attributes.position!.count;index++) {
    mesh.getVertexPosition(index,point); box.expandByPoint(point.applyMatrix4(mesh.matrixWorld));
  }
  return box.min.toArray().concat(box.max.toArray());
}
function snapshot() {
  const body = meshes.find(mesh => mesh.name === 'Volt-Body');
  const line = actor.position.clone().sub(camera.position);
  const ray = new THREE.Raycaster(camera.position,line.clone().normalize(),0,line.length()-0.7);
  const occluder = lighting === 'studio' ? undefined : ray.intersectObjects([...blackout.collisionMeshes],false)[0]?.object.name;
  return { ready,lighting,distance,view,weights:{...weights},meshNames:meshes.map(mesh => mesh.name),
    materials:new Set(meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material])).size,
    morphNames:body ? Object.keys(body.morphTargetDictionary!) : [],
    fov:camera.fov,aspect:camera.aspect,exposure:renderer.toneMappingExposure,occluder:occluder ?? null,
    triangles:meshes.reduce((sum,mesh) => sum+(mesh.geometry.index?.count ?? mesh.geometry.attributes.position!.count)/3,0),
    renderCalls:renderer.info.render.calls,programs:renderer.info.programs?.length ?? 0,
    bounds:body ? posedBounds(body) : [],
    eyeBounds:meshes.filter(mesh => mesh.name.includes('Eye')).map(posedBounds),
    appliedWeights:Object.fromEntries(meshes.map(mesh => [mesh.name,Object.fromEntries(morphNames.map(name => [name,mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]!]!]))])),
  };
}
Object.assign(window,{ __voltPreview:{ ready:load,snapshot,setLighting,setCamera,setMorph,reset } });
renderer.setAnimationLoop(() => {
  const now = performance.now(); const delta = Math.min(0.05,(now-lastFrame)/1000); lastFrame = now;
  if (ready && playing) {
    elapsed += delta;
    const pulse = Math.sin(elapsed*1.9);
    weights.Squash = Math.max(0,pulse)*0.28; weights.Stretch = Math.max(0,-pulse)*0.28;
    const flex = Math.sin(elapsed*1.2); weights.CrestFlexLeft = Math.max(0,flex)*0.5; weights.CrestFlexRight = Math.max(0,-flex)*0.5;
    const blink = elapsed%4.1; weights.Blink = blink < 0.24 ? Math.sin(blink/0.24*Math.PI)**2 : 0;
    applyWeights();
  }
  controls.update(); renderer.render(scene,camera);
});
function disposeTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => { if (object instanceof THREE.Mesh) {
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  }});
  for (const material of materials) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); }
  for (const geometry of geometries) geometry.dispose(); for (const texture of textures) texture.dispose();
}
window.addEventListener('pagehide',() => {
  disposed = true; renderer.setAnimationLoop(null); resize.disconnect(); controls.dispose();
  blackout?.dispose(); environment.dispose(); disposeTree(actor); disposeTree(studio);
  renderer.dispose();
},{once:true});
