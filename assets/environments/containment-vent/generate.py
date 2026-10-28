"""Reproduce the MCP-authored vent: blender --background --python generate.py."""
import bpy
import json
import pathlib
import sys
from mathutils import Vector

root=pathlib.Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path.insert(0,str(root))
from model import build_vent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name='Containment Vent'
build_vent(json.loads((root/'shell-contract.json').read_text()))
cam=bpy.data.objects.new('Vent inspection',bpy.data.cameras.new('Vent inspection'))
scene.collection.objects.link(cam)
cam.location=(-4.8,-6.7,6.15)
cam.rotation_euler=(Vector((-4.8,-14,6.6))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.lens=24
scene.camera=cam
scene.render.engine='CYCLES'
scene.cycles.samples=4
scene.render.resolution_x=1000
scene.render.resolution_y=650
scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
for o in scene.objects:o.select_set(o.type=='MESH')
bpy.ops.export_scene.gltf(filepath=str(root/'vent.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_yup=True,export_vertex_color='NAME',export_vertex_color_name='Color')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'vent.blend'))
