# Renderer shadow ownership

Issue #169 establishes the renderer boundary for the phased work in #168.

`RenderLayer` owns shadow policy: `PCFShadowMap`, disabled without a request,
updated every frame for live scenes. A level calls
`requestShadowConfiguration(owner, { enabled })` and retains the returned
request until unload. The newest live request controls the renderer. Updating
an older request does not override the current owner; releasing an older
request cannot turn off a newer level. Releasing the current request restores
the newest surviving request, or the disabled default. Disposal is idempotent;
renderer disposal invalidates outstanding requests.

Lights, map sizes, shadow cameras and allocated render targets remain owned by
level lighting/presentation. RenderLayer does not dispose level lights. Camera,
exposure, tone mapping and gameplay are independent of this policy.

Containment requests shadows after successful load. Cultivation requests its
existing light/dark section behavior, and Blackout requests its existing
maintenance-drone shadows. These are boundary migrations only: their encounter
coverage, caster selection and light resources remain for #172.

Preparation uses `withShadowPreparation(enabled, action)` for synchronous
compile/draw setup. It selects PCF with automatic/forced map updates disabled,
and restores enabled/type/autoUpdate/needsUpdate in `finally`, before a returned
compilation promise yields. This prevents isolated uploads from overwriting a
live map with their temporary render layers. It does not cache live shadows.

## Room 1 proof

The existing `room-1-pedestal-soft-key` is the only shadow source added in
Containment. Position `(0, 6.4, -0.5)`, target `(0, 1.65, -0.5)`, color
`#d9efff`, intensity `62`, range `10 m`, angle `0.48`, penumbra `0.72` and renderer
exposure `1` retain their authored values. Existing hatch-state intensity
mappings continue to drive this light.

The map starts at `1024 × 1024`, near `0.35 m`, far `10 m`, bias `-0.0001`,
normal bias `0.015 m`, PCF radius `1.5`. Three.js derives the spotlight's far
plane from its distance; reducing only `shadow.camera.far` would be overridden.
At the floor, the cone covers approximately a `3.33 m` radius around the
pedestal. This is a central Room 1 proof, not complete traversal coverage.
Relevant wall art receives shadows where the cone reaches it; later room and
adhesion coverage belongs to #171.

Bob uses authored morphs in the default depth pass and casts/receives shadows.
Major opaque pedestal and containment frame meshes cast/receive; the floor and
selected wall art receive. Glass, particles, beams and hidden collision-only
surfaces are excluded. Wall receivers are selected after static consolidation,
using source names, preserving measured geometry owner/batch identities.

Secondary shader displacement, camera fades, death and switching shadow
correctness remain explicitly tracked by #170. No custom character shadow
material or duplicate character animation authority is introduced here.

## Preparation and lifecycle

Room 1 needs a hidden first draw as well as `compileAsync`: compilation alone
does not allocate the light map or compile caster depth programs. The exact
measured-resource shader variants are compiled with the Room 1 light layout
before their isolated upload guard runs. Preparation reuses one camera across
loads, because Three.js caches transmission render targets per camera.

- Successful load retains one request and one lazily allocated spotlight map.
- Restart and checkpoint retry reuse the map. Lighting, pose and cutscene state
  reconcile through existing reset/recovery authority; automatic updates render
  the current geometry on the next frame.
- Failed asynchronous preparation unloads its current resources, releases the
  request, disposes the map and restores the prior renderer owner. Generation
  checks prevent an obsolete preparation from changing a later load.
- Unload/dispose cancels preparation, disposes the level lighting map once,
  clears map references, and releases the request. Repeated unload/dispose is
  safe. Three.js disposes the attached depth texture with its render target.

See [Room 1 evidence and initial budget](evidence/issue-169/review.md) for the
hardware baseline, matched captures, lifecycle counts and acceptance limits.
Full production traversal/prewarm profiling remains #173.
