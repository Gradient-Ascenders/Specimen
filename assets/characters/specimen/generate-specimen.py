"""Rebuild the reviewed Specimen sculpt in an independent Blender process.

blender --background --factory-startup --python assets/characters/specimen/generate-specimen.py
Append -- --render to also produce four studio views.
"""

import hashlib
import json
import struct
from pathlib import Path
import sys

import bpy
import bmesh

DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(DIRECTORY))
import specimen_model as model


def rebase_clip_times(path):
    """Rebase clips after export; Blender 5.2's pointer-track sliding raises KeyError."""
    payload=path.read_bytes()
    json_size,kind=struct.unpack_from('<II',payload,12)
    assert kind==0x4E4F534A
    document=json.loads(payload[20:20+json_size])
    binary_start=20+json_size
    binary_size,kind=struct.unpack_from('<II',payload,binary_start)
    assert kind==0x004E4942
    binary=bytearray(payload[binary_start+8:binary_start+8+binary_size])
    # Pointer export omits these rest factors in Blender 5.2. Preserve visible
    # emission before playback and provide concrete properties for the pointers.
    for material in document.get('materials',[]):
        name=material['name']
        extension=material.get('extensions',{}).get('KHR_materials_emissive_strength')
        if name in ('Specimen-Golden-Discharge','Specimen-Charged-Junctions'):
            node=bpy.data.materials[name].node_tree.nodes.get('Principled BSDF')
            material['emissiveFactor']=list(node.inputs['Emission Color'].default_value[:3])
            material['extensions']['KHR_materials_emissive_strength']['emissiveStrength']=4.0 if name=='Specimen-Golden-Discharge' else 7.0
        elif extension=={}:
            del material['extensions']['KHR_materials_emissive_strength']
    for clip in document['animations']:
        inputs=sorted({sampler['input'] for sampler in clip['samplers']})
        times={}
        for index in inputs:
            accessor=document['accessors'][index]
            assert accessor['componentType']==5126 and accessor['type']=='SCALAR'
            view=document['bufferViews'][accessor['bufferView']]
            offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)
            stride=view.get('byteStride',4)
            times[index]=[struct.unpack_from('<f',binary,offset+i*stride)[0]
                          for i in range(accessor['count'])]
        start=min(min(values) for values in times.values())
        replacements={}
        for index,values in times.items():
            normalized=[max(0.0,value-start) for value in values]
            while len(binary)%4:
                binary.append(0)
            view_index=len(document['bufferViews'])
            document['bufferViews'].append({'buffer':0,'byteOffset':len(binary),
                                          'byteLength':len(values)*4})
            binary.extend(struct.pack('<'+'f'*len(normalized),*normalized))
            accessor_index=len(document['accessors'])
            document['accessors'].append({'bufferView':view_index,'componentType':5126,
                                         'count':len(values),'type':'SCALAR',
                                         'min':[min(normalized)],'max':[max(normalized)]})
            replacements[index]=accessor_index
        for sampler in clip['samplers']:
            sampler['input']=replacements[sampler['input']]
    document['buffers'][0]['byteLength']=len(binary)
    encoded=json.dumps(document,separators=(',',':')).encode()
    encoded+=b' '*((-len(encoded))%4)
    binary.extend(b'\0'*((-len(binary))%4))
    total=12+8+len(encoded)+8+len(binary)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,total)
                     +struct.pack('<II',len(encoded),0x4E4F534A)+encoded
                     +struct.pack('<II',len(binary),0x004E4942)+binary)


def topology(obj):
    mesh = obj.data
    # Apply consistent outward winding to all closed surfaces before export.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    mesh.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    non_manifold = sum(not edge.is_manifold for edge in bm.edges)
    winding = sum(not edge.is_contiguous for edge in bm.edges)
    volume = bm.calc_volume(signed=True)
    unseen = set(bm.verts)
    components = 0
    while unseen:
        components += 1
        stack = [unseen.pop()]
        while stack:
            vertex = stack.pop()
            for edge in vertex.link_edges:
                neighbour = edge.other_vert(vertex)
                if neighbour in unseen:
                    unseen.remove(neighbour)
                    stack.append(neighbour)
    bm.free()
    points = [(v.co.x, v.co.z, -v.co.y) for v in mesh.vertices]
    minimum_area = min(triangle.area for triangle in mesh.loop_triangles)
    assert non_manifold == 0, (obj.name, 'non-manifold', non_manifold)
    assert winding == 0 and volume > 0, (obj.name, winding, volume)
    assert minimum_area > 1e-13, (obj.name, 'degenerate', minimum_area)
    assert all(abs(value) < 1e-7 for value in obj.location), obj.name
    assert tuple(obj.scale) == (1,1,1), obj.name
    if obj.name == 'Specimen-Body':
        assert components == 1, 'Slime body must be continuous'
        assert abs(min(p[1] for p in points)-model.SOLE) < 1e-6
    signature = {
        'vertices': [[round(c,7) for c in point] for point in points],
        'triangles': [list(t.vertices) for t in mesh.loop_triangles],
    }
    return {
        'vertices': len(mesh.vertices),
        'triangles': len(mesh.loop_triangles),
        'connected_components': components,
        'non_manifold_edges': non_manifold,
        'inconsistent_winding_edges': winding,
        'signed_volume_m3': volume,
        'minimum_triangle_area_m2': minimum_area,
        'runtime_bounds_metres': {
            'minimum': [round(min(p[i] for p in points),6) for i in range(3)],
            'maximum': [round(max(p[i] for p in points),6) for i in range(3)],
        },
        'geometry_sha256': hashlib.sha256(json.dumps(signature,separators=(',',':')).encode()).hexdigest(),
    }


