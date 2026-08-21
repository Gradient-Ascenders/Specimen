# Issue #31 verification evidence

Issue #31 replaces the temporary opacity fade with a deterministic,
gameplay-driven corrosion shader. This record distinguishes checks performed
against the development server from the production `dist/` verification.

## Automated checks

Verified on 21 August 2026 with Node.js 24.19.0, npm 11.18.0, and headless
Chrome 152.0.0.0 on Linux.

```text
npm ci              passed; 25 packages, 0 vulnerabilities
npm test            passed; 110/110 tests
npm run type-check  passed
npm run build       passed; 66 modules transformed
git diff --check    passed
```

The production output was 799.18 kB minified / 199.78 kB gzip for the single
JavaScript chunk, 10.91 kB / 3.47 kB gzip for CSS, and 0.82 kB for HTML. Vite's
existing advisory about a chunk over 500 kB remains; the dissolve shader adds
no separate runtime asset and this issue does not introduce a loading boundary.

`tests/DissolveTarget.test.ts` covers:

- gameplay progress copied exactly to visible, depth, and distance uniforms;
- partial progress retained while gameplay is interrupted;
- resume through completion;
- collision state retained below and removed at the authored threshold;
- five complete/reset cycles with a zeroed render value after each reset;
- independent amounts and deterministic target-ID offsets for two targets;
- multi-material targets sharing one coherent mask state;
- depth/distance shader hooks containing the matching noise discard;
- idempotent disposal and restoration of borrowed authored materials.

## Browser cycle

The Room 1 proof target was exercised in Chrome through the actual keyboard
path: `Tab` selected Goop, movement established contact, held `E` advanced the
fixed-step dissolve, releasing `E` held the partial value, and holding `E`
again resumed it.

Observed states:

```text
0%   intact, collision registered
17%  interrupted partial, collision registered
50%  resumed partial, collision registered
72%  collision and surface registrations changed from 130 to 129
100% complete, target invisible
reset progress 0%, target intact, collision/surface registration restored
```

The 50% state had stable irregular openings and a bright green-white boundary.
At the 72% authored gameplay threshold the visible state and collision
diagnostics remained synchronised. Reset reused the same target and cleared the
partial pattern without a reload.

The same partial → interrupted → resume → complete → reset route was repeated
from the production build served by `vite preview`. At 17%, leaving `E`
released while diagnostics were inspected did not change progress. Resume
reached 100%, `completed = yes`, and 129 collision/surface registrations. Reset
reported 0%, `completed = no`, and restored both registrations to 130.

## Captures

![Stable partial corrosion and edge](issue-31-partial.png)

![Gameplay-complete target removed](issue-31-complete.png)

![Intact target restored after reset](issue-31-reset-restored.png)

[`issue-31-dissolve-reset.webm`](issue-31-dissolve-reset.webm) is a 1280 × 720
canvas capture of the live intact → partial → complete → reset cycle. Chrome
loaded the saved WebM successfully, reported a 9.393 second duration, and its
intact, partial, complete, and post-reset portions were visually inspected.

## Shadow/depth inspection

`RenderLayer` currently sets `renderer.shadowMap.enabled = false`; the proof
target retains Three.js's default `castShadow = false`. It therefore produces
no current shadow to inspect visually. Source and automated inspection confirm
that every dissolve target still owns compatible custom directional depth and
point-light distance materials. Both share the visible mask uniforms and inject
the same fragment discard, preventing an intact shadow silhouette if a future
authored target participates in either shadow pass.

An isolated 64 × 64 Chrome render then enabled both a shadow-casting
directional light and point light on a 50%-dissolved mesh. Three.js allocated
both shadow maps and compiled four programs (visible dissolve, depth, distance,
and receiver) without a GLSL/link error. All temporary materials, geometries,
shadow maps, and the diagnostic renderer were disposed afterward.

## Console, network, and resources

The production cycle completed with zero console errors or warnings. Its three
requests (`dist/`, the relative JS asset, and the relative CSS asset) all
returned HTTP 200. A second server mounted the built output at `/dist/`; the
same relative asset URLs loaded with HTTP 200 and no console messages, covering
the repository's subdirectory deployment requirement.

Renderer diagnostics stayed at 103 geometries, 3 textures, and 9 shader
programs from intact through partial, completion, and reset. Draw calls dropped
from 104 while the target was partially visible to 103 when complete, then
returned with the restored target. Repeated development and production cycles
did not continually add renderer resources.

The shared automation host uses software/virtualised WebGL and was heavily
loaded: a 120-frame intact sample measured 246.88 ms mean / 242.30 ms median,
while a 40-frame close-up partial sample measured 265.88 ms / 262.10 ms. The
different framing and sample lengths prevent treating this as a controlled GPU
benchmark. The roughly 8% close-up difference, fixed draw/resource counts, one
affected proof mesh, no texture reads, and no per-frame allocations show no
obvious runaway cost; representative physical lab-hardware profiling remains a
release follow-up.

## Authorship and credits

The GLSL and its deterministic value-noise/hash implementation were handwritten
for Specimen. No texture, external shader, tutorial code, or adapted noise
implementation was introduced. `CREDITS.md` records that decision explicitly.
