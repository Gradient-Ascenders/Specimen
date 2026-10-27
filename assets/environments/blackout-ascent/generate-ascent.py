"""Blackout service ascent. Geometry only, game metres / Y up.

Floor footprints, gate motion, the electrical socket and cinematic stay live.
One eight-metre shaft kit is shared by the six runtime scrolling owners.
"""
import bpy
import bmesh
import math
from mathutils import Vector

HERE=__file__[:max(__file__.rfind('/'),__file__.rfind('\\'))]
PREFIX='B3_ASC_'
SCENE='Blackout / Restricted Research Ascent'
PALETTE={'Steel':((.24,.31,.30),.7,.55),'Deck':((.29,.34,.32),.88,.3),
         'Paint':((.36,.39,.36),.9,.12),'White':((.73,.79,.78),.66,.12),
         'Dark':((.025,.04,.045),.9,.1),'Amber':((.67,.43,.09),.86,.15),
         'Glass':((.025,.06,.065),.3,.4),'Letter':((.58,.69,.67),.8,0),
         'Strip':((.30,.62,.67),.45,0),'Status':((.64,.44,.13),.4,0),
         'BootA':((.29,.64,.49),.5,0),'BootB':((.29,.64,.49),.5,0),'BootC':((.29,.64,.49),.5,0)}
POSES={'RearGate':(0,3.05,176.4),'FrontGate':(0,3.05,184.8),'LabDoor':(0,3.55,190),
       'Cover':(3.6,1.75,181.99)}


def xyz(p):return (p[0],-p[2],p[1])


def owner(region):
    name=PREFIX+'Owner_'+region
    obj=bpy.data.objects.get(name)
    if obj:return obj
    obj=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(obj)
    obj.parent=bpy.data.objects[PREFIX+'Architecture'];obj['region']=region
    if region in POSES:obj.location=xyz(POSES[region])
    if region=='Cover':obj.rotation_euler.z=1.9
    return obj


def setup():
    scene=bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE);bpy.context.window.scene=scene
    for obj in list(scene.objects):
        if obj.name.startswith(PREFIX):bpy.data.objects.remove(obj,do_unlink=True)
    for blocks in (bpy.data.meshes,bpy.data.curves,bpy.data.materials,bpy.data.lights,bpy.data.cameras):
        for data in list(blocks):
            if data.name.startswith(PREFIX) and not data.users:blocks.remove(data)
    scene.unit_settings.system='METRIC';scene.view_settings.view_transform='AgX'
    world=bpy.data.worlds.get(PREFIX+'World') or bpy.data.worlds.new(PREFIX+'World')
    world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Strength'].default_value=.12;scene.world=world
    root=bpy.data.objects.new(PREFIX+'Architecture',None);root['asset']='blackout-ascent-v1'
    root['visualOnly']=True;scene.collection.objects.link(root)
    for name,(color,rough,metal) in PALETTE.items():
        mat=bpy.data.materials.new(PREFIX+name);mat.diffuse_color=(*color,1);mat.use_nodes=True;mat.use_backface_culling=True
        shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1)
        shader.inputs['Roughness'].default_value=rough;shader.inputs['Metallic'].default_value=metal
        vertex=mat.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='wear'
        mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
        mix.inputs[1].default_value=(*color,1);mat.node_tree.links.new(vertex.outputs['Color'],mix.inputs[2])
        mat.node_tree.links.new(mix.outputs[0],shader.inputs['Base Color'])
        if name in ['Strip','Status','BootA','BootB','BootC']:
            shader.inputs['Emission Color'].default_value=(*color,1);shader.inputs['Emission Strength'].default_value=.6
    print('Separate research-ascent studio ready; other scenes retained.')


