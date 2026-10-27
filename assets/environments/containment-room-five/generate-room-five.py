"""Original Blender art for the Room 5 containment atrium.

Gameplay reference: frozen RoomFiveGreybox traversal, cell roof and release pivots.
Only R5_ objects in the owned scene regenerate; all meshes are presentation-only.
"""
import bpy
import bmesh
import math
from mathutils import Vector

HERE=__file__[:max(__file__.rfind('/'),__file__.rfind('\\'))]
PREFIX='R5_'
SCENE_NAME='Room 5 Containment Atrium'
PARTS=('Architecture','Escape','Cell','Front','Rear','Left','Right','CarriageOne','CarriageTwo','Locks','Status','ButtonCap')
FINISHES={
    'Ivory':((.88,.86,.79),.5,0),'Cool':((.43,.53,.55),.5,0),
    'Island':((.57,.62,.61),.6,0),'Resin':((.43,.50,.51),.65,0),
    'Graphite':((.028,.043,.052),.65,.25),'Alloy':((.28,.35,.37),.37,.7),
    'Light':((.76,.86,.88),.4,0),'Screen':((.055,.23,.25),.5,0),
    'Amber':((.52,.28,.06),.5,.12),'Worn':((.47,.53,.54),.85,.15),
    'Glass':((.13,.24,.27),.17,.12),'Sticky':((.38,.55,.50),.6,.05),'Status':((.5,.85,.7),.4,0),
    'Security':((.92,.70,.27),.6,0),
    'VentLight':((.274677,.686685,.539479),.5,0),
}


def xyz(p):
    return (p[0],-p[2],p[1])


def setup():
    scene=bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
    bpy.context.window.scene=scene
    for obj in list(scene.objects):
        if obj.name.startswith(PREFIX):
            bpy.data.objects.remove(obj,do_unlink=True)
    for blocks in (bpy.data.meshes,bpy.data.materials,bpy.data.lights,bpy.data.cameras):
        for block in list(blocks):
            if block.name.startswith(PREFIX) and block.users==0:
                blocks.remove(block)
    scene.unit_settings.system='METRIC'
    scene.view_settings.view_transform='AgX'
    scene.world=bpy.data.worlds.get(PREFIX+'World') or bpy.data.worlds.new(PREFIX+'World')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.10,.14,.17,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
    for part in PARTS:
        root=bpy.data.objects.new(PREFIX+part,None)
        root['asset']='containment-room-five-v1'
        root['visualOnly']=True
        scene.collection.objects.link(root)
    for name,(colour,rough,metal) in FINISHES.items():
        mat=bpy.data.materials.new(PREFIX+name)
        mat.diffuse_color=(*colour,1)
        mat.use_nodes=True
        mat.use_backface_culling=True
        p=mat.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value=(*colour,1)
        p.inputs['Roughness'].default_value=rough
        p.inputs['Metallic'].default_value=metal
        if name in {'Light','Screen','Status','VentLight'}:
            p.inputs['Emission Color'].default_value=(*colour,1)
            p.inputs['Emission Strength'].default_value=1
        if name=='Glass':
            p.inputs['Alpha'].default_value=.19
            mat.surface_render_method='DITHERED'
        if name=='Worn':
            colour_node=mat.node_tree.nodes.new('ShaderNodeVertexColor')
            colour_node.layer_name='wear'
            mat.node_tree.links.new(colour_node.outputs['Color'],p.inputs['Base Color'])
        if name=='Security':
            image=bpy.data.images.load(HERE+'/security-preview.png',check_existing=True)
            image.pack()
            texture=mat.node_tree.nodes.new('ShaderNodeTexImage')
            texture.image=image
            mat.node_tree.links.new(texture.outputs['Color'],p.inputs['Base Color'])
            mat.node_tree.links.new(texture.outputs['Color'],p.inputs['Emission Color'])
            p.inputs['Emission Strength'].default_value=.65
    print('Owned containment-atrium studio initialized; all other scenes retained.')


