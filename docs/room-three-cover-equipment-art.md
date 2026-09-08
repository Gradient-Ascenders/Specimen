# Room 3 Goop cover prop models

Eight unique equipment models replace the former visible cover boxes. The original
boxes retain their parents, transforms, geometry vertices, metadata and collision
registration; their materials are invisible. The new static presentation group is
never registered for collision, camera obstruction or drone line-of-sight.

| Authored cover | Identity | Geometry and silhouette | Palette emphasis |
|---|---|---|---|
| Checkpoint shield | Decontamination bank | Three raised doors, circular inspection ports, roof modules and connecting pipe | Teal and clinical white |
| Cover 1 | Sample freezer | Twin insulated doors, long handles, offset roof compressor | White and cyan |
| Cover 2 | Chemical cabinet | Double metal doors, raised vent crown, spill-containment plinth | Cool metal and yellow |
| Cover 3 | Analysis machine | Large projecting instrument screen and control shelf, offset full-depth tower | White and dark instrumentation |
| Cover 4 | Specimen archive | Eight raised drawers, central spine, asymmetric roof extraction module | White and muted teal |
| Cover 5 | Sample-processing centrifuge | Rounded housing, projecting circular lid, roof drum, side motor/control section | White, metal and teal |
| Cover 6 | Laboratory server cabinet | Three rack bays, real grille slats, stepped cooling towers | Charcoal, steel and small teal indicators |
| Cover 7 | Reinforced containment locker | External corner armour, locking drum, raised rounded cap | Cool metal, teal and yellow |

No duplicate identities. Each object has a closed main body close to its original
cover volume. Rounding, shallow panels and roof modules vary the silhouette without
creating open frames or implying traversable gaps. Rear access hatches and actual
side service panels/grilles provide detail from other approach directions.

Implementation: `CultivationCoverEquipmentArt` uses shared box, rounded-box,
cylinder, door, handle, grille and screen helpers. Its eight variants are sized from
the documented cover dimensions. All static parts merge by finish into six render
meshes. No per-frame construction, transparency, new lights, or external assets.
The art owner disposes its geometries and materials; borrowed surface maps remain
owned by the existing laboratory material library.

Materials follow Level 1's ceramic, service-metal and graphite settings, with muted
teal, amber and opaque dark-display variants. Existing ceramic micro-normal and
roughness maps are borrowed. The former two 1024-square equipment atlases were
removed: no new textures, approximately 10.67 MiB less atlas storage with mipmaps.

Geometry budget: 18,672 triangles across eight props and six material batches.
Compared with the atlas pass this adds five render submissions when all props are
in view. The same Goop review position measured 50 draw calls (previously 45).
These are resource/submission measurements, not a frame-rate benchmark.

Verification includes exact collider vertices/bounds/transforms/metadata, invisible
source materials, single-owner disposal and production movement/line-of-sight
sweeps through every cover from both horizontal axes. Hit objects and fractions
match the original cover boxes. Existing checkpoint shielding, drone detection,
projectile blocking, platform/reset and hazard regression tests are retained.

Browser review uses Goop's gameplay camera. A browser-only screenshot harness parks
inactive Bob in the duct and refreshes health to prevent death overlays during
camera positioning. No production damage or detection code is modified. All eight
front views and service-side views are checked separately from gameplay tests.

Facing variation: checkpoint shield, analysis unit and server remain unchanged.
The freezer and specimen archive face backwards (180 degrees); chemical cabinet
faces sideways (+90 degrees), containment locker faces the opposite side (-90
degrees), and the processing unit is angled -12 degrees. Quarter-turn variants
exchange modelling width/depth to retain the authored world footprint. All turns
are presentation-only, performed around the existing collider centre.
