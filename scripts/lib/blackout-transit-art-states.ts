import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {BlackoutLevelScene} from '../../src/levels/BlackoutLevelScene.ts';
import {BlackoutMaintenanceBayController} from '../../src/levels/BlackoutMaintenanceBayController.ts';
import {BlackoutTransitController} from '../../src/levels/BlackoutTransitController.ts';
import {parseBlackoutMaintenanceArt} from '../../src/render/environment/blackout/BlackoutMaintenanceArt.ts';
import {parseBlackoutTransitArt} from '../../src/render/environment/blackout/BlackoutTransitArt.ts';
import {readBlackoutMaintenanceMapData} from '../../src/render/environment/blackout/BlackoutMaintenanceMapData.ts';
import {CollisionWorld} from '../../src/physics/CollisionWorld.ts';
import {SurfaceRegistry} from '../../src/physics/SurfaceRegistry.ts';
import {ElectricalTargetRegistry} from '../../src/abilities/ElectricalTargetRegistry.ts';

const buffer=(b:Uint8Array)=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
const raw=gunzipSync(readFileSync(new URL('../../src/assets/blackout/maintenance-maps.bin',import.meta.url)));
const maps=readBlackoutMaintenanceMapData(buffer(raw));
export const loadTransitArt=()=>parseBlackoutTransitArt(buffer(readFileSync(new URL('../../assets/environments/blackout-transit/transit-hall.glb',import.meta.url))));

/** Actual neighbouring rooms, live lift/bridge owners and all transit hazards. */
export function createTransitArtFixture(){
  const scene=new BlackoutLevelScene(true,maps),room=scene.transitRoom!,kit=scene.maintenanceBay!.surfaceMaterials;
  const world=new CollisionWorld(),surfaces=new SurfaceRegistry(),registry=new ElectricalTargetRegistry(world);
  world.registerAll(scene.collisionMeshes);surfaces.registerAll(scene.collisionMeshes);
  const bay=new BlackoutMaintenanceBayController(scene.maintenanceBay!,world,surfaces,registry);
  const controller=new BlackoutTransitController({room,world,surfaces,electricalTargets:registry});
  // BlackoutLevelRuntime owns machinery beside the room, not inside it.
  scene.root.add(controller.root);
  const prepareNeighbours=async()=>{
    const b=readFileSync(new URL('../../assets/environments/blackout-maintenance/maintenance-bay.glb',import.meta.url));
    await scene.maintenanceBay!.prepareArt(bay.door.collisionMesh,()=>parseBlackoutMaintenanceArt(buffer(b)));
  };
  return {scene,room,kit,world,surfaces,registry,bay,controller,
    prepareNeighbours,
    async prepare(neighbours=true){
      if(neighbours)await prepareNeighbours();
      await controller.prepareArt(loadTransitArt);
    },
    pose(bridge:number,lift:number,powered=true){
      if(!powered&&bridge===0)controller.reset();
      else for(const enemy of controller.emergingDrones)enemy.state.destroy();
      const state=controller.capture() as any;
      state.active=true;state.bridgeProgress=bridge;state.bridgeDeployed=bridge>=.98;
      state.lights=state.lights.map(()=>({charge:powered?1:0,latched:powered}));
      state.lifts=state.lifts.map((s:any)=>({...s,platform:{progress:lift,target:'end'}}));
      controller.restore(state);
      scene.root.updateMatrixWorld(true);
    },
    dispose(){controller.dispose();bay.dispose();registry.dispose();scene.dispose();surfaces.clear();world.clear();},
  };
}

export const TRANSIT_ART_POSES=[
  {name:'initial',bridge:0,lift:0,powered:false},
  {name:'opening',bridge:.5,lift:.5,powered:true},
  {name:'deployed',bridge:1,lift:1,powered:true},
  {name:'retracting',bridge:.2,lift:.25,powered:true},
  {name:'reset',bridge:0,lift:0,powered:false},
] as const;
