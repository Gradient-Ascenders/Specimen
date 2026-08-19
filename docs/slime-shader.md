# Movement-responsive slime shader

Issues #16 and #17 provide the player slime's handwritten `ShaderMaterial`
and its visual-only movement animation. `KinematicBody` remains the
authoritative 0.45 m sphere for position, velocity, collision, grounding and
jumping. `SlimeVisual` owns a separate sphere mesh, translates gameplay facts
into bounded visual values, and writes those values into one persistent
`SlimeMaterial` instance.

```text
KinematicBody facts/events -> SlimeVisual smoothing/springs -> uniforms -> GLSL
```

Neither the visual controller nor the shader writes to the body. Shader
deformation therefore cannot change collision or movement outcomes.

## Ownership and update flow

`GreyboxCollisionScene` owns one `SlimeVisual`. The visual owns its geometry
and material and disposes both in `dispose()`. The fixed-step loop passes stable
references to velocity, support normal and gameplay-up, plus scalar movement
state. The update path mutates preallocated vectors and uniform values; it does
not recreate geometry, material, uniforms, or temporary vectors per frame.

Continuous state is smoothed by frame-rate-independent exponential response.
Discrete `jumped` and `landed` movement events start launch and impact
responses once. `KinematicBody` also exposes the strongest resolved contact
normal and inward speed from the current step, allowing `SlimeVisual` to start
a wall impact without querying collision a second time. Impact speed is
normalised and clamped on the CPU before it reaches GLSL.

Two small damped springs provide impact squash/rebound and launch stretch.
They are visual-only: their values never feed back into gameplay.

## Uniform contract

All direction, point, velocity-derived and deformation uniforms below are in
the slime mesh's object/local space unless stated otherwise. `SlimeVisual`
performs world-to-local direction conversion before updating the material.

| Uniform | Source / units | Purpose |
| --- | --- | --- |
| `uTime` | material clock, seconds | Drives the two subtle idle waves. It wraps at their common phase period (about 292.24 s), where both wave values and derivatives match. |
| `uLocomotionPhase` | visual controller, radians in `[0, 2π)` | Drives slither, lateral mass shift and sticky peel. CPU integration preserves phase while speed changes and wraps only on a full cycle. |
| `uSpeed` | tangential speed / maximum locomotion speed, `[0, 1]` | Scales locomotion wave, flattening, directional stretch and wobble amplitude. |
| `uMoveDirectionLocal` | smoothed unit direction | Orients the travelling slither wave along actual surface-tangent motion. |
| `uSurfaceNormalLocal` | smoothed unit direction | Defines contact height and the tangent plane on floors, slopes, walls and ceilings. |
| `uSurfaceTangentLocal` | transported unit direction | Gives idle waves a continuous spatial frame while the support normal rotates. |
| `uGrounded` | smoothed boolean, `[0, 1]` | Contributes to supported-surface locomotion without state snapping. |
| `uAttached` | smoothed boolean, `[0, 1]` | Contributes equally to supported locomotion and additionally enables subtle contact-side peel. |
| `uJumpCharge` | normalised charged-jump state, `[0, 1]` | Squashes along the support normal, widens tangentially and lowers the upper mass slightly. |
| `uSquash` | damped impact spring | Compresses along the actual impact normal, then overshoots and settles. |
| `uStretch` | bounded launch/airborne stretch | Elongates the mesh along launch or velocity direction. |
| `uStretchDirectionLocal` | unit direction | Axis for launch, locomotion and airborne stretch. |
| `uInertiaLocal` | bounded visual acceleration lag | Applies a small zero-centred shear during acceleration and stopping. |
| `uImpactPointLocal` | point on the visual sphere, metres | Origin of the local travelling impact ripple. |
| `uImpactNormalLocal` | unit direction | Axis for landing or wall-contact squash. |
| `uImpactStrength` | CPU-normalised `[0, 1]` | Scales impact squash and ripple by collision severity. |
| `uImpactAge` | seconds since impact | Advances and rapidly damps the travelling ripple. |
| `uImpactElasticity` | visual multiplier | Distinguishes normal, sticky and future bounce responses without separate materials. |
| `uBaseColour` | linear working colour | Identity input; `setBaseColour()` recolours the material without editing GLSL. |
| `uWobbleAmplitude` | object-space metres, default `0.034` | Base radial gel displacement before masks and state scaling. |
| `uWobbleFrequency` | radians per object-space metre, default `7.2` | Spatial frequency of the idle waves. |
| `uWobbleSpeed` | radians per second, default `2.15` | Primary idle-wave speed; the second runs at `-0.79` times this value. |
| `uKeyLightDirection` | normalised world-space surface-to-light direction | Explicit clinical key direction used by fragment lighting. |
| `uKeyLightRadiance` | linear radiance | Directional diffuse and wet-highlight intensity. |
| `uHemisphereSkyRadiance` / `uHemisphereGroundRadiance` | linear radiance | Stable ambient fill under representative test lighting. |
| `uSpecularStrength` / `uShininess` | unitless / Blinn exponent | Strength and tightness of the dielectric wet highlight. |
| `uRimStrength` / `uRimPower` | unitless | Strength and grazing-angle falloff of the Fresnel-style gel rim. |

