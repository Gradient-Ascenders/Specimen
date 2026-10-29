# Containment service vent

Original Specimen art authored in native Blender through Blender MCP. The Level 2
Bob service duct informed the segmented panels, structural flanges and louvred
service covers. No downloaded assets or textures are included.

`vent.blend` is the editable source; `vent.glb` is the game export. `model.py`
contains the reviewed geometry/material construction. Reproduce both with:

```sh
blender --background --python assets/environments/containment-vent/generate.py
```

`model.py` uses game X/Y-up/Z coordinates and converts them to Blender at mesh
creation. The standard glTF export restores game coordinates. Four material
batches carry fixed vertex shading; runtime uses unlit vertex-colour materials.
There are no textures or lights. Dim amber marks indicate the bend and drop.

`shell-contract.json` records the gameplay boxes. Tests compare it to
ContainmentTeachingScene and raycast the lower ramp toe to prevent open seams.
The upper 1.24 m uses eight precise collision slabs and a continuous formed
sheet to ease the original 26-degree climb into the flat turning bay. The
landing notch follows that curve; the short adhesive entry and final drop stay
in their original locations. Traversal tests cover five lateral positions at
60 and 120 Hz through the complete crest.

The vent has its own visibility branch outside Room 1 art: Room 1 becomes
occluded before the vent disappears from the exit's backward view. Its actual
materials participate in every lighting preparation layout, including the
transmission target and the scoped exit view. Keeping it visible must not
introduce late shader compilation.
