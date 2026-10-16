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
Its pale lettering and blue UNKNOWN threat status/accent
use one static 512×192 texture generated with the existing vector-sign font.
It stays fixed to the container during shaking and is disposed with the title room.

`ContainmentSpecimenPod` supplies the same round pedestal, curved glass, seals,
crown, stanchions and identification plate to the title, opening and playable
Level 1 Room 1. Each scene owns its pod's few unique geometries and static label;
room materials and cylinder geometry remain borrowed. A fixed ceiling flange,
motor sleeve and telescoping piston support the crown throughout its lift.
The gameplay pedestal uses collision-only compound boxes matched to the four
visible round sections, sharing four geometries; the top is at 1.65 metres,
not the old 1.1-metre greybox height. The raised chamber also has 16 thin,
overlapping collision-only glass panels and two compound round crown sections,
using three shared box geometries and the existing precise movement-corner mode.
They match the final post-hatch pose, block
both sides of the glass and its solid top, and leave its bottom/interior open
so the pedestal remains usable. These colliders stay static across restart and
add no transparent draw calls, shadow passes or per-frame transform updates.
The rest of the route is unchanged. The obsolete SP-01 plaque and its backing
are removed in favour of the curved Bob identification plate.
After the opening, Room 1 retains the same raised chamber pose and
an empty pedestal rather than respawning the egg or reverting to the old square
container. Restart reapplies that state without new objects or resources.

`TitleScreenPresentation` uses the existing application loop but submits at most
30 animated frames/second, skips gameplay updates/rendering while the title owns
the screen, and pauses with the existing focus/visibility lifecycle. Its temporary
921,600-pixel budget applies to the observation chamber and is combined
with the selected graphics profile's budget using the tighter limit. It uses the
shared bounded-resolution resolver, including device limits and transmission-safe
minimum dimensions, never overwrites the player's profile/density/scale settings,
and is retained for the opening cinematic. Diagnostics report the active budget while it applies.
`RenderLayer.setPresentationResolution` targets one rendered pixel per CSS pixel
at 100% scale while the cap is active, instead of inheriting Minimum's 75% gameplay
scale. Windows within budget (including 916×960) therefore do not upscale a smaller
image; larger windows still respect the tighter profile/presentation and device
limits. Trailer playback uses the same bounded presentation override. The opening
handoff restores the currently selected gameplay density and scale.
The room has four fixed light slots, only one shadowed (512×512). That map is reused at rest and
updated during wobble/settling. A 32-point dust pool moves as one object; there
are no per-frame geometry, material or particle-buffer allocations.

Title-origin settings/credits retain the backdrop. Start transfers the actual room
and container to the opening; its final handoff disposes the room, shadow, textures
and instance buffers, restores gameplay resolution and records the shader guard
baseline without cinematic-only programs. HMR cleanup also
handles preparation still in flight. Reduced-motion users get a still view that
only redraws on resize, DPI or preference changes.
The saved Reduce menu motion setting also requests this still view; disabling it
never overrides a system reduced-motion preference.

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

## In-game opening

Ordinary Start uses the same `src/main.ts` flow in development and production:
`title → opening → playing`. The original standalone `?trailer=opening` capture
is still independent. The default opening is the live scene in both builds
(`?opening=live` also explicitly selects it). The committed 1080p/30fps H.264 MP4
and its native HTML player remain an opt-in `?opening=mp4` backup, not a WebGL
video texture. Ordinary Start does not download the backup. See
[opening movie operations](../operations/opening-movie.md) for exporting,
encoding, playback and loading details. The backup contains its fixed 16:9
video without cropping on narrower screens. Both paths use the same sequence.

