"""Local material-region cuts on the approved Bob body. No eye plates or masks.
Run through Blender MCP with the approved bob-material-lookdev.blend open.
"""
import bpy
import bmesh
import json
from mathutils import Vector
from mathutils.kdtree import KDTree

ROOT=bpy.path.abspath('//../../')
OUT=ROOT+'assets/character-spike/'
EVIDENCE=ROOT+'docs/evidence/bob-integrated-eyes/'
BODY='Bob-Body'
FEATURES=['Bob-Eye-Left','Bob-Eye-Right','Bob-Catchlight-Left','Bob-Catchlight-Right']


def outline(obj):
    counts={}
    for p in obj.data.polygons:
        ids=list(p.vertices)
        for a,b in zip(ids,ids[1:]+ids[:1]):
            edge=tuple(sorted((a,b)));counts[edge]=counts.get(edge,0)+1
    adjacency={}
    for (a,b),count in counts.items():
        if count==1:
            adjacency.setdefault(a,[]).append(b);adjacency.setdefault(b,[]).append(a)
    start=min(adjacency);ordered=[start];previous=None;current=start
    while True:
        nxt=next(n for n in adjacency[current] if n!=previous)
        if nxt==start:break
        ordered.append(nxt);previous,current=current,nxt
        assert len(ordered)<=len(adjacency),'outline traversal'
    assert len(ordered)==len(adjacency)
    contour=[Vector((obj.data.vertices[i].co.x,obj.data.vertices[i].co.z)) for i in ordered]
    area=sum(a.x*b.y-a.y*b.x for a,b in zip(contour,contour[1:]+contour[:1]))
    if area<0:contour.reverse()
    return contour


def lerp(a,b,t):
    return (tuple(x+(y-x)*t for x,y in zip(a[0],b[0])),a[1].lerp(b[1],t),a[2].lerp(b[2],t))


def signed(v,a,b):
    return (b.x-a.x)*(v[0][2]-a.y)-(b.y-a.y)*(v[0][0]-a.x)


def clean(poly):
    out=[]
    for p in poly:
        if not out or sum((a-b)**2 for a,b in zip(p[0],out[-1][0]))**.5>1e-8:out.append(p)
    if len(out)>1 and sum((a-b)**2 for a,b in zip(out[0][0],out[-1][0]))**.5<1e-8:out.pop()
    return out


def split(poly,a,b):
    inside=[];outside=[]
    for u,v in zip(poly,poly[1:]+poly[:1]):
        du=signed(u,a,b);dv=signed(v,a,b)
        (inside if du>=0 else outside).append(u)
        if (du>=0)!=(dv>=0):
            hit=lerp(u,v,du/(du-dv));inside.append(hit);outside.append(hit)
    return clean(inside),clean(outside)


def projected_area(poly):
    return abs(sum(a[0][0]*b[0][2]-a[0][2]*b[0][0] for a,b in zip(poly,poly[1:]+poly[:1])))*.5


def region_cut(poly,contour):
    if (max(p[0][0] for p in poly)<min(p.x for p in contour) or
        min(p[0][0] for p in poly)>max(p.x for p in contour) or
        max(p[0][2] for p in poly)<min(p.y for p in contour) or
        min(p[0][2] for p in poly)>max(p.y for p in contour)):
        return [],[poly]
    current=poly;outside=[]
    for a,b in zip(contour,contour[1:]+contour[:1]):
        current,remainder=split(current,a,b)
        if len(remainder)>=3 and projected_area(remainder)>1e-12:outside.append(remainder)
        if len(current)<3:return [],[poly]
    if projected_area(current)<1e-12:return [],[poly]
    return [current],outside