def mesh(name,points,faces,finish,region,bevel=0):
    data=bpy.data.meshes.new(PREFIX+name);data.from_pydata([xyz(p) for p in points],[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    if all(e.is_manifold for e in bm.edges):bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bevel:
        bmesh.ops.bevel(bm,geom=[e for e in bm.edges if e.is_manifold],offset=bevel,segments=1,affect='EDGES',clamp_overlap=True)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data);bm.free();uv=data.uv_layers.new(name='MetricUV')
    wear=data.color_attributes.new(name='wear',type='FLOAT_COLOR',domain='POINT')
    for v in data.vertices:
        x,y,z=v.co.x,v.co.z,-v.co.y
        dirt=max(0,math.sin(x*.91+z*.63)*math.sin(z*1.23-x*.41))**2
        tone=(.94-.06*dirt) if finish=='White' else .88-.23*dirt
        wear.data[v.index].color=(tone,tone*(1-.04*dirt),tone*(1-.09*dirt),1)
    for p in data.polygons:
        if abs(p.normal.x)>=max(abs(p.normal.y),abs(p.normal.z)):axis=0
        elif abs(p.normal.y)>=abs(p.normal.z):axis=1
        else:axis=2
        for i in p.loop_indices:
            v=data.vertices[data.loops[i].vertex_index].co
            a,b=(v.y,v.z) if axis==0 else (v.x,v.z) if axis==1 else (v.x,v.y)
            uv.data[i].uv=(a/2,b/2)
    data.materials.append(bpy.data.materials[PREFIX+finish])
    obj=bpy.data.objects.new(PREFIX+name,data);bpy.context.scene.collection.objects.link(obj);obj.parent=owner(region)
    obj['finish']=finish;obj['region']=region;obj['visualOnly']=True;return obj


def box(name,size,at,finish='Steel',region='Car',bevel=0):
    x,y,z=at;a,b,c=[v/2 for v in size]
    faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]
    # Fixed jamb shoes rest on the floor. Their buried bottom cap would also
    # overlap the neighbouring shoulder's buried cap, so it has no render owner.
    if name.startswith(('Entry_gate_shoe_','Landing_gate_shoe_','Research_door_shoe_')):faces.pop(2)
    return mesh(name,[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
        (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)],
        faces,finish,region,min(bevel,min(size)*.18))


def quad(name,points,finish,normal,region):
    p=[Vector(v) for v in points]
    if (p[1]-p[0]).cross(p[2]-p[0]).dot(Vector(normal))<0:points=list(reversed(points))
    return mesh(name,points,[tuple(range(len(points)))],finish,region)


def tube(name,a,b,r,finish='Steel',region='Car',sides=10):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized()
    u=direction.cross(Vector((0,1,0)) if abs(direction.y)<.9 else Vector((1,0,0))).normalized();v=direction.cross(u)
    points=[tuple(p+r*(u*math.cos(math.tau*i/sides)+v*math.sin(math.tau*i/sides))) for p in (a,b) for i in range(sides)]
    faces=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
    faces.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
    return mesh(name,points,faces,finish,region)


def label(name,body,at,size,normal,region,finish='Letter'):
    data=bpy.data.curves.new(PREFIX+'temporary-lettering','FONT')
    data.body=body;data.size=size;data.align_x='CENTER';data.align_y='CENTER';data.resolution_u=1
    obj=bpy.data.objects.new(data.name,data);bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH');obj=bpy.context.view_layer.objects.active
    n=Vector(normal);right=Vector((0,1,0)).cross(n).normalized()
    points=[tuple(Vector(at)+right*v.co.x+Vector((0,1,0))*v.co.y+n*v.co.z) for v in obj.data.vertices]
    faces=[tuple(p.vertices) for p in obj.data.polygons];old=obj.data
    bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(old)
    return mesh(name,points,faces,finish,region)


