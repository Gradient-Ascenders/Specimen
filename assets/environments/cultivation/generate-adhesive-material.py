"""Editable material studio for the shared Rooms 1/2 biofilm finish.

Inputs are rebuilt by scripts/prepare-cultivation-adhesive-studio.ts. The room
controller supplies the review geometry; this studio is never a runtime export.
"""
import bpy
import json
import math
import sys
from mathutils import Vector

HERE=__file__[:max(__file__.rfind('/'),__file__.rfind('\\'))]
INPUT=HERE+'/../../../artifacts/evidence/cultivation-blender/adhesive-revision/studio-input'

def build_studio(attributes):
    scene=bpy.context.scene;scene.name='Cultivation / adhesive material'
    for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
    scene.unit_settings.system='METRIC'
    material=bpy.data.materials.new('Cultivation_Cultured_Biofilm');material.use_nodes=True
    material.diffuse_color=(.34,.49,.37,1);material.use_backface_culling=True
    material['runtime']='createCultivationBiofilmMaterial';material['tileMetres']=4
    material['scope']='Rooms 1/2 only; opaque surface, no displacement or extra lights'
    nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
    output=nodes.new('ShaderNodeOutputMaterial');output.location=(1080,120)
    shader=nodes.new('ShaderNodeBsdfPrincipled');shader.location=(800,120)
    shader.inputs['Metallic'].default_value=0;shader.inputs['Emission Color'].default_value=(.04,.26,.16,1)
    shader.inputs['Emission Strength'].default_value=.14
    links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    uv=nodes.new('ShaderNodeTexCoord');uv.location=(-950,100)
    images={}
    for role,y in [('albedo',350),('roughness',50),('normal',-250)]:
        image=bpy.data.images.load(INPUT+'/'+role+'.tga',check_existing=False)
        image.colorspace_settings.name='sRGB' if role=='albedo' else 'Non-Color';image.pack()
        node=nodes.new('ShaderNodeTexImage');node.name='Biofilm_'+role;node.label=role
        node.image=image;node.extension='REPEAT';node.location=(-700,y)
        links.new(uv.outputs['UV'],node.inputs['Vector']);images[role]=node
    edge=nodes.new('ShaderNodeVertexColor');edge.layer_name='Edge';edge.location=(-680,-520)
    separate=nodes.new('ShaderNodeSeparateColor');separate.location=(-460,-520)
    links.new(edge.outputs['Color'],separate.inputs['Color'])
    ramp=nodes.new('ShaderNodeValToRGB');ramp.name='Dried_Perimeter';ramp.location=(-220,-470)
    ramp.color_ramp.interpolation='EASE';ramp.color_ramp.elements[0].position=.09
    ramp.color_ramp.elements[0].color=(1,1,1,1);ramp.color_ramp.elements[1].position=.26
    ramp.color_ramp.elements[1].color=(0,0,0,1);links.new(separate.outputs['Red'],ramp.inputs['Fac'])
    crust=nodes.new('ShaderNodeMixRGB');crust.name='Dried_Edge_Pigment';crust.blend_type='MULTIPLY'
    crust.location=(160,320);crust.inputs[2].default_value=(.70,.72,.51,1)
    amount=nodes.new('ShaderNodeMath');amount.operation='MULTIPLY';amount.inputs[1].default_value=.72;amount.location=(-20,230)
    links.new(ramp.outputs['Color'],amount.inputs[0]);links.new(amount.outputs[0],crust.inputs[0]);links.new(images['albedo'].outputs['Color'],crust.inputs[1])
    links.new(crust.outputs[0],shader.inputs['Base Color'])
    emission=nodes.new('ShaderNodeMixRGB');emission.blend_type='MULTIPLY';emission.inputs[0].default_value=1
    emission.inputs[2].default_value=(.04,.26,.16,1);emission.location=(460,-250)
    links.new(images['albedo'].outputs['Color'],emission.inputs[1]);links.new(emission.outputs[0],shader.inputs['Emission Color'])
    rough=nodes.new('ShaderNodeMath');rough.operation='MULTIPLY';rough.inputs[1].default_value=.80;rough.location=(-100,20)
    links.new(images['roughness'].outputs['Color'],rough.inputs[0])
    dry=nodes.new('ShaderNodeMixRGB');dry.name='Wet_Interior_Dry_Edge';dry.location=(380,20);dry.inputs[2].default_value=(.94,.94,.94,1)
    links.new(ramp.outputs[0],dry.inputs[0]);links.new(rough.outputs[0],dry.inputs[1]);links.new(dry.outputs[0],shader.inputs['Roughness'])
    normal=nodes.new('ShaderNodeNormalMap');normal.name='Folded_Veins_Normal';normal.inputs['Strength'].default_value=.62
    normal.location=(360,-500);links.new(images['normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],shader.inputs['Normal'])
    positions=attributes['position'];count=len(positions)//3
    vertices=[(positions[i],-positions[i+2],positions[i+1]) for i in range(0,len(positions),3)]
    data=bpy.data.meshes.new('Production_Room_2_Adhesive_Union');data.from_pydata(vertices,[],[tuple(range(i,i+3)) for i in range(0,count,3)]);data.update()
    obj=bpy.data.objects.new('Production_Adhesive_Surface',data);scene.collection.objects.link(obj);data.materials.append(material)
    obj['reviewOnly']=True;obj['collisionUnchanged']=True
    tex=data.uv_layers.new(name='MetricUV');edge=data.color_attributes.new(name='Edge',type='FLOAT_COLOR',domain='POINT')
    for poly in data.polygons:
        for loop in poly.loop_indices:
            i=data.loops[loop].vertex_index;tex.data[loop].uv=attributes['uv'][i*2:i*2+2]
    for i in range(count):
        a,b,w,h=attributes['membranePanel'][i*4:i*4+4];d=max(0,min(1,a,b,w-a,h-b))
        edge.data[i].color=(d,d,d,1)
    world=bpy.data.worlds.new('Adhesive_Studio_Preview');scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
    # Preview-only lighting; this file has no GLB/runtime export path.
    for name,at,power,size in [('Key',(-13,-12,13),1700,8),('Fill',(-14,-20,7),900,6)]:
        light=bpy.data.lights.new('Preview_'+name,'AREA');light.energy=power;light.shape='DISK';light.size=size
        node=bpy.data.objects.new(light.name,light);scene.collection.objects.link(node);node.location=at
        node.rotation_euler=(Vector((-18.63,-15,8))-node.location).to_track_quat('-Z','Y').to_euler();node['previewOnly']=True
    frame((-15.5,-13.2,7.0),(-18.63,-15,7.8))

def frame(eye,target):
    area=next(a for a in bpy.context.window_manager.windows[0].screen.areas if a.type=='VIEW_3D');space=area.spaces.active
    space.shading.type='MATERIAL';space.overlay.show_overlays=False;space.clip_end=300;space.lens=40
    eye=Vector(eye);target=Vector(target);direction=target-eye
    space.region_3d.view_rotation=direction.to_track_quat('-Z','Y');space.region_3d.view_perspective='PERSP'
    space.region_3d.view_location=target;space.region_3d.view_distance=direction.length
    if not bpy.app.background:space.region_3d.update()

if '--build-adhesive-studio' in sys.argv:
    build_studio(json.load(open(INPUT+'/route.json',encoding='utf8'))['attributes'])
    bpy.ops.wm.save_as_mainfile(filepath=HERE+'/adhesive-material.blend',compress=True)
