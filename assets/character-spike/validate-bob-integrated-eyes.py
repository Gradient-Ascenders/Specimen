"""Validate one connected Bob body with integrated facial material regions.
Run in fresh background Blender; never saves approved sources or authoring file.
"""
import bpy,bmesh,json,hashlib,struct,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
HERE=Path(__file__).resolve().parent
GLB=HERE/'bob-integrated-eyes.glb'
REPORT=HERE/'bob-integrated-eyes.validation.json'
KEYS=['Basis','Squash','Stretch','Cling']
def material_signature(mat):
    def plain(v):
        if isinstance(v, (float, int, str, bool)) or v is None:
            return v
        return list(v)
    nodes = []
    for node in mat.node_tree.nodes:
        row = dict(name=node.name, type=node.bl_idname,
                   inputs=[(s.identifier, plain(s.default_value)) for s in node.inputs
                           if hasattr(s, 'default_value')])
        for prop in ['operation', 'blend_type', 'noise_dimensions', 'normalize',
                     'interpolation', 'gradient_type', 'vector_type']:
            if hasattr(node, prop):
                row[prop] = plain(getattr(node, prop))
        if hasattr(node, 'color_ramp'):
            row['ramp'] = [(e.position, list(e.color)) for e in node.color_ramp.elements]
            row['ramp_interpolation'] = node.color_ramp.interpolation
        nodes.append(row)
    return dict(name=mat.name, nodes=nodes, links=[
        (l.from_node.name, l.from_socket.identifier, l.to_node.name, l.to_socket.identifier)
        for l in mat.node_tree.links])


def read_glb(path):
    raw = path.read_bytes()
    size, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(raw[20:20+size])
    offset = 20+size
    bin_size, kind = struct.unpack_from('<II', raw, offset)
    assert kind == 0x004E4942
    return doc, raw[offset+8:offset+8+bin_size]


def accessor(doc, binary, index):
    a = doc['accessors'][index]
    assert not a.get('sparse')
    view = doc['bufferViews'][a['bufferView']]
    fmt = {5126:'f', 5125:'I', 5123:'H', 5121:'B'}[a['componentType']]
    width = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4}[a['type']]
    size = struct.calcsize('<'+fmt*width)
    offset = view.get('byteOffset',0)+a.get('byteOffset',0)
    stride = view.get('byteStride',size)
    return [struct.unpack_from('<'+fmt*width,binary,offset+i*stride) for i in range(a['count'])]



def area_xz(points):
    return abs(sum(a[0]*b[2]-a[2]*b[0] for a,b in zip(points,points[1:]+points[:1])))/2


def mesh_record(obj):
    m=obj.data;m.calc_loop_triangles()
    return dict(vertices=[list(v.co) for v in m.vertices],polygons=[list(p.vertices) for p in m.polygons],
        uv=[list(u.uv) for u in m.uv_layers.active.data],normals=[list(n.vector) for n in m.corner_normals],
        triangles=[list(t.vertices) for t in m.loop_triangles],triangle_loops=[list(t.loops) for t in m.loop_triangles],
        materials=[p.material_index for p in m.polygons])