The artistic response rates, impact thresholds, spring constants and maximum
stretch values are centralised in `SLIME_VISUAL_TUNING`. Shader-side silhouette
limits are grouped as named constants at the top of the vertex shader.

## Animation layers

- **Idle:** two low-amplitude asymmetric sine waves travel in different local
  tangent directions. A contact mask keeps the support-side band relatively
  stable.
- **Slither:** while grounded or attached, a radial wave travels along
  `uMoveDirectionLocal`; speed also adds mild support flattening, forward
  stretch and a zero-centred lateral shear. The mesh is not rotated or
  translated by the shader.
- **Acceleration and stop:** change in local velocity becomes a bounded shear
  that makes upper mass lag and then settle.
- **Charge:** `uJumpCharge` compresses the support axis while perpendicular
  axes expand by the inverse square root, approximately preserving volume.
- **Launch and air:** the `jumped` event starts a damped stretch along the
  authored launch direction. Unsupported airborne speed sustains a smaller
  stretch along current velocity and naturally falls near the apex; attached
  movement is treated as supported locomotion rather than airborne motion.
- **Landing and wall contact:** collision severity starts a damped squash along
  the supplied contact normal, followed by a small rebound. This works for
  arbitrary contact orientation rather than assuming a floor.
- **Impact ripple:** distance from `uImpactPointLocal` sets a travelling sine
  phase. Exponential distance and time envelopes localise the response and
  remove it after 1.2 seconds.
- **Sticky/bounce readiness:** supplied attachment state receives the complete
  supported slither response plus the extra peel layer. Current gameplay still
  reports `attached = false` and treats bouncy metadata as ordinary collision,
  so the authored mechanics must trigger the existing visual API when their
  gameplay issues implement attachment/bounce impulses.

All layers blend through continuous values. No shader animation state changes
the mesh transform or gameplay position.

## Normals and varyings

Idle, slither and ripple are radial displacement fields. The vertex shader
analytically differentiates their spatial phases and envelopes, projects the
gradient onto the original tangent plane, and tilts the normal to follow the
deformed surface. Centred squash/stretch uses the matching inverse-transpose
normal transform for each anisotropic axis scale. The very small inertia,
lateral and sticky shears deliberately use the corrected result directly; a
more expensive full Jacobian would add little visible benefit at their capped
amplitudes.

| Varying | Space | Fragment use |
| --- | --- | --- |
| `vWorldPosition` | deformed world space | Builds the view vector from Three.js `cameraPosition`. |
| `vWorldNormal` | corrected world space | Drives hemisphere fill, directional diffuse, wet specular and Fresnel rim. |
| `vDeformation` | bounded unitless deformation magnitude | Slightly brightens actively deformed regions so motion is readable without hiding the silhouette. |

Object-space position and normal are deformed first. `modelMatrix` carries the
result into world space, where every fragment lighting vector is compared.
`viewMatrix` and `projectionMatrix` are used only for clip-space position. The
visual mesh uses rigid/uniform scale, so `mat3(modelMatrix)` is valid for the
corrected normal; future non-uniform scale would require a world normal matrix.

Surface-normal smoothing uses a reusable quaternion rotation instead of
normalised linear interpolation. The same shortest-arc rotation transports a
persistent local tangent, after which it is projected back onto the tangent
plane and normalised. This removes reference-axis thresholds from GLSL, keeps
idle-wave spatial phases continuous through floor/slope/wall/ceiling changes,
handles antiparallel floor/ceiling normals, and allocates nothing per update.

## Lighting and performance

The fragment shader combines hemisphere and directional Lambert diffuse, a
tight neutral Blinn highlight, and a cool view-dependent Fresnel rim. This is
an explicit approximation of `RenderLayer`'s clinical lighting rather than an
attempt to consume arbitrary Three.js lights.

The shader performs no texture sampling and has no loops. Deformation uses a
small fixed set of sine/cosine/exponential evaluations on the existing 24 × 16
sphere. The implementation keeps one draw call, one geometry, and one material
for the player visual. The GLSL and deformation equations were handwritten for
Specimen; no new third-party shader source or technique was introduced.