def floor(name,width,depth,x,z,region,finish='Deck'):
    # Containment inset perimeter and corner-marker recipe. Each cell owns its
    # top exactly; expansion seams partition rather than overlay the deck.
    gx=[x-width/2,x-width/2+.13,x-width/2+.23,x+width/2-.23,x+width/2-.13,x+width/2]
    gz=[z-depth/2,z-depth/2+.13,z-depth/2+.23,z+depth/2-.23,z+depth/2-.13,z+depth/2]
    for i in range(5):
        for j in range(5):
            f='Amber' if i in [1,3] and j in [1,3] and finish!='White' else 'Steel' if i in [0,4] or j in [0,4] else finish
            a,b=gx[i],gx[i+1];c,d=gz[j],gz[j+1]
            if i==2 and j==2:
                count=max(1,math.ceil((d-c)/1.4))
                for k in range(count):
                    lo=c+(d-c)*k/count;hi=c+(d-c)*(k+1)/count
                    quad(f'{name}_joint_{k}',[(a,.4,lo),(b,.4,lo),(b,.4,lo+.012),(a,.4,lo+.012)],'Dark',(0,1,0),region)
                    # Subdivide long plates for baked wear interpolation.
                    for col in range(4):
                        aa=a+(b-a)*col/4;bb=a+(b-a)*(col+1)/4
                        quad(f'{name}_plate_{k}_{col}',[(aa,.4,lo+.012),(bb,.4,lo+.012),(bb,.4,hi),(aa,.4,hi)],f,(0,1,0),region)
            else:quad(f'{name}_{i}_{j}',[(a,.4,c),(b,.4,c),(b,.4,d),(a,.4,d)],f,(0,1,0),region)
    for side in [-1,1]:
        edge=x+side*width/2
        quad(f'{name}_fascia_{side}',[(edge,.4,z-depth/2),(edge,.4,z+depth/2),
             (edge,-.4,z+depth/2),(edge,-.4,z-depth/2)],'Steel',(side,0,0),region)
    if name in ['Entry','Lab']:
        joint=z+depth/2 if name=='Entry' else z-depth/2
        for a,b in [(x-width/2,-4),(4,x+width/2)]:
            quad(f'{name}_wing_{a}',[(a,.4,joint),(b,.4,joint),(b,-.4,joint),(a,-.4,joint)],
                 'Steel',(0,0,1 if name=='Entry' else -1),region)
    quad(name+'_underside',[(x-width/2,-.4,z-depth/2),(x+width/2,-.4,z-depth/2),
         (x+width/2,-.4,z+depth/2),(x-width/2,-.4,z+depth/2)],'Dark',(0,-1,0),region)


