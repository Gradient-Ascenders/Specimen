"""Author an isolated locomotion approval candidate from Bob's approved neutral.

The production bob-authored asset and its generator remain untouched. Run with
Blender --background --factory-startup --python this-file.
"""
import hashlib
import json
import math
from pathlib import Path
import runpy

import bpy

DIRECTORY = Path(__file__).resolve().parent
CURL_SOURCE = DIRECTORY / 'generate-bob-curl-candidate.py'
curl = runpy.run_path(str(CURL_SOURCE))
neutral = curl['neutral']
OUTPUT_STEM = 'bob-locomotion-candidate'
BODY_POSES = (
    'move-forward', 'move-reverse', 'squash', 'flatten', 'launch',
    'airborne', 'stress',
)
EXPRESSIONS = ('blink', 'effort', 'surprise', 'stress-expression')


def smoothstep(edge0, edge1, value):
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def deform(name, point):
    x, y, z = point
    height = (y + 0.45) / 0.8
    if name in ('move-forward', 'move-reverse'):
        direction = 1.0 if name == 'move-forward' else -1.0
        # Contact begins at the approved sole. Upper gel travels over it,
        # while the sprout tip gives back part of that travel as inertial lag.
        transfer = smoothstep(0.08, 0.78, height)
        crown = smoothstep(0.82, 1.34, height)
        leading = smoothstep(-0.12, 0.40, -direction * z)
        trailing = smoothstep(-0.12, 0.40, direction * z)
        z += direction * (-0.165 * transfer + 0.130 * crown)
        z += direction * (0.022 * leading - 0.028 * trailing) * transfer
        y += (-0.028 * leading + 0.020 * trailing) * transfer * (1 - 0.30 * crown)
        x *= 1 + (-0.035 * leading + 0.020 * trailing) * transfer
        return x, y, z
    if name in ('squash', 'flatten'):
        scale = 0.76 if name == 'squash' else 0.48
        spread = 1 / math.sqrt(scale)
        return x * spread, -0.45 + (y + 0.45) * scale, z * spread
    if name == 'launch':
        return x * 0.84, -0.45 + (y + 0.45) * 1.38, z * 0.86
    if name == 'airborne':
        return x * 0.96, -0.05 + (y + 0.05) * 1.12, z * 0.95 + 0.018 * (1 - height)**2
    if name == 'stress':
        bulge = 1 + 0.07 * math.sin(math.pi * height)
        return x * bulge, -0.45 + (y + 0.45) * 0.95, z * bulge
    raise ValueError(name)


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
        centre_x, centre_y, _ = neutral['blender_to_runtime'](basis.data[0].co)
        for name in EXPRESSIONS:
            key = obj.shape_key_add(name=name, from_mix=False)
            for source, target in zip(basis.data, key.data):
                x, y, z = neutral['blender_to_runtime'](source.co)
                sx, sy = {'blink': (1, 0.10), 'effort': (1.02, 0.75),
                          'surprise': (1.04, 1.07), 'stress-expression': (0.94, 0.68)}[name]
                ex = centre_x + (x - centre_x) * sx
                ey = centre_y + (y - centre_y) * sy
                ez = (z + neutral['front_surface_z'](body, ex, ey)
                      - neutral['front_surface_z'](body, x, y) - 0.012)
                target.co = neutral['runtime_to_blender']((ex, ey, ez))


def build():
    neutral['clear_scene']()
    bpy.context.preferences.filepaths.save_version = 0
    root = bpy.data.objects.new('Bob-Gate-One', None)
    bpy.context.scene.collection.objects.link(root)
    body_material = neutral['create_material']('Bob-Neutral-Body', (0.48, 0.51, 0.53, 1))
    eye_material = neutral['create_material']('Bob-Neutral-Eyes', (0.025, 0.035, 0.045, 1), roughness=0.2)
    body = curl['create_candidate_body'](body_material)
    bpy.context.scene.collection.objects.link(body)
    body.parent = root
    eyes = []
    for name, pixel_x, tilt in (('Bob-Eye-Left', 729, -8), ('Bob-Eye-Right', 524, 8)):
        eye = curl['create_candidate_eye'](name, pixel_x, tilt, eye_material, body)
        bpy.context.scene.collection.objects.link(eye)
        eye.parent = root
        eyes.append(eye)
    root['contract'] = 'bob-curl-neutral-v1'
    root['local_up'] = '+Y'
    root['local_forward'] = '-Z'
    root['collider_radius_metres'] = 0.45
    body['resting_contact_y_metres'] = -0.45
    add_keys(body, eyes)
    report = {
        'contract': 'bob-locomotion-approval-candidate-v1',
        'body_triangles': neutral['triangle_count'](body.data),
        'eye_triangles_combined': sum(neutral['triangle_count'](eye.data) for eye in eyes),
        'body_connected_components': neutral['connected_component_count'](body.data),
        'body_non_manifold_edges': neutral['body_manifold_edge_count'](body.data),
        'body_targets': BODY_POSES,
        'eye_targets': (*BODY_POSES, *EXPRESSIONS),
    }
    assert report['body_connected_components'] == 1 and report['body_non_manifold_edges'] == 0
    assert report['body_triangles'] == 3264 and report['eye_triangles_combined'] == 504
    for obj in [body, *eyes]:
        expected = ('Basis', *BODY_POSES, *(EXPRESSIONS if obj != body else ()))
        assert tuple(key.name for key in obj.data.shape_keys.key_blocks) == expected
        for key in obj.data.shape_keys.key_blocks:
            if key.name != 'Basis':
                key.value = 0.0
    blend_path = DIRECTORY / f'{OUTPUT_STEM}.blend'
    glb_path = DIRECTORY / f'{OUTPUT_STEM}.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=False, export_animations=False, export_skins=False,
        export_morph=True, export_morph_normal=True, export_cameras=False, export_lights=False,
        export_materials='EXPORT', export_attributes=False, export_extras=True)
    report.update(generator_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        approved_neutral_glb_sha256=hashlib.sha256((DIRECTORY / 'bob-curl-candidate.glb').read_bytes()).hexdigest(),
        glb_sha256=hashlib.sha256(glb_path.read_bytes()).hexdigest())
    (DIRECTORY / f'{OUTPUT_STEM}.validation.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    build()
