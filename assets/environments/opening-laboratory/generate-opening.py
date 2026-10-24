"""Original Blender set for the live opening. Metres, game Y-up / forward -Z.

Interactive stages: setup(), build_corridor(), build_bays(), preview(),
export_asset(), save_source(). Only the OI_ studio objects are owned.
The runtime borrows Room 1's finishes; this GLB contains geometry only.
"""
import bpy
import bmesh
import math
from mathutils import Vector

HERE = __file__[:max(__file__.rfind('/'), __file__.rfind('\\'))]
PREFIX = 'OI_'
SCENE_NAME = 'Opening Containment Wing'
BAYS = ((-1, 60, 'Pluto'), (1, 47, 'Mimic'), (-1, 34, 'Goop'), (1, 21, 'Volt'))
FINISHES = {'Ivory': ((.88,.86,.79),.5,0), 'Cool': ((.43,.53,.55),.5,0),
            'Resin': ((.43,.50,.51),.6,0), 'Graphite': ((.028,.043,.052),.65,.25),
            'Alloy': ((.28,.35,.37),.37,.7), 'Light': ((.76,.86,.88),.4,0),
            'Screen': ((.055,.23,.25),.5,0), 'Amber': ((.52,.28,.06),.5,.12)}


def xyz(p):
    return (p[0], -p[2], p[1])


def setup():
    scene = bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
    bpy.context.window.scene = scene
    for obj in list(scene.objects):
        if obj.name.startswith(PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)
    for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(blocks):
            if block.name.startswith(PREFIX) and block.users == 0:
                blocks.remove(block)
    scene.unit_settings.system = 'METRIC'
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.get(PREFIX+'World') or bpy.data.worlds.new(PREFIX+'World')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.12,.17,.21,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .3
    root = bpy.data.objects.new(PREFIX+'Architecture', None)
    root['asset'] = 'opening-laboratory-v1'
    root['coordinates'] = 'Local corridor X; game adds doorwayX=4.3. Y=0 floor, Z=6.2..80.2.'
    scene.collection.objects.link(root)
    for name, (tint, rough, metal) in FINISHES.items():
        mat = bpy.data.materials.new(PREFIX+name)
        mat.diffuse_color = (*tint,1)
        mat.use_nodes = True
        mat.use_backface_culling = True
        p = mat.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*tint,1)
        p.inputs['Roughness'].default_value = rough
        p.inputs['Metallic'].default_value = metal
        if name in {'Light','Screen'}:
            p.inputs['Emission Color'].default_value = (*tint,1)
            p.inputs['Emission Strength'].default_value = 1
    print('Opening studio ready; other scenes retained.')


