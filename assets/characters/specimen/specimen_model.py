"""The Specimen: reference-led final evolution of Bob, Goop and Volt.

Blender +Z up, +Y forward; glTF +Y up, -Z forward. Sole is -0.45 m.
Focused functions are also used independently through the live Blender MCP.
No external textures, model services, or third-party assets are required.
"""

import math
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SOLE = -0.45
SCENE = 'The Specimen Studio'
CHARACTER = 'The Specimen Character'
STUDIO = 'The Specimen Studio Rig'
ASSET = 'specimen-grounded-puddle-v7'
BODY_HEIGHT = 1.78
EYE_HEIGHT = 1.32
EYE_SPACING = 0.255
EYE_SLOPE = 0.62
EYE_WIDTH = 0.185
EYE_RADIUS = 0.155
CORE_HEIGHT = 0.58
VIEW_TARGET = (0, -0.06, 0.58)
CLIPS = {'Idle': (1, 121), 'Settle': (141, 189), 'Charge': (211, 283)}

def activate(obj):
    for item in bpy.context.selected_objects:
        item.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def mesh_object(name, vertices, faces, collection=CHARACTER):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.data.collections[collection].objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    if collection == CHARACTER:
        obj.parent = bpy.data.objects.get('The Specimen')
    return obj


def create_scene():
    assert bpy.data.scenes.get(SCENE) is None, 'Specimen studio already exists'
    scene = bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene
    scene.unit_settings.system = 'METRIC'
    for name in (CHARACTER, STUDIO):
        scene.collection.children.link(bpy.data.collections.new(name))
    root = bpy.data.objects.new('The Specimen', None)
    bpy.data.collections[CHARACTER].objects.link(root)
    root.empty_display_size = 0.12
    root['asset'] = ASSET
    root['reference'] = 'Approved lightning-mohawk concept, exec-eeac3a27-ef52-4b1a-8391-1be378aedafe.png'
    root['identities'] = 'Bob / Goop / Volt'
    root['authored_up'] = '+Z'
    root['authored_forward'] = '+Y'
    root['resting_sole_m'] = SOLE
    return scene


def catmull(points, steps=10):
    result = []
    for i in range(len(points)-1):
        a, b, c, d = [points[max(0, min(len(points)-1, j))]
                       for j in (i-1, i, i+1, i+2)]
        for k in range(steps):
            t = k/steps
            result.append(tuple(0.5*((2*b[n])+(-a[n]+c[n])*t
                           +(2*a[n]-5*b[n]+4*c[n]-d[n])*t*t
                           +(-a[n]+3*b[n]-3*c[n]+d[n])*t*t*t)
                                for n in range(len(b))))
    result.append(tuple(points[-1]))
    return result


def tube(name, points, radius=1.0, sides=20, steps=6, depth=1.0):
    samples = catmull(points, steps)
    vertices, faces = [], []
    previous_u = None
    for i, point in enumerate(samples):
        p = Vector(point[:3])
        tangent = (Vector(samples[min(i+1,len(samples)-1)][:3])
                   - Vector(samples[max(0,i-1)][:3])).normalized()
        if previous_u is None:
            u = tangent.cross(Vector((0,1,0))).normalized()
            if u.length < 0.1:
                u = tangent.cross(Vector((1,0,0))).normalized()
        else:
            u = (previous_u - tangent*previous_u.dot(tangent)).normalized()
        v = tangent.cross(u).normalized()
        previous_u = u
        width = max(0.0005, point[3]*radius)
        for j in range(sides):
            angle = math.tau*j/sides
            q = p + width*(u*math.cos(angle) + v*math.sin(angle)*depth)
            vertices.append(tuple(q))
        if i:
            for j in range(sides):
                a, b = (i-1)*sides+j, (i-1)*sides+(j+1)%sides
                faces.append((a,b,b+sides,a+sides))
    first, last = len(vertices), len(vertices)+1
    vertices.extend([tuple(samples[0][:3]),tuple(samples[-1][:3])])
    end = (len(samples)-1)*sides
    for j in range(sides):
        k = (j+1)%sides
        faces.extend([(first,k,j),(last,end+j,end+k)])
    return mesh_object(name, vertices, faces)


def join_objects(objects, name):
    activate(objects[0])
    for obj in objects:
        obj.select_set(True)
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    return obj


def ellipsoid(name,centre,radii,organic=0.0,segments=64,rings=32):
    vertices=[(centre[0],centre[1],centre[2]+radii[2])]
    faces=[]
    for i in range(1,rings):
        theta=math.pi*i/rings
        for j in range(segments):
            phi=math.tau*j/segments
            noise=1+organic*(0.6*math.sin(3*phi+theta*5)+0.4*math.sin(5*phi-theta*4))*math.sin(theta)
            vertices.append((centre[0]+radii[0]*math.sin(theta)*math.cos(phi)*noise,
                             centre[1]+radii[1]*math.sin(theta)*math.sin(phi)*noise,
                             centre[2]+radii[2]*math.cos(theta)*noise))
    bottom=len(vertices)
    vertices.append((centre[0],centre[1],centre[2]-radii[2]))
    for j in range(segments):
        k=(j+1)%segments
        faces.append((0,1+j,1+k))
        for ring in range(rings-2):
            a,b=1+ring*segments+j,1+ring*segments+k
            faces.append((a,b,b+segments,a+segments))
        a,b=1+(rings-2)*segments+j,1+(rings-2)*segments+k
        faces.append((a,b,bottom))
    return mesh_object(name,vertices,faces)


