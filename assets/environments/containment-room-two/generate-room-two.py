"""Room 2 locomotion laboratory. Original Blender art; shared Room 1 finishes.

The existing 30 x 22 x 18 m teaching route is the immutable reference.
Interactive stages: setup(), build_shell(), build_service_bay(), build_platforms(),
build_adhesion(), build_observation(), build_drone_wrecks(), build_gantry(),
preview(), export_asset().
Only the R2_ objects in the owned studio are regenerated.
"""
import bpy
import bmesh
import math
from mathutils import Vector, Matrix

HERE = __file__[:max(__file__.rfind('/'), __file__.rfind('\\'))]
PREFIX = 'R2_'
SCENE_NAME = 'Room 2 Locomotion Hall'
PLATFORMS = (
    ('A',3.15,.5,3.15,-6.37855,1.46779,37.78357),
    ('B',2.82146,.5,3.5,-.5,2.55,37),
    ('C',3.8,.5,3.5,4.2,3.85,31.0999),
    ('D',4,.5,4,8.5,5.2,38.5),
    ('Catch ledge',3.1,.35,4.7,13.25,9.15,42.9),
    ('Upper A',4,.4,3.5,8.8,9.65,37.65683),
    ('Upper B',3.6,.4,3.4,.87909,10.15,38.41571),
    ('Exit',7,.5,4,0,10.65,46.79795),
)
FINISHES = {
    'Ivory':((.88,.86,.79),.5,0), 'Cool':((.43,.53,.55),.5,0),
    'Resin':((.43,.50,.51),.65,0), 'Island':((.57,.62,.61),.6,0),
    'Graphite':((.028,.043,.052),.65,.25), 'Alloy':((.28,.35,.37),.37,.7),
    'Glass':((.13,.24,.27),.17,.12), 'Light':((.76,.86,.88),.4,0),
    'Screen':((.055,.23,.25),.5,0), 'Amber':((.52,.28,.06),.5,.12),
    'Sticky':((.03,.55,.58),.65,0),
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
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.17,.21,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
    root=bpy.data.objects.new(PREFIX+'Architecture',None)
    root['asset']='containment-room-two-v1'
    root['gameplay']='Reference only: existing colliders, sticky patch and eight landings remain authoritative.'
    scene.collection.objects.link(root)
    for name,(tint,rough,metal) in FINISHES.items():
        mat=bpy.data.materials.new(PREFIX+name)
        mat.diffuse_color=(*tint,.19 if name=='Glass' else 1)
        mat.use_nodes=True
        mat.use_backface_culling=True
        p=mat.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value=(*tint,1)
        p.inputs['Roughness'].default_value=rough
        p.inputs['Metallic'].default_value=metal
        if name=='Glass':
            p.inputs['Alpha'].default_value=.19
            mat.surface_render_method='DITHERED'
        if name in {'Light','Screen'}:
            p.inputs['Emission Color'].default_value=(*tint,1)
            p.inputs['Emission Strength'].default_value=1
    print('Room 2 studio initialized; other scenes retained.')


def mesh(name,vertices,faces,finish,bevel=0,facing=None,region='Shell'):
    data=bpy.data.meshes.new(PREFIX+name)
    data.from_pydata([xyz(v) for v in vertices],[],faces)
    data.update()
    bm=bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bevel:
        bmesh.ops.bevel(bm,geom=[e for e in bm.edges if e.is_manifold],offset=bevel,
                        segments=2,profile=.5,affect='EDGES',clamp_overlap=True)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if facing:
        direction=Vector(xyz(facing))
        for face in bm.faces:
            if face.normal.dot(direction)<0:
                face.normal_flip()
    bm.to_mesh(data)
    bm.free()
    uv=data.uv_layers.new(name='UVMap')
    for polygon in data.polygons:
        nx,ny,nz=[abs(v) for v in polygon.normal]
        axis=0 if nx>=ny and nx>=nz else 1 if ny>=nz else 2
        for i in polygon.loop_indices:
            p=data.vertices[data.loops[i].vertex_index].co
            a,b=((p.y,p.z) if axis==0 else (p.x,p.z) if axis==1 else (p.x,p.y))
            uv.data[i].uv=(a/2,b/2)
    obj=bpy.data.objects.new(PREFIX+name,data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(bpy.data.materials[PREFIX+finish])
    obj.parent=bpy.data.objects[PREFIX+'Architecture']
    obj['visualOnly']=True
    obj['region']=region
    return obj


def box(name,size,position,finish,bevel=.025,region='Shell'):
    x,y,z=position
    a,b,c=[v/2 for v in size]
    vertices=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
              (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    return mesh(name,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],
                finish,min(bevel,min(size)*.2),region=region)


def quad(name,vertices,finish,facing,region='Shell'):
    return mesh(name,vertices,[(0,1,2,3)],finish,facing=facing,region=region)


def tube(name,a,b,radius,finish,sides=12,region='Shell'):
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
    faces += [tuple(reversed(range(sides))),tuple(range(sides,sides*2))]
    return mesh(name,vertices,faces,finish,region=region)


def floor_patch(name,x0,x1,z0,z1,y,finish,region='Shell'):
    return quad(name,[(x0,y,z0),(x1,y,z0),(x1,y,z1),(x0,y,z1)],finish,(0,1,0),region)


def side_field(side,zs,ys,holes):
    for i in range(len(zs)-1):
        for j in range(len(ys)-1):
            z0,z1=zs[i],zs[i+1]
            y0,y1=ys[j],ys[j+1]
            z,y=(z0+z1)/2,(y0+y1)/2
            if any(a<z<b and c<y<d for a,b,c,d in holes):
                continue
            finish='Cool' if y<1.4 or y>11.8 else 'Ivory'
            x=side*15.04
            quad('Wall field '+str(side)+' '+str(i)+' '+str(j),
                 [(x,y0+.012,z0+.012),(x,y1-.012,z0+.012),(x,y1-.012,z1-.012),(x,y0+.012,z1-.012)],
                 finish,(-side,0,0))


def end_wall(front):
    z=48.8 if front else 27.2
    x0,x1=(-1.5,1.5) if front else (-9.5,-7.3)
    y0,y1=(10.4,14.1) if front else (10.2,12.8)
    xs=(-14.8,x0,x1,14.8) if front else (-14.8,x0,x1,-5.2,9.8,14.8)
    ys=(0,1.4,6.3,y0,y1,18) if front else (0,1.4,1.8,5.8,6.3,y0,y1,18)
    for i in range(len(xs)-1):
        for j in range(len(ys)-1):
            a,b=xs[i],xs[i+1]
            c,d=ys[j],ys[j+1]
            midx,midy=(a+b)/2,(c+d)/2
            if x0<midx<x1 and y0<midy<y1:
                continue
            if not front and -5.2<midx<9.8 and 1.8<midy<5.8:
                continue
            finish='Graphite' if c>=y1 else 'Cool' if d<=1.4 else 'Ivory'
            quad(('Exit' if front else 'Entry')+' wall '+str(i)+' '+str(j),
                 [(a,c,z),(b,c,z),(b,d,z),(a,d,z)],finish,(0,0,-1 if front else 1))


def portal(name,x,y,z,width,height):
    # Horizontal members span the union; jambs stop at their inner edges.
    for side in (-1,1):
        box(name+' jamb '+str(side),(.22,height,.2),(x+side*(width/2+.11),y,z),'Alloy')
        box(name+' header '+str(side),(width+.44,.22,.2),(x,y+side*(height/2+.11),z),'Alloy')


def build_shell():
    xs=(-14.8,-11,-7,-3.5,3.5,7,11,14.8)
    zs=(27.2,29.5,32.5,37.5,43.3,48.8)
    floor_patch('Floor joint backing',-14.8,14.8,27.2,48.8,-.04,'Graphite')
    for i in range(len(xs)-1):
        for j in range(len(zs)-1):
            a,b,c,d=xs[i],xs[i+1],zs[j],zs[j+1]
            if i==1 and j==1:
                # Inlaid landing target: each coloured patch owns its own area.
                tx=(a,a+.22,a+.38,b-.38,b-.22,b)
                tz=(c,c+.22,c+.38,d-.38,d-.22,d)
                for u in range(5):
                    for v in range(5):
                        finish='Amber' if (u in (1,3) and v in (1,3)) else 'Island'
                        floor_patch('Landing inlay '+str(u)+' '+str(v),tx[u]+.012,tx[u+1]-.012,
                                    tz[v]+.012,tz[v+1]-.012,0,finish)
            else:
                floor_patch('Impact floor '+str(i)+' '+str(j),a+.012,b-.012,c+.012,d-.012,0,
                            'Cool' if i in (0,6) else 'Resin')
    side_field(-1,(27.2,30.5,34.5,39.2,43.9,48.8),(0,1.4,6.6,10.8,12.8,14.8),[(34.5,43.9,6.6,10.8)])
    side_field(1,(27.2,29,34.4,39.55,46.45,48.8),(0,1.4,4.1,11.4,12.8,14.8),[(39.55,46.45,4.1,11.4)])
    for side in (-1,1):
        # Backing sits 12 cm behind the fields; the chamber remains sealed at joints.
        x=side*15.18
        holes=[(34.5,43.9,6.6,10.8)] if side==-1 else [(39.55,46.45,4.1,11.4)]
        # Four rectangles surround the single purposeful opening.
        a,b,c,d=holes[0]
        for k,(lo,hi,bot,top) in enumerate(((27.2,a,0,14.8),(b,48.8,0,14.8),(a,b,0,c),(a,b,d,14.8))):
            quad('Wall backing '+str(side)+' '+str(k),[(x,bot,lo),(x,top,lo),(x,top,hi),(x,bot,hi)],'Graphite',(-side,0,0))
        quad('Faceted upper soffit '+str(side),[(side*15.04,14.8,27.2),(side*15.04,14.8,48.8),
             (side*14.8,18,48.8),(side*14.8,18,27.2)],'Graphite',(-side,-.1,0))
        for z in (27.55,34.18,48.4):
            box('Structural pilaster '+str(side)+' '+str(z),(.34,14.7,.32),(side*14.99,7.35,z),'Graphite',.045)
            box('Pilaster alloy foot '+str(side)+' '+str(z),(.2,.36,.38),(side*14.91,.2,z),'Alloy',.025)
    end_wall(False)
    end_wall(True)
    portal('Drop duct collar',-8.4,11.5,27.37,2.2,2.6)
    # Room 3 owns the complete shared bulkhead, including the Room 2 face.
    # Keep this opening free of a second frame or overlapping indicator.
    # Existing monitor/camera brackets keep their authored locations.
    box('Monitor mounting panel',(.22,2.5,5),(14.91,7.73804,31.7),'Cool')
    box('Monitor camera mounting pad',(.22,.68,.6),(14.96,8.04,34.65),'Alloy')
    # Above the shutter's complete camera tilt envelope, not just its rest pose.
    box('Exit camera mounting pad',(.68,.68,.18),(0,16.20,48.94),'Alloy')
    print('Open structural hall, inset landing floor, faceted upper walls and physical portals built.')


def build_service_bay():
    # A recessed pressure-calibration bank gives the entry wall a purpose.
    # Its shell replaces wall area and stays behind the collision boundary.
    quad('Pressure bay back',[(-5.2,1.8,26.6),(9.8,1.8,26.6),(9.8,5.8,26.6),(-5.2,5.8,26.6)],'Graphite',(0,0,1))
    for x in (-5.2,9.8):
        quad('Pressure bay end '+str(x),[(x,1.8,26.6),(x,1.8,27.14),(x,5.8,27.14),(x,5.8,26.6)],'Cool',(1 if x<0 else -1,0,0))
        box('Pressure bay jamb '+str(x),(.14,4,.08),(x+(-.07 if x<0 else .07),3.8,27.18),'Alloy')
    for y in (1.8,5.8):
        quad('Pressure bay return '+str(y),[(-5.2,y,26.6),(9.8,y,26.6),(9.8,y,27.14),(-5.2,y,27.14)],'Cool',(0,1 if y<3 else -1,0))
        box('Pressure bay header '+str(y),(15.28,.14,.08),(2.3,y+(-.07 if y<3 else .07),27.18),'Alloy')
    for x in (-1.8,5.2):
        tube('Calibration drum '+str(x),(x,3.8,26.7),(x,3.8,27.12),.76,'Alloy',32)
        tube('Calibration drum face '+str(x),(x,3.8,27.13),(x,3.8,27.15),.59,'Graphite',32)
        tube('Calibration drum hub '+str(x),(x,3.8,27.16),(x,3.8,27.18),.15,'Cool',20)
    for x in (-4.1,1.7,8.7):
        tube('Calibration ram '+str(x),(x,2.25,26.93),(x,5.25,26.93),.10,'Alloy',16)
        tube('Calibration sleeve '+str(x),(x,2.65,26.93),(x,3.35,26.93),.18,'Cool',16)
    tube('Pressure manifold',(-4.6,2.15,26.93),(9.2,2.15,26.93),.065,'Alloy',16)
    for i in range(1,38):
        x=-5.2+i*15/38
        box('Pressure guard '+str(i),(.026,4,.025),(x,3.8,27.23),'Graphite',.004)
    print('Recessed pressure-calibration machinery and fitted protective grille built.')


def build_platforms():
    for name,w,h,d,x,y,z in PLATFORMS:
        top=y+h/2
        gx=(-w/2,-w/2+.13,-w/2+.23,w/2-.23,w/2-.13,w/2)
        gz=(-d/2,-d/2+.13,-d/2+.23,d/2-.23,d/2-.13,d/2)
        for i in range(5):
            for j in range(5):
                finish='Amber' if i in (1,3) and j in (1,3) else 'Alloy' if i in (0,4) or j in (0,4) else 'Island'
                floor_patch(name+' landing '+str(i)+' '+str(j),x+gx[i],x+gx[i+1],z+gz[j],z+gz[j+1],top,finish,'Platforms')
        # Sides share only the tread's perimeter, never a second top face.
        vertices=[(x-w/2,top,z-d/2),(x+w/2,top,z-d/2),(x+w/2,top,z+d/2),(x-w/2,top,z+d/2),
                  (x-w/2,top-.15,z-d/2),(x+w/2,top-.15,z-d/2),(x+w/2,top-.15,z+d/2),(x-w/2,top-.15,z+d/2)]
        mesh(name+' deck edge',vertices,[(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'Alloy',region='Platforms')
        box(name+' recessed armour',(w-.10,.24,d-.10),(x,top-.29,z),'Graphite',.045,'Platforms')
        for side in (-1,1):
            box(name+' underside rail '+str(side),(.1,.13,d*.8),(x+side*w*.32,top-.49,z),'Alloy',.02,'Platforms')
            box(name+' cross tie '+str(side),(w*.64-.1,.10,.1),(x,top-.49,z+side*d*.25),'Alloy',.018,'Platforms')
        tube(name+' actuator socket',(x,top-.56,z),(x,top-.42,z),.31,'Alloy',20,'Platforms')
        end=.77 if name=='A' else .70
        tube(name+' engine connection',(x,top-end,z),(x,top-.56,z),.12,'Graphite',16,'Platforms')
        build_thruster_harness(name,w,d,x,top,z)
    print('Eight immutable landings dressed as machined testing rigs; existing booster envelopes retained.')


def build_thruster_harness(name,w,d,x,top,z):
    # A real annular cradle leaves the engine and exhaust open. Four splayed
    # struts carry it into the deck's cross ties rather than floating below it.
    vertices=[]
    sides=24
    for height,radius in ((top-.80,.51),(top-.94,.51),(top-.80,.40),(top-.94,.40)):
        for i in range(sides):
            angle=math.tau*i/sides
            vertices.append((x+radius*math.cos(angle),height,z+radius*math.sin(angle)))
    faces=[]
    for i in range(sides):
        j=(i+1)%sides
        faces.extend(((i,j,sides+j,sides+i),
                      (2*sides+j,2*sides+i,3*sides+i,3*sides+j),
                      (i,2*sides+i,2*sides+j,j),
                      (sides+j,3*sides+j,3*sides+i,sides+i)))
    mesh(name+' thruster cradle',vertices,faces,'Alloy',region='Platforms')
    for sx in (-1,1):
        for sz in (-1,1):
            tag=name+' harness '+str(sx)+' '+str(sz)
            mount=(x+sx*w*.32,top-.60,z+sz*d*.25)
            box(tag+' clevis',(.19,.18,.27),mount,'Graphite',.025,'Platforms')
            tube(tag+' diagonal',mount,(x+sx*.32,top-.87,z+sz*.32),.055,'Alloy',12,'Platforms')
            # Raised latch has its own exposed surface, 12 mm off the clevis.
            box(tag+' latch',(.022,.07,.12),(mount[0]+sx*.118,top-.60,mount[2]),'Amber',0,'Platforms')


def build_adhesion():
    z0,z1=39.7506,46.2506
    y0,y1=4.26573,11.21035
    # Visible surface matches the authoritative patch, recessed 10 mm.
    quad('Adhesion membrane',[(14.68472,y0,z0),(14.68472,y1,z0),(14.68472,y1,z1),(14.68472,y0,z1)],
         'Sticky',(-1,0,0))
    quad('Adhesion backing',[(15.18,4.1,39.55),(15.18,11.4,39.55),(15.18,11.4,46.45),(15.18,4.1,46.45)],
         'Graphite',(-1,0,0))
    for z in (39.61,46.39):
        box('Adhesion vertical seal '+str(z),(.22,y1-y0,.16),(14.89,(y0+y1)/2,z),'Alloy')
        tube('Adhesion pressure line '+str(z),(14.96,4.35,z+.18),(14.96,11.05,z+.18),.055,'Cool',16)
        for y in (4.65,7.3,10.7):
            box('Adhesion clamp '+str(z)+' '+str(y),(.28,.26,.23),(14.87,y,z),'Graphite',.035)
            box('Adhesion clamp latch '+str(z)+' '+str(y),(.04,.08,.16),(14.705,y,z),'Amber',.008)
    for y in (4.18,11.30):
        box('Adhesion horizontal seal '+str(y),(.22,.14,6.92),(14.89,y,43.0006),'Alloy')
    for i in range(7):
        y=4.6+i*.92
        box('Adhesion measurement '+str(i),(.025,.045,.35 if i%2 else .55),(14.83,y,47.10),'Alloy',.006)
    print('Adhesion test module built around the unchanged membrane and climb clearance.')


def build_observation():
    # Glass alone occupies the wall opening; all instruments are behind it.
    quad('Observation glass',[(-14.8,6.65,34.55),(-14.8,10.75,34.55),(-14.8,10.75,43.85),(-14.8,6.65,43.85)],'Glass',(1,0,0))
    for y in (6.53,10.87):
        box('Observation horizontal reveal '+str(y),(.22,.16,9.65),(-14.95,y,39.2),'Alloy')
    for z in (34.42,37.6,40.8,43.98):
        box('Observation mullion '+str(z),(.22,4.18,.12),(-14.95,8.7,z),'Alloy')
    quad('Observation rear wall',[(-18.4,6.25,34.35),(-18.4,11.1,34.35),(-18.4,11.1,44.05),(-18.4,6.25,44.05)],'Graphite',(1,0,0))
    floor_patch('Observation floor',-18.4,-14.85,34.35,44.05,6.25,'Graphite')
    quad('Observation roof',[(-18.4,11.1,34.35),(-14.85,11.1,34.35),(-14.85,11.1,44.05),(-18.4,11.1,44.05)],'Graphite',(0,-1,0))
    for z in (34.35,44.05):
        quad('Observation end '+str(z),[(-18.4,6.25,z),(-14.85,6.25,z),(-14.85,11.1,z),(-18.4,11.1,z)],'Cool',(0,0,1 if z<40 else -1))
    for i,z in enumerate((35.9,39.2,42.5)):
        box('Console '+str(i),(1.75,.18,1.95),(-16.8,7.2,z),'Cool')
        box('Console stand '+str(i),(.52,.73,.7),(-17,6.725,z),'Graphite')
        box('Monitor '+str(i),(.2,.95,1.45),(-17.64,8.15,z),'Graphite')
        box('Monitor stand '+str(i),(.12,.30,.18),(-17.64,7.53,z),'Alloy')
        quad('Monitor screen '+str(i),[(-17.525,7.78,z-.60),(-17.525,8.52,z-.60),(-17.525,8.52,z+.60),(-17.525,7.78,z+.60)],'Screen',(1,0,0))
        for j in range(3):
            box('Console keys '+str(i)+' '+str(j),(.04,.025,.75),(-17.28-j*.08,7.3025,z),'Alloy',.004)
        tube('Console dial '+str(i),(-17.45,7.29,z+.67),(-17.45,7.37,z+.67),.07,'Graphite',16)
    # A concrete measuring instrument on the centre console.
    box('Telemetry analyser',(.36,.32,.48),(-16.90,7.45,42.5),'Ivory',.025)
    quad('Telemetry analyser screen',[(-16.708,7.36,42.34),(-16.708,7.56,42.34),(-16.708,7.56,42.66),(-16.708,7.36,42.66)],'Screen',(1,0,0))
    print('Observation booth furnished with three consoles and telemetry equipment.')


def build_drone_wrecks():
    # Reuse the original game's SW family as static workbench props. Import is
    # authoring-only: no boss asset, new material bank, AI or animation at runtime.
    before=set(bpy.data.objects)
    old_meshes,old_materials=set(bpy.data.meshes),set(bpy.data.materials)
    bpy.ops.import_scene.gltf(filepath=HERE+'/../../characters/exterminator/exterminator-family.glb')
    imported=set(bpy.data.objects)-before
    roots=sorted((obj for obj in imported if obj.get('asset')=='exterminator-family-v1' and obj.get('role') in {'guardian','pursuer'}),key=object_name)
    keep=set(roots)
    for root in roots:
        keep.update(root.children_recursive)
    for obj in imported-keep:
        bpy.data.objects.remove(obj,do_unlink=True)
    for root in roots:
        first=root.get('role')=='guardian'
        if first:
            armour=next(obj for obj in root.children if obj.type=='MESH' and obj.data.materials[0].name.startswith('SW_Armour'))
            bm=bmesh.new()
            bm.from_mesh(armour.data)
            bmesh.ops.delete(bm,geom=[face for face in bm.faces if all(vertex.co.z>.10 for vertex in face.verts)],context='FACES')
            bm.to_mesh(armour.data)
            bm.free()
        root.scale=(.52,.52,.52)
        root.rotation_mode='XYZ'
        root.rotation_euler=(.08 if first else .32,.0 if first else .28,-math.pi/2+.18 if first else -math.pi/2-.25)
        root.location=xyz((-16.55,7.8,35.9 if first else 39.2))
        fan=next(obj for obj in root.children if obj.get('dronePart')==('SW_Fan_R' if first else 'SW_Fan_L'))
        fan.rotation_mode='XYZ'
        if first:
            # Torn-off turbine lies beside its body, with a plainly empty arm.
            fan.parent=None
            fan.scale=(.52,.52,.52)
            fan.rotation_euler=(.08,.12,0)
            fan.location=xyz((-16.40,7.45,36.6))
        else:
            fan.rotation_euler.x=.9
        bpy.context.view_layer.update()
        lowest=min((obj.matrix_world@vertex.co).z for obj in root.children_recursive if obj.type=='MESH' for vertex in obj.data.vertices)
        root.location.z+=7.30-lowest
        bpy.context.view_layer.update()
        if first:
            lowest=min((obj.matrix_world@vertex.co).z for obj in fan.children_recursive if obj.type=='MESH' for vertex in obj.data.vertices)
            fan.location.z+=7.30-lowest
        root['roomTwoWreck']='opened inspection drone' if first else 'impact-damaged drone'
    bpy.context.view_layer.update()
    for obj in list(keep):
        if obj.type=='MESH' and obj.data.materials[0].name.startswith(('SW_Red','SW_Amber')):
            keep.remove(obj)
            bpy.data.objects.remove(obj,do_unlink=True)
    for fan in sorted((obj for obj in keep if obj.get('dronePart') in {'SW_Fan_L','SW_Fan_R'}),key=object_name):
        for obj in list(fan.children):
            if obj.type=='MESH':
                keep.remove(obj)
                bpy.data.objects.remove(obj,do_unlink=True)
        vertices=[]
        sides=24
        for height,radius in ((-.078,.285),(.105,.285),(-.078,.225),(.105,.225)):
            for i in range(sides):
                angle=math.tau*i/sides
                vertices.append((radius*math.sin(angle),height,radius*math.cos(angle)))
        faces=[]
        for i in range(sides):
            j=(i+1)%sides
            faces.extend(((i,j,sides+j,sides+i),(2*sides+j,2*sides+i,3*sides+i,3*sides+j),
                          (i,2*sides+i,2*sides+j,j),(sides+j,3*sides+j,3*sides+i,sides+i)))
        obj=mesh('Wreck turbine guard '+fan.name,vertices,faces,'Alloy')
        obj.parent=fan
        keep.add(obj)
        for i,(size,at) in enumerate((((.47,.018,.015),(0,.086,0)),
                                    ((.015,.018,.2275),(0,.086,-.12125)),
                                    ((.015,.018,.2275),(0,.086,.12125)))):
            obj=box('Wreck turbine bridge '+fan.name+' '+str(i),size,at,'Alloy',0)
            obj.parent=fan
            keep.add(obj)
    # Tiny original rotor bevels approach one another within 2 mm after the
    # workbench scale. Replace those subpixel details with thicker flat blades.
    for rotor in sorted((obj for obj in keep if 'Rotor' in obj.get('dronePart','')),key=object_name):
        for obj in list(rotor.children):
            if obj.type=='MESH':
                keep.remove(obj)
                bpy.data.objects.remove(obj,do_unlink=True)
        for i in range(5 if 'R_Rotor' in rotor.get('dronePart','') else 6):
            angle=math.tau*i/6
            vertices=[]
            for y in (-.012,.012):
                for radius,tangent in ((.035,-.018),(.207,.012),(.196,.055),(.035,.018)):
                    vertices.append((math.sin(angle)*radius+math.cos(angle)*tangent,y,
                                     math.cos(angle)*radius-math.sin(angle)*tangent))
            obj=mesh('Wreck rotor blade '+rotor.name+' '+str(i),vertices,
                     [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'Alloy')
            obj.parent=rotor
            keep.add(obj)
        obj=tube('Wreck rotor hub '+rotor.name,(0,-.022,0),(0,.050,0),.045,'Alloy',12)
        obj.parent=rotor
        keep.add(obj)
    bpy.context.view_layer.update()
    finishes={'Armour':'Amber','ArmourLight':'Amber','ArmourShade':'Graphite','Steel':'Alloy',
              'Dark':'Graphite','Rubber':'Graphite','Pale':'Ivory','Red':'Graphite','Amber':'Graphite',
              'White':'Alloy','Glass':'Graphite'}
    props=sorted((obj for obj in keep if obj.type=='MESH'),key=object_name)
    for i,obj in enumerate(props):
        transform=obj.matrix_world.copy()
        obj.data.transform(transform)
        obj.parent=bpy.data.objects[PREFIX+'Architecture']
        obj.matrix_world=Matrix.Identity(4)
        for j,material in enumerate(obj.data.materials):
            finish=material.name.removeprefix(PREFIX) if material.name.startswith(PREFIX) else finishes[material.name.split('_',1)[1].split('.')[0]]
            obj.data.materials[j]=bpy.data.materials[PREFIX+finish]
        obj.name=PREFIX+'Decommissioned drone part '+str(i)
        obj.data.name=obj.name
        obj['region']='Shell'
        obj['visualOnly']=True
    for obj in keep:
        if obj.type!='MESH':
            bpy.data.objects.remove(obj,do_unlink=True)
    for block in set(bpy.data.meshes)-old_meshes:
        if block.users==0:
            bpy.data.meshes.remove(block)
    for block in set(bpy.data.materials)-old_materials:
        if block.users==0:
            bpy.data.materials.remove(block)
    # Loose replacement components on the third bench, alongside the analyser.
    for i in range(3):
        tube('Loose drone shaft '+str(i),(-16.42,7.325,42.05+i*.19),(-16.05,7.325,42.05+i*.19),.025,'Alloy',8)
    box('Loose drone armour',(.48,.045,.42),(-16.27,7.325,43.06),'Amber',.009)
    print('Two powered-down drone wrecks and loose parts installed on the observation workbenches.')


def object_name(obj):
    return obj.name


def build_gantry():
    quad('Ceiling',[(-14.8,18,27.2),(-14.8,18,48.8),(14.8,18,48.8),(14.8,18,27.2)],'Graphite',(0,-1,0))
    for z in (30.4,45.7):
        box('Calibration bridge '+str(z),(29.2,.28,.65),(0,17.45,z),'Graphite',.06)
        for x in (-13.9,13.9):
            box('Bridge support '+str(x)+' '+str(z),(.55,2.1,.65),(x,16.22,z),'Cool',.05)
            box('Bridge support shoe '+str(x)+' '+str(z),(.65,.20,.75),(x,15.05,z),'Alloy',.025)
    box('Central service spine',(.62,.22,20.3),(1.6,17.8,38),'Cool',.045)
    for x in (1.10,2.1):
        tube('Gantry feed '+str(x),(x,17.12,28),(x,17.12,48),.09,'Alloy',16)
    for i,(x,z) in enumerate(((-8,35),(0,39),(8,43))):
        # Existing light positions stay at Y=16.55, immediately below the diffuser.
        for side in (-1,1):
            box('Fixture side '+str(i)+' '+str(side),(.13,.20,.72),(x+side*1.5,16.69,z),'Alloy')
            box('Fixture end '+str(i)+' '+str(side),(2.87,.20,.10),(x,16.69,z+side*.41),'Graphite')
        quad('Fixture diffuser '+str(i),[(x-1.38,16.58,z-.30),(x+1.38,16.58,z-.30),(x+1.38,16.58,z+.30),(x-1.38,16.58,z+.30)],'Light',(0,-1,0))
        tube('Fixture suspension '+str(i),(x,16.80,z),(x,17.75,z),.05,'Alloy',12)
    print('Calibration gantry and three integrated fixtures built without additional runtime lights.')


def preview():
    scene=bpy.context.scene
    for obj in list(scene.objects):
        if obj.type in {'LIGHT','CAMERA'} and obj.name.startswith(PREFIX):
            bpy.data.objects.remove(obj,do_unlink=True)
    for i,(x,z) in enumerate(((-8,35),(0,39),(8,43))):
        data=bpy.data.lights.new(PREFIX+'Preview softbox '+str(i),'AREA')
        data.energy,data.shape,data.size,data.size_y=2200,'RECTANGLE',5,3
        obj=bpy.data.objects.new(data.name,data)
        scene.collection.objects.link(obj)
        obj.location=xyz((x,16.55,z))
    data=bpy.data.cameras.new(PREFIX+'Review camera')
    camera=bpy.data.objects.new(data.name,data)
    scene.collection.objects.link(camera)
    camera.location=xyz((-9.6,11.4,28.6))
    camera.rotation_euler=(Vector(xyz((2,6.5,39.8)))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.lens=20
    scene.camera=camera
    scene.render.resolution_x,scene.render.resolution_y=1280,800
    scene.render.resolution_percentage=100
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    # Prefab is separate from the room and excluded from the architectural batch.
    for area in bpy.context.screen.areas if bpy.context.screen else ():
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.use_local_camera=True
            space.camera=camera
            space.region_3d.view_perspective='CAMERA'
            space.region_3d.view_camera_zoom=0
            space.shading.type='MATERIAL'
            space.overlay.show_overlays=False


def export_asset():
    scene=bpy.context.scene
    root=bpy.data.objects[PREFIX+'Architecture']
    selected,active=list(bpy.context.selected_objects),bpy.context.view_layer.objects.active
    root.name=PREFIX+'Editable architecture'
    runtime=bpy.data.objects.new(PREFIX+'Architecture',None)
    runtime['asset']='containment-room-two-v1'
    scene.collection.objects.link(runtime)
    copies=[]
    try:
        groups={}
        for source in list(root.children):
            obj=source.copy()
            obj.data=source.data.copy()
            obj.hide_render=False
            scene.collection.objects.link(obj)
            obj.hide_set(False)
            obj.parent=runtime
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
            obj=bpy.context.view_layer.objects.active
            obj.name=PREFIX+'Batch_'+region+'_'+finish.removeprefix(PREFIX)
            copies.append(obj.data)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in [runtime]+list(runtime.children):
            obj.select_set(True)
        bpy.context.view_layer.objects.active=runtime
        bpy.ops.export_scene.gltf(filepath=HERE+'/room-two-hall.glb',export_format='GLB',
            use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,
            export_cameras=False,export_lights=False,export_animations=False,export_materials='PLACEHOLDER')
    finally:
        for obj in list(runtime.children):
            bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.objects.remove(runtime,do_unlink=True)
        for data in set(copies):
            if data.users==0:
                bpy.data.meshes.remove(data)
        root.name=PREFIX+'Architecture'
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=active
    print('Exported shared-finish architecture without textures or lights; surveillance uses the original cutscene model.')


def save_source():
    previous=bpy.context.preferences.filepaths.save_version
    try:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=HERE+'/room-two-hall.blend',copy=True)
    finally:
        bpy.context.preferences.filepaths.save_version=previous


def main():
    setup()
    build_shell()
    build_service_bay()
    build_platforms()
    build_adhesion()
    build_observation()
    build_drone_wrecks()
    build_gantry()
    preview()
    export_asset()
    save_source()


if __name__=='__main__':
    main()
