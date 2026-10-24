"""Room 1 surface authoring. Run in the native Blender GUI or with --background.

Only the named studio scene is owned. The game keeps its existing colliders,
pod and traversal; this file authors reusable finishes and the shell preview.
Interactive stages: setup(), bake(family, channel), preview(), save_source().
The full reproducibility path is main(); no third-party assets are used.
"""
import bpy
import bmesh
import math
from mathutils import Vector

HERE = __file__[:max(__file__.rfind('/'), __file__.rfind('\\'))]
SCENE_NAME = 'Room 1 Surface Studio'
PREFIX = 'R1_'
FAMILIES = ('ceramic', 'resin')
CHANNELS = ('color', 'normal', 'orm')
SIZES = {'ceramic': {'color': 2048, 'normal': 512, 'orm': 512},
         'resin': {'color': 1024, 'normal': 512, 'orm': 512}}


def node(nodes, kind, name):
    value = nodes.new(kind)
    value.name = name
    value.label = name
    return value


def author_material(family):
    mat = bpy.data.materials.new(PREFIX + family)
    mat.use_nodes = True
    n, links = mat.node_tree.nodes, mat.node_tree.links
    n.clear()
    out = node(n, 'ShaderNodeOutputMaterial', 'Output')
    p = node(n, 'ShaderNodeBsdfPrincipled', 'Surface')
    uv = node(n, 'ShaderNodeTexCoord', 'Coordinates')
    broad = node(n, 'ShaderNodeTexNoise', 'Broad finish variation')
    broad.inputs['Scale'].default_value = 5
    broad.inputs['Detail'].default_value = 2
    fine = node(n, 'ShaderNodeTexNoise', 'Fine surface grain')
    fine.inputs['Scale'].default_value = 220 if family == 'ceramic' else 160
    fine.inputs['Detail'].default_value = 2
    for noise in (broad, fine):
        links.new(uv.outputs['UV'], noise.inputs['Vector'])
    color = node(n, 'ShaderNodeValToRGB', 'Bake color')
    # Neutral textures are tinted per panel in the game. Keep the colour
    # variation quieter than the roughness variation, especially on the floor.
    low, high = ((.79, .80, .78, 1), (.87, .88, .86, 1)) if family == 'ceramic' else ((.66, .69, .70, 1), (.72, .75, .76, 1))
    color.color_ramp.elements[0].color = low
    color.color_ramp.elements[1].color = high
    links.new(broad.outputs['Fac'], color.inputs[0])
    rough = node(n, 'ShaderNodeMapRange', 'Bake roughness')
    rough.inputs['From Min'].default_value = 0
    rough.inputs['From Max'].default_value = 1
    rough.inputs['To Min'].default_value = .39 if family == 'ceramic' else .5
    rough.inputs['To Max'].default_value = .56 if family == 'ceramic' else .68
    links.new(fine.outputs['Fac'], rough.inputs['Value'])
    bump = node(n, 'ShaderNodeBump', 'Microscopic finish')
    bump.inputs['Strength'].default_value = .18
    bump.inputs['Distance'].default_value = .0018 if family == 'ceramic' else .0025
    links.new(fine.outputs['Fac'], bump.inputs['Height'])
    links.new(color.outputs['Color'], p.inputs['Base Color'])
    links.new(rough.outputs['Result'], p.inputs['Roughness'])
    links.new(bump.outputs['Normal'], p.inputs['Normal'])
    links.new(p.outputs['BSDF'], out.inputs['Surface'])
    # R = occlusion, G = roughness, B = metalness. No lighting is baked in.
    orm = node(n, 'ShaderNodeCombineColor', 'Bake ORM')
    orm.mode = 'RGB'
    orm.inputs['Red'].default_value = 1
    orm.inputs['Blue'].default_value = 0
    links.new(rough.outputs['Result'], orm.inputs['Green'])
    return mat


