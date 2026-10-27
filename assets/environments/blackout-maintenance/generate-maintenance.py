"""Blackout's flooded electrical workshop. Geometry only; metres/Y-up in game.

Stages are callable independently in the native Blender studio. The protected
bay, entry chute, circuit socket and stepping heights remain runtime-owned.
Inset decks reuse Containment Room 2's five-band/corner-marker construction.
"""
import bpy
import bmesh
import math
from mathutils import Vector, Matrix

HERE = __file__[:max(__file__.rfind('/'), __file__.rfind('\\'))]
PREFIX = 'B3_R1_'
SCENE = 'Blackout / Maintenance Bay'
PALETTE = {
    'Paint': ((.37, .40, .38), .91, .10),
    'Deck': ((.29, .34, .33), .87, .30),
    'Steel': ((.17, .22, .22), .69, .64),
    'Dark': ((.035, .052, .055), .89, .30),
    'Amber': ((.65, .39, .075), .86, .15),
    'Copper': ((.36, .21, .085), .76, .60),
    'Lamp': ((.85, .64, .31), .45, .0),
    'Letter': ((.65, .73, .69), .91, .0),
    'Damp': ((.19,.23,.21),.28,.12),
    'ColdLamp': ((.30,.52,.55),.5,0),
}


def xyz(v):
    return (v[0], -v[2], v[1])


def setup():
    scene = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene
    for obj in list(scene.objects):
        if obj.name.startswith(PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.lights, bpy.data.cameras):
        for data in list(blocks):
            if data.name.startswith(PREFIX) and not data.users:
                blocks.remove(data)
    scene.unit_settings.system = 'METRIC'
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.get(PREFIX+'World') or bpy.data.worlds.new(PREFIX+'World')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.09, .13, .15, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .4
    scene.world = world
    root = bpy.data.objects.new(PREFIX+'Architecture', None)
    root['asset'] = 'blackout-maintenance-v1'
    root['gameplay'] = 'Visual only; existing collision, acid, drone and circuit remain authoritative.'
    scene.collection.objects.link(root)
    for name, (tint, rough, metal) in PALETTE.items():
        material = bpy.data.materials.new(PREFIX+name)
        material.diffuse_color = (*tint, 1)
        material.use_nodes = True
        material.use_backface_culling = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*tint, 1)
        shader.inputs['Roughness'].default_value = rough
        shader.inputs['Metallic'].default_value = metal
        vertex = material.node_tree.nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = 'wear'
        multiply = material.node_tree.nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[1].default_value = (*tint, 1)
        material.node_tree.links.new(vertex.outputs['Color'], multiply.inputs[2])
        material.node_tree.links.new(multiply.outputs[0], shader.inputs['Base Color'])
        if name == 'Lamp':
            shader.inputs['Emission Color'].default_value = (*tint, 1)
            shader.inputs['Emission Strength'].default_value = .8
        if name=='ColdLamp':
            shader.inputs['Emission Color'].default_value=(*tint,1)
            shader.inputs['Emission Strength'].default_value=.06
    print('Maintenance studio ready; other scenes retained.')


