"""Volt's continuous lightning-gel sculpt and independent studio rig.

Authored axes are +Z up, +Y forward. glTF is +Y up, -Z forward.
The contact plane follows the existing characters at -0.45 metres.
Functions are deliberately separate for incremental Blender MCP iteration.
"""
import math
import bpy
from mathutils import Vector
SOLE = -0.45
NAMES = ('Volt-Body', 'Volt-Eye-Left', 'Volt-Eye-Right')
MATERIAL_NAMES = ('Volt-Golden-Gel', 'Volt-Obsidian-Eyes')
MORPH_NAMES = ('Squash', 'Stretch', 'Blink', 'CrestFlexLeft', 'CrestFlexRight')
# A nonzero closed-eye thickness supports simultaneous squash.
BLINK_HEIGHT_FRACTION = 0.13
# Height, horizontal centre, half width/depth, depth centre.
# The compact crest and overall body width retain the reviewed proportions.
PROFILE = [
    (0.0, 0.0, 0.59, 0.43, 0.0),
    (0.018, 0.0, 0.69, 0.489, 0.0),
    (0.04, 0.0, 0.744, 0.513, 0.0),
    (0.092, 0.0, 0.77, 0.548, 0.0),
    (0.12, 0.0, 0.763, 0.541, 0.0),
    (0.15, 0.0, 0.724, 0.523, 0.0),
    (0.19, 0, 0.66, 0.49, 0.0),
    (0.31, 0, 0.6, 0.465, 0.0),
    (0.47, 0, 0.535, 0.425, 0.0),
    (0.55, 0, 0.5, 0.399, 0.0),
    (0.63, 0, 0.452, 0.359, 0.0),
    (0.69, 0, 0.387, 0.324, 0.0),
    (0.73, 0, 0.335, 0.293, 0.0),
    (0.7706, 0, 0.267794, 0.253586, 0.0),
    (0.817, 0, 0.204275, 0.202822, 0.0),
    (0.8808, 0.047156, 0.1836, 0.164, 0.0),
    (0.9446, 0.112591, 0.1768, 0.1435, 0.0),
    (0.962, 0.11968, 0.1666, 0.1353, 0.0),
    (0.9794, 0.082386, 0.1836, 0.1312, 0.0),
    (1.0374, -0.068, 0.1972, 0.123, 0.0),
    (1.0606, -0.1224, 0.1972, 0.1148, 0.0),
    (1.0838, -0.102, 0.1836, 0.1066, 0.0),
    (1.165, 0.034, 0.1224, 0.0861, 0.0),
    (1.223, 0.1632, 0.0816, 0.0574, 0.0),
    (1.281, 0.2788, 0.0306, 0.0246, 0.0),
    (1.3013, 0.3196, 0.00816, 0.00984, 0.0),
    (1.3071, 0.3264, 0.0, 0.0, 0.0),
]
CREST_ROOT_HEIGHT = 0.73
EYE_CENTRE_HEIGHT = 0.35
BODY_RINGS = 167

def activate(obj):
    for item in bpy.context.selected_objects:
        item.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def mesh_object(name, vertices, faces, collection):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj

def create_scene():
    assert bpy.data.scenes.get('Volt Studio') is None, 'Volt Studio already exists'
    scene = bpy.data.scenes.new('Volt Studio')
    bpy.context.window.scene = scene
    scene.unit_settings.system = 'METRIC'
    character = bpy.data.collections.new('Volt Character')
    scene.collection.children.link(character)
    studio = bpy.data.collections.new('Volt Studio Rig')
    scene.collection.children.link(studio)
    root = bpy.data.objects.new('Volt', None)
    character.objects.link(root)
    root.empty_display_size = 0.08
    root['asset'] = 'volt-lightning-gel-v3'
    root['reference'] = 'User supplied Volt electrical slime concept sheet'
    root['local_up'] = '+Z Blender / +Y glTF'
    root['local_forward'] = '+Y Blender / -Z glTF'
    root['resting_contact_y_metres'] = SOLE
    scene['generator'] = 'generate-volt.py + volt_model.py'
    scene['scope'] = 'Character asset with named morph controls; studio rig excluded from GLB'
    return scene

