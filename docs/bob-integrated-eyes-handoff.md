# Bob integrated eyes — manual review candidate

Bob now has one connected presentation surface containing the body, sockets,
navy eye regions, white catchlight regions, and crest. One set of body shape keys
deforms all of them. The four separate eye/catchlight objects are removed from
this candidate. No independently authored eye morphs remain.

**Asset-only handoff. Commit and push authorized; runtime integration remains out of scope.**

## Review files

- [Blender candidate](../assets/character-spike/bob-integrated-eyes.blend)
- [Morph GLB](../assets/character-spike/bob-integrated-eyes.glb)
- [Validation report](../assets/character-spike/bob-integrated-eyes.validation.json)
- [Neutral front, three-quarter and socket close-up](evidence/bob-integrated-eyes/neutral-review.png)
- [Approved versus integrated neutral](evidence/bob-integrated-eyes/neutral-comparison.png)
- [Squash: four views at all five weights](evidence/bob-integrated-eyes/squash-review.png)
- [Stretch: four views at all five weights](evidence/bob-integrated-eyes/stretch-review.png)
- [Cling: wall/contact and face views at all five weights](evidence/bob-integrated-eyes/cling-review.png)
- [Body, eyes, catchlights and crest comparison](evidence/bob-integrated-eyes/one-body-face-comparison.png)
- Fresh-import visual sheets: [Squash](evidence/bob-integrated-eyes/roundtrip-squash-review.png),
  [Stretch](evidence/bob-integrated-eyes/roundtrip-stretch-review.png),
  [Cling](evidence/bob-integrated-eyes/roundtrip-cling-review.png).

Individual 800 × 800 renders are beside the sheets. Filenames encode pose,
weight and view. `roundtrip-` identifies renders of freshly imported GLB geometry.

## Architecture and preservation

The existing body surface is partitioned along the approved eye and catchlight
outlines, then assigned three material slots. The navy and white regions share
vertices with the surrounding body. They are not overlapping plates or separate
mesh islands. No texture mask, constraint, skeleton, driver, or live modifier is
needed for attachment. The original UV map is retained and interpolated across
the local cuts.

This uses extra local topology to preserve the approved feature contours without
introducing texture resolution or filtering dependencies. The revised body has
3,985 vertices, 5,685 polygons and 7,966 export triangles, compared with the original
2,948 body vertices. Local cut faces have explicit triangulation so export cannot
skip shared boundary points. The remaining original body vertex positions are
exactly unchanged. Added vertices lie on the approved surface within 1.34e-7
Blender units. The projected eye and catchlight areas match their approved outlines
within 0.00001%. Socket depth, body silhouette and crest shape were not sculpted
again. Smooth normals were recomputed for the revised topology.

The new Basis is therefore a local topology revision, not byte-identical topology.
It remains exactly unchanged by morph authoring. The original production and
look-development `.blend` files remain byte-identical; hashes are in the report.
All three approved Blender material node graphs remain unchanged in the candidate.

The GLB has one mesh with three material primitives. Standard export duplicates
vertices at material/UV boundaries: 4,772 buffer vertices represent the 3,985
connected source vertices. All 787 duplicates carry identical position deltas
for every morph. Material boundaries therefore stay coincident at intermediate
weights. Fresh Blender import with vertex merging restores 3,985 vertices.

## Morph review

Each pose was authored and reviewed separately through Blender MCP. Source and
fresh-import renders were inspected at **0, 0.25, 0.50, 0.75 and 1.00**, from front,
side, three-quarter and face views, using the approved glossy gel look.

- **Squash:** upper mass and crest compress, lateral lobes spread, eyes become
  shorter/wider with the sockets, and the side view retains substantial depth.
- **Stretch:** mass draws upward with a rounded lower reservoir; the eyes remain
  full shapes and travel with the face. The crest follows the upward deformation.
- **Cling:** the rear surface flattens toward an actual reference wall while the
  front retains a convex volume. The body lifts and spreads at the rear; the crest
  droops. The reference wall is an authoring aid and is excluded from the GLB.

At the sampled weights, measured volume varies by at most 4.67% from Basis.
The mesh is a single closed manifold component. Strict nonadjacent-triangle
intersection checks found no intersections at the sampled weights.
These checks support the visual review; they do not constitute user approval.
Simultaneous combinations of different major morphs are outside this review.

## GLB round-trip

Export and fresh import passed in Blender 5.2.1 LTS:

- `Squash`, `Stretch`, `Cling` survive, with zero default influences.
- One body mesh survives, including navy and white material face regions.
- All three targets contain position and normal deltas on every material primitive.
- Original UVs and material assignments survive; no texture/mask dependency exists.
- All 3,985 revised vertices and 7,966 triangles survive merged import.
- Position error across all five weights is at most 5.97e-8 units.
- Neutral imported corner-normal dot agreement is at least 0.9999998.
- No animation clips, camera, lights or reference wall are exported.

**Material export boundary:** the approved gel uses Blender procedural nodes that
standard GLB does not reproduce. The GLB carries its exported PBR fallback, not
the complete approved procedural appearance. For fresh-import geometry review,
only the gel slot was restored to the approved Blender material. The imported
navy eye and white catchlight materials were left untouched and visually checked;
their exported PBR colors are also asserted by the validator. No new gel baking
or material look-development was performed.

## Manual inspection in Blender

Open `assets/character-spike/bob-integrated-eyes.blend` and select `Bob-Body` in
`Bob-Production`. Under Object Data Properties → Shape Keys, change one of
`Squash`, `Stretch`, or `Cling` through the five weights, with the other two at zero.
The eyes and catchlights follow automatically because they are body faces.
All keys are saved at zero.

For Cling, enable `Morph-Reference-Wall` in `Bob-Morph-Review-Aids` for viewport
and render visibility. The wall's near plane is Y = 0.735; the target rear contact
surface approaches Y = 0.733. Use rendered/material preview with scene lighting.

Authoring helpers are in
[`integrate-bob-eyes.py`](../assets/character-spike/integrate-bob-eyes.py) and
[`author-bob-integrated-morphs.py`](../assets/character-spike/author-bob-integrated-morphs.py).
They define the construction and individual pose/review operations. The latter
does not create all poses merely by being loaded.

To repeat the isolated data/export validation from the repository root:

```bash
blender --background --factory-startup --python-exit-code 1 --python assets/character-spike/validate-bob-integrated-eyes.py
```

No browser check is required for this asset-authoring change. Three.js loading,
runtime morph controls, gameplay adhesion/collision, Goop and material integration
were not changed or tested. No build was run because application code is unchanged.
Branch: `polish/level-1`. The user authorized committing and pushing this asset handoff.