def build_car():
    floor('Entry',8.8,2.5,0,175.25,'Entry')
    floor('Car',8,8.4,0,180.7,'Car')
    box('Underframe',(8.3,.3,8.65),(0,-.52,180.7),'Dark')
    for side in [-1,1]:
        x=side*3.8
        spans=[(176.9,184.5)] if side<0 else [(176.9,180.4),(182.2,184.5)]
        for i,(a,b) in enumerate(spans):tube(f'Guard_{side}_{i}',(x,1.65,a),(x,1.65,b),.07)
        for z in ([177.1,180.7,184.3] if side<0 else [177.1,180.4,182.2,184.3]):
            box(f'Guard_post_{side}_{z}',(.135,1.13,.135),(x,.99,z),'Steel',bevel=.014)
            box(f'Guard_shoe_{side}_{z}',(.30,.075,.30),(x,.46,z),'Dark',bevel=.012)
        box('Sill_'+str(side),(.10,.18,8.3),(side*3.91,.46,180.7),'Dark')
        box('Overhead_column_'+str(side),(.19,4.6,.22),(x,2.9,184.3),'Steel',bevel=.02)
        box('Column_socket_'+str(side),(.30,.31,.34),(x,.72,184.3),'Dark',bevel=.02)
        tube('Suspension_'+str(side),(side*3.4,5.28,184.3),(side*3.4,29,184.3),.028,'Steel',sides=8)
        box('Suspension_clamp_'+str(side),(.18,.23,.24),(side*3.4,5.25,184.3),'Steel',bevel=.012)
    box('Overhead_crosshead',(8,.26,.30),(0,5.1,184.3),'Steel',bevel=.025)
    box('Car_plate',(1.95,.42,.06),(-2.3,4.76,184.18),'Dark',bevel=.012)
    label('Car_serial','SERVICE LIFT 03',(-2.3,4.76,184.135),.17,(0,0,-1),'Car')
    # Directly behind the live PCB. No new shape covers the socket at x=3.30.
    box('Cabinet_back',(.12,1.70,1.30),(3.76,1.75,181.25),'Dark',bevel=.02)
    for y in [.89,2.61]:box('Cabinet_rim_'+str(y),(.38,.085,1.40),(3.57,y,181.25),'Steel',bevel=.01)
    for z in [180.57,181.93]:box('Cabinet_side_'+str(z),(.38,1.62,.085),(3.57,1.75,z),'Steel',bevel=.01)
    box('Cabinet_cover',(.064,1.47,1.20),(-.02,0,-.66),'Paint','Cover',.008)
    # Burnt paint sits behind the conducting electronics, not over their faces.
    for i,z in enumerate([180.69,181.81]):box('Scorch_'+str(i),(.014,1.08,.11),(3.635,1.66,z),'Dark',bevel=.002)
    for i,y in enumerate([2.88,3.10,3.32]):
        box('Boot_recess_'+str(i),(.055,.13,.39),(3.66,y,181.25),'Dark')
        box('Boot_lamp_'+str(i),(.025,.055,.25),(3.618,y,181.25),['BootA','BootB','BootC'][i])
    tube('Cabinet_feed',(3.73,2.74,181.25),(3.73,4.24,181.25),.042)
    for y in [2.75,4.08]:box('Feed_coupling_'+str(y),(.16,.10,.16),(3.73,y,181.25),'Dark')
    box('Motor_body',(.68,.72,1.08),(3.48,4.55,181.25),'Paint',bevel=.04)
    for i in range(5):box('Motor_fin_'+str(i),(.72,.026,1.12),(3.48,4.29+i*.12,181.25),'Dark')
    print('Inset decks, tubular guards, real car framework and damaged control housing built.')


def frame(name,z,width,height,region,white=False):
    finish='White' if white else 'Steel'
    for side in [-1,1]:
        box(f'{name}_jamb_{side}',(.24,height-.26,.36),(side*(width/2+.15),.53+(height-.26)/2,z),finish,region,.025)
        box(f'{name}_shoe_{side}',(.34,.22,.44),(side*(width/2+.15),.51,z),'Dark',region,.02)
        box(f'{name}_track_{side}',(.065,height-.4,.08),(side*(width/2+.015),.6+(height-.4)/2,z+.23),'Dark',region)
    box(name+'_lintel',(width+.54,.24,.40),(0,.4+height+.12,z),finish,region,.025)
    # The gate withdraws into this opaque drive pocket; opening never reveals
    # a cut-out in another independently moving surface.
    box(name+'_drive',(width+.76,height+.14,.42),(0,.4+height+(height+.14)/2+.04,z+.05),'Dark',region,.03)


def build_gates():
    frame('Entry_gate',176.4,8.1,5.3,'Entry')
    frame('Landing_gate',184.8,8.1,5.3,'Lab',True)
    for region,finish in [('RearGate','Paint'),('FrontGate','White')]:
        box(region+'_body',(8.06,5.27,.16),(0,0,0),'Dark',region,.015)
        for face in [-1,1]:
            for i in range(7):
                y=-2.61+(i+.5)*5.22/7
                box(f'{region}_slat_{face}_{i}',(7.94,5.22/7-.035,.06),(0,y,face*.115),finish,region,.012)
            box(f'{region}_lower_edge_{face}',(7.96,.10,.07),(0,-2.58,face*.19),'Steel',region,.01)
            box(f'{region}_status_{face}',(2.50,.055,.025),(0,-2.40,face*.18),'Status',region)
    box('Restricted_sign',(4.7,.59,.10),(0,6.07,176.02),'Dark','Entry',.02)
    label('Restricted_legend','RESTRICTED RESEARCH',(0,6.07,175.955),.29,(0,0,-1),'Entry')
    # Fitted shoulders close the approach without entering the boarding bore.
    for side in [-1,1]:box('Entry_shoulder_'+str(side),(1.58,5.37,2.48),(side*4.9,3.1,175.25),'Paint','Entry',.025)
    print('Fitted shutter tracks, raised drive pockets and restricted entrance built.')