def slope(index, column, controls=None):
    if controls is None:
        controls = PROFILE
    previous = max(0, index - 1)
    following = min(len(controls) - 1, index + 1)
    if previous == index or following == index:
        a, b = (controls[previous], controls[following])
        return (b[column] - a[column]) / (b[0] - a[0])
    a, b, c = (controls[previous], controls[index], controls[following])
    left = (b[column] - a[column]) / (b[0] - a[0])
    right = (c[column] - b[column]) / (c[0] - b[0])
    if column in (2, 3):
        return 0 if left * right <= 0 else 2 * left * right / (left + right)
    return (left + right) * 0.5

def sample_profile(index, t):
    a, b = (PROFILE[index], PROFILE[index + 1])
    dz = b[0] - a[0]
    values = [a[0] + dz * t]
    for column in range(1, 5):
        values.append((2 * t ** 3 - 3 * t * t + 1) * a[column] + (t ** 3 - 2 * t * t + t) * dz * slope(index, column) + (-2 * t ** 3 + 3 * t * t) * b[column] + (t ** 3 - t * t) * dz * slope(index + 1, column))
    return values

def eye_surround(x, y, height):
    if y <= 0 or not .02 < height < .68:
        return 0.0
    offset = 0.0
    for sign in (-1, 1):
        vertical = (height-EYE_CENTRE_HEIGHT)/.21
        horizontal = (x-sign*(.25+.014*vertical))/(.14*(1-.12*vertical))
        radius = math.hypot(horizontal, vertical)
        if radius < 1.65:
            offset += .003*math.exp(-((radius-1.08)/.30)**2)-.0012*math.exp(-(radius/.80)**4)
    blend = max(0,min(1,(y-.12)/.23))
    return offset*blend*blend*(3-2*blend)

