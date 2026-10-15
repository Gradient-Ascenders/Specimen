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
BLINK_HEIGHT_FRACTION = 0.13  # Keeps eye volume positive even with full Squash.

# The lower body is frozen, including its original look-ahead tangent at 0.79 m.
# Height, horizontal centre, half width, half depth, depth centre.
BODY_PROFILE = [
    (0.000, 0.000, 0.530, 0.435, 0.000),
    (0.018, 0.000, 0.620, 0.495, 0.000),
    (0.052, 0.000, 0.666, 0.528, 0.000),
    (0.105, 0.000, 0.650, 0.530, 0.000),
    (0.210, 0.000, 0.646, 0.523, 0.000),
    (0.360, 0.008, 0.622, 0.505, -0.008),
    (0.520, 0.015, 0.565, 0.467, -0.018),
    (0.670, 0.000, 0.480, 0.390, -0.024),
    (0.790, -0.040, 0.310, 0.260, 0.010),
    (0.900, -0.150, 0.232, 0.203, 0.080),
]
PRESERVED_BODY_HEIGHT = 0.790
PRESERVED_BODY_SHA256 = 'f2b6621829b0a2117b5d46feb04c842e6edbb368b559a9f7935f28bd760fbd0f'
PRESERVED_EYES_SHA256 = {
    'Volt-Eye-Left': 'cdb019211f0d6d45de030360ae817c7ac17bd9a2b18ff423dc922e3a8e9eb9c6',
    'Volt-Eye-Right': 'd92fc20506cb14964dae9f0b5c06b26078bd7df9d4ae3b67d23cbfad51168720',
}
ROOT_SHIFT_METRES = 0.10656  # 8% of body width, towards -X in the reviewed view.

# One continuous loft: substantial gel cross-sections and softly rounded folds.
# The upper spike is 0.315 m long versus the previous 0.410 m (23% shorter).
PROFILE = BODY_PROFILE[:9] + [
    (0.875, -0.090, 0.280, 0.255, 0.035),
    (0.970, -0.195, 0.260, 0.230, 0.090),
    (1.015, -0.220, 0.250, 0.220, 0.100),
    (1.055, -0.185, 0.235, 0.215, 0.080),
    (1.140, -0.010, 0.225, 0.215, -0.035),
    (1.220, 0.170, 0.240, 0.200, -0.170),
    (1.275, 0.200, 0.250, 0.195, -0.185),
    (1.315, 0.150, 0.245, 0.186, -0.140),
    (1.375, -0.010, 0.215, 0.168, -0.020),
    (1.440, -0.170, 0.195, 0.150, 0.100),
    (1.475, -0.225, 0.160, 0.130, 0.120),
    (1.510, -0.185, 0.140, 0.123, 0.080),
    (1.600, -0.060, 0.110, 0.102, -0.020),
    (1.690, 0.100, 0.076, 0.065, -0.125),
    (1.750, 0.175, 0.046, 0.040, -0.170),
    (1.770, 0.190, 0.030, 0.026, -0.185),
    (1.785, 0.195, 0.012, 0.010, -0.190),
    (1.790, 0.195, 0.000, 0.000, -0.191),
]


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
        a, b = controls[previous], controls[following]
        return (b[column] - a[column]) / (b[0] - a[0])
    a, b, c = controls[previous], controls[index], controls[following]
    left = (b[column] - a[column]) / (b[0] - a[0])
    right = (c[column] - b[column]) / (c[0] - b[0])
    if column in (2, 3):
        # Shape-preserving radii prevent tiny folds or bulges between keys.
        return 0 if left * right <= 0 else 2 * left * right / (left + right)
    return (left + right) * 0.5


