# Asset sources

| Location | Contents |
| --- | --- |
| `assets/characters/`, `environments/`, `vehicles/` | Editable Blender sources, GLB exports, generators and compact validation manifests. |
| `assets/branding/` | Repository branding. |
| `assets/audio/` | Original recordings/packs grouped by character, scene or interaction. |
| `assets/audio/manifests/` | Sound inventory, source hashes and processing records. |
| `src/assets/` | Bundled runtime banks, portraits and the optional opening movie. |
| `public/assets/audio/` | Runtime OGG effects and music copied into production. |
| `public/brand/` | Runtime menu branding. |

Use lowercase kebab-case for new media filenames and describe their role.
Music filenames identify the scene/composition; runtime track keys remain in
`src/audio/BackgroundMusic.ts`. Keep supplied archive member names intact.

Source archives, editable studios and provenance stay outside `public/` so they
are not copied into the game. Preserve current generators and their inputs;
Bob's earlier candidate files, for example, form the current model's authoring
chain. Small validation manifests retain contracts and hashes, while screenshots,
videos and benchmark dumps belong in ignored `artifacts/` or generated local
`evidence/` directories. Removed historical captures remain in Git history.

Run `npm run check:generated-assets` after asset changes. Individual folder
READMEs document authoring-specific commands. Shared generators live under
`scripts/assets/` and audio importers under `scripts/audio/`; see
[development](../docs/development.md) and [audio](../docs/architecture/gameplay-audio.md).
Keep creator, licence and edit attribution in [CREDITS](../CREDITS.md).
