import {readFileSync} from 'node:fs';
import {createTransitArtFixture} from './blackout-transit-art-states.ts';
import {parseBlackoutAscentArt} from '../../src/render/environment/blackout/BlackoutAscentArt.ts';
import {parseExterminationLairAsset} from '../../src/boss/ExterminationLairAsset.ts';

const buffer=(b:Uint8Array)=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
export const loadAscentArt=()=>parseBlackoutAscentArt(buffer(readFileSync(new URL('../../assets/environments/blackout-ascent/research-ascent.glb',import.meta.url))));

/** Full actual neighbouring hall, controls, car, gates, scrolling shaft owners
 * and prepared arena doorway, rather than an isolated editor approximation. */
export function createAscentArtFixture(){
  const transit=createTransitArtFixture(),lift=transit.scene.bossStaging!.ascentLift!;
  return {...transit,lift,
    async prepare(ascent=true){
      await transit.prepare();
      const arena=await parseExterminationLairAsset(buffer(readFileSync(new URL('../../assets/environments/extermination-lair/extermination-lair.glb',import.meta.url))));
      transit.scene.finalArena!.adoptArt(arena);
      if(ascent)await lift.prepareArt(loadAscentArt);
      transit.pose(1,1,true);
    },
    pose(distance:number,rear:number,front:number,charge:number,labOpen=false){
      lift.present(distance,rear,front,charge,20);
      lift.setArenaAccessOpen(labOpen);
      transit.scene.root.updateMatrixWorld(true);
    },
  };
}

export const ASCENT_ART_POSES=[
  {name:'boarding',distance:0,rear:0,front:0,charge:0},
  {name:'closing',distance:0,rear:.5,front:0,charge:.35},
  {name:'ascending',distance:18.25,rear:1,front:0,charge:1},
  {name:'arriving',distance:62,rear:1,front:.5,charge:1},
  {name:'landed',distance:69.6,rear:1,front:1,charge:1},
  {name:'lab-open',distance:69.6,rear:1,front:1,charge:1,labOpen:true},
  {name:'reset',distance:0,rear:0,front:0,charge:0},
] as const;