original_files=['bob-production-base.blend','bob-material-lookdev.blend']
hashes={n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in original_files}
bpy.ops.wm.open_mainfile(filepath=str(HERE/'bob-material-lookdev.blend'))
approved=mesh_record(bpy.data.objects['Bob-Body'])
feature_names=['Bob-Eye-Left','Bob-Eye-Right','Bob-Catchlight-Left','Bob-Catchlight-Right']
features={n:mesh_record(bpy.data.objects[n]) for n in feature_names}
material_names=['Bob-Gel-A-Opaque','Bob-Eye-Wet-Navy','Bob-Catchlight-Soft-White']
material_signatures={n:material_signature(bpy.data.materials[n]) for n in material_names}
bpy.ops.wm.open_mainfile(filepath=str(HERE/'bob-integrated-eyes.blend'))
bpy.context.window.scene=bpy.data.scenes['Bob-Integrated-Eyes']
obj=bpy.data.objects['Bob-Body'];m=obj.data
assert set(o.name for o in bpy.data.collections['Bob-Production'].objects)=={'Bob','Bob-Body'}
assert all(bpy.data.objects.get(n) is None for n in feature_names)
assert len(m.materials)==3
assert [s.material.name for s in obj.material_slots]==material_names
assert all(material_signature(bpy.data.materials[n])==material_signatures[n] for n in material_names)
assert not obj.modifiers and not obj.animation_data and not m.shape_keys.animation_data
assert list(m.shape_keys.key_blocks.keys())==KEYS
assert all(k.value==0 for k in m.shape_keys.key_blocks)
assert [list(p.co) for p in m.shape_keys.key_blocks['Basis'].data]==[list(v.co) for v in m.vertices]
source=mesh_record(obj)
source_keys={k.name:[list(v.co) for v in k.data] for k in m.shape_keys.key_blocks}
locked=json.loads(bpy.context.scene['integrated_basis_snapshot'])
for field in ['vertices','polygons','uv','materials']:assert source[field]==locked[field]

# Geometry was partitioned on the existing surface, never pushed into a new face design.
old_tree=BVHTree.FromPolygons([Vector(p) for p in approved['vertices']],approved['triangles'],all_triangles=True)
new_tree=KDTree(len(m.vertices))
for v in m.vertices:new_tree.insert(v.co,v.index)
new_tree.balance()
max_old_vertex_drift=max(new_tree.find(Vector(p))[2] for p in approved['vertices'])
max_surface_drift=max(old_tree.find_nearest(v.co)[3] for v in m.vertices)
assert max_old_vertex_drift<2e-6 and max_surface_drift<2e-6
old_uv_corners={}
for tri,loops in zip(approved['triangles'],approved['triangle_loops']):
    for i,l in zip(tri,loops):old_uv_corners.setdefault(i,[]).append(Vector(approved['uv'][l]))
old_vertex_tree=KDTree(len(approved['vertices']))
for i,p in enumerate(approved['vertices']):old_vertex_tree.insert(Vector(p),i)
old_vertex_tree.balance()
max_uv_drift=0
for loop in m.loops:
    point=m.vertices[loop.vertex_index].co
    _,old_index,distance=old_vertex_tree.find(point)
    actual=m.uv_layers.active.data[loop.index].uv
    if distance<2e-7:
        drift=min((actual-u).length for u in old_uv_corners[old_index])
    else:
        hit,normal,tri_index,distance=old_tree.find_nearest(point)
        ia,ib,ic=approved['triangles'][tri_index]
        a,b,c=[Vector(approved['vertices'][i]) for i in [ia,ib,ic]]
        u=b-a;v=c-a;q=hit-a;denom=u.dot(u)*v.dot(v)-u.dot(v)**2
        beta=(v.dot(v)*q.dot(u)-u.dot(v)*q.dot(v))/denom
        gamma=(u.dot(u)*q.dot(v)-u.dot(v)*q.dot(u))/denom
        la,lb,lc=approved['triangle_loops'][tri_index]
        expected=Vector(approved['uv'][la])*(1-beta-gamma)+Vector(approved['uv'][lb])*beta+Vector(approved['uv'][lc])*gamma
        drift=(actual-expected).length
    max_uv_drift=max(max_uv_drift,drift)
assert max_uv_drift<3e-6

bm=bmesh.new();bm.from_mesh(m)
assert all(e.is_manifold for e in bm.edges)
unseen=set(bm.verts);components=0
while unseen:
    components+=1;stack=[unseen.pop()]
    while stack:
        v=stack.pop()
        for edge in v.link_edges:
            other=edge.other_vert(v)
            if other in unseen:unseen.remove(other);stack.append(other)
