"""Original Blender art for the Room 4 freight lift and containment shaft.

Gameplay references: 8 x 8 m roof, Y=29.5..74.5 in 45 seconds, existing laser
endpoints, entry/exit openings and camera volume. Only R4_ objects regenerate.
"""
import bpy
import bmesh
import math
from mathutils import Vector

HERE=__file__[:max(__file__.rfind('/'),__file__.rfind('\\'))]
PREFIX='R4_'
SCENE_NAME='Room 4 Freight Lift'
PARTS=('Architecture','Car','Counterweight','Wheel','Motor','DoorLeft','DoorRight','ExitArrow','Segment','Cable')
FINISHES={
    'Ivory':((.88,.86,.79),.5,0),'Cool':((.43,.53,.55),.5,0),
    'Island':((.57,.62,.61),.6,0),'Resin':((.43,.50,.51),.65,0),
    'Graphite':((.028,.043,.052),.65,.25),'Alloy':((.28,.35,.37),.37,.7),
    'Light':((.76,.86,.88),.4,0),'Screen':((.055,.23,.25),.5,0),
    'Amber':((.52,.28,.06),.5,.12),'Worn':((.47,.53,.54),.85,.15),
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
        root['asset']='containment-room-four-v1'
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
        if name in {'Light','Screen'}:
            p.inputs['Emission Color'].default_value=(*colour,1)
            p.inputs['Emission Strength'].default_value=1
        if name=='Worn':
            colour_node=mat.node_tree.nodes.new('ShaderNodeVertexColor')
            colour_node.layer_name='wear'
            mat.node_tree.links.new(colour_node.outputs['Color'],p.inputs['Base Color'])
    print('Owned freight-lift studio initialized; all other scenes retained.')


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
            low=max(0,min(1,(-.3-y)/2.8)) if region=='Car' else max(0,min(1,(35-y)/9))
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
    us=sorted(set((u0,u1)+tuple(v for hole in holes for v in hole[:2])))
    ys=sorted(set((y0,39.8,60.2,y1)+tuple(v for hole in holes for v in hole[2:])))
    for i in range(len(us)-1):
        for j in range(len(ys)-1):
            a,b,c,d=us[i],us[i+1],ys[j],ys[j+1]
            u,y=(a+b)/2,(c+d)/2
            if any(lo<u<hi and low<y<high for lo,hi,low,high in holes):
                continue
            finish='Worn' if y<39.8 else 'Graphite' if y<60.2 else 'Ivory'
            points=[(at,c,a),(at,d,a),(at,d,b),(at,c,b)] if axis=='x' else [(a,c,at),(b,c,at),(b,d,at),(a,d,at)]
            quad(name+' '+str(i)+' '+str(j),points,finish,normal)


def build_shaft():
    wall('West shaft',79.7,91.3,26,78.75,'x',2.7,(1,0,0),[(88.2,90.4,27,77)])
    wall('East shaft',79.7,91.3,26,78.75,'x',15.3,(-1,0,0),[(82.2,88.6,42.5,60)])
    # Fit the existing Room 3 duct lining exactly, including its raised floor.
    # The old oversized opening exposed the acid pit below and beside the duct.
    wall('Entry shaft',2.7,15.3,26,78.75,'z',79.7,(0,0,1),[(7.945,10.055,31.175,33.36)])
    wall('Arrival shaft',2.7,15.3,26,78.75,'z',91.3,(0,0,-1),[(7.7,10.3,72.5,78.75)])
    quad('Pit floor',[(2.7,26,79.7),(15.3,26,79.7),(15.3,26,91.3),(2.7,26,91.3)],'Graphite',(0,1,0))
    quad('Shaft ceiling',[(2.7,78.75,79.7),(2.7,78.75,91.3),(15.3,78.75,91.3),(15.3,78.75,79.7)],'Graphite',(0,-1,0))
    # Three distinct structural zones. Horizontal returns stop at the columns.
    for x in (2.85,15.15):
        for z in (80,91):
            box('Load column '+str(x)+' '+str(z),(.22,52.25,.30),(x,52.125,z),'Graphite',.028)
    for y in (39.65,60.05,73.0):
        for z in (79.92,91.08):
            if z>90 and y>72:
                for x in (5.10,12.90):
                    box('Arrival interrupted band '+str(x),(4.2,.24,.24),(x,y,z),'Alloy',.02)
            else:
                box('Shaft transverse band '+str(y)+' '+str(z),(11.95,.24,.24),(9,y,z),'Alloy',.02)
        box('East service band '+str(y),(.20,.24,10.60),(15.12,y,85.5),'Alloy',.02)
    # Large, quiet upper panels replace a continuous grid of tiny tiles.
    for x in (2.78,15.22):
        for z in (81.4,89.7):
            box('Upper ceramic inset '+str(x)+' '+str(z),(.075,9.5,1.65),(x,67.1,z),'Cool',.018)
    print('Sealed shaft with lower machinery, middle services and clean upper arrival built.')


def build_entry():
    # Room 3 owns the four inner lining surfaces through Z=80.78. This outer
    # sleeve joins the shaft skin to that mouth without duplicating the lining
    # or extending the walking surface beyond its existing end.
    x0,x1,y0,y1,z0,z1=7.52,10.48,30.82,33.72,79.7,80.78
    for x in (x0,x1):
        quad('Entry sleeve side '+str(x),[(x,y0,z0),(x,y1,z0),(x,y1,z1),(x,y0,z1)],
             'Worn',(-1 if x<9 else 1,0,0))
    for y in (y0,y1):
        quad('Entry sleeve cap '+str(y),[(x0,y,z0),(x1,y,z0),(x1,y,z1),(x0,y,z1)],
             'Graphite',(0,-1 if y<32 else 1,0))
    # Four front strips form one continuous ring. Shared borders meet at edges;
    # the clear aperture and the duct's exposed floor edge stay unchanged.
    for a,b in ((x0,7.945),(10.055,x1)):
        quad('Entry frame upright '+str(a),[(a,y0,z1),(b,y0,z1),(b,y1,z1),(a,y1,z1)],'Graphite',(0,0,1))
    for a,b in ((y0,31.175),(33.36,y1)):
        quad('Entry frame crosspiece '+str(a),[(7.945,a,z1),(10.055,a,z1),(10.055,b,z1),(7.945,b,z1)],'Graphite',(0,0,1))
    for x in (7.69,10.31):
        box('Entry reinforced jamb '+str(x),(.12,2.50,.08),(x,32.275,80.79),'Alloy',.012)
        box('Entry amber marker '+str(x),(.075,.27,.035),(x,33.05,80.8525),'Amber',.007)
        for y in (31.40,32.35):
            box('Entry captive fastener '+str(x)+' '+str(y),(.052,.075,.025),(x,y,80.848),'Graphite',.005)
    for y in (30.96,33.59):
        box('Entry reinforced crosspiece '+str(y),(2.75,.10,.08),(9,y,80.79),'Alloy',.012)
    print('Lift-side entry sleeve, sealed wall joins and reinforced duct surround built.')


def build_guides():
    for z in (83.25,87.75):
        box('Guide rail '+str(z),(.22,50,.30),(2.88,52,z),'Graphite',.018)
        box('Guide running face '+str(z),(.055,49.8,.16),(3.025,52,z),'Alloy',.006)
        for y in (28.6,37.1,47.4,57.7,67.9,76.5):
            box('Rail bracket '+str(z)+' '+str(y),(.24,.32,.52),(2.78,y,z),'Graphite',.015)
        # Fixed pulley assemblies align with the moving cable anchors.
        ring('Head sheave '+str(z),(3.70,77.5,z),.11,.48,.22,'Alloy','z',24)
        tube('Sheave spindle '+str(z),(3.7,77.5,z-.24),(3.7,77.5,z+.24),.075,'Graphite',12)
        box('Sheave mounting shoe '+str(z),(.8,.17,.72),(3.7,78.15,z),'Graphite',.02)
    for y in (34,41,49,57,65,72,77):
        box('Shaft fixture housing '+str(y),(.28,1.5,.48),(2.85,y,85.5),'Graphite',.02)
    # Counterweight well: complete recessed backing and returns, no false route.
    quad('Counterweight recess back',[(1.05,27,88.2),(1.05,77,88.2),(1.05,77,90.4),(1.05,27,90.4)],'Graphite',(1,0,0))
    for z in (88.2,90.4):
        quad('Counterweight recess end '+str(z),[(1.05,27,z),(2.7,27,z),(2.7,77,z),(1.05,77,z)],'Alloy',(0,0,1 if z<89 else -1))
    for y in (27,77):
        quad('Counterweight recess cap '+str(y),[(1.05,y,88.2),(2.7,y,88.2),(2.7,y,90.4),(1.05,y,90.4)],'Graphite',(0,1 if y<30 else -1,0))
    for z in (88.35,88.7,89.05,89.4,89.75,90.1):
        box('Counterweight cage upright '+str(z),(.075,49,.065),(2.65,52,z),'Graphite',.009)
    for y in (28,40,52,64,76):
        box('Counterweight cage tie '+str(y),(.055,.10,2),(2.695,y,89.2),'Alloy',.009)
    ring('Counterweight head sheave',(1.46,77.5,89.2),.11,.46,.20,'Alloy','z',24)
    print('Continuous rails, sheaves and protected counterweight recess built.')


def build_services():
    # A real recess frames the middle section's vessels and isolation valves.
    quad('Services recess back',[(16.05,42.5,82.2),(16.05,60,82.2),(16.05,60,88.6),(16.05,42.5,88.6)],'Graphite',(-1,0,0))
    for z in (82.2,88.6):
        quad('Services return '+str(z),[(15.3,42.5,z),(16.05,42.5,z),(16.05,60,z),(15.3,60,z)],'Cool',(0,0,1 if z<85 else -1))
    for y in (42.5,60):
        quad('Services cap '+str(y),[(15.3,y,82.2),(16.05,y,82.2),(16.05,y,88.6),(15.3,y,88.6)],'Alloy',(0,1 if y<50 else -1,0))
    for z in (83.7,87.1):
        tube('Vertical filter vessel '+str(z),(15.68,45,z),(15.68,57.8,z),.29,'Alloy',20)
        for y in (45.2,51.4,57.6):
            ring('Filter clamp '+str(z)+' '+str(y),(15.68,y,z),.29,.35,.10,'Graphite','y',20)
        box('Filter control '+str(z),(.11,.65,.5),(15.30,49.3,z),'Graphite',.015)
        box('Filter status '+str(z),(.025,.29,.27),(15.232,49.4,z),'Screen',0)
        tube('Filter lower connection '+str(z),(15.68,45,z),(15.68,43.1,z),.09,'Graphite',12)
    for z in (80.7,90.45):
        tube('East service riser '+str(z),(15.07,27.5,z),(15.07,76.9,z),.075,'Graphite',12)
        for y in (31,47,63,75):
            ring('Service collar '+str(z)+' '+str(y),(15.07,y,z),.075,.11,.10,'Alloy','y',12)
    # Lower machinery remains beside the car's swept volume.
    for x in (3.8,14.15):
        box('Lower motor plinth '+str(x),(1.30,.27,1.8),(x,26.25,81.5),'Graphite',.03)
        box('Lower drive motor '+str(x),(1.0,1.30,1.24),(x,27.08,81.5),'Alloy',.05)
        for y in (26.7,27.05,27.4):
            box('Motor cooling grille '+str(x)+' '+str(y),(.82,.075,.035),(x,y,80.855),'Graphite',.005)
    print('Middle coolant plant, utility risers and lower machinery built.')


def number(name,text,x,y,z,scale=.75):
    digits=('abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg')
    bars={'a':(0,.8,.52,.08),'b':(.29,.42,.08,.58),'c':(.29,-.42,.08,.58),
          'd':(0,-.8,.52,.08),'e':(-.29,-.42,.08,.58),'f':(-.29,.42,.08,.58),'g':(0,0,.52,.08)}
    for i,char in enumerate(text):
        for segment in digits[int(char)]:
            dx,dy,w,h=bars[segment]
            box(name+' '+str(i)+' '+segment,(w*scale,h*scale,.024),
                (x+(i-(len(text)-1)/2)*.82*scale+dx*scale,y+dy*scale,z),'Light',0)


def build_markers_and_mounts():
    for i,y in enumerate((34.8,44.8,54.8,64.8,73.8)):
        # One mounted number per section, large enough to read while travelling.
        x=5.0 if i%2==0 else 12.8
        box('Landing number backing '+str(i),(1.70,1.95,.10),(x,y,79.87),'Graphite',.02)
        number('Landing number '+str(i),str(i+1).zfill(2),x,y,79.94,.73)
    lasers=((3.5,36.2,84),(3.5,44.2,83.2),(14.5,45.1,87.8),(3.5,53.1,83),
            (14.5,54.1,88),(3.5,62.3,82),(14.5,63.2,82),(3.5,70.5,85.5))
    for i,(x,y,z) in enumerate(lasers):
        west=x<9
        wallx=2.80 if west else 15.20
        box('Laser wall shoe '+str(i),(.12,.65,.65),(wallx,y,z),'Graphite',.02)
        endx=x-(.25 if west else -.25)
        tube('Laser cantilever '+str(i),(wallx,y-.22,z),(endx,y-.22,z),.045,'Alloy',12)
        tube('Laser gimbal riser '+str(i),(endx,y-.22,z),(endx,y-.02,z),.055,'Graphite',12)
    print('Sparse segment numerals and physically supported optical-head mounts built.')


def build_car():
    part='Car'
    quad('Roof joint backing',[(-4,.21,-4),(4,.21,-4),(4,.21,4),(-4,.21,4)],'Graphite',(0,1,0),part)
    xs=(-4,-3.65,-.65,.65,3.65,4)
    zs=(-4,-3.8,-3.65,-3.1,0,3.65,4)
    for i in range(len(xs)-1):
        for j in range(len(zs)-1):
            a,b,c,d=xs[i],xs[i+1],zs[j],zs[j+1]
            if a>=-.65 and b<=.65 and c>=-3.8 and d<=-3.1:
                continue
            border=abs((a+b)/2)>3.65 or abs((c+d)/2)>3.65
            quad('Machined roof '+str(i)+' '+str(j),[(a+.008,.25,c+.008),(b-.008,.25,c+.008),
                 (b-.008,.25,d-.008),(a+.008,.25,d-.008)],'Alloy' if border else 'Resin',(0,1,0),part)
    quad('Height indicator inlay',[(-.65,.25,-3.8),(.65,.25,-3.8),(.65,.25,-3.1),(-.65,.25,-3.1)],'Graphite',(0,1,0),part)
    for side in (-1,1):
        quad('Car side apron '+str(side),[(side*4,-.20,-4),(side*4,.25,-4),(side*4,.25,4),(side*4,-.20,4)],'Graphite',(side,0,0),part)
        quad('Car end apron '+str(side),[(-4,-.20,side*4),(4,-.20,side*4),(4,.25,side*4),(-4,.25,side*4)],'Graphite',(0,0,side),part)
    box('Freight car core',(7.12,2.4,7.12),(0,-1.60,0),'Graphite',.07,part)
    for side in (-1,1):
        for offset in (-2.15,0,2.15):
            box('Car side armour '+str(side)+' '+str(offset),(.075,1.90,1.94),(side*3.62,-1.55,offset),'Worn',.018,part)
            box('Car end armour '+str(side)+' '+str(offset),(1.94,1.90,.075),(offset,-1.55,side*3.62),'Cool',.018,part)
        box('Underframe longitudinal '+str(side),(.20,.18,7.3),(side*3.75,-2.93,0),'Alloy',.018,part)
        box('Underframe transverse '+str(side),(7.7,.18,.20),(0,-2.93,side*3.75),'Alloy',.018,part)
        for z in (-3.75,3.75):
            box('Car corner reinforcement '+str(side)+' '+str(z),(.23,2.5,.23),(side*3.75,-1.55,z),'Graphite',.025,part)
    for z in (-2.25,2.25):
        box('Guide carriage beam '+str(z),(1.75,.13,.18),(-4.625,-.78,z),'Alloy',.012,part)
        box('Guide carriage attachment '+str(z),(.35,.36,.52),(-3.80,-.65,z),'Graphite',.02,part)
        box('Guide wheel axle '+str(z),(.25,.28,.34),(-5.61,-.78,z),'Graphite',.02,part)
    # The motor is a separate presentation part, kept off the walkable roof.
    box('Car actuator casing',(1.9,.55,1.2),(0,-2.56,0),'Graphite',.04,'Motor')
    for z in (-.35,0,.35):
        box('Car motor grille '+str(z),(1.5,.035,.08),(0,-2.855,z),'Alloy',.006,'Motor')
    tube('Shared guide wheel',(0,0,-.09),(0,0,.09),.18,'Alloy',20,'Wheel')
    box('Counterweight core',(.90,2.8,1.1),(0,0,0),'Graphite',.05,'Counterweight')
    for y in (-.9,-.3,.3,.9):
        box('Counterweight steel slab '+str(y),(.14,.43,1.0),(.50,y,0),'Alloy',.018,'Counterweight')
    box('Counterweight warning cap',(.04,.15,.72),(.60,1.08,0),'Amber',.007,'Counterweight')
    tube('Cable segment',(0,-.5,0),(0,.5,0),.018,'Graphite',10,'Cable')
    box('Display segment',(1,1,1),(0,0,0),'Screen',0,'Segment')
    print('Freight car, roof inlay, guide carriages, shared rollers, motor and counterweight built.')


def build_arrival():
    # The fixed sill is 12 mm above the travelling roof: separate motion owners
    # meet with a small physical step instead of coplanar overlapping decks.
    box('Arrival landing',(4.45,.12,2.95),(9,74.702,90.2),'Island',.018)
    for x in (7.49,10.51):
        box('Arrival door jamb',(.30,3.54,.20),(x,76.52,91.20),'Graphite',.025)
    box('Arrival lintel',(3.32,.35,.42),(9,78.48,91.30),'Alloy',.025)
    box('Arrival status housing',(2.2,.35,.18),(9,78.30,91.22),'Graphite',.018)
    quad('Arrival sealed transom',[(7.7,78.10,91.3),(10.3,78.10,91.3),
         (10.3,78.75,91.3),(7.7,78.75,91.3)],'Graphite',(0,0,-1))
    for x in (7.7,10.3):
        quad('Arrival door reveal '+str(x),[(x,74.75,91.3),(x,78.1,91.3),
             (x,78.1,91.31),(x,74.75,91.31)],'Alloy',(1 if x<9 else -1,0,0))
    for x in (7.2,10.8):
        box('Arrival docking buffer '+str(x),(.27,.36,.27),(x,74.50,89.57),'Graphite',.018)
    for side,part in ((-1,'DoorLeft'),(1,'DoorRight')):
        a,b=(-1.315,0) if side==-1 else (0,1.315)
        x=9+(a+b)/2
        box('Arrival door backing '+part,(b-a,3.35,.12),(x,76.425,91.53),'Graphite',.018,part)
        # Insets own distinct front coverage; their backs sit inside the body.
        box('Arrival door armour '+part,(b-a-.08,2.94,.08),(x,76.425,91.40),'Cool',.018,part)
        box('Arrival door lock stripe '+part,(.06,2.35,.025),(x-side*.37,76.40,91.342),'Alloy',.007,part)
    mesh('Exit route arrow',[(8.85,74.785,90.0),(9.15,74.785,90.0),(9.15,74.785,90.8),
         (9.38,74.785,90.8),(9,74.785,91.2),(8.62,74.785,90.8),(8.85,74.785,90.8)],
         [(0,1,2,3,4,5,6)],'Screen',facing=(0,1,0),region='ExitArrow')
    print('Docking landing and separate pocket-sliding door leaves built.')


def preview():
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x,scene.render.resolution_y=1200,900
    scene.render.resolution_percentage=100
    # Preview only: game owners supply all live positions and pooled lights.
    bpy.data.objects[PREFIX+'Car'].location=xyz((9,29.5,85.5))
    bpy.data.objects[PREFIX+'Motor'].location=xyz((9,29.5,85.5))
    bpy.data.objects[PREFIX+'Counterweight'].location=xyz((1.9,75,89.2))
    for part in ('Wheel','Segment','Cable'):
        bpy.data.objects[PREFIX+part].hide_render=True
        for child in bpy.data.objects[PREFIX+part].children:
            child.hide_render=True
    for i,at in enumerate(((8,37,85),(11,55,85),(8,76,85),(10,33,87))):
        data=bpy.data.lights.new(PREFIX+'Preview fill '+str(i),'AREA')
        data.energy=1800 if i<3 else 850
        data.shape='DISK'
        data.size=6
        light=bpy.data.objects.new(data.name,data)
        scene.collection.objects.link(light)
        light.location=xyz(at)
        target=(9,at[1]-6,85.5)
        light.rotation_euler=(Vector(xyz(target))-light.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new(PREFIX+'Review camera')
    camera=bpy.data.objects.new(data.name,data)
    scene.collection.objects.link(camera)
    camera.location=xyz((13.5,36.5,89))
    camera.rotation_euler=(Vector(xyz((8.7,29.6,85.5)))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.lens=25
    scene.camera=camera
    for area in bpy.context.screen.areas if bpy.context.screen else ():
        if area.type=='VIEW_3D':
            area.spaces.active.use_local_camera=True
            area.spaces.active.camera=camera
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False


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
            runtime['asset']='containment-room-four-v1'
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
        bpy.ops.export_scene.gltf(filepath=HERE+'/room-four-lift.glb',export_format='GLB',use_selection=True,
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
    print('Exported ten independently owned assemblies in shared-finish batches; no lights, textures or animation tracks.')


def save_source():
    previous=bpy.context.preferences.filepaths.save_version
    try:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=HERE+'/room-four-lift.blend',copy=True)
    finally:
        bpy.context.preferences.filepaths.save_version=previous


def main():
    setup()
    build_shaft()
    build_entry()
    build_guides()
    build_services()
    build_markers_and_mounts()
    build_car()
    build_arrival()
    preview()
    export_asset()
    save_source()


if __name__=='__main__':
    main()
