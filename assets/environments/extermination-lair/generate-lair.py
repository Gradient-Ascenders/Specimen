"""Author the finale's architectural kit. Run in Blender against this .blend.

Game coordinates are X,Y-up,Z. The asset is centred on the shaft; runtime adds
the arena's Z offset. Only the owned Lair scene is regenerated.
"""
import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector, Quaternion

HERE = Path(__file__).resolve().parent
TAU = math.tau
FLOOR, INNER, OUTER, WALL, ROOF = .4, 62., 99.5, 100., 96.
scene = bpy.data.scenes.get('Extermination Lair') or bpy.data.scenes.get('Extermination Vault') or bpy.data.scenes.new('Extermination Lair')
scene.name = 'Extermination Lair'
bpy.context.window.scene = scene
for obj in list(scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
    for block in list(blocks):
        if block.name.startswith(('Lair_', 'Vault_')) and block.users == 0:
            blocks.remove(block)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1


def xyz(p):
    return (p[0], -p[2], p[1])


def material(name, color, rough=.6, metal=.1, emission=0, alpha=1):
    m = bpy.data.materials.new('Lair_' + name)
    m.diffuse_color = (*color, alpha)
    m.use_backface_culling = True
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, alpha)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Alpha'].default_value = alpha
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    if alpha < 1:
        m.surface_render_method = 'DITHERED'
    return m


M = {
    'ivory': material('Armour', (.16, .19, .20), .56, .48),
    'cool': material('Gunmetal', (.052, .069, .079), .52, .6),
    'shaft': material('ShaftLiner', (.024, .04, .047), .88, .3),
    'dark': material('Graphite', (.034, .052, .062), .66, .45),
    'steel': material('StructuralAlloy', (.075, .09, .10), .53, .62),
    'bare': material('BrushedAlloy', (.35, .41, .42), .32, .82),
    'floor': material('Deck', (.18, .21, .22), .72, .3),
    'repair': material('ReplacementDeck', (.115, .14, .15), .65, .4),
    'grate': material('ServiceGrate', (.065, .09, .1), .68, .6),
    'rubber': material('Seal', (.009, .017, .021), .92),
    'glass': material('ObservationGlass', (.08, .24, .28), .16, .15, alpha=.32),
    'amber': material('SafetyAmber', (.72, .36, .055), .65, .1),
    'cyan': material('GuideLight', (.85, .32, .07), .3, .2, 2),
    'lamp': material('KeyLight', (.81, .9, .87), .3, .1, 3),
    'emergency': material('EmergencyLight', (1., .025, .008), .4, .1, .06),
    'reactor': material('ReactorLight', (1., .002, .0005), .35, .1, 1.4),
    'sign': material('SignPaint', (.74, .82, .77), .8, .05),
}


