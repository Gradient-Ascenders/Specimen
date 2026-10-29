# Restricted research ascent

Original Blender scenery for the damaged service lift and laboratory landing
after Blackout Room 2. The car has an inset worn deck, tubular guards, fitted
gate tracks, suspension details and a damaged power cabinet. A reusable shaft
module supplies cable bundles, passing lamps and recessed service grilles.
The landing changes to white panels, dark expansion joints and restrained teal
inlays around the research door.

## Authoring

`generate-ascent.py` is the reproducible source. Its car, gates, shaft and lab
stages also support incremental native Blender MCP editing. The editable
`research-ascent.blend` contains separate parts, a camera and studio lighting.
`research-ascent.glb` contains geometry only. Lettering uses Blender's built-in
font converted to triangles; there are no external assets, images or fonts.
The floor perimeter/corner-marker recipe follows the earlier Containment decks.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python assets/environments/blackout-ascent/generate-ascent.py
node scripts/assets/generate-blackout-maintenance-art.ts
```

Coordinates are metres, game Y-up. Root `B3_ASC_Architecture` identifies asset
`blackout-ascent-v1`. Temporary export copies join geometry by region/finish.
Gate and cabinet-cover batches use the live owner's local coordinates; studio
poses are stripped. Shaft/Bay batches use local Y and world X/Z. Floor plates
partition their expansion seams instead of covering another exposed surface.
Buried jamb-shoe bottom faces are omitted; slab fascias close exposed edges.

## Runtime ownership and cost

`BlackoutAscentArt` borrows the shared maintenance material maps. Its 40 batches
contain 6,523 unique triangles; the runtime gzip bundle is 93,557 bytes. There
are no new textures, lights, shadow maps or animation clips. All six scrolling
shaft owners share one geometry/material bank; only the span visible to the
authored cameras is submitted. Higher copies are hidden before reaching the
arena overhang in the shared world frame. This visibility rule does not change
their existing scroll transforms or period.

The existing lift retains its collider references, dimensions, transforms,
boarding checks, socket, PCB, electrical bursts, gates and laboratory door.
Render skins follow those owners. Three cabinet indicators use the current
repair charge; immutable PCB details are batched after art adoption. Quiet
shaft knocks reuse existing sound cues. Boarding routes, four dialogue lines,
camera shots, ascent duration, arrival, skip and checkpoint behaviour stay with
the existing cinematic. Preparation finishes before shader prewarming.

The art owner restores retired material bindings and releases its unique
buffers/material copies once. Shared texture maps and the original status/strip
materials remain with their existing owners. Cancelled preparation discards
late geometry. The Blender source stays editable alongside the runtime bundle.