The 54-second `OpeningGameTimeline` first fades the menu to black, reveals a
sealed 74-metre experiment wing and glides between four labelled specimen doors under
scanning surveillance cameras. Doors are staggered 13 metres apart (26 metres
between neighbours on the same wall) to suggest large chambers beyond them.
Each plaque uses one row of a single static
512×1024 atlas and shows an experiment name plus colour-coded danger status.
The first experiment is PLUTO. LOW threat is green; Bob's UNKNOWN status is
blue on both the doorway directory and shared menu/cutscene/gameplay pod label.
The retired ECHO/NULL doors are absent; Bob's room is 26 metres closer and the
tour is 10.4 seconds shorter without speeding up the remaining pans.
The camera advances at constant height and forward speed throughout the wing,
including while reading labels. Separate eased yaw and pitch controls produce
slow horizontal pans, followed by a small upward label tilt; they never blend
opposite world-space look-at targets through the roof. Portrait framing widens
the lens rather than changing this path. At
Bob's `SP-01 / EXPERIMENT: BOB / DANGER: UNKNOWN` door, the leaves open before the
camera crosses a real opening aligned with the authored Room 1 door and close behind it.
After the blackout, `OpeningRoomOne` uses Room 1's actual `RoomOneArt` wall
panels, service dressing, sticky route, vent and mounted ceiling fixtures inside
the same 14×12×8 metre rectangular shell. It excludes the duplicate specimen
assembly and static locked door; the original menu pod/egg and animated door
remain the heroes. A short sealed vent continuation prevents void views. The
separate circular menu environment is hidden, not superimposed on this room.
The pod's fixed suspension adapts to the authored 7.85m ceiling underside.
The facade has a full-width transom joining the corridor roof, sealing the old
gaps above the door. Menu light strips also have housings anchored into the wall,
rather than floating between its panels.
The doorway transom replaces the final redundant hallway crossbeam, keeping the
entire Bob plaque unobstructed during approach, including its upper text rows.
The leaves slide through hollow, front/back-covered side pockets instead of
solid jambs. Guide, threshold and wall-trim clearances cover the full stroke;
the fixed casing pieces share three material instance batches.
The final 21.6 seconds stage progressive cracks and increasingly
aggressive rocking. Crack ribbons grow in small, complete seam segments over five
seconds rather than appearing in three instant groups. Three close-ups face the
actual seam waves (including the first wave's path down the back), so growing
cracks remain in view rather than forming only on the hidden side. The shot
widens for the physical glass lift. The fully cracked egg
holds briefly before the menu container's crown/glass retracts, then the egg
tips off its pedestal. The matching fracture pieces separate only on floor
impact. `OpeningGameScene` borrows the exact menu shell silhouette for those
pieces. Gravity, support-height bounds and separating planes keep settled shell
pieces above the floor and clear of Bob. The same authored Bob is posed inside from
the beginning; continuous scale/pose changes spread him into a squashed gel shape
and gather him into the normal model. The fully gooey pose holds for 0.25 seconds,
then reforms over one eased second; egg cracking, falling and the final fade keep
their existing timing. There are no ejected fluids or replacement
character spawns. Brief camera cuts, a small impact jolt, letterboxing and a final
fade provide framing; reduced-motion preference attenuates shaking/jolt.

Only the small menu room blocks initial title readiness. The initial DOM fade
retains the warmed menu frame. Default live Start constructs hatch/laboratory
scopes and prepares their own programs behind the initial blackout. The full
first corridor view is primed under the opaque fade and fenced before reveal.

During the live film, Level 1 performs only allowlisted light work: three
low-priority character/detail downloads (about 1 MB combined), plus plain index
data preparation for the 51 KB detail bank when a browser idle callback has at
least 4 ms available. Data exceeding 64 KiB is deferred, and no timeout forces
work into busy frames. Unsupported browsers retain raw bytes only. Models remain
encoded, with no world construction, geometry/textures, shader compilation or GPU
work. Full gameplay preparation starts after the fully painted final blackout
(or Skip), avoiding competing live 3D workloads. The bank reuses fetched bytes
for independent character instances and copies prepared index data per owner,
with normal-demand retry for failed speculative downloads. Promotion to full
preparation and disposal cancel pending idle callbacks without waiting for them.

The opt-in native MP4 backup instead releases the menu's CPU/GPU resources after
black has painted. Once video playback begins, it downloads at high priority,
constructs the world, parses character assets and performs the existing complete
shader / first-use preparation during playback. Deferred shader bindings resolve
separately; uploads use at most eight leaf objects per slice, then retain the
original mixed transmission/VAO pass. Steps yield for 33ms after cheap jobs and
80ms after costly ones; Skip/end removes that extra pacing. This experimental
backup can still contend with decoding/playback; it is not the default. Both
paths use real isolated framebuffers without clearing a visible cinematic.

Both paths keep gameplay simulation, input, HUD and debug controls disabled.
Skip (button, Escape or controller B) skips the film, not readiness. A slow load
holds at the faded ending; failed preparation exposes Retry. Gameplay cannot
start before full preparation and a nonblocking GPU fence finish. Automatic
completion does not request pointer lock without a user gesture; the existing
canvas click captures the mouse. Hidden tabs pause playback and disposal releases
media resources/callbacks as well as any retained scene.

The opening shares the existing renderer/loop, four menu light slots, one 512px shadow
map and the bounded 921,600-pixel presentation policy. Readable plaques accompany
restrained hemisphere fill and a 165-intensity hatch key (previously 340), with a
weaker neutral cool rim instead of purple spill. No additional lights or shadow
passes are used. The opening's DOM surface explicitly removes the generic
menu's 88%-opaque purple/black scrim; only the authored fade darkens the cinematic.
The wing uses ten static material/geometry instance batches. Security cameras
have a wall bracket, painted sunshade/housing, lens barrel, optic and hinge details
on scanning yaw/tilt joints, with a roughly 2.5-times-faster sweep than the first
version (and stationary joints for reduced motion). Each retains three shadowless draw objects (two
coloured instance batches and a recording LED), with no render-to-texture video
feeds. Only the corridor is visible before Bob's door opens, both scopes
overlap during entry, and the corridor is hidden for the hatch. Static corridor
depth is reused while only the camera/recording heads move; fracture/support-height
work is not repeated for the hidden static egg. The uncracked egg uses the exact
single menu shell, not six multi-material fragments. Bob remains in his authored
pose but is not submitted while fully enclosed, avoiding his full-scene physical
transmission capture until the first opening on impact. Settled fragments reuse
their final transform instead of repeating support/clearance vertex scans.
The shorter corridor and pooled doorway casing reduce its visible mesh-object
budget from the original 46 to 35. Crack growth changes draw ranges only, with
no per-frame geometry allocations or vertex-buffer uploads.
The real Room 1 dressing is consolidated into static material/cell batches,
without loading another gameplay simulation or increasing the four-light budget.
One compilation exposes both scopes, followed by two isolated resource-upload
views before playback.
It submits at most 30Hz,
does not advance in hidden tabs, and allocates no per-frame geometries/materials.
Its final handoff paints a warmed gameplay frame before the browser can present,
retains Room 1's raised-container aftermath on restart, and disposes cinematic resources
once. Shutdown cancels scheduled startup work and ignores late async callbacks.

`tests/OpeningLaboratory.test.ts` checks continuous forward travel, room spacing,
bounded pan speed/tilt, desktop/portrait framing and unobstructed plaques,
the open portal crossing, sealed overhead transom, authored room dressing,
full-stroke leaf/casing/wall clearance and pocket
occlusion, security camera sweep speed, light/draw-object
bounds, cached depth, separate yielded construction/GPU jobs, cancellation before
or during construction, offscreen preparation and ownership/disposal.
`tests/OpeningGame.test.ts` checks timing, menu-object reuse, actual authored Bob,
grounded fragments, clearance, hidden transmission suppression, settled-debris
reuse, progressive crack growth and desktop/portrait ray-tested seam visibility
before lid movement, blackout-before-setup scheduling and readiness/skip/hidden-tab/disposal boundaries.
`tests/ContainmentPrewarmScheduling.test.ts` exercises the real Level 1 resource
sequence with a submission spy for both parallel and synchronous compilation:
one compile/draw per yield, restored renderer state and cancellation, while all
23 measured first-use owners retain preparation. This is not a GPU benchmark.
`tests/smoke/OpeningMovie.spec.ts` exercises real MP4 decoding and full native
playback, preparation before the movie ends, delayed assets/final blackout,
media retry, Skip and restart. `tests/smoke/OpeningGame.spec.ts` retains the live
preview's isolated first reveal and staged-download/final-handoff coverage. Existing
gameplay browser tests explicitly skip the opening but still await real readiness.
Browser cases can target dev with `SPECIMEN_PRODUCTION_URL=http://127.0.0.1:5173`
or the production preview. These headless cases do not establish assessment-PC
hardware performance or a guaranteed loading time.

## Settings and lightweight diagnostics

Settings are grouped into Graphics, Display, Audio, Controls and Accessibility,
with section shortcuts, descriptions, live current values and a reset-to-defaults
action. The body scrolls independently of its header/footer. Only Show FPS and
Reduce menu motion persist in `specimen.presentation-preferences.v1`; graphics,
audio and controls still start at safe session defaults. Blocked/malformed storage
is ignored, and resetting clears the saved display preferences atomically.

Settings and Credits share the dark laboratory panel, pale cyan accents and fixed
header/footer layout. Credits retains the canonical `CREDITS.md` ledger and source
links in an independently scrolling body; this styling adds no rendering effects.

Show FPS uses the existing application loop and a half-second frame average;
it creates no second timer/profiler and updates DOM text at most twice a second.
It is visible only during gameplay and is hidden by F1 clean mode. `CleanGameplayMode`
is the sole F1 owner, including editable-target guards; GameFlowUI must not install
a competing legacy HUD toggle.

Tab/Shift+Tab wrap within the active menu. Up/Down navigate buttons and sliders;
native select controls retain their option-selection keys. Left/Right adjust
values, Enter/Space activate, and Escape backs out. Standard-mapped gamepads use
D-pad/stick, A and B, polled only in menus with a connected pad through the existing
loop. A dead zone, bounded directional repeat and release-to-arm prevent drift and
held buttons activating the next screen. Gameplay controls are unchanged.

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

## Gel rendering quality

Settings → Character gel controls a session-owned `RenderLayer.gelRendering`
policy independently of canvas resolution. It applies to Bob, Goop and Volt,
including captive forms, hidden roster members and characters loaded after a
level transition. The [bounded graphics profiles](../graphics-profiles.md) select
`minimum` by default and `reduced-transmission` for Standard through this same
policy. They also apply an absolute canvas pixel budget, shadow-map cap and
decorative-effect density. Standalone material policies still default to physical
until a session configures them; the application defaults to Minimum hardware.

| Setting / policy value | Material path | Transmission target |
|---|---|---|
| Minimum hardware / `minimum` | Non-transmissive physical gel with authored tint, roughness, clearcoat, Fresnel specular, reflection map and emission | No character-triggered capture, resolve or mipmaps |
| Balanced / `reduced-transmission` | Authored physical transmission | Half width and height (25% of capture pixels), using Three's `transmissionResolutionScale = 0.5` |
| High / `physical` | Authored physical transmission | Full resolution when the additional Performance cap is off |

Main's optional Performance preset is retained as **Additional performance cap**.
Off (`normal`) is the default for this extra cap; the overall application still
starts in the Minimum hardware profile. On (`performance`) caps density at 1×
before render scaling, preserves an explicitly selected 0.75× density, and caps
transmission scale at 0.5. `GelRendering` combines this with gel quality using the
smaller scale, so neither setting can overwrite the other. Turning the cap off
restores the saved density choice and preserves explicitly selected Balanced gel.
The profile's absolute pixel budget always applies. Selecting Minimum/Standard
resets graphics overrides, including this additional cap. F1 is independent.

Minimum gel loses background refraction and volume attenuation; its tint is
more solid. It keeps the authored silhouettes, cyan/green/gold colors, glossy
eyes, elastic motion, shadows, camera/aim fades and Volt's mapped glow and
level-owned navigation light. It adds no artificial emission to Bob or Goop.
Balanced softens transmitted detail and edges. It still submits the opaque
environment twice and retains multisampling, resolve and mipmap costs. It
reduces fragment work in the capture, not scene submission or the main pass.
Minimum is the selected strategy for minimum hardware because it eliminates
that duplicated scene work even when a gel covers few pixels. A non-transmissive
`MeshPhysicalMaterial` retains these existing surface features without shader
patches or a renderer fork; choosing `MeshStandardMaterial` would also remove
the authored clearcoat/specular controls.

The policy captures each body's authored transmission once (Bob/Goop 0.28,
Volt 0.55) and restores it when leaving minimum mode. Opacity and reset never
restore transmission themselves. Body transparency stays enabled across modes
so existing prepared camera-fade variants and shadow masks remain applicable.
Disposed bodies unregister; shader-preparation copies borrow the selected
material settings without registering. Three owns any cached transmission
targets: switching to minimum stops their use, but does not free a previously
allocated target. Renderer disposal releases them. No per-frame material
traversal or additional render target is introduced.

