# Bob research wing

`research-wing.blend` is the editable Blender source. `research-wing.glb` is the
runtime export. The deterministic generator builds a white ceramic research
gallery, six side-monitor housings, a large restricted-research display,
microscopes, sample racks, centrifuges, wheeled trolleys, incubators and gas
equipment. The enclosed entrance has three launch bays; the connected hallway
is 24 metres longer and has two recessed four-lane drone bays. Launch shutters
have explicit header/sill/jamb clearance and retract behind the cladding.
Bay cheeks and cap ends are recessed 20 cm from the corridor panels; shutters
also start behind the wall face, so lifting cannot introduce a coplanar strip.
Floor sections meet without coplanar overlap; exterior support caps end below
the floor, and closed architecture exports with backface culling. Wall modules
end at their actual junctions. Ceiling diffusers, launch shutters, the reinforced
door and the overlook's rear containment shutter retain separate identities.

Regenerate with Blender 5.2:

```sh
blender --background --factory-startup --python generate-research-wing.py
```

Coordinates in the generator are Three.js metres: +Y is up and the gallery runs
along +Z. Export converts these to/from Blender's +Z-up coordinates. The GLB has
no cameras, lights, scripts, or startup objects. Static parts are joined by
section and material. Individual gallery fixtures permit an electrical cascade
without switching shader features or allocating new objects during playback.

`BlackoutResearchLayout` aligns the upper observation window with the actual
arena, 26 metres above the main ring. A bounded visual opening in the arena's
outer wall connects the rooms; the glass impact and fall share world coordinates.
Only the overlook remains visible after the cinematic, with its rear shutter
closed. Unrelated level drawables are hidden reversibly during playback, while
their lights retain the existing shader signature. The arena's own shell is
hidden until the observation-room entrance, so it cannot obstruct earlier
corridor shots; its original visibility is restored on completion or cancellation.

Canvas monitors, the four-thruster scientist monitor, soft searchlights, energy
cocoon, smoke billboards, debris, detonations, glass shards and individual
projectiles are pooled in-engine. The loading screen rehearses 40 real
camera/lighting/effect configurations and awaits GPU
completion without advancing bodies, dialogue, audio, checkpoints or cinematic
time. Volt's light is temporarily retained outside his hidden model to avoid a
new light-count shader variant at fusion. Preparation restores all borrowed
presentation state on completion, failure or level cancellation. The canvas is
hidden during rehearsal and its final warm-up image is cleared before restoring
visibility, preventing the end of the film from flashing through loading.

The scientist speaks only on its self-lit screen, which keeps its regular live
interface visible through the blackout and search, ordering “Find them” in red.
Capture commands aim all eight guards at the trio;
blackout is held before independently swept searchlights turn on. Hall drones
launch only after Bob hits the door, advance continuously in separate lanes,
and brake at the start of “Just do it.” The fusion build
follows Bob's body, shakes the camera and sheds ceiling debris, then an opaque
smoke veil hides the model change before clearing onto the Specimen. The ram
group covers the final approach in half a second.

Both surviving drone groups keep aiming and firing at the Specimen until their
individual deaths. Staggered muzzle flashes and red tracer rounds terminate
at its body, where shrinking cyan ripples and particles show the energy being
absorbed without damage or knockback. These shots and impact rings use bounded
prewarmed instance pools rather than spawning transient meshes or lights.

The arena entrance stays closed while the trio arrives through the window.
The central pit has eight mechanical cover segments: after the pursuers die,
locks flash, panels retract, the Specimen turns, and the boss rises through the
clear aperture. The cover is cinematic-only, with no gameplay collider, and is
removed on handoff/cancellation so the combat pit remains open.

The film runs for 277 seconds. Gameplay collision, damage and the boss controller
remain suspended until the safe CP8 handoff. Completed research cinematics do
not replay on boss retries; CP9 retains the existing phase-two checkpoint.
