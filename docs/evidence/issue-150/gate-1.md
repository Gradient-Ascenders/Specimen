# Issue #150 — Bob Gate 1 geometry evidence

Status: revised after the first Gate 1 rejection and awaiting renewed visual
approval. Gate 2 materials and Gate 3 morph/motion work have not started.

The supplied cyan-slime concept sheet is the visual direction. These captures
deliberately keep the body neutral grey, with only a basic dark gloss on the
projecting eye lenses. There is no gel, transmission, wobble or animation to
disguise the geometry.

## Blender MCP refinement and generator roundtrip

- [Front viewport](gate-1/blender-viewport-front.png)
- [Three-quarter viewport](gate-1/blender-viewport-three-quarter.png)
- [Side viewport](gate-1/blender-viewport-side.png)
- [Gameplay-distance viewport](gate-1/blender-viewport-gameplay-distance.png)

The body and eyes were adjusted in the open `.blend` through Blender MCP, then
the accepted profile was reconciled into the deterministic generator. These
captures were taken after regenerating and reopening that generated `.blend`;
they are not screenshots of an unsaved sculpt-only state.

## Primary gameplay views

- [Default 5.2 m gameplay camera in open Level 1 space](gate-1/gameplay-default-camera.png)
- [Closest supported 3.5 m gameplay camera at the Room 1 spawn](gate-1/gameplay-closest-camera.png)

Both captures came from the production Vite build at 1440 × 900 in headless
Chromium 149. The verification exercised keyboard movement and the player-facing
restart path. The browser reported no console errors, page errors or failed
requests.

## Neutral turnaround and contact

- [Front](gate-1/front.png)
- [Side](gate-1/side.png)
- [Back](gate-1/back.png)
- [Three-quarter](gate-1/three-quarter.png)
- [Top-oblique contact](gate-1/top-oblique-contact.png)
- [Wall-oriented](gate-1/wall-oriented.png)
- [0.45 m spherical collider overlay](gate-1/collider-overlay.png)

## Topology

- [Full-body wireframe](gate-1/wireframe-full-body.png)
- [Eye-seat wireframe](gate-1/wireframe-eye-seat.png)
- [Underside wireframe](gate-1/wireframe-underside.png)

The body is one connected watertight quad surface with no seam, separate contact
mesh or duplicate shell. Its softened underside converges into the resting
contact without a skirt or lip. Each eye is one shallow conformal lens patch.

## Export contract

| Property | Exported result |
| --- | ---: |
| Body dimensions | 1.00 × 0.80 × 0.90 m |
| Body bounds | (-0.50, -0.45, -0.45) to (0.50, 0.35, 0.45) m |
| Body vertices | 1,178 |
| Body triangles | 2,352 |
| Eye triangles, combined | 504 |
| Total triangles | 2,856 |
| Body connected components | 1 |
| Body non-manifold edges | 0 |
| Armatures / morph targets / animations | 0 / 0 / 0 |
| Runtime up / forward | +Y / -Z |

The machine-readable report is
[`bob-gate-one.validation.json`](../../../assets/characters/bob/bob-gate-one.validation.json).

## Reproduce

From the repository root:

```bash
blender --background --factory-startup --python assets/characters/bob/generate-bob-gate-one.py
blender --background assets/characters/bob/bob-gate-one.blend --python assets/characters/bob/render-bob-gate-one-evidence.py
node --test tests/BobGateOneAsset.test.ts
node --test tests/BobCharacterPresentation.test.ts
npm run build
```

The generator is the source of truth. `bob-gate-one.blend` is the editable
inspection artifact and `bob-gate-one.glb` is the runtime artifact. The runtime
validator rejects renamed meshes or materials, non-identity transforms,
dimension/budget drift, exported axis/collider/contact metadata drift,
eye-envelope drift, premature morphs, extra meshes and non-watertight body
topology before attaching the model to
`BobCharacterPresentation`. The report records stable generator and runtime-GLB
hashes, which the offline asset test verifies against the committed files; it
omits a `.blend` hash because Blender embeds save-specific container metadata
even when the generated scene and GLB are unchanged.

## Gate boundary

This gate establishes only neutral geometry and the reusable Level 1 loading,
lifecycle, visibility and disposal boundary. It intentionally does not claim
approval for translucent gel, final eye look-development, catchlights, named
body or eye morphs, expressions, support-frame transitions, locomotion,
traversal reactions, shader-secondary motion, or representative-hardware
performance.
