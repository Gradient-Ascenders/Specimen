# Wet wobbling slime shader

Issue #16 replaces the temporary player probe's stock material with a
handwritten `ShaderMaterial`. The shader changes only the deformable visual
mesh. `KinematicBody` remains the authoritative 0.45 m sphere collider and
continues to drive the mesh transform through render interpolation.

## Ownership and update flow

`GreyboxCollisionScene` creates one `SlimeMaterial` for its one visual slime,
advances its time uniform from the existing fixed-step `update(deltaSeconds)`
call, and disposes it through the scene's established mesh traversal. Uniform
objects, colours, and vectors are constructed once; the per-step path writes
only the existing `uTime.value` number. Shader time wraps after the common
phase period (about 292.24 seconds): the primary wave completes 100 cycles
while the `0.79`-speed wave completes 79. This retains floating-point phase
precision without discontinuity in deformation or its normal correction.

The current sphere geometry has 24 width and 16 height segments and includes
smooth vertex normals. The shader assumes the visual mesh uses rigid or uniform
scale. Under that project convention, `mat3(modelMatrix)` correctly carries
the corrected object-space normal into world space. A future non-uniformly
scaled slime must supply an inverse-transpose world normal transform instead.

## Uniform contract

| Uniform | Space / units | Default | Purpose |
| --- | --- | --- | --- |
| `uTime` | seconds | `0`, advanced by the scene | Keeps both authored waves smooth and continuous. |
| `uBaseColour` | linear working colour | Bob-ready mint `0x72ead0` | Identity input; `setBaseColour()` changes it without editing GLSL or recreating the material. |
| `uWobbleAmplitude` | object-space metres | `0.034` | Maximum radial displacement before the wave weights and base mask. |
| `uWobbleFrequency` | radians per object-space metre | `7.2` | Controls spatial wave variation across the sphere. |
| `uWobbleSpeed` | phase radians per second | `2.15` | Controls animation speed; the second wave travels at `-0.79` of this speed. |
| `uKeyLightDirection` | normalised world-space surface-to-light direction | `(8, 13.5, 8.5)` normalised | Direction of the clinical inspection key. |
| `uKeyLightRadiance` | linear radiance | white × `1.15` | Shared directional diffuse and wet-highlight intensity. |
| `uHemisphereSkyRadiance` | linear radiance | cool white × `0.48` | Upward-facing ambient fill. |
| `uHemisphereGroundRadiance` | linear radiance | dark green × `0.32` | Downward-facing ambient fill. |
| `uSpecularStrength` | unitless | `0.95` | Scales the dielectric wet highlight. |
| `uShininess` | Blinn exponent | `72` | Keeps the highlight tight enough to read as a wet coating. |
| `uRimStrength` | unitless | `0.72` | Scales the view-dependent gel rim. |
| `uRimPower` | Fresnel exponent | `2.35` | Shapes how quickly the rim grows toward grazing angles. |

The lighting uniforms are an explicit approximation of `RenderLayer`'s
clinical hemisphere fill and directional key. This material deliberately does
not opt into Three.js's general light-uniform/chunk system. If Level 1 changes
its representative lighting, update this small contract or introduce an
intentional shared lighting input; do not assume arbitrary scene lights will
automatically affect the slime.

## Vertex deformation and normals

Two low-frequency sine waves use different object-space X/Z directions and
opposing time directions. Their weighted sum changes by vertex position, so it
deforms the surface rather than translating the mesh. Evaluating in object
space keeps the pattern attached while the player moves through world space.

A smooth object-space height mask fades displacement from zero near the
sphere's `y=-0.45` contact point to full strength above `y=0.02`. This preserves
the gameplay silhouette at the floor and prevents an obvious sliding gap.

The vertex shader analytically differentiates the two waves and the smooth base
mask. It projects that displacement gradient onto the original tangent plane,
then subtracts it from the source normal. This first-order normal correction is
cheap, follows the visible ripples, and avoids the lighting lag produced by
blindly retaining undeformed normals. It requires no texture reads, neighbour
access, finite-difference samples, or loops.

## Varyings and coordinate spaces

| Varying | Space | Fragment-stage use |
| --- | --- | --- |
| `vWorldPosition` | deformed world space | Builds a per-fragment view direction from Three.js's world-space `cameraPosition`. |
| `vWorldNormal` | corrected world space | Drives hemisphere diffuse, directional diffuse, specular, and Fresnel response. |
| `vSurfaceWobble` | signed unitless wave value from the vertex stage | Slightly modulates base-colour brightness, visibly tying surface shading to the authored deformation. |

Object-space position/normal data is deformed first. `modelMatrix` moves the
result into world space, where all fragment lighting vectors are compared.
`viewMatrix` and `projectionMatrix` are used only to form clip-space
`gl_Position`. No view-space vector is mixed with a world-space vector.

## Wet and rim response

The fragment shader combines hemisphere and directional Lambert diffuse with a
tight Blinn half-vector highlight. The highlight is almost neutral instead of
base-colour tinted, which reads as a glossy dielectric gel rather than metal.
It is strongest on key-lit fragments and remains view dependent.

The rim uses `pow(1 - dot(normal, viewDirection), uRimPower)`, so it grows at
grazing camera angles and follows the corrected wobbling normal. Its cool tint
separates the silhouette against Level 1's dark inspection background. Final
linear colour passes through Three.js's tone-mapping and output-colour-space
chunks, matching the renderer baseline.

## Performance and scope

The vertex shader evaluates two sine/cosine wave pairs and one analytic normal
correction. The fragment shader uses no textures or iterative loops. Geometry,
material, and uniforms are never recreated per frame. Opaque rendering retains
the existing silhouette and avoids transparency sorting.

Gameplay squash/stretch, movement-driven deformation, dissolve, soft-body
simulation, identity switching, and general dynamic-light support remain
outside Issue #16.
