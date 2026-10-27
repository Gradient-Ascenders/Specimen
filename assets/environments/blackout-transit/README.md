# Blackout distribution hall

Original Blender environment for Level 3 Room 2: a flooded distribution hall
with recessed switchgear, a faceted enclosure, suspended light banks, drainage
mouths, three open drone service wells, landing rigs and a jammed exit bulkhead.
The control-gallery glazing is opaque; no interior scene or transparency pass
is added behind it.

Volt's complete service route is rebuilt as one kit: fourteen inset deck
modules, tubular handrails with individual posts and feet, toe rails, side
girders, wall-mounted triangular brackets and a matching rotated launch landing.
The old rusty rail slabs, floor slab and yellow stripe at the bridge approach
are retired from rendering. Metal beams attach the light banks directly to the
roof; there are no orange cable feeds to the lamps.

A fourth Volt-charged light bank sits above Bob's final switch platform, high
enough to clear the adhesion wall from the service gantry. Existing three-bank
checkpoints restore with the new bank unpowered. Decks use baked vertex grime
and the shared machinery wear maps instead of rusty tiles, including the exit
ramp and hallway. The acid has a faint green emission using its existing shader.

The tread/corner-marker design and four-point annular thruster harness follow
the established Containment Room 2 recipes. Each moving lift has four harnesses
around its existing engines. Static landings use a central utility engine.
Existing laser heads, sewer drones, acid, exhausts, light sources, conducting
contacts and adhesion faces keep their runtime owners.

## Source and export

`generate-transit.py` is the reproducible authoring source. Its separate shell,
landing, switchgear, gantry, basin and bridge/exit stages support native Blender
MCP iteration. `transit-hall.blend` retains individual editable parts, studio
lighting, preview liquid and a camera in `Blackout / Flooded Distribution Hall`.
Those preview objects are excluded from the geometry-only `transit-hall.glb`.

Coordinates are metres, game Y-up/-Z forward. `B3_R2_Architecture` identifies
`blackout-transit-v1`. Exports join temporary copies by area and finish; dynamic
lift, bridge and light-bank geometry is exported in its original owner's local
space. Studio poses are stripped. Architecture and mechanical details have
physical clearances, and adjoining walking surfaces have a single exposed top.
The oblique catwalk/launch joint is clipped against the original rotated anchor.

From the repository root, using Blender 5.2:

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python assets/environments/blackout-transit/generate-transit.py
node scripts/generate-blackout-maintenance-art.ts
```

The gzip runtime bundle is `src/assets/blackout/transit-art.bin`. The packer also
checks the bay/drone bundles; `--check` is part of the generated asset CI check.
The final payload is approximately 476 KB: 31,627 triangles in 97 area/finish
batches, including 29 meshes borrowed by the live device owners.
No images, fonts, lights, cameras or animation clips enter the GLB. Lettering
uses Blender's built-in font converted to triangles. No external assets are used.

## Integration and performance

`BlackoutTransitArt` replaces render materials, preserving original collider
identity, geometry, transforms, tags and world registration. Checkpoints,
charged-jump gaps, sticky faces, lift travel, bridge interpolation, electrical
range/line of sight, drone emergence/attacks and hazard timing remain with their
existing controllers. The conducting diffusors, lift sockets, pressure button
and exit-door contact remain visible and independently powered.

The docking transition intentionally changes the bridge endpoint and rotates
its permanent landing box to meet the ramp across its full width. Collision
continues to use real oriented boxes. Only the static landing render is clipped
at the adjoining exit deck; no independently moving bridge coverage is cut into
the floor. The old raised warning strip is retired.

Moving skins inherit the real lift/bridge transforms. The controller detaches
borrowed skins before recursive device disposal. The art owner releases its
buffers/material copies once, restores original bindings, and never disposes
the maintenance kit's borrowed maps. Cancelled loads discard late geometry.
Original device surfaces are retired by explicit mesh references even when the
runtime machinery is parented beside the room. The regression fixture uses that
same hierarchy so the old lift decks cannot render beneath the authored treads.

Static geometry is divided by area and finish. Finishes borrow existing wear
maps and allocate no new textures, lights, shadow maps or post-processing
targets. Solid architecture has no emissive fill; existing power-controlled
light banks reveal it. Recessed graphite uses a cheap black material.
The fourth bank adds one ordinary, non-shadow-casting runtime point light.

Opaque finishes are allocated during scene construction, before actors. Three's
default opaque material ordering can then reject obscured actor/effect pixels
early, rather than drawing asynchronously created enclosure materials last.
Geometry still loads in parallel before mandatory shader preparation and GPU
warmup; gameplay does not defer those uploads or compilation.

## Focused validation

```sh
node tests/BlackoutTransitArt.test.ts
node scripts/audit-blackout-transit-art.ts /tmp/transit-surfaces.json
SURFACE_TOLERANCE=.002 node scripts/audit-blackout-transit-art.ts /tmp/transit-clearance.json
```

The assembled fixture includes neighbouring Room 1 art and connections, the
original exit hallway/staging, all transit hazards, live dormant drones in
initial/reset states, and the actual lift/bridge owners. It checks partly
deployed, fully deployed and retracting poses. Tests also cover wall coverage,
both entry bores, exit clearance, exact landing heights, target identity,
unchanged collision, shared map ownership, cancellation and disposal.

Existing transit material, electrical-interaction and traversal tests supply
the focused gameplay checks. Native Iris Xe captures, timing comparisons and
surface reports are kept under ignored `artifacts/evidence/blackout-transit/`.
Staged views and local GPU timings are not lab-hardware acceptance evidence.

The native 1920 × 1080 Medium comparison on Iris Xe recorded 7.64 → 7.10 ms
for the powered entry and 13.26 → 12.24 ms for the catwalk. Upper-route and exit
views changed from 6.96 → 7.40 ms and 7.16 → 7.33 ms respectively. These are
render-only GPU samples, not gameplay frame-rate guarantees. All reviewed views
had zero WebGL errors and no new shader programs after preparation; restart
prepared both rooms again and unload returned to the renderer's baseline.

The new art has no reported opaque conflicts at 0.1 mm or 2 mm in the five
assembled poses. Six retained Room 1 circuit-fixture conflicts remain outside
this art pass. The audit reports those separately rather than treating them as
new Room 2 findings.
