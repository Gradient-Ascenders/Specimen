# Facility sign rendering

Rectangular Containment signs in all five rooms share `createSignagePanel`,
one material, and one atlas owned/disposed by `ContainmentArtResources`.
Content, order and accent colours live in `ContainmentSignContent.ts`.

The atlas uses the bundled Michroma 400 font used by `#title-heading` through
`--ui-font-display`. It is baked rather than waiting for browser font loading.
The 1024 × 2560 opaque atlas gives each sign a 128-pixel row, with larger
lettering, a brighter subtitle, and the existing dark backing/accent stripes.
Linear magnification, trilinear mipmaps and 8× anisotropy (clamped by Three.js
to device support) preserve smooth edges and oblique readability.
The shared material uses restrained 0.35 self-illumination and a rougher finish
so text remains readable between fixtures without adding lights or glare.

The resource still uses one texture and material with unchanged geometry and
UV row selection. Base RGBA storage is 10 MiB, up from 2.5 MiB; mipmaps add
approximately one third. A palette/RLE source decodes once when the resource
owner is constructed. It introduces no per-frame canvas work or font requests.
Other vector labels, monitors and security pictograms retain their own paths.

After changing content or typography, run:

```text
npx playwright install chromium
npm run generate:signage
node scripts/generate-signage.ts --check
node --test tests/ContainmentArt.test.ts
npm run type-check
npm run build
npx playwright test tests/smoke/FacilitySigns.spec.ts --config playwright.smoke.config.ts
```

The font bake requires the pinned Playwright Chromium; normal builds do not.
The content test catches stale wording, colours or row order. The browser test
uses production assets under `/group-folder/`, checks console/HTTP/WebGL errors,
and writes front-facing and oblique screenshots into `test-results/smoke/`.
Inspect these captures as part of a typography change; pixel dimensions alone
cannot prove readability.

For a normal play check, run `npm run dev`, start the game and skip the intro.
Inspect `LOCKED` on the first door and `C-01` above the bay, then the vent route,
`C-02 / TRAVERSAL TEST CHAMBER`, and `C-03` in the next rooms. Compare front and
side approaches at the same resolution/preset, including the small subtitles.
The current source's vent sign reads `VENT ACCESS / SERVICE ROUTE`; it contains
no sign with the wording `VENTILATION OUTPOST`.
