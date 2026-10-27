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
and its native HTML player remain an opt-in `?opening=mp4` backup in development
and explicit `opening-backup` builds. Submission builds omit the video and use
the live opening for that URL. The backup is not a WebGL video texture, and
ordinary Start does not download it. See
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

Level 1 submits its five room and four doorway shader configurations before
waiting for driver completion. Both canvas and linear offscreen variants include
glass, particles, gel, shadow casters and camera fades, including opaque Low-mode
bodies. Restricting the linear subset to opaque transmission receivers leaves
expensive programs to compile synchronously during the primers. The binding
prewarmer checks every submitted program's parallel-link readiness before
requesting uniforms or diagnostics; material-level `compileAsync` alone can miss
earlier variants of a shared material. Jobs still yield individually and restore
renderer state synchronously. Real shadow allocation, buffer/VAO uploads,
mixed-resource draws and the final retained-camera/GPU readiness checks follow.

Containment shares three light signatures: seven points with three or six
shadowed spots, and the existing six-point/ten-spot duct layout. Padding sources
have zero radiance and use the finite-light early-out. This retains the authored
sources while avoiding separate six/seven-point shader families in the smaller
layouts. Leaf upload slices may be reused only within the same preparation run
and complete light/shadow/map signature; mixed-resource, fade and alternate-view
draws still run. Once Room 2's authored shell is ready, its retired construction
storyboard is excluded from shader and buffer preparation.

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

The Room 5 contact button runs an 82.52-second live finale in the shared Level 1 runtime
(development and production). `IdleCinematicPreparation` submits at most one
small job per idle callback, requires at least 8 ms of genuine spare time, and
does not force work with a timeout. CPU preparation is spread across Level 1;
new GPU resources are compiled/uploaded one drawable at a time only with Room 5's
live lighting and parallel shader support. Busy frames and pause defer work.
Browsers without idle/parallel support finish remaining jobs one per rendered
frame behind an opaque, skippable preparation screen; the story clock waits.
Shader-status polling is cancelled before disposal, including in-flight work.