def setup():
    scene = bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
    bpy.context.window.scene = scene
    for obj in list(scene.objects):
        if obj.name.startswith(PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                       bpy.data.cameras, bpy.data.lights):
        for item in list(collection):
            if item.name.startswith(PREFIX) and item.users == 0:
                collection.remove(item)
    scene.unit_settings.system = 'METRIC'
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.cycles.device = 'CPU'
    scene.render.bake.margin = 16
    scene.render.bake.use_clear = True
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new(PREFIX + 'World')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.15, .18, .22, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
    mesh = bpy.data.meshes.new(PREFIX + 'Bake surface')
    mesh.from_pydata([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [], [(0, 1, 2, 3)])
    mesh.uv_layers.new(name='UVMap')
    for item, uv in zip(mesh.uv_layers.active.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        item.uv = uv
    obj = bpy.data.objects.new(PREFIX + 'Bake surface', mesh)
    scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for family in FAMILIES:
        author_material(family)
    print('Room 1 authoring scene ready; original scenes are retained.')


def bake(family, channel):
    scene = bpy.data.scenes[SCENE_NAME]
    bpy.context.window.scene = scene
    obj = bpy.data.objects[PREFIX + 'Bake surface']
    obj.hide_set(False)
    obj.hide_render = False
    for other in scene.objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mat = bpy.data.materials[PREFIX + family]
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    n, links = mat.node_tree.nodes, mat.node_tree.links
    target = n.get('Bake target') or node(n, 'ShaderNodeTexImage', 'Bake target')
    size = SIZES[family][channel]
    name = PREFIX + family + '_' + channel
    image = bpy.data.images.get(name) or bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.colorspace_settings.name = 'sRGB' if channel == 'color' else 'Non-Color'
    target.image = image
    n.active = target
    out = n['Output']
    if channel == 'normal':
        links.new(n['Surface'].outputs['BSDF'], out.inputs['Surface'])
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    else:
        emit = n.get('Bake emission') or node(n, 'ShaderNodeEmission', 'Bake emission')
        source = n['Bake color'].outputs['Color'] if channel == 'color' else n['Bake ORM'].outputs[0]
        links.new(source, emit.inputs['Color'])
        links.new(emit.outputs[0], out.inputs['Surface'])
        bpy.ops.object.bake(type='EMIT')
    links.new(n['Surface'].outputs['BSDF'], out.inputs['Surface'])
    image.filepath_raw = HERE + '/' + family + '-' + channel + '.png'
    image.file_format = 'PNG'
    image.save()
    print('Baked', family, channel, size, image.filepath_raw)


def xyz(p):
    return (p[0], -p[2], p[1])


def mesh(name, vertices, faces, mat, bevel=0, facing=None):
    data = bpy.data.meshes.new(PREFIX + name)
    data.from_pydata([xyz(v) for v in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bevel:
        bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_manifold],
                        offset=bevel, segments=2, affect='EDGES', clamp_overlap=True)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if facing:
        direction = Vector(xyz(facing))
        for face in bm.faces:
            if face.normal.dot(direction) < 0:
                face.normal_flip()
    bm.to_mesh(data)
    bm.free()
    # World-metre UVs: finishes keep their scale on uniquely sized structures.
    uv = data.uv_layers.new(name='UVMap')
    for polygon in data.polygons:
        nx, ny, nz = [abs(v) for v in polygon.normal]
        axis = 0 if nx >= ny and nx >= nz else 1 if ny >= nz else 2
        for index in polygon.loop_indices:
            p = data.vertices[data.loops[index].vertex_index].co
            a, b = ((p.y, p.z) if axis == 0 else (p.x, p.z) if axis == 1 else (p.x, p.y))
            uv.data[index].uv = (a / 2, b / 2)
    obj = bpy.data.objects.new(PREFIX + name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent = bpy.data.objects[PREFIX + 'Architecture']
    obj['visualOnly'] = True
    return obj


def box(name, size, position, mat, bevel=.025):
    x, y, z = position
    a, b, c = [v / 2 for v in size]
    v = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
         (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    return mesh(name, v, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)], mat, bevel)


def flat_material(name, tint, rough=.5, metal=0, emission=0, alpha=1):
    mat = bpy.data.materials.new(PREFIX + name)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*tint, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Alpha'].default_value = alpha
    if emission:
        p.inputs['Emission Color'].default_value = (*tint, 1)
        p.inputs['Emission Strength'].default_value = emission
    if alpha < 1:
        mat.surface_render_method = 'DITHERED'
    mat.diffuse_color = (*tint, alpha)
    mat.use_backface_culling = True
    return mat


def surface_material(family, name, tint):
    mat = flat_material(name, tint)
    n, links = mat.node_tree.nodes, mat.node_tree.links
    p = n.get('Principled BSDF')
    color = node(n, 'ShaderNodeTexImage', 'Baked color')
    color.image = bpy.data.images[PREFIX + family + '_color']
    mix = node(n, 'ShaderNodeMixRGB', 'Finish tint')
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1
    mix.inputs[2].default_value = (*tint, 1)
    links.new(color.outputs['Color'], mix.inputs[1])
    links.new(mix.outputs[0], p.inputs['Base Color'])
    orm = node(n, 'ShaderNodeTexImage', 'Baked roughness')
    orm.image = bpy.data.images[PREFIX + family + '_orm']
    separate = node(n, 'ShaderNodeSeparateColor', 'Packed finish')
    links.new(orm.outputs['Color'], separate.inputs[0])
    links.new(separate.outputs['Green'], p.inputs['Roughness'])
    normal = node(n, 'ShaderNodeTexImage', 'Baked normal')
    normal.image = bpy.data.images[PREFIX + family + '_normal']
    unpack = node(n, 'ShaderNodeNormalMap', 'Tangent detail')
    unpack.inputs['Strength'].default_value = .3
    links.new(normal.outputs['Color'], unpack.inputs['Color'])
    links.new(unpack.outputs['Normal'], p.inputs['Normal'])
    return mat


def begin_architecture():
    scene = bpy.data.scenes[SCENE_NAME]
    bpy.context.window.scene = scene
    # Rebuild only this owned studio; retained bake maps/materials stay intact.
    for obj in list(scene.objects):
        if obj.name != PREFIX + 'Bake surface':
            bpy.data.objects.remove(obj, do_unlink=True)
    for blocks in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for value in list(blocks):
            if value.name.startswith(PREFIX) and value.users == 0:
                blocks.remove(value)
    bake_surface = bpy.data.objects[PREFIX + 'Bake surface']
    bake_surface.hide_render = True
    bake_surface.hide_set(True)
    for name in ('Ivory', 'Cool', 'Resin', 'Island', 'Graphite', 'Alloy', 'Glass', 'Light', 'Screen', 'Amber'):
        old = bpy.data.materials.get(PREFIX + name)
        if old and old.users == 0:
            bpy.data.materials.remove(old)
    root = bpy.data.objects.new(PREFIX + 'Architecture', None)
    root['asset'] = 'containment-room-one-v1'
    root['gameplayBounds'] = '14 x 12 x 8 m; vent and pod positions retained'
    scene.collection.objects.link(root)
    surface_material('ceramic', 'Ivory', (.88, .86, .79))
    surface_material('ceramic', 'Cool', (.43, .53, .55))
    surface_material('resin', 'Resin', (.43, .50, .51))
    surface_material('resin', 'Island', (.57, .62, .61))
    flat_material('Graphite', (.028, .043, .052), .65, .25)
    flat_material('Alloy', (.28, .35, .37), .37, .7)
    flat_material('Glass', (.13, .24, .27), .17, .12, alpha=.19)
    flat_material('Light', (.76, .86, .88), .4, emission=1.8)
    flat_material('Screen', (.055, .23, .25), .5, emission=.7)
    flat_material('Amber', (.52, .28, .06), .5, .12)
    print('New circular bay / observation-lab architecture initialized.')


def material(name):
    return bpy.data.materials[PREFIX + name]


def ring(name, inner, outer, y, mat, start=0, end=math.tau, segments=96):
    vertices, faces = [], []
    for i in range(segments + 1):
        a = start + (end-start) * i / segments
        for r in (inner, outer):
            vertices.append((math.cos(a)*r, y, -.5+math.sin(a)*r))
    for i in range(segments):
        faces.append((i*2+2, i*2+3, i*2+1, i*2))
    return mesh(name, vertices, faces, mat, facing=(0,1,0))


def build_floor():
    # All walking faces meet at Y=0. Dark joints replace surface area; they
    # are not coplanar decals, raised curbs or new gameplay steps.
    vertices, faces = [], []
    for i in range(129):
        a = math.tau * i / 128
        x, z = math.cos(a), math.sin(a)
        distance = min(6.8 / max(abs(x), 1e-8), (6.3 if z > 0 else 5.3) / max(abs(z), 1e-8))
        vertices.extend([(x*3.04,0,-.5+z*3.04),(x*distance,0,-.5+z*distance)])
    for i in range(128):
        faces.append((i*2+2,i*2+3,i*2+1,i*2))
    mesh('Resin perimeter floor', vertices, faces, material('Resin'), facing=(0,1,0))
    ring('Pod footing seal', 0, 1.64, 0, material('Graphite'))
    ring('Machined inner collar', 1.64, 1.75, 0, material('Alloy'))
    ring('Outer isolation seal', 2.98, 3.04, 0, material('Graphite'))
    ring('Island service channel', 2.42, 2.50, 0, material('Graphite'))
    for i in range(8):
        a, b = math.tau*i/8, math.tau*(i+1)/8
        ring('Containment petal '+str(i), 1.75, 2.42, 0, material('Ivory') if i % 3 == 0 else material('Cool'), a+.006, b-.006, 12)
        ring('Petal joint '+str(i), 1.75, 2.42, 0, material('Graphite'), a-.006, a+.006, 1)
        ring('Resin island sector '+str(i), 2.5, 2.98, 0, material('Island'), a+.004, b-.004, 12)
        ring('Outer petal joint '+str(i), 2.5, 2.98, 0, material('Graphite'), a-.004, a+.004, 1)
    print('Flush segmented containment island and resin floor built.')


def wall(name, x0, x1, y0, y1, z, mat):
    return box(name, [x1-x0,y1-y0,.12], [(x0+x1)/2,(y0+y1)/2,z-.06], mat, .025)


def build_rear_quiet_wings():
    # Each panel stops outside the full trim footprint, including its bevel.
    # The old panel continued behind the trim's coplanar bevel faces. The
    # 10 mm reveal is backed by the existing continuous dark rear bulkhead.
    for side,name in ((-1,'west'),(1,'east')):
        box('Rear quiet wing '+name, [2.96,6.6,.12], [side*5.32,4.4,-5.88], material('Ivory'))


def build_instrument_covers():
    for i,x in enumerate((-2.5,0,2.5)):
        if i == 1:
            # The diagnostic housing occupies Y=4.28..5.04 and is wider than
            # its mounting cover. Split the cover around it instead of leaving
            # intersecting back faces inside both parts' bevels.
            for name,lo,hi in (('lower',3.375,4.26),('upper',5.06,5.225)):
                box('Alcove instrument cover 1 '+name, [.35,hi-lo,.03],
                    [x,(lo+hi)/2,-5.652], material('Alloy'),.006)
        else:
            box('Alcove instrument cover '+str(i), [.35,1.85,.03],
                [x,4.3,-5.652], material('Alloy'))


def build_walls():
    ivory, cool, dark, alloy = [material(n) for n in ('Ivory','Cool','Graphite','Alloy')]
    box('Rear alcove backing', [13.6,7.85,.12], [0,3.925,-6.52], dark, 0)
    # Flat rear diagnostics wall, aligned with its quiet side wings.
    mesh('Flat rear containment wall', [(-3.7,1.1,-5.82),(-3.7,7.72,-5.82),
         (3.7,7.72,-5.82),(3.7,1.1,-5.82)], [(0,1,2,3)], ivory, facing=(0,0,1))
    for i,x in enumerate((-2.5,0,2.5)):
        z = -5.73
        box('Alcove diagnostic cassette '+str(i), [.52,2.15,.12], [x,4.3,z], dark)
    build_instrument_covers()
    build_rear_quiet_wings()
    box('Rear service plinth', [13.6,1.08,.16], [0,.54,-5.89], cool)
    for x in (-3.78,3.78):
        box('Alcove vertical return '+str(x), [.10,6.65,.27], [x,4.4,-5.93], alloy)
    # West: three recessed maintenance bays, each framed as an assembly.
    box('West backing', [.12,7.85,11.6], [-6.86,3.925,0], dark, 0)
    for i,(z,length) in enumerate([(-3.85,3.8),(.05,3.8),(3.92,3.86)]):
        box('West service plinth '+str(i), [.12,1.12,length-.10], [-6.79,.56,z], cool)
        box('West ceramic sail '+str(i), [.12,6.48,length-.10], [-6.80,4.45,z], ivory)
    for z in (-5.78,-1.93,1.99,5.78):
        box('West recessed spine '+str(z), [.10,7.5,.08], [-6.79,3.75,z], alloy, .012)
    # East: real glazed observation recess outside the playable envelope.
    box('Observation lower sill', [.18,1.22,11.6], [6.84,.61,0], cool)
    box('Observation upper fascia', [.18,2.75,11.6], [6.84,6.475,0], ivory)
    for z in (-5.05,4.4):
        box('Observation end pier '+str(z), [.18,3.88,1.50 if z < 0 else 2.8], [6.84,3.16,z], ivory)
    # Opening runs z=-4.30..3.0, y=1.22..5.10. The glass itself is the wall.
    mesh('Observation glass', [(6.785,1.22,-4.30),(6.785,5.10,-4.30),(6.785,5.10,3.0),(6.785,1.22,3.0)], [(3,2,1,0)], material('Glass'), facing=(-1,0,0))
    for z in (-4.3,-1.9,.55,3.0):
        box('Observation mullion '+str(z), [.10,3.96,.075], [6.78,3.16,z], alloy, .012)
    for y in (1.22,5.10):
        box('Observation horizontal reveal '+str(y), [.10,.09,7.4], [6.78,y,-.65], alloy, .015)
    box('Control room rear', [.12,4.6,7.5], [9.55,3.4,-.65], dark)
    box('Control room floor', [2.6,.12,7.5], [8.2,1.0,-.65], dark)
    box('Control room ceiling', [2.6,.12,7.5], [8.2,5.65,-.65], dark)
    for z in (-4.38,3.08):
        box('Control room end '+str(z), [2.7,4.6,.12], [8.25,3.4,z], dark)
    for i,z in enumerate((-3.1,-.7,1.7)):
        box('Observation instrument desk '+str(i), [1.1,.25,1.65], [8.1,2.05,z], alloy)
        box('Observation desk pedestal '+str(i), [.55,.86,.75], [8.35,1.49,z], dark)
        box('Observation monitor housing '+str(i), [.22,.88,1.22], [8.85,2.75,z], dark)
        box('Observation monitor support '+str(i), [.16,.18,.18], [8.85,2.25,z], alloy)
        box('Observation monitor aperture '+str(i), [.012,.64,1.00], [8.725,2.79,z], material('Screen'), 0)
    # North: retain the exact door and vent openings, expressed as one coherent
    # escape wall. The biological route is still owned by RoomOneArt.
    for name,x0,x1 in [('west',-6.8,-5.9),('centre',-3.7,2.6),('east',6.0,6.8)]:
        wall('North '+name+' plinth',x0,x1,0,1.1,5.91,cool)
        wall('North '+name+' ceramic',x0,x1,1.12,7.85,5.91,ivory)
    wall('North vent header',-5.9,-3.7,6.9,7.85,5.91,dark)
    wall('North door header',2.6,6.0,3.8,7.85,5.91,ivory)
    for x in (-5.98,-3.62):
        box('Escape service jamb '+str(x), [.09,7.5,.12], [x,3.75,5.79], alloy)
    for x in (-6.51,-6.24):
        box('Escape pressure feed '+str(x), [.055,5.5,.065], [x,3.65,5.75], alloy, .02)
    build_workstations()
    build_wall_instruments()
    print('Flat diagnostics wall, maintenance wall, glazed control recess and escape wall built.')


def tube(name, start, end, radius, mat, sides=12):
    a, b = Vector(start), Vector(end)
    axis = (b-a).normalized()
    reference = Vector((1,0,0)) if abs(axis.x)<.8 else Vector((0,0,1))
    u = axis.cross(reference).normalized()
    v = axis.cross(u).normalized()
    vertices=[]
    for point in (a,b):
        for i in range(sides):
            angle=math.tau*i/sides
            vertices.append(tuple(point+radius*(u*math.cos(angle)+v*math.sin(angle))))
    faces=[tuple(reversed(range(sides))),tuple(range(sides,sides*2))]
    for i in range(sides):
        j=(i+1)%sides
        faces.append((i,j,j+sides,i+sides))
    return mesh(name,vertices,faces,mat)


def build_workstations():
    dark, alloy, cool, ivory, screen = [material(n) for n in ('Graphite','Alloy','Cool','Ivory','Screen')]
    # Tabletop tops are at 2.175 m. Every instrument is seated on a base or
    # stand; nothing hovers over the workbenches or enters Bob's route.
    for i,z in enumerate((-3.1,-.7,1.7)):
        box('Keyboard base '+str(i), [.30,.045,.66], [7.78,2.1975,z+.15], dark,.012)
        for row in range(3):
            for col in range(5):
                box('Keyboard key '+str(i)+'-'+str(row)+'-'+str(col), [.045,.009,.09],
                    [7.69+row*.065,2.224,z-.07+col*.108], alloy,0)
    # Left bench: a recognisable C-arm microscope, specimen stage and angled
    # eyepiece. Its silhouette reads through the observation glass.
    box('Microscope foot',[.48,.065,.43],[8.12,2.2075,-3.58],ivory,.025)
    box('Microscope arm',[.12,.58,.12],[8.32,2.53,-3.58],alloy,.025)
    box('Microscope slide stage',[.40,.045,.34],[8.10,2.46,-3.58],dark,.012)
    box('Microscope slide',[.16,.009,.09],[8.02,2.487,-3.58],cool,0)
    tube('Microscope head',(8.28,2.82,-3.58),(7.96,3.02,-3.58),.073,ivory)
    tube('Microscope eyepiece',(7.96,3.02,-3.58),(7.83,3.10,-3.58),.052,dark)
    tube('Microscope objective',(8.06,2.66,-3.58),(8.06,2.79,-3.58),.047,alloy)
    tube('Microscope focus wheel',(8.25,2.67,-3.72),(8.25,2.67,-3.82),.065,dark)
    # Centre bench: six sealed sample tubes, rack and a compact analyser.
    box('Sample rack foot',[.36,.055,.52],[8.16,2.2025,-1.17],alloy,.012)
    box('Sample rack upper bridge',[.32,.035,.50],[8.16,2.34,-1.17],dark,.008)
    for row in range(2):
        for col in range(3):
            x,z=8.07+row*.18,-1.33+col*.16
            tube('Sample tube '+str(row)+'-'+str(col),(x,2.23,z),(x,2.64,z),.044,cool)
            tube('Sample cap '+str(row)+'-'+str(col),(x,2.64,z),(x,2.70,z),.052,dark)
    box('Sample analyser housing',[.48,.42,.43],[8.24,2.385,-.22],ivory,.035)
    box('Sample analyser display',[.012,.18,.25],[7.993,2.43,-.22],screen,0)
    box('Sample analyser loading slot',[.20,.025,.24],[8.18,2.607,-.22],dark,.005)
    # Right bench: telemetry controls, a tablet and tangible rotary inputs.
    box('Control instrument body',[.35,.19,.51],[8.18,2.27,2.17],cool,.022)
    for z in (2.01,2.17,2.33):
        tube('Control instrument dial '+str(z),(7.992,2.29,z),(7.95,2.29,z),.047,dark)
    box('Diagnostic tablet body',[.43,.04,.30],[8.24,2.195,1.20],dark,.012)
    box('Diagnostic tablet screen',[.34,.006,.23],[8.24,2.219,1.20],screen,0)
    print('Three workbenches dressed: microscopy, sample analysis and telemetry.')


def build_wall_instruments():
    dark, alloy, cool, screen = [material(n) for n in ('Graphite','Alloy','Cool','Screen')]
    # Give the three existing narrow mounts a functional silhouette, without
    # adding labels or new interactive affordances to the teaching room.
    tube('Wall pressure gauge housing',(-2.5,4.65,-5.65),(-2.5,4.65,-5.54),.19,dark,20)
    tube('Wall pressure gauge face',(-2.5,4.65,-5.535),(-2.5,4.65,-5.525),.151,alloy,20)
    box('Wall pressure gauge needle',[.013,.15,.008],[-2.5,4.68,-5.515],dark,0)
    for y in (3.62,4.00):
        tube('Wall pressure connector '+str(y),(-2.5,y,-5.65),(-2.5,y,-5.54),.065,alloy)
    tube('Wall pressure line',(-2.5,3.37,-5.59),(-2.5,4.40,-5.59),.026,cool)
    box('Wall diagnostic display housing',[.37,.76,.12],[0,4.66,-5.61],dark,.018)
    box('Wall diagnostic display',[.27,.60,.012],[0,4.66,-5.544],screen,0)
    for i in range(3):
        box('Wall diagnostic trace '+str(i),[.13+i*.025,.014,.008],[0,4.50+i*.12,-5.533],alloy,0)
    tube('Wall diagnostic rotary control',(0,3.89,-5.65),(0,3.89,-5.52),.085,dark)
    tube('Wall flow cylinder',(2.5,4.12,-5.60),(2.5,4.94,-5.60),.105,cool)
    for y in (4.12,4.94):
        tube('Wall flow clamp '+str(y),(2.5,y-.035,-5.60),(2.5,y+.035,-5.60),.122,alloy)
    tube('Wall flow lower coupling',(2.5,3.57,-5.60),(2.5,4.12,-5.60),.033,alloy)
    tube('Wall flow valve',(2.5,3.86,-5.60),(2.5,3.86,-5.47),.075,dark)
    print('Rear mounts fitted with pressure, diagnostic and flow instruments.')


def build_ceiling():
    dark, ivory, cool = [material(n) for n in ('Graphite','Ivory','Cool')]
    # Panels face down. Their upper faces meet the retained 7.85 m ceiling.
    obj = ring('Ceiling service annulus',2.57,3.10,7.78,dark)
    for p in obj.data.polygons:
        p.flip()
    obj = ring('Ceiling collar light',2.61,2.67,7.775,material('Light'))
    for p in obj.data.polygons:
        p.flip()
    for i in range(8):
        a,b=math.tau*i/8,math.tau*(i+1)/8
        obj=ring('Ceiling inner petal '+str(i),.75,2.56,7.85,ivory if i%2 else cool,a+.009,b-.009,12)
        for p in obj.data.polygons:
            p.flip()
    # Large continuous roof planes close the shell; the annulus is a shallow,
    # separate service assembly under them, never another coplanar face.
    box('Ceiling backing',[13.6,.12,11.6],[0,7.93,0],ivory,0)
    box('Alcove roof return',[13.6,.12,.66],[0,7.93,-6.13],ivory,0)
    for x in (-3.8,3.8):
        box('Ceiling diffuser housing '+str(x),[2.90,.14,.82],[x,7.72,-1.5],dark)
        box('Ceiling diffuser lens '+str(x),[2.52,.025,.49],[x,7.635,-1.5],material('Light'),.012)
    # Asymmetrical service trunk toward the observation machinery.
    box('Overhead service trunk',[3.5,.11,.36],[4.95,7.66,2.7],cool)
    for x in (3.3,4.35,5.4,6.45):
        box('Service trunk keeper '+str(x),[.07,.16,.41],[x,7.66,2.7],dark,.01)
    print('Pod service crown and integrated ceiling construction built.')


def preview():
    scene=bpy.context.scene
    for obj in list(scene.objects):
        if obj.type in {'CAMERA','LIGHT'} or obj.name.startswith(PREFIX+'Reference'):
            bpy.data.objects.remove(obj,do_unlink=True)
    for x in (-3.8,3.8):
        data=bpy.data.lights.new(PREFIX+'Preview softbox','AREA')
        data.energy=700
        data.shape='RECTANGLE'
        data.size=4
        data.size_y=2
        obj=bpy.data.objects.new(data.name,data)
        scene.collection.objects.link(obj)
        obj.location=xyz((x,7.4,-1.5))
    data=bpy.data.cameras.new(PREFIX+'Room camera')
    camera=bpy.data.objects.new(data.name,data)
    scene.collection.objects.link(camera)
    camera.location=xyz((-5.6,3.3,-4.7))
    camera.rotation_euler=(Vector(xyz((1.5,2.9,1.5)))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.lens=19
    scene.camera=camera
    scene.render.resolution_x,scene.render.resolution_y=1200,800
    scene.render.resolution_percentage=100
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    print('New Room 1 architecture framed for inspection.')


def export_asset():
    scene=bpy.context.scene
    root=bpy.data.objects[PREFIX+'Architecture']
    # Batch temporary copies for the game; keep benches and instruments
    # individually editable in the source .blend.
    selected=list(bpy.context.selected_objects)
    active=bpy.context.view_layer.objects.active
    root.name=PREFIX+'Editable architecture'
    runtime=bpy.data.objects.new(PREFIX+'Architecture',None)
    runtime['asset']='containment-room-one-v1'
    scene.collection.objects.link(runtime)
    copies=[]
    try:
        groups={}
        for source in list(root.children):
            if source.type!='MESH':
                continue
            obj=source.copy()
            obj.data=source.data.copy()
            obj.data.name=PREFIX+'Export geometry'
            scene.collection.objects.link(obj)
            obj.parent=runtime
            copies.append(obj.data)
            groups.setdefault(obj.data.materials[0].name,[]).append(obj)
        for name,objects in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:
                bpy.ops.object.join()
            obj=bpy.context.view_layer.objects.active
            obj.name=PREFIX+'Shell_'+name.removeprefix(PREFIX)
            copies.append(obj.data)
        bpy.ops.object.select_all(action='DESELECT')
        runtime.select_set(True)
        for obj in runtime.children:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=runtime
        bpy.ops.export_scene.gltf(filepath=HERE+'/room-one-shell.glb',export_format='GLB',
            use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,
            export_cameras=False,export_lights=False,export_animations=False,
            export_materials='PLACEHOLDER')
    finally:
        for obj in list(runtime.children):
            bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.objects.remove(runtime,do_unlink=True)
        for data in set(copies):
            if data.users==0:
                bpy.data.meshes.remove(data)
        root.name=PREFIX+'Architecture'
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=active
    print('Exported material-batched Room 1 geometry, without duplicate textures or lights.')


def save_source():
    for family in FAMILIES:
        for channel in CHANNELS:
            bpy.data.images[PREFIX+family+'_'+channel].pack()
    bpy.ops.wm.save_as_mainfile(filepath=HERE+'/room-one-surfaces.blend',copy=True)
    print('Saved Room 1 source, retaining the original user scene.')


def main():
    setup()
    for family in FAMILIES:
        for channel in CHANNELS:
            bake(family,channel)
    begin_architecture()
    build_floor()
    build_walls()
    build_ceiling()
    preview()
    export_asset()
    save_source()


if __name__=='__main__':
    main()
