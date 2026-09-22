"""Deterministic morph source. Run with Blender --background --python this-file.

Reuses the approved neutral generator without rewriting its artifacts. Body and
seat keys share a continuous deformation field; expression deltas are authored
on the neutral front surface independently of that field.
"""
import hashlib
import json
import math
from pathlib import Path
import runpy

import bpy

DIRECTORY = Path(__file__).resolve().parent
NEUTRAL_SOURCE = DIRECTORY / 'generate-bob-gate-one.py'
neutral = runpy.run_path(str(NEUTRAL_SOURCE))
BODY_POSES = ('move-reach', 'move-gather', 'squash', 'flatten', 'launch', 'airborne', 'stress')
EXPRESSIONS = ('blink', 'effort', 'surprise', 'stress-expression')


def deform(name, point):
    x, y, z = point
    h = (y + 0.45) / 0.8
    if name in ('squash', 'flatten'):
        scale = 0.76 if name == 'squash' else 0.48
        spread = 1 / math.sqrt(scale)
        return x * spread, -0.45 + (y + 0.45) * scale, z * spread
    if name == 'launch':
        return x * 0.84, -0.45 + (y + 0.45) * 1.38, z * 0.86
    if name == 'airborne':
        return x * 0.96, -0.05 + (y + 0.05) * 1.12, z * 0.95 + 0.018 * (1 - h)**2
    if name == 'stress':
        bulge = 1 + 0.07 * math.sin(math.pi * h)
        return x * bulge, -0.45 + (y + 0.45) * 0.95, z * bulge
    # Reach places lower leading mass forward; Gather brings trailing mass in.
    front = max(0, -z / 0.45)
    back = max(0, z / 0.45)
    if name == 'move-reach':
        return x * (1 - 0.035 * front), y - 0.025 * h * front, z - 0.08 * front * (1 - h)
    return x * (1 + 0.035 * back), y + 0.025 * h * back, z - 0.07 * back * (1 - h)


def add_keys(body, eyes):
    for obj in [*eyes, body]:
        basis = obj.shape_key_add(name='Basis')
        for name in BODY_POSES:
            key = obj.shape_key_add(name=name, from_mix=False)
            for source, target in zip(basis.data, key.data):
                point = neutral['blender_to_runtime'](source.co)
                target.co = neutral['runtime_to_blender'](deform(name, point))
        if obj == body:
            continue
        centre_x = -0.205 if obj.name.endswith('Left') else 0.205
        for name in EXPRESSIONS:
            key = obj.shape_key_add(name=name, from_mix=False)
            for source, target in zip(basis.data, key.data):
                x, y, z = neutral['blender_to_runtime'](source.co)
                sx, sy = {'blink': (1, 0.10), 'effort': (1.02, 0.75),
                          'surprise': (1.04, 1.07), 'stress-expression': (0.94, 0.68)}[name]
                ex = centre_x + (x - centre_x) * sx
                ey = -0.065 + (y + 0.065) * sy
                # Preserve lens depth while moving its footprint over the skin.
                ez = z + neutral['front_surface_z'](body, ex, ey) - neutral['front_surface_z'](body, x, y)
                target.co = neutral['runtime_to_blender']((ex, ey, ez))


def build():
    neutral['clear_scene']()
    bpy.context.preferences.filepaths.save_version = 0
    root = bpy.data.objects.new('Bob-Gate-One', None)
    bpy.context.scene.collection.objects.link(root)
    body_material = neutral['create_material']('Bob-Neutral-Body', (0.48, 0.51, 0.53, 1))
    eye_material = neutral['create_material']('Bob-Neutral-Eyes', (0.025, 0.035, 0.045, 1), roughness=0.2)
    body = neutral['create_body'](body_material)
    bpy.context.scene.collection.objects.link(body)
    body.parent = root
    eyes = []
    for name, x in [('Bob-Eye-Left', -0.205), ('Bob-Eye-Right', 0.205)]:
        eye = neutral['create_eye'](name, x, eye_material, body)
        bpy.context.scene.collection.objects.link(eye)
        eye.parent = root
        eyes.append(eye)
    root['contract'] = 'bob-gate-one-neutral-v1'
    root['local_up'] = '+Y'
    root['local_forward'] = '-Z'
    root['collider_radius_metres'] = 0.45
    body['resting_contact_y_metres'] = -0.45
    report = neutral['validate_source'](body, eyes)
    add_keys(body, eyes)
    for obj in [body, *eyes]:
        expected = ('Basis', *BODY_POSES, *(EXPRESSIONS if obj != body else ()))
        assert tuple(key.name for key in obj.data.shape_keys.key_blocks) == expected
    bpy.ops.wm.save_as_mainfile(filepath=str(DIRECTORY / 'bob-authored.blend'), check_existing=False)
    bpy.ops.object.select_all(action='SELECT')
    glb_path = DIRECTORY / 'bob-authored.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=False, export_animations=False, export_skins=False,
        export_morph=True, export_morph_normal=True, export_cameras=False, export_lights=False,
        export_materials='EXPORT', export_attributes=False, export_extras=True)
    report.update(gate=3, body_targets=BODY_POSES, eye_targets=(*BODY_POSES, *EXPRESSIONS),
        morph_targets=7, generator_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        neutral_generator_sha256=hashlib.sha256(NEUTRAL_SOURCE.read_bytes()).hexdigest(),
        glb_sha256=hashlib.sha256(glb_path.read_bytes()).hexdigest())
    (DIRECTORY / 'bob-authored.validation.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    build()
