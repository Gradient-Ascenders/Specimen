# Containment teaching grey-box

Issue #20 replaces the isolated collision cases with the first two authored
Containment rooms. The source layout is the Level 1 Room 1 and Room 2 design
briefs maintained in the shared `Rooms` folder.

## Intended teaching order

| Beat | Space | Player discovery | Grey-box implementation |
| --- | --- | --- | --- |
| Orientation | Room 1 | This is a sterile specimen chamber; the normal door is unavailable. | 14 × 12 × 8 m room, central pedestal, glass/egg set piece, red locked door. |
| Adhesion | Room 1 | Yellow-green contaminated wall tiles are climbable; clean white panels are not. | A 2 m wide `sticky` perimeter-wall entry sits directly beneath the vent and continues onto one interior duct wall. |
| Transition | Vent duct | The escape route continues through facility ductwork. | A single rising duct route, not a maze, connects toward Room 2's high drop. |
| Bounce demonstration | Room 2 | A fall onto the calibration landing causes a large rebound. | 7 × 7 m `bouncy` landing surface below the duct drop. |
| Charged height | Room 2 | Charging a jump reaches a platform that walking cannot. | Platform A: 5 × 4 m, top at approximately 2.2 m. |
| Charged distance | Room 2 | Bounce momentum crosses a visible horizontal gap. | Platform B: 5 × 5 m, slightly higher and offset from Platform A. |
| Chaining | Room 2 | A charged jump can catch an elevated sticky wall, then continue into a climb. | 5 m wide sticky catch wall, from roughly 3 m to 9 m high. |
| Exit | Room 2 | The learned moves lead to an obvious, open exit. | Upper green exit balcony with no door puzzle. |

## Surface authoring contract

- Clean containment panels, floors, platforms, duct surfaces, and doors use
  `default` surfaces.
- Only the contaminated Room 1 route and elevated Room 2 catch wall use the
  `sticky` surface tag.
- The Room 2 calibration landing uses the existing `bouncy` surface contract.
- White/grey means normal architecture; yellow-green means sticky; purple is
  the bounce calibration landing; red is inaccessible; green is progression.

## Scope boundary

This is a primitive-based gameplay grey-box. Opening cutscene sequencing,
final environment art, visual slime deformation, lasers, moving elevators, and
the later Room 3/4/5 traversal beats remain outside issue #20.

## Verification checklist

- Confirm Bob cannot attach to normal Room 1/Room 2 wall meshes.
- Confirm Bob can attach to the Room 1 contaminated perimeter wall and the
  Room 2 elevated catch wall.
- Confirm the Room 2 landing produces the authored bounce response.
- Confirm the charged-jump route reads in order: height, gap, then wall catch.
- Confirm the `F` recovery test moves Bob below the level before returning him
  to the Room 1 safe spawn without requiring a browser refresh.
- Confirm the separate Room 2 safe-landing position clears the bounce surface
  by Bob's full collision radius and skin width.
- Run `npm run type-check` and `npm run build` before review.