assert components==1
bm.free()
labels=[x.value for x in m.attributes['bob_face_region'].data]
region_checks={}
for region,name in enumerate(feature_names,1):
    selected={region,region+2} if region<=2 else {region}
    area=sum(area_xz([source['vertices'][i] for i in p.vertices]) for p in m.polygons if labels[p.index] in selected)
    before=features[name]
    approved_area=sum(area_xz([before['vertices'][i] for i in polygon]) for polygon in before['polygons'])
    assert abs(area/approved_area-1)<.0001,(name,area,approved_area)
    region_checks[name]=dict(projected_area_ratio=area/approved_area,body_region_faces=sum(x in selected for x in labels))

report=dict(status='Integrated facial architecture candidate; awaiting user approval',blender_version=bpy.app.version_string,
    original_sha256=hashes,architecture='One connected closed body mesh; gel/eye/catchlight material face regions; one set of body keys; no separate eye objects, masks, drivers or modifiers.',
    neutral_preservation=dict(max_original_vertex_drift=max_old_vertex_drift,max_surface_drift=max_surface_drift,max_uv_interpolation_drift=max_uv_drift,material_node_graphs_unchanged=True,regions=region_checks),
    source=dict(vertices=len(m.vertices),polygons=len(m.polygons),triangles=len(m.loop_triangles),connected_components=1,materials=material_names),poses={})
base_volume=None
for key in KEYS:
    report['poses'][key]={}
    for weight in ([0] if key=='Basis' else [.25,.5,.75,1.0]):
        pts=[Vector(a).lerp(Vector(b),weight) for a,b in zip(source_keys['Basis'],source_keys[key])]
        temp=bpy.data.meshes.new('validation');temp.from_pydata(pts,[],source['polygons'])
        bm=bmesh.new();bm.from_mesh(temp)
        minimum=min(f.calc_area() for f in bm.faces)
        assert minimum>1e-12
        volume=bm.calc_volume(signed=True)
        if base_volume is None:base_volume=volume
        assert .9<volume/base_volume<1.1
        tree=BVHTree.FromPolygons(pts,source['triangles'],all_triangles=True)
        hits=[(a,b) for a,b in tree.overlap(tree) if a<b and not set(source['triangles'][a]).intersection(source['triangles'][b])]
        assert not hits,(key,weight,'triangle intersections',hits[:10])
        report['poses'][key][str(weight)]=dict(volume_ratio=volume/base_volume,minimum_polygon_area=minimum,nonadjacent_intersections=0)
        bm.free();bpy.data.meshes.remove(temp)

bpy.ops.object.select_all(action='DESELECT')
for n in ['Bob','Bob-Body']:bpy.data.objects[n].select_set(True)
bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,use_active_scene=True,
    export_animations=False,export_morph=True,export_morph_normal=True,export_morph_animation=False,
    export_apply=False,export_yup=True,export_normals=True,export_texcoords=True,
    export_materials='EXPORT',export_extras=False,export_cameras=False,export_lights=False)
doc,binary=read_glb(GLB)
assert len(doc['meshes'])==1 and len(doc['nodes'])==2
assert len(doc['materials'])==3 and not doc.get('animations') and not doc.get('textures')
mesh=doc['meshes'][0];primitives=mesh['primitives']
assert mesh['extras']['targetNames']==KEYS[1:] and mesh['weights']==[0,0,0]
assert len(primitives)==3
for name,expected in [('Bob-Eye-Wet-Navy',[.002,.009,.028,1]),('Bob-Catchlight-Soft-White',[.92,.96,1,1])]:
    material=next(mat for mat in doc['materials'] if mat['name']==name)
    actual=material['pbrMetallicRoughness']['baseColorFactor']
    assert max(abs(a-b) for a,b in zip(actual,expected))<1e-6
