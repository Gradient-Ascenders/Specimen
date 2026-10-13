import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { MaintenanceDronePresentation } from '../src/render/environment/blackout/MaintenanceDronePresentation.ts';
import type { MaintenanceDroneReadModel } from '../src/vehicles/MaintenanceDroneTypes.ts';

test('tutorial waits for controller availability, acknowledges visible time, and resets', () => {
  const element = () => ({style: {}, hidden: false, textContent: '', children: [] as any[], append(...children: any[]) {this.children.push(...children);}, remove() {}});
  const host = {...element(), ownerDocument: {createElement: element}};
  let completed = 0;
  const presentation = new MaintenanceDronePresentation(new THREE.Group(), host as unknown as HTMLElement, undefined, undefined, () => completed++);
  const tutorial = host.children[0].children[2];
  const state = {state: 'starting', mounted: true, firstMountTutorialAvailable: false, tutorialCompleted: false} as MaintenanceDroneReadModel;
  for (let i = 0; i < 50; i++) presentation.update(.1, state);
  assert.equal(tutorial.hidden, true);
  assert.equal(completed, 0);
  const available = {...state, state: 'mounted' as const, firstMountTutorialAvailable: true};
  for (let i = 0; i < 30; i++) presentation.update(.1, available);
  assert.equal(tutorial.hidden, false);
  presentation.resetTutorial();
  for (let i = 0; i < 20; i++) presentation.update(.1, available);
  assert.equal(completed, 0, 'checkpoint recovery clears partial display time');
  for (let i = 0; i < 50; i++) presentation.update(.1, available, false);
  assert.equal(completed, 0, 'hidden tutorial must not time out');
  for (let i = 0; i < 21; i++) presentation.update(.1, available);
  assert.equal(completed, 1);
  presentation.update(.1, {...available, firstMountTutorialAvailable: false, tutorialCompleted: true});
  assert.equal(tutorial.hidden, true);
  presentation.resetTutorial();
  presentation.update(.1, available);
  assert.equal(tutorial.hidden, false, 'restored incomplete tutorial is shown again');
  presentation.dispose();
});

test('maintenance beam reaches the floor and stops above intervening platforms',()=>{
  const element=()=>({style:{},append(){},remove(){}});
  const host={...element(),ownerDocument:{createElement:element}} as unknown as HTMLElement;
  const root=new THREE.Group();root.position.y=11;
  const world=new CollisionWorld();
  const floor=new THREE.Mesh(new THREE.BoxGeometry(60,1,60));floor.position.y=-.5;world.register(floor);
  const ignored=new THREE.Mesh();
  const presentation=new MaintenanceDronePresentation(root,host,world,ignored);
  const state={state:'parked-hover',lightEnabled:true,powered:true} as MaintenanceDroneReadModel;
  const beam=root.getObjectByName('soft-maintenance-beam') as THREE.Mesh;
  const bottom=()=>new THREE.Box3().setFromObject(beam).min.y;
  presentation.update(1/60,state,false);
  assert.ok(bottom()>=0 && bottom()<.15,`beam must reach ground, got ${bottom()}`);
  const platform=new THREE.Mesh(new THREE.BoxGeometry(8,.4,8));platform.position.y=4.8;world.register(platform);
  presentation.update(1/60,state,false);
  assert.ok(bottom()>=5 && bottom()<5.15,`beam must stop at platform top, got ${bottom()}`);
  let spot:THREE.SpotLight|undefined;
  root.traverse(o=>{if(o instanceof THREE.SpotLight)spot=o;});
  assert.equal(spot?.castShadow,true);
  assert.equal(spot?.distance,32);
  assert.equal(spot?.shadow.autoUpdate, true);
  presentation.update(1/60, {...state, state:'grounded-idle', powered:false, lightEnabled:false}, false);
  assert.equal(spot?.intensity, 0);
  assert.equal(spot?.shadow.autoUpdate, false);
  assert.equal(spot?.castShadow, true, 'power toggles retain the source layout');
  presentation.update(1/60, state, false);
  assert.equal(spot?.shadow.needsUpdate, true, 'repowering rebuilds any prior silhouette');
  world.unregister(platform);presentation.update(1/60,state,false);
  assert.ok(bottom()<.15,'beam grows back when no longer blocked');
  presentation.dispose();world.clear();floor.geometry.dispose();platform.geometry.dispose();
});

test('local maintenance spotlight covers landing corners on all three decks without revealing the next step', () => {
  const element = () => ({style: {}, append() {}, remove() {}});
  const host = {...element(), ownerDocument: {createElement: element}} as unknown as HTMLElement;
  const root = new THREE.Group();
  const presentation = new MaintenanceDronePresentation(root, host);
  const spot = root.getObjectByName('blackout-maintenance-searchlight') as THREE.SpotLight;
  const beams: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh && object.name === 'soft-maintenance-beam') beams.push(object); });
  const state = {state: 'parked-hover', lightEnabled: true, powered: true} as MaintenanceDroneReadModel;
  presentation.update(1 / 60, state, false);
  assert.equal(spot.intensity, 100);
  assert.equal(spot.decay, 2);
  assert.equal(spot.distance, 32);
  assert.equal(spot.penumbra, .25);
  assert.deepEqual(spot.shadow.mapSize.toArray(), [512, 512]);
  const decks = [[-3, .15, 17], [1.5, .45, 28.5], [-2.5, .15, 40]];
  for (const [x, top, z] of decks) {
    root.position.set(x!, 6.61, z!);
    root.updateWorldMatrix(true, true);
    spot.shadow.updateMatrices(spot);
    const height = 6.61 - .13 - top!;
    const cornerCosine = height / Math.hypot(height, 2.5, 3.5);
    const outerCosine = Math.cos(spot.angle);
    const innerCosine = Math.cos(spot.angle * (1 - spot.penumbra));
    const t = THREE.MathUtils.clamp((cornerCosine - outerCosine) / (innerCosine - outerCosine), 0, 1);
    assert.ok(t * t * (3 - 2 * t) >= .5, 'landing corners receive at least half the angular light strength');
    for (const dx of [-2.5, 2.5]) for (const dz of [-3.5, 3.5]) {
      const corner = new THREE.Vector3(x! + dx, top!, z! + dz).project(spot.shadow.camera);
      assert.ok(Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1 && Math.abs(corner.z) < 1, 'shadow frustum covers illuminated corners');
    }
    assert.ok(Math.tan(spot.angle) * (height + 1.1) < 8, 'pool stops short of the next deck, including basin height');
  }
  const outerBeam = beams.at(-1)!;
  const radius = (outerBeam.geometry as THREE.ConeGeometry).parameters.radius;
  assert.ok(Math.abs(radius / 7 - Math.tan(spot.angle)) < 1e-12, 'visible outer beam shares the light angle');
  presentation.update(1 / 60, {...state, lightEnabled: false, powered: false, state: 'grounded-idle'}, false);
  assert.equal(spot.intensity, 0);
  assert.equal(spot.shadow.autoUpdate, false);
  assert.ok(beams.every(beam => (beam.material as THREE.MeshBasicMaterial).opacity === 0));
  presentation.dispose();
});
