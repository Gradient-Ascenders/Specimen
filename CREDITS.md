# Credits

This is Specimen's canonical living credits ledger. It records directly chosen
third-party resources that may need to appear in the final in-game credits.

## Software / libraries

| Resource | Author / creator | Source | Licence | Use in Specimen |
| --- | --- | --- | --- | --- |
| Three.js 0.185.1 | mrdoob | [npm package](https://www.npmjs.com/package/three/v/0.185.1) | MIT | 3D rendering framework used by the browser game. |
| Vite 8.2.1 | Evan You | [npm package](https://www.npmjs.com/package/vite/v/8.2.1) | MIT | Development server and production build tool. |
| TypeScript 7.0.2 | Microsoft Corp. | [npm package](https://www.npmjs.com/package/typescript/v/7.0.2) | Apache-2.0 | Type checking and compilation. |
| @types/three 0.185.4 | DefinitelyTyped contributors | [npm package](https://www.npmjs.com/package/@types/three/v/0.185.4) | MIT | Type declarations for Three.js during type checking. |

## Models / meshes

No third-party models or meshes have been introduced yet.

## Textures / materials

No third-party textures or materials have been introduced yet.

## Audio / music

No third-party audio or music has been introduced yet.

## Fonts

No third-party fonts have been introduced yet; the stylesheet requests locally
installed and system fallback fonts only.

## Tutorials / references / adapted code

| Resource | Author / creator | Source | Licence | Use in Specimen |
| --- | --- | --- | --- | --- |
| Hash without Sine (`hash13`) | David Hoskins | [Original Shadertoy](https://www.shadertoy.com/view/4djSRW) | MIT, copyright © 2014 David Hoskins | Adapted with renamed variables as the lattice hash in the soluble-geometry value-noise mask. |

The dissolve value-noise interpolation, octave composition, gameplay
threshold, corrosion edge, standard-material integration, and matching shadow
passes were written for Specimen. No external texture or shader asset is used.

## Maintaining this ledger

When a pull request introduces third-party code, assets, textures, models,
fonts, audio, tutorials, references, or adapted examples, add its credit in the
same pull request. Record the resource, creator, source, licence, and actual
use in Specimen; do not merge unattributed third-party work. Update an entry if
the project's use or licence information changes.