def body_profile():
    # The lower mass spreads onto the floor as one shallow liquid footprint.
    profile = [(0.000,0.90,0.71),(0.040,0.94,0.745),
            (0.075,0.925,0.735),(0.140,0.865,0.670),
            (0.230,0.770,0.590),(0.310,0.690,0.535),
            (0.400,0.640,0.510),(0.620,0.565,0.45),
            (0.850,0.525,0.425),(1.080,0.505,0.415),
            (1.300,0.515,0.425),(1.530,0.535,0.440),
            (1.730,0.515,0.425),(1.910,0.440,0.370),
            (2.040,0.315,0.280),(2.120,0.170,0.160),
            (2.16,0.012,0.012)]
    return [(h*BODY_HEIGHT/2.16,rx,ry) for h,rx,ry in profile]


def body_centre(height):
    t=max(0.0,min(1.0,height/BODY_HEIGHT))
    return (-0.012*math.sin(t*math.pi),0.18*t**1.35)


def base_swell(angle,height):
    # Broad liquid lobes merge into the body, behind the thin contact edge.
    swell=0.0
    for centre,width,amount in ((0.45,0.62,0.040),(1.55,0.70,0.055),
                                (3.10,0.58,0.032),(4.70,0.65,0.042)):
        distance=math.atan2(math.sin(angle-centre),math.cos(angle-centre))
        swell+=amount*math.exp(-(distance/width)**2)
    return swell*math.exp(-((height-0.18)/0.11)**2)*(1-math.exp(-height*65))


def rear_surface(height):
    samples=body_profile()
    for i in range(len(samples)-1):
        a,b=samples[i],samples[i+1]
        if height<=b[0]:
            t=max(0.0,(height-a[0])/(b[0]-a[0]))
            return body_centre(height)[1]-(a[2]*(1-t)+b[2]*t)
    return body_centre(height)[1]-samples[-1][2]


def blade(name,outline,thickness=0.085):
    # A closed, narrow solid in the sagittal plane. Voxel union softens edges.
    vertices=[(sign*thickness/2,y,SOLE+h) for sign in (-1,1) for y,h in outline]
    count=len(outline)
    faces=[tuple(reversed(range(count))),tuple(count+i for i in range(count))]
    faces.extend((i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count))
    return mesh_object(name,vertices,faces)


def crest_bolts():
    return [(h*BODY_HEIGHT/2.16,length) for h,length in
            [(0.24,0.28),(0.52,0.36),(0.86,0.43),(1.20,0.49),
             (1.54,0.51),(1.86,0.52),(2.09,0.46)]]


def bolt_outline(height,length):
    # A real two-bend lightning silhouette, rather than a pointed triangle.
    y=rear_surface(min(height,BODY_HEIGHT-0.01))-0.075
    direction=Vector((-0.88,0.475))
    normal=Vector((0.475,0.88))
    contour=[(0,-0.22),(0.46,-0.22),(0.33,0.08),
             (1.0,0.16),(0.58,0.32),(0.69,0.58),(0,0.27)]
    return [(y+length*(u*direction.x+v*normal.x),
             height+length*(u*direction.y+v*normal.y)) for u,v in contour]


def build_body():
    samples=catmull(body_profile(),7)
    segments,vertices,faces=128,[],[]
    for i,(height,rx,ry) in enumerate(samples):
        height=max(0.0,height)
        for j in range(segments):
            a=math.tau*j/segments
            foot=math.exp(-((height-0.045)/0.16)**2)
            lobes=1+foot*(0.060*math.cos(5*a+0.45)
                         +0.025*math.sin(3*a-0.7)+0.015*math.sin(7*a+0.2))
            envelope=math.sin(math.pi*min(1.0,height/BODY_HEIGHT))
            fullness=1+0.024*math.cos(a-0.4)*envelope
            cx,cy=body_centre(height)
            ripple=1+0.010*math.sin(a*3+height*4)*envelope
            vertices.append((cx+rx*math.cos(a)*lobes*ripple*fullness,
                             cy+ry*math.sin(a)*lobes*ripple,
                             SOLE+height+base_swell(a,height)))
        if i:
            for j in range(segments):
                a,b=(i-1)*segments+j,(i-1)*segments+(j+1)%segments
                faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(samples)-1)*segments+j for j in range(segments)))
    body=mesh_object('Specimen-Body',vertices,faces)
    parts=[body]
    # A web connects every bolt into the same continuous Goop-like mohawk.
    root_heights=[0.10+i*(BODY_HEIGHT-0.10)/48 for i in range(49)]
    web=[(rear_surface(h)+0.055,h) for h in root_heights]
    web+=[(rear_surface(h)-0.22,h) for h in reversed(root_heights)]
    parts.append(blade('Mohawk-Web-Construction',web,0.115))
    # The upper web closes the small tunnel where the two crown bolts overlap.
    parts.append(blade('Crown-Web-Construction',
        [(-0.25,1.61),(-0.54,1.76),(-0.48,1.96),(-0.12,1.78)],0.09))
    for index,(height,length) in enumerate(crest_bolts()):
        parts.append(blade('Lightning-Bolt-Construction-'+str(index),
                           bolt_outline(height,length),0.085))
    body=join_objects(parts,'Specimen-Body')
    activate(body)
    remesh=body.modifiers.new('Continuous body and lightning mohawk','REMESH')
    remesh.mode='VOXEL'
    remesh.voxel_size=0.012
    remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=body.modifiers.new('Soft liquid edges','SMOOTH')
    smooth.factor=0.70
    smooth.iterations=5
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    foot_group=body.vertex_groups.new(name='Ooze transitions')
    for vertex in body.data.vertices:
        weight=math.exp(-((vertex.co.z-SOLE-0.12)/0.15)**2)
        if weight>0.015:
            foot_group.add([vertex.index],weight,'REPLACE')
    smooth=body.modifiers.new('Flowing base junctions','SMOOTH')
    smooth.vertex_group=foot_group.name
    smooth.factor=0.7
    smooth.iterations=16
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate=body.modifiers.new('Animation-ready sculpt density','DECIMATE')
    decimate.ratio=0.36
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    # Voxelization of an acute lightning notch can leave a microscopic sliver.
    bm=bmesh.new()
    bm.from_mesh(body.data)
    unseen=set(bm.verts)
    debris=[]
    while unseen:
        stack=[unseen.pop()]
        component=[]
        while stack:
            vertex=stack.pop()
            component.append(vertex)
            for edge in vertex.link_edges:
                neighbour=edge.other_vert(vertex)
                if neighbour in unseen:
                    unseen.remove(neighbour)
                    stack.append(neighbour)
        if len(component)<32:
            debris.extend(component)
    if debris:
        bmesh.ops.delete(bm,geom=debris,context='VERTS')
        bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    for vertex in body.data.vertices:
        h=max(0.0,vertex.co.z-SOLE)
        # Compress the puddle vertically while retaining the upper sculpt.
        t=min(1.0,h/0.24)
        easing=t*t*(3-2*t)
        underside=h<0.055 and vertex.normal.z<-0.20
        vertex.co.z=SOLE+h*(0.52+0.48*easing)
        if underside or vertex.co.z<SOLE+0.004:
            vertex.co.z=SOLE
        x,y,z=vertex.co
        if y>0.22 and 0.95<z-SOLE<1.68:
            for sign in (-1,1):
                dx=x-sign*EYE_SPACING
                dz=z-SOLE-EYE_HEIGHT-sign*EYE_SLOPE*dx
                r=(dx/(EYE_WIDTH+0.018))**2+abs(dz)/((EYE_RADIUS+0.018)*(0.63 if dz>=0 else 1.0))
                fold=math.exp(-((r-1.03)/0.18)**2)
                upper=max(0.1,min(1.0,0.55+dz/0.26))
                vertex.co.y+=0.035*fold*upper
    for face in body.data.polygons:
        face.use_smooth=True
    body['construction']='Full liquid lobes merge into a thin grounded puddle; seven webbed lightning-bolt crest peaks'
    body.data.update()
    return body


