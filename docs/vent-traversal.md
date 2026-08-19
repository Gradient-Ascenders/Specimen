# Vent traversal

`VentTraversal` is authored data, while `KinematicBody` owns the movement
state. A level checks its authored vents before each fixed body update; a vent
only starts when the player is inside its capture volume and is actively moving.

During `ventEntry`, normal gravity, jumping, bounce responses, and automatic
sticky reacquisition are suspended. The body preserves tangential momentum,
ensures a minimum inward speed, applies gentle centreline alignment, and keeps
collision enabled. The transition ends only after crossing the vent's authored
clearance plane.

Free handoffs return to ordinary world-up physics after clearance. Sticky
handoffs query the real collision world in the authored search direction and
validate the registered surface tag before attaching. A short cooldown prevents
re-entry loops; the emergency timeout is recovery only, never the normal exit.

Room 1 currently uses a free handoff into its duct. Its cyan debug arrow and
wireframe sphere show the direction and entry volume in the grey-box.
