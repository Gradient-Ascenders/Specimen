"""Compare the saved Specimen source with a clean import of its GLB."""

from collections import Counter
import json
from pathlib import Path
import struct

import bpy
from mathutils.kdtree import KDTree

DIRECTORY=Path(__file__).resolve().parent


def main():
    assert bpy.app.background, 'Verification uses a separate background process'
    meshes={}
    for obj in bpy.data.collections['The Specimen Character'].objects:
        if obj.type!='MESH':
            continue
        obj.data.calc_loop_triangles()
        points=[obj.matrix_world@vertex.co for vertex in obj.data.vertices]
        # Several closed core strands meet at coincident cap centres. Treat
        # coincident coordinates as one geometric ID for triangle comparison;
        # nearest-neighbour lookup cannot select a unique topological ID there.
        positions={}
        canonical=[]
        for index,point in enumerate(points):
            position=tuple(round(value,7) for value in point)
            if position not in positions:
                positions[position]=index
            canonical.append(positions[position])
        meshes[obj.name]={
            'points':points,
            'canonical':canonical,
            'triangles':Counter(tuple(sorted(canonical[i] for i in t.vertices)) for t in obj.data.loop_triangles),
            'morphs':{key.name:[obj.matrix_world@vertex.co for vertex in key.data]
                      for key in list(obj.data.shape_keys.key_blocks)[1:]},
        }
    binary=(DIRECTORY/'specimen.glb').read_bytes()
    assert binary[:4]==b'glTF'
    length,kind=struct.unpack_from('<II',binary,12)
    assert kind==0x4E4F534A
    document=json.loads(binary[20:20+length])
    bin_start=20+length+8

    def accessor_values(index):
        accessor=document['accessors'][index]
        view=document['bufferViews'][accessor['bufferView']]
        components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
        fmt,size={5121:('B',1),5123:('H',2),5125:('I',4),5126:('f',4)}[accessor['componentType']]
        offset=bin_start+view.get('byteOffset',0)+accessor.get('byteOffset',0)
        stride=view.get('byteStride',components*size)
        values=[struct.unpack_from('<'+fmt*components,binary,offset+i*stride)
                for i in range(accessor['count'])]
        if accessor.get('normalized'):
            divisor={5121:255,5123:65535}[accessor['componentType']]
            values=[tuple(value/divisor for value in row) for row in values]
        return values
    expected={'Specimen-Body','Specimen-Eye-Left','Specimen-Eye-Right',
              'Specimen-Acid-Core','Specimen-Electric-Veins','Specimen-Aqua-Currents'}
    assert {mesh['name'] for mesh in document['meshes']}==set(meshes)==expected
    assert {node['name'] for node in document['nodes']}==expected|{'The Specimen'}
    body_points=meshes['Specimen-Body']['points']
    assert 2.0<max(point.z for point in body_points)+0.45<2.16
    body_width=max(point.x for point in body_points)-min(point.x for point in body_points)
    assert 1.75<body_width<2.05
    contact=[point for point in body_points if abs(point.z+0.45)<1e-6]
    contact_width=max(point.x for point in contact)-min(point.x for point in contact)
    assert contact_width/body_width>0.87,('puddle does not meet ground',contact_width,body_width)
    assert not document.get('cameras')
    animations={animation['name']:animation for animation in document['animations']}
    assert set(animations)=={'Idle','Settle','Charge'}
    animation_report={}
    for name,duration in [('Idle',5),('Settle',2),('Charge',3)]:
        animation=animations[name]
        inputs=[value[0] for sampler in animation['samplers'] for value in accessor_values(sampler['input'])]
        assert abs(min(inputs))<1e-6 and abs(max(inputs)-duration)<1e-5,(name,'duration')
        weight_channels=[channel for channel in animation['channels'] if channel['target']['path']=='weights']
        pointers=[channel for channel in animation['channels'] if channel['target']['path']=='pointer']
        assert len(weight_channels)==len(expected) and len(pointers)==2,(name,'missing motion or glow channels')
        pulses=[]
        for channel in pointers:
            pointer=channel['target']['extensions']['KHR_animation_pointer']['pointer']
            assert pointer.endswith('/extensions/KHR_materials_emissive_strength/emissiveStrength')
            values=[row[0] for row in accessor_values(animation['samplers'][channel['sampler']]['output'])]
            assert min(values)>0
            if name=='Charge':
                assert max(values)>min(values)*4
            pulses.append({'pointer':pointer,'minimum':min(values),'maximum':max(values)})
        animation_report[name]={'seconds':max(inputs),'morph_channels':len(weight_channels),'glow':pulses}
    assert not document.get('skins') and not document.get('images')
    assert all('KHR_lights_punctual' not in node.get('extensions',{}) for node in document['nodes'])
    colour_meshes={mesh['name'] for mesh in document['meshes']
                  if 'COLOR_0' in mesh['primitives'][0]['attributes']}
    assert colour_meshes=={'Specimen-Body','Specimen-Acid-Core'}
    body_json=next(mesh for mesh in document['meshes'] if mesh['name']=='Specimen-Body')
    colours=[row for primitive in body_json['primitives']
             for row in accessor_values(primitive['attributes']['COLOR_0'])]
    average_colour=[sum(row[i] for row in colours)/len(colours) for i in range(3)]
    assert average_colour[1]>=average_colour[2],('blue bias',average_colour)
    materials={material['name']:material for material in document['materials']}
    yellow_tip_vertices=sum(row[0]>0.7 and row[1]>0.5 and row[2]<0.08 for row in colours)
    assert yellow_tip_vertices>15,'yellow bolt-tip colours missing from export'
    assert 'Specimen-Yellow-Bolt-Tips' in materials,'yellow tip material missing'
    transmission=materials['Specimen-Turquoise-Gel']['extensions']['KHR_materials_transmission']['transmissionFactor']
    assert abs(transmission-0.94)<1e-6
    strength=materials['Specimen-Golden-Discharge']['extensions']['KHR_materials_emissive_strength']['emissiveStrength']
    assert abs(strength-12)<1e-6
    roughness=materials['Specimen-Turquoise-Gel']['pbrMetallicRoughness']['roughnessFactor']
    assert abs(roughness-0.13)<1e-6
    body=bpy.data.objects['Specimen-Body']
    sections={}
    for sample_height in (0.13,0.70,1.32):
        z=-0.45+sample_height
        # Offset from the centre plane to avoid the narrow dorsal web.
        hit,front,normal,face=body.ray_cast((0.20,3,z),(0,-1,0))
        assert hit
        hit,back,normal,face=body.ray_cast((0.20,-3,z),(0,1,0))
        assert hit
        centre_y=(front.y+back.y)/2
        hit,left,normal,face=body.ray_cast((-3,centre_y,z),(1,0,0))
        assert hit
        hit,right,normal,face=body.ray_cast((3,centre_y,z),(-1,0,0))
        assert hit
        sections[str(sample_height)]={'width_metres':right.x-left.x,
                                      'centre_y_metres':centre_y,
                                      'centre_x_metres':(left.x+right.x)/2}
    height=max(point.z for point in body_points)+0.45
    hit,dome,normal,face=body.ray_cast((0.0,0.18,4),(0,0,-1))
    assert hit
    dome_height=dome.z+0.45
    assert 1.73<dome_height<1.82,('shortened dome',dome_height)
    rim_heights=[]
    for side in (-1,1):
        hit,edge,normal,face=body.ray_cast((side*3,0,-0.448),(-side,0,0))
        assert hit
        x=edge.x-side*0.020
        hit,rim,normal,face=body.ray_cast((x,0,4),(0,0,-1))
        assert hit
        rim_heights.append(rim.z+0.45)
    # The fuller liquid shoulders rise just behind the grounded outer edge.
    assert max(rim_heights)<0.065,('puddle rim too thick',rim_heights)
    upper_width=max(sections[h]['width_metres'] for h in ('0.7','1.32'))
    assert upper_width/sections['0.13']['width_metres']<0.75,'upper body overwhelms pooled base'
    assert sections['1.32']['centre_y_metres']-sections['0.7']['centre_y_metres']>0.025,'missing forward lean'
    crest=[point for point in body_points if point.y<-0.65 and point.z+0.45>0.25]
    assert crest and max(abs(point.x) for point in crest)<0.09,'crest is not a narrow mohawk'
    eyes={}
    for name in ('Specimen-Eye-Left','Specimen-Eye-Right'):
        points=meshes[name]['points']
        x=(min(p.x for p in points)+max(p.x for p in points))/2
        z=(min(p.z for p in points)+max(p.z for p in points))/2+0.45
        assert 0.24<abs(x)<0.27 and 1.26<z<1.36,(name,'eye placement',x,z)
        ordered=sorted(points,key=lambda p:p.x)
        outer,inner=(ordered[0],ordered[-1]) if x<0 else (ordered[-1],ordered[0])
        assert outer.z-inner.z>0.20,(name,'missing swept angular corners')
        eyes[name]={'centre_x_metres':x,'centre_height_metres':z,
                    'outer_corner_rise_metres':outer.z-inner.z}
    containment={}
    for name in ('Specimen-Electric-Veins','Specimen-Aqua-Currents','Specimen-Acid-Core'):
        maximum=-1.0
        for vertex in bpy.data.objects[name].data.vertices:
            hit,point,normal,face=body.closest_point_on_mesh(vertex.co)
            assert hit
            signed=(vertex.co-point).dot(normal)
            maximum=max(maximum,signed)
            assert signed<0.0015,(name,'internal detail outside gel',tuple(vertex.co),signed)
        containment[name]={'maximum_signed_surface_distance_metres':maximum}
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(DIRECTORY/'specimen.glb'))
    bpy.context.view_layer.update()
    imported=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    assert {obj.name for obj in imported}==set(meshes)
    results={}
    for obj in imported:
        source=meshes[obj.name]
        tree=KDTree(len(source['points']))
        for i,point in enumerate(source['points']):
            tree.insert(point,i)
        tree.balance()
        mapping={}
        maximum_error=0.0
        for vertex in obj.data.vertices:
            position=obj.matrix_world@vertex.co
            nearest,index,distance=tree.find(position)
            assert distance<0.000002,(obj.name,vertex.index,distance)
            maximum_error=max(maximum_error,distance)
            mapping[vertex.index]=source['canonical'][index]
        obj.data.calc_loop_triangles()
        triangles=Counter(tuple(sorted(mapping[i] for i in triangle.vertices))
                          for triangle in obj.data.loop_triangles)
        assert triangles==source['triangles'],(obj.name,'triangle mismatch')
        keys=obj.data.shape_keys.key_blocks
        assert {key.name for key in list(keys)[1:]}==set(source['morphs'])
        morph_error=0.0
        for key in list(keys)[1:]:
            for vertex in obj.data.vertices:
                actual=obj.matrix_world@key.data[vertex.index].co
                expected=source['morphs'][key.name][mapping[vertex.index]]
                distance=(actual-expected).length
                assert distance<0.000002,(obj.name,key.name,vertex.index,distance)
                morph_error=max(morph_error,distance)
        results[obj.name]={'triangles':len(obj.data.loop_triangles),
                          'maximum_position_error_metres':maximum_error,
                          'maximum_morph_position_error_metres':morph_error,
                          'morph_targets':sorted(source['morphs']),
                          'triangle_multiset_matches':True}
    report={'mesh_geometry_matches':True,'runtime_up':'+Y','runtime_forward':'-Z',
            'studio_excluded':True,'vertex_colours_preserved':sorted(colour_meshes),
            'transmission_factor':transmission,'gold_emission_strength':strength,
            'gel_roughness':roughness,'mean_gel_linear_rgb':average_colour,
            'yellow_tip_vertices':yellow_tip_vertices,
            'submerged_current_geometry':True,'animations':animation_report,
            'shape':{'height_metres':height,'dome_height_metres':dome_height,
                     'cross_sections':sections,'eyes':eyes,'narrow_mohawk':True,
                     'grounded_base_width_metres':contact_width,
                     'puddle_rim_heights_metres':rim_heights},
            'internal_geometry':containment,
            'meshes':results}
    (DIRECTORY/'specimen.roundtrip.json').write_text(json.dumps(report,indent=2)+'\n')
    print('SPECIMEN_ROUNDTRIP',json.dumps(report))


if __name__=='__main__':
    main()
