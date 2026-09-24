"""Render exported curl morphs for the Gate 3 silhouette review.

Run after generate-bob-authored.py with Blender in background mode. The
images come from the exported GLB, not the editable Blender source.
"""
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / 'docs/evidence/issue-150/curl-production'
locomotion_only = False
if '--' in sys.argv:
    arguments = sys.argv[sys.argv.index('--') + 1:]
    locomotion_only = '--locomotion-only' in arguments
    arguments = [argument for argument in arguments if argument != '--locomotion-only']
    if len(arguments) != 2 or arguments[0] != '--output':
        raise ValueError('Expected --output <repo-relative-directory> [--locomotion-only]')
    OUTPUT = ROOT / arguments[1]
OUTPUT.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'assets/characters/bob/bob-authored.glb'))

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.display.shading.light = 'STUDIO'
scene.display.shading.studio_light = 'paint.sl'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = False
scene.display.shading.background_type = 'VIEWPORT'
scene.display.shading.background_color = (0.055, 0.065, 0.075)

camera_data = bpy.data.cameras.new('Bob-Curl-Morph-Review-Camera')
camera = bpy.data.objects.new('Bob-Curl-Morph-Review-Camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 1.65


def camera_at(point):
    x, y, z = point
    camera.location = Vector((x, -z, y))
    target = Vector((0, 0, 0.12))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()


def set_pose(name):
    for mesh_name in ('Bob-Body', 'Bob-Eye-Left', 'Bob-Eye-Right'):
        keys = bpy.data.objects[mesh_name].data.shape_keys.key_blocks
        for key in keys:
            if key.name != 'Basis':
                key.value = 1 if key.name == name else 0


def render(name, viewpoint=(0, 0.12, -3)):
    camera_at(viewpoint)
    scene.render.filepath = str(OUTPUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)


set_pose('')
render('neutral-front')
render('neutral-side', (3, 0.12, 0))
render('neutral-three-quarter', (2.1, 0.5, -2.1))
for pose in ('move-reach', 'move-gather', 'squash', 'flatten',
             'launch', 'airborne', 'stress', 'blink'):
    if locomotion_only and pose not in ('move-reach', 'move-gather'):
        continue
    set_pose(pose)
    render(pose)
    if pose in ('move-reach', 'move-gather'):
        render(pose + '-side', (3, 0.12, 0))
        render(pose + '-three-quarter', (2.1, 0.5, -2.1))