def render_views():
    scene = bpy.context.scene
    camera = scene.camera
    for name,position in [
        ('three-quarter',(4.0,8.0,2.0)),
        ('front',(0,8,1.3)),
        ('side',(8,0,1.3)),
        ('back',(0,-8,1.3)),
    ]:
        camera.location = position
        model.aim(camera,(0,0,0.40))
        scene.render.filepath = str(DIRECTORY/'evidence'/f'{name}.png')
        bpy.ops.render.render(write_still=True)
    camera.location = (4.0,8.0,2.0)
    model.aim(camera,(0,0,0.40))


def motion_report(character):
    report={}
    for obj in character:
        obj.data.calc_loop_triangles()
        triangles=[tuple(t.vertices) for t in obj.data.loop_triangles]
        keys=obj.data.shape_keys.key_blocks
        shapes={}
        for key in list(keys)[1:]:
            points=[vertex.co.copy() for vertex in key.data]
            minimum=min((points[b]-points[a]).cross(points[c]-points[a]).length/2
                        for a,b,c in triangles)
            volume=sum(points[a].dot(points[b].cross(points[c])) for a,b,c in triangles)/6
            assert minimum>1e-13 and volume>0,(obj.name,key.name,minimum,volume)
            shapes[key.name]={'signed_volume_m3':volume,'minimum_triangle_area_m2':minimum}
        report[obj.name]=shapes
    sampled=[]
    for frame in (1,31,50,61,102,121,141,145,153,163,189,211,241,259,263,266,283):
        bpy.context.scene.frame_set(frame)
        graph=bpy.context.evaluated_depsgraph_get()
        values={}
        for obj in character:
            evaluated=obj.evaluated_get(graph)
            mesh=evaluated.to_mesh()
            mesh.calc_loop_triangles()
            points=[vertex.co.copy() for vertex in mesh.vertices]
            volume=sum(points[t.vertices[0]].dot(points[t.vertices[1]].cross(points[t.vertices[2]]))
                       for t in mesh.loop_triangles)/6
            assert volume>0,(obj.name,frame,'inverted animated mesh')
            if obj.name=='Specimen-Body':
                assert abs(min(p.z for p in points)-model.SOLE)<1e-6,(frame,'sole moved')
            values[obj.name]={'signed_volume_m3':volume}
            evaluated.to_mesh_clear()
        sampled.append({'frame':frame,'meshes':values})
    bpy.context.scene.frame_set(1)
    return {'morphs':report,'sampled_animation_poses':sampled,
            'clips':{name:{'source_start':start,'source_end':end,'seconds':(end-start)/24}
                     for name,(start,end) in model.CLIPS.items()}}


def render_motion():
    scene=bpy.context.scene
    scene.render.resolution_percentage=48
    scene.cycles.samples=16
    scene.render.use_persistent_data=True
    directory=DIRECTORY/'evidence'/'motion-frames'
    directory.mkdir(exist_ok=True)
    frames=[]
    for clip,(start,end) in model.CLIPS.items():
        for frame in range(start,end,3):
            scene.frame_set(frame)
            filename=directory/f'{len(frames):04d}.png'
            scene.render.filepath=str(filename)
            bpy.ops.render.render(write_still=True)
            frames.append({'clip':clip,'source_frame':frame,'file':filename.name})
    (DIRECTORY/'evidence'/'motion-frames.json').write_text(json.dumps(frames,indent=2)+'\n')
    scene.frame_set(1)
    scene.render.resolution_percentage=100
    scene.cycles.samples=48
    encode_motion(directory,len(frames),scene)