def sample_profile(index, t):
    controls = BODY_PROFILE if PROFILE[index][0] < PRESERVED_BODY_HEIGHT else PROFILE
    a, b = controls[index], controls[index + 1]
    dz = b[0] - a[0]
    values = [a[0] + dz * t]
    for column in range(1, 5):
        start_controls = BODY_PROFILE if a[0] == PRESERVED_BODY_HEIGHT else controls
        values.append((2*t**3 - 3*t*t + 1) * a[column]
                      + (t**3 - 2*t*t + t) * dz * slope(index, column, start_controls)
                      + (-2*t**3 + 3*t*t) * b[column]
                      + (t**3 - t*t) * dz * slope(index + 1, column, controls))
    return values


def root_recentre(height):
    rise = max(0,min(1,(height-PRESERVED_BODY_HEIGHT)/0.16))
    fall = max(0,min(1,(1.275-height)/0.235))
    return ROOT_SHIFT_METRES * rise*rise*(3-2*rise) * fall*fall*(3-2*fall)


def build_body():
    samples = []
    for index in range(len(PROFILE) - 1):
        steps = max(3, math.ceil((PROFILE[index+1][0] - PROFILE[index][0]) / 0.012))
        for step in range(steps):
            samples.append(sample_profile(index, step / steps))
    segments = 96
    vertices, faces = [], []
    for height, centre, width, depth, cy in samples:
        for segment in range(segments):
            angle = math.tau * segment / segments
            skirt = math.exp(-((height - 0.035) / 0.095)**2)
            lobes = 1 + skirt * (0.025*math.cos(5*angle + 0.4) + 0.012*math.sin(3*angle))
            organic = 1 + 0.009*math.cos(3*angle + height*3)*math.sin(math.pi*min(1, height/0.8))
            vertices.append((-centre-root_recentre(height) + width*math.cos(angle)*lobes*organic,
                             cy + depth*math.sin(angle)*lobes*organic, SOLE + height))
    for ring in range(len(samples)-1):
        for segment in range(segments):
            a = ring*segments + segment
            b = ring*segments + (segment+1)%segments
            faces.append((a, b, b+segments, a+segments))
    bottom = len(vertices)
    vertices.append((0, 0, SOLE))
    top = len(vertices)
    vertices.append((-PROFILE[-1][1], PROFILE[-1][4], SOLE+PROFILE[-1][0]))
    for segment in range(segments):
        nxt = (segment+1)%segments
        faces.append((bottom, nxt, segment))
        a, b = (len(samples)-1)*segments+segment, (len(samples)-1)*segments+nxt
        faces.append((a,b,top))
    body = mesh_object('Volt-Body', vertices, faces, bpy.data.collections['Volt Character'])
    body.parent = bpy.data.objects['Volt']
    body['surface'] = 'Single continuous closed gel body and lightning crest'
    # Local relaxation removes the root collar without touching the approved
    # body, the two higher elbows, or the outward tip. Topology stays unchanged.
    group = body.vertex_groups.new(name='Root Transition')
    for vertex in body.data.vertices:
        height = vertex.co.z-SOLE
        if PRESERVED_BODY_HEIGHT+1e-6 < height < 1.115:
            weight = math.sin(math.pi*(height-PRESERVED_BODY_HEIGHT)/(1.115-PRESERVED_BODY_HEIGHT))**2
            group.add([vertex.index],weight,'REPLACE')
    activate(body)
    modifier = body.modifiers.new('Smooth Root Flow','SMOOTH')
    modifier.vertex_group = group.name
    modifier.factor = 0.65
    modifier.iterations = 18
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    retained_group = body.vertex_groups.get('Root Transition')
    if retained_group is not None:
        body.vertex_groups.remove(retained_group)
    return body


