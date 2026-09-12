"""Export this neutral Bob asset; validate in a separate, fresh Blender process.

blender -b bob-production-base.blend --python export-bob-production-base.py
blender -b --factory-startup --python export-bob-production-base.py -- --roundtrip
Neither mode saves or modifies the source .blend.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

HERE = Path(__file__).resolve().parent
NAMES = ['Bob-Body', 'Bob-Eye-Left', 'Bob-Eye-Right',
         'Bob-Catchlight-Left', 'Bob-Catchlight-Right']
BLEND = HERE / 'bob-production-base.blend'
GLB = HERE / 'bob-production-base.glb'
REPORT = HERE / 'bob-production-base.validation.json'
parser = argparse.ArgumentParser()
parser.add_argument('--roundtrip', action='store_true')
parser.add_argument('--review-blend', type=Path)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def bounds(obj):
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return [[min(p[i] for p in coords), max(p[i] for p in coords)] for i in range(3)]


def mesh_stats(obj):
    mesh = obj.data
    assert mesh.shape_keys is None and not obj.modifiers and not obj.animation_data
    assert all(abs(s - 1) < 1e-6 for s in obj.scale)
    assert len(mesh.uv_layers) == 1 and len(mesh.materials) == 1
    assert len({tuple(round(c, 8) for c in v.co) for v in mesh.vertices}) == len(mesh.vertices)
    assert len({tuple(sorted(p.vertices)) for p in mesh.polygons}) == len(mesh.polygons)
    uv = mesh.uv_layers.active.data
    assert all(-1e-6 <= c <= 1.000001 for loop in uv for c in loop.uv)
    mesh.calc_loop_triangles()
    zero_uv = sum(abs((uv[t.loops[1]].uv - uv[t.loops[0]].uv).cross(
        uv[t.loops[2]].uv - uv[t.loops[0]].uv)) < 1e-10 for t in mesh.loop_triangles)
    assert zero_uv == 0, (obj.name, 'degenerate UV triangles', zero_uv)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    assert all(f.calc_area() > 1e-10 for f in bm.faces)
    boundary = sum(e.is_boundary for e in bm.edges)
    components = 0
    unseen = set(bm.verts)
    while unseen:
        components += 1
        stack = [unseen.pop()]
        while stack:
            v = stack.pop()
            for e in v.link_edges:
                other = e.other_vert(v)
                if other in unseen:
                    unseen.remove(other)
                    stack.append(other)
    assert components == 1, (obj.name, 'disconnected components', components)
    if obj.name == 'Bob-Body':
        assert all(e.is_manifold for e in bm.edges)
        assert bm.calc_volume(signed=True) > 0
    bm.free()
    triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    tree = BVHTree.FromPolygons([v.co for v in mesh.vertices], triangles, all_triangles=True)
    intersections = [(a, b) for a, b in tree.overlap(tree)
                     if a < b and not set(triangles[a]).intersection(triangles[b])]
    assert not intersections, (obj.name, 'non-adjacent triangle intersections', intersections[:8])
    return dict(vertices=len(mesh.vertices), faces=len(mesh.polygons),
                triangles=len(triangles), quads=sum(len(p.vertices) == 4 for p in mesh.polygons),
                boundary_edges=boundary, components=components, bounds=bounds(obj), self_intersections=0,
                degenerate_uv_triangles=zero_uv)


def read_glb():
    data = GLB.read_bytes()
    assert data[:4] == b'glTF'
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    return json.loads(data[20:20 + length])


if not args.roundtrip:
    assert Path(bpy.data.filepath).resolve() == BLEND.resolve()
    bpy.context.window.scene = bpy.data.scenes['Bob-Production-Base']
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    collection = bpy.data.collections['Bob-Production']
    assert {o.name for o in collection.objects} == set(NAMES + ['Bob'])
    report = {'blender_version': bpy.app.version_string,
              'approved_source_sha256': hashlib.sha256((HERE / 'bob-v2-facial-cleanup.blend').read_bytes()).hexdigest(),
              'meshes': {name: mesh_stats(bpy.data.objects[name]) for name in NAMES}}
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects['Bob']
    options = dict(filepath=str(GLB), export_format='GLB', use_selection=True,
                   export_animations=False, export_morph=False, export_apply=False,
                   export_yup=True, export_normals=True, export_texcoords=True,
                   export_tangents=False, export_materials='EXPORT', export_extras=True,
                   export_cameras=False, export_lights=False)
    bpy.ops.export_scene.gltf(**options)
    first_hash = hashlib.sha256(GLB.read_bytes()).hexdigest()
    bpy.ops.export_scene.gltf(**options)
    assert hashlib.sha256(GLB.read_bytes()).hexdigest() == first_hash
    gltf = read_glb()
    assert len(gltf['meshes']) == 5 and len(gltf['nodes']) == 6
    assert len(gltf['materials']) == 3
    assert not gltf.get('animations') and not gltf.get('textures') and not gltf.get('images')
    primitives = [p for m in gltf['meshes'] for p in m['primitives']]
    assert all(not p.get('targets') for p in primitives)
    assert all({'NORMAL', 'TEXCOORD_0'} <= p['attributes'].keys() for p in primitives)
    report['glb'] = dict(sha256=first_hash, bytes=GLB.stat().st_size, deterministic_bytes=True,
                        nodes=len(gltf['nodes']), meshes=len(gltf['meshes']), materials=3,
                        textures=0, animations=0, morph_targets=0,
                        triangles=sum(gltf['accessors'][p['indices']]['count'] // 3 for p in primitives),
                        vertices_after_uv_splits=sum(gltf['accessors'][p['attributes']['POSITION']]['count'] for p in primitives))
    REPORT.write_text(json.dumps(report, indent=2) + '\n')
    print('BOB_EXPORT_VALIDATION', json.dumps(report))
else:
    # Fresh import scene: retain any factory/default scene, never clear source data.
    scene = bpy.data.scenes.new('Bob-GLB-Roundtrip')
    bpy.context.window.scene = scene
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    bpy.context.view_layer.update()
    imported = {o.name: o for o in scene.objects if o.type == 'MESH'}
    assert set(imported) == set(NAMES) and len(scene.objects) == 6
    with bpy.data.libraries.load(str(BLEND), link=False) as (_, loaded):
        loaded.objects = list(NAMES)
    checks = {}
    for name, source in zip(NAMES, loaded.objects):
        obj = imported[name]
        old = source.data
        uv = old.uv_layers.active.data
        tree = KDTree(len(old.vertices))
        for v in old.vertices:
            tree.insert(v.co, v.index)
        tree.balance()
        corners = [[] for v in old.vertices]
        for loop in old.loops:
            corners[loop.vertex_index].append((uv[loop.index].uv.copy(), old.corner_normals[loop.index].vector.copy()))
        max_distance = 0
        min_normal_dot = 1
        for loop in obj.data.loops:
            point = obj.matrix_world @ obj.data.vertices[loop.vertex_index].co
            _, index, distance = tree.find(point)
            max_distance = max(max_distance, distance)
            assert distance < 2e-6, (name, 'position drift', distance)
            new_uv = obj.data.uv_layers.active.data[loop.index].uv
            normal = (obj.matrix_world.to_3x3() @ obj.data.corner_normals[loop.index].vector).normalized()
            matches = [normal.dot(n) for u, n in corners[index] if (u - new_uv).length < 2e-6]
            assert matches and max(matches) > .9999, (name, 'UV/normal mismatch', loop.index)
            min_normal_dot = min(min_normal_dot, max(matches))
        assert len(obj.data.materials) == 1
        obj.data.calc_loop_triangles()
        old.calc_loop_triangles()
        assert len(obj.data.loop_triangles) == len(old.loop_triangles)
        checks[name] = dict(max_position_drift=max_distance, min_normal_dot=min_normal_dot,
                            uv_preserved=True, triangles=len(obj.data.loop_triangles), bounds=bounds(obj))
    report = json.loads(REPORT.read_text())
    report['roundtrip'] = checks
    REPORT.write_text(json.dumps(report, indent=2) + '\n')
    if args.review_blend:
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(args.review_blend))
    print('BOB_ROUNDTRIP_VALIDATION', json.dumps(checks))
