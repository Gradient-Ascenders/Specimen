"""Render an inspection cutaway without changing the saved room file."""
import bpy
import sys
from mathutils import Vector

source, destination = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=source)
scene = bpy.context.scene
for obj in scene.objects:
    name = obj.get('source_name', obj.name)
    if any(word in name for word in ('ceiling', 'east-wall', 'entry-wall', 'above-goop-door', 'below-bob-vent', 'above-bob-vent', 'bob-vent-east', 'bob-vent-west')):
        obj.hide_render = True
    if obj.type == 'MESH' and not obj.get('gameplay_collider', False) and 'wall-button' in name:
        obj.hide_render = False
    if name.endswith('wall-button'):
        obj.hide_render = True
    if name.startswith('room-2-') and obj.matrix_world.translation.x > 18 and any(part in name for part in ('panel-', 'service-trim', 'fluorescent-strip')):
        obj.hide_render = True
camera = bpy.data.cameras.new('Inspection camera')
obj = bpy.data.objects.new('Inspection camera', camera)
scene.collection.objects.link(obj)
room = scene.get('source_coordinates', '')
is_three = 'Room3' in source
target = Vector((0, -35 if is_three else -23, 10))
obj.location = target + Vector((65, 75, 62))
obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
camera.type = 'ORTHO'
camera.ortho_scale = 88 if is_three else 65
scene.camera = obj
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = 'BOTH'
scene.render.resolution_x = 1400
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = destination
bpy.ops.render.render(write_still=True)
