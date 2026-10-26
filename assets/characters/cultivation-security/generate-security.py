"""Cultivation security variants of the EX-04 manufactured drone family.

Run the focused build stages through Blender MCP; the CLI reproduces the same
editable parts and geometry-only GLB. Game controllers own every moving pose.
"""
import bpy
import bmesh
import math
import json
from mathutils import Vector

HERE = ''
SCENE = 'Cultivation Security Foundry'
MATERIAL_PREFIX = 'CV_'
SIZES = {'ceiling': (2.2, 1.35, 2.2), 'ground': (3.6, 1.5, 1.7), 'lift': (1.2, .7, 1.2)}
ROLES = ('armour', 'armourShadow', 'mechanism', 'barrel', 'mount', 'linkage')


def xyz(p):
    return (p[0], -p[2], p[1])


def linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def setup():
    old = bpy.data.scenes.get(SCENE)
    if old:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene
    scene.unit_settings.system = 'METRIC'
    palette = {'armour': (0xe4e9e8, .82, .32), 'armourShadow': (0x778389, .82, .58),
               'mechanism': (0x10171a, .58, .82), 'barrel': (0x293338, .58, .9)}
    for role, (colour, rough, metal) in palette.items():
        name = MATERIAL_PREFIX + role
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        rgb = tuple(linear(((colour >> bit) & 255) / 255) for bit in [16, 8, 0])
        mat.diffuse_color = (*rgb, 1)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        for node in list(nodes):
            if node.bl_idname in ('ShaderNodeVertexColor','ShaderNodeMixRGB'):
                nodes.remove(node)
        bsdf = nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        vertex = nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = 'wear'
        multiply = nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[1].default_value = (*rgb, 1)
        mat.node_tree.links.new(vertex.outputs['Color'], multiply.inputs[2])
        mat.node_tree.links.new(multiply.outputs[0], bsdf.inputs['Base Color'])
    return scene.name


def rig(kind, distant=False):
    name = 'CV_' + kind + ('_distant' if distant else '_full')
    root = bpy.data.objects.get(name)
    if not root:
        root = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(root)
        root['securityType'] = kind
        root['detail'] = 'distant' if distant else 'full'
        root['sizeMetres'] = SIZES[kind]
    return root


