import type {Plugin} from 'vite';
export interface BuildMetadata {sha:string;dirty:boolean;builtAt:string}
export function createBuildMetadata():BuildMetadata;
export function buildManifestPlugin(build:BuildMetadata):Plugin;
