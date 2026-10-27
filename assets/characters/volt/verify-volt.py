"""Verify the saved source and a clean GLB import in a background process.

blender --background assets/characters/volt/volt.blend --python assets/characters/volt/verify-volt.py
"""

from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct

import bpy
import bmesh
from mathutils.kdtree import KDTree

DIRECTORY = Path(__file__).resolve().parent
NAMES = ('Volt-Body', 'Volt-Eye-Left', 'Volt-Eye-Right')
MORPH_NAMES = ('Squash','Stretch','Blink','CrestFlexLeft','CrestFlexRight')


def geometry(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    points = [obj.matrix_world @ v.co for v in mesh.vertices]
    triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    return points, triangles


def main():
    assert bpy.app.background, 'Run verification separately from the live GUI'
    report = json.loads((DIRECTORY / 'volt.validation.json').read_text())
    for name, digest in report['sources'].items():
        assert hashlib.sha256((DIRECTORY / name).read_bytes()).hexdigest() == digest, name
    source = {name: bpy.data.objects[name] for name in NAMES}
    assert not any(obj.name.startswith(('Volt-Studio-Arc-', 'Volt-Studio-Spark-'))
                   for obj in bpy.data.objects), 'Removed electrical dressing must stay absent'
    assert bpy.context.scene.compositing_node_group is None, 'Character preview has no bloom effect'
    expected = {}
    for name, obj in source.items():
        assert not obj.modifiers, name
        assert [key.name for key in obj.data.shape_keys.key_blocks] == ['Basis',*MORPH_NAMES]
        assert all(key.value == 0 for key in list(obj.data.shape_keys.key_blocks)[1:]), name
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        assert all(edge.is_manifold and edge.is_contiguous for edge in bm.edges), name
        assert bm.calc_volume(signed=True) > 0, name
        bm.free()
        expected[name] = geometry(obj)

    body = source['Volt-Body']
    seating = {}
    for name in NAMES[1:]:
        mesh = source[name].data
        shell = len(mesh.vertices) // 2
        assert shell * 2 == len(mesh.vertices)
        front_depths, rear_depths = [], []
        for i, vertex in enumerate(mesh.vertices):
            x,y,z = vertex.co
            hit,point,normal,index = body.ray_cast((x,3,z),(0,-1,0))
            assert hit, (name,i)
            (front_depths if i < shell else rear_depths).append(y-point.y)
        assert max(rear_depths) < -0.017, name
        assert min(front_depths) >= -0.0021 and max(front_depths) <= 0.0381, name
        assert max(front_depths) > 0.037, name
        seating[name] = {'front_depth_range': [min(front_depths),max(front_depths)],
                         'rear_max_depth': max(rear_depths)}

    raw = (DIRECTORY / 'volt.glb').read_bytes()
    assert hashlib.sha256(raw).hexdigest() == report['glb_sha256']
    magic,version,total = struct.unpack_from('<4sII',raw)
    assert magic == b'glTF' and version == 2 and total == len(raw)
    length,kind = struct.unpack_from('<II',raw,12)
    assert kind == 0x4E4F534A
    document = json.loads(raw[20:20+length])
    assert len(document['meshes']) == 3
    assert len(document['materials']) == 2 and len(document['images']) == 3
    assert all(len(mesh['primitives']) == 1 for mesh in document['meshes'])
    for mesh in document['meshes']:
        assert mesh['extras']['targetNames'] == list(MORPH_NAMES)
        assert len(mesh['primitives'][0]['targets']) == len(MORPH_NAMES)
    assert 'TEXCOORD_0' in document['meshes'][0]['primitives'][0]['attributes']
    assert len(document['nodes']) == 4
    assert {node['name'] for node in document['nodes']} == {'Volt', *NAMES}
    assert not document.get('animations') and not document.get('skins')
    material_checks = {}
    for mat in document['materials']:
        bsdf = bpy.data.materials[mat['name']].node_tree.nodes['Principled BSDF']
        pbr = mat['pbrMetallicRoughness']
        for actual,wanted in zip(pbr.get('baseColorFactor',[1,1,1,1]),bsdf.inputs['Base Color'].default_value):
            assert abs(actual-wanted) < 1e-6
        roughness = 1 if bsdf.inputs['Roughness'].is_linked else bsdf.inputs['Roughness'].default_value
        assert abs(pbr.get('roughnessFactor',1)-roughness) < 1e-6
        assert abs(pbr.get('metallicFactor',1)-bsdf.inputs['Metallic'].default_value) < 1e-6
        extensions = mat.get('extensions',{})
        coat = extensions.get('KHR_materials_clearcoat',{})
        assert abs(coat.get('clearcoatFactor',0)-bsdf.inputs['Coat Weight'].default_value) < 1e-6
        assert abs(coat.get('clearcoatRoughnessFactor',0)-bsdf.inputs['Coat Roughness'].default_value) < 1e-6
        transmission = extensions.get('KHR_materials_transmission',{}).get('transmissionFactor',0)
        assert abs(transmission-bsdf.inputs['Transmission Weight'].default_value) < 1e-6
        assert abs(extensions.get('KHR_materials_ior',{}).get('ior',1.5)-bsdf.inputs['IOR'].default_value) < 1e-6
        emission = [c*bsdf.inputs['Emission Strength'].default_value for c in bsdf.inputs['Emission Color'].default_value[:3]]
        for actual,wanted in zip(mat.get('emissiveFactor',[0,0,0]),emission):
            assert abs(actual-wanted) < 1e-6
        material_checks[mat['name']] = 'base color, metallic, roughness, coat, transmission, IOR and emission match'

    def srgb_decode(value):
        return value/12.92 if value <= 0.04045 else ((value+0.055)/1.055)**2.4

    source_ramps = {}
    for image_name, dimensions in report['textures'].items():
        image = bpy.data.images[image_name]
        width, rows = dimensions
        assert tuple(image.size) == tuple(dimensions) and image.packed_file is not None
        pixels = list(image.pixels)
        source_ramps[image_name] = pixels
        previous = [-1.0]*width
        for row in range(rows):
            height = (row+.5)/rows*report['design']['total_height_metres']
            amount = max(0,min(1,(height-report['design']['body_height_metres'])/.46))
            amount = amount*amount*(3-2*amount)
            for column in range(width):
                start=(row*width+column)*4
                pixel=pixels[start:start+4]
                if image_name.endswith('Emission'):
                    wanted=[(.30+.65*amount)*c for c in (1,.65,.001)]
                    actual=[srgb_decode(c)*.95 for c in pixel[:3]]
                    assert all(abs(a-b)<.007 for a,b in zip(actual,wanted))
                    strength=actual[0]
                elif image_name.endswith('Depth'):
                    rise=max(0,min(1,(height-.035)/.405))
                    amber=1-rise*rise*(3-2*rise)
                    actual=[srgb_decode(c) for c in pixel[:3]]
                    wanted=(1.,.72*(1-.12*amber),.003)
                    assert all(abs(a-b)<.007 for a,b in zip(actual,wanted))
                    strength=actual[1]
                else:
                    u=(column+.5)/width
                    wanted=.26+.08*amount+.032*(u-.5)*(1-.45*amount)
                    assert abs(pixel[1]-wanted)<1/255+1e-6
                    strength=pixel[1]
                assert strength>=previous[column]-1e-6
                previous[column]=strength
        if image_name.endswith('Roughness'):
            assert abs(pixels[(width-1)*4+1]-pixels[1])>.02,'spatial roughness variation'

    imported_scene = bpy.data.scenes.new('GLB Verification')
    bpy.context.window.scene = imported_scene
    bpy.ops.import_scene.gltf(filepath=str(DIRECTORY / 'volt.glb'))
    bpy.context.view_layer.update()
    imported = [o for o in imported_scene.objects if o.type == 'MESH']
    assert len(imported) == 3
    matches = {}
    morph_matches = {}
    for name,(points,triangles) in expected.items():
        obj = next(o for o in imported if o.name.split('.')[0] == name)
        actual_points,actual_triangles = geometry(obj)
        tree = KDTree(len(points))
        for i,point in enumerate(points):
            tree.insert(point,i)
        tree.balance()
        mapping,errors = [],[]
        for point in actual_points:
            nearest,index,distance = tree.find(point)
            assert distance < 2e-6,(name,distance)
            mapping.append(index)
            errors.append(distance)
        assert Counter(tuple(sorted(t)) for t in triangles) == Counter(
            tuple(sorted(mapping[i] for i in t)) for t in actual_triangles), name
        matches[name] = {'triangles': len(triangles),'max_position_error_metres': max(errors)}
        source_keys = source[name].data.shape_keys.key_blocks
        imported_keys = obj.data.shape_keys.key_blocks
        assert [key.name for key in imported_keys][1:] == list(MORPH_NAMES)
        morph_matches[name] = {}
        for morph_name in MORPH_NAMES:
            source_points = source_keys[morph_name].data
            imported_points = imported_keys[morph_name].data
            position_errors = [(vertex.co-source_points[mapping[i]].co).length
                               for i,vertex in enumerate(imported_points)]
            assert max(position_errors) < 2e-6, (name,morph_name,max(position_errors))
            assert all(math.isfinite(c) for vertex in imported_points for c in vertex.co)
            morph_matches[name][morph_name] = max(position_errors)
        if name == 'Volt-Body':
            expected_uv = {}
            for loop in source[name].data.loops:
                expected_uv[loop.vertex_index] = source[name].data.uv_layers.active.data[loop.index].uv.copy()
            for loop in obj.data.loops:
                actual_uv = obj.data.uv_layers.active.data[loop.index].uv
                assert (actual_uv-expected_uv[mapping[loop.vertex_index]]).length < 2e-6

    imported_body = next(obj for obj in imported if obj.name.split('.')[0] == 'Volt-Body')
    nodes = imported_body.data.materials[0].node_tree.nodes
    for image_name,pixels in source_ramps.items():
        node = next(node for node in nodes if node.type == 'TEX_IMAGE' and node.image.name.split('.')[0] == image_name)
        actual = list(node.image.pixels)
        assert len(actual) == len(pixels)
        channels = (1,) if image_name.endswith('Roughness') else range(3)
        assert all(abs(actual[i+channel]-pixels[i+channel]) < 1/255+1e-6
                   for i in range(0,len(pixels),4) for channel in channels), image_name
    result = {'glb_sha256': report['glb_sha256'], 'meshes': matches,
              'eye_seating': seating,'materials': material_checks,
              'outward_normals_and_manifoldness': 'passed',
              'floating_electrical_effects': 0,
              'sculpt_geometry_sha256':{name:mesh['geometry_sha256'] for name,mesh in report['meshes'].items()},
              'subtle_compositor_bloom_strength':0,
              'morph_position_errors_metres':morph_matches,
              'continuous_textures':'embedded PNG, gradient endpoints, monotonicity and UV roundtrip passed',
              'visible_mesh_primitives':3,
              'scope': 'Neutral and morph asset roundtrip; runtime lifecycle acceptance remains separate'}
    (DIRECTORY / 'volt.roundtrip.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__ == '__main__':
    main()
