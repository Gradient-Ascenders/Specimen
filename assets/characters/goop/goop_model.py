"""Goop's reference-led sculpt, shared by interactive MCP and regeneration.

Blender coordinates: +Z up, +Y front; exported glTF: +Y up, -Z front.
All geometry lives at the origin with the resting sole at Z=-0.45 m.
The studio is separate from the exportable character collection.
"""

import math
import bpy
from mathutils import Vector

SOLE = -0.45


def activate(obj):
    for selected in bpy.context.selected_objects:
        selected.select_set(False)
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


def ellipsoid(name, centre, radii, collection, segments=48, rings=24):
    vertices = [(centre[0], centre[1], centre[2] + radii[2])]
    faces = []
    for ring in range(1, rings):
        theta = math.pi * ring / rings
        for segment in range(segments):
            phi = math.tau * segment / segments
            vertices.append((centre[0] + radii[0] * math.sin(theta) * math.cos(phi),
                             centre[1] + radii[1] * math.sin(theta) * math.sin(phi),
                             centre[2] + radii[2] * math.cos(theta)))
    bottom = len(vertices)
    vertices.append((centre[0], centre[1], centre[2] - radii[2]))
    for segment in range(segments):
        nxt = (segment + 1) % segments
        faces.append((0, 1 + segment, 1 + nxt))
        for ring in range(rings - 2):
            a, b = 1 + ring * segments + segment, 1 + ring * segments + nxt
            faces.append((a, a + segments, b + segments, b))
        a = 1 + (rings - 2) * segments + segment
        b = 1 + (rings - 2) * segments + nxt
        faces.append((a, bottom, b))
    return mesh_object(name, vertices, faces, collection)


def create_scene():
    scene = bpy.data.scenes.new('Goop Studio')
    bpy.context.window.scene = scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    character = bpy.data.collections.new('Goop Character')
    scene.collection.children.link(character)
    studio = bpy.data.collections.new('Goop Studio Rig')
    scene.collection.children.link(studio)
    root = bpy.data.objects.new('Goop', None)
    root.empty_display_size = 0.08
    character.objects.link(root)
    root['asset'] = 'goop-concept-sculpt-v1'
    root['local_up'] = '+Y (glTF) / +Z (Blender)'
    root['local_forward'] = '-Z (glTF) / +Y (Blender)'
    root['resting_contact_y_metres'] = SOLE
    root['reference'] = 'User supplied Goop corrosive slime concept sheet'
    scene['generator'] = 'generate-goop.py + goop_model.py'
    scene['scope'] = 'Character asset and look development; no gameplay integration'
    return scene


def build_body():
    collection = bpy.data.collections['Goop Character']
    # A deliberately flared, scalloped skirt under a rounded dome.
    profile = [(0.000, 1.035), (0.025, 1.12), (0.055, 1.16),
               (0.090, 1.115), (0.140, 1.005), (0.200, 0.885),
               (0.265, 0.82), (0.355, 0.78), (0.455, 0.72),
               (0.545, 0.64), (0.635, 0.54), (0.705, 0.41),
               (0.758, 0.26), (0.787, 0.12), (0.800, 0.00)]
    samples = []
    for i in range(len(profile) - 1):
        p0, p1 = profile[max(0, i-1)], profile[i]
        p2, p3 = profile[i+1], profile[min(len(profile)-1, i+2)]
        for step in range(5):
            t = step / 5.0
            values = []
            for axis in range(2):
                a, b, c, d = p0[axis], p1[axis], p2[axis], p3[axis]
                values.append(0.5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t))
            samples.append(values)
    count = 128
    vertices, faces = [], []
    for height, radius in samples:
        skirt = math.exp(-((height - 0.040) / 0.110)**2)
        for segment in range(count):
            angle = math.tau * segment / count
            lobes = 1 + skirt * (0.075*math.cos(5*angle + 0.7) + 0.020*math.sin(7*angle - 0.9))
            organic = 1 + 0.017*math.sin(3*angle + 0.3)*math.sin(math.pi*height/0.8)
            vertices.append((0.625*radius*lobes*organic*math.cos(angle),
                             0.490*radius*lobes*organic*math.sin(angle) - 0.045*(height/0.8)**2,
                             SOLE + max(0, height)))
    for ring in range(len(samples)-1):
        for segment in range(count):
            a = ring*count + segment
            b = ring*count + (segment+1)%count
            faces.append((a, b, b+count, a+count))
    bottom = len(vertices)
    vertices.append((0, 0, SOLE))
    top = len(vertices)
    vertices.append((0, -0.045, SOLE + 0.8))
    for segment in range(count):
        nxt = (segment+1)%count
        faces.append((bottom, nxt, segment))
        a, b = (len(samples)-1)*count+segment, (len(samples)-1)*count+nxt
        faces.append((a, b, top))
    body = mesh_object('Goop-Body', vertices, faces, collection)
    body.parent = bpy.data.objects['Goop']
    return body