def mesh(name, vertices, faces, finish, region='Shell', bevel=0):
    data = bpy.data.meshes.new(PREFIX+name)
    data.from_pydata([xyz(p) for p in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
    if all(edge.is_manifold for edge in bm.edges):
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bevel:
        bmesh.ops.bevel(bm, geom=[edge for edge in bm.edges if edge.is_manifold],
                        offset=bevel, segments=1, affect='EDGES', clamp_overlap=True)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    uv = data.uv_layers.new(name='MetricUV')
    wear = data.color_attributes.new(name='wear', type='FLOAT_COLOR', domain='POINT')
    for vertex in data.vertices:
        x, y, z = vertex.co.x, vertex.co.z, -vertex.co.y
        cloud = .5+.5*math.sin(x*.73+z*.39+math.sin(y*1.2+z*.19))
        wet = max(0, 1-abs(y+.4)/1.7)
        shade = .82+.18*cloud
        wear.data[vertex.index].color = (shade*(1-.24*wet), shade*(1-.13*wet), shade*(1-.28*wet), 1)
    for polygon in data.polygons:
        components = [abs(value) for value in polygon.normal]
        axis = components.index(max(components))
        for i in polygon.loop_indices:
            p = data.vertices[data.loops[i].vertex_index].co
            a, b = (p.y, p.z) if axis == 0 else (p.x, p.z) if axis == 1 else (p.x, p.y)
            uv.data[i].uv = (a/2, b/2)
    data.materials.append(bpy.data.materials[PREFIX+finish])
    obj = bpy.data.objects.new(PREFIX+name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = bpy.data.objects[PREFIX+'Architecture']
    obj['finish'] = finish
    obj['region'] = region
    obj['visualOnly'] = True
    return obj


def box(name, size, at, finish='Steel', region='Shell', bevel=0):
    x, y, z = at
    a, b, c = [v/2 for v in size]
    return mesh(name, [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                       (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)],
                [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],
                finish, region, min(bevel, min(size)*.18))


def quad(name, vertices, finish, normal, region='Shell'):
    vv = [Vector(p) for p in vertices]
    if (vv[1]-vv[0]).cross(vv[2]-vv[0]).dot(Vector(normal)) < 0:
        vertices = list(reversed(vertices))
    return mesh(name, vertices, [(0,1,2,3)], finish, region)


def deck(name, x, top, z, width, depth, region):
    # Exact Containment Room 2 inset deck recipe, fitted to fixed basin plinths.
    gx = [-width/2,-width/2+.13,-width/2+.23,width/2-.23,width/2-.13,width/2]
    gz = [-depth/2,-depth/2+.13,-depth/2+.23,depth/2-.23,depth/2-.13,depth/2]
    for i in range(5):
        for j in range(5):
            finish = 'Amber' if i in (1,3) and j in (1,3) else 'Steel' if i in (0,4) or j in (0,4) else 'Deck'
            quad(name+f'_inset_{i}_{j}', [(x+gx[i],top,z+gz[j]),(x+gx[i+1],top,z+gz[j]),
                 (x+gx[i+1],top,z+gz[j+1]),(x+gx[i],top,z+gz[j+1])], finish, (0,1,0), region)
    mesh(name+'_edge', [(x-width/2,top,z-depth/2),(x+width/2,top,z-depth/2),
         (x+width/2,top,z+depth/2),(x-width/2,top,z+depth/2),
         (x-width/2,top-.16,z-depth/2),(x+width/2,top-.16,z-depth/2),
         (x+width/2,top-.16,z+depth/2),(x-width/2,top-.16,z+depth/2)],
         [(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)], 'Steel', region)
    box(name+'_foundation', (width-.12,top+.89,depth-.12), (x,(top-.16-1.05)/2,z), 'Dark', region)


def ring_x(name, x, y, z, inner, outer, depth, finish, region):
    vertices = []
    sides = 24
    for at, radius in [(x-depth/2,outer),(x+depth/2,outer),(x-depth/2,inner),(x+depth/2,inner)]:
        vertices.extend((at,y+radius*math.sin(math.tau*i/sides),z+radius*math.cos(math.tau*i/sides)) for i in range(sides))
    faces = []
    for i in range(sides):
        j = (i+1)%sides
        faces.extend([(i,j,j+sides,i+sides),(i+2*sides,i+3*sides,j+3*sides,j+2*sides),
                      (i,i+2*sides,j+2*sides,j),(i+sides,j+sides,j+3*sides,i+3*sides)])
    return mesh(name, vertices, faces, finish, region)


def portal(name, x, z, width, height, base=0, region='Exit'):
    for side in [-1,1]:
        box(name+'_jamb_'+str(side), (.22,height,.46), (x+side*(width/2+.11),base+height/2,z), 'Steel', region, .035)
    box(name+'_header', (width+.44,.28,.46), (x,base+height+.14,z), 'Steel', region, .035)
    # A backed rectangular lintel, with real separation from the label/lamps.
    box(name+'_lintel', (width-.12,.48,.16), (x,base+height+.57,z+.08), 'Dark', region)
    for side in [-1,1]:
        box(name+'_marker_'+str(side), (.10,.30,.025), (x+side*(width/2-.12),base+height+.57,z-.015), 'Lamp', region)


def build_shell():
    # Continuous dark backings close every partition seam. Front sheets are
    # deliberately separated by deep structural bands, never coplanar layers.
    for side in [-1,1]:
        region = 'West' if side < 0 else 'East'
        box(region+'_backing', (.20,14.3,55.55), (side*16.95,5.1,26), 'Dark', region)
        box(region+'_waterline', (.18,2.05,55.55), (side*16.69,-.975,26), 'Steel', region)
        for y, height in [(1.14,.22),(8.94,.28),(11.74,.52)]:
            box(region+'_rail_'+str(y), (.25,height,55.55), (side*16.725,y,26), 'Dark', region)
        zs = [-1.775,4.2,10.2,16.2,22.2,28.2,34.2,40.2,46.2,53.775]
        for i, (a,b) in enumerate(zip(zs,zs[1:])):
            for low, high in [(1.25,4.88),(4.98,8.80),(9.10,11.47)]:
                # Pump cassettes occupy two full bays, keeping enclosure behind.
                if (side < 0 and 10.2 <= a < 22.2 or side > 0 and 28.2 <= a < 40.2) and high < 8.9:
                    continue
                quad(region+f'_panel_{i}_{low}', [(side*16.6,low,a+.10),(side*16.6,high,a+.10),
                     (side*16.6,high,b-.10),(side*16.6,low,b-.10)], 'Paint' if low<9 else 'Dark', (-side,0,0), region)
            if i:
                # The horizontal band owns the crossing; vertical members
                # terminate at its edges instead of duplicating its face.
                for low,high in [(1.27,8.80),(9.10,11.47)]:
                    box(region+'_pilaster_'+str(i)+'_'+str(low),(.28,high-low,.18),(side*16.74,(low+high)/2,a),'Steel',region)
    # Rear partitions leave both existing apertures fully open.
    for name, a, b in [('West',-16.85,-6.95),('Middle',-5.05,3),('East',9,16.85)]:
        box('Rear_'+name+'_backing', (b-a,12.6,.20), ((a+b)/2,5.85,54.40), 'Dark', 'Exit')
        for low, high in [(-.3,1.14),(1.3,4.88),(5.02,8.8),(9.1,11.95)]:
            quad('Rear_'+name+'_panel_'+str(low), [(a,low,53.775),(b,low,53.775),(b,high,53.775),(a,high,53.775)],
                 'Paint' if 1.2<low<9 else 'Dark',(0,0,-1),'Exit')
    # Retained hallway/vent ceilings own their end caps and side reveals.
    box('Main_portal_upper_wall', (6,7.45,.20), (6,8.575,54.40), 'Dark', 'Exit')
    box('Vent_upper_wall', (1.5,9.78,.20), (-6,7.31,54.40), 'Dark', 'Exit')
    portal('Exit_bulkhead',6,53.43,6,4.5)
    box('Exit_shutter_pocket',(6.5,4.3,.36),(6,7.5,53.5),'Dark','Exit')
    portal('Volt_service',-6,53.48,1.5,2.2)
    # Front wall wraps the existing 3.8 x 3.15 m entry-chute mouth.
    for name, a, b in [('West',-16.85,-2.06),('East',2.06,16.85)]:
        box('Front_'+name+'_backing', (b-a,12.6,.20), ((a+b)/2,5.85,-2.05), 'Dark', 'Entry')
        for low, high in [(-.3,1.14),(1.3,5.5),(5.65,8.8),(9.1,11.95)]:
            quad('Front_'+name+'_panel_'+str(low), [(a,low,-1.775),(b,low,-1.775),(b,high,-1.775),(a,high,-1.775)],
                 'Paint' if 1.2<low<9 else 'Dark',(0,0,1),'Entry')
    # Chute walls/floor/roof seal this return; the shell stops inside their
    # thickness, leaving their visible faces singly owned.
    box('Front_below_chute', (4.12,2.45,.25), (0,.925,-1.9), 'Dark', 'Entry')
    box('Front_above_chute', (4.12,6.9,.25), (0,8.85,-1.9), 'Dark', 'Entry')
    box('Roof_backing', (34,.28,56), (0,12.20,26), 'Dark', 'Roof')
    for i,z in enumerate([3,15,27,39,51]):
        # Connected ceiling cassettes stay above the drone's established range.
        box('Roof_crosshead_'+str(i), (33.2,.32,.42), (0,11.79,z), 'Steel', 'Roof', .035)
        for x in [-10,10]:
            box('Roof_service_tray_'+str(i)+'_'+str(x), (1.6,.24,9.8), (x,11.95,z+5.2), 'Dark', 'Roof')
    print('Manufactured enclosure and both protected exits built.')


def build_decks():
    for name,z0,z1,region in [('Entry',-1.775,9,'Entry'),('Exit',48,53.775,'Exit')]:
        xs = [-16.6,-16,-11,-5.5,0,5.5,11,16,16.6] if name=='Exit' else [-16.6,-16,-11,-5.5,0,2.2,4.8,5.5,11,16,16.6]
        marks = [48.4,52.8] if name=='Exit' else [-1.5,6.3]
        zs = [z0,z0+(z1-z0)/2,z1] if name=='Exit' else [z0,.7,3.3,5.5,z1]
        zs = sorted(set(zs+[v+offset for v in marks for offset in [-.09,.09]]))
        for i,(a,b) in enumerate(zip(xs,xs[1:])):
            for j,(c,d) in enumerate(zip(zs,zs[1:])):
                if name=='Entry' and 2.2<=(a+b)/2<=4.8 and .7<=(c+d)/2<=3.3:continue
                if abs((a+b)/2)<16 and any(abs((c+d)/2-mark)<.09 for mark in marks):continue
                quad(name+f'_floor_{i}_{j}', [(a,0,c),(b,0,c),(b,0,d),(a,0,d)], 'Deck',(0,1,0),region)
        for mark in marks:hazard_floor(name+'_warning_'+str(mark),mark,region)
        # Structural under-apron skin meets the acid; no raised walking lip.
        z = z1 if name=='Entry' else z0
        quad(name+'_basin_apron', [(-16.6,-1.05,z),(16.6,-1.05,z),(16.6,0,z),(-16.6,0,z)],
             'Dark',(0,0,1 if name=='Entry' else -1),region)
    for i,(x,top,z) in enumerate([(-3,.15,17),(1.5,.45,28.5),(-2.5,.15,40)],1):
        deck('Basin_plinth_'+str(i),x,top,z,5,7,'Pad'+str(i))
    # The dock is engraved/inlaid into the original floor, with no raised
    # platform interfering with the parked drone, boarding or recovery anchors.
    for i in [-1,1]:
        box('Dock_side_socket_'+str(i), (.20,.10,2.4), (3.5+i*1.15,-.05,2), 'Steel','Dock')
        box('Dock_retracted_jaw_'+str(i), (.16,.08,.50), (3.5+i*.92,-.04,2), 'Amber','Dock')
    xs=[2.2,2.25,2.45,2.5,2.66,4.34,4.5,4.55,4.75,4.8]
    zs=[.7,.8,1.75,2.25,3.2,3.3]
    for i,(a,b) in enumerate(zip(xs,xs[1:])):
        for j,(c,d) in enumerate(zip(zs,zs[1:])):
            x=(a+b)/2;z=(c+d)/2
            if ((2.25<x<2.45 or 4.55<x<4.75) and .8<z<3.2) or ((2.5<x<2.66 or 4.34<x<4.5) and 1.75<z<2.25):continue
            quad(f'Dock_floor_{i}_{j}',[(a,0,c),(b,0,c),(b,0,d),(a,0,d)],'Dark' if i in (0,8) or j in (0,4) else 'Deck',(0,1,0),'Dock')
    print('Three canonical inset decks and flush drone dock built.')


def clip_diagonal(points,threshold,less):
    result=[]
    for i,a in enumerate(points):
        b=points[(i+1)%len(points)]
        da=a[0]+a[1]-threshold;db=b[0]+b[1]-threshold
        inside_a=da<=0 if less else da>=0
        inside_b=db<=0 if less else db>=0
        if inside_a:result.append(a)
        if inside_a!=inside_b:
            t=da/(da-db);result.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
    return result


def hazard_floor(name,z,region):
    # Coplanar coloured polygons partition the strip; there is no floor below.
    for i in range(-29,30):
        polygon=clip_diagonal([(-16,-.09),(16,-.09),(16,.09),(-16,.09)],i*.58,False)
        if polygon:polygon=clip_diagonal(polygon,(i+1)*.58,True)
        if len(polygon)<3:continue
        vertices=[(x,0,z+local_z) for x,local_z in reversed(polygon)]
        mesh(name+'_'+str(i),vertices,[tuple(range(len(vertices)))],'Amber' if i%2 else 'Dark',region)


def build_machinery():
    for side,z,region in [(-1,16.2,'West'),(1,34.2,'East')]:
        for offset in [-2.8,2.8]:
            at = z+offset
            ring_x(region+'_pump_rim_'+str(offset),side*16.76,4.55,at,1.26,1.62,.26,'Steel',region)
            ring_x(region+'_pump_throat_'+str(offset),side*17.05,4.55,at,.98,1.22,.22,'Copper',region)
            # Grille members end inside the ring, with intentional axial gap.
            for row in range(-3,4):
                y=4.55+row*.30
                length=2*math.sqrt(max(.01,1.22**2-(row*.30)**2))
                box(region+f'_grille_{offset}_{row}',(.10,.075,length),(side*16.67,y,at),'Dark',region)
            box(region+'_cassette_lower_'+str(offset),(.20,.65,4.0),(side*16.76,1.78,at),'Dark',region)
            for j in [-1,1]:
                box(region+f'_pump_indicator_{offset}_{j}',(.035,.10,.45),(side*16.645,2.15,at+j*.68),'Lamp',region)
        for at in [z-5.7,z+5.7]:
            box(region+'_service_separator_'+str(at),(.28,7.55,.14),(side*16.74,5.025,at),'Steel',region)
        box(region+'_cassette_head',(.32,.40,11.5),(side*16.85,8.5,z),'Steel',region)
    # Electrical cabinet surrounds, without a cover over the live receiver.
    for side in [-1,1]:
        box('Circuit_cheek_'+str(side),(.18,2.3,.28),(-9+side*.91,3,53.54),'Steel','Exit',.025)
    box('Circuit_crown',(2.0,.18,.28),(-9,4.24,53.54),'Steel','Exit',.025)
    box('Circuit_cable_trunk',(.32,4.8,.20),(-10.45,5.0,53.60),'Dark','Exit')
    for y in [3.4,4.6,5.8,7]:
        box('Circuit_trunk_clamp_'+str(y),(.46,.12,.25),(-10.45,y,53.54),'Copper','Exit')
    print('Recessed paired pump intakes and circuit service cabinet built.')


def build_door():
    # Fit the render panel inside the actual corridor bore, with manufacture
    # clearance from its floor, roof and jambs throughout the original travel.
    box('Shutter_body',(5.60,4.44,.34),(6,2.25,54.03),'Dark','Door')
    for y in [.75,2.25,3.75]:
        box('Shutter_armour_'+str(y),(5.48,1.22,.10),(6,y,53.80),'Steel','Door',.025)
    for side in [-1,1]:
        box('Shutter_edge_'+str(side),(.12,4.10,.08),(6+side*2.73,2.25,53.73),'Amber','Door')
    print('Shutter skin follows the existing sliding-door panel.')


def import_cameras():
    scene=bpy.context.scene
    before=set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=HERE+'/../opening-laboratory/opening-laboratory.glb')
    imported=[obj for obj in scene.objects if obj not in before]
    prefab=next(obj for obj in imported if obj.get('asset')=='opening-surveillance-v1')
    bpy.context.view_layer.update()
    inverse=prefab.matrix_world.inverted()
    finishes={'Alloy':'Steel','Graphite':'Dark','Ivory':'Paint','Screen':'Lamp'}
    for index,(eye,target) in enumerate([((11,8.2,-1.25),(0,1,18)),((-12,8.3,53.25),(-1,1,29)),
                                        ((8.40,3.65,67.5),(5.3,1.2,69.2))]):
        direction=Vector(xyz(target))-Vector(xyz(eye))
        transform=Matrix.Translation(Vector(xyz(eye)))@direction.to_track_quat('-Y','Z').to_matrix().to_4x4()
        for source in prefab.children_recursive:
            if source.type!='MESH':continue
            finish=finishes[source.name.split('_')[-1].split('.')[0]]
            data=source.data.copy()
            data.transform(transform@inverse@source.matrix_world)
            data.materials.clear();data.materials.append(bpy.data.materials[PREFIX+finish])
            wear=data.color_attributes.get('wear') or data.color_attributes.new(name='wear',type='FLOAT_COLOR',domain='POINT')
            for color in wear.data:color.color=(.90,.90,.90,1)
            obj=bpy.data.objects.new(PREFIX+'Camera_'+str(index)+'_'+finish,data)
            scene.collection.objects.link(obj);obj.parent=bpy.data.objects[PREFIX+'Architecture']
            obj['finish']=finish;obj['region']='HallB' if index==2 else 'Cameras';obj['sourceAsset']='opening-surveillance-v1';obj['visualOnly']=True
    imported_meshes={obj.data for obj in imported if obj.type=='MESH'}
    for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
    # Geometry-only imported placeholders own no textures. Remove their orphans.
    for data in imported_meshes:
        if data.users==0:bpy.data.meshes.remove(data)
    print('Opening/Containment surveillance cameras reused, including a drooping corridor camera.')


def tube(name,a,b,radius,finish='Steel',region='HallA',sides=10):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized()
    u=direction.cross(Vector((0,1,0)) if abs(direction.y)<.9 else Vector((1,0,0))).normalized()
    v=direction.cross(u)
    vertices=[tuple(p+radius*(u*math.cos(math.tau*i/sides)+v*math.sin(math.tau*i/sides))) for p in (a,b) for i in range(sides)]
    faces=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
    faces.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
    return mesh(name,vertices,faces,finish,region)


def connector_quad(name,points,finish,normal,region):
    # Subdivision carries baked grime rather than adding texture downloads.
    a,b,c,d=[Vector(p) for p in points]
    nx=max(1,math.ceil(max((b-a).length,(c-d).length)/.85))
    nz=max(1,math.ceil(max((d-a).length,(c-b).length)/.85))
    vertices=[tuple(a.lerp(b,i/nx).lerp(d.lerp(c,i/nx),j/nz)) for j in range(nz+1) for i in range(nx+1)]
    faces=[(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i) for j in range(nz) for i in range(nx)]
    if (b-a).cross(d-a).dot(Vector(normal))<0:faces=[tuple(reversed(f)) for f in faces]
    obj=mesh(name,vertices,faces,finish,region)
    if name in ['Vent_turn_South','Vent_turn_North']:
        # Shallow dents bend into the cavity, leaving the clear bore untouched.
        for vertex in obj.data.vertices:
            x,y,z=vertex.co.x,vertex.co.z,-vertex.co.y
            dent=max(0,1-abs(x+11.4)/1.5)*max(0,1-abs(y-1.0)/.65)
            vertex.co.y+=.065*dent*(1 if name.endswith('South') else -1)
        obj.data.update()
    for vertex,color in zip(obj.data.vertices,obj.data.color_attributes['wear'].data):
        x,y,z=vertex.co.x,vertex.co.z,-vertex.co.y
        patch=max(0,math.sin(z*1.11+x*.47)*math.sin(x*1.43-z*.27))**2
        tone=.75+.10*math.sin(z*8.1+x*5.9)-.30*patch
        color.color=(tone,tone*(1-.08*patch),tone*(1-.17*patch),1)
    return obj


def connector_letter(name,body,at,size,normal,region):
    data=bpy.data.curves.new(PREFIX+'temporary-lettering','FONT')
    data.body=body;data.size=size;data.align_x='CENTER';data.align_y='CENTER';data.resolution_u=1
    obj=bpy.data.objects.new(data.name,data);bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH');obj=bpy.context.view_layer.objects.active
    n=Vector(normal);right=Vector((0,1,0)).cross(n).normalized()
    vertices=[tuple(Vector(at)+right*v.co.x+Vector((0,1,0))*v.co.y+n*v.co.z) for v in obj.data.vertices]
    faces=[tuple(p.vertices) for p in obj.data.polygons]
    old=obj.data;bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(old)
    return mesh(name,vertices,faces,'ColdLamp',region)


def build_connector_hall():
    cuts=[54.24,58,61.5,65.5,69.7,73.9,79.75]
    for i,(a,b) in enumerate(zip(cuts,cuts[1:])):
        region='HallA' if i<3 else 'HallB'
        for side,x in [(-1,3.18),(1,8.82)]:
            # A screened storage recess has a sealed backing and retains the
            # original wall collider. Its equipment stays outside the bore.
            storage=side==-1 and i==2
            for low,high in ([(0,.12),(2.4,4.5)] if storage else [(0,4.5)]):
                box(f'Hall_backing_{side}_{i}_{low}',(.08,high-low,b-a),(x+side*.09,(low+high)/2,(a+b)/2),'Dark',region)
            for low,high in ([(0,.12),(2.4,4.49)] if storage else [(0,1.12),(1.15,2.70),(2.73,4.49)]):
                connector_quad(f'Hall_panel_{side}_{i}_{low}',[(x,low,a),(x,high,a),(x,high,b),(x,low,b)],
                    'Paint',( -side,0,0),region)
            box(f'Hall_joint_{side}_{i}',(.045,4.38,.065),(x-side*.028,2.23,a+.05),'Steel',region)
            box(f'Hall_skirt_{side}_{i}',(.07,.12,b-a-.12),(x-side*.045,.13,(a+b)/2),'Dark',region)
            tube(f'Hall_pipe_{side}_{i}',(x-side*.09,3.20,a+.13),(x-side*.09,3.20,b-.13),.055,'Steel',region)
        quad('Hall_roof_'+str(i),[(3.18,4.49,a),(8.82,4.49,a),(8.82,4.49,b),(3.18,4.49,b)],'Dark',(0,-1,0),region)
        for x in [3.48,8.52]:box(f'Hall_ceiling_trunk_{i}_{x}',(.15,.15,b-a-.12),(x,4.32,(a+b)/2),'Steel',region)
    # Single-owned floor strips, including the original shallow exit incline.
    for i in range(14):
        a=54+i*26/14;b=54+(i+1)*26/14;region='HallA' if a<66 else 'HallB'
        for aa,bb in [(a,min(b,74)),(max(a,74),b)]:
            if bb<=aa:continue
            for x0,x1,finish in [(3,3.22,'Steel'),(3.22,3.24,'Dark'),(3.24,5.0,'Deck'),
                                  (5.0,5.015,'Dark'),(5.015,7.4,'Damp' if i in [3,7,10] else 'Deck'),
                                  (7.4,7.415,'Dark'),(7.415,8.76,'Deck'),(8.76,8.78,'Dark'),(8.78,9,'Steel')]:
                connector_quad(f'Hall_floor_{i}_{aa}_{x0}',[(x0,max(0,(aa-74)*.075),aa),(x1,max(0,(aa-74)*.075),aa),
                    (x1,max(0,(bb-74)*.075),bb),(x0,max(0,(bb-74)*.075),bb)],finish,(0,1,0),region)
    # Proper cages fit around the four live bulbs, which remain runtime-owned.
    for i,z in enumerate([56.5,62,68,74]):
        region='HallA' if i<2 else 'HallB'
        box('Hall_lamp_case_'+str(i),(1.08,.13,1.55),(6,4.35,z),'Dark',region,.015)
        for x in [5.60,6.40]:box(f'Hall_lamp_guard_{i}_{x}',(.045,.08,1.30),(x,4.12,z),'Steel',region)
        for zz in [z-.63,z+.63]:box(f'Hall_lamp_crossbar_{i}_{zz}',(.76,.045,.035),(6,4.09,zz),'Steel',region)
    # The abandoned trolley is behind the closed storage grille, away from movement.
    box('Hall_storage_back',(.10,2.28,4),(2.30,1.26,63.5),'Dark','HallA')
    for z in [61.5,65.5]:box('Hall_storage_reveal_'+str(z),(.72,2.18,.07),(2.76,1.26,z),'Steel','HallA')
    for y in [.12,2.4]:box('Hall_storage_sill_'+str(y),(.72,.07,3.89),(2.76,y,63.5),'Steel','HallA')
    for shelf in [.35,.85]:box('Trolley_shelf_'+str(shelf),(.62,.075,1.65),(2.72,shelf,63.4),'Paint','HallA',.01)
    for x in [2.45,2.99]:
        for z in [62.66,64.14]:tube(f'Trolley_post_{x}_{z}',(x,.18,z),(x,1.2,z),.035,'Steel','HallA')
    tube('Trolley_handle',(2.45,1.24,64.22),(2.99,1.24,64.22),.04,'Steel','HallA')
    for x in [2.45,2.99]:
        for z in [62.76,64.04]:tube(f'Trolley_caster_{x}_{z}',(x-.04,.14,z),(x+.04,.14,z),.11,'Dark','HallA',12)
    for z in [61.7+k*.38 for k in range(10)]:tube('Storage_grille_'+str(z),(3.14,.19,z),(3.14,2.32,z),.018,'Steel','HallA',8)
    for y in [.7,1.5]:box('Storage_guard_'+str(y),(.04,.03,3.9),(3.14,y,63.5),'Steel','HallA')
    # A loose cover stays above headroom; a dark opening is fully backed.
    box('Hall_missing_cover_back',(1.25,.08,2.0),(4.7,4.58,70),'Dark','HallB')
    loose=box('Hall_loose_cover',(1.15,.06,1.8),(4.7,4.16,70.1),'Paint','HallB',.01)
    pivot=Vector(xyz((4.7,4.16,70.1)));loose.data.transform(Matrix.Translation(pivot)@Matrix.Rotation(.13,4,'X')@Matrix.Translation(-pivot))
    box('Hall_destination_sign',(3.45,.62,.08),(6,3.55,79.67),'Dark','HallB',.025)
    connector_letter('Hall_destination_text','DISTRIBUTION / 02',(6,3.55,79.61),.27,(0,0,-1),'HallB')
    for x in [4.46,7.54]:box('Hall_sign_marker_'+str(x),(.05,.29,.025),(x,3.55,79.61),'ColdLamp','HallB')
    print('Worn service corridor, screened trolley bay, fitted lights and destination sign built.')


def build_connector_vent():
    # Three adjoining protected bores: inlet, turn, then inclined outlet.
    for i in range(4):
        a=54+i*1.5;b=a+1.5
        for x,n in [(-6.75,(1,0,0)),(-5.25,(-1,0,0))]:
            connector_quad(f'Vent_inlet_wall_{i}_{x}',[(x,0,a),(x,2.2,a),(x,2.2,b),(x,0,b)],'Steel',n,'VentFlat')
        connector_quad('Vent_inlet_floor_'+str(i),[(-6.75,0,a),(-5.25,0,a),(-5.25,0,b),(-6.75,0,b)],'Deck',(0,1,0),'VentFlat')
        quad('Vent_inlet_roof_'+str(i),[(-6.75,2.2,a),(-5.25,2.2,a),(-5.25,2.2,b),(-6.75,2.2,b)],'Steel',(0,-1,0),'VentFlat')
        for x in [-6.78,-5.22]:box(f'Vent_inlet_seam_{i}_{x}',(.055,2.19,.06),(x,1.1,a+.08),'Dark','VentFlat')
    connector_quad('Vent_turn_floor',[(-16.75,0,60),(-5.25,0,60),(-5.25,0,63),(-16.75,0,63)],'Deck',(0,1,0),'VentTurn')
    quad('Vent_turn_roof',[(-16.75,2.2,60),(-5.25,2.2,60),(-5.25,2.2,63),(-16.75,2.2,63)],'Steel',(0,-1,0),'VentTurn')
    for name,z,a,b,n in [('South',60,-16.75,-6.75,(0,0,1)),('North',63,-15.25,-5.25,(0,0,-1))]:
        connector_quad('Vent_turn_'+name,[(a,0,z),(b,0,z),(b,2.2,z),(a,2.2,z)],'Steel',n,'VentTurn')
        for x in [a+.08+k*1.8 for k in range(math.floor((b-a)/1.8)+1)]:
            box(f'Vent_turn_joint_{name}_{x}',(.055,2.15,.06),(x,1.1,z+(.035 if z==63 else -.035)),'Dark','VentTurn')
    quad('Vent_turn_east',[(-5.25,0,60),(-5.25,2.2,60),(-5.25,2.2,63),(-5.25,0,63)],'Steel',(-1,0,0),'VentTurn')
    # Fan cavity: the original solid wall still blocks the grille. Backing
    # seals the recess, and blades rotate inside it without touching the bore.
    for lo,hi,a,b in [(0,.55,60,63),(1.75,2.2,60,63),(.55,1.75,60,60.85),(.55,1.75,62.15,63)]:
        quad(f'Vent_fan_wall_{lo}_{a}',[(-16.75,lo,a),(-16.75,hi,a),(-16.75,hi,b),(-16.75,lo,b)],'Steel',(1,0,0),'VentTurn')
    box('Vent_fan_back',(.08,1.28,1.38),(-17.32,1.15,61.5),'Dark','VentTurn')
    for z in [60.82,62.18]:box('Vent_fan_reveal_'+str(z),(.54,1.20,.06),(-17.06,1.15,z),'Steel','VentTurn')
    for y in [.515,1.785]:box('Vent_fan_reveal_'+str(y),(.54,.06,1.22),(-17.06,y,61.5),'Steel','VentTurn')
    ring_x('Vent_fan_shroud',-17.05,1.15,61.5,.49,.57,.20,'Steel','VentTurn')
    for z in [61.02+k*.16 for k in range(7)]:box('Vent_fan_grille_'+str(z),(.035,1.12,.025),(-16.79,1.15,z),'Steel','VentTurn')
    box('Vent_fan_grille_cross',(.04,.025,1.12),(-16.76,1.15,61.5),'Steel','VentTurn')
    # Fan meshes use world coordinates in the studio; runtime rebases once.
    ring_x('Vent_fan_hub',-17.16,1.15,61.5,.001,.12,.09,'Steel','VentFan')
    for blade in range(3):
        angle=math.tau*blade/3;vertices=[]
        for radius,theta in [(.13,angle),(.46,angle+.18),(.46,angle+.66),(.13,angle+.72)]:
            vertices.append((-17.15,1.15+radius*math.sin(theta),61.5+radius*math.cos(theta)))
        quad('Vent_fan_blade_'+str(blade),vertices,'Paint',(1,0,0),'VentFan')
    for i in range(9):
        a=63+i*17/9;b=63+(i+1)*17/9;ya=(a-63)*2.58/17;yb=(b-63)*2.58/17
        connector_quad('Vent_rise_floor_'+str(i),[(-16.75,ya,a),(-15.25,ya,a),(-15.25,yb,b),(-16.75,yb,b)],'Deck',(0,1,-.152),'VentRise')
        quad('Vent_rise_roof_'+str(i),[(-16.75,ya+2.2,a),(-15.25,ya+2.2,a),(-15.25,yb+2.2,b),(-16.75,yb+2.2,b)],'Steel',(0,-1,.152),'VentRise')
        for x,n in [(-16.75,(1,0,0)),(-15.25,(-1,0,0))]:
            connector_quad(f'Vent_rise_wall_{i}_{x}',[(x,ya,a),(x,ya+2.2,a),(x,yb+2.2,b),(x,yb,b)],'Steel',n,'VentRise')
            # Outside-facing folded joints fit behind the wall surface.
            box(f'Vent_rise_joint_{i}_{x}',(.045,2.19,.06),(x+(-.03 if x<-16 else .03),ya+1.1,a+.08),'Dark','VentRise')
    # Faint cold apertures and fasteners sit clear of the metal faces.
    for i,z in enumerate([56.7,59.0]):
        box('Vent_inlet_slit_'+str(i),(.025,.07,.55),(-5.275,1.50,z),'ColdLamp','VentFlat')
    for z in [66,71,76]:
        y=(z-63)*2.58/17
        box('Vent_rise_slit_'+str(z),(.025,.055,.48),(-15.275,y+1.55,z),'ColdLamp','VentRise')
    for i in range(2):
        a=80+i*3;b=a+3
        for x0,x1,finish in [(-17.4,-17.25,'Steel'),(-17.25,-14.75,'Deck'),(-14.75,-14.6,'Steel')]:
            connector_quad(f'Vent_outlet_{i}_{x0}',[(x0,2.5,a),(x1,2.5,a),(x1,2.5,b),(x0,2.5,b)],finish,(0,1,0),'VentRise')
    for z in [55.2,58.2]:
        for x in [-6.72,-5.28]:tube(f'Vent_bolt_{x}_{z}',(x,.35,z),(x+(.025 if x<-6 else -.025),.35,z),.035,'Steel','VentFlat',8)
    loose=box('Vent_loose_roof_cover',(1.12,.04,1.1),(-10.4,2.06,61.5),'Paint','VentTurn')
    pivot=Vector(xyz((-10.4,2.06,61.5)));loose.data.transform(Matrix.Translation(pivot)@Matrix.Rotation(.09,4,'Y')@Matrix.Translation(-pivot))
    print('Folded inlet, enclosed turn, recessed three-blade fan and rising duct built.')


def preview():
    scene=bpy.context.scene
    for name,eye,target,energy,size,tint in [
        ('Entry',(-7,8,5),(0,0,10),2100,8,(1,.80,.53)),
        ('Basin',(0,10,26),(0,0,28),3000,12,(.61,.78,.83)),
        ('Exit',(5,9,48),(-6,2,53),1600,7,(.68,.83,.78)),
        ('Hall',(6,3.7,58),(6,1.1,65),130,3,(1,.73,.39)),
        ('Vent',(-9,1.9,61),(-15,1,61.5),24,2,(.51,.76,.82)),
    ]:
        data=bpy.data.lights.new(PREFIX+'Studio_'+name,'AREA')
        data.energy=energy;data.shape='DISK';data.size=size;data.color=tint
        obj=bpy.data.objects.new(PREFIX+'Studio_'+name,data);scene.collection.objects.link(obj)
        obj.location=xyz(eye);obj.rotation_euler=(Vector(xyz(target))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new(PREFIX+'Studio_camera')
    camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    camera.location=xyz((6,2.2,55.5));camera.rotation_euler=(Vector(xyz((6,2,74)))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.lens=22;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
    scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    print('Studio lights only; export excludes them.')


def frame(eye=(10,8,3),target=(-1,3,29)):
    area=next(a for a in bpy.context.window.screen.areas if a.type=='VIEW_3D')
    space=area.spaces.active;space.clip_end=400;space.lens=25
    space.shading.type='MATERIAL';space.overlay.show_overlays=False
    direction=Vector(xyz(target))-Vector(xyz(eye))
    space.region_3d.view_rotation=direction.to_track_quat('-Z','Y')
    space.region_3d.view_location=xyz(target);space.region_3d.view_distance=direction.length
    space.region_3d.view_perspective='PERSP'
    if not bpy.app.background:space.region_3d.update()


def export_asset():
    source=bpy.data.objects[PREFIX+'Architecture']
    source.name=PREFIX+'Editable'
    root=bpy.data.objects.new(PREFIX+'Architecture',None)
    root['asset']='blackout-maintenance-v1'
    bpy.context.scene.collection.objects.link(root)
    owned=[]
    try:
        groups={}
        for child in list(source.children):
            if child.type!='MESH':continue
            obj=child.copy();obj.data=child.data.copy();owned.append(obj.data)
            bpy.context.scene.collection.objects.link(obj);obj.parent=root
            groups.setdefault((obj['region'],obj['finish']),[]).append(obj)
        for (region,finish),objects in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            obj=bpy.context.view_layer.objects.active;obj.name=PREFIX+'Batch_'+region+'_'+finish
            obj['region']=region;obj['finish']=finish;owned.append(obj.data)
        bpy.ops.object.select_all(action='DESELECT')
        root.select_set(True)
        for obj in root.children:obj.select_set(True)
        bpy.context.view_layer.objects.active=root
        bpy.ops.export_scene.gltf(filepath=HERE+'/maintenance-bay.glb',export_format='GLB',
            use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,
            export_cameras=False,export_lights=False,export_animations=False,export_materials='PLACEHOLDER')
    finally:
        for obj in list(root.children):bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.objects.remove(root,do_unlink=True)
        for data in set(owned):
            if not data.users:bpy.data.meshes.remove(data)
        source.name=PREFIX+'Architecture'
    print('Exported geometry-only, shared-finish maintenance bay.')


def save_source():
    old=bpy.context.preferences.filepaths.save_version
    try:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=HERE+'/maintenance-bay.blend',copy=True)
    finally:bpy.context.preferences.filepaths.save_version=old


if __name__=='__main__':
    setup()
    build_shell()
    build_decks()
    build_machinery()
    build_door()
    build_connector_hall()
    build_connector_vent()
    import_cameras()
    preview()
    frame()
    export_asset()
    save_source()
