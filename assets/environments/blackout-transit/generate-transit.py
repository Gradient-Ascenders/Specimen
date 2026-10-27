"""Flooded distribution hall for Blackout, geometry only, metres/game Y-up.

Existing physics, electrical contacts, lifts, bridge and hazards stay authoritative.
Dynamic owner poses are studio references and are stripped from the GLB export.
The deck and four-point harness recipes follow Containment Room 2.
"""
import bpy
import bmesh
import math
from mathutils import Vector, Matrix

HERE = __file__[:max(__file__.rfind('/'), __file__.rfind('\\'))]
PREFIX = 'B3_R2_'
SCENE = 'Blackout / Flooded Distribution Hall'
PALETTE = {
    'Paint': ((.37,.40,.38),.91,.10),
    'Deck': ((.29,.34,.33),.87,.30),
    'Alloy': ((.24,.31,.30),.64,.64),
    'Graphite': ((.035,.052,.055),.89,.30),
    'Amber': ((.65,.39,.075),.86,.15),
    'Copper': ((.36,.21,.085),.76,.60),
    'Letter': ((.65,.73,.69),.91,.0),
    'Window': ((.027,.049,.049),.28,.42),
}
POSES = {'LiftA':(10,1.2,110),'LiftB':(10,4.4,134),
         'BankA':(14,8.4,96),'BankB':(14,12.1,120),'BankC':(-4,8.9,139),
         'BankD':(10,14.4,142.5)}
BRIDGE_START = Vector((-16,2.5,136))+Vector((16,0,8)).normalized()*1.75
BRIDGE_END = Vector((-2.6,.4,142.7))
BRIDGE_LENGTH = (BRIDGE_END-BRIDGE_START).length


def xyz(v):
    return (v[0],-v[2],v[1])