def build_crest():
    collection = bpy.data.collections['Goop Character']

    def liquid_stroke(name, controls):
        # Round swept volumes, perpendicular to their flow direction.
        samples = []
        for i in range(len(controls)-1):
            p0,p1 = controls[max(0,i-1)],controls[i]
            p2,p3 = controls[i+1],controls[min(len(controls)-1,i+2)]
            for j in range(8):
                t=j/8
                samples.append([0.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
                                for a,b,c,d in zip(p0,p1,p2,p3)])
        samples.append(controls[-1])
        vertices,faces=[],[]
        sides=40
        for i,(y,z,width,depth) in enumerate(samples):
            # Keep the crest a narrow ridge instead of a swollen roll.
            width *= 0.60 if name == 'Swept-Lock' else 0.70
            depth *= 0.70 if name == 'Swept-Lock' else 0.80
            if name == 'Swept-Lock':
                z -= 0.035
            before=samples[max(0,i-1)]
            after=samples[min(len(samples)-1,i+1)]
            dy,dz=after[0]-before[0],after[1]-before[1]
            length=math.hypot(dy,dz)
            ny,nz=-dz/length,dy/length
            for j in range(sides):
                angle=math.tau*j/sides
                vertices.append((width*math.cos(angle),y+depth*math.sin(angle)*ny,
                                 SOLE+z+depth*math.sin(angle)*nz))
        for i in range(len(samples)-1):
            for j in range(sides):
                a=i*sides+j
                b=i*sides+(j+1)%sides
                faces.append((a,b,b+sides,a+sides))
        faces.append(tuple(reversed(range(sides))))
        faces.append(tuple((len(samples)-1)*sides+j for j in range(sides)))
        return mesh_object('Goop-'+name+'-Construction',vertices,faces,collection)

    # Low rear root rises into a thick, forward curling liquid lock.
    parts = [liquid_stroke('Swept-Lock',[
        (-0.35,0.40,0.035,0.045),(-0.30,0.60,0.105,0.12),
        (-0.20,0.80,0.125,0.16),(-0.03,0.92,0.145,0.17),
        (0.14,0.94,0.125,0.135),(0.25,0.89,0.105,0.105),
        (0.315,0.83,0.055,0.060),(0.34,0.785,0.026,0.028),
        (0.35,0.750,0.004,0.005)])]
    # Swept triangular spikes continue down the spine, tapering toward the base.
    for name,controls in [
        ('Lower-Back-Spike',[(-0.43,0.17,0.075,0.090),(-0.53,0.24,0.060,0.065),
                             (-0.65,0.33,0.026,0.030),(-0.71,0.38,0.002,0.003)]),
        ('Mid-Back-Spike',[(-0.38,0.35,0.085,0.100),(-0.49,0.44,0.065,0.075),
                           (-0.60,0.55,0.030,0.032),(-0.65,0.63,0.002,0.003)]),
        ('Upper-Back-Spike',[(-0.30,0.54,0.095,0.110),(-0.42,0.64,0.070,0.080),
                             (-0.50,0.77,0.031,0.032),(-0.54,0.85,0.002,0.003)]),
        ('Rear-Spike',[(-0.28,0.67,0.095,0.105),(-0.34,0.82,0.075,0.070),
                       (-0.40,0.96,0.032,0.028),(-0.425,1.035,0.002,0.003)]),
        ('High-Spike',[(-0.075,0.88,0.120,0.130),(-0.14,1.065,0.080,0.075),
                       (-0.215,1.225,0.031,0.027),(-0.245,1.31,0.002,0.003)]),
        ('Front-Spike',[(0.125,0.93,0.115,0.115),(0.15,1.075,0.070,0.065),
                        (0.12,1.215,0.026,0.025),(0.095,1.29,0.002,0.003)])]:
        parts.append(liquid_stroke(name,controls))
    # Lay the forward curl against the forehead, retaining only a shallow notch.
    for part in parts:
        for vertex in part.data.vertices:
            forward = max(0.0, min(1.0, (vertex.co.y + 0.04) / 0.40))
            vertex.co.y -= 0.075 * forward + 0.025 * forward**4
            vertex.co.z -= 0.155 * forward
        part.data.update()
    return parts