def build_shaft():
    for side in [-1,1]:
        x=side*5.79
        quad('Shaft_back_'+str(side),[(x,-23,174.5),(x,29,174.5),(x,29,184.8),(x,-23,184.8)],'Dark',(-side,0,0),'Guide')
        box('Guide_rail_'+str(side),(.12,52,.22),(side*5.51,3,180.7),'Steel','Guide')
        box('Guide_web_'+str(side),(.16,52,.07),(side*5.65,3,180.7),'Dark','Guide')
        box('Module_crosshead_'+str(side),(.16,.18,9.6),(side*5.67,.15,180.2),'Steel','Shaft')
        tube('Module_diagonal_'+str(side),(side*5.67,.38,177.6),(side*5.67,7.65,180.1),.055,'Steel','Shaft',8)
        box('Shaft_lamp_case_'+str(side),(.25,.43,2.15),(side*5.60,4,180.1),'Dark','Shaft',.018)
        box('Shaft_lamp_'+str(side),(.035,.18,1.70),(side*5.445,4,180.1),'Strip','Shaft')
        for z in [177.3,183.3]:box(f'Shaft_bracket_{side}_{z}',(.24,.30,.25),(side*5.53,.15,z),'Paint','Shaft',.02)
        for z in [175.4,183.7]:tube(f'Cable_bundle_{side}_{z}',(side*5.73,.4,z),(side*5.73,7.8,z),.045,'Steel','Shaft',8)
        # Optional blind maintenance bays are attached to only two modules.
        for z in [178.7,181.5]:box(f'Bay_reveal_{side}_{z}',(.10,3.4,.13),(side*5.64,3.15,z),'Steel','Bay')
        for y in [1.38,4.92]:box(f'Bay_sill_{side}_{y}',(.10,.12,2.93),(side*5.64,y,180.1),'Steel','Bay')
        for k in range(6):box(f'Bay_grille_{side}_{k}',(.08,3.35,.055),(side*5.58,3.15,178.91+k*.47),'Steel','Bay')
    print('One reusable shaft section and recessed maintenance-bay variation built.')


def build_lab():
    floor('Lab',12.8,5.1,0,187.45,'Lab','White')
    for side in [-1,1]:
        x=side*6.18
        box('Lab_back_'+str(side),(.16,6.82,5.10),(side*6.30,3.81,187.45),'Dark','Lab')
        for i,(a,b) in enumerate([(184.94,186.55),(186.58,188.17),(188.20,190)]):
            for lo,hi in [(.61,1.20),(1.42,4.11),(4.14,7.18)]:
                quad(f'Lab_panel_{side}_{i}_{lo}',[(x,lo,a),(x,hi,a),(x,hi,b),(x,lo,b)],'White',(-side,0,0),'Lab')
            box(f'Lab_inlay_{side}_{i}',(.025,.07,b-a),(x-side*.025,1.31,(a+b)/2),'Strip','Lab')
        box('Lab_skirt_'+str(side),(.10,.17,5.06),(side*6.13,.50,187.45),'Steel','Lab')
        for z in [185,189.37]:
            box(f'Lab_return_{side}_{z}',(1.96,6.78,.18),(side*5.215,3.79,z),'White','Lab',.012)
    quad('Lab_ceiling',[(-6.2,7.2,184.94),(6.2,7.2,184.94),(6.2,7.2,190),(-6.2,7.2,190)],'White',(0,-1,0),'Lab')
    for x in [-4.8,0,4.8]:
        box('Lab_fixture_'+str(x),(2.4,.12,.75),(x,7.08,187.5),'Steel','Lab',.012)
        box('Lab_diffuser_'+str(x),(2.15,.035,.55),(x,6.99,187.5),'Strip','Lab')
    frame('Research_door',190,8.5,6.3,'Lab',True)
    box('Research_door_body',(8.46,6.25,.22),(0,0,0),'Dark','LabDoor',.015)
    for side in [-1,1]:
        box('Research_door_leaf_'+str(side),(4.13,6.08,.055),(side*2.12,0,-.155),'White','LabDoor',.018)
        box('Research_door_seal_'+str(side),(.04,6.08,.035),(side*.028,0,-.175),'Steel','LabDoor')
        box('Research_window_'+str(side),(1.5,.23,.035),(side*2.12,.95,-.205),'Glass','LabDoor',.004)
        box('Research_window_sill_'+str(side),(1.55,.035,.035),(side*2.12,.80,-.205),'Steel','LabDoor')
    box('Lab_sector_plate',(3.8,.38,.06),(0,6.95,189.71),'Dark','Lab')
    label('Lab_sector_legend','RESEARCH / SECTOR 03',(0,6.95,189.66),.23,(0,0,-1),'Lab')
    print('Clinical panelled landing, restrained teal lighting and laboratory door built.')


