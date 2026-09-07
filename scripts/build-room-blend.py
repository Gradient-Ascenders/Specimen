"""Run in Blender: --background --python build-room-blend.py -- scene.json output.blend"""
import bpy
import json
import sys
from mathutils import Matrix

source, destination = sys.argv[sys.argv.index('--') + 1:]
with open(source, encoding='utf-8') as stream:
    data = json.load(stream)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
# Three (x,y,z) -> Blender (x,-z,y), preserving handedness and metre scale.
conversion = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
collections = {}
for name in ['Layout', 'Ceiling (hide to edit interior)', 'Lights', 'References', 'Hidden runtime objects']:
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    collections[name] = collection
materials = {}
for item in data['objects']:
    kind = item['type']
    if kind == 'mesh':
        mesh = bpy.data.meshes.new(item['name'])
        indices = item['indices']
        mesh.from_pydata(item['vertices'], [], [indices[i:i + 3] for i in range(0, len(indices), 3)])
        mesh.update()
        obj = bpy.data.objects.new(item['name'], mesh)
        for spec in item['materials']:
            key = json.dumps(spec, sort_keys=True)
            if key not in materials:
                material = bpy.data.materials.new(spec['name'])
                material.diffuse_color = (*spec['color'], spec['opacity'])
                material.use_nodes = True
                shader = material.node_tree.nodes.get('Principled BSDF')
                shader.inputs['Base Color'].default_value = (*spec['color'], 1)
                shader.inputs['Roughness'].default_value = spec['roughness']
                shader.inputs['Metallic'].default_value = spec['metalness']
                shader.inputs['Emission Color'].default_value = (*spec['emission'], 1)
                shader.inputs['Emission Strength'].default_value = spec['emissionStrength']
                materials[key] = material
            mesh.materials.append(materials[key])
        for group in item['groups']:
            for face in mesh.polygons[group['start'] // 3:(group['start'] + group['count']) // 3]:
                face.material_index = group.get('materialIndex', 0)
    elif kind == 'light':
        light = bpy.data.lights.new(item['name'], 'POINT')
        light.color = item['color']
        light.energy = item['intensity'] * 10
        obj = bpy.data.objects.new(item['name'], light)
    else:
        obj = bpy.data.objects.new(item['name'], None)
        obj.empty_display_type = 'CUBE' if kind == 'drone-reference' else 'PLAIN_AXES'
        obj.empty_display_size = 0.4
    if kind == 'drone-reference':
        obj.matrix_world = conversion @ Matrix.Translation(item['position'])
        obj.empty_display_size = 1
        obj.scale = [value / 2 for value in item['size']]
    else:
        values = item['matrix']
        obj.matrix_world = conversion @ Matrix([values[i::4] for i in range(4)])
    obj['source_name'] = item['name']
    obj['source_room'] = data['roomId']
    obj['source_metadata_json'] = json.dumps(item.get('metadata', {}))
    obj['gameplay_collider'] = item.get('collider', False)
    name = ('Hidden runtime objects' if not item.get('visible', True) else
            'Lights' if kind == 'light' else
            'References' if kind in ('empty', 'drone-reference') else
            'Ceiling (hide to edit interior)' if 'ceiling' in item['name'] else 'Layout')
    collections[name].objects.link(obj)
    obj.hide_render = not item.get('visible', True)
    if not item.get('visible', True):
        obj.hide_set(True)
collections['Ceiling (hide to edit interior)'].hide_viewport = True
scene['source_coordinates'] = data['coordinates']
scene['coordinate_mapping'] = 'Blender (X,Y,Z) = TypeScript (X,-Z,Y)'
scene['snapshot_note'] = 'Starting poses only. Gameplay, shaders and animations remain in TypeScript. Preserve source_name when editing.'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.clip_end = 1000
            area.spaces.active.region_3d.view_distance = 65
            area.spaces.active.region_3d.view_location = (0, -25, 10)
            area.spaces.active.shading.color_type = 'MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=destination)
print(f"Saved {destination}: {len(bpy.data.objects)} objects")