Changing gel quality can compile a new surface variant. It explicitly invalidates
the debug recorder's fixed-configuration Level 1 shader-growth check and records
the reason in its status and exports. It does not disable WebGL shader error
reporting. The guard remains active for journeys that keep their startup quality.

### Reproduce the comparison

Use Node 24 and the package-manager version in `package.json`, then run:

```sh
npm ci
npm run type-check
npm test
npm run build
npx playwright test tests/browser/GelRendering.spec.ts
SPECIMEN_GEL_RENDERING_MODE=minimum npx playwright test tests/browser/VoltPresentation.spec.ts
npm run validate:production
```

The gel comparison intercepts the production bundle only to expose the existing
render layer to the test. It freezes a real Level 1 view and compares physical,
half-resolution and minimum gel at exactly the same camera, actors, viewport
and drawing buffer, then repeats modes to check bounded resources. It writes
screenshots and raw `comparison.json` to `artifacts/evidence/issue-188/`.
It asserts nonblank frames, zero GL errors, zero transmission-environment draws
in minimum mode, half-sized balanced targets, and stable warm texture/program
counts. WebGL timer queries, when available, record six independent full
frames and one sequential, non-nested pass breakdown: transmission environment,
screen environment, character, shadows and resolve/mipmap. Sum segments with
the same scope for that pass frame; do not sum full-frame samples. Instrumented
pass timings include boundary overhead and are attribution controls, not FPS.

