/** Small, separated volumes for the real authored rooms. The service duct has
 * its own bank so light cannot interpolate through the wall into the hall. */
export const BLACKOUT_RADIANCE_LAYOUT = [
  {name:'maintenance-bay',min:[-17,0,-2],max:[17,12,54],grid:[7,4,9],capture:[0,4,26],circuit:-1},
  {name:'service-hall',min:[3,0,54],max:[9,4.5,80],grid:[3,3,7],capture:[6,1.8,66],circuit:-1},
  {name:'volt-duct',min:[-17.6,0,53.5],max:[-5,5,80],grid:[5,3,7],capture:[-16,1.5,67],circuit:-1},
  {name:'distribution-a',min:[-18,-.6,80],max:[18,18,108],grid:[7,5,7],capture:[4,5,96],circuit:0},
  {name:'distribution-b',min:[-18,-.6,106],max:[18,18,129],grid:[7,5,7],capture:[4,7,120],circuit:1},
  {name:'distribution-c',min:[-18,-.6,127],max:[18,18,151],grid:[7,5,7],capture:[-2,4,138],circuit:2},
  {name:'switch-platform',min:[5,5,134],max:[17,18,148],grid:[4,4,5],capture:[10,10,142.5],circuit:3},
  {name:'lift-approach',min:[-4.4,0,151],max:[4.4,6.5,176.5],grid:[3,3,7],capture:[0,2,164],circuit:-1},
  {name:'service-car',min:[-5.8,-1,176.5],max:[5.8,8,184.9],grid:[5,4,5],capture:[0,2.5,180.7],circuit:4},
  {name:'research-landing',min:[-6.4,.4,184.9],max:[6.4,7.2,190],grid:[5,4,3],capture:[0,2.5,187],circuit:5},
] as const;
export const BLACKOUT_RADIANCE_VERSION='SPBK0001';
export const BLACKOUT_CAPTURE_SIZE=[64,32] as const;
export const BLACKOUT_PROBE_RAYS=48;
export const BLACKOUT_ATLAS_WIDTH=7;
export const BLACKOUT_BAND_HEIGHT=5;
export const BLACKOUT_ATLAS_HEIGHT=BLACKOUT_BAND_HEIGHT*4;
export const BLACKOUT_ZONE_DEPTH=BLACKOUT_RADIANCE_LAYOUT.reduce((n,z)=>n+z.grid[2]+2,0);
export const BLACKOUT_ATLAS_DEPTH=BLACKOUT_ZONE_DEPTH*2;
export const BLACKOUT_REFLECTION_COLUMNS=4;

export function blackoutLightingZone(p:{x:number;y:number;z:number}):number {
  if(p.z<54)return 0;
  if(p.z<80)return p.x<0?2:1;
  if(p.z<151){
    if(p.x>5&&p.y>5&&p.z>134)return 6;
    return p.z<107?3:p.z<128?4:5;
  }
  return p.z<176.5?7:p.z<184.9?8:9;
}