The finale borrows the already-prepared Bob/contained-Goop models and retained
gameplay camera. It adds no lights or character downloads: four pooled drones,
bounded instanced projectiles/wreck, and a two-draw straight escape airduct with
a real floor-drop opening. Earlier room art is excluded from the cinematic draw without
changing light ancestry or hiding the borrowed actors. Its canvas is capped at
1280×720 pixels (or the current gameplay buffer if smaller), with DOM scan optics
and letterboxing. The authoritative button gates the actual lasers and freezes
carriers; the real soluble door burns before the escape. Fixed-step time owns
pause, Enter/button skip, and the exactly-once Level 2 handoff after the vent dive.
Restart restores borrowed model parents, camera settings, and gameplay resolution.
Development builds additionally bind `9` (or numpad `9`) during live Level 1
gameplay to preview this same finale from its authored button pose, then perform
the normal Level 2 handoff. The shortcut is absent in production, even with
opt-in diagnostics, and ignores pause, text inputs, death, and repeated keys.
Bob's route uses timed gravity arcs, continuous ground travel, and the gameplay
model's charge, launch and landing responses. Bob takes the short platform hop,
walks to its clear edge and jumps directly onto the drone; he no longer detours
onto or attaches to the sticky wall. Acting advances on
the movie clock in bounded substeps; repeated/paused renders do not advance it.
The platform/drone establishing shot precedes Bob's decision, and his dismount has a
dedicated falling shot before the two animated landings. Completed drone scans
reveal a large threat rating; Goop's CRITICAL rating precedes MUST TERMINATE.
MUST TERMINATE is centred at large size for 2.7 seconds and pulses at about
1.4 Hz on the movie clock (so pause freezes it); reduced-motion displays retain
steady text. The shared timing map shifts subsequent action/audio/escape cues
by the same 1.8 seconds; it does not consume any of the fight. Goop uses five
charged ballistic dodges with his real gel launch/landing responses, while the
drone makes broad banking passes before settling for Bob's mount. Each missed
acid shot is traced to actual room art/collision during its own idle job; playback
uses one fixed 39-instance pool for rounded, wet contact lobes, connected
gravity-driven runs/beads and short-lived splash droplets,
with positional impact audio and no live raycasts or additional lights. The
quiet beat displays a green "Thanks". The duct's shaft/rim use non-overlapping
butt joints rather than coincident faces around the floor opening. The
platform-approach/launch cameras stay above the unobstructed side of the bounce platform.
The reinforcements appear single-file behind Room 4's real doorway, turn
side-on to clear it, then split into three C1-continuous pursuit lanes. A short
entrance return shares the existing annex shell draw rather than submitting
the whole previous room. The doorway establishing camera clears the cell.
Bounded banking and pre-authored close calls are checked against both moving heroes. Each
close call is prepared in its own idle job; the projectile/drone pools do not grow.
Goop turns to inspect the escape cover before firing. The old door identity is
retained for dissolve/checkpoint compatibility, but its actual geometry is now
a single-mesh wooden crate with a solid top, sides and core in Level 1 Room 5.
Its frame and wall opening form a real 1.8 m-wide service vent. The 2.64 m drone
rotor span cannot enter: pursuers brake outside and fire at the surround while
the slimes run single-file through the metal duct and take staggered dives.
The duct section runs at 60% of its former duration, without Bob's waiting
beat. One final authored round passes through the actual vent opening just
above diving Bob, then reaches the duct end; the craft stays outside.
Bob presses the release button by physical contact, not sticky adhesion.
Only its round cap depresses; the registered button collider stays static.
Bob uses authored facial morphs; Goop uses subtle per-instance, centre-pivoted
eye transforms, without editing meshes, adding shaders or changing neutral play.
The cell's stationary dressing is cloned and batched in separate idle jobs using
the existing static-batch helper; the actual opening panels stay independently
animated. Originals retain their names, geometry, material ownership and collision.
The front release hatch pivots outward/upward from its top header, with matching
horizontal hinge knuckles. Simulation, rendering and skip share its clamped
release pose; the hatch clears the authored Goop model and his route underneath
without adding geometry, lights or live collision work.

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

## Observation monitors

Level 1's monitors share a three-mesh, visual-only wall terminal and a bounded
uppercase typewriter timeline. Room 1 retains its six-gameplay-second delay and
uses green dialogue. Room 2 sits on the clean east-wall panel left of the sticky
installation, with its centre at the sticky membrane's 7.738m height. Its
red/green/red sections begin only when the active slime enters a 3m sphere around
the side-jump platform (4.2, 4.56, 31.0999). The floor below and upper return
route are outside that sphere. Activation is latched: leaving does not pause or
restart the script; restarting the level clears the trigger and text.
Room 2's final red response is `WE WILL OBSERVE`.

Cultivation Room 1 reuses this terminal to the right of its exit door, with one
Bob-tracking camera to the left when viewed from the room. A 6m approach sphere
centred at (0, 1, 45.5) starts the red/green/green retrieval exchange. Its three
terminal draws borrow Cultivation's existing metal finishes; the camera uses the
shared three-mesh design. Both are visual-only, add no lights or shadow casters,
use the normal room preparation/culling and fixed-step pause/reset lifecycle,
and are present in development and production. Proximity transforms from world
space into the room; the positional typing source remains at the world screen.

Cultivation Room 2 adds a Bob-tracking camera on the blank west-wall panel,
screen-left of the upper sticky control, and a terminal centred above Goop's
locked exit. Its four shield-system sections are green/red/green/green, with
20-column wrapping and normal type/reading pauses. A 7.5m door-approach sphere
starts the terminal; culled rooms do not update it. The hold button retains its
exact static sticky collider, press travel and Bob-only door authority. New
rounded armour, captive fasteners, an unlettered face and linked red/green
status bars are presentation-only and add no lights or shadow casters.