def fuse_sculpt():
    collection = bpy.data.collections['Goop Character']
    parts = [obj for obj in collection.objects if obj.type == 'MESH']
    body = bpy.data.objects['Goop-Body']
    activate(body)
    for obj in parts:
        obj.select_set(True)
    bpy.ops.object.join()
    remesh = body.modifiers.new('Continuous Gel Surface', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = 0.008
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth = body.modifiers.new('Surface Relaxation', 'SMOOTH')
    smooth.factor = 0.65
    smooth.iterations = 20
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    # Relax only the spike junctions; keep the narrow ridge and pointed tips.
    roots = body.vertex_groups.new(name='Spike Root Blending')
    junctions = [(-0.43,0.21),(-0.38,0.39),(-0.30,0.57),
                 (-0.28,0.71),(-0.075,0.86),(0.10,0.86)]
    for vertex in body.data.vertices:
        x,y,z = vertex.co
        weight = max(math.exp(-((y-ry)/0.105)**2-((z-SOLE-rz)/0.105)**2)
                     for ry,rz in junctions)
        if abs(x) < 0.14 and weight > 0.03:
            roots.add([vertex.index],weight,'REPLACE')
    blend = body.modifiers.new('Soft Spike Junctions','SMOOTH')
    blend.vertex_group = roots.name
    blend.factor = 0.55
    blend.iterations = 10
    bpy.ops.object.modifier_apply(modifier=blend.name)
    body.vertex_groups.remove(body.vertex_groups['Spike Root Blending'])
    # Bake a lighter editable mesh; regeneration retains the construction recipe.
    decimate = body.modifiers.new('Asset Density', 'DECIMATE')
    decimate.ratio = 0.14
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    # Remove small decimation creases across the body and skirt transition.
    finish_group = body.vertex_groups.new(name='Body Finish')
    for vertex in body.data.vertices:
        height = vertex.co.z - SOLE
        if 0.08 < height < 0.72:
            weight = math.sin(math.pi*(height-0.08)/0.64)
            weight *= min(1,abs(vertex.co.x)/0.14 + max(0,vertex.co.y)/0.15)
            finish_group.add([vertex.index],weight,'REPLACE')
    finish = body.modifiers.new('Polished Body Surface','SMOOTH')
    finish.vertex_group = finish_group.name
    finish.factor = 0.35
    finish.iterations = 4
    bpy.ops.object.modifier_apply(modifier=finish.name)
    body.vertex_groups.remove(body.vertex_groups['Body Finish'])
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    # Keep the sole exactly at the established asset contact plane.
    minimum = min(vertex.co.z for vertex in body.data.vertices)
    for vertex in body.data.vertices:
        vertex.co.z += SOLE - minimum
    body.data.update()
    body['surface'] = 'Single continuous body, melted skirt and swept spiky crest'
    return body


def build_eyes():
    collection = bpy.data.collections['Goop Character']
    body = bpy.data.objects['Goop-Body']
    bpy.context.view_layer.update()
    # Three cubic boundary arcs: slanted upper lid, rounded cheek, inner point.
    arcs = [((-0.370,0.495),(-0.300,0.442),(-0.182,0.344),(-0.075,0.310)),
            ((-0.075,0.310),(-0.102,0.174),(-0.193,0.128),(-0.268,0.153)),
            ((-0.268,0.153),(-0.363,0.179),(-0.389,0.317),(-0.370,0.495))]
    boundary = []
    for a,b,c,d in arcs:
        for step in range(24):
            t = step/24
            boundary.append(tuple((1-t)**3*a[k] + 3*(1-t)**2*t*b[k] + 3*(1-t)*t*t*c[k] + t**3*d[k] for k in range(2)))
    n = len(boundary)
    eyes = []
    for side, sign in [('Left',1),('Right',-1)]:
        centre = (-0.238*sign, 0.302)
        def seat(x,z,r):
            hit, position, normal, polygon = body.ray_cast(Vector((x,3,SOLE+z)), Vector((0,-1,0)))
            if not hit:
                raise ValueError('Eye seat missed the sculpt')
            return (x, position.y - 0.0015 + 0.018*(1-r*r), SOLE+z)
        vertices = [seat(centre[0],centre[1],0)]
        faces = []
        rings = 12
        for ring in range(1,rings+1):
            radius = ring/rings
            for x,z in boundary:
                vertices.append(seat(centre[0] + radius*(x*sign-centre[0]), centre[1]+radius*(z-centre[1]), radius))
        for segment in range(n):
            nxt = (segment+1)%n
            faces.append((0,1+segment,1+nxt))
            for ring in range(rings-1):
                a,b = 1+ring*n+segment, 1+ring*n+nxt
                faces.append((a,b,b+n,a+n))
        # A full conforming rear shell stays buried, including the curved cheeks.
        # The front perimeter is slightly embedded so no raised black rim shows.
        front_count = len(vertices)
        front_faces = list(faces)
        for x,y,z in list(vertices):
            hit,position,normal,polygon = body.ray_cast(Vector((x,3,z)),Vector((0,-1,0)))
            if not hit:
                raise ValueError('Eye rear shell missed the sculpt')
            vertices.append((x,position.y-0.015,z))
        faces.extend(tuple(front_count+i for i in reversed(face)) for face in front_faces)
        outer = 1+(rings-1)*n
        for segment in range(n):
            a,b = outer+segment,outer+(segment+1)%n
            faces.append((a,a+front_count,b+front_count,b))
        eye = mesh_object('Goop-Eye-'+side, vertices, faces, collection)
        activate(eye)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        eye.parent = bpy.data.objects['Goop']
        eyes.append(eye)
    return eyes


def material(name, colour, roughness, coat=0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*colour,1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*colour,1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = 0.09
    return mat,bsdf


def lookdev():
    gel,bsdf = material('Goop-Acid-Gel', (0.045,0.60,0.001), 0.26, 0.25)
    bsdf.inputs['IOR'].default_value = 1.38
    bsdf.inputs['Coat Roughness'].default_value = 0.18
    bsdf.inputs['Transmission Weight'].default_value = 0.06
    bsdf.inputs['Subsurface Weight'].default_value = 0.0
    bsdf.inputs['Subsurface Radius'].default_value = (0.07,0.15,0.025)
    eyes,eye_bsdf = material('Goop-Obsidian-Eyes', (0.002,0.0025,0.0015), 0.23, 0.18)
    eye_bsdf.inputs['Coat Roughness'].default_value = 0.16
    for obj in bpy.data.collections['Goop Character'].objects:
        if obj.type == 'MESH':
            obj.data.materials.clear()
            obj.data.materials.append(eyes if 'Eye' in obj.name else gel)


def point_at(obj,target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def studio():
    scene = bpy.context.scene
    collection = bpy.data.collections['Goop Studio Rig']
    mat,bsdf = material('Goop-Studio-Slate', (0.23,0.26,0.29), 0.67)
    ground = mesh_object('Goop-Studio-Ground',[(-200,-200,SOLE-0.005),(200,-200,SOLE-0.005),(200,200,SOLE-0.005),(-200,200,SOLE-0.005)],[(0,1,2,3)],collection)
    ground.data.materials.append(mat)
    for name,position,power,size,colour in [
        ('Goop-Key-Softbox',(-2.6,3.1,4.4),650,3.0,(0.91,0.96,1)),
        ('Goop-Rim-Softbox',(2.5,-2.1,3.0),850,2.5,(0.87,1.0,0.79)),
        ('Goop-Fill-Strip',(3.2,3.0,1.3),180,2.0,(0.78,0.87,1)),
    ]:
        data = bpy.data.lights.new(name,'AREA')
        data.energy = power
        data.shape = 'DISK'
        data.size = size
        data.color = colour
        lamp = bpy.data.objects.new(name,data)
        collection.objects.link(lamp)
        lamp.location = position
        point_at(lamp,(0,0,0.1))
    world = bpy.data.worlds.new('Goop-Studio-World')
    world.use_nodes = True
    world.node_tree.nodes.get('Background').inputs['Color'].default_value = (0.30,0.35,0.42,1)
    world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 0.35
    scene.world = world
    data = bpy.data.cameras.new('Goop-Inspection-Camera')
    camera = bpy.data.objects.new('Goop-Inspection-Camera',data)
    collection.objects.link(camera)
    scene.camera = camera
    data.type = 'ORTHO'
    data.ortho_scale = 2.65
    camera.location = (2.3,4.2,1.65)
    point_at(camera,(0,0,0.17))
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Very High Contrast'
    scene.view_settings.exposure = -0.8
    return camera


def frame_view(direction=(2.3,4.2,1.65), distance=2.7, shading='MATERIAL'):
    if bpy.app.background:
        return
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.overlay.show_overlays = False
            space.show_region_ui = False
            space.shading.type = shading
            space.shading.studio_light = 'studio.exr'
            space.shading.studiolight_rotate_z = 0.5
            space.shading.studiolight_background_alpha = 1
            space.shading.studiolight_background_blur = 1
            space.shading.use_scene_world = False
            space.shading.use_scene_lights = False
            target = Vector((0,0,0.17))
            rotation = (target-Vector(direction)).to_track_quat('-Z','Y')
            space.region_3d.view_rotation = rotation
            space.region_3d.view_location = target
            space.region_3d.view_distance = distance
            space.region_3d.view_perspective = 'ORTHO'
            space.region_3d.update()
            area.tag_redraw()


def build_all():
    create_scene()
    build_body()
    build_crest()
    fuse_sculpt()
    build_eyes()
    lookdev()
    studio()
    frame_view()
    activate(bpy.data.objects['Goop-Body'])