# SECTION: face
def sculpt_surface():
    body=bpy.data.objects['Specimen-Body']
    # Build once for the eye morph pass. Its immutable basis must not sample
    # Blender's evaluated mesh while new shape keys are still being assembled.
    source=body.data.shape_keys.key_blocks['Basis'].data if body.data.shape_keys else body.data.vertices
    return BVHTree.FromPolygons([vertex.co.copy() for vertex in source],
                               [tuple(face.vertices) for face in body.data.polygons])


def front_point(x,z,offset=0.0,surface=None):
    if surface is None:
        body=bpy.data.objects['Specimen-Body']
        hit,p,normal,index=body.ray_cast(Vector((x,3,z)),Vector((0,-1,0)))
    else:
        p,normal,index,distance=surface.ray_cast(Vector((x,3,z)),Vector((0,-1,0)))
        hit=p is not None
    if not hit:
        raise ValueError('No body beneath surface feature: '+str((x,z)))
    return (x,p.y+offset,z)


def eye_outline():
    sides,rings=64,12
    outline=[(0.0,0.0,0.0)]
    for ring in range(1,rings+1):
        r=ring/rings
        for j in range(sides):
            a=math.tau*j/sides
            u=math.cos(a)
            dx=r*EYE_WIDTH*u
            dz=r*EYE_RADIUS*(1-u*u)*(0.63 if math.sin(a)>=0 else -1.0)
            outline.append((dx,dz,r))
    return outline


def build_face():
    for label,sign in [('Left',-1),('Right',1)]:
        cx,cz=sign*EYE_SPACING,SOLE+EYE_HEIGHT
        sides,rings=64,12
        outline=eye_outline()
        vertices,faces=[],[]
        for dx,dz,radius in outline:
            vertices.append(front_point(cx+dx,cz+dz+sign*EYE_SLOPE*dx,
                                        -0.006+0.037*max(0,1-radius*radius)))
        for j in range(sides):
            k=(j+1)%sides
            faces.append((0,1+j,1+k))
            for ring in range(rings-1):
                a,b=1+ring*sides+j,1+ring*sides+k
                faces.append((a,b,b+sides,a+sides))
        count=len(vertices)
        vertices.extend(front_point(cx+dx,cz+dz+sign*EYE_SLOPE*dx,-0.030)
                        for dx,dz,radius in outline)
        faces.extend(tuple(count+i for i in reversed(face)) for face in list(faces))
        start=1+(rings-1)*sides
        for j in range(sides):
            a,b=start+j,start+(j+1)%sides
            faces.append((a,a+count,b+count,b))
        obj=mesh_object('Specimen-Eye-'+label,vertices,faces)
        activate(obj)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')
    return [bpy.data.objects['Specimen-Eye-'+label] for label in ('Left','Right')]


# SECTION: details
def flow_ribbon(name,controls,back=False):
    samples=catmull(controls,8)
    vertices,faces=[],[]
    sides=24
    body=bpy.data.objects['Specimen-Body']
    toward=Vector((0.66,0.7513,0)).normalized()
    across_view=Vector((toward.y,-toward.x,0))
    for i,(x,h,width) in enumerate(samples):
        before=samples[max(0,i-1)]
        after=samples[min(len(samples)-1,i+1)]
        tangent=Vector((after[0]-before[0],after[1]-before[1])).normalized()
        across=Vector((tangent.y,-tangent.x))
        for j in range(sides):
            angle=math.tau*j/sides
            px=x+across.x*width*math.cos(angle)*(1+0.065*math.sin(i*0.85+angle*3))
            pz=SOLE+h+across.y*width*math.cos(angle)*(1+0.065*math.sin(i*0.85+angle*3))
            direction=-toward if back else toward
            start=across_view*px+direction*3
            start.z=pz
            # Choose the thickest closed interval on this ray. This bypasses
            # the dorsal web and adapts the inset near thin curved edges.
            hits=[]
            cursor=start.copy()
            for attempt in range(14):
                hit,point,normal,index=body.ray_cast(cursor,-direction)
                if not hit:
                    break
                hits.append(point.copy())
                cursor=point-direction*0.0002
            assert len(hits)>=2,('Ribbon outside body',px,pz)
            entry,exit_point=hits[0],hits[1]
            for pair in range(2,len(hits)-1,2):
                if (hits[pair+1]-hits[pair]).length>(exit_point-entry).length:
                    entry,exit_point=hits[pair],hits[pair+1]
            thickness=(exit_point-entry).length
            depth=min(0.085,thickness*0.36)+0.025*math.sin(angle)*min(1.0,thickness/0.25)
            q=entry-direction*depth
            px,py,pz=q
            vertices.append((px,py,pz))
        if i:
            for j in range(sides):
                a,b=(i-1)*sides+j,(i-1)*sides+(j+1)%sides
                faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(samples)-1)*sides+j for j in range(sides)))
    if not back:
        faces=[tuple(reversed(face)) for face in faces]
    return mesh_object(name,vertices,faces)