Cultivation Room 3 mounts a tracking camera above the elevator approach. Its
red/green/green observation terminal sits inside the lift's boarding alcove,
on the left wall facing the lift, entirely before the elevator deck. It follows
the boarding scenery as the lift descends, rather than riding on the platform.
Completed terminals retain their final page on checkpoint retry; unfinished
ones restart, and a full level restart clears their completion memory.

Room 3's seven resistant drone bodies flash a pooled cyan field, lattice and
impact ripple when hit by Goop's actual swept acid projectiles. Their soluble
support cables remain vulnerable. The effect adds no colliders or lights and
uses at most three instanced draws; empty slots participate in room prewarming.

Landing Bob on either of the final two upper platforms starts the live clearance
sequence. Bob walks to the lip, charges and leaps straight to the safe floor,
with a squash and small elastic rebound on landing. No extra descent platforms
are added. Flight timing adapts to the starting height. The same one-shot
sequence also covers skipping those platforms and landing on a ground
drone or the final safe bank. This entrance keeps his actual pose, hops clear
of the row if needed, then walks behind it to the push starting point without
teleporting upstairs. It uses the existing Bob model, interpolated kinematic
body poses, normal launch/landing
acting, and the real ground-drone tipping and acid-disable authority. Four
staggered pushes carry the drones fully clear of the bank before lowering and
tipping them into the acid. Their submersion uses liquid
ripples and one 48-instance displacement pool. Resources are constructed before
room preparation, not at the trigger. Ordinary gameplay and hostile fire are
suspended, while native pause remains available. Fixed time freezes during
pause/preparation; camera tracking and DOM letterboxing return smoothly to play.
The completed sequence leaves all four ground drones disabled and Bob grounded
on the safe floor. Checkpoint/puzzle resets restore its one-shot trigger.

`CultivationGoopSpeech` follows the real Goop with one reusable typed billboard
and positional voice accents. Player-directed horizontal movement of either
slime starts Room 1's introduction, not load time, gravity or camera movement.
The name question has a 3.5s pause before the ellipsis. Both Bob and Goop must
be in Room 2 before its entry gives
the actionable hold-button instructions priority. Speech pauses out of earshot
or in hidden rooms. Once the elevator enters its stopped arrival state, Goop
explains that they need Volt and that Volt previously blacked out the facility;
this conversation continues seamlessly from the lift into Room 5. As elsewhere,
completed conversations survive checkpoint recovery, while
unfinished conversations can retry and a full restart clears their memory.
Goop's speech planes are now 3.6×1.8m in both levels (25% smaller). While Goop
is controlled, only the existing visual mesh moves into a screen-safe
inset: both screen axes bound its scale for narrow windows, close walls and
first-person ability aim. Switching to Bob restores the normal depth-tested
world balloon, except the elevator-to-vent conversation, which keeps the
screen-safe inset for either listener so the low vent roof cannot hide it.
Its root/voice stay at Goop throughout; no second display or
audio source is created. Landscape framing clears the roster; compact
square views use the upper-left and portrait views use the clear lower area.

On fresh Level 2 entry (and full Room 1 restart), both real bodies drop from
above the existing ceiling vent onto the safe entry floor. Ordinary physics,
airborne/landing animation and positional landing audio handle the staggered
fall. A short camera track stays below the ceiling and before the suspended
platform, then blends back to the continuously updated player-follow rig.
Movement, look, jumping, switching and abilities wait for both landings and the camera return;
native input remains available for pointer capture and pause/resume.
Preparation and pause do not advance this entrance. Recovery checkpoints remain
at floor level, so death/retry and development room teleports do not replay it.
This entrance adds no scene assets, lights, colliders or per-frame resources.

Room 1's platform landings displace the acid with four perimeter ripple pulses
and a fixed two-draw splash pool: up to 36 prebuilt curved crown sheets and 72
ballistic droplets across the three platforms. No geometry/material is created
on impact, no additional lights/shadows are added, and dormant/culled pools do
not upload instance transforms. Existing room preparation primes one harmless
offscreen instance from each empty pool, avoiding first-impact buffer uploads.
All these features share the normal development/production runtime.

