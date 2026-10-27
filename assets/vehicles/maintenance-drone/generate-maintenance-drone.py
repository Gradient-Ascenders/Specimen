"""Volt's utility drone: metres, game Y-up, -Z forward.

Editable source parts are grouped into shared-finish GLB batches at export.
The four inner rotors share one mesh; guards and the rider cradle stay fixed.
Gameplay owns the original 1.65 x .5 x 1.65 collider and +.72 rider anchor.
"""
import bpy
import bmesh
import math
from mathutils import Vector

HERE = __file__[:max(__file__.rfind('/'), __file__.rfind('\\'))]
PREFIX = 'MD_'
SCENE = 'Blackout / Maintenance Drone'
PALETTE = {
    'Paint': ((.64, .39, .055), .72, .28),
    'Graphite': ((.032, .047, .048), .75, .45),
    'Alloy': ((.29, .37, .36), .47, .72),
    'Rubber': ((.018, .024, .021), .92, .03),
    'Copper': ((.37, .19, .060), .65, .64),
    'Mark': ((.73, .77, .62), .81, .05),
    'LampA': ((.94, .51, .055), .36, .0),
    'LampB': ((.94, .51, .055), .36, .0),
    'Lens': ((.17, .24, .21), .22, .2),
}


def xyz(v):
    return (v[0], -v[2], v[1])


def setup():
    scene = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene
    for obj in list(scene.objects):
        if obj.name.startswith(PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.lights, bpy.data.cameras):
        for data in list(blocks):
            if data.name.startswith(PREFIX) and not data.users:
                blocks.remove(data)
    scene.unit_settings.system = 'METRIC'
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.get(PREFIX+'World') or bpy.data.worlds.new(PREFIX+'World')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.10, .13, .15, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .4
    scene.world = world
    root = bpy.data.objects.new(PREFIX+'Drone', None)
    root['asset'] = 'maintenance-drone-v1'
    root['visualOnly'] = True
    root['riderSoleY'] = .27
    scene.collection.objects.link(root)
    for name, (tint, rough, metal) in PALETTE.items():
        material = bpy.data.materials.new(PREFIX+name)
        material.diffuse_color = (*tint, 1)
        material.use_nodes = True
        material.use_backface_culling = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*tint, 1)
        shader.inputs['Roughness'].default_value = rough
        shader.inputs['Metallic'].default_value = metal
        vertex = material.node_tree.nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = 'wear'
        multiply = material.node_tree.nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[1].default_value = (*tint, 1)
        material.node_tree.links.new(vertex.outputs['Color'], multiply.inputs[2])
        material.node_tree.links.new(multiply.outputs[0], shader.inputs['Base Color'])
        if name.startswith('Lamp'):
            shader.inputs['Emission Color'].default_value = (*tint, 1)
            shader.inputs['Emission Strength'].default_value = .3
    print('Separate utility-drone studio ready.')


