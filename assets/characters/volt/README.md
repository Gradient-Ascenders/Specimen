# Volt

Editable electrical slime with a thick, rounded, asymmetric lightning crest.
Its broad root is inset 10.7 cm (8% of body width), locally smoothed into the
head, and its outward tip is approximately 23% shorter than the sharp version.
The body and crest are one closed surface. No floating effects are included.

The approved neutral lower body (6,817 vertices) and both eye meshes are
preserved exactly. Geometry hashes are enforced by the generator and verifier.
The character has 38,208 triangles across three connected, closed meshes with
identity transforms and zero non-manifold edges. Dimensions are approximately
1.33 m wide, 1.79 m tall and 1.07 m deep. Blender uses +Z up/+Y forward; glTF
uses +Y up/-Z forward, with resting contact at Y=-0.45 m.

## Material and motion polish

One golden gel material now uses continuous emission and roughness ramps,
replacing eight stepped crest materials. Two embedded 2×512 PNGs carry the
ramps; UVs move with the surface. Roughness increases from 0.18 to 0.28 and
warm emission from approximately 0.30 to 0.95. The eyes share one glossy black
material. The GLB contains three primitives and two materials, excluding
studio lighting and dressing. Blender studio bloom remains subtle (0.08).

All three meshes expose the same five morph controls, initially zero:

| Control | Full-weight effect |
| --- | --- |
| `Squash` | 10% shorter, volume-preserving horizontal expansion |
| `Stretch` | 9% taller, volume-preserving horizontal contraction |
| `Blink` | Eyes close to 13% height, reseated against the gel |
| `CrestFlexLeft` | Restrained left flex, maximum 0.065 radians |
| `CrestFlexRight` | Restrained right flex, maximum 0.065 radians |

Squash/stretch keep the sole fixed. Crest flex leaves the lower body and eyes
unchanged. Use weights 0–1, mutually exclude opposing body/flex controls, and
apply/reset weights on every mesh. Half/full blink combined with full
squash/stretch is checked for non-degenerate triangles and positive volume.
No armature or baked animation clips are included.

## Files and verification

- `volt.blend`: editable character, morphs, packed textures and studio.
- `volt.glb`: game-facing character asset.
- `volt_model.py`, `generate-volt.py`: reproducible modeling/export recipe.
- `verify-volt.py`: independent saved-source and clean GLB import checks.
- `volt.validation.json`, `volt.roundtrip.json`: geometry, material, texture,
  morph and source-hash evidence.
- `artifacts/volt-polish/` (repository root, ignored): regenerated neutral
  studio renders, exported morph/game-distance captures and browser validation.
  Earlier local captures may remain in the ignored `evidence/` directory.

From the repository root, using this machine's native Windows Blender wrapper:

```bash
/home/kevin/bin/blender --background --factory-startup --threads 8 \
  --python assets/characters/volt/generate-volt.py -- --render
/home/kevin/bin/blender --background --threads 8 assets/characters/volt/volt.blend \
  --python assets/characters/volt/verify-volt.py
```

Omit `-- --render` to regenerate without studio renders. Verification checks
neutral geometry, winding, eye seating, material values, embedded ramp
pixels/UVs, and all five exported morphs. Editable Blender byte identity can
change on save; geometry and GLB identity are checked separately.

## Interactive review

```bash
npx vite build --config vite.volt-preview.config.ts
npx vite preview --config vite.volt-preview.config.ts --host 127.0.0.1 --port 4189 --strictPort
```

Open <http://127.0.0.1:4189/tools/volt-preview.html>. This separate review build
leaves the production game entry unchanged. It offers reset, all morph
controls, a restrained motion demo, front/side/back/three-quarter views,
and studio/unpowered/powered Blackout lighting. It uses the authored Blackout
environment, current game FOV (48°), exposure and 3.5–7 m follow distances.
To recapture checks while the server is running:

```bash
node scripts/diagnostics/capture-volt-polish.mjs
```

Browser evidence uses software-rendered Chromium: it verifies exported
appearance and controls in the lighting fixture, not hardware performance
or production gameplay acceptance. Production lifecycle, animation driving,
collision and ability wiring remain separate from this asset-polish delivery.
