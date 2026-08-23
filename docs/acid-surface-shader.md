# Room 3 acid surface shader

Issue #32 replaces Room 3's static green foundation with a lightweight,
project-authored hazardous-chemical surface. The hidden
`room-3-acid-floor` mesh remains the authoritative collider and hazard route;
the shader belongs only to the separate visual mesh
`room-3-acid-surface-material-integration-point`.

## Architecture and ownership

`AcidSurfaceMaterial` extends `MeshStandardMaterial` through a bounded
`onBeforeCompile` insertion. This retains Three.js's existing Room 3 point,
directional and hemisphere lighting, dielectric specular response, fog,
Neutral tone mapping and sRGB output. A standalone `ShaderMaterial` would have
needed to duplicate that lighting contract for no gameplay or visual benefit.

`RoomThreeArt` creates and exclusively owns one acid material. Its idempotent
`dispose()` removes the visual group and disposes that material before
`ContainmentLevelScene` disposes the borrowed `ContainmentArtResources` maps.
The acid owns no texture. It borrows the existing static foundation albedo and
ceramic micro-normal map, so the effect adds no texture residency.
The static maps also leave a conservative standard-material foundation if the
custom insertions are disabled during development.

Checkpoint recovery and the player-facing full-level restart both reset the
existing Containment scene in place. They do not recreate or rewind the
environmental material, so the same uniform object and accumulated `uTime`
continue when play resumes. Only unloading/disposing the level and constructing
a new `ContainmentLevelScene` creates a fresh material beginning at `uTime = 0`.
Repeated dispose/recreate cycles therefore still produce exactly one material
and uniform set per scene instance without leaks.

## Coordinate and update model

The vertex insertion passes the already-transformed position through
`modelMatrix` as `vAcidWorldPosition`. The fragment algorithm uses world `x/z`
in metres. This is deliberate: the visual box uses a non-uniform scale, so raw
unit-box UV or object coordinates would stretch the pattern across the
32.7 × 26.7 metre basin. World coordinates keep feature sizes uniform,
spatially fixed and independent of camera motion or output resolution.

There is no vertex displacement. The surface silhouette and the flat collision
contract remain aligned. Fragment derivatives turn the procedural scalar
height field into a small view-space normal perturbation for moving highlights;
this affects reflected light only.

The existing fixed update follows this exact path:

```text
GreyboxLevelRuntime.fixedUpdate(deltaSeconds)
        ↓
ContainmentLevelScene.update(deltaSeconds)
        ↓
RoomThreeGreybox.updatePresentation(deltaSeconds)
        ↓
RoomThreeArt.update(deltaSeconds)
        ↓
AcidSurfaceMaterial.update(deltaSeconds)
        ↓
existing uTime uniform object's value changes
```

No independent animation loop exists and the update allocates nothing. Visual
time advances only while the repository's level update advances.

## Fragment stages

The shader is evaluated in this order:

```text
world-space basin coordinate
        ↓
broad slow value-noise warp
        +
smaller counter-moving value-noise warp
        ↓
three differently scaled/rotated three-octave fluid fields
        ↓
dark body variation
        ↓
thresholded film islands and thin film boundaries
        ↓
deterministic sparse bubble lifecycles
        ↓
procedural height → fragment-derivative normal perturbation
        ↓
standard PBR roughness/specular + restrained emission
```

The noise is handwritten deterministic two-dimensional value noise. Cubic
interpolation joins hashed lattice values; three fixed octaves build broad
organic shapes without a noise texture or external shader library. Two domain
warps use different scales, directions and rates. Subsequent fields sample the
warped domain, so the result deforms and circulates instead of reading as two
scrolling layers.

Film comes from a thresholded blend of the broad body field, the counter-moving
secondary field, and a smaller detail field. A second higher threshold isolates
the cores; their difference forms restrained broken boundaries. Most fragments
remain the darker body colour.

Bubble sites use a world-space 5.2 metre cell neighbourhood. Hashes choose a
jittered point, selection probability, size, phase offset and 11–18 second
lifetime per cell. Only selected cells run through fade-in, slow radial growth
and fade-out. Each fragment checks the fixed 3 × 3 neighbouring cells; there
are no bubble objects, meshes or per-frame allocations. The interior slightly
darkens/depresses the normal field while the thin edge becomes paler and
smoother. Jitter, rejection and independent phase offsets prevent grids and
synchronised pulses.

## Colour, wet response and uniforms

The colour hierarchy is dark olive body → muted chartreuse body variation →
selective olive-lime film → pale lime-yellow bubble edge. The body remains the
majority and is substantially darker than Bob. The existing foundation albedo
contributes only a very small micro-variation.

Standard PBR roughness is approximately `0.29` on exposed fluid, rises toward
`0.46` on scum, and falls near `0.17` on fresh bubble rims. The procedural
normal perturbation makes these wet highlights move with the fluid field.
Three.js supplies the normal dielectric Fresnel response at grazing angles;
the shader adds only a small film/bubble/grazing emissive accent. It does not
light the chamber and does not use reflections, refraction or render targets.

| Uniform | Default | Purpose |
| --- | ---: | --- |
| `uTime` | `0 s` | Shared update-driven visual clock. |
| `uDeepColour` | `#1f2d09` | Majority dark chemical body. |
| `uMidColour` | `#506719` | Muted chartreuse body variation. |
| `uFilmColour` | `#91ad3b` | Selective scum islands/boundaries. |
| `uBubbleColour` | `#c0cf63` | Sparse bubble-edge accent. |
| `uFlowSpeed` | `0.082` | Slow domain-warp animation rate. |
| `uFlowScale` | `0.17 m⁻¹` | Broad circulation feature scale. |
| `uBubbleScale` | `5.2 m` | Sparse procedural cell spacing. |
| `uBubbleStrength` | `0.64` | Bubble colour/height mask weight. |
| `uEmissionStrength` | `0.025` | Restrained film/rim readability only. |

## Performance

The acid remains one existing mesh, material and draw call. It adds no geometry,
scene objects, render passes or textures. The fragment cost is fixed: unrolled
three-octave value noise, a fixed 3 × 3 bubble-neighbour loop, derivatives and
ordinary scalar blending. No traversal or resource creation occurs per frame.
The effect is intentionally limited to the single basin surface.

The GLSL and procedural model were authored for Specimen. No external shader
code, texture or technique resource was adapted, so `CREDITS.md` needs no new
entry.
