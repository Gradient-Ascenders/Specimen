# Rendering and assets

## Renderer boundary

`RenderLayer` owns the renderer, canvas, root scene, camera rig, resize policy,
colour-space configuration, and application frame render. Level scenes own
their lights, environment effects, materials, meshes, and render resources.
Gameplay collision always uses authored primitives and registries; deforming
visual meshes, colours, names, and shader output are never gameplay authority.

The renderer uses a relative Vite base so built assets work at a domain root or
nested static-host path. Runtime asset references must remain Vite-managed or
relative and must match Linux filename casing.

## Title-room presentation

The normal entry point (development and plain production, with or without
`?debug=1`) presents `TitleScreenScene` behind the title menu. It is a bespoke
circular observation room using Room 1's ceramic/metal material language, not
`RoomOneArt` or a gameplay room. Its cylindrical glass pod has a machined
pedestal, illuminated seals, slim stanchions, crown and instrument readouts.
There are no sticky walls, vents, platforms or other gameplay obstacles. A
closed, tapered egg is independent of gameplay/recording state.
There is no second WebGL context, character GLB load, fracture simulation or
postprocessing chain. The sealed room supports a 72-second full camera orbit;
the camera always looks at the egg and a view offset keeps it clear of controls.
The shell rocks from its base for 1.4 seconds every 5.5 seconds,
first at 2 seconds. Its softened, roughly 12-degree peak rocking moves the top much more
than the bottom. Contact height is calculated from the fixed geometry, keeping
the shell seated without updating vertex buffers. Analytic surface normals keep
the tapered shell smooth across UV seams and poles. The pod's slim supports
remain visible but do not cast stripes onto the egg; other shadows are retained.
A curved identification plate replaces the four-light status panel on the front
of the pedestal: `SPECIMEN: BOB` above `DANGER THREAT: UNKNOWN`.
Its pale lettering, amber threat status and cyan accent
use one static 512×192 texture generated with the existing vector-sign font.
It stays fixed to the container during shaking and is disposed with the title room.

`TitleScreenPresentation` uses the existing application loop but submits at most
30 animated frames/second, skips gameplay updates/rendering while the title owns
the screen, and pauses with the existing focus/visibility lifecycle. Its temporary
921,600-pixel budget applies after Level 1's lighting primers, never overwrites
the player's density preference and is removed on Start. The room has four
fixed light slots, only one shadowed (512×512). That map is reused at rest and
updated during wobble/settling. A 32-point dust pool moves as one object; there
are no per-frame geometry, material or particle-buffer allocations.

Title-origin settings/credits retain the backdrop. Start disposes the room,
shadow, textures and instance buffers, restores gameplay resolution and records
the shader guard baseline without title-only programs. HMR cleanup also
handles preparation still in flight. Reduced-motion users get a still view that
only redraws on resize, DPI or preference changes.

The title menu uses an oversized pale wordmark, a compact logo/tagline signature,
a fine cyan divider, two-line atmospheric copy and unnumbered text actions.
There is no trial-number eyebrow, right-side observation caption or extra
"press any key" step. These are title-scoped HTML/CSS changes: gameplay and pause
menus retain their styling, with no new scene effects, assets or shader work.
Portrait and short-window layouts keep the three menu actions accessible, with
explicit keyboard-focus outlines and the existing reduced-motion behavior.

Unit coverage verifies a seamless full orbit, inward-facing camera, contained
egg motion, fixed resource counts, render throttling, shadow-policy restoration,
resolution bounds and idempotent disposal. `tests/browser/TitleScreen.spec.ts`
covers plain/debug entry, large-title sizing, desktop/portrait/short-window
menu visibility, resizing, submenus, reduced motion and Start handoff;
the nested-path production smoke also checks the title. Run the browser file
against a development server with `SPECIMEN_PRODUCTION_URL=http://127.0.0.1:5173`
or against the built preview using the default Playwright configuration. Browser
and GPU playtesting have not been performed for this change; caps and unit
checks are not measured hardware frame-rate evidence.

## Materials, lighting, and shadows

Shared presentation helpers may reuse geometry, materials, and procedural
textures, but ownership must be explicit. The creator disposes a resource once;
borrowers must not dispose it. A level unload must return renderer geometry and
texture counts to their stable warm values.

Shadow maps are reserved for lights and geometry that materially improve
navigation, hazard readability, or character grounding. Static room shadows
should be prepared and cached where supported. Dynamic character and device
casters remain bounded. New lights require a documented role and an evaluation
of map size, render passes, and first-entry cost.

Later-level presentation can be prepared asynchronously before handoff. A
preparation task must be cancellable, must not attach its temporary scene to the
live game, and must dispose temporary render targets, shadow maps, geometries,
and materials on completion or cancellation. Runtime rendering must remain
correct when preparation is skipped or fails.

## Character and content assets

Production Bob is loaded from `assets/characters/bob/bob-authored.glb`; its
kinematic sphere remains the gameplay body. Runtime deformation may change
scale, morph targets, facing, eyes, and materials, but must preserve the
collider/visual separation and restore neutral state on reset.

Keep only production assets and the source/generator inputs required to
reproduce them. Candidate renders, approval screenshots, rejected models, and
capture output belong in external review artifacts. A generated production
asset should have a deterministic validation contract when source provenance or
mesh structure is important.

## Verification

For rendering changes, verify the ordinary journey and affected level under a
production build. Check narrow and wide viewports, restart/unload cycles,
console and network output, WebGL errors, shader-program counts, and stable warm
geometry/texture counts. CPU/SwiftShader browser checks are correctness smoke
tests, not hardware performance measurements.