def integrate():
    assert bpy.data.filepath.endswith('bob-material-lookdev.blend')
    obj=bpy.data.objects[BODY];old=obj.data
    assert old.shape_keys is None
    scene=bpy.context.scene
    scene['approved_body_snapshot']=json.dumps(dict(vertices=[list(v.co) for v in old.vertices],
        edges=[list(e.vertices) for e in old.edges],polygons=[list(p.vertices) for p in old.polygons],
        uv=[list(u.uv) for u in old.uv_layers.active.data],normals=[list(n.vector) for n in old.corner_normals]))
    print('TRACE snapshot complete',flush=True)
    contours=[outline(bpy.data.objects[n]) for n in FEATURES]
    print('TRACE outlines',[len(c) for c in contours],flush=True)
    scene['approved_feature_outlines']=json.dumps({n:[list(p) for p in c] for n,c in zip(FEATURES,contours)})
    materials=[obj.material_slots[0].material,bpy.data.objects[FEATURES[0]].material_slots[0].material,
               bpy.data.objects[FEATURES[2]].material_slots[0].material]
    old.calc_loop_triangles()
    tris={}
    for t in old.loop_triangles:tris.setdefault(t.polygon_index,[]).append(t)
    def corner(i):
        return (tuple(old.vertices[old.loops[i].vertex_index].co),old.uv_layers.active.data[i].uv.copy(),old.corner_normals[i].vector.copy())
    pieces=[];changed=[]
    for polygon in old.polygons:
        poly=[corner(i) for i in polygon.loop_indices]
        candidate=(sum(p[0][1] for p in poly)/len(poly)<-.20 and
                   max(p[0][2] for p in poly)>.77 and min(p[0][2] for p in poly)<1.35 and
                   max(p[0][0] for p in poly)>-.57 and min(p[0][0] for p in poly)<.44)
        if not candidate:
            pieces.append((poly,0,polygon.index));continue
        changed.append(polygon.index)
        fragments=[([corner(i) for i in t.loops],0) for t in tris[polygon.index]]
        for region,contour in enumerate(contours,1):
            new=[]
            for part,tag in fragments:
                eligible=(tag==0 if region<=2 else tag==region-2)
                if not eligible:new.append((part,tag));continue
                interior,exterior=region_cut(part,contour)
                new.extend((p,region) for p in interior)
                new.extend((p,tag) for p in exterior)
            fragments=new
        pieces.extend((p,tag,polygon.index) for p,tag in fragments)
    print('TRACE cut pieces',len(pieces),flush=True)
    coords=[v.co.copy() for v in old.vertices]
    lookup={tuple(round(c,7) for c in p):i for i,p in enumerate(coords)}
    def index(p):
        key=tuple(round(c,7) for c in p)
        if key not in lookup:lookup[key]=len(coords);coords.append(Vector(p))
        return lookup[key]
    indexed=[]
    for poly,tag,source in pieces:
        ids=[index(p[0]) for p in poly]
        if len(set(ids))>=3:indexed.append((poly,ids,tag,source))
    print('TRACE indexed',len(coords),len(indexed),flush=True)
    # Conform every shared edge to all inserted points, including clip-line T junctions.
    tree=KDTree(len(coords))
    for i,p in enumerate(coords):tree.insert(p,i)
    tree.balance()
    faces=[];uvs=[];normals=[];tags=[];sources=[]
    for poly,ids,tag,source in indexed:
        face=[];face_uv=[];face_normals=[]
        for j,a_id in enumerate(ids):
            b_id=ids[(j+1)%len(ids)]
            a=coords[a_id];b=coords[b_id];edge=b-a;length2=edge.length_squared
            if length2<1e-16:continue
            points=[(0,a_id)]
            for p,k,distance in tree.find_range((a+b)/2,edge.length/2+1e-7):
                t=(p-a).dot(edge)/length2
                if 1e-7<t<1-1e-7 and (p-(a+edge*t)).length<2e-7:points.append((t,k))
            for t,k in sorted(points):
                attr=lerp(poly[j],poly[(j+1)%len(poly)],t)
                if not face or face[-1]!=k:
                    face.append(k);face_uv.append(attr[1]);face_normals.append(attr[2].normalized())
        if len(set(face))>=3:
            faces.append(face);uvs.extend(face_uv);normals.extend(face_normals);tags.append(tag);sources.append(source)
    print('TRACE conformed',len(faces),flush=True)
    mesh=bpy.data.meshes.new('Bob-Integrated-Body-Mesh')
    mesh.from_pydata(coords,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name=old.uv_layers.active.name)
    for dst,src in zip(uv.data,uvs):dst.uv=src
    for mat in materials:mesh.materials.append(mat)
    for polygon,tag in zip(mesh.polygons,tags):
        polygon.material_index=0 if tag==0 else (1 if tag<=2 else 2)
        polygon.use_smooth=True
    mesh.attributes.new('bob_face_region','INT','FACE')
    mesh.attributes.new('approved_source_face','INT','FACE')
    region_attr=mesh.attributes['bob_face_region']
    source_attr=mesh.attributes['approved_source_face']
    for i,(tag,source) in enumerate(zip(tags,sources)):
        region_attr.data[i].value=tag;source_attr.data[i].value=source
    # Recompute smooth normals on the revised connected surface. No custom
    # per-component normals or deformation dependencies remain.
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
    bm.verts.index_update()
    # Fix tessellation only on faces affected by the local eye cuts. Keeping
    # their boundary vertices in explicit triangles prevents n-gon tessellation
    # from skipping collinear points that move under a body shape key.
    local_faces=[f for f in bm.faces if len(f.verts)>3 and any(v.index>=len(old.vertices) for v in f.verts)]
    bmesh.ops.triangulate(bm,faces=local_faces,quad_method='BEAUTY',ngon_method='BEAUTY')
    bm.to_mesh(mesh);mesh.update()
    boundary=sum(e.is_boundary for e in bm.edges)
    nonmanifold=sum(not e.is_manifold for e in bm.edges)
    minimum=min(f.calc_area() for f in bm.faces)
    print('CUT_TOPOLOGY',len(mesh.vertices),len(mesh.polygons),'boundary',boundary,'nonmanifold',nonmanifold,'min_area',minimum)
    assert boundary==0 and nonmanifold==0
    assert minimum>1e-12
    bm.free()
    obj.data=mesh
    for slot in obj.material_slots:slot.link='DATA'
    for name in FEATURES:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
    obj['architecture']='One continuous body surface. Eye and catchlight appearances are material-assigned face regions, not independent geometry.'
    obj['local_topology_revision']=json.dumps(dict(original_vertices=len(old.vertices),new_vertices=len(mesh.vertices),original_polygons=len(old.polygons),new_polygons=len(mesh.polygons),candidate_source_faces=changed,region_face_counts={str(t):tags.count(t) for t in range(5)}))
    scene.name='Bob-Integrated-Eyes'
    scene['phase']='Integrated body eye/catchlight regions; manual approval pending'
    scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=OUT+'bob-integrated-eyes.blend')
    print(obj['local_topology_revision'])
