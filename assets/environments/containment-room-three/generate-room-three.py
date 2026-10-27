"""Original Room 3 chemical stress-testing chamber, Blender 5.2+.

The gameplay shell, eight landing surfaces, two adhesion patches and six laser
paths are immutable references. Only the owned R3_ studio objects regenerate.
Run each build_* stage separately through MCP for interactive iteration.
"""
import bpy
import bmesh
import math
from mathutils import Vector

HERE = __file__[:max(__file__.rfind('/'), __file__.rfind('\\'))]
PREFIX = 'R3_'
SCENE_NAME = 'Room 3 Chemical Stress Laboratory'
PLATFORMS = (
    ('Entry',8,.5,5,0,10.65,51.29795),
    ('A',4.5,.5,4,2.7885,10.9032,57.6261),
    ('B',5.13,.5,4,11.2583,11.4329,59),
    ('Catch ledge',4.6,.5,4.8,14.7,21.1,66),
    ('C',4.2,.5,4,10,22.1,60.5406),
    ('D',4,.5,4,5,23.7,62.839),
    ('E',4,.5,4,-.4591,24.1676,68.5505),
    ('F',4.2,.5,4,5.7,25.0753,73.5),
)
FINISHES = {
    'Ivory':((.88,.86,.79),.5,0), 'Cool':((.43,.53,.55),.5,0),
    'Island':((.57,.62,.61),.6,0), 'Resin':((.43,.50,.51),.65,0),
    'Graphite':((.028,.043,.052),.65,.25), 'Alloy':((.28,.35,.37),.37,.7),
    'Light':((.76,.86,.88),.4,0), 'Screen':((.055,.23,.25),.5,0),
    'Amber':((.52,.28,.06),.5,.12), 'Sticky':((.03,.55,.58),.65,0),
    'Stained':((.43,.53,.55),.92,.05),
}


def xyz(point):
    return (point[0],-point[2],point[1])


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
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.10,.15,.18,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
    root=bpy.data.objects.new(PREFIX+'Architecture',None)
    root['asset']='containment-room-three-v1'
    root['gameplay']='Visual only: preserve all room colliders, acid height, laser endpoints/timing and landing heights.'
    scene.collection.objects.link(root)
    for name,(tint,rough,metal) in FINISHES.items():
        mat=bpy.data.materials.new(PREFIX+name)
        mat.diffuse_color=(*tint,1)
        mat.use_nodes=True
        mat.use_backface_culling=True
        p=mat.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value=(*tint,1)
        p.inputs['Roughness'].default_value=rough
        p.inputs['Metallic'].default_value=metal
        if name in {'Light','Screen'}:
            p.inputs['Emission Color'].default_value=(*tint,1)
            p.inputs['Emission Strength'].default_value=1
        if name=='Stained':
            colour=mat.node_tree.nodes.new('ShaderNodeVertexColor')
            colour.layer_name='wear'
            mat.node_tree.links.new(colour.outputs['Color'],p.inputs['Base Color'])
    print('Owned chemical-laboratory studio initialized; other scenes retained.')


