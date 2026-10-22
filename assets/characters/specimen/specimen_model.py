"""The Specimen: simplified combined slime sculpt.

Blender +Z up, +Y forward; glTF +Y up, -Z forward. Sole is -0.45 m.
Focused functions are also used independently through the live Blender MCP.
No external textures, model services, or third-party assets are required.
"""

import math
import bpy
from mathutils import Vector

SOLE = -0.45
SCENE = 'The Specimen Studio'
CHARACTER = 'The Specimen Character'
STUDIO = 'The Specimen Studio Rig'
ASSET = 'specimen-living-gel-v3'
EYE_HEIGHT = 1.265
EYE_SLOPE = 0.42
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
    root['reference'] = 'User supplied turquoise liquid brawler concept sheet'
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


def build_body():
    profile = [(0.000,0.86,0.62), (0.035,1.00,0.73),
               (0.105,1.075,0.77), (0.19,1.015,0.73),
               (0.34,0.88,0.64), (0.56,0.75,0.57),
               (0.82,0.70,0.54), (1.05,0.73,0.55),
               (1.25,0.70,0.53), (1.43,0.58,0.45),
               (1.58,0.40,0.33), (1.68,0.20,0.20),
               (1.70,0.01,0.01)]
    samples = catmull(profile, 5)
    segments, vertices, faces = 112, [], []
    for i,(height,rx,ry) in enumerate(samples):
        height = max(0.0,height)
        for j in range(segments):
            a = math.tau*j/segments
            skirt = math.exp(-height*8)
            lobes = 1+skirt*(0.065*math.cos(5*a+0.3)+0.025*math.sin(3*a+0.5))
            ripple = 1+0.012*math.sin(a*3+height*6)*math.sin(math.pi*height/1.7)
            vertices.append((rx*math.cos(a)*lobes*ripple,
                             ry*math.sin(a)*lobes*ripple,
                             SOLE+height))
        if i:
            for j in range(segments):
                a, b = (i-1)*segments+j, (i-1)*segments+(j+1)%segments
                faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(samples)-1)*segments+j for j in range(segments)))
    body = mesh_object('Specimen-Body',vertices,faces)
    activate(body)
    remesh = body.modifiers.new('Continuous liquid union','REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = 0.025
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth = body.modifiers.new('Surface tension','SMOOTH')
    smooth.factor = 1.1
    smooth.iterations = 4
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate = body.modifiers.new('Balanced sculpt density','DECIMATE')
    decimate.ratio = 0.48
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for vertex in body.data.vertices:
        if vertex.co.z < SOLE+0.017:
            vertex.co.z = SOLE
        # Raised folds remain part of the continuous body, around each eye.
        x,y,z=vertex.co
        if y>0.15 and 0.85<z-SOLE<1.65:
            for sign in (-1,1):
                dx=x-sign*0.285
                dz=z-SOLE-EYE_HEIGHT-sign*EYE_SLOPE*dx
                r=math.sqrt((dx/0.194)**2+(dz/0.252)**2)
                fold=math.exp(-((r-1.0)/0.16)**2)
                upper=max(0.15,min(1.0,0.5+dz/0.35))
                vertex.co.y+=0.020*fold*upper
    for face in body.data.polygons:
        face.use_smooth = True
    body['construction'] = 'Continuous rounded gel body with pooled skirt'
    body.data.update()
    return body


# SECTION: face
def front_point(x,z,offset=0.0):
    body = bpy.data.objects['Specimen-Body']
    hit,p,normal,index = body.ray_cast(Vector((x,3,z)),Vector((0,-1,0)))
    if not hit:
        raise ValueError('No body beneath surface feature: '+str((x,z)))
    return (x,p.y+offset,z)


def build_face():
    for label,sign in [('Left',-1),('Right',1)]:
        cx,cz = sign*0.285,SOLE+EYE_HEIGHT
        sides,rings = 64,12
        outline = [(0.0,0.0)]
        for ring in range(1,rings+1):
            r = ring/rings
            for j in range(sides):
                a = math.tau*j/sides
                dx = r*0.177*math.cos(a)*(1-0.10*math.sin(a))
                dz = r*0.225*math.sin(a)+sign*EYE_SLOPE*dx
                outline.append((dx,dz))
        vertices, faces = [],[]
        for dx,dz in outline:
            radius = math.sqrt((dx/0.177)**2+((dz-sign*EYE_SLOPE*dx)/0.225)**2)
            vertices.append(front_point(cx+dx,cz+dz,-0.008+0.043*max(0,1-radius*radius)))
        for j in range(sides):
            k = (j+1)%sides
            faces.append((0,1+j,1+k))
            for ring in range(rings-1):
                a,b = 1+ring*sides+j,1+ring*sides+k
                faces.append((a,b,b+sides,a+sides))
        count=len(vertices)
        vertices.extend(front_point(cx+dx,cz+dz,-0.032) for dx,dz in outline)
        faces.extend(tuple(count+i for i in reversed(face)) for face in list(faces))
        start=1+(rings-1)*sides
        for j in range(sides):
            a,b = start+j,start+(j+1)%sides
            faces.append((a,a+count,b+count,b))
        obj=mesh_object('Specimen-Eye-'+label,vertices,faces)
        activate(obj)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')
    return [bpy.data.objects['Specimen-Eye-'+label] for label in ('Left','Right')]


# SECTION: details
def build_details():
    # Broad, irregular plumes vary in width and depth rather than forming helices.
    plumes=[[
        (-0.26,-0.03,0.18,0.002),(-0.19,0.05,0.36,0.105),
        (0.02,-0.04,0.55,0.155),(0.18,0.02,0.78,0.105),
        (0.08,0.06,1.00,0.155),(-0.12,0.02,1.23,0.095),
        (-0.08,-0.04,1.48,0.002)],
        [(0.24,0.05,0.21,0.002),(0.17,0.08,0.43,0.13),
        (-0.05,0.11,0.65,0.085),(-0.23,0.06,0.89,0.13),
        (-0.18,-0.03,1.12,0.085),(0.04,-0.02,1.38,0.002)],
        [(-0.33,-0.10,0.34,0.002),(-0.27,-0.12,0.57,0.10),
        (-0.06,-0.12,0.79,0.12),(0.20,-0.10,0.99,0.09),
        (0.25,-0.08,1.25,0.002)]]
    cores=[]
    for plume in plumes:
        points=[(x,y,SOLE+z,r) for x,y,z,r in plume]
        cores.append(tube('Acid-Plume',points,sides=24,steps=8,depth=0.72))
    join_objects(cores,'Specimen-Acid-Core')
    # Fine, varying-depth current paths sit below the gel surface.
    paths=[[(0.06,0.16),(-0.04,0.30),(0.04,0.43),(-0.02,0.53),
            (0.04,0.65),(0.11,0.76),(0.04,0.90),(-0.01,1.02),
            (0.025,1.17),(-0.025,1.29),(0.02,1.45)],
           [(0.04,0.65),(0.19,0.72),(0.23,0.83),(0.35,0.87),(0.43,1.01)],
           [(-0.02,0.53),(-0.15,0.59),(-0.22,0.72),(-0.34,0.77),(-0.46,0.86)],
           [(0.04,0.43),(0.19,0.36),(0.23,0.25),(0.35,0.18)]]
    bolts=[]
    for branch,path in enumerate(paths):
        points=[]
        for i,(x,z) in enumerate(catmull(path,4)):
            x+=0.011*math.sin(i*2.1+branch)
            z+=0.007*math.sin(i*2.8)
            depth=-0.043-0.016*math.sin(i*0.73+branch)**2
            r=(0.0026 if branch==0 else 0.0017)*(0.72+0.28*math.sin(i*0.91)**2)
            taper=min(1.0,(i+1)/3,(len(path)*4-i)/3)
            points.append((*front_point(x,SOLE+z,depth),max(0.0006,r*taper)))
        bolts.append(tube('Subdermal-Current',points,sides=8,steps=1))
    join_objects(bolts,'Specimen-Electric-Veins')


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
    gel,bsdf=material('Specimen-Turquoise-Gel',(0.022,0.14,0.13),0.19,transmission=0.78)
    bsdf.inputs['Coat Weight'].default_value=0.24
    bsdf.inputs['Coat Roughness'].default_value=0.18
    bsdf.inputs['Subsurface Weight'].default_value=0.04
    bsdf.inputs['Subsurface Radius'].default_value=(0.06,0.14,0.10)
    eye,eye_bsdf=material('Specimen-Obsidian-Eyes',(0.0015,0.006,0.008),0.14)
    eye_bsdf.inputs['Coat Weight'].default_value=0.20
    acid,acid_bsdf=material('Specimen-Luminous-Acid',(0.035,0.22,0.025),0.28,emission=0.40,transmission=0.75)
    acid_bsdf.inputs['Coat Weight'].default_value=0.04
    acid_bsdf.inputs['Subsurface Weight'].default_value=0.12
    electric,electric_bsdf=material('Specimen-Golden-Discharge',(1.0,0.49,0.012),0.32,emission=4.0)
    hot,hot_bsdf=material('Specimen-Charged-Junctions',(1.0,0.64,0.045),0.32,emission=7.0)
    for obj in bpy.data.collections[CHARACTER].objects:
        if obj.type!='MESH':
            continue
        mat=gel
        if 'Eye-' in obj.name: mat=eye
        elif 'Acid-Core' in obj.name: mat=acid
        elif 'Electric-' in obj.name: mat=electric
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        if obj.name=='Specimen-Electric-Veins':
            obj.data.materials.append(hot)
            for face in obj.data.polygons:
                p=face.center
                face.material_index=1 if any((p.x-x)**2+(p.z-SOLE-z)**2<0.027**2
                    for x,z in [(0.04,0.65),(-0.02,0.53),(0.04,0.43)]) else 0
    # Colour is stored on vertices so the flow pattern survives the GLB export.
    colour_node=gel.node_tree.nodes.new('ShaderNodeVertexColor')
    colour_node.layer_name='SpecimenFlow'
    gel.node_tree.links.new(colour_node.outputs['Color'],bsdf.inputs['Base Color'])
    for name in ('Specimen-Body',):
        obj=bpy.data.objects[name]
        attr=obj.data.color_attributes.new(name='SpecimenFlow',type='FLOAT_COLOR',domain='POINT')
        obj.data.color_attributes.active_color=attr
        for vertex in obj.data.vertices:
            x,y,z=vertex.co
            h=z-SOLE
            wave=math.sin(7*x+4*h+1.5*math.sin(h*5+y*4))
            wave+=0.40*math.sin(13*x-8*h+3*y)
            front=max(0.0,min(1.0,(y+0.15)*1.8))
            flow=max(0.0,min(1.0,(wave-0.10)*0.9))*front
            t=flow*0.28
            cyan=(0.022,0.14,0.13)
            green=(0.035,0.22,0.050)
            attr.data[vertex.index].color=tuple(cyan[i]*(1-t)+green[i]*t for i in range(3))+(1.0,)


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
    return Vector((x+sign*0.060*(h/1.7)**1.6,
                   y+0.009*math.sin(h*4)*h/1.7,z))


def build_morphs():
    spatial=('Breathe','Squash','Stretch','WobbleLeft','WobbleRight')
    for obj in bpy.data.collections[CHARACTER].objects:
        if obj.type!='MESH':
            continue
        obj.shape_key_add(name='Basis')
        basis=[vertex.co.copy() for vertex in obj.data.vertices]
        for name in spatial:
            key=obj.shape_key_add(name=name)
            for vertex,point in zip(key.data,basis):
                vertex.co=deform_spatial(point,name)
        if obj.name=='Specimen-Body' or 'Eye-' in obj.name:
            for name in ('Blink','Curious','Focus'):
                key=obj.shape_key_add(name=name)
                for i,point in enumerate(basis):
                    x,y,z=point
                    if 'Eye-' in obj.name:
                        sign=-1 if 'Left' in obj.name else 1
                        dx=x-sign*0.285
                        cz=SOLE+EYE_HEIGHT
                        local_z=z-cz-sign*EYE_SLOPE*dx
                        if name=='Blink':
                            nz=cz+sign*EYE_SLOPE*dx+local_z*0.10
                        elif name=='Curious':
                            nz=cz+sign*0.25*dx+local_z*1.06
                        else:
                            nz=cz+sign*0.56*dx+local_z*0.79
                        radius=math.sqrt((dx/0.177)**2+(local_z/0.225)**2)
                        offset=(-0.008+0.043*max(0,1-radius*radius)) if i<len(basis)//2 else -0.032
                        key.data[i].co=front_point(x,nz,offset)
                    elif y>0.15:
                        for sign in (-1,1):
                            dx=x-sign*0.285
                            dz=z-SOLE-EYE_HEIGHT-sign*EYE_SLOPE*dx
                            r=math.sqrt((dx/0.194)**2+(dz/0.252)**2)
                            fold=math.exp(-((r-1.0)/0.19)**2)
                            factor={'Blink':0.008,'Curious':-0.004,'Focus':0.012}[name]
                            key.data[i].co.y+=factor*fold
        if obj.name=='Specimen-Acid-Core':
            key=obj.shape_key_add(name='Flow')
            for vertex,point in zip(key.data,basis):
                x,y,z=point
                h=z-SOLE
                a=0.20*math.sin(h*4.8)
                vertex.co=(x*math.cos(a)-y*math.sin(a)+0.020*math.sin(h*5),
                           x*math.sin(a)+y*math.cos(a)+0.015*math.cos(h*4),
                           z+0.015*math.sin(h*6+x*3))
        if obj.name in ('Specimen-Acid-Core','Specimen-Electric-Veins'):
            key=obj.shape_key_add(name='Charge')
            for i,point in enumerate(basis):
                if obj.name=='Specimen-Acid-Core':
                    key.data[i].co=(point.x*1.08,point.y*1.06+0.015,point.z)
                else:
                    key.data[i].co=point+obj.data.vertices[i].normal*0.0015
        obj.data.shape_keys.name=obj.name+'-Morphs'
    bpy.data.objects['The Specimen']['morphs']='Breathe, Squash, Stretch, WobbleLeft, WobbleRight, Blink, Curious, Focus, Flow, Charge'


def animation_curves(clip):
    if clip=='Idle':
        return {
            'Breathe':[(1,0),(31,1),(61,0),(91,1),(121,0)],
            'WobbleLeft':[(1,0),(29,0.22),(61,0),(97,0.12),(121,0)],
            'WobbleRight':[(1,0),(49,0.16),(81,0.20),(121,0)],
            'Curious':[(1,0),(25,0.50),(65,0.30),(89,0),(121,0)],
            'Blink':[(1,0),(47,0),(50,1),(53,0),(99,0),(102,1),(105,0),(121,0)],
            'Flow':[(1,0),(31,0.7),(61,1),(91,0.35),(121,0)],
        }
    if clip=='Settle':
        return {
            'Squash':[(1,0),(5,0.9),(12,0),(21,0.25),(32,0),(49,0)],
            'Stretch':[(1,0),(5,0),(13,0.4),(22,0),(30,0.08),(49,0)],
            'WobbleLeft':[(1,0),(5,0.05),(12,0.60),(21,0),(32,0.14),(49,0)],
            'WobbleRight':[(1,0),(12,0),(22,0.45),(32,0),(40,0.07),(49,0)],
            'Flow':[(1,0),(11,0.7),(27,0.3),(49,0)],
        }
    return {
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
    for name,base in [('Specimen-Golden-Discharge',4.0),('Specimen-Charged-Junctions',7.0)]:
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
    mesh_object('Specimen-Studio-Floor',[(-200,-200,SOLE-0.008),(200,-200,SOLE-0.008),
        (200,200,SOLE-0.008),(-200,200,SOLE-0.008)],[(0,1,2,3)],STUDIO).data.materials.append(mat)
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
    camera_data.ortho_scale=3.05
    camera.location=(4.0,8.0,2.0)
    aim(camera,(0,0,0.40))
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
    directions={'hero':(3.2,8,1.65),'front':(0,8,0.0),'side':(8,0,0.0),
                'back':(0,-8,0.0)}
    space.region_3d.view_rotation=Vector(directions[view]).to_track_quat('Z','Y')
    space.region_3d.view_location=(0,0.1,0.40)
    space.region_3d.view_perspective='ORTHO'
    space.region_3d.view_distance=3.5
    if update:
        space.region_3d.update()
        area.tag_redraw()
    return {'view':view,'distance':space.region_3d.view_distance}
