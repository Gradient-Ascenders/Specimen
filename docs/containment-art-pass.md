# Containment art pass

Issue #32 gives Containment a bright clinical biological-testing-facility
language without making presentation authoritative for gameplay. Phase 1.5
establishes the corrected **Clean Biotech Stylized Realism** language in Room 1
only. Rooms 2–5 retain their existing presentation until the Room 1 quality
gate is approved.

## Architectural language

Containment architecture is a clean panel skin over darker machinery:

```text
bevelled ceramic panel faces
        ↓
recessed shadow gaps and occasional service reveals
        ↓
graphite mechanical substrate, mounts, rails, and channels
        ↓
unchanged authoritative gameplay collider
```

Large, asymmetrically composed modules create quiet fields. Smaller modules
and exposed backing cluster only around the specimen machine, locked door,
sticky test surface, vent, and one controlled maintenance reveal. The panels
are shallow visual shells; their centimetre-scale chamfers catch the existing
light without suggesting a different traversal surface.

`ContainmentArtResources.borrowChamferedBoxGeometry()` caches physically sized
`RoundedBoxGeometry` instances by dimensions and bevel radius. Repeated modules
with matching dimensions use `InstancedMesh`; hero housings borrow cached
geometry. This avoids visibly stretching bevels while keeping ownership and
disposal central. The cache is deliberately small in scope rather than a new
general-purpose modelling framework.

## Palette and PBR language

| Role | Base colour | PBR treatment |
| --- | --- | --- |
| Main ceramic | `#e9e7e1` | Warm, clean, non-metallic; 0.62 roughness and an almost imperceptible micro-normal. |
| Secondary ceramic | `#d2d6d4` | Cool pale-grey recesses and equipment faces; 0.66 roughness. |
| Clinical floor | `#bdc4c2` | Slightly darker and broader-highlighted than the panels. |
| Mechanical backing | `#232a2c` | Matte charcoal cavities and substrate; deliberately lighter than crushed black. |
| Graphite structure | `#242b2d` | Manufactured frames, clamps, tracks, and undersides. |
| Service metal | `#718087` | Restrained galvanized duct and service hardware. |
| Gasket | `#111718` | Rubber seals and glass seating, used only at construction joints. |
| Containment glass | `#a6c8ca` | Pale aqua, 0.16 opacity, no emissive contribution, always seated in a gasket/frame. |
| Neutral fixture | warm white | Existing ceiling fixtures read as clinical white rather than turquoise strips. |
| Biological sticky | olive/lime | Wet organic membrane; gameplay accent and not general decoration. |
| Status accents | muted aqua, amber, red | Sparse equipment state and wayfinding only. |

The ceramic, graphite, and service-metal normal responses are deliberately
subordinate to form. The room must retain its hierarchy if every micro-normal
map is disabled. Phase 1.5 adds no lights, shadows, reflection probes,
post-processing, particles, or animated failure effects.

## Gameplay and presentation separation

The existing collider is authoritative. Room art is a separate visual group:

```text
existing gameplay collider
        +
shared production material
        +
visual-only modular dressing
```

Visual objects carry `userData.visualOnly = true` and are never added to
`collisionMeshes`. `surfaceTag`, `movementFaceMode`, `interactionRole`, and
`textureRole` remain collider metadata. Material names and colours are not read
by movement or puzzle code.

`tests/fixtures/containment-colliders.json` freezes the complete development
collision route as world position, world quaternion, world scale, local
dimensions, gameplay metadata, soluble state, and parent path. Production must
match that fixture after removing only the explicitly named Room 1 development
soluble barrier. Missing `movementFaceMode` values normalize to the current
authoritative default, `all`; numeric values are rounded to six decimal places
only to suppress irrelevant floating-point noise.

The former always-visible black `EdgesGeometry` outlines are absent from
production. When debug tools are available, a hidden-by-default collision
overlay attaches shared line geometry to each collider and inherits moving
transforms. Cyan means default, magenta means sticky, and amber means soluble.
The overlay is visual-only and is disposed before its scene.

## Shared resource ownership

`ContainmentArtResources` is the single level-owned resource library:

```text
ContainmentArtResources
├── 9 deterministic DataTextures
├── 20 shared materials
├── shared primitive geometries
├── a physically sized chamfer-geometry cache
└── idempotent dispose()
```

