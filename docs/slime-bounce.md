# Slime landing rebound

The slime has an innate rebound on ordinary walkable floors and slopes; Room 2
does not need a special bounce pad. A landing must exceed the configured
minimum impact speed before it rebounds, so ordinary steps and tiny drops settle
normally.

Rebound speed is calculated from the actual downward impact speed:

```text
rebound = min(maximumBounceSpeed, impactSpeed × restitution)
```

The restitution is below `1`, so every rebound loses height. The minimum impact
threshold ends the sequence naturally, and the maximum speed keeps very tall
falls controllable. The default values are `3.1 m/s`, `0.68`, and `11 m/s`.

Authored `bouncy` surfaces remain supported for a future deliberate fixed-speed
bounce effect, but regular level floors use the slime's controller-owned
rebound.

A jump buffered shortly before ordinary-floor contact suppresses this passive
rebound and consumes the deliberate jump on touchdown. This keeps the innate
motion without making landing input unreliable. Authored `bouncy` surfaces are
not overridden by the buffer.