Room 3 uses the same proximity behaviour, with green/red/red dialogue about the
acid leak and Goop. Its screen sits low on the east-entry panel, left of the first
sticky wall, at (16.65, 12.85, 53.2). A 3.5m sphere around the wider gap platform
(11.2583, 12.1429, 59) activates it, excluding the entrance and upper route.

Room 5's monitor faces the central rest platform from the rear wall above the
Goop door. Its 3.5m trigger is centred at (-0.68, 81.542, 115.652). The red/green/red
observer exchange uses overflow pages for the longer green response, rather than
reducing the lettering size. Only the overflow pause before `CAPABILITIES` is
shortened from 2s to 1s; the green response retains the normal 0.09s character
interval and its following section pause stays at 3s. Goop has a separate 8m
proximity conversation around his containment cell. A single depth-tested, camera-facing speech balloon types
four pleas, pauses while the player is out of range, holds the final hint for 4s,
then fades out. The release sequence hides it immediately. Checkpoint recovery
restarts unfinished dialogue, but retains completion as soon as the final hint
is fully typed, even during its reading hold or fade. Completed warnings do not
repeat after death; a full level restart clears that memory. Its one 512×256
texture, plane and unlit material are
allocated up front, with only glyph changes uploading pixels. It is diegetic
content, like the wall monitors, not part of the F1-hidden guidance HUD.

All retain the 0.09s character interval and 3s section pause. Overflow pages hold
for 2s except the 1s pause before Room 5's `CAPABILITIES`. Each owns a single 512×256 texture (0.5 MiB), repainted
only when text changes, with no new lights, shadow casters, physics geometry or
per-frame GPU allocations. They are attached after static batching to preserve
the measured first-use owner names and frozen collision layout. Unit tests cover
timing, colour, punctuation, trigger boundaries, ownership and reset; the shared
browser test exercises rendered playback and restart in dev and production.

Goop's cell has a static high-security dressing: dark armoured headers/corners,
amber/black caution tape and front-only corrosive/biological warning plaques and
a GOOP / CRITICAL identification plate. Only the text is red: decorative red
bars/status marks are omitted, including those around the lower release label.
The critical red matches the opening's experiment directory. Three draws (two
borrowed-geometry instance batches and one merged marking mesh) share one owned
512×512 atlas (1 MiB,
no mipmaps), with no additional lights or shadow casters. An isolation grate
supports Goop's authored resting sole. The front/rear clamps are offset to keep
him visible; the joined header clears all labels and stays below the original
traversable roof. Collision, laser routes, release and checkpoint logic are
unchanged. RoomFiveArt owns and idempotently disposes the security dressing;
shared materials and primitive geometry stay borrowed.

## Level 1 surveillance

Six wall-mounted cameras track Bob with smoothly damped, mechanically bounded
pan/tilt joints, even while another slime is controlled. Room 1 has one left of
its monitor; Room 2 has one right of its monitor and one above its exit doorway;
Room 3 has one right of its monitor and one on the blank rear-wall panel beside
the final sticky strip; Room 5 has one above its monitor. They use the normal
scene update, so pause/death cannot advance an independent animation clock.
Recovery reconciles their headings with Bob; restart restores their initial pose.

All six share three small merged geometries and two materials, with three draws
per visible fixture, no texture downloads, lights, shadow passes or colliders.
Tracking changes only parent transforms, not geometry or GPU buffers. They are
attached beneath the appropriate room roots after static batching, retaining
room occlusion, frustum culling and the measured first-use owner identities.
The Room 1 debug spawn ring is no longer created. Room 3's sticky-wall trim has
separated depth layers and non-overlapping corner joints rather than coplanar
rails/backing. Tests cover placement in dev/production, Bob-only tracking,
smoothing, limits, reset, shared ownership and the trim's geometric separation.

## Settings and lightweight diagnostics