def group(name, position=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.location = xyz(position)
    return obj


static = group('Lair_Static')
static['asset'] = 'extermination-lair-v1'
static['floorInnerRadius'] = INNER
static['floorOuterRadius'] = OUTER
static['wallInnerRadius'] = WALL
static['ceilingHeight'] = ROOF
owned = [static]
signs = []


def mesh(name, vertices, faces, mat, parent=static, bevel=0, cylinder_uv=False):
    data = bpy.data.meshes.new('Lair_' + name)
    data.from_pydata([xyz(v) for v in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bevel:
        edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > .35]
        if edges:
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, affect='EDGES', clamp_overlap=True)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if parent == static:
        # The continuous fortress footing owns the buried horizontal interface.
        # Structural members keep their sides; duplicate underside caps do not.
        buried=[f for f in bm.faces if f.normal.z < -.99 and all(abs(v.co.z-FLOOR)<.00001 for v in f.verts)]
        bmesh.ops.delete(bm,geom=buried,context='FACES_ONLY')
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new('Lair_' + name, data)
    scene.collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(M[mat])
    uv = data.uv_layers.new(name='MetricUV')
    for poly in data.polygons:
        n = Vector((poly.normal.x, poly.normal.z, -poly.normal.y))
        for li in poly.loop_indices:
            v = data.vertices[data.loops[li].vertex_index].co
            p = Vector((v.x, v.z, -v.y))
            if cylinder_uv and abs(n.y) < .7:
                angle = math.atan2(p.z, p.x)
                centre = math.atan2(poly.center.y * -1, poly.center.x)
                angle = centre + math.atan2(math.sin(angle-centre), math.cos(angle-centre))
                uv.data[li].uv = (angle * math.hypot(p.x, p.z), p.y)
            elif abs(n.y) > .7:
                uv.data[li].uv = (p.x, p.z)
            elif abs(n.x) > abs(n.z):
                uv.data[li].uv = (p.z, p.y)
            else:
                uv.data[li].uv = (p.x, p.y)
    return obj


def box(name, size, position, mat, parent=static, bevel=.08, yaw=0):
    x, y, z = [v*.5 for v in size]
    vertices = [(a*x, b*y, c*z) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    cs, sn = math.cos(yaw), math.sin(yaw)
    vertices = [(position[0]+v[0]*cs+v[2]*sn, position[1]+v[1], position[2]-v[0]*sn+v[2]*cs) for v in vertices]
    return mesh(name, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], mat, parent, bevel)


def arc(name, r0, r1, y0, y1, start, end, mat, parent=static, bevel=0, steps=None, open_top=False):
    steps = steps or max(1, math.ceil(abs(end-start)/math.radians(2)))
    vertices = []
    for y in (y0,y1):
        for r in (r0,r1):
            vertices.extend((math.cos(start+(end-start)*i/steps)*r,y,math.sin(start+(end-start)*i/steps)*r) for i in range(steps+1))
    n=steps+1
    faces=[]
    for i in range(steps):
        faces += [(i,i+1,n+i+1,n+i),(i,2*n+i,2*n+i+1,i+1),(n+i,n+i+1,3*n+i+1,3*n+i)]
        if not open_top:faces.append((2*n+i,3*n+i,3*n+i+1,2*n+i+1))
    if abs(abs(end-start)-TAU)>.000001:
        faces += [(0,n,3*n,2*n),(steps,2*n+steps,3*n+steps,n+steps)]
    return mesh(name,vertices,faces,mat,parent,bevel,True)


def radial_box(name, size, radius, height, angle, mat, bevel=.08):
    return box(name,size,(math.cos(angle)*radius,height,math.sin(angle)*radius),mat,yaw=math.pi/2-angle,bevel=bevel)


def text(name, value, position, size, yaw=0, parent=static):
    data=bpy.data.curves.new('Lair_'+name,'FONT')
    data.body=value
    data.align_x='CENTER'
    data.size=size
    data.extrude=.006
    data.bevel_depth=.002
    obj=bpy.data.objects.new('Lair_'+name,data)
    scene.collection.objects.link(obj)
    obj.parent=parent
    obj.location=xyz(position)
    # Blender text normal +Z -> game +Z after a 90 degree X rotation.
    obj.rotation_mode='QUATERNION'
    obj.rotation_quaternion=Quaternion((0,0,1),-yaw) @ Quaternion((1,0,0),math.pi/2)
    data.materials.append(M['sign'])
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def mounted_sign(name, value, centre, width, height, outward, font_size):
    """Framed plaque seated on a real wall, with shallow raised lettering."""
    root=group('Lair_'+name)
    root.parent=static
    root['role']='mounted-sign'
    x,y,wall_z=centre
    root['wallZ']=wall_z
    root['outwardZ']=outward
    root['panelFrontZ']=wall_z+outward*.18
    def part(label,size,dx,dy,depth,finish,bevel=.025):
        return box(name+label,size,(x+dx,y+dy,wall_z+outward*depth),finish,root,bevel)
    # The inset and four frame rails partition the plaque rather than
    # duplicating a full backing face beneath the rails.
    part('Inset',(width-.32,height-.32,.18),0,0,.09,'dark',0)
    for side in (-1,1):
        part('FrameHorizontal',(width,.16,.24),0,side*(height/2-.08),.12,'bare')
        part('FrameVertical',(.16,height-.32,.24),side*(width/2-.08),0,.12,'bare')
        for end in (-1,1):
            part('Fastener',(.12,.12,.08),end*(width/2-.08),side*(height/2-.08),.28,'steel',.015)
    part('Marker',(.10,height-.85,.035),-width/2+.43,0,.1975,'amber',.015)
    label=text(name+'Label',value,(x+.18,y,root['panelFrontZ']),font_size,0 if outward>0 else math.pi,root)
    bpy.context.view_layer.update()
    points=[label.matrix_world@v.co for v in label.data.vertices]
    label.location.x+=x+.18-(min(p.x for p in points)+max(p.x for p in points))/2
    label.location.z+=y-(min(p.z for p in points)+max(p.z for p in points))/2
    normal=Vector((0,-outward,0))
    # Seat the actual rear glyph bounds on the inset face. Text extrusion is
    # symmetric around its origin, so the origin alone is not a mount plane.
    rear=min(normal.dot(p) for p in points)
    surface=normal.dot(Vector(xyz((x,y,root['panelFrontZ']))))
    label.location+=normal*(surface-rear)
    signs.append(root)
    return root


def make_floor():
    # True recessed joints, shared floor height and no overlapping opaque skin.
    bands=[62.,64.5,71.,77.5,84.,90.5,97.,99.5]
    # The joint bed is only in the gaps, so it cannot flicker through distant
    # plates with the boss camera's long depth range. The underside owns no
    # hidden upward face beneath the plates.
    arc('DeckUnderside',INNER,OUTER,-.8,.15,0,TAU,'steel',steps=192,open_top=True)
    for r in bands:
        arc('CircularJoint',max(INNER,r-.012),min(OUTER,r+.012),.15,.375,0,TAU,'rubber',steps=192)
    for i in range(96):
        a=i*TAU/96
        for r0,r1 in zip(bands,bands[1:]):
            # Intersect slot ends with the actual polygonal circle, including
            # its vertex at the slot centre. Straight radius cuts would overlap
            # the circular joint by a small triangular area at every junction.
            factor=math.cos(TAU/384)/math.cos(TAU/384-.00012)
            vertices=[(r*f*math.cos(t),y,r*f*math.sin(t)) for y in (.15,.375) for r in (r0+.012,r1-.012)
                      for t,f in [(a-.00012,factor),(a,1),(a+.00012,factor)]]
            faces=[]
            for k in range(2):
                faces += [(k,k+1,4+k,3+k),(6+k,9+k,10+k,7+k),(k,6+k,7+k,k+1),(3+k,4+k,10+k,9+k)]
            faces += [(0,3,9,6),(2,8,11,5)]
            mesh('RadialJoint',vertices,faces,'rubber')
    for i in range(96):
        a=i*TAU/96
        for j,(r0,r1) in enumerate(zip(bands,bands[1:])):
            finish='steel' if j==0 else 'grate' if j==6 and (8<i<22 or 43<i<58 or 73<i<82) else 'repair' if (i*13+j*7)%37<3 else 'floor'
            arc('Deck_%02d_%d'%(i,j),r0+.012,r1-.012,.38,FLOOR,a+.00012,a+TAU/96-.00012,finish,steps=2)
    arc('PitInnerRim',61.6,62.,-.3,.4,0,TAU,'steel',steps=192)
    arc('PitGuide',62.6,62.78,.405,.44,0,TAU,'cyan',steps=192)
    arc('OuterGuide',98.9,99.06,.405,.44,0,TAU,'cyan',steps=192)
    for i in range(48):
        a=i*TAU/48
        arc('HazardNotch_%d'%i,62.95,63.45,.405,.43,a,a+.045,'amber',steps=2)


def portal(angle, entry):
    sign=-1 if entry else 1
    z=sign*100
    clear=13 if entry else 14
    height=8 if entry else 10
    # Piers occupy the existing collision envelopes. The lintel/soffit reaches
    # all the way from the recessed door to their front, closing the old slit.
    inner=clear/2
    outer=23.5 if entry else 24
    front=sign*(91 if entry else 98.5)
    back=sign*103
    depth=abs(back-front)
    middle=(back+front)/2
    for side in (-1,1):
        box(('Entry' if entry else 'Exit')+'Pier', (outer-inner,35.6,depth),(side*(inner+outer)/2,18.2,middle),'ivory',bevel=.22)
        box('PortalSealSide',(.22,height+.2,.5),(side*(inner-.13),FLOOR+height/2,z-sign*.6),'rubber',bevel=.04)
        box('PortalStatus',(.18,5,.16),(side*(inner+1.2),4,front-sign*.15),'cyan',bevel=.04)
    if entry:
        # Stepped jaws rise towards the arena. The inner step clears jumping
        # pursuers, while the rear step seals the original door aperture.
        for bottom,lo,hi in [(8.4,-103,-99.5),(15,-99.5,-97),(22,-97,-94.5),(28,-94.5,-91)]:
            box('EntryCrown',(clear,36-bottom,hi-lo),(0,(36+bottom)/2,(lo+hi)/2),'ivory',bevel=.12)
        box('HallwaySoffitSeal',(clear,1,.5),(0,7.9,-99.75),'cool',bevel=0)
    else:
        box('ExitCrown',(clear,25.6,depth),(0,23.2,middle),'ivory',bevel=.18)
    box('PortalSealTop',(clear-.48,.22,.5),(0,FLOOR+height-.1,z-sign*.6),'rubber',bevel=.04)
    # Shallow threshold is below the established walkable surface.
    # Threshold begins exactly at the annulus boundary, so it does not duplicate
    # the playable deck. Its curved leading edge is shared with the ring.
    outline=[(-inner+clear*i/12, sign*math.sqrt(OUTER**2-(-inner+clear*i/12)**2)) for i in range(13)]
    threshold_back=-100 if entry else back
    outline += [(inner,threshold_back),(-inner,threshold_back)]
    vertices=[(x,y,zz) for y in (.24,.4) for x,zz in outline]
    n=len(outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh('PortalThreshold',vertices,faces,'bare')
    for side in (-1,1):
        vertices=[]
        for y in (.4,18):
            vertices += [(side*outer,y,front),(side*outer,y,back),(side*28,y,sign*101),(side*28,y,sign*96)]
        mesh('PortalReturn',vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'ivory')
    if entry:
        # The entrance soffit is open up to 28 m. Use its solid side pier.
        mounted_sign('EntrySign','EXTERMINATION',((inner+outer)/2,10.4,front),14.4,4.2,1,1.15)
    else:
        mounted_sign('ExitSign','ESCAPE',(0,13.8,front),12,3.2,-1,1.35)
    door=group('Lair_EntryDoor' if entry else 'Lair_ExitDoor',(0,FLOOR+height/2,z))
    door['role']='entry-door' if entry else 'exit-door'
    box('DoorBody',(clear-.16,height-.12,.5),(0,0,0),'cool' if entry else 'bare',door,bevel=.1)
    box('DoorFootSeal',(clear-.2,.1,.42),(0,-height/2+.06,0),'rubber',door,bevel=.015)
    for side in (-1,1):
        box('DoorStile',(.22,height-.6,.08),(side*(clear/2-.4),0,.29),'steel',door,bevel=.025)
    box('DoorCentreSeal',(.15,height-.4,.08),(0,0,.29),'rubber',door,bevel=.02)
    owned.append(door)


def profile(name, points, width, angle, mat, bevel=.14):
    """Closed architectural rib extruded from an intentional radial section."""
    cs,sn=math.cos(angle),math.sin(angle)
    vertices=[(r*cs-side*sn,y,r*sn+side*cs) for side in (-width/2,width/2) for r,y in points]
    n=len(points)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vertices,faces,mat,bevel=bevel)


def make_walls():
    # Faceted fortress shell, with three deliberately different functional
    # elevations. There is no repeated observation-gallery wall treatment.
    # Leave a true rectangular cut for the two corridor/threshold floors.
    # Clipping the footing's union avoids layering another floor under them.
    for i in range(192):
        a,b=i*TAU/192,(i+1)*TAU/192
        polygon=[(r*math.cos(t),r*math.sin(t)) for r,t in [(OUTER,a),(118,a),(118,b),(OUTER,b)]]
        for side in (-1,1):
            clipped=[]
            for j,p in enumerate(polygon):
                q=polygon[(j+1)%len(polygon)]
                dp,dq=side*p[0]-12,side*q[0]-12
                if dp>=0:clipped.append(p)
                if (dp>0 and dq<0) or (dp<0 and dq>0):
                    t=dp/(dp-dq);clipped.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
            if len(clipped)<3:continue
            n=len(clipped)
            vertices=[(x,y,z) for y in (-.4,FLOOR) for x,z in clipped]
            faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
            mesh('FortressFooting',vertices,faces,'cool')
    half=math.radians(13.6)
    for i in range(12):
        a=i*TAU/12
        start,end=a-half,a+half
        portal_bay=i in (3,9)
        arc('FortressBacking_%d'%i,112,117,18 if portal_bay else .4,96,a-TAU/24,a+TAU/24,'dark',steps=1)
        if not portal_bay:
            arc('ArmouredPlinth_%d'%i,100,104,.4,7,start,end,'cool',bevel=.12)
        if i in (0,1,11):
            # Cooling station: broad engines and real blades, in deep shadow.
            for j in range(3):
                b=a+(j-1)*.135
                radial_box('GeneratorHousing',(9.5,24,5),106,20,b,'steel',.24)
                for n in range(6):
                    radial_box('GeneratorCoolingFin',(.48,20,1.4),102.6,20,b+(n-2.5)*.012,'bare',.065)
                radial_box('GeneratorPowerSlot',(4,.24,.2),101.6,32,b,'reactor',.03)
            radial_box('CoolingManifold',(37,3.2,3.5),105,37,a,'cool',.25)
            # A short service gantry belongs only to the east elevation.
            arc('ServiceGantry_%d'%i,100.3,109,42,42.7,start,end,'steel',steps=12)
            arc('GantryRail_%d'%i,100.2,100.55,45.6,45.9,start,end,'bare',steps=12)
            for j in range(8):
                b=start+(end-start)*(j+.5)/8
                radial_box('GantryRailPost',(.2,2.9,.3),100.4,44.15,b,'steel',.025)
        elif i in (5,6,7):
            # West reactor banks: tall sealed cores, flanked by armour clamps.
            for j in (-1,1):
                b=a+j*.11
                radial_box('ReactorCasing',(12,51,5.5),106,35,b,'cool',.3)
                radial_box('ReactorCore',(3.2,38,.5),102.9,35,b,'reactor',.1)
                for side in (-1,1):
                    profile('ReactorJaw',[(101.8,12),(104.4,12),(104.4,58),(101.8,58),(102.8,51),(102.8,19)],1.3,b+side*.046,'steel',.12)
                for y in (16,30,44,55):
                    radial_box('ReactorRestraint',(10,1.15,1.1),101.9,y,b,'bare',.1)
                radial_box('ReactorBase',(13,5,7),106,9.5,b,'ivory',.2)
        elif i==3:
            # The exit elevation reads as a villain's command citadel.
            radial_box('CommandMonolith',(30,40,7),107,49,a,'cool',.35)
            radial_box('CommandEye',(19,1.3,.5),102.7,58,a,'reactor',.1)
            radial_box('CommandBrow',(25,3.5,3),102.8,62,a,'ivory',.22)
            for side in (-1,1):
                profile('CommandBlade',[(101,18),(109,18),(111,78),(104,84),(102,62)],5,a+side*.17,'steel',.18)
            radial_box('CommandLowerConsole',(19,3.4,2.5),103,30,a,'bare',.14)
        elif not portal_bay:
            # Quiet armour between machinery banks gives the room a hierarchy.
            radial_box('FortressArmour',(31,30,3),104.3,25,a,'ivory',.3)
            for j in (-1,1):
                profile('ArmourBrace',[(100.9,12),(103,12),(106,42),(102.5,42)],2,a+j*.1,'steel',.12)
            radial_box('ArmourRecess',(9,18,.8),102.2,26,a,'cool',.16)
        # The deep upper tier stays mostly unlit; structural silhouettes carry
        # the scale, rather than uniform small panels and repeated lettering.
        for j in (-1,1):
            radial_box('UpperSpine',(1.4,27,3),105.2,77,a+j*.105,'steel',.1)
        b=a+TAU/24
        profile('PrimaryButtress',[(100.2,.4),(113,.4),(116,77),(105,96),(93,96),(94,66),(97,24),(100.2,15)],6.5,b,'steel',.16)
        profile('OverheadHaunch',[(96,50),(103,50),(110,78),(45,95),(43,87),(91,70)],5,b,'cool',.14)
        radial_box('ButtressTaskLamp',(.65,9,.4),100.05,20,b,'lamp',.045)
    portal(-math.pi/2,True)
    portal(math.pi/2,False)


def make_shaft():
    arc('ShaftLiner',62,64,-520,-.8,0,TAU,'shaft',steps=192)
    for i,y in enumerate([-9,-35,-90,-180,-320]):
        arc('ShaftServiceRing_%d'%i,61.4,62,y-.25,y,0,TAU,'steel',steps=128)
    box('EscapeFloor',(24,.4,57),(0,.2,131.5),'floor',bevel=0)
    for side in (-1,1):
        box('EscapeWall',(1,13.6,57),(side*12.5,7.2,131.5),'ivory',bevel=.08)
        box('EscapeGuide',(.15,.12,54),(side*11.8,1.2,131.5),'cyan',bevel=.025)
    box('EscapeCeiling',(26,.6,57),(0,14.3,131.5),'dark',bevel=0)


def make_overhead():
    # A suspended reactor/cradle forms the central silhouette above the boss.
    # Light bands fit into the collar cross section instead of doubling a cap.
    arc('Ceiling',29,114,96,99,0,TAU,'dark',steps=192)
    arc('CradleInner',29,34.1,91,96,0,TAU,'steel',steps=128)
    arc('CradleOuter',34.5,39,91,96,0,TAU,'cool',steps=128)
    arc('CradleLightBacking',34.1,34.5,91.3,96,0,TAU,'steel',steps=128)
    arc('CradleReactorLight',34.1,34.5,91,91.3,0,TAU,'reactor',steps=128)
    arc('DeploymentSeal',28.65,29,94,95,0,TAU,'rubber',steps=128)
    for i in range(12):
        a=i*TAU/12
        radial_box('SuspensionTruss',(3.2,3.2,56),72,90.8,a,'steel',.18)
        radial_box('TrussSpine',(1.2,.7,45),74,92.75,a,'bare',.08)
        radial_box('TrussReactorSlot',(.32,.18,22),70,88.98,a,'reactor',.025)
        radial_box('TrussEmergency',(.32,.18,16),90,88.98,a,'emergency',.025)
        radial_box('CradleClamp',(4.4,6.6,5),41.5,92.5,a,'steel',.18)
        radial_box('ClampWarning',(3.6,.45,2),41.5,88.95,a,'amber',.05)
    hatch=group('Lair_Hatch',(0,95.2,0))
    hatch['role']='deployment-hatch'
    arc('DeploymentLid',0,28.7,-.7,.7,0,TAU,'cool',hatch,bevel=.15,steps=128)
    arc('LidReactorTrace',19,19.3,-.94,-.76,0,TAU,'reactor',hatch,steps=96)
    for i in range(8):
        a=i*TAU/8
        box('LidRib',(1.4,.2,22),(math.sin(a)*14,-.79,math.cos(a)*14),'bare',hatch,.03,yaw=a)
    owned.append(hatch)


def make_covers():
    for style in ('Bastion','Capacitor','HeatSink'):
        root=group('Lair_Cover_'+style,(150,0,0))
        root['role']='cover-template'
        root['width']=7.;root['height']=4.2;root['depth']=3.2
        if style=='Bastion':
            box('BastionCore',(5.4,3.8,2.9),(0,-.2,0),'ivory',root,.14)
            box('BastionCap',(5.4,.4,3.2),(0,1.9,0),'bare',root,.08)
            for side in (-1,1):
                box('BastionEnd',(.8,4.2,3.2),(side*3.1,0,0),'steel',root,.15)
                box('BastionSafety',(.25,2.6,.08),(side*2.35,-.1,1.5),'amber',root,.025)
        elif style=='Capacitor':
            box('CapacitorCore',(5.8,3.7,3),(0,-.25,0),'cool',root,.16)
            box('CapacitorCap',(5.8,.5,3.2),(0,1.85,0),'steel',root,.06)
            for side in (-1,1):
                box('CapacitorEnd',(.6,4.2,3.2),(side*3.2,0,0),'bare',root,.1)
            for i in range(4):
                box('CapacitorFace',(.6,2.8,.12),((i-1.5)*1.2,-.15,1.55),'steel',root,.035)
        else:
            box('HeatSinkCore',(6.8,3.5,3),(0,-.2,0),'ivory',root,.12)
            box('HeatSinkCap',(7,.55,3.2),(0,1.825,0),'bare',root,.08)
            box('HeatSinkFoot',(7,.15,3.2),(0,-2.025,0),'steel',root,.025)
            for i in range(10):
                box('HeatSinkFin',(.23,2.9,.08),((i-4.5)*.59,-.2,1.56),'steel',root,.025)
        owned.append(root)


def preview():
    world=bpy.data.worlds.new('Lair_PreviewWorld')
    world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.035,.05,.065,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3
    scene.world=world
    for i,(x,z) in enumerate([(-52,-52),(52,-52),(-52,52),(52,52)]):
        data=bpy.data.lights.new('Lair_PreviewKey_'+str(i),'AREA');data.energy=180000;data.shape='DISK';data.size=25
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=xyz((x,42,z));obj.rotation_euler=(0,0,0)
    for i,(position,target) in enumerate([((-86,35,0),(-108,32,0)),((0,77,0),(0,96,0))]):
        data=bpy.data.lights.new('Lair_PreviewReactor_'+str(i),'AREA');data.energy=100000;data.color=(1.,.04,.015);data.shape='DISK';data.size=30
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=xyz(position)
        obj.rotation_euler=(Vector(xyz(target))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Lair_PreviewCamera');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    camera.location=xyz((-65,48,-62));direction=Vector(xyz((0,30,30)))-camera.location
    camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();data.lens=19;data.clip_end=1200;scene.camera=camera
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type=='VIEW_3D':
            area.spaces.active.clip_end=1500
            area.spaces.active.overlay.show_overlays=False
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'


def join_materials(root):
    groups={}
    for obj in list(root.children):
        if obj.type=='MESH' and len(obj.data.materials)==1:
            groups.setdefault(obj.data.materials[0].name,[]).append(obj)
    for name,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        objects[0].name=root.name+'_'+name
        objects[0].select_set(False)


make_floor()
make_walls()
make_shaft()
make_overhead()
make_covers()
for root in [*owned,*signs]:join_materials(root)
preview()
bpy.ops.object.select_all(action='DESELECT')
for root in owned:
    root.select_set(True)
    for obj in root.children_recursive:obj.select_set(True)
bpy.context.view_layer.objects.active=static
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'extermination-lair.blend'),check_existing=False)
bpy.ops.export_scene.gltf(filepath=str(HERE/'extermination-lair.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False,export_materials='EXPORT')
report={'version':'extermination-lair-v1','coordinates':'game X,Y-up,Z; arena centre at zero','floor':[INNER,OUTER,FLOOR],'ceiling':ROOF,'roots':[r.name for r in owned],'meshes':sum(o.type=='MESH' for r in owned for o in r.children_recursive),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for r in owned for o in r.children_recursive if o.type=='MESH')}
(HERE/'extermination-lair.validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