def mesh(name, points, faces, role, root, bevel=0, tint=(1, 1, 1)):
    data = bpy.data.meshes.new(root.name + '_' + name)
    data.from_pydata([xyz(p) for p in points], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bevel:
        edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle() > .05]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect='EDGES', clamp_overlap=True)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(root.name + '_' + name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    obj['securityRole'] = role
    data.materials.append(bpy.data.materials[MATERIAL_PREFIX + ('armourShadow' if role == 'mount' else 'mechanism' if role == 'linkage' else role)])
    uv = data.uv_layers.new(name='MetricUV')
    colours = data.color_attributes.new(name='wear', type='FLOAT_COLOR', domain='POINT')
    for vertex in data.vertices:
        x, y, z = vertex.co.x, vertex.co.z, -vertex.co.y
        cloud = .5 + .5 * math.sin(x * 6.3 + z * 3.1 + math.sin(y * 8.1) * 1.7)
        streak = math.sin(x * 17.1 + z * 12.7) ** 10
        dirt = .08 + .13 * cloud + .11 * streak
        colours.data[vertex.index].color = (tint[0] * (1 - dirt), tint[1] * (1 - dirt * 1.05), tint[2] * (1 - dirt * 1.15), 1)
    for face in data.polygons:
        n = face.normal
        axis = 0 if abs(n.x) >= max(abs(n.y), abs(n.z)) else 1 if abs(n.y) >= abs(n.z) else 2
        for li in face.loop_indices:
            p = data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv = ((p.y, p.z) if axis == 0 else (p.x, p.z) if axis == 1 else (p.x, p.y))
    return obj


def box(name, size, at, role, root, bevel=.018, tint=(1, 1, 1)):
    w, h, d = [v / 2 for v in size]
    vv = [(at[0] + x * w, at[1] + y * h, at[2] + z * d)
          for x, y, z in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                          (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
    return mesh(name, vv, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2),
                           (0, 4, 7, 3), (1, 2, 6, 5)], role, root, bevel, tint)


def wedge(name, width, depth, height_front, height_back, at, role, root, bevel=.025):
    outline = [(-width * .34, -depth / 2), (width * .34, -depth / 2), (width / 2, -depth * .28),
               (width / 2, depth * .32), (width * .36, depth / 2), (-width * .36, depth / 2),
               (-width / 2, depth * .32), (-width / 2, -depth * .28)]
    vv = []
    for side in [-1, 1]:
        for x, z in outline:
            h = height_front + (height_back - height_front) * (z / depth + .5)
            vv.append((x + at[0], at[1] + side * h / 2, z + at[2]))
    return mesh(name, vv, [tuple(reversed(range(8))), tuple(range(8, 16))] +
                [(i, (i + 1) % 8, (i + 1) % 8 + 8, i + 8) for i in range(8)], role, root, bevel)


def tube(name, a, b, radius, role, root, sides=16, cap_a=True, cap_b=True):
    direction = (Vector(b) - Vector(a)).normalized()
    right = direction.cross(Vector((0, 1, 0)))
    if right.length < .01:
        right = direction.cross(Vector((1, 0, 0)))
    right.normalize()
    up = direction.cross(right).normalized()
    vv = [tuple(Vector(p) + radius * (right * math.cos(i * math.tau / sides) + up * math.sin(i * math.tau / sides)))
          for p in [a, b] for i in range(sides)]
    ff = [(i, (i + 1) % sides, (i + 1) % sides + sides, i + sides) for i in range(sides)]
    if cap_a:
        ff.append(tuple(reversed(range(sides))))
    if cap_b:
        ff.append(tuple(range(sides, sides * 2)))
    return mesh(name, vv, ff, role, root)


def profile(name, loops, at, axis, role, root, sides=24):
    vv = []
    for r, t in loops:
        for k in range(sides):
            a = k * math.tau / sides
            p = (r * math.cos(a), t, r * math.sin(a))
            if axis == 'z':
                p = (p[0], p[2], p[1])
            if axis == 'x':
                p = (p[1], p[0], p[2])
            vv.append(tuple(at[i] + p[i] for i in range(3)))
    ff = []
    for layer in range(len(loops)):
        for i in range(sides):
            j = (i + 1) % sides
            ff.append((layer * sides + i, layer * sides + j, ((layer + 1) % len(loops)) * sides + j,
                       ((layer + 1) % len(loops)) * sides + i))
    return mesh(name, vv, ff, role, root)


def armour(kind, distant=False, marking_offset=.19):
    root = rig(kind, distant)
    w, h, d = SIZES[kind]
    wedge('CastChassis', w * .60, d * .73, h * .42, h * .49, (0, 0, d * .06), 'mechanism', root)
    for side in [-1, 1]:
        wedge('SplitDorsalArmour', w * .235, d * .78, h * .12, h * .18,
              (side * w * .16, h * .315, d * .065), 'armour', root)
    box('RecessedDorsalSpine', (w * .06, h * .07, d * .55),
        (0, h * .31, d * .10), 'mechanism', root, .012)
    if not distant:
        for row in range(4):
            box('DorsalHeatSink', (w * .052, .022, .055),
                (0, h * .345 + .014, -d * .04 + row * d * .09), 'armourShadow', root, .004)
    # Separate cheek plates and split brow borrow the boss family's face shape.
    for side in [-1, 1]:
        wedge('Cheek', w * .12, d * .23, h * .30, h * .26,
              (side * w * .245, -h * .025, -d * .29), 'armour', root, .018)
        box('Brow', (w * .21, h * .075, d * .11),
            (side * w * .12, h * .23, -d * .32), 'armour', root)
        wedge('Receiver', w * .19, d * .43, h * .30, h * .35,
              (side * w * .365, -h * .015, -d * .08), 'armourShadow', root)
        box('ReceiverArmour', (w * .18, h * .07, d * .32),
            (side * w * .365, h * .225, -d * .06), 'armour', root)
        if not distant:
            box('WornUnitMarking', (w * .075, .018, d * .14),
                (side * w * marking_offset, h * .417, d * .19), 'armour', root, .005, (.64, .47, .14))
            for z in [-.12, .20]:
                tube('CaptiveTopBolt', (side * w * .20, h * .37, z * d),
                     (side * w * .20, h * .438, z * d), .022, 'armourShadow', root, 8, False)
    # Recessed rear push casing stays within the existing rear approach envelope.
    box('RearServicePlate', (w * .38, h * .23, .055), (0, h * .015, d * .43), 'armour', root)
    for row in range(2 if distant else 4):
        box('RearCoolingRib', (w * .27, .022, .04), (0, -h * .06 + row * .055, d * .465), 'armourShadow', root, .005)


def optics_and_weapons(kind, distant=False):
    root = rig(kind, distant)
    w, h, d = SIZES[kind]
    s = min(w, h, d)
    n = 12 if distant else 24
    # The live state-controlled pupil remains in the original runtime owner.
    # One continuous hollow scope seats inside the cast chassis and reaches
    # the existing bezel. The state-controlled eye stays at -depth * .51.
    # Shared rings avoid stacked end caps at the barrel/collar transition.
    scope = profile('SensorScope', [(s * .245, -d * .24), (s * .245, -d * .30),
                           (s * .19, -d * .325), (s * .19, -d * .425),
                           (s * .205, -d * .445), (s * .225, -d * .445),
                           (s * .225, -d * .49), (s * .195, -d * .52),
                           (s * .135, -d * .52), (s * .125, -d * .49),
                           (s * .125, -d * .24)],
                    (0, 0, 0), 'z', 'armourShadow', root, n)
    for vertex in scope.data.vertices:
        if d * .31 < vertex.co.y < d * .43:
            colour = scope.data.color_attributes['wear'].data[vertex.index].color
            scope.data.color_attributes['wear'].data[vertex.index].color = tuple(c * .42 for c in colour[:3]) + (1,)
    if not distant:
        for k in range(4):
            angle = (k + .5) * math.pi / 2
            vv = [(s * (r * math.cos(angle) - u * math.sin(angle)), y,
                   z) for z in [-d * .335, -d * .415]
                  for r,u in [(.185,-.015),(.205,-.015),(.205,.015),(.185,.015)]
                  for y in [s * (r * math.sin(angle) + u * math.cos(angle))]]
            mesh('ScopeAxialRib', vv, [(3,2,1,0),(4,5,6,7),(0,1,5,4),
                 (1,2,6,5),(2,3,7,6),(3,0,4,7)], 'barrel', root, s * .003)
    tube('RecessedSensorGlass', (0, 0, -d * .482), (0, 0, -d * .465), s * .12, 'mechanism', root, n)
    for side in [-1, 1]:
        x = side * w * .36
        profile('HollowBarrelShroud', [(s * .087, -d * .265), (s * .087, -d * .55),
                                      (s * .073, -d * .58), (s * .048, -d * .58),
                                      (s * .048, -d * .265)], (x, 0, 0), 'z', 'barrel', root, 12 if distant else 20)
        profile('BarrelSeat', [(s * .13, -d * .25), (s * .13, -d * .32),
                               (s * .105, -d * .32), (s * .105, -d * .25)], (x, 0, 0), 'z', 'armourShadow', root, n)
        tube('RecessedBoreBack', (x, 0, -d * .40), (x, 0, -d * .37), s * .044, 'barrel', root, n)
        if not distant:
            for t in range(3):
                box('ReceiverHeatVent', (w * .022, .025, d * .16),
                    (side * w * (.325 + t * .035), h * .16, -d * .06), 'mechanism', root, .004)
            for y in [-.10, .12]:
                tube('CheekFastener', (side * w * .245, y * h, -d * .39),
                     (side * w * .245, y * h, -d * .425), .023, 'armourShadow', root, 8, False)


def cooling(kind, distant=False):
    root = rig(kind, distant)
    w, h, d = SIZES[kind]
    radius = min(h * .20, d * .16)
    for side in [-1, 1]:
        x, y, z = side * w * .39, h * .105, d * .285
        profile('GuardedCoolingDuct', [(r,t*side) for r,t in [(radius * .73, -.10), (radius, -.10), (radius, .10),
                                       (radius * .88, .14), (radius * .73, .14)]],
                (x, y, z), 'x', 'armourShadow', root, 12 if distant else 24)
        box('CoolingBridge', (w*.11,h*.16,d*.22), (side*w*.33,y,z), 'mechanism', root, .015)
        count = 3 if distant else 6
        for k in range(count):
            a = k * math.tau / count
            shape = [(radius * .25, -radius * .05), (radius * .63, -radius * .10),
                     (radius * .66, radius * .10), (radius * .27, radius * .07)]
            vv = [(x + Y*side, y + A * math.cos(a) - B * math.sin(a), z + A * math.sin(a) + B * math.cos(a))
                  for Y in [-.025, .005] for A, B in shape]
            mesh('CoolingImpeller', vv, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], 'mechanism', root)
        tube('CoolingHub', (x-side*.06, y, z), (x+side*.055, y, z), radius * .21, 'armourShadow', root, 12)
        box('CoolingGuard', (.025,radius * 1.38,.035), (x+side*.09, y, z), 'armourShadow', root, .004)


