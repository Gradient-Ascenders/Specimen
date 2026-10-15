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
    glow = bpy.context.scene.compositing_node_group
    assert glow is not None and glow.name == 'Volt-Studio-Subtle-Glow'
    glare = next(node for node in glow.nodes if node.bl_idname == 'CompositorNodeGlare')
    assert abs(glare.inputs['Strength'].default_value-0.08) < 1e-6
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
    lower_body = sorted([list(v.co) for v in body.data.vertices if v.co.z <= 0.340001])
    body_hash = hashlib.sha256(json.dumps(lower_body,separators=(',',':')).encode()).hexdigest()
    assert len(lower_body) == 6817
    assert body_hash == 'f2b6621829b0a2117b5d46feb04c842e6edbb368b559a9f7935f28bd760fbd0f'
    preserved_eyes = {}
    for name,digest in {
        'Volt-Eye-Left':'cdb019211f0d6d45de030360ae817c7ac17bd9a2b18ff423dc922e3a8e9eb9c6',
        'Volt-Eye-Right':'d92fc20506cb14964dae9f0b5c06b26078bd7df9d4ae3b67d23cbfad51168720',
    }.items():
        mesh = source[name].data
        signature = {'vertices':[list(v.co) for v in mesh.vertices],
                     'triangles':[list(t.vertices) for t in mesh.loop_triangles]}
        assert hashlib.sha256(json.dumps(signature,separators=(',',':')).encode()).hexdigest() == digest
        preserved_eyes[name] = digest
    assert all(poly.material_index == 0 for poly in body.data.polygons
               if max(body.data.vertices[i].co.z for i in poly.vertices) <= 0.340001)
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
    assert len(document['materials']) == 2 and len(document['images']) == 2
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
        for actual,wanted in zip(pbr['baseColorFactor'],bsdf.inputs['Base Color'].default_value):
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
    for image_name in ('Volt-Continuous-Emission','Volt-Continuous-Roughness'):
        image = bpy.data.images[image_name]
        assert tuple(image.size) == (2,512) and image.packed_file is not None
        pixels = list(image.pixels)
        source_ramps[image_name] = pixels
        previous = -1
        for row in range(512):
            height = ((row+0.5)/512)*1.79
            amount = max(0,min(1,(height-0.79)/0.46))
            amount = amount*amount*(3-2*amount)
            pixel = pixels[row*8:row*8+4]
            if image_name.endswith('Emission'):
                wanted = [(0.30+0.65*amount)*c for c in (1,0.65,0.001)]
                actual = [srgb_decode(c)*0.95 for c in pixel[:3]]
                assert all(abs(a-b)<0.007 for a,b in zip(actual,wanted))
                strength = actual[0]
            else:
                assert abs(pixel[1]-(0.18+0.10*amount)) < 1/255+1e-6
                strength = pixel[1]
            assert strength >= previous-1e-6
            previous = strength

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
        channels = range(3) if image_name.endswith('Emission') else (1,)
        assert all(abs(actual[i+channel]-pixels[i+channel]) < 1/255+1e-6
                   for i in range(0,len(pixels),4) for channel in channels), image_name
    result = {'glb_sha256': report['glb_sha256'], 'meshes': matches,
              'eye_seating': seating,'materials': material_checks,
              'outward_normals_and_manifoldness': 'passed',
              'floating_electrical_effects': 0,
              'preserved_body_geometry_sha256':body_hash,
              'preserved_eyes_geometry_sha256':preserved_eyes,
              'subtle_compositor_bloom_strength':0.08,
              'morph_position_errors_metres':morph_matches,
              'continuous_textures':'embedded PNG, gradient endpoints, monotonicity and UV roundtrip passed',
              'visible_mesh_primitives':3,
              'scope': 'Neutral and morph asset roundtrip; runtime lifecycle acceptance remains separate'}
    (DIRECTORY / 'volt.roundtrip.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__ == '__main__':
    main()