Room art borrows these resources and never disposes them. Room 1 owns only its
unique organic membrane, egg-state, crack, shard, and sign-plane geometry. The
level disposes consumers before the shared library. Repeated disposal is safe,
and create/dispose/recreate tests assert stable counts and references. Static
art has no update hook and creates no per-frame resources.

## Procedural textures and graphics

All Phase 1/1.5 texture and graphic data is project-authored and generated once
in memory without DOM canvas APIs or downloaded assets:

- 64 × 64 restrained ceramic normal and roughness;
- 64 × 64 graphite/service-metal normal and roughness;
- 64 × 64 organic sticky membrane normal and wet roughness;
- 64 × 64 related sticky-vent normal and wet roughness;
- 512 × 256 antialiased vector-stroke signage atlas.

The atlas contains the concise identifiers `C-01 / BIOLOGICAL CONTAINMENT`,
`SP-01 / SPECIMEN TEST BAY`, `LOCKED / DOOR C-01`, and
`VENT ACCESS / SERVICE ROUTE`. A project-authored stroke alphabet avoids a
font/runtime dependency and the old 5 × 7 pixel aesthetic. Warm white type,
muted subtitles, generous negative space, and a single semantic accent bar form
the provisional Specimen facility identity.

Generation is deterministic. Non-colour maps use `NoColorSpace`, repeat
wrapping, and mipmapped linear filtering. The signage atlas uses sRGB and clamp
wrapping. The nine uncompressed RGBA source buffers total 655,360 bytes before
GPU mipmaps.

## Sticky language

Sticky surfaces remain identifiable without colour. The Room 1 wall is an
irregularly edged organic membrane seated in a graphite containment recess,
with sparse large relief bulges, three tendril-like ridges, a cellular normal,
wet response, clamps, and a dark gasket. The previous grid of physical suction
rings has been removed. A grayscale evidence capture verifies that silhouette,
depth, relief, and framing—not lime colour alone—carry the distinction.

The vent variant is smaller scale and recessed inside a deep galvanized duct
collar with purposeful ribs. Its geometry stays shallow in the tight camera
volume. Ordinary ceramic never uses either membrane map or relief language.

Containment currently has no `nonStick` or `bouncy` collider tags. Phase 1.5
therefore authors neither presentation. Ordinary platforms remain ordinary;
Bob's existing innate rebound is unchanged.

## Room 1 hero hierarchy

```text
room-1-specimen-assembly
├── room-1-pedestal-dressing
├── room-1-containment-box-root
│   ├── room-1-containment-box-intact-frame-and-panes
│   └── room-1-containment-box-shattered-frame-and-debris
└── room-1-egg-root
    ├── room-1-egg-state-intact
    ├── room-1-egg-state-crack-stage-1
    ├── room-1-egg-state-crack-stage-2
    ├── room-1-egg-state-crack-stage-3
    └── room-1-egg-state-half-broken
```

The visual containment machine now uses a mounted floor plinth, substantial
instrumented lower base, gasketed pale glass, four strong supports, an upper
service housing, asymmetrical control block, feed neck/coupler, and a connected
side pressure line. It avoids cage-like grids and decorative emissive bars.
The containment-box root can still tip or translate independently later. Its
intact and shattered groups remain deterministic static alternatives.

Egg states use the shared shell sphere plus cumulative shallow tube cracks; the
half-broken state uses an owned hemisphere, dark interior, and rim. `reset()`
restores an identity box transform, intact panes, and exactly the intact egg
state. Issue #32 does not animate or schedule these states.

## Room 1 composition

The opening composition leads from the specimen machine to an integrated false
lead door, then to the framed sticky membrane and darker vent escape. The door
has a recessed cavity, substantial jamb/gasket, one bevelled sliding slab,
track, top actuator, and a small red state instrument; it no longer reads as a
stack of decorative rectangles. The machinery is exposed only at focal points,
leaving most of the room controlled and intact.

The room is approximately 90% pristine and 10% strained: one service reveal,
organic membrane pressure at its frame, and restrained warning status imply a
problem without a grime or abandoned-facility pass.

## Issue #33 boundary

Issue #32 owns the static environment-art foundation and cutscene-ready static
states. Issue #33 still owns lighting redesign, shadow tuning, animated alarms,
flicker, sparks, smoke, particles, release VFX and animation, bloom,
post-processing, and other dynamic containment-failure presentation.

Room 1 remains the approval gate. Do not propagate this language into Rooms
2–5 until its shape design, hierarchy, route readability, and cost have been
reviewed.