Set `GEL_CAPTURE_WIDTH`, `GEL_CAPTURE_HEIGHT` and `GEL_CAPTURE_DPR` for a matched
viewport/buffer comparison. `SPECIMEN_BROWSER_CDP_URL` connects the tests to a
caller-owned physical browser. The lifecycle journey accepts the same three
mode names through `SPECIMEN_GEL_RENDERING_MODE` and exercises rescue, dark-room
lighting, aiming, switching, death/retry, merge/split, restart, failed loads and
unload. The minimum journey records first-death shader-program growth separately
and requires stable subsequent retry cycles; shader warmup remains part of #191.
Its mode-specific artifacts go under the same issue directory. This
journey explicitly enables developer controls for staging. The separate
`ProductionParity` smoke journey verifies authored content at the ordinary
production URL without debug flags.

Software rendering validates correctness only. Issue #188 still requires
matched interactive production captures on the confirmed assessment GPU,
including the worst rooms, and numeric budgets from #187/#198 before hardware
performance acceptance. Historical UHD 620 pass timings are motivation, not
new measurements. Neither reduced target area nor removed draws alone proves
a target-device frame-time budget. Attach raw captures and visual evidence to
the review; obtain independent visual/implementation review before closure.

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

### Distant character detail

`generate:character-lods` bakes attribute-aware meshoptimizer index banks from
the approved Goop/Volt GLBs without modifying those sources. The generator
includes normals, UVs and every authored position morph in its error metric
(maximum relative error 0.004). The distant Goop/Volt totals are 8,428/9,552
triangles versus 33,716/38,208 at full detail. Bob stays unchanged.