def mesh(name,vertices,faces,finish,bevel=0,facing=None,region='Shell',parent='Architecture'):
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
    if finish=='Stained':
        colours=data.color_attributes.new(name='wear',type='FLOAT_COLOR',domain='POINT')
        for vertex in data.vertices:
            x,z,y=vertex.co.x,-vertex.co.y,vertex.co.z
            wave=.5+.5*math.sin(x*2.1+z*1.3+math.sin(z*.65)*2)
            drips=(.5+.5*math.sin(x*9.1+z*6.7))**4
            wet=max(0,min(1,(8.9-y)/3.5))
            stain=min(.82,wet*(.25+.4*wave+.25*drips))
            colours.data[vertex.index].color=(.43*(1-stain*.65),.53*(1-stain*.35),.55*(1-stain*.75),1)
    obj=bpy.data.objects.new(PREFIX+name,data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(bpy.data.materials[PREFIX+finish])
    if parent:
        obj.parent=bpy.data.objects[PREFIX+parent]
    obj['visualOnly']=True
    obj['region']=region
    return obj


def box(name,size,position,finish,bevel=.025,region='Shell',parent='Architecture'):
    x,y,z=position
    a,b,c=[v/2 for v in size]
    return mesh(name,[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                     (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)],
                [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],
                finish,min(bevel,min(size)*.2),region=region,parent=parent)


def quad(name,vertices,finish,facing,region='Shell',parent='Architecture'):
    return mesh(name,vertices,[(0,1,2,3)],finish,facing=facing,region=region,parent=parent)


def tube(name,a,b,radius,finish,sides=16,region='Shell',parent='Architecture'):
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


def ring(name,centre,inner,outer,depth,finish,axis='y',sides=24,region='Shell',parent='Architecture'):
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


def wall_panel(name,points,finish,normal):
    if finish!='Stained':
        return quad(name,points,finish,normal)
    # Broad stains/drips have real vertex colour; micro detail reuses Room 1 maps.
    a,b,c,d=[Vector(p) for p in points]
    u=max(2,int((b-a).length*1.4))
    v=max(2,int((d-a).length*1.4))
    vertices=[]
    for j in range(v+1):
        for i in range(u+1):
            vertices.append(tuple(a.lerp(b,i/u).lerp(d.lerp(c,i/u),j/v)))
    faces=[]
    for j in range(v):
        for i in range(u):
            n=j*(u+1)+i
            faces.append((n,n+1,n+u+2,n+u+1))
    return mesh(name,vertices,faces,finish,facing=normal)


def build_basin():
    # Liquid is runtime-owned at Y=5.05, X=+-16.35, Z=49.65..76.35.
    quad('Reservoir bottom',[(-16.75,4.65,49.25),(16.75,4.65,49.25),
         (16.75,4.65,76.75),(-16.75,4.65,76.75)],'Graphite',(0,1,0))
    for side in (-1,1):
        box('Basin side coping '+str(side),(.28,.46,27.1),(side*16.51,5.30,63),'Graphite',.045)
        box('Basin end coping '+str(side),(32.74,.46,.28),(0,5.30,63+side*13.41),'Graphite',.045)
        box('Basin side steel lip '+str(side),(.16,.075,26.70),(side*16.51,5.60,63),'Alloy',.012)
        box('Basin end steel lip '+str(side),(32.78,.075,.16),(0,5.60,63+side*13.41),'Alloy',.012)
        for z in (52,57,62,67,72):
            # Recessed overflow slots are discrete instruments on the outer wall.
            box('Overflow throat '+str(side)+' '+str(z),(.10,.48,1.35),(side*16.71,6.05,z),'Graphite',.02)
            for i in range(5):
                box('Overflow fin '+str(side)+' '+str(z)+' '+str(i),(.035,.36,.055),
                    (side*16.642,6.05,z-.48+i*.24),'Alloy',.006)
    for x in (-12.5,11.5):
        box('Basin caution tab '+str(x),(1.8,.028,.13),(x,5.665,49.59),'Amber',0)
    print('Reinforced reservoir, disjoint coping, overflow intakes and selective hazard tabs built.')


def build_shell():
    for side in (-1,1):
        holes=[(53.6,63.4,6.25,19.5)] if side==-1 else [(58.65,67.35,12.15,22.35)]
        zs=sorted(set((49.2,53.6,58.65,63.4,67.35,71.2,76.8)))
        ys=(5.55,6.25,9.5,12.15,19.5,22.35,26.5,31.8,34.2)
        for i in range(len(zs)-1):
            for j in range(len(ys)-1):
                z0,z1,y0,y1=zs[i],zs[i+1],ys[j],ys[j+1]
                z,y=(z0+z1)/2,(y0+y1)/2
                if any(a<z<b and c<y<d for a,b,c,d in holes):
                    continue
                finish='Stained' if y<9.5 else 'Graphite' if y>31.8 else 'Cool' if side==-1 and z>67 else 'Ivory'
                x=side*16.86
                wall_panel('Side field '+str(side)+' '+str(i)+' '+str(j),
                    [(x,y0+.014,z0+.014),(x,y1-.014,z0+.014),(x,y1-.014,z1-.014),(x,y0+.014,z1-.014)],
                    finish,(-side,0,0))
        a,b,c,d=holes[0]
        for k,(z0,z1,y0,y1) in enumerate(((49.2,a,5.55,34.2),(b,76.8,5.55,34.2),(a,b,5.55,c),(a,b,d,34.2))):
            x=side*17.02
            quad('Side backing '+str(side)+' '+str(k),[(x,y0,z0),(x,y1,z0),(x,y1,z1),(x,y0,z1)],'Graphite',(-side,0,0))
        for z in (49.6,64.1,76.4):
            segments=((5.65,12.0),(22.48,34.02)) if side==1 and z==64.1 else ((5.65,34.02),)
            for low,high in segments:
                box('Structural pier '+str(side)+' '+str(z)+' '+str(low),(.30,high-low,.36),
                    (side*16.60,(low+high)/2,z),'Graphite',.035)
    for front in (True,False):
        z=49.2 if front else 76.8
        holes=[(-1.5,1.5,10.2,14.0)] if front else [(-14.6,-3.8,10.4,29.2),(6.65,11.35,23.7,31.5),(7.8,10.2,31.175,33.36)]
        xs=sorted(set((-16.8,16.8)+tuple(v for hole in holes for v in hole[:2])))
        # The dividing wall must reach the reservoir bed. Stopping at the
        # coping height leaves an open strip behind the detached metal rim.
        base=4.65 if front else 5.55
        ys=sorted(set((base,9.5,22.8,34.2)+tuple(v for hole in holes for v in hole[2:])))
        for i in range(len(xs)-1):
            for j in range(len(ys)-1):
                a,b,c,d=xs[i],xs[i+1],ys[j],ys[j+1]
                x,y=(a+b)/2,(c+d)/2
                if any(x0<x<x1 and y0<y<y1 for x0,x1,y0,y1 in holes):
                    continue
                finish='Stained' if y<9.5 else 'Cool' if front else 'Ivory'
                wall_panel(('Entry' if front else 'Exit')+' field '+str(i)+' '+str(j),
                    [(a,c,z),(b,c,z),(b,d,z),(a,d,z)],finish,(0,0,1 if front else -1))
    quad('Ceiling',[(-16.8,34.2,49.2),(-16.8,34.2,76.8),(16.8,34.2,76.8),(16.8,34.2,49.2)],'Graphite',(0,-1,0))
    build_entry_door()
    # Camera/monitor mounting pads physically meet their preserved wall brackets.
    for y,z,w,h in ((12.85,53.2,3.35,2.25),(13.10,56.15,.65,.65)):
        depth,centre=(.04,16.875) if z==56.15 else (.16,16.77)
        box('East instrument pad '+str(z),(depth,h,w),(centre,y,z),'Graphite',.025)
    box('Upper surveillance pad',(1,.8,.16),(1.5,27.85,76.77),'Graphite',.025)
    print('Asymmetric service/adhesion walls and sealed single-owner shell built.')


def build_entry_door():
    # One raised industrial shutter spans the shared wall. Its leaf parks above
    # the existing 3 m passage; the platform owns the floor, with no new collider.
    for side in (-1,1):
        x=side*1.5
        quad('Bulkhead reveal '+str(side),[(x,10.905,48.8),(x,14,48.8),
             (x,14,49.2),(x,10.905,49.2)],'Alloy',(-side,0,0))
        x=side*1.74
        box('Bulkhead drive column '+str(side),(.40,2.78,.90),(x,12.73,48.98),'Graphite',.045)
        box('Bulkhead impact foot '+str(side),(.54,.40,1.02),(side*1.81,11.12,48.98),'Graphite',.025)
        for z in (48.46,49.50):
            box('Bulkhead face armour '+str(side)+' '+str(z),(.25,2.68,.10),(x,12.65,z),'Alloy',.016)
            box('Bulkhead guide indicator '+str(side)+' '+str(z),(.028,1.58,.014),
                (x+side*.055,12.65,z+(-.070 if z<49 else .070)),'Screen',0)
        box('Bulkhead foot hazard inlay '+str(side),(.34,.075,.012),(side*1.81,11.24,48.448),'Amber',0)
        for y in (11.48,13.80):
            tube('Bulkhead captive bolt '+str(side)+' '+str(y),(x-side*.07,y,48.405),
                 (x-side*.07,y,48.426),.035,'Graphite',8)
        # The cheeks close the roller case without adding a second lintel.
        box('Bulkhead roller cheek '+str(side),(.31,.67,.86),(side*1.88,14.465,48.99),'Graphite',.02)
    quad('Bulkhead upper reveal',[(-1.5,14,48.8),(1.5,14,48.8),
         (1.5,14,49.2),(-1.5,14,49.2)],'Alloy',(0,-1,0))
    box('Bulkhead roller rear casing',(3.42,.64,.18),(0,14.50,49.29),'Graphite',.025)
    box('Bulkhead roller front fascia',(3.42,.46,.16),(0,14.56,48.50),'Cool',.025)
    box('Bulkhead roller crown',(4.12,.09,.98),(0,14.845,48.98),'Alloy',.014)
    tube('Bulkhead shutter drum',(-1.49,14.56,48.87),(1.49,14.56,48.87),.19,'Graphite',20)
    for side in (-1,1):
        ring('Bulkhead drive bearing '+str(side),(side*1.57,14.56,48.87),.08,.22,.08,'Alloy','x',20)
    # A clearly visible shutter bottom and seal sit safely above the headroom.
    box('Bulkhead raised shutter leaf',(2.96,.27,.12),(0,14.185,48.65),'Alloy',.012)
    box('Bulkhead shutter bottom seal',(2.91,.038,.14),(0,14.058,48.65),'Graphite',0)
    for y in (14.15,14.24):
        box('Bulkhead shutter rib '+str(y),(2.84,.014,.018),(0,y,48.570),'Graphite',0)
    for z in (48.407,49.402):
        box('Bulkhead ready lamp '+str(z),(1.45,.055,.014),(0,14.56,z),'Light',0)
    # Recessed access reader on the Room 2 approach, with physical buttons.
    box('Bulkhead reader housing',(.31,.64,.20),(2.15,12.25,48.69),'Graphite',.025)
    box('Bulkhead reader bezel',(.23,.36,.035),(2.15,12.34,48.561),'Alloy',.009)
    box('Bulkhead reader screen',(.17,.24,.012),(2.15,12.36,48.529),'Screen',0)
    for x in (2.10,2.20):
        box('Bulkhead reader key '+str(x),(.032,.032,.016),(x,12.08,48.575),'Alloy',0)
    print('Shared raised-shutter bulkhead built; original passage, floor and surveillance mount retained.')


def build_processing_bay():
    # Recess beyond the west collision wall; no new accessible floor or route.
    quad('Plant rear wall',[(-19.9,6.1,53.45),(-19.9,19.65,53.45),(-19.9,19.65,63.55),(-19.9,6.1,63.55)],'Graphite',(1,0,0))
    for z in (53.45,63.55):
        quad('Plant return '+str(z),[(-19.9,6.1,z),(-16.82,6.1,z),(-16.82,19.65,z),(-19.9,19.65,z)],'Cool',(0,0,1 if z<60 else -1))
    for y in (6.1,19.65):
        quad('Plant sill '+str(y),[(-19.9,y,53.45),(-16.82,y,53.45),(-16.82,y,63.55),(-19.9,y,63.55)],'Graphite',(0,1 if y<10 else -1,0))
    for z in (55.8,60.6):
        tube('Filter vessel '+str(z),(-18.35,7.2,z),(-18.35,14.6,z),.82,'Cool',24)
        for y in (7.05,14.75):
            tube('Filter end cap '+str(z)+' '+str(y),(-18.35,y-.10,z),(-18.35,y+.10,z),.94,'Alloy',24)
        for y in (8.3,12.8):
            ring('Vessel collar '+str(z)+' '+str(y),(-18.35,y,z),.835,.96,.16,'Graphite')
        tube('Filter riser '+str(z),(-18.35,14.86,z),(-18.35,18.5,z),.20,'Alloy')
        tube('Filter supply '+str(z),(-18.35,7.0,z),(-18.35,6.70,z),.22,'Graphite')
        tube('Supply elbow '+str(z),(-18.35,6.70,z),(-16.53,6.70,z),.22,'Graphite')
        tube('Basin feed '+str(z),(-16.53,6.70,z),(-16.53,5.85,z),.12,'Alloy')
        box('Filter service controller '+str(z),(.30,.70,.65),(-17.35,11.0,z),'Ivory',.04)
        quad('Controller screen '+str(z),[(-17.18,10.77,z-.22),(-17.18,11.23,z-.22),(-17.18,11.23,z+.22),(-17.18,10.77,z+.22)],'Screen',(1,0,0))
        tube('Valve spindle '+str(z),(-17.55,8.0,z),(-17.13,8.0,z),.07,'Alloy',12)
        ring('Valve handwheel '+str(z),(-17.10,8.0,z),.20,.25,.05,'Amber','x',20)
        for side in (-1,1):
            box('Vessel foot '+str(z)+' '+str(side),(.38,.50,.42),(-18.35+side*.55,6.85,z),'Graphite',.025)
    tube('Chemical header',(-18.35,18.52,54.9),(-18.35,18.52,61.5),.23,'Alloy')
    for z in (53.55,63.45):
        box('Plant reveal '+str(z),(.24,13.45,.20),(-16.94,12.95,z),'Alloy')
    for y in (6.18,19.57):
        box('Plant header '+str(y),(.24,.12,9.70),(-16.94,y,58.5),'Alloy',.018)
    # A waist-height protective grille leaves the vessels readable from entry.
    for i in range(18):
        box('Plant guard upright '+str(i),(.06,2.3,.035),(-16.82,7.55,53.8+i*.55),'Graphite',.005)
    box('Plant guard rail',(.09,.09,9.65),(-16.80,8.75,58.5),'Alloy',.012)
    print('Recessed twin filtration plant, pressure controllers and basin feeds built.')


def build_rear_plant():
    # A second deep machinery recess gives the tall rear wall a focal point.
    quad('Rear plant backing',[(-14.6,10.4,78.4),(-3.8,10.4,78.4),(-3.8,29.2,78.4),(-14.6,29.2,78.4)],'Graphite',(0,0,-1))
    for x in (-14.6,-3.8):
        quad('Rear plant return '+str(x),[(x,10.4,76.8),(x,29.2,76.8),(x,29.2,78.4),(x,10.4,78.4)],'Cool',(1 if x< -10 else -1,0,0))
        box('Rear plant upright '+str(x),(.20,18.6,.22),(x,19.8,76.79),'Alloy')
    for y in (10.4,29.2):
        quad('Rear plant sill '+str(y),[(-14.6,y,76.8),(-3.8,y,76.8),(-3.8,y,78.4),(-14.6,y,78.4)],'Graphite',(0,1 if y<20 else -1,0))
        box('Rear plant lintel '+str(y),(10.6,.18,.22),(-9.2,y,76.79),'Alloy')
    for i,(x,y) in enumerate(((-11.5,19.3),(-6.9,25.4))):
        box('Extractor fan frame '+str(i),(3.8,3.8,.24),(x,y,77.45),'Cool',.06)
        ring('Extractor duct '+str(i),(x,y,77.10),1.34,1.55,.26,'Alloy','z',32)
        tube('Extractor back plate '+str(i),(x,y,77.59),(x,y,77.64),1.30,'Graphite',32)
        tube('Extractor spindle '+str(i),(x,y,77.16),(x,y,77.52),.31,'Alloy',24)
        for n in range(8):
            angle=math.tau*n/8
            vertices=[]
            for z in (77.22,77.29):
                for radius,tangent in ((.28,-.05),(1.21,-.14),(1.14,.25),(.28,.05)):
                    vertices.append((x+radius*math.cos(angle)-tangent*math.sin(angle),
                                     y+radius*math.sin(angle)+tangent*math.cos(angle),z))
            mesh('Extractor blade '+str(i)+' '+str(n),vertices,
                 [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'Graphite')
        tube('Extractor lower feed '+str(i),(x,11.1,77.2),(x,y-2.0,77.2),.23,'Alloy')
        for height in (12.2,y-2.5):
            ring('Extractor flange '+str(i)+' '+str(height),(x,height,77.2),.235,.34,.16,'Graphite')
        for side in (-1,1):
            box('Extractor service strip '+str(i)+' '+str(side),(.12,1.8,.08),(x+side*1.70,y,77.28),'Amber',0)
    box('Rear process control',(1.9,1.1,.30),(-6.3,14.3,77.3),'Graphite',.04)
    quad('Rear process screen',[(-7.05,13.92,77.125),(-5.55,13.92,77.125),(-5.55,14.68,77.125),(-7.05,14.68,77.125)],'Screen',(0,0,-1))
    print('Deep rear extraction plant with two full-size static fans and service manifolds built.')


def build_platforms():
    for name,w,h,d,x,y,z in PLATFORMS:
        top=y+h/2
        gx=(-w/2,-w/2+.13,-w/2+.23,w/2-.23,w/2-.13,w/2)
        gz=(-d/2,-d/2+.13,-d/2+.23,d/2-.23,d/2-.13,d/2)
        for i in range(5):
            for j in range(5):
                finish='Amber' if i in (1,3) and j in (1,3) else 'Alloy' if i in (0,4) or j in (0,4) else 'Island'
                quad(name+' landing '+str(i)+' '+str(j),[(x+gx[i],top,z+gz[j]),(x+gx[i+1],top,z+gz[j]),
                     (x+gx[i+1],top,z+gz[j+1]),(x+gx[i],top,z+gz[j+1])],finish,(0,1,0),'Platforms')
        vertices=[(x-w/2,top,z-d/2),(x+w/2,top,z-d/2),(x+w/2,top,z+d/2),(x-w/2,top,z+d/2),
                  (x-w/2,top-.15,z-d/2),(x+w/2,top-.15,z-d/2),(x+w/2,top-.15,z+d/2),(x-w/2,top-.15,z+d/2)]
        mesh(name+' deck perimeter',vertices,[(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'Alloy',region='Platforms')
        box(name+' heatshield',(w-.20,.25,d-.20),(x,top-.305,z),'Graphite',.04,'Platforms')
        for side in (-1,1):
            box(name+' long carrier '+str(side),(.12,.12,d*.8),(x+side*w*.31,top-.52,z),'Alloy',.018,'Platforms')
            box(name+' transverse carrier '+str(side),(w*.62-.12,.12,.12),(x,top-.52,z+side*d*.26),'Alloy',.018,'Platforms')
        tube(name+' actuator socket',(x,top-.65,z),(x,top-.445,z),.34,'Alloy',20,'Platforms')
        tube(name+' engine connection',(x,top-.72,z),(x,top-.65,z),.13,'Graphite',16,'Platforms')
        ring(name+' engine cradle',(x,top-.90,z),.42,.57,.16,'Alloy',sides=24,region='Platforms')
        for sx in (-1,1):
            for sz in (-1,1):
                mount=(x+sx*w*.31,top-.62,z+sz*d*.26)
                tag=name+' harness '+str(sx)+' '+str(sz)
                box(tag+' clevis',(.21,.19,.26),mount,'Graphite',.025,'Platforms')
                tube(tag+' diagonal',mount,(x+sx*.35,top-.90,z+sz*.35),.065,'Alloy',12,'Platforms')
                box(tag+' latch',(.025,.08,.13),(mount[0]+sx*.13,mount[1],mount[2]),'Amber',0,'Platforms')
        for side in (-1,1):
            for i in range(4):
                box(name+' cooling fin '+str(side)+' '+str(i),(.06,.21,.42),
                    (x+side*w*.38,top-.535,z-.72+i*.48),'Cool',.008,'Platforms')
    print('All eight exact landing surfaces and heavy braced thruster-platform rigs built.')


def build_adhesion():
    quad('Main adhesion surface',[(16.64,12.5,59),(16.64,22,59),(16.64,22,67),(16.64,12.5,67)],'Sticky',(-1,0,0))
    quad('Main adhesion backing',[(17.02,12.15,58.65),(17.02,22.35,58.65),(17.02,22.35,67.35),(17.02,12.15,67.35)],'Graphite',(-1,0,0))
    for z in (58.79,67.21):
        box('Adhesion vertical frame '+str(z),(.22,9.85,.22),(16.83,17.25,z),'Alloy')
        for y in (13.2,16.7,21.3):
            box('Adhesion captive clamp '+str(z)+' '+str(y),(.28,.30,.30),(16.76,y,z),'Graphite',.025)
            box('Adhesion clamp latch '+str(z)+' '+str(y),(.035,.09,.17),(16.60,y,z),'Amber',0)
    for y in (12.30,22.20):
        box('Adhesion horizontal frame '+str(y),(.22,.18,8.18),(16.83,y,63),'Alloy')
    tube('Adhesion pressure main',(16.92,12.5,69.1),(16.92,23.2,69.1),.12,'Cool')
    for y in (13,17,21):
        ring('Adhesion pressure flange '+str(y),(16.92,y,69.1),.125,.20,.09,'Alloy')
    for i in range(9):
        box('Adhesion scale '+str(i),(.018,.045,.30 if i%2 else .48),(16.81,13+i,57.95),'Alloy',0)
    # The final strip retains the complete authoritative vertical coverage.
    y0,y1=23.99665,31.35755
    quad('Final adhesion surface',[(7,y0,76.64),(11,y0,76.64),(11,y1,76.64),(7,y1,76.64)],'Sticky',(0,0,-1))
    quad('Final adhesion backing',[(6.65,23.7,76.96),(11.35,23.7,76.96),(11.35,31.5,76.96),(6.65,31.5,76.96)],'Graphite',(0,0,-1))
    for x in (6.81,11.19):
        box('Final adhesion upright '+str(x),(.20,7.52,.20),(x,(y0+y1)/2,76.79),'Alloy')
        for y in (24.4,27.5,30.85):
            box('Final adhesion clamp '+str(x)+' '+str(y),(.30,.28,.27),(x,y,76.72),'Graphite',.025)
    box('Final adhesion bottom seal',(4.18,.18,.20),(9,23.82,76.79),'Alloy')
    print('Replaceable adhesion installations and measured wall-climb indicators built.')


def build_extraction():
    # Ceiling plant occupies the unused west side; the route remains open.
    for z in (51.1,63.4,75.6):
        box('Ceiling structural bridge '+str(z),(32.7,.34,.60),(0,33.93,z),'Graphite',.045)
    box('Extraction spine',(2.5,.80,22.7),(-12.7,33.12,63.1),'Cool',.065)
    for z in (55.2,65.0,72.6):
        box('Extraction hood '+str(z),(3.8,.55,3.6),(-12.7,32.35,z),'Graphite',.06)
        for i in range(9):
            box('Hood grille '+str(z)+' '+str(i),(.13,.10,3.10),(-14.10+i*.35,32.015,z),'Alloy',.012)
    for x in (-9.75,-8.95):
        tube('Ceiling chemical return '+str(x),(x,32.95,50.5),(x,32.95,75.4),.15,'Alloy')
    # Three fixture bodies meet the existing light origins; no new game lights.
    for i,(x,y,z) in enumerate(((-6.5,30,54),(8,29,64),(9,32.5,74.3))):
        for side in (-1,1):
            box('Fixture side '+str(i)+' '+str(side),(.12,.22,.70),(x+side*1.45,y+.18,z),'Alloy')
            box('Fixture end '+str(i)+' '+str(side),(2.78,.22,.10),(x,y+.18,z+side*.41),'Graphite')
        quad('Fixture diffuser '+str(i),[(x-1.34,y+.055,z-.29),(x+1.34,y+.055,z-.29),
             (x+1.34,y+.055,z+.29),(x-1.34,y+.055,z+.29)],'Light',(0,-1,0))
        tube('Fixture suspension '+str(i),(x,y+.30,z),(x,33.73,z),.055,'Alloy',12)
    # A compact extraction crown makes the high escape opening a clear landmark.
    for x in (7.64,10.36):
        box('Exit portal jamb '+str(x),(.20,2.24,.22),(x,32.27,76.81),'Alloy')
    box('Exit portal header',(2.92,.20,.22),(9,33.49,76.81),'Alloy')
    box('Exit extraction crown',(3.8,.48,.85),(9,33.59,76.12),'Cool',.04)
    for i in range(8):
        box('Exit crown fin '+str(i),(.12,.17,.62),(7.61+i*.397,33.24,76.12),'Graphite',.008)
    # The walking floor, walls and roof replace the old lining without overlays.
    quad('Duct floor',[(7.945,31.175,77),(10.055,31.175,77),(10.055,31.175,80.78),(7.945,31.175,80.78)],'Alloy',(0,1,0))
    quad('Duct roof',[(7.945,33.36,77),(10.055,33.36,77),(10.055,33.36,80.78),(7.945,33.36,80.78)],'Graphite',(0,-1,0))
    for x in (7.945,10.055):
        quad('Duct side '+str(x),[(x,31.175,77),(x,33.36,77),(x,33.36,80.78),(x,31.175,80.78)],'Cool',(1 if x<9 else -1,0,0))
    print('Extraction plant, ceiling frames, existing-light fixtures and elevated escape duct built.')


def build_laser_mounts():
    # Cantilever arms carry each low optical head from a real deck edge. They
    # stay beneath the landing plane and outside the charged-jump centreline.
    mounts=(
        ((-3.70,10.44,53.55),(-3.70,10.44,54.5525),(-3.70,11.15,54.5525)),
        ((4.65,10.69,55.80),(5.34,10.69,55.80),(5.34,10.69,54.5525),(5.34,11.15,54.5525)),
        ((8.82,11.20,60.75),(6.4542,11.20,60.75),(6.4542,11.20,62.57),(6.4542,11.74,62.57)),
        ((3.75,10.44,53.53),(6.4542,10.44,53.53),(6.4542,11.74,53.53)),
    )
    for i,points in enumerate(mounts):
        a=points[0]
        box('Optical anchor shoe '+str(i),(.34,.15,.38),a,'Graphite',.025)
        for j in range(len(points)-1):
            tube('Optical carrier arm '+str(i)+' '+str(j),points[j],points[j+1],.065,'Alloy',12)
        end=points[-1]
        tube('Optical mounting socket '+str(i),(end[0],end[1]-.08,end[2]),(end[0],end[1]+.03,end[2]),.12,'Graphite',16)
    # Wall test rails lie behind the adhesion face, outside the beam envelope.
    for y in (16.3,19.1):
        box('Wall optical rail '+str(y),(.12,.24,8.5),(16.89,y,63),'Graphite',.025)
    # The sweep-origin support belongs beneath its existing fixed pivot.
    tube('Sweep bearing stem',(4.6941,23.82,62.0384),(4.6941,23.94,62.0384),.09,'Alloy',16)
    ring('Sweep bearing',(4.6941,23.97,62.0384),.10,.23,.10,'Graphite')
    print('Deck-mounted optical carrier arms, recessed wall rails and sweep-pivot mounting built.')


def build_laser_model():
    root=bpy.data.objects.new(PREFIX+'LaserHousing',None)
    root['asset']='containment-room-three-laser-v1'
    bpy.context.scene.collection.objects.link(root)
    # Local game +Y is the authoritative beam direction. All hardware is behind
    # the beam origin; moving endpoints and status remain with the laser adapter.
    box('Optical head',(.44,.49,.44),(0,-.37,0),'Graphite',.035,'Emitter','LaserHousing')
    box('Laser rear mount',(.56,.08,.56),(0,-.71,0),'Alloy',.018,'Emitter','LaserHousing')
    tube('Optical servo neck',(0,-.67,0),(0,-.60,0),.13,'Graphite',20,'Emitter','LaserHousing')
    ring('Laser focusing barrel',(0,-.08,0),.085,.158,.12,'Alloy',sides=24,region='Emitter',parent='LaserHousing')
    ring('Lens protective rim',(0,-.012,0),.085,.115,.012,'Graphite',sides=24,region='Emitter',parent='LaserHousing')
    for side in (-1,1):
        tube('Optical gimbal pin '+str(side),(side*.215,-.39,0),(side*.242,-.39,0),.05,'Graphite',16,'Emitter','LaserHousing')
        tube('Optical trunnion '+str(side),(side*.245,-.39,0),(side*.30,-.39,0),.10,'Alloy',20,'Emitter','LaserHousing')
        box('Optical cooling panel '+str(side),(.31,.29,.025),(0,-.37,side*.232),'Graphite',.006,'Emitter','LaserHousing')
        for i in range(5):
            box('Optical cooling rib '+str(side)+' '+str(i),(.022,.23,.024),(-.12+i*.06,-.37,side*.258),'Alloy',0,'Emitter','LaserHousing')
    tube('LaserAperture',(0,-.018,0),(0,-.006,0),.08,'Graphite',24,'Aperture',None)
    # One unioned cross: split the vertical arms at the horizontal member.
    vertices=[]
    faces=[]
    for size,at in (((.15,.018,.025),(0,.014,0)),((.025,.018,.0625),(0,.014,-.04375)),
                    ((.025,.018,.0625),(0,.014,.04375))):
        x,y,z=at
        a,b,c=[v/2 for v in size]
        offset=len(vertices)
        vertices.extend(((x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                         (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)))
        for face in ((0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)):
            faces.append(tuple(offset+i for i in face))
    mesh('LaserShutter',vertices,faces,'Graphite',region='Shutter',parent=None)
    print('Shared two-finish optical head, gimbal, aperture and non-overlapping shutter built.')


def preview():
    scene=bpy.context.scene
    for obj in list(scene.objects):
        if obj.name.startswith(PREFIX+'Preview') or obj.type in {'CAMERA','LIGHT'} and obj.name.startswith(PREFIX):
            bpy.data.objects.remove(obj,do_unlink=True)
    for i,(x,y,z,power) in enumerate(((-6.5,30,54,3500),(8,29,64,4000),(9,32.5,74.3,2400))):
        data=bpy.data.lights.new(PREFIX+'Preview softbox '+str(i),'AREA')
        data.energy,data.shape,data.size=power,'DISK',7
        obj=bpy.data.objects.new(data.name,data)
        scene.collection.objects.link(obj)
        obj.location=xyz((x,y,z))
    mat=bpy.data.materials.get(PREFIX+'Preview liquid') or bpy.data.materials.new(PREFIX+'Preview liquid')
    mat.diffuse_color=(.24,.48,.075,1)
    mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(.24,.48,.075,1)
    p.inputs['Roughness'].default_value=.19
    p.inputs['Metallic'].default_value=.25
    water=quad('Preview acid',[(-16.35,5.05,49.65),(16.35,5.05,49.65),(16.35,5.05,76.35),(-16.35,5.05,76.35)],'Graphite',(0,1,0),parent=None)
    water.data.materials.clear()
    water.data.materials.append(mat)
    for name,w,h,d,x,y,z in PLATFORMS:
        top=y+h/2
        tube('Preview engine '+name,(x,top-.72,z),(x,top-1.28,z),.29,'Graphite',16,parent=None)
    data=bpy.data.cameras.new(PREFIX+'Review camera')
    camera=bpy.data.objects.new(data.name,data)
    scene.collection.objects.link(camera)
    camera.location=xyz((-.5,14.5,51.4))
    camera.rotation_euler=(Vector(xyz((-1.5,17,75.5)))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.lens=19
    scene.camera=camera
    scene.render.resolution_x,scene.render.resolution_y=1280,800
    scene.render.resolution_percentage=100
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    for name in ('LaserHousing','LaserAperture','LaserShutter'):
        obj=bpy.data.objects[PREFIX+name]
        obj.hide_render=True
        obj.hide_set(True)
    preview_lasers()
    for area in bpy.context.screen.areas if bpy.context.screen else ():
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.use_local_camera=True
            space.camera=camera
            space.region_3d.view_perspective='CAMERA'
            space.region_3d.view_camera_zoom=0
            space.region_3d.view_camera_offset=(0,0)
            space.shading.type='MATERIAL'
            space.overlay.show_overlays=False


def preview_lasers(housing=None,aperture=None):
    # Assemble the runtime kit in the editor too. Preview copies are excluded
    # from the GLB; the game's deterministic laser owners place the same parts.
    red=bpy.data.materials.get(PREFIX+'Preview laser red') or bpy.data.materials.new(PREFIX+'Preview laser red')
    red.diffuse_color=(1,.012,.025,1)
    red.use_nodes=True
    p=red.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(1,.012,.025,1)
    p.inputs['Emission Color'].default_value=(1,.012,.025,1)
    p.inputs['Emission Strength'].default_value=4
    source=housing or bpy.data.objects[PREFIX+'LaserHousing']
    beams=(
        ((-2.979,11.3706,54.5525),(4.621,11.3706,54.5525),True),
        ((6.4542,11.9598,61.8538),(6.4542,11.9598,54.2428),True),
        ((16.3,16.3,59.2),(16.3,16.3,64.3),True),
        ((16.3,19.1,61.5),(16.3,19.1,66.7),True),
        ((4.6941,24.2747,62.0384),(9.39096,24.2747,63.75289),False),
        ((7.3,29.8,76.25),(10.7,29.8,76.25),True),
    )
    for i,(a,b,on) in enumerate(beams):
        for j,(at,target) in enumerate(((a,b),(b,a))):
            root=bpy.data.objects.new(PREFIX+'Preview optical head '+str(i)+' '+str(j),None)
            bpy.context.scene.collection.objects.link(root)
            root.location=xyz(at)
            root.rotation_mode='QUATERNION'
            root.rotation_quaternion=Vector(xyz(Vector(target)-Vector(at))).to_track_quat('Z','Y')
            for part in source.children:
                obj=part.copy()
                obj.name=PREFIX+'Preview '+part.name+' '+str(i)+' '+str(j)
                bpy.context.scene.collection.objects.link(obj)
                obj.parent=root
                obj.hide_render=False
                obj.hide_set(False)
            lens=(aperture or bpy.data.objects[PREFIX+'LaserAperture']).copy()
            lens.data=lens.data.copy()
            lens.name=PREFIX+'Preview aperture '+str(i)+' '+str(j)
            lens.data.materials.clear()
            lens.data.materials.append(red if on else bpy.data.materials[PREFIX+'Graphite'])
            bpy.context.scene.collection.objects.link(lens)
            lens.parent=root
            lens.hide_render=False
            lens.hide_set(False)
        if on:
            beam=tube('Preview beam '+str(i),a,b,.035,'Graphite',8,parent=None)
            beam.data.materials.clear()
            beam.data.materials.append(red)


def export_asset():
    scene=bpy.context.scene
    architecture=bpy.data.objects[PREFIX+'Architecture']
    housing=bpy.data.objects[PREFIX+'LaserHousing']
    aperture=bpy.data.objects[PREFIX+'LaserAperture']
    shutter=bpy.data.objects[PREFIX+'LaserShutter']
    selected,active=list(bpy.context.selected_objects),bpy.context.view_layer.objects.active
    for name,obj in (('Architecture',architecture),('LaserHousing',housing),('LaserAperture',aperture),('LaserShutter',shutter)):
        obj.name=PREFIX+'Editable '+name
    runtime=bpy.data.objects.new(PREFIX+'Architecture',None)
    runtime['asset']='containment-room-three-v1'
    scene.collection.objects.link(runtime)
    emitter=bpy.data.objects.new(PREFIX+'LaserHousing',None)
    emitter['asset']='containment-room-three-laser-v1'
    scene.collection.objects.link(emitter)
    owned=[runtime,emitter]
    copies=[]
    try:
        groups={}
        for source in list(architecture.children)+list(housing.children):
            obj=source.copy()
            obj.data=source.data.copy()
            scene.collection.objects.link(obj)
            obj.hide_set(False)
            obj.hide_render=False
            obj.parent=runtime if source.parent==architecture else emitter
            copies.append(obj.data)
            key=(obj.get('region','Shell'),obj.data.materials[0].name)
            groups.setdefault(key,[]).append(obj)
        for (region,finish),objects in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:
                bpy.ops.object.join()
            bpy.context.view_layer.objects.active.name=PREFIX+'Batch_'+region+'_'+finish.removeprefix(PREFIX)
        for name,source in (('LaserAperture',aperture),('LaserShutter',shutter)):
            obj=source.copy()
            obj.data=source.data.copy()
            obj.name=PREFIX+name
            scene.collection.objects.link(obj)
            obj.hide_set(False)
            obj.hide_render=False
            obj.parent=None
            owned.append(obj)
            copies.append(obj.data)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in owned+list(runtime.children)+list(emitter.children):
            obj.select_set(True)
        bpy.context.view_layer.objects.active=runtime
        bpy.ops.export_scene.gltf(filepath=HERE+'/room-three-laboratory.glb',export_format='GLB',
            use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,
            export_cameras=False,export_lights=False,export_animations=False,export_materials='PLACEHOLDER',
            export_vertex_color='ACTIVE',export_active_vertex_color_when_no_material=True)
    finally:
        for obj in list(runtime.children)+list(emitter.children)+owned:
            bpy.data.objects.remove(obj,do_unlink=True)
        for data in set(copies):
            if data.users==0:
                bpy.data.meshes.remove(data)
        for name,obj in (('Architecture',architecture),('LaserHousing',housing),('LaserAperture',aperture),('LaserShutter',shutter)):
            obj.name=PREFIX+name
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=active
    print('Exported material-batched geometry and shared optical-head kit, with metric UVs and vertex wear; no textures or lights.')


def save_source():
    previous=bpy.context.preferences.filepaths.save_version
    try:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=HERE+'/room-three-laboratory.blend',copy=True)
    finally:
        bpy.context.preferences.filepaths.save_version=previous


def main():
    setup()
    build_basin()
    build_shell()
    build_processing_bay()
    build_rear_plant()
    build_platforms()
    build_adhesion()
    build_extraction()
    build_laser_mounts()
    build_laser_model()
    preview()
    export_asset()
    save_source()


if __name__=='__main__':
    main()