def contained_point(point,depth=0.010):
    # Keep a current inside the concave web and its zigzag teeth as well as skin.
    body=bpy.data.objects['Specimen-Body']
    hit,surface,normal,index=body.closest_point_on_mesh(Vector(point))
    assert hit
    q=Vector(point)
    signed=(q-surface).dot(normal)
    if signed>-depth:
        q=surface-normal*depth
    return tuple(q)


def build_details():
    scale=BODY_HEIGHT/2.16
    # A broad S-shaped current is actual flattened, closed internal geometry.
    primary=[(-0.30,0.13,0.004),(-0.43,0.23,0.070),(-0.22,0.42,0.095),
             (0.17,0.58,0.095),(0.32,0.78,0.085),(0.21,1.00,0.090),
             (-0.13,1.22,0.100),(-0.35,1.43,0.080),(-0.39,1.66,0.065),
             (-0.27,1.87,0.052),(-0.03,2.025,0.003)]
    secondary=[(0.44,0.18,0.004),(0.49,0.34,0.035),(0.37,0.63,0.045),
               (0.41,0.94,0.040),(0.43,1.25,0.045),(0.45,1.53,0.035),
               (0.30,1.82,0.003)]
    rear=[(-0.28,0.16,0.003),(-0.41,0.40,0.045),(-0.22,0.69,0.070),
          (0.16,0.95,0.070),(0.35,1.22,0.050),(0.29,1.53,0.035),
          (0.05,1.92,0.003)]
    currents=[]
    for index,path in enumerate((primary,secondary,rear)):
        controls=[(x*(0.78 if index==1 else 1.0),h*scale,w) for x,h,w in path]
        currents.append(flow_ribbon('Aqua-Current-'+str(index),controls,back=index==2))
    for branch in range(2):
        controls=[(x+(0.032 if branch else -0.030)*math.sin(j*0.9),
                   h*scale+(0.010 if branch else -0.010),max(0.0015,w*0.15))
                  for j,(x,h,w) in enumerate(primary)]
        currents.append(flow_ribbon('Aqua-Filament',controls))
    join_objects(currents,'Specimen-Aqua-Currents')
    # An irregular clear shell contains an emissive heart and winding green folds.
    centre=(0.13,0.15,SOLE+CORE_HEIGHT)
    shell=ellipsoid('Fusion-Shell',centre,(0.255,0.205,0.245),0.085)
    heart=ellipsoid('Fusion-Heart',(0.13,0.15,SOLE+CORE_HEIGHT),(0.105,0.082,0.102),0.11,48,24)
    shell.data.materials.append(bpy.data.materials.get('Specimen-Luminous-Acid') or bpy.data.materials.new('Specimen-Luminous-Acid'))
    heart.data.materials.append(bpy.data.materials.get('Specimen-Fusion-Heart') or bpy.data.materials.new('Specimen-Fusion-Heart'))
    core_parts=[shell,heart]
    for branch in range(3):
        controls=[]
        for i in range(29):
            t=i/28
            angle=t*math.tau*1.35+branch*math.tau/3
            radius=0.19*math.sin(math.pi*t)**0.55
            controls.append((centre[0]+radius*math.cos(angle),
                             centre[1]+radius*0.73*math.sin(angle),
                             centre[2]+(t-0.5)*0.44,
                             0.004+0.016*math.sin(math.pi*t)))
        plume=tube('Fusion-Swirl',controls,sides=14,steps=2,depth=0.64)
        plume.data.materials.append(bpy.data.materials.get('Specimen-Acid-Swirl') or bpy.data.materials.new('Specimen-Acid-Swirl'))
        core_parts.append(plume)
    join_objects(core_parts,'Specimen-Acid-Core')
    paths=[[(0.02,0.16),(-0.11,0.32),(-0.04,0.52),(0.06,0.70),(-0.08,0.94),
            (-0.03,1.16),(0.04,1.35),(-0.06,1.55),(0.01,1.78),(-0.03,2.02)],
           [(0.06,0.70),(0.23,0.80),(0.30,1.00),(0.39,1.10)],
           [(-0.04,0.52),(-0.24,0.61),(-0.32,0.80),(-0.44,0.92)],
           [(-0.08,0.94),(-0.26,1.04),(-0.30,1.20),(-0.42,1.32)],
           [(-0.11,0.32),(-0.29,0.28),(-0.40,0.16),(-0.58,0.14)],
           [(0.06,0.70),(0.27,0.52),(0.31,0.32),(0.52,0.17)],
           [(0.04,1.35),(0.20,1.24),(0.28,1.35),(0.42,1.43)],
           [(-0.06,1.55),(-0.17,1.83),(-0.10,1.98)]]
    bolts=[]
    for branch,path in enumerate(paths):
        points=[]
        for link in range(len(path)-1):
            a,b=path[link],path[link+1]
            for j in range(4):
                t=j/4
                x=a[0]*(1-t)+b[0]*t+0.012*math.sin((link*4+j)*2.3+branch)*math.sin(t*math.pi)
                h=(a[1]*(1-t)+b[1]*t+0.010*math.sin(link*7+j*3.1+branch))*scale
                points.append((*front_point(x,SOLE+h,-0.032),
                               (0.0024 if branch==0 else 0.00165)*(0.8+0.2*math.sin(link+j)**2)))
        x,h=path[-1]
        points.append((*front_point(x,SOLE+h*scale,-0.035),0.0006))
        bolts.append(tube('Body-Current',points,sides=8,steps=1))
        # Small secondary twigs make a branching network, not a single wire.
        for k in range(4,len(points)-3,6):
            x,y,z,r=points[k]
            sign=-1 if (k+branch)%2 else 1
            controls=[(x,y,z,r*0.7)]
            for j in range(1,4):
                px=x+sign*0.022*j+0.009*math.sin(j*4+k)
                pz=z+0.019*j
                try:
                    controls.append((*front_point(px,pz,-0.037),max(0.00045,r*(0.7-j*0.18))))
                except ValueError:
                    break
            if len(controls)>1:
                bolts.append(tube('Current-Twig',controls,sides=6,steps=1))
    # Veins also follow the actual bolt geometry through the mohawk.
    for h,length in crest_bolts():
        y=rear_surface(min(h,BODY_HEIGHT-0.01))-0.075
        direction=Vector((-0.88,0.475))
        normal=Vector((0.475,0.88))
        controls=[]
        for i,(u,v) in enumerate(((0,0.02),(0.36,-0.015),(0.48,0.19),(0.69,0.25),(0.90,0.18))):
            py=y+length*(u*direction.x+v*normal.x)
            pz=SOLE+h+length*(u*direction.y+v*normal.y)
            q=contained_point((0.013,py,pz),0.012)
            controls.append((*q,0.0014 if i<4 else 0.00065))
        bolts.append(tube('Crest-Current',controls,sides=8,steps=2))
    controls=[]
    for i in range(40):
        h=0.12+i*(BODY_HEIGHT-0.14)/39
        controls.append((0.012,rear_surface(h)-0.095,SOLE+h,0.0018))
    bolts.append(tube('Spinal-Current',controls,sides=8,steps=1))
    veins=join_objects(bolts,'Specimen-Electric-Veins')
    # Reproject any thin-tube corners into the final concave sculpt.
    for vertex in veins.data.vertices:
        vertex.co=contained_point(vertex.co,0.006)
    veins.data.update()


