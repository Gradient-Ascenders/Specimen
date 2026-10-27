# Level selector previews

The three runtime images in `public/assets/ui/level-previews/` are screenshots
of Specimen's current production scenes.
They use the real authored levels and Medium graphics, with interface overlays
hidden. Cultivation is captured after its vent arrival finishes. No generated
art or external imagery is used.

Each image is 480 × 270, encoded directly by Chromium as JPEG at quality 82.
Together they are approximately 50 KB. Retake them from gameplay when the level
art changes, using the same aspect ratio and keeping each file below 40 KB.

`LevelSelectCards.ts` stores deployment-relative paths in `data-level-preview`.
It adds image `src` attributes only when the selector opens. The previews never
gate selection or level preparation, and unavailable images retain the card's
coloured placeholder and accessible text.