def mesh(name, vertices, faces, finish, owner='Frame', bevel=0):
    data = bpy.data.meshes.new(PREFIX+name)
    data.from_pydata([xyz(p) for p in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
    if all(edge.is_manifold for edge in bm.edges):
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bevel:
        bmesh.ops.bevel(bm, geom=[edge for edge in bm.edges if edge.is_manifold],
                        offset=bevel, segments=1, affect='EDGES', clamp_overlap=True)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    uv = data.uv_layers.new(name='MetricUV')
    wear = data.color_attributes.new(name='wear', type='FLOAT_COLOR', domain='POINT')
    for v in data.vertices:
        shade = .82+.18*(.5+.5*math.sin(v.co.x*23+v.co.y*17+v.co.z*31))
        wear.data[v.index].color = (shade, shade, shade, 1)
    for polygon in data.polygons:
        components = [abs(value) for value in polygon.normal]
        axis = components.index(max(components))
        for i in polygon.loop_indices:
            p = data.vertices[data.loops[i].vertex_index].co
            a, b = (p.y,p.z) if axis == 0 else (p.x,p.z) if axis == 1 else (p.x,p.y)
            uv.data[i].uv = (a/1.4,b/1.4)
    data.materials.append(bpy.data.materials[PREFIX+finish])
    obj = bpy.data.objects.new(PREFIX+name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = bpy.data.objects[PREFIX+'Drone']
    obj['finish'] = finish
    obj['owner'] = owner
    return obj


def prism(name, outline, bottom, top, finish, owner='Frame', bevel=0):
    n = len(outline)
    vertices = [(x,y,z) for y in (bottom,top) for x,z in outline]
    faces = [tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    return mesh(name,vertices,faces,finish,owner,bevel)


def box(name, size, at, finish, bevel=0):
    x,y,z = at
    a,b,c = [v/2 for v in size]
    return prism(name,[(x-a,z-c),(x+a,z-c),(x+a,z+c),(x-a,z+c)],y-b,y+b,finish,bevel=bevel)


def ring(name, at, profile, finish, sides=24):
    x,y,z = at
    vertices = [(x+r*math.cos(math.tau*i/sides),y+h,z+r*math.sin(math.tau*i/sides))
                for r,h in profile for i in range(sides)]
    faces = []
    for p in range(len(profile)):
        q = (p+1)%len(profile)
        for i in range(sides):
            j = (i+1)%sides
            faces.append((p*sides+i,p*sides+j,q*sides+j,q*sides+i))
    return mesh(name,vertices,faces,finish)


def cylinder(name, at, radius, height, finish, sides=16, owner='Frame'):
    x,y,z = at
    outline = [(x+radius*math.cos(math.tau*i/sides),z+radius*math.sin(math.tau*i/sides)) for i in range(sides)]
    return prism(name,outline,y-height/2,y+height/2,finish,owner)


def build_hull():
    outline = [(-.25,-.73),(.25,-.73),(.25,-.41),(.41,-.25),(.73,-.25),
               (.73,.25),(.41,.25),(.25,.41),(.25,.73),(-.25,.73),
               (-.25,.41),(-.41,.25),(-.73,.25),(-.73,-.25),(-.41,-.25),(-.25,-.41)]
    prism('Armoured_chassis',outline,-.045,.195,'Paint',bevel=.026)
    # Four arm undersides, with a clear central aperture for the real spotlight.
    for side in [-1,1]:
        box('Battery_'+str(side),(.32,.13,.37),(side*.535,-.115,0),'Graphite',.022)
        box('Battery_end_'+str(side),(.075,.10,.28),(side*.735,-.115,0),'Copper',.012)
        box('Bumper_'+str(side),(.40,.12,.065),(0,.04,side*.755),'Rubber',.02)
        box('Service_cartridge_'+str(side),(.33,.13,.22),(0,-.115,side*.52),'Graphite',.018)
        for z in [-.095,0,.095]:
            box('Battery_latch_'+str(side)+'_'+str(z),(.035,.045,.046),(side*.772,-.08,z),'Alloy',.006)
        for x in [-.11,.11]:
            # Slim skids stop at the original collision bottom: -.25 m.
            box('Landing_strut_'+str(side)+'_'+str(x),(.035,.08,.035),(x,-.18,side*.54),'Alloy',.005)
        box('Landing_shoe_'+str(side),(.38,.035,.095),(0,-.2325,side*.54),'Rubber',.012)
    box('Front_instrument_recess',(.33,.11,.022),(0,.05,-.768),'Graphite',.009)
    for x in [-.105,-.035,.035,.105]:
        box('Front_vent_'+str(x),(.019,.065,.018),(x,.05,-.786),'Alloy',.003)
    # Readable service seams; solid plates stand clear of the base skin.
    for side in [-1,1]:
        box('Arm_cover_'+str(side),(.20,.018,.34),(side*.6,.213,0),'Alloy',.007)
        for x in [-.065,.065]:
            box('Rear_contact_'+str(side)+'_'+str(x),(.034,.055,.022),(x,.05,side*.788),'LampA' if side<0 else 'LampB',.005)
    print('Chisel chassis, batteries, landing shoes and service fittings built.')


def build_fans():
    for i,(x,z) in enumerate([(-.53,-.53),(.53,-.53),(-.53,.53),(.53,.53)]):
        ring('Duct_'+str(i),(x,0,z),[(.204,-.10),(.253,-.10),(.275,-.065),
             (.275,.19),(.258,.227),(.206,.227),(.192,.202),(.192,-.065)],'Graphite')
        ring('Rim_'+str(i),(x,0,z),[(.214,.232),(.253,.232),(.260,.244),
             (.250,.259),(.215,.259),(.209,.249)],'Alloy')
        # Guard bars are fixed, well above the independent swept rotor.
        for j in range(3):
            angle=j*math.tau/3
            outline=[]
            for r,t in [(.06,-.012),(.225,-.012),(.225,.012),(.06,.012)]:
                outline.append((x+r*math.cos(angle)-t*math.sin(angle),z+r*math.sin(angle)+t*math.cos(angle)))
            prism('Guard_'+str(i)+'_'+str(j),outline,.228,.247,'Alloy')
        cylinder('Motor_cap_'+str(i),(x,.242,z),.057,.045,'Paint')
        owner='Rotor_'+str(i)
        # Rotors are authored around the same local axis, positioned at export.
        cylinder(owner+'_hub',(0,.122,0),.047,.055,'Alloy',owner=owner)
        for j in range(5):
            angle=j*math.tau/5
            outline=[]
            for r,t in [(.046,-.019),(.165,-.042),(.180,-.012),(.091,.024),(.046,.017)]:
                outline.append((r*math.cos(angle)-t*math.sin(angle),r*math.sin(angle)+t*math.cos(angle)))
            prism(owner+'_blade_'+str(j),outline,.112,.127,'Alloy',owner)
        for child in bpy.data.objects[PREFIX+'Drone'].children:
            if child.get('owner') == owner:
                child.location=xyz((x,0,z))
    print('Four fixed ducts, guard cages and separate five-blade rotors built.')


def build_cradle():
    cylinder('Rider_saddle',(0,.221,0),.367,.098,'Rubber',32)
    # The +.27 m saddle top meets Volt's existing +.72 anchor minus .45 radius.
    ring('Rider_collar',(0,0,0),[(.374,.20),(.443,.20),(.460,.23),
         (.448,.267),(.380,.267)],'Alloy',32)
    ring('Rider_contact_band',(0,0,0),[(.303,.273),(.341,.273),(.341,.280),(.303,.280)],'Copper',32)
    # Small raised anti-slip ribs, inset from the collar. Real depth separation.
    for side in [-1,1]:
        for z in [-.12,-.06,0,.06,.12]:
            box('Saddle_grip_'+str(side)+'_'+str(z),(.09,.008,.018),(side*.22,.276,z),'Graphite',.002)
        # Solid enamel warning inlays, no transparent decals or textures.
        for k in range(3):
            outline=[(-.18+k*.11,side*.622),(-.125+k*.11,side*.622),
                     (-.080+k*.11,side*.695),(-.135+k*.11,side*.695)]
            prism('Hazard_'+str(side)+'_'+str(k),outline,.205,.214,'Graphite')
    print('Gel cradle aligned to protected rider anchor; compact hazard enamel added.')


def build_light():
    ring('Searchlight_yoke',(0,0,0),[(.17,-.05),(.26,-.05),(.294,-.12),
         (.253,-.222),(.177,-.222)],'Graphite')
    ring('Searchlight_bezel',(0,0,0),[(.151,-.212),(.226,-.212),(.226,-.245),(.151,-.245)],'Alloy')
    cylinder('Searchlight_optic',(0,-.232,0),.144,.012,'Lens',24)
    print('Downward searchlight housing leaves the existing beam origin unobstructed.')


def preview():
    scene=bpy.context.scene
    box('Studio_floor',(200,.05,200),(0,-.285,0),'Graphite')
    floor=bpy.data.objects[PREFIX+'Studio_floor'];floor.parent=None;floor['previewOnly']=True
    for name,eye,energy,size,tint in [
        ('Key',(-2,3,-2),150,4,(1,.87,.67)),
        ('Fill',(2,1,-1),75,3,(.58,.77,1)),
        ('Rim',(0,2,3),180,2,(.8,.9,1)),
    ]:
        data=bpy.data.lights.new(PREFIX+'Studio_'+name,'AREA')
        data.energy=energy;data.shape='DISK';data.size=size;data.color=tint
        obj=bpy.data.objects.new(PREFIX+'Studio_'+name,data);scene.collection.objects.link(obj)
        obj.location=xyz(eye);obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
        obj['previewOnly']=True
    data=bpy.data.cameras.new(PREFIX+'Studio_camera')
    camera=bpy.data.objects.new(PREFIX+'Studio_camera',data)
    scene.collection.objects.link(camera)
    camera.location=xyz((2.1,2.1,-2.5))
    camera.rotation_euler=(Vector(xyz((0,.02,0)))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.lens=60;camera['previewOnly']=True;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=1000;scene.render.resolution_y=760;scene.render.resolution_percentage=100
    frame()


def frame(eye=(2.1,2.1,-2.5),target=(0,.02,0)):
    area=next(a for a in bpy.context.window.screen.areas if a.type=='VIEW_3D')
    space=area.spaces.active;space.clip_start=.01;space.clip_end=200;space.lens=60
    space.shading.type='MATERIAL';space.overlay.show_overlays=False
    direction=Vector(xyz(target))-Vector(xyz(eye))
    space.region_3d.view_rotation=direction.to_track_quat('-Z','Y')
    space.region_3d.view_location=xyz(target);space.region_3d.view_distance=direction.length
    space.region_3d.view_perspective='PERSP'
    if not bpy.app.background:space.region_3d.update()


def export_asset():
    source=bpy.data.objects[PREFIX+'Drone'];source.name=PREFIX+'Editable'
    root=bpy.data.objects.new(PREFIX+'Drone',None)
    root['asset']='maintenance-drone-v1';root['riderSoleY']=.27;root['visualOnly']=True
    bpy.context.scene.collection.objects.link(root)
    owned=[]
    try:
        groups={}
        for child in list(source.children):
            if child.type!='MESH':continue
            obj=child.copy();obj.data=child.data.copy();owned.append(obj.data)
            bpy.context.scene.collection.objects.link(obj);obj.parent=root
            groups.setdefault((obj['owner'],obj['finish']),[]).append(obj)
        rotors=[]
        for (owner,finish),objects in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            obj=bpy.context.view_layer.objects.active;obj.name=PREFIX+owner+'_'+finish
            obj['owner']=owner;obj['finish']=finish;owned.append(obj.data)
            if owner.startswith('Rotor_'):
                rotors.append(obj)
                i=int(owner.split('_')[1]);x,z=[(-.53,-.53),(.53,-.53),(-.53,.53),(.53,.53)][i]
                obj.location=xyz((x,0,z))
        # One shared GPU mesh, four independent transform nodes.
        for obj in rotors[1:]:obj.data=rotors[0].data
        bpy.ops.object.select_all(action='DESELECT')
        root.select_set(True)
        for obj in root.children:obj.select_set(True)
        bpy.context.view_layer.objects.active=root
        bpy.ops.export_scene.gltf(filepath=HERE+'/maintenance-drone.glb',export_format='GLB',
            use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,
            export_cameras=False,export_lights=False,export_animations=False,export_materials='PLACEHOLDER')
    finally:
        for obj in list(root.children):bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.objects.remove(root,do_unlink=True)
        for data in set(owned):
            if not data.users:bpy.data.meshes.remove(data)
        source.name=PREFIX+'Drone'
    # Editable studio rotors occupy their actual cradle-adjacent positions too.
    for child in source.children:
        if child.get('owner','').startswith('Rotor_'):
            i=int(child['owner'].split('_')[1]);x,z=[(-.53,-.53),(.53,-.53),(-.53,.53),(.53,.53)][i]
            child.location=xyz((x,0,z))
    print('Exported geometry only, excluding studio lights and floor.')


def save_source():
    old=bpy.context.preferences.filepaths.save_version
    try:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=HERE+'/maintenance-drone.blend',copy=True)
    finally:bpy.context.preferences.filepaths.save_version=old


if __name__=='__main__':
    setup()
    build_hull()
    build_fans()
    build_cradle()
    build_light()
    preview()
    export_asset()
    save_source()
