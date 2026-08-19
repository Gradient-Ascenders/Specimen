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
| Chaining | Room 2 | A charged jump can catch an elevated sticky wall, then continue into a climb. | Platform D faces a 5 m wide contaminated patch embedded in the east perimeter wall across a 4 m air gap. |
| Upper ascent | Room 2 | The player applies the jump again after climbing. | Two upper stepping platforms zig-zag back across the chamber toward the exit balcony. |
| Recovery | Room 2 | A missed sticky-wall catch is quick to retry. | Four low recovery steps return the player to Platform D without replaying the complete ascent. |
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
  the main jump route; dark grey marks recovery; red is inaccessible; green is
  progression.

## Scope boundary

This is a primitive-based gameplay grey-box. Opening cutscene sequencing,
final environment art, visual slime deformation, lasers, moving elevators, and
the later Room 3/4/5 traversal beats remain outside issue #20.

## Verification checklist

- Confirm Tack cannot attach to normal Room 1/Room 2 wall meshes.
- Confirm Tack can attach to the Room 1 contaminated perimeter wall and the
  Room 2 elevated catch wall.
- Confirm holding movement at the top of Room 1's sticky wall carries Tack
  directly onto the vent floor without a jump or scripted transition.
- Confirm the Room 2 drop produces an impact-scaled innate rebound.
- Confirm the charged-jump route reads in order: lower zig-zag, wall catch,
  upper zig-zag, then exit.
- Confirm a missed wall catch can use the low recovery steps to return to
  Platform D without restarting the room.
- Confirm reset returns the player to the Room 1 safe spawn and the existing
  out-of-bounds recovery path does not require a browser refresh.
- Run `npm run type-check` and `npm run build` before review.
