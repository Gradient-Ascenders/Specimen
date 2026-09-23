# Bob character model

Status: the revised curled neutral is Gate 1 approved (2026-09-23).

This brief records the agreed production direction for Bob's asset and runtime presentation. The supplied cyan-slime concept sheet is the production art direction. Current approved decisions and this brief guide the visual design; earlier Bob experiments may inform technique but do not constrain it.

## Scope

- Build one reusable Bob presentation intended for the whole game.
- Integrate and approve it in Level 1 first.
- Preserve the authoritative kinematic body, movement, collision, abilities, controls, and gameplay timing.
- Do not redesign Goop or claim completion of all issue #42 scope.

## Character language

Bob is one continuous, bottom-heavy cyan gel body with two large embedded oval eyes and the approved curled crown. The crown is part of the watertight body, not a separate appendage. He has no mouth, eyebrows, pupils, contact lip, or internal anatomy. Personality comes from the eyes, silhouette, squash and stretch, inertia, and motion.

The neutral body is almost perfectly symmetrical. Characterful asymmetry is transient and comes from movement, acceleration, impacts, and secondary surface motion.

## Neutral geometry

- Approved curl size: `1.0 m wide x 0.975885 m tall x 0.86 m deep`.
- Origin: authoritative collider centre.
- Resting contact point: local `Y = -0.45 m`.
- Up: local `+Y`.
- Forward: local `-Z`.
- The underside is broadly and softly flattened, continuously joined to the body.
- Lateral overhang reads as soft gel while keeping the visual centre of mass close to the collider centre.
- The neutral shape must not resemble a puddle or flat-bottomed toy.

The production asset contains one watertight body mesh, including the curled crown, and two separate shallow, conformal glossy-black lens meshes. The approved neutral and its evidence are recorded in `docs/evidence/issue-150/curl-candidate.md`.

It contains no armature, bones, interior liquid mesh, second body shell, contact mesh, hidden deformation geometry, soft-body simulation, or runtime subdivision.

## Topology budget

Post-export, triangulated budgets are:

- body: approximately 2,000–3,500 triangles (approved curl: 3,264);
- both eyes combined: at most 600 triangles;
- complete Bob without optional catchlights: at most 4,100 triangles.

Increase topology only when the closest real gameplay view demonstrates visible faceting, especially around the top silhouette, cheeks and eyes, underside, or extreme curved transitions.

## Presentation frame

The model transform is visual only.

While supported:

- local `+Y` smoothly follows the outward support normal;
- local forward remains tangent to the support surface;
- meaningful tangential travel determines heading;
- a dead zone, hysteresis, and bounded angular speed prevent idle jitter and snapping;
- the last stable heading is retained at rest.

On a sharp reversal, locomotion settles toward neutral, the frame turns, and a fresh locomotion cycle begins after the new heading stabilises.

On takeoff, the current frame is retained long enough for Launch to read. Local `+Y` then relaxes toward authoritative `gameplayUp`. Instantaneous velocity may bias the body shape slightly but never owns the whole character orientation. Wall jumps read as wall-aligned charge, outward launch, gradual upright recovery, then airborne travel.

No camera billboarding or camera-tracking gaze is permitted.

## Body morph contract

Neutral is the undeformed base. The initial asset contains exactly seven body targets:

1. `move-reach`
2. `move-gather`
3. `squash`
4. `flatten`
5. `launch`
6. `airborne`
7. `stress`

Do not add another body target before Gate 3 demonstrates a specific failure that cannot be solved through blending, presentation-frame orientation, timing, or secondary shader motion.

### Locomotion

Locomotion is driven by actual tangential distance travelled in the current support plane. Speed controls deformation strength.

The cycle is:

`neutral -> move-reach -> reach/gather blend -> move-gather -> neutral`

This must read as leading contact, central mass transfer, and trailing mass catch-up. It must not resemble hopping, bouncing, inchworming, rolling, floor thrusting, or pulse propulsion. The targets are authored around local forward; there are no left/right variants. When Bob stops, phase stops and the silhouette settles smoothly to neutral.

Add `move-transfer` only if Gate 3 proves the interpolated middle does not read as mass passing over the contact patch.

### Traversal and reactions