def owner(region):
    name=PREFIX+'Owner_'+region
    obj=bpy.data.objects.get(name)
    if obj:return obj
    obj=bpy.data.objects.new(name,None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent=bpy.data.objects[PREFIX+'Architecture']
    obj['region']=region
    if region in POSES:obj.location=xyz(POSES[region])
    if region=='Bridge':
        along=(BRIDGE_END-BRIDGE_START).normalized()
        across=Vector((-along.z,0,along.x)).normalized()
        up=across.cross(along)
        # Build the basis in Blender coordinates, preserving local game axes.
        basis=Matrix((xyz(along),xyz(-across),xyz(up))).transposed().to_4x4()
        centre=(BRIDGE_START+BRIDGE_END)/2-up*.225
        obj.matrix_world=Matrix.Translation(Vector(xyz(centre)))@basis
    return obj


def setup():
    scene=bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    bpy.context.window.scene=scene
    for obj in list(scene.objects):
        if obj.name.startswith(PREFIX):bpy.data.objects.remove(obj,do_unlink=True)
    for blocks in (bpy.data.meshes,bpy.data.curves,bpy.data.materials,bpy.data.lights,bpy.data.cameras):
        for data in list(blocks):
            if data.name.startswith(PREFIX) and not data.users:blocks.remove(data)
    scene.unit_settings.system='METRIC';scene.view_settings.view_transform='AgX'
    world=bpy.data.worlds.get(PREFIX+'World') or bpy.data.worlds.new(PREFIX+'World')
    world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.09,.13,.15,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.25;scene.world=world
    root=bpy.data.objects.new(PREFIX+'Architecture',None)
    root['asset']='blackout-transit-v1';root['visualOnly']=True
    scene.collection.objects.link(root)
    for name,(tint,rough,metal) in PALETTE.items():
        material=bpy.data.materials.new(PREFIX+name)
        material.diffuse_color=(*tint,1);material.use_nodes=True;material.use_backface_culling=True
        shader=material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value=(*tint,1)
        shader.inputs['Roughness'].default_value=rough;shader.inputs['Metallic'].default_value=metal
        vertex=material.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='wear'
        multiply=material.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY'
        multiply.inputs[0].default_value=1;multiply.inputs[1].default_value=(*tint,1)
        material.node_tree.links.new(vertex.outputs['Color'],multiply.inputs[2])
        material.node_tree.links.new(multiply.outputs[0],shader.inputs['Base Color'])
    print('Separate flooded-distribution studio ready; existing scenes retained.')


def mesh(name,vertices,faces,finish,region='Entry',bevel=0):
    data=bpy.data.meshes.new(PREFIX+name)
    data.from_pydata([xyz(p) for p in vertices],[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    if all(e.is_manifold for e in bm.edges):bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bevel:
        bmesh.ops.bevel(bm,geom=[e for e in bm.edges if e.is_manifold],offset=bevel,
                        segments=1,affect='EDGES',clamp_overlap=True)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data);bm.free()
    uv=data.uv_layers.new(name='MetricUV')
    wear=data.color_attributes.new(name='wear',type='FLOAT_COLOR',domain='POINT')
    for v in data.vertices:
        x,y,z=v.co.x,v.co.z,-v.co.y
        shade=.82+.18*(.5+.5*math.sin(x*.73+z*.39+math.sin(y*1.2+z*.19)))
        wet=max(0,1-abs(y+.4)/1.7)
        if finish=='Deck':
            # Baked vertex grime: broad oily patches and small uneven scuffs,
            # without another image, shader stage or transparent decal layer.
            patch=max(0,math.sin(x*.91+z*.63+math.sin(z*.39))*math.sin(z*1.23-x*.41))**2
            grit=.5+.5*math.sin(x*17.3+z*11.7)*math.sin(z*19.1-x*7.7)
            tone=.76+.14*grit-.30*patch
            wear.data[v.index].color=(tone*(1-.12*patch),tone*(1-.17*patch),tone*(1-.26*patch),1)
        else:wear.data[v.index].color=(shade*(1-.24*wet),shade*(1-.13*wet),shade*(1-.28*wet),1)
    for p in data.polygons:
        components=[abs(v) for v in p.normal];axis=components.index(max(components))
        for i in p.loop_indices:
            v=data.vertices[data.loops[i].vertex_index].co
            a,b=(v.y,v.z) if axis==0 else (v.x,v.z) if axis==1 else (v.x,v.y)
            uv.data[i].uv=(a/2,b/2)
    data.materials.append(bpy.data.materials[PREFIX+finish])
    obj=bpy.data.objects.new(PREFIX+name,data);bpy.context.scene.collection.objects.link(obj)
    obj.parent=owner(region);obj['finish']=finish;obj['region']=region;obj['visualOnly']=True
    return obj


def box(name,size,at,finish='Alloy',region='Entry',bevel=0):
    x,y,z=at;a,b,c=[v/2 for v in size]
    return mesh(name,[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                     (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)],
                [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],
                finish,region,min(bevel,min(size)*.18))


def quad(name,vertices,finish,normal,region='Entry'):
    vv=[Vector(p) for p in vertices]
    if (vv[1]-vv[0]).cross(vv[2]-vv[0]).dot(Vector(normal))<0:vertices=list(reversed(vertices))
    if finish=='Deck' and len(vertices)==4:
        a,b,c,d=[Vector(p) for p in vertices]
        nx=max(1,math.ceil(max((b-a).length,(c-d).length)/.7))
        nz=max(1,math.ceil(max((d-a).length,(c-b).length)/.7))
        points=[tuple(a.lerp(b,i/nx).lerp(d.lerp(c,i/nx),j/nz)) for j in range(nz+1) for i in range(nx+1)]
        faces=[(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i)
               for j in range(nz) for i in range(nx)]
        return mesh(name,points,faces,finish,region)
    return mesh(name,vertices,[tuple(range(len(vertices)))],finish,region)


def tube(name,a,b,radius,finish='Alloy',sides=12,region='Entry'):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized()
    reference=Vector((0,1,0)) if abs(direction.y)<.9 else Vector((1,0,0))
    u=direction.cross(reference).normalized();v=direction.cross(u)
    vertices=[tuple(p+radius*(u*math.cos(math.tau*i/sides)+v*math.sin(math.tau*i/sides)))
              for p in (a,b) for i in range(sides)]
    faces=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
    faces.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
    return mesh(name,vertices,faces,finish,region)


def ring(name,x,y,z,inner,outer,height,finish='Alloy',region='Entry',sides=24):
    vertices=[(x+r*math.cos(math.tau*i/sides),h,z+r*math.sin(math.tau*i/sides))
              for h,r in [(y,outer),(y-height,outer),(y,inner),(y-height,inner)] for i in range(sides)]
    faces=[]
    for i in range(sides):
        j=(i+1)%sides
        faces.extend([(i,j,sides+j,sides+i),(2*sides+j,2*sides+i,3*sides+i,3*sides+j),
                      (i,2*sides+i,2*sides+j,j),(sides+j,3*sides+j,3*sides+i,sides+i)])
    return mesh(name,vertices,faces,finish,region)


def label(name,body,at,size,normal=(0,0,1),region='Entry'):
    # Built-in Blender Bfont is converted to ordinary triangles, never a texture.
    data=bpy.data.curves.new(PREFIX+'temporary-lettering','FONT')
    data.body=body;data.size=size;data.align_x='CENTER';data.align_y='CENTER';data.resolution_u=1
    obj=bpy.data.objects.new(PREFIX+'temporary-lettering',data);bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH');obj=bpy.context.view_layer.objects.active
    up=Vector((0,1,0));n=Vector(normal);right=up.cross(n).normalized()
    vertices=[tuple(Vector(at)+right*v.co.x+up*v.co.y+n*v.co.z) for v in obj.data.vertices]
    faces=[tuple(p.vertices) for p in obj.data.polygons]
    old=obj.data;bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(old)
    return mesh(name,vertices,faces,'Letter',region)


def deck(name,x,top,z,width,depth,region,engine=False):
    # Containment Room 2 inset tread/corner markers, with one owner per face.
    gx=[-width/2,-width/2+.13,-width/2+.23,width/2-.23,width/2-.13,width/2]
    gz=[-depth/2,-depth/2+.13,-depth/2+.23,depth/2-.23,depth/2-.13,depth/2]
    for i in range(5):
        for j in range(5):
            finish='Amber' if i in (1,3) and j in (1,3) else 'Alloy' if i in (0,4) or j in (0,4) else 'Deck'
            quad(name+f'_tread_{i}_{j}',[(x+gx[i],top,z+gz[j]),(x+gx[i+1],top,z+gz[j]),
                 (x+gx[i+1],top,z+gz[j+1]),(x+gx[i],top,z+gz[j+1])],finish,(0,1,0),region)
    corners=[(x-width/2,z-depth/2),(x+width/2,z-depth/2),
             (x+width/2,z+depth/2),(x-width/2,z+depth/2)]
    for i,normal in enumerate([(0,0,-1),(1,0,0),(0,0,1),(-1,0,0)]):
        # The apron shares its west boundary with the main exit/ramp union.
        if name=='Exit_apron' and i in [0,3]:continue
        a,b=corners[i],corners[(i+1)%4]
        bottom_a=(a[0],top-.15,a[1]+(.15*1.38/10 if name=='Exit_apron' and i==1 else 0))
        quad(name+'_edge_'+str(i),[(a[0],top,a[1]),(b[0],top,b[1]),
             (b[0],top-.15,b[1]),bottom_a],'Alloy',normal,region)
    box(name+'_armour',(width-.10,.24,depth-.10),(x,top-.29,z),'Graphite',region,.035)
    if engine:
        for side in [-1,1]:
            box(name+'_rail_'+str(side),(.1,.13,depth*.8),(x+side*width*.32,top-.49,z),'Alloy',region,.018)
            box(name+'_tie_'+str(side),(width*.64-.1,.10,.1),(x,top-.49,z+side*depth*.25),'Alloy',region,.015)
        tube(name+'_engine',(x,top-.72,z),(x,top-1.0,z),.30,'Graphite',16,region)
        tube(name+'_engine_mount',(x,top-.72,z),(x,top-.42,z),.12,'Alloy',12,region)
        harness(name,width,depth,x,top,z,region)


def harness(name,w,d,x,top,z,region):
    # Canonical Containment Room 2 annular cradle and four splayed struts.
    ring(name+'_cradle',x,top-.80,z,.40,.51,.14,'Alloy',region)
    for sx in [-1,1]:
        for sz in [-1,1]:
            tag=name+f'_harness_{sx}_{sz}';mount=(x+sx*w*.32,top-.60,z+sz*d*.25)
            box(tag+'_clevis',(.19,.18,.27),mount,'Graphite',region,.025)
            tube(tag+'_brace',mount,(x+sx*.32,top-.87,z+sz*.32),.055,'Alloy',12,region)
            box(tag+'_latch',(.022,.07,.12),(mount[0]+sx*.118,top-.60,mount[2]),'Amber',region)


def build_shell():
    for side in [-1,1]:
        for station,(a,b) in enumerate([(79.79,104),(104,128),(128,156.21)]):
            region=('West' if side<0 else 'East')+str(station)
            box(region+'_backing',(.42,23.2,b-a),(side*22.18,10.1,(a+b)/2),'Graphite',region)
            box(region+'_wet_skirt',(.22,2.0,b-a),(side*21.61,-.1,(a+b)/2),'Alloy',region)
            for low,high in [(.92,6.75),(6.95,13.65),(13.85,18.95)]:
                for j in range(4):
                    z0=a+j*(b-a)/4;z1=a+(j+1)*(b-a)/4
                    # Entire west lower field becomes recessed switchgear bays.
                    if side<0 and high<7:continue
                    quad(region+f'_panel_{low}_{j}',[(side*21.5,low,z0+.12),(side*21.5,high,z0+.12),
                         (side*21.5,high,z1-.12),(side*21.5,low,z1-.12)],'Paint',(-side,0,0),region)
            for y,h in [(6.85,.16),(13.75,.16),(19.10,.24)]:
                box(region+'_seam_'+str(y),(.28,h,b-a),(side*21.60,y,(a+b)/2),'Graphite',region)
            for z in [a+.12,a+(b-a)/2,b-.12]:
                for low,high in [(1.0,6.73),(6.97,13.63),(13.87,18.95)]:
                    box(region+f'_rib_{z}_{low}',(.32,high-low,.20),(side*21.56,(low+high)/2,z),'Alloy',region)
            # Chamfered upper return joins the roof rather than floating beams.
            quad(region+'_vault_return',[(side*21.5,19.25,a),(side*21.5,19.25,b),
                 (side*15.5,22,b),(side*15.5,22,a)],'Graphite',(-side,-1,0),region)
            quad(region+'_roof',[(-15.5,22,a),(15.5,22,a),(15.5,22,b),(-15.5,22,b)],'Graphite',(0,-1,0),'Roof'+str(station)) if side<0 else None
    # End partitions retain both entry bores and the original exit hallway.
    for name,a,b in [('West',-21.5,-16.75),('Middle',-15.25,3),('East',9,21.5)]:
        box('Entry_'+name+'_backing',(b-a,23,.16),((a+b)/2,10.5,80.10),'Graphite','Entry')
        for low,high in [(.92,6.75),(6.95,13.65),(13.85,19.0)]:
            quad('Entry_'+name+'_face_'+str(low),[(a,low,80.25),(b,low,80.25),(b,high,80.25),(a,high,80.25)],'Paint',(0,0,1),'Entry')
    box('Entry_above_main',(6,17.15,.16),(6,13.425,80.10),'Graphite','Entry')
    box('Entry_above_duct',(1.5,16.95,.16),(-16,13.525,80.10),'Graphite','Entry')
    box('Entry_below_duct',(1.46,3.3,.16),(-16,.65,80.10),'Graphite','Entry')
    for sign in [-1,1]:
        box('Exit_backing_'+str(sign),(17.5,23,.36),(sign*12.75,10.5,156.18),'Graphite','Exit')
        quad('Exit_face_'+str(sign),[(sign*4,.92,155.75),(sign*21.5,.92,155.75),
             (sign*21.5,19,155.75),(sign*4,19,155.75)],'Paint',(0,0,-1),'Exit')
    box('Exit_header',(8,15.9,.36),(0,14.05,156.18),'Graphite','Exit')
    for index,z in enumerate([88.7,105.7,128.7,148.7]):
        region='Roof'+str(min(index,2))
        tube('Vault_crosshead_'+str(index),(-15.5,21.75,z),(15.5,21.75,z),.16,'Alloy',8,region)
        for sign in [-1,1]:
            tube('Vault_knee_'+str(index)+'_'+str(sign),(sign*21.2,19.1,z),(sign*15.5,21.75,z),.16,'Alloy',8,region)
    print('Sealed faceted enclosure and connected roof structure built.')


def portal(name,x,z,width,bottom,height,region,depth=.46):
    for sign in [-1,1]:
        box(name+'_column_'+str(sign),(.28,height-.34,depth),(x+sign*(width/2+.11),bottom+.34+(height-.34)/2,z),'Alloy',region,.03)
        box(name+'_shoe_'+str(sign),(.34,.34,depth+.06),(x+sign*(width/2+.11),bottom+.17,z),'Graphite',region,.025)
    box(name+'_lintel',(width+.50,.30,depth),(x,bottom+height+.15,z),'Alloy',region,.03)
    box(name+'_drive_case',(width+.74,.46,depth+.19),(x,bottom+height+.52,z),'Graphite',region,.04)


def build_landings():
    deck('Entry_landing',6,.4,84,22,8,'Entry')
    portal('Main_entry',6,80.24,6,.4,4.1,'Entry')
    portal('Service_duct',-16,80.24,1.5,2.5,2.2,'Entry')
    box('Entry_directory_back',(7.0,1.1,.10),(6,6.15,80.28),'Graphite','Entry')
    label('Entry_directory','DISTRIBUTION  /  02',(6,6.15,80.36),.45,region='Entry')
    for i,(x,top,z,w,d) in enumerate([(10,1,94,4.8,3.5),(10.5,1.2,102,4.8,3.5),
                                    (10,4.2,118,4.8,3.5),(9.5,4.4,126,4.8,3.5),(10,7.6,142.5,5.2,4.2)]):
        deck('Bob_landing_'+str(i),x,top,z,w,d,'Bob'+str(i//2),True)
    for name in ['LiftA','LiftB']:
        deck(name,0,.25,0,4.8,4,name)
        for x in [-1.6,1.6]:
            for z in [-1.2,1.2]:harness(name+f'_engine_{x}_{z}',1.2,1.2,x,.25,z,name)
        # Fitted panel carries the existing remote contact and keeps it exposed.
        box(name+'_contact_column',(.14,1.88,.22),(-2.85,1.0,0),'Alloy',name,.025)
        box(name+'_contact_back',(.69,.79,.13),(-2.85,2.1,.29),'Graphite',name,.025)
        for sign in [-1,1]:
            box(name+'_contact_cheek_'+str(sign),(.07,.70,.33),(-2.85+sign*.355,2.1,.05),'Copper',name,.008)
    # Static guide shields retain the original lateral collision envelopes.
    for lift_tag,z,lo,hi in [('A',110,.85,4.55),('B',134,4.05,7.95)]:
        for sign in [-1,1]:
            x=10+sign*2.48;region='Bob0' if lift_tag=='A' else 'Bob2'
            box('Lift_'+lift_tag+'_guide_'+str(sign),(.12,hi-lo,4.3),(x,(lo+hi)/2,z),'Graphite',region)
            for zz in [z-2.08,z+2.08]:
                box('Lift_'+lift_tag+f'_guide_edge_{sign}_{zz}',(.20,hi-lo-.04,.12),(x,(lo+hi)/2,zz),'Alloy',region)
            box('Lift_'+lift_tag+'_guide_cap_'+str(sign),(.24,.12,4.3),(x,hi+.06,z),'Amber',region)
    for i,(x,y,z,h,d) in enumerate([(7,4.7,98.3,6.2,3.6),(7,5.5,122.4,6.4,3.6),(6.85,9.1,142.5,7,4.8)]):
        region='Bob'+str(i)
        # Existing adhesion faces remain the only sticky render/collision owner.
        for zz in [z-d/2-.14,z+d/2+.14]:
            box('Adhesion_'+str(i)+'_'+str(zz),(.30,h,.15),(x-.03,y,zz),'Alloy',region)
        for yy in [y-h/2-.10,y+h/2+.10]:
            box('Adhesion_cap_'+str(i)+'_'+str(yy),(.30,.16,d+.43),(x-.03,yy,z),'Graphite',region)
    # Pressure-button recess surrounds the live, unchanged switch face.
    for z in [141.92,143.08]:box('Bridge_button_cheek_'+str(z),(.24,1.0,.12),(7.09,8.55,z),'Amber','Bob2',.02)
    for y in [8.01,9.09]:box('Bridge_button_cap_'+str(y),(.24,.12,1.28),(7.09,y,142.5),'Alloy','Bob2',.02)
    print('Canonical landing decks, moving lift harnesses and framed adhesion modules built.')


def build_switchgear():
    for station,(a,b) in enumerate([(80.4,103.6),(104.4,127.6),(128.4,155.6)]):
        region='West'+str(station)
        # Recessed equipment sits behind the protected wall collision plane.
        for index in range(4):
            z=a+(index+.5)*(b-a)/4
            box(region+'_cabinet_'+str(index),(.42,5.45,4.35),(-21.76,3.78,z),'Graphite',region,.035)
            box(region+'_cover_'+str(index),(.08,4.83,4.02),(-21.49,3.78,z),'Paint',region,.02)
            for offset in [-1.28,0,1.28]:
                box(region+f'_fuse_{index}_{offset}',(.07,1.1,.32),(-21.40,4.18,z+offset),'Alloy',region,.018)
                tube(region+f'_bus_{index}_{offset}',(-21.39,1.65,z+offset),(-21.39,3.49,z+offset),.045,'Copper',10,region)
            box(region+'_drawer_'+str(index),(.10,.45,3.9),(-21.39,1.19,z),'Alloy',region,.02)
        # Suspended busbar trunk follows the old maintenance line.
        box(region+'_bus_trunk',(.42,.46,b-a),(-19,17.5,(a+b)/2),'Graphite',region)
        for x in [-19.23,-18.77]:box(region+'_trunk_flange_'+str(x),(.05,.57,b-a-.12),(x,17.5,(a+b)/2),'Alloy',region)
    for i,region in enumerate(['BankA','BankB','BankC','BankD']):
        x,y,z=POSES[region]
        # All housing coordinates are local to the original electrical receiver.
        box(region+'_hood',(3.0,.28,1.12),(0,.43,0),'Graphite',region,.035)
        for sign in [-1,1]:
            box(region+'_end_'+str(sign),(.18,.45,1.05),(sign*1.41,0,0),'Alloy',region,.025)
            box(region+'_rim_'+str(sign),(2.60,.08,.10),(0,-.18,sign*.51),'Alloy',region,.012)
        suspension(region,y)
        box(region+'_nameplate',(1.7,.22,.04),(0,.45,-.59),'Paint',region,.008)
        label(region+'_legend','BANK '+chr(65+i),(0,.45,-.625),.16,(0,0,-1),region)
    print('Recessed switchgear and ceiling-suspended light banks built.')


def build_volt_gantry():
    # Rebuild the entire protected route as a modular service gantry. The
    # original 2.8 x 50 m footprint, rail envelope and launch pose remain exact.
    for panel in range(14):
        a=86+panel*50/14;b=86+(panel+1)*50/14
        gx=[-17.4,-17.27,-17.17,-14.83,-14.73,-14.6]
        gz=[a,a+.13,a+.23,b-.23,b-.13,b]
        for i in range(5):
            for j in range(5):
                finish='Amber' if i in [1,3] and j in [1,3] else 'Alloy' if i in [0,4] or j in [0,4] else 'Deck'
                pieces=outside_approach([(gx[i],gz[j]),(gx[i+1],gz[j]),(gx[i+1],gz[j+1]),(gx[i],gz[j+1])])
                for k,polygon in enumerate(pieces):
                    quad(f'Gantry_panel_{panel}_{i}_{j}_{k}',[(x,2.5,z) for x,z in polygon],finish,(0,1,0),'Volt')
    for x,normal in [(-17.4,(-1,0,0)),(-14.6,(1,0,0))]:
        quad('Gantry_deck_edge_'+str(x),[(x,2.28,86),(x,2.5,86),(x,2.5,136),(x,2.28,136)],'Alloy',normal,'Volt')
    box('Gantry_recessed_undertray',(2.56,.18,49.88),(-16,2.16,111),'Graphite','Volt')
    for x in [-17.25,-14.75]:
        box('Gantry_side_girder_'+str(x),(.10,.24,49.8),(x,2.16,111),'Alloy','Volt')
        # Open tubular guards replace the old solid rusty slabs. Their height
        # and location fit the existing 0.42 m collision barrier exactly.
        tube('Gantry_handrail_'+str(x),(x,2.885,87),(x,2.885,135),.035,'Alloy',8,'Volt')
        tube('Gantry_midrail_'+str(x),(x,2.72,87),(x,2.72,135),.022,'Alloy',8,'Volt')
        box('Gantry_toe_rail_'+str(x),(.07,.06,47.8),(x,2.59,111),'Graphite','Volt')
        for post in range(13):
            z=87.18+post*47.64/12
            box(f'Gantry_post_{x}_{post}',(.09,.32,.09),(x,2.70,z),'Alloy','Volt',.008)
            box(f'Gantry_post_foot_{x}_{post}',(.18,.04,.20),(x,2.52,z),'Graphite','Volt',.006)
    for z in [88,94,100,106,112,118,124,130,134]:
        box('Gantry_wall_plate_'+str(z),(.14,1.65,.26),(-21.32,1.475,z),'Alloy','Volt',.02)
        box('Gantry_cross_bearer_'+str(z),(6.55,.18,.18),(-18.025,2.0,z),'Alloy','Volt')
        tube('Gantry_diagonal_'+str(z),(-21.25,.85,z),(-14.9,1.92,z),.07,'Alloy',10,'Volt')
    # The rotated launch landing now belongs to the same metal kit. Its centre,
    # width/depth and top coincide with the original jump/bridge anchor.
    along=Vector((16,0,8)).normalized();across=Vector((-along.z,0,along.x))
    gx=[-1.75,-1.62,-1.52,1.52,1.62,1.75];gz=[-1.9,-1.77,-1.67,1.67,1.77,1.9]
    for i in range(5):
        for j in range(5):
            finish='Amber' if i in [1,3] and j in [1,3] else 'Alloy' if i in [0,4] or j in [0,4] else 'Deck'
            points=[Vector((-16,2.5,136))+along*x+across*z for x,z in
                    [(gx[i],gz[j]),(gx[i+1],gz[j]),(gx[i+1],gz[j+1]),(gx[i],gz[j+1])]]
            quad(f'Gantry_launch_tread_{i}_{j}',[tuple(v) for v in points],finish,(0,1,0),'Volt')
    corners=[Vector((-16,2.5,136))+along*x+across*z for x,z in [(-1.75,-1.9),(1.75,-1.9),(1.75,1.9),(-1.75,1.9)]]
    for i,n in enumerate([-across,along,across,-along]):
        a,b=corners[i],corners[(i+1)%4]
        quad('Gantry_launch_edge_'+str(i),[tuple(a),tuple(b),tuple(b-Vector((0,.22,0))),tuple(a-Vector((0,.22,0)))],
             'Alloy',tuple(n),'Volt')
    # A recessed rotated undertray sits clear of all deck edges and mechanics.
    undertray=box('Gantry_launch_undertray',(3.30,.16,3.60),(0,0,0),'Graphite','Volt',.03)
    basis=Matrix((xyz(along),xyz(-across),xyz((0,1,0)))).transposed().to_4x4()
    undertray.data.transform(Matrix.Translation(Vector(xyz((-16,2.10,136))))@basis)
    print('Complete service gantry rebuilt: inset panels, tubular guards, wall brackets and matching launch landing.')


def suspension(region,y):
    # Plain metal beams attach directly to the ceiling. No orange lamp feeds.
    top=21.88-y;bottom=.60
    box(region+'_ceiling_plate',(2.30,.18,.70),(0,21.91-y,0),'Alloy',region)
    for sign in [-1,1]:
        box(region+'_hanger_'+str(sign),(.10,top-bottom,.12),(sign*.95,(top+bottom)/2,0),'Alloy',region)
        box(region+'_hanger_shoe_'+str(sign),(.24,.18,.24),(sign*.95,.63,0),'Alloy',region,.02)


def half_plane(polygon,a,b,inside):
    result=[]
    for i,p in enumerate(polygon):
        q=polygon[(i+1)%len(polygon)]
        dp=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
        dq=(b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0])
        pin=dp>=0 if inside else dp<=0;qin=dq>=0 if inside else dq<=0
        if pin:result.append(p)
        if pin!=qin:
            t=dp/(dp-dq);result.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
    return result


def outside_approach(polygon):
    # Original rotated approach slab owns the shared top, including its exact
    # oblique boundary. Only the exposed remainder of the catwalk is exported.
    along=Vector((16,0,8)).normalized();across=Vector((-along.z,0,along.x))
    corners=[Vector((-16,2.5,136))+along*x+across*z for x,z in [(-1.75,-1.9),(1.75,-1.9),(1.75,1.9),(-1.75,1.9)]]
    clip=[(v.x,v.z) for v in corners];pieces=[];rest=polygon
    for i,a in enumerate(clip):
        if len(rest)<3:break
        b=clip[(i+1)%len(clip)];outside=half_plane(rest,a,b,False)
        if len(outside)>=3:pieces.append(outside)
        rest=half_plane(rest,a,b,True)
    return pieces


def build_basin():
    # Recessed drain mouths occupy the east skirt, away from open attack routes.
    for i,z in enumerate([91,111,131,150]):
        region='East'+str(min(i,2))
        box('Drain_recess_'+str(i),(.10,1.1,3.0),(21.43,.02,z),'Graphite',region)
        for k in range(6):
            box('Drain_bar_'+str(i)+'_'+str(k),(.09,.9,.07),(21.32,.02,z-1.2+k*.48),'Alloy',region)
        box('Drain_header_'+str(i),(.17,.13,3.18),(21.36,.64,z),'Alloy',region)
    # No central debris or new cover can obstruct the three sewer-drone cones.
    for i,z in enumerate([97,118,139]):
        region='East'+str(i)
        box('Gallery_reveal_'+str(i),(.10,4.2,6.4),(21.40,15.9,z),'Graphite',region)
        # Opaque dark glazing avoids extra transparent layers and live interiors.
        quad('Gallery_glazing_'+str(i),[(21.32,14,z-2.9),(21.32,17.8,z-2.9),
             (21.32,17.8,z+2.9),(21.32,14,z+2.9)],'Window',(-1,0,0),region)
        for yy in [13.91,17.89]:box('Gallery_sill_'+str(i)+'_'+str(yy),(.22,.14,6.20),(21.28,yy,z),'Alloy',region)
        for zz in [z-3.03,z,z+3.03]:box('Gallery_mullion_'+str(i)+'_'+str(zz),(.22,3.80,.10),(21.28,15.9,zz),'Alloy',region)
    # Shallow service-well lips mark the three authored emergence locations.
    # Their open centres leave the entire moving drone and scanner cones clear.
    for i,(x,z,region) in enumerate([(18,100,'East0'),(18,124,'East1'),(-11.5,132,'Volt')]):
        ring('Flooded_drone_well_'+str(i),x,-.90,z,1.52,1.85,.10,'Alloy',region)
    print('Drainage, three flooded service wells and opaque control-gallery glazing built.')


def build_bridge_and_exit():
    # The full-pose bridge remains a child of the existing scaled/rotated slab.
    w=BRIDGE_LENGTH;region='Bridge'
    for j in range(3):
        a=-1.8+j*1.2;b=a+1.2
        quad('Bridge_tread_'+str(j),[(-w/2,.225,a),(w/2,.225,a),(w/2,.225,b),(-w/2,.225,b)],
             'Deck' if j==1 else 'Alloy',(0,1,0),region)
    for side in [-1,1]:
        # Side girders stay below the protected deck top, never railings.
        box('Bridge_girder_'+str(side),(w,.44,.12),(0,-.005,side*1.74),'Graphite',region)
        box('Bridge_flange_'+str(side),(w-.12,.05,.22),(0,-.175,side*1.65),'Alloy',region)
    for i in range(6):
        box('Bridge_crossmember_'+str(i),(.12,.10,3.10),(-w/2+(i+.5)*w/6,-.13,0),'Alloy',region)
    # End landing and the final gathering deck match all original top heights.
    # A real rotated box supplies the docking collision. Trim only the static
    # render overlap with the adjoining exit deck; the bridge meets its edge.
    deck('Exit_anchor',0,.4,0,7,7,'Exit')
    along=Vector((16,0,8)).normalized();across=Vector((-along.z,0,along.x))
    centre=BRIDGE_END+along*3.5;centre.y=0
    basis=Matrix((xyz(along),xyz(-across),xyz((0,1,0)))).transposed().to_4x4()
    transform=Matrix.Translation(Vector(xyz(centre)))@basis
    for obj in list(bpy.context.scene.objects):
        if not obj.name.startswith(PREFIX+'Exit_anchor'):continue
        obj.data.transform(transform)
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=xyz((0,0,147)),plane_no=xyz((0,0,1)),clear_outer=True,dist=.000001)
        bm.to_mesh(obj.data);bm.free();obj.data.update()
    deck('Exit_landing',0,.4,151,14,8,'Exit')
    deck('Exit_apron',10.5,.4,152.5,7,5,'Exit')
    # The last untreated ramp and hallway floor share the same worn metal kit.
    # These replace their old renders, preserving the original support heights.
    for i in range(5):
        a=140+i*2;b=a+2
        ya=-.98+(a-140)*1.38/10;yb=-.98+(b-140)*1.38/10
        quad('Exit_ramp_'+str(i),[(7,ya,a),(14,ya,a),(14,yb,b),(7,yb,b)],'Deck',(0,1,-.138),'Exit')
    for i in range(5):
        a=155+i*3.8;b=a+3.8;region='Hall'+str(0 if a<165 else 1)
        deck('Hall_floor_'+str(i),0,.4,(a+b)/2,8.8,b-a,region)
    # West launch housing surrounds, rather than covers, the diagonal approach.
    for z in [133.65,138.35]:
        box('Bridge_launch_cheek_'+str(z),(4.1,.85,.24),(-16,1.82,z),'Alloy','Volt',.035)
    box('Bridge_drive_housing',(1.1,1.25,3.6),(-18.5,1.1,136),'Graphite','Volt',.06)
    tube('Bridge_drive_drum',(-18.35,1.5,134.7),(-18.35,1.5,137.3),.30,'Alloy',20,'Volt')
    portal('Exit_bulkhead',0,156,8,.4,5.4,'Exit',.85)
    # The live contact at y=3.165 stays visible below this fixed, jammed shutter.
    box('Exit_shutter',(7.9,5.27,.26),(0,5.865,156),'Graphite','Exit')
    for y in [3.65,4.65,5.65,6.65,7.65]:
        box('Shutter_blade_'+str(y),(7.65,.78,.08),(0,y,155.79),'Alloy','Exit',.018)
    for x in [-3.65,3.65]:box('Shutter_caution_'+str(x),(.13,4.8,.055),(x,5.95,155.72),'Amber','Exit')
    # This original crate is still load-bearing at y=.4..3.1. A fitted shipping
    # case replaces its old render, and the shutter's lower rail stays untouched.
    box('Crate_body',(2.2,2.7,1.8),(1.75,1.75,156.15),'Paint','Exit',.035)
    for z in [155.19,157.11]:
        for y in [.55,2.95]:box('Crate_band_'+str(z)+'_'+str(y),(2.20,.16,.08),(1.75,y,z),'Alloy','Exit')
        for x in [.78,2.72]:box('Crate_edge_'+str(z)+'_'+str(x),(.13,2.04,.08),(x,1.75,z),'Graphite','Exit')
    box('Crate_shipping_plate',(.7,.4,.05),(1.8,1.95,155.08),'Graphite','Exit')
    label('Crate_shipping_legend','LOCKOUT',(1.8,1.95,155.04),.12,(0,0,-1),'Exit')
    for sign in [-1,1]:
        for i,(a,b) in enumerate([(156.45,165),(165,174)]):
            region='Hall'+str(i)
            quad('Hall_liner_'+str(sign)+'_'+str(i),[(sign*4.0,.4,a),(sign*4.0,5.8,a),
                 (sign*4.0,5.8,b),(sign*4.0,.4,b)],'Paint',(-sign,0,0),region)
            for z in [a+.14,(a+b)/2,b-.14]:
                box('Hall_frame_'+str(sign)+'_'+str(z),(.14,4.9,.12),(sign*3.93,3.08,z),'Alloy',region)
            box('Hall_skirt_'+str(sign)+'_'+str(i),(.15,.15,b-a),(sign*3.92,.53,(a+b)/2),'Graphite',region)
    print('Below-deck bridge girders, deployment machinery and jammed exit bulkhead built.')


def preview():
    scene=bpy.context.scene
    for i,(eye,energy,tint) in enumerate([((3,18,91),5200,(.83,.91,1)),
                                         ((0,19,116),6000,(1,.84,.56)),
                                         ((-5,16,141),4500,(.75,.88,.87))]):
        data=bpy.data.lights.new(PREFIX+'Studio_'+str(i),'AREA')
        data.energy=energy;data.shape='DISK';data.size=12;data.color=tint
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj)
        obj.location=xyz(eye);obj['previewOnly']=True
    # Preview liquid supplies scale only; gameplay retains its own acid shader.
    water=quad('Studio_liquid',[(-21.5,-.98,80),(-21.5,-.98,156),(21.5,-.98,156),(21.5,-.98,80)],'Window',(0,1,0))
    water.parent=None;water['previewOnly']=True
    data=bpy.data.cameras.new(PREFIX+'Studio_camera')
    camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    camera.location=xyz((3,8,84));camera.rotation_euler=(Vector(xyz((-1,6,123)))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.lens=21;camera['previewOnly']=True;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    frame()


def frame(eye=(3,8,84),target=(-1,6,123)):
    for area in bpy.context.screen.areas if bpy.context.screen else ():
        if area.type=='VIEW_3D':
            space=area.spaces.active;space.shading.type='MATERIAL';space.overlay.show_overlays=False
            space.lens=21;space.clip_end=400
            direction=Vector(xyz(target))-Vector(xyz(eye))
            space.region_3d.view_rotation=direction.to_track_quat('-Z','Y')
            space.region_3d.view_location=xyz(target);space.region_3d.view_distance=direction.length
            space.region_3d.view_perspective='PERSP'
            if not bpy.app.background:space.region_3d.update()


def export_asset():
    source=bpy.data.objects[PREFIX+'Architecture'];source.name=PREFIX+'Editable'
    root=bpy.data.objects.new(PREFIX+'Architecture',None)
    root['asset']='blackout-transit-v1';root['visualOnly']=True;bpy.context.scene.collection.objects.link(root)
    owned=[]
    try:
        groups={}
        for child in source.children_recursive:
            if child.type!='MESH':continue
            obj=child.copy();obj.data=child.data.copy();owned.append(obj.data)
            bpy.context.scene.collection.objects.link(obj);obj.parent=root
            obj.location=(0,0,0);obj.rotation_euler=(0,0,0);obj.scale=(1,1,1)
            groups.setdefault((obj['region'],obj['finish']),[]).append(obj)
        for (region,finish),objects in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            obj=bpy.context.view_layer.objects.active;obj.name=PREFIX+'Batch_'+region+'_'+finish
            obj['region']=region;obj['finish']=finish;owned.append(obj.data)
        bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
        for obj in root.children:obj.select_set(True)
        bpy.context.view_layer.objects.active=root
        bpy.ops.export_scene.gltf(filepath=HERE+'/transit-hall.glb',export_format='GLB',
            use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,
            export_cameras=False,export_lights=False,export_animations=False,export_materials='PLACEHOLDER')
    finally:
        for obj in list(root.children):bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.objects.remove(root,do_unlink=True)
        for data in set(owned):
            if not data.users:bpy.data.meshes.remove(data)
        source.name=PREFIX+'Architecture'
    print('Exported finish/area batches with device-local geometry and no studio objects.')


def save_source():
    old=bpy.context.preferences.filepaths.save_version
    try:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=HERE+'/transit-hall.blend',copy=True)
    finally:bpy.context.preferences.filepaths.save_version=old


if __name__=='__main__':
    setup()
    build_shell()
    build_landings()
    build_switchgear()
    build_volt_gantry()
    build_basin()
    build_bridge_and_exit()
    preview()
    export_asset()
    save_source()