Settings are grouped into Graphics, Display, Audio, Controls and Accessibility,
with section shortcuts, descriptions, live current values and a reset-to-defaults
action. The body scrolls independently of its header/footer. Only Show FPS and
Reduce menu motion persist in `specimen.presentation-preferences.v1`; graphics,
audio and controls still start at safe session defaults. Blocked/malformed storage
is ignored, and resetting clears the saved display preferences atomically.

Settings and Credits share the dark laboratory panel, pale cyan accents and fixed
header/footer layout. Credits starts with the game developers and a note that its
3D models were created independently. It then reads the short entries in
`CREDITS.md`, ordered as Music, Sound effects, Tools, Fonts and Code. Each entry
shows its creator, use and licence; linked titles open the source in a new tab.
Full resource notes stay below the ledger's maintenance heading and do not appear
in the game. The body scrolls
independently, with a fixed Back button; this styling adds no rendering effects.

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

Containment's five authored rooms share offline-baked L1 irradiance volumes and
five local reflection captures. `ContainmentRadiance` owns the packed 3D volume
and CubeUV atlas; world-space shader hooks preserve existing gel deformation,
dissolve, finite-light evaluation and depth ownership. Indirect light and
box-projected reflections interpolate through doorways without runtime captures.
Low samples the constant irradiance band; Medium/High retain its directional
terms. The bank adds about 307 KiB to loading and 3.46 MiB of retained GPU data.
See [bake provenance and reproduction](../../assets/environments/containment-lighting/README.md).

Selected atmospheric shafts reuse cached fixture depth with bounded scattering
shells. High additionally enables contact-hardening PCSS on one key spotlight
per room. Renderer-global sampler policy remains in `RenderLayer`; only opted-in
Containment requests raw depth, while other levels and lower quality settings
retain native PCF. A sampler-type change invalidates all catalogued shadow
targets, including dormant padding slots. Full loading preparation covers the
new shader paths before gameplay resumes.

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
| Balanced / `reduced-transmission` | Authored physical transmission | 75% width and height (56.25% of capture pixels), using Three's `transmissionResolutionScale = 0.75` |
| High / `physical` | Authored physical transmission | Full resolution when the additional Performance cap is off |

The Specimen bounds its refraction filter to mip level 0.25 so the fusion heart,
aqua ribbons and electrical veins retain detail on Medium and High. Surface
roughness still controls its glossy highlights; the non-transmissive Low path
does not use this filter.

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
reduced-resolution and minimum gel at exactly the same camera, actors, viewport
and drawing buffer, then repeats modes to check bounded resources. It writes
screenshots and raw `comparison.json` to `artifacts/evidence/issue-188/`.
It asserts nonblank frames, zero GL errors, zero transmission-environment draws
in minimum mode, 75%-sized balanced targets, and stable warm texture/program
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

Room 5's Volt enclosure reads as a bioelectric extraction cell: copper induction
stacks, ceramic insulators, collector rings, armoured glass and a critical power-cell
plate. A guarded push button replaces the lever; its signal conduit follows a
supported ceiling tray into the cell's power bus. The button, battery meter and
feed accents share one live status material. The two suspension feeds stay connected
to the cell; its front glass shutter retracts into the upper collar for the escape. Detail
geometry is baked and merged by finish, with no new lights or textures.