# SECTION: materials
def material(name,colour,roughness,emission=0.0,transmission=0.0):
    mat=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes=True
    mat.diffuse_color=(*colour,1)
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*colour,1)
    bsdf.inputs['Roughness'].default_value=roughness
    bsdf.inputs['Metallic'].default_value=0.0
    bsdf.inputs['IOR'].default_value=1.34
    bsdf.inputs['Coat Weight'].default_value=0.40
    bsdf.inputs['Coat Roughness'].default_value=0.09
    bsdf.inputs['Transmission Weight'].default_value=transmission
    bsdf.inputs['Emission Color'].default_value=(*colour,1)
    bsdf.inputs['Emission Strength'].default_value=emission
    return mat,bsdf


def lookdev():
    gel,bsdf=material('Specimen-Turquoise-Gel',(0.16,0.43,0.36),0.13,transmission=0.94)
    bsdf.inputs['Coat Weight'].default_value=0.26
    bsdf.inputs['Coat Roughness'].default_value=0.11
    bsdf.inputs['Subsurface Weight'].default_value=0.018
    bsdf.inputs['Subsurface Radius'].default_value=(0.06,0.14,0.10)
    eye,eye_bsdf=material('Specimen-Obsidian-Eyes',(0.001,0.004,0.005),0.105)
    eye_bsdf.inputs['Coat Weight'].default_value=0.32
    aqua,aqua_bsdf=material('Specimen-Aqua-Flow',(0.62,0.92,0.81),0.12,emission=0.32,transmission=0.98)
    aqua_bsdf.inputs['Coat Weight'].default_value=0.12
    aqua_bsdf.inputs['IOR'].default_value=1.31
    acid,acid_bsdf=material('Specimen-Luminous-Acid',(0.10,0.65,0.018),0.28,emission=4.0,transmission=0.40)
    acid_bsdf.inputs['Coat Weight'].default_value=0.02
    heart,heart_bsdf=material('Specimen-Fusion-Heart',(0.32,1.0,0.025),0.35,emission=32.0,transmission=0.15)
    heart_bsdf.inputs['Coat Weight'].default_value=0.0
    swirl,swirl_bsdf=material('Specimen-Acid-Swirl',(0.22,0.83,0.025),0.24,emission=4.5,transmission=0.35)
    swirl_bsdf.inputs['Coat Weight'].default_value=0.02
    electric,electric_bsdf=material('Specimen-Golden-Discharge',(1.0,0.26,0.006),0.25,emission=12.0)
    hot,hot_bsdf=material('Specimen-Charged-Junctions',(1.0,0.42,0.018),0.25,emission=20.0)
    for obj in bpy.data.collections[CHARACTER].objects:
        if obj.type!='MESH':
            continue
        if obj.name=='Specimen-Acid-Core':
            continue
        mat=gel
        if 'Eye-' in obj.name: mat=eye
        elif 'Aqua-' in obj.name: mat=aqua
        elif 'Electric-' in obj.name: mat=electric
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        if obj.name=='Specimen-Electric-Veins':
            obj.data.materials.append(hot)
            for face in obj.data.polygons:
                p=face.center
                face.material_index=1 if ((p.z-SOLE-CORE_HEIGHT)**2+p.x*p.x<0.19**2 or p.y<-0.55) else 0
    core=bpy.data.objects['Specimen-Acid-Core']
    field=core.data.color_attributes.get('SpecimenCore') or core.data.color_attributes.new(name='SpecimenCore',type='FLOAT_COLOR',domain='POINT')
    core.data.color_attributes.active_color=field
    for vertex in core.data.vertices:
        x,y,z=vertex.co-Vector((0.13,0.15,SOLE+CORE_HEIGHT))
        radius=math.sqrt(x*x+y*y+z*z)
        angle=math.atan2(z,x)
        noise=math.sin(28*radius+4*angle+8*y+1.7*math.sin(16*z))
        noise+=0.38*math.sin(x*43-y*31+z*27)
        t=max(0.0,min(1.0,0.5+noise*0.48))
        field.data[vertex.index].color=(0.018+0.32*t,0.12+0.88*t,0.003+0.025*t,1)
    for mat,node in ((acid,acid_bsdf),(swirl,swirl_bsdf),(heart,heart_bsdf)):
        colour=mat.node_tree.nodes.get('Core Current Colours')
        if colour is None:
            colour=mat.node_tree.nodes.new('ShaderNodeVertexColor')
            colour.name='Core Current Colours'
        colour.layer_name='SpecimenCore'
        mat.node_tree.links.new(colour.outputs['Color'],node.inputs['Base Color'])
        mat.node_tree.links.new(colour.outputs['Color'],node.inputs['Emission Color'])
    # The colour field is portable GLB vertex data. The ribbons are geometry.
    colour_node=bsdf.id_data.nodes.get('Specimen Gel Colour')
    if colour_node is None:
        colour_node=bsdf.id_data.nodes.new('ShaderNodeVertexColor')
        colour_node.name='Specimen Gel Colour'
    colour_node.layer_name='SpecimenFlow'
    gel.node_tree.links.new(colour_node.outputs['Color'],bsdf.inputs['Base Color'])
    obj=bpy.data.objects['Specimen-Body']
    attr=obj.data.color_attributes.get('SpecimenFlow') or obj.data.color_attributes.new(name='SpecimenFlow',type='FLOAT_COLOR',domain='POINT')
    obj.data.color_attributes.active_color=attr
    for vertex in obj.data.vertices:
        x,y,z=vertex.co
        h=z-SOLE
        wave=math.sin(x*9+h*5+math.sin(y*5+h*4))
        t=0.5+0.5*wave
        base=(0.12+0.04*t,0.34+0.08*t,0.28+0.08*t)
        ridge=max(0.0,min(1.0,(-y+rear_surface(min(h,BODY_HEIGHT)))/0.20))
        mint=(0.39,0.72,0.60)
        blend=ridge*0.70
        attr.data[vertex.index].color=tuple(base[i]*(1-blend)+mint[i]*blend for i in range(3))+(1.0,)