def mesh(name,vertices,faces,finish,bevel=0,facing=None,region='Architecture',parent=None):
    data=bpy.data.meshes.new(PREFIX+name)
    data.from_pydata([xyz(v) for v in vertices],[],faces)
    data.update()
    bm=bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bevel:
        bmesh.ops.bevel(bm,geom=[edge for edge in bm.edges if edge.is_manifold],
                        offset=bevel,segments=2,profile=.5,affect='EDGES',clamp_overlap=True)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if facing:
        normal=Vector(xyz(facing))
        for face in bm.faces:
            if face.normal.dot(normal)<0:
                face.normal_flip()
    bm.to_mesh(data)
    bm.free()
    uv=data.uv_layers.new(name='UVMap')
    for polygon in data.polygons:
        nx,ny,nz=[abs(v) for v in polygon.normal]
        axis=0 if nx>=ny and nx>=nz else 1 if ny>=nz else 2
        for i in polygon.loop_indices:
            p=data.vertices[data.loops[i].vertex_index].co
            a,b=(p.y,p.z) if axis==0 else (p.x,p.z) if axis==1 else (p.x,p.y)
            uv.data[i].uv=(a/2,b/2)
    if finish=='Worn':
        colours=data.color_attributes.new(name='wear',type='FLOAT_COLOR',domain='POINT')
        for vertex in data.vertices:
            x,z,y=vertex.co.x,-vertex.co.y,vertex.co.z
            low=max(0,min(1,(77-y)/3)) if region in {'Architecture','Cell'} else .2
            stain=low*(.18+.12*(.5+.5*math.sin(x*2.3+z*.8)))
            colours.data[vertex.index].color=(.47*(1-stain),.53*(1-stain),.54*(1-stain*.8),1)
    obj=bpy.data.objects.new(PREFIX+name,data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(bpy.data.materials[PREFIX+finish])
    if parent is None:
        parent=region
    if parent:
        obj.parent=bpy.data.objects[PREFIX+parent]
    obj['visualOnly']=True
    obj['region']=region
    return obj


def box(name,size,position,finish,bevel=.025,region='Architecture',parent=None):
    x,y,z=position
    a,b,c=[v/2 for v in size]
    return mesh(name,[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                     (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)],
                [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],
                finish,min(bevel,min(size)*.2),region=region,parent=parent)


def quad(name,vertices,finish,facing,region='Architecture',parent=None):
    return mesh(name,vertices,[(0,1,2,3)],finish,facing=facing,region=region,parent=parent)


def tube(name,a,b,radius,finish,sides=16,region='Architecture',parent=None):
    direction=(Vector(b)-Vector(a)).normalized()
    right=direction.cross(Vector((0,1,0)))
    if right.length<.01:
        right=direction.cross(Vector((1,0,0)))
    right.normalize()
    up=right.cross(direction).normalized()
    vertices=[]
    for centre in (Vector(a),Vector(b)):
        for i in range(sides):
            angle=math.tau*i/sides
            vertices.append(tuple(centre+radius*(right*math.cos(angle)+up*math.sin(angle))))
    faces=[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    faces.extend((tuple(reversed(range(sides))),tuple(range(sides,2*sides))))
    return mesh(name,vertices,faces,finish,region=region,parent=parent)


def ring(name,centre,inner,outer,depth,finish,axis='y',sides=24,region='Architecture',parent=None):
    vertices=[]
    for h,r in ((-depth/2,outer),(depth/2,outer),(-depth/2,inner),(depth/2,inner)):
        for i in range(sides):
            angle=math.tau*i/sides
            point=(r*math.cos(angle),h,r*math.sin(angle))
            if axis=='x':
                point=(point[1],point[0],point[2])
            if axis=='z':
                point=(point[0],point[2],point[1])
            vertices.append(tuple(centre[j]+point[j] for j in range(3)))
    faces=[]
    for i in range(sides):
        j=(i+1)%sides
        faces.extend(((i,j,sides+j,sides+i),(2*sides+j,2*sides+i,3*sides+i,3*sides+j),
                      (i,2*sides+i,2*sides+j,j),(sides+j,3*sides+j,3*sides+i,sides+i)))
    return mesh(name,vertices,faces,finish,region=region,parent=parent)


def wall(name,u0,u1,y0,y1,axis,at,normal,holes=()):
    us=sorted(set((u0,u1)+tuple(v for h in holes for v in h[:2])))
    ys=sorted(set((y0,y1)+tuple(v for v in (80.25,87.5) if y0<v<y1)+tuple(v for h in holes for v in h[2:])))
    for a,b in zip(us,us[1:]):
        for c,d in zip(ys,ys[1:]):
            u,y=(a+b)/2,(c+d)/2
            if any(lo<u<hi and low<y<high for lo,hi,low,high in holes):
                continue
            finish='Worn' if y<80.25 else 'Cool' if y<87.5 else 'Ivory'
            points=[(at,c,a),(at,d,a),(at,d,b),(at,c,b)] if axis=='x' else [(a,c,at),(b,c,at),(b,d,at),(a,d,at)]
            quad(name+' '+str(a)+' '+str(c),points,finish,normal)


def frame(name,a,b,c,d,at,axis='z',finish='Alloy',width=.12,depth=.12):
    # Four disjoint beams, with deliberate gasket gaps at their butt joints.
    if axis=='z':
        for x in (a-width/2,b+width/2):
            box(name+' upright '+str(x),(width,d-c-.02,depth),(x,(c+d)/2,at),finish,.012)
        for y in ((d+width/2,) if name in {'Entrance portal','Gallery doorway'} else (c-width/2,d+width/2)):
            box(name+' crosspiece '+str(y),(b-a+2*width,width,depth),((a+b)/2,y,at),finish,.012)
    else:
        for z in (a-width/2,b+width/2):
            box(name+' upright '+str(z),(depth,d-c-.02,width),(at,(c+d)/2,z),finish,.012)
        for y in ((d+width/2,) if name in {'Entrance portal','Gallery doorway'} else (c-width/2,d+width/2)):
            box(name+' crosspiece '+str(y),(depth,width,b-a+2*width),(at,y,(a+b)/2),finish,.012)


def build_shell():
    # One interior skin per wall, continuous to the floor. No layered plinths
    # hide an open strip, including on the entire lift-facing entrance wall.
    wall('Lift entrance',-19.8,19.8,74.75,100.55,'z',91.7,(0,0,1),[(7.7,10.3,74.75,78.1)])
    wall('West laboratory',91.7,125.3,74.75,100.55,'x',-19.8,(1,0,0),[(96,101,76,83.5),(111,117,81.5,88.5)])
    wall('East maintenance',91.7,125.3,74.75,100.55,'x',19.8,(-1,0,0))
    wall('Rear gallery',-19.8,19.8,74.75,100.55,'z',125.3,(0,0,-1),[
        (-12,-8,97.5,100.55),(-13.8,-12.05,97.85,100.35),(-7.95,-6.2,97.85,100.35),(-.9,.9,74.75,76.4)])
    for a,b,c,d in ((-19.8,19.8,92.2,104.5),(-19.8,7.7,91.675,92.2),(10.3,19.8,91.675,92.2),(-19.8,19.8,115.5,125.3),(-19.8,-6,104.5,115.5),(6,19.8,104.5,115.5)):
        quad('Atrium floor '+str(a)+' '+str(c),[(a,74.75,c),(b,74.75,c),(b,74.75,d),(a,74.75,d)],'Resin',(0,1,0))
    quad('Lift flush threshold',[(7.7,74.75,91.675),(10.3,74.75,91.675),(10.3,74.75,92.2),(7.7,74.75,92.2)],'Alloy',(0,1,0))
    island=[(-6,106),(-4.5,104.5),(4.5,104.5),(6,106),(6,114),(4.5,115.5),(-4.5,115.5),(-6,114)]
    # The caution border owns its exact floor area: no coplanar decal layer.
    court_patches=(
        ((-4.43,105.42),(4.43,105.42),(4.43,114.58),(-4.43,114.58)),
        ((-4.5,104.5),(4.5,104.5),(5.2,105.2),(-5.2,105.2)),
        ((-5.2,114.8),(5.2,114.8),(4.5,115.5),(-4.5,115.5)),
        ((-5.2,105.2),(-4.65,105.2),(-4.65,114.8),(-5.2,114.8),(-6,114),(-6,106)),
        ((4.65,105.2),(5.2,105.2),(6,106),(6,114),(5.2,114.8),(4.65,114.8)),
    )
    for i,patch in enumerate(court_patches):
        mesh('Containment court '+str(i),[(x,74.75,z) for x,z in patch],[tuple(range(len(patch)))],'Island',facing=(0,1,0))
    for z in (105.31,114.69):
        security_marking('Floor caution cross '+str(z),'caution',(9.3,.22),(0,74.75,z),side='floor')
    for x in (-4.54,4.54):
        security_marking('Floor caution side '+str(x),'caution',(9.16,.22),(x,74.75,110),side='floor-side')
    for i,points in enumerate((((-6,104.5),(-4.5,104.5),(-6,106)),((4.5,104.5),(6,104.5),(6,106)),
        ((6,114),(6,115.5),(4.5,115.5)),((-6,114),(-4.5,115.5),(-6,115.5)))):
        mesh('Court corner '+str(i),[(x,74.75,z) for x,z in points],[(0,1,2)],'Resin',facing=(0,1,0))
    quad('Atrium ceiling',[(-19.8,100.55,91.7),(-19.8,100.55,125.3),(19.8,100.55,125.3),(19.8,100.55,91.7)],'Graphite',(0,-1,0))
    # Reveals end behind the moving Room 4 door's deepest face at Z=91.59.
    for x in (7.7,10.3):
        quad('Entrance sealed return '+str(x),[(x,74.75,91.61),(x,78.1,91.61),(x,78.1,91.7),(x,74.75,91.7)],'Alloy',(1 if x<9 else -1,0,0))
    quad('Entrance sealed soffit',[(7.7,78.1,91.61),(10.3,78.1,91.61),(10.3,78.1,91.7),(7.7,78.1,91.7)],'Graphite',(0,-1,0))
    frame('Entrance portal',7.7,10.3,74.75,78.1,91.80,width=.20,depth=.16)
    for x in (7.45,10.55):
        box('Entrance status '+str(x),(.07,1.15,.03),(x,76.50,91.91),'Screen',.006)
    # Distinct structural bays, kept beside the playable climbing route.
    for x in (-19.64,19.64):
        for z in (92.3,103,124.7):
            box('Atrium pier '+str(x)+' '+str(z),(.18,25.3,.30),(x,87.55,z),'Graphite',.024)
    for z in (95,107.8,122.9):
        box('Roof bridge '+str(z),(39.15,.34,.5),(0,100.25,z),'Alloy',.035)
        for x in (-14,-5,5,14):
            box('Roof luminaire housing '+str(z)+' '+str(x),(3.2,.22,.64),(x,100.00,z),'Graphite',.025)
            quad('Roof diffuser '+str(z)+' '+str(x),[(x-1.48,99.87,z-.23),(x+1.48,99.87,z-.23),(x+1.48,99.87,z+.23),(x-1.48,99.87,z+.23)],'Light',(0,-1,0))
    for z0,z1,y0,y1 in ((96,101,76,83.5),(111,117,81.5,88.5)):
        quad('Plant recess back '+str(z0),[(-20.45,y0,z0),(-20.45,y1,z0),(-20.45,y1,z1),(-20.45,y0,z1)],'Graphite',(1,0,0))
        for z in (z0,z1):
            quad('Plant return '+str(z),[(-20.45,y0,z),(-19.8,y0,z),(-19.8,y1,z),(-20.45,y1,z)],'Alloy',(0,0,1 if z==z0 else -1))
        for y in (y0,y1):
            quad('Plant cap '+str(z0)+' '+str(y),[(-20.45,y,z0),(-19.8,y,z0),(-19.8,y,z1),(-20.45,y,z1)],'Graphite',(0,1 if y==y0 else -1,0))
        frame('Plant bay '+str(z0),z0,z1,y0,y1,-19.68,'x','Alloy',.12,.12)
        for z in (z0+1.25,z1-1.25):
            tube('Plant pressure vessel '+str(z),(-20.06,y0+.45,z),(-20.06,y1-.45,z),.22,'Alloy',20)
            for y in (y0+.8,y1-.8):
                ring('Plant collar '+str(z)+' '+str(y),(-20.06,y,z),.225,.30,.12,'Cool')
    # The crown is suspended directly from the ceiling. No exposed feed pipes
    # project across the room or stop short of the machinery they would serve.
    box('Overhead service crown',(8.2,.65,8.2),(0,99.1,110),'Cool',.07)
    ring('Service crown inner distributor',(0,98.60,110),2.7,3.1,.16,'Alloy','y',48)
    for x in (-3.4,3.4):
        box('Crown suspension '+str(x),(.18,1.15,6.8),(x,99.975,110),'Alloy',.02)
    print('Continuous entrance skin, sealed reveals, atrium walls and recessed services built.')


def panel(part,centre,along_x=True):
    # Local coordinates match the four existing runtime hinge owners.
    x,y,z=centre
    width=4.58 if along_x else 3.92
    size=(width,2.54,.045) if along_x else (.045,2.54,width)
    box(part+' pane',size,centre,'Glass',0,part)
    for side in (-1,1):
        pos=(x+side*(width/2+.09),y,z) if along_x else (x,y,z+side*(width/2+.09))
        stile=(.30,2.52,.23) if part=='Front' else (.14,2.52,.12) if along_x else (.12,2.52,.14)
        box(part+' stile '+str(side),stile,pos,'Graphite',.016,part)
        pos=(x,y+side*1.34,z)
        if part!='Front':
            box(part+' crossmember '+str(side),(width+.32,.14,.12) if along_x else (.12,.14,width+.32),pos,'Alloy',.014,part)
    if part=='Front':
        # The armoured header, warning plate and sill all lift with the hatch.
        # Nothing is attached across the stationary roof or its jump route.
        box('Hatch armoured header',(5.50,.82,.28),(0,-.31,-.18),'Graphite',.025,part)
        box('Hatch armoured sill',(5.02,.37,.30),(0,-2.735,-.17),'Graphite',.025,part)
        box('Hatch corrosive plate',(1.22,.64,.16),(1.52,-1.70,-.12),'Graphite',.018,part)
        security_marking('Hatch identification','identification',(3.70,.60),(0,-.33,-.333),part)
        security_marking('Hatch upper caution','caution',(5.36,.10),(0,.036,-.333),part)
        security_marking('Hatch lower caution','caution',(4.88,.14),(0,-2.70,-.333),part)
        security_marking('Hatch corrosive warning','hazard',(1.12,.50),(1.52,-1.70,-.213),part)
        for side in (-1,1):
            security_marking('Hatch warning '+str(side),'warningIcon',(.40,.40),(side*2.30,-.33,-.333),part)
            for y in (-.66,-2.30):
                tube('Hatch captive fastener '+str(side)+' '+str(y),(side*2.38,y,-.135),(side*2.38,y,-.16),.045,'Alloy',12,part)
        for x in (-1.65,0,1.65):
            tube('Hatch hinge '+str(x),(x-.18,-.03,-.02),(x+.18,-.03,-.02),.08,'Alloy',16,part)


def security_marking(name,tile,size,at,part='Cell',side='front'):
    # UVs sample the existing runtime atlas; the packed image is studio-only.
    regions={'identification':(0,0,512,192),'hazard':(0,192,512,192),
        'warningIcon':(0,192,128,128),'release':(0,384,512,64),'caution':(0,448,512,64)}
    axes={'front':((-1,0,0),(0,0,-1)),'rear':((1,0,0),(0,0,1)),
        'left':((0,0,1),(-1,0,0)),'right':((0,0,-1),(1,0,0))}
    w,h=size
    corners=((-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2))
    if side=='floor':
        points=[(at[0]+a,at[1],at[2]-b) for a,b in corners];normal=(0,1,0)
    elif side=='floor-side':
        points=[(at[0]+b,at[1],at[2]+a) for a,b in corners];normal=(0,1,0)
    else:
        u,normal=axes[side]
        points=[(at[0]+u[0]*a,at[1]+b,at[2]+u[2]*a) for a,b in corners]
    obj=quad(name,points,'Security',normal,part)
    x,y,tw,th=regions[tile]
    coordinates=((x+.5,y+th-.5),(x+tw-.5,y+th-.5),(x+tw-.5,y+.5),(x+.5,y+.5))
    for loop in obj.data.loops:
        a,b=coordinates[loop.vertex_index]
        # glTF export flips Blender's V into the runtime's top-origin atlas.
        obj.data.uv_layers.active.data[loop.index].uv=(a/512,1-b/512)


def build_cell():
    # Continuous sealed sides join the floor to the one walkable plinth face.
    # There is no second top face or unsupported gap below the cell.
    for z in (107,113):
        quad('Cell sealed foundation cross '+str(z),[(-3,74.75,z),(3,74.75,z),(3,75.575,z),(-3,75.575,z)],'Graphite',(0,0,-1 if z<110 else 1),'Cell')
    for x in (-3,3):
        quad('Cell sealed foundation side '+str(x),[(x,74.75,107),(x,75.575,107),(x,75.575,113),(x,74.75,113)],'Graphite',(-1 if x<0 else 1,0,0),'Cell')
    quad('Cell traversable plinth',[(-3,75.575,107),(3,75.575,107),(3,75.575,113),(-3,75.575,113)],'Island',(0,1,0),'Cell')
    for z in (106.95,113.05):
        box('Cell base shoulder '+str(z),(5.9,.24,.25),(0,75.4,z),'Alloy',.025,'Cell')
    # The NPC's sole stays supported at its established cinematic height.
    box('Goop isolation pedestal',(2.45,.5,2.25),(0,75.836,110),'Graphite',.03,'Cell')
    for i in range(12):
        box('Isolation grate '+str(i),(2.25,.008,.07),(0,76.092,109.01+i*.18),'Alloy',.002,'Cell')
    for x in (-2.65,2.65):
        for z in (107.55,112.45):
            box('Containment corner '+str(x)+' '+str(z),(.22,2.92,.22),(x,77.13,z),'Cool',.025,'Cell')
            box('Cell corner shoe '+str(x)+' '+str(z),(.40,.28,.40),(x,75.63,z),'Graphite',.03,'Cell')
            box('Cell corner socket '+str(x)+' '+str(z),(.34,.24,.34),(x,78.43,z),'Graphite',.024,'Cell')
    for y in (75.83,78.52):
        for z in (107.48,112.52):
            if y==78.52 or z==107.48:continue
            box('Cell crossrail '+str(y)+' '+str(z),(5.74,.18,.26),(0,y,z),'Graphite',.02,'Cell')
        for x in (-2.74,2.74):
            if y==78.52:continue
            box('Cell siderail '+str(y)+' '+str(x),(.26,.18,4.74),(x,y,110),'Alloy',.02,'Cell')
    box('Rear armoured header',(5.74,.65,.26),(0,78.285,112.52),'Graphite',.025,'Cell')
    security_marking('Rear header caution','caution',(5.54,.12),(0,78.49,112.663),side='rear')
    for side in (-1,1):
        box('Side armoured header '+str(side),(.26,.65,4.74),(side*2.74,78.285,110),'Graphite',.025,'Cell')
        security_marking('Side header caution '+str(side),'caution',(4.54,.12),(side*2.883,78.49,110),side='left' if side<0 else 'right')
        security_marking('Side base caution '+str(side),'caution',(4.54,.10),(side*2.883,75.83,110),side='left' if side<0 else 'right')
    security_marking('Remote release plaque','release',(2.18,.18),(0,75.40,106.812))
    quad('Walkable containment roof',[(-2.55,78.675,107.75),(2.55,78.675,107.75),(2.55,78.675,112.25),(-2.55,78.675,112.25)],'Glass',(0,1,0),'Cell')
    for low,high in ((75.575,75.67),(78.50,78.675)):
        for z in (107.75,112.25):
            quad('Cell sealed cross fascia '+str(z)+' '+str(low),[(-2.55,low,z),(2.55,low,z),(2.55,high,z),(-2.55,high,z)],'Graphite',(0,0,-1 if z<110 else 1),'Cell')
        for x in (-2.55,2.55):
            quad('Cell sealed side fascia '+str(x)+' '+str(low),[(x,low,107.75),(x,high,107.75),(x,high,112.25),(x,low,112.25)],'Graphite',(-1 if x<0 else 1,0,0),'Cell')
    # Keep all solid service props on the east side, outside Goop's authored
    # walk along X=-3.6 during the release/escape sequence.
    for z in (109,111.3):
        box('Cell service pedestal '+str(z),(.58,1.45,1.25),(3.25,75.475,z),'Cool',.035,'Cell')
        for dz in (-.35,.35):
            box('Cell isolation valve '+str(z)+' '+str(dz),(.12,.25,.25),(3.57,75.6,z+dz),'Alloy',.012,'Cell')
    for x in (-2.42,2.42):
        for z in (107.43,112.57):
            box('Lock actuator socket '+str(x)+' '+str(z),(.36,.22,.30),(x,75.53,z),'Graphite',.025,'Cell')
            box('Retracting lock '+str(x)+' '+str(z),(.28,.20,.22),(x,75.98,z),'Amber',.018,'Locks')
            tube('Lock piston '+str(x)+' '+str(z),(x,75.73,z),(x,76.29,z),.075,'Alloy',16,'Locks')
    for z in (107.36,112.64):
        for x in (-2.65,2.65):
            box('Cell status '+str(x)+' '+str(z),(.12,.10,.045),(x,78.37,z),'Status',.009,'Status')
    panel('Front',(0,-1.42,0))
    panel('Rear',(-2.45,0,0))
    panel('Left',(0,0,-2.12),False)
    panel('Right',(0,0,2.12),False)
    print('Reinforced containment cradle, supported Goop deck and independent hinged panes built.')


PLATFORMS=(
    ('Lower',(4.5,.5,4),(.084,76.687,102.793)),
    ('Rest',(5,.5,4.5),(-.68,80.832,115.652)),
    ('Upper A',(1.849,.523,2.091),(6.109,82.374,110.287)),
    ('Upper B',(1.849,.523,1.921),(6.109,82.374,115.657)),
    ('Upper C',(1.849,.523,2.091),(6.109,82.374,105.453)),
    ('Approach',(4.5,.5,4),(15.436,93.2,120)),
    ('Bounce',(5,.5,4),(-9.5,95.5,121.5)),
)


def deck(name,size,at,part='Architecture'):
    x,y,z=at
    w,h,d=size
    top=y+h/2
    gx=(-w/2,-w/2+.13,-w/2+.23,w/2-.23,w/2-.13,w/2)
    gz=(-d/2,-d/2+.13,-d/2+.23,d/2-.23,d/2-.13,d/2)
    for i in range(5):
        for j in range(5):
            finish='Amber' if i in (1,3) and j in (1,3) else 'Alloy' if i in (0,4) or j in (0,4) else 'Island'
            quad(name+' landing '+str(i)+' '+str(j),[(x+gx[i],top,z+gz[j]),(x+gx[i+1],top,z+gz[j]),
                (x+gx[i+1],top,z+gz[j+1]),(x+gx[i],top,z+gz[j+1])],finish,(0,1,0),part)
    vertices=[(x-w/2,top,z-d/2),(x+w/2,top,z-d/2),(x+w/2,top,z+d/2),(x-w/2,top,z+d/2),
        (x-w/2,top-.15,z-d/2),(x+w/2,top-.15,z-d/2),(x+w/2,top-.15,z+d/2),(x-w/2,top-.15,z+d/2)]
    mesh(name+' deck perimeter',vertices,[(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'Alloy',region=part)
    box(name+' heatshield',(w-.20,.25,d-.20),(x,top-.305,z),'Graphite',.04,part)
    # Same underframe and four-arm engine cradle family as Rooms 2 and 3.
    for side in (-1,1):
        box(name+' long carrier '+str(side),(.12,.12,d*.8),(x+side*w*.31,y+h/2-.52,z),'Alloy',.018,part)
        box(name+' transverse carrier '+str(side),(w*.62-.12,.12,.12),(x,y+h/2-.52,z+side*d*.26),'Alloy',.018,part)
    tube(name+' actuator socket',(x,top-.65,z),(x,top-.445,z),.34,'Alloy',20,part)
    tube(name+' engine connection',(x,top-.72,z),(x,top-.65,z),.13,'Graphite',16,part)
    harness(name,w,d,x,top,z,part,.9 if name=='Lower' else 1,-.08 if name=='Lower' else 0)


def harness(name,w,d,x,top,z,part,scale=1,offset=0):
    # Canonical Room 2 annular cradle, clevises, splayed struts and raised
    # amber latches. Scale only matches the existing compact Lower engine.
    ring(name+' thruster cradle',(x,top-.87*scale+offset,z),.40*scale,.51*scale,.14*scale,'Alloy','y',24,part)
    for sx in (-1,1):
        for sz in (-1,1):
            tag=name+' harness '+str(sx)+' '+str(sz)
            mount=(x+sx*w*.32,top-.60*scale+offset,z+sz*d*.25)
            box(tag+' clevis',(.19,.18,.27),mount,'Graphite',.025,part)
            tube(tag+' diagonal',mount,(x+sx*.32*scale,top-.87*scale+offset,z+sz*.32*scale),.055*scale,'Alloy',12,part)
            box(tag+' latch',(.022,.07,.12),(mount[0]+sx*.118,mount[1],mount[2]),'Amber',0,part)


def sticky(name,a,b,c,d,at,axis='z',framed=True):
    points=[(a,c,at),(b,c,at),(b,d,at),(a,d,at)] if axis=='z' else [(at,c,a),(at,d,a),(at,d,b),(at,c,b)]
    quad(name+' adhesion',points,'Sticky',(0,0,-1) if axis=='z' else (-1,0,0))
    if framed:
        frame(name+' frame',a,b,c,d,at+.06,axis,'Graphite',.10,.08)


def build_traversal():
    for name,size,at in PLATFORMS:
        deck(name,size,at)
    for part in ('CarriageOne','CarriageTwo'):
        deck(part,(1.849,.523,2.091),(0,0,0),part)
    # Continuous L-shaped membrane; the two quads meet only at an edge.
    sticky('East vertical membrane',104.517,109.977,80.324,98.676,19.705,'x',False)
    sticky('East return membrane',109.977,121.3,95.472,98.664,19.705,'x',False)
    for z,y,w,h in ((104.467,(80.334+98.666)/2,.10,98.666-80.334),
        (110.027,(80.334+95.362)/2,.10,95.362-80.334),
        (121.35,(95.482+98.666)/2,.10,98.666-95.482),
        ((104.417+121.40)/2,98.726,121.40-104.417,.10),
        ((104.417+110.077)/2,80.274,110.077-104.417,.10),
        ((109.977+121.40)/2,95.422,121.40-109.977,.10)):
        box('Continuous L membrane border '+str(z)+' '+str(y),(.08,h,w),(19.765,y,z),'Graphite',.01)
    for n,x in ((1,10),(3,2),(5,-6)):
        sticky('Rear membrane '+str(n),x-1.5,x+1.5,91.95,98.45,125.165)
    print('Unchanged landing tops, thruster-driven transfer platforms and readable adhesion route built.')


def build_gallery():
    # The gallery's floor and three opaque sides form one sealed room.
    quad('Gallery floor',[(-13.85,97.5,125.3),(-6.15,97.5,125.3),(-6.15,97.5,132.35),(-13.85,97.5,132.35)],'Island',(0,1,0))
    quad('Gallery roof',[(-13.85,104.05,125.3),(-13.85,104.05,132.35),(-6.15,104.05,132.35),(-6.15,104.05,125.3)],'Ivory',(0,-1,0))
    for x in (-13.85,-6.15):
        quad('Gallery side '+str(x),[(x,97.5,125.3),(x,104.05,125.3),(x,104.05,132.35),(x,97.5,132.35)],'Cool',(1 if x<-10 else -1,0,0))
    quad('Gallery back',[(-13.85,97.5,132.35),(-6.15,97.5,132.35),(-6.15,104.05,132.35),(-13.85,104.05,132.35)],'Ivory',(0,0,-1))
    quad('Gallery upper front',[(-13.85,100.55,125.3),(-6.15,100.55,125.3),(-6.15,104.05,125.3),(-13.85,104.05,125.3)],'Ivory',(0,0,-1))
    for a,b in ((-13.8,-12.05),(-7.95,-6.2)):
        quad('Gallery glazing '+str(a),[(a,97.85,125.31),(b,97.85,125.31),(b,100.35,125.31),(a,100.35,125.31)],'Glass',(0,0,-1))
        frame('Gallery window '+str(a),a,b,97.85,100.35,125.22,'z','Graphite',.10,.10)
    frame('Gallery doorway',-12,-8,97.5,100.38,125.19,'z','Alloy',.14,.14)
    quad('Gallery doorway upper seal',[(-12,100.38,125.3),(-8,100.38,125.3),(-8,100.55,125.3),(-12,100.55,125.3)],'Graphite',(0,0,-1))
    # The gallery sits inside the rear wall; no unsupported brackets protrude
    # through that wall into the playable atrium below it.
    # Wall-side operator station, with the central approach to the button clear.
    box('Operator worktop',(1.3,.14,2.5),(-12.85,98.37,129.1),'Alloy',.025)
    box('Operator pedestal',(.7,.75,.7),(-12.85,97.93,129.1),'Graphite',.025)
    box('Operator monitor stand',(.10,.12,.15),(-13.36,98.50,129.1),'Alloy',.012)
    box('Operator monitor body',(.16,.72,.92),(-13.36,98.89,129.1),'Graphite',.025)
    quad('Operator monitor glass',[(-13.27,98.59,128.72),(-13.27,98.59,129.48),(-13.27,99.19,129.48),(-13.27,99.19,128.72)],'Screen',(1,0,0))
    box('Operator keyboard',(.34,.025,.7),(-12.7,98.465,129.1),'Graphite',.008)
    box('Operator chair seat',(.55,.10,.62),(-11.95,98.02,129.1),'Graphite',.025)
    box('Operator chair back',(.10,.62,.60),(-11.67,98.33,129.1),'Cool',.025)
    tube('Operator chair pedestal',(-11.95,97.55,129.1),(-11.95,97.97,129.1),.065,'Alloy',12)
    box('Equipment cabinet',(.55,1.8,1.3),(-6.5,98.43,130.8),'Cool',.035)
    for y in (97.9,98.7):
        box('Cabinet handle '+str(y),(.05,.16,.30),(-6.805,y,130.8),'Alloy',.008)
    box('Release console',(2.1,1.65,.30),(-10,98.45,131.48),'Graphite',.035)
    box('Release escutcheon',(1.25,1.25,.09),(-10,98.45,131.26),'Alloy',.035)
    for x in (-10.76,-9.24):
        box('Release status '+str(x),(.10,.65,.03),(x,98.45,131.30),'Status',.006,'Status')
    ring('Button cap guard',(0,0,0),.39,.48,.07,'Alloy','y',24,'ButtonCap')
    tube('Button actuator',(0,-.045,0),(0,.045,0),.35,'Amber',24,'ButtonCap')
    tube('Button sliding stem',(0,.045,0),(0,.24,0),.16,'Alloy',20,'ButtonCap')
    print('Glazed observation gallery, furnished operator station and wall-mounted release control built.')


def vent_box(name,lo,hi,finish='Graphite'):
    return box('Escape '+name,tuple(hi[i]-lo[i] for i in range(3)),
               tuple((lo[i]+hi[i])/2 for i in range(3)),finish,0,region='Escape')


def vent_prism(name,front,back,finish='Graphite'):
    return mesh('Escape '+name,front+back,[(0,3,2,1),(4,5,6,7),(0,1,5,4),
        (1,2,6,5),(2,3,7,6),(3,0,4,7)],finish,region='Escape')


def vent_wall_panel(side,a,b,w,h):
    low,high=74.91,h-.04
    cut=.035
    shape=[(low,a+cut),(low+cut,a),(high-cut,a),(high,a+cut),
           (high,b-cut),(high-cut,b),(low+cut,b),(low,b-cut)]
    vv=[(side*x,y,z) for x in [w,w+.02] for y,z in shape]
    obj=mesh('Escape formed wall panel '+str(side)+' '+str(a),vv,
        [tuple(reversed(range(8))),tuple(range(8,16))]+
        [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)],'Worn',region='Escape')
    for vertex in obj.data.vertices:
        x,z,y=vertex.co.x,-vertex.co.y,vertex.co.z
        soil=.08+.11*(.5+.5*math.sin(z*2.71+y*1.4))+.12*max(0,1-(y-74.75)/.6)
        obj.data.color_attributes['wear'].data[vertex.index].color=(.73*(1-soil),.72*(1-soil),.68*(1-soil),1)


def vent_rib(z):
    # One closed U-section; its header and legs share edges, never faces.
    outline=[(-1.6,74.75),(-1.6,77.05),(1.6,77.05),(1.6,74.75),
             (1.53,74.75),(1.53,76.99),(-1.53,76.99),(-1.53,74.75)]
    vv=[(x,y,Z) for Z in [z-.05,z+.05] for x,y in outline]
    mesh('Escape cast hoop '+str(z),vv,[tuple(reversed(range(8))),tuple(range(8,16))]+
         [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)],'Alloy',region='Escape')


def vent_lamp(side,z):
    # Transfer the original 14 wall strips at their exact positions and colour.
    # The surrounding body has a real opening and is fixed through one stud.
    y=76.45
    outer=[(y-.065,z-.23),(y+.065,z-.23),(y+.065,z+.23),(y-.065,z+.23)]
    inner=[(y-.025,z-.16),(y+.025,z-.16),(y+.025,z+.16),(y-.025,z+.16)]
    vv=[(side*x,Y,Z) for ring,x in [(outer,1.55),(inner,1.55),(inner,1.59),(outer,1.59)] for Y,Z in ring]
    ff=[]
    for k in range(4):
        j=(k+1)%4
        ff.extend([(k,j,j+4,k+4),(k+4,j+4,j+8,k+8),(k+8,j+8,j+12,k+12),(k+12,j+12,j,k)])
    mesh('Escape recessed strip housing '+str(side)+' '+str(z),vv,ff,'Graphite',region='Escape')
    a,b=sorted([side*1.575,side*1.595])
    vent_box('original wall emitter '+str(side)+' '+str(z),[a,y-.025,z-.16],[b,y+.025,z+.16],'VentLight')
    a,b=sorted([side*1.535,side*1.64])
    vent_box('captive lamp stud '+str(side)+' '+str(z),[a,y-.025,z+.185],[b,y+.025,z+.21],'Alloy')


def build_escape():
    # Full closed volumes, in the original gameplay coordinates. Finish skins
    # stand off continuous solid backs; the joints always stay enclosed.
    stations=[(124.38,127.7,.9,.9,76.4,76.4),(127.7,128,.9,1.6,76.4,77.05),
              (128,142,1.6,1.6,77.05,77.05)]
    for a,b,w,W,h,H in stations:
        for side in [-1,1]:
            front=[(side*(w+.04),74.55,a),(side*(w+.20),74.55,a),
                   (side*(w+.20),h+.20,a),(side*(w+.04),h+.20,a)]
            back=[(side*(W+.04),74.55,b),(side*(W+.20),74.55,b),
                  (side*(W+.20),H+.20,b),(side*(W+.04),H+.20,b)]
            vent_prism('sealed side '+str(side)+' '+str(a),front,back)
        vent_prism('sealed roof '+str(a),[(-w-.04,h+.04,a),(w+.04,h+.04,a),(w+.04,h+.20,a),(-w-.04,h+.20,a)],
            [(-W-.04,H+.04,b),(W+.04,H+.04,b),(W+.04,H+.20,b),(-W-.04,H+.20,b)])
    for a,b,w,W in [(125.3,127.7,.94,.94),(127.7,128,.94,1.64),(128,137.2,1.64,1.64),(139.8,142,1.64,1.64)]:
        vent_prism('solid floor '+str(a),[(-w,74.55,a),(w,74.55,a),(w,74.75,a),(-w,74.75,a)],
            [(-W,74.55,b),(W,74.55,b),(W,74.75,b),(-W,74.75,b)],'Resin')
    for side in [-1,1]:
        a,b=sorted([side*1.3,side*1.64])
        vent_box('drop floor shoulder '+str(side),[a,74.55,137.2],[b,74.75,139.8],'Resin')
        vent_wall_panel(side,124.38,127.675,.9,76.4)
        for z in range(128,142,2):
            vent_wall_panel(side,z+.025,z+1.975,1.6,77.05)
            vent_lamp(side,z+1.55)
    # Flush roof finish: it changes neither headroom nor camera clearance.
    vent_box('neck roof finish',[-.9,76.4,124.38],[.9,76.42,127.7],'Cool')
    vent_prism('taper roof finish',[(-.9,76.4,127.7),(.9,76.4,127.7),(.9,76.42,127.7),(-.9,76.42,127.7)],
        [(-1.6,77.05,128),(1.6,77.05,128),(1.6,77.07,128),(-1.6,77.07,128)],'Alloy')
    for z in range(128,142,2):vent_box('wide roof finish '+str(z),[-1.6,77.05,z+.025],[1.6,77.07,z+1.975],'Cool')
    for z in range(129,142,2):vent_rib(z)
    vent_box('closed far return',[-1.80,74.55,142],[1.80,77.25,142.20],'Cool')
    # Keep the original 2.6 m drop and base at Y=68. Closed shaft walls meet the
    # floor's underside, whose inner returns own the final 200 mm to the lip.
    for side in [-1,1]:
        a,b=sorted([side*1.3,side*1.48])
        vent_box('drop shaft side '+str(side),[a,68,137.2],[b,74.55,139.8])
    for a,b in [(137.02,137.2),(139.8,139.98)]:
        vent_box('drop shaft end '+str(a),[-1.48,68,a],[1.48,74.55,b])
    vent_box('drop shaft base',[-1.48,67.8,137.02],[1.48,68,139.98])
    outer=[(-1.48,137.02),(1.48,137.02),(1.48,139.98),(-1.48,139.98)]
    inner=[(-1.3,137.2),(1.3,137.2),(1.3,139.8),(-1.3,139.8)]
    vv=[(x,y,z) for ring,y in [(outer,74.75),(outer,74.825),(inner,74.825),(inner,74.75)] for x,z in ring]
    ff=[]
    for k in range(4):
        j=(k+1)%4
        for start,end in [(0,4),(4,8),(8,12),(12,0)]:ff.append((start+k,start+j,end+j,end+k))
    mesh('Escape fitted drop coaming',vv,ff,'Alloy',region='Escape')
    for x in [-1.37,1.37]:vent_box('original rim emitter '+str(x),[x-.025,74.825,137.25],[x+.025,74.855,139.75],'VentLight')
    # The wood remains the original separate dissolvable object. These fitted
    # outer jambs stay outside its front footprint and interaction area.
    for x in [-1.33,1.33]:box('Escape opening jamb '+str(x),(.20,1.78,.24),(x,75.65,124.20),'Graphite',.02,region='Escape')
    box('Escape opening header',(2.86,.22,.24),(0,76.66,124.20),'Alloy',.018,region='Escape')
    print('Solid escape duct, fitted transition, 16 original emitter models and open drop shaft built.')


def build_portals():
    # The lift portal wraps the shared doorway without touching either moving
    # panel. Its front faces and the secondary trim have real depth separation.
    for x in (7.34,10.66):
        box('Lift portal outer jamb '+str(x),(.28,3.62,.30),(x,76.57,91.81),'Graphite',.035)
        for y in (75.12,77.95):
            box('Lift portal captive bolt '+str(x)+' '+str(y),(.07,.09,.04),(x,y,91.98),'Alloy',.01)
    box('Lift portal structural brow',(3.58,.25,.30),(9,78.54,91.81),'Graphite',.03)
    box('Lift portal inset crown',(2.18,.13,.06),(9,78.52,91.99),'Cool',.015)
    for x in (8.12,9.88):
        box('Lift portal crown marker '+str(x),(.12,.035,.025),(x,78.52,92.0375),'Screen',.006)
    # Gallery frame sits below the atrium ceiling. Side cheeks make the
    # observation opening read as a reinforced control-room entrance.
    for x in (-12.35,-7.65):
        box('Gallery portal outer cheek '+str(x),(.22,3.05,.26),(x,99.035,125.18),'Graphite',.025)
        box('Gallery portal vertical inset '+str(x),(.045,2.20,.04),(x,99.05,125.035),'Alloy',.008)
        for y in (97.77,100.27):
            box('Gallery portal fastener '+str(x)+' '+str(y),(.06,.065,.025),(x,y,125.0275),'Alloy',.008)
    box('Gallery portal inner brow',(4.24,.12,.10),(-10,100.43,125.045),'Cool',.015)
    # Steel cheek plates and captive fasteners remain after the wooden cover
    # dissolves; the complete original plank footprint stays visible and clear.
    for x in (-1.33,1.33):
        box('Service hatch cheek '+str(x),(.06,1.50,.05),(x,75.65,124.055),'Alloy',.015)
        for y in (75.05,76.30):
            box('Service hatch fastener '+str(x)+' '+str(y),(.055,.065,.03),(x,y,124.0125),'Graphite',.007)
        box('Service hatch caution tab '+str(x),(.075,.28,.035),(x,75.72,124.0125),'Amber',.008)
    box('Service hatch lintel cap',(2.86,.05,.26),(0,76.80,124.20),'Graphite',.018)
    print('Deep lift portal, gallery entrance and reinforced service hatch built; Escape owns its duct hoops.')


def preview():
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x,scene.render.resolution_y=1280,900
    scene.render.resolution_percentage=100
    for part,at in (('Front',(0,78.5,107.74)),('Rear',(2.45,77.08,112.26)),
        ('Left',(-2.56,77.08,112.12)),('Right',(2.56,77.08,107.88)),
        ('CarriageOne',(6.109,82.374,100.384)),('CarriageTwo',(15.109,82.374,100.384)),('ButtonCap',(-10,98.45,131.035))):
        bpy.data.objects[PREFIX+part].location=xyz(at)
    bpy.data.objects[PREFIX+'ButtonCap'].rotation_euler.x=math.pi/2
    for i,(at,target,power) in enumerate((((0,98,109),(0,75,110),6000),((10,89,96),(0,78,110),4500),
        ((-12,102,129),(-10,97.5,129),1200),((-12,86,117),(0,77,110),1800))):
        data=bpy.data.lights.new(PREFIX+'Preview light '+str(i),'AREA')
        data.energy=power
        data.size=8
        obj=bpy.data.objects.new(data.name,data)
        scene.collection.objects.link(obj)
        obj.location=xyz(at)
        obj.rotation_euler=(Vector(xyz(target))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new(PREFIX+'Review camera')
    camera=bpy.data.objects.new(data.name,data)
    scene.collection.objects.link(camera)
    camera.location=xyz((9,79.5,96))
    camera.rotation_euler=(Vector(xyz((-1,84,111)))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.lens=23
    scene.camera=camera
    for area in bpy.context.window.screen.areas if bpy.context.window else ():
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.use_local_camera=True
            space.camera=camera
            space.region_3d.view_perspective='CAMERA'
            space.shading.type='MATERIAL'
            space.overlay.show_overlays=False

def export_asset():
    scene=bpy.context.scene
    roots=[bpy.data.objects[PREFIX+part] for part in PARTS]
    selected,active=list(bpy.context.selected_objects),bpy.context.view_layer.objects.active
    temporary=[]
    saved=[]
    try:
        for root,part in zip(roots,PARTS):
            saved.append((root,root.name,root.matrix_world.copy()))
            root.name=PREFIX+'Editable '+part
            runtime=bpy.data.objects.new(PREFIX+part,None)
            runtime['asset']='containment-room-five-v1'
            scene.collection.objects.link(runtime)
            temporary.append(runtime)
            groups={}
            for source in list(root.children):
                obj=source.copy()
                obj.data=source.data.copy()
                scene.collection.objects.link(obj)
                obj.parent=runtime
                obj.hide_render=False
                obj.hide_set(False)
                groups.setdefault(obj.data.materials[0].name,[]).append(obj)
            for material,objects in groups.items():
                bpy.ops.object.select_all(action='DESELECT')
                for obj in objects:
                    obj.select_set(True)
                bpy.context.view_layer.objects.active=objects[0]
                if len(objects)>1:
                    bpy.ops.object.join()
                objects[0].name=PREFIX+'Batch_'+part+'_'+material.removeprefix(PREFIX)
        bpy.ops.object.select_all(action='DESELECT')
        for root in temporary:
            root.select_set(True)
            for child in root.children:
                child.select_set(True)
        bpy.context.view_layer.objects.active=temporary[0]
        bpy.ops.export_scene.gltf(filepath=HERE+'/room-five-atrium.glb',export_format='GLB',use_selection=True,
            use_active_scene=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,
            export_animations=False,export_materials='PLACEHOLDER',export_vertex_color='ACTIVE',
            export_active_vertex_color_when_no_material=True)
    finally:
        for root in temporary:
            for obj in list(root.children):
                data=obj.data
                bpy.data.objects.remove(obj,do_unlink=True)
                if data.users==0:
                    bpy.data.meshes.remove(data)
            bpy.data.objects.remove(root,do_unlink=True)
        for root,name,matrix in saved:
            root.name=name
            root.matrix_world=matrix
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=active
    print('Exported twelve independently owned assemblies in shared-finish batches; no lights, textures or animation tracks.')


def save_source():
    previous=bpy.context.preferences.filepaths.save_version
    try:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=HERE+'/room-five-atrium.blend',copy=True)
    finally:
        bpy.context.preferences.filepaths.save_version=previous


def main():
    setup()
    build_shell()
    build_cell()
    build_traversal()
    build_gallery()
    build_escape()
    build_portals()
    preview()
    export_asset()
    save_source()


if __name__=='__main__':
    main()
