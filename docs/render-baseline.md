# Renderer, camera, and lighting baseline

Issue #8 establishes the stable rendering assumptions used by the grey-box
collision scene and by later camera, shader, and Level 1 lighting work.

## Ownership and frame flow

`RenderLayer` owns the one shared `WebGLRenderer`, the game `CameraRig`, and
viewport sizing. The runtime only supplies the
animation timestamp to `Loop` and asks the render layer to draw after fixed
updates; it does not create or dispose render-owned objects.

The grey-box level adds only its `root` to the shared scene and continues to
dispose its own geometries and materials. Application shutdown disposes the
level before making the final `RenderLayer.dispose()` call, which releases the
renderer and render-layer listeners.

## Colour and tone assumptions

| Setting | Baseline | Reason |
| --- | --- | --- |
| Working colour space | Three.js default linear-sRGB | Lighting and shader calculations operate in a linear working space. |
| Canvas output colour space | `SRGBColorSpace` | Browser output has an explicit, conventional display transform. |
| Tone mapping | `NeutralToneMapping` | It provides controlled highlight roll-off with less cinematic colour shaping than ACES, making authored test colours and surface response easier to compare. |
| Exposure | `1.0` | Establishes a neutral reference; future work should not compensate for an undocumented global exposure. |
| Clear/background | Opaque `#07110f` | Maintains contrast around the grey-box outlines. No fog is applied, so distance does not hide test surfaces. |
| Shadows | Disabled | Sprint 0 evaluates direct surface response without the cost or bias settings of a provisional shadow system. Shadow configuration remains deferred to level-lighting work. |

Colour textures added later must declare their intended colour space. Custom
slime shaders should treat lighting calculations as linear values, assign that
linear colour to the fragment output, then include
`#include <tonemapping_fragment>` and `#include <colorspace_fragment>` in that
order. This makes `ShaderMaterial` shaders participate in the configured
`NeutralToneMapping` and sRGB output transforms; they must not bake an
additional display transform into their output.

## Pixel and resize policy

The renderer uses the host element's integer CSS dimensions and caps device
pixel ratio at `2`. This keeps high-density displays sharp while preventing an
unnecessary quadratic framebuffer cost on very high-DPR screens. The drawing
buffer is updated without writing inline canvas CSS dimensions.

A `ResizeObserver` catches host layout changes and the window resize listener
catches viewport and device-pixel-ratio changes. A resize updates renderer
size, pixel ratio, camera aspect, and the perspective projection matrix only
when one of those values changes. Width and height are clamped to at least one
pixel so transient zero-sized layouts cannot create an invalid aspect ratio.

## Camera baseline

The game camera is a perspective camera with a `48°` vertical field of view,
`0.1 m` near plane, and `200 m` far plane. Its temporary test target is
`(0, 0.5, 1.5)` with a base offset of `(17, 12.5, 18.5)`. These values frame the
existing collision cases from above while preserving readable vertical faces.

At aspect ratios narrower than `16:9`, the rig moves backwards along that same
view vector. It does not change field of view or stretch the projection. Wider
viewports retain the base framing and reveal more horizontal space. This is a
static inspection view, not final follow-camera behaviour; later camera work
should retain ownership in `CameraRig` and replace only the test-framing policy.

## Level-owned lighting

Issue #33 removed the persistent clinical inspection pair. RenderLayer no
longer contributes unexplained scene lighting; each level owns lighting and
cleanup below its own root. Level 1's room rigs, fixture sources, state mapping
and performance bounds are documented in `docs/containment-lighting.md`.

## Render diagnostics

The existing grey-box panel samples diagnostics four times per second. Alongside
fixed-loop and input state it reports CSS viewport size, drawing-buffer size and
effective DPR, draw calls, triangle count, and resident geometry/texture counts.
Sampling reuses renderer counters and does not add work to every gameplay update.
