# Containment teaching grey-box

Issue #20 replaces the isolated collision cases with the first two authored
Containment rooms. The source layout is the Level 1 Room 1 and Room 2 design
briefs maintained in the shared `Rooms` folder.

## Intended teaching order

| Beat | Space | Player discovery | Grey-box implementation |
| --- | --- | --- | --- |
| Orientation | Room 1 | This is a sterile specimen chamber; the normal door is unavailable. | 14 × 12 × 8 m room, central pedestal, glass/egg set piece, red locked door. |
| Adhesion | Room 1 | Yellow-green contaminated wall tiles are climbable; clean white panels are not. | A 2 m wide `sticky` perimeter-wall entry sits directly beneath the open vent and continues briefly across the level duct lip. |
| Transition | Vent duct | The escape route continues through facility ductwork. | A single rising duct route connects toward Room 2's high drop; ordinary sticky edge traversal carries the slime through its mouth. |
| Bounce demonstration | Room 2 | A fall onto the chamber floor causes a large natural rebound. | The controller-owned slime rebound uses the actual drop impact; there is no special bounce pad. |
| Charged height | Room 2 | Charging a jump reaches platforms that walking cannot. | Four staggered lower platforms progressively add height, distance, and sideways movement. |
| Chaining | Room 2 | A charged jump can catch an elevated sticky wall and continue onto its high ledge. | Platform D faces a tall contaminated patch embedded in the east perimeter wall; the Blender-authored placement leaves a tested route around the ledge obstruction. |
| Upper ascent | Room 2 | The player applies the jump again after climbing. | Two upper stepping platforms zig-zag back across the chamber toward the exit balcony. |
| Recovery | Room 2 | A missed jump is non-lethal and immediately retryable. | Misses return to the safe chamber floor, where the lower A–D route remains available. |
| Exit | Room 2 | The learned moves lead to an obvious, open exit. | Upper green exit balcony with no door puzzle. |

## Surface authoring contract

- Clean containment panels, floors, platforms, duct surfaces, and doors use
  `default` surfaces.
- Only the contaminated Room 1 route and elevated Room 2 catch wall use the
  `sticky` surface tag. Room 1's marking continues a short distance onto the
  duct entrance floor to support a smooth climb-over without jumping.
- Sticky wall colliders expose `userData.textureRole = 'sticky-wall-tile'`.
  The short duct entrance instead exposes
  `userData.textureRole = 'sticky-vent-tile'` and uses the mesh name
  `duct-segment-a-sticky-vent-tile`, allowing art to texture it separately
  while both continue to use the same `sticky` gameplay surface tag.
- The Room 2 floor and platforms remain ordinary surfaces. Innate rebound is
  owned by the slime controller and does not require a `bouncy` surface.
- White/grey means normal architecture; yellow-green means sticky; gold marks
  the main jump route; dark grey marks structural support; red is inaccessible;
  green is progression.

## Scope boundary

This is a primitive-based gameplay grey-box. Opening cutscene sequencing and
final environment art remain outside issue #20. The later Room 3/4/5 traversal,
lasers, moving elevator and completion handoff are integrated by issue #21 and
documented in `docs/containment-level-greybox.md`.

## Verification checklist

- Confirm Bob cannot attach to normal Room 1/Room 2 wall meshes.
- Confirm Bob can attach to the Room 1 contaminated perimeter wall and the
  Room 2 elevated catch wall.
- Confirm holding movement at the top of Room 1's sticky wall carries Bob
  directly onto the vent floor without a jump or scripted transition.
- Confirm the Room 2 drop produces an impact-scaled innate rebound.
- Confirm the charged-jump route reads in order: lower zig-zag, wall catch,
  upper zig-zag, then exit.
- Confirm the Blender-authored Room 2 sticky-wall placement allows the player
  to move around the high ledge obstruction and reach its top.
- Confirm a missed wall catch returns to the safe floor and can retry through
  the lower A–D route without resetting the room.
- Confirm the `F` recovery test moves Bob below the level before returning him
  to the Room 1 safe spawn without requiring a browser refresh.
- Confirm the separate Room 2 safe-landing position clears the chamber floor
  by Bob's full collision radius and skin width.
- Run `npm test`, `npm run type-check`, and `npm run build` before review.