def mounting(kind, distant=False):
    root = rig(kind, distant)
    w, h, d = SIZES[kind]
    s = min(w, h, d)
    if kind == 'ground':
        profile('YawBearing', [(s * .16, -h * .40), (s * .20, -h * .40),
                               (s * .20, -h * .31), (s * .16, -h * .31)],
                (0, 0, d * .07), 'y', 'mount', root, 12 if distant else 24)
        tube('MechanicalNeck', (0, -h * .37, d * .07), (0, -h * .17, d * .07), s * .105, 'linkage', root)
        for x, z in [(-.30, .25), (.30, .25), (0, -.29)]:
            wedge('SplayedFoot', w * .16, d * .24, h * .09, h * .11,
                  (x * w, -h * .435, z * d), 'mount', root, .015)
            tube('LegBrace', (0, -h * .34, d * .07), (x * w, -h * .38, z * d), s * .045, 'linkage', root, 8)
            if not distant:
                tube('FootFastener', (x * w, -h * .42, z * d), (x * w, -h * .345, z * d), .027, 'mount', root, 8, False)
    else:
        # Docking pad is coaxial with the original vertical support target.
        wedge('SuspensionYoke', w * .38, d * .32, h * .11, h * .11,
              (0, h * .59, 0), 'mount', root, .025)
        for side in [-1, 1]:
            box('YokeCheek', (w * .065, h * .23, d * .22),
                (side * w * .18, h * .43, 0), 'mount', root)
        tube('PitchTrunnion', (-w * .22, h * .31, 0), (w * .22, h * .31, 0), s * .095, 'linkage', root)
        tube('DockingStem', (0, h * .36, 0), (0, h * .535, 0), s * .085, 'linkage', root)