def mesh(name, vertices, faces, finish, bevel=0, facing=None):
    data = bpy.data.meshes.new(PREFIX+name)
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
    uv = data.uv_layers.new(name='UVMap')
    for polygon in data.polygons:
        nx,ny,nz = [abs(v) for v in polygon.normal]
        axis = 0 if nx >= ny and nx >= nz else 1 if ny >= nz else 2
        for index in polygon.loop_indices:
            p = data.vertices[data.loops[index].vertex_index].co
            a,b = ((p.y,p.z) if axis == 0 else (p.x,p.z) if axis == 1 else (p.x,p.y))
            uv.data[index].uv = (a/2,b/2)
    obj = bpy.data.objects.new(PREFIX+name,data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(bpy.data.materials[PREFIX+finish])
    obj.parent = bpy.data.objects[PREFIX+'Architecture']
    obj['visualOnly'] = True
    return obj


def box(name, size, position, finish, bevel=.025):
    x,y,z = position
    a,b,c = [v/2 for v in size]
    v = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
         (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    return mesh(name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],finish,bevel)


def tube(name, a, b, radius, finish, sides=12):
    delta = Vector(b)-Vector(a)
    direction = delta.normalized()
    right = direction.cross(Vector((0,1,0)))
    if right.length < .01:
        right = direction.cross(Vector((1,0,0)))
    right.normalize()
    up = right.cross(direction).normalized()
    vertices = []
    for centre in (Vector(a),Vector(b)):
        for i in range(sides):
            angle = math.tau*i/sides
            vertices.append(tuple(centre+right*(math.cos(angle)*radius)+up*(math.sin(angle)*radius)))
    faces = [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    faces += [tuple(reversed(range(sides))),tuple(range(sides,sides*2))]
    return mesh(name,vertices,faces,finish)


def build_corridor():
    # Separate inlaid surfaces meet at Y=0; no decals sitting on another floor.
    box('Recessed joint backing',(6.8,.08,74),(0,-.08,43.2),'Graphite',0)
    for i in range(13):
        lo = 6.2+i*74/13
        hi = 6.2+(i+1)*74/13
        z = (lo+hi)/2
        for side in (-1,1):
            box('Side walkway '+str(i)+' '+str(side),(2.13,.18,hi-lo-.018),
                (side*2.335,-.09,z),'Ivory',.009)
            box('Guide channel '+str(i)+' '+str(side),(.12,.17,hi-lo-.018),
                (side*1.2,-.095,z),'Graphite',.008)
            box('Recessed floor guide '+str(i)+' '+str(side),(.025,.015,hi-lo-.28),
                (side*1.2,-.0075,z),'Screen',.004)
        box('Central runner '+str(i),(2.26,.18,hi-lo-.018),(0,-.09,z),'Resin',.009)
    # A lower dark plinth and a narrower upper wall produce a deliberate section.
    for side in (-1,1):
        box('Service plinth '+str(side),(.21,.48,74),(side*3.34,.24,43.2),'Graphite',.02)
        box('Upper wall '+str(side),(.22,.7,74),(side*3.4,4.25,43.2),'Cool',.02)
        # Segmented structural spans have real expansion joints; chamber frames
        # replace wall area rather than sitting through a second wall surface.
        openings = sorted([z for s,z,n in BAYS if s == side])
        start = 6.2
        for end in [value-2.1 for value in openings]+[80.2]:
            length = end-start
            if length > 0:
                count = math.ceil(length/4.5)
                for j in range(count):
                    lo,hi = start+j*length/count,start+(j+1)*length/count
                    box('Wall field '+str(side)+' '+str(round(lo,2)),(.16,3.38,hi-lo-.018),
                        (side*3.42,2.18,(lo+hi)/2),'Ivory',.016)
                    # Short inspection strips and flush service doors break the
                    # repeated rhythm without turning every panel into machinery.
                    if j % 3 == 1 and hi-lo > 2:
                        box('Inset service hatch '+str(side)+' '+str(j)+' '+str(end),
                            (.04,1.24,.84),(side*3.31,1.51,(lo+hi)/2),'Cool',.025)
                        box('Hatch pull '+str(side)+' '+str(j)+' '+str(end),
                            (.045,.24,.035),(side*3.274,1.52,(lo+hi)/2+.29),'Alloy',.006)
            if end != 80.2:
                start = end+4.2
        box('High service rail '+str(side),(.09,.11,73.5),(side*2.95,4.38,43.2),'Alloy',.02)
    box('Rear bulkhead',(6.8,4.7,.18),(0,2.35,80.29),'Cool')
    box('Ceiling',(6.8,.18,74),(0,4.79,43.2),'Graphite')
    # An asymmetric service spine, distinct from the repeated chamber bays.
    # Terminate before Bob's final bay so the rising approach rays to his
    # directory never cross a low service pipe.
    box('Overhead service spine',(.7,.26,64),(1.5,4.51,47),'Cool')
    for x,radius,finish in ((1.17,.055,'Alloy'),(1.5,.07,'Graphite'),(1.83,.04,'Alloy')):
        tube('Supply line '+str(x),(x,4.26,15),(x,4.26,79),radius,finish)
    for index,z in enumerate(range(11,79,6)):
        box('Overhead rib '+str(index),(6.5,.12,.16),(0,4.59,z),'Alloy',.018)
        box('Fixture recess '+str(index),(1.92,.075,.52),(-.65,4.6,z+2.3),'Graphite',.018)
        box('Ceiling diffuser '+str(index),(1.68,.018,.34),(-.65,4.553,z+2.3),'Light',.009)
        for x in (-1.55,.25):
            box('Fixture endcap '+str(index)+' '+str(x),(.09,.09,.5),(x,4.55,z+2.3),'Cool',.015)
    print('Corridor shell, runner and overhead service spine built.')


def bay_box(name, side, z, size, at, finish, bevel=.02):
    # Local bay X runs along the wall; local Z points into the corridor.
    a,b,c = size
    u,y,depth = at
    return box(name,(c,b,a),(side*(3.4-depth),y,z+side*u),finish,bevel)


def build_bays():
    for index,(side,z,name) in enumerate(BAYS):
        def part(label,size,at,finish,bevel=.02):
            return bay_box(name+' '+label,side,z,size,at,finish,bevel)
        part('deep chamber bulkhead',(4.2,3.4,.16),(0,2.18,-.1),'Graphite')
        for edge in (-1,1):
            part('outer pillar '+str(edge),(.36,3.42,.26),(edge*1.9,2.18,.02),'Cool',.055)
            part('door jamb '+str(edge),(.14,2.72,.22),(edge*1.4,1.77,.17),'Alloy',.025)
            part('shoulder '+str(edge),(.3,.36,.25),(edge*1.9,3.7,.02),'Graphite',.04)
            part('vertical marker '+str(edge),(.035,.96,.018),(edge*1.895,2.07,.157),'Light',.005)
            part('door leaf '+str(edge),(1.31,2.66,.11),(edge*.672,1.77,.12),'Cool',.04)
            part('armour inlay '+str(edge),(.99,1.5,.025),(edge*.672,1.54,.188),'Ivory',.045)
            part('inspection inset '+str(edge),(.96,.26,.035),(edge*.672,2.39,.198),'Graphite',.04)
            part('inspection glass '+str(edge),(.78,.13,.012),(edge*.672,2.39,.222),'Screen',.02)
            part('bottom lock '+str(edge),(.26,.13,.055),(edge*1.1,.6,.21),'Alloy',.018)
        part('upper lintel',(4.1,.23,.2),(0,3.8,.025),'Ivory',.035)
        part('door lintel',(2.92,.14,.2),(0,2.82,.14),'Alloy',.018)
        # Existing 2.85 x .7125 plaque at X=+/-3.04 Y=3.2 is immediately
        # in front of this backing; no bars or lips cross the lettering.
        part('directory backing',(3.08,.88,.095),(0,3.2,.2475),'Graphite',.03)
        part('upper directory bezel',(3.14,.045,.04),(0,3.67,.27),'Alloy',.009)
        part('threshold',(2.92,.08,.42),(0,.04,.15),'Graphite',.015)
        part('threshold light',(2.6,.016,.022),(0,.082,.32),'Light',.004)
        part('seal',( .025,2.6,.04),(0,1.77,.19),'Graphite',.006)
        # Per-experiment hardware gives each stop a recognisable silhouette.
        if name == 'Pluto':
            part('rounded pressure canister',(.36,.8,.2),(-1.9,1.1,.21),'Alloy',.09)
            part('pressure sight strip',(.09,.42,.018),(-1.9,1.1,.32),'Screen',.02)
        elif name == 'Mimic':
            for y in (1.05,1.75):
                part('secondary lock '+str(y),(.35,.14,.18),(-1.85,y,.21),'Graphite',.025)
                part('lock pin '+str(y),(.12,.07,.025),(-1.85,y,.315),'Amber',.01)
        elif name == 'Goop':
            for u in (-1.9,1.9):
                part('filtered intake '+str(u),(.24,.52,.12),(u,1.12,.21),'Graphite',.02)
                for y in (.94,1.06,1.18,1.3):
                    part('intake louvre '+str(u)+' '+str(y),(.2,.018,.035),(u,y,.285),'Alloy',.005)
        else:
            for y in (.95,1.35,1.75):
                part('insulated power lock '+str(y),(.24,.15,.16),(1.9,y,.21),'Graphite',.035)
                part('power lock band '+str(y),(.24,.038,.17),(1.9,y,.215),'Amber',.007)
        # Wall-mounted surveillance arm, matching the retained moving gimbal.
        u = -1.85
        part('camera wall plate',(.3,.48,.12),(u,3.9,.08),'Alloy',.02)
        part('camera arm',(.14,.12,.62),(u,3.97,.28),'Alloy',.02)
    print('Four distinct sealed chambers, recessed directories and surveillance mounts built.')


def build_camera():
    # A separate reusable prefab, not geometry repeated inside the static set.
    # Forward is local +Z, matching the existing pan/tilt joints in the game.
    camera = bpy.data.objects.new(PREFIX+'Surveillance',None)
    camera['asset'] = 'opening-surveillance-v1'
    bpy.context.scene.collection.objects.link(camera)
    before = set(bpy.context.scene.objects)
    mesh('Camera tapered housing',
         [(-.235,-.13,-.21),(.235,-.13,-.21),(.235,.13,-.21),(-.235,.13,-.21),
          (-.205,-.105,.34),(.205,-.105,.34),(.205,.105,.34),(-.205,.105,.34)],
         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],'Ivory',.024)
    box('Camera floating sunshade',(.55,.038,.78),(0,.164,.15),'Ivory',.016)
    for side in (-1,1):
        box('Camera shade flange '+str(side),(.03,.1,.72),(side*.26,.12,.16),'Ivory',.009)
        box('Camera cooling panel '+str(side),(.018,.19,.3),(side*.236,-.005,-.025),'Graphite',.009)
        for z in (-.13,-.065,0,.065):
            box('Camera heat rib '+str(side)+' '+str(z),(.026,.15,.014),(side*.245,-.005,z),'Alloy',.004)
        tube('Camera tilt hinge '+str(side),(side*.23,0,-.04),(side*.3,0,-.04),.074,'Alloy',16)
    box('Camera yoke base',(.52,.055,.2),(0,.2,-.04),'Graphite',.018)
    for side in (-1,1):
        box('Camera yoke arm '+str(side),(.048,.18,.18),(side*.285,.1,-.04),'Graphite',.015)
    tube('Camera pan bearing',(0,.23,-.04),(0,.29,-.04),.11,'Alloy',20)
    box('Camera front gasket',(.415,.224,.024),(0,0,.35),'Graphite',.018)
    tube('Camera machined lens mount',(0,0,.358),(0,0,.415),.096,'Alloy',24)
    tube('Camera focus barrel',(0,0,.415),(0,0,.52),.078,'Graphite',24)
    for z in (.435,.47,.505):
        tube('Camera focus ring '+str(z),(0,0,z),(0,0,z+.014),.083,'Alloy',24)
    tube('Camera optical bezel',(0,0,.52),(0,0,.543),.07,'Graphite',24)
    tube('Camera optical glass',(0,0,.543),(0,0,.548),.053,'Screen',24)
    tube('Camera lens reflection',(-.015,.019,.548),(-.015,.019,.55),.012,'Light',12)
    for x in (-.17,.17):
        for y in (-.078,.078):
            tube('Camera face screw '+str(x)+' '+str(y),(x,y,.362),(x,y,.369),.012,'Alloy',8)
    for obj in set(bpy.context.scene.objects)-before:
        if obj.type == 'MESH':
            obj.parent = camera
    # Four material batches: the small glass reflection uses the same Screen
    # finish to avoid another draw. Recording LED remains animated by the game.
    bpy.data.objects[PREFIX+'Camera lens reflection'].data.materials[0] = bpy.data.materials[PREFIX+'Screen']
    print('Custom camera: tapered body, sunshade, cooling fins, yoke, machined lens and optic.')


def preview():
    scene = bpy.context.scene
    for z in (15,34,53,72):
        data = bpy.data.lights.new(PREFIX+'Preview softbox '+str(z),'AREA')
        data.energy,data.shape,data.size,data.size_y = 950,'RECTANGLE',3,5
        obj = bpy.data.objects.new(data.name,data)
        scene.collection.objects.link(obj)
        obj.location = xyz((-.4,4.45,z))
    data = bpy.data.cameras.new(PREFIX+'Dolly camera')
    camera = bpy.data.objects.new(data.name,data)
    scene.collection.objects.link(camera)
    camera.location = xyz((0,2.5,72))
    camera.rotation_euler = (Vector(xyz((-.7,2.3,57)))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.lens = 26
    scene.camera = camera
    scene.render.resolution_x,scene.render.resolution_y = 1280,720
    scene.render.resolution_percentage = 100
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    # The reusable camera is previewed on its existing first-bay mount.
    prefab = bpy.data.objects[PREFIX+'Surveillance']
    prefab.location = xyz((-2.74,3.73,61.85))
    prefab.rotation_euler[2] = math.pi/2
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.camera = camera
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.region_3d.view_camera_zoom = 0
            area.spaces.active.shading.type = 'MATERIAL'
            area.spaces.active.overlay.show_overlays = False


def export_asset():
    scene = bpy.context.scene
    root = bpy.data.objects[PREFIX+'Architecture']
    selected,active = list(bpy.context.selected_objects),bpy.context.view_layer.objects.active
    root.name = PREFIX+'Editable architecture'
    runtime = bpy.data.objects.new(PREFIX+'Architecture',None)
    runtime['asset'] = 'opening-laboratory-v1'
    scene.collection.objects.link(runtime)
    copies = []
    prefab = bpy.data.objects[PREFIX+'Surveillance']
    camera_root = bpy.data.objects.new(PREFIX+'Camera',None)
    camera_root['asset'] = 'opening-surveillance-v1'
    scene.collection.objects.link(camera_root)
    try:
        groups = {}
        for source in list(root.children)+list(prefab.children):
            obj = source.copy()
            obj.data = source.data.copy()
            scene.collection.objects.link(obj)
            obj.parent = camera_root if source.parent == prefab else runtime
            copies.append(obj.data)
            groups.setdefault((obj.parent.name,obj.data.materials[0].name),[]).append(obj)
        for (parent,name),objects in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            if len(objects) > 1:
                bpy.ops.object.join()
            obj = bpy.context.view_layer.objects.active
            obj.name = PREFIX+('Camera_' if parent == camera_root.name else 'Shell_')+name.removeprefix(PREFIX)
            copies.append(obj.data)
        bpy.ops.object.select_all(action='DESELECT')
        runtime.select_set(True)
        for obj in runtime.children:
            obj.select_set(True)
        camera_root.select_set(True)
        for obj in camera_root.children:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = runtime
        bpy.ops.export_scene.gltf(filepath=HERE+'/opening-laboratory.glb',export_format='GLB',
            use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,
            export_cameras=False,export_lights=False,export_animations=False,export_materials='PLACEHOLDER')
    finally:
        for obj in list(runtime.children)+list(camera_root.children):
            bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.objects.remove(runtime,do_unlink=True)
        bpy.data.objects.remove(camera_root,do_unlink=True)
        for data in set(copies):
            if data.users == 0:
                bpy.data.meshes.remove(data)
        root.name = PREFIX+'Architecture'
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active
    print('Exported geometry in shared-finish batches; no textures, lights or cameras.')


def save_source():
    bpy.ops.wm.save_as_mainfile(filepath=HERE+'/opening-laboratory.blend',copy=True)


def main():
    setup()
    build_corridor()
    build_bays()
    build_camera()
    preview()
    export_asset()
    save_source()


if __name__ == '__main__':
    main()