def encode_motion(directory,count,character_scene):
    """Encode the rendered frames with Blender's bundled FFmpeg; no extra packages."""
    video=bpy.data.scenes.new('Specimen Motion Encoder')
    bpy.context.window.scene=video
    video.render.resolution_x=480
    video.render.resolution_y=528
    video.render.resolution_percentage=100
    video.render.fps=8
    video.frame_start=1
    video.frame_end=count
    video.view_settings.view_transform='Standard'
    video.render.image_settings.media_type='VIDEO'
    video.render.image_settings.file_format='FFMPEG'
    video.render.ffmpeg.format='MPEG4'
    video.render.ffmpeg.codec='H264'
    video.render.ffmpeg.constant_rate_factor='HIGH'
    video.render.filepath=str(DIRECTORY/'evidence'/'living-gel-motion.mp4')
    editor=video.sequence_editor_create()
    strip=editor.strips.new_image('Idle, Settle, Charge',str(directory/'0000.png'),1,1)
    for i in range(1,count):
        strip.elements.append(f'{i:04d}.png')
    bpy.ops.render.render(animation=True)
    bpy.context.window.scene=character_scene
    bpy.data.scenes.remove(video)


def main():
    assert bpy.app.background, 'Use focused model functions for live MCP editing'
    original_scene = bpy.context.scene
    model.create_scene()
    model.build_body()
    model.build_face()
    model.build_details()
    model.lookdev()
    model.studio()
    for obj in list(original_scene.objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(original_scene)
    for datablocks in (bpy.data.meshes,bpy.data.materials,bpy.data.collections,bpy.data.node_groups):
        for data in list(datablocks):
            if data.users == 0:
                datablocks.remove(data)
    character = [obj for obj in bpy.data.collections[model.CHARACTER].objects if obj.type=='MESH']
    report = {
        'asset':model.ASSET,
        'blender_version':bpy.app.version_string,
        'runtime_up':'+Y',
        'runtime_forward':'-Z',
        'resting_contact_y_metres':model.SOLE,
        'meshes':{obj.name:topology(obj) for obj in character},
        'static_asset':False,
        'armatures':0,
        'animation_clips':len(model.CLIPS),
        'external_textures':0,
        'source_sha256':hashlib.sha256((DIRECTORY/'specimen_model.py').read_bytes()).hexdigest(),
    }
    model.build_morphs()
    model.build_animations()
    report['motion']=motion_report(character)
    report['total_triangles'] = sum(item['triangles'] for item in report['meshes'].values())
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in bpy.data.collections[model.CHARACTER].objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects['Specimen-Body']
    bpy.ops.export_scene.gltf(
        filepath=str(DIRECTORY/'specimen.glb'),export_format='GLB',
        use_selection=True,export_yup=True,export_animations=True,
        export_animation_mode='NLA_TRACKS',export_pointer_animation=True,
        export_anim_slide_to_zero=False,export_frame_range=False,
        export_morph=True,export_morph_normal=True,export_morph_animation=True,
        export_cameras=False,export_lights=False,export_apply=False,
        export_extras=True,export_all_vertex_colors=True,
    )
    rebase_clip_times(DIRECTORY/'specimen.glb')
    report['glb_sha256'] = hashlib.sha256((DIRECTORY/'specimen.glb').read_bytes()).hexdigest()
    bpy.context.scene.render.resolution_percentage = 100
    if '--render' in sys.argv or '--preview' in sys.argv:
        # Device discovery is unnecessary for an export-only invocation.
        prefs = bpy.context.preferences.addons['cycles'].preferences
        try:
            prefs.compute_device_type = 'OPTIX'
            prefs.refresh_devices()
            devices = [device for device in prefs.devices if device.type=='OPTIX']
            if devices:
                for device in prefs.devices:
                    device.use = device.type=='OPTIX'
                bpy.context.scene.cycles.device = 'GPU'
        except (TypeError,RuntimeError):
            bpy.context.scene.cycles.device = 'CPU'
        if '--render' in sys.argv:
            render_views()
        if '--preview' in sys.argv:
            render_motion()
    if '--encode-only' in sys.argv:
        frames=json.loads((DIRECTORY/'evidence'/'motion-frames.json').read_text())
        encode_motion(DIRECTORY/'evidence'/'motion-frames',len(frames),bpy.context.scene)
    # The file must open portably without depending on this process's GPU prefs.
    bpy.context.scene.cycles.device = 'CPU'
    # Store framing without requesting a native viewport redraw in headless mode.
    model.viewport(update=False)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(DIRECTORY/'specimen.blend'))
    report['blend_sha256'] = hashlib.sha256((DIRECTORY/'specimen.blend').read_bytes()).hexdigest()
    (DIRECTORY/'specimen.validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print('SPECIMEN_VALIDATION',json.dumps({'triangles':report['total_triangles'],
          'meshes':len(character),'glb_sha256':report['glb_sha256']}))


if __name__=='__main__':
    main()