Preparation loads each bank through a Vite-managed URL, validates it against the
source vertex counts, and appends the indices to one per-instance index buffer.
The bank is optional: fetch, decode or source-validation failure leaves the
original full-detail GLB indices intact and does not reject character or level
preparation. Disposal while the bank is pending still releases the late asset.
`CharacterDetail` changes only the geometry's draw range: no extra geometry,
vertex/morph texture, material, shader variant or first-transition upload is
needed. Visible, depth, distance and transmission passes use the same range;
Volt's generated headroom morph remains shared. Existing asset owners dispose
the single geometry and its index bank. Full source topology remains the asset
validation contract; rendered topology is available through `detailDiagnostics`.

Runtimes update detail after the camera, including the captive/reveal instances.
Full detail switches to distant below 10% projected view height and returns
above 12.5%; zoom is respected. Collider, locomotion, animation and ability
state are independent of that selection. Injected test loaders can supply a
detail-bank loader explicitly; they do not implicitly fetch production assets.

### Acid flow lookup

`generate:acid-noise` bakes the existing three-octave FBM (float32 lattice hash,
cubic value noise, rotated octaves and authored weights) into a 256×256
single-channel byte table. Each of the three animated flow fields takes one
lookup instead of three value-noise evaluations. Four counter-moving domain
warp evaluations remain analytic: the shader does four rather than thirteen
value-noise evaluations, plus three lookups. Bubbles, derivative normals and
the twelve live ripple slots remain animated.

