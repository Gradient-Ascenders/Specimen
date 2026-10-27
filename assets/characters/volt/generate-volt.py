"""Regenerate Volt in a separate background Blender process.

blender --background --factory-startup --python assets/characters/volt/generate-volt.py
Append -- --render for front, side, back and three-quarter studio images.
"""

import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh

DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(DIRECTORY))
import volt_model


def topology(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    non_manifold = sum(not edge.is_manifold for edge in bm.edges)
    inconsistent = sum(not edge.is_contiguous for edge in bm.edges)
    volume = bm.calc_volume(signed=True)
    unseen = set(bm.verts)
    components = 0
    while unseen:
        components += 1
        stack = [unseen.pop()]
        while stack:
            vertex = stack.pop()
            for edge in vertex.link_edges:
                neighbour = edge.other_vert(vertex)
                if neighbour in unseen:
                    unseen.remove(neighbour)
                    stack.append(neighbour)
    bm.free()
    points = [(v.co.x, v.co.z, -v.co.y) for v in mesh.vertices]
    bounds = {'minimum': [round(min(p[i] for p in points),6) for i in range(3)],
              'maximum': [round(max(p[i] for p in points),6) for i in range(3)]}
    signature = {'vertices': [[round(c,7) for c in p] for p in points],
                 'triangles': [list(t.vertices) for t in mesh.loop_triangles]}
    assert non_manifold == 0 and inconsistent == 0, (obj.name,non_manifold,inconsistent)
    assert volume > 0 and components == 1, (obj.name,volume,components)
    assert all(t.area > 1e-12 for t in mesh.loop_triangles), obj.name
    assert tuple(obj.location) == (0,0,0) and tuple(obj.scale) == (1,1,1), obj.name
    return {'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),
            'connected_components':components,'non_manifold_edges':non_manifold,
            'inconsistent_winding_edges':inconsistent,'signed_volume_m3':volume,
            'runtime_bounds_metres':bounds,
            'geometry_sha256':hashlib.sha256(json.dumps(signature,separators=(',',':')).encode()).hexdigest()}


def morph_report(obj):
    assert [key.name for key in obj.data.shape_keys.key_blocks] == ['Basis',*volt_model.MORPH_NAMES]
    report = {}
    obj.data.calc_loop_triangles()
    triangles = [tuple(triangle.vertices) for triangle in obj.data.loop_triangles]
    for key in list(obj.data.shape_keys.key_blocks)[1:]:
        points = [v.co.copy() for v in key.data]
        assert all(math.isfinite(c) for point in points for c in point), key.name
        assert all((points[b]-points[a]).cross(points[c]-points[a]).length > 2e-12
                   for a,b,c in triangles), (obj.name,key.name,'degenerate triangle')
        volume = sum(points[a].dot(points[b].cross(points[c]))/6 for a,b,c in triangles)
        assert volume > 0, (obj.name,key.name,volume)
        if obj.name == 'Volt-Body' and key.name in ('Squash','Stretch'):
            assert abs(min(point.z for point in points)-volt_model.SOLE) < 1e-6
        report[key.name] = {'position_sha256':hashlib.sha256(json.dumps(
            [list(point) for point in points],separators=(',',':')).encode()).hexdigest(),
            'signed_volume_m3':volume,
            'runtime_minimum':[min(p.x for p in points),min(p.z for p in points),-max(p.y for p in points)],
            'runtime_maximum':[max(p.x for p in points),max(p.z for p in points),-min(p.y for p in points)]}
    basis = obj.data.shape_keys.key_blocks['Basis']
    for body_pose in ('Squash','Stretch'):
        for blink_weight in (0.5,1.0):
            shape = obj.data.shape_keys.key_blocks[body_pose]
            blink = obj.data.shape_keys.key_blocks['Blink']
            points = [shape.data[i].co+(blink.data[i].co-basis.data[i].co)*blink_weight
                      for i in range(len(basis.data))]
            assert all((points[b]-points[a]).cross(points[c]-points[a]).length > 2e-12
                       for a,b,c in triangles), (obj.name,body_pose,blink_weight)
            volume = sum(points[a].dot(points[b].cross(points[c]))/6 for a,b,c in triangles)
            assert volume > 0, (obj.name,body_pose,blink_weight,'inverted blended pose')
    return report


def main():
    assert bpy.app.background, 'Use the focused model functions in the live GUI'
    original_scene = bpy.context.scene
    volt_model.build_all()
    # Only the factory-startup background process is cleaned, never the GUI.
    for obj in list(original_scene.objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(original_scene)
    bpy.context.preferences.filepaths.save_version = 0
    character = [bpy.data.objects[name] for name in volt_model.NAMES]
    report = {'asset':'volt-lightning-gel-v3','runtime_up':'+Y','runtime_forward':'-Z',
              'resting_contact_y_metres':volt_model.SOLE,
              'meshes':{obj.name:topology(obj) for obj in character},
              'materials':list(volt_model.MATERIAL_NAMES),
              'design':{'body':'Rounded bell body with a low pooled skirt',
                        'crest':'Compact continuous lightning fold with a tapered tip',
                        'body_height_metres':volt_model.CREST_ROOT_HEIGHT,
                        'crest_height_metres':volt_model.PROFILE[-1][0]-volt_model.CREST_ROOT_HEIGHT,
                        'total_height_metres':volt_model.PROFILE[-1][0],
                        'floating_effect_meshes':0,'studio_bloom':False},
              'armatures':0,'morph_targets':len(volt_model.MORPH_NAMES),
              'morph_names':list(volt_model.MORPH_NAMES),
              'blink_height_fraction':volt_model.BLINK_HEIGHT_FRACTION,
              'blend_validation':'half and full blink with full squash/stretch have positive volume and non-degenerate triangles',
              'morphs':{obj.name:morph_report(obj) for obj in character},
              'textures':{'Volt-Continuous-Emission':[2,512], 'Volt-Continuous-Roughness':[64,512], 'Volt-Amber-Depth':[2,512]},
              'animations':0,
              'export_excludes':['studio floor, camera and lights']}
    report['total_triangles'] = sum(m['triangles'] for m in report['meshes'].values())
    assert report['total_triangles'] < 50000, report['total_triangles']
    assert abs(report['meshes']['Volt-Body']['runtime_bounds_metres']['minimum'][1]-volt_model.SOLE) < 1e-6
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in [bpy.data.objects['Volt'],*character]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = character[0]
    glb = DIRECTORY/'volt.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=True,export_animations=False,export_skins=False,
        export_morph=True,export_morph_normal=True,export_cameras=False,export_lights=False,
        export_materials='EXPORT',export_extras=True)
    report['glb_sha256'] = hashlib.sha256(glb.read_bytes()).hexdigest()
    report['sources'] = {name:hashlib.sha256((DIRECTORY/name).read_bytes()).hexdigest()
                         for name in ('generate-volt.py','volt_model.py')}
    bpy.ops.wm.save_as_mainfile(filepath=str(DIRECTORY/'volt.blend'),check_existing=False)
    (DIRECTORY/'volt.validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    if '--render' in sys.argv:
        evidence = DIRECTORY.parents[2]/'artifacts'/'volt-polish'/'studio'
        evidence.mkdir(parents=True,exist_ok=True)
        for name,position in [('three-quarter',(1.8,5.2,1.7)),('front',(0,12,1.12)),
                              ('side',(12,0,1.12)),('back',(0,-12,1.12))]:
            bpy.context.scene.camera.location = position
            volt_model.point_at(bpy.context.scene.camera,(0,0,0.18))
            bpy.context.scene.render.filepath = str(evidence/(name+'.png'))
            bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
