"""Original articulated EX-04 drone family. Run in Blender 5.2+.

The GUI MCP path calls setup/build_boss/build_minions/finish/export separately.
The command-line path reproduces the same file without editing other scenes.
"""
import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector, Matrix

HERE = Path(__file__).resolve().parent
VERSION = 'exterminator-family-v1'
scene = None
materials = {}
roots = []


def xyz(p):
    return (p[0], -p[2], p[1])


def setup():
    global scene, materials, roots
    previous = bpy.data.scenes.get('Exterminator Foundry')
    if previous:
        for o in list(previous.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(previous)
    scene = bpy.data.scenes.new('Exterminator Foundry')
    bpy.context.window.scene = scene
    roots = []
    colours = {
        'Armour': ((.34, .27, .075), .27, .7),
        'ArmourLight': ((.48, .38, .12), .3, .64),
        'ArmourShade': ((.19, .16, .06), .32, .72),
        'Steel': ((.19, .23, .27), .83, .34),
        'Dark': ((.027, .043, .055), .7, .46),
        'Rubber': ((.009, .014, .019), .0, .82),
        'Pale': ((.53, .64, .68), .6, .4),
        'Red': ((1., .0015, .004), .2, .25),
        'Amber': ((1., .13, .004), .2, .25),
        'White': ((.68, .79, .85), .2, .28),
        'Glass': ((.035, .008, .012), .65, .12),
    }
    materials = {}
    # Distinct boss finishes allow hit/heat response without affecting minions.
    for prefix in ('EX', 'SW'):
        for role, (colour, metal, rough) in colours.items():
            m = bpy.data.materials.new(prefix + '_' + role)
            m.diffuse_color = (*colour, 1)
            m.use_nodes = True
            bsdf = m.node_tree.nodes.get('Principled BSDF')
            bsdf.inputs['Base Color'].default_value = (*colour, 1)
            bsdf.inputs['Metallic'].default_value = metal
            bsdf.inputs['Roughness'].default_value = rough
            if role in ('Red', 'Amber', 'White'):
                bsdf.inputs['Emission Color'].default_value = (*colour, 1)
                bsdf.inputs['Emission Strength'].default_value = 1.2 if role == 'Red' else 1.5 if role == 'Amber' else .7
            materials[prefix + '_' + role] = m
    return scene.name


def group(name, parent=None, at=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    o.parent = parent
    o.location = xyz(at)
    return o


def mesh(name, verts, faces, mat, parent, bevel=0, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(v) for v in verts], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect='EDGES', clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    o = bpy.data.objects.new(name, data)
    scene.collection.objects.link(o)
    o.parent = parent
    data.materials.append(materials[mat])
    for p in data.polygons:
        p.use_smooth = smooth or bool(bevel)
    if bevel:
        modifier=o.modifiers.new('ManufacturedNormals','WEIGHTED_NORMAL')
        modifier.keep_sharp=True
    # Metric UVs; shared fine finish maps remain the same physical scale.
    uv = data.uv_layers.new(name='MachineUV')
    for p in data.polygons:
        n = p.normal
        for li in p.loop_indices:
            v = data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv = (v.x, v.y) if abs(n.z) > .7 else (v.x, v.z) if abs(n.y) > abs(n.x) else (v.y, v.z)
    return o


def box(name, size, at, mat, parent, bevel=.04, yaw=0):
    w, h, d = [v / 2 for v in size]
    cs, sn = math.cos(yaw), math.sin(yaw)
    v = [(at[0]+x*w*cs+z*d*sn, at[1]+y*h, at[2]-x*w*sn+z*d*cs)
         for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    return mesh(name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,parent,bevel)


def wedge(name, width, length, front_h, back_h, y, z, mat, parent, bevel=.1):
    # Narrow nose, broad shoulders, chamfered corners; actual shaped armour.
    outline=[(-width*.32,-length/2),(width*.32,-length/2),(width*.5,-length*.27),
             (width*.5,length*.33),(width*.36,length/2),(-width*.36,length/2),
             (-width*.5,length*.33),(-width*.5,-length*.27)]
    v=[]
    for top in (False,True):
        for x,zz in outline:
            height=front_h+(back_h-front_h)*(zz/length+.5)
            v.append((x,y+(height/2 if top else -height/2),z+zz))
    faces=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    return mesh(name,v,faces,mat,parent,bevel)


def cylinder(name, radius, length, at, mat, parent, axis='y', segments=24):
    v=[]
    for end in (-.5,.5):
        for i in range(segments):
            a=i*2*math.pi/segments
            p=(radius*math.cos(a),end*length,radius*math.sin(a))
            if axis=='z':p=(p[0],p[2],p[1])
            if axis=='x':p=(p[1],p[0],p[2])
            v.append(tuple(at[j]+p[j] for j in range(3)))
    faces=[tuple(reversed(range(segments))),tuple(range(segments,segments*2))]
    faces += [(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    o=mesh(name,v,faces,mat,parent,min(radius*.1,length*.15))
    return o


def ring(name, inner, outer, depth, at, mat, parent, axis='y', segments=40, start=0, arc=math.tau):
    v=[]
    closed=abs(arc-math.tau)<1e-6
    n=segments if closed else segments+1
    for yy,r in [(-depth/2,inner),(-depth/2,outer),(depth/2,outer),(depth/2,inner)]:
        for i in range(n):
            a=start+i*arc/segments
            p=(math.sin(a)*r,yy,math.cos(a)*r)
            if axis=='z':p=(p[0],p[2],p[1])
            if axis=='x':p=(p[1],p[0],p[2])
            v.append(tuple(at[j]+p[j] for j in range(3)))
    faces=[]
    for layer in range(4):
        for i in range(segments):
            j=(i+1)%n
            faces.append((layer*n+i,layer*n+j,((layer+1)%4)*n+j,((layer+1)%4)*n+i))
    if not closed:
        faces.extend([(0,n,2*n,3*n),(n-1,4*n-1,3*n-1,2*n-1)])
    return mesh(name,v,faces,mat,parent,0)


def rod(name, a, b, radius, mat, parent):
    delta=Vector(xyz(b))-Vector(xyz(a))
    o=cylinder(name,radius,delta.length,(0,0,0),mat,parent)
    # Cylinder default game Y corresponds to Blender Z.
    o.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    o.location=(Vector(xyz(a))+Vector(xyz(b)))*.5
    return o


def lathe(name, profile, at, mat, parent, segments=40):
    vertices=[(at[0]+math.sin(i*math.tau/segments)*r,at[1]+y,at[2]+math.cos(i*math.tau/segments)*r)
              for r,y in profile for i in range(segments)]
    faces=[(j*segments+i,j*segments+(i+1)%segments,((j+1)%len(profile))*segments+(i+1)%segments,((j+1)%len(profile))*segments+i)
           for j in range(len(profile)) for i in range(segments)]
    return mesh(name,vertices,faces,mat,parent)


def bolts(parent, xs, y, zs, prefix='EX', r=.07):
    for x in xs:
        for z in zs:
            cylinder('Fastener',r,.045,(x,y,z),prefix+'_Steel',parent,segments=6)


def fan(parent, at, radius, name, prefix='EX', armoured=True):
    p=group(name,parent,at)
    p['dronePart']=name
    seg=40 if radius>1 else 24
    cage=lathe('DuctShell',[(r*radius,y*radius) for r,y in [(.79,-.275),(1,-.275),(1,.275),(.9,.275),(.9,.37),(.79,.37)]],(0,0,0),prefix+'_Armour' if armoured else prefix+'_Steel',p,segments=seg)
    if radius>1:
        cage.data.materials.append(materials[prefix+'_Steel']);cage.data.materials.append(materials[prefix+'_Dark'])
        for polygon in cage.data.polygons:
            edge=polygon.index//seg
            polygon.material_index=1 if edge in (3,4) else 2 if edge in (0,5) else 0
    rotor=group(name+'_Rotor',p)
    rotor['dronePart']=name+'_Rotor'
    for i in range(9 if radius>1 else 6):
        a=i*math.tau/(9 if radius>1 else 6)
        box('TurbineBlade',(radius*.54,radius*.035,radius*.15),(math.sin(a)*radius*.48,0,math.cos(a)*radius*.48),prefix+'_Steel',rotor,radius*.013,a+math.pi/2+.18)
    lathe('TurbineHub',[(r*radius,y*radius) for r,y in [(0,-.06),(.19,-.06),(.19,.16),(.12,.16),(.12,.25),(0,.25)]],(0,0,0),prefix+('_Dark' if radius>1 else '_Steel'),rotor,segments=24)
    bridge_mat=prefix+('_Dark' if radius>1 else '_Steel')
    s=radius*.81;w=radius*.0275
    outline=[(-s,-w),(-w,-w),(-w,-s),(w,-s),(w,-w),(s,-w),(s,w),(w,w),(w,s),(-w,s),(-w,w),(-s,w)]
    vertices=[(x,radius*.29+dy,z) for dy in (-w,w) for x,z in outline]
    faces=[tuple(reversed(range(12))),tuple(range(12,24))]+[(i,(i+1)%12,(i+1)%12+12,i+12) for i in range(12)]
    mesh('SafetyBridge',vertices,faces,bridge_mat,p,radius*.008)
    if radius>1:
        bolts(p,[-radius*.83,radius*.83],radius*.3,[-radius*.28,radius*.28],prefix)
        ring('DuctLowerBand',radius*.985,radius*1.014,.085*radius,(0,-radius*.23,0),prefix+'_Dark',p,segments=40)
        for i in range(6):
            a=i*math.pi/3
            box('DuctArmourTab',(.52,.12,.38),(math.sin(a)*radius*.88,radius*.3,math.cos(a)*radius*.88),prefix+'_ArmourShade',p,.035,a)
            # A recessed-looking dark aperture with a protective metal rib.
            for n in range(3):
                box('DuctCoolingSlot',(.25,.065,.04),(math.sin(a)*radius*1.002,-.1+n*.16,math.cos(a)*radius*1.002),prefix+'_Dark',p,.012,a)
            box('DuctSeamRib',(.055,.85,.075),(math.sin(a)*radius*1.005,0,math.cos(a)*radius*1.005),prefix+'_Steel',p,.016,a)
        for side in (-1,1):
            box('DuctNavigation',(.09,.13,.5),(side*radius*.99,0,0),prefix+'_Red',p,.015)
    return p


def build_boss():
    boss=group('EX_Boss');boss['asset']=VERSION;roots.append(boss)
    chassis=group('EX_Chassis',boss)
    wedge('VentralHull',5.75,8.8,2.1,2.6,-.15,.25,'EX_Dark',chassis,.18)
    wedge('UpperArmour',5.45,8.55,.55,.9,1.45,.3,'EX_Armour',chassis,.16)
    # Split sloping brow with a substantial recess around the central eye.
    for side in (-1,1):
        cheek=group('EX_Cheek_'+str(side),chassis,(side*2.15,-.15,-3.9))
        wedge('CheekPlate',1.35,1.4,2.35,2.6,0,0,'EX_ArmourLight',cheek,.12)
        brow=group('EX_Brow_'+str(side),chassis,(side*1.02,1.76,-4.37))
        brow.rotation_euler.y=side*-.15
        box('Brow',(1.9,.48,.9),(0,0,0),'EX_ArmourLight',brow,.09)
        box('BrowSensor',(.16,.08,.05),(side*1.42,1.42,-4.76),'EX_Red',chassis,.012)
        box('Jaw',(1.26,.4,1.25),(side*1.73,-1.58,-4.1),'EX_Steel',chassis,.08)
        # A gapped arm, paired hydraulic rods, and separate turbine gimbals.
        for end in (-1,1):
            box('Outrigger',(3.15,.48,1.1),(side*3.9,-.03,end*3.12),'EX_Steel',chassis,.09)
            box('OutriggerArmour',(2.75,.22,.82),(side*3.95,.36,end*3.12),'EX_ArmourShade',chassis,.07)
            rod('HydraulicPiston',(side*2.58,-.75,end*2.8),(side*4.98,-.24,end*3.25),.1,'EX_Steel',chassis)
            cylinder('TurbinePivot',.36,.45,(side*5.22,0,end*3.3),'EX_Dark',chassis,axis='z')
            fan(boss,(side*5.3,-.1,end*3.3),2.55,'EX_Fan_'+('L' if side<0 else 'R')+('F' if end<0 else 'B'))
        box('SideSpine',(.38,.52,6.1),(side*2.8,.69,.45),'EX_Armour',chassis,.08)
        for z in (-1.8,.3,2.4):
            box('ServicePanel',(.08,.82,1.5),(side*2.94,-.15,z),'EX_ArmourShade',chassis,.025)
            for n in range(4):
                box('ServiceVent',(.045,.065,1.12),(side*3.,-.4+n*.16,z),'EX_Dark',chassis,.012)
        # Side cheek edge wear is authored, sparse, and physically raised.
        box('ExposedCheekEdge',(.07,.9,.045),(side*2.7,-.1,-4.56),'EX_Steel',chassis,.009)
    # Raised dorsal cooling spine with individually opening louvres.
    box('CoolingWell',(2.65,.22,5.5),(0,1.98,1.05),'EX_Rubber',chassis,.09)
    for i in range(7):
        vent=group('EX_Vent_'+str(i),boss,(0,2.15,-1.25+i*.72))
        box('CoolingLouvre',(2.42,.11,.5),(0,0,0),'EX_Steel',vent,.025)
        box('CoolingHeat',(1.95,.035,.04),(0,2.03,-1.35+i*.72),'EX_Red',chassis,.008)
    for side in (-1,1):
        pod=group('EX_Gun_'+('L' if side<0 else 'R'),boss,(side*3.55,-1.45,-2.4))
        box('CannonReceiver',(1.5,1.12,3.05),(0,0,.3),'EX_Dark',pod,.13)
        box('CannonCowl',(1.58,.34,2.5),(0,.78,.25),'EX_Armour',pod,.08)
        cylinder('Trunnion',.52,.18,(side*.86,.12,.45),'EX_Steel',pod,axis='x')
        box('ReceiverHeat',(.1,.45,1.45),(side*.76,.04,.3),'EX_Red',pod,.012)
        cylinder('BarrelMount',.71,.28,(0,-.1,-1.49),'EX_Steel',pod,axis='z')
        drum=group('EX_Drum_'+('L' if side<0 else 'R'),pod,(0,-.1,-1.75))
        for n in range(6):
            a=n*math.pi/3;x=math.cos(a)*.43;y=math.sin(a)*.43
            cylinder('CannonBarrel',.16,1.9,(x,y,-.85),'EX_Dark',drum,axis='z',segments=12)
            ring('MuzzleLip',.11,.185,.22,(x,y,-1.87),'EX_Steel',drum,axis='z',segments=12)
            cylinder('RecessedBore',.105,.025,(x,y,-1.79),'EX_Rubber',drum,axis='z',segments=12)
        ring('BarrelCollar',.53,.66,.18,(0,0,-1.38),'EX_Steel',drum,axis='z',segments=24)
        group('EX_Muzzle_'+('L' if side<0 else 'R'),drum,(0,0,-2.12))
    for r1,r2,z,mat in [(1.32,1.82,-4.67,'EX_Steel'),(1.34,1.48,-4.94,'EX_Red'),(1.85,2.02,-4.45,'EX_ArmourShade')]:
        ring('EyeHousing',r1,r2,.17,(0,-.1,z),mat,chassis,axis='z',segments=64)
    for i in range(4):
        iris=group('EX_Iris_'+str(i),boss,(0,-.1,-4.65))
        iris.rotation_euler.y=i*math.pi/2
        ring('IrisQuadrant',.43,1.31,.18,(0,0,-.63),'EX_Dark',iris,axis='z',segments=14,start=math.pi/4+.07,arc=math.pi/2-.14)
        ring('IrisMachining',.98,1.02,.022,(0,0,-.735),'EX_Steel',iris,axis='z',segments=14,start=math.pi/4+.14,arc=math.pi/2-.28)
    group('EX_EyeMuzzle',boss,(0,-.1,-5.2))
    # A protected glass optic behind the aperture; never covers the target core.
    for side in (-1,1):
        cylinder('SensorLens',.17,.06,(side*.85,1.13,-4.69),'EX_Glass',chassis,axis='z')
    # Two tear-away plates expose hot machinery in phase two.
    for side in (-1,1):
        damaged=group('EX_Damaged_'+('L' if side<0 else 'R'),boss,(side*1.95,1.96,2.55))
        for i in range(4):
            cylinder('ExposedConduit',.075,1.75,((i-1.5)*.18,.03,0),'EX_Steel',damaged,axis='z',segments=12)
        box('ExposedReactor',(.72,.25,1.5),(0,.05,0),'EX_Amber',damaged,.06)
        # Separate shoulder modules sit above the base hull and outside the
        # dorsal cooling well. Losing the cap genuinely exposes machinery.
        for edge in (-1,1):
            box('ShoulderModuleRail',(.07,.15,2.1),(side*1.95+edge*.54,1.925,2.55),'EX_Steel',chassis,.02)
        panel=group('EX_Breakaway_'+('L' if side<0 else 'R'),boss,(side*1.95,2.14,2.55))
        box('RearArmourPanel',(1.15,.28,2.1),(0,0,0),'EX_Armour',panel,.065)
        bolts(panel,[-.38,.38],.15,[-.74,.74])
    # Intentional sparse wear patches; no uniform noise or floating lettering.
    for side in (-1,1):
        for z in (-2.2,-.7):
            box('PaintChip',(.38,.016,.045),(side*2.24,1.84,z),'EX_Steel',chassis,.006,side*.15)
    # One small physically seated stencil on the top armour.
    data=bpy.data.curves.new('EX04Stencil','FONT');data.body='EX-04';data.size=.42;data.extrude=.0005;data.align_x='CENTER'
    obj=bpy.data.objects.new('EX04Stencil',data);scene.collection.objects.link(obj);obj.parent=chassis;obj.location=xyz((0,1.7602,-2.55))
    obj.rotation_euler.x=-math.atan(.35/2/8.55)
    data.materials.append(materials['EX_Dark'])
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');obj.select_set(False)
    uv=obj.data.uv_layers.new(name='StencilUV')
    for li in obj.data.loops:uv.data[li.index].uv=obj.data.vertices[li.vertex_index].co.xy
    return boss


def build_minions():
    for style in ('Guardian','Pursuer','Advanced'):
        root=group('SW_'+style);root['asset']=VERSION;root['role']=style.lower();roots.append(root)
        p='SW';armour='SW_Pale' if style=='Advanced' else 'SW_Armour'
        w=.87 if style=='Guardian' else .65 if style=='Pursuer' else .83
        wedge('MiniHull',w,1.22,.38,.53,0,.08,'SW_Dark',root,.055)
        wedge('MiniArmour',w*.94,1.18,.17,.28,.23,.09,armour,root,.045)
        for side in (-1,1):
            box('MiniOutrigger',(.39,.11,.25),(side*.48,-.11,.08),'SW_Steel',root,.025)
            fan(root,(side*.61,.01,.05),.285,'SW_Fan_'+('L' if side<0 else 'R'),prefix='SW',armoured=False)
            box('MiniCheek',(.16,.25,.26),(side*w*.38,-.06,-.53),armour,root,.03)
            box('MiniGun',(.12,.17,.48),(side*.2,-.28,-.38),'SW_Steel',root,.025)
            ring('MiniMuzzle',.025,.055,.055,(side*.2,-.28,-.64),'SW_Dark',root,axis='z',segments=12)
            if style=='Advanced':
                ring('TurbineGuard',.287,.31,.06,(side*.61,.115,.05),'SW_Pale',root,segments=24)
        ring('MiniEyeBezel',.09,.14,.07,(0,-.02,-.6),'SW_Steel',root,axis='z',segments=24)
        eye=group('SW_Eye',root)
        eye['dronePart']='SW_Eye'
        cylinder('MiniEyeLens',.085,.04,(0,-.02,-.65),'SW_Glass',eye,axis='z',segments=24)
        ring('MiniSensorLight',.045,.067,.012,(0,-.02,-.678),'SW_Amber' if style=='Advanced' else 'SW_Red',eye,axis='z',segments=24)
        cylinder('MiniSensorPupil',.023,.015,(0,-.02,-.691),'SW_Amber' if style=='Advanced' else 'SW_Red',eye,axis='z',segments=16)
        emitter=group('SW_Emitter',root,(0,.44,.45))
        emitter['dronePart']='SW_Emitter'
        ring('GuardianEmitter',.13,.19,.06,(0,0,0),'SW_Steel',emitter,axis='z',segments=24)
        ring('EmitterLight',.135,.165,.025,(0,0,-.045),'SW_Amber',emitter,axis='z',segments=24)
        if style=='Pursuer':
            wedge('PursuitFin',.14,.65,.25,.48,.25,.32,armour,root,.025)
        for i in range(3):
            box('MiniRearVent',(.31,.025,.05),(0,-.06+i*.075,.71),'SW_Steel',root,.007)
    return [r.name for r in roots]


def finish():
    # Merge only direct meshes with the same finish. Every articulated parent
    # keeps its own geometry and pivot, including rotors and iris quadrants.
    for root in roots:
        for obj in list(root.children_recursive):
            if obj.type=='MESH' and obj.modifiers:
                bpy.context.view_layer.objects.active=obj
                for modifier in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
        for parent in [root,*[o for o in root.children_recursive if o.type=='EMPTY']]:
            groups={}
            for o in list(parent.children):
                if o.type=='MESH':groups.setdefault(o.data.materials[0].name,[]).append(o)
            for name,objects in groups.items():
                bpy.ops.object.select_all(action='DESELECT')
                for o in objects:o.select_set(True)
                bpy.context.view_layer.objects.active=objects[0]
                if len(objects)>1:bpy.ops.object.join()
                objects[0].name=parent.name+'_'+name
                objects[0].select_set(False)
    # Preview layout is deliberately not the exported template transform.
    for root,at in zip(roots,[(0,0,0),(-2.2,0,-9),(0,0,-9),(2.2,0,-9)]):root.location=xyz(at)
    world=bpy.data.worlds.new('EX_PreviewWorld');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.05,.07,.09,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
    scene.world=world
    for i,(at,power,size) in enumerate([((-9,12,-9),3500,9),((10,7,3),4500,7),((0,5,-12),1800,6)]):
        data=bpy.data.lights.new('EX_PreviewLight_'+str(i),'AREA');data.energy=power;data.shape='DISK';data.size=size
        o=bpy.data.objects.new(data.name,data);scene.collection.objects.link(o);o.location=xyz(at)
        o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('EX_PreviewCamera');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    camera.location=xyz((17,12,-23));camera.rotation_euler=(Vector(xyz((0,0,-.4)))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.lens=48;scene.camera=camera;scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type=='VIEW_3D':
            area.spaces.active.overlay.show_overlays=False
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.region_3d.view_perspective='CAMERA'
    return len(scene.objects)


def export():
    bpy.ops.object.select_all(action='DESELECT')
    for root in roots:
        root.location=(0,0,0)
        root.select_set(True)
        for o in root.children_recursive:o.select_set(True)
    bpy.context.view_layer.objects.active=roots[0]
    bpy.ops.export_scene.gltf(filepath=str(HERE/'exterminator-family.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
    report={'version':VERSION,'coordinates':'X,Y-up,Z; forward -Z; boss scale 3; minions base size 1.8x1x1.7',
            'roots':[r.name for r in roots],'meshes':sum(o.type=='MESH' for r in roots for o in r.children_recursive),
            'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for r in roots for o in r.children_recursive if o.type=='MESH')}
    (HERE/'exterminator-family.validation.json').write_text(json.dumps(report,indent=2)+'\n')
    for root,at in zip(roots,[(0,0,0),(-2.2,0,-9),(0,0,-9),(2.2,0,-9)]):root.location=xyz(at)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'exterminator-family.blend'),check_existing=False)
    print(json.dumps(report))
    return report


if __name__=='__main__':
    setup();build_boss();build_minions();finish();export()
