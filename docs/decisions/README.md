# Architecture decisions

This directory records accepted project architecture decisions. It is the
starting point for contributors who need to understand a choice that constrains
Specimen's implementation.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-single-player-scope.md) | Single-player scope | Accepted |
| [0002](0002-kinematic-collider-separate-from-visual-mesh.md) | Kinematic collider separate from the visual slime | Accepted |
| [0003](0003-organize-source-code-by-responsibility.md) | Organize source code by responsibility | Accepted |

## Statuses

- **Proposed** — under discussion and not yet a project constraint.
- **Accepted** — agreed and currently in force.
- **Superseded** — replaced by a later ADR.

## Adding or replacing a decision

1. Confirm that the decision has actually been agreed.
2. Allocate the next ADR number and create a short record with its status,
   date, context, decision, and consequences.
3. Add it to this index.
4. When replacing an accepted decision, create a new ADR; mark the previous
   record **Superseded** and link both records. Do not rewrite its decision
   history.
