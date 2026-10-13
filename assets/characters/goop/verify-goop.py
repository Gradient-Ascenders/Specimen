"""Verify the saved source and a clean GLB import in a background process.

blender --background assets/characters/goop/goop.blend --python assets/characters/goop/verify-goop.py
"""

from collections import Counter
import hashlib
import json
from pathlib import Path
import struct

import bpy
import bmesh
from mathutils.kdtree import KDTree

DIRECTORY = Path(__file__).resolve().parent
NAMES = ('Goop-Body', 'Goop-Eye-Left', 'Goop-Eye-Right')


def geometry(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    points = [obj.matrix_world @ v.co for v in mesh.vertices]
    triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    return points, triangles


def main():
    assert bpy.app.background, 'Run verification separately from the live GUI'
    report = json.loads((DIRECTORY / 'goop.validation.json').read_text())
    for name, digest in report['sources'].items():
        assert hashlib.sha256((DIRECTORY / name).read_bytes()).hexdigest() == digest, name
    source = {name: bpy.data.objects[name] for name in NAMES}
    assert not any('Puddle' in obj.name for obj in bpy.data.objects)
    expected = {}
    for name, obj in source.items():
        assert not obj.modifiers and not obj.data.shape_keys, name
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        assert all(edge.is_manifold and edge.is_contiguous for edge in bm.edges), name
        assert bm.calc_volume(signed=True) > 0, name
        bm.free()
        expected[name] = geometry(obj)

    body = source['Goop-Body']
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
        assert max(rear_depths) < -0.014, name
        assert min(front_depths) >= -0.0016 and max(front_depths) <= 0.017, name
        assert max(front_depths) > 0.015, name
        seating[name] = {'front_depth_range': [min(front_depths),max(front_depths)],
                         'rear_max_depth': max(rear_depths)}

    raw = (DIRECTORY / 'goop.glb').read_bytes()
    assert hashlib.sha256(raw).hexdigest() == report['glb_sha256']
    magic,version,total = struct.unpack_from('<4sII',raw)
    assert magic == b'glTF' and version == 2 and total == len(raw)
    length,kind = struct.unpack_from('<II',raw,12)
    assert kind == 0x4E4F534A
    document = json.loads(raw[20:20+length])
    assert len(document['meshes']) == 3
    assert not document.get('animations') and not document.get('skins')
    material_checks = {}
    for mat in document['materials']:
        bsdf = bpy.data.materials[mat['name']].node_tree.nodes['Principled BSDF']
        pbr = mat['pbrMetallicRoughness']
        for actual,wanted in zip(pbr['baseColorFactor'],bsdf.inputs['Base Color'].default_value):
            assert abs(actual-wanted) < 1e-6
        assert abs(pbr['roughnessFactor']-bsdf.inputs['Roughness'].default_value) < 1e-6
        extensions = mat.get('extensions',{})
        coat = extensions.get('KHR_materials_clearcoat',{})
        assert abs(coat.get('clearcoatFactor',0)-bsdf.inputs['Coat Weight'].default_value) < 1e-6
        assert abs(coat.get('clearcoatRoughnessFactor',0)-bsdf.inputs['Coat Roughness'].default_value) < 1e-6
        transmission = extensions.get('KHR_materials_transmission',{}).get('transmissionFactor',0)
        assert abs(transmission-bsdf.inputs['Transmission Weight'].default_value) < 1e-6
        assert abs(extensions.get('KHR_materials_ior',{}).get('ior',1.5)-bsdf.inputs['IOR'].default_value) < 1e-6
        material_checks[mat['name']] = 'base color, roughness, coat, transmission and IOR match'

    imported_scene = bpy.data.scenes.new('GLB Verification')
    bpy.context.window.scene = imported_scene
    bpy.ops.import_scene.gltf(filepath=str(DIRECTORY / 'goop.glb'))
    bpy.context.view_layer.update()
    imported = [o for o in imported_scene.objects if o.type == 'MESH']
    assert len(imported) == 3
    matches = {}
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
    result = {'glb_sha256': report['glb_sha256'], 'meshes': matches,
              'eye_seating': seating,'materials': material_checks,
              'outward_normals_and_manifoldness': 'passed',
              'loose_puddles': 0, 'scope': 'Static asset roundtrip; not in-game acceptance'}
    (DIRECTORY / 'goop.roundtrip.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__ == '__main__':
    main()
