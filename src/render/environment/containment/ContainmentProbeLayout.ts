/** World-space bake bounds. Moving platforms, shutters and characters are never
 * occluders in the indirect bake; their direct shadows remain live. */
export const CONTAINMENT_PROBE_LAYOUT = [
  {room:1, min:[-10,0,-6], max:[10,14,27], grid:[7,5,9], capture:[0,3,-.5]},
  {room:2, min:[-19,0,27], max:[19,17,49], grid:[9,5,7], capture:[0,8,39]},
  {room:3, min:[-20,6.8,49], max:[20,33,79.5], grid:[9,7,9], capture:[0,18,63]},
  {room:4, min:[2.7,26,79.5], max:[15.3,79,91.5], grid:[5,13,5], capture:[9,52,85.5]},
  {room:5, min:[-20,74.75,91.5], max:[20,104,133], grid:[9,9,9], capture:[0,83,110]},
] as const;

export const CONTAINMENT_RADIANCE_VERSION = 'SPCL0001';
export const CONTAINMENT_CAPTURE_SIZE = [256,128] as const;
export const CONTAINMENT_PROBE_RAYS = 96;
export const CONTAINMENT_PROBE_ATLAS_WIDTH = 9;
export const CONTAINMENT_PROBE_ATLAS_HEIGHT = 13;
export const CONTAINMENT_PROBE_ATLAS_DEPTH = CONTAINMENT_PROBE_LAYOUT.reduce((n,p)=>n+4*(p.grid[2]+2),0);
