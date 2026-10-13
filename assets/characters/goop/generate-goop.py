"""Regenerate Goop's Blender source, GLB and geometry report.

From the repository root:
  blender --background --factory-startup --python assets/characters/goop/generate-goop.py
Add -- --render to render the four studio inspection views.
"""

import hashlib
import json
from pathlib import Path
import sys

import bpy
import bmesh

DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(DIRECTORY))
import goop_model


def topology(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    non_manifold = sum(not edge.is_manifold for edge in bm.edges)
    unseen = set(bm.verts)
    components = 0
    while unseen:
        components += 1
        stack = [unseen.pop()]
        while stack:
            vertex = stack.pop()
            for edge in vertex.link_edges:
                adjacent = edge.other_vert(vertex)
                if adjacent in unseen:
                    unseen.remove(adjacent)
                    stack.append(adjacent)
    bm.free()
    vertices = [(v.co.x, v.co.z, -v.co.y) for v in mesh.vertices]
    bounds = {
        'minimum': [round(min(v[i] for v in vertices), 6) for i in range(3)],
        'maximum': [round(max(v[i] for v in vertices), 6) for i in range(3)],
    }
    signature = {'vertices': [[round(c, 7) for c in v] for v in vertices],
                 'triangles': [list(t.vertices) for t in mesh.loop_triangles]}
    assert non_manifold == 0, (obj.name, non_manifold)
    assert components == 1, (obj.name, components)
    assert all(t.area > 1e-12 for t in mesh.loop_triangles), obj.name
    return {'vertices': len(mesh.vertices), 'triangles': len(mesh.loop_triangles),
            'connected_components': components, 'non_manifold_edges': non_manifold,
            'runtime_bounds_metres': bounds,
            'geometry_sha256': hashlib.sha256(json.dumps(signature, separators=(',', ':')).encode()).hexdigest()}


def set_camera(position, target=(0, 0, 0.16)):
    camera = bpy.context.scene.camera
    camera.location = position
    goop_model.point_at(camera, target)


def main():
    # This entry point is for a fresh background process, never the live GUI.
    original_scene = bpy.context.scene
    goop_model.build_all()
    for obj in list(original_scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(original_scene)
    bpy.context.preferences.filepaths.save_version = 0
    character = [bpy.data.objects[name] for name in ('Goop-Body', 'Goop-Eye-Left', 'Goop-Eye-Right')]
    report = {'asset': 'goop-concept-sculpt-v1', 'runtime_up': '+Y', 'runtime_forward': '-Z',
              'resting_contact_y_metres': goop_model.SOLE,
              'meshes': {obj.name: topology(obj) for obj in character},
              'materials': ['Goop-Acid-Gel', 'Goop-Obsidian-Eyes'],
              'armatures': 0, 'morph_targets': 0, 'animations': 0,
              'export_excludes': ['studio']}
    report['total_triangles'] = sum(mesh['triangles'] for mesh in report['meshes'].values())
    assert abs(report['meshes']['Goop-Body']['runtime_bounds_metres']['minimum'][1] - goop_model.SOLE) < 1e-6
    assert report['total_triangles'] < 40000, report['total_triangles']
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in [bpy.data.objects['Goop'], *character]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = character[0]
    glb_path = DIRECTORY / 'goop.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_animations=False,
                              export_skins=False, export_morph=False, export_cameras=False,
                              export_lights=False, export_materials='EXPORT', export_extras=True)
    report['glb_sha256'] = hashlib.sha256(glb_path.read_bytes()).hexdigest()
    report['sources'] = {name: hashlib.sha256((DIRECTORY / name).read_bytes()).hexdigest()
                         for name in ('generate-goop.py', 'goop_model.py')}
    bpy.ops.wm.save_as_mainfile(filepath=str(DIRECTORY / 'goop.blend'), check_existing=False)
    (DIRECTORY / 'goop.validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    if '--render' in sys.argv:
        output = DIRECTORY / 'evidence'
        output.mkdir(exist_ok=True)
        for name, position in [('three-quarter', (2.3,4.2,1.65)),
                               ('front', (0,4.8,0.85)), ('side', (4.8,0,0.85)),
                               ('back', (0,-4.8,0.85))]:
            set_camera(position)
            bpy.context.scene.render.filepath = str(output / (name + '.png'))
            bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