The table repeats over 16 noise cells, with an outer two-cell blend to match
opposite edges and their first derivatives. It samples 16 texels per base noise
cell. The flow pattern is now resampled, quantized and periodic, so this is a
quality-preserving visual change, not pixel-identical parity with the unbounded
arithmetic field. Replacing each lattice hash with a lookup was rejected after
software-renderer measurements; baking complete FBM fields needs fewer fetches.

Immutable CPU bytes are decoded once. Each acid material owns/disposes its own
linear, repeating, non-colour, mipmap-free texture; foundation/normal maps remain
borrowed. Regenerate with `npm run generate:acid-noise`. Both new generators
participate in `check:generated-assets`.

`scripts/capture-extra-optimisations.mjs` captures matched acid times/ripples and
full/distant moving-character views. `--root <checkout> --output <directory>`
selects another revision. It records draw counts, warmed programs, resource
cleanup and isolated render/readback wall times under `artifacts/`. These are
software-renderer diagnostics, not target-GPU performance evidence.
`--acid-only --reference-root <checkout>` additionally alternates the current
and reference shaders within the same browser/context to reduce run-to-run noise.

### Electrical presentation clock

Blackout electrical acquisition, power, device motion, tether revalidation and
hazards remain fixed-step mechanics. Beam/branch/spark buffers, outlines and DOM
feedback reconcile once per rendered frame, after the latest simulation state.
Explicit lifecycle resets may still reconcile immediately. Hidden outlines skip
target/bounds work until aiming resumes; unchanged overlay state does not write
the DOM again. Render-only pointer releases still hide the aiming feedback.

### Cultivation generated assets

The authored Level 2 factory loads `src/assets/cultivation/authored-assets.bin`
before constructing its scene. Vite manages the URL, including nested deployment
paths. Native asynchronous gzip decompression prepares lossless CPU buffers;
version, alignment, ranges, geometry bounds and repair targets are validated.
There is no runtime fallback to texture generation or triangle repair.