`CultivationFinale` takes fixed-step authority when the release button completes.
The 129-second live sequence borrows the three loaded slime presentations, nine
patrol hulls and final cover panel. It stages Volt's critical scan, the cover strike,
Bob's catastrophic reclassification, Volt's hijack/dogfight, Goop's intervention,
the dialogue, the shared-drone escape and the abandoned carrier's power-down.
The captured craft follows a fast circuit around the cell, its feeds and suspended
platforms. Interceptors pursue on a separate arc-length flight circuit; all seven
flying opponents have scheduled visible destruction before pickup. The crushed
acid wreck remains, but it never fires a last shot at the escaping heroes.
The panel clears the full hull and antenna during the
strike/plunge, then is explicitly hidden at the first acid cut, never reappearing
in later exterior or POV shots. No dead interceptors fire after pickup.
The captured craft's positional hum stops as it powers down and falls into the acid.
The cell-opening/alert coverage is deliberately slower on one shared remapped clock;
the room keeps a gentle 2.4-second emergency pulse throughout the escape. Patrol
drift/turning continues during reaction shots and dialogue. Nine precomputed
curved alert paths climb around the cell instead of interpolating through it;
their envelopes are checked from multiple live patrol states. Bob anticipates his
forward shoulder hop, with dedicated topple/impact/fall cuts, a brief camera kick
and pooled debris. The falling panel and victim share one trajectory, and riders
use the hull's bank/yaw frame with sole contact on its actual deck. The extraction
cell sits at 31 m: Bob's scanner is approximately eye-level and Volt boards from
its nearby front lip. Carrier headroom queries use Volt's transformed world position,
not the borrowed presentation's local origin. Ordinary rendering never writes
world positions into these borrowed local poses. The boarding flight uses a
single eased arc-length curve with analytic heading and broad curvature banking,
avoiding low-speed finite-difference steering jitter and settling upright beside Goop. It climbs
through a clear central lane before crossing toward the upper vent,
avoiding the suspended platforms and their cables.
Goop waits in a real east-wall opening at cell height (floor 27.8 m), not in the
sewer return. The baked annex has panel seams, pressed floor trays, service pipes,
fasteners, practical strips and shaft ribs. Bob and Volt make short animated
dismount jumps into the vent beside Goop; no explosion propels them through it.
After a short landing pause, Goop says "Follow me, I know the way out" and
leads an ordinary grounded walk. The duct starts shaking and shedding dust; its
normal pressed-metal floor buckles, they brake, then the centre joint fails and drops them down
the shaft. Its two prebuilt hinge roots are excluded from static freezing and
have independent surface-repair motion domains; buckling/breaking/open states are audited too.
A distinct damp side tunnel establishes Goop's approach. The collapse is roughly
22 m from the entrance, with the inspection grille 6 m ahead of it. After the deep drop,
the lens peeks under a partly lifted grille into a tiled lab service room with
benches, equipment and observation windows. Small wall-mounted wayfinding lives
in that room only: EXIT points right and BASEMENT points diagonally down-left.
BASEMENT lettering is enlarged to 24 cm for readability.
Inactive-body locators and gameplay camera fading are suppressed while the movie
owns the actors.
Level 3 and Volt's unlock wait for completion (or the supported Enter/skip action).
The Level 2 dev-only `8`/numpad `8` shortcut stages the same sequence; it is absent
from other level runtimes and rejects pause, repeat and editable-field input.

The existing Room 5 preparation queue visits the baked duct and fixed-capacity
projectile/debris meshes while hidden. Playback does not construct a second scene,
load models, allocate effects or add lights. The alarm changes existing lamp uniforms;
the cinematic's temporary ambient/material visibility lift is restored on reset.
The real cover's fittings travel with it, outside static batches. Normal combat,
movement, switching and abilities freeze under movie authority, while native pause
controls remain enabled. Pause and GPU preparation do not advance the movie clock.
Once inside the vent, offscreen exterior meshes are hidden without deregistering
their lights; the original sewer cannot draw across the new vertical airduct.
Restart/unload restore borrowed actors, geometry ownership, camera parameters and UI.

Level 3 begins with a seven-second arrival through a sloped wall vent. Bob,
Goop and Volt use their existing bodies and models, stagger their launches and
landings onto the safe checkpoint apron, then return control through a smooth
camera blend. After all three clear the outlet, a damaged panel falls across
the passage and enables a real collision blocker. It remains sealed after
death, checkpoint recovery and full restart so Volt cannot fly back up the chute.
The vent borrows the maintenance bay's existing finishes, adds no lights, and
shares the level's preparation, pause, disposal and resource ownership.

The sewer checkpoint latches Bob's upper-route arrival and Goop's passage beyond
the destroyed rusted drone independently. Goop can cross either bank or jump through
the full-width clearance zone; neither character has to remain at a tiny trigger.
The existing controls checkpoint still supplies the same safe retry positions.

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