def body_geometry():
    samples = []
    index = 0
    for ring in range(BODY_RINGS):
        height = PROFILE[-1][0] * ring / BODY_RINGS
        while index + 1 < len(PROFILE) - 1 and height >= PROFILE[index + 1][0]:
            index += 1
        samples.append(sample_profile(index, (height - PROFILE[index][0]) / (PROFILE[index + 1][0] - PROFILE[index][0])))
    segments = 96
    vertices, faces = ([], [])
    for height, centre, width, depth, cy in samples:
        for segment in range(segments):
            angle = math.tau * segment / segments
            skirt = math.exp(-((height - 0.035) / 0.09) ** 2)
            lobes = 1 + skirt * (0.024 * math.cos(4 * angle) - 0.016 * math.cos(2 * angle))
            organic = 1 + 0.009 * math.cos(2 * angle) * math.sin(math.pi * min(1, height / 0.8))
            x = -centre + width * math.cos(angle) * lobes * organic
            y = cy + depth * math.sin(angle) * lobes * organic
            vertices.append((x, y+eye_surround(x,y,height), SOLE+height))
    for ring in range(len(samples) - 1):
        for segment in range(segments):
            a = ring * segments + segment
            b = ring * segments + (segment + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    bottom = len(vertices)
    vertices.append((0, 0, SOLE))
    top = len(vertices)
    vertices.append((-PROFILE[-1][1], PROFILE[-1][4], SOLE + PROFILE[-1][0]))
    for segment in range(segments):
        nxt = (segment + 1) % segments
        faces.append((bottom, nxt, segment))
        a, b = ((len(samples) - 1) * segments + segment, (len(samples) - 1) * segments + nxt)
        faces.append((a, b, top))
    return (vertices, faces)

def build_body():
    vertices, faces = body_geometry()
    body = mesh_object('Volt-Body', vertices, faces, bpy.data.collections['Volt Character'])
    body.parent = bpy.data.objects['Volt']
    body['surface'] = 'Continuous pooled gel body with two lightning folds and a long tapered tip'
    return body

def build_eyes():
    body = bpy.data.objects['Volt-Body']
    bpy.context.view_layer.update()
    segments, rings = (64, 12)
    for side, sign in [('Left', -1), ('Right', 1)]:
        cx, cz = (sign * 0.25, EYE_CENTRE_HEIGHT)

        def seat(x, z, radius):
            hit, point, normal, face = body.ray_cast(Vector((x, 3, SOLE + z)), Vector((0, -1, 0)))
            assert hit, 'Eye must fit on the body'
            return (x, point.y - 0.002 + 0.04 * (1 - radius * radius), SOLE + z)
        vertices = [seat(cx, cz, 0)]
        faces = []
        for ring in range(1, rings + 1):
            radius = ring / rings
            for segment in range(segments):
                angle = math.tau * segment / segments
                z = cz + radius * 0.21 * math.sin(angle)
                x = cx + radius * 0.14 * math.cos(angle) * (1 - 0.12 * math.sin(angle))
                x += sign * radius * 0.014 * math.sin(angle)
                vertices.append(seat(x, z, radius))
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((0, 1 + segment, 1 + nxt))
            for ring in range(rings - 1):
                a, b = (1 + ring * segments + segment, 1 + ring * segments + nxt)
                faces.append((a, b, b + segments, a + segments))
        front_count = len(vertices)
        front_faces = list(faces)
        for x, y, z in list(vertices):
            hit, point, normal, face = body.ray_cast(Vector((x, 3, z)), Vector((0, -1, 0)))
            assert hit
            vertices.append((x, point.y - 0.018, z))
        faces.extend((tuple((front_count + i for i in reversed(face))) for face in front_faces))
        outer = 1 + (rings - 1) * segments
        for segment in range(segments):
            a, b = (outer + segment, outer + (segment + 1) % segments)
            faces.append((a, a + front_count, b + front_count, b))
        obj = mesh_object('Volt-Eye-' + side, vertices, faces, bpy.data.collections['Volt Character'])
        obj.parent = bpy.data.objects['Volt']
        activate(obj)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')

def material(name, colour, roughness, coat=0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*colour, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*colour, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = 0.12
    return (mat, bsdf)

def gradient_amount(height):
    amount = max(0, min(1, (height - CREST_ROOT_HEIGHT) / 0.46))
    return amount * amount * (3 - 2 * amount)

def srgb_encode(value):
    return 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055

def gradient_image(name, kind):
    width = 64 if kind == 'roughness' else 2
    image = bpy.data.images.get(name) or bpy.data.images.new(name,width=width,height=512,alpha=True)
    image.colorspace_settings.name = 'Non-Color' if kind == 'roughness' else 'sRGB'
    pixels = []
    for row in range(512):
        height = (row+.5)/512*PROFILE[-1][0]
        amount = gradient_amount(height)
        for column in range(width):
            if kind == 'emission':
                strength = (.30+.65*amount)/.95
                colour = [srgb_encode(strength*c) for c in (1.,.65,.001)]
            elif kind == 'tint':
                rise = max(0,min(1,(height-.035)/.405))
                amber = 1-rise*rise*(3-2*rise)
                colour = [srgb_encode(c) for c in (1.,.72*(1-.12*amber),.003)]
            else:
                u = (column+.5)/width
                colour = [1.,.26+.08*amount+.032*(u-.5)*(1-.45*amount),0.]
            pixels.extend((*colour,1.))
    image.pixels.foreach_set(pixels)
    image.update()
    image.pack()
    return image


def lookdev():
    gel, bsdf = material('Volt-Golden-Gel', (1.0, 1.0, 1.0), 0.26, 0.26)
    gel.diffuse_color = (1.,.72,.003,1.)
    bsdf.inputs['Coat Roughness'].default_value = 0.20
    bsdf.inputs['IOR'].default_value = 1.38
    bsdf.inputs['Transmission Weight'].default_value = 0.55
    bsdf.inputs['Emission Color'].default_value = (1.0, 1.0, 1.0, 1)
    bsdf.inputs['Emission Strength'].default_value = 0.95
    nodes, links = (gel.node_tree.nodes, gel.node_tree.links)
    for node in list(nodes):
        if node.name.startswith('Volt-Gradient-'):
            nodes.remove(node)
    uv_node = nodes.new('ShaderNodeUVMap')
    uv_node.name, uv_node.uv_map = ('Volt-Gradient-UV', 'Volt-Gel-Flow')
    emissive = nodes.new('ShaderNodeTexImage')
    emissive.name = 'Volt-Gradient-Emission'
    emissive.image = gradient_image('Volt-Continuous-Emission', 'emission')
    emissive.interpolation, emissive.extension = ('Linear', 'EXTEND')
    roughness = nodes.new('ShaderNodeTexImage')
    roughness.name = 'Volt-Gradient-Roughness'
    roughness.image = gradient_image('Volt-Continuous-Roughness', 'roughness')
    roughness.interpolation, roughness.extension = ('Linear', 'EXTEND')
    tint = nodes.new('ShaderNodeTexImage')
    tint.name = 'Volt-Gradient-Tint'
    tint.image = gradient_image('Volt-Amber-Depth', 'tint')
    tint.interpolation, tint.extension = ('Linear','EXTEND')
    separate = nodes.new('ShaderNodeSeparateColor')
    separate.name = 'Volt-Gradient-Channels'
    links.new(uv_node.outputs['UV'], emissive.inputs['Vector'])
    links.new(uv_node.outputs['UV'], roughness.inputs['Vector'])
    links.new(emissive.outputs['Color'], bsdf.inputs['Emission Color'])
    links.new(uv_node.outputs['UV'], tint.inputs['Vector'])
    links.new(tint.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(roughness.outputs['Color'], separate.inputs['Color'])
    links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
    eye, bsdf = material('Volt-Obsidian-Eyes', (0.004, 0.0025, 0.001), 0.23, 0.22)
    bsdf.inputs['Coat Roughness'].default_value = 0.18
    for name in NAMES:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(eye if 'Eye' in name else gel)
    body = bpy.data.objects['Volt-Body']
    uv = body.data.uv_layers.get('Volt-Gel-Flow') or body.data.uv_layers.new(name='Volt-Gel-Flow')
    for loop in body.data.loops:
        height = body.data.vertices[loop.vertex_index].co.z - SOLE
        x,y,z = body.data.vertices[loop.vertex_index].co
        flow = .5+.24*math.cos(7*x)*math.sin(5*y+3*height)+.16*math.cos(11*x)*math.cos(8*y-5*height)
        uv.data[loop.index].uv = (max(0,min(1,flow)),max(0,min(1,height/PROFILE[-1][0])))
    for polygon in body.data.polygons:
        polygon.material_index = 0

def deform_point(point, name):
    x, y, z = point
    height = z - SOLE
    if name in ('Squash', 'Stretch'):
        vertical = 0.9 if name == 'Squash' else 1.09
        horizontal = 1 / math.sqrt(vertical)
        return Vector((x * horizontal, y * horizontal, SOLE + height * vertical))
    if name in ('CrestFlexLeft', 'CrestFlexRight'):
        if height <= CREST_ROOT_HEIGHT:
            return Vector(point)
        amount = max(0, min(1, (height - CREST_ROOT_HEIGHT) / 0.9))
        amount = amount * amount * (3 - 2 * amount)
        angle = (-1 if name == 'CrestFlexLeft' else 1) * 0.065 * amount
        dx, dz = (x - 0.04, height - CREST_ROOT_HEIGHT)
        return Vector((0.04 + dx * math.cos(angle) + dz * math.sin(angle), y, SOLE + CREST_ROOT_HEIGHT + dz * math.cos(angle) - dx * math.sin(angle)))
    return Vector(point)

def build_morphs():
    body = bpy.data.objects['Volt-Body']
    bpy.context.view_layer.update()
    for name in NAMES:
        obj = bpy.data.objects[name]
        assert obj.data.shape_keys is None, 'Morphs already built'
        basis = obj.shape_key_add(name='Basis', from_mix=False)
        for morph_name in MORPH_NAMES:
            key = obj.shape_key_add(name=morph_name, from_mix=False)
            key.slider_min, key.slider_max, key.value = (0, 1, 0)
            for index, vertex in enumerate(basis.data):
                if morph_name == 'Blink' and 'Eye' in name:
                    x, y, z = vertex.co
                    hit, original, normal, face = body.ray_cast((x, 3, z), (0, -1, 0))
                    assert hit
                    closed_z = SOLE + EYE_CENTRE_HEIGHT + (z - SOLE - EYE_CENTRE_HEIGHT) * BLINK_HEIGHT_FRACTION
                    hit, seat, normal, face = body.ray_cast((x, 3, closed_z), (0, -1, 0))
                    assert hit
                    key.data[index].co = (x, seat.y + y - original.y, closed_z)
                else:
                    key.data[index].co = deform_point(vertex.co, morph_name)
        obj.active_shape_key_index = 0
        obj['morph_controls'] = ', '.join(MORPH_NAMES)

def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def build_studio():
    scene = bpy.context.scene
    studio = bpy.data.collections['Volt Studio Rig']
    floor = mesh_object('Volt-Studio-Floor', [(-200, -200, SOLE - 0.005), (200, -200, SOLE - 0.005), (200, 200, SOLE - 0.005), (-200, 200, SOLE - 0.005)], [(0, 1, 2, 3)], studio)
    mat, bsdf = material('Volt-Studio-Slate', (0.055, 0.07, 0.095), 0.3, 0.15)
    floor.data.materials.append(mat)
    for name, position, energy, size, colour in [('Key', (-3, 3, 4), 250, 3.0, (1.0, 0.98, 0.9)), ('Fill', (3, 2, 2.4), 180, 2.5, (0.75, 0.85, 1.0)), ('Rim', (1, -2.5, 3.2), 380, 2.3, (1.0, 0.9, 0.45)), ('Eye-Strip', (-0.5, 4, 1.6), 40, 0.7, (1.0, 1.0, 1.0))]:
        data = bpy.data.lights.new('Volt-Studio-' + name, 'AREA')
        data.energy, data.shape, data.size, data.color = (energy, 'DISK', size, colour)
        obj = bpy.data.objects.new(data.name, data)
        studio.objects.link(obj)
        obj.location = position
        point_at(obj, (0, 0, 0.25))
    camera = bpy.data.objects.new('Volt-Studio-Camera', bpy.data.cameras.new('Volt-Studio-Camera'))
    studio.objects.link(camera)
    camera.location = (1.8, 5.2, 1.4)
    point_at(camera, (0, 0, 0.18))
    camera.data.type, camera.data.ortho_scale = ('ORTHO', 2.35)
    scene.camera = camera
    world = bpy.data.worlds.new('Volt-Studio-World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.11, 0.14, 0.19, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.32
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = (900, 900)
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Khronos PBR Neutral'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = -0.35
    scene.render.image_settings.file_format = 'PNG'

def frame_view(axis='FRONT'):
    area = next((a for a in bpy.context.screen.areas if a.type == 'VIEW_3D'))
    region = next((r for r in area.regions if r.type == 'WINDOW'))
    space = area.spaces.active
    before = list(bpy.context.selected_objects)
    active_before = bpy.context.view_layer.objects.active
    activate(bpy.data.objects['Volt-Body'])
    with bpy.context.temp_override(window=bpy.context.window, area=area, region=region, space_data=space):
        bpy.ops.view3d.view_axis(type='BACK' if axis == 'FRONT' else 'FRONT' if axis == 'BACK' else axis)
        bpy.ops.view3d.view_selected(use_all_regions=False)
    space.overlay.show_overlays = False
    space.shading.type = 'MATERIAL'
    space.shading.studiolight_rotate_z = 0.45
    space.shading.studiolight_background_alpha = 0.0
    space.shading.background_type = 'WORLD'
    space.region_3d.view_location = (0, 0, 0.5)
    space.region_3d.view_distance = 2.8
    area.tag_redraw()
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in before:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active_before

def build_all():
    create_scene()
    build_body()
    build_eyes()
    lookdev()
    build_morphs()
    build_studio()