Cultivation and Blackout share `readGzipResponse`: finish the compressed HTTP
body before passing an owned byte view to native gzip decoding. Piping a live
fetch body directly into the decoder intermittently reports `net::ERR_ABORTED`
in Chromium despite a complete decoded asset. This uses one temporary compressed
buffer per active load (7.42 MB for Cultivation, 1.18 MB for Blackout), without a
second Blob copy. Transport/decode errors still reject, and abort checks before
and after each phase prevent a cancelled transition from installing assets.

`CultivationAssetSource` is an explicit construction dependency. The runtime
borrows decoded CPU inputs; each existing art owner receives its own textures
and mutable geometry arrays and retains responsibility for disposing them.
Sampler settings can change independently between owners. Texture pixels are
borrowed immutable views of the decoded bundle. Restart reuses the scene's
resources, and unloading releases the same resources as the authored path.

The bake includes the lab, weather, membrane, platform, equipment, glass and
warning textures; shared ceramic/acid inputs; equipment and deck geometry;
Room 3 collider batches; Room 3/5 platform batches; Room 5 spatial batches and
shadow hulls; the continuous adhesive skin; and final overlap repairs. Scene
objects, gameplay colliders and controllers retain their authored identities.
Repair skins attach in local space to their existing moving or soluble owner;
collider vertices, dimensions and transforms remain independent of those skins.
The original texture algorithms and overlap repair orchestration live under
`scripts/lib/`; authoring recipes remain alongside the art they describe.
Small presentation details and authoritative collider primitives still use
their existing constructors.

After changing authoring inputs or recipes, regenerate and validate:

```bash
npm run generate:cultivation-assets
npm run check:generated-assets
```

PR validation regenerates the asset bundles and compares their bytes.
Generation omits timestamps and random object identifiers and normalizes
the gzip platform marker. Use the pinned Node/npm toolchain for reproduction.
Do not edit the binary by hand.

For a matched comparison with the audited revision, check it out separately and
make the locked dependencies available to that checkout. Run
`scripts/profile-cultivation-construction.ts --baseline-root <checkout>` and
the same script without that argument, sequentially, with `node --expose-gc`.
The scripts emit separate asset preparation, construction, sampled repair and
sampled GC measurements plus raw CPU profiles under `artifacts/perf-192/`.
Nested sample attribution must not be added to construction time.
`scripts/compare-cultivation-bake.ts <checkout>` compares mesh, collider,
normal, UV, texture, metadata and motion-state parity. The capture and comparison
scripts provide matched per-room PNGs, including drops, doors, lift motion,
rescue and reset. The manually dispatched **Cultivation bake diagnostics**
workflow runs these checks and retains their raw artifacts for review.

Local/CI CPU and SwiftShader diagnostics do not establish minimum-device loading
or frame-time budgets. The production content-path decision, target GPU/browser
qualification and independent implementation/visual approval remain the
separate requirements of the performance parent issue and review workflow.

### Cultivation scanner-beam presentation

Room 5 scanner cones use `ScannerBeamPresentation` once per runtime render,
after camera and room visibility selection and mandatory preparation. Fixed
updates still own patrols, guard detection/LOS, damage and projectile collision;
they perform no cosmetic beam clipping. The presentation reads the final drone
pose, including resets followed by a render without a fixed step.

The work budget is two cones per draw, at most 48 cosmetic sphere sweeps for
the current 24-sided geometry. Dirty cones are eligible at 10 Hz; missed samples
are never replayed during catch-up. Budget pressure can extend refresh latency
beyond 100 ms. A round-robin cursor prevents starvation.
Enabled state, ancestor visibility, material visibility/opacity, camera layers
and a frustum test against the **original unclipped** bounds gate the work. When
none qualify, neither a blocker snapshot nor clipping queries run. Camera entry,
network reactivation and reset invalidate the cache immediately. A newly visible
cone waits hidden until its fresh sample fits the budget. Nine simultaneous new
cones need at most five draws; that handoff and the 100 ms moving-cover cadence
need visual review on the assessment machine. These are work/cadence caps, not
an asserted millisecond budget.

