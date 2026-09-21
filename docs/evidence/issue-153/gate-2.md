# Issue #153 — Bob Gate 2 material evidence

Status: implemented and awaiting explicit visual approval. Gate 3 morph,
expression, frame and locomotion work has not started.

Bob uses the Gate 1-approved geometry unchanged. Runtime presentation replaces
the neutral inspection materials with a scene-lit physical cyan gel body and
one shared glossy-black eye material. Neither material emits light. No authored
catchlight geometry was added because both eye silhouettes remain readable in
the closest and default gameplay views.

## Gameplay distances

- [Default 5.2 m gameplay distance](gate-2/clinical-default-camera.png)
- [Closest supported 3.5 m gameplay distance](gate-2/clinical-closest-camera.png)

These views use Room 2's open clinical space so Level 1 architecture does not
occlude the material review. The body remains cyan against the cold grey room,
the lower volume retains depth, and the separate black lenses read without
internal anatomy or catchlight meshes.

## Representative Level 1 lighting

- [Red alarm state](gate-2/alarm-lighting.png)
- [Green hazard state](gate-2/hazard-lighting.png)
- [Mixed orange and green state](gate-2/mixed-lighting.png)

The alarm and mixed captures place Bob immediately outside the solid Room 5
containment chamber under its real warning and transition lights. The hazard
capture uses Room 3's acid-reflected lighting. Bob keeps a readable cyan body,
dark eye lenses and complete silhouette in all three states. Coloured highlights
change with the room lights; the materials have zero emissive contribution.

## Material and shader contract

| Property | Gate 2 result |
| --- | ---: |
| Body material | `Bob-Gel-Body` |
| Optical transmission | 0.28 |
| Body/eye emissive contribution | 0 / 0 |
| Eye material | `Bob-Glossy-Eyes` shared by both lenses |
| Authored catchlights | 0 |
| Idle wobble amplitude | 3.5 mm |
| Impact ripple amplitude | 6.0 mm |
| Maximum combined secondary displacement | 9.5 mm |

The custom vertex contribution is restricted to surface-scale wobble and local
impact ripple. It is suppressed over the front eye-seat region and reduced at
the contact base. It does not squash, stretch, translate or otherwise own the
major silhouette; those responsibilities remain behind Gate 3 authored morphs.

## Browser and lifecycle observations

The captures came from the Vite production build at 1440 × 900 in headless
Chromium. One browser operation exercised all lighting states and checked:

- no console errors or page errors;
- no failed requests or HTTP error responses;
- the physical body/eye material names and zero emissive values;
- no catchlight objects;
- stable geometry, texture and shader-program counts across restart after the
  representative states had rendered.

Automated presentation coverage also verifies imported neutral GLB materials
are disposed when the Gate 2 materials replace them, material time and impact
ripple state reset cleanly, and final geometry/material resources dispose once.

## Reproduce

From the repository root:

```bash
node --test tests/BobCharacterPresentation.test.ts
node --test tests/BobGateOneAsset.test.ts
npm run build
```

Run `npm run dev`, start Level 1, and inspect Bob in the Room 1/2 clinical
spaces. The development lighting controls can cycle the existing Bob hatch and
Goop release states for alarm and mixed-light inspection.

## Gate boundary

This gate establishes only the approved neutral geometry's gel body, eye
materials, bounded secondary surface motion, representative Level 1 lighting
response, and lifecycle evidence. Work stops here pending explicit material
approval. It does not claim authored body/eye morphs, expressions,
presentation-frame transitions, mass-transfer locomotion, traversal reactions,
or Gate 3 acceptance.