- `squash` supplies broad compression for charge and moderate landings.
- `flatten` supplies more severe redistribution across the support plane.
- Compression samples a single `neutral -> squash -> flatten` continuum; Squash and Flatten are never accumulated independently at full strength.
- `launch` is the normal movement-release stretch along local `+Y`.
- `airborne` is mildly taller and narrower than neutral, with subtle trailing lower mass and no point, tail, strand, neck, or gum-like stretch.
- `stress` supplies ordinary damage reaction and the short rupture anticipation before the existing droplet burst.
- Landing timing determines whether the compression is a moderate Squash or transitions toward Flatten.
- Ordinary floor or wall contact remains compatible with locomotion and adds only bounded secondary contact compression or peel.

A future constriction pose must be its own Squeeze family rather than reusing Launch. It is deferred because current `main` has no active Bob constriction sequence; issue #38 still owns that cutscene choreography.

## Eye contract

Both lens meshes contain identically named seat-correction targets for every body target. A body weight is copied to the matching target on the left and right lenses.

Seat correction owns attachment only. Corrections remain modest; extreme correction indicates a body-shape or eye-placement defect.

Each lens also provides four independent, bounded expression targets:

1. `blink`
2. `effort`
3. `surprise`
4. `stress-expression`

Expression targets change expression only and do not compensate for body deformation. No allowed combination may detach, deeply intersect, invert, or make a lens unreadable.

## Deformation ownership

Authored morphs own major silhouette deformation. The existing shader architecture may provide only bounded secondary motion:

- low-amplitude idle wobble;
- local impact ripple;
- slight transient inertia;
- tiny contact compression or sticky peel;
- other changes too small to materially alter the silhouette.

When a morph owns a state or axis, suppress the equivalent shader contribution. Examples include suppressing shader charge squash during Squash, large shader stretch during Launch or Airborne, and shader impact squash during landing while retaining the local ripple.

Only one primary silhouette family owns the body at a time. Ordered ownership is death/rupture, externally forced deformation, damage, traversal action, locomotion, then neutral. Adjacent phases within one family may crossfade; unrelated full-strength poses may not accumulate. Eye expression and approved secondary shader motion remain independent layers.

Authoritative events may start short visual-only envelopes with art-directed duration, easing, overshoot, damping, and recovery. These envelopes never decide gameplay state and are cleared on reset, retry, or unload. Authoritative correction always wins.

## Reproducible asset contract

The source hierarchy is:

1. deterministic Blender Python generator/exporter — reproducible source of truth;
2. generated `.blend` — editable inspection and Blender MCP review artifact;
3. exported `.glb` — runtime artifact.

The generator explicitly defines coordinates, dimensions, origin, topology, eye placement, morph names and geometry, material slots, object names, export settings, output paths, and validation.

Accepted Blender MCP or manual changes must be reconciled into the generator before the asset is considered finished. Validation fails loudly on missing or extra morphs, renamed objects, wrong axes or dimensions, triangle-budget drift, missing eye meshes, unexpected non-zero transforms, or a GLB without morph targets.

Complex UV work and complicated internal geometry are out of scope for the initial model.

## Approval gates

### Gate 1 — raw geometry

Use neutral materials. Provide:

- front, side, back, and three-quarter views;
- top-oblique contact view;
- default gameplay-camera view, treated as the primary approval image;
- closest expected gameplay-camera view;
- wall-oriented presentation;
- collider overlay showing shared contact and limited overhang;
- useful full-body wireframe;
- close eye-seat wireframe;
- underside wireframe when the full-body view does not show the contact topology clearly.

Judge only silhouette, dimensions, eye scale and spacing, lens seating, contact patch, symmetry, collision honesty, faceting, and topology cleanliness. Lighting, transmission, gloss, and wobble must not rescue weak geometry.

### Gate 2 — material and eyes

After Gate 1 approval, review the translucent cyan gel body and glossy eyes under representative Level 1 lighting. Detailed material choices remain intentionally open until the raw geometry is accepted.

### Gate 3 — deformation and runtime motion

After Gate 2 approval, review all named morphs, eye seating and expressions, support-frame transitions, mass-transfer locomotion, traversal reactions, authoritative state mapping, reset behaviour, and real in-game motion.