`CollisionWorld.getLineOfSightRevision()` samples collider changes once per
eligible draw. It tracks dynamic transforms (including parents), mesh visibility,
registration/removal, layer changes, static invalidation and clear. It follows
physics visibility semantics, independently of render-only room ancestry. A cone
retains its clipped vertices until its world pose or blocker revision changes;
its geometry is not uploaded again while unchanged. All refreshes in one draw
share stable query transforms. The original collider/material ownership and
encounter disposal contracts remain in place; the cache creates no GPU resources.

Each cone retains independent edge clipping so partial cover leaves clear edges
visible. Duplicate apex/seam vertices share collision samples, reducing 25 sweeps
to 24 without changing the 24-sided mesh. The existing conservative whole-cone
`length()` alternative uses 33 samples and erases that partial visibility; it is
not selected. Lower angular resolution would need separate visual qualification.
World-matrix sampling also handles translated, rotated or scaled room ancestors.

Use the pinned Node/npm toolchain, build both checkouts, and run matched captures
sequentially. The browser script exposes the shipped session for staging only,
uses the ordinary production URL, checks console/network/GL errors, and records
full runtime fixed-update plus render CPU alongside isolated clipping attribution.
It exercises one-step and six-step draws, moving blockers and network toggles.
The Node diagnostic uses the full production collider registry around an isolated
encounter and records raw sweep/timing samples plus gameplay-state hashes.

```bash
node scripts/benchmark-scanner-beams.ts --root <baseline-checkout> --output artifacts/scanner-beams/isolated-before.json
node scripts/benchmark-scanner-beams.ts --output artifacts/scanner-beams/isolated-after.json
node scripts/profile-scanner-beams.mjs --url <baseline-production-url> --label before
node scripts/profile-scanner-beams.mjs --url <candidate-production-url> --label after
```

`--cdp <url>` selects a caller-owned assessment Chromium; `--executable <path>`
selects a local Chromium. `--software` enables SwiftShader for correctness only.
`--probe` adds an unbudgeted all-visible/all-refreshed screenshot control after
sampling; it is never part of the measured or shipped presentation path.
Retain the JSON/PNG evidence under ignored `artifacts/scanner-beams/` and attach
it to review. Fixed bodies and staged camera/blocker states provide attribution,
not a native gameplay/FPS qualification. Browser frame CPU includes renderer
submission/driver stalls and is not GPU time. Compare full-frame measurements,
not only the isolated encounter, and verify gameplay hashes match.

The confirmed assessment system is an ASUS NUC12WSK-B, Core i3-1220P (12 logical
processors), Alder Lake GT2 integrated Intel Graphics, 16 GiB RAM, 500.1 GB
storage, Ubuntu 24.04.1 LTS x86-64, GNOME 46/Wayland, kernel 6.8.0-124-generic.
Browser/backend, power configuration and numeric acceptance budgets still need
recording under #187/#198. Local CPU/SwiftShader results do not qualify this GPU;
independent implementation/visual review and target-machine captures remain
required before issue closure.

### Production checks

For rendering changes, verify the ordinary journey and affected level under a
production build. Check narrow and wide viewports, restart/unload cycles,
console and network output, WebGL errors, shader-program counts, and stable warm
geometry/texture counts. CPU/SwiftShader browser checks are correctness smoke
tests, not hardware performance measurements.

PR CI budgets 30 minutes for the six serial SwiftShader smoke journeys and
setup. The smoke step has a separate 25-minute deadline so a timeout leaves
time to upload diagnostics. Per-test deadlines, zero retries and strict request/
console/WebGL error assertions remain unchanged.
