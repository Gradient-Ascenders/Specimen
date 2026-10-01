# Bob reflection diagnosis and restrained material tuning

Status: awaiting visual review. No additional effect is proposed or included.

The recovery-position correction remains separate in commit `956e2d4`. This
pass changes one material scalar only: Bob's body clearcoat is reduced from
`0.40` to `0.35`.

## Controlled diagnosis

The production build was captured at 1440 x 900 with Bob's camera, pose,
secondary-animation time, active lighting, and renderer exposure frozen. The
Room 1 selection marker and DOM/debug overlays were hidden. Before every
variant, the complete baseline was restored; the stopped presentation could
not ease reflection intensity over the temporary override.

Baseline settings were body roughness `0.28`, clearcoat `0.40`, transmission
`0.28`, Room 1 body environment intensity `0.42`, and probe blur `0.055`
radians.

| Variant | Capture | Observation |
| --- | --- | --- |
| Baseline | [Current baseline](reflection-tuning/diagnosis-1-baseline.png) | Broad upper sheen plus several small crown highlights; the lower horizontal shading band is visible. |
| Body environment disabled | [Environment contribution 0](reflection-tuning/diagnosis-2-body-environment-disabled.png) | The small crown highlights and lower band remain. The probe contributes the broader sheen, not the individual direct-light spots. |
| Body transmission disabled | [Transmission 0](reflection-tuning/diagnosis-3-body-transmission-disabled.png) | Body density changes slightly, but the horizontal band and crowded highlights remain. The band is not refracted background. |
| Body clearcoat disabled | [Clearcoat 0](reflection-tuning/diagnosis-4-body-clearcoat-disabled.png) | The added coating response softens, while underlying direct-light highlights remain. Clearcoat amplifies rather than originates the crowded pattern. |

The horizontal band therefore follows Bob's curved direct/base-lit response in
this view. Moving probe panels, editing normals, or removing transmission would
target the wrong cause. The smallest supported adjustment is a modest reduction
of the extra coating layer. Probe construction, blur, transmission, roughness,
eyes, geometry, motion, and level lights remain unchanged.

## Matched result

The before and after images below use the same frozen authored camera and pose
in Room 2's open clinical space. The only difference is body clearcoat `0.40`
versus `0.35`.

| Distance | Before | After |
| --- | --- | --- |
| Normal gameplay, 5.2 m | [Before](reflection-tuning/before-normal-5.2m.png) | [After](reflection-tuning/after-normal-5.2m.png) |
| Closest supported, 3.5 m | [Before](reflection-tuning/before-close-3.5m.png) | [After](reflection-tuning/after-close-3.5m.png) |

The reduction is intentionally restrained: it slightly calms the coating on
the crown while retaining the broad gel sheen, dark lenses, and readable eye
highlights.

## Representative lighting checks

- [Dark Room 1 duct](reflection-tuning/after-dark-duct.png) — the authored
  tight-space camera and snapped body environment intensity `0.10` retain a
  readable cyan silhouette and eye reflections.
- [Room 3 green hazard light](reflection-tuning/after-green-hazard.png) — the
  real acid-reflected point light produces a green underside/rim without
  replacing Bob's cyan body identity; body environment intensity is `0.38`.
- [Room 5 direct red warning light](reflection-tuning/after-direct-red.png) —
  the real warning-state chamber light produces a localized red crown response;
  body environment intensity is `0.34`.
- The matched Room 2 captures above are the clinical-lighting validation.

All captures use renderer exposure `1`. No level light was retuned for Bob.

## Verification

- `npm run build` — passed after the material change.
- Temporary production-browser controlled diagnosis — passed with identical
  camera transform, pose time, lighting, and exposure across all four variants.
- Temporary production-browser material validation — passed at 5.2 m and 3.5 m
  and in the clinical, duct, green-hazard, and direct-red states.
- Browser console errors: none.
- Failed browser requests: none.

The temporary capture specs were removed after producing this evidence; they
did not add a runtime material editor or project dependency.