def build_eyes():
    body = bpy.data.objects['Volt-Body']
    bpy.context.view_layer.update()
    segments, rings = 64, 12
    for side, sign in [('Left', -1), ('Right', 1)]:
        cx, cz = sign*0.261, 0.353

        def seat(x, z, radius):
            hit, point, normal, face = body.ray_cast(Vector((x,3,SOLE+z)), Vector((0,-1,0)))
            assert hit, 'Eye must fit on the body'
            return (x, point.y-0.002+0.040*(1-radius*radius), SOLE+z)

        vertices = [seat(cx, cz, 0)]
        faces = []
        for ring in range(1, rings+1):
            radius = ring/rings
            for segment in range(segments):
                angle = math.tau*segment/segments
                z = cz + radius*0.219*math.sin(angle)
                x = cx + radius*0.124*math.cos(angle)*(1-0.12*math.sin(angle))
                x += sign*radius*0.014*math.sin(angle)
                vertices.append(seat(x,z,radius))
        for segment in range(segments):
            nxt = (segment+1)%segments
            faces.append((0,1+segment,1+nxt))
            for ring in range(rings-1):
                a, b = 1+ring*segments+segment, 1+ring*segments+nxt
                faces.append((a,b,b+segments,a+segments))
        front_count = len(vertices)
        front_faces = list(faces)
        for x,y,z in list(vertices):
            hit,point,normal,face = body.ray_cast(Vector((x,3,z)), Vector((0,-1,0)))
            assert hit
            vertices.append((x,point.y-0.018,z))
        faces.extend(tuple(front_count+i for i in reversed(face)) for face in front_faces)
        outer = 1+(rings-1)*segments
        for segment in range(segments):
            a, b = outer+segment, outer+(segment+1)%segments
            faces.append((a,a+front_count,b+front_count,b))
        obj = mesh_object('Volt-Eye-'+side,vertices,faces,bpy.data.collections['Volt Character'])
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
    bsdf.inputs['Base Color'].default_value = (*colour,1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = 0.12
    return mat, bsdf


def gradient_amount(height):
    amount = max(0,min(1,(height-PRESERVED_BODY_HEIGHT)/0.46))
    return amount*amount*(3-2*amount)


def srgb_encode(value):
    return 12.92*value if value <= 0.0031308 else 1.055*value**(1/2.4)-0.055


def gradient_image(name, emission):
    image = bpy.data.images.get(name) or bpy.data.images.new(name,width=2,height=512,alpha=True)
    image.colorspace_settings.name = 'sRGB' if emission else 'Non-Color'
    pixels = []
    for row in range(512):
        height = ((row+0.5)/512)*PROFILE[-1][0]
        amount = gradient_amount(height)
        if emission:
            strength = (0.30+0.65*amount)/0.95
            colour = [srgb_encode(strength*c) for c in (1.0,0.65,0.001)]
        else:
            # glTF's metallic/roughness convention: G roughness, B metallic.
            colour = [1.0,0.18+0.10*amount,0.0]
        pixels.extend((*colour,1.0,*colour,1.0))
    image.pixels.foreach_set(pixels)
    image.update()
    image.pack()
    return image


def lookdev():
    gel, bsdf = material('Volt-Golden-Gel', (1.0,0.72,0.003), 0.18, 0.32)
    bsdf.inputs['IOR'].default_value = 1.38
    bsdf.inputs['Transmission Weight'].default_value = 0.55
    bsdf.inputs['Emission Color'].default_value = (1.0,1.0,1.0,1)
    bsdf.inputs['Emission Strength'].default_value = 0.95
    # Two tiny packed ramps give a continuous finish with one body primitive.
    # The ramps move with the mesh during morphing, rather than with world Z.
    nodes, links = gel.node_tree.nodes, gel.node_tree.links
    for node in list(nodes):
        if node.name.startswith('Volt-Gradient-'):
            nodes.remove(node)
    uv_node = nodes.new('ShaderNodeUVMap')
    uv_node.name, uv_node.uv_map = 'Volt-Gradient-UV','Volt-Gel-Flow'
    emissive = nodes.new('ShaderNodeTexImage')
    emissive.name = 'Volt-Gradient-Emission'
    emissive.image = gradient_image('Volt-Continuous-Emission',True)
    emissive.interpolation, emissive.extension = 'Linear','EXTEND'
    roughness = nodes.new('ShaderNodeTexImage')
    roughness.name = 'Volt-Gradient-Roughness'
    roughness.image = gradient_image('Volt-Continuous-Roughness',False)
    roughness.interpolation, roughness.extension = 'Linear','EXTEND'
    separate = nodes.new('ShaderNodeSeparateColor')
    separate.name = 'Volt-Gradient-Channels'
    links.new(uv_node.outputs['UV'],emissive.inputs['Vector'])
    links.new(uv_node.outputs['UV'],roughness.inputs['Vector'])
    links.new(emissive.outputs['Color'],bsdf.inputs['Emission Color'])
    links.new(roughness.outputs['Color'],separate.inputs['Color'])
    links.new(separate.outputs['Green'],bsdf.inputs['Roughness'])
    eye, bsdf = material('Volt-Obsidian-Eyes', (0.004,0.0025,0.001), 0.16, 0.35)
    for name in NAMES:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(eye if 'Eye' in name else gel)
    body = bpy.data.objects['Volt-Body']
    uv = body.data.uv_layers.get('Volt-Gel-Flow') or body.data.uv_layers.new(name='Volt-Gel-Flow')
    for loop in body.data.loops:
        height = body.data.vertices[loop.vertex_index].co.z-SOLE
        uv.data[loop.index].uv = (0.5,max(0,min(1,height/PROFILE[-1][0])))
    for polygon in body.data.polygons:
        polygon.material_index = 0


def deform_point(point, name):
    x,y,z = point
    height = z-SOLE
    if name in ('Squash','Stretch'):
        vertical = 0.90 if name == 'Squash' else 1.09
        horizontal = 1/math.sqrt(vertical)
        return Vector((x*horizontal,y*horizontal,SOLE+height*vertical))
    if name in ('CrestFlexLeft','CrestFlexRight'):
        if height <= PRESERVED_BODY_HEIGHT:
            return Vector(point)
        amount = max(0,min(1,(height-PRESERVED_BODY_HEIGHT)/0.9))
        amount = amount*amount*(3-2*amount)
        angle = (-1 if name == 'CrestFlexLeft' else 1)*0.065*amount
        dx,dz = x-0.04,height-PRESERVED_BODY_HEIGHT
        return Vector((0.04+dx*math.cos(angle)+dz*math.sin(angle),y,
                       SOLE+PRESERVED_BODY_HEIGHT+dz*math.cos(angle)-dx*math.sin(angle)))
    return Vector(point)


def build_morphs():
    body = bpy.data.objects['Volt-Body']
    bpy.context.view_layer.update()
    for name in NAMES:
        obj = bpy.data.objects[name]
        assert obj.data.shape_keys is None, 'Morphs already built'
        basis = obj.shape_key_add(name='Basis',from_mix=False)
        for morph_name in MORPH_NAMES:
            key = obj.shape_key_add(name=morph_name,from_mix=False)
            key.slider_min, key.slider_max, key.value = 0,1,0
            for index,vertex in enumerate(basis.data):
                if morph_name == 'Blink' and 'Eye' in name:
                    x,y,z = vertex.co
                    hit,original,normal,face = body.ray_cast((x,3,z),(0,-1,0))
                    assert hit
                    closed_z = SOLE+0.353+(z-SOLE-0.353)*BLINK_HEIGHT_FRACTION
                    hit,seat,normal,face = body.ray_cast((x,3,closed_z),(0,-1,0))
                    assert hit
                    key.data[index].co = (x,seat.y+y-original.y,closed_z)
                else:
                    key.data[index].co = deform_point(vertex.co,morph_name)
        obj.active_shape_key_index = 0
        obj['morph_controls'] = ', '.join(MORPH_NAMES)


def point_at(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def build_subtle_bloom():
    group = bpy.data.node_groups.new('Volt-Studio-Subtle-Glow','CompositorNodeTree')
    group.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
    render = group.nodes.new('CompositorNodeRLayers')
    glow = group.nodes.new('CompositorNodeGlare')
    glow.inputs['Type'].default_value = 'Fog Glow'
    glow.inputs['Quality'].default_value = 'High'
    glow.inputs['Threshold'].default_value = 1.2
    glow.inputs['Strength'].default_value = 0.08
    glow.inputs['Size'].default_value = 0.04
    output = group.nodes.new('NodeGroupOutput')
    group.links.new(render.outputs['Image'],glow.inputs['Image'])
    group.links.new(glow.outputs['Image'],output.inputs['Image'])
    bpy.context.scene.compositing_node_group = group


def build_studio():
    scene = bpy.context.scene
    studio = bpy.data.collections['Volt Studio Rig']
    floor = mesh_object('Volt-Studio-Floor', [(-200,-200,SOLE-0.005),(200,-200,SOLE-0.005),
                        (200,200,SOLE-0.005),(-200,200,SOLE-0.005)], [(0,1,2,3)], studio)
    mat, bsdf = material('Volt-Studio-Slate', (0.055,0.070,0.095),0.30,0.15)
    floor.data.materials.append(mat)
    for name, position, energy, size, colour in [
        ('Key',(-3,3,4),250,3.0,(1.0,0.98,0.90)),
        ('Fill',(3,2,2.4),180,2.5,(0.75,0.85,1.0)),
        ('Rim',(1,-2.5,3.2),380,2.3,(1.0,0.90,0.45)),
        ('Eye-Strip',(-0.5,4,1.6),40,0.7,(1.0,1.0,1.0)),
    ]:
        data = bpy.data.lights.new('Volt-Studio-'+name,'AREA')
        data.energy, data.shape, data.size, data.color = energy, 'DISK', size, colour
        obj = bpy.data.objects.new(data.name,data)
        studio.objects.link(obj)
        obj.location = position
        point_at(obj,(0,0,0.25))
    data = bpy.data.lights.new('Volt-Studio-Ground-Glow','POINT')
    data.energy, data.color, data.shadow_soft_size = 10,(1,0.44,0.008),0.42
    obj = bpy.data.objects.new(data.name,data)
    studio.objects.link(obj)
    obj.location = (0,0,-0.25)
    camera = bpy.data.objects.new('Volt-Studio-Camera',bpy.data.cameras.new('Volt-Studio-Camera'))
    studio.objects.link(camera)
    camera.location = (1.8,5.2,1.7)
    point_at(camera,(0,0,0.44))
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 2.85
    scene.camera = camera
    world = bpy.data.worlds.new('Volt-Studio-World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.11,0.14,0.19,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.32
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 900,900
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Khronos PBR Neutral'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = -0.35
    scene.render.image_settings.file_format = 'PNG'
    build_subtle_bloom()


def frame_view(axis='FRONT'):
    area = next(a for a in bpy.context.screen.areas if a.type == 'VIEW_3D')
    region = next(r for r in area.regions if r.type == 'WINDOW')
    space = area.spaces.active
    before = list(bpy.context.selected_objects)
    active_before = bpy.context.view_layer.objects.active
    activate(bpy.data.objects['Volt-Body'])
    with bpy.context.temp_override(window=bpy.context.window, area=area, region=region, space_data=space):
        # Blender BACK looks towards -Y, which is this character's front.
        bpy.ops.view3d.view_axis(type='BACK' if axis == 'FRONT' else 'FRONT' if axis == 'BACK' else axis)
        bpy.ops.view3d.view_selected(use_all_regions=False)
    space.overlay.show_overlays = False
    space.shading.type = 'MATERIAL'
    space.shading.studiolight_rotate_z = 0.45
    space.shading.studiolight_background_alpha = 0.0
    space.shading.background_type = 'WORLD'
    space.region_3d.view_location = (0,0,0.50)
    space.region_3d.view_distance = 2.8
    space.region_3d.update()
    area.tag_redraw()
    bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP',iterations=1)
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
