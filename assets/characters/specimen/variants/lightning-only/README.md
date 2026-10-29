# Specimen — lightning only

Separate variant of the existing Specimen. The body, eyes, crest, yellow tips,
lightning veins, materials and retained animation tracks are unchanged.
`Specimen-Aqua-Currents` (aqua ribbons) and `Specimen-Acid-Core` (green core,
heart and swirls) are removed.

- [Editable Blender model](specimen-lightning-only.blend), including the existing studio.
- [Animated GLB](specimen-lightning-only.glb), character only.
- Optional front and three-quarter studio renders are generated locally in ignored `evidence/`.
- Generation and export checks: `specimen-lightning-only.validation.json` and
  `specimen-lightning-only.roundtrip.json`.

The original `../../specimen.blend`, `../../specimen.glb` and their generators
are preserved. The game loads this variant through
`src/render/specimen/SpecimenAsset.ts`, retaining the existing gel shaders,
lightning charge response, camera handling and gameplay presentation lifecycle.

The variant contains four authored meshes, six exported material regions,
five materials and 81,040 triangles. Its morph animations remain `Idle` (5 s),
`Settle` (2 s) and `Charge` (3 s), including the two lightning emission tracks.
GLB material emission animation uses `KHR_animation_pointer`, as in the original.
Press F12 in the Blender file to render the studio materials; Material Preview
does not reliably show the lightning through nested transmission.

Regenerate from the current original Blender model, from the repository root:

```bash
/home/kevin/bin/blender --background --factory-startup --disable-autoexec \
  --python assets/characters/specimen/variants/lightning-only/generate-lightning-only.py \
  -- --render
node assets/characters/specimen/variants/lightning-only/verify-lightning-only.mjs
```

The generator checks retained geometry and morphs against the source before
and after export and verifies that the original files' hashes do not change.
The verifier loads both GLBs through the game's parser and checks exact retained
geometry, colours, morphs, transforms, material definitions and animation samples.
