export interface BuildInfo { readonly sha: string; readonly dirty: boolean; readonly builtAt: string }
declare const __SPECIMEN_BUILD__: BuildInfo;
export const buildInfo: BuildInfo = typeof __SPECIMEN_BUILD__ === 'undefined'
  ? {sha:'unavailable',dirty:true,builtAt:''} : __SPECIMEN_BUILD__;