# SECTION: motion
def deform_spatial(point,name):
    x,y,z=point
    h=max(0.0,z-SOLE)
    w=1-math.exp(-h*6)
    if name=='Breathe':
        return Vector((x*(1+0.014*w),y*(1+0.010*w),SOLE+h*1.012))
    if name=='Squash':
        return Vector((x*(1+0.085*w),y*(1+0.055*w),SOLE+h*0.88))
    if name=='Stretch':
        return Vector((x*(1-0.045*w),y*(1-0.035*w),SOLE+h*1.10))
    sign=-1 if name=='WobbleLeft' else 1
    return Vector((x+sign*0.060*(h/BODY_HEIGHT)**1.6,
                   y+0.009*math.sin(h*4)*h/BODY_HEIGHT,z))


def build_morphs():
    spatial=('Breathe','Squash','Stretch','WobbleLeft','WobbleRight')
    parameters=eye_outline()
    surface=sculpt_surface()
    for obj in bpy.data.collections[CHARACTER].objects:
        if obj.type!='MESH':
            continue
        obj.shape_key_add(name='Basis',from_mix=False)
        basis=[vertex.co.copy() for vertex in obj.data.vertices]
        for name in spatial:
            key=obj.shape_key_add(name=name,from_mix=False)
            for vertex,point in zip(key.data,basis):
                vertex.co=deform_spatial(point,name)
        if obj.name=='Specimen-Body' or 'Eye-' in obj.name:
            for name in ('Blink','Curious','Focus'):
                key=obj.shape_key_add(name=name,from_mix=False)
                for i,point in enumerate(basis):
                    key.data[i].co=point
                    x,y,z=point
                    if 'Eye-' in obj.name:
                        sign=-1 if 'Left' in obj.name else 1
                        dx=x-sign*EYE_SPACING
                        cz=SOLE+EYE_HEIGHT
                        local_z=z-cz-sign*EYE_SLOPE*dx
                        if name=='Blink':
                            nz=cz+sign*EYE_SLOPE*dx+local_z*0.10
                        elif name=='Curious':
                            nz=cz+sign*0.45*dx+local_z*1.07
                        else:
                            nz=cz+sign*0.76*dx+local_z*0.81
                        radius=parameters[i%(len(basis)//2)][2]
                        offset=(-0.006+0.037*max(0,1-radius*radius)) if i<len(basis)//2 else -0.030
                        key.data[i].co=front_point(x,nz,offset,surface=surface)
                    elif y>0.15:
                        for sign in (-1,1):
                            dx=x-sign*EYE_SPACING
                            dz=z-SOLE-EYE_HEIGHT-sign*EYE_SLOPE*dx
                            r=math.sqrt((dx/(EYE_WIDTH+0.020))**2+(dz/(EYE_RADIUS+0.020))**2)
                            fold=math.exp(-((r-1.0)/0.19)**2)
                            factor={'Blink':0.008,'Curious':-0.004,'Focus':0.012}[name]
                            key.data[i].co.y+=factor*fold
        if obj.name in ('Specimen-Acid-Core','Specimen-Aqua-Currents'):
            key=obj.shape_key_add(name='Flow')
            for vertex,point in zip(key.data,basis):
                x,y,z=point
                h=z-SOLE
                if obj.name=='Specimen-Aqua-Currents':
                    vertex.co=(x+0.006*math.sin(h*5+y*3),y+0.005*math.cos(h*4+x*5),z+0.005*math.sin(h*5))
                else:
                    a=0.12*math.sin(h*4.8)
                    dx,dy=x-0.13,y-0.15
                    vertex.co=(0.13+dx*math.cos(a)-dy*math.sin(a),
                               0.15+dx*math.sin(a)+dy*math.cos(a),z+0.008*math.sin(h*6+x*3))
        if obj.name in ('Specimen-Body','Specimen-Electric-Veins'):
            for label,sign in (('CrestFlexLeft',-1),('CrestFlexRight',1)):
                key=obj.shape_key_add(name=label,from_mix=False)
                for vertex,point in zip(key.data,basis):
                    vertex.co=point
                    x,y,z=point
                    h=max(0,z-SOLE)
                    ridge=max(0.0,min(1.0,(rear_surface(min(h,BODY_HEIGHT))-y+0.035)/0.17))
                    weight=ridge*math.exp(-(x/0.16)**2)
                    vertex.co.x+=sign*0.055*weight*(h/(BODY_HEIGHT+0.32))**1.4
        if obj.name in ('Specimen-Acid-Core','Specimen-Electric-Veins'):
            key=obj.shape_key_add(name='Charge')
            for i,point in enumerate(basis):
                if obj.name=='Specimen-Acid-Core':
                    key.data[i].co=(point.x*1.08,point.y*1.06+0.015,point.z)
                else:
                    key.data[i].co=point+obj.data.vertices[i].normal*0.0015
        obj.data.shape_keys.name=obj.name+'-Morphs'
    bpy.data.objects['The Specimen']['morphs']='Breathe, Squash, Stretch, WobbleLeft, WobbleRight, Blink, Curious, Focus, Flow, Charge, CrestFlexLeft, CrestFlexRight'


def animation_curves(clip):
    if clip=='Idle':
        return {
            'CrestFlexLeft':[(1,0),(39,0.30),(79,0),(121,0)],
            'CrestFlexRight':[(1,0),(59,0),(95,0.25),(121,0)],
            'Breathe':[(1,0),(31,1),(61,0),(91,1),(121,0)],
            'WobbleLeft':[(1,0),(29,0.22),(61,0),(97,0.12),(121,0)],
            'WobbleRight':[(1,0),(49,0.16),(81,0.20),(121,0)],
            'Curious':[(1,0),(25,0.50),(65,0.30),(89,0),(121,0)],
            'Blink':[(1,0),(47,0),(50,1),(53,0),(99,0),(102,1),(105,0),(121,0)],
            'Flow':[(1,0),(31,0.7),(61,1),(91,0.35),(121,0)],
        }
    if clip=='Settle':
        return {
            'CrestFlexLeft':[(1,0),(11,0.65),(21,0),(35,0.15),(49,0)],
            'CrestFlexRight':[(1,0),(19,0),(27,0.45),(40,0),(49,0)],
            'Squash':[(1,0),(5,0.9),(12,0),(21,0.25),(32,0),(49,0)],
            'Stretch':[(1,0),(5,0),(13,0.4),(22,0),(30,0.08),(49,0)],
            'WobbleLeft':[(1,0),(5,0.05),(12,0.60),(21,0),(32,0.14),(49,0)],
            'WobbleRight':[(1,0),(12,0),(22,0.45),(32,0),(40,0.07),(49,0)],
            'Flow':[(1,0),(11,0.7),(27,0.3),(49,0)],
        }
    return {
        'CrestFlexLeft':[(1,0),(43,0.25),(56,0.5),(63,0),(73,0)],
        'CrestFlexRight':[(1,0),(56,0),(63,0.3),(73,0)],
        'Focus':[(1,0),(19,0.55),(49,1),(61,0.85),(73,0)],
        'Squash':[(1,0),(43,0.4),(54,0.5),(59,0),(73,0)],
        'Stretch':[(1,0),(57,0),(61,0.4),(73,0)],
        'WobbleLeft':[(1,0),(57,0),(63,0.32),(73,0)],
        'Flow':[(1,0),(31,0.6),(49,1),(61,0.35),(73,0)],
        'Charge':[(1,0),(19,0.15),(43,0.75),(49,1),(53,0.6),(56,1),(59,0),(73,0)],
    }


def stash_action(data,clip):
    animation=data.animation_data
    action=animation.action
    slot=animation.action_slot
    action.name=data.name+'-'+clip
    for layer in action.layers:
        for strip in layer.strips:
            bag=strip.channelbag(slot)
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.interpolation='BEZIER'
                    key.handle_left_type='AUTO_CLAMPED'
                    key.handle_right_type='AUTO_CLAMPED'
    track=animation.nla_tracks.new()
    track.name=clip
    strip=track.strips.new(clip,CLIPS[clip][0],action)
    strip.action_slot=slot
    strip.extrapolation='NOTHING'
    strip.blend_type='REPLACE'
    animation.action=None


def build_animations():
    scene=bpy.context.scene
    scene.render.fps=24
    scene.frame_start=1
    scene.frame_end=283
    for obj in bpy.data.collections[CHARACTER].objects:
        if obj.type!='MESH':
            continue
        data=obj.data.shape_keys
        for clip,(start,end) in CLIPS.items():
            curves=animation_curves(clip)
            for key in list(data.key_blocks)[1:]:
                values=curves.get(key.name,[(1,0),(end-start+1,0)])
                for frame,value in values:
                    key.value=value
                    key.keyframe_insert(data_path='value',frame=frame)
            stash_action(data,clip)
            for key in data.key_blocks:
                key.value=0
    # NLA material tracks export as KHR_animation_pointer along with morph clips.
    for name,base in [('Specimen-Golden-Discharge',12.0),('Specimen-Charged-Junctions',20.0)]:
        mat=bpy.data.materials[name]
        node=mat.node_tree.nodes.get('Principled BSDF')
        for clip,(start,end) in CLIPS.items():
            if clip=='Idle':
                values=[(1,base),(31,base*1.12),(61,base),(91,base*1.08),(121,base)]
            elif clip=='Settle':
                values=[(1,base),(7,base*1.35),(24,base*1.08),(49,base)]
            else:
                values=[(1,base),(19,base*1.5),(43,base*3),(49,base*4),
                        (53,base*2.7),(56,base*4.5),(59,base),(73,base)]
            for frame,value in values:
                node.inputs['Emission Strength'].default_value=value
                node.inputs['Emission Strength'].keyframe_insert(data_path='default_value',frame=frame)
            stash_action(mat.node_tree,clip)
            node.inputs['Emission Strength'].default_value=base
    for clip,(start,end) in CLIPS.items():
        scene.timeline_markers.new(clip,frame=start)
    root=bpy.data.objects['The Specimen']
    root['preview']='24fps: Idle 1-121; Settle 141-189; Charge 211-283'
    scene.frame_set(1)


# SECTION: studio
def aim(obj,point):
    obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()


def studio():
    scene=bpy.context.scene
    world=bpy.data.worlds.new('Specimen Deep Teal World')
    world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.018,0.045,0.041,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.30
    scene.world=world
    mat,_=material('Specimen-Studio-Slate',(0.010,0.018,0.024),0.27)
    mesh_object('Specimen-Studio-Floor',[(-200,-200,SOLE-0.001),(200,-200,SOLE-0.001),
        (200,200,SOLE-0.001),(-200,200,SOLE-0.001)],[(0,1,2,3)],STUDIO).data.materials.append(mat)
    for name,position,energy,size,colour in [
        ('Softbox-Key',(-3.8,4.0,6.0),1050,4.0,(0.80,1.0,0.94)),
        ('Softbox-Rim',(3.5,-2.0,4.2),1500,3.0,(0.44,1.0,0.91)),
        ('Softbox-Front',(1.5,5.0,2.3),380,2.3,(0.62,1.0,0.9)),
        ('Softbox-Gold',(-3.0,-1.7,3.0),650,2.0,(1.0,0.67,0.23))]:
        data=bpy.data.lights.new(name,'AREA')
        data.energy=energy
        data.shape='DISK'
        data.size=size
        data.color=colour
        obj=bpy.data.objects.new(name,data)
        bpy.data.collections[STUDIO].objects.link(obj)
        obj.location=position
        aim(obj,(0,0,1.0))
    camera_data=bpy.data.cameras.new('Specimen-Hero-Camera')
    camera=bpy.data.objects.new('Specimen-Hero-Camera',camera_data)
    bpy.data.collections[STUDIO].objects.link(camera)
    scene.camera=camera
    camera_data.type='ORTHO'
    camera_data.ortho_scale=2.65
    camera.location=(7.5,6.8,1.6)
    aim(camera,VIEW_TARGET)
    scene.render.engine='CYCLES'
    scene.cycles.samples=48
    scene.cycles.use_denoising=True
    scene.cycles.max_bounces=10
    scene.cycles.transmission_bounces=8
    scene.render.resolution_x=1000
    scene.render.resolution_y=1100
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='AgX'
    compositor()


def compositor():
    scene=bpy.context.scene
    if bpy.app.version>=(5,0,0):
        tree=bpy.data.node_groups.new('Specimen Studio Compositor','CompositorNodeTree')
        scene.compositing_node_group=tree
        tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
        layer=tree.nodes.new('CompositorNodeRLayers')
        glare=tree.nodes.new('CompositorNodeGlare')
        glare.inputs['Type'].default_value='Fog Glow'
        glare.inputs['Quality'].default_value='High'
        glare.inputs['Threshold'].default_value=1.8
        glare.inputs['Strength'].default_value=0.24
        glare.inputs['Size'].default_value=0.23
        output=tree.nodes.new('NodeGroupOutput')
    else:
        scene.use_nodes=True
        tree=scene.node_tree
        tree.nodes.clear()
        layer=tree.nodes.new('CompositorNodeRLayers')
        glare=tree.nodes.new('CompositorNodeGlare')
        glare.glare_type='FOG_GLOW'
        glare.quality='HIGH'
        glare.threshold=1.8
        glare.size=7
        output=tree.nodes.new('CompositorNodeComposite')
    layer.scene=scene
    tree.links.new(layer.outputs['Image'],glare.inputs['Image'])
    tree.links.new(glare.outputs['Image'],output.inputs['Image'])


def viewport(view='hero',material=True,update=True):
    body=bpy.data.objects['Specimen-Body']
    activate(body)
    area=next(area for area in bpy.context.screen.areas if area.type=='VIEW_3D')
    region=next(region for region in area.regions if region.type=='WINDOW')
    space=area.spaces.active
    space.overlay.show_overlays=False
    space.show_region_ui=False
    space.shading.type='MATERIAL' if material else 'SOLID'
    space.shading.studiolight_rotate_z=0.4
    space.shading.studiolight_intensity=1.0
    if material:
        space.shading.studio_light='studio.exr'
    directions={'hero':(7.5,6.8,0.8),'front':(0,8,0.0),'side':(8,0,0.0),
                'back':(0,-8,0.0)}
    space.region_3d.view_rotation=Vector(directions[view]).to_track_quat('Z','Y')
    space.region_3d.view_location=VIEW_TARGET
    space.region_3d.view_perspective='ORTHO'
    space.region_3d.view_distance=3.1
    if update:
        space.region_3d.update()
        area.tag_redraw()
    return {'view':view,'distance':space.region_3d.view_distance}