# Material boundaries are shared geometry. Export splits draw buffers but all
# duplicates must carry exactly the same morph deltas, including intermediate weights.
seams={};duplicates=0
for primitive in primitives:
    assert len(primitive['targets'])==3
    pos=accessor(doc,binary,primitive['attributes']['POSITION'])
    delta=[accessor(doc,binary,t['POSITION']) for t in primitive['targets']]
    for target in primitive['targets']:assert {'POSITION','NORMAL'}<=target.keys()
    for i,p in enumerate(pos):
        d=tuple(tuple(v[i]) for v in delta)
        if p in seams:assert seams[p]==d;duplicates+=1
        else:seams[p]=d
report['glb']=dict(sha256=hashlib.sha256(GLB.read_bytes()).hexdigest(),bytes=GLB.stat().st_size,
    meshes=1,nodes=2,material_primitives=3,material_names=[m['name'] for m in doc['materials']],morph_names=KEYS[1:],
    vertices_with_uv_material_splits=sum(doc['accessors'][p['attributes']['POSITION']]['count'] for p in primitives),
    shared_vertex_duplicates_checked=duplicates,matching_seam_morph_deltas=True,animations=0,textures=0)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(GLB),merge_vertices=True,import_shading='NORMALS')
bpy.context.view_layer.update()
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(objects)==1 and len(bpy.context.scene.objects)==2 and len(bpy.data.actions)==0
obj=objects[0];m=obj.data;m.calc_loop_triangles()
assert len(m.vertices)==len(source['vertices'])
assert list(m.shape_keys.key_blocks.keys())==KEYS
assert len(m.materials)==3 and set(mat.name for mat in m.materials)==set(material_names)
index_tree=KDTree(len(source['vertices']))
for i,p in enumerate(source['vertices']):index_tree.insert(Vector(p),i)
index_tree.balance();mapping={};max_drift=0
for v in m.vertices:
    _,i,d=index_tree.find(obj.matrix_world@v.co);assert d<2e-6;mapping[v.index]=i
assert len(set(mapping.values()))==len(mapping)
for name in KEYS:
    for weight in [0,.25,.5,.75,1]:
        for i,(a,b) in enumerate(zip(m.shape_keys.key_blocks['Basis'].data,m.shape_keys.key_blocks[name].data)):
            expected=Vector(source_keys['Basis'][mapping[i]]).lerp(Vector(source_keys[name][mapping[i]]),weight)
            drift=((obj.matrix_world@a.co.lerp(b.co,weight))-expected).length
            max_drift=max(max_drift,drift);assert drift<2e-6
corners=[[] for _ in source['vertices']];cursor=0
for poly,mat in zip(source['polygons'],source['materials']):
    for index in poly:
        corners[index].append((Vector(source['uv'][cursor]),Vector(source['normals'][cursor]),material_names[mat]));cursor+=1
min_dot=1
for p in m.polygons:
    mat=m.materials[p.material_index].name
    for li in p.loop_indices:
        loop=m.loops[li];uv=m.uv_layers.active.data[li].uv
        normal=(obj.matrix_world.to_3x3()@m.corner_normals[li].vector).normalized()
        candidates=[normal.dot(n) for u,n,material in corners[mapping[loop.vertex_index]] if material==mat and (u-uv).length<2e-6]
        assert candidates and max(candidates)>.9998
        min_dot=min(min_dot,max(candidates))
assert len(m.loop_triangles)==len(source['triangles'])
report['roundtrip']=dict(mesh_objects=1,vertices=len(m.vertices),triangles=len(m.loop_triangles),morph_names=KEYS[1:],
    materials_preserved=True,uv_preserved=True,min_normal_dot=min_dot,max_position_drift_all_weights=max_drift,
    tested_weights=[0,.25,.5,.75,1],no_separate_eye_objects=True)
assert all(hashlib.sha256((HERE/n).read_bytes()).hexdigest()==h for n,h in hashes.items())
REPORT.write_text(json.dumps(report,indent=2)+'\n')
print('BOB_INTEGRATED_VALIDATION_PASS',json.dumps(report))
