The Extermination Lair uses five original PBR finish sets authored in
`scripts/lib/extermination-surface-generator.ts`: coated armour, anti-slip
decking, brushed steel, recessed grating and a weathered shaft liner.
No third-party imagery is used.

Run `node scripts/assets/generate-extermination-maps.ts` to rebuild the lossless bundle, or
`node scripts/assets/generate-extermination-maps.ts --check` to verify it byte for byte.
Wall and floor maps are 1024 px over one metre; secondary maps are 512 px.
Brushed steel repeats over half a metre, grating over one metre, and the broad
shaft liner over 8 by 12 metres. Each set includes sRGB albedo, linear roughness
and normalized OpenGL tangent-space normals. Mipmaps and anisotropic filtering
keep the detail stable at an angle. The complete five-family set occupies about
44 MiB with mipmaps, shared across all room finishes and cover instances.

Architectural joints, bevels, recesses, armour and signs are authored geometry in
`assets/environments/extermination-lair/`, rather than blurry baked wall grids or
text atlases. The GLB carries metric UVs; moving doors and cover retain their
local UVs. Broad, subtle finish variation uses world position.

`ExterminationMaterials` owns the GPU textures and finish variants. The level
awaits decompression and GLB adoption before light compilation and shader warmup.
Its reflection environment is borrowed from the existing level owner. The room's
original ring collisions and combat controllers remain authoritative.