def build(kind, distant=False):
    armour(kind, distant, marking_offset=.12 if kind == 'lift' else .19)
    optics_and_weapons(kind, distant)
    cooling(kind, distant)
    if kind != 'lift':
        mounting(kind, distant)
    runtime_pupil_reference(kind, distant)


def runtime_pupil_reference(kind, distant=False):
    root = rig(kind, distant)
    name = root.name + '_RuntimePupilReference'
    if bpy.data.objects.get(name):
        return
    mat = bpy.data.materials.get('CV_RuntimePupilReference')
    if not mat:
        mat = bpy.data.materials.new('CV_RuntimePupilReference')
        mat.diffuse_color = (1, .018, .05, 1)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (1, .018, .05, 1)
        bsdf.inputs['Emission Color'].default_value = (1, .018, .05, 1)
        bsdf.inputs['Emission Strength'].default_value = .8
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=min(SIZES[kind]) * .085)
    obj = bpy.context.object
    obj.name = name
    obj.parent = root
    obj.location = xyz((0, 0, -SIZES[kind][2] * .51))
    obj.scale = (1, .22, 1)
    obj['referenceOnly'] = True
    obj.data.materials.append(mat)


def finish():
    for kind in SIZES:
        for distant in [False, True]:
            root = rig(kind, distant)
            for role in ROLES:
                parts = [o for o in root.children if o.type == 'MESH' and o.get('securityRole') == role]
                if not parts:
                    continue
                for o in bpy.context.selected_objects:
                    o.select_set(False)
                for o in parts:
                    o.select_set(True)
                bpy.context.view_layer.objects.active = parts[0]
                if len(parts) > 1:
                    bpy.ops.object.join()
                part = bpy.context.view_layer.objects.active
                part.name = root.name + '_' + role
                part['securityRole'] = role
                part.select_set(False)
            root.location = xyz(({'ceiling': -2.2, 'ground': 2.6, 'lift': 6.3}[kind], 0, 4 if distant else 0))
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.type = 'MATERIAL'
            area.spaces.active.overlay.show_overlays = False
    return '32 immutable role/detail buffers; original pupil and aim pivots remain runtime-owned'


def export(save=True):
    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    for o in selected:
        o.select_set(False)
    roots = [rig(kind, distant) for kind in SIZES for distant in [False, True]]
    positions = [r.location.copy() for r in roots]
    for root in roots:
        root.location = (0, 0, 0)
        root.select_set(True)
        for o in root.children:
            if o.get('securityRole') in ROLES:
                o.select_set(True)
    bpy.context.view_layer.objects.active = roots[0]
    # glTF multiplies the exported wear colours by the material factor itself.
    # Keep the editable Blender multiply shader, but export its constant factor
    # directly so a standalone GLB preview retains the four finish colours.
    material_links = []
    for role in ROLES[:4]:
        tree = bpy.data.materials[MATERIAL_PREFIX + role].node_tree
        for link in list(tree.nodes.get('Principled BSDF').inputs['Base Color'].links):
            material_links.append((tree, link.from_socket, link.to_socket))
            tree.links.remove(link)
    bpy.ops.export_scene.gltf(filepath=HERE + '/cultivation-security.glb', export_format='GLB', use_selection=True,
        use_active_scene=True, export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
        export_animations=False, export_vertex_color='NAME', export_vertex_color_name='wear', export_all_vertex_colors=False)
    for tree, source, target in material_links:
        tree.links.new(source, target)
    for root, at in zip(roots, positions):
        root.location = at
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in selected:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active
    if save:
        bpy.ops.wm.save_as_mainfile(filepath=HERE + '/cultivation-security.blend')
    print('Exported Cultivation security family')


if __name__ == '__main__':
    import sys
    from pathlib import Path
    HERE = str(Path(__file__).resolve().parent)
    if bpy.app.background and bpy.context.scene.name == 'Scene':
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
    setup()
    for kind in SIZES:
        for distant in [False, True]:
            build(kind, distant)
    finish()
    export()