def preview():
    scene=bpy.context.scene
    for i,(eye,target,energy,tint,size) in enumerate([((-2,4,178),(0,1,181),350,(1,.78,.49),5),
             ((0,6.8,187.5),(0,.4,187.5),650,(.74,.89,1),5),((-5,6,180),(0,2,180),220,(.48,.70,.78),5)]):
        data=bpy.data.lights.new(PREFIX+'Studio_'+str(i),'AREA');data.energy=energy;data.color=tint;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=xyz(eye)
        obj.rotation_euler=(Vector(xyz(target))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new(PREFIX+'Studio_camera');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    camera.location=xyz((-3.2,3.1,178));camera.rotation_euler=(Vector(xyz((1,2,184)))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.lens=23;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
    scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    for area in bpy.context.screen.areas if bpy.context.screen else ():
        if area.type=='VIEW_3D':
            space=area.spaces.active;space.shading.type='SOLID';space.clip_end=400;space.lens=23
            space.region_3d.view_rotation=camera.rotation_euler.to_quaternion();space.region_3d.view_location=xyz((1,2,184));space.region_3d.view_distance=8


def export_asset():
    source=bpy.data.objects[PREFIX+'Architecture'];source.name=PREFIX+'Editable'
    root=bpy.data.objects.new(PREFIX+'Architecture',None);root['asset']='blackout-ascent-v1';root['visualOnly']=True
    bpy.context.scene.collection.objects.link(root);owned=[]
    try:
        groups={}
        for child in source.children_recursive:
            if child.type!='MESH':continue
            obj=child.copy();obj.data=child.data.copy();owned.append(obj.data);bpy.context.scene.collection.objects.link(obj)
            obj.parent=root;obj.location=(0,0,0);obj.rotation_euler=(0,0,0);obj.scale=(1,1,1)
            groups.setdefault((obj['region'],obj['finish']),[]).append(obj)
        for (region,finish),objects in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            obj=bpy.context.view_layer.objects.active;obj.name=PREFIX+'Batch_'+region+'_'+finish;obj['region']=region;obj['finish']=finish;owned.append(obj.data)
        bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
        for obj in root.children:obj.select_set(True)
        bpy.context.view_layer.objects.active=root
        bpy.ops.export_scene.gltf(filepath=HERE+'/research-ascent.glb',export_format='GLB',use_selection=True,use_active_scene=True,
            export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False,export_materials='PLACEHOLDER')
    finally:
        for obj in list(root.children):bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.objects.remove(root,do_unlink=True)
        for data in set(owned):
            if not data.users:bpy.data.meshes.remove(data)
        source.name=PREFIX+'Architecture'


def save_source():
    previous=bpy.context.preferences.filepaths.save_version
    try:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=HERE+'/research-ascent.blend',copy=True)
    finally:bpy.context.preferences.filepaths.save_version=previous


if __name__=='__main__':
    setup()
    build_car()
    build_gates()
    build_shaft()
    build_lab()
    preview()
    export_asset()
    save_source()
